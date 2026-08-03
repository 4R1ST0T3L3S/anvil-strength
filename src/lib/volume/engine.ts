/**
 * ANVIL STRENGTH — MOTOR DE VOLUMEN
 *
 * Convierte la prescripción de un bloque en cifras agregables por grupo
 * muscular, a cualquier altura: serie, ejercicio, día, semana, bloque,
 * mesociclo o macrociclo.
 *
 * Definiciones (importan, porque todo lo demás se apoya en ellas):
 *
 *   Serie directa    — el músculo es motor primario. Cuenta 1.0.
 *   Serie indirecta  — el músculo es sinergista. Cuenta INDIRECT_FACTOR,
 *                      que desde 2026-07-30 también vale 1.0 (ver muscles.ts).
 *   Tonelaje         — series x repeticiones x carga, en kg.
 *
 * Las dos cifras se guardan SEPARADAS a propósito. `direct` conserva el mismo
 * significado de siempre y es la que se compara con los rangos de referencia
 * semanales; `total` incluye el trabajo sinergista con el peso nuevo. Fundir
 * las dos en un solo número dejaría los rangos sin sentido: casi todo saldría
 * "por encima" en cuanto el bloque fuese multiarticular, que es siempre.
 *
 * El tonelaje solo existe cuando hay carga prescrita o registrada. Un bloque
 * programado en %RM o en RPE sin kg tendrá series pero no tonelaje, y eso es
 * correcto: es preferible un hueco a un número inventado.
 */

import type { TrainingSet, SessionExercise, ExerciseLibrary } from '../../types/training';
import {
    classifyExercise,
    MUSCLE_GROUPS,
    INDIRECT_FACTOR,
    MUSCLE_DISPLAY_ORDER,
    assessWeeklyVolume,
} from './muscles';
import type { MuscleGroup, MovementPattern, VolumeVerdict } from './muscles';

// ---------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------

/** Lo mínimo que el motor necesita de un ejercicio de sesión. */
export interface VolumeExerciseInput {
    id: string;
    exercise?: Pick<
        ExerciseLibrary,
        'name' | 'muscle_group' | 'primary_muscles' | 'secondary_muscles'
    > | null;
    variant_name?: string | null;
    /**
     * Anulación de ESTA prescripción, la más específica de todas.
     *
     * Gana a la de la biblioteca porque es una decisión local: el mismo remo
     * puede programarse buscando dorsal en un bloque y espalda alta en otro, y
     * la biblioteca —que es global— no puede decir las dos cosas a la vez.
     */
    primary_muscles?: string[] | null;
    secondary_muscles?: string[] | null;
    sets: TrainingSet[];
}

export interface VolumeSessionInput {
    id: string;
    week_number: number;
    day_number: number;
    exercises: VolumeExerciseInput[];
}

/** `planned` usa lo prescrito por el coach; `actual` lo registrado por el atleta. */
export type VolumeSource = 'planned' | 'actual';

// ---------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------

export interface MuscleVolume {
    muscle: MuscleGroup;
    /** Series en las que el músculo es motor primario. */
    direct: number;
    /** Series sinergistas, ya ponderadas por INDIRECT_FACTOR. */
    indirect: number;
    /**
     * direct + indirect. Es el estímulo total que recibe el músculo.
     * OJO: la cifra que se compara con WEEKLY_SET_REFERENCE es `direct`, no
     * esta. Los rangos de referencia están construidos sobre series directas.
     */
    total: number;
    /** Repeticiones totales acumuladas (directas). */
    reps: number;
    /** Kg movidos en series directas. 0 si no hay cargas prescritas. */
    tonnage: number;
}

export interface VolumeReport {
    byMuscle: MuscleVolume[];
    /** Series totales del ámbito, sin desglosar por músculo. */
    totalSets: number;
    totalTonnage: number;
    byPattern: Record<MovementPattern, number>;
    /**
     * Ejercicios que ninguna regla supo clasificar. Se listan en vez de
     * repartirse a ojo: un volumen inventado llevaría a decidir sobre una
     * cifra falsa.
     */
    unclassified: string[];
    /** Nº de semanas distintas incluidas. Necesario para normalizar. */
    weekCount: number;
}

// ---------------------------------------------------------------------
// Parseo de la prescripción
// ---------------------------------------------------------------------

/**
 * `target_reps` es texto libre con formato "series x reps": "3x5", "5",
 * "3x5-6", "4xAMRAP". Se interpreta igual que en el builder para que las
 * cifras del panel coincidan con lo que el coach ve escrito.
 *
 * En rangos ("5-6") se toma el extremo BAJO. El volumen se estima en
 * conservador: es preferible que el coach descubra que hizo algo más de lo
 * previsto a que crea que hizo menos.
 */
export function parsePrescription(targetReps: string | null | undefined): {
    series: number;
    reps: number;
} {
    if (!targetReps) return { series: 1, reps: 0 };

    const raw = targetReps.toLowerCase().trim();
    const parts = raw.split('x');

    const seriesText = parts.length >= 2 ? parts[0] : '1';
    const repsText = parts.length >= 2 ? parts.slice(1).join('x') : raw;

    return {
        series: firstNumber(seriesText, 1),
        reps: firstNumber(repsText, 0),
    };
}

/** Primer entero del texto; en "5-6" devuelve 5. AMRAP y similares → 0. */
function firstNumber(text: string, fallback: number): number {
    const m = text.match(/\d+(?:[.,]\d+)?/);
    if (!m) return fallback;
    const n = parseFloat(m[0].replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * ¿La carga prescrita está en kilos?
 *
 * `target_load` guarda el número de la prescripción sea cual sea su unidad
 * (ver database/set_target_metric.sql). Tratarlo siempre como kilos metería
 * una velocidad de 0,45 m/s o una pérdida del 20% dentro del tonelaje, que
 * dejaría de significar nada.
 *
 * Las filas antiguas no tienen `target_metric`: son kilos, que es lo único
 * que se podía prescribir cuando se escribieron.
 */
function loadInKg(set: TrainingSet): number {
    const metric = set.target_metric ?? 'kg';
    return metric === 'kg' ? (set.target_load ?? 0) : 0;
}

/** Aportación de UNA fila de series, según la fuente elegida. */
function resolveSet(set: TrainingSet, source: VolumeSource) {
    if (source === 'actual') {
        // Lo registrado por el atleta es siempre una serie ejecutada.
        // Si no registró nada, no cuenta: no se asume que la hizo.
        const done = set.actual_reps != null || set.actual_load != null;
        if (!done) return null;
        return {
            series: 1,
            reps: set.actual_reps ?? 0,
            // Lo que registra el atleta SÍ son siempre kilos: `actual_load` es
            // el peso que movió, independientemente de en qué unidad se le
            // pautó la serie.
            load: set.actual_load ?? 0,
        };
    }

    const { series, reps } = parsePrescription(set.target_reps);
    return { series, reps, load: loadInKg(set) };
}

// ---------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------

const EMPTY_PATTERNS: Record<MovementPattern, number> = {
    squat: 0,
    bench: 0,
    deadlift: 0,
    press: 0,
    pull: 0,
    hinge: 0,
    accessory: 0,
    core: 0,
};

/**
 * Agrega el volumen de un conjunto arbitrario de sesiones.
 *
 * Es la única función de cálculo: día, semana, bloque, mesociclo y
 * macrociclo son todos el mismo cálculo sobre distintos subconjuntos. Así
 * las cifras no pueden discrepar entre pantallas.
 */
export function computeVolume(
    sessions: VolumeSessionInput[],
    source: VolumeSource = 'planned'
): VolumeReport {
    const acc = new Map<MuscleGroup, MuscleVolume>();
    const byPattern = { ...EMPTY_PATTERNS };
    const unclassified = new Set<string>();
    const weeks = new Set<number>();

    let totalSets = 0;
    let totalTonnage = 0;

    const bump = (muscle: MuscleGroup): MuscleVolume => {
        let entry = acc.get(muscle);
        if (!entry) {
            entry = { muscle, direct: 0, indirect: 0, total: 0, reps: 0, tonnage: 0 };
            acc.set(muscle, entry);
        }
        return entry;
    };

    for (const session of sessions) {
        weeks.add(session.week_number);

        for (const ex of session.exercises) {
            const name = ex.exercise?.name ?? '';
            const cls = resolveClassification(ex, name);

            if (cls.inferred) {
                unclassified.add(displayName(ex));
            }

            for (const set of ex.sets ?? []) {
                const resolved = resolveSet(set, source);
                if (!resolved) continue;

                const { series, reps, load } = resolved;
                const tonnage = series * reps * load;

                totalSets += series;
                totalTonnage += tonnage;
                byPattern[cls.pattern] += series;

                for (const muscle of cls.primary) {
                    const entry = bump(muscle);
                    entry.direct += series;
                    entry.reps += series * reps;
                    entry.tonnage += tonnage;
                }

                for (const muscle of cls.secondary) {
                    const entry = bump(muscle);
                    entry.indirect += series * INDIRECT_FACTOR;
                }
            }
        }
    }

    const byMuscle = MUSCLE_DISPLAY_ORDER.map((m) => acc.get(m))
        .filter((v): v is MuscleVolume => Boolean(v))
        .map((v) => ({
            ...v,
            direct: round1(v.direct),
            indirect: round1(v.indirect),
            total: round1(v.direct + v.indirect),
            tonnage: Math.round(v.tonnage),
        }));

    return {
        byMuscle,
        totalSets: round1(totalSets),
        totalTonnage: Math.round(totalTonnage),
        byPattern,
        unclassified: [...unclassified],
        weekCount: weeks.size || 1,
    };
}

/**
 * Reparte el volumen por semana. Es lo que hace legible una progresión:
 * el total de un bloque de 8 semanas no dice nada por sí solo.
 */
export function computeWeeklySeries(
    sessions: VolumeSessionInput[],
    source: VolumeSource = 'planned'
): { week: number; report: VolumeReport }[] {
    const byWeek = new Map<number, VolumeSessionInput[]>();
    for (const s of sessions) {
        const list = byWeek.get(s.week_number);
        if (list) list.push(s);
        else byWeek.set(s.week_number, [s]);
    }

    return [...byWeek.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([week, group]) => ({ week, report: computeVolume(group, source) }));
}

/**
 * Media semanal por músculo, con su veredicto frente a las referencias.
 *
 * Se normaliza por semana porque las referencias son semanales: comparar el
 * acumulado de un bloque contra un rango semanal daría siempre "por encima".
 */
export function weeklyAverages(
    report: VolumeReport
): (MuscleVolume & { perWeek: number; verdict: VolumeVerdict })[] {
    return report.byMuscle.map((v) => {
        const perWeek = round1(v.direct / report.weekCount);
        return { ...v, perWeek, verdict: assessWeeklyVolume(v.muscle, perWeek) };
    });
}

/**
 * QUIÉN DECIDE LA CLASIFICACIÓN, de más específico a más genérico:
 *
 *   1. La prescripción      — `session_exercises.primary_muscles`
 *   2. La biblioteca        — `exercise_library.primary_muscles`
 *   3. Las reglas por patrón sobre el nombre
 *
 * El nivel 1 es el que añade esta versión y es el que usa el coach desde el
 * editor del día. El 2 sigue existiendo para fijar de una vez un ejercicio
 * que la regla clasifica mal siempre.
 *
 * "Tiene opinión" es que el array EXISTA, aunque venga vacío: un array vacío
 * significa "este ejercicio no aporta volumen a nadie", que es la respuesta
 * correcta para una movilidad metida como ejercicio, y confundirlo con "no
 * opino" haría imposible declararlo.
 *
 * Los valores desconocidos se descartan en silencio: un grupo muscular mal
 * escrito en la BD no debe tumbar el cálculo entero de un bloque.
 */
function resolveClassification(ex: VolumeExerciseInput, name: string) {
    const pattern = classifyExercise(name).pattern;

    if (Array.isArray(ex.primary_muscles)) {
        return {
            primary: sanitize(ex.primary_muscles),
            secondary: sanitize(ex.secondary_muscles),
            pattern,
            inferred: false,
        };
    }

    const libraryPrimary = sanitize(ex.exercise?.primary_muscles);
    if (libraryPrimary.length > 0) {
        return {
            primary: libraryPrimary,
            secondary: sanitize(ex.exercise?.secondary_muscles),
            pattern,
            inferred: false,
        };
    }

    return classifyExercise(name);
}

const VALID_MUSCLES = new Set<string>(MUSCLE_GROUPS);

function sanitize(values: string[] | null | undefined): MuscleGroup[] {
    if (!values?.length) return [];
    return values.filter((v): v is MuscleGroup => VALID_MUSCLES.has(v));
}

/** "Sentadilla (Pausada)" — cómo se nombra un ejercicio en los informes. */
function displayName(ex: VolumeExerciseInput): string {
    const base = ex.exercise?.name ?? 'Sin nombre';
    return ex.variant_name ? `${base} (${ex.variant_name})` : base;
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

/** Adaptador desde el tipo que ya usan el builder y trainingService. */
export function toVolumeInput(
    session: { id: string; week_number: number; day_number: number },
    exercises: (SessionExercise & { sets?: TrainingSet[] })[]
): VolumeSessionInput {
    return {
        id: session.id,
        week_number: session.week_number,
        day_number: session.day_number,
        exercises: exercises.map((ex) => ({
            id: ex.id,
            exercise: ex.exercise,
            variant_name: ex.variant_name,
            primary_muscles: ex.primary_muscles,
            secondary_muscles: ex.secondary_muscles,
            sets: ex.sets ?? [],
        })),
    };
}
