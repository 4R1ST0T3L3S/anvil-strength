import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Botón del sistema de diseño.
 *
 * Sustituye a los ~274 <button> con clases sueltas repartidos por la app.
 * Cubre los siete estados obligatorios: reposo, hover, foco, pulsado,
 * deshabilitado, cargando y destructivo.
 *
 * Un solo elemento decide su peso visual mediante `variant`; si necesitas
 * un botón que no encaja en ninguna variante, casi siempre lo que falla es
 * la jerarquía de la pantalla, no el sistema.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    /** Muestra spinner y bloquea la interacción. El ancho no cambia. */
    loading?: boolean;
    /** Icono a la izquierda del texto. Se oculta mientras carga. */
    icon?: ReactNode;
    /** Ocupa todo el ancho disponible. Habitual en móvil y en modales. */
    block?: boolean;
}

const VARIANT: Record<Variant, string> = {
    // Acción primaria. Una por pantalla; dos primarios significan que la
    // pantalla no ha decidido qué quiere que hagas.
    primary:
        'bg-brand text-brand-ink hover:bg-brand-hover active:bg-brand-active',

    // Acción secundaria: borde, sin relleno. Nunca borde + sombra a la vez.
    secondary:
        'bg-surface-raised text-ink border border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-surface-overlay active:bg-surface-raised',

    // Terciaria. Para acciones de fila y barras de herramientas densas.
    ghost:
        'bg-transparent text-ink-muted hover:bg-surface-raised hover:text-ink active:bg-surface-overlay',

    // Destructiva. Distinta de `primary` pese a compartir familia de color:
    // borrar un bloque de entrenamiento no puede parecerse a guardarlo.
    danger:
        'bg-transparent text-danger-text border border-[var(--danger-quiet)] hover:bg-[var(--danger-quiet)] active:border-danger',
};

/**
 * ZONA PULSABLE DE 44px SIN ENGORDAR EL BOTÓN.
 *
 * `DESIGN.md` fija el suelo en 44px porque esta aplicación se usa de pie, en
 * un gimnasio, con una mano y el móvil moviéndose. Pero `sm` mide 32 y `md`
 * 40: subirlos a 44 rompería las barras de herramientas densas y haría que
 * un botón secundario pesara visualmente lo mismo que el primario.
 *
 * La salida es la misma que ya usa el registro de series: un pseudo-elemento
 * que estira la zona SENSIBLE por arriba y por abajo sin cambiar lo que se
 * ve. `sm` gana 6px por lado (32 → 44) y `md` gana 2 (40 → 44). `lg` ya mide
 * 48 y no necesita nada.
 *
 * `before:content-['']` es obligatorio: sin él el pseudo-elemento no existe.
 */
const SIZE: Record<Size, string> = {
    sm: "h-8 px-3 text-xs gap-1.5 rounded-field before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']",
    md: "h-10 px-4 text-sm gap-2 rounded-field before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-['']",
    lg: 'h-12 px-6 text-base gap-2 rounded-card',
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
        ...props
    },
    ref
) {
    const isDisabled = disabled || loading;

    return (
        <button
            ref={ref}
            disabled={isDisabled}
            // Los lectores de pantalla necesitan saber que está ocupado;
            // el spinner solo lo comunica visualmente.
            aria-busy={loading || undefined}
            className={cn(
                'relative inline-flex items-center justify-center',
                'font-medium whitespace-nowrap select-none',
                'transition-colors duration-fast ease-snap',
                // El anillo de foco solo aparece en navegación por teclado:
                // con :focus a secas también saldría al pulsar con el ratón,
                // que es la razón por la que tanta gente lo acaba quitando.
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
                // Deshabilitado: se atenúa, no cambia de color. Cambiar el
                // color haría pensar que es otro tipo de botón.
                'disabled:opacity-45 disabled:cursor-not-allowed',
                VARIANT[variant],
                SIZE[size],
                block && 'w-full',
                className
            )}
            {...props}
        >
            {/* El contenido se mantiene en el flujo y solo se hace invisible:
                así el botón no cambia de ancho al empezar a cargar, que es
                lo que produce el salto de layout típico al pulsar guardar. */}
            <span
                className={cn(
                    'inline-flex items-center gap-[inherit]',
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
