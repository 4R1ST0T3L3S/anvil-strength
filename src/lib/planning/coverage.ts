/**
 * ANVIL STRENGTH — DÓNDE ESTÁ CADA BLOQUE EN EL CALENDARIO
 * =====================================================================
 *
 * EL PROBLEMA QUE RESUELVE, Y ES MÁS GORDO DE LO QUE PARECE
 *
 * Un entrenamiento de Anvil **no guarda una fecha**. `training_sessions.date`
 * existe como columna pero ni `createSession` ni `createSessions` la escriben
 * nunca: en la práctica es NULL en todas las filas. Lo que sí se guarda es
 * `week_number`, que es la **semana ISO DEL AÑO** (1-53), y `day_of_week`.
 *
 * Así que para poder pintar un calendario —cualquier calendario— hay que
 * reconstruir la fecha:
 *
 *     año (de `training_blocks.start_date`) + semana ISO + día de la semana
 *
 * Este módulo hace esa traducción y nada más. Es puro: sin React, sin
 * Supabase y sin `Date.now()` implícito, para poder comprobarlo con casos de
 * verdad (ver coverage.test.ts).
 *
 *
 * LA TRAMPA DEL CRUCE DE AÑO
 *
 * `blockYear` se calcula en la aplicación como `start_date.getFullYear()`, y
 * eso funciona hasta que un bloque va de la semana 50 a la 3. Ahí
 * `end_week < start_week`, y tomar el mismo año para las dos convierte un
 * bloque de 6 semanas en uno de -47: la barra del calendario sale invertida o
 * directamente no sale. `resolveBlockSpan` detecta ese caso y suma un año al
 * final, que es la única lectura posible de "termina en una semana anterior a
 * la que empieza".
 *
 *
 * LA REGLA DURA: NUNCA INVENTAR UNA FECHA (decisión K10)
 *
 * Un bloque sin `start_date` **no se puede situar en el calendario**. No se
 * estima por `created_at`, no se asume el año en curso, no se coloca "más o
 * menos ahí". Sale por `undated` con su motivo y la interfaz lo dice. Un
 * bloque fechado a ojo contamina el calendario de todo el equipo y lo hace en
 * silencio, que es la peor forma de estar mal.
 *
 * Lo mismo con los días: una sesión sin `day_of_week` no se puede clavar en
 * un día concreto. Cuenta para saber que la semana TIENE contenido, pero no
 * se pinta en una casilla.
 *
 *
 * LOS MACROS NO TIENEN FECHAS
 *
 * `macrocycles` solo guarda `name`, `competition_name` y `competition_date`.
 * Su extensión temporal se DERIVA de los bloques que lo componen
 * (`macroSpans`), que es la única fuente honesta que hay. Un macro cuyos
 * bloques no se puedan fechar tampoco se puede fechar.
 */

import { getISOWeekStart } from '../../utils/dateUtils';

// =====================================================================
// ENTRADA
// =====================================================================

/** Lo mínimo que hace falta de un bloque para situarlo en el tiempo. */
export interface CoverageBlockInput {
    id: string;
    athlete_id: string;
    name: string;
    start_week?: number | null;
    end_week?: number | null;
    start_date?: string | null;
    is_active?: boolean | null;
    color?: string | null;
    macro_id?: string | null;
}

/** Lo mínimo de una sesión para saber si una semana tiene contenido de verdad. */
export interface CoverageSessionInput {
    id: string;
    block_id: string;
    week_number: number;
    day_number: number;
    day_of_week?: string | null;
    /** Cuántos ejercicios tiene. 0 = día creado y vacío. */
    exerciseCount: number;
    completed_at?: string | null;
}

/** Una competición ya asignada. */
export interface CoverageCompetitionInput {
    id: string;
    athlete_id: string;
    name: string;
    date: string;
    end_date?: string | null;
    level?: string | null;
    location?: string | null;
}

// =====================================================================
// SALIDA
// =====================================================================

/** Un bloque situado en el calendario. Fechas locales a medianoche. */
export interface BlockSpan {
    blockId: string;
    athleteId: string;
    name: string;
    /** Lunes de la primera semana. */
    from: Date;
    /** Domingo de la última semana, inclusive. */
    to: Date;
    /** Semanas ISO que abarca, en orden y ya resueltas a su año real. */
    weeks: { week: number; year: number; monday: Date }[];
    isActive: boolean;
    color: string | null;
    macroId: string | null;
    /**
     * Semanas del bloque SIN ningún ejercicio programado.
     *
     * Un bloque de 8 semanas del que solo se han escrito 3 está "programado"
     * en la tabla pero el atleta se queda sin nada en la semana 4. La
     * diferencia entre esas dos cosas es justo lo que un coach necesita ver.
     */
    emptyWeeks: number[];
    /** ¿Tiene al menos un ejercicio en alguna semana? */
    hasContent: boolean;
}

/** Un bloque que NO se puede situar, con el motivo. */
export interface UndatedBlock {
    blockId: string;
    athleteId: string;
    name: string;
    reason: string;
}

/** Hueco sin ninguna programación entre dos bloques, o después del último. */
export interface CoverageGap {
    athleteId: string;
    from: Date;
    /** `null` = el hueco no tiene final conocido: se queda sin programación. */
    to: Date | null;
    /** Días que dura. `null` cuando el hueco es abierto. */
    days: number | null;
}

/** Todo lo que hace falta para pintar el carril de un atleta. */
export interface AthleteCoverage {
    athleteId: string;
    spans: BlockSpan[];
    undated: UndatedBlock[];
    gaps: CoverageGap[];
    competitions: CoverageCompetitionInput[];
    /**
     * Último día con programación. `null` si el atleta no tiene ningún bloque
     * fechado. Es la respuesta a "¿hasta cuándo está programado?".
     */
    coveredUntil: Date | null;
}

// =====================================================================
// FECHAS
// =====================================================================

/** Medianoche local del mismo día. No cruza husos horarios. */
function atMidnight(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Suma días a una fecha sin tocar la original. */
export function addDays(d: Date, days: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Días completos entre dos fechas (b - a). */
export function daysBetween(a: Date, b: Date): number {
    return Math.round((atMidnight(b).getTime() - atMidnight(a).getTime()) / 86_400_000);
}

/** 'YYYY-MM-DD' en hora LOCAL. Nunca pasa por UTC. */
export function ymd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Parse LOCAL de 'YYYY-MM-DD'.
 *
 * `new Date('2026-03-01')` lo interpreta como medianoche UTC, que en España
 * es el día ANTERIOR a las 23:00. Una competición podía pintarse en la
 * casilla equivocada por eso. Aquí la cadena se parte a mano.
 */
export function parseYmd(raw: string): Date | null {
    const [y, m, d] = raw.slice(0, 10).split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(y, m - 1, d);
}

// =====================================================================
// EL AÑO DE UN BLOQUE
// =====================================================================

/**
 * El año al que pertenecen las semanas ISO de un bloque.
 *
 * Devuelve `null` cuando el bloque no tiene `start_date`: ese bloque no se
 * puede situar y hay que decirlo, no adivinarlo. Ver la cabecera.
 */
export function blockYearOf(block: CoverageBlockInput): number | null {
    if (!block.start_date) return null;
    const parsed = parseYmd(String(block.start_date));
    return parsed ? parsed.getFullYear() : null;
}

// =====================================================================
// SITUAR UN BLOQUE
// =====================================================================

/**
 * Convierte un bloque en un intervalo real del calendario.
 *
 * Devuelve `null` —con su motivo en `undated`— cuando falta cualquiera de las
 * tres piezas: fecha de inicio, semana de inicio o semana de fin.
 */
export function resolveBlockSpan(
    block: CoverageBlockInput,
    sessions: CoverageSessionInput[] = []
): { span: BlockSpan } | { undated: UndatedBlock } {
    const year = blockYearOf(block);

    if (year === null) {
        return {
            undated: {
                blockId: block.id,
                athleteId: block.athlete_id,
                name: block.name,
                reason: 'No tiene fecha de inicio, así que sus semanas no se pueden situar en el calendario.',
            },
        };
    }

    const startWeek = block.start_week ?? null;
    const endWeek = block.end_week ?? null;

    if (startWeek === null || endWeek === null) {
        return {
            undated: {
                blockId: block.id,
                athleteId: block.athlete_id,
                name: block.name,
                reason: 'No declara semana de inicio y fin.',
            },
        };
    }

    // EL CRUCE DE AÑO. Un bloque de la semana 50 a la 3 termina el año
    // siguiente: es la única lectura posible de `end_week < start_week`.
    const endYear = endWeek < startWeek ? year + 1 : year;
    const weekCount =
        endYear > year
            ? weeksInISOYear(year) - startWeek + 1 + endWeek
            : endWeek - startWeek + 1;

    // Un bloque de 0 o de 300 semanas es un dato corrupto, no un bloque. Se
    // recorta en vez de generar diez mil casillas y colgar el navegador.
    const safeCount = Math.max(1, Math.min(weekCount, 104));

    const weeks: BlockSpan['weeks'] = [];
    let cursorWeek = startWeek;
    let cursorYear = year;

    for (let i = 0; i < safeCount; i++) {
        weeks.push({
            week: cursorWeek,
            year: cursorYear,
            monday: getISOWeekStart(cursorWeek, cursorYear),
        });
        cursorWeek += 1;
        if (cursorWeek > weeksInISOYear(cursorYear)) {
            cursorWeek = 1;
            cursorYear += 1;
        }
    }

    const from = weeks[0].monday;
    const to = addDays(weeks[weeks.length - 1].monday, 6);

    // Qué semanas tienen ejercicios de verdad. Una semana con días creados
    // pero vacíos NO cuenta como programada: el atleta abre la app y no hay
    // nada, que es exactamente el caso que este calendario existe para ver.
    const filled = new Set(
        sessions
            .filter(s => s.block_id === block.id && s.exerciseCount > 0)
            .map(s => s.week_number)
    );
    const emptyWeeks = weeks.map(w => w.week).filter(w => !filled.has(w));

    return {
        span: {
            blockId: block.id,
            athleteId: block.athlete_id,
            name: block.name,
            from,
            to,
            weeks,
            isActive: block.is_active ?? false,
            color: block.color ?? null,
            macroId: block.macro_id ?? null,
            emptyWeeks,
            hasContent: filled.size > 0,
        },
    };
}

/**
 * Cuántas semanas ISO tiene un año: 52 o 53.
 *
 * Tiene 53 cuando el 1 de enero cae en jueves, o cuando es bisiesto y cae en
 * miércoles. Se calcula así y no con una tabla porque una tabla caduca.
 */
export function weeksInISOYear(year: number): number {
    const jan1 = new Date(year, 0, 1).getDay();
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    // getDay: domingo = 0 … jueves = 4, miércoles = 3.
    if (jan1 === 4) return 53;
    if (isLeap && jan1 === 3) return 53;
    return 52;
}

// =====================================================================
// EL CARRIL DE UN ATLETA
// =====================================================================

/**
 * Todo lo que necesita el calendario para un atleta: dónde está programado,
 * dónde se le acaba, qué bloques no se pueden situar y cuándo compite.
 *
 * `horizonEnd` acota los huecos abiertos: sin él, "no tiene programación
 * después del 12 de octubre" sería un hueco de longitud infinita.
 */
export function buildAthleteCoverage(
    athleteId: string,
    blocks: CoverageBlockInput[],
    sessions: CoverageSessionInput[],
    competitions: CoverageCompetitionInput[],
    horizonEnd: Date
): AthleteCoverage {
    const spans: BlockSpan[] = [];
    const undated: UndatedBlock[] = [];

    for (const block of blocks) {
        if (block.athlete_id !== athleteId) continue;
        const resolved = resolveBlockSpan(block, sessions);
        if ('span' in resolved) spans.push(resolved.span);
        else undated.push(resolved.undated);
    }

    spans.sort((a, b) => a.from.getTime() - b.from.getTime());

    // HUECOS. Solo entre bloques y después del último: lo de ANTES del primer
    // bloque no es un hueco de programación, es que el atleta todavía no
    // había empezado.
    const gaps: CoverageGap[] = [];
    for (let i = 0; i < spans.length - 1; i++) {
        const gapFrom = addDays(spans[i].to, 1);
        const gapTo = addDays(spans[i + 1].from, -1);
        // Bloques pegados o solapados: no hay hueco.
        if (daysBetween(gapFrom, gapTo) < 0) continue;
        gaps.push({
            athleteId,
            from: gapFrom,
            to: gapTo,
            days: daysBetween(gapFrom, gapTo) + 1,
        });
    }

    const last = spans[spans.length - 1] ?? null;
    if (last && daysBetween(last.to, horizonEnd) > 0) {
        gaps.push({
            athleteId,
            from: addDays(last.to, 1),
            to: null,
            days: null,
        });
    }

    return {
        athleteId,
        spans,
        undated,
        gaps,
        competitions: competitions
            .filter(c => c.athlete_id === athleteId)
            .sort((a, b) => a.date.localeCompare(b.date)),
        coveredUntil: last ? last.to : null,
    };
}

// =====================================================================
// MACROS
// =====================================================================

export interface MacroSpan {
    macroId: string;
    name: string;
    from: Date;
    to: Date;
    /** Bloques que lo componen, ya situados y en orden. */
    blockIds: string[];
}

/**
 * La extensión de un macro, DERIVADA de sus bloques.
 *
 * `macrocycles` no guarda fechas propias (ver la cabecera). Un macro cuyos
 * bloques no se puedan situar tampoco se sitúa: se queda fuera del resultado
 * en vez de aparecer con un rango inventado.
 */
export function macroSpans(
    macros: { id: string; name: string }[],
    spans: BlockSpan[]
): MacroSpan[] {
    const out: MacroSpan[] = [];

    for (const macro of macros) {
        const own = spans
            .filter(s => s.macroId === macro.id)
            .sort((a, b) => a.from.getTime() - b.from.getTime());
        if (own.length === 0) continue;

        out.push({
            macroId: macro.id,
            name: macro.name,
            from: own[0].from,
            to: own.reduce((max, s) => (s.to > max ? s.to : max), own[0].to),
            blockIds: own.map(s => s.blockId),
        });
    }

    return out.sort((a, b) => a.from.getTime() - b.from.getTime());
}

// =====================================================================
// EL EJE DE MESES
// =====================================================================

export interface MonthCell {
    year: number;
    /** 0-11. */
    month: number;
    label: string;
    /** Primer día del mes. */
    start: Date;
    /** Último día del mes. */
    end: Date;
    days: number;
}

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Los meses que hay entre dos fechas, ambos inclusive. */
export function monthsBetween(from: Date, to: Date): MonthCell[] {
    const out: MonthCell[] = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const limit = new Date(to.getFullYear(), to.getMonth(), 1);

    // Tope de seguridad: 36 meses. Un rango mayor no se lee en una pantalla y
    // un dato corrupto no puede generar mil columnas.
    let guard = 0;
    while (cursor.getTime() <= limit.getTime() && guard < 36) {
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const end = new Date(year, month + 1, 0);
        out.push({
            year,
            month,
            label: MONTHS[month],
            start: new Date(year, month, 1),
            end,
            days: end.getDate(),
        });
        cursor.setMonth(cursor.getMonth() + 1);
        guard += 1;
    }

    return out;
}

/**
 * Posición y tamaño de un intervalo dentro de un eje, en porcentaje.
 *
 * En porcentaje y no en píxeles para que el mismo cálculo sirva en escritorio
 * y en móvil sin volver a medir nada. Se recorta a [0, 100]: un bloque que
 * empieza antes del eje se pinta desde el borde, no fuera de la pantalla.
 */
export function positionInAxis(
    from: Date,
    to: Date | null,
    axisStart: Date,
    axisEnd: Date
): { left: number; width: number } | null {
    const total = daysBetween(axisStart, axisEnd) + 1;
    if (total <= 0) return null;

    const startOffset = daysBetween(axisStart, from);
    const endOffset = to ? daysBetween(axisStart, to) : total - 1;

    // Completamente fuera del eje.
    if (endOffset < 0 || startOffset > total - 1) return null;

    const clampedStart = Math.max(0, startOffset);
    const clampedEnd = Math.min(total - 1, endOffset);

    return {
        left: (clampedStart / total) * 100,
        width: ((clampedEnd - clampedStart + 1) / total) * 100,
    };
}
