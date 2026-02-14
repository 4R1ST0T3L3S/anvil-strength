import { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Save, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarWeekPicker } from './CalendarWeekPicker';
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
    const [color, setColor] = useState('#ef4444');
    const [loading, setLoading] = useState(false);

    const BLOCK_COLORS = [
        { hex: '#ef4444', label: 'Rojo' },
        { hex: '#3b82f6', label: 'Azul' },
        { hex: '#22c55e', label: 'Verde' },
        { hex: '#f59e0b', label: 'Amber' },
        { hex: '#a855f7', label: 'Morado' },
        { hex: '#6b7280', label: 'Gris' },
    ];

    // Sync state when block changes
    useEffect(() => {
        if (block) {
            setName(block.name || '');
            setStartWeek(block.start_week ?? 1);
            setEndWeek(block.end_week ?? 4);
            setIsActive(block.is_active);
            setColor(block.color || '#ef4444');
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
                is_active: isActive,
                color: color
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
                    className="relative bg-[#1c1c1c] w-full max-w-4xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between p-8 border-b border-white/5 bg-[#252525]">
                        <h2 className="text-3xl font-black uppercase text-white italic tracking-tighter">Editar Bloque</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8">
                        <div className="flex flex-col md:flex-row gap-8">
                            {/* LEFT COLUMN */}
                            <div className="flex-1 space-y-8">
                                {/* Name Input */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                                        Nombre del Bloque <span className="text-anvil-red">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ej: Bloque Fuerza Enero"
                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl px-6 py-4 text-white text-lg placeholder-gray-600 focus:outline-none focus:border-anvil-red/50 focus:ring-1 focus:ring-anvil-red/50 transition-all font-bold"
                                        autoFocus
                                    />
                                </div>

                                {/* Color Picker */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                                        Color del Bloque
                                    </label>
                                    <div className="flex items-center gap-3">
                                        {BLOCK_COLORS.map((c) => (
                                            <button
                                                key={c.hex}
                                                type="button"
                                                onClick={() => setColor(c.hex)}
                                                title={c.label}
                                                className={`w-10 h-10 rounded-full transition-all duration-200 border-2 ${color === c.hex
                                                    ? 'border-white scale-110 shadow-lg shadow-white/10'
                                                    : 'border-transparent hover:border-white/30 hover:scale-105'
                                                    }`}
                                                style={{ backgroundColor: c.hex }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Active Toggle */}
                                <div className="flex items-center justify-between p-6 bg-[#0a0a0a] rounded-2xl border border-white/5">
                                    <div>
                                        <p className="font-bold text-white text-sm uppercase tracking-wide">Bloque Activo</p>
                                        <p className="text-xs text-gray-500 mt-1">Visible en el constructor</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsActive(!isActive)}
                                        className={`w-14 h-8 rounded-full transition-colors relative ${isActive ? 'bg-green-500' : 'bg-gray-700'}`}
                                    >
                                        <div className={`absolute w-6 h-6 bg-white rounded-full top-1 transition-transform ${isActive ? 'translate-x-7' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <div className="pt-4 flex gap-4">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="flex-1 px-4 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold uppercase tracking-wider text-sm transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 px-4 py-4 rounded-xl bg-white text-black hover:bg-gray-200 font-black uppercase tracking-wider text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                            </div>

                            {/* RIGHT COLUMN */}
                            <div className="flex-1">
                                <div className="space-y-3 h-full flex flex-col">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                        <CalendarIcon size={14} /> Duración del Bloque
                                    </label>
                                    <div className="flex-1 min-h-[400px]">
                                        <CalendarWeekPicker
                                            startWeek={startWeek}
                                            endWeek={endWeek}
                                            selectedColor={color}
                                            onChange={(start, end) => {
                                                setStartWeek(start);
                                                setEndWeek(end);
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
