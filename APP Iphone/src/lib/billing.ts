/**
 * CONTROL DE PAGOS — EL SEMÁFORO Y LA PUERTA.
 * =====================================================================
 *
 * ESTO NO ES UNA PASARELA DE COBRO: ES UN REGISTRO.
 *
 * ANVIL no cobra. No hay Stripe, no hay pasarela, no se mueve dinero. El
 * entrenador anota a mano que ha cobrado y hasta cuándo cubre, en
 * `athlete_payments` —una fila por pago, nunca una que se sobrescribe—, y
 * este fichero traduce esas fechas en un estado.
 *
 *
 * QUÉ CAMBIÓ, Y POR QUÉ SE ESCRIBE AQUÍ EN VEZ DE BORRARLO
 *
 * Hasta el 12/08/2026 este fichero decía: *"el semáforo avisa, nunca
 * bloquea"*. El 21/08/2026, la decisión **K1 lo revocó**: el registro de
 * pagos SÍ decide el acceso.
 *
 * La razón anterior no era mala —cortarle el entrenamiento a alguien por un
 * fallo de datos cuesta confianza, no tiempo— y por eso el cambio llega con
 * una condición innegociable: **se despliega en dos tiempos**. Sale con
 * `gate: 'warn'` para todo el mundo, se pasa una semana con datos reales
 * comprobando que el semáforo dice la verdad, y solo entonces alguien decide
 * pasar a `'block'`.
 *
 * `has_access` deja de ser la puerta del entrenamiento (K3). Se queda como lo
 * que de verdad es, y ahora las dos cosas tienen dos nombres:
 *
 *   · `has_access`  — la administración de ANVIL suspende la cuenta.
 *   · puerta de pago — el ENTRENADOR dice que este atleta no está al día
 *                      con él.
 *
 *
 * LA REGLA, EN UN SITIO
 *
 * `evaluarPuerta()` de más abajo es la única implementación en el cliente, y
 * es un espejo exacto de `athlete_is_current()` en la base de datos (ver
 * `database/PAGOS_2026-08-23.sql`). El servidor manda: esta copia sirve para
 * no pintar lo que la RLS no va a devolver, y un desajuste no filtra nada.
 */

import type { BillingBlocks, BillingGate } from './prefs/contract';

// =====================================================================
// EL SEMÁFORO
// =====================================================================

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
    urgent: { text: 'text-danger-text', bg: 'bg-[var(--danger-quiet)]', border: 'border-danger/40' },
    expired: { text: 'text-danger-text', bg: 'bg-[var(--danger-quiet)]', border: 'border-danger/40' },
    unset: { text: 'text-ink-faint', bg: 'bg-surface-sunken', border: 'border-[var(--border-subtle)]' },
};

// =====================================================================
// LA PUERTA
// =====================================================================

/** Estado de facturación de UNA RELACIÓN entrenador-atleta (K7). */
export type BillingMode = 'auto' | 'exempt' | 'suspended';

export interface EntradaPuerta {
    gate: BillingGate;
    /** `coach_athletes.billing_mode`. Por defecto `'auto'`. */
    modo: BillingMode;
    /** El MAYOR `paid_until` del atleta con ese entrenador. `null` = sin pagos. */
    pagadoHasta: string | null;
    /** Si el atleta tiene AL MENOS UNA fila de pago. Distinto de `pagadoHasta`. */
    tieneAlgunPago: boolean;
    graceDays: number;
}

export interface ResultadoPuerta {
    /** ¿Está al corriente? Con `gate: 'warn'` esto es informativo. */
    alCorriente: boolean;
    /** ¿Hay que CORTARLE algo de verdad? Solo con `gate: 'block'`. */
    bloquea: boolean;
    /** Por qué, en una frase, para poder enseñarlo. */
    motivo: string;
    /** Día a partir del cual se cierra la puerta. `null` si no aplica. */
    cierraEl: string | null;
}

/**
 * LA REGLA. Espejo de `athlete_is_current()` en la base de datos.
 *
 *     gate = 'off'                       → al corriente
 *     modo = 'exempt'                    → al corriente
 *     modo = 'suspended'                 → NO
 *     sin ninguna fila de pago           → al corriente          (K7)
 *     MAX(paid_until) + graceDays >= hoy → al corriente          (K3, K6)
 *     en cualquier otro caso             → NO
 *
 * EL ORDEN IMPORTA, y la línea de K7 es la que evita el desastre del día del
 * despliegue: hoy NINGÚN atleta tiene pagos registrados, así que con la regla
 * contraria se bloquearían todos a la vez.
 */
export function evaluarPuerta(e: EntradaPuerta, hoy: Date = new Date()): ResultadoPuerta {
    const alCorriente = (motivo: string): ResultadoPuerta =>
        ({ alCorriente: true, bloquea: false, motivo, cierraEl: null });

    if (e.gate === 'off') {
        return alCorriente('La puerta de pago está desactivada.');
    }

    if (e.modo === 'exempt') {
        return alCorriente('Este atleta está exento de pago.');
    }

    if (e.modo === 'suspended') {
        return {
            alCorriente: false,
            bloquea: e.gate === 'block',
            motivo: 'Su entrenador ha suspendido el acceso.',
            cierraEl: null,
        };
    }

    // K7. Sin ninguna fila de pago no se bloquea: el entrenador todavía no ha
    // empezado a llevar la cuenta de este atleta.
    if (!e.tieneAlgunPago) {
        return alCorriente('Todavía no hay pagos registrados para este atleta.');
    }

    if (!e.pagadoHasta) {
        // Hay filas pero ninguna con fecha: un dato incompleto no puede cortar
        // el acceso de nadie.
        return alCorriente('Hay pagos registrados, pero ninguno con fecha de cobertura.');
    }

    const hasta = new Date(`${e.pagadoHasta}T00:00:00`);
    if (Number.isNaN(hasta.getTime())) {
        return alCorriente('La fecha del último pago no es válida.');
    }

    // K6. La cortesía se suma a la fecha de cobertura.
    const cierre = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() + e.graceDays);
    const cierraEl = `${cierre.getFullYear()}-${String(cierre.getMonth() + 1).padStart(2, '0')}-${String(cierre.getDate()).padStart(2, '0')}`;

    const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (hoySinHora.getTime() <= cierre.getTime()) {
        return { alCorriente: true, bloquea: false, motivo: 'Al corriente de pago.', cierraEl };
    }

    const fecha = hasta.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    return {
        alCorriente: false,
        bloquea: e.gate === 'block',
        motivo: `Tu suscripción cubría hasta el ${fecha}.`,
        cierraEl,
    };
}

/**
 * ¿Se corta ESTA vista?
 *
 * Separado de `evaluarPuerta` a propósito: una cosa es estar al día y otra
 * qué se corta cuando no lo estás. El chat NO está en `BillingBlocks` y no se
 * puede añadir por error, porque el tipo no lo admite — si le cortas el chat,
 * el atleta no puede ni preguntar cómo pagar (K5).
 */
export function vistaBloqueada(
    vista: keyof BillingBlocks,
    resultado: ResultadoPuerta,
    blocks: BillingBlocks
): boolean {
    return resultado.bloquea && blocks[vista] === true;
}
