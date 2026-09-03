import { supabase } from '../lib/supabase';
import { exerciseKey } from '../lib/planning/blockAnalytics';

/**
 * Máximos por atleta y ejercicio.
 *
 * Es la referencia con la que se resuelve "5x5 al 85%" mientras se programa.
 * Ver database/athlete_exercise_maxes.sql.
 */

export type MaxSourceKind = 'manual' | 'competition' | 'estimated';

export interface AthleteMax {
    id: string;
    athlete_id: string;
    exercise_key: string;
    exercise_name: string;
    one_rm: number;
    source: MaxSourceKind;
    notes?: string | null;
    measured_on?: string | null;
    updated_at: string;
}

/** Máximos de un atleta, indexados por clave de ejercicio para buscarlos O(1). */
export type MaxesByExercise = Map<string, AthleteMax>;

export const maxesService = {
    async getForAthlete(athleteId: string): Promise<MaxesByExercise> {
        const { data, error } = await supabase
            .from('athlete_exercise_maxes')
            .select('*')
            .eq('athlete_id', athleteId);

        if (error) throw error;

        return new Map((data ?? []).map((m: AthleteMax) => [m.exercise_key, m]));
    },

    /**
     * Crea o actualiza el máximo de un ejercicio.
     *
     * `onConflict` sobre (athlete_id, exercise_key) porque un atleta tiene UN
     * máximo vigente por ejercicio: escribir el nuevo sustituye al anterior en
     * vez de acumular filas que después habría que ordenar por fecha.
     */
    async upsert(input: {
        athleteId: string;
        exerciseName: string;
        oneRm: number;
        source?: MaxSourceKind;
        notes?: string | null;
        measuredOn?: string | null;
    }): Promise<AthleteMax> {
        const { data, error } = await supabase
            .from('athlete_exercise_maxes')
            .upsert(
                {
                    athlete_id: input.athleteId,
                    // La misma normalización que usa la analítica, para que las
                    // dos agrupen igual y "Sentadilla" encuentre su máximo aunque
                    // se escribiera "sentadilla ".
                    exercise_key: exerciseKey(input.exerciseName),
                    exercise_name: input.exerciseName.trim(),
                    one_rm: input.oneRm,
                    source: input.source ?? 'manual',
                    notes: input.notes ?? null,
                    measured_on: input.measuredOn ?? null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'athlete_id,exercise_key' }
            )
            .select()
            .single();

        if (error) throw error;
        return data as AthleteMax;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase
            .from('athlete_exercise_maxes')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },
};

/**
 * Busca el máximo de un ejercicio, cayendo a su versión sin variante.
 *
 * "Sentadilla (pausada)" no tiene máximo propio pero sí lo tiene "Sentadilla",
 * y programar una pausada al 85% se refiere al máximo del movimiento base.
 * Sin este respaldo, cualquier variante obligaría a registrar un máximo nuevo
 * y el porcentaje no funcionaría en la mitad de los ejercicios del bloque.
 */
export function findMax(
    maxes: MaxesByExercise | null | undefined,
    exerciseName: string | null | undefined
): AthleteMax | null {
    if (!maxes || !exerciseName) return null;

    const exact = maxes.get(exerciseKey(exerciseName));
    if (exact) return exact;

    // Quita lo que va entre paréntesis: "Sentadilla (pausada)" -> "Sentadilla"
    const base = exerciseName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (base && base !== exerciseName) {
        const hit = maxes.get(exerciseKey(base));
        if (hit) return hit;
    }

    return null;
}
