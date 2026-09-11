import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Estado vacío.
 *
 * Un estado vacío enseña la interfaz; no anuncia que no hay nada. "Aún no
 * tienes bloques" por sí solo no sirve: hay que decir qué es y ofrecer el
 * primer paso.
 *
 *   empty  — todavía no hay datos. Enseña y propone.
 *   filter — hay datos, pero el filtro los oculta. La salida es limpiar.
 *   error  — algo falló. La salida es reintentar, y se dice qué pasó.
 *   done   — no queda nada pendiente, y eso es una BUENA noticia (la bandeja
 *            al día). Se dice con calma, sin confeti.
 */

type Kind = 'empty' | 'filter' | 'error' | 'done';

export interface EmptyStateProps {
    kind?: Kind;
    icon?: ReactNode;
    title: string;
    /** Qué es esto y qué gana el usuario al crearlo. */
    body?: string;
    /** Acción principal. En `empty` debe crear el primer elemento. */
    action?: ReactNode;
    className?: string;
}

const ICONO: Record<Kind, string> = {
    empty: 'bg-[var(--fill-muted)] text-ink-muted',
    filter: 'bg-[var(--fill-muted)] text-ink-muted',
    error: 'bg-[var(--danger-quiet)] text-danger-text',
    done: 'bg-success-quiet text-success',
};

export function EmptyState({
    kind = 'empty',
    icon,
    title,
    body,
    action,
    className,
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center px-6 py-14 text-center',
                className
            )}
            // El error interrumpe una tarea en curso, así que se anuncia; un
            // estado vacío es parte de la página y no debe interrumpir.
            role={kind === 'error' ? 'alert' : undefined}
        >
            {icon && (
                <div
                    className={cn(
                        'mb-4 flex h-12 w-12 items-center justify-center rounded-pill [&>svg]:h-[22px] [&>svg]:w-[22px]',
                        ICONO[kind]
                    )}
                    aria-hidden="true"
                >
                    {icon}
                </div>
            )}

            <p className="text-t-base font-semibold text-ink">{title}</p>

            {body && (
                <p className="mt-1.5 max-w-[40ch] text-t-sm leading-relaxed text-ink-muted">{body}</p>
            )}

            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
