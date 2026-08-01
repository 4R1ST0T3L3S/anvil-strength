import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock, TrainingSession, SessionExercise, TrainingSet, TARGET_METRICS, weekdayIndex, weekdayLabel, WEEKDAYS } from '../../../types/training';
import type { TargetMetric } from '../../../types/training';
import {
    getWeekNumber, getDateRangeFromWeek, formatDateRange,
    getDateForWeekday, startOfToday,
} from '../../../utils/dateUtils';
import { Loader, Check, AlertCircle, UploadCloud, FileCheck, PlayCircle, ChevronDown, CalendarDays, Printer } from 'lucide-react';
import { printWeek, sessionToPrintDay } from '../../../lib/export/weekPrint';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { RestTimerOverlay } from './RestTimerOverlay';

interface WorkoutLoggerProps {
    athleteId: string;
    /** Solo para la cabecera de la hoja exportada a PDF. */
    athleteName?: string | null;
}

// Helper for classes
import { Modal } from '../../../components/ui/Modal';
import { ExerciseVideoPanel } from './ExerciseVideoPanel';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

// ==========================================
// TYPES (Expanded)
// ==========================================
/**
 * `exercise` puede venir NULL aunque la fila de session_exercises exista: el
 * join a exercise_library lo filtra la RLS, y si el ejercicio no es visible
 * para el atleta PostgREST devuelve `exercise: null` sin ningún error.
 * Tiparlo como obligatorio era lo que reventaba la pantalla entera con
 * "Cannot read properties of null (reading 'name')".
 */
interface ExtendedSessionExercise extends Omit<SessionExercise, 'exercise'> {
    exercise: {
        name: string;
        video_url?: string | null;
        muscle_group?: string | null;
    } | null;
    sets: TrainingSet[];
}

interface ExtendedSession extends Omit<TrainingSession, 'exercises'> {
    exercises: ExtendedSessionExercise[];
}

/**
 * Ordena los días como los vive el atleta: primero los agendados a un día de
 * la semana, en orden de calendario; detrás los que no lo están, por número.
 */
function sortSessions<T extends { day_number: number; day_of_week?: string | null }>(sessions: T[]): T[] {
    return [...sessions].sort((a, b) => {
        const ia = weekdayIndex(a.day_of_week);
        const ib = weekdayIndex(b.day_of_week);
        if (ia != null && ib != null) return ia - ib;
        if (ia != null) return -1;
        if (ib != null) return 1;
        return a.day_number - b.day_number;
    });
}

/**
 * Qué día de la semana abrir al entrar.
 *
 * Se busca el de hoy por fecha exacta y, si no, por día de la semana
 * agendado. Cuando no hay ninguno —día de descanso, o una semana sin agendar—
 * se cae en el primero de la lista en vez de dejar la pantalla vacía.
 */
function pickSessionForToday<T extends { id: string; date?: string | null; day_of_week?: string | null; day_number: number }>(
    sessions: T[]
): string | null {
    const ordered = sortSessions(sessions);
    if (ordered.length === 0) return null;

    const today = startOfToday();
    // Fecha local en formato ISO. `toISOString()` convierte a UTC y en España
    // devuelve el día anterior durante las primeras horas de la mañana.
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayIndex = today.getDay() || 7; // lunes = 1 … domingo = 7

    return (
        ordered.find(s => s.date === todayStr)?.id
        ?? ordered.find(s => weekdayIndex(s.day_of_week) === todayIndex)?.id
        ?? ordered[0].id
    );
}

// ==========================================
// COMPONENT: WORKOUT LOGGER
// ==========================================
export function WorkoutLogger({ athleteId, athleteName }: WorkoutLoggerProps) {
    const [loading, setLoading] = useState(true);
    const [block, setBlock] = useState<TrainingBlock | null>(null);
    /**
     * TODAS las sesiones que el servidor deja ver, de todas las semanas.
     *
     * Filtrar aquí las semanas futuras sería redundante y engañoso: la RLS ya
     * no devuelve las que aún no se han publicado (ver `week_is_released()` en
     * database/week_visibility_and_scheduling.sql). Lo que llega es, por
     * definición, lo que el atleta tiene derecho a ver.
     */
    const [allSessions, setAllSessions] = useState<ExtendedSession[]>([]);
    const [weekNames, setWeekNames] = useState<Record<number, string>>({});
    const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
    const [weekPickerOpen, setWeekPickerOpen] = useState(false);
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
                        .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
                        .map((e: SessionExercise & { training_sets: TrainingSet[] }) => ({
                            ...e,
                            sets: (e.training_sets || []).sort((a: TrainingSet, b: TrainingSet) => a.order_index - b.order_index)
                        }))
                }));

                setAllSessions(formatted);

                // Nombres de las semanas. Son decorativos: si la tabla no está
                // migrada se sigue navegando por "Semana 31".
                setWeekNames(
                    Object.fromEntries(
                        Object.entries(await trainingService.getWeekMetaByBlock(active.id))
                            .map(([w, m]) => [Number(w), m.name ?? ''])
                    )
                );

                // 4. Semana por defecto: la de HOY si está publicada. Si no —el
                // atleta entra un domingo, o el bloque ya terminó— la última
                // que haya llegado a estar disponible, que es donde estaba
                // trabajando. Nunca la primera del bloque: obligaría a navegar
                // hacia delante cada vez que abre la app.
                const weeksAvailable = [...new Set(formatted.map(s => s.week_number))].sort((a, b) => a - b);
                if (weeksAvailable.length === 0) {
                    setSelectedWeek(null);
                    setActiveSessionId(null);
                    return;
                }

                const thisWeek = getWeekNumber();
                const week = weeksAvailable.includes(thisWeek)
                    ? thisWeek
                    : weeksAvailable.filter(w => w <= thisWeek).pop() ?? weeksAvailable[0];

                setSelectedWeek(week);
                setActiveSessionId(pickSessionForToday(formatted.filter(s => s.week_number === week)));
            } catch (err) {
                console.error(err);
                toast.error("Error cargando entrenamiento");
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [athleteId]);

    // Semanas que el atleta puede abrir, de menor a mayor.
    const availableWeeks = useMemo(
        () => [...new Set(allSessions.map(s => s.week_number))].sort((a, b) => a - b),
        [allSessions]
    );

    // Días de la semana elegida, en orden de calendario.
    const sessions = useMemo(
        () => sortSessions(allSessions.filter(s => s.week_number === selectedWeek)),
        [allSessions, selectedWeek]
    );

    const blockYear = block?.start_date
        ? new Date(block.start_date).getFullYear()
        : new Date().getFullYear();

    /** Saca la semana en PDF para llevarla al gimnasio en papel. */
    const handlePrintWeek = () => {
        if (!block || selectedWeek === null || sessions.length === 0) return;

        const range = getDateRangeFromWeek(selectedWeek, blockYear);
        const opened = printWeek({
            blockName: block.name,
            athleteName: athleteName ?? 'Mi entrenamiento',
            weekLabel: weekNames[selectedWeek] || `Semana ${availableWeeks.indexOf(selectedWeek) + 1}`,
            dateRange: formatDateRange(range.start, range.end),
            days: sessions.map(sessionToPrintDay),
        });

        if (!opened) {
            toast.error('El navegador bloqueó la ventana. Permite las ventanas emergentes para exportar.');
        }
    };

    const changeWeek = (week: number) => {
        setSelectedWeek(week);
        setWeekPickerOpen(false);
        // Al cambiar de semana se cae en el día de hoy si lo hay, y si no en el
        // primero: mantener el día anterior seleccionado dejaba la pantalla en
        // un "Día 3" que en la semana nueva podía no existir.
        setActiveSessionId(pickSessionForToday(allSessions.filter(s => s.week_number === week)));
    };

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
                        <h2 className="text-2xl font-black italic">Sin Sesiones</h2>
                    </div>
                </div>
                <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center space-y-6">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-gray-700">
                        <Check size={32} />
                    </div>
                    <div className="max-w-xs">
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">
                            {availableWeeks.length === 0 ? 'Aún no disponible' : 'Semana Completada'}
                        </h3>
                        <p className="text-sm leading-relaxed">
                            {availableWeeks.length === 0
                                ? 'Tu entrenador todavía no ha abierto ninguna semana de este bloque. Aparecerá aquí en cuanto la publique.'
                                : 'No hay sesiones programadas para esta semana. Si crees que es un error, contacta a tu entrenador.'}
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
                    {block.description && (
                        <details className="group mt-1">
                            <summary className="text-[10px] font-black uppercase tracking-widest text-gray-500 cursor-pointer list-none hover:text-white transition-colors select-none">
                                Objetivos del bloque <span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span>
                            </summary>
                            <p className="text-xs text-gray-400 leading-relaxed mt-2 whitespace-pre-wrap bg-white/[0.03] border border-white/5 rounded-xl p-3">
                                {block.description}
                            </p>
                        </details>
                    )}
                </div>

                {/* Selector de semana. El atleta entrena por semanas, así que
                    la semana es el contexto principal y va por encima de los
                    días, no escondida en un menú. */}
                {selectedWeek !== null && (
                    <div className="px-4 pb-1">
                      <div className="flex items-stretch gap-2">
                        <button
                            onClick={() => setWeekPickerOpen(v => !v)}
                            aria-expanded={weekPickerOpen}
                            disabled={availableWeeks.length <= 1}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-[#252525] px-3 py-2.5 text-left transition-colors hover:bg-[#2e2e2e] disabled:hover:bg-[#252525]"
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <CalendarDays size={15} className="shrink-0 text-anvil-red" aria-hidden="true" />
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-bold leading-tight">
                                        Semana {availableWeeks.indexOf(selectedWeek) + 1}
                                        {weekNames[selectedWeek] && (
                                            <span className="ml-1.5 font-normal text-gray-400">{weekNames[selectedWeek]}</span>
                                        )}
                                    </span>
                                    <span className="block text-[10px] uppercase tracking-widest text-gray-500">
                                        {formatDateRange(
                                            getDateRangeFromWeek(selectedWeek, blockYear).start,
                                            getDateRangeFromWeek(selectedWeek, blockYear).end
                                        )}
                                    </span>
                                </span>
                            </span>
                            {availableWeeks.length > 1 && (
                                <ChevronDown
                                    size={16}
                                    aria-hidden="true"
                                    className={cn('shrink-0 text-gray-500 transition-transform', weekPickerOpen && 'rotate-180')}
                                />
                            )}
                        </button>

                        {/* Llevarse la semana en papel al gimnasio. Va junto al
                            selector porque exporta LA SEMANA que se está
                            viendo, no el bloque entero. */}
                        <button
                            onClick={handlePrintWeek}
                            title="Exportar esta semana a PDF"
                            aria-label="Exportar esta semana a PDF"
                            className="flex shrink-0 items-center justify-center rounded-xl bg-[#252525] px-3.5 text-gray-400 transition-colors hover:bg-[#2e2e2e] hover:text-white"
                        >
                            <Printer size={17} />
                        </button>
                      </div>

                        {weekPickerOpen && (
                            <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-white/5 bg-[#202020] p-1.5">
                                {availableWeeks.map((w, i) => (
                                    <button
                                        key={w}
                                        onClick={() => changeWeek(w)}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors',
                                            w === selectedWeek ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                                        )}
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-bold">
                                                Semana {i + 1}
                                                {weekNames[w] && <span className="ml-1.5 font-normal opacity-70">{weekNames[w]}</span>}
                                            </span>
                                            <span className="block text-[10px] text-gray-500">
                                                {formatDateRange(
                                                    getDateRangeFromWeek(w, blockYear).start,
                                                    getDateRangeFromWeek(w, blockYear).end
                                                )}
                                            </span>
                                        </span>
                                        {w === getWeekNumber() && (
                                            <span className="ml-2 shrink-0 rounded-full bg-anvil-red/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-anvil-red">
                                                Ahora
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Day Tabs Scroll */}
                <div className="flex overflow-x-auto px-4 gap-3 py-2 scrollbar-hide">
                    {sessions.map(s => {
                        // El día agendado manda sobre el número: "Lun 4 ago" le
                        // dice al atleta si le toca hoy; "Día 2" no.
                        const label = weekdayLabel(s.day_of_week);
                        const index = weekdayIndex(s.day_of_week);
                        const date = index != null && selectedWeek != null
                            ? getDateForWeekday(selectedWeek, blockYear, index)
                            : null;
                        const isToday = date != null && date.getTime() === startOfToday().getTime();

                        return (
                            <button
                                key={s.id}
                                onClick={() => setActiveSessionId(s.id)}
                                className={cn(
                                    "relative flex flex-col items-center justify-center min-w-[4.5rem] px-2 py-3 rounded-xl transition-all border",
                                    activeSessionId === s.id
                                        ? "bg-white text-black border-white shadow-lg scale-105 font-bold"
                                        : "bg-[#2a2a2a] text-gray-400 border-transparent hover:bg-[#333]",
                                    isToday && activeSessionId !== s.id && "border-anvil-red/40"
                                )}
                            >
                                {label ? (
                                    <>
                                        <span className="text-[10px] uppercase tracking-widest opacity-60">
                                            {WEEKDAYS.find(d => d.key === s.day_of_week)?.short}
                                        </span>
                                        <span className="text-sm font-bold leading-tight">
                                            {date?.getDate()}
                                        </span>
                                        {s.name && (
                                            <span className="mt-0.5 max-w-[4.5rem] truncate text-[9px] uppercase tracking-wider opacity-70">
                                                {s.name}
                                            </span>
                                        )}
                                    </>
                                ) : s.name ? (
                                    <span className="text-xs font-black uppercase tracking-wider">{s.name}</span>
                                ) : (
                                    <>
                                        <span className="text-[10px] uppercase tracking-widest opacity-60">Día</span>
                                        <span className="text-xl font-bold leading-none">{s.day_number}</span>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2. Content (Exercise List) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
                {activeSession?.exercises.map(ex => (
                    <LoggerExerciseCard
                        key={ex.id}
                        sessionExercise={ex}
                        athleteId={athleteId}
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
function LoggerExerciseCard({ sessionExercise, athleteId, onStartTimer }: { sessionExercise: ExtendedSessionExercise, athleteId: string, onStartTimer: (s: number) => void }) {
    // Unidad en la que el coach pautó este ejercicio. Las series antiguas no
    // la traen: son kilos, que era lo único que había antes de la migración.
    const prescriptionMetric: TargetMetric =
        sessionExercise.sets?.[0]?.target_metric ?? 'kg';
    const prescriptionLabel =
        TARGET_METRICS.find(m => m.key === prescriptionMetric)?.label ?? 'Kg';

    // Si la biblioteca no devolvió el ejercicio (RLS), la sesión se sigue
    // pudiendo registrar: series, kilos y vídeos no dependen de él.
    const exerciseName = sessionExercise.exercise?.name ?? 'Ejercicio sin nombre';

    // Las notas del coach nacen ABIERTAS. Es el único sitio donde escribe
    // "hoy sin cinturón" o "para en el pecho": esconderlas detrás de un
    // "Ver notas" garantiza que la mitad de las sesiones se hagan sin leerlas.
    // Se pueden plegar, pero por defecto se ven.
    const [noteOpen, setNoteOpen] = useState(true);
    // Ficha del ejercicio: vídeo de técnica + músculos + cues. Se abre bajo
    // demanda para no montar un <video> por cada ejercicio de la sesión.
    const [detailOpen, setDetailOpen] = useState(false);
    
    // VBT Logic
    const [uploading, setUploading] = useState(false);
    const [vbtUrl, setVbtUrl] = useState<string | null>(sessionExercise.vbt_file_url || null);
    // Tras subir, permitir asociar el archivo a una serie concreta
    const [pendingSetTag, setPendingSetTag] = useState<string | null>(null); // url pendiente de etiquetar
    const [taggedSetId, setTaggedSetId] = useState<string | null>(
        sessionExercise.sets.find(s => s.vbt_file_url)?.id || null
    );
    const fileInputRef = useRef<HTMLInputElement>(null);

    const tagSetWithVbt = async (setId: string | null) => {
        const url = pendingSetTag;
        setPendingSetTag(null);
        if (!url || !setId) return; // "todo el ejercicio" → ya está guardado a nivel ejercicio
        try {
            await trainingService.updateSet(setId, { vbt_file_url: url });
            setTaggedSetId(setId);
            toast.success('VBT asociado a la serie');
        } catch (e) {
            console.error(e);
            toast.error('No se pudo asociar a la serie');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input immediately so same file can be selected again if it failed
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }

        const validExts = ['.vbt', '.csv', '.xlsx', '.txt'];
        const isValid = validExts.some(ext => file.name.toLowerCase().endsWith(ext));
        if (!isValid) {
            toast.error("Formato no válido. Usa .csv, .vbt, .xlsx o .txt");
            return;
        }

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${sessionExercise.id}_${Date.now()}.${fileExt}`;
            
            const { error: uploadError } = await supabase.storage
                .from('vbt_files')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('vbt_files').getPublicUrl(fileName);
            const publicUrl = data.publicUrl;

            await trainingService.updateSessionExercise(sessionExercise.id, { vbt_file_url: publicUrl });
            setVbtUrl(publicUrl);
            toast.success("Archivo VBT adjuntado");
            // Si hay más de una serie, preguntar a cuál corresponde
            if (sessionExercise.sets.length > 1) {
                setPendingSetTag(publicUrl);
            } else if (sessionExercise.sets.length === 1) {
                await trainingService.updateSet(sessionExercise.sets[0].id, { vbt_file_url: publicUrl });
                setTaggedSetId(sessionExercise.sets[0].id);
            }
        } catch (error) {
            console.error("Upload error full detail:", error);
            const errMsg = error instanceof Error ? error.message : "Error desconocido";
            toast.error(`Error al subir VBT: ${errMsg}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="bg-[#1c1c1c] rounded-2xl overflow-hidden border border-white/5 shadow-sm">
            <Modal
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
                title={exerciseName}
                size="xl"
            >
                <ExerciseVideoPanel
                    exerciseId={sessionExercise.exercise_id}
                    exerciseName={exerciseName}
                    athleteId={athleteId}
                    prescription={sessionExercise.sets.map(s => s.target_reps).filter(Boolean).join(' · ')}
                    coachNotes={sessionExercise.notes}
                />
            </Modal>

            {/* Header */}
            <div className="p-4 bg-[#252525] flex justify-between items-start">
                <div>
                    <button
                        onClick={() => setDetailOpen(true)}
                        className="group flex items-center gap-1.5 text-left"
                        title="Ver técnica y detalles"
                    >
                        <h3 className="font-bold text-lg leading-tight text-gray-100 group-hover:text-anvil-red transition-colors">{exerciseName}</h3>
                        <PlayCircle size={15} className="text-gray-600 group-hover:text-anvil-red transition-colors shrink-0" />
                    </button>
                    {sessionExercise.notes && (
                        <button
                            onClick={() => setNoteOpen(!noteOpen)}
                            className="text-xs text-anvil-red mt-1 flex items-center gap-1 hover:underline"
                        >
                            {noteOpen ? 'Ocultar notas' : 'Ver notas'} {noteOpen ? '▲' : '▼'}
                        </button>
                    )}
                </div>
                
                {/* VBT File Actions */}
                <div className="flex flex-col items-end">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        accept=".csv,.xlsx,.txt,.vbt"
                    />
                    {vbtUrl ? (
                         <div className="flex items-center gap-1 text-[10px] text-green-400 font-bold bg-green-400/10 px-2 py-1 rounded border border-green-400/20">
                            <FileCheck size={12} /> VBT SUBIDO
                            {taggedSetId && (
                                <span className="text-green-300/70 normal-case font-medium">
                                    · Serie {sessionExercise.sets.findIndex(s => s.id === taggedSetId) + 1}
                                </span>
                            )}
                         </div>
                    ) : (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white bg-black/40 hover:bg-black/60 px-2 py-1 rounded border border-white/10 transition-colors"
                        >
                            {uploading ? <Loader size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                            {uploading ? "SUBIENDO..." : "+ VBT"}
                        </button>
                    )}
                </div>
            </div>

            {/* Selector: ¿a qué serie corresponde el archivo VBT? */}
            {pendingSetTag && (
                <div className="px-4 py-3 bg-anvil-red/5 border-b border-anvil-red/20 animate-in slide-in-from-top-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-anvil-red mb-2">
                        ¿A qué serie corresponde el archivo?
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {sessionExercise.sets.map((s, i) => (
                            <button
                                key={s.id}
                                onClick={() => tagSetWithVbt(s.id)}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-anvil-red hover:text-white text-gray-300 text-xs font-black uppercase transition-colors border border-white/10"
                            >
                                Serie {i + 1}
                            </button>
                        ))}
                        <button
                            onClick={() => tagSetWithVbt(null)}
                            className="px-3 py-1.5 rounded-lg text-gray-500 hover:text-white text-xs font-bold uppercase transition-colors"
                        >
                            Todo el ejercicio
                        </button>
                    </div>
                </div>
            )}

            {noteOpen && sessionExercise.notes && (
                <div className="whitespace-pre-wrap border-b border-subtle bg-surface-sunken px-4 py-3 text-t-sm leading-relaxed text-ink-muted">
                    {sessionExercise.notes}
                </div>
            )}

            {/* Prescription Summary Bar: vel_avg, rpe, rest */}
            {(sessionExercise.velocity_avg || sessionExercise.rpe || sessionExercise.rest_seconds) && (
                <div className="flex items-center gap-4 px-4 py-2 bg-black/30 border-b border-white/5 text-[11px] text-gray-500">
                    {sessionExercise.velocity_avg && (
                        <span>
                            <span className="font-bold text-gray-300">{sessionExercise.velocity_avg}</span>
                            <span className="ml-1">m/s</span>
                        </span>
                    )}
                    {sessionExercise.rpe && (
                        <span>
                            <span className="text-gray-600">RPE </span>
                            <span className="font-bold text-gray-300">{sessionExercise.rpe}</span>
                        </span>
                    )}
                    {sessionExercise.rest_seconds && (
                        <span>
                            <span className="text-gray-600">Descanso </span>
                            <span className="font-bold text-gray-300">{Math.floor(sessionExercise.rest_seconds / 60)}′{(sessionExercise.rest_seconds % 60).toString().padStart(2, '0')}″</span>
                        </span>
                    )}
                </div>
            )}

            {/* Sets Header */}
            <div className="grid grid-cols-[2.5rem_1fr_1fr_3.5rem_2.5rem] gap-2 px-4 py-2 bg-[#2a2a2a]/50 text-[10px] uppercase font-bold text-gray-500 text-center">
                <span className="text-left">Serie</span>
                <span>Reps</span>
                {/* Esta columna son SIEMPRE kilos movidos, porque la escribe el
                    atleta. Cuando el coach pautó en otra unidad —RPE, RIR,
                    velocidad— su objetivo aparece encima de cada casilla, que
                    es donde no se confunde con lo que se ha levantado. */}
                <span>Kg{prescriptionMetric !== 'kg' ? ` · ${prescriptionLabel}` : ''}</span>
                <span>RPE</span>
                <span className="text-right">OK</span>
            </div>

            {/* Sets List — expand grouped "NxM" into N individual rows */}
            <div className="divide-y divide-white/5">
                {sessionExercise.sets.flatMap((set) => {
                    const { series, reps } = parseTargetReps(set.target_reps);
                    const count = series && series > 1 ? series : 1;
                    return Array.from({ length: count }, (_, i) => (
                        <LoggerSetRow
                            key={`${set.id}_${i}`}
                            set={set}
                            serieIndex={i}
                            parsedReps={reps}
                            onStartTimer={onStartTimer}
                            defaultRestSeconds={sessionExercise.rest_seconds}
                        />
                    ));
                })}
            </div>
        </div>
    );
}


// ==========================================
// HELPERS: Parse target_reps format (e.g. "10x1" -> series=10, reps=1)
// ==========================================
const parseTargetReps = (target_reps: string | null | undefined) => {
    if (!target_reps) return { series: null, reps: null };
    const parts = target_reps.toLowerCase().split('x');
    if (parts.length >= 2) {
        const series = parseInt(parts[0].trim()) || null;
        const reps = parts.slice(1).join('x').trim() || null;
        return { series, reps };
    }
    // No 'x' found -> it's just reps
    return { series: null, reps: target_reps.trim() };
};

// ==========================================
// SUB-COMPONENT: SET ROW (The Core Logic)
// ==========================================
function LoggerSetRow({ set, serieIndex, parsedReps, onStartTimer, defaultRestSeconds }: { 
    set: TrainingSet; 
    serieIndex: number;
    parsedReps: string | null;
    onStartTimer: (s: number) => void; 
    defaultRestSeconds?: number | null; 
}) {
    // Local state for optimistic UI
    //
    // El peso lo escribe el ATLETA. Antes esta columna era de solo lectura y
    // enseñaba la prescripción del coach, así que en los ejercicios que no se
    // pautan en kilos —accesorios, trabajo por RPE o por RIR— no había forma
    // de anotar lo que se había movido de verdad: el dato no existía, y el
    // coach no podía verlo ni entraba en las estadísticas.
    const [actualLoad, setActualLoad] = useState<string>(set.actual_load?.toString() ?? '');
    const actualReps = set.actual_reps?.toString() ?? '';
    const [actualRpe, setActualRpe] = useState<string>(set.actual_rpe?.toString() ?? '');
    const [isCompleted, setIsCompleted] = useState(!!(set.actual_reps && set.actual_load)); // Pseudo-logic for completion
    const [saving, setSaving] = useState(false);

    // Effective Rest Logic
    const effectiveRest = set.rest_seconds || defaultRestSeconds;

    // Un temporizador POR CASILLA. Con uno compartido, escribir el RPE
    // cancelaba el guardado pendiente del peso y ese kilaje se perdía.
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const loadTimer = useRef<NodeJS.Timeout | null>(null);

    // Qué pautó el coach, para enseñarlo sin pisar la casilla del atleta.
    const prescribedMetric = set.target_metric ?? 'kg';
    const prescribedTarget = prescribedMetric === 'rpe'
        ? set.target_rpe
        : set.target_load !== null && set.target_load !== undefined
            ? String(set.target_load)
            : null;

    // Persist to DB
    const persistChange = useCallback(async (updates: Partial<TrainingSet>) => {
        setSaving(true);
        try {
            await trainingService.updateSetActuals(set.id, updates);
            // Verify completion locally for UI feedback
            // We use the NEW values if present in updates, else falling back to state
            const newReps = updates.actual_reps !== undefined ? updates.actual_reps : (actualReps ? Number(actualReps) : null);
            const newLoad = updates.actual_load !== undefined ? updates.actual_load : (actualLoad ? Number(actualLoad) : null);

            if (newReps && newLoad) setIsCompleted(true);
        } catch (err) {
            console.error(err);
            toast.error("Error guardando datos");
        } finally {
            setSaving(false);
        }
    }, [set.id, actualReps, actualLoad]);


    const toggleComplete = () => {
        const newState = !isCompleted;
        setIsCompleted(newState);

        if (newState) {
            // Auto-save the prescribed values as actuals when marking done.
            //
            // `actual_load` son SIEMPRE kilos movidos. Copiar aquí el objetivo
            // sin mirar la unidad grababa 0,45 kg en una serie pautada a
            // 0,45 m/s, o 20 kg en una pautada al 20% de pérdida — y esa cifra
            // falsa entraba luego en el tonelaje, en el histórico de cargas y
            // en las estimaciones de 1RM del atleta. Si no se pautó en kilos,
            // el peso lo pone el atleta, no lo inventa la app.
            // Si el atleta ya escribió el peso, manda el suyo.
            const typed = actualLoad ? Number(actualLoad) : null;
            const prescribedInKg = prescribedMetric === 'kg';
            const targetLoad = typed ?? (prescribedInKg && set.target_load ? Number(set.target_load) : null);
            if (targetLoad !== null && !actualLoad) setActualLoad(String(targetLoad));
            const targetReps = parsedReps ? Number(parsedReps) : null;
            const rpeValue = actualRpe ? Number(actualRpe) : null;
            persistChange({
                actual_load: targetLoad,
                actual_reps: targetReps,
                actual_rpe: rpeValue,
            });
            toast.success("Serie completada ✓");
            if (effectiveRest && effectiveRest > 0) {
                onStartTimer(effectiveRest);
            }
        } else {
            // Un-complete: clear actuals
            setActualLoad('');
            persistChange({ actual_load: null, actual_reps: null, actual_rpe: null });
        }
    };

    return (
        <div className={cn(
            "grid grid-cols-[2.5rem_1fr_1fr_3.5rem_2.5rem] gap-2 px-4 py-3 items-center transition-all relative",
            isCompleted ? "bg-green-500/10" : "hover:bg-white/5"
        )}>
            {/* Serie number */}
            <div 
                className="text-left font-mono text-sm font-black tabular-nums"
                style={{ color: isCompleted ? '#22c55e' : '#6b7280' }}
            >
                {serieIndex + 1}
            </div>

            {/* Reps (prescribed, locked) */}
            <div className="text-center">
                <span className={cn("font-black text-sm tabular-nums", isCompleted ? "text-green-400" : "text-white")}>
                    {parsedReps ?? '-'}
                </span>
            </div>

            {/* Peso movido, EDITABLE.
                El marcador de posición es lo que pautó el coach, así que la
                casilla vacía ya dice el objetivo; en cuanto el atleta escribe,
                lo que se ve es lo que ha hecho. Cuando la prescripción no va en
                kilos (RPE, RIR, velocidad) el objetivo se enseña encima en
                pequeño y la casilla queda libre para los kilos reales. */}
            <div className="text-center">
                {prescribedMetric !== 'kg' && (
                    <span className="block text-[9px] font-bold uppercase leading-none text-ink-subtle">
                        {prescribedTarget ?? '-'}
                    </span>
                )}
                <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={actualLoad}
                    onChange={(e) => {
                        setActualLoad(e.target.value);
                        if (loadTimer.current) clearTimeout(loadTimer.current);
                        loadTimer.current = setTimeout(() => {
                            persistChange({ actual_load: e.target.value ? Number(e.target.value) : null });
                        }, 800);
                    }}
                    placeholder={prescribedMetric === 'kg' && set.target_load !== null && set.target_load !== undefined
                        ? String(set.target_load)
                        : 'kg'}
                    aria-label="Peso movido en kilos"
                    className={cn(
                        'w-full rounded-field border bg-surface-sunken px-0 py-1.5 text-center text-t-sm font-black tabular-nums outline-none transition-colors duration-fast focus:border-brand',
                        actualLoad
                            ? 'border-[var(--brand-line)] text-ink'
                            : 'border-subtle text-ink-muted placeholder:font-normal placeholder:text-ink-subtle'
                    )}
                />
            </div>

            {/* RPE real (editable) */}
            <input
                type="number"
                value={actualRpe}
                onChange={(e) => {
                    setActualRpe(e.target.value);
                    if (debounceTimer.current) clearTimeout(debounceTimer.current);
                    debounceTimer.current = setTimeout(() => {
                        persistChange({ actual_rpe: e.target.value ? Number(e.target.value) : null });
                    }, 800);
                }}
                placeholder="-"
                className={cn(
                    "w-full bg-[#111] border rounded-lg px-0 py-1.5 text-center text-xs font-bold focus:border-anvil-red outline-none transition-colors",
                    actualRpe ? "text-anvil-red border-anvil-red/40" : "text-gray-600 border-white/5 placeholder-gray-700"
                )}
            />

            {/* Done button */}
            <div className="flex justify-end">
                <button
                    onClick={toggleComplete}
                    className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm",
                        isCompleted
                            ? "bg-green-500 text-black hover:bg-green-400"
                            : "bg-[#2a2a2a] border border-white/10 text-gray-600 hover:bg-[#333] hover:text-white"
                    )}
                >
                    <Check size={14} strokeWidth={3} />
                </button>
            </div>

            {saving && <div className="absolute right-1 top-1"><div className="w-1.5 h-1.5 bg-anvil-red rounded-full animate-ping"></div></div>}
        </div>
    );
}

