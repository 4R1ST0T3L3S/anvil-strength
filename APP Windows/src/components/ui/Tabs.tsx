import { useCallback, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { m } from 'framer-motion';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — PESTAÑAS
 * =====================================================================
 *
 * Sustituye a la docena de juegos de pestañas escritos a mano por la
 * aplicación (la ficha del atleta, el panel de VBT, las estadísticas...).
 * Ninguno tiene navegación por teclado y ninguno se anuncia como pestañas.
 *
 *
 * EL TECLADO NO ES OPCIONAL AQUÍ
 *
 * Un juego de pestañas tiene un patrón de teclado establecido y la gente lo
 * espera: **una sola parada de tabulador** para todo el grupo, y dentro se
 * navega con las flechas. Lo que hay hoy son botones sueltos, así que
 * tabular por la ficha de un atleta obliga a pasar por las cinco pestañas
 * antes de llegar al contenido.
 *
 * Eso se consigue con `tabIndex` a 0 solo en la activa y -1 en el resto — lo
 * que se llama gestión de foco itinerante. Es la parte que casi nadie
 * implementa y la que hace la diferencia.
 *
 * Se implementa a mano y no con una librería (Radix serían ~8 KB) porque
 * `Modal` y `AnchoredMenu` ya resuelven a mano lo difícil de la
 * accesibilidad en este proyecto, y meter un segundo modelo mental para
 * esto no compensa. Ver decisión U3.
 *
 *
 * DESPLAZAMIENTO LATERAL EN MÓVIL
 *
 * Cinco pestañas no caben en 375px. La tira se desplaza de lado con su
 * propio `overflow-x`, que es un desbordamiento INTENCIONADO — por eso
 * `overflowGuard` no se queja de él (ver su comentario: la regla no es "¿se
 * sale?" sino "¿se sale hasta el armazón?").
 */

export interface Pestana<T extends string> {
    id: T;
    label: ReactNode;
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
            // El foco tiene que SEGUIR a la selección: si se queda atrás, la
            // siguiente flecha se mueve desde donde estaba el foco y no desde
            // donde está la pestaña activa, y la navegación se vuelve errática.
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
                'flex items-center gap-1 overflow-x-auto scrollbar-hide',
                'border-b border-subtle',
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
                        id={`${grupo}-${p.id}`}
                        aria-selected={esActiva}
                        aria-controls={`${grupo}-${p.id}-panel`}
                        // Foco itinerante: una sola parada de tabulador.
                        tabIndex={esActiva ? 0 : -1}
                        disabled={p.deshabilitada}
                        onClick={() => onChange(p.id)}
                        className={cn(
                            'relative flex min-h-[44px] shrink-0 items-center gap-2 px-3 pb-2.5 pt-2',
                            'text-t-sm font-bold whitespace-nowrap',
                            'transition-colors duration-fast ease-snap',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)] focus-visible:rounded-field',
                            'disabled:cursor-not-allowed disabled:opacity-40',
                            esActiva ? 'text-ink' : 'text-ink-subtle hover:text-ink'
                        )}
                    >
                        {p.icono && (
                            <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
                                {p.icono}
                            </span>
                        )}

                        <span>{p.label}</span>

                        {p.insignia != null && p.insignia > 0 && (
                            <span
                                className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-[var(--brand-quiet)] px-1 text-t-2xs font-black tabular-nums text-brand-text"
                                aria-label={`${p.insignia} pendientes`}
                            >
                                {p.insignia > 99 ? '99+' : p.insignia}
                            </span>
                        )}

                        {/* El subrayado se desplaza de una pestaña a otra en vez
                            de aparecer y desaparecer: `layoutId` hace que
                            framer-motion lo trate como el MISMO elemento
                            moviéndose, que es lo que comunica "has cambiado de
                            sitio" en lugar de "ha cambiado la pantalla". */}
                        {esActiva && (
                            <m.span
                                layoutId={`${grupo}-subrayado`}
                                className="absolute inset-x-1 -bottom-px h-0.5 rounded-pill bg-brand"
                                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * El panel de una pestaña.
 *
 * `tabIndex={0}` a propósito: si el contenido del panel no tiene nada
 * enfocable, quien navega con teclado no podría llegar a leerlo. Con esto,
 * el propio panel es una parada.
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
