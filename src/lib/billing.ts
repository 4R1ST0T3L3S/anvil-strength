/**
 * CONTROL DE PAGOS — EL SEMÁFORO, EN UNA SOLA FUNCIÓN.
 * =====================================================================
 *
 * Esto NO es una pasarela de cobro: es un REGISTRO. El entrenador anota que
 * ha cobrado y hasta cuándo cubre, y esta función traduce esa fecha en un
 * estado. Nada de aquí mueve dinero ni corta el acceso — decidido y
 * cerrado el 12/08/2026: el semáforo avisa, nunca bloquea. `has_access`
 * sigue siendo un interruptor manual del entrenador.
 *
 * "Pagado hasta" es el MAYOR `paid_until` de las filas de `athlete_payments`
 * del atleta — una fila por pago, nunca una que se sobrescribe. Ver
 * database/REESTRUCTURACION_2026-08.sql.
 */

export type PaymentState = 'ok' | 'soon' | 'urgent' | 'expired' | 'unset';

export interface PaymentStatus {
    state: PaymentState;
    /** Días hasta que vence. Negativo si ya venció. null si nunca ha pagado. */
    daysLeft: number | null;
    paidUntil: string | null;
}

/** Fecha local sin hora, para no perder o ganar un día por la zona horaria. */
function daysBetween(from: Date, to: Date): number {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function paymentStatus(paidUntil: string | null | undefined, today: Date = new Date()): PaymentStatus {
    if (!paidUntil) return { state: 'unset', daysLeft: null, paidUntil: null };

    const until = new Date(`${paidUntil}T00:00:00`);
    if (Number.isNaN(until.getTime())) return { state: 'unset', daysLeft: null, paidUntil: null };

    const daysLeft = daysBetween(today, until);

    let state: PaymentState;
    if (daysLeft < 0) state = 'expired';
    else if (daysLeft <= 7) state = 'urgent';
    else if (daysLeft <= 14) state = 'soon';
    else state = 'ok';

    return { state, daysLeft, paidUntil };
}

/** Texto legible para el estado, en español y sin repetir la fecha dos veces. */
export function paymentStatusLabel(status: PaymentStatus): string {
    const fecha = status.paidUntil
        ? new Date(`${status.paidUntil}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
        : null;

    switch (status.state) {
        case 'unset':
            return 'Sin pagos registrados';
        case 'expired':
            return `Venció el ${fecha}`;
        case 'urgent':
            return `Quedan ${status.daysLeft} ${status.daysLeft === 1 ? 'día' : 'días'} — renueva para no perder acceso`;
        case 'soon':
            return `Quedan ${status.daysLeft} días de suscripción`;
        case 'ok':
        default:
            return `Pagado hasta el ${fecha}`;
    }
}

/** Clases del sistema de tokens para pintar el semáforo. Sin color propio inventado. */
export const PAYMENT_STATE_STYLE: Record<PaymentState, { text: string; bg: string; border: string }> = {
    ok: { text: 'text-ink-subtle', bg: 'bg-surface-sunken', border: 'border-[var(--border-default)]' },
    soon: { text: 'text-warning', bg: 'bg-[var(--warning-quiet)]', border: 'border-warning/40' },
    urgent: { text: 'text-danger', bg: 'bg-[var(--danger-quiet)]', border: 'border-danger/40' },
    expired: { text: 'text-danger', bg: 'bg-[var(--danger-quiet)]', border: 'border-danger/40' },
    unset: { text: 'text-ink-faint', bg: 'bg-surface-sunken', border: 'border-[var(--border-subtle)]' },
};
