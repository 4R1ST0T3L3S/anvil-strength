import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/**
 * Contenedor de sección.
 *
 * Deliberadamente NO se llama "Card": la tarjeta es la respuesta perezosa y
 * la app ya arrastra pantallas enteras de rectángulos idénticos. `Panel`
 * empieza plano y solo se eleva cuando hay una razón.
 *
 *   flat    (por defecto) — agrupa sin dibujar caja. Es lo correcto la
 *                           mayoría de las veces.
 *   outline                — necesita separarse del fondo (formularios, listas).
 *   raised                 — flota de verdad sobre el contenido (popovers).
 *
 * Nunca borde y sombra a la vez como decoración, y nunca un panel dentro
 * de otro panel: si te hace falta, la jerarquía está mal.
 */

type Tone = 'flat' | 'outline' | 'raised';

// `title` se omite del tipo nativo: aquí es un nodo de encabezado, no el
// atributo HTML que muestra un tooltip del navegador.
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
    outline: 'bg-surface-raised border border-[var(--border-default)] rounded-card',
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
                        padded ? 'px-4 pt-4' : '',
                        'pb-3'
                    )}
                >
                    <div className="min-w-0">
                        {title && (
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                                {title}
                            </h3>
                        )}
                        {description && (
                            <p className="mt-1 text-sm text-ink-subtle">{description}</p>
                        )}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </header>
            )}

            <div className={cn(padded && 'px-4 pb-4')}>{children}</div>
        </section>
    );
}
