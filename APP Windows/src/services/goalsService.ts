import { supabase } from '../lib/supabase';
import { exerciseKey } from '../lib/planning/blockAnalytics';
import type { GoalMetric, TrainingGoal } from '../lib/planning/goals';

export interface NewGoalInput {
    coachId: string;
    athleteId: string;
    blockId?: string | null;
    macroId?: string | null;
    exerciseName: string;
    sets: number;
    reps: number;
    metric: GoalMetric;
    value: number;
    notes?: string | null;
}

function explicaError(err: unknown): Error {
    const raw = (err as { message?: string })?.message ?? '';
    if (raw.includes('does not exist') || raw.includes('schema cache') || /training_goals/i.test(raw)) {
        return new Error(
            'Los objetivos todavía no están activados en la base de datos. ' +
            'Ejecuta database/OBJETIVOS_2026-08-30.sql en Supabase.'
        );
    }
    if (raw.includes('row-level security') || raw.includes('violates row-level')) {
        return new Error('El servidor ha rechazado el cambio por permisos. ¿Sigues siendo el entrenador de este atleta?');
    }
    if (raw.includes('violates check constraint')) {
        return new Error('Un objetivo no puede atarse a un bloque Y a un macro a la vez, ni tener valores fuera de rango.');
    }
    return err instanceof Error ? err : new Error(raw || 'error desconocido');
}

export const goalsService = {
    /** Los objetivos de un atleta. `scope` filtra a un bloque o un macro; sin él, todos. */
    async listForAthlete(athleteId: string, scope?: { blockId?: string; macroId?: string }): Promise<TrainingGoal[]> {
        let query = supabase
            .from('training_goals')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('created_at', { ascending: false });

        if (scope?.blockId) query = query.eq('block_id', scope.blockId);
        if (scope?.macroId) query = query.eq('macro_id', scope.macroId);

        const { data, error } = await query;
        if (error) {
            if (error.code === 'PGRST205' || /does not exist|schema cache/.test(error.message)) return [];
            throw explicaError(error);
        }
        return (data ?? []) as TrainingGoal[];
    },

    async create(input: NewGoalInput): Promise<TrainingGoal> {
        const { data, error } = await supabase
            .from('training_goals')
            .insert({
                coach_id: input.coachId,
                athlete_id: input.athleteId,
                block_id: input.blockId ?? null,
                macro_id: input.macroId ?? null,
                exercise_key: exerciseKey(input.exerciseName),
                exercise_name: input.exerciseName.trim(),
                sets: input.sets,
                reps: input.reps,
                metric: input.metric,
                value: input.value,
                notes: input.notes ?? null,
            })
            .select()
            .single();

        if (error) throw explicaError(error);
        return data as TrainingGoal;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('training_goals').delete().eq('id', id);
        if (error) throw explicaError(error);
    },

    /**
     * Lo llama la propia pantalla al enseñar la comparación —ver
     * `goalIsAchieved()` en lib/planning/goals.ts—, nunca el coach a mano
     * (decisión F5). Solo escribe si todavía estaba pendiente: una vez
     * cumplido, la fecha no se mueve aunque una semana peor haga que la
     * comparación ya no lo cumpla — cumplir un objetivo no se deshace por
     * una sesión floja tres semanas después.
     */
    async markAchievedIfPending(id: string, achievedAt: string): Promise<void> {
        const { error } = await supabase
            .from('training_goals')
            .update({ achieved_at: achievedAt })
            .eq('id', id)
            .is('achieved_at', null);
        if (error) throw explicaError(error);
    },
};
