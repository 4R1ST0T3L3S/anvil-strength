
import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { TrainingBlock, TrainingSession, SessionExercise, TrainingSet, ExerciseLibrary, TARGET_METRICS, WEEKDAYS, weekdayIndex, weekdayLabel } from '../../../types/training';
import type { TargetMetric, WeekMeta, Weekday } from '../../../types/training';
import { trainingService } from '../../../services/trainingService';
import { supabase } from '../../../lib/supabase';
import { Loader, Plus, Save, Trash2, Video, Copy, Calendar, CalendarPlus, Activity, X, Dumbbell, ArrowRightLeft, FileText, BarChart3, Flame, Timer, Eye, EyeOff, LayoutTemplate, CopyPlus, GripVertical, ChevronDown, TrendingUp, Send, Check, Download, Flame as FlameIcon, MoreVertical, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useAuth } from '../../../context/AuthContext';
import { DayTemplate, DayTemplateExercise } from '../../../types/training';
import { toast } from 'sonner';
import {
    getWeekNumber, getDateRangeFromWeek, formatDateRange,
    getWeekReleaseDate, isWeekReleased, formatShortDate,
} from '../../../utils/dateUtils';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';
import { VbtChartModal } from '../../coach/components/VbtChartModal';
import { VolumePanel } from './VolumePanel';
import { BlockOverviewPanel } from './BlockOverviewPanel';
import { ProgressionModal } from './ProgressionModal';
import { resolveStep, type ProgressionStep } from '../../../lib/planning/progression';
import { analyzeBlock, exerciseKey } from '../../../lib/planning/blockAnalytics';
import { parseLoadInput, percentOfMax } from '../../../lib/planning/loadMath';
import { ResizeHandle, usePanelWidth } from '../../../components/ui/ResizeHandle';
import { maxesService, findMax, type MaxesByExercise } from '../../../services/maxesService';
import { toVolumeInput } from '../../../lib/volume/engine';
import { downloadWeekPdf, sessionToPrintDay } from '../../../lib/export/weekPdf';
import { Button } from '../../../components/ui/Button';
import { transition, DURATION } from '../../../lib/motion';
import { lockBodyScroll } from '../../../lib/scrollLock';

// Helpers to parse and format target_reps field specifically for grouped sets
const getSeriesCount = (target_reps: string | null | undefined) => {
    if (!target_reps) return '';
    const parts = target_reps.toLowerCase().split('x');
    if (parts.length >= 2) return parts[0].trim();
    return '1';
};

const getRepsCount = (target_reps: string | null | undefined) => {
    if (!target_reps) return '';
    const parts = target_reps.toLowerCase().split('x');
    if (parts.length >= 2) return parts.slice(1).join('x').trim();
    return target_reps.trim();
};

/**
 * Ordena los días de una semana como los va a vivir el atleta.
 *
 * Manda el día de la semana agendado; los que no lo tienen van detrás por
 * `day_number`. Mezclar ambos criterios sin desempate dejaba "Día 3 (lunes)"
 * detrás de "Día 1 (jueves)" en el planificador y delante en la app del
 * atleta, que ya ordena por calendario.
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
 * ACTUALIZAR EL BLOQUE SIN REESCRIBIRLO ENTERO
 * =====================================================================
 *
 * El estado del constructor es un árbol de tres niveles: bloque → sesiones →
 * ejercicios → series. Los `setBlockData` de este fichero lo recorrían entero
 * con `map` anidados y devolvían objetos nuevos en TODOS los niveles, tocara
 * lo que tocara el cambio.
 *
 * React compara props por identidad. Con todo reconstruido, cada pulsación en
 * un campo de kilos convertía a "cambiado" a las 32 sesiones de un bloque de
 * ocho semanas, y con ellas todas sus tarjetas de día. El editor de un día
 * abierto encima repintaba también.
 *
 * Estas dos funciones cortan por lo sano en cuanto encuentran lo que buscan y
 * devuelven EL MISMO array cuando no hay nada que cambiar, así que solo se
 * repinta la rama afectada.
 */

/** Aplica `fn` a la serie con ese id. Devolver `null` la elimina. */
function mapSets(
    sessions: ExtendedSession[],
    setId: string,
    fn: (set: TrainingSet) => TrainingSet | null
): ExtendedSession[] {
    let touched = false;

    const next = sessions.map(session => {
        let sessionTouched = false;

        const exercises = session.exercises.map(exercise => {
            if (!exercise.sets.some(s => s.id === setId)) return exercise;

            sessionTouched = true;
            const sets: TrainingSet[] = [];
            for (const set of exercise.sets) {
                if (set.id !== setId) { sets.push(set); continue; }
                const result = fn(set);
                if (result) sets.push(result);
            }
            return { ...exercise, sets };
        });

        if (!sessionTouched) return session;
        touched = true;
        return { ...session, exercises };
    });

    return touched ? next : sessions;
}

/** Aplica `fn` al ejercicio con ese id. */
function mapExercise(
    sessions: ExtendedSession[],
    exerciseId: string,
    fn: (exercise: ExtendedSessionExercise) => ExtendedSessionExercise
): ExtendedSession[] {
    let touched = false;

    const next = sessions.map(session => {
        if (!session.exercises.some(e => e.id === exerciseId)) return session;
        touched = true;
        return {
            ...session,
            exercises: session.exercises.map(e => (e.id === exerciseId ? fn(e) : e)),
        };
    });

    return touched ? next : sessions;
}

const formatTargetReps = (series: string, reps: string) => {
    if (!series || series === '1') return reps;
    if (!reps) return `${series}x`;
    return `${series}x${reps}`;
};

interface WorkoutBuilderProps {
    athleteId: string;
    blockId?: string | null;
    /** Solo para la cabecera de la hoja exportada a PDF. */
    athleteName?: string | null;
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
export function WorkoutBuilder({ athleteId, blockId, athleteName }: WorkoutBuilderProps) {
    const athleteDisplayName = athleteName?.trim() || 'Atleta';
    const [loading, setLoading] = useState(true);
    const [blockData, setBlockData] = useState<FullBlockData | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    // Expanded weeks state - default to collapsed
    const [expandedWeeks, setExpandedWeeks] = useState<number[]>([]);

    // Nombre + visibilidad de cada semana. Solo hay entrada para las semanas
    // que el coach ha tocado; el resto son visibles y sin nombre.
    const [weekMeta, setWeekMeta] = useState<Record<number, WeekMeta>>({});
    const [editingWeek, setEditingWeek] = useState<number | null>(null);
    const [weekNameInput, setWeekNameInput] = useState("");

    const weekName = (week: number) => weekMeta[week]?.name || '';
    const isWeekVisible = (week: number) => weekMeta[week]?.isVisible ?? true;

    // Solo los nombres, que es lo único que consume el panel de análisis.
    const weekNames = useMemo(
        () => Object.fromEntries(
            Object.entries(weekMeta).map(([w, m]) => [Number(w), m.name ?? ''])
        ) as Record<number, string>,
        [weekMeta]
    );

    // Calculate current week number for status badges
    const currentRealWeek = getWeekNumber();

    // Confirmation Modal State
    // `confirmText`/`variant` existen porque este mismo diálogo se usa para
    // borrar una semana y para copiar una sobre otra. Estaba fijo en "Eliminar"
    // y en rojo, así que al copiar salía un botón rojo que decía ELIMINAR: el
    // coach cancelaba por miedo y daba por hecho que la copia no funcionaba.
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        confirmText: string;
        variant: 'danger' | 'info';
        onConfirm: () => void;
    }>({ isOpen: false, title: '', description: '', confirmText: 'Eliminar', variant: 'danger', onConfirm: () => { } });

    const [vbtModalConfig, setVbtModalConfig] = useState<{ isOpen: boolean; url: string; exerciseName: string }>({ isOpen: false, url: '', exerciseName: '' });

    // Editor de día a pantalla completa
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    // Biblioteca de ejercicios para autocompletado
    const [libraryNames, setLibraryNames] = useState<string[]>([]);
    // Edición de descripción del bloque
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState('');
    // Planificación (editar) vs Análisis (leer la forma del mesociclo)
    const [view, setView] = useState<'plan' | 'overview'>('plan');
    // Ejercicio cuyo editor de progresión está abierto (null = cerrado)
    const [progressionFor, setProgressionFor] = useState<string | null>(null);

    // Cargar biblioteca una vez para el autocompletado
    useEffect(() => {
        trainingService.getExerciseLibrary()
            .then(lib => setLibraryNames(lib.map(e => e.name)))
            .catch(() => { /* autocompletado no crítico */ });
    }, []);

    const { session: authSession } = useAuth();
    const coachId = authSession?.user.id || null;

    // Máximos del atleta, para resolver los porcentajes al prescribir. Se
    // cargan con el bloque y no al abrir cada día: son pocos y hacen falta en
    // cuanto se escribe el primer "85%".
    const [maxes, setMaxes] = useState<MaxesByExercise>(new Map());

    useEffect(() => {
        if (!athleteId) return;
        maxesService.getForAthlete(athleteId)
            .then(setMaxes)
            // Sin máximos se sigue pudiendo prescribir en kilos; solo se pierde
            // el atajo del porcentaje. No es motivo para tumbar el editor.
            .catch(() => { /* la tabla puede no estar migrada todavía */ });
    }, [athleteId]);

    /**
     * Guarda el 1RM de un ejercicio para este atleta.
     *
     * Se actualiza el estado local antes de esperar al servidor: el coach
     * acaba de escribirlo para prescribir un porcentaje AHORA, y esperar el
     * viaje de ida y vuelta dejaría el "85%" sin resolver un segundo entero.
     * Si el guardado falla, se revierte y se avisa.
     */
    const saveAthleteMax = useCallback(async (exerciseName: string, kg: number) => {
        if (!athleteId || !exerciseName) return;
        const previous = maxes;

        setMaxes(prev => {
            const next = new Map(prev);
            const key = exerciseKey(exerciseName);
            const existing = next.get(key);
            next.set(key, {
                ...(existing ?? {
                    id: `local-${key}`,
                    athlete_id: athleteId,
                    exercise_key: key,
                    updated_at: new Date().toISOString(),
                    source: 'manual' as const,
                }),
                exercise_name: exerciseName,
                one_rm: kg,
            });
            return next;
        });

        try {
            await maxesService.upsert({ athleteId, exerciseName, oneRm: kg });
            toast.success(`1RM de ${exerciseName}: ${kg} kg`);
        } catch {
            setMaxes(previous);
            toast.error('No se pudo guardar el 1RM');
        }
    }, [athleteId, maxes]);

    // Historial de cargas por ejercicio (para sparklines) — carga perezosa al abrir un día
    const [historyByExercise, setHistoryByExercise] = useState<Record<string, number[]>>({});
    const historyLoaded = useRef(false);

    useEffect(() => {
        if (!editingSessionId || historyLoaded.current || !athleteId) return;
        historyLoaded.current = true;
        trainingService.getExerciseHistoryByAthlete(athleteId)
            .then(rows => {
                const map: Record<string, number[]> = {};
                rows.forEach(r => {
                    const loads = r.sets
                        .map(s => s.actual_load ?? s.target_load)
                        .filter((v): v is number => v !== null && v !== undefined);
                    if (loads.length === 0) return;
                    const top = Math.max(...loads);
                    (map[r.exerciseName] = map[r.exerciseName] || []).push(top);
                });
                // Últimas 8 sesiones por ejercicio
                Object.keys(map).forEach(k => { map[k] = map[k].slice(-8); });
                setHistoryByExercise(map);
            })
            .catch(() => { /* sparklines no críticas */ });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingSessionId, athleteId]);

    // Plantillas de día
    const [dayTemplates, setDayTemplates] = useState<DayTemplate[]>([]);
    useEffect(() => {
        if (!coachId) return;
        trainingService.getDayTemplates(coachId)
            .then(setDayTemplates)
            .catch(() => { /* tabla aún sin migrar */ });
    }, [coachId]);

    /** Reordena los ejercicios de un día (optimista + persistencia). */
    const reorderExercises = (sessionId: string, orderedIds: string[]) => {
        setBlockData(prev => {
            if (!prev) return null;
            return {
                ...prev,
                sessions: prev.sessions.map(s => {
                    if (s.id !== sessionId) return s;
                    const byId = new Map(s.exercises.map(e => [e.id, e]));
                    return { ...s, exercises: orderedIds.map(id => byId.get(id)!).filter(Boolean) };
                })
            };
        });
        trainingService.reorderSessionExercises(orderedIds).catch(() => toast.error('Error guardando el orden'));
    };

    /** Copia un ejercicio (con variante, campos y series) a otro día. */
    const copyExerciseInto = async (targetSessionId: string, source: ExtendedSessionExercise) => {
        const target = blockData?.sessions.find(s => s.id === targetSessionId);
        if (!target) return;
        try {
            const newEx = await trainingService.addSessionExercise(targetSessionId, source.exercise_id, target.exercises.length);
            await trainingService.updateSessionExercise(newEx.id, {
                variant_name: source.variant_name,
                notes: source.notes,
                rpe: source.rpe,
                velocity_avg: source.velocity_avg,
                rest_seconds: source.rest_seconds
            });
            let newSets: TrainingSet[] = [];
            if (source.sets.length > 0) {
                newSets = await trainingService.addSets(source.sets.map((s, i) => ({
                    session_exercise_id: newEx.id,
                    order_index: i,
                    target_reps: s.target_reps,
                    target_rpe: s.target_rpe,
                    target_load: s.target_load,
                    rest_seconds: s.rest_seconds,
                    is_video_required: false
                })));
            }
            setBlockData(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    sessions: prev.sessions.map(s => s.id !== targetSessionId ? s : {
                        ...s,
                        exercises: [...s.exercises, {
                            ...newEx,
                            variant_name: source.variant_name,
                            notes: source.notes,
                            rpe: source.rpe,
                            velocity_avg: source.velocity_avg,
                            rest_seconds: source.rest_seconds,
                            exercise: source.exercise,
                            sets: newSets
                        }]
                    })
                };
            });
            toast.success(`"${source.exercise?.name}" copiado`);
        } catch (e) {
            console.error(e);
            toast.error('Error copiando el ejercicio');
        }
    };

    /** Guarda un día como plantilla reutilizable. */
    const saveDayAsTemplate = async (session: ExtendedSession, name: string) => {
        if (!coachId) return;
        const payload: DayTemplateExercise[] = session.exercises.map(ex => ({
            name: ex.exercise?.name || 'Ejercicio',
            variant_name: ex.variant_name,
            notes: ex.notes,
            rpe: ex.rpe,
            velocity_avg: ex.velocity_avg,
            rest_seconds: ex.rest_seconds,
            sets: ex.sets.map(s => ({
                target_reps: s.target_reps,
                target_rpe: s.target_rpe,
                target_load: s.target_load,
                rest_seconds: s.rest_seconds
            }))
        }));
        try {
            const tpl = await trainingService.saveDayTemplate(coachId, name, payload);
            setDayTemplates(prev => [tpl, ...prev]);
            toast.success(`Plantilla "${name}" guardada`);
        } catch (e) {
            console.error(e);
            toast.error('Error guardando la plantilla (¿migración SQL day_templates?)');
        }
    };

    /** Aplica una plantilla al día actual. */
    const applyTemplate = async (sessionId: string, template: DayTemplate) => {
        if (!coachId) return;
        const session = blockData?.sessions.find(s => s.id === sessionId);
        if (!session) return;
        try {
            await trainingService.applyDayTemplate(sessionId, template, coachId, session.exercises.length);
            await loadData();
            toast.success(`Plantilla "${template.name}" aplicada`);
        } catch (e) {
            console.error(e);
            toast.error('Error aplicando la plantilla');
        }
    };

    const deleteTemplate = async (templateId: string) => {
        try {
            await trainingService.deleteDayTemplate(templateId);
            setDayTemplates(prev => prev.filter(t => t.id !== templateId));
            toast.success('Plantilla eliminada');
        } catch (e) {
            console.error(e);
            toast.error('Error eliminando la plantilla');
        }
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        if (!athleteId || !blockId) {
            setBlockData(null);
            setLoading(false);
            return;
        }
        try {
            // Las tres consultas son INDEPENDIENTES. Se lanzaban en fila —el
            // bloque, luego las sesiones, luego los nombres de las semanas— así
            // que abrir un mesociclo costaba tres viajes completos encadenados
            // en vez de uno. Es la espera que se nota nada más entrar.
            const [block, sessionsResult, meta] = await Promise.all([
                trainingService.getBlock(blockId),
                supabase
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
                    .order('day_number'),
                trainingService.getWeekMetaByBlock(blockId),
            ]);

            const { data: sessions, error: sessError } = sessionsResult;
            if (sessError) throw sessError;

            // Sort nested data properly
            const formattedSessions: ExtendedSession[] = (sessions || []).map(s => ({
                ...s,
                exercises: (s.session_exercises || [])
                    .sort((a: SessionExercise, b: SessionExercise) => a.order_index - b.order_index)
                    .map((e: SessionExercise & { training_sets: TrainingSet[] }) => ({
                        ...e,
                        sets: (e.training_sets || []).sort((a: TrainingSet, b: TrainingSet) => a.order_index - b.order_index)
                    }))
            }));

            setWeekMeta(meta);
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
            // Se envían SOLO las columnas que el coach edita. Mandar el objeto
            // entero arrastraba campos que la fila local trae de más (o de
            // menos, en las creadas en cliente) y bastaba uno para que
            // PostgREST rechazara el lote completo con PGRST204 y no se
            // guardara ni una serie.
            const allSets = blockData.sessions.flatMap(session =>
                session.exercises.flatMap(ex =>
                    ex.sets.map(set => ({
                        id: set.id,
                        session_exercise_id: ex.id,
                        order_index: set.order_index,
                        target_reps: set.target_reps ?? null,
                        target_load: set.target_load ?? null,
                        target_metric: set.target_metric ?? 'kg',
                        target_rpe: set.target_rpe ?? null,
                        rest_seconds: set.rest_seconds ?? null,
                        is_video_required: set.is_video_required ?? false,
                        notes: set.notes ?? null,
                    }))
                )
            );

            if (allSets.length === 0) {
                setHasUnsavedChanges(false);
                return;
            }

            // Batch UPSERT
            const { error } = await supabase
                .from('training_sets')
                .upsert(allSets, { onConflict: 'id' });

            if (error) throw error;

            toast.success("Progreso guardado");
            setHasUnsavedChanges(false);
        } catch (err) {
            console.error('Error guardando series:', err);
            // El mensaje real de PostgREST importa: distingue "falta la
            // columna target_metric" (migración pendiente) de un rechazo de
            // RLS. Sin él, el fallo era indepurable desde la interfaz.
            const detail =
                (err as { message?: string })?.message ?? 'error desconocido';
            toast.error(`Error al guardar cambios: ${detail}`);
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

    /**
     * Crea de golpe los días que faltan hasta llegar a `target` en TODAS las
     * semanas del bloque.
     *
     * Un bloque de 8 semanas a 4 días son 32 clics en "Añadir día", uno a uno,
     * esperando al servidor entre cada uno. La frecuencia semanal es una
     * decisión que se toma una vez al empezar el bloque, no treinta y dos.
     *
     * Nunca borra: si una semana ya tiene más días de los pedidos, se queda
     * como está. Quitar días por un cambio de número se llevaría por delante
     * ejercicios ya programados.
     */
    const [daysPrompt, setDaysPrompt] = useState(false);
    // Popover del selector de antelación de publicación
    const [releasePrompt, setReleasePrompt] = useState(false);

    const fillWeeksWithDays = async (target: number) => {
        if (!blockData || target < 1) return;
        setDaysPrompt(false);

        const pending: { week: number; day: number }[] = [];
        for (const week of weeks) {
            const existing = blockData.sessions.filter(s => s.week_number === week).length;
            for (let day = existing + 1; day <= target; day++) {
                pending.push({ week, day });
            }
        }

        if (pending.length === 0) {
            toast.info(`Todas las semanas tienen ya ${target} días o más`);
            return;
        }

        try {
            setLoading(true);
            // Una sola inserción con todas las filas. Antes iban de una en una
            // y esperando: cuarenta días son cuarenta viajes encadenados, y
            // además dejaba el bloque a medias si fallaba el número treinta.
            // En lote, o entran todos o no entra ninguno.
            await trainingService.createSessions(pending.map(({ week, day }) => ({
                block_id: blockData.id,
                week_number: week,
                day_number: day,
                name: `Día ${day}`,
            })));
            await loadData();
            toast.success(`${pending.length} ${pending.length === 1 ? 'día creado' : 'días creados'}`);
        } catch {
            toast.error('Error creando los días');
            await loadData();
        } finally {
            setLoading(false);
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

    /**
     * Guarda el calentamiento o los extras de un día.
     *
     * Se llama al SALIR del campo, no en cada tecla: son textos largos y una
     * escritura por pulsación convertía escribir un calentamiento en cincuenta
     * peticiones. El estado local ya va al día con lo que se escribe.
     */
    const updateSessionAppendix = useCallback(
        async (sessionId: string, field: 'warmup' | 'extras', value: string) => {
            const clean = value.trim() || null;
            const previous = blockData?.sessions.find(s => s.id === sessionId)?.[field] ?? null;
            if (previous === clean) return;

            setBlockData(prev => prev && ({
                ...prev,
                sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, [field]: clean } : s),
            }));

            try {
                await trainingService.setSessionAppendix(sessionId, { [field]: clean });
            } catch (err) {
                setBlockData(prev => prev && ({
                    ...prev,
                    sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, [field]: previous } : s),
                }));
                toast.error(
                    err instanceof Error ? err.message : 'No se pudo guardar el apéndice'
                );
            }
        },
        [blockData]
    );

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
            description: 'Se pierden todas las series de este ejercicio. No se puede deshacer.',
            confirmText: 'Eliminar',
            variant: 'danger',
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
        setHasUnsavedChanges(true);
        setBlockData(prev => {
            if (!prev) return null;
            return {
                ...prev,
                sessions: mapExercise(prev.sessions, sessionExerciseId, ex => {
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
                }),
            };
        });
    };



    /**
     * Duplica una serie justo debajo de la original.
     *
     * `setHasUnsavedChanges` va FUERA del updater. Estaba dentro, y un updater
     * de `useState` tiene que ser puro: React lo ejecuta dos veces en
     * desarrollo y puede descartarlo, así que meter ahí otro `setState` es un
     * efecto secundario que a veces se aplicaba dos veces y a veces ninguna.
     */
    const duplicateSet = (setId: string) => {
        setHasUnsavedChanges(true);
        setBlockData(prev => {
            if (!prev) return null;

            const owner = prev.sessions
                .flatMap(s => s.exercises)
                .find(ex => ex.sets.some(set => set.id === setId));
            if (!owner) return prev;

            return {
                ...prev,
                sessions: mapExercise(prev.sessions, owner.id, ex => {
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
                        target_metric: sourceSet.target_metric,
                        rest_seconds: sourceSet.rest_seconds,
                        is_video_required: sourceSet.is_video_required,
                        created_at: new Date().toISOString()
                    };

                    const newSets = [...ex.sets];
                    newSets.splice(setIndex + 1, 0, newSet);
                    return { ...ex, sets: newSets };
                }),
            };
        });
    };

    /**
     * Aplica una progresión a un ejercicio en TODAS las semanas del bloque.
     *
     * Cada escalón se materializa como UNA fila con la notación agrupada
     * ("4x6"), que es la misma que ya usa el builder al prescribir a mano. Así
     * el resultado se puede seguir editando como cualquier otra serie en vez
     * de quedar como cuatro filas sueltas imposibles de retocar en bloque.
     *
     * Sustituye las series existentes del ejercicio en cada semana. Es
     * destructivo a propósito —una progresión define la semana entera— pero
     * solo toca el ejercicio elegido: el resto del día se queda como estaba.
     */
    const applyProgression = async (exerciseName: string, steps: ProgressionStep[]) => {
        if (!blockData || !exerciseName) return;

        const referenceMax = findMax(maxes, exerciseName)?.one_rm ?? null;
        const targetKey = exerciseKey(exerciseName);

        // -------------------------------------------------------------
        // 1. DECIDIR QUÉ HACER, fuera de React.
        //
        // Esto vivía DENTRO de `setBlockData(prev => ...)`, empujando ids a un
        // array y sumando un contador desde el propio updater. React puede
        // ejecutar un updater más de una vez con el mismo estado —lo hace
        // siempre en desarrollo— así que los ids salían duplicados y el
        // contador doblado; y si React lo omitía, `touched` quedaba en 0 y la
        // función abortaba diciendo que el ejercicio no estaba en el bloque.
        // Un updater tiene que ser una función pura de `prev`.
        //
        // Las semanas del bloque no empiezan necesariamente en 1 —`start_week`
        // es la semana del AÑO— así que el escalón n se aplica a la n-ésima
        // semana del bloque, no a la semana número n.
        // -------------------------------------------------------------
        const oldSetIds: string[] = [];
        const newSets: Partial<TrainingSet>[] = [];
        // Días a los que el escalón pedía un % y no había 1RM con el que
        // resolverlo. Ver más abajo por qué esto NO se puede ignorar.
        let unresolvedDays = 0;

        for (const session of blockData.sessions) {
            const ordinal = weeks.indexOf(session.week_number) + 1;
            const step = steps.find(s => s.week === ordinal);
            if (!step) continue;

            for (const ex of session.exercises) {
                if (exerciseKey(ex.exercise?.name) !== targetKey) continue;

                const resolved = resolveStep(step, referenceMax);
                if (resolved.unresolved) unresolvedDays += 1;

                ex.sets.forEach(s => oldSetIds.push(s.id));
                newSets.push({
                    session_exercise_id: ex.id,
                    target_reps: resolved.target_reps,
                    target_load: resolved.target_load,
                    target_metric: resolved.target_metric,
                    target_rpe: resolved.target_rpe,
                    is_video_required: false,
                    order_index: 0,
                });
            }
        }

        if (newSets.length === 0) {
            toast.error(`${exerciseName} no aparece en ninguna semana del bloque`);
            return;
        }

        /**
         * SIN 1RM, UNA PROGRESIÓN POR PORCENTAJE NO ESCRIBE NINGUNA CARGA.
         *
         * `resolveStep` ya lo detecta y devuelve `unresolved: true`, pero ese
         * aviso se estaba descartando aquí: la progresión se guardaba, salía
         * "Progresión guardada en 6 días" y el bloque quedaba con las series y
         * las repeticiones correctas y CERO kilos en todas las semanas.
         *
         * Es especialmente fácil de encontrarse porque la progresión que se
         * ofrece por defecto es de porcentajes (70% subiendo de 5 en 5, ver
         * `defaultProgression`): basta con abrir el editor en un ejercicio sin
         * 1RM y aceptar.
         *
         * Si NINGÚN día se ha podido resolver, no se escribe nada: borrar las
         * series que había para sustituirlas por otras sin carga deja el
         * bloque peor de lo que estaba.
         */
        if (unresolvedDays === newSets.length) {
            toast.error(
                `Sin 1RM de ${exerciseName} no se pueden calcular los kilos. ` +
                'Fíjalo con el botón "Fijar 1RM" del ejercicio y vuelve a aplicarla.',
                { duration: 7000 }
            );
            return;
        }

        // -------------------------------------------------------------
        // 2. PERSISTIR LA PROGRESIÓN ENTERA, ahora.
        //
        // Antes esto borraba las series viejas en el servidor y dejaba las
        // nuevas SOLO en memoria, a la espera de que el coach pulsara
        // "Guardar cambios". Quien aplicaba una progresión y cerraba el bloque
        // —o simplemente recargaba— se encontraba el ejercicio VACÍO en todas
        // las semanas: lo viejo borrado y lo nuevo nunca escrito.
        //
        // Ahora una progresión es una operación completa: al volver de aquí,
        // lo que hay en pantalla es lo que hay en la base de datos.
        // -------------------------------------------------------------
        setIsSaving(true);
        try {
            if (oldSetIds.length > 0) {
                const { error } = await supabase.from('training_sets').delete().in('id', oldSetIds);
                if (error) throw error;
            }

            // Se guardan los ids REALES que devuelve el servidor. Con uuid
            // generado en cliente, el upsert posterior insertaba una segunda
            // fila y el día acababa con la serie duplicada.
            const inserted = await trainingService.addSets(newSets);

            const byExercise = new Map<string, TrainingSet[]>();
            for (const row of inserted) {
                const list = byExercise.get(row.session_exercise_id) ?? [];
                list.push(row);
                byExercise.set(row.session_exercise_id, list);
            }

            setBlockData(prev => prev && ({
                ...prev,
                sessions: prev.sessions.map(session => ({
                    ...session,
                    exercises: session.exercises.map(ex => {
                        const fresh = byExercise.get(ex.id);
                        return fresh ? { ...ex, sets: fresh } : ex;
                    }),
                })),
            }));

            const days = newSets.length;

            // Resolución PARCIAL: algunas semanas iban por RPE o por kilos y
            // otras por % sin 1RM. Se guarda —lo resuelto es válido— pero se
            // dice cuántos días se han quedado sin carga, o el coach los
            // descubre cuando el atleta le pregunte.
            if (unresolvedDays > 0) {
                toast.warning(
                    `Progresión guardada, pero ${unresolvedDays} ${unresolvedDays === 1 ? 'día se ha quedado' : 'días se han quedado'} sin kilos: ` +
                    `falta el 1RM de ${exerciseName}.`,
                    { duration: 7000 }
                );
            } else {
                toast.success(`Progresión guardada en ${days} ${days === 1 ? 'día' : 'días'}`);
            }
        } catch (err) {
            console.error('Error aplicando la progresión:', err);
            const detail = (err as { message?: string })?.message ?? 'error desconocido';
            toast.error(`No se pudo aplicar la progresión: ${detail}`);
            // El bloque puede haber quedado a medias (borrado sí, insertado no):
            // se recarga para que la pantalla no mienta sobre lo que hay guardado.
            await loadData();
        } finally {
            setIsSaving(false);
        }
    };

    const removeSet = (setId: string) => {
        supabase.from('training_sets').delete().eq('id', setId).then(({ error }) => {
            if (error) toast.error("Error borrando serie");
        });

        setBlockData(prev => {
            if (!prev) return null;
            return { ...prev, sessions: mapSets(prev.sessions, setId, () => null) };
        });
    };

    /**
     * Cambia un campo de una serie.
     *
     * Conserva la IDENTIDAD de todo lo que no cambia. La versión anterior
     * reconstruía cada sesión y cada ejercicio del bloque en cada pulsación
     * —`{...s, exercises: s.exercises.map(...)}` para las 32 sesiones de un
     * bloque de 8 semanas— así que React veía props nuevas en todas las
     * tarjetas de día y volvía a pintar el mesociclo entero por cada tecla.
     * Eso es la lentitud que se notaba al escribir kilos.
     *
     * Ahora solo cambia el objeto de la serie tocada y la cadena de padres que
     * la contiene; el resto del árbol se reutiliza tal cual.
     */
    const updateSetField = (setId: string, field: keyof TrainingSet, value: TrainingSet[keyof TrainingSet]) => {
        setHasUnsavedChanges(true);
        setBlockData(prev => {
            if (!prev) return null;
            return { ...prev, sessions: mapSets(prev.sessions, setId, set => ({ ...set, [field]: value })) };
        });
    };

    const removeSession = useCallback(async (sessionId: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Eliminar día',
            description: 'Se borra este día de entrenamiento con todos sus ejercicios. No se puede deshacer.',
            confirmText: 'Eliminar',
            variant: 'danger',
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
    }, [setConfirmModal]);

    // Handlers for Weeks
    /**
     * Añade una semana vacía al final.
     *
     * NO recarga el bloque. Una semana nueva no tiene días ni ejercicios: lo
     * único que cambia es `end_week`, del que se derivan las semanas pintadas.
     * Volver a pedir el mesociclo entero —con todos sus ejercicios y series—
     * para enterarse de que hay un número más era lo que hacía que añadir una
     * semana tardara lo mismo que abrir el bloque.
     */
    const handleAddWeek = async () => {
        if (!blockData) return;
        try {
            const newEndWeek = await trainingService.addWeek(blockData.id);
            setBlockData(prev => prev && ({ ...prev, end_week: newEndWeek }));
            setExpandedWeeks(prev => [...prev, newEndWeek]);
            toast.success("Semana añadida");
        } catch (err) {
            console.error(err);
            toast.error("Error añadiendo semana");
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

    /** Copia el contenido de sourceWeek SOBRE targetWeek (sustituye lo que hubiera). */
    const handleCopyWeekInto = (sourceWeek: number, targetWeek: number) => {
        if (!blockData) return;

        const targetIndex = weeks.indexOf(targetWeek) + 1;
        const sourceIndex = weeks.indexOf(sourceWeek) + 1;

        setConfirmModal({
            isOpen: true,
            title: `Copiar semana ${sourceIndex} sobre la ${targetIndex}`,
            description: `Los días de la semana ${targetIndex} se sustituyen por una copia de los de la semana ${sourceIndex}. Lo que hubiera programado en la ${targetIndex} se pierde.`,
            confirmText: 'Copiar',
            variant: 'info',
            onConfirm: async () => {
                try {
                    setLoading(true);
                    await trainingService.copyWeekInto(blockData.id, sourceWeek, targetWeek);
                    await loadData();
                    setExpandedWeeks(prev => prev.includes(targetWeek) ? prev : [...prev, targetWeek]);
                    toast.success(`Semana ${sourceIndex} copiada sobre la Semana ${targetIndex}`);
                } catch (err) {
                    console.error(err);
                    toast.error("Error copiando la semana");
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handleSaveDescription = async () => {
        if (!blockData) return;
        try {
            await trainingService.updateBlock(blockData.id, { description: descriptionDraft.trim() || null });
            setBlockData(prev => prev ? { ...prev, description: descriptionDraft.trim() || null } : null);
            setIsEditingDescription(false);
            toast.success("Descripción del bloque guardada");
        } catch (err) {
            console.error(err);
            toast.error("Error guardando la descripción");
        }
    };

    const handleDeleteWeek = async (week: number) => {
        if (!blockData) return;

        setConfirmModal({
            isOpen: true,
            title: `Eliminar semana ${week}`,
            description: `Se borran todos los días de la semana ${week} y sus ejercicios. No se puede deshacer.`,
            confirmText: 'Eliminar',
            variant: 'danger',
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
                sessions: mapExercise(prev.sessions, sessionExerciseId, ex => {
                    const newEx: ExtendedSessionExercise = { ...ex, ...updates };
                    if (updates.exercise && ex.exercise) {
                        newEx.exercise = { ...ex.exercise, ...updates.exercise };
                    }
                    return newEx;
                }),
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
            const week = editingWeek;
            setWeekMeta(prev => ({
                ...prev,
                [week]: { name: newName, isVisible: prev[week]?.isVisible ?? true },
            }));
            setEditingWeek(null);

            await trainingService.saveWeekName(blockData.id, week, newName);
            toast.success("Nombre de semana guardado");
        } catch (err) {
            console.error(err);
            toast.error("Error guardando nombre");
            // Revert on error if needed, but simple enough to just let user retry
        }
    };

    /**
     * Publica u oculta una semana para el atleta.
     *
     * Se cambia el estado local antes de esperar al servidor porque el coach
     * suele publicar varias semanas seguidas y el parpadeo del interruptor
     * hacía dudar de si el clic había entrado. Si falla, se revierte.
     */
    const toggleWeekVisibility = async (week: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!blockData) return;

        const next = !isWeekVisible(week);
        const previous = weekMeta;

        setWeekMeta(prev => ({
            ...prev,
            [week]: { name: prev[week]?.name ?? null, isVisible: next },
        }));

        try {
            await trainingService.setWeekVisibility(blockData.id, week, next);
            toast.success(next ? 'Semana publicada' : 'Semana oculta para el atleta');
        } catch {
            setWeekMeta(previous);
            toast.error('No se pudo cambiar la visibilidad');
        }
    };

    /** Días de antelación con que se abre cada semana al atleta. */
    const releaseOffset = blockData?.release_offset_days ?? 1;

    const changeReleaseOffset = async (days: number) => {
        if (!blockData) return;
        const previous = blockData.release_offset_days ?? 1;

        setBlockData(prev => (prev ? { ...prev, release_offset_days: days } : null));
        setReleasePrompt(false);

        try {
            await trainingService.updateBlock(blockData.id, { release_offset_days: days });
            toast.success(
                days === 0
                    ? 'Cada semana se abre el mismo lunes'
                    : `Cada semana se abre ${days} ${days === 1 ? 'día' : 'días'} antes`
            );
        } catch {
            setBlockData(prev => (prev ? { ...prev, release_offset_days: previous } : null));
            toast.error('No se pudo guardar la antelación');
        }
    };

    /**
     * Agenda un día de la semana a una sesión (o lo quita con null).
     *
     * `useCallback` sin dependencias: la identidad estable es lo que permite
     * que `DayCard` esté memoizada. El valor anterior —para poder revertir— se
     * lee dentro del propio updater en lugar de capturar `blockData`, que
     * cambia en cada pulsación de teclado del editor.
     */
    const changeSessionWeekday = useCallback(async (sessionId: string, day: Weekday | null) => {
        let previous: Weekday | null = null;

        setBlockData(prev => {
            if (!prev) return prev;
            previous = prev.sessions.find(s => s.id === sessionId)?.day_of_week ?? null;
            return {
                ...prev,
                sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, day_of_week: day } : s),
            };
        });

        try {
            await trainingService.setSessionDayOfWeek(sessionId, day);
        } catch {
            setBlockData(prev => prev && ({
                ...prev,
                sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, day_of_week: previous } : s),
            }));
            toast.error('No se pudo agendar el día');
        }
    }, []);

    /**
     * Descarga la semana en PDF: una página por día, una fila por ejercicio,
     * con el calentamiento y los extras como apéndices.
     *
     * Se exporta lo que hay EN PANTALLA, no lo último guardado, porque el
     * coach normalmente exporta justo después de retocar algo. Si quedan
     * cambios sin guardar se avisa, para que nadie reparta una hoja que el
     * atleta no va a ver en la app.
     */
    const handleExportWeek = (week: number, index: number) => {
        if (!blockData) return;

        const days = sortSessions(blockData.sessions.filter(s => s.week_number === week));
        if (days.length === 0) {
            toast.error('Esta semana no tiene ningún día todavía');
            return;
        }

        const range = getDateRangeFromWeek(week, blockYear);

        try {
            const filename = downloadWeekPdf({
                blockName: blockData.name,
                athleteName: athleteDisplayName,
                weekLabel: weekName(week) || `Semana ${index + 1}`,
                dateRange: formatDateRange(range.start, range.end),
                days: days.map(sessionToPrintDay),
            });
            toast.success(`PDF descargado: ${filename}`);
        } catch (err) {
            console.error('Error generando el PDF:', err);
            toast.error('No se pudo generar el PDF de la semana');
            return;
        }

        if (hasUnsavedChanges) {
            toast.warning('Has exportado cambios que aún no has guardado.');
        }
    };

    const toggleWeek = (week: number) => {
        setExpandedWeeks(prev =>
            prev.includes(week)
                ? prev.filter(w => w !== week)
                : [...prev, week]
        );
    };

    // Año al que pertenecen las semanas del bloque. `week_number` es la semana
    // ISO DEL AÑO, así que sin esto no se puede traducir a fechas reales.
    const blockYear = useMemo(
        () => blockData?.start_date
            ? new Date(blockData.start_date).getFullYear()
            : new Date().getFullYear(),
        [blockData?.start_date]
    );

    // RENDER HELPERS
    const weeks = useMemo(() => {
        if (!blockData) return [];
        const startWeek = blockData.start_week ?? 1;
        const endWeek = blockData.end_week ?? 4;
        const weekCount = Math.max(1, endWeek - startWeek + 1);
        return Array.from({ length: weekCount }, (_, i) => startWeek + i);
    }, [blockData]);

    // Entrada de los motores de volumen y analítica. Se calcula sobre el estado
    // local para que el análisis refleje también lo que aún no se ha guardado:
    // el coach necesita ver el efecto del cambio antes de decidir si lo guarda.
    const blockVolumeSessions = useMemo(
        () => (blockData?.sessions ?? []).map(s => toVolumeInput(s, s.exercises)),
        [blockData]
    );

    // Cifras por semana para la cabecera del acordeón. Se calculan aquí y no
    // dentro de cada fila para no repetir el recorrido completo del bloque por
    // cada semana pintada.
    const blockAnalytics = useMemo(
        () => analyzeBlock(blockVolumeSessions),
        [blockVolumeSessions]
    );
    const weekStats = useMemo(
        () => new Map(blockAnalytics.weeks.map(w => [w.week, w])),
        [blockAnalytics]
    );
    const deloadWeeks = blockAnalytics.deloadWeeks;

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader className="animate-spin text-anvil-red" />
            </div>
        );
    }

    if (!blockData) {
        return (
            <div className="flex h-full items-center justify-center text-ink-subtle">
                No hay un bloque activo o no se pudo cargar.
            </div>
        );
    }

    return (
        <div className="relative">

            {/* Cabecera. El nombre del bloque manda; los metadatos son contexto y
                por eso van en una sola línea de texto en vez de en píldoras que
                compiten en peso visual con el título. */}
            <div className="mx-auto w-full max-w-[1560px] px-5 pt-10 md:px-8 lg:px-12">
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                        <div className="min-w-0">
                            <h2 className="truncate text-t-3xl font-semibold tracking-display text-ink">
                                {blockData.name}
                            </h2>
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-t-sm text-ink-subtle">
                                <Calendar size={14} className="text-ink-faint" aria-hidden="true" />
                                <span>
                                    {formatDateRange(
                                        getDateRangeFromWeek(blockData.start_week ?? 1).start,
                                        getDateRangeFromWeek(blockData.end_week ?? 1).end
                                    )}
                                </span>
                                <span className="text-ink-faint" aria-hidden="true">·</span>
                                <span>
                                    {weeks.length} {weeks.length === 1 ? 'semana' : 'semanas'}
                                </span>
                                <span className="text-ink-faint" aria-hidden="true">·</span>
                                <span>semanas {blockData.start_week}–{blockData.end_week} del año</span>
                            </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start md:self-auto">
                        {/* Frecuencia semanal: se decide una vez al empezar el
                            bloque, así que vive junto al título y no escondida
                            dentro de cada semana. */}
                        <div className="relative">
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setDaysPrompt(v => !v)}
                                icon={<CalendarPlus size={14} />}
                            >
                                Días por semana
                            </Button>

                            <AnimatePresence>
                                {daysPrompt && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.97, y: -4 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.97, y: -4 }}
                                        transition={transition(DURATION.fast)}
                                        style={{ transformOrigin: 'top left' }}
                                        className="absolute left-0 top-full z-dropdown mt-2 w-64 rounded-card bg-surface-overlay p-3 shadow-overlay"
                                    >
                                        <p className="text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                            ¿Cuántos días se entrena?
                                        </p>
                                        <p className="mt-1 text-t-xs text-ink-faint">
                                            Se crean en todas las semanas. No borra días que ya existan.
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {[2, 3, 4, 5, 6, 7].map(n => (
                                                <button
                                                    key={n}
                                                    onClick={() => fillWeeksWithDays(n)}
                                                    className="h-9 w-9 rounded-field bg-surface-raised text-t-sm font-semibold text-ink transition-colors duration-fast ease-snap hover:bg-brand hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Antelación con que se le abre cada semana al atleta.
                            Es una política del bloque entero, no de una semana
                            suelta: por eso vive aquí y no en el acordeón. */}
                        <div className="relative">
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setReleasePrompt(v => !v)}
                                icon={<Send size={14} />}
                            >
                                {releaseOffset === 0
                                    ? 'Se abre el lunes'
                                    : `Se abre ${releaseOffset} ${releaseOffset === 1 ? 'día' : 'días'} antes`}
                            </Button>

                            <AnimatePresence>
                                {releasePrompt && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.97, y: -4 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.97, y: -4 }}
                                        transition={transition(DURATION.fast)}
                                        style={{ transformOrigin: 'top left' }}
                                        className="absolute left-0 top-full z-dropdown mt-2 w-72 rounded-card bg-surface-overlay p-3 shadow-overlay"
                                    >
                                        <p className="text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                            ¿Cuándo ve el atleta cada semana?
                                        </p>
                                        <p className="mt-1 text-t-xs text-ink-faint">
                                            Antes de esa fecha la semana no existe para él. Vale para todo el bloque.
                                        </p>
                                        <div className="mt-3 space-y-0.5">
                                            {[
                                                { days: 0, label: 'El mismo lunes' },
                                                { days: 1, label: 'El domingo anterior' },
                                                { days: 2, label: 'El sábado anterior' },
                                                { days: 3, label: 'El viernes anterior' },
                                                { days: 7, label: 'Una semana antes' },
                                            ].map(({ days, label }) => (
                                                <button
                                                    key={days}
                                                    onClick={() => changeReleaseOffset(days)}
                                                    className={`flex w-full items-center justify-between rounded-field px-2.5 py-2 text-left text-t-sm transition-colors duration-fast ease-snap hover:bg-brand hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${releaseOffset === days ? 'bg-surface-raised font-semibold text-ink' : 'text-ink-muted'}`}
                                                >
                                                    {label}
                                                    {releaseOffset === days && <Check size={14} aria-hidden="true" />}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div
                            role="tablist"
                            aria-label="Vista del bloque"
                            className="flex rounded-field bg-surface-sunken p-0.5"
                        >
                            {([
                                { key: 'plan' as const, label: 'Planificación', icon: LayoutTemplate },
                                { key: 'overview' as const, label: 'Análisis', icon: BarChart3 },
                            ]).map(({ key, label, icon: Icon }) => (
                                <button
                                    key={key}
                                    role="tab"
                                    aria-selected={view === key}
                                    onClick={() => setView(key)}
                                    className={`flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-t-xs font-semibold transition-colors duration-fast ease-snap ${view === key
                                        ? 'bg-brand text-brand-ink'
                                        : 'text-ink-subtle hover:text-ink'
                                        }`}
                                >
                                    <Icon size={13} aria-hidden="true" />
                                    {label}
                                </button>
                            ))}
                        </div>
                        </div>
                    </div>

                    {/* Descripción del bloque (visible para el atleta) */}
                    <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="flex flex-wrap items-center gap-x-2 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                <FileText size={13} className="text-ink-faint" aria-hidden="true" />
                                Descripción del bloque
                                <span className="font-normal normal-case tracking-normal text-ink-faint">
                                    (el atleta la ve en su planificación)
                                </span>
                            </p>
                            {!isEditingDescription && (
                                <button
                                    onClick={() => { setDescriptionDraft(blockData.description || ''); setIsEditingDescription(true); }}
                                    className="shrink-0 text-t-xs font-medium text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink"
                                >
                                    {blockData.description ? 'Editar' : 'Añadir'}
                                </button>
                            )}
                        </div>
                        {isEditingDescription ? (
                            <div className="space-y-3">
                                <textarea
                                    value={descriptionDraft}
                                    onChange={(e) => setDescriptionDraft(e.target.value)}
                                    rows={3}
                                    maxLength={1000}
                                    autoFocus
                                    placeholder="Objetivos del bloque, por qué se hacen ciertas cosas, enfoque de las semanas..."
                                    className="w-full resize-none rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm text-ink transition-colors duration-fast ease-snap placeholder:text-ink-faint focus:border-brand focus:outline-none"
                                />
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => setIsEditingDescription(false)}>
                                        Cancelar
                                    </Button>
                                    <Button variant="primary" size="sm" onClick={handleSaveDescription}>
                                        Guardar
                                    </Button>
                                </div>
                            </div>
                        ) : blockData.description ? (
                            <p className="whitespace-pre-wrap text-t-sm leading-relaxed text-ink-muted">{blockData.description}</p>
                        ) : (
                            <p className="text-t-sm text-ink-subtle">
                                Sin descripción. Añade los objetivos del bloque para que el atleta sepa qué se busca.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Guardar. Se queda fijo abajo a la derecha porque el editor es una
                lista larga y el cambio puede hacerse a cualquier altura. */}
            <AnimatePresence>
                {hasUnsavedChanges && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={transition(DURATION.fast)}
                        className="fixed bottom-6 right-6 z-toast"
                    >
                        <Button
                            variant="primary"
                            onClick={handleSaveChanges}
                            loading={isSaving}
                            icon={<Save size={16} />}
                            className="shadow-overlay"
                        >
                            Guardar cambios
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Análisis del bloque. Solo se monta cuando se pide: recalcula sobre
                todas las sesiones y no tiene sentido pagarlo mientras se edita. */}
            {view === 'overview' && (
                <div className="mx-auto w-full max-w-[1560px] px-5 pb-24 pt-8 md:px-8 lg:px-12">
                    <BlockOverviewPanel
                        sessions={blockVolumeSessions}
                        weekNames={weekNames}
                    />
                </div>
            )}

            {/* Weeks List */}
            <div className={`mx-auto w-full max-w-[1560px] space-y-4 px-5 pb-24 md:px-8 lg:px-12 ${view === 'plan' ? '' : 'hidden'}`}>
                {weeks.map((week, index) => {
                    const isExpanded = expandedWeeks.includes(week);
                    const weekSessions = sortSessions(blockData.sessions.filter(s => s.week_number === week));
                    const stats = weekStats.get(week);
                    const isDeload = deloadWeeks.includes(week);

                    // Qué ve el atleta de esta semana AHORA MISMO. Son dos
                    // puertas distintas: el interruptor del coach y la fecha de
                    // publicación. La cabecera tiene que distinguirlas o el
                    // coach no sabe por qué su atleta no ve el entrenamiento.
                    const visible = isWeekVisible(week);
                    const released = isWeekReleased(week, blockYear, releaseOffset);
                    const releaseDate = getWeekReleaseDate(week, blockYear, releaseOffset);

                    // Estado temporal de la semana. Solo se marca la activa: las
                    // pasadas y futuras se deducen de su posición en la lista, y
                    // tres badges de colores distintos en cada fila convertían la
                    // pantalla en un semáforo sin decir nada accionable.
                    const isCurrent = week === currentRealWeek;

                    return (
                        <div
                            key={week}
                            // SIN `overflow-hidden`. Lo tenía, y era lo que hacía
                            // que "copiar sobre otra semana" pareciera roto: el
                            // desplegable de la semana destino se dibuja debajo
                            // de la cabecera, y con la semana plegada la tarjeta
                            // mide justo la cabecera, así que el menú se
                            // recortaba entero y el clic no abría nada visible.
                            // El recorte que sí hacía falta —el del acordeón—
                            // vive ahora en su propio contenedor.
                            className={`rounded-card border bg-surface-raised transition-colors duration-base ease-snap ${isCurrent ? 'border-[var(--brand-line)]' : 'border-[var(--border-default)]'}`}
                        >
                            {/* Cabecera de semana */}
                            <div
                                role="button"
                                tabIndex={0}
                                aria-expanded={isExpanded}
                                onClick={() => toggleWeek(week)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggleWeek(week);
                                    }
                                }}
                                // El relleno es menor en móvil: con 20px por
                                // lado, el título y las cifras de la semana se
                                // quedaban en una columna de unos 200px y todo
                                // salía partido en tres renglones.
                                className="flex cursor-pointer items-center justify-between gap-2 rounded-card px-4 py-4 transition-colors duration-fast ease-snap hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand md:gap-4 md:px-5 md:py-5"
                            >
                                <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
                                    <ChevronDown
                                        size={16}
                                        aria-hidden="true"
                                        className={`shrink-0 text-ink-subtle transition-transform duration-base ease-snap ${isExpanded ? 'rotate-180' : ''}`}
                                    />

                                    <div className="min-w-0">
                                        {editingWeek === week ? (
                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    value={weekNameInput}
                                                    onChange={(e) => setWeekNameInput(e.target.value)}
                                                    className="w-56 rounded-field border border-[var(--border-default)] bg-surface-sunken px-2.5 py-1.5 text-t-base text-ink transition-colors duration-fast ease-snap placeholder:text-ink-faint focus:border-brand focus:outline-none"
                                                    placeholder="Nombre de la semana"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveWeekName(e as unknown as React.MouseEvent);
                                                    }}
                                                />
                                                <Button size="sm" variant="ghost" onClick={handleSaveWeekName} icon={<Save size={14} />}>
                                                    Guardar
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="group flex min-w-0 items-baseline gap-2">
                                                <h3 className="truncate text-t-base font-semibold text-ink md:text-t-lg">
                                                    Semana {index + 1}
                                                    {weekName(week) && (
                                                        <span className="ml-2 font-normal text-ink-muted">{weekName(week)}</span>
                                                    )}
                                                </h3>
                                                <button
                                                    onClick={(e) => handleStartEditWeekName(week, weekName(week), e)}
                                                    aria-label={`Renombrar semana ${index + 1}`}
                                                    className="shrink-0 text-ink-faint opacity-0 transition-opacity duration-fast ease-snap hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                                </button>
                                            </div>
                                        )}

                                        {/* Resumen de la semana en la propia cabecera: así se lee
                                            la progresión del bloque sin abrir un solo acordeón. */}
                                        {/* En móvil esta línea NO envuelve: se
                                            recorta. Envolviendo, una semana con
                                            nombre largo y cinco cifras empujaba
                                            la cabecera a 90px de alto y la lista
                                            de semanas dejaba de caber de un
                                            vistazo, que es justo para lo que
                                            sirve. Las cifras secundarias solo
                                            aparecen a partir de `sm`. */}
                                        <div className="mt-0.5 flex items-center gap-x-2 gap-y-0.5 overflow-hidden whitespace-nowrap text-t-xs text-ink-subtle sm:mt-1 sm:flex-wrap sm:whitespace-normal">
                                            <span>
                                                {formatDateRange(
                                                    getDateRangeFromWeek(week).start,
                                                    getDateRangeFromWeek(week).end
                                                )}
                                            </span>
                                            <span className="text-ink-faint" aria-hidden="true">·</span>
                                            <span>{weekSessions.length} {weekSessions.length === 1 ? 'día' : 'días'}</span>
                                            {stats && stats.totalSets > 0 && (
                                                <>
                                                    <span className="text-ink-faint" aria-hidden="true">·</span>
                                                    <span className="tabular-nums">{stats.totalSets} series</span>
                                                </>
                                            )}
                                            {stats && stats.tonnage > 0 && (
                                                <>
                                                    <span className="hidden text-ink-faint sm:inline" aria-hidden="true">·</span>
                                                    <span className="hidden tabular-nums sm:inline">{(stats.tonnage / 1000).toFixed(1)} t</span>
                                                </>
                                            )}
                                            {stats?.avgRpe != null && (
                                                <>
                                                    <span className="hidden text-ink-faint sm:inline" aria-hidden="true">·</span>
                                                    <span className="hidden tabular-nums sm:inline">RPE {stats.avgRpe}</span>
                                                </>
                                            )}

                                            {/* Estado de cara al atleta. Solo se dice algo cuando
                                                NO lo está viendo: lo normal es que lo vea, y
                                                repetir "publicada" en cada fila es ruido. */}
                                            {!visible ? (
                                                <>
                                                    <span className="text-ink-faint" aria-hidden="true">·</span>
                                                    <span className="text-warning">Oculta para el atleta</span>
                                                </>
                                            ) : !released && (
                                                <>
                                                    <span className="text-ink-faint" aria-hidden="true">·</span>
                                                    <span>Se abre el {formatShortDate(releaseDate)}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                    {isCurrent && (
                                        <span className="mr-1 hidden rounded-chip bg-brand-quiet px-2 py-0.5 text-t-2xs font-semibold text-brand sm:inline">
                                            En curso
                                        </span>
                                    )}
                                    {isDeload && (
                                        <span className="mr-1 hidden rounded-chip bg-info/15 px-2 py-0.5 text-t-2xs font-semibold text-info sm:inline">
                                            Descarga
                                        </span>
                                    )}

                                    {/* Publicar/ocultar se queda FUERA del menú:
                                        es la única acción de la semana que se
                                        usa a diario y que además comunica un
                                        estado, así que tiene que verse sin
                                        abrir nada. */}
                                    <IconAction
                                        label={visible ? 'Ocultar esta semana al atleta' : 'Publicar esta semana para el atleta'}
                                        active={!visible}
                                        onClick={(e) => toggleWeekVisibility(week, e)}
                                    >
                                        {visible ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </IconAction>

                                    <WeekMenu
                                        weekLabel={`Semana ${index + 1}`}
                                        otherWeeks={weeks
                                            .filter(w => w !== week)
                                            .map(w => ({
                                                week: w,
                                                label: `Semana ${weeks.indexOf(w) + 1}`,
                                                name: weekName(w),
                                            }))}
                                        onExport={() => handleExportWeek(week, index)}
                                        onDuplicate={() => handleCopyWeek(week)}
                                        onCopyInto={(target) => handleCopyWeekInto(week, target)}
                                        onDelete={() => handleDeleteWeek(week)}
                                    />
                                </div>
                            </div>

                            {/* Contenido del acordeón */}
                            <div className={`grid overflow-hidden rounded-b-card transition-[grid-template-rows] duration-base ease-snap ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                <div className="overflow-hidden">
                                    <div className="border-t border-[var(--border-subtle)] p-3 md:p-6">
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                                            {weekSessions.map((session) => (
                                                <DayCard
                                                    key={session.id}
                                                    session={session}
                                                    onOpen={setEditingSessionId}
                                                    onRemove={removeSession}
                                                    onChangeWeekday={changeSessionWeekday}
                                                />
                                            ))}

                                            {/* Añadir día */}
                                            <button
                                                onClick={() => addSession(week)}
                                                className="group flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-[var(--border-default)] text-ink-subtle transition-colors duration-fast ease-snap hover:border-[var(--brand-line)] hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                            >
                                                <Plus size={20} aria-hidden="true" />
                                                <span className="text-t-xs font-medium">Añadir día</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Añadir semana */}
                <button
                    onClick={handleAddWeek}
                    className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-[var(--border-default)] py-5 text-t-sm font-medium text-ink-subtle transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                    <Plus size={18} aria-hidden="true" />
                    Añadir semana
                </button>
            </div>


            {/* Editor de día a pantalla completa */}
            {editingSessionId && (() => {
                const session = blockData.sessions.find(s => s.id === editingSessionId);
                if (!session) return null;
                return (
                    <DayEditorModal
                        session={session}
                        allSessions={blockData.sessions}
                        libraryNames={libraryNames}
                        historyByExercise={historyByExercise}
                        maxes={maxes}
                        onSetMax={saveAthleteMax}
                        onOpenProgression={(name) => setProgressionFor(name)}
                        templates={dayTemplates}
                        onSaveTemplate={(name) => saveDayAsTemplate(session, name)}
                        onApplyTemplate={(tpl) => applyTemplate(session.id, tpl)}
                        onDeleteTemplate={deleteTemplate}
                        onCopyExercise={(sourceEx) => copyExerciseInto(session.id, sourceEx)}
                        onReorder={(ids) => reorderExercises(session.id, ids)}
                        onClose={() => setEditingSessionId(null)}
                        onUpdateName={updateSessionName}
                        onUpdateAppendix={updateSessionAppendix}
                        onAddExercise={addExercise}
                        onUpdateExercise={updateSessionExercise}
                        onRemoveExercise={removeExercise}
                        onAddSet={addSet}
                        onDuplicateSet={duplicateSet}
                        onUpdateSet={updateSetField}
                        onRemoveSet={removeSet}
                        onOpenVbtChart={(url, name) => setVbtModalConfig({ isOpen: true, url, exerciseName: name })}
                        hasUnsavedChanges={hasUnsavedChanges}
                        onSave={handleSaveChanges}
                        isSaving={isSaving}
                    />
                );
            })()}

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                description={confirmModal.description}
                confirmText={confirmModal.confirmText}
                cancelText="Cancelar"
                variant={confirmModal.variant}
            />

            {/* Editor de progresión del ejercicio a lo largo del bloque */}
            {progressionFor && (
                <ProgressionModal
                    isOpen
                    onClose={() => setProgressionFor(null)}
                    exerciseName={progressionFor}
                    weekCount={weeks.length}
                    referenceMax={findMax(maxes, progressionFor)?.one_rm ?? null}
                    coachId={coachId}
                    onApply={(steps) => applyProgression(progressionFor, steps)}
                />
            )}

            {/* VBT Chart Modal */}
            <VbtChartModal
                isOpen={vbtModalConfig.isOpen}
                onClose={() => setVbtModalConfig(prev => ({ ...prev, isOpen: false }))}
                vbtFileUrl={vbtModalConfig.url}
                exerciseName={vbtModalConfig.exerciseName}
            />
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: EXERCISE AUTOCOMPLETE INPUT
// ==========================================
function ExerciseAutocomplete({
    libraryNames,
    onSelect,
    onCancel
}: {
    libraryNames: string[];
    onSelect: (name: string) => void;
    onCancel: () => void;
}) {
    const [query, setQuery] = useState('');
    const [highlighted, setHighlighted] = useState(0);

    const suggestions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length < 2) return [];
        return libraryNames
            .filter(n => n.toLowerCase().includes(q))
            .slice(0, 8);
    }, [query, libraryNames]);

    /**
     * ¿Ofrecer crear el ejercicio? Solo si lo escrito no coincide EXACTAMENTE
     * con algo que ya existe. Comparando contra las sugerencias visibles se
     * ofrecería crear "Sentadilla" mientras "Sentadilla Frontal" está en la
     * lista, que es lo que multiplica los duplicados en la biblioteca.
     */
    const canCreate = useMemo(() => {
        const q = query.trim();
        if (q.length < 2) return false;
        return !libraryNames.some(n => n.toLowerCase() === q.toLowerCase());
    }, [query, libraryNames]);

    const optionCount = suggestions.length + (canCreate ? 1 : 0);

    const submit = (name: string) => {
        const val = name.trim();
        if (val) onSelect(val);
    };

    return (
        <div className="relative">
            <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlighted(0); }}
                placeholder="Escribe el ejercicio... (ej: ba → Banca)"
                className="w-full bg-black/40 text-white font-bold p-3 rounded-xl border border-subtle focus:border-anvil-red outline-none placeholder-gray-600"
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlighted(h => Math.min(h + 1, optionCount - 1));
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlighted(h => Math.max(h - 1, 0));
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        // El índice que cae más allá de las sugerencias es la
                        // opción de crear, que también se recorre con flechas.
                        submit(highlighted < suggestions.length ? suggestions[highlighted] : query);
                    } else if (e.key === 'Escape') {
                        onCancel();
                    }
                }}
            />
            {(suggestions.length > 0 || canCreate) && (
                <div className="absolute left-0 right-0 top-full z-dropdown mt-1 overflow-hidden rounded-card bg-surface-overlay shadow-overlay">
                    {suggestions.map((s, i) => (
                        <button
                            key={s}
                            onMouseDown={(e) => { e.preventDefault(); submit(s); }}
                            onMouseEnter={() => setHighlighted(i)}
                            className={`w-full px-4 py-2.5 text-left text-t-sm font-medium transition-colors duration-fast ease-snap ${i === highlighted ? 'bg-brand text-brand-ink' : 'text-ink-muted'
                                }`}
                        >
                            {s}
                        </button>
                    ))}

                    {/* Crear el ejercicio que no está en la biblioteca.
                        Antes esto funcionaba —pulsar Enter sin sugerencias lo
                        daba de alta— pero la única pista era una nota en gris
                        que decía "(nuevo)". Una acción que existe y no se ve
                        es una acción que nadie usa. */}
                    {canCreate && (
                        <button
                            onMouseDown={(e) => { e.preventDefault(); submit(query); }}
                            onMouseEnter={() => setHighlighted(suggestions.length)}
                            className={`flex w-full items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5 text-left text-t-sm transition-colors duration-fast ease-snap ${highlighted === suggestions.length ? 'bg-brand text-brand-ink' : 'text-ink-muted'
                                }`}
                        >
                            <Plus size={14} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">
                                Crear <span className="font-semibold">«{query.trim()}»</span>
                            </span>
                        </button>
                    )}
                </div>
            )}
            <div className="mt-2 flex justify-between text-t-2xs text-ink-faint">
                <span>Enter para añadir</span>
                <span>Esc para cancelar</span>
            </div>
        </div>
    );
}

// ==========================================
// SUB-COMPONENTES DE LA LISTA DE SEMANAS
// ==========================================

/**
 * Acción de icono de la cabecera de semana.
 *
 * Existe como componente porque cada uno de estos botones necesita `aria-label`
 * además del `title`: `title` solo aparece al pasar el ratón y no lo lee ningún
 * lector de pantalla, así que un botón sin más contenido que un SVG queda sin
 * nombre accesible.
 */
function IconAction({
    label,
    onClick,
    children,
    active = false,
    danger = false,
}: {
    label: string;
    onClick: (e: React.MouseEvent) => void;
    children: React.ReactNode;
    active?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`rounded-field p-2 transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${active
                ? 'bg-brand-quiet text-brand'
                : danger
                    ? 'text-ink-subtle hover:bg-[var(--danger-quiet)] hover:text-danger'
                    : 'text-ink-subtle hover:bg-surface-overlay hover:text-ink'
                }`}
        >
            {children}
        </button>
    );
}

/**
 * MENÚ DE ACCIONES DE UNA SEMANA
 *
 * Antes esto eran cinco iconos en fila dentro de la cabecera. En escritorio
 * pasaba; en un móvil de 375px, cinco objetivos de 32px más el título más las
 * cifras de la semana no caben, y lo que ocurría es que la fila se desbordaba
 * fuera de la pantalla y la mitad de las acciones quedaban inalcanzables.
 *
 * Con un solo botón, la cabecera vuelve a ser un rectángulo limpio que se
 * pulsa para desplegar los días —que es lo que se hace el 95% de las veces— y
 * las acciones destructivas dejan de estar a un dedo de distancia del gesto
 * de abrir.
 *
 * Se cierra con Escape y con un clic fuera. Sin lo segundo, el menú se
 * quedaba abierto por la pantalla y había que volver a pulsar el mismo botón
 * para quitarlo, que es de las cosas que hacen pensar que la web está colgada.
 */
function WeekMenu({
    weekLabel,
    otherWeeks,
    onExport,
    onDuplicate,
    onCopyInto,
    onDelete,
}: {
    weekLabel: string;
    otherWeeks: { week: number; label: string; name: string }[];
    onExport: () => void;
    onDuplicate: () => void;
    onCopyInto: (targetWeek: number) => void;
    onDelete: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [copyMode, setCopyMode] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) {
                setOpen(false);
                setCopyMode(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setOpen(false);
            setCopyMode(false);
        };

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    /**
     * Cierra el menú.
     *
     * Vuelve SIEMPRE al primer nivel: reabrirlo y encontrarse la lista de
     * semanas destino de la vez anterior desorienta. Se hace aquí, en el único
     * sitio por el que se cierra, y no en un efecto que vigile `open`: un
     * efecto para esto es un render extra por cada cierre.
     */
    const close = useCallback(() => {
        setOpen(false);
        setCopyMode(false);
    }, []);

    const run = (action: () => void) => {
        close();
        action();
    };

    return (
        <div className="relative" ref={rootRef}>
            <IconAction
                label={`Acciones de ${weekLabel}`}
                active={open}
                onClick={(e) => { e.stopPropagation(); if (open) close(); else setOpen(true); }}
            >
                <MoreVertical size={16} />
            </IconAction>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: -4 }}
                        transition={transition(DURATION.fast)}
                        style={{ transformOrigin: 'top right' }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full z-dropdown mt-2 w-60 rounded-card border border-[var(--border-default)] bg-surface-overlay p-1.5 shadow-overlay"
                    >
                        {copyMode ? (
                            <>
                                <button
                                    onClick={() => setCopyMode(false)}
                                    className="mb-1 flex w-full items-center gap-1.5 rounded-field px-2.5 py-1.5 text-left text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink"
                                >
                                    <ChevronDown size={12} className="rotate-90" aria-hidden="true" />
                                    Copiar {weekLabel} sobre…
                                </button>
                                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                                    {otherWeeks.length === 0 && (
                                        <p className="px-2.5 py-2 text-t-xs italic text-ink-faint">
                                            No hay otra semana en el bloque.
                                        </p>
                                    )}
                                    {otherWeeks.map(w => (
                                        <button
                                            key={w.week}
                                            onClick={() => run(() => onCopyInto(w.week))}
                                            className="w-full truncate rounded-field px-2.5 py-2 text-left text-t-sm text-ink-muted transition-colors duration-fast ease-snap hover:bg-brand hover:text-brand-ink"
                                        >
                                            {w.label}
                                            {w.name && <span className="ml-2 text-t-xs opacity-70">{w.name}</span>}
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                <MenuItem icon={Download} onClick={() => run(onExport)}>
                                    Descargar en PDF
                                </MenuItem>
                                <MenuItem icon={Copy} onClick={() => run(onDuplicate)}>
                                    Duplicar como semana nueva
                                </MenuItem>
                                <MenuItem
                                    icon={ArrowRightLeft}
                                    onClick={() => setCopyMode(true)}
                                    trailing={<ChevronDown size={12} className="-rotate-90" aria-hidden="true" />}
                                >
                                    Copiar sobre otra semana
                                </MenuItem>
                                <div className="my-1 h-px bg-[var(--border-subtle)]" />
                                <MenuItem icon={Trash2} danger onClick={() => run(onDelete)}>
                                    Eliminar semana
                                </MenuItem>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function MenuItem({
    icon: Icon,
    children,
    onClick,
    danger = false,
    trailing,
}: {
    icon: LucideIcon;
    children: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    trailing?: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex w-full items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-t-sm transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${danger
                ? 'text-danger hover:bg-[var(--danger-quiet)]'
                : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                }`}
        >
            <Icon size={14} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {trailing}
        </button>
    );
}

/**
 * APÉNDICE DEL DÍA: calentamiento o extras.
 *
 * Texto libre a propósito. Un calentamiento son aproximaciones, movilidad y
 * activación, y forzarlo a la rejilla de series/reps/kg obligaba al coach a
 * inventarse ejercicios falsos que además CONTAMINABAN las métricas: sumaban
 * series al reparto por patrón y kilos al tonelaje de un día que todavía no
 * había empezado.
 *
 * Arranca plegado cuando está vacío: la mayoría de días no lo llevan y no
 * puede robarle sitio a la lista de ejercicios en una pantalla de móvil.
 */
function AppendixEditor({
    label,
    icon: Icon,
    placeholder,
    value,
    onCommit,
}: {
    label: string;
    icon: LucideIcon;
    placeholder: string;
    value: string | null | undefined;
    onCommit: (value: string) => void;
}) {
    const [draft, setDraft] = useState(value ?? '');
    const [open, setOpen] = useState(Boolean(value));

    // El día cambia bajo el MISMO componente al saltar de una sesión a otra, y
    // sin esto el borrador del día anterior se quedaba en pantalla —listo para
    // guardarse encima del nuevo en cuanto el campo perdiera el foco—.
    //
    // El ajuste va durante el render y no en un efecto: así React descarta el
    // resultado y vuelve a pintar antes de tocar el DOM, en vez de enseñar un
    // fotograma con el texto equivocado y corregirlo después.
    const [syncedValue, setSyncedValue] = useState(value);
    if (syncedValue !== value) {
        setSyncedValue(value);
        setDraft(value ?? '');
        setOpen(Boolean(value));
    }

    const filled = Boolean((value ?? '').trim());

    return (
        <div className="shrink-0 rounded-card border border-[var(--border-default)] bg-surface-raised">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
                <Icon size={13} className={filled ? 'text-brand' : 'text-ink-faint'} aria-hidden="true" />
                <span className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                    {label}
                </span>
                {filled && !open && (
                    <span className="ml-1 min-w-0 flex-1 truncate text-t-xs text-ink-faint">
                        {(value ?? '').replace(/\s+/g, ' ')}
                    </span>
                )}
                <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={`ml-auto shrink-0 text-ink-faint transition-transform duration-fast ease-snap ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <div className="px-3 pb-3">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => onCommit(draft)}
                        rows={3}
                        maxLength={2000}
                        placeholder={placeholder}
                        className="w-full resize-y rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm leading-relaxed text-ink transition-colors duration-fast ease-snap placeholder:text-ink-faint focus:border-brand focus:outline-none"
                    />
                    <p className="mt-1 text-t-2xs text-ink-faint">
                        Se guarda al salir del campo. Lo ve el atleta y sale en el PDF.
                    </p>
                </div>
            )}
        </div>
    );
}

/**
 * Tarjeta de día dentro de una semana.
 *
 * Antes solo decía "3 ejercicios", lo que obligaba a abrir el editor para
 * saber si un día era de sentadilla o de banca. Ahora enseña los ejercicios y
 * las series, que es lo que hace falta para escanear una semana entera y
 * decidir dónde tocar.
 */
const DayCard = memo(function DayCard({
    session,
    onOpen,
    onRemove,
    onChangeWeekday,
}: {
    session: ExtendedSession;
    // Reciben el id en vez de venir ya cerrados sobre él. Con una lambda por
    // tarjeta, `memo` no servía de nada: las props cambiaban de identidad en
    // cada render del constructor aunque el día fuese exactamente el mismo.
    onOpen: (sessionId: string) => void;
    onRemove: (sessionId: string) => void;
    onChangeWeekday: (sessionId: string, day: Weekday | null) => void;
}) {
    const metrics = useMemo(() => computeDayMetrics(session.exercises), [session.exercises]);
    const names = session.exercises
        .map(ex => ex.exercise?.name)
        .filter((n): n is string => Boolean(n));

    // Agendar es opcional: sin día asignado la tarjeta se sigue llamando
    // "Día 1", que es como funcionaba antes de poder ponerles fecha.
    const [pickerOpen, setPickerOpen] = useState(false);
    const scheduled = weekdayLabel(session.day_of_week);

    return (
        <div className="group/day relative rounded-card border border-[var(--border-default)] bg-surface-canvas transition-colors duration-fast ease-snap hover:border-[var(--border-strong)]">
            {/* Eliminar va fuera del botón principal: un <button> dentro de otro
                <button> es HTML inválido y el navegador lo reestructura. */}
            <button
                onClick={() => onRemove(session.id)}
                title="Eliminar día"
                aria-label={`Eliminar ${session.name || `día ${session.day_number}`}`}
                className="absolute right-2 top-2 z-10 rounded-field p-1.5 text-ink-faint opacity-0 transition-opacity duration-fast ease-snap hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover/day:opacity-100"
            >
                <Trash2 size={14} aria-hidden="true" />
            </button>

            {/* Agenda. Va fuera del botón principal por lo mismo. */}
            <div className="absolute left-3 top-3 z-10">
                <button
                    onClick={() => setPickerOpen(v => !v)}
                    aria-expanded={pickerOpen}
                    title="Agendar en un día de la semana"
                    className={`rounded-chip px-1.5 py-0.5 text-t-2xs uppercase tracking-wide transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${scheduled
                        ? 'bg-brand-quiet font-semibold text-brand'
                        : 'text-ink-subtle hover:text-ink'
                        }`}
                >
                    {scheduled || `Día ${session.day_number}`}
                </button>

                {pickerOpen && (
                    <div className="absolute left-0 top-full z-dropdown mt-1.5 w-44 rounded-card bg-surface-overlay p-1.5 shadow-overlay">
                        <p className="px-2 pb-1 pt-0.5 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                            Agendar en
                        </p>
                        {WEEKDAYS.map(d => (
                            <button
                                key={d.key}
                                onClick={() => { onChangeWeekday(session.id, d.key); setPickerOpen(false); }}
                                className={`flex w-full items-center justify-between rounded-field px-2.5 py-1.5 text-left text-t-sm transition-colors duration-fast ease-snap hover:bg-brand hover:text-brand-ink ${session.day_of_week === d.key ? 'font-semibold text-ink' : 'text-ink-muted'
                                    }`}
                            >
                                {d.label}
                                {session.day_of_week === d.key && <Check size={13} aria-hidden="true" />}
                            </button>
                        ))}
                        {session.day_of_week && (
                            <button
                                onClick={() => { onChangeWeekday(session.id, null); setPickerOpen(false); }}
                                className="mt-1 w-full rounded-field border-t border-[var(--border-subtle)] px-2.5 py-1.5 text-left text-t-xs text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink"
                            >
                                Quitar día — usar «Día {session.day_number}»
                            </button>
                        )}
                    </div>
                )}
            </div>

            <button
                onClick={() => onOpen(session.id)}
                className="flex min-h-[150px] w-full flex-col rounded-card p-4 pt-9 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
                <h4 className="mt-0.5 truncate pr-6 text-t-base font-semibold text-ink">
                    {session.name || scheduled || `Día ${session.day_number}`}
                </h4>

                {names.length === 0 ? (
                    <p className="mt-2 text-t-xs text-ink-subtle">Sin ejercicios todavía</p>
                ) : (
                    <>
                        <ul className="mt-2 space-y-0.5">
                            {names.slice(0, 3).map((name, i) => (
                                <li key={i} className="truncate text-t-xs text-ink-muted">
                                    {name}
                                </li>
                            ))}
                            {names.length > 3 && (
                                <li className="text-t-xs text-ink-faint">
                                    +{names.length - 3} más
                                </li>
                            )}
                        </ul>

                        <p className="mt-auto pt-3 text-t-2xs tabular-nums text-ink-subtle">
                            {metrics.totalSeries} series
                            {metrics.tonnage > 0 && ` · ${(metrics.tonnage / 1000).toFixed(1)} t`}
                        </p>
                    </>
                )}
            </button>
        </div>
    );
});

// ==========================================
// HELPERS: TEMA POR LEVANTAMIENTO + MÉTRICAS DEL DÍA
// ==========================================

/**
 * Palabras que convierten un movimiento en OTRO ejercicio, no en una variante
 * del básico.
 *
 * "Sentadilla búlgara" contenía "sentadilla", así que se marcaba SQ en rojo
 * como si fuese el movimiento de competición — y lo mismo pasaba con la
 * frontal, la hack o el press militar. Un accesorio no puede vestirse igual
 * que el levantamiento al que acompaña: la etiqueta deja de significar nada.
 *
 * Las variantes de competición SÍ siguen contando como el básico (pausada,
 * con cadenas, sin despegue...): son el mismo patrón a distinta dificultad.
 */
const NOT_THE_MAIN_LIFT = /bulgara|búlgara|frontal|hack|goblet|sissy|jaca|zercher|bulgaro|pistol|split|zancada|prensa|militar|inclinado|declinado|frances|francés|mancuerna|polea|maquina|máquina|banco|hombro|rumano|piernas rigidas|piernas rígidas|stiff|rdl|sumo alto|jefferson/;

/**
 * Clasifica el ejercicio por nombre y devuelve su tema de color.
 *
 * Solo los tres de competición reciben color propio. Todo lo demás es
 * accesorio, que es lo que pedía la app al dejar de ser exclusivamente de
 * powerlifting: el que entrena para otra cosa no tiene por qué hacer siempre
 * uno de los tres.
 */
function getLiftTheme(name: string) {
    const n = name.toLowerCase();
    const accessory = { key: 'ACC', accent: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', bar: 'bg-emerald-500', gradient: 'from-emerald-500/15 to-transparent' };

    if (NOT_THE_MAIN_LIFT.test(n)) return accessory;

    if (n.includes('sentadilla') || n.includes('squat')) {
        return { key: 'SQ', accent: 'text-red-400', border: 'border-red-500/40', bg: 'bg-[var(--danger-quiet)]', bar: 'bg-red-500', gradient: 'from-red-500/15 to-transparent' };
    }
    // "press" a secas ya no basta: arrastraba press militar, press francés y
    // cualquier press de máquina a la etiqueta de banca.
    if (n.includes('banca') || n.includes('bench')) {
        return { key: 'BP', accent: 'text-sky-400', border: 'border-sky-500/40', bg: 'bg-sky-500/10', bar: 'bg-sky-500', gradient: 'from-sky-500/15 to-transparent' };
    }
    if (n.includes('peso muerto') || n.includes('deadlift')) {
        return { key: 'DL', accent: 'text-purple-400', border: 'border-purple-500/40', bg: 'bg-purple-500/10', bar: 'bg-purple-500', gradient: 'from-purple-500/15 to-transparent' };
    }
    return accessory;
}

/** Resumen compacto de la prescripción de un ejercicio: "3×3 · 5×5". */
function summarizeSets(sets: TrainingSet[]): string {
    if (sets.length === 0) return 'Sin series';
    return sets.map(s => s.target_reps || '?').join(' · ');
}

/** Métricas agregadas del día para el panel derecho. */
function computeDayMetrics(exercises: ExtendedSessionExercise[]) {
    let totalSeries = 0;
    let tonnage = 0;
    let maxLoad = 0;
    const byLift: Record<string, number> = { SQ: 0, BP: 0, DL: 0, ACC: 0 };

    exercises.forEach(ex => {
        const theme = getLiftTheme(ex.exercise?.name || '');
        ex.sets.forEach(set => {
            const series = parseInt(getSeriesCount(set.target_reps)) || 1;
            const reps = parseInt(getRepsCount(set.target_reps)) || 0;
            totalSeries += series;
            byLift[theme.key] += series;
            if (set.target_load) {
                tonnage += series * reps * set.target_load;
                if (set.target_load > maxLoad) maxLoad = set.target_load;
            }
        });
    });

    return { totalSeries, tonnage: Math.round(tonnage), maxLoad, byLift };
}

// ==========================================
// SUB-COMPONENT: DAY EDITOR (Pantalla completa)
// ==========================================
/** Mini-gráfica de las últimas cargas top de un ejercicio. */
function Sparkline({ values, className = '' }: { values: number[]; className?: string }) {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 56, h = 16;
    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 3) - 1.5;
        return `${x},${y}`;
    }).join(' ');
    const rising = values[values.length - 1] >= values[0];
    return (
        <svg width={w} height={h} className={className} aria-hidden="true">
            <polyline
                points={points}
                fill="none"
                stroke={rising ? '#4ade80' : '#f87171'}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}

/**
 * Orden de las pestañas del editor en móvil.
 *
 * Vive fuera del componente porque el gesto de deslizar necesita saber cuál
 * es la siguiente y cuál la anterior, y ese orden es el mismo que el de la
 * barra: si se definieran en dos sitios, deslizar acabaría llevando a una
 * pestaña distinta de la que dice la barra.
 */
const MOBILE_TABS = [
    { key: 'lista' as const, label: 'Ejercicios' },
    { key: 'editar' as const, label: 'Editar' },
    { key: 'datos' as const, label: 'Resumen' },
];

interface DayEditorModalProps {
    session: ExtendedSession;
    allSessions: ExtendedSession[];
    libraryNames: string[];
    historyByExercise: Record<string, number[]>;
    /** Máximos del atleta, para resolver los porcentajes. */
    maxes: MaxesByExercise;
    onSetMax: (exerciseName: string, kg: number) => void;
    onOpenProgression: (exerciseName: string) => void;
    templates: DayTemplate[];
    onSaveTemplate: (name: string) => void;
    onApplyTemplate: (tpl: DayTemplate) => void;
    onDeleteTemplate: (id: string) => void;
    onCopyExercise: (source: ExtendedSessionExercise) => void;
    onReorder: (orderedIds: string[]) => void;
    onClose: () => void;
    onUpdateName: (id: string, name: string) => void;
    /** Guarda el calentamiento o los extras del día (texto libre). */
    onUpdateAppendix: (sessionId: string, field: 'warmup' | 'extras', value: string) => void;
    onAddExercise: (sessionId: string, name: string) => void;
    onUpdateExercise: (id: string, updates: Partial<SessionExercise> & { exercise?: Partial<ExerciseLibrary> }) => void;
    onRemoveExercise: (id: string, sessionId: string) => void;
    onAddSet: (sessionExerciseId: string) => void;
    onDuplicateSet: (setId: string) => void;
    onUpdateSet: (setId: string, field: keyof TrainingSet, value: TrainingSet[keyof TrainingSet]) => void;
    onRemoveSet: (setId: string) => void;
    onOpenVbtChart: (url: string, name: string) => void;
    hasUnsavedChanges: boolean;
    onSave: () => void;
    isSaving: boolean;
}

function DayEditorModal({
    session, allSessions, libraryNames, historyByExercise, maxes, onSetMax, onOpenProgression, templates,
    onSaveTemplate, onApplyTemplate, onDeleteTemplate, onCopyExercise, onReorder,
    onClose, onUpdateName, onUpdateAppendix, onAddExercise, onUpdateExercise,
    onRemoveExercise, onAddSet, onDuplicateSet, onUpdateSet, onRemoveSet, onOpenVbtChart,
    hasUnsavedChanges, onSave, isSaving
}: DayEditorModalProps) {
    const [isAddingEx, setIsAddingEx] = useState(false);
    const [selectedExId, setSelectedExId] = useState<string | null>(session.exercises[0]?.id ?? null);
    // Menús del header: null | 'templates' | 'copy' | 'preview'
    const [openMenu, setOpenMenu] = useState<'templates' | 'copy' | 'preview' | null>(null);
    const [templateName, setTemplateName] = useState('');
    // Popover copiar: sesión origen elegida
    const [copySourceId, setCopySourceId] = useState<string | null>(null);
    // Pestaña visible en móvil. En escritorio no se usa: los tres paneles
    // caben en fila y no hay nada que ocultar.
    const [mobileTab, setMobileTab] = useState<'lista' | 'editar' | 'datos'>('lista');
    const tabIndex = MOBILE_TABS.findIndex(t => t.key === mobileTab);

    /**
     * Carrusel de las tres pestañas en móvil.
     *
     * Los paneles ya no se ocultan con `hidden`: los tres están montados en una
     * cinta de 300% de ancho que se desplaza. Ocultándolos no había nada que
     * animar —el panel entrante no existía hasta el instante del cambio— y el
     * salto entre "Ejercicios" y "Editar" era seco.
     *
     * El desplazamiento se calcula en PÍXELES a partir del ancho real medido, y
     * no en porcentajes, porque el arrastre de framer trabaja en píxeles:
     * mezclando las dos unidades el panel pega un tirón al soltar el dedo.
     */
    const trackRef = useRef<HTMLDivElement>(null);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [isDesktop, setIsDesktop] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    );

    useEffect(() => {
        const query = window.matchMedia('(min-width: 1024px)');
        const sync = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
        query.addEventListener('change', sync);
        return () => query.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        const node = trackRef.current;
        if (!node) return;
        const observer = new ResizeObserver(([entry]) => {
            setViewportWidth(entry.contentRect.width);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    /** Salta a la pestaña de al lado. Se para en los extremos, no da la vuelta. */
    const goToTab = useCallback((delta: number) => {
        setMobileTab(prev => {
            const current = MOBILE_TABS.findIndex(t => t.key === prev);
            const next = Math.min(MOBILE_TABS.length - 1, Math.max(0, current + delta));
            return MOBILE_TABS[next].key;
        });
    }, []);

    /**
     * Anchura del panel de datos, a gusto del entrenador.
     *
     * Arranca en 380px en vez de los 288 fijos que tenía: con el desglose por
     * músculo y las tarjetas de volumen, 288px obligaba a leer las cifras en
     * columnas de dos dígitos con el nombre del músculo cortado.
     *
     * El techo son 720px. Por encima, el editor del ejercicio —que es donde de
     * verdad se trabaja— se queda sin sitio, y un panel de consulta no puede
     * comerse la pantalla de la tarea principal.
     */
    const panel = usePanelWidth('anvil:ancho-panel-datos', {
        initial: 380,
        min: 260,
        max: 720,
        side: 'right',
    });

    /**
     * Elegir ejercicio. En móvil, además, salta a editarlo.
     *
     * Sin esto habría que pulsar el ejercicio y DESPUÉS la pestaña "Editar",
     * y la primera pulsación no parecería haber hecho nada.
     */
    const pickExercise = (id: string) => {
        setSelectedExId(id);
        setMobileTab('editar');
    };

    // Mantener una selección válida cuando cambia la lista
    useEffect(() => {
        if (!session.exercises.some(e => e.id === selectedExId)) {
            setSelectedExId(session.exercises[session.exercises.length - 1]?.id ?? null);
        }
    }, [session.exercises, selectedExId]);

    const selectedEx = session.exercises.find(e => e.id === selectedExId) || null;
    const metrics = useMemo(() => computeDayMetrics(session.exercises), [session.exercises]);

    // Entrada del motor de volumen. Depende de allSessions para poder
    // ofrecer los ámbitos Semana y Bloque sin volver a consultar la BD.
    const volumeSessions = useMemo(
        () => allSessions.map(s => toVolumeInput(s, s.exercises)),
        [allSessions]
    );

    // Cerrar con Escape (solo si no se está escribiendo un ejercicio)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isAddingEx) onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, isAddingEx]);

    // Bloquear scroll del fondo. Con contador compartido: encima de este
    // editor se abren confirmaciones que también bloquean, y cada uno
    // restaurando el estilo por su cuenta dejaba la página congelada.
    useEffect(() => lockBodyScroll(), []);

    return (
        <div className="fixed inset-0 z-[150] bg-surface-canvas flex flex-col animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 px-4 md:px-8 py-4 border-b border-subtle bg-surface-canvas shrink-0">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-11 h-11 bg-anvil-red/10 border border-anvil-red/30 rounded-xl flex flex-col items-center justify-center shrink-0">
                        <span className="text-[8px] text-anvil-red font-black uppercase leading-none">Día</span>
                        <span className="text-lg font-black text-anvil-red leading-none">{session.day_number}</span>
                    </div>
                    <input
                        className="bg-transparent font-black text-xl md:text-2xl text-white outline-none w-full placeholder-gray-600 uppercase tracking-tight border-b-2 border-transparent focus:border-anvil-red/50 transition-colors min-w-0"
                        value={session.name ?? ''}
                        onChange={(e) => onUpdateName(session.id, e.target.value)}
                        placeholder={`DÍA ${session.day_number}`}
                    />
                </div>

                <div className="flex items-center gap-2 shrink-0 relative">
                    {/* Copiar ejercicio de otro día */}
                    <div className="relative">
                        <button
                            onClick={() => { setOpenMenu(openMenu === 'copy' ? null : 'copy'); setCopySourceId(null); }}
                            className={`hidden md:flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-black uppercase transition-colors border ${openMenu === 'copy' ? 'bg-anvil-red/10 border-anvil-red/40 text-anvil-red' : 'bg-white/5 border-[var(--border-default)] text-ink-muted hover:text-white'}`}
                            title="Copiar ejercicio de otro día"
                        >
                            <CopyPlus size={14} /> Copiar de otro día
                        </button>
                        {openMenu === 'copy' && (
                            <div className="absolute right-0 top-full mt-2 z-40 bg-surface-raised border border-[var(--border-default)] rounded-xl shadow-2xl p-3 w-72 max-h-80 overflow-y-auto">
                                {!copySourceId ? (
                                    <>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-ink-subtle mb-2">Elige el día origen</p>
                                        <div className="space-y-1">
                                            {allSessions.filter(s => s.id !== session.id && s.exercises.length > 0).map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setCopySourceId(s.id)}
                                                    className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-sm font-bold text-ink-muted hover:bg-white/5 hover:text-white transition-colors"
                                                >
                                                    <span className="truncate">S{s.week_number} · {s.name || `Día ${s.day_number}`}</span>
                                                    <ChevronDown size={13} className="-rotate-90 text-ink-subtle shrink-0" />
                                                </button>
                                            ))}
                                            {allSessions.filter(s => s.id !== session.id && s.exercises.length > 0).length === 0 && (
                                                <p className="text-xs text-ink-subtle italic px-2 py-1">No hay otros días con ejercicios.</p>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => setCopySourceId(null)} className="text-[10px] font-black uppercase text-ink-subtle hover:text-white mb-2 transition-colors">← Otro día</button>
                                        <div className="space-y-1">
                                            {allSessions.find(s => s.id === copySourceId)?.exercises.map(ex => (
                                                <button
                                                    key={ex.id}
                                                    onClick={() => { onCopyExercise(ex); setOpenMenu(null); }}
                                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-anvil-red hover:text-white text-ink-muted transition-colors"
                                                >
                                                    <span className="text-sm font-bold block truncate">{ex.exercise?.name}</span>
                                                    <span className="text-[10px] font-mono opacity-60">{summarizeSets(ex.sets)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Plantillas */}
                    <div className="relative">
                        <button
                            onClick={() => setOpenMenu(openMenu === 'templates' ? null : 'templates')}
                            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-black uppercase transition-colors border ${openMenu === 'templates' ? 'bg-anvil-red/10 border-anvil-red/40 text-anvil-red' : 'bg-white/5 border-[var(--border-default)] text-ink-muted hover:text-white'}`}
                            title="Plantillas de día"
                        >
                            <LayoutTemplate size={14} /> <span className="hidden md:inline">Plantillas</span>
                        </button>
                        {openMenu === 'templates' && (
                            <div className="absolute right-0 top-full mt-2 z-40 bg-surface-raised border border-[var(--border-default)] rounded-xl shadow-2xl p-3 w-72">
                                {session.exercises.length > 0 && (
                                    <div className="mb-3 pb-3 border-b border-subtle">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-ink-subtle mb-2">Guardar este día como plantilla</p>
                                        <div className="flex gap-2">
                                            <input
                                                value={templateName}
                                                onChange={(e) => setTemplateName(e.target.value)}
                                                placeholder='Ej: "Día pesado SQ"'
                                                maxLength={80}
                                                className="flex-1 bg-black/40 border border-[var(--border-default)] rounded-lg py-2 px-3 text-white text-xs focus:outline-none focus:border-anvil-red/50 min-w-0"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && templateName.trim()) {
                                                        onSaveTemplate(templateName.trim());
                                                        setTemplateName('');
                                                        setOpenMenu(null);
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => {
                                                    if (!templateName.trim()) return;
                                                    onSaveTemplate(templateName.trim());
                                                    setTemplateName('');
                                                    setOpenMenu(null);
                                                }}
                                                disabled={!templateName.trim()}
                                                className="px-3 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-[10px] font-black uppercase transition-colors disabled:opacity-40 shrink-0"
                                            >
                                                <Save size={12} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <p className="text-[10px] font-black uppercase tracking-wider text-ink-subtle mb-2">Aplicar plantilla</p>
                                <div className="space-y-1 max-h-52 overflow-y-auto">
                                    {templates.length === 0 && (
                                        <p className="text-xs text-ink-subtle italic px-2 py-1">Sin plantillas todavía.</p>
                                    )}
                                    {templates.map(tpl => (
                                        <div key={tpl.id} className="flex items-center gap-1 group/tpl">
                                            <button
                                                onClick={() => { onApplyTemplate(tpl); setOpenMenu(null); }}
                                                className="flex-1 text-left px-3 py-2 rounded-lg hover:bg-anvil-red hover:text-white text-ink-muted transition-colors min-w-0"
                                            >
                                                <span className="text-sm font-bold block truncate">{tpl.name}</span>
                                                <span className="text-[10px] opacity-60">{tpl.payload.length} ejercicios</span>
                                            </button>
                                            <button
                                                onClick={() => onDeleteTemplate(tpl.id)}
                                                className="p-1.5 text-ink-faint hover:text-danger opacity-0 group-hover/tpl:opacity-100 transition-opacity shrink-0"
                                                title="Eliminar plantilla"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Vista atleta */}
                    <button
                        onClick={() => setOpenMenu(openMenu === 'preview' ? null : 'preview')}
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-black uppercase transition-colors border ${openMenu === 'preview' ? 'bg-anvil-red/10 border-anvil-red/40 text-anvil-red' : 'bg-white/5 border-[var(--border-default)] text-ink-muted hover:text-white'}`}
                        title="Ver como lo verá el atleta"
                    >
                        <Eye size={14} /> <span className="hidden md:inline">Vista atleta</span>
                    </button>

                    {hasUnsavedChanges && (
                        <button
                            onClick={onSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors"
                        >
                            {isSaving ? <Loader className="animate-spin" size={14} /> : <Save size={14} />}
                            Guardar
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-ink-muted hover:text-white transition-colors"
                        aria-label="Cerrar editor"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Vista atleta (modo espejo) */}
            <AnimatePresence>
                {openMenu === 'preview' && (
                    <AthletePreview session={session} onClose={() => setOpenMenu(null)} />
                )}
            </AnimatePresence>

            {/* ============ DÍA VACÍO: arranque rápido ============ */}
            {session.exercises.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(220,38,38,0.12),transparent_60%)] pointer-events-none" />
                    <div className="relative z-10 w-full max-w-md text-center">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-anvil-red/20 to-transparent border border-anvil-red/30 flex items-center justify-center">
                            <Dumbbell size={36} className="text-anvil-red" />
                        </div>
                        <h3 className="text-2xl font-black uppercase italic text-white mb-2">Diseña el día</h3>
                        <p className="text-sm text-ink-subtle mb-8">Empieza con un básico o busca cualquier ejercicio de la biblioteca.</p>

                        {/* Arranque en un toque */}
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            {[
                                { name: 'Sentadilla', short: 'SQ' },
                                { name: 'Press Banca', short: 'BP' },
                                { name: 'Peso Muerto', short: 'DL' },
                            ].map(lift => {
                                const theme = getLiftTheme(lift.name);
                                return (
                                    <button
                                        key={lift.short}
                                        onClick={() => onAddExercise(session.id, lift.name)}
                                        className={`group p-4 rounded-card border ${theme.border} ${theme.bg} hover:scale-105 transition-all text-center`}
                                    >
                                        <span className={`block text-2xl font-black italic ${theme.accent}`}>{lift.short}</span>
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-muted mt-1">{lift.name}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="bg-surface-raised border border-[var(--border-default)] rounded-card p-4 shadow-xl text-left">
                            <ExerciseAutocomplete
                                libraryNames={libraryNames}
                                onSelect={(name) => onAddExercise(session.id, name)}
                                onCancel={() => { /* siempre visible en día vacío */ }}
                            />
                        </div>

                        {/* Un día puede ser SOLO movilidad o solo trabajo
                            complementario. Sin esto había que inventarse un
                            ejercicio para poder escribirlo en alguna parte. */}
                        <div className="mt-4 space-y-2 text-left">
                            <AppendixEditor
                                label="Calentamiento"
                                icon={FlameIcon}
                                placeholder={'Movilidad de cadera 5\'\nBarra 20kg x10, 60x5, 80x3...'}
                                value={session.warmup}
                                onCommit={(v) => onUpdateAppendix(session.id, 'warmup', v)}
                            />
                            <AppendixEditor
                                label="Extras"
                                icon={Sparkles}
                                placeholder={'Core 3x15\nBici suave 10\'\nEstiramiento de psoas'}
                                value={session.extras}
                                onCommit={(v) => onUpdateAppendix(session.id, 'extras', v)}
                            />
                        </div>
                    </div>
                </div>
            ) : (
                /* ============ 3 PANELES: lista | detalle | métricas ============
                   En escritorio van en fila. En MÓVIL van por pestañas y no
                   apilados: apilados, los tres compartían la altura de la
                   pantalla —la lista se comía 256px fijos y el resumen no tenía
                   tope— y al editor, que es donde se trabaja, le quedaba una
                   rendija. Tres zonas de scroll anidadas en un contenedor de
                   altura fija es justo lo que se veía superpuesto.            */
                <>
                <div className="flex lg:hidden shrink-0 border-b border-subtle bg-surface-canvas px-2" role="tablist" aria-label="Secciones del día">
                    {MOBILE_TABS.map(t => (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={mobileTab === t.key}
                            onClick={() => setMobileTab(t.key)}
                            className={`relative flex-1 py-3 text-t-xs font-semibold transition-colors duration-fast ease-snap ${mobileTab === t.key ? 'text-ink' : 'text-ink-subtle'}`}
                        >
                            {t.label}
                            {t.key === 'lista' && session.exercises.length > 0 && (
                                <span className="ml-1.5 text-ink-faint">{session.exercises.length}</span>
                            )}
                            {mobileTab === t.key && (
                                <motion.span
                                    layoutId="dayeditor-tab"
                                    className="absolute inset-x-3 bottom-0 h-0.5 bg-brand"
                                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* Ventana del carrusel. `overflow-hidden` solo en móvil: en
                    escritorio los paneles vuelven a ser una fila normal y
                    recortar aquí cortaría los desplegables de la cabecera. */}
                <div ref={trackRef} className="flex-1 min-h-0 overflow-hidden lg:overflow-visible">
                <motion.div
                    className="flex h-full w-[300%] lg:w-full"
                    drag={isDesktop ? false : 'x'}
                    // Bloquear la dirección al primer movimiento es lo que
                    // permite que los paneles sigan haciendo scroll vertical:
                    // sin esto, cualquier intento de bajar por la lista de
                    // ejercicios arrastraba la cinta de lado.
                    dragDirectionLock
                    dragElastic={0.06}
                    dragMomentum={false}
                    dragConstraints={{
                        left: -(MOBILE_TABS.length - 1) * viewportWidth,
                        right: 0,
                    }}
                    onDragEnd={(_, info) => {
                        // Se decide con el desplazamiento O con la velocidad:
                        // un gesto rápido y corto es un cambio de pestaña tan
                        // claro como uno lento y largo, y exigir solo distancia
                        // hace que los deslizamientos naturales no cuenten.
                        const far = Math.abs(info.offset.x) > viewportWidth * 0.22;
                        const fast = Math.abs(info.velocity.x) > 420;
                        if (far || fast) goToTab(info.offset.x < 0 ? 1 : -1);
                    }}
                    animate={{ x: isDesktop ? 0 : -tabIndex * viewportWidth }}
                    transition={{ type: 'spring', stiffness: 420, damping: 42, mass: 0.9 }}
                >

                    {/* IZQUIERDA: pila de ejercicios (arrastra para reordenar) */}
                    {/* `w-1/3` = un tercio de una cinta que mide 300%, o sea
                        exactamente el ancho de la pantalla. En `lg` la cinta
                        vuelve a medir 100% y mandan las anchuras de siempre. */}
                    <div className="flex w-1/3 shrink-0 flex-col gap-2 overflow-y-auto border-subtle bg-surface-canvas p-3 scrollbar-hide min-h-0 lg:w-80 lg:border-r xl:w-96">
                        {/* El calentamiento va ARRIBA y los extras ABAJO porque
                            ese es el orden real de la sesión: la columna se lee
                            de principio a fin como se entrena el día. */}
                        <AppendixEditor
                            label="Calentamiento"
                            icon={FlameIcon}
                            placeholder={'Movilidad de cadera 5\'\nBarra 20kg x10, 60x5, 80x3...'}
                            value={session.warmup}
                            onCommit={(v) => onUpdateAppendix(session.id, 'warmup', v)}
                        />

                        <Reorder.Group
                            axis="y"
                            values={session.exercises.map(e => e.id)}
                            onReorder={(ids: string[]) => onReorder(ids)}
                            className="flex flex-col gap-2"
                        >
                            {session.exercises.map((ex, i) => {
                                const theme = getLiftTheme(ex.exercise?.name || '');
                                const isSelected = ex.id === selectedExId;
                                const spark = historyByExercise[ex.exercise?.name || ''] || [];
                                return (
                                    <Reorder.Item
                                        key={ex.id}
                                        value={ex.id}
                                        as="div"
                                        whileDrag={{ scale: 1.03, boxShadow: '0 12px 24px rgba(0,0,0,0.5)', zIndex: 10 }}
                                        className={`relative shrink-0 w-full rounded-card border overflow-hidden cursor-grab active:cursor-grabbing ${
                                            isSelected
                                                ? `${theme.border} bg-gradient-to-r ${theme.gradient} shadow-lg`
                                                : 'border-subtle bg-surface-raised hover:border-[var(--border-strong)]'
                                        }`}
                                    >
                                        <button
                                            onClick={() => pickExercise(ex.id)}
                                            className="w-full text-left p-3.5 pl-8"
                                        >
                                            <span className={`absolute left-0 top-0 bottom-0 w-1 ${isSelected ? theme.bar : 'bg-transparent'}`} />
                                            <GripVertical size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${theme.bg} ${theme.accent}`}>{theme.key}</span>
                                                <span className="text-[9px] font-bold text-ink-subtle uppercase">#{i + 1}</span>
                                                {ex.vbt_file_url && <Activity size={10} className="text-green-400" />}
                                                <span className="ml-auto"><Sparkline values={spark} /></span>
                                            </div>
                                            <p className={`font-black uppercase text-sm leading-tight truncate ${isSelected ? 'text-white' : 'text-ink-muted'}`}>
                                                {ex.exercise?.name || 'Ejercicio'}
                                            </p>
                                            {ex.variant_name && (
                                                <p className={`text-[10px] font-bold truncate ${theme.accent}`}>{ex.variant_name}</p>
                                            )}
                                            <div className="flex items-center justify-between mt-1 gap-2">
                                                <p className="text-[10px] text-ink-subtle font-mono truncate">{summarizeSets(ex.sets)}</p>
                                                {spark.length >= 2 && (
                                                    <p className="text-[9px] font-bold text-ink-subtle shrink-0">últ. {spark[spark.length - 1]}kg</p>
                                                )}
                                            </div>
                                        </button>
                                    </Reorder.Item>
                                );
                            })}
                        </Reorder.Group>

                        {/* Añadir ejercicio */}
                        <div className="shrink-0 w-full">
                            {!isAddingEx ? (
                                <button
                                    onClick={() => setIsAddingEx(true)}
                                    className="w-full py-3.5 border-2 border-dashed border-[var(--border-default)] hover:border-anvil-red/50 hover:bg-anvil-red/5 rounded-card text-ink-subtle hover:text-anvil-red transition-all text-[11px] font-black tracking-widest uppercase flex items-center justify-center gap-2"
                                >
                                    <Plus size={14} /> Ejercicio
                                </button>
                            ) : (
                                <div className="bg-surface-raised border border-[var(--border-default)] rounded-card p-3 shadow-xl">
                                    <ExerciseAutocomplete
                                        libraryNames={libraryNames}
                                        onSelect={(name) => {
                                            onAddExercise(session.id, name);
                                            setIsAddingEx(false);
                                            // Se acaba de añadir para prescribirlo:
                                            // en móvil, ir directo a hacerlo.
                                            setMobileTab('editar');
                                        }}
                                        onCancel={() => setIsAddingEx(false)}
                                    />
                                </div>
                            )}
                        </div>

                        <AppendixEditor
                            label="Extras"
                            icon={Sparkles}
                            placeholder={'Core 3x15\nBici suave 10\'\nEstiramiento de psoas'}
                            value={session.extras}
                            onCommit={(v) => onUpdateAppendix(session.id, 'extras', v)}
                        />
                    </div>

                    {/* CENTRO: detalle del ejercicio seleccionado (pop-up animado) */}
                    <div className="w-1/3 shrink-0 overflow-y-auto p-4 min-h-0 md:p-6 lg:w-auto lg:flex-1 lg:shrink">
                        <AnimatePresence mode="wait">
                            {selectedEx ? (
                                <motion.div
                                    key={selectedEx.id}
                                    initial={{ opacity: 0, x: 24, scale: 0.98 }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    exit={{ opacity: 0, x: -12, scale: 0.98 }}
                                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                    className="max-w-xl mx-auto"
                                >
                                    <ExerciseCard
                                        sessionExercise={selectedEx}
                                        referenceMax={findMax(maxes, selectedEx.exercise?.name)?.one_rm ?? null}
                                        recentLoads={historyByExercise[selectedEx.exercise?.name || ''] || []}
                                        onSetMax={(kg) => onSetMax(selectedEx.exercise?.name || '', kg)}
                                        onOpenProgression={() => onOpenProgression(selectedEx.exercise?.name || '')}
                                        onUpdateExercise={onUpdateExercise}
                                        onAddSet={onAddSet}
                                        onDuplicateSet={onDuplicateSet}
                                        onUpdateSet={onUpdateSet}
                                        onRemoveSet={onRemoveSet}
                                        onRemoveExercise={() => onRemoveExercise(selectedEx.id, session.id)}
                                        onOpenVbtChart={onOpenVbtChart}
                                    />
                                </motion.div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-ink-subtle text-sm font-bold uppercase tracking-wider">
                                    Selecciona un ejercicio de la lista
                                </div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Tirador entre el editor y el panel de datos.
                        Solo existe en escritorio: en móvil los dos son
                        pestañas a pantalla completa y no hay nada que
                        repartir. */}
                    <ResizeHandle
                        width={panel.width}
                        dragging={panel.dragging}
                        onPointerDown={panel.onPointerDown}
                        onKeyDown={panel.onKeyDown}
                        onReset={panel.reset}
                        min={panel.min}
                        max={panel.max}
                        label="Ancho del panel de datos"
                    />

                    {/* DERECHA: resumen de métricas del día.
                        La anchura la decide el coach y se recuerda. Estaba fija
                        en 288px (`lg:w-72`), que con las tarjetas de volumen y
                        el desglose por músculo obligaba a leer las cifras en
                        columnas de dos dígitos. */}
                    <div
                        // La anchura viaja como VARIABLE CSS y se aplica solo a
                        // partir de `lg`. Con `style={{ width }}` a secas, el
                        // estilo en línea gana a cualquier clase y el panel
                        // saldría con 320px fijos también en móvil, donde tiene
                        // que ocupar la pantalla entera.
                        style={{ '--panel-w': `${panel.width}px` } as React.CSSProperties}
                        className="w-1/3 shrink-0 space-y-4 overflow-y-auto border-subtle bg-surface-canvas p-4 min-h-0 lg:w-[var(--panel-w)] lg:border-l"
                    >
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-ink-subtle flex items-center gap-2">
                            <BarChart3 size={13} className="text-anvil-red" /> Resumen del día
                        </p>

                        <div className="grid grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
                            <div className="bg-surface-raised border border-subtle rounded-xl p-3 text-center">
                                <Dumbbell size={14} className="mx-auto text-anvil-red mb-1" />
                                <p className="text-xl font-black text-white leading-none">{session.exercises.length}</p>
                                <p className="text-[9px] font-bold uppercase text-ink-subtle mt-1">Ejercicios</p>
                            </div>
                            <div className="bg-surface-raised border border-subtle rounded-xl p-3 text-center">
                                <Timer size={14} className="mx-auto text-sky-400 mb-1" />
                                <p className="text-xl font-black text-white leading-none">{metrics.totalSeries}</p>
                                <p className="text-[9px] font-bold uppercase text-ink-subtle mt-1">Series</p>
                            </div>
                            <div className="bg-surface-raised border border-subtle rounded-xl p-3 text-center">
                                <Flame size={14} className="mx-auto text-orange-400 mb-1" />
                                <p className="text-xl font-black text-white leading-none">
                                    {metrics.tonnage >= 1000 ? `${(metrics.tonnage / 1000).toFixed(1)}t` : `${metrics.tonnage}`}
                                </p>
                                <p className="text-[9px] font-bold uppercase text-ink-subtle mt-1">{metrics.tonnage >= 1000 ? 'Tonelaje' : 'Kg totales'}</p>
                            </div>
                        </div>

                        {/* Volumen por grupo muscular — se recalcula con cada
                            cambio del estado local, sin necesidad de guardar. */}
                        <div className="border-t border-subtle pt-4">
                            <VolumePanel
                                sessions={volumeSessions}
                                currentSessionId={session.id}
                                currentWeek={session.week_number}
                            />
                        </div>

                        {/* Distribución por levantamiento */}
                        {metrics.totalSeries > 0 && (
                            <div className="bg-surface-raised border border-subtle rounded-xl p-3.5 space-y-2.5">
                                <p className="text-[9px] font-black uppercase tracking-widest text-ink-subtle">Series por patrón</p>
                                {(['SQ', 'BP', 'DL', 'ACC'] as const).map(key => {
                                    const count = metrics.byLift[key];
                                    if (count === 0) return null;
                                    const pct = Math.round((count / metrics.totalSeries) * 100);
                                    const theme = key === 'SQ' ? getLiftTheme('sentadilla') : key === 'BP' ? getLiftTheme('banca') : key === 'DL' ? getLiftTheme('muerto') : getLiftTheme('acc');
                                    const label = key === 'ACC' ? 'Accesorios' : key;
                                    return (
                                        <div key={key}>
                                            <div className="flex justify-between text-[10px] font-bold mb-1">
                                                <span className={theme.accent}>{label}</span>
                                                <span className="text-ink-subtle">{count} series · {pct}%</span>
                                            </div>
                                            <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                                                <motion.div
                                                    className={`h-full ${theme.bar} rounded-full`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${pct}%` }}
                                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Carga máxima */}
                        {metrics.maxLoad > 0 && (
                            <div className="bg-gradient-to-br from-anvil-red/10 to-transparent border border-anvil-red/20 rounded-xl p-3.5 text-center">
                                <p className="text-[9px] font-black uppercase tracking-widest text-ink-subtle mb-1">Carga más pesada del día</p>
                                <p className="text-2xl font-black text-anvil-red italic">{metrics.maxLoad}<span className="text-sm text-ink-subtle not-italic"> kg</span></p>
                            </div>
                        )}

                        {/* Índice del día */}
                        <div className="space-y-1.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-ink-subtle">Sesión completa</p>
                            {session.exercises.map((ex, i) => {
                                const theme = getLiftTheme(ex.exercise?.name || '');
                                return (
                                    <button
                                        key={ex.id}
                                        onClick={() => pickExercise(ex.id)}
                                        className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${theme.bar} shrink-0`} />
                                        <span className="text-[11px] font-bold text-ink-muted truncate flex-1">{i + 1}. {ex.exercise?.name}</span>
                                        <span className="text-[10px] font-mono text-ink-subtle shrink-0">{summarizeSets(ex.sets).split(' · ')[0]}{ex.sets.length > 1 ? '…' : ''}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>
                </div>
                </>
            )}
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: ATHLETE PREVIEW (modo espejo)
// ==========================================
function AthletePreview({ session, onClose }: { session: ExtendedSession; onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 40, scale: 0.96 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 40, scale: 0.96 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-[380px] h-[80vh] bg-surface-canvas rounded-[2.5rem] border-4 border-[#2a2a2a] shadow-2xl overflow-hidden flex flex-col"
            >
                {/* Notch decorativo */}
                <div className="shrink-0 flex justify-center pt-2 pb-1 bg-surface-canvas">
                    <div className="w-24 h-1.5 bg-black rounded-full" />
                </div>

                <div className="shrink-0 px-5 py-3 bg-surface-canvas border-b border-subtle flex items-center justify-between">
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-anvil-red">Así lo verá el atleta</p>
                        <h3 className="font-black text-white uppercase text-lg leading-tight">{session.name || `Día ${session.day_number}`}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-ink-muted hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* El espejo tiene que enseñar TODO lo que ve el atleta,
                        apéndices incluidos: si el calentamiento no sale aquí,
                        el coach no puede comprobar cómo le queda. */}
                    <PreviewAppendix label="Calentamiento" body={session.warmup} />

                    {session.exercises.length === 0 && !session.warmup && !session.extras ? (
                        <p className="text-center text-ink-subtle text-sm py-16 font-bold">Día vacío</p>
                    ) : (
                        session.exercises.map(ex => (
                            <div key={ex.id} className="bg-surface-canvas rounded-card overflow-hidden border border-subtle">
                                <div className="p-4 bg-surface-raised">
                                    <h4 className="font-bold text-base leading-tight text-gray-100">{ex.exercise?.name}</h4>
                                    {ex.variant_name && <p className="text-xs text-anvil-red font-bold mt-0.5">{ex.variant_name}</p>}
                                    {(ex.rpe || ex.velocity_avg || ex.rest_seconds) && (
                                        <div className="flex gap-3 mt-2 text-[10px] font-bold text-ink-subtle uppercase">
                                            {ex.rpe && <span>RPE {ex.rpe}</span>}
                                            {ex.velocity_avg && <span>Vel {ex.velocity_avg}</span>}
                                            {ex.rest_seconds ? <span>Rest {ex.rest_seconds}s</span> : null}
                                        </div>
                                    )}
                                    {ex.notes && <p className="text-xs text-ink-muted mt-2 italic">"{ex.notes}"</p>}
                                </div>
                                <div className="p-3 space-y-1.5">
                                    {ex.sets.map((set, i) => (
                                        <div key={set.id} className="flex items-center justify-between bg-black/20 rounded-lg px-3 py-2 text-sm">
                                            <span className="text-[10px] font-black text-ink-subtle uppercase">Serie {i + 1}</span>
                                            <span className="font-bold text-white font-mono">
                                                {set.target_reps || '—'}{set.target_load ? ` @ ${set.target_load}kg` : ''}{set.target_rpe ? ` RPE ${set.target_rpe}` : ''}
                                            </span>
                                        </div>
                                    ))}
                                    {ex.sets.length === 0 && <p className="text-[11px] text-ink-subtle italic px-1">Sin series prescritas</p>}
                                </div>
                            </div>
                        ))
                    )}

                    <PreviewAppendix label="Extras" body={session.extras} />
                </div>
            </motion.div>
        </motion.div>
    );
}

/** Calentamiento o extras dentro del espejo de la vista del atleta. */
function PreviewAppendix({ label, body }: { label: string; body?: string | null }) {
    if (!body?.trim()) return null;

    return (
        <div className="overflow-hidden rounded-card border border-subtle bg-surface-canvas">
            <div className="border-l-2 border-anvil-red px-3.5 py-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-anvil-red">{label}</p>
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-ink-muted">
                    {body.trim()}
                </p>
            </div>
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: EXERCISE CARD
// ==========================================
interface ExerciseCardProps {
    /** 1RM del atleta para este ejercicio. null si no hay ninguno registrado. */
    referenceMax: number | null;
    /** Últimas cargas top registradas en este ejercicio. */
    recentLoads: number[];
    /** Guarda un 1RM nuevo para este ejercicio. */
    onSetMax: (kg: number) => void;
    /** Abre el editor de progresión de este ejercicio. */
    onOpenProgression: () => void;
    sessionExercise: ExtendedSessionExercise;
    onUpdateExercise: (id: string, updates: Partial<SessionExercise> & { exercise?: Partial<ExerciseLibrary> }) => void;
    onAddSet: (sessionExerciseId: string) => void;
    onDuplicateSet: (setId: string) => void;
    onUpdateSet: (setId: string, field: keyof TrainingSet, value: TrainingSet[keyof TrainingSet]) => void;
    onRemoveSet: (setId: string) => void;
    onRemoveExercise: () => void;
    onOpenVbtChart: (url: string, name: string) => void;
}

// Modificadores rápidos de variante: se combinan entre sí (ej: Tempo 3" · Gomas media)
const VARIANT_MODIFIERS = [
    { key: 'Tempo', prompt: 'segundos', suffix: '"' },
    { key: 'Pausa', prompt: 'segundos', suffix: '"' },
    { key: 'Gomas', prompt: 'resistencia (ligera/media/fuerte)', suffix: '' },
    { key: 'Cadenas', prompt: 'kg aprox', suffix: 'kg' },
    { key: 'Pin', prompt: 'altura', suffix: '' },
] as const;

function ExerciseCard({ sessionExercise, referenceMax, recentLoads, onSetMax, onOpenProgression, onUpdateExercise, onAddSet, onDuplicateSet, onUpdateSet, onRemoveSet, onRemoveExercise, onOpenVbtChart }: ExerciseCardProps) {
    const [pendingModifier, setPendingModifier] = useState<string | null>(null);
    const [modifierValue, setModifierValue] = useState('');
    const [editingMax, setEditingMax] = useState(false);

    /**
     * Guarda el 1RM escrito. Un valor vacío o absurdo cierra sin tocar nada:
     * borrar por accidente el máximo de un atleta se llevaría por delante
     * todos los porcentajes ya prescritos en el bloque.
     */
    const commitMax = (raw: string) => {
        setEditingMax(false);
        const kg = parseFloat(raw.replace(',', '.'));
        if (!Number.isFinite(kg) || kg <= 0 || kg >= 1000) return;
        if (kg === referenceMax) return;
        onSetMax(kg);
    };

    if (!sessionExercise) {
        console.error("ExerciseCard received null sessionExercise");
        return null;
    }

    const exerciseName = sessionExercise?.exercise?.name || "Ejercicio desconocido";
    const hasVideo = !!sessionExercise.exercise?.video_url;

    /**
     * Unidad en la que está pautado el ejercicio.
     *
     * La métrica se guarda por SERIE en la base, pero se elige por ejercicio.
     * Se lee de la primera serie y las filas antiguas, sin `target_metric`,
     * son kilos: es lo único que se podía prescribir antes de la migración.
     */
    const exerciseMetric: TargetMetric =
        sessionExercise.sets[0]?.target_metric ?? 'kg';

    /**
     * Cambiar la unidad afecta a todas las series del ejercicio.
     *
     * NO se arrastra el número de una unidad a otra: 170 kilos no son 170
     * repeticiones en recámara. Al cambiar, el valor se vacía y el coach lo
     * vuelve a escribir, que es preferible a dejar una cifra que parece
     * correcta y significa otra cosa.
     */
    const handleMetricChange = (metric: TargetMetric) => {
        if (metric === exerciseMetric) return;
        for (const set of sessionExercise.sets) {
            onUpdateSet(set.id, 'target_metric', metric);
            onUpdateSet(set.id, 'target_load', null);
            onUpdateSet(set.id, 'target_rpe', null);
        }
    };

    const applyModifier = async (modKey: string, value: string) => {
        const mod = VARIANT_MODIFIERS.find(m => m.key === modKey);
        if (!mod) return;
        const piece = value.trim() ? `${mod.key} ${value.trim()}${mod.suffix}` : mod.key;
        const current = sessionExercise.variant_name?.trim();
        const next = current ? `${current} · ${piece}` : piece;
        onUpdateExercise(sessionExercise.id, { variant_name: next });
        setPendingModifier(null);
        setModifierValue('');
        await trainingService.updateSessionExercise(sessionExercise.id, { variant_name: next });
    };

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
        <div className="bg-surface-raised rounded-card border border-subtle p-4 group relative hover:border-[var(--border-default)] transition-all shadow-sm">
            {/* Delete Exercise Button (Absolute Top Right) */}
            <button
                onClick={onRemoveExercise}
                className="absolute top-3 right-3 text-ink-faint hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity p-1"
            >
                <Trash2 size={14} />
            </button>

            {/* Exercise Header - Centered */}
            <div className="flex flex-col items-center mb-4 text-center">
                {/* Contexto del atleta en este ejercicio: su máximo y las
                    últimas cargas top. Va aquí, pegado al nombre, porque es lo
                    que se consulta JUSTO antes de decidir los kilos — tenerlo
                    en otra pantalla obligaba a salir del editor y volver.
                    Es una línea de texto, no un panel: informa sin robar sitio
                    a la prescripción, que es la tarea. */}
                <div className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-t-2xs text-ink-subtle">
                    {editingMax ? (
                        <input
                            type="number"
                            autoFocus
                            defaultValue={referenceMax ?? ''}
                            placeholder="1RM en kg"
                            onBlur={(e) => { commitMax(e.target.value); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitMax((e.target as HTMLInputElement).value);
                                if (e.key === 'Escape') setEditingMax(false);
                            }}
                            className="w-24 rounded-field border border-brand bg-surface-sunken px-2 py-1 text-center text-t-xs tabular-nums text-ink outline-none"
                        />
                    ) : (
                        <button
                            onClick={() => setEditingMax(true)}
                            className="rounded-chip px-1.5 py-0.5 transition-colors duration-fast ease-snap hover:bg-surface-overlay hover:text-ink"
                            title="El 1RM permite prescribir por porcentaje"
                        >
                            {referenceMax ? (
                                <>1RM <span className="font-semibold tabular-nums text-ink">{referenceMax} kg</span></>
                            ) : (
                                'Fijar 1RM'
                            )}
                        </button>
                    )}

                    {recentLoads.length > 0 && (
                        <span>
                            Reciente{' '}
                            <span className="tabular-nums text-ink-muted">
                                {recentLoads.slice(-3).join(' · ')} kg
                            </span>
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 mb-3">
                    <h4 className="font-black text-gray-200 text-base leading-tight uppercase tracking-tight">{exerciseName}</h4>
                    {hasVideo && <Video size={14} className="text-blue-500" />}
                    {sessionExercise.vbt_file_url && (
                        <button 
                            onClick={() => onOpenVbtChart(sessionExercise.vbt_file_url!, exerciseName)}
                            className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 hover:bg-green-500/20 transition-colors"
                            title="Ver Gráfica VBT"
                        >
                            <Activity size={12} />
                            VBT
                        </button>
                    )}
                </div>

                {/* Global Fields Container */}
                <div className="w-full space-y-3">
                    {/* Variante: campo libre + modificadores combinables */}
                    <div className="w-full space-y-2">
                        <input
                            type="text"
                            value={sessionExercise.variant_name || ''}
                            onChange={(e) => handleVariantChange(e.target.value)}
                            onBlur={handleVariantBlur}
                            placeholder="Variante (ej: Tempo 3&quot; · Gomas media)"
                            className="w-full bg-black/20 text-xs text-center text-anvil-red border border-subtle focus:border-anvil-red rounded-lg py-1.5 px-3 outline-none placeholder-gray-600 transition-colors font-bold"
                        />
                        {pendingModifier ? (
                            <div className="flex items-center gap-2 justify-center">
                                <span className="text-[10px] font-black uppercase text-ink-subtle">{pendingModifier}:</span>
                                <input
                                    autoFocus
                                    type="text"
                                    value={modifierValue}
                                    onChange={(e) => setModifierValue(e.target.value)}
                                    placeholder={VARIANT_MODIFIERS.find(m => m.key === pendingModifier)?.prompt}
                                    className="w-32 bg-black/40 text-xs text-center text-white border border-anvil-red/40 rounded-lg py-1 px-2 outline-none placeholder-gray-600"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') applyModifier(pendingModifier, modifierValue);
                                        if (e.key === 'Escape') { setPendingModifier(null); setModifierValue(''); }
                                    }}
                                />
                                <button
                                    onClick={() => applyModifier(pendingModifier, modifierValue)}
                                    className="text-[10px] font-black uppercase text-anvil-red hover:text-white transition-colors"
                                >
                                    OK
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-wrap justify-center gap-1">
                                {VARIANT_MODIFIERS.map(mod => (
                                    <button
                                        key={mod.key}
                                        onClick={() => setPendingModifier(mod.key)}
                                        className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-white/5 text-ink-subtle hover:bg-anvil-red/10 hover:text-anvil-red border border-transparent hover:border-anvil-red/30 transition-all"
                                    >
                                        + {mod.key}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Stats Grid */}
                    {/* Solo el descanso.
                        Vel AVG y RPE vivían aquí como campos sueltos del
                        ejercicio entero, lo que obligaba a pautar el mismo RPE
                        para todas las series y dejaba tres cajas idénticas
                        compitiendo por el ancho en móvil. Ahora RPE, RIR y
                        velocidad son opciones de la columna de carga, serie a
                        serie. El descanso sí es del ejercicio: se descansa
                        igual entre todas sus series. */}
                    <div className="flex justify-center">
                        <div className="w-28">
                            <div className="mb-1 text-center text-t-2xs uppercase tracking-wide text-ink-subtle">Descanso (s)</div>
                            <input
                                type="text"
                                inputMode="numeric"
                                defaultValue={sessionExercise.rest_seconds || ''}
                                key={sessionExercise.id + '_rest'}
                                onChange={(e) => handleGlobalUpdate('rest_seconds', parseInt(e.target.value) || 0)}
                                onBlur={(e) => handleGlobalBlur('rest_seconds', parseInt(e.target.value) || 0)}
                                placeholder="-"
                                className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken py-1.5 text-center text-t-sm tabular-nums text-ink outline-none transition-colors duration-fast ease-snap placeholder:text-ink-faint focus:border-brand"
                            />
                        </div>
                    </div>

                    {/* Notes Input */}
                    <textarea
                        value={sessionExercise.notes || ''}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        onBlur={handleNotesBlur}
                        placeholder="Notas técnicas..."
                        className="w-full bg-black/20 text-xs text-ink-muted text-center border border-subtle rounded-lg p-2 focus:border-anvil-red focus:text-gray-200 outline-none resize-none h-[40px] leading-tight transition-colors"
                    />
                </div>
            </div>

            {/* Sets Table */}
            <div className="space-y-1 bg-black/20 p-2 rounded-xl border border-subtle">
                {/* Header Row */}
                <div className="mb-2 grid grid-cols-[1fr_1fr_1.3fr_40px] items-center gap-2 px-1 text-center text-t-2xs uppercase tracking-wide text-ink-subtle">
                    <span>Series</span>
                    <span>Reps</span>
                    {/* La unidad de la columna la elige el coach. El selector
                        vive en la CABECERA y no en cada fila porque un
                        ejercicio se pauta entero en la misma unidad; repetirlo
                        por serie serían cinco desplegables idénticos. */}
                    <select
                        value={exerciseMetric}
                        onChange={(e) => handleMetricChange(e.target.value as TargetMetric)}
                        aria-label="Unidad de la prescripción"
                        title={TARGET_METRICS.find(m => m.key === exerciseMetric)?.hint}
                        className="w-full cursor-pointer rounded-chip border border-transparent bg-transparent py-0.5 text-center text-t-2xs uppercase tracking-wide text-ink-muted outline-none transition-colors duration-fast ease-snap hover:border-[var(--border-default)] hover:text-ink focus:border-brand"
                    >
                        {TARGET_METRICS.map(m => (
                            <option key={m.key} value={m.key} className="bg-surface-overlay text-ink">
                                {m.label}{m.unit && ` (${m.unit})`}
                            </option>
                        ))}
                    </select>
                    <span></span>
                </div>

                {sessionExercise.sets.map((set: TrainingSet) => {
                    const seriesVal = getSeriesCount(set.target_reps);
                    const repsVal = getRepsCount(set.target_reps);

                    return (
                        <div key={set.id} className="grid grid-cols-[1fr_1fr_1.3fr_40px] gap-2 items-center group/row">
                            <CompactInput
                                value={seriesVal}
                                onChange={(v) => onUpdateSet(set.id, 'target_reps', formatTargetReps(v as string, repsVal))}
                                placeholder="-"
                            />
                            <CompactInput
                                value={repsVal}
                                onChange={(v) => onUpdateSet(set.id, 'target_reps', formatTargetReps(seriesVal, v as string))}
                                placeholder="-"
                            />
                            {/* El RPE se guarda en su columna de texto porque es
                                la única métrica que se pauta en rango ("7-8"),
                                y un NUMERIC no lo admite. El resto van al
                                número de `target_load`. Ver set_target_metric.sql. */}
                            {exerciseMetric === 'rpe' ? (
                                <CompactInput
                                    value={set.target_rpe}
                                    onChange={(v) => onUpdateSet(set.id, 'target_rpe', v as string)}
                                    placeholder="@8"
                                />
                            ) : exerciseMetric === 'kg' ? (
                                <LoadInput
                                    value={set.target_load}
                                    onChange={(kg) => onUpdateSet(set.id, 'target_load', kg)}
                                    referenceMax={referenceMax}
                                    placeholder={referenceMax ? '170 u 85%' : '-'}
                                />
                            ) : (
                                // RIR, velocidad y pérdida no admiten porcentaje:
                                // un "85%" ahí no significaría nada.
                                <CompactInput
                                    value={set.target_load}
                                    onChange={(v) => onUpdateSet(set.id, 'target_load', v as number)}
                                    placeholder={exerciseMetric === 'vel' ? '0.45' : '-'}
                                    type="number"
                                />
                            )}

                            {/* Actions */}
                            <div className="flex justify-end items-center gap-0.5">
                                {set.vbt_file_url && (
                                    <button
                                        onClick={() => onOpenVbtChart(set.vbt_file_url!, `${exerciseName} · Serie`)}
                                        className="text-green-400 hover:text-green-300 p-0.5"
                                        title="Ver VBT de esta serie"
                                    >
                                        <Activity size={11} />
                                    </button>
                                )}
                                <span className="flex gap-0.5 opacity-100 md:opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button onClick={() => onDuplicateSet(set.id)} className="text-ink-faint hover:text-blue-400 p-0.5" title="Duplicar serie"><Copy size={11} /></button>
                                    <button onClick={() => onRemoveSet(set.id)} className="text-ink-faint hover:text-danger p-0.5" title="Eliminar serie"><Trash2 size={12} /></button>
                                </span>
                            </div>
                        </div>
                    );
                })}

                <div className="mt-2 flex gap-2">
                    <button
                        onClick={() => onAddSet(sessionExercise.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-field bg-white/5 py-2 text-t-xs font-medium text-ink-subtle transition-colors duration-fast ease-snap hover:bg-white/10 hover:text-ink active:scale-95"
                    >
                        <Plus size={12} aria-hidden="true" /> Añadir serie
                    </button>
                    {/* Escribe la prescripción de este ejercicio en TODAS las
                        semanas de golpe. Vive junto a "añadir serie" porque es
                        la alternativa a hacerlo a mano, no una función aparte. */}
                    <button
                        onClick={onOpenProgression}
                        title="Definir cómo progresa este ejercicio a lo largo del bloque"
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-field bg-brand-quiet py-2 text-t-xs font-medium text-brand transition-colors duration-fast ease-snap hover:bg-brand hover:text-brand-ink active:scale-95"
                    >
                        <TrendingUp size={12} aria-hidden="true" /> Progresión
                    </button>
                </div>
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
            className="w-full bg-surface-overlay border border-transparent hover:border-[var(--border-default)] focus:border-blue-500 rounded px-1 py-1 text-xs text-center text-white outline-none transition-colors placeholder:text-ink-subtle"
            placeholder={placeholder}
        />
    )
}

// ==========================================
// SUB-COMPONENT: CAMPO DE CARGA CON PORCENTAJE
// ==========================================
/**
 * Casilla de kilos que además acepta porcentajes del 1RM.
 *
 * Escribir "85%" con un máximo de 200 escribe 170 kg, redondeado al múltiplo
 * de 2,5 más cercano porque es el salto mínimo que se puede montar con discos.
 * Ver src/lib/planning/loadMath.ts.
 *
 * POR QUÉ NO ES UN `type="number"`
 * Un input numérico rechaza el carácter '%' antes de que llegue al manejador,
 * así que no habría forma de escribir el porcentaje. Es de texto y valida al
 * confirmar.
 *
 * La conversión ocurre al salir del campo o al pulsar Enter, NO en cada
 * pulsación: convirtiendo al vuelo, teclear "85%" pasaría por "8%" y dejaría
 * escritos 16 kg antes de llegar al segundo dígito.
 */
function LoadInput({
    value,
    onChange,
    referenceMax,
    placeholder,
}: {
    value?: number | null;
    onChange: (kg: number | null) => void;
    referenceMax: number | null;
    placeholder?: string;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const [warn, setWarn] = useState(false);

    // Con el campo en reposo manda el valor real; mientras se escribe, el
    // borrador. Así un cambio de fuera (copiar una semana) se ve reflejado.
    const shown = draft ?? (value ?? '').toString();
    const percent = draft === null ? percentOfMax(value, referenceMax) : null;

    const commit = () => {
        if (draft === null) return;
        const parsed = parseLoadInput(draft, referenceMax);

        if (parsed.needsMax) {
            // No se escribe 0: un cero se lee como "sin carga" y el coach
            // creería que lo ha pautado.
            setWarn(true);
            setDraft(null);
            return;
        }

        setWarn(false);
        onChange(parsed.kg);
        setDraft(null);
    };

    return (
        /* El porcentaje va en su PROPIA LÍNEA reservada, no en posición
           absoluta.

           Antes colgaba a `-bottom-3.5` —14px por debajo del campo— mientras
           que las filas de series se separan solo 4px (`space-y-1`), así que
           el "%" caía justo encima del campo de la fila siguiente. Se veía
           como texto pisado y recortado, y en la última fila desbordaba la
           tarjeta.

           La línea se reserva SIEMPRE (`h-4`), aunque esté vacía: si
           apareciera y desapareciera al escribir, la fila daría un salto de
           16px con cada tecla. */
        <div className="flex flex-col">
            <input
                type="text"
                inputMode="decimal"
                value={shown}
                onChange={(e) => { setDraft(e.target.value); setWarn(false); }}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(); }
                    if (e.key === 'Escape') { setDraft(null); setWarn(false); }
                }}
                placeholder={placeholder}
                title={referenceMax ? `1RM ${referenceMax} kg — puedes escribir "85%"` : 'Sin 1RM registrado para este ejercicio'}
                className={`w-full rounded-field border bg-surface-overlay px-1 py-1 text-center text-t-sm font-semibold tabular-nums text-ink outline-none transition-colors duration-fast placeholder:font-normal placeholder:text-ink-subtle ${
                    warn ? 'border-warning' : 'border-transparent hover:border-[var(--border-default)] focus:border-brand'
                }`}
            />

            {/* La intensidad, para leerla sin calcular. `text-ink-subtle` y no
                `text-ink-faint`: el segundo da 2,6:1 de contraste y el sistema
                lo reserva para iconos decorativos — nunca para texto. */}
            <span
                aria-hidden={percent === null && !warn}
                className={`h-4 text-center text-t-2xs leading-4 tabular-nums ${
                    warn ? 'text-warning' : 'text-ink-subtle'
                }`}
            >
                {warn ? 'sin 1RM' : percent !== null ? `${percent}%` : ''}
            </span>
        </div>
    );
}

// End of file
