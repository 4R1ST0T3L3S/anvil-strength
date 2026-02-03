import { useState, useEffect } from 'react';
import { X, Save, Loader, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { TrainingSession } from '../../../types/training';

interface CreateSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    blockId: string;
    existingSessions: TrainingSession[];
    onSessionCreated: () => void;
}

export function CreateSessionModal({ isOpen, onClose, blockId, existingSessions, onSessionCreated }: CreateSessionModalProps) {
    const [name, setName] = useState('');
    const [dayNumber, setDayNumber] = useState(1);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Auto increment day logic
            const maxDay = existingSessions.length > 0
                ? Math.max(...existingSessions.map(s => s.day_number))
                : 0;
            setDayNumber(maxDay + 1);
            setName(''); // Reset name
        }
    }, [isOpen, existingSessions]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Validate day number uniqueness
            const dayExists = existingSessions.some(s => s.day_number === dayNumber);
            if (dayExists) {
                toast.error(`El Día ${dayNumber} ya existe en este bloque.`);
                setLoading(false);
                return;
            }

            await trainingService.createSession({
                block_id: blockId,
                day_number: dayNumber,
                name: name.trim() || null, // Optional
            });

            toast.success('Sesión creada correctamente');
            onSessionCreated();
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Error al crear la sesión');
        } finally {
            setLoading(false);
        }
    };

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
                    className="relative bg-[#1c1c1c] w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#252525]">
                        <h2 className="text-xl font-black uppercase text-white">Añadir Día</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">

                        {/* Day Number */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                                Número de Día
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Día</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    value={dayNumber}
                                    onChange={(e) => setDayNumber(parseInt(e.target.value))}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white font-bold text-lg focus:outline-none focus:border-anvil-red/50 transition-all text-center"
                                />
                            </div>
                        </div>

                        {/* Name Input */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                                Etiqueta (Opcional)
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej: Torso Pesado, Pierna..."
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-anvil-red/50 transition-all"
                                autoFocus
                            />
                        </div>

                        {/* Info Alert */}
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-3 items-start">
                            <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={16} />
                            <p className="text-xs text-blue-300 leading-relaxed">
                                Estás creando el <strong>Día {dayNumber}</strong>. Podrás añadir ejercicios a este día en el siguiente paso.
                            </p>
                        </div>

                        {/* Actions */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 rounded-xl bg-white text-black hover:bg-gray-200 font-black uppercase tracking-wider text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader className="animate-spin" size={18} />
                            ) : (
                                <>
                                    <Save size={18} />
                                    Guardar Sesión
                                </>
                            )}
                        </button>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
