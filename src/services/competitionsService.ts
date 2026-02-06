import { supabase } from '../lib/supabase';

export interface CompetitionAssignment {
    id: string;
    athlete_id: string;
    coach_id: string;
    name: string;
    date: string;
    location?: string;
    level?: string; // Add level optional for backward compatibility
    created_at: string;
}

export const competitionsService = {
    async assignCompetition(
        competition: { name: string; date: string; location?: string; level?: string },
        athleteIds: string[],
        coachId: string
    ) {
        const payload = athleteIds.map(athleteId => ({
            athlete_id: athleteId,
            coach_id: coachId,
            name: competition.name,
            date: competition.date, // Ensure format YYYY-MM-DD
            location: competition.location,
            level: competition.level
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
    },

    async getAthleteCompetitions(athleteId: string) {
        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('date', { ascending: false }); // Future first? No, normally descending for "history", but let's grab all and filter in frontend or here. Actually plan said "future first". Let's order by date ascending and split in frontend, or fetch all. Ascending effectively puts old ones first. Let's do descending so newest/future are around? Usually closest future is top.
        // Let's just fetch all ordered by date descending (newest dates first)
        // Wait, standard for lists is usually: Upcoming (closest first), Past (newest first).
        // Let's just return all ordered by date descending for now.

        if (error) throw error;
        return data as CompetitionAssignment[];
    },

    async getCoachAssignments(coachId: string) {
        const { data, error } = await supabase
            .from('competitions')
            .select(`
                *,
                athlete:profiles!athlete_id (full_name, avatar_url)
            `)
            .eq('coach_id', coachId)
            .order('date', { ascending: true });

        if (error) throw error;
        return data; // Returns competitions with nested athlete profile
    },

    async removeAssignment(assignmentId: string) {
        const { error } = await supabase
            .from('competitions')
            .delete()
            .eq('id', assignmentId);

        if (error) throw error;
    }
};
