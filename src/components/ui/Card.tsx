import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — TARJETA
 * =====================================================================
 *
 * POR QUÉ EXISTE, SI YA HAY `Panel`
 *
 * `Panel` agrupa una SECCIÓN de una pantalla: tiene título, descripción y
 * acciones, y empieza plano porque casi nunca hace falta elevar nada.
 *
 * `Card` es otra cosa: una FILA de una lista que se puede pulsar. Un atleta
 * del equipo, un bloque de entrenamiento, una competición. Hay unas 150
 * escritas a mano por la aplicación y cada una inventa su propio hover
 * (`hover:bg-white/5`, `hover:border-brand/30`, `hover:scale-105`), o no
 * tiene ninguno.
 *
 *
 * LA DECISIÓN QUE IMPORTA: BOTÓN O DIV
 *
 * Si `onClick` está puesto, esto renderiza un `<button>` de verdad. No un
 * `<div onClick>`. La diferencia no es estética:
 *
 *   · Un `div` con `onClick` no recibe foco con el tabulador.
 *   · No se activa con Intro ni con Espacio.
 *   · Un lector de pantalla no lo anuncia como algo pulsable.
 *
 * Hay siete de esos en la aplicación ahora mismo. Aquí no puede haber más:
 * o hay `onClick` y sale un botón, o no lo hay y sale un `div` que no
 * pretende ser pulsable.
 *
 *
 * EL LENGUAJE DE HOVER, EN UN SITIO
 *
 * El borde sube de `subtle` a `strong` y aparece un fondo elevado. Solo se
 * anima `border-color` y `background-color`, y con `--dur-fast`. Nada de
 * `scale` al pasar por encima: una lista de doce tarjetas donde cada una
 * crece al rozarla se lee como una superficie inestable. El `scale(0.99)` al
 * PULSAR sí está, porque eso es acuse de recibo.
 */

type Tono = 'plano' | 'contorno' | 'elevado';

const TONO: Record<Tono, string> = {
    plano: 'bg-surface-raised',
    contorno: 'bg-surface-raised border border-[var(--border-default)]',
    elevado: 'bg-surface-overlay shadow-float',
};

const TONO_ACTIVABLE: Record<Tono, string> = {
    plano: 'hover:bg-surface-overlay',
    contorno: 'hover:border-[var(--border-strong)] hover:bg-surface-overlay',
    elevado: 'hover:bg-surface-overlay hover:shadow-overlay',
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
        'w-full rounded-card text-left',
        'transition-[background-color,border-color,box-shadow] duration-fast ease-snap',
        TONO[tono],
        !flush && 'p-4',
        // El estado activo se marca con borde Y fondo de marca, no solo con
        // color de texto: en una lista larga hay que poder ver cuál está
        // elegida sin leerla.
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
            aria-current={activa ? 'true' : undefined}
            className={cn(
                comun,
                TONO_ACTIVABLE[tono],
                'active:scale-[0.99]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]'
            )}
            {...(props as HTMLAttributes<HTMLButtonElement>)}
        >
            {children}
        </button>
    );
});
