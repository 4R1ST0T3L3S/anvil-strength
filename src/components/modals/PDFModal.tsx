import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configurar el worker de PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFModalProps {
    isOpen: boolean;
    onClose: () => void;
    pdfUrl: string;
    title?: string;
}

export function PDFModal({ isOpen, onClose, pdfUrl, title = "Documento" }: PDFModalProps) {
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);
    // const [isLoading, setIsLoading] = useState(true); // Removed unused state
    const [containerWidth, setContainerWidth] = useState<number>(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setPageNumber(1);
            setScale(1.0);
        }
    }, [isOpen, pdfUrl]);

    // Update container width on resize
    useEffect(() => {
        if (!isOpen) return;

        const updateWidth = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.clientWidth);
            }
        };

        // Initial update
        updateWidth();

        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, [isOpen]);

    // Close on escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Prevent body scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
    }

    function changePage(offset: number) {
        setPageNumber(prevPageNumber => prevPageNumber + offset);
    }

    function previousPage() {
        changePage(-1);
    }

    function nextPage() {
        changePage(1);
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 md:p-6">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full h-full sm:h-[90vh] sm:max-w-5xl bg-[#1c1c1c] sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col border sm:border-white/10"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 bg-[#252525] border-b border-white/10 shrink-0 z-10">
                            <h3 className="text-lg md:text-xl font-black text-white uppercase italic tracking-wider truncate mr-4">
                                {title}
                            </h3>
                            <div className="flex items-center gap-2">
                                <a
                                    href={pdfUrl}
                                    download="Normativa_Anvil_Strength.pdf"
                                    className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                    title="Descargar PDF"
                                >
                                    <Download size={20} />
                                </a>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Toolbar (Mobile & Desktop) */}
                        <div className="bg-[#151515] p-2 flex items-center justify-between border-b border-white/5 shrink-0 px-4">
                            <div className="flex items-center gap-2 text-white text-sm font-medium">
                                <span className="hidden sm:inline text-gray-400">Página</span>
                                <span className="bg-[#252525] px-2 py-1 rounded border border-white/10 min-w-[30px] text-center">
                                    {pageNumber}
                                </span>
                                <span className="text-gray-400">de {numPages || '--'}</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                                    className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-50"
                                    disabled={scale <= 0.5}
                                >
                                    <ZoomOut size={18} />
                                </button>
                                <span className="text-xs text-gray-400 w-12 text-center">{Math.round(scale * 100)}%</span>
                                <button
                                    onClick={() => setScale(s => Math.min(2.0, s + 0.1))}
                                    className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-50"
                                    disabled={scale >= 2.0}
                                >
                                    <ZoomIn size={18} />
                                </button>
                            </div>
                        </div>

                        {/* PDF Viewer Container */}
                        <div className="flex-1 bg-[#0a0a0a] relative overflow-auto flex justify-center p-4 scrollbar-thin scrollbar-track-[#0a0a0a] scrollbar-thumb-anvil-red/50" ref={containerRef}>
                            <Document
                                file={pdfUrl}
                                onLoadSuccess={onDocumentLoadSuccess}
                                loading={
                                    <div className="flex flex-col items-center justify-center h-64 text-white">
                                        <div className="w-10 h-10 border-4 border-anvil-red border-t-transparent rounded-full animate-spin mb-4"></div>
                                        <p className="font-bold text-sm uppercase tracking-wider">Cargando documento...</p>
                                    </div>
                                }
                                error={
                                    <div className="flex flex-col items-center justify-center h-full text-white p-8 text-center max-w-md">
                                        <p className="mb-4 text-red-400 font-bold">No se pudo cargar el PDF.</p>
                                        <p className="text-sm text-gray-400 mb-6">Puede que tu conexión sea inestable o el archivo no esté disponible.</p>
                                        <a
                                            href={pdfUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="bg-anvil-red text-white py-3 px-6 rounded-lg font-bold uppercase tracking-wider text-sm hover:bg-red-700 transition-colors"
                                        >
                                            Descargar y ver
                                        </a>
                                    </div>
                                }
                                className="flex flex-col items-center shadow-2xl"
                            >
                                <Page
                                    pageNumber={pageNumber}
                                    width={containerWidth ? Math.min(containerWidth - 32, 800) : undefined}
                                    scale={scale}
                                    loading={
                                        <div className="h-[600px] w-full flex items-center justify-center text-gray-500">
                                            <div className="w-8 h-8 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    }
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                    className="bg-white shadow-xl"
                                />
                            </Document>
                        </div>

                        {/* Footer Navigation */}
                        {numPages && numPages > 1 && (
                            <div className="p-4 bg-[#252525] border-t border-white/10 flex justify-center items-center gap-6 shrink-0 z-10 pb-8 sm:pb-4">
                                <button
                                    disabled={pageNumber <= 1}
                                    onClick={previousPage}
                                    className="flex items-center gap-2 px-6 py-3 bg-[#1c1c1c] text-white rounded-xl font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-anvil-red transition-colors border border-white/5"
                                >
                                    <ChevronLeft size={20} />
                                    <span className="hidden sm:inline">Anterior</span>
                                </button>

                                <span className="text-white font-bold text-lg">
                                    {pageNumber} / {numPages}
                                </span>

                                <button
                                    disabled={pageNumber >= numPages}
                                    onClick={nextPage}
                                    className="flex items-center gap-2 px-6 py-3 bg-[#1c1c1c] text-white rounded-xl font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-anvil-red transition-colors border border-white/5"
                                >
                                    <span className="hidden sm:inline">Siguiente</span>
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
