import { useEffect, useRef } from 'react';
import { athletesService } from '../services/athletesService';
import { useUser, type UserProfile } from '../hooks/useUser';

/**
 * Reclama la ficha que el entrenador había creado, la primera vez que su
 * dueño entra de verdad.
 *
 * QUÉ ESTÁ PASANDO AQUÍ
 *
 * Un atleta gestionado ya tenía cuenta antes de entrar: la creó su
 * entrenador, sin contraseña y sin poder iniciar sesión. Cuando esa persona
 * abre el enlace de acceso, entra EN ESA MISMA CUENTA — no en una nueva—, así
 * que su historial, sus bloques y sus marcas ya están dentro. No hay nada que
 * fusionar y ningún identificador que se mueva, que es justo el motivo por el
 * que el modelo se diseñó así.
 *
 * Lo único que falta es dejar constancia de que la cuenta ya es suya, y eso
 * tiene una consecuencia concreta: a partir de este momento su entrenador
 * deja de poder editarle el perfil (ver la política `coach_updates_managed_profile`
 * en database/athlete_lifecycle.sql).
 *
 * POR QUÉ AQUÍ Y NO EN EL ENLACE DE ACCESO
 *
 * Porque el enlace puede abrirse en otro navegador, caducar a medias o
 * perderse por el camino, y porque a la ficha también se puede llegar
 * poniendo una contraseña más adelante. Colgarlo de "hay sesión y la cuenta
 * todavía figura como gestionada" cubre todos esos caminos con una sola
 * condición.
 *
 * Se ejecuta una vez por sesión y solo si hace falta: para el 99% de los
 * usuarios —que se registraron ellos mismos— esta condición nunca se cumple
 * y no se llama a nada.
 */
export function useClaimManagedProfile(user: UserProfile | null | undefined): void {
    const { refetch } = useUser();
    const done = useRef(false);

    useEffect(() => {
        if (!user || done.current) return;
        if (user.account_status !== 'managed' && user.account_status !== 'invited') return;

        done.current = true;
        athletesService
            .claimOwnProfile()
            .then(claimed => {
                // Solo se refresca si de verdad ha cambiado algo: un refetch
                // en vacío vuelve a pedir el perfil y sus dos consultas de
                // entrenador en cada arranque de sesión.
                if (claimed) void refetch();
            })
            .catch(err => {
                // Que esto falle no puede dejar al atleta fuera: ya tiene
                // sesión y puede entrenar. Se reintentará al recargar.
                console.error('No se pudo marcar la ficha como reclamada:', err);
                done.current = false;
            });
    }, [user, refetch]);
}
