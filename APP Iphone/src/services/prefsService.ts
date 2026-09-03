import { supabase } from '../lib/supabase';
import { resolveCoachPrefs, type CoachPrefs, type AthletePrefs } from '../lib/prefs/contract';

export const prefsService = {
    /** Preferencias del entrenador, ya resueltas con los valores por defecto. */
    async getCoachPrefs(coachId: string): Promise<CoachPrefs> {
        const { data, error } = await supabase
            .from('profiles')
            .select('coach_prefs')
            .eq('id', coachId)
            .single();

        if (error || !data) return resolveCoachPrefs(null);
        return resolveCoachPrefs(data.coach_prefs);
    },

    async saveCoachPrefs(coachId: string, prefs: CoachPrefs): Promise<void> {
        const { error } = await supabase
            .from('profiles')
            .update({ coach_prefs: prefs })
            .eq('id', coachId);

        if (error) throw error;
    },

    /** Override crudo del atleta (sin resolver: eso lo hace `resolveAthletePrefs`). */
    async getAthletePrefs(athleteId: string): Promise<AthletePrefs | null> {
        const { data, error } = await supabase
            .from('profiles')
            .select('athlete_prefs')
            .eq('id', athleteId)
            .single();

        if (error || !data) return null;
        return (data.athlete_prefs as AthletePrefs) ?? null;
    },

    async saveAthletePrefs(athleteId: string, prefs: AthletePrefs): Promise<void> {
        const { error } = await supabase
            .from('profiles')
            .update({ athlete_prefs: prefs })
            .eq('id', athleteId);

        if (error) throw error;
    },
};
