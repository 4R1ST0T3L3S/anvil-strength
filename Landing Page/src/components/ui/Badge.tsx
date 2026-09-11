import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * INSIGNIAS, CONTADORES Y PUNTOS
 * =====================================================================
 *
 * Tres piezas pequeñas con tres trabajos distintos:
 *
 *   Badge    — una ETIQUETA de estado ("Modificado", "Revisado", "Sin plan").
 *              Relleno suave y texto del mismo tono.
 *   Contador — CUÁNTOS hay pendientes (mensajes, entrenamientos por revisar).
 *              Rojo lleno: pide atención, que es el trabajo del acento.
 *   Punto    — hay ALGO nuevo, sin número (un elemento sin leer en una lista).
 */

type Tono = 'neutro' | 'marca' | 'exito' | 'aviso' | 'peligro' | 'info';

const TONO: Record<Tono, string> = {
    neutro: 'bg-[var(--fill-muted)] text-ink-muted',
    marca: 'bg-[var(--brand-quiet)] text-brand-text',
    exito: 'bg-success-quiet text-success',
    aviso: 'bg-warning-quiet text-warning',
    peligro: 'bg-[var(--danger-quiet)] text-danger-text',
    info: 'bg-info-quiet text-info',
};

export function Badge({
    children,
    tono = 'neutro',
    icono,
    className,
}: {
    children: ReactNode;
    tono?: Tono;
    icono?: ReactNode;
    className?: string;
}) {
    return (
        <span
            className={cn(
                'inline-flex h-[22px] shrink-0 items-center gap-1 rounded-pill px-2 text-t-xs font-semibold leading-none',
                '[&>svg]:h-3 [&>svg]:w-3',
                TONO[tono],
                className
            )}
        >
            {icono}
            {children}
        </span>
    );
}

export function Contador({
    n,
    max = 99,
    className,
    'aria-label': ariaLabel,
}: {
    n: number;
    max?: number;
    className?: string;
    'aria-label'?: string;
}) {
    if (n <= 0) return null;
    return (
        <span
            aria-label={ariaLabel}
            className={cn(
                'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-brand px-1.5',
                'text-t-2xs font-semibold tabular-nums leading-none text-brand-ink',
                className
            )}
        >
            {n > max ? `${max}+` : n}
        </span>
    );
}

export function Punto({ className, 'aria-label': ariaLabel }: { className?: string; 'aria-label'?: string }) {
    return (
        <span
            role={ariaLabel ? 'img' : undefined}
            aria-label={ariaLabel}
            aria-hidden={ariaLabel ? undefined : true}
            className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-pill bg-brand', className)}
        />
    );
}
