import { useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dialogIn, sheetIn, fade, transition, DURATION } from '../../lib/motion';

/**
 * Diálogo del sistema de diseño.
 *
 * La app tiene una docena de modales escritos a mano (CreateBlockModal,
 * AssignCompetitionModal, VbtChartModal, AthleteStatsModal...), cada uno con
 * su propio backdrop, su propio z-index y ninguno con trampa de foco. Esta
 * primitiva unifica los tres comportamientos que todos deberían tener y
 * ninguno tiene completo:
 *
 *   1. Trampa de foco + devolución del foco al cerrar.
 *   2. Escape y clic en el fondo cierran.
 *   3. Bloqueo del scroll de fondo SIN que la página salte.
 *
 * En móvil entra como hoja inferior: el pulgar está abajo, y un diálogo
 * centrado obliga a estirar la mano para cerrarlo.
 */

type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    /** Línea de apoyo bajo el título. Explica la consecuencia, no repite. */
    description?: string;
    size?: Size;
    /** Pie fijo para las acciones. Se mantiene visible al hacer scroll. */
    footer?: ReactNode;
    /** Desactiva el cierre por fondo y Escape. Solo para procesos en curso. */
    dismissible?: boolean;
    children: ReactNode;
    className?: string;
}

const SIZE: Record<Size, string> = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
};

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
    open,
    onClose,
    title,
    description,
    size = 'md',
    footer,
    dismissible = true,
    children,
    className,
}: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);

    const close = useCallback(() => {
        if (dismissible) onClose();
    }, [dismissible, onClose]);

    // Bloqueo de scroll. Se compensa el ancho de la barra para que el
    // contenido de fondo no se desplace al abrir el modal.
    useEffect(() => {
        if (!open) return;
        const { body, documentElement } = document;
        const gap = window.innerWidth - documentElement.clientWidth;
        const prevOverflow = body.style.overflow;
        const prevPadding = body.style.paddingRight;

        body.style.overflow = 'hidden';
        if (gap > 0) body.style.paddingRight = `${gap}px`;

        return () => {
            body.style.overflow = prevOverflow;
            body.style.paddingRight = prevPadding;
        };
    }, [open]);

    // Foco: se recuerda quién abrió el modal y se le devuelve al cerrar.
    // Sin esto, cerrar un modal con teclado deja el foco en <body> y el
    // usuario tiene que tabular desde el principio de la página.
    useEffect(() => {
        if (!open) return;
        restoreFocusRef.current = document.activeElement as HTMLElement | null;

        const raf = requestAnimationFrame(() => {
            const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
            (first ?? panelRef.current)?.focus();
        });

        return () => {
            cancelAnimationFrame(raf);
            restoreFocusRef.current?.focus?.();
        };
    }, [open]);

    // Escape y trampa de Tab.
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;

            const nodes = Array.from(
                panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
            ).filter((el) => el.offsetParent !== null);
            if (nodes.length === 0) return;

            const first = nodes[0];
            const last = nodes[nodes.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [open, close]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <div
                    className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6"
                    style={{ zIndex: 'var(--z-modal)' }}
                >
                    <motion.div
                        {...fade}
                        transition={transition(DURATION.fast)}
                        onClick={close}
                        className="absolute inset-0 bg-black/70"
                        aria-hidden="true"
                    />

                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        tabIndex={-1}
                        // Hoja inferior en móvil, diálogo centrado en escritorio.
                        variants={
                            typeof window !== 'undefined' && window.innerWidth < 640
                                ? sheetIn
                                : dialogIn
                        }
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={transition(DURATION.slow)}
                        className={cn(
                            'relative flex w-full flex-col',
                            'max-h-[90dvh] sm:max-h-[85dvh]',
                            'bg-surface-raised text-ink',
                            'rounded-t-sheet sm:rounded-sheet',
                            'border border-[var(--border-default)]',
                            'shadow-overlay',
                            SIZE[size],
                            className
                        )}
                    >
                        {/* Asa de arrastre: señal de "esto se desliza" en móvil. */}
                        <div
                            className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-pill bg-[var(--border-strong)] sm:hidden"
                            aria-hidden="true"
                        />

                        {(title || dismissible) && (
                            <header className="flex items-start gap-4 px-5 pb-4 pt-4 sm:px-6 sm:pt-5">
                                <div className="min-w-0 flex-1">
                                    {title && (
                                        <h2 className="text-xl font-semibold tracking-display">
                                            {title}
                                        </h2>
                                    )}
                                    {description && (
                                        <p className="mt-1 text-sm text-ink-muted">
                                            {description}
                                        </p>
                                    )}
                                </div>

                                {dismissible && (
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        aria-label="Cerrar"
                                        className="-mr-1 -mt-1 shrink-0 rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-surface-overlay hover:text-ink"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </header>
                        )}

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
                            {children}
                        </div>

                        {footer && (
                            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-4 sm:px-6">
                                {footer}
                            </footer>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
