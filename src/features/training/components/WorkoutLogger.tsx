import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock, TrainingSession, SessionExercise, TrainingSet } from '../../../types/training';
import { Loader, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { RestTimerOverlay } from './RestTimerOverlay';

interface WorkoutLoggerProps {
    athleteId: string;
}

// Helper for classes
function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

// ==========================================
// TYPES (Expanded)
// ==========================================
interface ExtendedSessionExercise extends Omit<SessionExercise, 'exercise'> {
    exercise: {
        name: string;
        video_url?: string | null;
        muscle_group?: string | null;
    };
    sets: TrainingSet[];
}

interface ExtendedSession extends Omit<TrainingSession, 'exercises'> {
    exercises: ExtendedSessionExercise[];
}

// ==========================================
// COMPONENT: WORKOUT LOGGER
// ==========================================
export function WorkoutLogger({ athleteId }: WorkoutLoggerProps) {
    const [loading, setLoading] = useState(true);
    const [block, setBlock] = useState<TrainingBlock | null>(null);
    const [sessions, setSessions] = useState<ExtendedSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // Timer State
    const [timerEndTime, setTimerEndTime] = useState<number | null>(null);

    const handleStartTimer = (seconds: number) => {
        const now = Date.now();
        setTimerEndTime(now + seconds * 1000);
    };

    const handleCloseTimer = () => {
        setTimerEndTime(null);
    };

    const handleAddTimerSeconds = (seconds: number) => {
        if (timerEndTime) {
            setTimerEndTime(timerEndTime + seconds * 1000);
        }
    };

    // Initial Load
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                // 1. Get Active Block
                const blocks = await trainingService.getBlocksByAthlete(athleteId);
                const active = blocks.find(b => b.is_active);

                if (!active) {
                    setBlock(null);
                    setLoading(false);
                    return;
                }
                setBlock(active);

                // 2. Get Sessions
                const { data: sessData, error } = await supabase
                    .from('training_sessions')
                    .select(`
                        *,
                        session_exercises (
                            *,
                            exercise:exercise_library (name, video_url, muscle_group),
                            training_sets (*)
                        )
                    `)
                    .eq('block_id', active.id)
                    .order('day_number', { ascending: true });

                if (error) throw error;

                // 3. Process Data
                const formatted: ExtendedSession[] = (sessData || []).map(s => ({
                    ...s,
                    exercises: (s.session_exercises || [])
                        .sort((a: any, b: any) => a.order_index - b.order_index)
                        .map((e: any) => ({
                            ...e,
                            sets: (e.training_sets || [])
                                .sort((a: TrainingSet, b: TrainingSet) => a.order_index - b.order_index)
                        }))
                }));

                // NEW: Calculate Current Week
                const startDate = new Date(active.start_date ?? new Date());
                const today = new Date();
                startDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);

                const diffTime = today.getTime() - startDate.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                // Calculate week number (1-based). If negative (before start), default to 1.
                let currentWeek = Math.floor(diffDays / 7) + 1;
                if (currentWeek < 1) currentWeek = 1;

                // NEW: Filter sessions for Current Week based on Absolute Day Number
                // Week 1 = Days 1-7, Week 2 = Days 8-14, etc.
                const currentWeekSessions = formatted.filter(s => Math.ceil(s.day_number / 7) === currentWeek);

                // If no sessions for this week (e.g. week 5 but plan only has 4 weeks), maybe show last week?
                // For now, let's strictly show current week. If empty, it will show "Descanso" or empty list.

                setSessions(currentWeekSessions);

                if (currentWeekSessions.length > 0) {
                    // 5. Try to find session for this specific date or day_number
                    const todayStr = today.toISOString().split('T')[0];

                    // day_number is usually absolute (1..30). logic checks if session matches today's absolute day index
                    // But now we operate on filtered list.

                    const sessionForToday = currentWeekSessions.find(s =>
                        (s as any).date === todayStr || s.day_number === (diffDays + 1)
                    );

                    if (sessionForToday) {
                        setActiveSessionId(sessionForToday.id);
                    } else {
                        // Default to first available in this week
                        setActiveSessionId(currentWeekSessions[0].id);
                    }
                } else {
                    // Fallback logic if week is empty? 
                    // Ideally we might want to warn or show "Week Completed" but for now let's just leave empty array
                    setActiveSessionId(null);
                }
            } catch (err) {
                console.error(err);
                toast.error("Error cargando entrenamiento");
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [athleteId]);

    if (loading) return <div className="h-screen flex items-center justify-center bg-black"><Loader className="animate-spin text-white" /></div>;

    if (!block) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-transparent text-gray-400 p-8 text-center space-y-6">
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-gray-700">
                    <AlertCircle size={64} />
                </div>
                <div className="max-w-xs">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Sin Plan Activo</h3>
                    <p className="text-sm leading-relaxed">
                        Tu entrenador aún no ha activado tu próximo mesociclo. Contacta con él para empezar a registrar tus marcas.
                    </p>
                </div>
                <div className="pt-4">
                    <div className="px-6 py-3 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-gray-500">
                        Esperando programación...
                    </div>
                </div>
            </div>
        );
    }

    const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

    // FIX: Handle case where activeSession is undefined (e.g. empty week)
    if (!activeSession && sessions.length === 0) {
        return (
            <div className="flex flex-col h-full bg-transparent text-white max-w-md mx-auto overflow-hidden relative">
                <div className="bg-[#1c1c1c] border-b border-white/5 pb-2">
                    <div className="p-4">
                        <h1 className="text-sm text-anvil-red font-bold tracking-wider uppercase mb-1">{block.name}</h1>
                        <h2 className="text-2xl font-black italic">Semana de Descarga</h2>
                    </div>
                </div>
                <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center space-y-6">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-gray-700">
                        <Check size={32} />
                    </div>
                    <div className="max-w-xs">
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Semana Completada</h3>
                        <p className="text-sm leading-relaxed">
                            No hay sesiones programadas para esta semana. Si crees que es un error, contacta a tu entrenador.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-transparent text-white max-w-md mx-auto overflow-hidden relative">

            {/* 1. Header & Navigation */}
            <div className="bg-[#1c1c1c] border-b border-white/5 pb-2">
                <div className="p-4">
                    <h1 className="text-sm text-anvil-red font-bold tracking-wider uppercase mb-1">{block.name}</h1>
                </div>

                {/* Day Tabs Scroll */}
                <div className="flex overflow-x-auto px-4 gap-3 py-2 scrollbar-hide">
                    {sessions.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setActiveSessionId(s.id)}
                            className={cn(
                                "flex flex-col items-center justify-center min-w-[4.5rem] py-3 rounded-xl transition-all border",
                                activeSessionId === s.id
                                    ? "bg-white text-black border-white shadow-lg scale-105 font-bold"
                                    : "bg-[#2a2a2a] text-gray-400 border-transparent hover:bg-[#333]"
                            )}
                        >
                            {s.name ? (
                                <span className="text-xs font-black uppercase tracking-wider">{s.name}</span>
                            ) : (
                                <>
                                    <span className="text-[10px] uppercase tracking-widest opacity-60">Día</span>
                                    <span className="text-xl font-bold leading-none">{s.day_number}</span>
                                </>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* 2. Content (Exercise List) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
                {activeSession?.exercises.map(ex => (
                    <LoggerExerciseCard
                        key={ex.id}
                        sessionExercise={ex}
                        onStartTimer={handleStartTimer}
                    />
                ))}

                {activeSession?.exercises.length === 0 && (
                    <div className="text-center text-gray-600 py-12 italic">
                        Día de descanso o sin ejercicios programados.
                    </div>
                )}
            </div>

            {/* Overlay Timer */}
            {timerEndTime && (
                <RestTimerOverlay
                    endTime={timerEndTime}
                    onClose={handleCloseTimer}
                    onAddSeconds={handleAddTimerSeconds}
                />
            )}
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: EXERCISE CARD
// ==========================================
function LoggerExerciseCard({ sessionExercise, onStartTimer }: { sessionExercise: ExtendedSessionExercise, onStartTimer: (s: number) => void }) {
    const [noteOpen, setNoteOpen] = useState(false);

    return (
        <div className="bg-[#1c1c1c] rounded-2xl overflow-hidden border border-white/5 shadow-sm">
            {/* Header */}
            <div className="p-4 bg-[#252525] flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-lg leading-tight text-gray-100">{sessionExercise.exercise.name}</h3>
                    {sessionExercise.notes && (
                        <button
                            onClick={() => setNoteOpen(!noteOpen)}
                            className="text-xs text-anvil-red mt-1 flex items-center gap-1 hover:underline"
                        >
                            Ver notas {noteOpen ? '▲' : '▼'}
                        </button>
                    )}
                </div>
            </div>

            {noteOpen && sessionExercise.notes && (
                <div className="px-4 py-2 bg-[#1a1a1a] text-sm text-gray-400 border-b border-white/5 animate-in slide-in-from-top-2">
                    {sessionExercise.notes}
                </div>
            )}

            {/* Sets Header */}
            <div className="grid grid-cols-[1.3fr_4rem_0.7fr] gap-3 px-4 py-2 bg-[#2a2a2a]/50 text-xs uppercase font-bold text-gray-500 text-center">
                <span className="text-left pl-2">Series</span>
                <span className="text-center">RPE</span>
                <span className="text-right pr-4">Check</span>
            </div>

            {/* Sets List */}
            <div className="divide-y divide-white/5">
                {sessionExercise.sets.map((set, idx) => (
                    <LoggerSetRow
                        key={set.id}
                        set={set}
                        index={idx}
                        onStartTimer={onStartTimer}
                        defaultRestSeconds={sessionExercise.rest_seconds}
                    />
                ))}
            </div>
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: SET ROW (The Core Logic)
// ==========================================
// ==========================================
// SUB-COMPONENT: SET ROW (The Core Logic)
// ==========================================
function LoggerSetRow({ set, index, onStartTimer, defaultRestSeconds }: { set: TrainingSet; index: number, onStartTimer: (s: number) => void, defaultRestSeconds?: number | null }) {
    // Local state for optimistic UI
    const [actualLoad, setActualLoad] = useState<string>(set.actual_load?.toString() ?? '');
    const [actualReps, setActualReps] = useState<string>(set.actual_reps?.toString() ?? '');
    const [actualRpe, setActualRpe] = useState<string>(set.actual_rpe?.toString() ?? '');
    const [isCompleted, setIsCompleted] = useState(!!(set.actual_reps && set.actual_load)); // Pseudo-logic for completion
    const [saving, setSaving] = useState(false);

    // Effective Rest Logic
    const effectiveRest = set.rest_seconds || defaultRestSeconds;

    // Debounce Ref
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Persist to DB
    const persistChange = useCallback(async (updates: Partial<TrainingSet>) => {
        setSaving(true);
        try {
            await trainingService.updateSetActuals(set.id, updates as any);
            // Verify completion locally for UI feedback
            const isDone = (updates.actual_reps || actualReps) && (updates.actual_load || actualLoad);
            if (isDone) setIsCompleted(true);
        } catch (err) {
            console.error(err);
            toast.error("Error guardando datos");
        } finally {
            setSaving(false);
        }
    }, [set.id, actualReps, actualLoad]);

    // Handle Input Change with Debounce
    const handleChange = (field: 'actual_load' | 'actual_reps' | 'actual_rpe', value: string) => {
        // Update local immediately
        if (field === 'actual_load') setActualLoad(value);
        if (field === 'actual_reps') setActualReps(value);
        if (field === 'actual_rpe') setActualRpe(value);

        // Reset Done status if clearing inputs? Optional.

        // Debounce Save
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            const numValue = value === '' ? null : Number(value);
            persistChange({ [field]: numValue });
        }, 1000); // 1 second debounce
    };

    const toggleComplete = () => {
        // Instant visual feedback wrapper
        const newState = !isCompleted;
        setIsCompleted(newState);

        if (newState) {
            toast.success("Serie completada");
            // Trigger Timer if enabled
            if (effectiveRest && effectiveRest > 0) {
                onStartTimer(effectiveRest);
            }
        }
    };

    return (
        <div className={cn(
            "grid grid-cols-[1.3fr_4rem_0.7fr] gap-3 px-4 py-3 items-center transition-colors",
            isCompleted ? "bg-green-500/10" : "hover:bg-white/5"
        )}>
            {/* Series Info (Merged Index + Target) - ALIGN LEFT */}
            <div className="flex items-center justify-start gap-4">
                <div className="text-center font-mono text-sm text-gray-500 font-bold w-6">{index + 1}</div>
                <div className="flex flex-col text-sm text-gray-400 space-y-0.5">
                    <div className="flex items-center gap-1">
                        <span className="font-bold text-gray-300">{set.target_load ? `${set.target_load}kg` : '-'}</span>
                        <span>x</span>
                        <span className="font-bold text-gray-300">{set.target_reps || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        {!!set.target_rpe && <span className="text-anvil-red">@{set.target_rpe}</span>}
                        {!!effectiveRest && <span>{effectiveRest}s rest</span>}
                    </div>
                </div>
            </div>

            {/* RPE Input (Mobile & Desktop Unified) */}
            <div className="flex justify-center">
                <input
                    type="number"
                    value={actualRpe}
                    onChange={(e) => handleChange('actual_rpe', e.target.value)}
                    placeholder="-"
                    className={cn(
                        "w-full bg-[#111] border rounded-lg px-0 py-2 text-center text-sm font-bold focus:border-anvil-red outline-none placeholder-gray-700",
                        actualRpe ? "text-anvil-red border-anvil-red/50" : "text-white border-white/10"
                    )}
                />
            </div>

            {/* Actions - ALIGN RIGHT */}
            <div className="flex flex-col gap-2 items-end pr-4">
                <button
                    onClick={toggleComplete}
                    className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-lg",
                        isCompleted
                            ? "bg-green-500 text-black hover:bg-green-400"
                            : "bg-[#333] text-gray-500 hover:bg-[#444] hover:text-white"
                    )}
                >
                    <Check size={16} strokeWidth={3} />
                </button>
            </div>
            {saving && <div className="absolute right-2 top-2"><div className="w-1.5 h-1.5 bg-anvil-red rounded-full animate-ping"></div></div>}
        </div>
    );
}
