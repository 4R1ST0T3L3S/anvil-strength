
import { useState, useEffect, useMemo } from 'react';
import { TrainingBlock, TrainingSession, SessionExercise, TrainingSet, ExerciseLibrary } from '../../../types/training';
import { trainingService } from '../../../services/trainingService';
import { supabase } from '../../../lib/supabase';
import { Loader, Plus, Save, Copy, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { WeekNavigator } from '../../coach/components/WeekNavigator';
import { getWeekNumber } from '../../../utils/dateUtils';
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
    const [currentWeek, setCurrentWeek] = useState(() => getWeekNumber());

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', description: '', onConfirm: () => { } });

    // Initial Load
    useEffect(() => {
        loadData();
    }, [athleteId, blockId]);

    // Warn before leaving if unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    const loadData = async () => {
        setLoading(true);
        try {
            let activeBlock: TrainingBlock | undefined;

            if (blockId) {
                // Fetch specific block
                activeBlock = await trainingService.getBlock(blockId);
            } else {
                // 1. Fetch Active Block
                const blocks = await trainingService.getBlocksByAthlete(athleteId);
                activeBlock = blocks.find(b => b.is_active);
            }

            if (!activeBlock) {
                setBlockData(null);
                setLoading(false);
                return;
            }

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
                .eq('block_id', activeBlock.id)
                .order('day_number');

            if (sessError) throw sessError;

            // Sort nested data properly
            const formattedSessions: ExtendedSession[] = (sessions || []).map(s => ({
                ...s,
                exercises: (s.session_exercises || [])
                    .sort((a: any, b: any) => a.order_index - b.order_index)
                    .map((e: any) => ({
                        ...e,
                        sets: (e.training_sets || []).sort((a: TrainingSet, b: TrainingSet) => a.order_index - b.order_index)
                    }))
            }));

            setBlockData({ ...activeBlock, sessions: formattedSessions });

        } catch (err) {
            console.error(err);
            toast.error("Error cargando el mesociclo");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBlock = async () => {
        setLoading(true);
        const now = new Date();
        const monthName = now.toLocaleString('default', { month: 'long' });

        try {
            await trainingService.createBlock({
                athlete_id: athleteId,
                coach_id: (await supabase.auth.getUser()).data.user?.id || '',
                name: `Bloque ${monthName} ${now.getFullYear()}`,
                is_active: true,
                start_date: now.toISOString(),
            });
            await loadData();
            toast.success("Nuevo bloque creado");
        } catch (err) {
            toast.error("Error creando bloque");
            setLoading(false);
        }
    };

    const handleSaveChanges = async () => {
        if (!blockData) return;
        setIsSaving(true);
        try {
            // Flatten all sets to upsert
            const allSets: TrainingSet[] = [];

            blockData.sessions.forEach(session => {
                session.exercises.forEach(ex => {
                    ex.sets.forEach(set => {
                        // Clean up potential temporary fields if any (none for now)
                        // Make sure we send valid UUIDs (we generate them on creation)
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
    const addSession = async () => {
        if (!blockData) return;
        // Count days only in current week
        const sessionsInWeek = blockData.sessions.filter(s => s.week_number === currentWeek);
        const nextDay = sessionsInWeek.length + 1;
        try {
            // Server Create for Structure
            const newSession = await trainingService.createSession({
                block_id: blockData.id,
                week_number: currentWeek,
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
        } catch (err) {
            toast.error("Error añadiendo día");
        }
    };

    const updateSessionName = async (sessionId: string, name: string) => {
        // Optimistic + Debounced Server Update could go here.
        // For now just local update + background server update or included in batch?
        // Requirement says "Save Changes" for *state*. 
        // But typically Sessions/Exercises need to exist for Sets to link to.
        // We'll update local state and let the user know structure changes are mostly auto-saved?
        // Actually, let's keep session name local and save it? No, sessions table structure is separate from sets.
        // Let's do autosave for Session Name (simple update)
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
            // Optimization: we could return full object from service, but fine to construct minimal for now
            // We need the name to display immediately.
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
        } catch (err: any) {
            console.error("FAILED ADDING EXERCISE", err);
            console.error("Details:", err.message, err.details, err.hint);
            toast.error(`Error añadiendo ejercicio: ${err.message || 'Desconocido'}`);
        }
    };

    const removeExercise = async (sessionExerciseId: string, sessionId: string) => {
        if (!confirm("¿Eliminar ejercicio?")) return;
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
        } catch (err) {
            toast.error("Error eliminando");
        }
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

    const removeSet = (setId: string) => {
        // Technically this should be a soft delete or tracked delete if we want to batch delete.
        // Or we just delete from DB immediately if it exists?
        // To keep it simple and consistent: "Delete is immediate for consistency, Update is batched".
        // Or better: Track "deletedSetIds" and send them on Save.
        // Let's verify requirement: "No guardes en BD con cada tecla". Deleting a row is not a keystroke.
        // I will delete immediately from DB to avoid complexity of "Ghost sets".

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

    const updateSetField = (setId: string, field: keyof TrainingSet, value: any) => {
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

    const duplicateSet = (set: TrainingSet) => {
        const newSetId = crypto.randomUUID();
        setBlockData(prev => {
            if (!prev) return null;
            setHasUnsavedChanges(true);
            return {
                ...prev,
                sessions: prev.sessions.map(s => ({
                    ...s,
                    exercises: s.exercises.map(ex => {
                        if (ex.id !== set.session_exercise_id) return ex;

                        const nextOrder = ex.sets.length;
                        const newSet: TrainingSet = {
                            ...set,
                            id: newSetId,
                            order_index: nextOrder,
                            created_at: new Date().toISOString(),
                            actual_reps: null, // Reset actuals
                            actual_load: null,
                            actual_rpe: null
                        };

                        return { ...ex, sets: [...ex.sets, newSet] };
                    })
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
                } catch (err) {
                    toast.error("Error eliminando día");
                }
            }
        });
    };

    // ==========================================
    // RENDER
    // ==========================================

    const weeks = useMemo(() => {
        if (!blockData) return [];

        // Use start_week and end_week from block if available
        const startWeek = blockData.start_week ?? 1;
        const endWeek = blockData.end_week ?? 4;

        // Generate array from startWeek to endWeek
        const weekCount = Math.max(1, endWeek - startWeek + 1);
        return Array.from({ length: weekCount }, (_, i) => startWeek + i);
    }, [blockData]);

    const currentWeekSessions = useMemo(() => {
        if (!blockData) return [];
        return blockData.sessions.filter(s => s.week_number === currentWeek);
    }, [blockData, currentWeek]);

    // Handlers for WeekNavigator needing data
    const handleAddWeek = async () => {
        if (!blockData) return;
        // Implementation for adding week (extend block end date logic or mostly update week_count)
        // For now just update local state if needed or toast
        toast.info("Funcionalidad de añadir semana en desarrollo");
    };

    const handleCopyWeek = (week: number) => {
        toast.info("Funcionalidad de copiar semana en desarrollo");
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

                    if (currentWeek === week) {
                        setCurrentWeek(Math.max(1, week - 1));
                    } else if (currentWeek > week) {
                        setCurrentWeek(currentWeek - 1);
                    }

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
                        // Handles nested exercise updates if any, or flat fields
                        // Also handles merging 'exercise' object updates for local display
                        const newEx = { ...ex, ...updates };
                        if (updates.exercise) {
                            newEx.exercise = { ...ex.exercise, ...updates.exercise } as any;
                        }
                        return newEx;
                    })
                }))
            };
        });
    };

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

    console.log("WorkoutBuilder Render", { blockData, currentWeek });

    return (
        <div className="h-full flex flex-col relative">

            {/* Header Info */}
            <div className="mb-4 flex justify-between items-center px-2">
                <div>
                    <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">{blockData.name}</h2>
                    <p className="text-gray-500 text-sm">Planificando entrenamiento</p>
                </div>

                {/* SAVE FLOATING BUTTON */}
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
            </div>

            {/* Week Navigator */}
            <div className="px-2 mb-4">
                <WeekNavigator
                    weeks={weeks}
                    currentWeek={currentWeek}
                    onSelectWeek={setCurrentWeek}
                    onAddWeek={handleAddWeek}
                    onCopyWeek={handleCopyWeek}
                    onDeleteWeek={handleDeleteWeek}
                    blockEndWeek={blockData.end_week} // New Prop
                />
            </div>

            {/* GRID CONTAINER - Days in current week */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
                <div className="flex h-full gap-4 px-2 min-w-max">
                    {currentWeekSessions.map((session) => (
                        <DayColumn
                            key={session.id}
                            session={session}
                            onUpdateName={updateSessionName}
                            onUpdateDate={updateSessionDate}
                            onAddExercise={addExercise}
                            onUpdateExercise={updateSessionExercise}
                            onRemoveExercise={removeExercise}
                            onAddSet={addSet}
                            onUpdateSet={updateSetField}
                            onRemoveSet={removeSet}
                            onDuplicateSet={duplicateSet}
                            onRemoveSession={removeSession}
                        />
                    ))}


                    {/* ADD DAY COLUMN */}
                    <div className="w-16 flex items-center justify-center border-2 border-dashed border-white/10 rounded-2xl hover:border-white/30 hover:bg-white/5 transition-colors cursor-pointer" onClick={addSession}>
                        <Plus className="text-gray-500" />
                    </div>
                </div>
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
function DayColumn({ session, onUpdateName, onAddExercise, onUpdateExercise, onRemoveExercise, onAddSet, onUpdateSet, onRemoveSet, onDuplicateSet, onRemoveSession }: any) {
    const [isAddingEx, setIsAddingEx] = useState(false);

    if (!session) {
        console.error("DayColumn received null session!");
        return null;
    }

    return (
        <div className="w-[400px] flex flex-col bg-[#252525] border border-white/5 rounded-2xl overflow-hidden shadow-xl h-full">
            {/* Header */}
            <div className="p-4 bg-[#2a2a2a] border-b border-white/5 space-y-2 group/header relative">
                <button
                    onClick={() => onRemoveSession(session.id)}
                    className="absolute top-1/2 -translate-y-1/2 right-4 text-gray-600 hover:text-red-500 opacity-0 group-hover/header:opacity-100 transition-opacity z-10"
                    title="Eliminar día"
                >
                    <Trash2 size={16} />
                </button>

                <div className="flex justify-between items-center group">
                    <input
                        className="bg-transparent font-black text-lg text-gray-200 outline-none w-full placeholder-gray-600 uppercase tracking-tight"
                        value={session?.name ?? ''}
                        onChange={(e) => onUpdateName(session.id, e.target.value)}
                        placeholder={`DÍA ${session?.day_number}`}
                    />
                </div>
            </div>

            {/* Exercises List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {session.exercises.map((ex: ExtendedSessionExercise) => (
                    <ExerciseCard
                        key={ex.id}
                        sessionExercise={ex}
                        onUpdateExercise={onUpdateExercise}
                        onAddSet={onAddSet}
                        onUpdateSet={onUpdateSet}
                        onRemoveSet={onRemoveSet}
                        onRemoveExercise={() => onRemoveExercise(ex.id, session.id)}
                        onDuplicateSet={onDuplicateSet}
                    />
                ))}

                {/* Add Exercise - Simple Input */}
                <div className="relative">
                    {!isAddingEx ? (
                        <button
                            onClick={() => setIsAddingEx(true)}
                            className="w-full py-3 border border-dashed border-white/10 rounded-xl text-gray-500 hover:text-gray-300 hover:border-white/30 hover:bg-white/5 transition-all text-sm font-bold flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> AÑADIR EJERCICIO
                        </button>
                    ) : (
                        <div className="bg-[#1c1c1c] border border-white/20 rounded-xl p-3 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Escribe el nombre del ejercicio..."
                                className="w-full bg-black/20 text-white font-bold p-2 rounded-lg border border-white/10 focus:border-anvil-red outline-none placeholder-gray-600 mb-2"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = e.currentTarget.value.trim();
                                        if (val) {
                                            onAddExercise(session.id, val); // Pass string name instead of object check logic
                                            setIsAddingEx(false);
                                        }
                                    } else if (e.key === 'Escape') {
                                        setIsAddingEx(false);
                                    }
                                }}
                                onBlur={(e) => {
                                    if (!e.currentTarget.value.trim()) setIsAddingEx(false);
                                    // Optional: save on blur if not empty? 
                                    // Better to require explicit enter for "creating" to avoid accidental creates.
                                }}
                            />
                            <div className="flex justify-end gap-2 text-[10px] text-gray-500">
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
function ExerciseCard({ sessionExercise, onUpdateExercise, onAddSet, onUpdateSet, onRemoveSet, onRemoveExercise, onDuplicateSet }: any) {
    if (!sessionExercise) {
        console.error("ExerciseCard received null sessionExercise");
        return null;
    }
    const exerciseName = sessionExercise?.exercise?.name || "Ejercicio desconocido";
    const isVariant = exerciseName.toLowerCase().includes('variante') || exerciseName === 'Personalizado';
    const hasVideo = !!sessionExercise.exercise?.video_url;

    const handleVariantChange = (val: string) => {
        onUpdateExercise(sessionExercise.id, { variant_name: val } as any);
    };

    const handleVariantBlur = async () => {
        await trainingService.updateSessionExercise(sessionExercise.id, { variant_name: sessionExercise.variant_name } as any);
    };

    const handleNotesChange = (val: string) => {
        onUpdateExercise(sessionExercise.id, { notes: val } as any);
    };

    const handleNotesBlur = async () => {
        await trainingService.updateSessionExercise(sessionExercise.id, { notes: sessionExercise.notes } as any);
    };

    const handleGlobalUpdate = (field: string, val: any) => {
        onUpdateExercise(sessionExercise.id, { [field]: val } as any);
    };

    const handleGlobalBlur = async (field: string, val: any) => {
        await trainingService.updateSessionExercise(sessionExercise.id, { [field]: val } as any);
    };

    return (
        <div className="bg-[#1c1c1c] rounded-xl border border-white/5 p-3 group relative hover:border-white/10 transition-colors">
            {/* Exercise Header */}
            <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col gap-1 w-full mr-2">
                    <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-200 text-sm leading-tight">{exerciseName}</h4>
                        {hasVideo && <Video size={14} className="text-blue-500" />}
                    </div>

                    {/* Global Fields (RPE, Rest, Notes) & Variant */}
                    <div className="mt-2 space-y-2">

                        {/* Variant & RPE/Rest Row */}
                        <div className="flex gap-2 justify-center">
                            {/* Variant (if applicable) */}
                            {isVariant && (
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        value={sessionExercise.variant_name || ''}
                                        onChange={(e) => handleVariantChange(e.target.value)}
                                        onBlur={handleVariantBlur}
                                        placeholder="Variante..."
                                        className="w-full bg-black/20 text-xs text-anvil-red border border-white/5 focus:border-anvil-red rounded-lg py-1 px-2 outline-none placeholder-gray-600"
                                    />
                                </div>
                            )}

                            {/* Vel AVG */}
                            <div className="w-20">
                                <div className="text-[9px] text-gray-500 uppercase font-black mb-0.5 text-center">Vel AVG</div>
                                <input
                                    type="text"
                                    value={sessionExercise.velocity_avg || ''}
                                    onChange={(e) => handleGlobalUpdate('velocity_avg', e.target.value)}
                                    onBlur={(e) => handleGlobalBlur('velocity_avg', e.target.value)}
                                    placeholder="0.35"
                                    className="w-full bg-black/20 text-xs text-center text-gray-300 border border-white/5 focus:border-anvil-red rounded-lg py-1 outline-none placeholder-gray-700"
                                />
                            </div>

                            {/* RPE */}
                            <div className="w-20">
                                <div className="text-[9px] text-gray-500 uppercase font-black mb-0.5 text-center">RPE</div>
                                <input
                                    type="text"
                                    value={sessionExercise.rpe || ''}
                                    onChange={(e) => handleGlobalUpdate('rpe', e.target.value)}
                                    onBlur={(e) => handleGlobalBlur('rpe', e.target.value)}
                                    placeholder="@8"
                                    className="w-full bg-black/20 text-xs text-center text-gray-300 border border-white/5 focus:border-anvil-red rounded-lg py-1 outline-none placeholder-gray-700"
                                />
                            </div>

                            {/* Rest */}
                            <div className="w-20">
                                <div className="text-[9px] text-gray-500 uppercase font-black mb-0.5 text-center">Rest (s)</div>
                                <input
                                    type="number"
                                    value={sessionExercise.rest_seconds || 0}
                                    onChange={(e) => handleGlobalUpdate('rest_seconds', parseInt(e.target.value) || 0)}
                                    onBlur={(e) => handleGlobalBlur('rest_seconds', parseInt(e.target.value) || 0)}
                                    placeholder="90"
                                    className="w-full bg-black/20 text-xs text-center text-gray-300 border border-white/5 focus:border-anvil-red rounded-lg py-1 outline-none placeholder-gray-700"
                                />
                            </div>
                        </div>

                        {/* Notes Input */}
                        <textarea
                            value={sessionExercise.notes || ''}
                            onChange={(e) => handleNotesChange(e.target.value)}
                            onBlur={handleNotesBlur}
                            placeholder="Notas para el atleta..."
                            className="w-full bg-black/20 text-xs text-gray-400 border border-white/5 rounded-lg p-2 focus:border-anvil-red focus:text-gray-200 outline-none resize-none h-[50px]"
                        />
                    </div>
                </div>
                <button onClick={onRemoveExercise} className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Sets Table */}
            <div className="space-y-1">
                {/* Header Row */}
                <div className="grid grid-cols-[20px_1fr_1fr_1fr_24px] gap-2 text-[10px] text-gray-500 font-bold uppercase text-center mb-1">
                    <span>#</span>
                    <span>Reps</span>
                    <span>Kg</span>
                    <span></span>
                </div>

                {sessionExercise.sets.map((set: TrainingSet, idx: number) => (
                    <div key={set.id} className="grid grid-cols-[20px_1fr_1fr_1fr_24px] gap-2 items-center group/row">
                        <span className="text-xs text-gray-600 text-center font-mono">{idx + 1}</span>

                        <CompactInput
                            value={set.target_reps}
                            onChange={(v: string) => onUpdateSet(set.id, 'target_reps', v)}
                            placeholder="-"
                        />
                        <CompactInput
                            value={set.target_load}
                            onChange={(v: number | null) => onUpdateSet(set.id, 'target_load', v)}
                            placeholder="-"
                            type="number"
                        />

                        {/* Actions */}
                        <div className="flex justify-end opacity-0 group-hover/row:opacity-100 transition-opacity">
                            <button onClick={() => onDuplicateSet(set)} className="text-gray-600 hover:text-blue-500 mr-1"><Copy size={12} /></button>
                            <button onClick={() => onRemoveSet(set.id)} className="text-gray-600 hover:text-red-500"><Trash2 size={12} /></button>
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={() => onAddSet(sessionExercise.id)}
                className="w-full mt-3 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold text-gray-400 transition-colors"
            >
                + SERIE
            </button>
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: COMPACT INPUT
// ==========================================
function CompactInput({ value, onChange, placeholder, type = "text" }: any) {
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
