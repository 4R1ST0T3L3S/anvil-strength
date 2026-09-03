import { useQuery, useQueryClient } from '@tanstack/react-query';
import { prefsService } from '../services/prefsService';
import { resolveCoachPrefs, DEFAULT_COACH_PREFS, type CoachPrefs } from '../lib/prefs/contract';

/**
 * Preferencias de un entrenador, con cache de react-query: la pantalla de
 * ajustes y cualquier otra que las lea (la ficha del atleta, el registro del
 * propio atleta) comparten la misma consulta en vez de repetirla.
 *
 * Sin `coachId` (mientras `useUser` todavía no ha resuelto quién es, o para
 * un atleta sin entrenador) devuelve los valores por defecto: es el mismo
 * comportamiento que tiene hoy la app sin este sistema.
 */
export function useCoachPrefs(coachId: string | null | undefined) {
    const query = useQuery({
        queryKey: ['coach-prefs', coachId],
        queryFn: () => prefsService.getCoachPrefs(coachId as string),
        enabled: !!coachId,
        staleTime: 5 * 60 * 1000,
    });

    return {
        prefs: query.data ?? DEFAULT_COACH_PREFS,
        loading: query.isLoading,
        refetch: query.refetch,
    };
}

/** Para guardar y refrescar la cache desde la pantalla de ajustes. */
export function useSaveCoachPrefs(coachId: string | null | undefined) {
    const queryClient = useQueryClient();

    return async (prefs: CoachPrefs) => {
        if (!coachId) return;
        await prefsService.saveCoachPrefs(coachId, prefs);
        queryClient.setQueryData(['coach-prefs', coachId], resolveCoachPrefs(prefs));
    };
}
