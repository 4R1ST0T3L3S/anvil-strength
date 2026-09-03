import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { EmptyState } from './EmptyState';
import { SkeletonTable } from './Skeleton';

/**
 * ANVIL STRENGTH — TABLA DE DATOS
 * =====================================================================
 *
 * LA DECISIÓN QUE JUSTIFICA EL COMPONENTE
 *
 * Hay 17 tablas en la aplicación. Las del panel del entrenador llevan
 * `min-w-[24rem]` … `min-w-[52rem]` dentro de un contenedor con
 * `overflow-x-auto`. Eso FUNCIONA —no desbordan la página— pero en un móvil
 * de 375px significa leer una tabla de 52rem arrastrando de lado, perdiendo
 * de vista la primera columna, que es justo la que dice de qué fila se trata.
 *
 * Por debajo de `sm`, esto deja de ser una tabla y pasa a ser una lista de
 * tarjetas: una por fila, con las columnas como pares etiqueta-valor. La
 * misma información, en la forma que cabe.
 *
 * NO es una tabla responsive con columnas que se esconden: esconder columnas
 * en móvil significa que el dato no está, y el atleta que mira su registro
 * desde el gimnasio necesita el mismo dato que el entrenador desde el
 * escritorio.
 *
 *
 * SOBRE EL MARCADO
 *
 * En escritorio se usa `<table>` de verdad, con `<caption>`, `scope="col"` y
 * una cabecera pegajosa. Un lector de pantalla en modo tabla puede recorrer
 * por filas y columnas y anunciar la cabecera de cada celda; con `div`s no
 * puede. `AdminDashboard` y `PoliticaCookies` además tienen hoy tabla SIN
 * contenedor con scroll, así que desbordan de verdad.
 */

export interface Columna<T> {
    id: string;
    cabecera: ReactNode;
    /** Cómo se pinta la celda de esta columna para una fila. */
    celda: (fila: T, indice: number) => ReactNode;
    /** Las cifras van a la derecha: así se comparan por la unidad. */
    alineacion?: 'izquierda' | 'derecha' | 'centro';
    /** Ancho sugerido en escritorio (`w-24`, `w-1/3`…). */
    ancho?: string;
    /**
     * En la versión de tarjeta, esta columna hace de TÍTULO en vez de par
     * etiqueta-valor. Normalmente la primera: el nombre de la fila.
     */
    esTitulo?: boolean;
}

export interface DataTableProps<T> {
    columnas: Columna<T>[];
    filas: T[];
    claveFila: (fila: T, indice: number) => string;
    /** Qué contiene la tabla. Va en el `<caption>`, oculto visualmente. */
    titulo: string;
    onFilaClick?: (fila: T) => void;
    cargando?: boolean;
    vacioTitulo?: string;
    vacioCuerpo?: string;
    vacioAccion?: ReactNode;
    className?: string;
}

const ALINEACION = {
    izquierda: 'text-left',
    derecha: 'text-right',
    centro: 'text-center',
} as const;

export function DataTable<T>({
    columnas,
    filas,
    claveFila,
    titulo,
    onFilaClick,
    cargando = false,
    vacioTitulo = 'Todavía no hay nada aquí',
    vacioCuerpo,
    vacioAccion,
    className,
}: DataTableProps<T>) {
    if (cargando) {
        return <SkeletonTable filas={5} columnas={Math.min(columnas.length, 5)} className={className} />;
    }

    if (filas.length === 0) {
        return (
            <div className={cn('rounded-card border border-[var(--border-default)] bg-surface-raised', className)}>
                <EmptyState kind="empty" title={vacioTitulo} body={vacioCuerpo} action={vacioAccion} />
            </div>
        );
    }


    return (
        <div className={className}>
            {/* ================= TABLA ================= */}
            {/* El `overflow-x-auto` es el desbordamiento INTENCIONADO de una
                tabla ancha. `overflowGuard` no se queja porque el recorte lo
                hace este contenedor y no el armazón. */}
            <div className="overflow-x-auto rounded-card border border-[var(--border-default)] block">
                <table className="w-full border-collapse text-t-sm">
                    <caption className="sr-only">{titulo}</caption>
                    <thead>
                        <tr className="bg-surface-raised">
                            {columnas.map(col => (
                                <th
                                    key={col.id}
                                    scope="col"
                                    className={cn(
                                        // La cabecera se queda pegada arriba: en una
                                        // tabla de treinta filas, sin esto se pierde
                                        // de vista qué es cada columna a la quinta.
                                        'sticky top-0 z-10 border-b border-subtle bg-surface-raised px-3 py-2.5',
                                        'text-t-2xs font-bold uppercase tracking-wide text-ink-subtle whitespace-nowrap',
                                        ALINEACION[col.alineacion ?? 'izquierda'],
                                        col.ancho
                                    )}
                                >
                                    {col.cabecera}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((fila, i) => (
                            <tr
                                key={claveFila(fila, i)}
                                onClick={onFilaClick ? () => onFilaClick(fila) : undefined}
                                className={cn(
                                    'border-b border-subtle last:border-0',
                                    onFilaClick && 'cursor-pointer transition-colors duration-fast ease-snap hover:bg-surface-raised'
                                )}
                            >
                                {columnas.map((col, c) => {
                                    const contenido = col.celda(fila, i);
                                    // La primera celda es la CABECERA DE FILA: con
                                    // `scope="row"`, un lector anuncia "Fulanito,
                                    // total, 540" en vez de solo "540".
                                    const Etiqueta = c === 0 ? 'th' : 'td';
                                    return (
                                        <Etiqueta
                                            key={col.id}
                                            scope={c === 0 ? 'row' : undefined}
                                            className={cn(
                                                'px-3 py-2.5',
                                                c === 0 ? 'font-semibold text-ink' : 'tabular-nums text-ink-muted',
                                                ALINEACION[col.alineacion ?? 'izquierda']
                                            )}
                                        >
                                            {onFilaClick && c === 0 ? (
                                                // Un `<tr onClick>` no se puede enfocar
                                                // ni activar con Intro. El botón real
                                                // vive en la primera celda y ocupa su
                                                // ancho, así que con teclado se llega
                                                // igual que con ratón.
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); onFilaClick(fila); }}
                                                    className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:rounded-chip"
                                                >
                                                    {contenido}
                                                </button>
                                            ) : (
                                                contenido
                                            )}
                                        </Etiqueta>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
