import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { paymentsService } from '../../../services/paymentsService';
import { paymentStatus, paymentStatusLabel, PAYMENT_STATE_STYLE } from '../../../lib/billing';
import { Button } from '../../../components/ui/Button';
import { CLAVES } from '../../../lib/queryKeys';
import { billingModeQueryKey, fetchBillingMode, setBillingMode } from '../hooks/useCoachRoster';
import type { BillingMode } from '../../../lib/billing';
import { Skeleton } from '../../../components/ui/Skeleton';

/**
 * Los tres estados de facturación de una relación (K7), con su explicación.
 *
 * La ayuda no es decorativa: sin ella, «automático» y «exento» se parecen mucho
 * cuando el atleta no tiene ningún pago registrado —los dos dejan pasar— y la
 * diferencia solo se ve el día que se registra el primero.
 */
const MODOS: { modo: BillingMode; etiqueta: string; ayuda: string }[] = [
    {
        modo: 'auto',
        etiqueta: 'Automático',
        ayuda: 'Manda el último pago registrado. Mientras no haya ninguno, no se le bloquea nada.',
    },
    {
        modo: 'exempt',
        etiqueta: 'Exento',
        ayuda: 'Nunca se le bloquea, aunque no pague. Para familia, intercambios y cuentas de prueba.',
    },
    {
        modo: 'suspended',
        etiqueta: 'Suspendido',
        ayuda: 'Se le bloquea siempre, haya pagos o no. Es el «este no paga y lo digo yo».',
    },
];

/**
 * CONTROL DE PAGOS.
 * =====================================================================
 * Un REGISTRO, no una pasarela: el entrenador anota que ha cobrado y hasta
 * cuándo cubre, y `paymentStatus()` traduce eso en el semáforo que también
 * ve el atleta.
 *
 * ESTE COMENTARIO DECÍA «nunca corta el acceso — decidido y cerrado». Dejó de
 * ser cierto el 21/08/2026: la decisión K1 lo revocó y el registro de pagos SÍ
 * decide el acceso al entrenamiento, al VBT y a la nutrición. Se reescribe en
 * vez de borrarse para que el cambio quede donde estaba la razón anterior.
 *
 * Lo que sigue siendo verdad, y era lo que aquella decisión protegía: ANVIL
 * NO COBRA. No hay pasarela y no se mueve dinero. Y la puerta sale de fábrica
 * en modo AVISO, no en modo bloqueo — ver `BillingGate` en lib/prefs.
 */
export function PaymentPanel({ athleteId, coachId }: { athleteId: string; coachId: string }) {
    const queryClient = useQueryClient();
    const [adding, setAdding] = useState(false);
    const [paidUntil, setPaidUntil] = useState('');
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const { data: modoActual = 'auto' } = useQuery({
        queryKey: billingModeQueryKey(coachId, athleteId),
        queryFn: () => fetchBillingMode(coachId, athleteId),
    });
    const [guardandoModo, setGuardandoModo] = useState(false);

    const cambiarModo = async (modo: BillingMode) => {
        if (modo === modoActual) return;
        setGuardandoModo(true);
        try {
            await setBillingMode(coachId, athleteId, modo);
            queryClient.setQueryData(billingModeQueryKey(coachId, athleteId), modo);
            toast.success('Estado de facturación actualizado');
        } catch (err) {
            console.error(err);
            toast.error('No se pudo cambiar el estado. Ejecuta database/PAGOS_2026-08-23.sql en Supabase.');
        } finally {
            setGuardandoModo(false);
        }
    };

    const { data: history = [], isPending: loading } = useQuery({
        queryKey: CLAVES.pagos.deAtleta(athleteId),
        queryFn: () => paymentsService.getHistory(athleteId),
    });

    /** Tras registrar o borrar un pago. El semaforo de arriba se recalcula solo. */
    const load = () => {
        queryClient.invalidateQueries({ queryKey: CLAVES.pagos.deAtleta(athleteId) });
    };

    const status = paymentStatus(history[0]?.paid_until ?? null);
    const style = PAYMENT_STATE_STYLE[status.state];

    const handleAdd = async () => {
        if (!paidUntil) {
            toast.error('Indica hasta cuándo cubre el pago');
            return;
        }
        setSaving(true);
        try {
            await paymentsService.registerPayment({
                athleteId, coachId, paidUntil,
                amount: amount ? Number(amount) : null,
                note: note.trim() || null,
            });
            toast.success('Pago registrado');
            setAdding(false);
            setPaidUntil('');
            setAmount('');
            setNote('');
            load();
        } catch (err) {
            console.error(err);
            toast.error('No se pudo registrar el pago. ¿Ejecutaste database/REESTRUCTURACION_2026-08.sql?');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await paymentsService.deletePayment(id);
            load();
        } catch (err) {
            console.error(err);
            toast.error('No se pudo eliminar el pago');
        }
    };

    return (
        <section className="space-y-4 rounded-card border border-[var(--border-default)] bg-surface-raised p-6">
            <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-t-base font-semibold text-ink">
                    <CreditCard size={16} className="text-brand-text" />
                    Pagos
                </h3>
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding(v => !v)}>
                    Registrar pago
                </Button>
            </div>

            <div className={`rounded-field border px-3.5 py-2.5 text-t-sm font-semibold ${style.bg} ${style.border} ${style.text}`}>
                {paymentStatusLabel(status)}
            </div>

            {/*
                ESTADO DE FACTURACIÓN DE ESTA RELACIÓN. Decisión K7.

                Tres opciones, y la de en medio es la que evita el desastre del
                día del despliegue: hoy NINGÚN atleta tiene pagos registrados, y
                sin la regla de «sin pagos no se bloquea» se quedarían todos
                fuera a la vez.

                «Exento» y «Suspendido» son los dos casos que la regla
                automática no puede adivinar: familia e intercambios por un
                lado, y el «este no paga y lo digo yo» por el otro.
            */}
            <div className="space-y-1.5">
                <span className="block text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">
                    Estado de facturación
                </span>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Estado de facturación">
                    {MODOS.map(({ modo, etiqueta, ayuda }) => (
                        <button
                            key={modo}
                            type="button"
                            role="radio"
                            aria-checked={modoActual === modo}
                            title={ayuda}
                            onClick={() => cambiarModo(modo)}
                            disabled={guardandoModo}
                            className={`min-h-[44px] rounded-field border px-3 text-t-xs font-bold transition-colors duration-fast ease-snap disabled:opacity-50 ${
                                modoActual === modo
                                    ? 'border-[var(--brand-line)] bg-[var(--brand-quiet)] text-brand-text'
                                    : 'border-[var(--border-default)] text-ink-muted hover:border-[var(--border-strong)] hover:text-ink'
                            }`}
                        >
                            {etiqueta}
                        </button>
                    ))}
                </div>
                <p className="text-t-xs text-ink-subtle">
                    {MODOS.find(m => m.modo === modoActual)?.ayuda}
                </p>
            </div>

            {adding && (
                <div className="space-y-3 rounded-field border border-[var(--border-default)] bg-surface-sunken p-4">
                    <div className="grid gap-3 grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">Pagado hasta</span>
                            <input
                                type="date"
                                value={paidUntil}
                                onChange={(e) => setPaidUntil(e.target.value)}
                                className="w-full rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-t-sm text-ink"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">Importe (opcional)</span>
                            <input
                                type="number"
                            inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="€"
                                className="w-full rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-t-sm text-ink"
                            />
                        </label>
                    </div>
                    <label className="block">
                        <span className="mb-1 block text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">Nota (opcional)</span>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Transferencia, Bizum..."
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-t-sm text-ink"
                        />
                    </label>
                    <Button size="sm" variant="primary" loading={saving} onClick={handleAdd}>Guardar pago</Button>
                </div>
            )}

            {/* Esqueleto con la forma de las filas de pago, no un giro:
                el historial suele tener dos o tres líneas y el hueco tiene
                que estar reservado antes de que lleguen. */}
            {loading ? (
                <div className="space-y-1.5" aria-busy="true">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                </div>
            ) : history.length > 0 && (
                <div className="space-y-1.5">
                    {history.map(p => (
                        <div key={p.id} className="flex items-center justify-between gap-3 rounded-field bg-surface-sunken px-3 py-2 text-t-sm">
                            <div className="min-w-0">
                                <span className="font-semibold text-ink">Hasta {new Date(`${p.paid_until}T00:00:00`).toLocaleDateString('es-ES')}</span>
                                {p.amount != null && <span className="ml-2 text-ink-subtle">{p.amount} {p.currency}</span>}
                                {p.note && <span className="ml-2 truncate text-ink-subtle">· {p.note}</span>}
                            </div>
                            <button onClick={() => handleDelete(p.id)} className="shrink-0 text-ink-faint hover:text-danger-text" aria-label="Eliminar pago">
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
