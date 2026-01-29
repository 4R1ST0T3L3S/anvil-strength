import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarSection } from '../CalendarSection';

interface CalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CalendarModal({ isOpen, onClose }: CalendarModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
                    className="relative bg-[#1c1c1c] w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl border border-white/10"
                >
                    <div className="sticky top-0 right-0 z-10 flex justify-end p-4 bg-[#1c1c1c]/95 backdrop-blur supports-[backdrop-filter]:bg-[#1c1c1c]/60 border-b border-white/5">
                        <button
                            onClick={onClose}
                            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="p-6 md:p-8">
                        <CalendarSection />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
