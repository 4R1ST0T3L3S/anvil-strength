import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { prefsService } from '../services/prefsService';
import { resolveAthletePrefs, type AthletePrefs } from '../lib/prefs/contract';

/**
 * PREFERENCIAS EFECTIVAS DEL ATLETA.
 * =====================================================================
 * Su propio override (`profiles.athlete_prefs`) sobre lo que su entrenador
 * tenga fijado como valor por defecto (`coach.coach_prefs.defaultUnit` /
 * `defaultFirstWeekday`). Sin entrenador, o sin prefs guardadas, cae en
 * `DEFAULT_COACH_PREFS` — el mismo comportamiento de siempre (kg, lunes).
 *
 * Una sola consulta: pide el atleta y el `coach_id` de su relación activa a
 * la vez, y de ahí las prefs del coach. Evita el problema de N+1 que tendría
 * encadenar `useCoachPrefs` después de resolver a quién pertenece.
 */
export function useAthletePrefs(athleteId: string | null | undefined) {
    const query = useQuery({
        queryKey: ['athlete-prefs', athleteId],
        queryFn: async () => {
            const { data: athlete, error } = await supabase
                .from('profiles')
                .select('athlete_prefs, coach_id')
                .eq('id', athleteId as string)
                .single();

            if (error || !athlete) {
                return resolveAthletePrefs(null, null);
            }

            // `getCoachPrefs` ya devuelve el objeto RESUELTO (con valores por
            // defecto rellenos), así que no hace falta pasarlo por
            // `resolveCoachPrefs` otra vez.
            const coachPrefs = athlete.coach_id
                ? await prefsService.getCoachPrefs(athlete.coach_id).catch(() => null)
                : null;

            return resolveAthletePrefs(athlete.athlete_prefs as AthletePrefs | null, coachPrefs);
        },
        enabled: !!athleteId,
        staleTime: 5 * 60 * 1000,
    });

    return {
        prefs: query.data ?? resolveAthletePrefs(null, null),
        loading: query.isLoading,
    };
}

export function useSaveAthletePrefs(athleteId: string | null | undefined) {
    const queryClient = useQueryClient();

    return async (prefs: AthletePrefs) => {
        if (!athleteId) return;
        await prefsService.saveAthletePrefs(athleteId, prefs);
        queryClient.invalidateQueries({ queryKey: ['athlete-prefs', athleteId] });
    };
}
