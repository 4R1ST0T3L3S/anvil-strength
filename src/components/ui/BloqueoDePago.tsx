import { CreditCard, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import type { ResultadoPuerta } from '../../lib/billing';

/**
 * ANVIL STRENGTH — LO QUE VE EL ATLETA CUANDO LA PUERTA ESTÁ CERRADA
 * =====================================================================
 *
 * K5 lo pide con tres condiciones, y las tres son el componente entero:
 *
 *   1. **Evidente.** No un mensaje pequeño en una esquina: ocupa la vista que
 *      se ha bloqueado, para que no haya duda de por qué no está el contenido.
 *   2. **Con la información completa.** Qué pasa y HASTA CUÁNDO estaba
 *      pagado. "No tienes acceso" a secas obliga a preguntar lo básico.
 *   3. **Con salida.** Un botón que abre el chat con su entrenador. Nunca un
 *      "contacta con tu entrenador" sin camino: si le has cortado el servicio,
 *      lo mínimo es dejarle el camino de vuelta a un clic.
 *
 *
 * POR QUÉ EL CHAT NO SE PUEDE BLOQUEAR NUNCA
 *
 * Porque es la salida de esta pantalla. Un atleta sin chat y sin acceso no
 * tiene forma de preguntar cómo pagar, y eso convierte un recordatorio de
 * cobro en un callejón sin salida. Por eso el chat ni siquiera aparece en
 * `BillingBlocks`: no es una opción que se pueda desmarcar por error.
 *
 *
 * EL TONO
 *
 * Ámbar y no rojo. Esto no es un error ni una infracción: es un cobro
 * pendiente, y la mayoría de las veces será un despiste de tres días. Pintarlo
 * en rojo de alarma trata como culpable a alguien que probablemente solo se ha
 * liado con la fecha.
 */

export interface BloqueoDePagoProps {
    resultado: ResultadoPuerta;
    /** Qué se ha bloqueado, para nombrarlo: "tu entrenamiento", "tu plan". */
    queSeHaBloqueado: string;
    className?: string;
}

export function BloqueoDePago({ resultado, queSeHaBloqueado, className }: BloqueoDePagoProps) {
    const navigate = useNavigate();

    return (
        <div
            role="status"
            className={`flex min-h-[60dvh] flex-col items-center justify-center px-6 py-12 text-center ${className ?? ''}`}
        >
            <div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-card bg-[var(--warning-quiet)] text-warning"
                aria-hidden="true"
            >
                <CreditCard className="h-6 w-6" />
            </div>

            <h2 className="text-t-xl font-bold text-ink">
                {queSeHaBloqueado} está en pausa
            </h2>

            <p className="mt-2 max-w-[46ch] text-t-sm text-ink-muted">
                {resultado.motivo}
            </p>

            <p className="mt-1 max-w-[46ch] text-t-sm text-ink-subtle">
                En cuanto tu entrenador registre el pago vuelve solo, sin tener que
                cerrar sesión ni recargar nada.
            </p>

            <div className="mt-7 flex flex-col items-center gap-3">
                <Button
                    variant="primary"
                    size="lg"
                    icon={<MessageCircle className="h-5 w-5" />}
                    onClick={() => navigate('/dashboard/chat')}
                >
                    Hablar con mi entrenador
                </Button>

                {/* El resto del panel sigue abierto y conviene decirlo: quien
                    llega aquí no sabe si ha perdido la aplicación entera. */}
                <p className="max-w-[42ch] text-t-xs text-ink-faint">
                    Tu perfil, tus competiciones y el resto del club siguen abiertos.
                </p>
            </div>
        </div>
    );
}

/**
 * La franja de aviso, para cuando la puerta está en modo `warn`.
 *
 * NO bloquea nada: informa. Es lo que se ve durante la semana de despliegue
 * en dos tiempos que exige K1, y también lo que ve alguien cuyo entrenador
 * prefiere avisar y no cortar.
 *
 * Va arriba del contenido, no encima: el atleta tiene que poder seguir
 * entrenando mientras lo lee.
 */
export function AvisoDePago({ resultado }: { resultado: ResultadoPuerta }) {
    const navigate = useNavigate();

    if (resultado.alCorriente) return null;

    return (
        <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-[var(--warning-quiet)] bg-[var(--warning-quiet)] px-4 py-3"
        >
            <CreditCard className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-t-sm text-ink-muted">
                <span className="font-semibold text-ink">Pago pendiente.</span>{' '}
                {resultado.motivo}
            </p>
            <button
                type="button"
                onClick={() => navigate('/dashboard/chat')}
                className="min-h-[44px] shrink-0 text-t-sm font-bold text-warning underline underline-offset-2 transition-colors duration-fast ease-snap hover:text-ink"
            >
                Hablar con mi entrenador
            </button>
        </div>
    );
}
