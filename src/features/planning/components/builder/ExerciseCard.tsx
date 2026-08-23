import { useState, useEffect, useRef } from 'react';
import {
    SessionExercise, TrainingSet, TARGET_METRICS, SET_TYPES, GROUP_TAGS, EXERCISE_SECTIONS,
} from '../../../../types/training';
import type { TargetMetric, ExerciseSection } from '../../../../types/training';
import { trainingService } from '../../../../services/trainingService';
import { Plus, Trash2, Video, Copy, Activity, X, BarChart3, TrendingUp, Check, Target } from 'lucide-react';
import { toast } from 'sonner';
import { MuscleMappingEditor } from '../MuscleMappingEditor';
import { SetVbtModal } from '../../../vbt/components/SetVbtModal';
import { parseLoadInput, percentOfMax } from '../../../../lib/planning/loadMath';
import { cn } from '../../../../lib/utils';
import type { ExtendedSessionExercise, ExerciseCardUpdates } from './types';
import { getSeriesCount, getRepsCount, formatTargetReps } from './helpers';

// ==========================================
// SUB-COMPONENT: EXERCISE CARD
// ==========================================
interface ExerciseCardProps {
    /** Atleta al que pertenece el bloque. Lo necesita el registro de VBT. */
    athleteId: string;
    /** Quién está editando. Va a `created_by` de las mediciones. */
    coachId: string | null;
    /** 1RM del atleta para este ejercicio. null si no hay ninguno registrado. */
    referenceMax: number | null;
    /** Últimas cargas top registradas en este ejercicio. */
    recentLoads: number[];
    /** Guarda un 1RM nuevo para este ejercicio. */
    onSetMax: (kg: number) => void;
    /** Abre el editor de progresión de este ejercicio. */
    onOpenProgression: () => void;
    sessionExercise: ExtendedSessionExercise;
    onUpdateExercise: (id: string, updates: ExerciseCardUpdates) => void;
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

export function ExerciseCard({ sessionExercise, athleteId, coachId, referenceMax, recentLoads, onSetMax, onOpenProgression, onUpdateExercise, onAddSet, onDuplicateSet, onUpdateSet, onRemoveSet, onRemoveExercise, onOpenVbtChart }: ExerciseCardProps) {
    const [pendingModifier, setPendingModifier] = useState<string | null>(null);
    const [modifierValue, setModifierValue] = useState('');
    const [editingMax, setEditingMax] = useState(false);
    const [musclesOpen, setMusclesOpen] = useState(false);
    /** Serie cuya ficha de velocidad está abierta. */
    const [vbtSet, setVbtSet] = useState<{ set: TrainingSet; number: number } | null>(null);
    /** Campo del enlace de vídeo de la ficha del ejercicio, plegado. */
    const [editingVideo, setEditingVideo] = useState(false);

    /**
     * ¿Está encadenado con otro ejercicio?
     *
     * La etiqueta vive en las SERIES —basta con que una la lleve—, igual que
     * en la pantalla del atleta. Es lo que decide si tiene sentido preguntar
     * por las rondas: un circuito de un solo ejercicio no es un circuito.
     */
    const isChained = sessionExercise.sets.some(s => s.group_tag);

    /** Cambia la parte del día a la que pertenece el ejercicio. */
    const commitSection = async (section: ExerciseSection) => {
        if (section === (sessionExercise.section ?? 'main')) return;

        // Optimista: el panel de volumen recalcula con el estado local, y el
        // efecto de marcar algo como calentamiento —que desaparezca del
        // reparto muscular— es justo lo que el coach está mirando al pulsarlo.
        onUpdateExercise(sessionExercise.id, { section });

        try {
            await trainingService.updateSessionExercise(sessionExercise.id, { section });
        } catch (err) {
            console.error(err);
            onUpdateExercise(sessionExercise.id, { section: sessionExercise.section ?? 'main' });
            toast.error(err instanceof Error ? err.message : 'No se pudo cambiar la sección');
        }
    };

    /** Rondas del circuito. Vacío = no es un circuito con vueltas contadas. */
    const commitRounds = async (raw: string) => {
        const n = raw.trim() === '' ? null : Number.parseInt(raw, 10);
        const rounds = n !== null && Number.isFinite(n) && n >= 1 && n <= 20 ? n : null;
        if (rounds === (sessionExercise.round_count ?? null)) return;

        onUpdateExercise(sessionExercise.id, { round_count: rounds });

        try {
            await trainingService.updateSessionExercise(sessionExercise.id, { round_count: rounds });
        } catch (err) {
            console.error(err);
            onUpdateExercise(sessionExercise.id, { round_count: sessionExercise.round_count ?? null });
            toast.error(err instanceof Error ? err.message : 'No se pudieron guardar las rondas');
        }
    };

    /**
     * Guarda el enlace de vídeo en la BIBLIOTECA.
     *
     * Escribe en `exercise_library`, no en la prescripción: es la ficha del
     * movimiento y la comparten todos los atletas que lo tengan pautado. Si
     * no ha cambiado, no se escribe — abrir el campo y cerrarlo sin tocar nada
     * no tiene por qué generar una escritura.
     */
    const commitVideoUrl = async (raw: string) => {
        const url = raw.trim() || null;
        setEditingVideo(false);

        if (url === (sessionExercise.exercise?.video_url ?? null)) return;

        try {
            await trainingService.setExerciseVideoUrl(sessionExercise.exercise_id, url);
            // Al vuelo en el estado local: recargar la semana entera para dos
            // caracteres de una URL dejaría el editor en blanco un instante.
            // `updateSessionExercise` ya sabe fusionar un `exercise` parcial.
            onUpdateExercise(sessionExercise.id, { exercise: { video_url: url } });
            toast.success(url ? 'Enlace de vídeo guardado' : 'Enlace de vídeo quitado');
        } catch (err) {
            console.error(err);
            toast.error('No se pudo guardar el enlace de vídeo');
        }
    };

    // Hay anulación cuando `primary_muscles` es un array, aunque esté vacío:
    // "ninguno" es una respuesta, y distinguirla de "no opino" es justo lo que
    // permite decir que una movilidad no aporta volumen.
    const hasMuscleOverride = Array.isArray(sessionExercise.primary_muscles);

    const saveMuscles = async (primary: string[] | null, secondary: string[] | null) => {
        // Optimista: el panel de volumen recalcula con el estado local, y
        // esperar al servidor dejaría la barra quieta un segundo justo cuando
        // el coach está mirando el efecto de su cambio.
        onUpdateExercise(sessionExercise.id, {
            primary_muscles: primary,
            secondary_muscles: secondary,
        });
        try {
            await trainingService.setExerciseMuscles(sessionExercise.id, primary, secondary);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar el reparto de volumen');
        }
    };

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
                            className="w-24 rounded-field border border-brand bg-surface-sunken px-2 py-1 text-center text-t-xs tabular-nums text-ink"
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

                {/* `min-w-0 flex-1 truncate` en el nombre y `shrink-0` en el
                    resto: con la etiqueta de sección nueva, esta fila reúne
                    hasta cuatro elementos (nombre, vídeo, VBT, sección), y sin
                    esto un nombre largo ("Peso muerto rumano con mancuernas")
                    empujaba a la etiqueta de sección fuera de la tarjeta en un
                    móvil de 320px en vez de que fuera el nombre el que cediera. */}
                <div className="flex items-center gap-2 mb-3">
                    <h4 className="min-w-0 flex-1 truncate font-black text-gray-200 text-base leading-tight uppercase tracking-tight">{exerciseName}</h4>

                    {/* ENLACE DE VÍDEO DE LA FICHA DEL EJERCICIO.
                        Era un icono azul y nada más: la columna existía, el
                        icono la delataba, y no había ninguna pantalla donde
                        escribirla. Ahora el icono ES el botón. */}
                    <button
                        type="button"
                        onClick={() => setEditingVideo(v => !v)}
                        aria-expanded={editingVideo}
                        title={hasVideo ? 'Cambiar el enlace de vídeo' : 'Añadir un enlace de vídeo'}
                        className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-field transition-colors duration-fast',
                            hasVideo
                                ? 'text-info hover:bg-[var(--info-quiet)]'
                                : 'text-ink-faint hover:bg-surface-overlay hover:text-ink-muted'
                        )}
                    >
                        <Video size={14} />
                    </button>
                    {sessionExercise.vbt_file_url && (
                        <button
                            onClick={() => onOpenVbtChart(sessionExercise.vbt_file_url!, exerciseName)}
                            className="shrink-0 bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 hover:bg-green-500/20 transition-colors"
                            title="Ver Gráfica VBT"
                        >
                            <Activity size={12} />
                            VBT
                        </button>
                    )}

                    {/* PARTE DEL DÍA.
                        Marcar un ejercicio como calentamiento es lo que hace
                        que NO cuente para el tonelaje ni para el reparto
                        muscular. Antes, meter una movilidad aquí ensuciaba
                        todas las métricas del bloque, y por eso el
                        calentamiento se había sacado a un campo de texto.

                        Va en la cabecera y no escondido en un desplegable
                        porque cambia lo que el ejercicio SIGNIFICA, y eso
                        tiene que verse de un vistazo al repasar el día. */}
                    <select
                        value={sessionExercise.section ?? 'main'}
                        onChange={(e) => commitSection(e.target.value as ExerciseSection)}
                        aria-label="Parte del día"
                        title={EXERCISE_SECTIONS.find(x => x.key === (sessionExercise.section ?? 'main'))?.hint}
                        className={cn(
                            'ml-auto shrink-0 cursor-pointer rounded-chip border px-1.5 py-0.5 text-t-2xs font-bold uppercase tracking-wide transition-colors duration-fast',
                            (sessionExercise.section ?? 'main') === 'warmup'
                                ? 'border-[var(--brand-line)] bg-brand-quiet text-brand'
                                : 'border-transparent bg-transparent text-ink-faint hover:border-[var(--border-default)] hover:text-ink'
                        )}
                    >
                        {EXERCISE_SECTIONS.map(x => (
                            <option key={x.key} value={x.key}>{x.label}</option>
                        ))}
                    </select>
                </div>

                {/* RONDAS DEL CIRCUITO.
                    Solo cuando el ejercicio es calentamiento Y está encadenado
                    con otro: las rondas son una propiedad del circuito, y sin
                    circuito el campo no significaría nada. Se pregunta en el
                    primero del grupo y vale para todos, que es como se escribe
                    "Circuito A · 3 rondas" en una hoja de papel. */}
                {(sessionExercise.section ?? 'main') === 'warmup' && isChained && (
                    <label className="mb-3 flex items-center gap-2 text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">
                        Rondas del circuito
                        <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={20}
                            value={sessionExercise.round_count ?? ''}
                            onChange={(e) => commitRounds(e.target.value)}
                            placeholder="3"
                            className="h-9 w-16 rounded-field border border-[var(--border-default)] bg-surface-sunken px-2 text-center text-t-sm tabular-nums text-ink placeholder:text-ink-faint focus:border-[var(--brand-line)]"
                        />
                    </label>
                )}

                {/* Campo del enlace, plegado.
                    Se guarda al salir del campo y no en cada tecla: escribir
                    una URL de YouTube son 40 pulsaciones y serían 40
                    escrituras contra la biblioteca. Afecta al EJERCICIO, o sea
                    a todos los atletas que lo tengan, y por eso lo dice. */}
                {editingVideo && (
                    <div className="mb-3 w-full">
                        <input
                            type="url"
                            inputMode="url"
                            autoFocus
                            defaultValue={sessionExercise.exercise?.video_url ?? ''}
                            onBlur={(e) => commitVideoUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                if (e.key === 'Escape') setEditingVideo(false);
                            }}
                            placeholder="https://youtube.com/watch?v=..."
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm text-ink placeholder:text-ink-faint focus:border-[var(--brand-line)]"
                        />
                        <p className="mt-1 text-t-2xs text-ink-faint">
                            Vídeo de técnica del ejercicio. Lo verán todos tus atletas que lo tengan pautado.
                        </p>
                    </div>
                )}

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
                            className="w-full bg-black/20 text-xs text-center text-anvil-red border border-subtle focus:border-anvil-red rounded-lg py-1.5 px-3 placeholder-gray-600 transition-colors font-bold"
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
                                    className="w-32 bg-black/40 text-xs text-center text-white border border-anvil-red/40 rounded-lg py-1 px-2 placeholder-gray-600"
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

                    {/* Descanso y reparto de volumen.
                        Vel AVG y RPE vivían aquí como campos sueltos del
                        ejercicio entero, lo que obligaba a pautar el mismo RPE
                        para todas las series y dejaba tres cajas idénticas
                        compitiendo por el ancho en móvil. Ahora RPE, RIR y
                        velocidad son opciones de la columna de carga, serie a
                        serie. El descanso sí es del ejercicio: se descansa
                        igual entre todas sus series. */}
                    <div className="flex flex-wrap items-end justify-center gap-2">
                        <div className="w-28">
                            <div className="mb-1 text-center text-t-2xs uppercase tracking-wide text-ink-subtle">Descanso</div>
                            <RestInput
                                seconds={sessionExercise.rest_seconds ?? null}
                                onChange={(value) => handleGlobalUpdate('rest_seconds', value)}
                                onCommit={(value) => handleGlobalBlur('rest_seconds', value)}
                            />
                        </div>

                        {/* A qué músculos cuenta este ejercicio.
                            Aquí y no en la biblioteca porque la decisión es de
                            ESTE bloque: el mismo remo puede programarse
                            buscando dorsal o buscando espalda alta, y el
                            volumen que sale es distinto. La etiqueta dice si
                            hay anulación puesta, para que se vea sin abrir. */}
                        <div className="w-28">
                            <div className="mb-1 text-center text-t-2xs uppercase tracking-wide text-ink-subtle">Volumen</div>
                            <button
                                onClick={() => setMusclesOpen(true)}
                                title="Elegir a qué músculos cuenta este ejercicio como volumen directo e indirecto"
                                className={cn(
                                    'flex h-[34px] w-full items-center justify-center gap-1.5 rounded-field border text-t-2xs font-semibold transition-colors duration-fast ease-snap',
                                    hasMuscleOverride
                                        ? 'border-[var(--brand-line)] bg-[var(--brand-quiet)] text-brand'
                                        : 'border-[var(--border-default)] bg-surface-sunken text-ink-subtle hover:text-ink'
                                )}
                            >
                                <Target size={12} aria-hidden="true" />
                                {hasMuscleOverride ? 'Ajustado' : 'Auto'}
                            </button>
                        </div>
                    </div>

                    {musclesOpen && (
                        <MuscleMappingEditor
                            exerciseName={exerciseName}
                            primary={sessionExercise.primary_muscles}
                            secondary={sessionExercise.secondary_muscles}
                            onClose={() => setMusclesOpen(false)}
                            onSave={saveMuscles}
                        />
                    )}

                    {/* Notes Input */}
                    <textarea
                        value={sessionExercise.notes || ''}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        onBlur={handleNotesBlur}
                        placeholder="Notas técnicas..."
                        className="w-full bg-black/20 text-xs text-ink-muted text-center border border-subtle rounded-lg p-2 focus:border-anvil-red focus:text-gray-200 resize-none h-[40px] leading-tight transition-colors"
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
                        className="w-full cursor-pointer rounded-chip border border-transparent bg-transparent py-0.5 text-center text-t-2xs uppercase tracking-wide text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-default)] hover:text-ink focus:border-brand"
                    >
                        {TARGET_METRICS.map(m => (
                            <option key={m.key} value={m.key} className="bg-surface-overlay text-ink">
                                {m.label}{m.unit && ` (${m.unit})`}
                            </option>
                        ))}
                    </select>
                    <span></span>
                </div>

                {sessionExercise.sets.map((set: TrainingSet, setIndex: number) => {
                    const seriesVal = getSeriesCount(set.target_reps);
                    const repsVal = getRepsCount(set.target_reps);

                    return (
                        <div key={set.id} className="group/row">
                            <div className="grid grid-cols-[1fr_1fr_1.3fr_40px] gap-2 items-center">
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
                                {/* VELOCIDAD DE ESTA SERIE.
                                    El icono se queda encendido cuando ya hay
                                    datos, así que de un vistazo se ve qué
                                    series están medidas y cuáles no — que es
                                    la pregunta al construir un perfil de
                                    cargas, donde faltan puntos casi siempre. */}
                                <button
                                    onClick={() => setVbtSet({ set, number: setIndex + 1 })}
                                    title={set.vbt_mean_velocity != null
                                        ? `Velocidad registrada: ${set.vbt_mean_velocity} m/s`
                                        : 'Añadir datos de velocidad (VBT) a esta serie'}
                                    className={`p-0.5 transition-colors ${set.vbt_mean_velocity != null
 ? 'text-green-400 hover:text-green-300'
 : 'text-ink-faint opacity-100 hover:text-brand md:opacity-0 group-hover/row:opacity-100'
 }`}
                                >
                                    <Activity size={11} />
                                </button>
                                {set.vbt_file_url && (
                                    <button
                                        onClick={() => onOpenVbtChart(set.vbt_file_url!, `${exerciseName} · Serie ${setIndex + 1}`)}
                                        className="p-0.5 text-green-400 hover:text-green-300"
                                        title="Ver la gráfica del archivo de esta serie"
                                    >
                                        <BarChart3 size={11} />
                                    </button>
                                )}
                                <span className="flex gap-0.5 opacity-100 md:opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button onClick={() => onDuplicateSet(set.id)} className="text-ink-faint hover:text-blue-400 p-0.5" title="Duplicar serie"><Copy size={11} /></button>
                                    <button onClick={() => onRemoveSet(set.id)} className="text-ink-faint hover:text-danger p-0.5" title="Eliminar serie"><Trash2 size={12} /></button>
                                </span>
                            </div>
                            </div>

                            {/* Técnica de intensidad de esta serie. Plegada
                                mientras no haya ninguna: la lleva una serie de
                                cada veinte y desplegarla siempre metería cinco
                                filas de ruido en cada ejercicio. */}
                            <SetTechniqueEditor set={set} onUpdateSet={onUpdateSet} />
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

            {/* LO QUE EL ATLETA HIZO DE VERDAD.
                Va debajo de la prescripción y claramente separado: es
                información, no un campo. El coach estaba programando a ciegas
                —la única forma de saber si la semana pasada se completó era
                salir del planificador— y esa consulta es justo la que se hace
                ANTES de escribir los kilos de la siguiente. */}
            <ExecutedSummary sets={sessionExercise.sets} />

            {vbtSet && (
                <SetVbtModal
                    open
                    onClose={() => setVbtSet(null)}
                    athleteId={athleteId}
                    createdBy={coachId}
                    exerciseName={exerciseName}
                    exerciseId={sessionExercise.exercise_id}
                    sessionExerciseId={sessionExercise.id}
                    set={vbtSet.set}
                    setNumber={vbtSet.number}
                    onSaved={(metrics, source, fileUrl) => {
                        // Se refleja en el estado local para que el icono de la
                        // fila cambie sin recargar el bloque entero.
                        onUpdateSet(vbtSet.set.id, 'vbt_mean_velocity', metrics.meanVelocity ?? null);
                        onUpdateSet(vbtSet.set.id, 'vbt_peak_velocity', metrics.peakVelocity ?? null);
                        onUpdateSet(vbtSet.set.id, 'vbt_velocity_loss', metrics.velocityLoss ?? null);
                        onUpdateSet(vbtSet.set.id, 'vbt_est_1rm', metrics.est1RM ?? null);
                        onUpdateSet(vbtSet.set.id, 'vbt_source', source);
                        if (fileUrl) onUpdateSet(vbtSet.set.id, 'vbt_file_url', fileUrl);
                    }}
                />
            )}
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: LO EJECUTADO
// ==========================================
/**
 * Resumen de lo que el atleta registró en este ejercicio.
 *
 * QUÉ ENSEÑA Y POR QUÉ ASÍ
 *
 * Una línea por serie hecha, con las repeticiones, los kilos y el RPE REALES.
 * No toca la prescripción ni la sugiere cambiar: si el coach pautó RPE 8 y el
 * atleta hizo 7-9-9, lo pautado sigue siendo 8 —el plan no se reescribe solo—
 * y el 7-9-9 aparece aquí, que es donde se decide la semana que viene.
 *
 * Las desviaciones se marcan en color solo cuando son relevantes: media
 * unidad de RPE arriba o abajo es ruido de medición, dos unidades es una
 * sesión que no ha ido como se pensaba.
 *
 * No aparece nada si no hay nada registrado. Un bloque recién programado no
 * debe llenarse de huecos vacíos que hay que aprender a ignorar.
 */
function ExecutedSummary({ sets }: { sets: TrainingSet[] }) {
    const done = sets.filter(
        s => s.is_completed || s.actual_reps != null || s.actual_load != null
    );

    if (done.length === 0) return null;

    return (
        <div className="mt-3 rounded-card border border-[var(--success-line,var(--border-subtle))] bg-[var(--success-quiet)] px-3 py-2">
            <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-success">
                <Check size={10} aria-hidden="true" />
                Registrado · {done.length} {done.length === 1 ? 'serie' : 'series'}
            </p>

            <ul className="space-y-0.5">
                {done.map((set, i) => {
                    const targetRpe = parseFloat((set.target_rpe ?? '').replace(',', '.'));
                    const rpeGap =
                        set.actual_rpe != null && Number.isFinite(targetRpe)
                            ? set.actual_rpe - targetRpe
                            : null;

                    return (
                        <li key={set.id} className="flex items-baseline gap-2 text-t-2xs tabular-nums">
                            <span className="w-3 shrink-0 text-ink-faint">{i + 1}</span>
                            <span className="text-ink">
                                {set.actual_reps ?? '—'}
                                <span className="text-ink-subtle"> reps</span>
                                {set.actual_load != null && (
                                    <>
                                        {' × '}
                                        <span className="font-semibold">{set.actual_load}</span>
                                        <span className="text-ink-subtle"> kg</span>
                                    </>
                                )}
                            </span>
                            {set.actual_rpe != null && (
                                <span
                                    className={
                                        rpeGap != null && Math.abs(rpeGap) >= 1
                                            ? rpeGap > 0 ? 'font-semibold text-warning' : 'font-semibold text-info'
                                            : 'text-ink-muted'
                                    }
                                    title={
                                        rpeGap != null
                                            ? `Pautado RPE ${set.target_rpe} · ${rpeGap > 0 ? '+' : ''}${Math.round(rpeGap * 10) / 10}`
                                            : undefined
                                    }
                                >
                                    RPE {set.actual_rpe}
                                </span>
                            )}
                            {set.vbt_mean_velocity != null && (
                                <span className="text-ink-subtle">{set.vbt_mean_velocity} m/s</span>
                            )}
                            {set.notes?.trim() && (
                                <span className="min-w-0 truncate italic text-ink-subtle" title={set.notes}>
                                    “{set.notes.trim()}”
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: DESCANSO DEL EJERCICIO
// ==========================================
/**
 * EL DESCANSO, QUE NO SE GUARDABA
 * =====================================================================
 *
 * Esto era un `<input defaultValue>` que solo persistía en `onBlur` con
 * `parseInt(valor) || 0`. Tres fallos, y los tres se notaban:
 *
 *   1. Sin blur no hay guardado. Escribir "180" y cerrar el editor del día
 *      con Escape, con el botón de la esquina o cambiando de día en el
 *      teclado del móvil —donde "hecho" no siempre dispara blur— perdía el
 *      valor sin avisar. Es el caso normal, no el raro.
 *
 *   2. `|| 0` convierte el campo vacío en CERO, no en "sin pautar". Un
 *      descanso de 0 segundos es una prescripción real y falsa: el atleta
 *      veía "Descanso 0″" donde el coach había querido borrar el dato.
 *
 *   3. `defaultValue` con una `key` fija ignora los cambios que vengan de
 *      fuera. Tras aplicar una plantilla o recargar el bloque, la casilla
 *      seguía enseñando lo anterior.
 *
 * Ahora es controlado, guarda solo (medio segundo tras dejar de teclear) y
 * VACÍA el temporizador al desmontarse, así que cerrar el editor guarda en
 * lugar de perder.
 */
const REST_COMMIT_DELAY = 500;

function RestInput({
    seconds,
    onChange,
    onCommit,
}: {
    seconds: number | null;
    /** Actualiza el estado local del constructor (optimista). */
    onChange: (value: number | null) => void;
    /** Persiste. Se llama sola, no hace falta salir del campo. */
    onCommit: (value: number | null) => void;
}) {
    const [draft, setDraft] = useState(seconds != null ? String(seconds) : '');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pending = useRef<number | null | undefined>(undefined);

    // Si el valor cambia POR FUERA (recarga, plantilla aplicada, progresión),
    // la casilla lo refleja. Mientras se está escribiendo no: `draft` solo se
    // resincroniza cuando el valor de arriba deja de coincidir con lo enviado.
    useEffect(() => {
        setDraft(seconds != null ? String(seconds) : '');
    }, [seconds]);

    // Al desmontar se manda lo que quedara pendiente. Es lo que hace que
    // cerrar el editor del día guarde el descanso en vez de tirarlo.
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
        if (pending.current !== undefined) onCommit(pending.current);
        // Deliberadamente sin dependencias: solo tiene que correr al desmontar,
        // y `onCommit` se recrea en cada render del padre.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handle = (raw: string) => {
        setDraft(raw);

        // Vacío es "sin pautar" (null), no cero. Cualquier otra cosa se lee
        // como segundos; un texto sin números no cambia nada.
        const value = raw.trim() === '' ? null : Number.parseInt(raw, 10);
        if (value !== null && !Number.isFinite(value)) return;

        const normalized = value === null ? null : Math.max(0, value);
        onChange(normalized);
        pending.current = normalized;

        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            onCommit(normalized);
            pending.current = undefined;
        }, REST_COMMIT_DELAY);
    };

    // "180" se lee como 3 minutos mucho más rápido que como ciento ochenta
    // segundos, y el coach piensa en minutos. La conversión va debajo, en
    // pequeño, para no obligar a elegir unidad.
    const asMinutes =
        seconds && seconds >= 60
            ? `${Math.floor(seconds / 60)}′${String(seconds % 60).padStart(2, '0')}″`
            : null;

    return (
        <div>
            <input
                type="text"
                inputMode="numeric"
                value={draft}
                onChange={(e) => handle(e.target.value)}
                onBlur={() => {
                    if (timer.current) clearTimeout(timer.current);
                    if (pending.current !== undefined) {
                        onCommit(pending.current);
                        pending.current = undefined;
                    }
                }}
                placeholder="seg"
                aria-label="Descanso entre series, en segundos"
                className="h-[34px] w-full rounded-field border border-[var(--border-default)] bg-surface-sunken text-center text-t-sm tabular-nums text-ink transition-colors duration-fast ease-snap placeholder:text-ink-faint focus:border-brand"
            />
            {asMinutes && (
                <p className="mt-0.5 text-center text-[9px] tabular-nums text-ink-faint">{asMinutes}</p>
            )}
        </div>
    );
}

// ==========================================
// SUB-COMPONENT: TÉCNICA DE UNA SERIE
// ==========================================
/**
 * Dropset, rest-pause, cluster, myo-reps o AMRAP para UNA serie.
 *
 * POR QUÉ POR SERIE Y NO POR EJERCICIO
 * Un dropset casi nunca se hace en todas las series: se hace en la última.
 * Ponerlo a nivel de ejercicio obligaría al coach a partir el ejercicio en
 * dos para pautar "3 series normales y una al fallo con bajadas", que es el
 * caso corriente.
 *
 * POR QUÉ ARRANCA PLEGADO
 * Diecinueve de cada veinte series son normales. Un selector desplegado en
 * todas metería cinco filas de ruido por ejercicio y empujaría hacia abajo
 * lo que sí se toca siempre —series, repeticiones y carga—.
 */
function SetTechniqueEditor({
    set,
    onUpdateSet,
}: {
    set: TrainingSet;
    onUpdateSet: (setId: string, field: keyof TrainingSet, value: string | number | null) => void;
}) {
    const active = SET_TYPES.find(t => t.key === set.set_type) ?? null;
    // Abierto si ya tiene técnica o encadenado: lo que está puesto se ve sin
    // tener que descubrir que hay algo escondido detrás de un botón.
    const [open, setOpen] = useState(Boolean(set.set_type || set.group_tag));

    return (
        <div className="mt-0.5">
            {!open ? (
                <button
                    onClick={() => setOpen(true)}
                    className="ml-1 text-t-2xs text-ink-faint opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 hover:text-ink-muted focus-visible:opacity-100"
                >
                    + técnica
                </button>
            ) : (
                <div className="mt-1 space-y-1.5 rounded-field border border-[var(--border-subtle)] bg-black/20 p-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                        {SET_TYPES.map(t => {
                            const on = set.set_type === t.key;
                            return (
                                <button
                                    key={t.key}
                                    title={t.hint}
                                    // Volver a pulsar la activa la quita: sin
                                    // eso, marcar una técnica por error no
                                    // tendría deshacer.
                                    onClick={() => onUpdateSet(set.id, 'set_type', on ? null : t.key)}
                                    className={`rounded-chip px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors duration-fast ease-snap ${on
 ? 'bg-warning text-[var(--surface-sunken)]'
 : 'bg-white/5 text-ink-subtle hover:bg-white/10 hover:text-ink'
 }`}
                                >
                                    {t.short}
                                </button>
                            );
                        })}

                        {/* Encadenado. Separado por una línea porque responde a
                            otra pregunta: la técnica es qué se hace DENTRO de
                            la serie, esto es con qué otro ejercicio se
                            alterna. */}
                        <span className="mx-0.5 h-3.5 w-px bg-[var(--border-default)]" aria-hidden="true" />
                        {GROUP_TAGS.map(tag => {
                            const on = set.group_tag === tag;
                            return (
                                <button
                                    key={tag}
                                    title={`Encadenar con los ejercicios marcados ${tag} en este día`}
                                    onClick={() => onUpdateSet(set.id, 'group_tag', on ? null : tag)}
                                    className={`rounded-chip px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors duration-fast ease-snap ${on
 ? 'bg-info text-[var(--surface-sunken)]'
 : 'bg-white/5 text-ink-subtle hover:bg-white/10 hover:text-ink'
 }`}
                                >
                                    {tag}
                                </button>
                            );
                        })}

                        {!set.set_type && !set.group_tag && (
                            <button
                                onClick={() => setOpen(false)}
                                className="ml-auto p-0.5 text-ink-faint transition-colors duration-fast hover:text-ink"
                                title="Ocultar"
                            >
                                <X size={11} aria-hidden="true" />
                            </button>
                        )}
                    </div>

                    {/* El detalle solo tiene sentido con una técnica elegida.
                        El marcador de posición es el ejemplo de ESA técnica:
                        sin él cada coach inventa su notación y el atleta acaba
                        leyendo algo que no entiende. */}
                    {active && (
                        <input
                            type="text"
                            defaultValue={set.set_detail ?? ''}
                            key={`${set.id}_detail`}
                            onBlur={(e) => onUpdateSet(set.id, 'set_detail', e.target.value.trim() || null)}
                            placeholder={active.detailHint}
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-2 py-1 text-t-2xs text-ink transition-colors duration-fast ease-snap placeholder:text-ink-faint focus:border-brand"
                        />
                    )}
                </div>
            )}
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
            className="w-full bg-surface-overlay border border-transparent hover:border-[var(--border-default)] focus:border-blue-500 rounded px-1 py-1 text-xs text-center text-white transition-colors placeholder:text-ink-subtle"
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
                className={`w-full rounded-field border bg-surface-overlay px-1 py-1 text-center text-t-sm font-semibold tabular-nums text-ink transition-colors duration-fast placeholder:font-normal placeholder:text-ink-subtle ${
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

