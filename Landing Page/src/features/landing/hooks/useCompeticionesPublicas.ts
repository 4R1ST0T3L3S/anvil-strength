import { useQuery } from '@tanstack/react-query';
import { competitionsService } from '../../../services/competitionsService';
import { agruparCompeticiones, type FilaPublica } from '../lib/competiciones';

/**
 * Las próximas competiciones del equipo, agrupadas con sus convocados.
 *
 * Una sola clave de caché para la portada (que enseña la siguiente) y para
 * /competiciones (que las enseña todas): quien entra por la portada y pulsa
 * "Ver convocatoria" llega a una página que ya tiene los datos.
 */
export function useCompeticionesPublicas() {
    return useQuery({
        queryKey: ['competiciones-publicas'],
        queryFn: async () => agruparCompeticiones((await competitionsService.getPublicCompetitions()) as FilaPublica[]),
        staleTime: 5 * 60 * 1000,
    });
}
