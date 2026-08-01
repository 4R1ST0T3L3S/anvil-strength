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
import type { FormResponse } from '../../services/formsService';

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

/** Parte de repeticiones de un `target_reps`, para agrupar series comparables. */
export function repsKey(targetReps: string | null | undefined): string {
    if (!targetReps) return '';
    const parts = targetReps.toLowerCase().split('x');
    return (parts.length >= 2 ? parts.slice(1).join('x') : parts[0]).trim();
}

/**
 * 1RM estimado por Epley.
 *
 * Se corta en 12 repeticiones a propósito: por encima la fórmula deja de
 * predecir fuerza máxima y empieza a medir resistencia, y una serie de 20
 * daría un "1RM" que nadie levantaría nunca.
 */
export function estimate1RM(kg: number, reps: number): number | null {
    if (kg <= 0 || reps <= 0 || reps > 12) return null;
    return Math.round(kg * (1 + reps / 30) * 10) / 10;
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
    firstWeek: number | null;
    lastWeek: number | null;
}

export function summarize(history: ExerciseHistoryRow[]): GeneralSummary {
    let totalSets = 0;
    let tonnage = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    let hardSets = 0;

    const sessions = new Set<string>();
    const exercises = new Set<string>();
    const weeks: number[] = [];
    const bestByExercise = new Map<string, number>();
    const loadSamples: { name: string; kg: number }[] = [];

    for (const row of history) {
        sessions.add(row.sessionId);
        exercises.add(row.exerciseName);
        weeks.push(row.weekNumber);

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
        firstWeek: weeks.length ? Math.min(...weeks) : null,
        lastWeek: weeks.length ? Math.max(...weeks) : null,
    };
}

// =====================================================================
// SERIE TEMPORAL POR SEMANA
// =====================================================================

export interface WeeklyPoint {
    week: number;
    label: string;
    tonnage: number;
    sets: number;
    avgRpe: number | null;
    avgIntensityPct: number | null;
}

/** Evolución semana a semana de carga, series, esfuerzo e intensidad. */
export function weeklySeries(history: ExerciseHistoryRow[]): WeeklyPoint[] {
    const byWeek = new Map<number, { tonnage: number; sets: number; rpeSum: number; rpeCount: number; intensities: number[] }>();

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
        const bucket = byWeek.get(row.weekNumber) ?? { tonnage: 0, sets: 0, rpeSum: 0, rpeCount: 0, intensities: [] };

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

        byWeek.set(row.weekNumber, bucket);
    }

    return [...byWeek.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([week, b]) => ({
            week,
            label: `S${week}`,
            tonnage: Math.round(b.tonnage),
            sets: b.sets,
            avgRpe: b.rpeCount ? Math.round((b.rpeSum / b.rpeCount) * 10) / 10 : null,
            avgIntensityPct: b.intensities.length
                ? Math.round(b.intensities.reduce((a, c) => a + c, 0) / b.intensities.length)
                : null,
        }));
}

// =====================================================================
// COMPARATIVA ENTRE EJERCICIOS
// =====================================================================

export interface ComparisonPoint {
    label: string;
    week: number;
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

    const byWeek = new Map<number, Record<string, number>>();

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

        const bucket = byWeek.get(row.weekNumber) ?? {};
        // Dentro de la misma semana puede haber varios días del mismo
        // ejercicio: se queda el mejor, que es el que marca el progreso.
        if (!bucket[row.exerciseName] || best > bucket[row.exerciseName]) {
            bucket[row.exerciseName] = best;
        }
        byWeek.set(row.weekNumber, bucket);
    }

    return [...byWeek.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([week, values]) => ({ label: `S${week}`, week, ...values }));
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
// CUESTIONARIOS
// =====================================================================

export interface CheckInPoint {
    periodKey: string;
    label: string;
    [question: string]: number | string | null;
}

export interface CheckInSummary {
    /** Serie temporal con una clave por pregunta de escala o numérica. */
    points: CheckInPoint[];
    /** Etiquetas de las preguntas representables, en orden de aparición. */
    questions: { id: string; label: string }[];
    /** Últimos comentarios en texto libre, del más reciente al más antiguo. */
    comments: { periodKey: string; text: string }[];
    responseCount: number;
}

/**
 * Convierte las respuestas de los cuestionarios en algo graficable.
 *
 * Solo se representan las preguntas de tipo `scale` y `number`: el texto
 * libre no va a una gráfica, pero tampoco se tira — se lista aparte, porque
 * suele ser donde el atleta cuenta lo que de verdad pasó esa semana.
 */
export function summarizeCheckIns(responses: FormResponse[]): CheckInSummary {
    const questions = new Map<string, string>();
    const comments: { periodKey: string; text: string }[] = [];

    const points = [...responses]
        .sort((a, b) => a.period_key.localeCompare(b.period_key))
        .map((r) => {
            const point: CheckInPoint = { periodKey: r.period_key, label: r.period_key };

            for (const answer of r.answers ?? []) {
                if (answer.qtype === 'text') {
                    const text = String(answer.value ?? '').trim();
                    if (text) comments.push({ periodKey: r.period_key, text });
                    continue;
                }

                const value = parseNum(answer.value);
                if (value === null) continue;

                questions.set(answer.id, answer.label);
                point[answer.id] = value;
            }

            return point;
        });

    return {
        points,
        questions: [...questions.entries()].map(([id, label]) => ({ id, label })),
        comments: comments.reverse().slice(0, 8),
        responseCount: responses.length,
    };
}
