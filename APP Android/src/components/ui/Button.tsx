import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Botón del sistema de diseño.
 *
 * Siete estados cubiertos: reposo, hover, foco, pulsado, deshabilitado,
 * cargando y destructivo. El peso visual lo decide `variant`; si un botón no
 * encaja en ninguna, casi siempre falla la jerarquía de la pantalla.
 *
 *   primary   — la acción principal. UNA por pantalla, en rojo Anvil.
 *   secondary — relleno gris translúcido, sin borde: la acción de al lado.
 *   tinted    — rojo suave con texto rojo: una acción destacada que no es la
 *               principal (el "Responder" de una notificación).
 *   ghost     — solo texto: barras de herramientas y acciones de fila.
 *   danger    — rojo de peligro suave. Borrar no se parece a guardar.
 */

type Variant = 'primary' | 'secondary' | 'tinted' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    /** Muestra spinner y bloquea la interacción. El ancho no cambia. */
    loading?: boolean;
    /** Icono a la izquierda del texto. Se oculta mientras carga. */
    icon?: ReactNode;
    /** Ocupa todo el ancho disponible. Habitual en móvil y en hojas. */
    block?: boolean;
}

const VARIANT: Record<Variant, string> = {
    primary:
        'bg-brand text-brand-ink hover:bg-brand-hover active:bg-brand-active',
    secondary:
        'bg-[var(--fill-muted)] text-ink hover:bg-[var(--fill-strong)] active:bg-[var(--fill-pressed)]',
    tinted:
        'bg-[var(--brand-quiet)] text-brand-text hover:bg-[var(--brand-quiet-strong)]',
    ghost:
        'bg-transparent text-ink-muted hover:bg-[var(--fill-hover)] hover:text-ink active:bg-[var(--fill-pressed)]',
    danger:
        'bg-[var(--danger-quiet)] text-danger-text hover:bg-[var(--danger-quiet-strong)]',
};

/**
 * ZONA PULSABLE DE 44px SIN ENGORDAR EL BOTÓN: `sm` mide 32 y `md` 40, y un
 * pseudo-elemento estira la zona SENSIBLE por arriba y por abajo sin cambiar
 * lo que se ve. `lg` ya mide 48.
 */
const SIZE: Record<Size, string> = {
    sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[9px] before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']",
    md: "h-10 px-4 text-t-sm gap-2 rounded-field before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-['']",
    lg: 'h-12 px-5 text-t-base gap-2 rounded-[12px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = 'secondary',
        size = 'md',
        loading = false,
        icon,
        block = false,
        disabled,
        className,
        children,
        type = 'button',
        ...props
    },
    ref
) {
    const isDisabled = disabled || loading;

    return (
        <button
            ref={ref}
            type={type}
            disabled={isDisabled}
            // Los lectores de pantalla necesitan saber que está ocupado.
            aria-busy={loading || undefined}
            className={cn(
                'relative inline-flex items-center justify-center',
                'font-semibold leading-none whitespace-nowrap select-none',
                'transition-[background-color,color,transform] duration-fast ease-snap',
                // Deshabilitado: se atenúa, no cambia de color. Cambiar el
                // color haría pensar que es otro tipo de botón.
                'disabled:cursor-not-allowed disabled:opacity-40',
                VARIANT[variant],
                SIZE[size],
                block && 'w-full',
                className
            )}
            {...props}
        >
            {/* El contenido se queda en el flujo e invisible mientras carga:
                así el botón no cambia de ancho al pulsar guardar. */}
            <span
                className={cn(
                    'inline-flex items-center gap-[inherit] [&>svg]:shrink-0',
                    loading && 'invisible'
                )}
            >
                {icon}
                {children}
            </span>

            {loading && (
                <Loader2
                    className="absolute h-4 w-4 animate-spin"
                    aria-hidden="true"
                />
            )}
        </button>
    );
});
