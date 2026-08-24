import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Botón que solo lleva icono.
 *
 * POR QUÉ ES UNA PRIMITIVA APARTE Y NO UNA VARIANTE DE `Button`
 *
 * Porque tiene dos obligaciones que un botón con texto no tiene, y las dos
 * se olvidan sistemáticamente cuando se escribe a mano:
 *
 *   1. `aria-label` es OBLIGATORIO. Sin él, quien navega con lector oye
 *      "botón" y nada más. Aquí el tipo lo exige, así que no se puede
 *      olvidar: no compila.
 *
 *   2. El área pulsable la fija el componente, no quien lo usa. Los ~200
 *      botones de icono de la aplicación medían entre 24 y 40px; el pulgar
 *      necesita 44. El icono sigue siendo pequeño —un icono de 40px se ve
 *      infantil—, lo que crece es la zona sensible alrededor.
 *
 * `tono` decide qué comunica el control, y sigue el mismo lenguaje de hover
 * que el resto del sistema: el color sube un escalón y aparece un fondo.
 */

type Tono = 'neutro' | 'marca' | 'peligro';
type Tamano = 'sm' | 'md';

const TONO: Record<Tono, string> = {
    neutro: 'text-ink-muted hover:bg-surface-raised hover:text-ink',
    marca: 'text-brand-text hover:bg-[var(--brand-quiet)]',
    peligro: 'text-ink-muted hover:bg-[var(--danger-quiet)] hover:text-danger-text',
};

/**
 * Los dos tamaños se refieren al ICONO, no al botón: el botón siempre mide
 * 44 de alto. `sm` reduce el ancho a 36 para barras de herramientas densas,
 * y ahí la altura sigue siendo suficiente porque el dedo falla más en
 * vertical que en horizontal.
 */
const TAMANO: Record<Tamano, string> = {
    sm: 'h-11 w-9 [&>svg]:h-4 [&>svg]:w-4',
    md: 'h-11 w-11 [&>svg]:h-5 [&>svg]:w-5',
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
    { icon, tono = 'neutro', size = 'md', loading = false, disabled, className, ...props },
    ref
) {
    return (
        <button
            ref={ref}
            type="button"
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-field',
                'transition-colors duration-fast ease-snap',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
                'disabled:cursor-not-allowed disabled:opacity-45',
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
