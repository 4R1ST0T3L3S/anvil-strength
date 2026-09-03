import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { invitesService } from '../services/invitesService';
import { useUser, type UserProfile } from '../hooks/useUser';

/**
 * Canjea la invitación que quedó pendiente al registrarse.
 *
 * POR QUÉ HACE FALTA UN HOOK GLOBAL
 *
 * El caso normal de una invitación es alguien que TODAVÍA NO TIENE CUENTA.
 * Y registrarse se lleva al usuario fuera de la página: al correo de
 * confirmación, o a Google. Cuando vuelve, aterriza en `/auth/callback` o
 * directamente en su panel — nunca en la URL de la invitación, que ya no
 * existe en ninguna parte.
 *
 * Por eso el código se guarda al abrir el enlace y se canjea aquí, en cuanto
 * aparece una sesión, mire el usuario donde mire.
 *
 * `takePending` borra el código al leerlo, así que esto no puede dispararse
 * dos veces aunque el componente se vuelva a montar.
 */
export function useRedeemPendingInvite(user: UserProfile | null | undefined): void {
    const { refetch } = useUser();
    const running = useRef(false);

    useEffect(() => {
        if (!user || running.current) return;
        if (!invitesService.peekPending()) return;

        running.current = true;
        const code = invitesService.takePending();
        if (!code) { running.current = false; return; }

        invitesService
            .redeem(code)
            .then(result => {
                if (result.ok && !result.alreadyLinked) {
                    toast.success(`Te has unido al equipo de ${result.coachName ?? 'tu entrenador'}`);
                    // El perfil acaba de cambiar de entrenador: sin refrescar,
                    // el panel seguiría enseñando el anterior o ninguno.
                    void refetch();
                } else if (!result.ok && result.problem !== 'es_tuya') {
                    // Se avisa, pero no se bloquea nada: el usuario ya tiene
                    // su cuenta creada y puede usar la app igualmente.
                    toast.error('La invitación ya no era válida. Pide una nueva a tu entrenador.');
                }
            })
            .catch(err => console.error('Error canjeando la invitación pendiente:', err))
            .finally(() => { running.current = false; });
    }, [user, refetch]);
}
