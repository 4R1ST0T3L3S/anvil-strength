import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — ESQUELETOS
 * =====================================================================
 *
 * QUÉ SUSTITUYE: 112 `animate-spin` repartidos por la aplicación, contra 5
 * ficheros que usaban el esqueleto que había (y que pintaba
 * `bg-surface-overlay/50`, un gris que no está en el sistema).
 *
 *
 * LAS DOS REGLAS QUE HACEN QUE UN ESQUELETO SIRVA
 *
 * 1. TIENE QUE PARECERSE AL CONTENIDO FINAL. Un esqueleto que no coincide
 *    produce un salto cuando llegan los datos, y un salto es peor que un
 *    giro: el giro no promete nada, el esqueleto promete una forma. Por eso
 *    esto no es un rectángulo genérico sino una familia de piezas con la
 *    forma de lo que viene.
 *
 * 2. NADA DE ESQUELETO POR DEBAJO DE ~200 ms. Para algo que tarda 80ms, el
 *    esqueleto aparece y desaparece antes de que el ojo lo procese, y el
 *    resultado es un parpadeo — que se lee como un fallo, no como una carga.
 *    Para eso está `useEsqueletoDiferido`.
 *
 *
 * POR QUÉ `animate-pulse` Y NO UN BRILLO QUE RECORRE
 *
 * El brillo desplazándose de izquierda a derecha anima `background-position`
 * o un `translate` sobre un degradado grande, y en una lista de veinte filas
 * son veinte capas pintándose en cada frame. `animate-pulse` solo mueve
 * `opacity`, que la GPU resuelve sola. En un móvil de gama media, con la
 * lista de atletas del entrenador, la diferencia se nota.
 */

// =====================================================================
// PIEZA BASE
// =====================================================================

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
    className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
    return (
        <div
            // `aria-hidden`: un lector no debe anunciar cajas vacías. Quien
            // avisa de que se está cargando es el `aria-busy` del contenedor.
            aria-hidden="true"
            className={cn('animate-pulse rounded-field bg-surface-overlay', className)}
            {...props}
        />
    );
}

// =====================================================================
// TEXTO
// =====================================================================

/**
 * Varias líneas de texto.
 *
 * La última sale más corta a propósito: un párrafo real no termina justo en
 * el margen, y unas líneas todas iguales se leen como una tabla, no como
 * prosa.
 */
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

// =====================================================================
// FILA DE LISTA
// =====================================================================

/** Con avatar a la izquierda: la forma de la lista de atletas del entrenador. */
export function SkeletonRow({ conAvatar = true, className }: { conAvatar?: boolean; className?: string }) {
    return (
        <div className={cn('flex items-center gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-4', className)}>
            {conAvatar && <Skeleton className="h-10 w-10 shrink-0 rounded-pill" />}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-8 w-16 shrink-0" />
        </div>
    );
}

export function SkeletonList({ filas = 4, conAvatar = true, className }: { filas?: number; conAvatar?: boolean; className?: string }) {
    return (
        <div className={cn('flex flex-col gap-2', className)} aria-busy="true" aria-live="polite">
            <span className="sr-only">Cargando…</span>
            {Array.from({ length: filas }, (_, i) => (
                <SkeletonRow key={i} conAvatar={conAvatar} />
            ))}
        </div>
    );
}

// =====================================================================
// TARJETA Y CIFRA
// =====================================================================

export function SkeletonCard({ className }: { className?: string }) {
    return (
        <div className={cn('flex flex-col gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-4', className)}>
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-6 w-3/5" />
            <SkeletonText lineas={2} />
        </div>
    );
}

/** La forma exacta de `StatTile`: etiqueta corta arriba, cifra grande debajo. */
export function SkeletonStat({ className }: { className?: string }) {
    return (
        <div className={cn('flex flex-col gap-2 rounded-card border border-[var(--border-default)] bg-surface-raised p-4', className)}>
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-3 w-16" />
        </div>
    );
}

// =====================================================================
// GRÁFICA
// =====================================================================

/**
 * El caso donde reservar la altura importa más que en ningún otro: una
 * gráfica de recharts mide 240-320px, y si el hueco no está reservado, la
 * página entera salta hacia abajo cuando aparece. `alto` tiene que ser el
 * MISMO que se le pase después al contenedor de la gráfica.
 *
 * Las barras van con alturas fijas y no aleatorias: `Math.random()` daría un
 * dibujo distinto en cada render y el esqueleto parecería estar vivo.
 */
const ALTURAS_BARRA = [45, 70, 55, 85, 60, 75, 40, 65, 80, 50, 72, 58];

export function SkeletonChart({ alto = 240, className }: { alto?: number; className?: string }) {
    return (
        <div
            className={cn('flex flex-col gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-4', className)}
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

// =====================================================================
// TABLA
// =====================================================================

export function SkeletonTable({ filas = 5, columnas = 4, className }: { filas?: number; columnas?: number; className?: string }) {
    return (
        <div className={cn('overflow-hidden rounded-card border border-[var(--border-default)]', className)} aria-busy="true">
            <div className="flex gap-4 border-b border-subtle bg-surface-raised px-4 py-3">
                {Array.from({ length: columnas }, (_, i) => (
                    <Skeleton key={i} className="h-3 flex-1" />
                ))}
            </div>
            {Array.from({ length: filas }, (_, f) => (
                <div key={f} className="flex gap-4 border-b border-subtle px-4 py-3 last:border-0">
                    {Array.from({ length: columnas }, (_, c) => (
                        <Skeleton key={c} className="h-3.5 flex-1" />
                    ))}
                </div>
            ))}
        </div>
    );
}
