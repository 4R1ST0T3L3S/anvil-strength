import { useState } from 'react';
import { X, Calendar as CalendarIcon, Save, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarWeekPicker } from './CalendarWeekPicker';
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
                    className="relative bg-[#1c1c1c] w-full max-w-4xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between p-8 border-b border-white/5 bg-[#252525]">
                        <h2 className="text-3xl font-black uppercase text-white italic tracking-tighter">Nuevo Bloque</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8">
                        <div className="flex flex-col md:flex-row gap-8">
                            {/* LEFT COLUMN: Inputs */}
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
                                                Crear Bloque
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: Calendar */}
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
