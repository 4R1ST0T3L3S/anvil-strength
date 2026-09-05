import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { LayoutGrid, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — PILA DE WIDGETS
 * =====================================================================
 * Decisión K8: apilados también en escritorio.
 *
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * El inicio del atleta enseña seis tarjetas a la vez: hoy, constancia,
 * competición, volumen, cuestionarios, ranking. En un móvil eso es un metro
 * de scroll antes de llegar a lo único que se mira de verdad, que es la
 * sesión del día. Y en escritorio son seis cosas compitiendo por la atención
 * sin que ninguna gane.
 *
 *
 * POR QUÉ TAMBIÉN EN ESCRITORIO, QUE ES LO DISCUTIBLE
 *
 * Porque el problema no es el ancho de la pantalla: es que seis tarjetas
 * simultáneas no tienen jerarquía. Pero esconder información en 1440px SÍ
 * puede restar, y por eso vienen las dos salvaguardas que exige K8:
 *
 *   1. **Conmutador pila ↔ rejilla, siempre visible**, y recuerda la
 *      elección. Quien quiera comparar cuatro gráficas a la vez, puede.
 *   2. **Teclado obligatorio.** Un gesto que sea la ÚNICA forma de llegar a
 *      algo es un fallo de accesibilidad, no una decisión de diseño.
 *
 *
 * EL PRESUPUESTO DE RENDIMIENTO, QUE AQUÍ NO ES NEGOCIABLE
 *
 * **Solo se monta la tarjeta activa ±1.** Recharts es caro: seis
 * `ResponsiveContainer` vivos a la vez harían imposible la sensación de
 * velocidad que persigue todo esto. El ±1 existe para que deslizar a la
 * siguiente la encuentre ya montada en vez de verla aparecer.
 *
 * Solo se animan `transform` y `opacity`.
 *
 *
 * CON MOVIMIENTO REDUCIDO NO HAY PILA
 *
 * Se cae a la lista vertical de siempre, con todo montado. No es "lo mismo
 * pero sin animación": una pila es un mecanismo que se maneja con gestos, y
 * quien pide menos movimiento normalmente pide también menos mecanismo.
 */

export interface Widget {
    id: string;
    /** Nombre corto, para los puntos y el lector de pantalla. */
    titulo: string;
    /** Se evalúa solo cuando toca montarlo. */
    render: () => ReactNode;
}

export interface WidgetStackProps {
    widgets: Widget[];
    /** Qué colección es esta, para recordar la vista elegida. */
    id: string;
    'aria-label': string;
    className?: string;
}

type Vista = 'pila' | 'rejilla';

const CLAVE_VISTA = (id: string) => `anvil_widgets_${id}`;

function leerVista(id: string): Vista {
    try {
        return localStorage.getItem(CLAVE_VISTA(id)) === 'rejilla' ? 'rejilla' : 'pila';
    } catch {
        return 'pila';
    }
}

export function WidgetStack({ widgets, id, 'aria-label': ariaLabel, className }: WidgetStackProps) {
    const reduce = useReducedMotion();
    const grupo = useId();
    const tiraRef = useRef<HTMLDivElement>(null);

    // Inicializador perezoso: la lectura ocurre una vez, antes del primer
    // pintado, en vez de en un efecto que provoque un segundo render.
    const [vista, setVista] = useState<Vista>(() => leerVista(id));
    const [activo, setActivo] = useState(0);

    const cambiarVista = useCallback((siguiente: Vista) => {
        setVista(siguiente);
        try { localStorage.setItem(CLAVE_VISTA(id), siguiente); } catch { /* sin cuota */ }
    }, [id]);

    /**
     * Qué se monta.
     *
     * El ±1 es el presupuesto de K8. En rejilla se monta todo, porque para
     * eso se ha pedido la rejilla, y con movimiento reducido también.
     */
    const montados = useMemo(() => {
        if (vista === 'rejilla' || reduce) return new Set(widgets.map((_, i) => i));
        const s = new Set<number>([activo]);
        if (activo > 0) s.add(activo - 1);
        if (activo < widgets.length - 1) s.add(activo + 1);
        return s;
    }, [vista, reduce, activo, widgets]);

    const irA = useCallback((i: number) => {
        setActivo(Math.max(0, Math.min(widgets.length - 1, i)));
    }, [widgets.length]);

    const alPulsarTecla = useCallback((e: React.KeyboardEvent) => {
        let destino = -1;
        if (e.key === 'ArrowRight') destino = activo + 1;
        else if (e.key === 'ArrowLeft') destino = activo - 1;
        else if (e.key === 'Home') destino = 0;
        else if (e.key === 'End') destino = widgets.length - 1;
        else return;

        e.preventDefault();
        const siguiente = Math.max(0, Math.min(widgets.length - 1, destino));
        setActivo(siguiente);
        // El foco sigue a la selección: si se queda atrás, la siguiente flecha
        // se mueve desde donde estaba el foco y la navegación se vuelve
        // errática. Mismo criterio que en `Tabs`.
        requestAnimationFrame(() => {
            tiraRef.current?.querySelector<HTMLButtonElement>(`[data-punto="${siguiente}"]`)?.focus();
        });
    }, [activo, widgets.length]);

    // Si desaparece un widget (por ejemplo, el de competición cuando ya no hay
    // ninguna), el índice activo puede quedarse fuera de rango.
    if (activo > widgets.length - 1 && widgets.length > 0) {
        setActivo(widgets.length - 1);
    }

    if (widgets.length === 0) return null;

    // ---------------------------------------------------------------
    // Lista vertical: movimiento reducido, o el usuario ha pedido rejilla.
    // ---------------------------------------------------------------
    if (reduce || vista === 'rejilla') {
        return (
            <section className={className} aria-label={ariaLabel}>
                {!reduce && (
                    <ConmutadorVista vista={vista} onChange={cambiarVista} className="mb-3" />
                )}
                <div className={cn(
                    'grid gap-3',
                    // Rejilla de verdad solo cuando hay sitio. En móvil, una
                    // "rejilla" de una columna es la lista de siempre.
                    reduce ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
                )}>
                    {widgets.map((w) => (
                        <div key={w.id}>{w.render()}</div>
                    ))}
                </div>
            </section>
        );
    }

    // ---------------------------------------------------------------
    // Pila
    // ---------------------------------------------------------------
    return (
        <section className={className} aria-label={ariaLabel}>
            <div className="mb-3 flex items-center justify-between gap-3">
                {/* Los puntos son la navegación PRINCIPAL, no un adorno: por
                    eso son botones de 44px con nombre, y no tres pixeles. */}
                <div
                    ref={tiraRef}
                    role="tablist"
                    aria-label={`${ariaLabel}: elegir tarjeta`}
                    aria-orientation="horizontal"
                    onKeyDown={alPulsarTecla}
                    className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide"
                >
                    {widgets.map((w, i) => (
                        <button
                            key={w.id}
                            role="tab"
                            type="button"
                            data-punto={i}
                            id={`${grupo}-${i}`}
                            aria-selected={i === activo}
                            aria-controls={`${grupo}-${i}-panel`}
                            tabIndex={i === activo ? 0 : -1}
                            onClick={() => irA(i)}
                            className={cn(
                                'flex min-h-[44px] shrink-0 items-center gap-2 rounded-field px-2.5',
                                'text-t-xs font-bold whitespace-nowrap',
                                'transition-colors duration-fast ease-snap',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
                                // `ink-subtle` y no `ink-faint`: el nombre de una
                                // pestaña es TEXTO, y --ink-faint da 2,6:1. El
                                // propio tokens.css dice que no es para texto.
                                i === activo ? 'text-ink' : 'text-ink-subtle hover:text-ink'
                            )}
                        >
                            <span
                                className={cn(
                                    'h-1.5 w-1.5 rounded-pill transition-colors duration-fast ease-snap',
                                    i === activo ? 'bg-brand' : 'bg-[var(--border-strong)]'
                                )}
                                aria-hidden="true"
                            />
                            {/* La etiqueta solo en la activa por debajo de sm:
                                seis nombres seguidos en 375px son una tira que
                                hay que arrastrar para usar la navegación. */}
                            <span className={cn(i === activo ? 'inline' : 'hidden sm:inline')}>
                                {w.titulo}
                            </span>
                        </button>
                    ))}
                </div>

                <ConmutadorVista vista={vista} onChange={cambiarVista} />
            </div>

            {/* Los paneles se apilan en la MISMA celda de la rejilla, así que
                el contenedor mide lo que el más alto y no salta al cambiar. */}
            <div className="grid">
                {widgets.map((w, i) => {
                    const esActivo = i === activo;
                    if (!montados.has(i)) return null;

                    return (
                        <div
                            key={w.id}
                            role="tabpanel"
                            id={`${grupo}-${i}-panel`}
                            aria-labelledby={`${grupo}-${i}`}
                            aria-hidden={!esActivo}
                            tabIndex={esActivo ? 0 : -1}
                            className={cn(
                                'col-start-1 row-start-1 focus-visible:outline-none',
                                'transition-opacity duration-base ease-snap',
                                esActivo
                                    ? 'opacity-100'
                                    // El que no se ve queda montado pero fuera del
                                    // alcance del puntero y del tabulador: si no,
                                    // se puede tabular a un botón invisible.
                                    : 'pointer-events-none invisible opacity-0'
                            )}
                        >
                            {w.render()}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function ConmutadorVista({
    vista,
    onChange,
    className,
}: {
    vista: Vista;
    onChange: (v: Vista) => void;
    className?: string;
}) {
    const esPila = vista === 'pila';
    return (
        <button
            type="button"
            onClick={() => onChange(esPila ? 'rejilla' : 'pila')}
            aria-label={esPila ? 'Ver todas a la vez' : 'Ver de una en una'}
            title={esPila ? 'Ver todas a la vez' : 'Ver de una en una'}
            className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-field',
                'text-ink-subtle transition-colors duration-fast ease-snap',
                'hover:bg-surface-raised hover:text-ink',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
                className
            )}
        >
            {esPila
                ? <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                : <Layers className="h-4 w-4" aria-hidden="true" />}
        </button>
    );
}
