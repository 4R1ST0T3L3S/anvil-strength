/**
 * ANVIL STRENGTH — LOS TRES BÁSICOS, POR SEMANA
 * =====================================================================
 *
 * QUÉ CONTESTA
 *
 * "¿Cuántas series de sentadilla lleva este atleta esta semana, y repartidas
 * cómo?". El panel del programador ya sabía contestarlo por DÍA
 * (`computeDayMetrics` en builder/DayCard.tsx), que no sirve: la unidad con
 * la que se programa fuerza es la semana, y un coach que ve "4 series de
 * banca" en el día del miércoles no sabe si eso son pocas o muchas sin
 * sumar los otros dos días a mano.
 *
 *
 * POR QUÉ IMPORTA DE QUÉ CLASIFICADOR SALE
 *
 * `getLiftTheme()` es el clasificador SQ/BP/DL de la aplicación desde que se
 * escribió el planificador, y **ya tiene resuelta la parte difícil**: excluye
 * las variantes que NO son el movimiento de competición (búlgara, frontal,
 * hack, militar, francés, rumano…) mediante `NOT_THE_MAIN_LIFT`. Escribir
 * aquí un segundo clasificador daría dos cifras distintas del mismo día —el
 * panel diría 12 series de sentadilla y la tarjeta del día 16— y la que
 * estaría mal sería la nueva, porque la lista de exclusiones costó
 * descubrirla caso a caso.
 *
 * Por eso este módulo **importa** `getLiftTheme` en vez de reimplementarlo.
 *
 *
 * DE DÓNDE SALEN LOS DATOS
 *
 * De `VolumeSessionInput[]`, que es el estado LOCAL del constructor —lo que
 * hay en pantalla, incluido lo que todavía no se ha guardado—. Por eso el
 * panel se actualiza mientras el coach escribe sin ninguna consulta nueva:
 * `DayEditorModal` ya construye ese array para el panel de volumen.
 *
 * Esto es lo PROGRAMADO. Lo realizado vive en stats/weekExecutionSummary.ts y
 * no se mezclan nunca: son las dos mitades de la única pregunta que importa
 * al revisar un entrenamiento.
 */

import { parsePrescription, type VolumeSessionInput } from '../volume/engine';
import { computeSetMetrics, buildReferenceMaxes, exerciseKey } from './blockAnalytics';
import { classifyMainLift } from './mainLift';
import { WEEKDAYS, weekdayLabel } from '../../types/training';

// =====================================================================

/** Los tres de competición. Los accesorios se cuentan en accessoryStats.ts. */
export const MAIN_LIFTS = ['SQ', 'BP', 'DL'] as const;
export type MainLift = (typeof MAIN_LIFTS)[number];

export const MAIN_LIFT_LABEL: Record<MainLift, string> = {
    SQ: 'Sentadilla',
    BP: 'Banca',
    DL: 'Peso muerto',
};

/** Lo que se hace de un básico en UN día. */
export interface LiftDayEntry {
    sessionId: string;
    /** "Lunes", o "Día 2" cuando el día no está agendado. */
    dayLabel: string;
    /** Orden dentro de la semana: ISO del día agendado, o 100+day_number. */
    order: number;
    sets: number;
    /** Repeticiones totales del día para ese básico. 0 si son AMRAP. */
    reps: number;
    /**
     * Resumen legible de la prescripción: "4 × 5 @ 72%", "3 × 3 · 180 kg".
     * Se compone con lo que HAY: sin 1RM de referencia no se escribe un %.
     */
    detail: string;
    /** Carga más alta prescrita ese día, en kg. null si no se pautó en kilos. */
    topLoad: number | null;
    /** %1RM de la serie más pesada. null sin referencia. */
    topIntensity: number | null;
}

/** Lo que se hace de un básico en TODA la semana. */
export interface LiftWeekSummary {
    lift: MainLift;
    label: string;
    sets: number;
    reps: number;
    /** Kg movidos. 0 cuando nada se pautó en kilos. */
    tonnage: number;
    /** Días distintos en los que aparece. Es la frecuencia semanal. */
    frequency: number;
    days: LiftDayEntry[];
}

// =====================================================================

/**
 * Cómo se llama un día dentro de la semana, y en qué orden va.
 *
 * Mismo criterio que `sortSessions` del constructor: manda el día agendado y
 * los que no lo tienen van detrás por `day_number`. Si aquí se ordenara de
 * otra forma, el desglose del panel y las tarjetas de la semana enseñarían
 * los mismos días en orden distinto.
 */
function dayIdentity(session: { day_number: number; day_of_week?: string | null }): {
    label: string;
    order: number;
} {
    const scheduled = weekdayLabel(session.day_of_week);
    if (scheduled) {
        const iso = WEEKDAYS.find(d => d.key === session.day_of_week)?.index ?? 99;
        return { label: scheduled, order: iso };
    }
    return { label: `Día ${session.day_number}`, order: 100 + session.day_number };
}

/**
 * "4 × 5 @ 72%" a partir de las series de un ejercicio en un día.
 *
 * Se agrupan las prescripciones IGUALES en vez de listarlas una a una: un día
 * de 5 series al mismo peso se lee "5 × 3", no "3 · 3 · 3 · 3 · 3". Y el
 * porcentaje solo aparece cuando hay un 1RM de referencia de verdad; sin él
 * se escribe la carga absoluta, que es un dato y no una estimación.
 */
function describeSets(
    entries: { series: number; reps: number; load: number | null; intensity: number | null; openEnded: boolean }[]
): string {
    if (entries.length === 0) return '—';

    // Agrupar por (reps, carga, intensidad) conservando el orden de aparición.
    const groups: { key: string; series: number; reps: number; load: number | null; intensity: number | null; openEnded: boolean }[] = [];
    for (const e of entries) {
        const key = `${e.reps}|${e.load ?? ''}|${e.intensity ?? ''}|${e.openEnded}`;
        const hit = groups.find(g => g.key === key);
        if (hit) hit.series += e.series;
        else groups.push({ key, ...e });
    }

    return groups
        .map(g => {
            const reps = g.openEnded ? 'AMRAP' : String(g.reps);
            const head = `${g.series} × ${reps}`;
            if (g.intensity != null) return `${head} @ ${Math.round(g.intensity)}%`;
            if (g.load != null) return `${head} · ${g.load} kg`;
            return head;
        })
        .join(' · ');
}

// =====================================================================

/**
 * Series semanales de sentadilla, banca y peso muerto, con el desglose día a
 * día que se enseña al pasar por encima.
 *
 * `declaredMaxes` son los 1RM registrados del atleta (`maxesService`). Sin
 * ellos los porcentajes no se inventan: `buildReferenceMaxes` deriva una
 * referencia del propio bloque y `computeSetMetrics` la marca como tal, pero
 * aquí solo se pinta el % cuando existe, y si no se enseña la carga.
 *
 * Devuelve SIEMPRE los tres, incluso a cero: que un básico no aparezca esta
 * semana es información, y esconderlo lo convierte en un olvido invisible.
 */
export function weeklyLiftSummary(
    sessions: VolumeSessionInput[],
    week: number,
    declaredMaxes: Record<string, number> = {}
): LiftWeekSummary[] {
    const weekSessions = sessions.filter(s => s.week_number === week);
    const maxes = buildReferenceMaxes(sessions, declaredMaxes);

    const acc: Record<MainLift, LiftWeekSummary> = {
        SQ: { lift: 'SQ', label: MAIN_LIFT_LABEL.SQ, sets: 0, reps: 0, tonnage: 0, frequency: 0, days: [] },
        BP: { lift: 'BP', label: MAIN_LIFT_LABEL.BP, sets: 0, reps: 0, tonnage: 0, frequency: 0, days: [] },
        DL: { lift: 'DL', label: MAIN_LIFT_LABEL.DL, sets: 0, reps: 0, tonnage: 0, frequency: 0, days: [] },
    };

    for (const session of weekSessions) {
        const identity = dayIdentity(session as { day_number: number; day_of_week?: string | null });

        // Lo del día, por básico, antes de volcarlo al acumulado semanal.
        const perLift: Record<MainLift, {
            sets: number; reps: number; tonnage: number; topLoad: number | null; topIntensity: number | null;
            entries: { series: number; reps: number; load: number | null; intensity: number | null; openEnded: boolean }[];
        }> = {
            SQ: { sets: 0, reps: 0, tonnage: 0, topLoad: null, topIntensity: null, entries: [] },
            BP: { sets: 0, reps: 0, tonnage: 0, topLoad: null, topIntensity: null, entries: [] },
            DL: { sets: 0, reps: 0, tonnage: 0, topLoad: null, topIntensity: null, entries: [] },
        };

        for (const ex of session.exercises) {
            const name = ex.exercise?.name ?? '';
            const key = classifyMainLift(name);
            if (key === 'ACC') continue;

            const lift = key as MainLift;
            const reference = maxes.get(exerciseKey(name))?.oneRm ?? null;
            const bucket = perLift[lift];

            for (const set of ex.sets ?? []) {
                const m = computeSetMetrics(set, reference);
                if (m.series <= 0) continue;

                bucket.sets += m.series;
                bucket.reps += m.openEnded ? 0 : m.series * m.reps;
                if (m.tonnage != null) bucket.tonnage += m.tonnage;
                if (m.load != null && (bucket.topLoad == null || m.load > bucket.topLoad)) {
                    bucket.topLoad = m.load;
                    bucket.topIntensity = m.intensity;
                }
                bucket.entries.push({
                    series: m.series,
                    reps: m.reps,
                    load: m.load,
                    intensity: m.intensity,
                    openEnded: m.openEnded,
                });
            }
        }

        for (const lift of MAIN_LIFTS) {
            const bucket = perLift[lift];
            if (bucket.sets === 0) continue;

            acc[lift].sets += bucket.sets;
            acc[lift].reps += bucket.reps;
            acc[lift].tonnage += bucket.tonnage;
            acc[lift].days.push({
                sessionId: session.id,
                dayLabel: identity.label,
                order: identity.order,
                sets: bucket.sets,
                reps: bucket.reps,
                detail: describeSets(bucket.entries),
                topLoad: bucket.topLoad,
                topIntensity: bucket.topIntensity,
            });
        }
    }

    return MAIN_LIFTS.map(lift => {
        const summary = acc[lift];
        summary.days.sort((a, b) => a.order - b.order);
        summary.frequency = summary.days.length;
        summary.tonnage = Math.round(summary.tonnage);
        return summary;
    });
}

/**
 * Series semanales por básico, sin desglose. Para el calendario y las
 * estadísticas por ámbito, donde el detalle diario no cabe.
 */
export function weeklyLiftSets(
    sessions: VolumeSessionInput[],
    week: number
): Record<MainLift, number> {
    const summary = weeklyLiftSummary(sessions, week);
    return {
        SQ: summary.find(s => s.lift === 'SQ')!.sets,
        BP: summary.find(s => s.lift === 'BP')!.sets,
        DL: summary.find(s => s.lift === 'DL')!.sets,
    };
}

/**
 * Las semanas presentes en un conjunto de sesiones, en orden.
 *
 * Suena trivial y no lo es: `week_number` es la semana ISO del AÑO, así que
 * ordenar por ella dentro de un bloque que cruza el fin de año pondría la
 * semana 1 delante de la 52. Aquí se ordena por el orden de APARICIÓN cuando
 * se detecta el salto, que es el orden en que se entrenan.
 */
export function weeksOf(sessions: VolumeSessionInput[]): number[] {
    const seen: number[] = [];
    for (const s of sessions) {
        if (!seen.includes(s.week_number)) seen.push(s.week_number);
    }
    const sorted = [...seen].sort((a, b) => a - b);
    // ¿Hay salto de año? Si la distancia entre el mínimo y el máximo es mayor
    // que el número de semanas, es que se cruza diciembre: se respeta el orden
    // en que llegaron, que viene de la consulta ya ordenada por el servidor.
    const spread = sorted[sorted.length - 1] - sorted[0];
    return spread > 40 && seen.length > 1 ? seen : sorted;
}

/** Repeticiones totales prescritas de una serie, sin depender de la carga. */
export function repsOfSet(targetReps: string | null | undefined): number {
    const { series, reps } = parsePrescription(targetReps);
    return series * reps;
}
