/**
 * ESTADÍSTICAS DEL ATLETA — CÁLCULO
 * =====================================================================
 * Todo lo que se pinta en la pantalla de estadísticas se deriva AQUÍ, en
 * funciones puras sobre el historial que devuelve
 * `trainingService.getExerciseHistoryByAthlete()`.
 *
 * Está separado de los componentes por dos razones prácticas: se puede
 * comprobar a mano con datos reales sin montar React, y evita que la misma
 * cuenta —el tonelaje, por ejemplo— acabe escrita de tres formas distintas
 * en tres pestañas.
 *
 * REGLA QUE ATRAVIESA TODO EL ARCHIVO: `target_load` NO son siempre kilos.
 * Desde database/set_target_metric.sql una serie puede prescribirse en RIR,
 * en m/s o en % de pérdida de velocidad, y el número vive en la misma
 * columna. Sumar eso como si fueran kilos da un tonelaje inventado. Por eso
 * `kgOf()` es la única puerta por la que se leen cargas.
 */

import type { ExerciseHistoryRow } from '../../services/trainingService';
import type { TrainingSet } from '../../types/training';
import { estimate1RM } from '../training/oneRm';

// =====================================================================
// LECTORES BÁSICOS
// =====================================================================

export function parseNum(v: string | number | null | undefined): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isNaN(n) ? null : n;
}

/**
 * Kilos de una serie, o null si esa serie no se mide en kilos.
 *
 * Lo REGISTRADO manda sobre lo prescrito: si el atleta levantó 172,5 donde
 * ponía 170, el dato real es 172,5. `actual_load` siempre son kilos —el
 * atleta registra lo que puso en la barra— así que no pasa por la
 * comprobación de métrica.
 */
export function kgOf(set: TrainingSet): number | null {
    if (set.actual_load !== null && set.actual_load !== undefined) return set.actual_load;
    const metric = set.target_metric ?? 'kg';
    if (metric !== 'kg') return null;
    return set.target_load ?? null;
}

/** Repeticiones de una serie: las registradas, y si no las pautadas. */
export function repsOf(set: TrainingSet): number | null {
    if (set.actual_reps !== null && set.actual_reps !== undefined) return set.actual_reps;
    // "3x5" son 5 repeticiones por serie, no 3; "5-6" se lee como 5.
    const raw = set.target_reps;
    if (!raw) return null;
    const parts = raw.toLowerCase().split('x');
    const repsPart = parts.length >= 2 ? parts.slice(1).join('x') : parts[0];
    return parseNum(repsPart.split('-')[0]);
}

/** RPE de una serie: el registrado, y si no el pautado. */
export function rpeOf(set: TrainingSet): number | null {
    if (set.actual_rpe !== null && set.actual_rpe !== undefined) return set.actual_rpe;
    const target = parseNum(set.target_rpe);
    return target;
}

/**
 * LO PAUTADO, sin mezclar con lo ejecutado — a diferencia de `kgOf`/`repsOf`,
 * que dan lo registrado y solo caen a lo pautado si falta.
 *
 * Existen para poder dibujar el plan como una serie propia (ver
 * `plannedVsActualWeekly`): un entrenador que programa la semana 6 antes de
 * que nadie la entrene necesita ver esa progresión completa desde el primer
 * momento, no una gráfica en blanco que se va rellenando a medida que llegan
 * registros. `kgOf`/`repsOf` no sirven para eso porque devuelven null en
 * cuanto hay un valor real, que es justo lo que hay que evitar aquí.
 */
export function plannedKgOf(set: TrainingSet): number | null {
    const metric = set.target_metric ?? 'kg';
    if (metric !== 'kg') return null;
    return set.target_load ?? null;
}

export function plannedRepsOf(set: TrainingSet): number | null {
    const raw = set.target_reps;
    if (!raw) return null;
    const parts = raw.toLowerCase().split('x');
    const repsPart = parts.length >= 2 ? parts.slice(1).join('x') : parts[0];
    return parseNum(repsPart.split('-')[0]);
}

/** LO EJECUTADO, sin caer al plan si falta — el complemento de las dos de arriba. */
export function actualKgOf(set: TrainingSet): number | null {
    return set.actual_load ?? null;
}

export function actualRepsOf(set: TrainingSet): number | null {
    return set.actual_reps ?? null;
}

/** Parte de repeticiones de un `target_reps`, para agrupar series comparables. */
export function repsKey(targetReps: string | null | undefined): string {
    if (!targetReps) return '';
    const parts = targetReps.toLowerCase().split('x');
    return (parts.length >= 2 ? parts.slice(1).join('x') : parts[0]).trim();
}

/**
 * 1RM estimado. La fórmula vive en `src/lib/training/oneRm.ts`; esto la
 * reexpone para no romper a quien la importe desde aquí.
 *
 * La copia que había en este fichero NO cortaba en `reps === 1`, así que un
 * 1RM real y medido de 100 kg salía como 103,3 en todas las estadísticas
 * —y en todo lo que se calcula encima: intensidad relativa, comparativa
 * entre ejercicios, reparto por zonas—. Ver la cabecera de `oneRm.ts`.
 */
export { estimate1RM } from '../training/oneRm';

// =====================================================================
// AGRUPACIÓN POR SEMANA — EL CRITERIO, EN UN SOLO SITIO
// =====================================================================
//
// EL FALLO QUE CORRIGE
//
// `week_number` se REINICIA en cada bloque: todo bloque empieza por la
// semana 1. Agrupar el historial por `week_number` a secas suma la semana 1
// de enero con la semana 1 de junio y con la semana 1 de octubre, y las
// dibuja en el mismo punto del eje. Con el límite de 2 bloques que había
// antes el destrozo era pequeño y pasaba desapercibido; ahora que la
// pantalla de estadísticas recibe el historial ENTERO, un atleta con seis
// bloques veía seis años de progresión aplastados en cinco puntos.
//
// La unidad real de tiempo es el par (bloque, semana), y el orden lo da
// `blockSequence` —que ya viene resuelto desde el servicio— y no el nombre
// del bloque ni su id.

/** Identidad de una semana concreta de un bloque concreto. */
interface WeekSlot {
    blockId: string;
    blockName: string;
    blockSequence: number;
    week: number;
}

/** Clave de mapa para una semana. Ordenable como texto no, como número sí. */
function weekSlotKey(row: ExerciseHistoryRow): string {
    return `${row.blockSequence}|${row.blockId}|${row.weekNumber}`;
}

function weekSlotOf(row: ExerciseHistoryRow): WeekSlot {
    return {
        blockId: row.blockId,
        blockName: row.blockName,
        blockSequence: row.blockSequence,
        week: row.weekNumber,
    };
}

/** Bloque primero, semana después. El orden en que ocurrieron. */
function compareWeekSlots(a: WeekSlot, b: WeekSlot): number {
    return a.blockSequence - b.blockSequence || a.week - b.week;
}

/**
 * ¿El historial abarca más de un bloque? Decide la forma de las etiquetas.
 */
function isMultiBlock(history: ExerciseHistoryRow[]): boolean {
    const seen = new Set<string>();
    for (const row of history) {
        seen.add(row.blockId);
        if (seen.size > 1) return true;
    }
    return false;
}

/**
 * Etiqueta corta del eje X.
 *
 * Con un solo bloque, "S3" — no hay ambigüedad posible. Con varios, "B2·S3",
 * porque un eje que dijera "S1 S2 S3 S1 S2" no se puede leer. Se usa el
 * ordinal del bloque y no su nombre a propósito: los nombres reales
 * ("Fuerza — Otoño 2026") no caben en un eje, y el nombre completo viaja
 * igualmente en `blockName` para el tooltip.
 */
function weekLabel(slot: WeekSlot, multiBlock: boolean): string {
    return multiBlock ? `B${slot.blockSequence + 1}·S${slot.week}` : `S${slot.week}`;
}

// =====================================================================
// RESUMEN GENERAL
// =====================================================================

export interface GeneralSummary {
    totalSessions: number;
    totalSets: number;
    /** Kilos totales movidos. Solo cuenta series medidas en kilos. */
    tonnage: number;
    /** Intensidad media relativa: carga media / mejor 1RM estimado. */
    avgIntensityPct: number | null;
    avgRpe: number | null;
    /** Series por encima de RPE 8: el trabajo que de verdad cuesta recuperar. */
    hardSets: number;
    exercisesTracked: number;
    /**
     * Semanas DISTINTAS con registro, contando el par (bloque, semana).
     *
     * Antes había `firstWeek`/`lastWeek`, que era el mínimo y el máximo de
     * `week_number` en todo el historial. Con el límite de 2 bloques ya
     * engañaba; con el historial entero decía cosas como "Semanas 1–8" para
     * un atleta con dos años y seis bloques, porque todos los bloques
     * empiezan por la semana 1 y ninguno pasa de 8. Un recuento de semanas
     * reales no se puede leer mal.
     */
    weeksTracked: number;
    /** Bloques distintos con registro. */
    blocksTracked: number;
}

export function summarize(history: ExerciseHistoryRow[]): GeneralSummary {
    let totalSets = 0;
    let tonnage = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    let hardSets = 0;

    const sessions = new Set<string>();
    const exercises = new Set<string>();
    const weeks = new Set<string>();
    const blocks = new Set<string>();
    const bestByExercise = new Map<string, number>();
    const loadSamples: { name: string; kg: number }[] = [];

    for (const row of history) {
        sessions.add(row.sessionId);
        exercises.add(row.exerciseName);
        weeks.add(weekSlotKey(row));
        blocks.add(row.blockId);

        for (const set of row.sets) {
            totalSets += 1;

            const kg = kgOf(set);
            const reps = repsOf(set);
            if (kg !== null && reps !== null) {
                tonnage += kg * reps;
                loadSamples.push({ name: row.exerciseName, kg });

                const oneRm = estimate1RM(kg, reps);
                if (oneRm !== null) {
                    const prev = bestByExercise.get(row.exerciseName) ?? 0;
                    if (oneRm > prev) bestByExercise.set(row.exerciseName, oneRm);
                }
            }

            const rpe = rpeOf(set);
            if (rpe !== null) {
                rpeSum += rpe;
                rpeCount += 1;
                if (rpe >= 8) hardSets += 1;
            }
        }
    }

    // La intensidad se calcula ejercicio a ejercicio y luego se promedia: una
    // media global compararía kilos de sentadilla con kilos de curl de bíceps.
    const intensities: number[] = [];
    for (const { name, kg } of loadSamples) {
        const best = bestByExercise.get(name);
        if (best && best > 0) intensities.push((kg / best) * 100);
    }

    return {
        totalSessions: sessions.size,
        totalSets,
        tonnage: Math.round(tonnage),
        avgIntensityPct: intensities.length
            ? Math.round(intensities.reduce((a, b) => a + b, 0) / intensities.length)
            : null,
        avgRpe: rpeCount ? Math.round((rpeSum / rpeCount) * 10) / 10 : null,
        hardSets,
        exercisesTracked: exercises.size,
        weeksTracked: weeks.size,
        blocksTracked: blocks.size,
    };
}

// =====================================================================
// SERIE TEMPORAL POR SEMANA
// =====================================================================

export interface WeeklyPoint {
    /** Número de semana DENTRO de su bloque. Se reinicia en cada bloque. */
    week: number;
    /** "S3", o "B2·S3" si el historial abarca varios bloques. */
    label: string;
    blockId: string;
    blockName: string;
    blockSequence: number;
    tonnage: number;
    sets: number;
    avgRpe: number | null;
    avgIntensityPct: number | null;
}

/**
 * Evolución semana a semana de carga, series, esfuerzo e intensidad.
 *
 * Un punto por (bloque, semana) y en orden cronológico — ver la sección
 * "AGRUPACIÓN POR SEMANA" de arriba para por qué no vale agrupar por el
 * número de semana a secas.
 */
export function weeklySeries(history: ExerciseHistoryRow[]): WeeklyPoint[] {
    const multiBlock = isMultiBlock(history);
    const byWeek = new Map<string, {
        slot: WeekSlot;
        tonnage: number; sets: number; rpeSum: number; rpeCount: number; intensities: number[];
    }>();

    // El 1RM de referencia se saca de TODO el historial, no de cada bloque:
    // la intensidad relativa tiene que medirse contra la misma vara en las
    // dos puntas de la gráfica, o una mejora de fuerza se leería como una
    // bajada de intensidad.
    const bestByExercise = new Map<string, number>();
    for (const row of history) {
        for (const set of row.sets) {
            const kg = kgOf(set);
            const reps = repsOf(set);
            if (kg === null || reps === null) continue;
            const oneRm = estimate1RM(kg, reps);
            if (oneRm !== null) {
                const prev = bestByExercise.get(row.exerciseName) ?? 0;
                if (oneRm > prev) bestByExercise.set(row.exerciseName, oneRm);
            }
        }
    }

    for (const row of history) {
        const key = weekSlotKey(row);
        const bucket = byWeek.get(key) ?? {
            slot: weekSlotOf(row),
            tonnage: 0, sets: 0, rpeSum: 0, rpeCount: 0, intensities: [],
        };

        for (const set of row.sets) {
            bucket.sets += 1;

            const kg = kgOf(set);
            const reps = repsOf(set);
            if (kg !== null && reps !== null) {
                bucket.tonnage += kg * reps;
                const best = bestByExercise.get(row.exerciseName);
                if (best && best > 0) bucket.intensities.push((kg / best) * 100);
            }

            const rpe = rpeOf(set);
            if (rpe !== null) {
                bucket.rpeSum += rpe;
                bucket.rpeCount += 1;
            }
        }

        byWeek.set(key, bucket);
    }

    return [...byWeek.values()]
        .sort((a, b) => compareWeekSlots(a.slot, b.slot))
        .map(b => ({
            week: b.slot.week,
            label: weekLabel(b.slot, multiBlock),
            blockId: b.slot.blockId,
            blockName: b.slot.blockName,
            blockSequence: b.slot.blockSequence,
            tonnage: Math.round(b.tonnage),
            sets: b.sets,
            avgRpe: b.rpeCount ? Math.round((b.rpeSum / b.rpeCount) * 10) / 10 : null,
            avgIntensityPct: b.intensities.length
                ? Math.round(b.intensities.reduce((a, c) => a + c, 0) / b.intensities.length)
                : null,
        }));
}

// =====================================================================
// PAUTADO CONTRA REAL
// =====================================================================

export interface PlannedActualWeekPoint {
    /** Número de semana DENTRO de su bloque. Se reinicia en cada bloque. */
    week: number;
    /** "S3", o "B2·S3" si el historial abarca varios bloques. */
    label: string;
    blockId: string;
    blockName: string;
    blockSequence: number;
    /**
     * El tonelaje que dibujaba el plan al pautarlo — existe desde el
     * momento en que el coach programa la semana, entrene o no el atleta
     * todavía.
     */
    plannedTonnage: number | null;
    /** Lo que el atleta ha registrado de verdad. Null en semanas sin ejecutar. */
    actualTonnage: number | null;
    plannedSets: number;
    actualSets: number;
    plannedAvgIntensityPct: number | null;
    actualAvgIntensityPct: number | null;
}

/**
 * LA MISMA PROGRESIÓN, EN DOS TRAZOS.
 * =====================================================================
 * `weeklySeries` mezcla lo pautado y lo ejecutado en una sola cifra por
 * semana —lo registrado manda, y si falta, cae al plan—. Eso está bien para
 * "cuánto se ha movido en total", pero no sirve para la pregunta que hace
 * un entrenador al programar: "¿esto es lo que quiero que pase?", y luego,
 * semana a semana: "¿se está cumpliendo?".
 *
 * Aquí cada semana lleva DOS series independientes, calculadas con
 * `plannedKgOf`/`actualKgOf` (nunca con el `kgOf` que mezcla). El plan
 * aparece completo desde el instante en que se programa, sin esperar a que
 * el atleta registre nada; lo real se va rellenando serie a serie conforme
 * llegan datos, y puede quedar por debajo, por encima o clavado al plan.
 *
 * La intensidad relativa (% del mejor 1RM estimado) usa el 1RM más alto
 * visto entre plan Y real: comparar el % pautado contra el 1RM de lo
 * ejecutado (o viceversa) daría una cifra que no significa nada.
 */
export function plannedVsActualWeekly(history: ExerciseHistoryRow[]): PlannedActualWeekPoint[] {
    const bestByExercise = new Map<string, number>();
    for (const row of history) {
        for (const set of row.sets) {
            for (const [kgFn, repsFn] of [[plannedKgOf, plannedRepsOf], [actualKgOf, actualRepsOf]] as const) {
                const kg = kgFn(set);
                const reps = repsFn(set);
                if (kg === null || reps === null) continue;
                const oneRm = estimate1RM(kg, reps);
                if (oneRm !== null) {
                    const prev = bestByExercise.get(row.exerciseName) ?? 0;
                    if (oneRm > prev) bestByExercise.set(row.exerciseName, oneRm);
                }
            }
        }
    }

    type Bucket = {
        slot: WeekSlot;
        plannedTonnage: number; plannedSets: number; plannedIntensities: number[];
        actualTonnage: number; actualSets: number; actualIntensities: number[];
    };
    // Por (bloque, semana), no por semana: ver `weeklySeries`.
    const multiBlock = isMultiBlock(history);
    const byWeek = new Map<string, Bucket>();

    for (const row of history) {
        const key = weekSlotKey(row);
        const bucket = byWeek.get(key) ?? {
            slot: weekSlotOf(row),
            plannedTonnage: 0, plannedSets: 0, plannedIntensities: [],
            actualTonnage: 0, actualSets: 0, actualIntensities: [],
        };
        const best = bestByExercise.get(row.exerciseName);

        for (const set of row.sets) {
            const pKg = plannedKgOf(set);
            const pReps = plannedRepsOf(set);
            if (pKg !== null && pReps !== null) {
                bucket.plannedTonnage += pKg * pReps;
                bucket.plannedSets += 1;
                if (best && best > 0) bucket.plannedIntensities.push((pKg / best) * 100);
            }

            const aKg = actualKgOf(set);
            const aReps = actualRepsOf(set);
            if (aKg !== null && aReps !== null) {
                bucket.actualTonnage += aKg * aReps;
                bucket.actualSets += 1;
                if (best && best > 0) bucket.actualIntensities.push((aKg / best) * 100);
            }
        }

        byWeek.set(key, bucket);
    }

    const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, c) => a + c, 0) / xs.length) : null;

    return [...byWeek.values()]
        .sort((a, b) => compareWeekSlots(a.slot, b.slot))
        .map(b => ({
            week: b.slot.week,
            label: weekLabel(b.slot, multiBlock),
            blockId: b.slot.blockId,
            blockName: b.slot.blockName,
            blockSequence: b.slot.blockSequence,
            plannedTonnage: b.plannedSets > 0 ? Math.round(b.plannedTonnage) : null,
            actualTonnage: b.actualSets > 0 ? Math.round(b.actualTonnage) : null,
            plannedSets: b.plannedSets,
            actualSets: b.actualSets,
            plannedAvgIntensityPct: avg(b.plannedIntensities),
            actualAvgIntensityPct: avg(b.actualIntensities),
        }));
}

// =====================================================================
// COMPARATIVA ENTRE EJERCICIOS
// =====================================================================

export interface ComparisonPoint {
    /** "S3", o "B2·S3" si el historial abarca varios bloques. */
    label: string;
    /** Número de semana DENTRO de su bloque. */
    week: number;
    blockId: string;
    blockName: string;
    blockSequence: number;
    /** Una clave por ejercicio comparado, con su mejor 1RM estimado. */
    [exercise: string]: number | string | null;
}

/**
 * Serie comparable entre varios ejercicios.
 *
 * Se compara el **1RM estimado**, no la carga bruta: un press de banca y un
 * peso muerto no se pueden poner en el mismo eje en kilos absolutos sin que
 * el peso muerto aplaste visualmente al otro, y lo que interesa saber es si
 * cada uno está subiendo, no cuál pesa más.
 */
export function compareExercises(
    history: ExerciseHistoryRow[],
    names: string[]
): ComparisonPoint[] {
    if (names.length === 0) return [];

    // Por (bloque, semana): comparar el press de banca de la semana 1 de
    // enero con el de la semana 1 de junio en el mismo punto del eje daba
    // una comparativa que no comparaba nada. Ver `weeklySeries`.
    const multiBlock = isMultiBlock(history);
    const byWeek = new Map<string, { slot: WeekSlot; values: Record<string, number> }>();

    for (const row of history) {
        if (!names.includes(row.exerciseName)) continue;

        let best = 0;
        for (const set of row.sets) {
            const kg = kgOf(set);
            const reps = repsOf(set);
            if (kg === null || reps === null) continue;
            const oneRm = estimate1RM(kg, reps);
            if (oneRm !== null && oneRm > best) best = oneRm;
        }
        if (best === 0) continue;

        const key = weekSlotKey(row);
        const bucket = byWeek.get(key) ?? { slot: weekSlotOf(row), values: {} };
        // Dentro de la misma semana puede haber varios días del mismo
        // ejercicio: se queda el mejor, que es el que marca el progreso.
        if (!bucket.values[row.exerciseName] || best > bucket.values[row.exerciseName]) {
            bucket.values[row.exerciseName] = best;
        }
        byWeek.set(key, bucket);
    }

    return [...byWeek.values()]
        .sort((a, b) => compareWeekSlots(a.slot, b.slot))
        .map(({ slot, values }) => ({
            label: weekLabel(slot, multiBlock),
            week: slot.week,
            blockId: slot.blockId,
            blockName: slot.blockName,
            blockSequence: slot.blockSequence,
            ...values,
        }));
}

// =====================================================================
// PERFIL CARGA-VELOCIDAD
// =====================================================================

export interface VelocityPoint {
    kg: number;
    velocity: number;
    week: number;
    block: string;
}

export interface VelocityProfile {
    points: VelocityPoint[];
    /** Recta ajustada por mínimos cuadrados: v = slope·kg + intercept. */
    slope: number;
    intercept: number;
    /** Carga extrapolada a 0,15 m/s — la velocidad típica de un 1RM. */
    estimated1RM: number | null;
    /** Coeficiente de determinación. Por debajo de 0,5 la recta no dice nada. */
    r2: number;
}

/**
 * Ajusta el perfil carga-velocidad de un ejercicio.
 *
 * La relación entre carga y velocidad media es prácticamente lineal dentro
 * del rango de trabajo, así que una recta basta: cruzarla con la velocidad a
 * la que se mueve un máximo (~0,15 m/s en los tres básicos) da una
 * estimación de 1RM que no obliga a probar el máximo.
 *
 * Devuelve null con menos de tres puntos. Con dos, la recta pasa exacta por
 * ambos y el R² sale 1: parecería un ajuste perfecto cuando no hay ajuste
 * ninguno.
 */
export function velocityProfile(
    history: ExerciseHistoryRow[],
    exerciseName: string,
    minVelocityAt1RM = 0.15
): VelocityProfile | null {
    const points: VelocityPoint[] = [];

    for (const row of history) {
        if (row.exerciseName !== exerciseName) continue;

        const velocity = parseNum(row.velocityAvg);
        if (velocity === null || velocity <= 0) continue;

        // La velocidad media está registrada a nivel de ejercicio-sesión, así
        // que se empareja con la carga más alta de ese día: es la serie que
        // el atleta grabó con el encoder en la práctica totalidad de los casos.
        const loads = row.sets.map(kgOf).filter((v): v is number => v !== null);
        if (loads.length === 0) continue;

        points.push({
            kg: Math.max(...loads),
            velocity,
            week: row.weekNumber,
            block: row.blockName,
        });
    }

    if (points.length < 3) return null;

    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.kg, 0);
    const sumY = points.reduce((a, p) => a + p.velocity, 0);
    const sumXY = points.reduce((a, p) => a + p.kg * p.velocity, 0);
    const sumXX = points.reduce((a, p) => a + p.kg * p.kg, 0);

    const denom = n * sumXX - sumX * sumX;
    // Todas las mediciones a la misma carga: no hay recta que ajustar.
    if (Math.abs(denom) < 1e-9) return null;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    const ssTot = points.reduce((a, p) => a + (p.velocity - meanY) ** 2, 0);
    const ssRes = points.reduce((a, p) => a + (p.velocity - (slope * p.kg + intercept)) ** 2, 0);
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    // La pendiente tiene que ser negativa: más carga, menos velocidad. Si sale
    // positiva, los datos no describen un perfil y extrapolar sería inventar.
    const estimated1RM =
        slope < 0 ? Math.round(((minVelocityAt1RM - intercept) / slope) * 10) / 10 : null;

    return {
        points: points.sort((a, b) => a.kg - b.kg),
        slope,
        intercept,
        estimated1RM: estimated1RM !== null && estimated1RM > 0 ? estimated1RM : null,
        r2: Math.round(r2 * 100) / 100,
    };
}

// =====================================================================
// ADHERENCIA: LO PAUTADO CONTRA LO HECHO
// =====================================================================

/**
 * Kilos PRESCRITOS de una serie, o null si no se pautó en kilos.
 *
 * Gemelo de `kgOf` pero mirando SOLO el objetivo: para comparar plan y
 * ejecución hacen falta las dos caras por separado, y `kgOf` ya mezcla —da
 * prioridad a lo registrado— así que no sirve aquí.
 */
function targetKgOf(set: TrainingSet): number | null {
    const metric = set.target_metric ?? 'kg';
    if (metric !== 'kg') return null;
    return set.target_load ?? null;
}

/** Repeticiones PRESCRITAS de una serie (extremo bajo del rango). */
function targetRepsOf(set: TrainingSet): number | null {
    const raw = set.target_reps;
    if (!raw) return null;
    const parts = raw.toLowerCase().split('x');
    const repsPart = parts.length >= 2 ? parts.slice(1).join('x') : parts[0];
    return parseNum(repsPart.split('-')[0]);
}

/** ¿Está hecha esta serie? La columna manda; si es antigua, se deduce. */
function isSetDone(set: TrainingSet): boolean {
    return set.is_completed ?? Boolean(set.actual_reps || set.actual_load);
}

export interface AdherencePoint {
    sessionId: string;
    /** "S3·D2", o "B2·S3·D2" si el historial abarca varios bloques. */
    label: string;
    week: number;
    day: number;
    blockId: string;
    blockName: string;
    blockSequence: number;
    /** Tonelaje PRESCRITO en kilos (solo series pautadas en kg). */
    plannedTonnage: number;
    /** Tonelaje REALMENTE movido. */
    actualTonnage: number;
    setsPlanned: number;
    setsDone: number;
    /** Carga real / carga prescrita · 100. Null si nada estaba pautado en kg. */
    loadPct: number | null;
    /** Series hechas / series pautadas · 100. */
    completionPct: number;
}

/**
 * ADHERENCIA POR SESIÓN.
 *
 * La pregunta que el par `target_*` / `actual_*` existe para responder y que
 * hasta ahora no pintaba nadie: ¿se hizo lo que ponía? Dos números por sesión
 * —cuánto del tonelaje prescrito se movió y cuántas de las series pautadas se
 * cerraron— dicen de un vistazo quién sigue el plan y quién lo reescribe sobre
 * la marcha.
 *
 * Solo entran las sesiones que el atleta ha EMPEZADO (alguna serie hecha): las
 * semanas futuras están pautadas pero sin tocar, y arrastrarían la media a
 * cero por trabajo que todavía no tocaba hacer.
 */
export function adherenceSeries(history: ExerciseHistoryRow[]): AdherencePoint[] {
    const multiBlock = isMultiBlock(history);
    const bySession = new Map<string, AdherencePoint>();

    for (const row of history) {
        const point = bySession.get(row.sessionId) ?? {
            sessionId: row.sessionId,
            label: multiBlock
                ? `B${row.blockSequence + 1}·S${row.weekNumber}·D${row.dayNumber}`
                : `S${row.weekNumber}·D${row.dayNumber}`,
            week: row.weekNumber,
            day: row.dayNumber,
            blockId: row.blockId,
            blockName: row.blockName,
            blockSequence: row.blockSequence,
            plannedTonnage: 0,
            actualTonnage: 0,
            setsPlanned: 0,
            setsDone: 0,
            loadPct: null,
            completionPct: 0,
        };

        for (const set of row.sets) {
            point.setsPlanned += 1;

            const tKg = targetKgOf(set);
            const tReps = targetRepsOf(set);
            if (tKg !== null && tReps !== null) point.plannedTonnage += tKg * tReps;

            if (isSetDone(set)) {
                point.setsDone += 1;
                const aKg = set.actual_load ?? tKg;
                const aReps = set.actual_reps ?? tReps;
                if (aKg !== null && aReps !== null) point.actualTonnage += aKg * aReps;
            }
        }

        bySession.set(row.sessionId, point);
    }

    return [...bySession.values()]
        .filter(p => p.setsDone > 0)
        // Bloque primero. Ordenar solo por semana y día intercalaba las
        // sesiones de bloques distintos y la línea de adherencia iba y venía
        // en el tiempo.
        .sort((a, b) =>
            a.blockSequence - b.blockSequence || a.week - b.week || a.day - b.day
        )
        .map(p => ({
            ...p,
            plannedTonnage: Math.round(p.plannedTonnage),
            actualTonnage: Math.round(p.actualTonnage),
            loadPct: p.plannedTonnage > 0
                ? Math.round((p.actualTonnage / p.plannedTonnage) * 100)
                : null,
            completionPct: p.setsPlanned > 0
                ? Math.round((p.setsDone / p.setsPlanned) * 100)
                : 0,
        }));
}

// =====================================================================
// DISTRIBUCIÓN DE INTENSIDAD (ZONAS DE %1RM)
// =====================================================================

export interface IntensityBucket {
    key: string;
    label: string;
    /** Límite inferior de la zona, en % del 1RM estimado. */
    min: number;
    /** Límite superior, o null en la zona abierta (≥100 %). */
    max: number | null;
    sets: number;
    tonnage: number;
}

const INTENSITY_ZONES: { key: string; label: string; min: number; max: number | null }[] = [
    { key: 'z1', label: '<60%',   min: 0,   max: 60 },
    { key: 'z2', label: '60–70%', min: 60,  max: 70 },
    { key: 'z3', label: '70–80%', min: 70,  max: 80 },
    { key: 'z4', label: '80–90%', min: 80,  max: 90 },
    { key: 'z5', label: '90–100%',min: 90,  max: 100 },
    { key: 'z6', label: '≥100%',  min: 100, max: null },
];

/**
 * Reparto de las series por zona de intensidad relativa.
 *
 * La intensidad de cada serie es su carga sobre el mejor 1RM estimado de ESE
 * ejercicio —igual que en `summarize`—, no sobre un máximo global: comparar
 * los kilos de una sentadilla con los de un curl no significaría nada. El
 * histograma que sale es el clásico de la periodización: dice si el bloque
 * vive en fuerza (80–90+), en hipertrofia (70–80) o repartido.
 */
export function intensityDistribution(history: ExerciseHistoryRow[]): IntensityBucket[] {
    const bestByExercise = new Map<string, number>();
    for (const row of history) {
        for (const set of row.sets) {
            const kg = kgOf(set);
            const reps = repsOf(set);
            if (kg === null || reps === null) continue;
            const oneRm = estimate1RM(kg, reps);
            if (oneRm !== null) {
                const prev = bestByExercise.get(row.exerciseName) ?? 0;
                if (oneRm > prev) bestByExercise.set(row.exerciseName, oneRm);
            }
        }
    }

    const buckets: IntensityBucket[] = INTENSITY_ZONES.map(z => ({ ...z, sets: 0, tonnage: 0 }));

    for (const row of history) {
        const best = bestByExercise.get(row.exerciseName);
        if (!best || best <= 0) continue;

        for (const set of row.sets) {
            const kg = kgOf(set);
            const reps = repsOf(set);
            if (kg === null || reps === null) continue;

            const pct = (kg / best) * 100;
            const bucket = buckets.find(b => pct >= b.min && (b.max === null || pct < b.max));
            if (bucket) {
                bucket.sets += 1;
                bucket.tonnage += Math.round(kg * reps);
            }
        }
    }

    return buckets;
}

// =====================================================================
// CONSTANCIA: ACTIVIDAD POR DÍA DE CALENDARIO
// =====================================================================

export interface ConsistencyDay {
    /** YYYY-MM-DD. */
    date: string;
    sessions: number;
    sets: number;
    completedSets: number;
}

/**
 * Actividad agregada por día de calendario, para el mapa de constancia.
 *
 * Cuenta series hechas por fecha; el componente lo pinta como una rejilla de
 * intensidad tipo GitHub. Las filas sin `date` —bloques a los que el coach no
 * les puso fechas— se quedan fuera: no se pueden situar en un calendario, y
 * meterlas en "hoy" mentiría sobre cuándo se entrenó.
 */
export function consistencyByDay(history: ExerciseHistoryRow[]): ConsistencyDay[] {
    const byDate = new Map<string, { sessions: Set<string>; sets: number; completed: number }>();

    for (const row of history) {
        if (!row.date) continue;
        const day = row.date.slice(0, 10);
        const bucket = byDate.get(day) ?? { sessions: new Set<string>(), sets: 0, completed: 0 };

        bucket.sessions.add(row.sessionId);
        for (const set of row.sets) {
            bucket.sets += 1;
            if (isSetDone(set)) bucket.completed += 1;
        }

        byDate.set(day, bucket);
    }

    return [...byDate.entries()]
        .map(([date, b]) => ({
            date,
            sessions: b.sessions.size,
            sets: b.sets,
            completedSets: b.completed,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// =====================================================================
// CUESTIONARIOS
// =====================================================================
//
// `summarizeCheckIns` vivía aquí y se ha mudado a
// `src/lib/forms/checkInStats.ts` junto al registro de ejes.
//
// No es un movimiento de orden: la versión de aquí metía los cuestionarios
// DIARIOS y los SEMANALES en la misma serie y les ponía un solo eje Y, así
// que el eje X no significaba nada y "pasos" aplastaba a "sueño". Ver la
// cabecera de ese fichero y la decisión K9.
