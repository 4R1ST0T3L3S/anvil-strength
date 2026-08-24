import { m } from 'framer-motion';
import { X } from 'lucide-react';
import type { ExtendedSession } from './types';

// ==========================================
// SUB-COMPONENT: ATHLETE PREVIEW (modo espejo)
// ==========================================
export function AthletePreview({ session, onClose }: { session: ExtendedSession; onClose: () => void }) {
    return (
        <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <m.div
                initial={{ y: 40, scale: 0.96 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 40, scale: 0.96 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-[380px] h-[80vh] bg-surface-canvas rounded-[2.5rem] border-4 border-surface-overlay shadow-2xl overflow-hidden flex flex-col"
            >
                {/* Notch decorativo */}
                <div className="shrink-0 flex justify-center pt-2 pb-1 bg-surface-canvas">
                    <div className="w-24 h-1.5 bg-black rounded-full" />
                </div>

                <div className="shrink-0 px-5 py-3 bg-surface-canvas border-b border-subtle flex items-center justify-between">
                    <div>
                        <p className="text-t-2xs font-black uppercase tracking-widest text-brand-text">Así lo verá el atleta</p>
                        <h3 className="font-black text-ink uppercase text-lg leading-tight">{session.name || `Día ${session.day_number}`}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-ink-muted hover:text-ink transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* El espejo tiene que enseñar TODO lo que ve el atleta,
                        apéndices incluidos y EN SU ORDEN: si aquí salieran en
                        otro sitio, el coach no estaría comprobando la pantalla
                        que va a ver su atleta. */}
                    <PreviewAppendix label="Consideraciones" body={session.extras} />
                    <PreviewAppendix label="Calentamiento" body={session.warmup} />

                    {session.exercises.length === 0 && !session.warmup && !session.extras ? (
                        <p className="text-center text-ink-subtle text-sm py-16 font-bold">Día vacío</p>
                    ) : (
                        session.exercises.map(ex => (
                            <div key={ex.id} className="bg-surface-canvas rounded-card overflow-hidden border border-subtle">
                                <div className="p-4 bg-surface-raised">
                                    <h4 className="font-bold text-base leading-tight text-gray-100">{ex.exercise?.name}</h4>
                                    {ex.variant_name && <p className="text-xs text-brand-text font-bold mt-0.5">{ex.variant_name}</p>}
                                    {(ex.rpe || ex.velocity_avg || ex.rest_seconds) && (
                                        <div className="flex gap-3 mt-2 text-t-2xs font-bold text-ink-subtle uppercase">
                                            {ex.rpe && <span>RPE {ex.rpe}</span>}
                                            {ex.velocity_avg && <span>Vel {ex.velocity_avg}</span>}
                                            {ex.rest_seconds ? <span>Rest {ex.rest_seconds}s</span> : null}
                                        </div>
                                    )}
                                    {ex.notes && <p className="text-xs text-ink-muted mt-2 italic">"{ex.notes}"</p>}
                                </div>
                                <div className="p-3 space-y-1.5">
                                    {ex.sets.map((set, i) => (
                                        <div key={set.id} className="flex items-center justify-between bg-black/20 rounded-lg px-3 py-2 text-sm">
                                            <span className="text-t-2xs font-black text-ink-subtle uppercase">Serie {i + 1}</span>
                                            <span className="font-bold text-ink font-mono">
                                                {set.target_reps || '—'}{set.target_load ? ` @ ${set.target_load}kg` : ''}{set.target_rpe ? ` RPE ${set.target_rpe}` : ''}
                                            </span>
                                        </div>
                                    ))}
                                    {ex.sets.length === 0 && <p className="text-t-2xs text-ink-subtle italic px-1">Sin series prescritas</p>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </m.div>
        </m.div>
    );
}

/** Calentamiento o extras dentro del espejo de la vista del atleta. */
function PreviewAppendix({ label, body }: { label: string; body?: string | null }) {
    if (!body?.trim()) return null;

    return (
        <div className="overflow-hidden rounded-card border border-subtle bg-surface-canvas">
            <div className="border-l-2 border-brand px-3.5 py-3">
                <p className="text-t-2xs font-black uppercase tracking-widest text-brand-text">{label}</p>
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-ink-muted">
                    {body.trim()}
                </p>
            </div>
        </div>
    );
}
