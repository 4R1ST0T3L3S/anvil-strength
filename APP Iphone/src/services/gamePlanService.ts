import { supabase } from '../lib/supabase';

export interface GamePlanAttempt {
    kg: string;       // se guarda como texto para permitir rangos ("232.5-235")
    rpe: string;
    velocity: string; // m/s objetivo (opcional)
    note: string;
}

export interface GamePlanWarmup {
    kg: string;
    reps: string;
}

export interface GamePlanLift {
    attempts: GamePlanAttempt[]; // siempre 3 (1º, 2º, 3º intento)
    warmups: GamePlanWarmup[];
    liftNote: string;
}

export interface GamePlanData {
    squat: GamePlanLift;
    bench: GamePlanLift;
    deadlift: GamePlanLift;
}

export interface GamePlan {
    id: string;
    coach_id: string;
    athlete_id: string;
    competition_id: string | null;
    competition_name: string | null;
    competition_date: string | null;
    plan: GamePlanData;
    notes: string | null;
    updated_at: string;
    created_at: string;
}

export const emptyLift = (): GamePlanLift => ({
    attempts: [
        { kg: '', rpe: '', velocity: '', note: '' },
        { kg: '', rpe: '', velocity: '', note: '' },
        { kg: '', rpe: '', velocity: '', note: '' },
    ],
    warmups: [],
    liftNote: ''
});

export const emptyPlan = (): GamePlanData => ({
    squat: emptyLift(),
    bench: emptyLift(),
    deadlift: emptyLift()
});

export const gamePlanService = {
    async getByCompetition(athleteId: string, competitionId: string): Promise<GamePlan | null> {
        const { data, error } = await supabase
            .from('game_plans')
            .select('*')
            .eq('athlete_id', athleteId)
            .eq('competition_id', competitionId)
            .maybeSingle();

        if (error) throw error;
        return data as GamePlan | null;
    },

    async getByAthlete(athleteId: string): Promise<GamePlan[]> {
        const { data, error } = await supabase
            .from('game_plans')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data as GamePlan[]) || [];
    },

    async save(plan: Omit<GamePlan, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<GamePlan> {
        const payload = { ...plan, updated_at: new Date().toISOString() };
        const { data, error } = await supabase
            .from('game_plans')
            .upsert(payload)
            .select()
            .single();

        if (error) throw error;
        return data as GamePlan;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('game_plans').delete().eq('id', id);
        if (error) throw error;
    }
};
