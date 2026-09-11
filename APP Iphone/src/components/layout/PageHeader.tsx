import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * LA CABECERA DE UNA PANTALLA
 * =====================================================================
 *
 * Una sola para toda la app: título grande en frase (el "large title" de
 * iOS), una línea de contexto opcional, las acciones a la derecha y, si hace
 * falta, un control debajo (un segmentado, un buscador).
 *
 * Antes cada pantalla dibujaba la suya —con su botón de volver, sus
 * mayúsculas y su tamaño—, y en el móvil convivía con la barra del armazón.
 * Ahora el armazón no pinta cabecera de contenido: la pone cada pantalla con
 * esta pieza, igual en todas.
 *
 * `atras` es un destino EXPLÍCITO y no `navigate(-1)`: tras una recarga o un
 * enlace directo no hay historial al que volver.
 */

export function PageHeader({
    titulo,
    subtitulo,
    atras,
    acciones,
    antetitulo,
    children,
    className,
    compacta = false,
}: {
    titulo: ReactNode;
    subtitulo?: ReactNode;
    atras?: { onClick: () => void; label?: string };
    acciones?: ReactNode;
    /** Una línea encima del título (el equipo del atleta, una fecha). */
    antetitulo?: ReactNode;
    /** Debajo del título: segmentado, buscador, filtros. */
    children?: ReactNode;
    className?: string;
    /** Título mediano: pantallas de detalle donde el contenido manda. */
    compacta?: boolean;
}) {
    return (
        <header className={cn('px-4 pb-4 pt-4 sm:px-6 lg:px-8 lg:pb-5 lg:pt-8', className)}>
            {atras && (
                <button
                    type="button"
                    onClick={atras.onClick}
                    data-no-press
                    className="-ml-2 mb-2 inline-flex h-9 items-center gap-0.5 rounded-field pl-1 pr-2.5 text-t-sm font-medium text-ink-muted transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)] hover:text-ink"
                >
                    <ChevronLeft className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    {atras.label ?? 'Atrás'}
                </button>
            )}

            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    {antetitulo && <div className="mb-1">{antetitulo}</div>}
                    <h1
                        className={cn(
                            'font-bold text-ink',
                            compacta ? 'text-t-xl sm:text-t-2xl' : 'text-title'
                        )}
                    >
                        {titulo}
                    </h1>
                    {subtitulo && (
                        <p className="mt-1 text-t-sm text-ink-muted sm:text-t-base">{subtitulo}</p>
                    )}
                </div>
                {acciones && (
                    <div className="flex shrink-0 items-center gap-1 pt-1">{acciones}</div>
                )}
            </div>

            {children && <div className="mt-4">{children}</div>}
        </header>
    );
}

/** El ancho de columna de las pantallas de contenido: centrado y cómodo. */
export function Contenido({
    children,
    className,
    ancho = 'normal',
}: {
    children: ReactNode;
    className?: string;
    ancho?: 'estrecho' | 'normal' | 'amplio' | 'completo';
}) {
    return (
        <div
            className={cn(
                'mx-auto w-full',
                ancho === 'estrecho' && 'max-w-[720px]',
                ancho === 'normal' && 'max-w-[1080px]',
                ancho === 'amplio' && 'max-w-[1360px]',
                className
            )}
        >
            {children}
        </div>
    );
}
