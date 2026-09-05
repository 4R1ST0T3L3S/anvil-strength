import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Estado vacío.
 *
 * Un estado vacío enseña la interfaz; no anuncia que no hay nada. "Aún no
 * tienes bloques" no sirve de nada por sí solo: hay que decir qué es un
 * bloque y ofrecer el primer paso.
 *
 * Tres registros distintos, porque no son lo mismo:
 *   empty  — todavía no hay datos. Es una oportunidad: enseña y propone.
 *   filter — hay datos, pero el filtro los oculta. La salida es limpiar.
 *   error  — algo falló. La salida es reintentar, y se dice qué pasó.
 */

type Kind = 'empty' | 'filter' | 'error';

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
                'flex flex-col items-center justify-center px-6 py-12 text-center',
                className
            )}
            // El error interrumpe una tarea en curso, así que se anuncia;
            // un estado vacío es parte de la página y no debe interrumpir.
            role={kind === 'error' ? 'alert' : undefined}
        >
            {icon && (
                <div
                    className={cn(
                        'mb-4 flex h-11 w-11 items-center justify-center rounded-card',
                        kind === 'error'
                            ? 'bg-[var(--danger-quiet)] text-danger-text'
                            : 'bg-surface-raised text-ink-faint'
                    )}
                    aria-hidden="true"
                >
                    {icon}
                </div>
            )}

            <p className="text-base font-medium text-ink">{title}</p>

            {body && (
                <p className="mt-1.5 max-w-[42ch] text-sm text-ink-muted">{body}</p>
            )}

            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
