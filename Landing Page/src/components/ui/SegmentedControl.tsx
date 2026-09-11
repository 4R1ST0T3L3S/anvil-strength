import { useCallback, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { m } from 'framer-motion';
import { cn } from '../../lib/utils';

/**
 * CONTROL SEGMENTADO
 * =====================================================================
 *
 * Para alternar entre dos a cuatro VISTAS DEL MISMO CONTENIDO — "Equipo ·
 * Bandeja · Calendario", "Todo · Sin leer" —. No es navegación entre
 * pantallas (para eso, `Tabs` o la barra lateral).
 *
 * La pastilla elegida se DESLIZA a la nueva posición (`layoutId`): el ojo ve
 * que es la misma selección cambiando de sitio. Se anuncia como grupo de
 * radios y se maneja con flechas, con una sola parada de tabulador.
 */

export interface Segmento<T extends string> {
    id: T;
    label: ReactNode;
    icono?: ReactNode;
    /** Contador junto a la etiqueta (pendientes, sin leer). */
    insignia?: number;
}

export interface SegmentedControlProps<T extends string> {
    segmentos: Segmento<T>[];
    activo: T;
    onChange: (id: T) => void;
    'aria-label': string;
    /** Ocupa todo el ancho, con segmentos iguales. Lo normal en móvil. */
    block?: boolean;
    size?: 'sm' | 'md';
    className?: string;
}

export function SegmentedControl<T extends string>({
    segmentos,
    activo,
    onChange,
    'aria-label': ariaLabel,
    block = false,
    size = 'md',
    className,
}: SegmentedControlProps<T>) {
    const grupo = useId();
    const raizRef = useRef<HTMLDivElement>(null);

    const alPulsarTecla = useCallback(
        (e: React.KeyboardEvent) => {
            const i = segmentos.findIndex((s) => s.id === activo);
            if (i === -1) return;
            let destino = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') destino = (i + 1) % segmentos.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') destino = (i - 1 + segmentos.length) % segmentos.length;
            else return;
            e.preventDefault();
            const siguiente = segmentos[destino];
            onChange(siguiente.id);
            requestAnimationFrame(() => {
                raizRef.current?.querySelector<HTMLButtonElement>(`[data-segmento="${siguiente.id}"]`)?.focus();
            });
        },
        [segmentos, activo, onChange]
    );

    return (
        <div
            ref={raizRef}
            role="radiogroup"
            aria-label={ariaLabel}
            onKeyDown={alPulsarTecla}
            className={cn(
                'relative items-stretch rounded-[11px] bg-[var(--fill-muted)] p-[3px]',
                block ? 'flex w-full' : 'inline-flex',
                className
            )}
        >
            {segmentos.map((s) => {
                const elegido = s.id === activo;
                return (
                    <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={elegido}
                        tabIndex={elegido ? 0 : -1}
                        data-segmento={s.id}
                        data-no-press
                        onClick={() => onChange(s.id)}
                        className={cn(
                            'relative flex min-w-0 items-center justify-center gap-1.5 rounded-[8px] px-3',
                            size === 'sm' ? 'h-7 text-t-xs' : 'h-8 text-t-sm',
                            block && 'flex-1',
                            'whitespace-nowrap transition-colors duration-fast ease-snap',
                            // La zona pulsable llega a 44 sin engordar la pista.
                            "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
                            elegido ? 'font-semibold text-ink' : 'font-medium text-ink-muted hover:text-ink'
                        )}
                    >
                        {elegido && (
                            <m.span
                                layoutId={`${grupo}-pastilla`}
                                aria-hidden="true"
                                className="absolute inset-0 rounded-[8px] bg-[var(--segment-thumb)] shadow-[0_1px_3px_oklch(0_0_0/0.14),0_0_0_0.5px_oklch(0_0_0/0.06)]"
                                transition={{ type: 'spring', stiffness: 560, damping: 44 }}
                            />
                        )}
                        {s.icono && (
                            <span className="relative shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
                                {s.icono}
                            </span>
                        )}
                        <span className="relative truncate">{s.label}</span>
                        {s.insignia != null && s.insignia > 0 && (
                            <span
                                className="relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-brand px-1.5 text-t-2xs font-semibold tabular-nums leading-none text-brand-ink"
                                aria-label={`${s.insignia} pendientes`}
                            >
                                {s.insignia > 99 ? '99+' : s.insignia}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
