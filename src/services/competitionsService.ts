import { supabase } from '../lib/supabase';

export interface CompetitionAssignment {
    id: string;
    athlete_id: string;
    coach_id: string;
    name: string;
    date: string;
    end_date?: string; // Add end_date
    location?: string;
    level?: string; // Add level optional for backward compatibility
    description?: string;
    created_at: string;
}

export const competitionsService = {
    async assignCompetition(
        competition: { name: string; date: string; end_date?: string; location?: string; level?: string; description?: string },
        athleteIds: string[],
        coachId: string
    ) {
        const payload = athleteIds.map(athleteId => ({
            athlete_id: athleteId,
            coach_id: coachId,
            name: competition.name,
            date: competition.date, // Ensure format YYYY-MM-DD
            end_date: competition.end_date, // Pass end_date (can be null)
            location: competition.location,
            level: competition.level,
            description: competition.description || null
        }));

        const { data, error } = await supabase
            .from('competitions')
            .insert(payload)
            .select();

        if (error) throw error;
        return data;
    },

    async addSelfCompetition(
        athleteId: string,
        competition: { name: string; date: string; end_date?: string; location?: string; level?: string }
    ) {
        const payload = {
            athlete_id: athleteId,
            coach_id: null, // Self-assigned
            name: competition.name,
            date: competition.date,
            end_date: competition.end_date,
            location: competition.location,
            level: competition.level
        };

        const { data, error } = await supabase
            .from('competitions')
            .insert(payload)
            .select();

        if (error) throw error;
        return data;
    },

    async getNextCompetition(athleteId: string) {
        const today = new Date().toISOString().split('T')[0];

        // Optimized: filter in DB and get only 1 result
        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('athlete_id', athleteId)
            .or(`date.gte.${today},end_date.gte.${today}`)
            .order('date', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
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
    },

    /**
     * Competiciones para la página pública.
     *
     * Se pide el perfil del atleta incrustado para poner su nombre junto a
     * cada competición. Ese `embed` es la parte frágil: `profiles` no es
     * legible sin sesión, y cuando el permiso falta PostgREST no devuelve la
     * competición sin nombre — devuelve 401 y se cae la consulta ENTERA, así
     * que la página se quedaba vacía para cualquier visitante.
     *
     * Por eso hay un segundo intento sin el `embed`. Enseñar las
     * competiciones sin el nombre del atleta es infinitamente mejor que no
     * enseñar ninguna, y así la página aguanta aunque la base todavía no
     * tenga aplicado database/FIX_INCONSISTENCIAS.sql.
     */
    async getPublicCompetitions() {
        const today = new Date().toISOString().split('T')[0];
        const range = `date.gte.${today},end_date.gte.${today}`; // futura o en curso

        const { data, error } = await supabase
            .from('competitions')
            .select(`
                *,
                athlete:profiles!athlete_id (full_name, avatar_url)
            `)
            .or(range)
            .order('date', { ascending: true });

        if (!error) return data;

        // 42501 = permission denied. Cualquier otro error sí es un fallo real.
        if (error.code !== '42501') {
            console.error(
                'Error al leer las competiciones:',
                `${error.code ?? 'sin código'} — ${error.message}`
            );
            throw error;
        }

        console.warn(
            'Sin permiso para leer los perfiles de los atletas: se muestran las ' +
            'competiciones sin nombre. Ejecuta database/FIX_INCONSISTENCIAS.sql.'
        );

        const { data: plain, error: plainError } = await supabase
            .from('competitions')
            .select('*')
            .or(range)
            .order('date', { ascending: true });

        if (plainError) throw plainError;
        return plain;
    }
};
