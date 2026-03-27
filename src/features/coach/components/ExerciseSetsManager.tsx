import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { TrainingSet } from '../../../types/training';
import { DurationPicker } from './DurationPicker';

interface ExerciseSetsManagerProps {
    sessionExerciseId: string;
}

// Helpers to parse and format the target_reps field specifically for grouped sets
const getSeriesCount = (target_reps: string | null | undefined) => {
    if (!target_reps) return '';
    const parts = target_reps.toLowerCase().split('x');
    if (parts.length >= 2) return parts[0].trim();
    return ''; // Return empty not '1' to avoid stale prefix
};

const getRepsCount = (target_reps: string | null | undefined) => {
    if (!target_reps) return '';
    const parts = target_reps.toLowerCase().split('x');
    if (parts.length >= 2) return parts.slice(1).join('x').trim();
    return target_reps.trim();
};

const formatTargetReps = (series: string, reps: string) => {
    const s = series.trim();
    const r = reps.trim();
    if (!s || s === '1') return r;
    if (!r) return `${s}x`;
    return `${s}x${r}`;
};

/**
 * A text input that keeps its own local state while typing.
 * Only syncs back from props when 'resetKey' changes (i.e., a different row
 * or a save from another field). This prevents the leading-zero bug where
 * React re-derives the displayed value mid-keystroke.
 */
function SetTextInput({
    initialValue,
    placeholder,
    onChange,
    onBlur,
    resetKey,
}: {
    initialValue: string;
    placeholder: string;
    onChange: (v: string) => void;
    onBlur: () => void;
    resetKey: string;
}) {
    const [localVal, setLocalVal] = useState(initialValue);

    // Only reset from external state when the row identity changes (e.g. after a save)
    useEffect(() => {
        setLocalVal(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    return (
        <input
            type="text"
            value={localVal}
            placeholder={placeholder}
            onChange={(e) => {
                setLocalVal(e.target.value);
                onChange(e.target.value);
            }}
            onBlur={onBlur}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-1 text-center text-white focus:border-anvil-red/50 focus:outline-none transition-colors"
        />
    );
}

export function ExerciseSetsManager({ sessionExerciseId }: ExerciseSetsManagerProps) {
    const [sets, setSets] = useState<TrainingSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);

    const fetchSets = useCallback(async () => {
        try {
            const data = await trainingService.getSetsByExercise(sessionExerciseId);
            setSets(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [sessionExerciseId]);

    useEffect(() => {
        fetchSets();
    }, [sessionExerciseId, fetchSets]);

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
            toast.success('Fila añadida');
        } catch (error) {
            console.error(error);
            toast.error('Error al añadir fila');
        }
    };

    const handleDeleteSet = async (setId: string) => {
        if (!confirm('¿Borrar esta fila de prescripción?')) return;
        try {
            await trainingService.deleteSet(setId);
            setSets(sets.filter(s => s.id !== setId));
            toast.success('Fila eliminada');
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar fila');
        }
    };

    const handleUpdateSet = (setId: string, field: keyof TrainingSet, value: string | number | null) => {
        const setIndex = sets.findIndex(s => s.id === setId);
        if (setIndex === -1) return;

        const updatedSets = [...sets];
        updatedSets[setIndex] = { ...updatedSets[setIndex], [field]: value };
        setSets(updatedSets);
    };

    const handleUpdateSeries = (setId: string, currentTargetReps: string | null | undefined, newSeries: string) => {
        const currentReps = getRepsCount(currentTargetReps);
        handleUpdateSet(setId, 'target_reps', formatTargetReps(newSeries, currentReps));
    };

    const handleUpdateReps = (setId: string, currentTargetReps: string | null | undefined, newReps: string) => {
        const currentSeries = getSeriesCount(currentTargetReps);
        handleUpdateSet(setId, 'target_reps', formatTargetReps(currentSeries, newReps));
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

    if (loading) return <div className="text-xs text-gray-500 p-4">Cargando prescripciones...</div>;

    return (
        <div className="p-4 bg-black/10">
            {sets.length > 0 && (
                <div className="grid grid-cols-11 gap-2 mb-2 text-[10px] uppercase font-bold text-gray-500 tracking-wider text-center">
                    <div className="col-span-2">Series</div>
                    <div className="col-span-2">Reps</div>
                    <div className="col-span-2">RPE</div>
                    <div className="col-span-2">Kilos</div>
                    <div className="col-span-2">Rest (s)</div>
                    <div className="col-span-1"></div>
                </div>
            )}

            <div className="space-y-1">
                {sets.map((set) => {
                    // Use separate local state-derived values from target_reps.
                    // We parse once and pass to a sub-component to keep local input state.
                    const seriesVal = getSeriesCount(set.target_reps);
                    const repsVal   = getRepsCount(set.target_reps);

                    return (
                        <div key={set.id} className="grid grid-cols-11 gap-2 items-center text-sm">
                            {/* Series Input — uncontrolled to avoid leading-zero bug */}
                            <div className="col-span-2">
                                <SetTextInput
                                    initialValue={seriesVal}
                                    placeholder="Ej: 3"
                                    onChange={(v) => handleUpdateSeries(set.id, set.target_reps, v)}
                                    onBlur={() => handleBlur(set.id, { target_reps: set.target_reps })}
                                    resetKey={set.target_reps ?? ''}
                                />
                            </div>

                            {/* Reps Input */}
                            <div className="col-span-2">
                                <SetTextInput
                                    initialValue={repsVal}
                                    placeholder="Ej: 12"
                                    onChange={(v) => handleUpdateReps(set.id, set.target_reps, v)}
                                    onBlur={() => handleBlur(set.id, { target_reps: set.target_reps })}
                                    resetKey={set.target_reps ?? ''}
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
                                <DurationPicker
                                    value={set.rest_seconds ?? null}
                                    onChange={(val) => handleUpdateSet(set.id, 'rest_seconds', val)}
                                    onBlur={() => handleBlur(set.id, { rest_seconds: set.rest_seconds })}
                                />
                            </div>

                            {/* Actions */}
                            <div className="col-span-1 flex justify-end gap-1">
                                {savingId === set.id ? (
                                    <Loader size={12} className="text-anvil-red animate-spin mx-auto" />
                                ) : (
                                    <button
                                        onClick={() => handleDeleteSet(set.id)}
                                        className="p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors mx-auto"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <button
                onClick={handleAddSet}
                className="mt-4 w-full py-2 flex items-center justify-center gap-2 border border-dashed border-white/10 rounded-lg text-xs font-bold text-gray-500 uppercase tracking-wider hover:bg-white/5 hover:text-white hover:border-white/20 transition-all"
            >
                <Plus size={14} />
                Prescribir Series
            </button>
        </div>
    );
}
