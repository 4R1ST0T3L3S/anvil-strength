import { useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dialogIn, sheetIn, fade, transition, DURATION } from '../../lib/motion';
import { lockBodyScroll } from '../../lib/scrollLock';
import { useClaseDeRegistro } from '../layout/RegistroMarca';

/**
 * Diálogo del sistema de diseño.
 *
 *   1. Trampa de foco + devolución del foco al cerrar.
 *   2. Escape y clic en el velo cierran.
 *   3. Bloqueo del scroll de fondo SIN que la página salte.
 *
 * En móvil entra como HOJA INFERIOR (el pulgar está abajo) con su asa; en
 * escritorio, diálogo centrado. Misma pieza, mismo contenido.
 *
 * Aspecto del sistema de septiembre de 2026: superficie elevada sin borde
 * en claro, título en frase (nunca en mayúsculas), cerrar como botón
 * circular discreto, y en móvil las acciones del pie a todo lo ancho, la
 * principal arriba, que es donde la busca el pulgar.
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
    // Un modal abierto desde la portada sale por portal a <body>: sin esto
    // perdería el registro de marca y se pintaría con el sistema de la app.
    const registro = useClaseDeRegistro();

    const close = useCallback(() => {
        if (dismissible) onClose();
    }, [dismissible, onClose]);

    // Bloqueo de scroll compartido y con contador: este diálogo se abre a
    // menudo ENCIMA de otra capa que también bloquea.
    useEffect(() => {
        if (!open) return;
        return lockBodyScroll();
    }, [open]);

    // Foco: se recuerda quién abrió el modal y se le devuelve al cerrar.
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
                    className={cn('fixed inset-0 flex items-end justify-center sm:items-center sm:p-6', registro)}
                    style={{ zIndex: 'var(--z-modal)' }}
                >
                    <m.div
                        {...fade}
                        transition={transition(DURATION.fast)}
                        onClick={close}
                        className="absolute inset-0 bg-[var(--scrim)]"
                        aria-hidden="true"
                    />

                    <m.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        tabIndex={-1}
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
                            'max-h-[92dvh] sm:max-h-[85dvh]',
                            'bg-surface-raised text-ink',
                            'rounded-t-sheet sm:rounded-sheet',
                            'border border-[var(--card-border)] shadow-overlay',
                            SIZE[size],
                            className
                        )}
                    >
                        {/* Asa: la señal de "esto se desliza" en móvil. */}
                        <div
                            className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-pill bg-[var(--fill-strong)] sm:hidden"
                            aria-hidden="true"
                        />

                        {(title || dismissible) && (
                            <header className="flex items-start gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
                                <div className="min-w-0 flex-1 pt-1">
                                    {title && (
                                        <h2 className="text-t-lg font-semibold leading-snug tracking-[-0.01em] text-ink">
                                            {title}
                                        </h2>
                                    )}
                                    {description && (
                                        <p className="mt-1 text-t-sm leading-relaxed text-ink-muted">
                                            {description}
                                        </p>
                                    )}
                                </div>

                                {dismissible && (
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        aria-label="Cerrar"
                                        // Se ve de 30px y se pulsa en 44: el
                                        // pseudo-elemento estira la zona sensible
                                        // sin engordar el círculo.
                                        className="relative -mr-1 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-pill bg-[var(--fill-muted)] text-ink-muted transition-colors duration-fast ease-snap before:absolute before:-inset-[7px] before:content-[''] hover:bg-[var(--fill-strong)] hover:text-ink"
                                    >
                                        <X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                                    </button>
                                )}
                            </header>
                        )}

                        {/* En móvil es una hoja pegada al borde: el último
                            control caería bajo el indicador de inicio del
                            iPhone, que se queda el toque. Se suma la zona segura. */}
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-6">
                            {children}
                        </div>

                        {footer && (
                            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--separator)] px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] [&>*]:w-full sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:pb-3.5 sm:[&>*]:w-auto">
                                {footer}
                            </footer>
                        )}
                    </m.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
