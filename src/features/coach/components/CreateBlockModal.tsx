import { useState } from 'react';
import { X, Calendar as CalendarIcon, Save, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { useAuth } from '../../../context/AuthContext';
import { getWeekNumber, getDateRangeFromWeek } from '../../../utils/dateUtils';

interface CreateBlockModalProps {
    isOpen: boolean;
    onClose: () => void;
    athleteId: string;
    onBlockCreated: () => void;
}

export function CreateBlockModal({ isOpen, onClose, athleteId, onBlockCreated }: CreateBlockModalProps) {
    const { session } = useAuth();
    const [name, setName] = useState('');
    const [startWeek, setStartWeek] = useState<number>(getWeekNumber());
    const [endWeek, setEndWeek] = useState<number>(getWeekNumber() + 4);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // 1. Basic Validation
        if (!name.trim()) {
            toast.error('El nombre del bloque es obligatorio');
            return;
        }

        if (!session?.user.id) return;

        // 2. WeekLogic Validation
        const currentWeek = getWeekNumber();
        if (startWeek < currentWeek) {
            toast.error(`No puedes crear un bloque en el pasado. La semana actual es ${currentWeek}.`);
            return;
        }

        if (endWeek < startWeek) {
            toast.error('La semana de fin debe ser posterior a la de inicio.');
            return;
        }

        setLoading(true);
        try {
            // 3. Fetch existing blocks to check for overlaps
            const existingBlocks = await trainingService.getBlocksByAthlete(athleteId);
            const activeBlocks = existingBlocks.filter(b => b.is_active);

            // Check overlap
            const hasOverlap = activeBlocks.some(block => {
                // Ensure we handle potentially missing start/end weeks safely (though DB should have them now)
                if (!block.start_week || !block.end_week) return false;

                // Overlap logic: (StartA <= EndB) and (EndA >= StartB)
                return (startWeek <= block.end_week) && (endWeek >= block.start_week);
            });

            if (hasOverlap) {
                toast.error('Ya existe un bloque activo en ese rango de semanas.');
                setLoading(false);
                return;
            }

            // Calculate approximate dates for backend compatibility/sorting
            const currentYear = new Date().getFullYear();
            const { start: startDateObj } = getDateRangeFromWeek(startWeek, currentYear);

            await trainingService.createBlock({
                coach_id: session.user.id,
                athlete_id: athleteId,
                name: name.trim(),
                start_week: startWeek,
                end_week: endWeek,
                start_date: startDateObj.toISOString(),
                color: color,
                is_active: true
            });

            toast.success('Bloque creado correctamente');
            setName('');
            setStartWeek(getWeekNumber());
            setEndWeek(getWeekNumber() + 4);
            setColor('#ef4444');
            onBlockCreated();
            onClose();
        } catch (error) {
            console.error('Error creating block:', error);
            // Show specific error message to help debugging (e.g., missing column)
            toast.error(`Error: ${(error as Error).message || 'Error al crear el bloque'}`);
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
                        <h2 className="text-xl font-black uppercase text-white">Nuevo Bloque</h2>
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

                        {/* Color Picker */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                Color del Bloque
                            </label>
                            <div className="flex items-center gap-2">
                                {BLOCK_COLORS.map((c) => (
                                    <button
                                        key={c.hex}
                                        type="button"
                                        onClick={() => setColor(c.hex)}
                                        title={c.label}
                                        className={`w-8 h-8 rounded-full transition-all duration-200 border-2 ${color === c.hex
                                            ? 'border-white scale-110 shadow-lg'
                                            : 'border-transparent hover:border-white/30 hover:scale-105'
                                            }`}
                                        style={{ backgroundColor: c.hex }}
                                    />
                                ))}
                            </div>
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
                                        min={getWeekNumber()}
                                        max={53}
                                        value={startWeek || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setStartWeek(val === '' ? 0 : parseInt(val));
                                        }}
                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red/50 transition-all font-bold pl-10"
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-mono">W</span>
                                </div>
                                <p className="text-[10px] text-gray-600">Actual: Semana {getWeekNumber()}</p>
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
                                        value={endWeek || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setEndWeek(val === '' ? 0 : parseInt(val));
                                        }}
                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red/50 transition-all font-bold pl-10"
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-mono">W</span>
                                </div>
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
