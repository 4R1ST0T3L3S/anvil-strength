import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { permissionsService } from '../services/permissionsService';
import { setCapacidadesConfiguradas } from '../lib/roles';
import { CLAVES } from '../lib/queryKeys';
import type { UserProfile } from './useUser';

/**
 * CARGA UNA VEZ POR SESIÓN LA CONFIGURACIÓN DE `role_capabilities`.
 *
 * `puede()` (lib/roles.ts) es síncrona y se llama desde dentro de renders
 * por toda la aplicación; convertirla en asíncrona habría obligado a tocar
 * cada uno de esos sitios. En su lugar, este hook —montado una vez en
 * `App.tsx`, igual que `useRedeemPendingInvite` o `useClaimManagedProfile`—
 * pide la tabla y escribe el resultado en la variable de módulo que
 * `puede()` ya sabe leer.
 *
 * Sin sesión no se pide nada: no tiene sentido, y la política de la tabla
 * exige `authenticated`.
 *
 * Sin la migración `database/PERMISOS_2026-08-30.sql` ejecutada,
 * `permissionsService.list()` devuelve `null` y aquí se traduce a "sin
 * configuración" — `puede()` sigue con el mapa fijo de siempre, así que
 * ningún panel se entera de que la tabla no existe.
 */
export function useCapabilityConfig(user: UserProfile | null | undefined): void {
    const queryClient = useQueryClient();

    const { data } = useQuery({
        queryKey: CLAVES.permisosPorRol.raiz,
        queryFn: () => permissionsService.list(),
        enabled: !!user,
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        setCapacidadesConfiguradas(data ?? null);
    }, [data]);

    // Al cerrar sesión se saca de caché: la próxima sesión (quizás de otra
    // persona, en el mismo dispositivo) no debe heredar esta configuración
    // ni un instante. Al quitarla, `data` vuelve a `undefined` y el efecto
    // de arriba resuelve solo a `null` — el mapa fijo de siempre.
    useEffect(() => {
        if (!user) queryClient.removeQueries({ queryKey: CLAVES.permisosPorRol.raiz });
    }, [user, queryClient]);
}
