import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { competitionsService } from '../../../services/competitionsService';
import { useClubWeb } from '../../../services/clubWebService';
import { agruparCompeticiones, type FilaPublica } from '../lib/competiciones';

/**
 * Las próximas competiciones del equipo, agrupadas con sus convocados.
 *
 * Una sola clave de caché para la portada (que enseña la siguiente) y para
 * /competiciones (que las enseña todas). La ficha de cada convocado (foto,
 * categoría, marcas) sale de los atletas de la web, que se editan en
 * /admin/web: por eso se agrupa fuera de la consulta.
 */
export function useCompeticionesPublicas() {
    const { athletes } = useClubWeb();
    const consulta = useQuery({
        queryKey: ['competiciones-publicas'],
        queryFn: async () => (await competitionsService.getPublicCompetitions()) as FilaPublica[],
        staleTime: 5 * 60 * 1000,
    });
    const data = useMemo(() => (consulta.data ? agruparCompeticiones(consulta.data, athletes) : undefined), [consulta.data, athletes]);
    return { ...consulta, data };
}
