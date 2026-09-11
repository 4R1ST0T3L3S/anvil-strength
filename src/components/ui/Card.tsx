import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — TARJETA
 * =====================================================================
 *
 * `Panel` agrupa una SECCIÓN con título; `Card` es un elemento de una lista
 * que se puede pulsar (un atleta, un bloque, una competición). Para filas
 * de ajustes o de bandeja, mejor `List` + `ListRow`: agrupar filas en una
 * sola superficie es más limpio que una columna de tarjetas sueltas.
 *
 * BOTÓN O DIV. Con `onClick` se renderiza un `<button>` de verdad (foco con
 * el tabulador, Intro y Espacio, anunciado como pulsable). Sin `onClick`, un
 * `div` que no finge serlo.
 *
 * EL HOVER Y LA PULSACIÓN son una CAPA DE ESTADO (el `after:`) con los
 * rellenos del sistema, que funciona igual en claro y en oscuro. Nada de
 * `scale` al pasar por encima; al PULSAR, un 1,5 % — la escala global de
 * index.css (3 %) es para botones pequeños y en una tarjeta grande se lee
 * como un temblor, y además movía el objetivo bajo el dedo (ver la nota de
 * hitbox en el historial). Por eso lleva `data-no-press`.
 */

type Tono = 'plano' | 'contorno' | 'elevado';

const TONO: Record<Tono, string> = {
    plano: 'bg-surface-raised',
    contorno: 'bg-surface-raised border border-[var(--card-border)] shadow-card',
    elevado: 'bg-surface-overlay shadow-float',
};

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    tono?: Tono;
    /** Si se pasa, la tarjeta se renderiza como `<button>`. */
    onClick?: () => void;
    /** Marca la tarjeta como la seleccionada de la lista. */
    activa?: boolean;
    /** Quita el relleno interno: para tarjetas con imagen a sangre. */
    flush?: boolean;
    children: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
    { tono = 'contorno', onClick, activa = false, flush = false, className, children, ...props },
    ref
) {
    const comun = cn(
        'relative w-full rounded-card text-left',
        TONO[tono],
        !flush && 'p-4',
        // Seleccionada: fondo y borde de marca, no solo color de texto.
        activa && 'border-[var(--brand-line)] bg-[var(--brand-quiet)]',
        className
    );

    if (!onClick) {
        return (
            <div ref={ref} className={comun} {...props}>
                {children}
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            data-no-press
            aria-current={activa ? 'true' : undefined}
            className={cn(
                comun,
                'transition-transform duration-fast ease-snap active:scale-[0.985]',
                "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-[var(--fill-hover)] after:opacity-0 after:transition-opacity after:duration-fast after:content-['']",
                'hover:after:opacity-100 active:after:bg-[var(--fill-pressed)] active:after:opacity-100'
            )}
            {...(props as HTMLAttributes<HTMLButtonElement>)}
        >
            {children}
        </button>
    );
});
