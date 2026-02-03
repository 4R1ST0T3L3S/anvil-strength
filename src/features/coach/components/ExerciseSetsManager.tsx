import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { TrainingSet } from '../../../types/training';

interface ExerciseSetsManagerProps {
    sessionExerciseId: string;
}

export function ExerciseSetsManager({ sessionExerciseId }: ExerciseSetsManagerProps) {
    const [sets, setSets] = useState<TrainingSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);

    // Fetch sets on mount
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

    // Handlers
    const handleAddSet = async () => {
        try {
            const lastSet = sets[sets.length - 1];
            const newSetData = {
                session_exercise_id: sessionExerciseId,
                order_index: (sets.length + 1) * 10,
                target_reps: lastSet?.target_reps || '',
                target_rpe: lastSet?.target_rpe || '',
                target_load: lastSet?.target_load || null,
                rest_seconds: lastSet?.rest_seconds || null,
                is_video_required: false
            };

            const createdSet = await trainingService.addSet(newSetData);
            setSets([...sets, createdSet]);
            toast.success('Serie añadida');
        } catch (error) {
            console.error(error);
            toast.error('Error al añadir serie');
        }
    };

    const handleDeleteSet = async (setId: string) => {
        if (!confirm('¿Borrar esta serie?')) return;
        try {
            await trainingService.deleteSet(setId);
            setSets(sets.filter(s => s.id !== setId));
            toast.success('Serie eliminada');
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar serie');
        }
    };

    const handleUpdateSet = async (setId: string, field: keyof TrainingSet, value: any) => {
        // Optimistic update for UI responsiveness could be implemented here
        // For now, we update local state then debounce/save or save on blur
        // To keep it simple ensuring data integrity:

        const setIndex = sets.findIndex(s => s.id === setId);
        if (setIndex === -1) return;

        const updatedSets = [...sets];
        updatedSets[setIndex] = { ...updatedSets[setIndex], [field]: value };
        setSets(updatedSets);
    };

    const handleBlur = async (setId: string, updates: Partial<TrainingSet>) => {
        setSavingId(setId);
        try {
            await trainingService.updateSet(setId, updates);
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar cambios');
        } finally {
            setSavingId(null);
        }
    };

    if (loading) return <div className="text-xs text-gray-500 p-4">Cargando series...</div>;

    return (
        <div className="p-4 bg-black/10">
            {sets.length > 0 && (
                <div className="grid grid-cols-12 gap-2 mb-2 text-[10px] uppercase font-bold text-gray-500 tracking-wider text-center">
                    <div className="col-span-1">#</div>
                    <div className="col-span-3">Reps Obj.</div>
                    <div className="col-span-2">RPE</div>
                    <div className="col-span-2">Kilos</div>
                    <div className="col-span-2">Rest (s)</div>
                    <div className="col-span-2"></div>
                </div>
            )}

            <div className="space-y-1">
                {sets.map((set, index) => (
                    <div key={set.id} className="grid grid-cols-12 gap-2 items-center text-sm">

                        {/* Set Number */}
                        <div className="col-span-1 flex justify-center">
                            <span className="w-6 h-6 flex items-center justify-center bg-white/5 rounded-full text-xs font-bold text-gray-400 border border-white/5">
                                {index + 1}
                            </span>
                        </div>

                        {/* Target Reps */}
                        <div className="col-span-3">
                            <input
                                type="text"
                                value={set.target_reps || ''}
                                onChange={(e) => handleUpdateSet(set.id, 'target_reps', e.target.value)}
                                onBlur={(e) => handleBlur(set.id, { target_reps: e.target.value })}
                                placeholder="Ej: 5-8"
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-1 text-center text-white focus:border-anvil-red/50 focus:outline-none transition-colors"
                            />
                        </div>

                        {/* Target RPE */}
                        <div className="col-span-2">
                            <input
                                type="text"
                                value={set.target_rpe || ''}
                                onChange={(e) => handleUpdateSet(set.id, 'target_rpe', e.target.value)}
                                onBlur={(e) => handleBlur(set.id, { target_rpe: e.target.value })}
                                placeholder="@"
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-1 text-center text-white focus:border-anvil-red/50 focus:outline-none transition-colors"
                            />
                        </div>

                        {/* Target Load */}
                        <div className="col-span-2">
                            <input
                                type="number"
                                value={set.target_load || ''}
                                onChange={(e) => handleUpdateSet(set.id, 'target_load', e.target.value)}
                                onBlur={(e) => handleBlur(set.id, { target_load: e.target.value ? parseFloat(e.target.value) : null })}
                                placeholder="kg"
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-1 text-center text-white focus:border-anvil-red/50 focus:outline-none transition-colors"
                            />
                        </div>

                        {/* Rest */}
                        <div className="col-span-2">
                            <input
                                type="number"
                                value={set.rest_seconds || ''}
                                onChange={(e) => handleUpdateSet(set.id, 'rest_seconds', e.target.value)}
                                onBlur={(e) => handleBlur(set.id, { rest_seconds: e.target.value ? parseInt(e.target.value) : null })}
                                placeholder="s"
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-1 text-center text-white focus:border-anvil-red/50 focus:outline-none transition-colors"
                            />
                        </div>

                        {/* Actions */}
                        <div className="col-span-2 flex justify-end gap-1">
                            {savingId === set.id ? (
                                <Loader size={14} className="text-anvil-red animate-spin mx-2" />
                            ) : (
                                <button
                                    onClick={() => handleDeleteSet(set.id)}
                                    className="p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={handleAddSet}
                className="mt-4 w-full py-2 flex items-center justify-center gap-2 border border-dashed border-white/10 rounded-lg text-xs font-bold text-gray-500 uppercase tracking-wider hover:bg-white/5 hover:text-white hover:border-white/20 transition-all"
            >
                <Plus size={14} />
                Añadir Serie
            </button>
        </div>
    );
}
