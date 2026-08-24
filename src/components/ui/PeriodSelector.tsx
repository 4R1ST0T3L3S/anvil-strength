import { useRef, useState } from 'react';
import { CalendarRange, Check, ChevronDown, Info } from 'lucide-react';
import { AnchoredMenu } from './AnchoredMenu';
import { cn } from '../../lib/utils';
import { resolverPeriodo, type BloqueTemporal, type Periodo, type PeriodoResuelto } from '../../lib/period';

/**
 * ANVIL STRENGTH — SELECTOR DE PERIODO
 * =====================================================================
 *
 * El control que faltaba. Hasta ahora todas las estadísticas contestaban a
 * "¿cuánto ha entrenado… desde siempre?", que no es la pregunta que nadie se
 * hace.
 *
 *
 * POR QUÉ UN MENÚ Y NO UNAS PESTAÑAS
 *
 * Porque el número de opciones no es fijo: hay cuatro o cinco periodos de
 * calendario MÁS un bloque por cada bloque del atleta, que pueden ser doce.
 * Unas pestañas con dieciséis entradas se convierten en una tira que hay que
 * arrastrar, y en móvil eso compite con el scroll de la página.
 *
 * El botón dice SIEMPRE qué periodo está activo, que es lo que de verdad
 * importa: una pantalla de estadísticas filtrada sin que se vea el filtro es
 * una pantalla que miente.
 *
 *
 * EL AVISO DE MODO ORDINAL (decisión K10)
 *
 * Cuando el bloque elegido no tiene fecha de inicio, sus semanas no se pueden
 * situar en el calendario. Eso NO se esconde: aparece debajo, con el motivo y
 * —si se pasa `onPonerFecha`— con la salida. Es la diferencia entre "esto no
 * va" y "esto no puede ir todavía, y aquí está el arreglo".
 */

export interface PeriodSelectorProps {
    /** Los periodos que ofrecer. Sale de `usePeriodo`. */
    opciones: Periodo[];
    /** El activo. */
    valor: Periodo;
    onChange: (p: Periodo) => void;
    /** Para poder etiquetar los periodos de tipo `bloque`. */
    bloques?: BloqueTemporal[];
    /** El periodo ya resuelto, para el aviso de modo ordinal. */
    resuelto?: PeriodoResuelto;
    /** Si se pasa, el aviso ofrece poner la fecha que falta. */
    onPonerFecha?: (blockId: string) => void;
    /** Nota de la matriz de aplicabilidad: por qué no están todos. */
    nota?: string;
    className?: string;
}

/** Cómo se llama un periodo en la lista. */
function etiquetaDe(p: Periodo, bloques: BloqueTemporal[]): string {
    switch (p.tipo) {
        case 'semana': return 'Esta semana';
        case 'mes': return 'Este mes';
        case 'todo': return 'Desde siempre';
        case 'ultimas': return `Últimas ${p.semanas ?? 4} semanas`;
        case 'bloque': {
            const b = bloques.find(x => x.id === p.blockId);
            return b?.name?.trim() || 'Bloque';
        }
    }
}

function mismoPeriodo(a: Periodo, b: Periodo): boolean {
    if (a.tipo !== b.tipo) return false;
    if (a.tipo === 'ultimas') return (a.semanas ?? 4) === (b.semanas ?? 4);
    if (a.tipo === 'bloque') return a.blockId === b.blockId;
    return true;
}

export function PeriodSelector({
    opciones,
    valor,
    onChange,
    bloques = [],
    resuelto,
    onPonerFecha,
    nota,
    className,
}: PeriodSelectorProps) {
    const [abierto, setAbierto] = useState(false);
    const botonRef = useRef<HTMLButtonElement>(null);

    const activo = resuelto ?? resolverPeriodo(valor, { bloques });
    const esOrdinal = activo.resolucion === 'ordinal';

    // Los de calendario primero y los bloques después, con un separador: son
    // dos formas distintas de recortar el tiempo y mezclarlas confunde.
    const deCalendario = opciones.filter(o => o.tipo !== 'bloque');
    const deBloque = opciones.filter(o => o.tipo === 'bloque');

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <button
                ref={botonRef}
                type="button"
                onClick={() => setAbierto(v => !v)}
                aria-expanded={abierto}
                aria-haspopup="menu"
                aria-label={`Periodo: ${etiquetaDe(valor, bloques)}. Cambiar`}
                className={cn(
                    'inline-flex min-h-[44px] items-center gap-2 rounded-field px-3',
                    'border border-[var(--border-default)] bg-surface-raised',
                    'text-t-sm font-semibold text-ink',
                    'transition-colors duration-fast ease-snap',
                    'hover:border-[var(--border-strong)] hover:bg-surface-overlay',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]'
                )}
            >
                <CalendarRange className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                <span className="max-w-[16rem] truncate">{etiquetaDe(valor, bloques)}</span>
                <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-ink-subtle transition-transform duration-fast ease-snap', abierto && 'rotate-180')}
                    aria-hidden="true"
                />
            </button>

            {/* El rango de fechas, bajo el botón. Sin esto, "Últimas 4 semanas"
                no dice de qué día a qué día, y esa es justamente la pregunta
                que sigue a elegirlo. En modo ordinal no hay rango que enseñar. */}
            {!esOrdinal && activo.desde && activo.hasta && (
                <p className="px-1 text-t-2xs tabular-nums text-ink-subtle">
                    {activo.desde.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    {' – '}
                    {activo.hasta.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
            )}

            {/* Modo ordinal: se dice, con el motivo y con la salida. */}
            {esOrdinal && activo.motivoOrdinal && (
                <div
                    role="status"
                    className="flex items-start gap-2 rounded-field border border-[var(--warning-quiet)] bg-[var(--warning-quiet)] px-3 py-2 text-t-xs text-ink-muted"
                >
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                    <div className="min-w-0">
                        <p>{activo.motivoOrdinal}</p>
                        {onPonerFecha && valor.tipo === 'bloque' && valor.blockId && (
                            <button
                                type="button"
                                onClick={() => onPonerFecha(valor.blockId!)}
                                className="mt-1 min-h-[32px] font-bold text-warning underline underline-offset-2 transition-colors duration-fast ease-snap hover:text-ink"
                            >
                                Poner fecha de inicio
                            </button>
                        )}
                    </div>
                </div>
            )}

            <AnchoredMenu
                open={abierto}
                onClose={() => setAbierto(false)}
                anchorRef={botonRef}
                align="start"
                width={264}
                className="z-dropdown max-h-[min(70vh,28rem)] overflow-y-auto rounded-card border border-[var(--border-default)] bg-surface-overlay p-1.5 shadow-overlay"
            >
                {deCalendario.map((o) => (
                    <OpcionPeriodo
                        key={`cal-${o.tipo}-${o.semanas ?? ''}`}
                        etiqueta={etiquetaDe(o, bloques)}
                        activa={mismoPeriodo(o, valor)}
                        onSelect={() => { onChange(o); setAbierto(false); }}
                    />
                ))}

                {deBloque.length > 0 && (
                    <>
                        <div className="my-1.5 h-px bg-[var(--border-subtle)]" role="separator" />
                        <p className="px-3 pb-1 pt-1 text-t-2xs font-bold uppercase tracking-wide text-ink-faint">
                            Por bloque
                        </p>
                        {deBloque.map((o) => {
                            const b = bloques.find(x => x.id === o.blockId);
                            return (
                                <OpcionPeriodo
                                    key={`blq-${o.blockId}`}
                                    etiqueta={etiquetaDe(o, bloques)}
                                    // El punto de aviso marca los bloques sin fecha ANTES
                                    // de elegirlos, para no llevarse la sorpresa después.
                                    avisa={!b?.start_date}
                                    activa={mismoPeriodo(o, valor)}
                                    onSelect={() => { onChange(o); setAbierto(false); }}
                                />
                            );
                        })}
                    </>
                )}

                {nota && (
                    <>
                        <div className="my-1.5 h-px bg-[var(--border-subtle)]" role="separator" />
                        <p className="px-3 py-1.5 text-t-2xs leading-relaxed text-ink-faint">{nota}</p>
                    </>
                )}
            </AnchoredMenu>
        </div>
    );
}

function OpcionPeriodo({
    etiqueta,
    activa,
    avisa = false,
    onSelect,
}: {
    etiqueta: string;
    activa: boolean;
    avisa?: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onSelect}
            aria-current={activa ? 'true' : undefined}
            className={cn(
                'flex min-h-[44px] w-full items-center gap-2 rounded-field px-3 text-left',
                'text-t-sm font-semibold transition-colors duration-fast ease-snap',
                'hover:bg-surface-raised',
                activa ? 'text-brand-text' : 'text-ink-muted hover:text-ink'
            )}
        >
            <Check
                className={cn('h-4 w-4 shrink-0', activa ? 'opacity-100' : 'opacity-0')}
                aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
            {avisa && (
                <span
                    className="h-1.5 w-1.5 shrink-0 rounded-pill bg-warning"
                    aria-label="sin fecha de inicio"
                    title="Sin fecha de inicio: solo se puede agregar por número de semana"
                />
            )}
        </button>
    );
}
