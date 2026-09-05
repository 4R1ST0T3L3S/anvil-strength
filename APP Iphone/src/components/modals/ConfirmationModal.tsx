import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
}

/**
 * Confirmación de una acción.
 *
 * Va en un PORTAL a `document.body`. Antes se dibujaba donde estuviera
 * montado, y como los editores a pantalla completa crean su propio contexto
 * de apilamiento, la confirmación de "eliminar ejercicio" salía por DEBAJO
 * del editor: pulsabas la papelera, no pasaba nada visible, y el "¿seguro?"
 * asomaba al cerrar el editor. De ahí la sensación de que había botones que
 * solo funcionaban después de refrescar la página.
 *
 * El variante no es decorativo: este mismo diálogo pregunta por borrados y
 * por copias. Un botón rojo que diga ELIMINAR delante de una acción que
 * solo copia hace que nadie la confirme nunca.
 */
export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'danger'
}: ConfirmationModalProps) {
    // Escape cierra. En captura, para ganarle a los editores a pantalla
    // completa que también escuchan Escape para cerrarse ellos: sin esto,
    // una sola pulsación cerraba el editor entero por debajo del diálogo.
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onClose();
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [isOpen, onClose]);

    if (typeof document === 'undefined') return null;

    const danger = variant === 'danger';

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                    className="fixed inset-0 z-modal flex items-center justify-center p-4"
                >
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    <m.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-md overflow-hidden rounded-sheet border border-[var(--border-default)] bg-surface-sunken shadow-overlay"
                    >
                        <div className="space-y-4 p-6 text-center">
                            <div
                                className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${danger
 ? 'bg-danger-quiet text-danger-text'
 : 'bg-info/15 text-info'
 }`}
                            >
                                {danger ? <AlertTriangle size={24} /> : <HelpCircle size={24} />}
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-t-xl font-black uppercase text-ink">{title}</h3>
                                <p className="text-t-sm leading-relaxed text-ink-muted">{description}</p>
                            </div>
                        </div>

                        <div className="flex gap-3 p-6 pt-0">
                            <button
                                onClick={onClose}
                                className="flex-1 rounded-field bg-surface-overlay px-4 py-3 text-t-xs font-bold uppercase tracking-wider text-ink-muted transition-colors duration-fast hover:text-ink"
                            >
                                {cancelText}
                            </button>
                            <button
                                autoFocus
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className={`flex-1 rounded-field px-4 py-3 text-t-xs font-bold uppercase tracking-wider text-brand-ink transition-colors duration-fast ${danger ? 'bg-danger hover:bg-danger-hover' : 'bg-info hover:opacity-90'
 }`}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </m.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
