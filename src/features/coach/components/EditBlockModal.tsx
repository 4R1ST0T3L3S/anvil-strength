import { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Save, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock } from '../../../types/training';

interface EditBlockModalProps {
    isOpen: boolean;
    onClose: () => void;
    block: TrainingBlock | null;
    onBlockUpdated: () => void;
}

export function EditBlockModal({ isOpen, onClose, block, onBlockUpdated }: EditBlockModalProps) {
    const [name, setName] = useState('');
    const [startWeek, setStartWeek] = useState<number>(1);
    const [endWeek, setEndWeek] = useState<number>(4);
    const [isActive, setIsActive] = useState(true);
    const [loading, setLoading] = useState(false);

    // Sync state when block changes
    useEffect(() => {
        if (block) {
            setName(block.name || '');
            setStartWeek(block.start_week ?? 1);
            setEndWeek(block.end_week ?? 4);
            setIsActive(block.is_active);
        }
    }, [block]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!block) return;

        // Basic Validation
        if (!name.trim()) {
            toast.error('El nombre del bloque es obligatorio');
            return;
        }

        if (endWeek < startWeek) {
            toast.error('La semana de fin debe ser posterior a la de inicio.');
            return;
        }

        setLoading(true);
        try {
            await trainingService.updateBlock(block.id, {
                name: name.trim(),
                start_week: startWeek,
                end_week: endWeek,
                is_active: isActive
            });

            toast.success('Bloque actualizado correctamente');
            onBlockUpdated();
            onClose();
        } catch (error) {
            console.error('Error updating block:', error);
            toast.error(`Error: ${(error as Error).message || 'Error al actualizar el bloque'}`);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !block) return null;

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
                        <h2 className="text-xl font-black uppercase text-white">Editar Bloque</h2>
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
                                placeholder="Ej: Bloque Fuerza Enero"
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-anvil-red/50 focus:ring-1 focus:ring-anvil-red/50 transition-all font-medium"
                                autoFocus
                            />
                        </div>

                        {/* Weeks Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <CalendarIcon size={14} /> Semana Inicio
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={1}
                                        max={53}
                                        value={startWeek}
                                        onChange={(e) => setStartWeek(parseInt(e.target.value) || 1)}
                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red/50 transition-all font-bold pl-10"
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-mono">W</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <CalendarIcon size={14} /> Semana Fin
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={startWeek}
                                        max={53}
                                        value={endWeek}
                                        onChange={(e) => setEndWeek(parseInt(e.target.value) || startWeek)}
                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red/50 transition-all font-bold pl-10"
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-mono">W</span>
                                </div>
                            </div>
                        </div>

                        {/* Active Toggle */}
                        <div className="flex items-center justify-between p-4 bg-[#0a0a0a] rounded-xl border border-white/5">
                            <div>
                                <p className="font-bold text-white text-sm">Bloque Activo</p>
                                <p className="text-xs text-gray-500">Los bloques activos aparecen en el workout builder</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsActive(!isActive)}
                                className={`w-12 h-6 rounded-full transition-colors relative ${isActive ? 'bg-green-500' : 'bg-gray-700'}`}
                            >
                                <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${isActive ? 'translate-x-6' : 'translate-x-0.5'}`} />
                            </button>
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
                                        Guardar Cambios
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
