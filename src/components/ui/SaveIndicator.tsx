import { AnimatePresence, motion } from 'framer-motion';
import { CloudOff, RefreshCw, Check } from 'lucide-react';
import { useWriteQueue } from '../../hooks/useWriteQueue';
import { DURATION, EASE_OUT, prefersReducedMotion } from '../../lib/motion';

/**
 * Estado del guardado, en una sola línea.
 *
 * CRITERIO: el silencio ES el estado bueno. Un indicador que dice "guardado"
 * después de cada tecla se convierte en ruido y deja de leerse, que es lo
 * peor que le puede pasar a un aviso. Así que:
 *
 *   - Todo bien y nada pendiente  → no se pinta nada.
 *   - Acaba de guardarse          → un "guardado" que se va solo a los 2s.
 *   - Hay cambios sin subir       → se queda visible hasta que suban.
 *   - Sin conexión                → se queda, y dice que no se ha perdido nada.
 *
 * El caso de "sin conexión" es el único que merece color de alerta, y aun
 * así el mensaje tranquiliza en vez de asustar: el dato está guardado en el
 * dispositivo, lo único que falta es que salga.
 */
export function SaveIndicator({ className = '' }: { className?: string }) {
    const { status, pending, justSaved, retry } = useWriteQueue();

    const visible = status !== 'idle' || justSaved;
    const reduced = prefersReducedMotion();

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: DURATION.fast, ease: EASE_OUT }}
                    className={`flex items-center gap-1.5 text-t-2xs font-bold ${className}`}
                    role="status"
                    aria-live="polite"
                >
                    {status === 'offline' || status === 'error' ? (
                        <>
                            <CloudOff size={13} className="shrink-0 text-warning" aria-hidden="true" />
                            <span className="text-warning">
                                Sin conexión · {pending} {pending === 1 ? 'cambio' : 'cambios'} guardado
                                {pending === 1 ? '' : 's'} en el móvil
                            </span>
                            <button
                                onClick={retry}
                                className="rounded-chip px-1.5 py-0.5 text-warning underline underline-offset-2 transition-colors duration-fast hover:bg-[var(--warning-quiet)]"
                            >
                                Reintentar
                            </button>
                        </>
                    ) : status === 'saving' || status === 'pending' ? (
                        <>
                            <RefreshCw
                                size={13}
                                className={`shrink-0 text-ink-subtle ${reduced ? '' : 'animate-spin'}`}
                                aria-hidden="true"
                            />
                            <span className="text-ink-subtle">Guardando…</span>
                        </>
                    ) : (
                        <>
                            <Check size={13} className="shrink-0 text-success" aria-hidden="true" />
                            <span className="text-ink-subtle">Guardado</span>
                        </>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
