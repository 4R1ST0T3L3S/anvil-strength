import { useCallback, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { m } from 'framer-motion';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — PESTAÑAS
 * =====================================================================
 *
 * Para las SECCIONES de una pantalla (la ficha del atleta, las
 * estadísticas). Para alternar entre dos o tres vistas del mismo contenido,
 * `SegmentedControl`.
 *
 * TECLADO: una sola parada de tabulador para todo el grupo y flechas dentro
 * (foco itinerante: `tabIndex` 0 solo en la activa).
 *
 * EL INDICADOR es neutro — tinta, no rojo —: la pestaña activa ya se lee por
 * el peso y el color del texto, y el rojo se reserva para la acción. Se
 * desliza de una pestaña a otra (`layoutId`): comunica "has cambiado de
 * sitio" y no "ha cambiado la pantalla".
 *
 * En móvil la tira se desplaza de lado con su propio `overflow-x`, que es un
 * desbordamiento intencionado.
 */

export interface Pestana<T extends string> {
    id: T;
    label: ReactNode;
    /** Versión corta para móvil. */
    labelCorta?: ReactNode;
    icono?: ReactNode;
    /** Contador a la derecha de la etiqueta: avisos, elementos pendientes. */
    insignia?: number;
    deshabilitada?: boolean;
}

export interface TabsProps<T extends string> {
    pestanas: Pestana<T>[];
    activa: T;
    onChange: (id: T) => void;
    /** Qué es este grupo, para quien navega con lector. */
    'aria-label': string;
    className?: string;
}

export function Tabs<T extends string>({
    pestanas,
    activa,
    onChange,
    'aria-label': ariaLabel,
    className,
}: TabsProps<T>) {
    const grupo = useId();
    const tiraRef = useRef<HTMLDivElement>(null);

    const alPulsarTecla = useCallback(
        (e: React.KeyboardEvent) => {
            const utiles = pestanas.filter(p => !p.deshabilitada);
            const actual = utiles.findIndex(p => p.id === activa);
            if (actual === -1) return;

            let destino = -1;
            if (e.key === 'ArrowRight') destino = (actual + 1) % utiles.length;
            else if (e.key === 'ArrowLeft') destino = (actual - 1 + utiles.length) % utiles.length;
            else if (e.key === 'Home') destino = 0;
            else if (e.key === 'End') destino = utiles.length - 1;
            else return;

            e.preventDefault();
            const siguiente = utiles[destino];
            onChange(siguiente.id);
            // El foco SIGUE a la selección, o la siguiente flecha se mueve
            // desde donde estaba el foco y la navegación se vuelve errática.
            requestAnimationFrame(() => {
                tiraRef.current
                    ?.querySelector<HTMLButtonElement>(`[data-pestana="${siguiente.id}"]`)
                    ?.focus();
            });
        },
        [pestanas, activa, onChange]
    );

    return (
        <div
            ref={tiraRef}
            role="tablist"
            aria-label={ariaLabel}
            onKeyDown={alPulsarTecla}
            className={cn(
                'flex items-center gap-0.5 overflow-x-auto scrollbar-hide',
                'border-b border-[var(--separator)]',
                className
            )}
        >
            {pestanas.map((p) => {
                const esActiva = p.id === activa;
                return (
                    <button
                        key={p.id}
                        role="tab"
                        type="button"
                        data-pestana={p.id}
                        data-no-press
                        id={`${grupo}-${p.id}`}
                        aria-selected={esActiva}
                        aria-controls={`${grupo}-${p.id}-panel`}
                        tabIndex={esActiva ? 0 : -1}
                        disabled={p.deshabilitada}
                        onClick={() => onChange(p.id)}
                        className={cn(
                            'relative flex min-h-[44px] shrink-0 items-center gap-2 px-3 pb-2.5 pt-2',
                            'text-t-sm whitespace-nowrap',
                            'transition-colors duration-fast ease-snap',
                            'disabled:cursor-not-allowed disabled:opacity-40',
                            esActiva ? 'font-semibold text-ink' : 'font-medium text-ink-subtle hover:text-ink'
                        )}
                    >
                        {p.icono && (
                            <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
                                {p.icono}
                            </span>
                        )}

                        {p.labelCorta ? (
                            <>
                                <span className="sm:hidden">{p.labelCorta}</span>
                                <span className="hidden sm:inline">{p.label}</span>
                            </>
                        ) : (
                            <span>{p.label}</span>
                        )}

                        {p.insignia != null && p.insignia > 0 && (
                            <span
                                className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-brand px-1.5 text-t-2xs font-semibold tabular-nums leading-none text-brand-ink"
                                aria-label={`${p.insignia} pendientes`}
                            >
                                {p.insignia > 99 ? '99+' : p.insignia}
                            </span>
                        )}

                        {esActiva && (
                            <m.span
                                layoutId={`${grupo}-subrayado`}
                                className="absolute inset-x-2 -bottom-px h-[2px] rounded-pill bg-ink"
                                transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * El panel de una pestaña. `tabIndex={0}`: si el contenido no tiene nada
 * enfocable, quien navega con teclado tiene que poder llegar a leerlo.
 */
export function TabPanel({
    grupo,
    id,
    children,
    className,
}: {
    grupo: string;
    id: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            role="tabpanel"
            id={`${grupo}-${id}-panel`}
            aria-labelledby={`${grupo}-${id}`}
            tabIndex={0}
            className={cn('focus-visible:outline-none', className)}
        >
            {children}
        </div>
    );
}
