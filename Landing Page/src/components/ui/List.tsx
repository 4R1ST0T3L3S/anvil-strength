import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * LISTA AGRUPADA
 * =====================================================================
 *
 * El patrón de las listas de iOS: filas dentro de UNA superficie con las
 * esquinas redondeadas, separadas por líneas de un pelo que empiezan donde
 * empieza el texto. Sustituye a las columnas de tarjetas sueltas —cada una
 * con su borde y su sombra— que convertían una lista de veinte atletas en
 * veinte cajas compitiendo entre sí.
 *
 *     <List titulo="Pendientes">
 *       <ListRow avatar={…} titulo="Juan Alonso" subtitulo="Último: miércoles" chevron onClick={…} />
 *     </List>
 *
 * El separador lo pinta cada fila (su `after:`) y se esconde en la última,
 * así que no hay que calcular nada al añadir o quitar filas. `inset` dice
 * dónde empieza: bajo el texto, no bajo el avatar.
 */

export function List({
    titulo,
    accion,
    pie,
    children,
    className,
    sinSuperficie = false,
}: {
    /** Encabezado del grupo, fuera de la superficie. */
    titulo?: ReactNode;
    /** Acción a la derecha del encabezado ("Ver todo"). */
    accion?: ReactNode;
    /** Nota al pie del grupo, fuera de la superficie. */
    pie?: ReactNode;
    children: ReactNode;
    className?: string;
    /** Sin fondo propio: filas sueltas dentro de otra superficie. */
    sinSuperficie?: boolean;
}) {
    return (
        <section className={className}>
            {(titulo || accion) && (
                <div className="flex items-end justify-between gap-3 px-1 pb-2">
                    {titulo && <h3 className="text-t-sm font-semibold text-ink-muted">{titulo}</h3>}
                    {accion && <div className="shrink-0">{accion}</div>}
                </div>
            )}
            <div
                className={cn(
                    !sinSuperficie &&
                        'overflow-hidden rounded-card border border-[var(--card-border)] bg-surface-raised shadow-card'
                )}
            >
                {children}
            </div>
            {pie && <p className="px-1 pt-2 text-t-xs leading-relaxed text-ink-subtle">{pie}</p>}
        </section>
    );
}

export interface ListRowProps {
    /** Icono dentro de un cuadro de 30px (ajustes). */
    icono?: ReactNode;
    /** Un avatar u otro elemento a la izquierda, a su tamaño. */
    avatar?: ReactNode;
    titulo: ReactNode;
    subtitulo?: ReactNode;
    /** Texto discreto a la derecha (una fecha, un valor). */
    valor?: ReactNode;
    /** Cualquier cosa a la derecha: insignia, contador, interruptor. */
    derecha?: ReactNode;
    chevron?: boolean;
    onClick?: () => void;
    /** Resaltada como la seleccionada (lista de conversaciones en escritorio). */
    activa?: boolean;
    /** Texto en rojo de peligro ("Cerrar sesión"). */
    destructiva?: boolean;
    /** Título en seminegrita: algo sin leer. */
    destacada?: boolean;
    /** Dónde empieza el separador, en px desde el borde izquierdo. */
    inset?: number;
    className?: string;
    children?: ReactNode;
    'aria-label'?: string;
}

export function ListRow({
    icono,
    avatar,
    titulo,
    subtitulo,
    valor,
    derecha,
    chevron = false,
    onClick,
    activa = false,
    destructiva = false,
    destacada = false,
    inset,
    className,
    children,
    'aria-label': ariaLabel,
}: ListRowProps) {
    // El separador arranca bajo el texto: con avatar de 40 + hueco de 12 +
    // margen de 16, en 68; con icono de 30, en 58; sin nada, en 16.
    const desde = inset ?? (avatar ? 68 : icono ? 58 : 16);

    const contenido = (
        <>
            {icono && (
                <span
                    className={cn(
                        'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] [&>svg]:h-4 [&>svg]:w-4',
                        destructiva ? 'bg-[var(--danger-quiet)] text-danger-text' : 'bg-[var(--fill-muted)] text-ink-muted'
                    )}
                    aria-hidden="true"
                >
                    {icono}
                </span>
            )}
            {avatar}
            <span className="min-w-0 flex-1">
                <span
                    className={cn(
                        'block truncate text-t-base',
                        destructiva ? 'text-danger-text' : 'text-ink',
                        destacada ? 'font-semibold' : 'font-normal'
                    )}
                >
                    {titulo}
                </span>
                {subtitulo && (
                    <span className="mt-0.5 line-clamp-2 block text-t-sm leading-snug text-ink-subtle">
                        {subtitulo}
                    </span>
                )}
                {children}
            </span>
            {valor && <span className="shrink-0 text-t-sm tabular-nums text-ink-subtle">{valor}</span>}
            {derecha}
            {chevron && (
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-ink-faint" aria-hidden="true" />
            )}
        </>
    );

    // El separador lee `--desde`, que se pone en línea por fila: la clase es
    // estática y el valor, dinámico.
    const base = cn(
        'relative flex w-full min-h-[56px] items-center gap-3 px-4 py-3 text-left',
        "after:pointer-events-none after:absolute after:bottom-0 after:left-[var(--desde)] after:right-0 after:h-px after:bg-[var(--separator)] after:content-[''] last:after:hidden",
        activa && 'bg-[var(--fill-selected)]',
        className
    );

    if (!onClick) {
        return (
            <div className={base} style={{ ['--desde' as string]: `${desde}px` }}>
                {contenido}
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            data-no-press
            aria-label={ariaLabel}
            aria-current={activa ? 'true' : undefined}
            className={cn(
                base,
                'transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)] active:bg-[var(--fill-pressed)]'
            )}
            style={{ ['--desde' as string]: `${desde}px` }}
        >
            {contenido}
        </button>
    );
}
