import { useState, useEffect } from 'react';
import { X, Search, Plus, Loader, Dumbbell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { ExerciseLibrary } from '../../../types/training';

interface AddExerciseModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string;
    currentExerciseCount: number;
    onExerciseAdded: () => void;
}

export function AddExerciseModal({ isOpen, onClose, sessionId, currentExerciseCount, onExerciseAdded }: AddExerciseModalProps) {
    const [exercises, setExercises] = useState<ExerciseLibrary[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [addingInfo, setAddingId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && exercises.length === 0) {
            fetchLibrary();
        }
    }, [isOpen]);

    const fetchLibrary = async () => {
        try {
            setLoading(true);
            const data = await trainingService.getExerciseLibrary();
            setExercises(data);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar la librería de ejercicios');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (exercise: ExerciseLibrary) => {
        setAddingId(exercise.id);
        try {
            await trainingService.addSessionExercise(
                sessionId,
                exercise.id,
                currentExerciseCount * 10 // Order index logic (10, 20, 30...)
            );
            toast.success('Ejercicio añadido');
            onExerciseAdded();
            // Don't close immediately to allow multiple additions
        } catch (error) {
            console.error(error);
            toast.error('Error al añadir ejercicio');
        } finally {
            setAddingId(null);
        }
    };

    const filteredExercises = exercises.filter(ex =>
        ex.name.toLowerCase().includes(search.toLowerCase()) ||
        ex.muscle_group?.toLowerCase().includes(search.toLowerCase())
    );

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
                    className="relative bg-[#1c1c1c] w-full max-w-2xl h-[80vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#252525]">
                        <h2 className="text-xl font-black uppercase text-white">Librería de Ejercicios</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="p-4 border-b border-white/5">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar por nombre o grupo muscular..."
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-anvil-red/50 transition-all font-medium"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-2">
                        {loading ? (
                            <div className="flex justify-center p-12">
                                <Loader className="text-anvil-red animate-spin" />
                            </div>
                        ) : filteredExercises.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                No se encontraron ejercicios.
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {filteredExercises.map((ex) => (
                                    <div
                                        key={ex.id}
                                        className="flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-colors group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-black/40 rounded-lg flex items-center justify-center border border-white/5">
                                                <Dumbbell size={18} className="text-gray-500" />
                                            </div>
                                            <div>
                                                <h4 className="text-white font-bold">{ex.name}</h4>
                                                {ex.muscle_group && (
                                                    <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                                                        {ex.muscle_group}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleAdd(ex)}
                                            disabled={addingInfo === ex.id}
                                            className="px-4 py-2 bg-white/5 hover:bg-white text-white hover:text-black rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-2"
                                        >
                                            {addingInfo === ex.id ? (
                                                <Loader size={16} className="animate-spin" />
                                            ) : (
                                                <>
                                                    <Plus size={16} /> Añadir
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
