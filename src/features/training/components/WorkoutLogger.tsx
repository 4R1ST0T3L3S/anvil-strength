import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../../lib/supabase';
import { trainingService, parseGroupedReps } from '../../../services/trainingService';
import { LoggerSetRow } from './LoggerSetRow';
import { SaveIndicator } from '../../../components/ui/SaveIndicator';
import { DURATION, EASE_OUT, prefersReducedMotion } from '../../../lib/motion';
import { TrainingBlock, TrainingSession, SessionExercise, TrainingSet, TARGET_METRICS, weekdayIndex, weekdayLabel, WEEKDAYS, groupLabel } from '../../../types/training';
import type { TargetMetric } from '../../../types/training';
import { RichText } from '../../../components/ui/RichText';
import { VideoModal } from '../../../components/ui/VideoModal';
import {
    getWeekNumber, getDateRangeFromWeek, formatDateRange,
    getDateForWeekday, startOfToday,
} from '../../../utils/dateUtils';
import { Loader, Check, AlertCircle, UploadCloud, FileCheck, PlayCircle, ChevronDown, CalendarDays, Download, Info } from 'lucide-react';
import { downloadWeekPdf, sessionToPrintDay } from '../../../lib/export/weekPdf';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { RestTimerOverlay } from './RestTimerOverlay';
import { vbtService } from '../../../services/vbtService';
import { parseVbtFile, type ParsedVbtFile } from '../../../lib/vbt/csv';
import { SetVbtModal } from '../../vbt/components/SetVbtModal';

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
    // Los objetivos del bloque se leen el primer día del mesociclo y no
    // vuelven a mirarse: van plegados y no ocupan alto de cabecera.
    const [objectivesOpen, setObjectivesOpen] = useState(false);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // Vídeo enlazado desde el calentamiento o los extras. Se reproduce dentro
    // de la app para no sacar al atleta de la sesión a medio registrar.
    const [video, setVideo] = useState<{ url: string; label: string } | null>(null);
    const playVideo = useCallback((url: string, label: string) => setVideo({ url, label }), []);

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

    // Lazy load: cuando el usuario cambia a una semana aún no cargada, traerla.
    const loadingWeeks = useRef(new Set<number>());

    useEffect(() => {
        if (!block || selectedWeek === null) return;

        // ¿Ya está esta semana cargada?
        const hasWeek = allSessions.some(s => s.week_number === selectedWeek);
        if (hasWeek || loadingWeeks.current.has(selectedWeek)) return;

        loadingWeeks.current.add(selectedWeek);
        supabase
            .from('training_sessions')
            .select(`
                *,
                session_exercises (
                    *,
                    exercise:exercise_library (name, video_url, muscle_group),
                    training_sets (*)
                )
            `)
            .eq('block_id', block.id)
            .eq('week_number', selectedWeek)
            .order('day_number', { ascending: true })
            .then(({ data: sessData, error }) => {
                if (error) {
                    console.error(`Error cargando semana ${selectedWeek}:`, error);
                    return;
                }
                const formatted: ExtendedSession[] = (sessData || []).map(s => ({
                    ...s,
                    exercises: (s.session_exercises || [])
                        .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
                        .map((e: SessionExercise & { training_sets: TrainingSet[] }) => ({
                            ...e,
                            sets: (e.training_sets || []).sort((a: TrainingSet, b: TrainingSet) => a.order_index - b.order_index)
                        }))
                }));
                setAllSessions(prev => [...prev, ...formatted]);
            });
    }, [block, selectedWeek, allSessions]);

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

                // 2. Get Sessions — solo la semana actual, no el bloque entero.
                // Las otras semanas se cargan bajo demanda al navegar (lazy loading).
                const currentWeek = getWeekNumber();
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
                    .eq('week_number', currentWeek)
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
    // Se calcula del bloque (start_week .. end_week) en lugar de allSessions,
    // así están todas disponibles en el selector aunque aún no se hayan cargado.
    // Cambiar a una semana que aún no está cargada dispara lazy loading.
    const availableWeeks = useMemo(() => {
        if (!block?.start_week || !block?.end_week) return [];
        return Array.from(
            { length: block.end_week - block.start_week + 1 },
            (_, i) => block.start_week! + i
        );
    }, [block?.start_week, block?.end_week]);

    // Días de la semana elegida, en orden de calendario.
    const sessions = useMemo(
        () => sortSessions(allSessions.filter(s => s.week_number === selectedWeek)),
        [allSessions, selectedWeek]
    );

    const blockYear = block?.start_date
        ? new Date(block.start_date).getFullYear()
        : new Date().getFullYear();

    /** Descarga la semana en PDF para llevarla al gimnasio en papel. */
    const handlePrintWeek = () => {
        if (!block || selectedWeek === null || sessions.length === 0) return;

        const range = getDateRangeFromWeek(selectedWeek, blockYear);

        try {
            const filename = downloadWeekPdf({
                blockName: block.name,
                athleteName: athleteName ?? 'Mi entrenamiento',
                weekLabel: weekNames[selectedWeek] || `Semana ${availableWeeks.indexOf(selectedWeek) + 1}`,
                dateRange: formatDateRange(range.start, range.end),
                days: sessions.map(sessionToPrintDay),
            });
            toast.success(`PDF descargado: ${filename}`);
        } catch (err) {
            console.error('Error generando el PDF:', err);
            toast.error('No se pudo generar el PDF de la semana');
        }
    };

    /**
     * Separa una serie agrupada en filas reales y refresca la sesión.
     *
     * Se llama en la PRIMERA escritura sobre un "4x8", no al cargar: un
     * bloque programado y todavía sin empezar no genera ninguna escritura.
     * `expandGroupedSet` devuelve null cuando no había nada que separar, que
     * es lo que ocurre en la mayoría de llamadas.
     */
    const expansions = useRef(new Map<string, Promise<TrainingSet[] | null>>());

    const handleExpandSet = useCallback(async (
        setId: string,
        baseOrderIndex: number,
        groupIndex: number
    ): Promise<string | null> => {
        try {
            // Los cuatro renglones de un "4x8" pueden pedir la separación a la
            // vez —basta con tocar el peso y el RPE seguidos—. Compartiendo la
            // MISMA promesa se separa una sola vez; sin esto el ejercicio
            // acabaría con ocho o doce series en lugar de cuatro.
            let pending = expansions.current.get(setId);
            if (!pending) {
                pending = trainingService.expandGroupedSet(setId);
                expansions.current.set(setId, pending);
            }

            const refreshed = await pending;
            if (!refreshed) return null;

            setAllSessions(prev => prev.map(session => ({
                ...session,
                exercises: session.exercises.map(exercise =>
                    exercise.sets.some(s => s.id === setId)
                        ? { ...exercise, sets: refreshed }
                        : exercise
                ),
            })));

            // La fila que le toca a este renglón. Al separar, el grupo que
            // ocupaba la posición O pasa a ocupar O, O+1, O+2… así que el
            // renglón `groupIndex` es el de `order_index === O + groupIndex`.
            return refreshed.find(s => s.order_index === baseOrderIndex + groupIndex)?.id ?? null;
        } catch (err) {
            console.error(err);
            expansions.current.delete(setId); // Que se pueda reintentar.
            toast.error('No se pudo separar la serie. Inténtalo otra vez.');
            return null;
        }
    }, []);

    /** Refleja al instante en el contador del pie lo que se marca arriba. */
    const handleSetChange = useCallback((setId: string, completed: boolean) => {
        setAllSessions(prev => prev.map(session => ({
            ...session,
            exercises: session.exercises.map(exercise => ({
                ...exercise,
                sets: exercise.sets.map(s => (s.id === setId ? { ...s, is_completed: completed } : s)),
            })),
        })));
    }, []);

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
            <div className="h-full flex flex-col items-center justify-center bg-transparent text-ink-muted p-8 text-center space-y-6">
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-ink-faint">
                    <AlertCircle size={64} />
                </div>
                <div className="max-w-xs">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Sin Plan Activo</h3>
                    <p className="text-sm leading-relaxed">
                        Tu entrenador aún no ha activado tu próximo mesociclo. Contacta con él para empezar a registrar tus marcas.
                    </p>
                </div>
                <div className="pt-4">
                    <div className="px-6 py-3 border border-[var(--border-default)] rounded-xl text-xs font-black uppercase tracking-widest text-ink-subtle">
                        Esperando programación...
                    </div>
                </div>
            </div>
        );
    }

    const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

    const chains = computeChains(activeSession?.exercises ?? []);

    // Progreso del día. Una serie agrupada ("4x8") cuenta como cuatro: es lo
    // que el atleta ve en pantalla, y contar uno haría que la barra saltara
    // del 20 al 100% de golpe.
    const { completedSets, totalSets } = (activeSession?.exercises ?? []).reduce(
        (acc, exercise) => {
            exercise.sets.forEach(set => {
                const count = parseGroupedReps(set.target_reps)?.count ?? 1;
                acc.totalSets += count;
                if (set.is_completed) acc.completedSets += count;
            });
            return acc;
        },
        { completedSets: 0, totalSets: 0 }
    );

    // FIX: Handle case where activeSession is undefined (e.g. empty week)
    if (!activeSession && sessions.length === 0) {
        return (
            <div className="flex flex-col h-full bg-transparent text-white max-w-md mx-auto overflow-hidden relative">
                <div className="bg-surface-canvas border-b border-subtle pb-2">
                    <div className="p-4">
                        <h1 className="text-sm text-anvil-red font-bold tracking-wider uppercase mb-1">{block.name}</h1>
                        <h2 className="text-2xl font-black italic">Sin Sesiones</h2>
                    </div>
                </div>
                <div className="h-full flex flex-col items-center justify-center text-ink-muted p-8 text-center space-y-6">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-ink-faint">
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
        /**
         * ESTRUCTURA DE SCROLL
         *
         * Antes esto era `h-full overflow-hidden` con su propia zona
         * desplazable dentro. Como `main` del panel YA es un contenedor con
         * scroll, había dos scrolls anidados: en el móvil el dedo movía uno o
         * el otro según dónde cayera, la barra de arriba no se quedaba fija
         * al subir, y el pie —posicionado contra el alto de este div, no
         * contra la pantalla— acababa flotando en mitad del contenido.
         *
         * Ahora hay UN solo scroll, el de `main`, y la cabecera se pega
         * arriba con `sticky`. Es lo que hace que el gesto de deslizar se
         * comporte igual en toda la pantalla.
         */
        <div className="mx-auto w-full max-w-md text-white">

            {/* 1. CABECERA Y NAVEGACIÓN.
                =========================================================
                ALTURA, que es lo que se estaba yendo de las manos.

                Esto ocupaba unos 210px en un móvil de 812: sumados a los 56
                de la barra de la aplicación, un tercio de la pantalla estaba
                dedicado a decir en qué semana estamos. El atleta abre esto
                DE PIE, entre series, para leer una fila de números que
                quedaba a media pantalla de distancia.

                Ahora son ~118px (14%): nombre del bloque y semana comparten
                renglón, los días son fichas de 44px —el mínimo para un
                pulgar, ni uno más— y la barra de progreso se funde con el
                borde inferior en vez de tener su propia franja.

                En escritorio se recupera el aire (`md:`): allí el alto no es
                un recurso escaso y la jerarquía se lee mejor separada.

                `sticky`: el selector de semana y los días siguen accesibles
                al bajar por la lista de ejercicios. Un día tiene seis u ocho
                ejercicios y volver arriba para cambiar de día era un viaje
                de pantalla y media. */}
            <div className="sticky top-0 z-sticky border-b border-subtle bg-surface-canvas/95 backdrop-blur">

                {/* Renglón 1: bloque + semana + acciones.
                    El nombre del bloque era un titular propio de 40px de
                    alto. Es contexto, no navegación: cabe como sobretítulo
                    del selector de semana, que es lo que de verdad se pulsa. */}
                {selectedWeek !== null ? (
                    <div className="px-3 pt-2 md:px-4 md:pt-3">
                        <div className="flex items-stretch gap-1.5">
                            <button
                                onClick={() => setWeekPickerOpen(v => !v)}
                                aria-expanded={weekPickerOpen}
                                disabled={availableWeeks.length <= 1}
                                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-surface-raised px-2.5 py-1.5 text-left transition-colors hover:bg-surface-overlay disabled:hover:bg-surface-raised md:px-3 md:py-2.5"
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <CalendarDays size={14} className="shrink-0 text-anvil-red" aria-hidden="true" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[9px] font-bold uppercase leading-tight tracking-widest text-anvil-red">
                                            {block.name}
                                        </span>
                                        <span className="block truncate text-t-sm font-bold leading-tight">
                                            Semana {availableWeeks.indexOf(selectedWeek) + 1}
                                            {weekNames[selectedWeek] && (
                                                <span className="ml-1.5 font-normal text-ink-muted">{weekNames[selectedWeek]}</span>
                                            )}
                                            {/* El rango de fechas pasa a la MISMA línea en
                                                gris: era un segundo renglón de 14px para un
                                                dato que se consulta una vez al entrar. */}
                                            <span className="ml-1.5 hidden font-normal text-ink-subtle sm:inline">
                                                {formatDateRange(
                                                    getDateRangeFromWeek(selectedWeek, blockYear).start,
                                                    getDateRangeFromWeek(selectedWeek, blockYear).end
                                                )}
                                            </span>
                                        </span>
                                    </span>
                                </span>
                                {availableWeeks.length > 1 && (
                                    <ChevronDown
                                        size={15}
                                        aria-hidden="true"
                                        className={cn('shrink-0 text-ink-subtle transition-transform', weekPickerOpen && 'rotate-180')}
                                    />
                                )}
                            </button>

                            {/* Objetivos del bloque: de `details` siempre
                                presente a un botón que solo aparece si hay algo
                                que leer. Ocupaba una franja fija para un texto
                                que se lee el primer día del mesociclo. */}
                            {block.description && (
                                <button
                                    onClick={() => setObjectivesOpen(v => !v)}
                                    aria-expanded={objectivesOpen}
                                    title="Objetivos del bloque"
                                    aria-label="Objetivos del bloque"
                                    className={cn(
                                        'flex shrink-0 items-center justify-center rounded-xl px-2.5 transition-colors',
                                        objectivesOpen
                                            ? 'bg-anvil-red/15 text-anvil-red'
                                            : 'bg-surface-raised text-ink-muted hover:bg-surface-overlay hover:text-white'
                                    )}
                                >
                                    <Info size={16} />
                                </button>
                            )}

                            {/* Descargar la semana para llevarla al gimnasio. Va
                                junto al selector porque exporta LA SEMANA que se
                                está viendo, no el bloque entero. */}
                            <button
                                onClick={handlePrintWeek}
                                title="Descargar esta semana en PDF"
                                aria-label="Descargar esta semana en PDF"
                                className="flex shrink-0 items-center justify-center rounded-xl bg-surface-raised px-2.5 text-ink-muted transition-colors hover:bg-surface-overlay hover:text-white"
                            >
                                <Download size={16} />
                            </button>
                        </div>

                        {objectivesOpen && block.description && (
                            <p className="mt-1.5 whitespace-pre-wrap rounded-xl border border-subtle bg-white/[0.03] p-3 text-t-xs leading-relaxed text-ink-muted">
                                {block.description}
                            </p>
                        )}

                        {weekPickerOpen && (
                            <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-subtle bg-surface-raised p-1.5">
                                {availableWeeks.map((w, i) => (
                                    <button
                                        key={w}
                                        onClick={() => changeWeek(w)}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors',
                                            w === selectedWeek ? 'bg-white/10 text-white' : 'text-ink-muted hover:bg-white/5'
                                        )}
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-bold">
                                                Semana {i + 1}
                                                {weekNames[w] && <span className="ml-1.5 font-normal opacity-70">{weekNames[w]}</span>}
                                            </span>
                                            <span className="block text-[10px] text-ink-subtle">
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
                ) : (
                    <h1 className="px-3 pt-2 text-t-xs font-bold uppercase tracking-widest text-anvil-red md:px-4 md:pt-3">
                        {block.name}
                    </h1>
                )}

                {/* Renglón 2: los días.
                    Fichas de 44px de alto —el mínimo real para un pulgar— en
                    lugar de las de 62 que había. El nombre del día se queda
                    en una sola línea junto al número: apilarlo obligaba a que
                    la ficha midiera el triple para un texto que casi nunca
                    existe. */}
                <div className="flex gap-1.5 overflow-x-auto px-3 py-2 scrollbar-hide md:gap-2.5 md:px-4">
                    {sessions.map(s => {
                        // El día agendado manda sobre el número: "Lun 4" le
                        // dice al atleta si le toca hoy; "Día 2" no.
                        const label = weekdayLabel(s.day_of_week);
                        const index = weekdayIndex(s.day_of_week);
                        const date = index != null && selectedWeek != null
                            ? getDateForWeekday(selectedWeek, blockYear, index)
                            : null;
                        const isToday = date != null && date.getTime() === startOfToday().getTime();
                        const active = activeSessionId === s.id;

                        // Cuántas series lleva hechas de ese día. Un punto en
                        // la ficha responde a "¿me quedó algo del lunes?" sin
                        // tener que entrar a mirar.
                        const daySets = s.exercises.flatMap(e => e.sets);
                        const dayDone = daySets.length > 0 && daySets.every(x => x.is_completed);

                        return (
                            <button
                                key={s.id}
                                onClick={() => setActiveSessionId(s.id)}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'relative flex h-11 min-w-[3.75rem] shrink-0 flex-col items-center justify-center rounded-xl border px-2.5 leading-none transition-colors duration-fast',
                                    active
                                        ? 'border-white bg-white font-bold text-black'
                                        : 'border-transparent bg-surface-overlay text-ink-muted hover:text-white',
                                    !active && isToday && 'border-anvil-red/50'
                                )}
                            >
                                {label ? (
                                    <>
                                        <span className="text-[9px] uppercase tracking-widest opacity-60">
                                            {WEEKDAYS.find(d => d.key === s.day_of_week)?.short}
                                        </span>
                                        <span className="mt-0.5 text-t-sm font-bold">{date?.getDate()}</span>
                                    </>
                                ) : s.name ? (
                                    <span className="max-w-[6rem] truncate text-t-2xs font-black uppercase tracking-wider">
                                        {s.name}
                                    </span>
                                ) : (
                                    <>
                                        <span className="text-[9px] uppercase tracking-widest opacity-60">Día</span>
                                        <span className="mt-0.5 text-t-sm font-bold">{s.day_number}</span>
                                    </>
                                )}

                                {dayDone && !active && (
                                    <span
                                        className="absolute right-1 top-1 h-1.5 w-1.5 rounded-pill bg-success"
                                        aria-label="Día completado"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Progreso del día, PEGADO AL BORDE.
                    Tenía su propia franja con relleno arriba y abajo: 20px de
                    alto para una barra de 4. Ahora es el propio borde inferior
                    de la cabecera y el contador vive flotando sobre él, así
                    que informa igual sin ocupar nada.

                    Sustituye al pie con el botón "Terminar el día", que pedía
                    un gesto que no aportaba nada —las series ya estaban
                    marcadas una a una— y encima se posicionaba contra el alto
                    del contenedor, así que en el móvil aparecía flotando en
                    mitad de la pantalla. */}
                {totalSets > 0 && (
                    <div className="flex items-center gap-2 px-3 pb-1.5 md:px-4 md:pb-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                            {/* Se anima el ancho y no un `transform`: una barra
                                escalada deforma sus propios bordes redondeados,
                                y a 4px de alto el coste de layout es nulo. */}
                            <motion.div
                                className={completedSets >= totalSets ? 'h-full bg-success' : 'h-full bg-brand'}
                                initial={false}
                                animate={{ width: `${Math.round((completedSets / totalSets) * 100)}%` }}
                                transition={{ duration: prefersReducedMotion() ? 0 : DURATION.base, ease: EASE_OUT }}
                            />
                        </div>
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest tabular-nums text-ink-subtle">
                            {completedSets}/{totalSets}
                        </span>
                        <SaveIndicator />
                    </div>
                )}
            </div>

            {/* 2. Content (Exercise List).
                El relleno inferior deja libre la barra de pestañas del móvil,
                que es fija y vive por encima del borde de la pantalla, más el
                hueco de gestos del iPhone. En escritorio esa barra no existe
                y basta con un margen normal. */}
            <div className="space-y-5 p-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] md:pb-8">
                {/* Calentamiento ANTES de la primera serie: si va al final o
                    escondido en un desplegable, nadie lo lee y el coach lo
                    escribe para nada. */}
                <AppendixBlock
                    label="Calentamiento"
                    accent="warm"
                    body={activeSession?.warmup}
                    onPlayVideo={playVideo}
                />

                {activeSession?.exercises.map((ex, i) => (
                    <LoggerExerciseCard
                        key={ex.id}
                        sessionExercise={ex}
                        athleteId={athleteId}
                        position={i + 1}
                        chain={chains.get(ex.id) ?? null}
                        onStartTimer={handleStartTimer}
                        onExpandSet={handleExpandSet}
                        onSetChange={handleSetChange}
                    />
                ))}

                {activeSession?.exercises.length === 0 && !activeSession?.warmup && !activeSession?.extras && (
                    <div className="py-12 text-center text-t-sm italic text-ink-subtle">
                        Día de descanso o sin ejercicios programados.
                    </div>
                )}

                <AppendixBlock
                    label="Extras"
                    accent="cool"
                    body={activeSession?.extras}
                    onPlayVideo={playVideo}
                />
            </div>

            {/* Overlay Timer */}
            {timerEndTime && (
                <RestTimerOverlay
                    endTime={timerEndTime}
                    onClose={handleCloseTimer}
                    onAddSeconds={handleAddTimerSeconds}
                />
            )}

            <VideoModal
                open={video !== null}
                onClose={() => setVideo(null)}
                url={video?.url ?? null}
                title={video?.label}
            />
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: APÉNDICE DEL DÍA
// ==========================================
/**
 * Calentamiento o extras, tal y como los escribió el coach.
 *
 * No lleva casillas que marcar a propósito. Son indicaciones, no series: el
 * progreso del día se mide con lo que está pautado, y meter aquí checkboxes
 * haría que "3 de 12 series" empezara a contar el estiramiento de psoas.
 *
 * `whitespace-pre-line` es lo que respeta los saltos de línea del coach, que
 * es como escribe una escalera de aproximaciones.
 */
function AppendixBlock({
    label,
    body,
    accent,
    onPlayVideo,
}: {
    label: string;
    body?: string | null;
    accent: 'warm' | 'cool';
    /** Abre un vídeo enlazado sin sacar al atleta de la sesión. */
    onPlayVideo?: (url: string, label: string) => void;
}) {
    if (!body?.trim()) return null;

    const tone = accent === 'warm'
        ? { bar: 'bg-brand', text: 'text-brand' }
        : { bar: 'bg-info', text: 'text-info' };

    return (
        <section className="relative overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised">
            <span className={cn('absolute inset-y-0 left-0 w-1', tone.bar)} aria-hidden="true" />
            <div className="py-3 pl-4 pr-3.5">
                <h3 className={cn('text-t-2xs font-bold uppercase tracking-widest', tone.text)}>
                    {label}
                </h3>
                {/* `RichText` respeta los saltos de línea —así escribe el coach
                    una escalera de aproximaciones— y convierte en enlace lo que
                    haya escrito como [texto](url). Los que son vídeo se abren
                    dentro de la app. */}
                <RichText
                    body={body.trim()}
                    onPlayVideo={onPlayVideo}
                    className="mt-1.5 text-t-sm leading-relaxed text-ink-muted"
                />
            </div>
        </section>
    );
}

// ==========================================
// SUB-COMPONENT: PIE DE SESIÓN
// ==========================================
/**
 * Cierre del día.
 *
 * Va FIJO al pie y no al final del scroll: el atleta llega aquí después de
 * la última serie, con el móvil en una mano, y hacer scroll hasta abajo para
 * encontrar el botón es exactamente el tipo de fricción que hace que la
 * gente no lo pulse nunca — y si no lo pulsa nadie, la adherencia que ve el
 * coach es basura.
 *
 * La barra de progreso no es decoración: es la respuesta a "¿me falta algo?"
 * sin tener que subir a repasar.
 */
/**
 * Qué ejercicios van encadenados con cuáles, dentro de un día.
 *
 * Devuelve, para cada ejercicio que forme parte de un encadenado, la etiqueta
 * ("A", "B"…), cuántos ejercicios la comparten y qué puesto ocupa este dentro
 * del grupo. Con eso la tarjeta puede decir "Superserie A · 1 de 2", que es la
 * única forma de que el atleta sepa que después de esta serie le toca ir al
 * otro ejercicio y no descansar.
 *
 * La etiqueta vive en las SERIES, así que un ejercicio pertenece al grupo si
 * alguna de las suyas la lleva: marcar solo la primera serie de un ejercicio
 * es lo que hace el coach cuando encadena, y exigirle marcarlas todas sería
 * trabajo repetido para el mismo significado.
 */
function computeChains(exercises: ExtendedSessionExercise[]): Map<string, ChainInfo> {
    const byTag = new Map<string, string[]>();

    for (const ex of exercises) {
        const tag = ex.sets.find(s => s.group_tag)?.group_tag;
        if (!tag) continue;
        const list = byTag.get(tag) ?? [];
        list.push(ex.id);
        byTag.set(tag, list);
    }

    const chains = new Map<string, ChainInfo>();
    for (const [tag, ids] of byTag) {
        // Un grupo de uno no es un encadenado: es el coach a mitad de
        // marcarlo. Enseñar "Superserie A · 1 de 1" sería mentir.
        if (ids.length < 2) continue;
        ids.forEach((id, i) => {
            chains.set(id, { tag, size: ids.length, position: i + 1 });
        });
    }

    return chains;
}

interface ChainInfo {
    tag: string;
    size: number;
    position: number;
}

// ==========================================
// SUB-COMPONENT: EXERCISE CARD
// ==========================================
function LoggerExerciseCard({
    sessionExercise,
    athleteId,
    position,
    chain,
    onStartTimer,
    onExpandSet,
    onSetChange,
}: {
    sessionExercise: ExtendedSessionExercise;
    athleteId: string;
    /** Puesto del ejercicio en el día, empezando en 1. */
    position: number;
    /** Encadenado al que pertenece, si lo hay. */
    chain: ChainInfo | null;
    onStartTimer: (s: number) => void;
    onExpandSet: (setId: string, baseOrderIndex: number, groupIndex: number) => Promise<string | null>;
    onSetChange: (setId: string, completed: boolean) => void;
}) {
    /**
     * Renglones a pintar.
     *
     * Una fila de `training_sets` puede representar varias series ("4x8").
     * Se despliega para poder marcarlas de una en una, pero todos los
     * renglones desplegados apuntan todavía a la MISMA fila: hasta que el
     * atleta escribe algo no se separan de verdad. `needsExpansion` es lo
     * que le dice al renglón que, antes de su primera escritura, hay que
     * partir el grupo o se pisarían entre ellos.
     */
    const rows = useMemo(
        () => {
            let position = 0;
            return sessionExercise.sets.flatMap(set => {
                const group = parseGroupedReps(set.target_reps);
                const count = group?.count ?? 1;
                const targetReps = group?.reps ?? set.target_reps ?? null;

                return Array.from({ length: count }, (_, i) => ({
                    // La clave va por POSICIÓN dentro del ejercicio, no por
                    // id de serie. Es lo que hace que al separar un grupo React
                    // reutilice el mismo componente en vez de desmontarlo: si
                    // la clave cambiara, el renglón se remontaría en mitad de
                    // la escritura y se perdería lo que el atleta acababa de
                    // teclear.
                    key: `${sessionExercise.id}:${position++}`,
                    set,
                    targetReps,
                    needsExpansion: count > 1,
                    groupIndex: i,
                    baseOrderIndex: set.order_index,
                }));
            });
        },
        [sessionExercise.id, sessionExercise.sets]
    );

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
    // Lo leído del fichero, a la espera de saber a qué serie pertenece.
    const [pendingParsed, setPendingParsed] = useState<ParsedVbtFile | null>(null);
    // Ficha de velocidad abierta: la serie y su número visible.
    const [vbtSet, setVbtSet] = useState<{ set: TrainingSet; number: number } | null>(null);
    const [taggedSetId, setTaggedSetId] = useState<string | null>(
        sessionExercise.sets.find(s => s.vbt_file_url)?.id || null
    );
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Asocia el archivo recién subido a una serie Y GUARDA SUS NÚMEROS.
     *
     * Antes esto solo escribía la URL. El fichero quedaba adjunto y sus cifras
     * seguían dentro del CSV: para saber a qué velocidad se movió una serie
     * había que abrir la gráfica, y comparar dos semanas era abrir dos
     * gráficas y mirarlas a ojo. Ahora la velocidad de la serie es un número
     * en la base, así que el perfil carga-velocidad del atleta se construye
     * solo.
     */
    const tagSetWithVbt = async (
        setId: string | null,
        // El archivo y su lectura llegan por parámetro y NO del estado: cuando
        // el ejercicio tiene una sola serie esto se llama en el mismo turno en
        // que se guardan, y el estado todavía no se ha actualizado.
        urlArg?: string,
        parsedArg?: ParsedVbtFile | null
    ) => {
        const url = urlArg ?? pendingSetTag;
        const parsed = parsedArg !== undefined ? parsedArg : pendingParsed;
        setPendingSetTag(null);
        setPendingParsed(null);
        if (!url || !setId) return; // "todo el ejercicio" → ya está guardado a nivel ejercicio

        const index = sessionExercise.sets.findIndex(s => s.id === setId);
        const set = sessionExercise.sets[index];

        try {
            await trainingService.updateSet(setId, { vbt_file_url: url });
            setTaggedSetId(setId);

            // Del fichero se toma la serie con el mismo número; si no viene
            // separado por series, el resumen del fichero entero.
            const match = parsed?.sets.find(s => s.setNumber === index + 1) ?? parsed?.sets[0];
            const metrics = match?.metrics ?? parsed?.overall;

            if (metrics?.meanVelocity) {
                await vbtService.saveMeasurement({
                    athleteId,
                    createdBy: athleteId,
                    exerciseName: sessionExercise.exercise?.name ?? 'Ejercicio',
                    exerciseId: sessionExercise.exercise_id,
                    trainingSetId: setId,
                    sessionExerciseId: sessionExercise.id,
                    setNumber: index + 1,
                    reps: set?.actual_reps ?? null,
                    loadKg: set?.actual_load
                        ?? ((set?.target_metric ?? 'kg') === 'kg' ? set?.target_load ?? null : null),
                    metrics,
                    repVelocities: match?.repVelocities ?? null,
                    fileUrl: url,
                    source: 'encoder',
                });
                toast.success(`Serie ${index + 1}: ${metrics.meanVelocity.toFixed(2)} m/s guardados`);
            } else {
                toast.success('VBT asociado a la serie');
            }
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

            // Se lee EN EL NAVEGADOR, antes de preguntar nada. Si el formato no
            // se reconoce el archivo queda adjunto igual —siempre es mejor
            // tenerlo que no tenerlo— pero sin inventar cifras.
            let parsed: ParsedVbtFile | null = null;
            try {
                parsed = await parseVbtFile(file);
                if (parsed.rowCount === 0) parsed = null;
            } catch {
                parsed = null;
            }

            await trainingService.updateSessionExercise(sessionExercise.id, { vbt_file_url: publicUrl });
            setVbtUrl(publicUrl);
            toast.success(
                parsed
                    ? `Archivo leído · ${parsed.rowCount} repeticiones`
                    : 'Archivo VBT adjuntado'
            );

            // Si hay más de una serie, preguntar a cuál corresponde
            if (sessionExercise.sets.length > 1) {
                setPendingParsed(parsed);
                setPendingSetTag(publicUrl);
            } else if (sessionExercise.sets.length === 1) {
                await tagSetWithVbt(sessionExercise.sets[0].id, publicUrl, parsed);
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
        <div className="bg-surface-canvas rounded-card overflow-hidden border border-subtle shadow-sm">
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

            {/* Encadenado. Va ARRIBA DEL TODO y a ancho completo, tocando el
                borde: es lo primero que hay que saber del ejercicio, porque
                cambia lo que se hace al terminar la serie —ir al siguiente
                ejercicio en vez de descansar—. Dentro de la cabecera, entre
                el nombre y las notas, se leía como una etiqueta más. */}
            {chain && (
                <div className="flex items-center gap-2 bg-[var(--info-quiet)] px-4 py-1.5">
                    <span className="text-t-2xs font-black uppercase tracking-widest text-info">
                        {groupLabel(chain.size)} {chain.tag}
                    </span>
                    <span className="text-t-2xs text-info/70">
                        · {chain.position} de {chain.size}
                        {chain.position < chain.size
                            ? ' · sin descanso, sigue al siguiente'
                            : ' · ahora sí, descansa'}
                    </span>
                </div>
            )}

            {/* Header */}
            <div className="p-4 bg-surface-raised flex justify-between items-start gap-3">
                <div className="min-w-0">
                    <button
                        onClick={() => setDetailOpen(true)}
                        className="group flex items-start gap-1.5 text-left"
                        title="Ver técnica y detalles"
                    >
                        {/* El número del ejercicio en el día. Sin él, seis
                            tarjetas iguales en una pantalla de móvil no dicen
                            por dónde va uno al volver de un descanso largo. */}
                        <span className="mt-1 shrink-0 text-t-2xs font-black tabular-nums text-ink-faint">
                            {position}
                        </span>
                        <h3 className="font-bold text-lg leading-tight text-gray-100 group-hover:text-anvil-red transition-colors">{exerciseName}</h3>
                        <PlayCircle size={15} className="mt-1.5 text-ink-subtle group-hover:text-anvil-red transition-colors shrink-0" />
                    </button>

                    {/* LA VARIANTE PRESCRITA.
                        =================================================
                        Esto NO SE ENSEÑABA. El coach escribe aquí "Tempo 2\" ·
                        Pausa 4\"" —o lo compone con los botones de modificador
                        del editor— y el atleta veía "Press banca" a secas.
                        Salía en la vista previa del coach y en el PDF, así que
                        el coach daba por hecho que estaba puesto; en la
                        aplicación, que es donde se entrena, no existía.

                        Va debajo del nombre y con el color de marca porque
                        CAMBIA EL EJERCICIO: una banca con pausa de cuatro
                        segundos no es una banca, y confundirlas invalida la
                        sesión entera. Es la misma jerarquía que ya tenía en la
                        vista previa del entrenador, así que lo que él revisa y
                        lo que el atleta ve por fin coinciden. */}
                    {sessionExercise.variant_name?.trim() && (
                        <p className="mt-1 text-t-xs font-bold leading-snug text-anvil-red">
                            {sessionExercise.variant_name.trim()}
                        </p>
                    )}

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
                            className="flex items-center gap-1 text-[10px] text-ink-muted hover:text-white bg-black/40 hover:bg-black/60 px-2 py-1 rounded border border-[var(--border-default)] transition-colors"
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
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-anvil-red hover:text-white text-ink-muted text-xs font-black uppercase transition-colors border border-[var(--border-default)]"
                            >
                                Serie {i + 1}
                            </button>
                        ))}
                        <button
                            onClick={() => tagSetWithVbt(null)}
                            className="px-3 py-1.5 rounded-lg text-ink-subtle hover:text-white text-xs font-bold uppercase transition-colors"
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
                <div className="flex items-center gap-4 px-4 py-2 bg-black/30 border-b border-subtle text-[11px] text-ink-subtle">
                    {sessionExercise.velocity_avg && (
                        <span>
                            <span className="font-bold text-ink-muted">{sessionExercise.velocity_avg}</span>
                            <span className="ml-1">m/s</span>
                        </span>
                    )}
                    {sessionExercise.rpe && (
                        <span>
                            <span className="text-ink-subtle">RPE </span>
                            <span className="font-bold text-ink-muted">{sessionExercise.rpe}</span>
                        </span>
                    )}
                    {sessionExercise.rest_seconds && (
                        <span>
                            <span className="text-ink-subtle">Descanso </span>
                            <span className="font-bold text-ink-muted">{Math.floor(sessionExercise.rest_seconds / 60)}′{(sessionExercise.rest_seconds % 60).toString().padStart(2, '0')}″</span>
                        </span>
                    )}
                </div>
            )}

            {/* Cabecera de las columnas */}
            {/* Mismas columnas que LoggerSetRow. Si se cambian ahí, aquí
                también: son la cabecera de esa rejilla. */}
            <div className="grid grid-cols-[1rem_1fr_1fr_2.75rem_2.25rem_2.75rem] gap-1 border-b border-subtle bg-surface-overlay/40 px-2.5 py-2 text-center text-t-2xs font-bold uppercase tracking-wide text-ink-subtle sm:gap-1.5 sm:px-3">
                <span className="text-left">#</span>
                <span>Reps</span>
                {/* Esta columna son SIEMPRE kilos movidos, porque la escribe el
                    atleta. Cuando el coach pautó en otra unidad —RPE, RIR,
                    velocidad— su objetivo aparece encima de cada casilla, que
                    es donde no se confunde con lo que se ha levantado. */}
                <span>Kg{prescriptionMetric !== 'kg' ? ` · ${prescriptionLabel}` : ''}</span>
                <span>RPE</span>
                <span />
                <span />
            </div>

            {/* Series.
                Una serie agrupada ("4x8") se pinta como cuatro renglones para
                poder marcarlos uno a uno, pero los cuatro comparten `id` hasta
                que el atleta escribe algo: en ese momento se separa en filas
                reales (ver `expandGroupedSet`). Mientras nadie toque nada, un
                bloque programado no genera ni una escritura. */}
            <div className="divide-y divide-[var(--border-subtle)]">
                {rows.map((row, index) => (
                    <LoggerSetRow
                        key={row.key}
                        set={row.set}
                        displayIndex={index + 1}
                        targetReps={row.targetReps}
                        onStartTimer={onStartTimer}
                        defaultRestSeconds={sessionExercise.rest_seconds}
                        needsExpansion={row.needsExpansion}
                        groupIndex={row.groupIndex}
                        onExpand={(groupIndex) => onExpandSet(row.set.id, row.baseOrderIndex, groupIndex)}
                        onChange={onSetChange}
                        // La velocidad solo se ofrece en series YA SEPARADAS: en
                        // un "4x8" sin separar las cuatro comparten fila, y
                        // guardar una velocidad ahí la asignaría a las cuatro.
                        onOpenVbt={
                            row.needsExpansion
                                ? undefined
                                : () => setVbtSet({ set: row.set, number: index + 1 })
                        }
                    />
                ))}
            </div>

            {vbtSet && (
                <SetVbtModal
                    open
                    onClose={() => setVbtSet(null)}
                    athleteId={athleteId}
                    createdBy={athleteId}
                    exerciseName={exerciseName}
                    exerciseId={sessionExercise.exercise_id}
                    sessionExerciseId={sessionExercise.id}
                    set={vbtSet.set}
                    setNumber={vbtSet.number}
                />
            )}
        </div>
    );
}

