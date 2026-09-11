import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — ESQUELETOS
 * =====================================================================
 *
 * 1. TIENEN LA FORMA DEL CONTENIDO FINAL: un esqueleto que no coincide
 *    produce un salto cuando llegan los datos, y el salto es peor que un
 *    giro — el giro no promete nada, el esqueleto promete una forma.
 *
 * 2. NADA DE ESQUELETO POR DEBAJO DE ~200 ms: aparecería y desaparecería
 *    antes de que el ojo lo procese. Para eso está `useEsqueletoDiferido`.
 *
 * `animate-pulse` y no un brillo que recorre: solo mueve `opacity`, que la
 * GPU resuelve sola. En una lista de veinte filas en un móvil se nota.
 */

const SUPERFICIE = 'rounded-card border border-[var(--card-border)] bg-surface-raised shadow-card';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
    className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
    return (
        <div
            // Un lector no anuncia cajas vacías: avisa el `aria-busy` del contenedor.
            aria-hidden="true"
            className={cn('animate-pulse rounded-field bg-[var(--fill-muted)]', className)}
            {...props}
        />
    );
}

/** Varias líneas de texto; la última más corta, como un párrafo real. */
export function SkeletonText({
    lineas = 3,
    className,
}: {
    lineas?: number;
    className?: string;
}) {
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            {Array.from({ length: lineas }, (_, i) => (
                <Skeleton
                    key={i}
                    className={cn('h-3.5', i === lineas - 1 && lineas > 1 ? 'w-3/5' : 'w-full')}
                />
            ))}
        </div>
    );
}

/** Fila con avatar: la forma de las listas de atletas y de la bandeja. */
export function SkeletonRow({ conAvatar = true, className }: { conAvatar?: boolean; className?: string }) {
    return (
        <div className={cn('flex items-center gap-3 px-4 py-3', className)}>
            {conAvatar && <Skeleton className="h-10 w-10 shrink-0 rounded-pill" />}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-10 shrink-0 rounded-pill" />
        </div>
    );
}

/** Una lista agrupada entera: filas dentro de una sola superficie. */
export function SkeletonList({ filas = 4, conAvatar = true, className }: { filas?: number; conAvatar?: boolean; className?: string }) {
    return (
        <div
            className={cn(SUPERFICIE, 'divide-y divide-[var(--separator)] overflow-hidden', className)}
            aria-busy="true"
            aria-live="polite"
        >
            <span className="sr-only">Cargando…</span>
            {Array.from({ length: filas }, (_, i) => (
                <SkeletonRow key={i} conAvatar={conAvatar} />
            ))}
        </div>
    );
}

export function SkeletonCard({ className }: { className?: string }) {
    return (
        <div className={cn(SUPERFICIE, 'flex flex-col gap-3 p-4', className)}>
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-6 w-3/5" />
            <SkeletonText lineas={2} />
        </div>
    );
}

/** La forma exacta de `StatTile`: etiqueta corta arriba, cifra grande debajo. */
export function SkeletonStat({ className }: { className?: string }) {
    return (
        <div className={cn(SUPERFICIE, 'flex flex-col gap-2 p-4', className)}>
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-3 w-16" />
        </div>
    );
}

/**
 * Una gráfica reserva su alto: sin él, la página salta cuando aparece. `alto`
 * tiene que ser el MISMO que el del contenedor de la gráfica. Barras de altura
 * fija: con `Math.random()` el esqueleto parecería vivo.
 */
const ALTURAS_BARRA = [45, 70, 55, 85, 60, 75, 40, 65, 80, 50, 72, 58];

export function SkeletonChart({ alto = 240, className }: { alto?: number; className?: string }) {
    return (
        <div
            className={cn(SUPERFICIE, 'flex flex-col gap-3 p-4', className)}
            style={{ height: alto }}
            aria-busy="true"
        >
            <Skeleton className="h-3 w-1/4 shrink-0" />
            <div className="flex min-h-0 flex-1 items-end gap-1.5">
                {ALTURAS_BARRA.map((h, i) => (
                    <Skeleton key={i} className="flex-1 rounded-chip" style={{ height: `${h}%` }} />
                ))}
            </div>
            <Skeleton className="h-2.5 w-full shrink-0" />
        </div>
    );
}

export function SkeletonTable({ filas = 5, columnas = 4, className }: { filas?: number; columnas?: number; className?: string }) {
    return (
        <div className={cn(SUPERFICIE, 'overflow-hidden', className)} aria-busy="true">
            <div className="flex gap-4 border-b border-[var(--separator)] px-4 py-3">
                {Array.from({ length: columnas }, (_, i) => (
                    <Skeleton key={i} className="h-3 flex-1" />
                ))}
            </div>
            {Array.from({ length: filas }, (_, f) => (
                <div key={f} className="flex gap-4 border-b border-[var(--separator)] px-4 py-3 last:border-0">
                    {Array.from({ length: columnas }, (_, c) => (
                        <Skeleton key={c} className="h-3.5 flex-1" />
                    ))}
                </div>
            ))}
        </div>
    );
}
