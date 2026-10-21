import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import type { ObjetivoAjuste } from '../../../../lib/nutricion/ajuste';
import type { PropuestaDeAjuste } from '../../../../lib/nutricion/dias';
import { kcalDeMacros, type Macros } from '../../../../lib/nutricion/macros';
import { COLOR_ESTADO, COLOR_MACRO, ETIQUETA_MACRO, estadoDesvio, formatear } from './comun';

/**
 * AJUSTE AUTOMÁTICO — LA VISTA PREVIA
 * =====================================================================
 *
 * El ajuste nunca escribe directamente. Se enseña lo que va a cambiar
 * (antes → después de cada alimento, y cómo queda cada macro frente al
 * objetivo) y se aplica con un botón. Un cambio de veinte cantidades a la
 * vez sin poder verlo antes no se lo cree nadie, y con razón.
 *
 * Los objetivos se pueden tocar aquí mismo: el cálculo se rehace al
 * momento.
 */

interface AjusteModalProps {
    abierto: boolean;
    titulo: string;
    descripcion?: string;
    objetivoInicial: ObjetivoAjuste;
    calcular: (objetivo: ObjetivoAjuste) => PropuestaDeAjuste;
    onAplicar: (propuesta: PropuestaDeAjuste, objetivo: ObjetivoAjuste) => void;
    onCerrar: () => void;
    aplicando?: boolean;
    /** Si se pueden guardar los objetivos cambiados como los del día. */
    textoAplicar?: string;
}

const CAMPOS: (keyof Macros)[] = ['kcal', 'proteina', 'carbos', 'grasas'];

export function AjusteModal({ abierto, titulo, descripcion, objetivoInicial, calcular, onAplicar, onCerrar, aplicando, textoAplicar = 'Aplicar' }: AjusteModalProps) {
    const [objetivo, setObjetivo] = useState<ObjetivoAjuste>(objetivoInicial);
    const propuesta = useMemo(() => calcular(objetivo), [calcular, objetivo]);
    const { resultado, detalle } = propuesta;
    const kcalMacros = kcalDeMacros(objetivo);
    const descuadre = objetivo.kcal > 0 && Math.abs(kcalMacros - objetivo.kcal) / objetivo.kcal > 0.05;
    const cambios = detalle.filter((d) => Math.round(d.antes) !== Math.round(d.despues)).length;

    return (
        <Modal
            open={abierto}
            onClose={onCerrar}
            title={titulo}
            description={descripcion}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
                    <Button
                        variant="primary"
                        loading={aplicando}
                        disabled={cambios === 0}
                        onClick={() => onAplicar(propuesta, objetivo)}
                    >
                        {cambios === 0 ? 'Ya está ajustado' : `${textoAplicar} (${cambios})`}
                    </Button>
                </>
            }
        >
            {/* OBJETIVO */}
            <fieldset>
                <legend className="text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">Objetivo</legend>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CAMPOS.map((k) => (
                        <label key={k} className="block rounded-card bg-[var(--fill-input)] px-3 py-2 focus-within:ring-2 focus-within:ring-brand">
                            <span className={`block text-t-xs font-semibold ${COLOR_MACRO[k]}`}>{ETIQUETA_MACRO[k].larga}</span>
                            <span className="flex items-baseline gap-1">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    value={Number.isFinite(objetivo[k]) ? Math.round(objetivo[k] * 10) / 10 : 0}
                                    onChange={(e) => setObjetivo((o) => ({ ...o, [k]: Math.max(0, Number(e.target.value) || 0) }))}
                                    className="w-full bg-transparent text-t-lg font-semibold tabular-nums text-ink focus-visible:outline-none"
                                />
                                <span className="text-t-xs text-ink-subtle">{ETIQUETA_MACRO[k].unidad}</span>
                            </span>
                        </label>
                    ))}
                </div>
                {descuadre && (
                    <p className="mt-2 flex items-start gap-1.5 text-t-xs text-warning">
                        <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden="true" />
                        Los macros suman {formatear(kcalMacros)} kcal y el objetivo dice {formatear(objetivo.kcal)}. Se prioriza cuadrar los macros.
                    </p>
                )}
            </fieldset>

            {/* RESULTADO */}
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CAMPOS.map((k) => {
                    const estado = estadoDesvio(resultado.logrado[k], objetivo[k]);
                    return (
                        <div key={k} className="rounded-card border border-[var(--border-default)] px-3 py-2">
                            <span className="block text-t-xs text-ink-subtle">{ETIQUETA_MACRO[k].larga} con el ajuste</span>
                            <span className="flex items-baseline gap-1.5">
                                <span className={`text-t-lg font-semibold tabular-nums ${COLOR_MACRO[k]}`}>{formatear(resultado.logrado[k])}</span>
                                <span className={`text-t-xs font-semibold tabular-nums ${COLOR_ESTADO[estado]}`}>
                                    {estado === 'sin' ? '' : `${resultado.desvio[k] >= 0 ? '+' : ''}${formatear(resultado.desvio[k] * 100, 1)} %`}
                                </span>
                            </span>
                        </div>
                    );
                })}
            </div>

            {resultado.avisos.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                    {resultado.avisos.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 rounded-card bg-[var(--warning-quiet)] px-3 py-2 text-t-sm text-ink">
                            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                            {a}
                        </li>
                    ))}
                </ul>
            )}

            {/* CAMBIOS */}
            <h3 className="mt-6 text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">
                {cambios === 0 ? 'Ningún alimento cambia' : `Cambian ${cambios} cantidades`}
            </h3>
            <ul className="mt-2 divide-y divide-[var(--separator)]">
                {detalle.map((d) => {
                    const cambia = Math.round(d.antes) !== Math.round(d.despues);
                    return (
                        <li key={d.id} className={`flex items-center gap-3 py-2 ${d.alternativa ? 'pl-5' : ''}`}>
                            <span className={`min-w-0 flex-1 truncate text-t-sm ${d.alternativa ? 'text-ink-subtle' : 'text-ink'}`}>
                                {d.alternativa && <span className="mr-1 font-semibold text-success">ó</span>}
                                {d.nombre}
                            </span>
                            <span className="shrink-0 text-t-sm tabular-nums text-ink-subtle">{formatear(d.antes)} g</span>
                            <ArrowRight size={14} className={`shrink-0 ${cambia ? 'text-brand-text' : 'text-ink-faint'}`} aria-hidden="true" />
                            <span className={`w-16 shrink-0 text-right text-t-sm font-semibold tabular-nums ${cambia ? 'text-ink' : 'text-ink-subtle'}`}>
                                {formatear(d.despues)} g
                            </span>
                        </li>
                    );
                })}
            </ul>
        </Modal>
    );
}
