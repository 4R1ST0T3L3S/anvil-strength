import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — CIFRA DESTACADA
 * =====================================================================
 *
 * Sustituye a unas 30 cifras grandes escritas a mano por los paneles, cada
 * una con su tamaño de letra y su forma de decir si sube o baja.
 *
 *
 * TRES DECISIONES QUE PARECEN DETALLES
 *
 * 1. `tabular-nums`, siempre. Es global en `index.css`, pero aquí importa
 *    especialmente: sin cifras de igual anchura, un total que pasa de 97,5 a
 *    100 desplaza la fila entera al re-renderizar, y en un panel con seis
 *    cifras eso se lee como que la pantalla "baila".
 *
 * 2. La unidad va en un `<span>` más pequeño y apagado, no dentro del
 *    número. "140 kg" con el "kg" al mismo peso que el 140 hace que el ojo
 *    tenga que separar dos cosas; con la unidad apagada, el número se lee
 *    solo.
 *
 * 3. La tendencia NO se comunica solo con color. Verde y rojo son
 *    exactamente los dos que no distingue la forma más común de daltonismo,
 *    y esta app va de números que suben y bajan. Por eso lleva flecha, y la
 *    flecha lleva texto para el lector.
 *
 *
 * QUÉ ES "BUENO" CUANDO UN NÚMERO BAJA
 *
 * Depende del número: subir el total es bueno, subir el peso corporal en
 * una bajada de categoría no. Por eso la dirección y el juicio están
 * separados: `tendencia` dice hacia dónde va, y `bajarEsBueno` dice cómo
 * hay que pintarlo. Sin esa separación, la tarjeta de peso corporal miente.
 */

export interface StatTileProps {
    label: ReactNode;
    /** El número, ya formateado. Se pinta en `text-metric`. */
    valor: ReactNode;
    unidad?: ReactNode;
    /** Contexto bajo la cifra: "vs. la semana pasada", "media de 4 semanas". */
    nota?: ReactNode;
    /** Variación respecto al periodo anterior, ya formateada ("+5,2%"). */
    tendencia?: { direccion: 'sube' | 'baja' | 'igual'; texto: ReactNode };
    /** Invierte el juicio: bajar se pinta como logro. */
    bajarEsBueno?: boolean;
    /** Icono decorativo en la esquina. */
    icono?: ReactNode;
    className?: string;
}

export function StatTile({
    label,
    valor,
    unidad,
    nota,
    tendencia,
    bajarEsBueno = false,
    icono,
    className,
}: StatTileProps) {
    const bueno =
        tendencia?.direccion === 'igual'
            ? null
            : tendencia
                ? (tendencia.direccion === 'sube') !== bajarEsBueno
                : null;

    const Flecha =
        tendencia?.direccion === 'sube'
            ? ArrowUpRight
            : tendencia?.direccion === 'baja'
                ? ArrowDownRight
                : ArrowRight;

    return (
        <div
            className={cn(
                'relative flex flex-col gap-1 overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-4',
                className
            )}
        >
            {icono && (
                <span
                    className="pointer-events-none absolute -right-3 -top-2 text-ink-faint opacity-20 [&>svg]:h-16 [&>svg]:w-16"
                    aria-hidden="true"
                >
                    {icono}
                </span>
            )}

            <p className="text-t-2xs font-bold uppercase tracking-[0.12em] text-ink-subtle">
                {label}
            </p>

            <p className="flex items-baseline gap-1.5 text-metric font-black tabular-nums text-ink">
                {valor}
                {unidad && (
                    <span className="text-t-base font-semibold text-ink-subtle">{unidad}</span>
                )}
            </p>

            {(tendencia || nota) && (
                <div className="mt-0.5 flex items-center gap-2 text-t-xs">
                    {tendencia && (
                        <span
                            className={cn(
                                'inline-flex items-center gap-0.5 font-bold tabular-nums',
                                bueno === null ? 'text-ink-subtle' : bueno ? 'text-success' : 'text-danger'
                            )}
                        >
                            <Flecha className="h-3.5 w-3.5" aria-hidden="true" />
                            {/* El texto que oye un lector: sin esto, la flecha
                                es una imagen sin significado y el signo del
                                número no dice si es bueno o malo. */}
                            <span className="sr-only">
                                {tendencia.direccion === 'sube' ? 'Sube' : tendencia.direccion === 'baja' ? 'Baja' : 'Se mantiene'}
                                {bueno === null ? '' : bueno ? ', a mejor' : ', a peor'}:{' '}
                            </span>
                            {tendencia.texto}
                        </span>
                    )}
                    {nota && <span className="min-w-0 truncate text-ink-subtle">{nota}</span>}
                </div>
            )}
        </div>
    );
}
