/**
 * ANVIL STRENGTH — MEJORES MARCAS POR NÚMERO DE REPETICIONES
 * =====================================================================
 *
 * LA REGLA QUE DEFINE ESTE MÓDULO
 *
 * **Una serie NO es mejor marca por pesar más.** Un 220×1 no supera a un
 * 200×5: son dos marcas distintas de dos cosas distintas, y tratarlas como
 * una sola escala destruye la única pregunta que se hace un coach mientras
 * programa —"¿qué es lo mejor que ha hecho con ESTE número de
 * repeticiones?"—.
 *
 * Así que las marcas se guardan y se comparan **dentro del mismo número de
 * repeticiones**: mejor single, mejor doble, mejor triple, mejor 5RM. Cada
 * una es su propio registro.
 *
 *
 * EL DESEMPATE, Y POR QUÉ ESE ORDEN
 *
 * A igualdad de peso y repeticiones gana:
 *
 *   1. **el RPE más bajo** — 200×3 @8 es mejor levantamiento que 200×3 @10:
 *      el mismo trabajo con menos coste. Es la señal más fuerte que hay.
 *   2. **la velocidad media más alta** — mide lo mismo que el RPE pero sin
 *      pasar por la percepción de nadie. Va después y no antes porque casi
 *      ninguna serie la tiene, y un criterio que casi nunca se puede aplicar
 *      no puede ser el principal.
 *   3. **la más reciente** — a igualdad de todo, la de ahora describe mejor
 *      al atleta de ahora.
 *
 * Un dato que falta NUNCA gana un desempate: una serie sin RPE no es "mejor"
 * que una con RPE 9 por no tenerlo. Se pasa al siguiente criterio.
 *
 *
 * POR QUÉ LA DETECCIÓN PROPONE Y NO GUARDA (decisión del 30/08/2026)
 *
 * `detectRepMaxes` recorre el historial y devuelve CANDIDATAS. No escribe
 * nada. El coach confirma.
 *
 * Porque el origen del dato es el registro del atleta, y ahí se teclea con el
 * móvil entre serie y serie: un 250 donde había que poner 150 es un error
 * normal. Si esa serie se convirtiera sola en la mejor marca, se volvería
 * la referencia sobre la que se calculan los porcentajes de todo el bloque
 * siguiente, y el error se propagaría a cada sesión programada sin que nadie
 * lo viera. Un clic de confirmación es barato; deshacer un bloque entero
 * programado sobre una marca falsa, no.
 */

import type { ExerciseHistoryRow } from '../../services/trainingService';
import type { TrainingSet } from '../../types/training';
import { exerciseKey } from '../planning/blockAnalytics';

// =====================================================================
// EL MODELO
// =====================================================================

/** Una marca: lo mejor que ha hecho el atleta con N repeticiones. */
export interface RepMax {
    id?: string;
    athlete_id: string;
    /** Nombre normalizado, el mismo criterio que `athlete_exercise_maxes`. */
    exercise_key: string;
    exercise_name: string;
    /** El número de repeticiones que define la marca. 1 = single, 3 = triple… */
    reps: number;
    load_kg: number;
    rpe?: number | null;
    /** Velocidad media de la serie, m/s. */
    mean_velocity?: number | null;
    /** Cuándo se hizo, YYYY-MM-DD. Null si la serie no tiene fecha. */
    achieved_on?: string | null;
    source: 'manual' | 'detected';
    /** La serie de la que salió, cuando viene del registro. */
    training_set_id?: string | null;
    notes?: string | null;
    created_at?: string;
    updated_at?: string;
}

/** Lo mínimo para poder comparar dos marcas. */
export interface ComparableMark {
    reps: number;
    load_kg: number;
    rpe?: number | null;
    mean_velocity?: number | null;
    achieved_on?: string | null;
}

// =====================================================================
// LA COMPARACIÓN
// =====================================================================

/**
 * ¿`candidate` es mejor marca que `current`, para el mismo número de
 * repeticiones?
 *
 * Comparar marcas de repeticiones distintas es un error de programación y por
 * eso devuelve `false` en vez de intentar algo: no hay ninguna respuesta
 * correcta a "¿es mejor 220×1 que 200×5?".
 */
export function isBetterMark(candidate: ComparableMark, current: ComparableMark | null): boolean {
    if (!current) return true;
    if (candidate.reps !== current.reps) return false;

    // 1. El peso manda.
    if (candidate.load_kg !== current.load_kg) return candidate.load_kg > current.load_kg;

    // 2. Mismo peso: gana el RPE más bajo. Solo decide si las DOS lo tienen —
    //    un dato que falta no gana un desempate.
    if (candidate.rpe != null && current.rpe != null && candidate.rpe !== current.rpe) {
        return candidate.rpe < current.rpe;
    }

    // 3. Gana la velocidad más alta. Mismo criterio: hacen falta las dos.
    if (
        candidate.mean_velocity != null &&
        current.mean_velocity != null &&
        candidate.mean_velocity !== current.mean_velocity
    ) {
        return candidate.mean_velocity > current.mean_velocity;
    }

    // 4. A igualdad de todo, la más reciente.
    if (candidate.achieved_on && current.achieved_on) {
        return candidate.achieved_on > current.achieved_on;
    }

    return false;
}

/** La mejor de una lista de marcas del MISMO número de repeticiones. */
export function bestOf(marks: ComparableMark[]): ComparableMark | null {
    return marks.reduce<ComparableMark | null>(
        (best, m) => (isBetterMark(m, best) ? m : best),
        null
    );
}

// =====================================================================
// BÚSQUEDA
// =====================================================================

/** Las marcas de un atleta, indexadas para buscarlas en O(1). */
export type RepMaxIndex = Map<string, RepMax>;

const indexKey = (exercise: string, reps: number) => `${exerciseKey(exercise)}|${reps}`;

export function buildRepMaxIndex(marks: RepMax[]): RepMaxIndex {
    const index: RepMaxIndex = new Map();
    for (const mark of marks) {
        const key = `${mark.exercise_key}|${mark.reps}`;
        const current = index.get(key);
        if (!current || isBetterMark(mark, current)) index.set(key, mark);
    }
    return index;
}

/**
 * La mejor marca de un ejercicio a N repeticiones.
 *
 * Cae a la versión sin variante igual que `findMax` de `maxesService`:
 * "Sentadilla Pausada" no tiene marcas propias pero "Sentadilla" sí, y al
 * programar una pausada a 3 repeticiones lo que interesa saber es el mejor
 * triple de sentadilla. Sin este respaldo la referencia no aparecería en la
 * mitad de los ejercicios de un bloque.
 */
export function findRepMax(
    index: RepMaxIndex | null | undefined,
    exerciseName: string | null | undefined,
    reps: number | null | undefined
): RepMax | null {
    if (!index || !exerciseName || reps == null || !Number.isFinite(reps)) return null;

    const exact = index.get(indexKey(exerciseName, reps));
    if (exact) return exact;

    const base = exerciseName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (base && base !== exerciseName) {
        const hit = index.get(indexKey(base, reps));
        if (hit) return hit;
    }

    return null;
}

/**
 * Todas las marcas de un ejercicio, de menos a más repeticiones.
 *
 * Es la tabla que se enseña en la pestaña Histórico: mejor single, doble,
 * triple, 5RM… en la escala en la que se leen.
 */
export function marksForExercise(marks: RepMax[], exerciseName: string): RepMax[] {
    const key = exerciseKey(exerciseName);
    return marks
        .filter(m => m.exercise_key === key)
        .sort((a, b) => a.reps - b.reps);
}

/** Los ejercicios que tienen alguna marca, en orden alfabético. */
export function exercisesWithMarks(marks: RepMax[]): { key: string; name: string }[] {
    const byKey = new Map<string, string>();
    for (const m of marks) {
        if (!byKey.has(m.exercise_key)) byKey.set(m.exercise_key, m.exercise_name);
    }
    return [...byKey.entries()]
        .map(([key, name]) => ({ key, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// =====================================================================
// DETECCIÓN DESDE EL REGISTRO
// =====================================================================

/** Una marca detectada en el historial, aún sin confirmar. */
export interface RepMaxCandidate {
    exercise_key: string;
    exercise_name: string;
    reps: number;
    load_kg: number;
    rpe: number | null;
    mean_velocity: number | null;
    achieved_on: string | null;
    training_set_id: string;
    /** La marca vigente a la que superaría. null = no había ninguna. */
    supersedes: RepMax | null;
}

/** Repeticiones máximas que se consideran una "marca". */
export const MAX_TRACKED_REPS = 12;

/**
 * Solo series REALIZADAS entran aquí.
 *
 * `actual_load` y `actual_reps`, nunca `target_*`. Una marca es algo que
 * ocurrió; lo prescrito es una intención. Proponer como récord un peso que
 * el coach escribió pero el atleta no llegó a levantar sería exactamente el
 * fallo que este módulo existe para no cometer.
 */
function executedMark(set: TrainingSet): { reps: number; load: number } | null {
    const reps = set.actual_reps;
    const load = set.actual_load;
    if (reps == null || load == null) return null;
    if (!Number.isFinite(reps) || !Number.isFinite(load)) return null;
    if (reps < 1 || reps > MAX_TRACKED_REPS) return null;
    // Una carga de 0 o negativa no es un levantamiento. Los ejercicios
    // corporales no producen marcas de kilos, y así debe ser.
    if (load <= 0) return null;
    return { reps, load };
}

/**
 * Recorre el historial y propone las marcas que superan a las vigentes.
 *
 * NO ESCRIBE NADA. Ver la cabecera: el coach confirma.
 *
 * Devuelve como mucho una candidata por (ejercicio, repeticiones) —la mejor
 * de todas las que superan a la vigente—, para que confirmar no sea revisar
 * cuarenta propuestas del mismo triple.
 */
export function detectRepMaxes(
    history: ExerciseHistoryRow[],
    existing: RepMax[] = []
): RepMaxCandidate[] {
    const index = buildRepMaxIndex(existing);
    const best = new Map<string, RepMaxCandidate>();

    for (const row of history) {
        const name = row.exerciseName;
        if (!name) continue;
        const key = exerciseKey(name);

        for (const set of row.sets) {
            const executed = executedMark(set);
            if (!executed) continue;

            const candidate: RepMaxCandidate = {
                exercise_key: key,
                exercise_name: name,
                reps: executed.reps,
                load_kg: executed.load,
                rpe: set.actual_rpe ?? null,
                mean_velocity: set.vbt_mean_velocity ?? null,
                achieved_on: row.date ?? null,
                training_set_id: set.id,
                supersedes: index.get(`${key}|${executed.reps}`) ?? null,
            };

            // ¿Supera a la marca vigente?
            if (!isBetterMark(candidate, candidate.supersedes)) continue;

            // ¿Y a la mejor candidata que ya teníamos de este mismo hueco?
            const slot = `${key}|${executed.reps}`;
            const current = best.get(slot);
            if (!current || isBetterMark(candidate, current)) best.set(slot, candidate);
        }
    }

    return [...best.values()].sort(
        (a, b) => a.exercise_name.localeCompare(b.exercise_name, 'es') || a.reps - b.reps
    );
}

// =====================================================================
// PRESENTACIÓN
// =====================================================================

/** "205 × 3 @9 · 0,23 m/s · 12/06/2026", con lo que haya. */
export function formatMark(mark: RepMax | ComparableMark): string {
    const parts = [`${mark.load_kg} × ${mark.reps}`];
    if (mark.rpe != null) parts.push(`@${mark.rpe}`);
    if (mark.mean_velocity != null) parts.push(`${mark.mean_velocity.toFixed(2)} m/s`);
    if (mark.achieved_on) {
        const [y, m, d] = mark.achieved_on.slice(0, 10).split('-');
        if (y && m && d) parts.push(`${d}/${m}/${y}`);
    }
    return parts.join(' · ');
}

/** "MEJOR 3RM", "MEJOR SINGLE". Cómo se llama una marca de N repeticiones. */
export function markLabel(reps: number): string {
    if (reps === 1) return 'Mejor single';
    if (reps === 2) return 'Mejor doble';
    if (reps === 3) return 'Mejor triple';
    return `Mejor ${reps}RM`;
}

/**
 * Las repeticiones que representa una prescripción, para buscar su marca.
 *
 * "4x3" busca el mejor TRIPLE (3), no el mejor 4RM: lo que define la marca es
 * cuántas repeticiones lleva cada serie, no cuántas series hay.
 */
export function repsForLookup(targetReps: string | null | undefined): number | null {
    if (!targetReps) return null;
    const parts = targetReps.toLowerCase().split('x');
    const repsPart = parts.length >= 2 ? parts.slice(1).join('x') : parts[0];
    // Un rango "3-5" se busca por el extremo BAJO: es el compromiso mínimo, y
    // la marca de 3 es la que de verdad acota lo que se puede pedir.
    const first = repsPart.split('-')[0].trim();
    const n = Number.parseInt(first, 10);
    return Number.isFinite(n) && n >= 1 && n <= MAX_TRACKED_REPS ? n : null;
}
