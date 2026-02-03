import { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { TrainingSet } from '../../../types/training';

interface AthleteSetLoggerProps {
    sessionExerciseId: string;
}

export function AthleteSetLogger({ sessionExerciseId }: AthleteSetLoggerProps) {
    const [sets, setSets] = useState<TrainingSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);

    const fetchSets = async () => {
        try {
            const data = await trainingService.getSetsByExercise(sessionExerciseId);
            setSets(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSets();
    }, [sessionExerciseId]);

    const handleUpdateActual = async (setId: string, updates: Partial<TrainingSet>) => {
        // Optimistic UI update
        const setIndex = sets.findIndex(s => s.id === setId);
        if (setIndex === -1) return;

        const updatedSets = [...sets];
        updatedSets[setIndex] = { ...updatedSets[setIndex], ...updates };
        setSets(updatedSets);
    };

    const handleBlur = async (setId: string, updates: { actual_reps?: string; actual_load?: number; actual_rpe?: string }) => {
        setSavingId(setId);
        try {
            await trainingService.updateSetActuals(setId, updates);
            toast.success('Guardado');
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar');
        } finally {
            setSavingId(null);
        }
    };

    if (loading) return <div className="p-4 text-xs text-gray-500">Cargando series...</div>;
    if (sets.length === 0) return <div className="p-4 text-sm text-gray-500 italic">No hay series asignadas.</div>;

    return (
        <div className="bg-black/20 p-4 rounded-xl">
            {/* Headers */}
            <div className="grid grid-cols-12 gap-2 mb-2 text-[10px] uppercase font-bold text-gray-500 tracking-wider text-center">
                <div className="col-span-1">#</div>
                <div className="col-span-3 text-anvil-red">Objetivo</div>
                <div className="col-span-4 bg-white/5 rounded">Reps Reales</div>
                <div className="col-span-2 bg-white/5 rounded">Kg</div>
                <div className="col-span-2 bg-white/5 rounded">RPE</div>
            </div>

            <div className="space-y-2">
                {sets.map((set, index) => (
                    <div key={set.id} className="grid grid-cols-12 gap-2 items-center text-sm">
                        {/* Set Number */}
                        <div className="col-span-1 flex justify-center">
                            <span className="w-6 h-6 flex items-center justify-center bg-white/5 rounded-full text-xs font-bold text-gray-400 border border-white/5">
                                {index + 1}
                            </span>
                        </div>

                        {/* Targets (Read Only) */}
                        <div className="col-span-3 text-center text-xs text-gray-400 font-medium">
                            {set.target_reps && <span>{set.target_reps} reps</span>}
                            {set.target_load && <span className="block">{set.target_load}kg</span>}
                            {set.target_rpe && <span className="block text-[10px] text-gray-500">RPE {set.target_rpe}</span>}
                        </div>

                        {/* Actual Reps */}
                        <div className="col-span-4">
                            <input
                                type="number"
                                placeholder="-"
                                value={set.actual_reps || ''}
                                onChange={(e) => handleUpdateActual(set.id, { actual_reps: e.target.value ? parseInt(e.target.value) : undefined })}
                                onBlur={(e) => handleBlur(set.id, { actual_reps: e.target.value ? e.target.value : undefined })}
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-3 text-center text-white font-bold focus:border-anvil-red/50 focus:outline-none transition-colors"
                            />
                        </div>

                        {/* Actual Load */}
                        <div className="col-span-2">
                            <input
                                type="number"
                                placeholder="-"
                                value={set.actual_load || ''}
                                onChange={(e) => handleUpdateActual(set.id, { actual_load: e.target.value ? parseFloat(e.target.value) : undefined })}
                                onBlur={(e) => handleBlur(set.id, { actual_load: e.target.value ? parseFloat(e.target.value) : undefined })}
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-1 py-3 text-center text-white focus:border-anvil-red/50 focus:outline-none transition-colors text-xs"
                            />
                        </div>

                        {/* Actual RPE */}
                        <div className="col-span-2 relative">
                            <input
                                type="number"
                                placeholder="@"
                                step="0.5"
                                value={set.actual_rpe || ''}
                                onChange={(e) => handleUpdateActual(set.id, { actual_rpe: e.target.value ? parseFloat(e.target.value) : undefined })}
                                onBlur={(e) => handleBlur(set.id, { actual_rpe: e.target.value ? e.target.value : undefined })}
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-1 py-3 text-center text-white focus:border-anvil-red/50 focus:outline-none transition-colors text-xs"
                            />
                            {savingId === set.id && (
                                <div className="absolute top-0 right-0 -mt-1 -mr-1">
                                    <Loader size={8} className="text-anvil-red animate-spin" />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
