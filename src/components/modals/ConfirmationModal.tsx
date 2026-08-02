import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

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
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* z-modal, no z-50.
                El editor de día a pantalla completa se dibuja por encima de 50,
                así que esta confirmación quedaba DEBAJO: al pulsar la papelera
                de un ejercicio no pasaba nada aparente, y el "¿seguro?" solo
                asomaba al cerrar el editor. */}
            <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-md overflow-hidden rounded-sheet border border-[var(--border-default)] bg-surface-sunken shadow-overlay"
                >
                    <div className="p-6 text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-danger-quiet flex items-center justify-center mx-auto text-danger">
                            <AlertTriangle size={24} />
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
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`flex-1 rounded-field px-4 py-3 text-t-xs font-bold uppercase tracking-wider text-brand-ink transition-colors duration-fast ${
                                variant === 'danger' ? 'bg-danger hover:bg-danger-hover' : 'bg-info hover:opacity-90'
                            }`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
