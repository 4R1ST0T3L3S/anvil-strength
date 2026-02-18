import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

interface PDFModalProps {
    isOpen: boolean;
    onClose: () => void;
    pdfUrl: string;
    title?: string;
}

export function PDFModal({ isOpen, onClose, pdfUrl, title = "Documento" }: PDFModalProps) {
    // Close on escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-5xl h-[85vh] bg-[#1c1c1c] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/10"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10 bg-[#252525]">
                            <h3 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-wider">
                                {title}
                            </h3>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* PDF Viewer (Object tag for better compatibility) */}
                        <div className="flex-1 bg-[#151515] relative">
                            <object
                                data={pdfUrl}
                                type="application/pdf"
                                className="w-full h-full"
                            >
                                <div className="flex flex-col items-center justify-center h-full text-white p-6 text-center">
                                    <p className="mb-4">Tu navegador no soporta la visualización de PDFs.</p>
                                    <a
                                        href={pdfUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-anvil-red text-white font-bold px-6 py-3 rounded-xl uppercase tracking-wider hover:bg-red-700 transition-colors"
                                    >
                                        Descargar Normativa
                                    </a>
                                </div>
                            </object>

                            {/* Download fallback / Alternative for mobile */}
                            <div className="absolute bottom-4 right-4 md:hidden pointers-events-none">
                                <a
                                    href={pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-anvil-red text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg uppercase tracking-wider"
                                >
                                    Abrir PDF externo
                                </a>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
