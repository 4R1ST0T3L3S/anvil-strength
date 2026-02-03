import { useState } from 'react';
import { X, Calendar as CalendarIcon, Save, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { useAuth } from '../../../context/AuthContext';

interface CreateBlockModalProps {
    isOpen: boolean;
    onClose: () => void;
    athleteId: string;
    onBlockCreated: () => void;
}

export function CreateBlockModal({ isOpen, onClose, athleteId, onBlockCreated }: CreateBlockModalProps) {
    const { session } = useAuth();
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error('El nombre del bloque es obligatorio');
            return;
        }

        if (!session?.user.id) return;

        setLoading(true);
        try {
            await trainingService.createBlock({
                coach_id: session.user.id,
                athlete_id: athleteId,
                name: name.trim(),
                start_date: startDate || null,
                end_date: endDate || null,
                is_active: true // Default to active
            });

            toast.success('Mesociclo creado correctamente');
            setName('');
            setStartDate('');
            setEndDate('');
            onBlockCreated();
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Error al crear el mesociclo');
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
                    className="relative bg-[#1c1c1c] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#252525]">
                        <h2 className="text-xl font-black uppercase text-white">Nuevo Mesociclo</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {/* Name Input */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                Nombre del Bloque <span className="text-anvil-red">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej: Mesociclo 1 - Hipertrofia"
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-anvil-red/50 focus:ring-1 focus:ring-anvil-red/50 transition-all font-medium"
                                autoFocus
                            />
                        </div>

                        {/* Dates Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <CalendarIcon size={14} /> Inicio
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red/50 transition-all text-sm [color-scheme:dark]"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <CalendarIcon size={14} /> Fin (Opcional)
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red/50 transition-all text-sm [color-scheme:dark]"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold uppercase tracking-wider text-sm transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 px-4 py-3 rounded-xl bg-white text-black hover:bg-gray-200 font-black uppercase tracking-wider text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <Loader className="animate-spin" size={18} />
                                ) : (
                                    <>
                                        <Save size={18} />
                                        Crear Bloque
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
