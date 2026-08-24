import { useState, useEffect, useRef, useCallback } from 'react';
import { MoreVertical, ChevronDown, Download, Copy, ArrowRightLeft, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { transition, DURATION } from '../../../../lib/motion';

// ==========================================
// SUB-COMPONENTES DE LA LISTA DE SEMANAS
// ==========================================

/**
 * Acción de icono de la cabecera de semana.
 *
 * Existe como componente porque cada uno de estos botones necesita `aria-label`
 * además del `title`: `title` solo aparece al pasar el ratón y no lo lee ningún
 * lector de pantalla, así que un botón sin más contenido que un SVG queda sin
 * nombre accesible.
 */
export function IconAction({
    label,
    onClick,
    children,
    active = false,
    danger = false,
}: {
    label: string;
    onClick: (e: React.MouseEvent) => void;
    children: React.ReactNode;
    active?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`rounded-field p-2 transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${active
 ? 'bg-brand-quiet text-brand-text'
 : danger
 ? 'text-ink-subtle hover:bg-[var(--danger-quiet)] hover:text-danger-text'
 : 'text-ink-subtle hover:bg-surface-overlay hover:text-ink'
 }`}
        >
            {children}
        </button>
    );
}

/**
 * MENÚ DE ACCIONES DE UNA SEMANA
 *
 * Antes esto eran cinco iconos en fila dentro de la cabecera. En escritorio
 * pasaba; en un móvil de 375px, cinco objetivos de 32px más el título más las
 * cifras de la semana no caben, y lo que ocurría es que la fila se desbordaba
 * fuera de la pantalla y la mitad de las acciones quedaban inalcanzables.
 *
 * Con un solo botón, la cabecera vuelve a ser un rectángulo limpio que se
 * pulsa para desplegar los días —que es lo que se hace el 95% de las veces— y
 * las acciones destructivas dejan de estar a un dedo de distancia del gesto
 * de abrir.
 *
 * Se cierra con Escape y con un clic fuera. Sin lo segundo, el menú se
 * quedaba abierto por la pantalla y había que volver a pulsar el mismo botón
 * para quitarlo, que es de las cosas que hacen pensar que la web está colgada.
 */
export function WeekMenu({
    weekLabel,
    otherWeeks,
    onExport,
    onDuplicate,
    onCopyInto,
    onDelete,
}: {
    weekLabel: string;
    otherWeeks: { week: number; label: string; name: string }[];
    onExport: () => void;
    onDuplicate: () => void;
    onCopyInto: (targetWeek: number) => void;
    onDelete: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [copyMode, setCopyMode] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) {
                setOpen(false);
                setCopyMode(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setOpen(false);
            setCopyMode(false);
        };

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    /**
     * Cierra el menú.
     *
     * Vuelve SIEMPRE al primer nivel: reabrirlo y encontrarse la lista de
     * semanas destino de la vez anterior desorienta. Se hace aquí, en el único
     * sitio por el que se cierra, y no en un efecto que vigile `open`: un
     * efecto para esto es un render extra por cada cierre.
     */
    const close = useCallback(() => {
        setOpen(false);
        setCopyMode(false);
    }, []);

    const run = (action: () => void) => {
        close();
        action();
    };

    return (
        <div className="relative" ref={rootRef}>
            <IconAction
                label={`Acciones de ${weekLabel}`}
                active={open}
                onClick={(e) => { e.stopPropagation(); if (open) close(); else setOpen(true); }}
            >
                <MoreVertical size={16} />
            </IconAction>

            <AnimatePresence>
                {open && (
                    <m.div
                        initial={{ opacity: 0, scale: 0.97, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: -4 }}
                        transition={transition(DURATION.fast)}
                        style={{ transformOrigin: 'top right' }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full z-dropdown mt-2 w-60 rounded-card border border-[var(--border-default)] bg-surface-overlay p-1.5 shadow-overlay"
                    >
                        {copyMode ? (
                            <>
                                <button
                                    onClick={() => setCopyMode(false)}
                                    className="mb-1 flex w-full items-center gap-1.5 rounded-field px-2.5 py-1.5 text-left text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink"
                                >
                                    <ChevronDown size={12} className="rotate-90" aria-hidden="true" />
                                    Copiar {weekLabel} sobre…
                                </button>
                                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                                    {otherWeeks.length === 0 && (
                                        <p className="px-2.5 py-2 text-t-xs italic text-ink-faint">
                                            No hay otra semana en el bloque.
                                        </p>
                                    )}
                                    {otherWeeks.map(w => (
                                        <button
                                            key={w.week}
                                            onClick={() => run(() => onCopyInto(w.week))}
                                            className="w-full truncate rounded-field px-2.5 py-2 text-left text-t-sm text-ink-muted transition-colors duration-fast ease-snap hover:bg-brand hover:text-brand-ink"
                                        >
                                            {w.label}
                                            {w.name && <span className="ml-2 text-t-xs opacity-70">{w.name}</span>}
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                <MenuItem icon={Download} onClick={() => run(onExport)}>
                                    Descargar en PDF
                                </MenuItem>
                                <MenuItem icon={Copy} onClick={() => run(onDuplicate)}>
                                    Duplicar como semana nueva
                                </MenuItem>
                                <MenuItem
                                    icon={ArrowRightLeft}
                                    onClick={() => setCopyMode(true)}
                                    trailing={<ChevronDown size={12} className="-rotate-90" aria-hidden="true" />}
                                >
                                    Copiar sobre otra semana
                                </MenuItem>
                                <div className="my-1 h-px bg-[var(--border-subtle)]" />
                                <MenuItem icon={Trash2} danger onClick={() => run(onDelete)}>
                                    Eliminar semana
                                </MenuItem>
                            </>
                        )}
                    </m.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function MenuItem({
    icon: Icon,
    children,
    onClick,
    danger = false,
    trailing,
}: {
    icon: LucideIcon;
    children: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    trailing?: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex w-full items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-t-sm transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${danger
 ? 'text-danger-text hover:bg-[var(--danger-quiet)]'
 : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
 }`}
        >
            <Icon size={14} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {trailing}
        </button>
    );
}
