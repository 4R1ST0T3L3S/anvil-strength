import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

export interface RosterAthlete {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    weight_category: string | null;
    age_category: string | null;
    total: number;
}

/**
 * Lista ligera de los atletas activos de un entrenador, ordenada por
 * nombre — solo lo que hace falta para navegar entre fichas, no la lista
 * completa con adherencia y bloques que usa CoachAthletes.tsx.
 *
 * Con cache de react-query: el desplegable de la ficha de un atleta y la
 * lista de la pestaña "Atletas" acaban pidiendo lo mismo (relaciones
 * `coach_athletes` activas + `profiles`), así que comparten resultado en
 * vez de repetir la consulta cada vez que se abre el desplegable.
 */
export function useCoachAthleteRoster(coachId: string | null | undefined) {
    const query = useQuery({
        queryKey: ['coach-athlete-roster', coachId],
        queryFn: async (): Promise<RosterAthlete[]> => {
            const { data: links, error: linksError } = await supabase
                .from('coach_athletes')
                .select('athlete_id')
                .eq('coach_id', coachId as string)
                .eq('status', 'active');

            if (linksError) throw linksError;
            const athleteIds = (links ?? []).map(l => l.athlete_id as string);
            if (athleteIds.length === 0) return [];

            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, weight_category, age_category, squat_pr, bench_pr, deadlift_pr')
                .in('id', athleteIds)
                .order('full_name', { ascending: true });

            if (profilesError) throw profilesError;

            return (profiles ?? []).map(p => ({
                id: p.id,
                full_name: p.full_name,
                avatar_url: p.avatar_url,
                weight_category: p.weight_category,
                age_category: p.age_category,
                total: (p.squat_pr || 0) + (p.bench_pr || 0) + (p.deadlift_pr || 0),
            }));
        },
        enabled: !!coachId,
        staleTime: 60 * 1000,
    });

    return {
        athletes: query.data ?? [],
        loading: query.isLoading,
    };
}
