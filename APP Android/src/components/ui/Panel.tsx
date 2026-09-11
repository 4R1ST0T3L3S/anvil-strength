import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/**
 * Contenedor de sección.
 *
 * Deliberadamente NO se llama "Card": `Panel` empieza PLANO y solo se eleva
 * cuando hay una razón.
 *
 *   flat    (por defecto) — agrupa sin dibujar caja. Casi siempre es lo correcto.
 *   outline                — se separa del fondo: la superficie de tarjeta del
 *                            sistema (formularios, listas, gráficas).
 *   raised                 — flota de verdad sobre el contenido.
 *
 * Nunca un panel dentro de otro panel: si hace falta, la jerarquía está mal.
 * El título va en frase y en seminegrita: la jerarquía no se grita.
 */

type Tone = 'flat' | 'outline' | 'raised';

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    tone?: Tone;
    /** Encabezado de sección. */
    title?: ReactNode;
    /** Contexto bajo el título. Debe aportar, no repetir el título. */
    description?: ReactNode;
    /** Acciones alineadas a la derecha del encabezado. */
    action?: ReactNode;
    /** Quita el relleno interno: para tablas y listas a sangre. */
    flush?: boolean;
    children: ReactNode;
}

const TONE: Record<Tone, string> = {
    flat: '',
    outline: 'bg-surface-raised border border-[var(--card-border)] shadow-card rounded-card',
    raised: 'bg-surface-overlay rounded-card shadow-float',
};

export function Panel({
    tone = 'flat',
    title,
    description,
    action,
    flush = false,
    className,
    children,
    ...props
}: PanelProps) {
    const padded = tone !== 'flat' && !flush;

    return (
        <section className={cn(TONE[tone], className)} {...props}>
            {(title || action) && (
                <header
                    className={cn(
                        'flex items-start justify-between gap-4',
                        padded ? 'px-4 pt-4 sm:px-5' : '',
                        'pb-3'
                    )}
                >
                    <div className="min-w-0">
                        {title && (
                            <h3 className="text-t-base font-semibold text-ink">
                                {title}
                            </h3>
                        )}
                        {description && (
                            <p className="mt-0.5 text-t-sm text-ink-muted">{description}</p>
                        )}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </header>
            )}

            <div className={cn(padded && 'px-4 pb-4 sm:px-5 sm:pb-5')}>{children}</div>
        </section>
    );
}
