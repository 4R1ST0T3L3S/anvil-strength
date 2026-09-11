import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Botón que solo lleva icono.
 *
 * Dos obligaciones que un botón con texto no tiene y que se olvidan siempre:
 *
 *   1. `aria-label` OBLIGATORIO: es el único texto que tiene. No compila sin él.
 *   2. El área pulsable la fija el componente: el círculo se ve de 36-40px y
 *      un pseudo-elemento lo estira a 44 para el pulgar.
 *
 * Circular, como los botones de herramientas de iOS: sin fondo en reposo,
 * relleno suave al pasar o pulsar. `relleno` lo deja siempre visible (cerrar
 * una hoja, el "más opciones" de una cabecera).
 */

type Tono = 'neutro' | 'marca' | 'peligro' | 'relleno';
type Tamano = 'sm' | 'md';

const TONO: Record<Tono, string> = {
    neutro: 'text-ink-muted hover:bg-[var(--fill-hover)] hover:text-ink active:bg-[var(--fill-pressed)]',
    marca: 'text-brand-text hover:bg-[var(--brand-quiet)] active:bg-[var(--brand-quiet-strong)]',
    peligro: 'text-ink-muted hover:bg-[var(--danger-quiet)] hover:text-danger-text',
    relleno: 'bg-[var(--fill-muted)] text-ink-muted hover:bg-[var(--fill-strong)] hover:text-ink',
};

const TAMANO: Record<Tamano, string> = {
    sm: "h-9 w-9 [&>svg]:h-[18px] [&>svg]:w-[18px] before:absolute before:-inset-1 before:content-['']",
    md: "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5 before:absolute before:-inset-0.5 before:content-['']",
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    /** Qué hace el botón. Obligatorio: es el único texto que tiene. */
    'aria-label': string;
    icon: ReactNode;
    tono?: Tono;
    size?: Tamano;
    loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
    { icon, tono = 'neutro', size = 'md', loading = false, disabled, className, type = 'button', ...props },
    ref
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(
                'relative inline-flex shrink-0 items-center justify-center rounded-pill',
                'transition-[background-color,color] duration-fast ease-snap',
                'disabled:cursor-not-allowed disabled:opacity-40',
                TONO[tono],
                TAMANO[size],
                className
            )}
            {...props}
        >
            {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : icon}
        </button>
    );
});
