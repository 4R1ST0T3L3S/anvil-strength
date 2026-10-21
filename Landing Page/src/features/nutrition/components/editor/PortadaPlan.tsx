import { useState } from 'react';
import type { ReactNode } from 'react';
import { ClipboardList, Pencil, Pill, Plus, Tag, X } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import type { NutritionPlan } from '../../../../types/nutrition';

/**
 * LA PORTADA DEL PLAN — lo que va arriba del todo en el PDF y en la vista
 * del atleta: bloque de entrenamiento al que acompaña, etiquetas, pautas
 * generales y suplementación diaria.
 */

type Campos = Pick<NutritionPlan, 'training_block_id' | 'tags' | 'general_guidelines' | 'global_supplements'>;

export function PortadaPlan({ plan, editable, onGuardar, guardando }: { plan: NutritionPlan; editable: boolean; onGuardar: (c: Campos) => void; guardando?: boolean }) {
    const [editando, setEditando] = useState(false);
    const [c, setC] = useState<Campos>({
        training_block_id: plan.training_block_id ?? '',
        tags: plan.tags ?? [],
        general_guidelines: plan.general_guidelines ?? [],
        global_supplements: plan.global_supplements ?? [],
    });

    const vacia = !plan.training_block_id && !plan.tags?.length && !plan.general_guidelines?.length && !plan.global_supplements?.length;

    if (!editando) {
        if (vacia && !editable) return null;
        return (
            <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4 md:p-5">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-t-sm font-semibold text-ink">Portada del plan</h3>
                    {editable && (
                        <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => {
                            setC({
                                training_block_id: plan.training_block_id ?? '',
                                tags: plan.tags ?? [],
                                general_guidelines: plan.general_guidelines ?? [],
                                global_supplements: plan.global_supplements ?? [],
                            });
                            setEditando(true);
                        }}>
                            {vacia ? 'Añadir' : 'Editar'}
                        </Button>
                    )}
                </div>
                {vacia ? (
                    <p className="mt-1 text-t-sm text-ink-subtle">Pautas generales, suplementación y etiquetas: salen arriba del todo en el PDF y en la app del atleta.</p>
                ) : (
                    <div className="mt-3 space-y-3 text-t-sm">
                        {(plan.training_block_id || (plan.tags?.length ?? 0) > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {plan.training_block_id && <span className="text-ink-muted">Bloque: <strong className="text-ink">{plan.training_block_id}</strong></span>}
                                {plan.tags?.map((t, i) => (
                                    <span key={i} className="rounded-pill bg-[var(--brand-quiet)] px-2.5 py-0.5 text-t-xs font-semibold text-brand-text">{t}</span>
                                ))}
                            </div>
                        )}
                        {(plan.general_guidelines?.length ?? 0) > 0 && (
                            <ul className="space-y-1 text-ink-muted">
                                {plan.general_guidelines!.map((g, i) => <li key={i} className="flex gap-2"><ClipboardList size={14} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />{g}</li>)}
                            </ul>
                        )}
                        {(plan.global_supplements?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {plan.global_supplements!.map((s, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 rounded-pill bg-[var(--info-quiet)] px-2.5 py-0.5 text-t-xs text-info"><Pill size={11} aria-hidden="true" />{s}</span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>
        );
    }

    return (
        <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4 md:p-5">
            <h3 className="text-t-sm font-semibold text-ink">Portada del plan</h3>
            <label className="mt-3 block">
                <span className="text-t-xs font-semibold text-ink-muted">Bloque de entrenamiento al que acompaña</span>
                <input
                    value={c.training_block_id ?? ''}
                    onChange={(e) => setC({ ...c, training_block_id: e.target.value })}
                    placeholder="Fuerza, bloque 2"
                    className="mt-1 h-10 w-full rounded-field bg-[var(--fill-input)] px-3 text-t-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
            </label>
            <ListaEditable titulo="Etiquetas" icono={<Tag size={13} />} placeholder="Volumen, definición…" valores={c.tags ?? []} onCambio={(v) => setC({ ...c, tags: v })} />
            <ListaEditable titulo="Pautas generales" icono={<ClipboardList size={13} />} placeholder="Beber 3 litros de agua al día" valores={c.general_guidelines ?? []} onCambio={(v) => setC({ ...c, general_guidelines: v })} />
            <ListaEditable titulo="Suplementación diaria" icono={<Pill size={13} />} placeholder="5 g de creatina al día" valores={c.global_supplements ?? []} onCambio={(v) => setC({ ...c, global_supplements: v })} />
            <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
                <Button size="sm" variant="primary" loading={guardando} onClick={() => { onGuardar({ ...c, training_block_id: c.training_block_id?.trim() || null }); setEditando(false); }}>
                    Guardar portada
                </Button>
            </div>
        </section>
    );
}

function ListaEditable({ titulo, icono, placeholder, valores, onCambio }: { titulo: string; icono: ReactNode; placeholder: string; valores: string[]; onCambio: (v: string[]) => void }) {
    const [nuevo, setNuevo] = useState('');
    const anadir = () => { const v = nuevo.trim(); if (v) onCambio([...valores, v]); setNuevo(''); };
    return (
        <div className="mt-4">
            <p className="flex items-center gap-1.5 text-t-xs font-semibold text-ink-muted">{icono}{titulo}</p>
            <div className="mt-1 flex gap-2">
                <input
                    value={nuevo}
                    onChange={(e) => setNuevo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } }}
                    placeholder={placeholder}
                    className="h-10 flex-1 rounded-field bg-[var(--fill-input)] px-3 text-t-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
                <Button size="md" variant="secondary" onClick={anadir} aria-label={`Añadir a ${titulo}`}><Plus size={16} /></Button>
            </div>
            {valores.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {valores.map((v, i) => (
                        <li key={`${v}-${i}`} className="flex items-center justify-between gap-2 rounded-field bg-[var(--fill-muted)] px-3 py-1.5 text-t-sm text-ink">
                            <span className="min-w-0 break-words">{v}</span>
                            <button type="button" onClick={() => onCambio(valores.filter((_, j) => j !== i))} aria-label={`Quitar ${v}`} className="shrink-0 text-ink-subtle hover:text-danger-text">
                                <X size={14} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
