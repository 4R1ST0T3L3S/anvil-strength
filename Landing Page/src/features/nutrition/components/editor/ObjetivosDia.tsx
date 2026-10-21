import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import type { ObjetivoAjuste } from '../../../../lib/nutricion/ajuste';
import { kcalDeMacros, type Macros } from '../../../../lib/nutricion/macros';
import { BARRA_MACRO, COLOR_ESTADO, COLOR_MACRO, ETIQUETA_MACRO, estadoDesvio, formatear } from './comun';

/**
 * PLANIFICADO FRENTE A OBJETIVO, DEL DÍA QUE SE ESTÁ VIENDO
 * =====================================================================
 *
 * Una franja pegada arriba mientras se baja por las comidas: el total del
 * día contra su objetivo, macro a macro, con el desvío en color (en
 * objetivo / cerca / lejos). Sustituye al marcador flotante que había, que
 * se podía arrastrar por la pantalla y tapaba justo lo que se editaba.
 *
 * Los objetivos se editan aquí mismo, con ayuda: si se escriben los macros,
 * las calorías salen solas (4/4/9) y se puede usar ese valor con un toque.
 */

const CAMPOS: (keyof Macros)[] = ['kcal', 'proteina', 'carbos', 'grasas'];

export function ObjetivosDia({
    nombreDia,
    objetivo,
    planificado,
    editable,
    onGuardar,
    guardando,
}: {
    nombreDia: string;
    objetivo: ObjetivoAjuste;
    planificado: Macros;
    editable: boolean;
    onGuardar: (o: ObjetivoAjuste) => void;
    guardando?: boolean;
}) {
    const [editando, setEditando] = useState(false);
    const [borrador, setBorrador] = useState<ObjetivoAjuste>(objetivo);
    const kcalCalculadas = Math.round(kcalDeMacros(borrador));

    if (editando) {
        return (
            <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
                <p className="text-t-sm font-semibold text-ink">Objetivo · {nombreDia}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CAMPOS.map((k) => (
                        <label key={k} className="block rounded-card bg-[var(--fill-input)] px-3 py-2 focus-within:ring-2 focus-within:ring-brand">
                            <span className={`block text-t-xs font-semibold ${COLOR_MACRO[k]}`}>{ETIQUETA_MACRO[k].larga}</span>
                            <span className="flex items-baseline gap-1">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    value={borrador[k] || ''}
                                    onChange={(e) => setBorrador((b) => ({ ...b, [k]: Math.max(0, Number(e.target.value) || 0) }))}
                                    className="w-full bg-transparent text-t-lg font-semibold tabular-nums text-ink focus-visible:outline-none"
                                />
                                <span className="text-t-xs text-ink-subtle">{ETIQUETA_MACRO[k].unidad}</span>
                            </span>
                        </label>
                    ))}
                </div>
                {kcalCalculadas > 0 && Math.abs(kcalCalculadas - borrador.kcal) > 10 && (
                    <p className="mt-2 text-t-xs text-ink-muted">
                        Los macros suman <strong className="text-ink">{formatear(kcalCalculadas)} kcal</strong>.{' '}
                        <button type="button" className="font-semibold text-brand-text underline underline-offset-2" onClick={() => setBorrador((b) => ({ ...b, kcal: kcalCalculadas }))}>
                            Usar ese valor
                        </button>
                    </p>
                )}
                <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setBorrador(objetivo); setEditando(false); }}>Cancelar</Button>
                    <Button size="sm" variant="primary" loading={guardando} onClick={() => { onGuardar(borrador); setEditando(false); }}>Guardar objetivo</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="sticky top-0 z-sticky -mx-4 border-b border-[var(--separator)] bg-[var(--material-bar)] px-4 py-3 backdrop-blur-xl md:mx-0 md:rounded-card md:border md:border-[var(--border-default)]">
            <div className="flex items-center justify-between gap-3">
                <p className="text-t-xs font-semibold text-ink-subtle">
                    Planificado · <span className="text-ink">{nombreDia}</span>
                </p>
                {editable && (
                    <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => { setBorrador(objetivo); setEditando(true); }}>
                        Objetivo
                    </Button>
                )}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 md:gap-4">
                {CAMPOS.map((k) => {
                    const estado = estadoDesvio(planificado[k], objetivo[k]);
                    const pct = objetivo[k] > 0 ? Math.min(100, (planificado[k] / objetivo[k]) * 100) : 0;
                    return (
                        <div key={k} className="min-w-0">
                            <p className="flex items-baseline gap-1">
                                <span className={`text-t-base font-semibold tabular-nums md:text-t-lg ${COLOR_MACRO[k]}`}>{formatear(planificado[k])}</span>
                                <span className="truncate text-t-2xs tabular-nums text-ink-subtle md:text-t-xs">/ {formatear(objetivo[k])}{k === 'kcal' ? '' : ' g'}</span>
                            </p>
                            <div className="mt-1 h-1 overflow-hidden rounded-pill bg-[var(--fill-muted)]">
                                <div className={`h-full rounded-pill ${BARRA_MACRO[k]}`} style={{ width: `${pct}%` }} />
                            </div>
                            <p className={`mt-1 truncate text-t-2xs font-semibold ${COLOR_ESTADO[estado]}`}>
                                {estado === 'sin'
                                    ? ETIQUETA_MACRO[k].larga
                                    : `${ETIQUETA_MACRO[k].corta} ${planificado[k] - objetivo[k] >= 0 ? '+' : '−'}${formatear(Math.abs(planificado[k] - objetivo[k]))}`}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
