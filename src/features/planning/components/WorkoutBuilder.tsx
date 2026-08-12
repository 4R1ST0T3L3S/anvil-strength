
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    SessionExercise, TrainingSet, ExerciseLibrary, countsForVolume, DayTemplate, DayTemplateExercise,
} from '../../../types/training';
import type { WeekMeta, Weekday } from '../../../types/training';
import { trainingService } from '../../../services/trainingService';
import { supabase } from '../../../lib/supabase';
import {
    Loader, Plus, Save, Calendar, CalendarPlus, FileText, BarChart3, Eye, EyeOff,
    LayoutTemplate, ChevronDown, Send, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../../context/AuthContext';
import { type ParsedWarmupExercise } from '../../../lib/planning/warmupParser';
import { toast } from 'sonner';
import {
    getWeekNumber, getDateRangeFromWeek, formatDateRange,
    getWeekReleaseDate, isWeekReleased, formatShortDate,
} from '../../../utils/dateUtils';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';
import { VbtChartModal } from '../../coach/components/VbtChartModal';
import { BlockOverviewPanel } from './BlockOverviewPanel';
import { ProgressionModal } from './ProgressionModal';
import { resolveStep, type ProgressionStep } from '../../../lib/planning/progression';
import { analyzeBlock, exerciseKey } from '../../../lib/planning/blockAnalytics';
import { maxesService, findMax, type MaxesByExercise } from '../../../services/maxesService';
import { toVolumeInput } from '../../../lib/volume/engine';
import { downloadWeekPdf, sessionToPrintDay } from '../../../lib/export/weekPdf';
import { useCoachPdfTheme } from '../../../hooks/useCoachPdfTheme';
import { Button } from '../../../components/ui/Button';
import { transition, DURATION } from '../../../lib/motion';

import { DayCard } from './builder/DayCard';
import { IconAction, WeekMenu } from './builder/WeekMenu';
import { DayEditorModal } from './builder/DayEditorModal';
import type { ExtendedSession, ExtendedSessionExercise, FullBlockData, ExerciseCardUpdates } from './builder/types';
import {
    sortSessions, savableSet, rawSaveError, explainSaveError, explainWeekError, mapSets, mapExercise,
} from './builder/helpers';

interface WorkoutBuilderProps {
    athleteId: string;
    blockId?: string | null;
    /** Solo para la cabecera de la hoja exportada a PDF. */
    athleteName?: string | null;
}

// ==========================================
// COMPONENT: WORKOUT BUILDER
// ==========================================
// ==========================================
// COMPONENT: WORKOUT BUILDER
// ==========================================
export function WorkoutBuilder({ athleteId, blockId, athleteName }: WorkoutBuilderProps) {
    const athleteDisplayName = athleteName?.trim() || 'Atleta';
    const [loading, setLoading] = useState(true);
    const [blockData, setBlockData] = useState<FullBlockData | null>(null);

    // Aspecto del PDF: la marca del entrenador dueño del bloque.
    const pdfTheme = useCoachPdfTheme(blockData?.coach_id);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    /**
     * Foto de cada serie tal y como está EN EL SERVIDOR, serializada.
     *
     * Es lo que permite mandar al guardar solo lo que ha cambiado. Va en una
     * `ref` y no en el estado porque nadie la pinta: cambiarla no debe
     * provocar un render, y `handleSaveChanges` necesita leer el valor de
     * AHORA justo después de un `await`.
     */
    const savedSnapshot = useRef<Map<string, string>>(new Map());
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
            // Sin esto, guardar como plantilla un día con calentamiento
            // estructurado y volver a aplicarla convertía la movilidad en
            // trabajo principal: exactamente la contaminación de métricas que
            // `section` existe para evitar.
            section: ex.section ?? 'main',
            round_count: ex.round_count ?? null,
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

    /**
     * Convierte el calentamiento en texto de un día a ejercicios de verdad.
     *
     * Nunca se dispara solo: llega de un botón que ha enseñado antes la
     * propuesta. Y NO borra el texto original — el entrenador compara las dos
     * versiones en la vista previa y lo quita cuando le convence, que es la
     * única parte irreversible de todo esto.
     */
    const convertWarmup = async (sessionId: string, items: ParsedWarmupExercise[]) => {
        if (!coachId) return;
        const session = blockData?.sessions.find(s => s.id === sessionId);
        if (!session) return;

        try {
            await trainingService.createWarmupExercises(
                sessionId,
                coachId,
                items.map(i => ({
                    name: i.name,
                    notes: i.notes,
                    groupTag: i.groupTag,
                    rounds: i.rounds,
                    sets: i.sets,
                })),
                session.exercises.length
            );
            await loadData();
            toast.success(
                `${items.length} ejercicios de calentamiento creados. El texto sigue ahí: bórralo cuando lo hayas repasado.`
            );
        } catch (e) {
            console.error(e);
            toast.error(e instanceof Error ? e.message : 'No se pudo convertir el calentamiento');
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

            // Punto de partida de "qué ha cambiado". Lo que acaba de llegar
            // del servidor es, por definición, lo que hay guardado.
            savedSnapshot.current = new Map(
                formattedSessions.flatMap(session =>
                    session.exercises.flatMap(ex =>
                        ex.sets.map(set => [set.id, JSON.stringify(savableSet(ex.id, set))] as const)
                    )
                )
            );

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
        // Fuera del try: el manejador de errores lo necesita para distinguir un
        // guardado grande de uno de una sola serie, que son fallos distintos.
        let enviadas = 0;
        try {
            // Se envían SOLO las columnas que el coach edita. Mandar el objeto
            // entero arrastraba campos que la fila local trae de más (o de
            // menos, en las creadas en cliente) y bastaba uno para que
            // PostgREST rechazara el lote completo con PGRST204 y no se
            // guardara ni una serie.
            const allSets = blockData.sessions.flatMap(session =>
                session.exercises.flatMap(ex => ex.sets.map(set => savableSet(ex.id, set)))
            );

            /**
             * SOLO LAS SERIES QUE HAN CAMBIADO.
             *
             * Esto mandaba el bloque ENTERO en cada guardado: ocho semanas
             * por cuatro días por seis ejercicios por cuatro series son casi
             * 800 filas, y la política RLS de `training_sets` recorre
             * session_exercises → training_sessions → training_blocks POR
             * CADA UNA. El servidor abortaba la sentencia a medias con
             * "canceling statement due to statement timeout" — no es la
             * conexión del coach, es Postgres cortando por tiempo.
             *
             * Retocar una serie manda ahora una fila, no ochocientas.
             */
            const changed = allSets.filter(set => {
                const previous = savedSnapshot.current.get(set.id);
                return !previous || previous !== JSON.stringify(set);
            });

            enviadas = changed.length;

            if (changed.length === 0) {
                setHasUnsavedChanges(false);
                toast.success('No hay cambios que guardar');
                return;
            }

            /**
             * Y en lotes, porque un cambio grande sigue siendo grande:
             * aplicar una progresión o pegar una semana toca cientos de
             * series de golpe y volvería a plantarse en el mismo timeout.
             *
             * 100 filas es el tamaño en el que el coste por lote sigue
             * cómodamente por debajo del límite y el número de viajes no se
             * dispara. Los lotes van EN SERIE a propósito: en paralelo se
             * pisan bloqueando las mismas filas y Postgres los serializa
             * igual, pero con contención de por medio.
             */
            const BATCH = 100;
            for (let i = 0; i < changed.length; i += BATCH) {
                const { error } = await supabase
                    .from('training_sets')
                    .upsert(changed.slice(i, i + BATCH), { onConflict: 'id' });

                if (error) throw error;
            }

            // La foto de "lo que hay guardado" se actualiza al terminar, no
            // al empezar: si el guardado falla a mitad, el siguiente intento
            // tiene que volver a mandar lo que no llegó a subir.
            savedSnapshot.current = new Map(allSets.map(s => [s.id, JSON.stringify(s)]));

            toast.success(
                changed.length === allSets.length
                    ? 'Progreso guardado'
                    : `Guardadas ${changed.length} ${changed.length === 1 ? 'serie' : 'series'}`
            );
            setHasUnsavedChanges(false);
        } catch (err) {
            console.error('Error guardando series:', err);
            // El mensaje real de PostgREST importa: distingue "falta la
            // columna target_metric" (migración pendiente) de un rechazo de
            // RLS. Sin él, el fallo era indepurable desde la interfaz.
            const raw = rawSaveError(err);
            toast.error(`Error al guardar cambios: ${explainSaveError(raw, enviadas)}`, { duration: 10000 });
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
                // Una progresión describe el TRABAJO, no la escalera de
                // aproximación. "Sentadilla" puede aparecer con el mismo
                // nombre en el calentamiento —1x5 al 40%, 1x3 al 60%— y en el
                // trabajo principal del mismo día; sin este filtro, aplicar
                // una progresión a "Sentadilla" sobrescribía también las
                // series de calentamiento con la prescripción del bloque.
                if (!countsForVolume(ex.section)) continue;

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
            toast.error(`Error añadiendo semana: ${explainWeekError(rawSaveError(err))}`, { duration: 10000 });
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
            toast.error(`Error copiando semana: ${explainWeekError(rawSaveError(err))}`, { duration: 10000 });
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
                    toast.error(`Error copiando la semana: ${explainWeekError(rawSaveError(err))}`, { duration: 10000 });
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

    const updateSessionExercise = (sessionExerciseId: string, updates: ExerciseCardUpdates) => {
        setBlockData(prev => {
            if (!prev) return null;
            return {
                ...prev,
                sessions: mapExercise(prev.sessions, sessionExerciseId, ex => {
                    // La ficha de la biblioteca se separa del resto: es lo
                    // único que llega en trozos, y esparcirla junto a las demás
                    // claves metía un `Partial<ExerciseLibrary>` donde hace
                    // falta la ficha entera.
                    const { exercise: exercisePatch, ...rest } = updates;
                    const newEx: ExtendedSessionExercise = { ...ex, ...rest };
                    if (exercisePatch && ex.exercise) {
                        newEx.exercise = { ...ex.exercise, ...exercisePatch };
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
                theme: pdfTheme,
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
                                            <div className="flex items-center gap-2 min-w-0" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    value={weekNameInput}
                                                    onChange={(e) => setWeekNameInput(e.target.value)}
                                                    className="flex-1 min-w-0 rounded-field border border-[var(--border-default)] bg-surface-sunken px-2.5 py-1.5 text-t-base text-ink transition-colors duration-fast ease-snap placeholder:text-ink-faint focus:border-brand focus:outline-none"
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
                        athleteId={athleteId}
                        coachId={coachId}
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
                        onConvertWarmup={convertWarmup}
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
