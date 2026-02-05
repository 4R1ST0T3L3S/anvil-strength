import { supabase } from '../lib/supabase';

export interface CompetitionAssignment {
    id: string;
    athlete_id: string;
    coach_id: string;
    name: string;
    date: string;
    location?: string;
    created_at: string;
}

export const competitionsService = {
    async assignCompetition(
        competition: { name: string; date: string; location?: string },
        athleteIds: string[],
        coachId: string
    ) {
        const payload = athleteIds.map(athleteId => ({
            athlete_id: athleteId,
            coach_id: coachId,
            name: competition.name,
            date: competition.date, // Ensure format YYYY-MM-DD
            location: competition.location
        }));

        const { data, error } = await supabase
            .from('competitions')
            .insert(payload)
            .select();

        if (error) throw error;
        return data;
    },

    async getNextCompetition(athleteId: string) {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('athlete_id', athleteId)
            .gte('date', today)
            .order('date', { ascending: true })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows found"
        return data as CompetitionAssignment | null;
    }
};
