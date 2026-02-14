
import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrainingBlock, TrainingSession, SessionExercise, TrainingSet, ExerciseLibrary } from '../../../types/training';
import { trainingService } from '../../../services/trainingService';
import { supabase } from '../../../lib/supabase';
import { Loader, Plus, Save, Trash2, Video, Copy, Calendar, Target } from 'lucide-react';
import { toast } from 'sonner';
import { getWeekNumber, getDateRangeFromWeek, formatDateRange } from '../../../utils/dateUtils';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';

interface WorkoutBuilderProps {
    athleteId: string;
    blockId?: string | null;
}

// ==========================================
// TYPES FOR LOCAL STATE
// ==========================================
// We extend the base types to include relations nested for easier rendering
interface ExtendedSession extends TrainingSession {
    exercises: ExtendedSessionExercise[];
}

interface ExtendedSessionExercise extends SessionExercise {
    exercise?: ExerciseLibrary;
    sets: TrainingSet[];
}

interface FullBlockData extends TrainingBlock {
    sessions: ExtendedSession[];
}

// ==========================================
// COMPONENT: WORKOUT BUILDER
// ==========================================
export function WorkoutBuilder({ athleteId, blockId }: WorkoutBuilderProps) {
    const [loading, setLoading] = useState(true);
    const [blockData, setBlockData] = useState<FullBlockData | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    // Expanded weeks state - default to collapsed
    const [expandedWeeks, setExpandedWeeks] = useState<number[]>([]);

    // Custom Week Names State
    const [weekNames, setWeekNames] = useState<Record<number, string>>({});
    const [editingWeek, setEditingWeek] = useState<number | null>(null);
    const [weekNameInput, setWeekNameInput] = useState("");

    // Calculate current week number for status badges
    const currentRealWeek = getWeekNumber();

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', description: '', onConfirm: () => { } });

    const loadData = useCallback(async () => {
        setLoading(true);
        if (!athleteId || !blockId) {
            setBlockData(null);
            setLoading(false);
            return;
        }
        try {
            const block = await trainingService.getBlock(blockId);

            // 2. Fetch Sessions
            const { data: sessions, error: sessError } = await supabase
                .from('training_sessions')
                .select(`
                    *,
                    session_exercises (
                        *,
                        exercise:exercise_library (*),
                        training_sets (*)
                    )
                `)
                .eq('block_id', blockId)
                .order('day_number');

            if (sessError) throw sessError;

            // Sort nested data properly
            const formattedSessions: ExtendedSession[] = (sessions || []).map(s => ({
                ...s,
                exercises: (s.session_exercises || [])
                    .sort((a: any, b: any) => a.order_index - b.order_index)
                    .map((e: any) => ({
                        ...e,
                        sets: (e.training_sets || []).sort((a: any, b: any) => a.order_index - b.order_index)
                    }))
            }));

            // Fetch Week Names
            const names = await trainingService.getWeeksByBlock(blockId);
            setWeekNames(names);

            setBlockData({ ...block, sessions: formattedSessions });

        } catch (err) {
            console.error(err);
            toast.error("Error cargando el mesociclo");
        } finally {
            setLoading(false);
        }
    }, [athleteId, blockId]);

    // Initial Load
    useEffect(() => {
        loadData();
    }, [athleteId, blockId, loadData]);

    // Reset expanded weeks when block changes (collapse all)
    useEffect(() => {
        setExpandedWeeks([]);
    }, [blockData?.id]);


    const handleSaveChanges = async () => {
        if (!blockData) return;
        setIsSaving(true);
        try {
            // Flatten all sets to upsert
            const allSets: TrainingSet[] = [];

            blockData.sessions.forEach(session => {
                session.exercises.forEach(ex => {
                    ex.sets.forEach(set => {
                        allSets.push(set);
                    });
                });
            });

            // Batch UPSERT
            const { error } = await supabase
                .from('training_sets')
                .upsert(allSets, { onConflict: 'id' });

            if (error) throw error;

            toast.success("Progreso guardado");
            setHasUnsavedChanges(false);
        } catch (err) {
            console.error(err);
            toast.error("Error al guardar cambios");
        } finally {
            setIsSaving(false);
        }
    };

    // ==========================================
    // LOCAL STATE MUTATIONS (Immediate UI updates)
    // ==========================================

    // --- Sessions ---
    const addSession = async (weekNumber: number) => {
        if (!blockData) return;
        // Count days only in target week
        const sessionsInWeek = blockData.sessions.filter(s => s.week_number === weekNumber);
        const nextDay = sessionsInWeek.length + 1;
        try {
            // Server Create for Structure
            const newSession = await trainingService.createSession({
                block_id: blockData.id,
                week_number: weekNumber,
                day_number: nextDay,
                name: `Día ${nextDay}`
            });

            setBlockData(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    sessions: [...prev.sessions, { ...newSession, exercises: [] }]
                };
            });

            // Ensure the week is expanded when adding a day
            if (!expandedWeeks.includes(weekNumber)) {
                setExpandedWeeks(prev => [...prev, weekNumber]);
            }

        } catch {
            toast.error("Error añadiendo día");
        }
    };

    const updateSessionName = async (sessionId: string, name: string) => {
        setBlockData(prev => {
            if (!prev) return null;
            return {
                ...prev,
                sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, name } : s)
            };
        });

        // Background update
        await supabase.from('training_sessions').update({ name }).eq('id', sessionId);
    };

    const updateSessionDate = async (sessionId: string, date: string) => {
        setBlockData(prev => {
            if (!prev) return null;
            return {
                ...prev,
                sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, date } : s)
            };
        });
        await supabase.from('training_sessions').update({ date }).eq('id', sessionId);
    };

    // --- Exercises ---
    const addExercise = async (sessionId: string, exerciseName: string) => {
        const session = blockData?.sessions.find(s => s.id === sessionId);
        if (!session) return;

        try {
            // 1. Find or Create Exercise ID
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user found");

            const exerciseId = await trainingService.findOrCreateExercise(exerciseName, user.id);

            // 2. Add to Session
            const nextOrder = session.exercises.length;
            const newSessionExercise = await trainingService.addSessionExercise(sessionId, exerciseId, nextOrder);

            // Fetch the exercise details again (or construct them) for local state
            const exerciseDisplay: ExerciseLibrary = {
                id: exerciseId,
                name: exerciseName,
                is_public: false, // assumption
                created_at: new Date().toISOString()
            };

            const extendedEx: ExtendedSessionExercise = {
                ...newSessionExercise,
                exercise: exerciseDisplay, // Attach details
                sets: []
            };

            setBlockData(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    sessions: prev.sessions.map(s => {
                        if (s.id !== sessionId) return s;
                        return {
                            ...s,
                            exercises: [...s.exercises, extendedEx]
                        };
                    })
                };
            });
        } catch (err) {
            toast.error(`Error añadiendo ejercicio: ${(err as Error).message || 'Desconocido'}`);
        }
    };

    const removeExercise = async (sessionExerciseId: string, sessionId: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Eliminar ejercicio',
            description: '¿Estás seguro de que quieres eliminar este ejercicio? Se perderán todas las series registradas.',
            onConfirm: async () => {
                try {
                    await supabase.from('session_exercises').delete().eq('id', sessionExerciseId);
                    setBlockData(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            sessions: prev.sessions.map(s => {
                                if (s.id !== sessionId) return s;
                                return {
                                    ...s,
                                    exercises: s.exercises.filter(e => e.id !== sessionExerciseId)
                                };
                            })
                        };
                    });
                    toast.success("Ejercicio eliminado");
                } catch {
                    toast.error("Error eliminando ejercicio");
                }
            }
        });
    };

    // --- Sets (All Local until Save) ---
    const addSet = (sessionExerciseId: string) => {
        const newSetId = crypto.randomUUID(); // Valid V4 UUID
        setBlockData(prev => {
            if (!prev) return null;
            setHasUnsavedChanges(true); // Flag change
            return {
                ...prev,
                sessions: prev.sessions.map(s => ({
                    ...s,
                    exercises: s.exercises.map(ex => {
                        if (ex.id !== sessionExerciseId) return ex;

                        const nextOrder = ex.sets.length;
                        const previousSet = ex.sets[ex.sets.length - 1];

                        const newSet: TrainingSet = {
                            id: newSetId,
                            session_exercise_id: sessionExerciseId,
                            order_index: nextOrder,
                            // Inherit defaults if previous exists
                            target_reps: previousSet ? previousSet.target_reps : '',
                            target_rpe: previousSet ? previousSet.target_rpe : '',
                            target_load: previousSet ? previousSet.target_load : null,
                            rest_seconds: previousSet ? previousSet.rest_seconds : 0,
                            is_video_required: false,
                            created_at: new Date().toISOString()
                        };

                        return { ...ex, sets: [...ex.sets, newSet] };
                    })
                }))
            };
        });
    };

    const addBulkSets = (sessionExerciseId: string, count: number, reps: string, load: number | null, rpe: string) => {
        setBlockData(prev => {
            if (!prev) return null;
            setHasUnsavedChanges(true); // Flag change
            return {
                ...prev,
                sessions: prev.sessions.map(s => ({
                    ...s,
                    exercises: s.exercises.map(ex => {
                        if (ex.id !== sessionExerciseId) return ex;

                        const currentSetsCount = ex.sets.length;
                        const newSets: TrainingSet[] = [];

                        for (let i = 0; i < count; i++) {
                            newSets.push({
                                id: crypto.randomUUID(),
                                session_exercise_id: sessionExerciseId,
                                order_index: currentSetsCount + i,
                                target_reps: reps,
                                target_rpe: rpe,
                                target_load: load,
                                rest_seconds: 0, // Default or inherit? Let's default to 0 for now
                                is_video_required: false,
                                created_at: new Date().toISOString()
                            });
                        }

                        return { ...ex, sets: [...ex.sets, ...newSets] };
                    })
                }))
            };
        });
    };

    const duplicateSet = (setId: string) => {
        setBlockData(prev => {
            if (!prev) return null;
            setHasUnsavedChanges(true);
            return {
                ...prev,
                sessions: prev.sessions.map(s => ({
                    ...s,
                    exercises: s.exercises.map(ex => {
                        const setIndex = ex.sets.findIndex(set => set.id === setId);
                        if (setIndex === -1) return ex;
                        const sourceSet = ex.sets[setIndex];
                        const newSet: TrainingSet = {
                            id: crypto.randomUUID(),
                            session_exercise_id: sourceSet.session_exercise_id,
                            order_index: (ex.sets.length + 1) * 10,
                            target_reps: sourceSet.target_reps,
                            target_rpe: sourceSet.target_rpe,
                            target_load: sourceSet.target_load,
                            rest_seconds: sourceSet.rest_seconds,
                            is_video_required: sourceSet.is_video_required,
                            created_at: new Date().toISOString()
                        };
                        const newSets = [...ex.sets];
                        newSets.splice(setIndex + 1, 0, newSet);
                        return { ...ex, sets: newSets };
                    })
                }))
            };
        });
    };

    const removeSet = (setId: string) => {
        supabase.from('training_sets').delete().eq('id', setId).then(({ error }) => {
            if (error) toast.error("Error borrando serie");
        });

        setBlockData(prev => {
            if (!prev) return null;
            return {
                ...prev,
                sessions: prev.sessions.map(s => ({
                    ...s,
                    exercises: s.exercises.map(ex => ({
                        ...ex,
                        sets: ex.sets.filter(set => set.id !== setId)
                    }))
                }))
            };
        });
    };

    const updateSetField = (setId: string, field: keyof TrainingSet, value: TrainingSet[keyof TrainingSet]) => {
        setHasUnsavedChanges(true);
        setBlockData(prev => {
            if (!prev) return null;
            return {
                ...prev,
                sessions: prev.sessions.map(s => ({
                    ...s,
                    exercises: s.exercises.map(ex => ({
                        ...ex,
                        sets: ex.sets.map(set => {
                            if (set.id !== setId) return set;
                            return { ...set, [field]: value };
                        })
                    }))
                }))
            };
        });
    };

    const removeSession = async (sessionId: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Eliminar día',
            description: '¿Estás seguro de que quieres eliminar este día de entrenamiento? Esta acción no se puede deshacer.',
            onConfirm: async () => {
                try {
                    await trainingService.deleteSession(sessionId);
                    setBlockData(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            sessions: prev.sessions.filter(s => s.id !== sessionId)
                        };
                    });
                    toast.success("Día eliminado");
                } catch {
                    toast.error("Error eliminando día");
                }
            }
        });
    };

    // Handlers for Weeks
    const handleAddWeek = async () => {
        if (!blockData) return;
        try {
            setLoading(true); // Optional: show loading state
            const newEndWeek = await trainingService.addWeek(blockData.id);
            await loadData();
            setExpandedWeeks(prev => [...prev, newEndWeek]);
            toast.success("Semana añadida");
        } catch (err) {
            console.error(err);
            toast.error("Error añadiendo semana");
        } finally {
            setLoading(false);
        }
    };

    const handleCopyWeek = async (week: number) => {
        if (!blockData) return;

        // Optional: Confirm? Or just do it. Let's just do it with a toast.
        try {
            setLoading(true);
            const newEndWeek = await trainingService.copyWeek(blockData.id, week);
            await loadData();
            setExpandedWeeks(prev => [...prev, newEndWeek]);
            toast.success(`Semana ${week} copiada a Semana ${newEndWeek}`);
        } catch (err) {
            console.error(err);
            toast.error("Error copiando semana");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteWeek = async (week: number) => {
        if (!blockData) return;

        setConfirmModal({
            isOpen: true,
            title: `Eliminar Semana ${week}`,
            description: `¿Estás seguro de que quieres eliminar la Semana ${week}? Se borrarán todas las sesiones asociadas y esta acción no se puede deshacer.`,
            onConfirm: async () => {
                try {
                    setLoading(true);
                    await trainingService.deleteWeek(blockData.id, week);
                    await loadData();
                    toast.success(`Semana ${week} eliminada`);
                } catch (err) {
                    console.error(err);
                    toast.error("Error eliminando semana");
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const updateSessionExercise = (sessionExerciseId: string, updates: Partial<SessionExercise> & { exercise?: Partial<ExerciseLibrary> }) => {
        setBlockData(prev => {
            if (!prev) return null;
            return {
                ...prev,
                sessions: prev.sessions.map(s => ({
                    ...s,
                    exercises: s.exercises.map(ex => {
                        if (ex.id !== sessionExerciseId) return ex;
                        const newEx: ExtendedSessionExercise = { ...ex, ...updates };
                        if (updates.exercise && ex.exercise) {
                            newEx.exercise = { ...ex.exercise, ...updates.exercise };
                        }
                        return newEx;
                    })
                }))
            };
        });
    };

    // Toggle week expansion
    const handleStartEditWeekName = (week: number, currentName: string | undefined, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingWeek(week);
        setWeekNameInput(currentName || "");
    };

    const handleSaveWeekName = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editingWeek === null || !blockData) return;

        try {
            // Optimistic update
            const newName = weekNameInput.trim();
            setWeekNames(prev => ({ ...prev, [editingWeek]: newName }));
            setEditingWeek(null);

            await trainingService.saveWeekName(blockData.id, editingWeek, newName);
            toast.success("Nombre de semana guardado");
        } catch (err) {
            console.error(err);
            toast.error("Error guardando nombre");
            // Revert on error if needed, but simple enough to just let user retry
        }
    };

    const toggleWeek = (week: number) => {
        setExpandedWeeks(prev =>
            prev.includes(week)
                ? prev.filter(w => w !== week)
                : [...prev, week]
        );
    };

    // RENDER HELPERS
    const weeks = useMemo(() => {
        if (!blockData) return [];
        const startWeek = blockData.start_week ?? 1;
        const endWeek = blockData.end_week ?? 4;
        const weekCount = Math.max(1, endWeek - startWeek + 1);
        return Array.from({ length: weekCount }, (_, i) => startWeek + i);
    }, [blockData]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader className="animate-spin text-anvil-red" />
            </div>
        );
    }

    if (!blockData) {
        return (
            <div className="flex h-full items-center justify-center text-gray-500">
                No hay un bloque activo o no se pudo cargar.
            </div>
        );
    }

    return (
        <div className="relative">

            {/* NEW HEADER DESIGN - Integrated & Clean */}
            <div className="relative shrink-0 z-10 px-6 py-8">

                <div className="relative z-10 flex flex-col gap-6">

                    {/* Main Title Area */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <h2 className="text-5xl md:text-6xl font-black text-white italic tracking-tighter uppercase leading-[0.9]">
                                {blockData.name}
                            </h2>
                            <div className="h-2 w-24 bg-anvil-red mt-4 rounded-full" />
                        </div>

                        {/* Metadata Pills */}
                        <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/5 backdrop-blur-sm">
                                <Calendar size={14} className="text-gray-400" />
                                <span className="text-sm font-medium text-gray-300">
                                    Semana {blockData.start_week} - {blockData.end_week}
                                    <span className="text-gray-500 mx-2">|</span>
                                    {formatDateRange(
                                        getDateRangeFromWeek(blockData.start_week ?? 1).start,
                                        getDateRangeFromWeek(blockData.end_week ?? 1).end
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/5 backdrop-blur-sm">
                                <Target size={14} className="text-gray-400" />
                                <span className="text-sm font-medium text-gray-300">{weeks.length} Semanas</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating Save Button - Ensure it's rendered if state allows */}
            {hasUnsavedChanges && (
                <button
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                    className="animate-bounce-in fixed bottom-8 right-8 z-50 bg-green-500 hover:bg-green-400 text-black font-black px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 transition-transform hover:scale-105"
                >
                    {isSaving ? <Loader className="animate-spin" /> : <Save size={20} />}
                    GUARDAR CAMBIOS
                </button>
            )}

            {/* Weeks List */}
            <div className="px-4 pb-20 space-y-4">
                {weeks.map((week, index) => {
                    const isExpanded = expandedWeeks.includes(week);
                    const weekSessions = blockData.sessions.filter(s => s.week_number === week);

                    // Determine Status
                    let statusColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                    let statusText = "PRÓXIMA";

                    if (week === currentRealWeek) {
                        statusColor = "bg-green-500/10 text-green-500 border-green-500/20";
                        statusText = "ACTIVA";
                    } else if (week < currentRealWeek) {
                        statusColor = "bg-red-500/10 text-red-500 border-red-500/20";
                        statusText = "FINALIZADA";
                    }

                    return (
                        <div key={week} className={`bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden transition-all duration-300 ${week === currentRealWeek ? 'ring-1 ring-green-500/30' : ''}`}>
                            {/* Week Header */}
                            <div
                                className={`
                            px-6 py-5 flex items-center justify-between cursor-pointer transition-all duration-300
                            ${isExpanded ? 'bg-white/5' : 'hover:bg-white/5'}
                        `}
                                onClick={() => toggleWeek(week)}
                            >
                                <div className="flex items-center gap-6">
                                    {/* Status Badge */}
                                    <div className={`px-3 py-1 rounded-md text-xs font-black tracking-wider border ${statusColor}`}>
                                        {statusText}
                                    </div>

                                    {/* Title & info */}
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-3">
                                            {editingWeek === week ? (
                                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={weekNameInput}
                                                        onChange={(e) => setWeekNameInput(e.target.value)}
                                                        className="bg-black/50 border border-white/10 rounded px-2 py-1 text-white font-black uppercase italic text-xl focus:outline-none focus:border-anvil-red w-64"
                                                        placeholder="NOMBRE DE LA SEMANA"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveWeekName(e as any);
                                                        }}
                                                    />
                                                    <button
                                                        onClick={handleSaveWeekName}
                                                        className="p-1 hover:text-green-500 text-gray-400 transition-colors"
                                                    >
                                                        <Save size={18} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3 group">
                                                    <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">
                                                        SEMANA {index + 1}
                                                        {weekNames[week] && <span className="text-anvil-red ml-2">{weekNames[week]}</span>}
                                                    </h3>
                                                    <button
                                                        onClick={(e) => handleStartEditWeekName(week, weekNames[week], e)}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-anvil-red text-gray-600 transition-all duration-200"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-gray-500 font-medium">
                                            <span>Semana {week} del año</span>
                                            <span className="w-1 h-1 rounded-full bg-gray-700" />
                                            {/* Date Range for this specific week */}
                                            <span>
                                                {formatDateRange(
                                                    getDateRangeFromWeek(week).start,
                                                    getDateRangeFromWeek(week).end
                                                )}
                                            </span>
                                            <span className="w-1 h-1 rounded-full bg-gray-700" />
                                            <span>{weekSessions.length} DÍAS PLANIFICADOS</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleCopyWeek(week); }}
                                        className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                        title="Copiar semana"
                                    >
                                        <Copy size={18} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteWeek(week); }}
                                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="Eliminar semana"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Accordion Content */}
                            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                <div className="overflow-hidden">
                                    <div className="p-6 md:p-8">
                                        {/* Days Grid */}
                                        <div className="flex gap-6 overflow-x-auto pb-8 custom-scrollbar px-2">
                                            {weekSessions.map((session) => (
                                                <DayColumn
                                                    key={session.id}
                                                    session={session}
                                                    onUpdateName={updateSessionName}
                                                    onUpdateDate={updateSessionDate}
                                                    onAddExercise={addExercise}
                                                    onUpdateExercise={updateSessionExercise}
                                                    onRemoveExercise={removeExercise}
                                                    onAddSet={addSet}
                                                    onDuplicateSet={duplicateSet}
                                                    onUpdateSet={updateSetField}
                                                    onRemoveSet={removeSet}
                                                    onRemoveSession={removeSession}
                                                    onAddBulkSets={addBulkSets}
                                                />
                                            ))}

                                            {/* ADD DAY BUTTON (Specific to Week) */}
                                            <div
                                                className="w-full md:w-[400px] flex items-center justify-center border-2 border-dashed border-white/10 rounded-3xl hover:border-anvil-red/50 hover:bg-anvil-red/5 transition-all cursor-pointer group shrink-0 min-h-[300px] md:h-auto"
                                                onClick={() => addSession(week)}
                                            >
                                                <div className="flex flex-col items-center gap-4 text-gray-600 group-hover:text-anvil-red transition-colors scale-90 group-hover:scale-100 duration-300">
                                                    <div className="p-4 rounded-full bg-white/5 group-hover:bg-anvil-red/10 transition-colors">
                                                        <Plus size={32} className="group-hover:rotate-90 transition-transform duration-300" />
                                                    </div>
                                                    <span className="font-black uppercase text-sm tracking-widest">Añadir día</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Add Week Button at Bottom */}
                <button
                    onClick={handleAddWeek}
                    className="w-full py-6 border-2 border-dashed border-white/10 rounded-2xl text-gray-500 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all font-bold uppercase tracking-widest flex items-center justify-center gap-3"
                >
                    <Plus size={20} />
                    Añadir Semana
                </button>
            </div>


            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                description={confirmModal.description}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
            />
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: DAY COLUMN
// ==========================================

interface DayColumnProps {
    session: ExtendedSession;
    onUpdateName: (id: string, name: string) => void;
    onUpdateDate: (id: string, date: string) => void;
    onAddExercise: (sessionId: string, name: string) => void;
    onUpdateExercise: (id: string, updates: Partial<SessionExercise> & { exercise?: Partial<ExerciseLibrary> }) => void;
    onRemoveExercise: (id: string, sessionId: string) => void;
    onAddSet: (sessionExerciseId: string) => void;
    onDuplicateSet: (setId: string) => void;
    onUpdateSet: (setId: string, field: keyof TrainingSet, value: TrainingSet[keyof TrainingSet]) => void;
    onRemoveSet: (setId: string) => void;
    onRemoveSession: (id: string) => void;
    onAddBulkSets: (sessionExerciseId: string, count: number, reps: string, load: number | null, rpe: string) => void;
}

function DayColumn({ session, onUpdateName, onAddExercise, onUpdateExercise, onRemoveExercise, onAddSet, onDuplicateSet, onUpdateSet, onRemoveSet, onRemoveSession, onAddBulkSets }: DayColumnProps) {
    const [isAddingEx, setIsAddingEx] = useState(false);

    if (!session) {
        console.error("DayColumn received null session!");
        return null;
    }

    return (
        <div className="w-full md:w-[400px] flex flex-col bg-[#1a1a1a] border border-white/5 rounded-3xl overflow-hidden shadow-2xl h-auto md:h-full shrink-0 relative group/column">
            {/* Header */}
            <div className="p-4 bg-[#202020] border-b border-white/5 relative flex justify-center items-center">
                <button
                    onClick={() => onRemoveSession(session.id)}
                    className="absolute right-4 text-gray-600 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover/column:opacity-100 transition-opacity"
                    title="Eliminar día"
                >
                    <Trash2 size={16} />
                </button>

                <input
                    className="bg-transparent font-black text-xl text-center text-gray-200 outline-none w-full placeholder-gray-600 uppercase tracking-tight py-1"
                    value={session?.name ?? ''}
                    onChange={(e) => onUpdateName(session.id, e.target.value)}
                    placeholder={`DÍA ${session?.day_number}`}
                />
            </div>

            {/* Exercises List */}
            <div className="flex-1 overflow-visible md:overflow-y-auto p-3 space-y-4 custom-scrollbar min-h-[100px]">
                {session.exercises.map((ex: ExtendedSessionExercise) => (
                    <ExerciseCard
                        key={ex.id}
                        sessionExercise={ex}
                        onUpdateExercise={onUpdateExercise}
                        onAddSet={onAddSet}
                        onDuplicateSet={onDuplicateSet}
                        onUpdateSet={onUpdateSet}
                        onRemoveSet={onRemoveSet}
                        onRemoveExercise={() => onRemoveExercise(ex.id, session.id)}
                        onAddBulkSets={onAddBulkSets}
                    />
                ))}

                {/* Add Exercise - Simple Input */}
                <div className="pt-2 pb-4">
                    {!isAddingEx ? (
                        <button
                            onClick={() => setIsAddingEx(true)}
                            className="w-full py-3 bg-[#252525] hover:bg-[#2a2a2a] rounded-2xl text-gray-500 hover:text-anvil-red transition-all text-xs font-black tracking-widest uppercase flex items-center justify-center gap-2 border border-transparent hover:border-anvil-red/20"
                        >
                            <Plus size={14} /> Añadir Ejercicio
                        </button>
                    ) : (
                        <div className="bg-[#252525] border border-white/10 rounded-2xl p-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Escribe el nombre del ejercicio..."
                                className="w-full bg-black/40 text-white font-bold text-center p-3 rounded-xl border border-white/5 focus:border-anvil-red outline-none placeholder-gray-600 mb-3"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = e.currentTarget.value.trim();
                                        if (val) {
                                            onAddExercise(session.id, val);
                                            setIsAddingEx(false);
                                        }
                                    } else if (e.key === 'Escape') {
                                        setIsAddingEx(false);
                                    }
                                }}
                                onBlur={(e) => {
                                    if (!e.currentTarget.value.trim()) setIsAddingEx(false);
                                }}
                            />
                            <div className="flex justify-center gap-4 text-[10px] text-gray-500 font-mono">
                                <span>[Enter] Guardar</span>
                                <span>[Esc] Cancelar</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: EXERCISE CARD
// ==========================================
interface ExerciseCardProps {
    sessionExercise: ExtendedSessionExercise;
    onUpdateExercise: (id: string, updates: Partial<SessionExercise> & { exercise?: Partial<ExerciseLibrary> }) => void;
    onAddSet: (sessionExerciseId: string) => void;
    onDuplicateSet: (setId: string) => void;
    onUpdateSet: (setId: string, field: keyof TrainingSet, value: TrainingSet[keyof TrainingSet]) => void;
    onRemoveSet: (setId: string) => void;
    onRemoveExercise: () => void;
    onAddBulkSets: (sessionExerciseId: string, count: number, reps: string, load: number | null, rpe: string) => void;
}

function ExerciseCard({ sessionExercise, onUpdateExercise, onAddSet, onDuplicateSet, onUpdateSet, onRemoveSet, onRemoveExercise, onAddBulkSets }: ExerciseCardProps) {
    if (!sessionExercise) {
        console.error("ExerciseCard received null sessionExercise");
        return null;
    }
    const [isBulkAdding, setIsBulkAdding] = useState(false);
    const [bulkSets, setBulkSets] = useState(3);
    const [bulkReps, setBulkReps] = useState("");
    const [bulkLoad, setBulkLoad] = useState<number | null>(null);

    const exerciseName = sessionExercise?.exercise?.name || "Ejercicio desconocido";
    const isVariant = exerciseName.toLowerCase().includes('variante') || exerciseName === 'Personalizado';
    const hasVideo = !!sessionExercise.exercise?.video_url;

    const handleVariantChange = (val: string) => {
        onUpdateExercise(sessionExercise.id, { variant_name: val });
    };

    const handleVariantBlur = async () => {
        await trainingService.updateSessionExercise(sessionExercise.id, { variant_name: sessionExercise.variant_name });
    };

    const handleNotesChange = (val: string) => {
        onUpdateExercise(sessionExercise.id, { notes: val });
    };

    const handleNotesBlur = async () => {
        await trainingService.updateSessionExercise(sessionExercise.id, { notes: sessionExercise.notes });
    };

    const handleGlobalUpdate = (field: keyof SessionExercise, val: string | number | null) => {
        onUpdateExercise(sessionExercise.id, { [field]: val });
    };

    const handleGlobalBlur = async (field: keyof SessionExercise, val: string | number | null) => {
        await trainingService.updateSessionExercise(sessionExercise.id, { [field]: val });
    };

    return (
        <div className="bg-[#252525] rounded-2xl border border-white/5 p-4 group relative hover:border-white/10 transition-all shadow-sm">
            {/* Delete Exercise Button (Absolute Top Right) */}
            <button
                onClick={onRemoveExercise}
                className="absolute top-3 right-3 text-gray-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
            >
                <Trash2 size={14} />
            </button>

            {/* Exercise Header - Centered */}
            <div className="flex flex-col items-center mb-4 text-center">
                <div className="flex items-center gap-2 mb-3">
                    <h4 className="font-black text-gray-200 text-base leading-tight uppercase tracking-tight">{exerciseName}</h4>
                    {hasVideo && <Video size={14} className="text-blue-500" />}
                </div>

                {/* Global Fields Container */}
                <div className="w-full space-y-3">
                    {/* Variant (if applicable) */}
                    {isVariant && (
                        <div className="w-full px-4">
                            <input
                                type="text"
                                value={sessionExercise.variant_name || ''}
                                onChange={(e) => handleVariantChange(e.target.value)}
                                onBlur={handleVariantBlur}
                                placeholder="Nombre de la variante..."
                                className="w-full bg-black/20 text-xs text-center text-anvil-red border border-white/5 focus:border-anvil-red rounded-lg py-1.5 px-3 outline-none placeholder-gray-600 transition-colors"
                            />
                        </div>
                    )}

                    {/* Stats Grid */}
                    <div className="flex justify-center gap-2">
                        {/* Vel AVG */}
                        <div className="w-20">
                            <div className="text-[9px] text-gray-500 uppercase font-black mb-1 text-center tracking-wider">Vel AVG</div>
                            <input
                                type="text"
                                value={sessionExercise.velocity_avg || ''}
                                onChange={(e) => handleGlobalUpdate('velocity_avg', e.target.value)}
                                onBlur={(e) => handleGlobalBlur('velocity_avg', e.target.value)}
                                placeholder="-"
                                className="w-full bg-black/20 text-xs text-center text-gray-300 border border-white/5 focus:border-anvil-red rounded-lg py-1.5 outline-none placeholder-gray-700 font-mono"
                            />
                        </div>

                        {/* RPE */}
                        <div className="w-20">
                            <div className="text-[9px] text-gray-500 uppercase font-black mb-1 text-center tracking-wider">RPE</div>
                            <input
                                type="text"
                                value={sessionExercise.rpe || ''}
                                onChange={(e) => handleGlobalUpdate('rpe', e.target.value)}
                                onBlur={(e) => handleGlobalBlur('rpe', e.target.value)}
                                placeholder="-"
                                className="w-full bg-black/20 text-xs text-center text-gray-300 border border-white/5 focus:border-anvil-red rounded-lg py-1.5 outline-none placeholder-gray-700 font-mono"
                            />
                        </div>

                        {/* Rest */}
                        <div className="w-20">
                            <div className="text-[9px] text-gray-500 uppercase font-black mb-1 text-center tracking-wider">Rest (s)</div>
                            <input
                                type="number"
                                value={sessionExercise.rest_seconds || 0}
                                onChange={(e) => handleGlobalUpdate('rest_seconds', parseInt(e.target.value) || 0)}
                                onBlur={(e) => handleGlobalBlur('rest_seconds', parseInt(e.target.value) || 0)}
                                placeholder="-"
                                className="w-full bg-black/20 text-xs text-center text-gray-300 border border-white/5 focus:border-anvil-red rounded-lg py-1.5 outline-none placeholder-gray-700 font-mono"
                            />
                        </div>
                    </div>

                    {/* Notes Input */}
                    <textarea
                        value={sessionExercise.notes || ''}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        onBlur={handleNotesBlur}
                        placeholder="Notas técnicas..."
                        className="w-full bg-black/20 text-xs text-gray-400 text-center border border-white/5 rounded-lg p-2 focus:border-anvil-red focus:text-gray-200 outline-none resize-none h-[40px] leading-tight transition-colors"
                    />
                </div>
            </div>

            {/* Sets Table */}
            <div className="space-y-1 bg-black/20 p-2 rounded-xl border border-white/5">
                {/* Header Row */}
                <div className="grid grid-cols-[20px_1fr_1fr_40px] gap-2 text-[9px] text-gray-600 font-black uppercase text-center mb-2 px-1">
                    <span>#</span>
                    <span>Reps</span>
                    <span>Kg</span>
                    <span></span>
                </div>

                {sessionExercise.sets.map((set: TrainingSet, idx: number) => (
                    <div key={set.id} className="grid grid-cols-[20px_1fr_1fr_40px] gap-2 items-center group/row">
                        <span className="text-xs text-gray-600 text-center font-mono font-bold">{idx + 1}</span>

                        <CompactInput
                            value={set.target_reps}
                            onChange={(v) => onUpdateSet(set.id, 'target_reps', v as string)}
                            placeholder="-"
                        />
                        <CompactInput
                            value={set.target_load}
                            onChange={(v) => onUpdateSet(set.id, 'target_load', v as number)}
                            placeholder="-"
                            type="number"
                        />

                        {/* Actions */}
                        <div className="flex justify-end gap-0.5 opacity-100 md:opacity-0 group-hover/row:opacity-100 transition-opacity">
                            <button onClick={() => onDuplicateSet(set.id)} className="text-gray-700 hover:text-blue-400 p-0.5" title="Duplicar serie"><Copy size={11} /></button>
                            <button onClick={() => onRemoveSet(set.id)} className="text-gray-700 hover:text-red-500 p-0.5" title="Eliminar serie"><Trash2 size={12} /></button>
                        </div>
                    </div>
                ))}

                {/* Bulk Add UI */}
                {isBulkAdding ? (
                    <div className="mt-2 p-3 bg-[#2a2a2a] rounded-xl border border-white/10 animate-in fade-in zoom-in-95">
                        <div className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wide text-center">Añadir Múltiples Series</div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            <div>
                                <label className="block text-[9px] text-gray-500 text-center mb-1">Series</label>
                                <input
                                    type="number"
                                    value={bulkSets}
                                    onChange={(e) => setBulkSets(Number(e.target.value))}
                                    className="w-full bg-black/40 text-xs text-center text-white border border-white/5 rounded py-1 focus:border-anvil-red outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] text-gray-500 text-center mb-1">Reps</label>
                                <input
                                    type="text"
                                    value={bulkReps}
                                    onChange={(e) => setBulkReps(e.target.value)}
                                    placeholder="-"
                                    className="w-full bg-black/40 text-xs text-center text-white border border-white/5 rounded py-1 focus:border-anvil-red outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] text-gray-500 text-center mb-1">Kg</label>
                                <input
                                    type="number"
                                    value={bulkLoad ?? ''}
                                    onChange={(e) => setBulkLoad(e.target.value ? Number(e.target.value) : null)}
                                    placeholder="-"
                                    className="w-full bg-black/40 text-xs text-center text-white border border-white/5 rounded py-1 focus:border-anvil-red outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsBulkAdding(false)}
                                className="flex-1 py-1.5 bg-transparent border border-white/10 hover:bg-white/5 rounded-lg text-[10px] text-gray-400 font-bold uppercase transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    onAddBulkSets(sessionExercise.id, bulkSets, bulkReps, bulkLoad, ""); // Empty RPE as requested
                                    setIsBulkAdding(false);
                                    // Reset fields optionally
                                }}
                                className="flex-1 py-1.5 bg-anvil-red hover:bg-red-600 rounded-lg text-[10px] text-white font-bold uppercase transition-colors"
                            >
                                Generar
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={() => onAddSet(sessionExercise.id)}
                            className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-1 active:scale-95"
                        >
                            <Plus size={10} /> SERIE
                        </button>
                        <button
                            onClick={() => setIsBulkAdding(true)}
                            className="w-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-anvil-red transition-colors active:scale-95"
                            title="Añadir Múltiples Series"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 12h10" /><path d="M11 18h10" /><path d="M11 6h10" /><path d="M3 18h0" /><path d="M3 12h0" /><path d="M3 6h0" /></svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: COMPACT INPUT
// ==========================================
interface CompactInputProps {
    value?: string | number | null; // Allow undefined
    onChange: (val: string | number | null) => void; // Strict type
    placeholder?: string;
    type?: 'text' | 'number';
}

function CompactInput({ value, onChange, placeholder, type = "text" }: CompactInputProps) {
    return (
        <input
            type={type}
            value={value ?? ''}
            onChange={(e) => {
                const val = e.target.value;
                if (type === 'number') {
                    onChange(val === '' ? null : Number(val));
                } else {
                    onChange(val);
                }
            }}
            onWheel={(e) => e.currentTarget.blur()} // Prevent accidental scroll changes
            className="w-full bg-[#2a2a2a] border border-transparent hover:border-white/10 focus:border-blue-500 rounded px-1 py-1 text-xs text-center text-white outline-none transition-colors placeholder-gray-700"
            placeholder={placeholder}
        />
    )
}

// End of file
