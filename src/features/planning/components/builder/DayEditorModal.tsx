import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TrainingSet, DayTemplate } from '../../../../types/training';
import {
    Loader, Plus, Save, Trash2, Activity, X, Dumbbell, BarChart3, Flame, Timer, Eye,
    LayoutTemplate, CopyPlus, GripVertical, ChevronDown, Sparkles, Wand2,
    Flame as FlameIcon,
} from 'lucide-react';
import { m, AnimatePresence, Reorder } from 'framer-motion';
import { type ParsedWarmupExercise } from '../../../../lib/planning/warmupParser';
import { VolumePanel } from '../VolumePanel';
import { ResizeHandle, usePanelWidth } from '../../../../components/ui/ResizeHandle';
import { findMax, type MaxesByExercise } from '../../../../services/maxesService';
import { toVolumeInput } from '../../../../lib/volume/engine';
import { lockBodyScroll } from '../../../../lib/scrollLock';
import type { ExtendedSession, ExtendedSessionExercise, ExerciseCardUpdates } from './types';
import { computeDayMetrics, summarizeSets, getLiftTheme, Sparkline } from './DayCard';
import { ExerciseAutocomplete } from './ExerciseAutocomplete';
import { AppendixEditor } from './AppendixEditor';
import { WarmupConversionPanel } from './WarmupConversionPanel';
import { AthletePreview } from './AthletePreview';
import { ExerciseCard } from './ExerciseCard';
import { AthleteContextPanel } from '../context/AthleteContextPanel';

/**
 * Ejemplo de lo que son las consideraciones.
 *
 * El marcador de posición no es decoración: era `'Core 3x15\nBici suave 10\''`,
 * o sea una lista de EJERCICIOS, y eso es exactamente lo que el coach escribía
 * en el campo. Con un ejemplo de indicaciones, el campo pide lo que es.
 */
const CONSIDERATIONS_HINT =
    'Prioriza velocidad hoy\nRPE 7 como máximo\nDescansa 4\' entre series pesadas\nSi aparece dolor, para el ejercicio';

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
    /** Atleta y entrenador: los necesita el registro de velocidad por serie. */
    athleteId: string;
    coachId: string | null;
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
    /** Trae TODOS los ejercicios de `sourceSessionId` a este día, sustituyendo lo que hubiera. */
    onCopyWholeDay: (sourceSessionId: string) => void;
    onReorder: (orderedIds: string[]) => void;
    onClose: () => void;
    onUpdateName: (id: string, name: string) => void;
    /** Guarda el calentamiento o los extras del día (texto libre). */
    onUpdateAppendix: (sessionId: string, field: 'warmup' | 'extras', value: string) => void;
    /** Convierte el calentamiento en texto a ejercicios de verdad. */
    onConvertWarmup: (sessionId: string, items: ParsedWarmupExercise[]) => void;
    onAddExercise: (sessionId: string, name: string) => void;
    onUpdateExercise: (id: string, updates: ExerciseCardUpdates) => void;
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

export function DayEditorModal({
    session, allSessions, athleteId, coachId, libraryNames, historyByExercise, maxes, onSetMax, onOpenProgression, templates,
    onSaveTemplate, onApplyTemplate, onDeleteTemplate, onCopyExercise, onCopyWholeDay, onReorder,
    onClose, onUpdateName, onUpdateAppendix, onConvertWarmup, onAddExercise, onUpdateExercise,
    onRemoveExercise, onAddSet, onDuplicateSet, onUpdateSet, onRemoveSet, onOpenVbtChart,
    hasUnsavedChanges, onSave, isSaving
}: DayEditorModalProps) {
    const [isAddingEx, setIsAddingEx] = useState(false);
    const [selectedExId, setSelectedExId] = useState<string | null>(session.exercises[0]?.id ?? null);
    /** Propuesta de conversión del calentamiento en texto, abierta. */
    const [converting, setConverting] = useState(false);
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
    /*
     * Si el ejercicio elegido ya no esta en la lista —se ha borrado, o se ha
     * cambiado de dia— se pasa al ultimo.
     *
     * Ajuste durante el render y no un efecto: con el efecto se pintaba un
     * frame apuntando a un ejercicio que ya no existe, y el panel de la
     * derecha aparecia vacio un instante antes de recolocarse.
     */
    const elegidoValido = session.exercises.some(e => e.id === selectedExId)
        ? selectedExId
        : session.exercises[session.exercises.length - 1]?.id ?? null;
    if (elegidoValido !== selectedExId) {
        setSelectedExId(elegidoValido);
    }

    const selectedEx = session.exercises.find(e => e.id === selectedExId) || null;
    const metrics = useMemo(() => computeDayMetrics(session.exercises), [session.exercises]);

    // Entrada del motor de volumen. Depende de allSessions para poder
    // ofrecer los ámbitos Semana y Bloque sin volver a consultar la BD.
    const volumeSessions = useMemo(
        () => allSessions.map(s => toVolumeInput(s, s.exercises)),
        [allSessions]
    );

    /**
     * Los 1RM del atleta en el formato que espera la analítica.
     *
     * `maxes` viene indexado por `exercise_key` (normalizado) y
     * `buildReferenceMaxes` espera un objeto por NOMBRE, que vuelve a
     * normalizar por su cuenta. Se traduce aquí y no dentro de cada sección
     * para que las tres que lo usan reciban exactamente la misma referencia y
     * no puedan dar porcentajes distintos del mismo peso.
     */
    const declaredMaxes = useMemo(() => {
        const out: Record<string, number> = {};
        maxes.forEach(m => { out[m.exercise_name] = m.one_rm; });
        return out;
    }, [maxes]);

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
        <div className="fixed inset-0 z-[150] bg-surface-canvas flex flex-col animate-fade">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 px-4 md:px-8 py-4 border-b border-subtle bg-surface-canvas shrink-0">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-11 h-11 bg-brand/10 border border-brand/30 rounded-xl flex flex-col items-center justify-center shrink-0">
                        <span className="text-t-2xs text-brand-text font-black uppercase leading-none">Día</span>
                        <span className="text-lg font-black text-brand-text leading-none">{session.day_number}</span>
                    </div>
                    <input
                        className="bg-transparent font-black text-xl md:text-2xl text-ink w-full placeholder-gray-600 uppercase tracking-tight border-b-2 border-transparent focus:border-brand/50 transition-colors min-w-0"
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
                            className={`hidden md:flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-t-2xs font-black uppercase transition-colors border ${openMenu === 'copy' ? 'bg-brand/10 border-brand/40 text-brand-text' : 'bg-white/5 border-[var(--border-default)] text-ink-muted hover:text-ink'}`}
                            title="Copiar ejercicio de otro día"
                        >
                            <CopyPlus size={14} /> Copiar de otro día
                        </button>
                        {openMenu === 'copy' && (
                            <div className="absolute right-0 top-full mt-2 z-40 bg-surface-raised border border-[var(--border-default)] rounded-xl shadow-2xl p-3 w-72 max-h-80 overflow-y-auto">
                                {!copySourceId ? (
                                    <>
                                        <p className="text-t-2xs font-black uppercase tracking-wider text-ink-subtle mb-2">Elige el día origen</p>
                                        <div className="space-y-1">
                                            {allSessions.filter(s => s.id !== session.id && s.exercises.length > 0).map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setCopySourceId(s.id)}
                                                    className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-sm font-bold text-ink-muted hover:bg-white/5 hover:text-ink transition-colors"
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
                                        <button onClick={() => setCopySourceId(null)} className="text-t-2xs font-black uppercase text-ink-subtle hover:text-ink mb-2 transition-colors">← Otro día</button>
                                        <button
                                            onClick={() => { onCopyWholeDay(copySourceId); setOpenMenu(null); setCopySourceId(null); }}
                                            className="mb-2 flex w-full items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-left text-xs font-black uppercase tracking-wide text-brand-text transition-colors hover:bg-brand/20"
                                        >
                                            <CopyPlus size={13} /> Traer el día entero (sustituye este)
                                        </button>
                                        <p className="mb-1 text-t-2xs font-black uppercase tracking-wider text-ink-subtle">O un solo ejercicio</p>
                                        <div className="space-y-1">
                                            {allSessions.find(s => s.id === copySourceId)?.exercises.map(ex => (
                                                <button
                                                    key={ex.id}
                                                    onClick={() => { onCopyExercise(ex); setOpenMenu(null); }}
                                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand hover:text-ink text-ink-muted transition-colors"
                                                >
                                                    <span className="text-sm font-bold block truncate">{ex.exercise?.name}</span>
                                                    <span className="text-t-2xs font-mono opacity-60">{summarizeSets(ex.sets)}</span>
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
                            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-t-2xs font-black uppercase transition-colors border ${openMenu === 'templates' ? 'bg-brand/10 border-brand/40 text-brand-text' : 'bg-white/5 border-[var(--border-default)] text-ink-muted hover:text-ink'}`}
                            title="Plantillas de día"
                        >
                            <LayoutTemplate size={14} /> <span className="hidden md:inline">Plantillas</span>
                        </button>
                        {openMenu === 'templates' && (
                            <div className="absolute left-0 md:left-auto md:right-0 top-full mt-2 z-40 bg-surface-raised border border-[var(--border-default)] rounded-xl shadow-2xl p-3 w-[calc(100vw-2rem)] md:w-72 mx-4 md:mx-0">
                                {session.exercises.length > 0 && (
                                    <div className="mb-3 pb-3 border-b border-subtle">
                                        <p className="text-t-2xs font-black uppercase tracking-wider text-ink-subtle mb-2">Guardar este día como plantilla</p>
                                        <div className="flex gap-2">
                                            <input
                                                value={templateName}
                                                onChange={(e) => setTemplateName(e.target.value)}
                                                placeholder='Ej: "Día pesado SQ"'
                                                maxLength={80}
                                                className="flex-1 bg-black/40 border border-[var(--border-default)] rounded-lg py-2 px-3 text-ink text-xs focus:border-brand/50 min-w-0"
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
                                                className="px-3 py-2 rounded-lg bg-brand hover:bg-brand-hover text-ink text-t-2xs font-black uppercase transition-colors disabled:opacity-40 shrink-0"
                                            >
                                                <Save size={12} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <p className="text-t-2xs font-black uppercase tracking-wider text-ink-subtle mb-2">Aplicar plantilla</p>
                                <div className="space-y-1 max-h-52 overflow-y-auto">
                                    {templates.length === 0 && (
                                        <p className="text-xs text-ink-subtle italic px-2 py-1">Sin plantillas todavía.</p>
                                    )}
                                    {templates.map(tpl => (
                                        <div key={tpl.id} className="flex items-center gap-1 group/tpl">
                                            <button
                                                onClick={() => { onApplyTemplate(tpl); setOpenMenu(null); }}
                                                className="flex-1 text-left px-3 py-2 rounded-lg hover:bg-brand hover:text-ink text-ink-muted transition-colors min-w-0"
                                            >
                                                <span className="text-sm font-bold block truncate">{tpl.name}</span>
                                                <span className="text-t-2xs opacity-60">{tpl.payload.length} ejercicios</span>
                                            </button>
                                            <button
                                                onClick={() => onDeleteTemplate(tpl.id)}
                                                className="p-1.5 text-ink-faint hover:text-danger-text opacity-0 group-hover/tpl:opacity-100 transition-opacity shrink-0"
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
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-t-2xs font-black uppercase transition-colors border ${openMenu === 'preview' ? 'bg-brand/10 border-brand/40 text-brand-text' : 'bg-white/5 border-[var(--border-default)] text-ink-muted hover:text-ink'}`}
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
                        className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-ink-muted hover:text-ink transition-colors"
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
                        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-brand/20 to-transparent border border-brand/30 flex items-center justify-center">
                            <Dumbbell size={36} className="text-brand-text" />
                        </div>
                        <h3 className="text-2xl font-black uppercase italic text-ink mb-2">Diseña el día</h3>
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
                                        className={`group p-4 rounded-card border ${theme.border} ${theme.bg} hover:scale-105 transition-transform text-center`}
                                    >
                                        <span className={`block text-2xl font-black italic ${theme.accent}`}>{lift.short}</span>
                                        <span className="block text-t-2xs font-bold uppercase tracking-wider text-ink-muted mt-1">{lift.name}</span>
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
                                label="Consideraciones"
                                icon={Sparkles}
                                placeholder={CONSIDERATIONS_HINT}
                                value={session.extras}
                                onCommit={(v) => onUpdateAppendix(session.id, 'extras', v)}
                            />
                            <AppendixEditor
                                label="Calentamiento"
                                icon={FlameIcon}
                                placeholder={'Movilidad de cadera 5\'\nBarra 20kg x10, 60x5, 80x3...'}
                                value={session.warmup}
                                onCommit={(v) => onUpdateAppendix(session.id, 'warmup', v)}
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
                                <span className="ml-1.5 text-ink-subtle">{session.exercises.length}</span>
                            )}
                            {mobileTab === t.key && (
                                <m.span
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
                <m.div
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
                        {/* La columna se lee de principio a fin como se entrena
                            el día: primero lo que hay que tener en cuenta,
                            luego el calentamiento y luego los ejercicios. */}
                        <AppendixEditor
                            label="Consideraciones"
                            icon={Sparkles}
                            placeholder={CONSIDERATIONS_HINT}
                            value={session.extras}
                            onCommit={(v) => onUpdateAppendix(session.id, 'extras', v)}
                        />

                        <AppendixEditor
                            label="Calentamiento"
                            icon={FlameIcon}
                            placeholder={'Movilidad de cadera 5\'\nBarra 20kg x10, 60x5, 80x3...'}
                            value={session.warmup}
                            onCommit={(v) => onUpdateAppendix(session.id, 'warmup', v)}
                        />

                        {/* CONVERTIR EL TEXTO A EJERCICIOS.
                            Solo aparece cuando hay texto que convertir, y no
                            convierte nada hasta que se ve la propuesta: el
                            texto libre no tiene formato garantizado y aplicar
                            un analizador a ciegas acabaría inventando series
                            de una movilidad. */}
                        {session.warmup?.trim() && !converting && (
                            <button
                                onClick={() => setConverting(true)}
                                className="flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-field border border-dashed border-[var(--border-default)] px-3 py-2 text-t-2xs font-bold uppercase tracking-wide text-ink-subtle transition-colors duration-fast hover:border-[var(--brand-line)] hover:text-brand-text"
                            >
                                <Wand2 size={13} aria-hidden="true" />
                                Convertir a ejercicios
                            </button>
                        )}

                        {converting && session.warmup && (
                            <WarmupConversionPanel
                                text={session.warmup}
                                onCancel={() => setConverting(false)}
                                onConvert={(items) => {
                                    setConverting(false);
                                    onConvertWarmup(session.id, items);
                                }}
                            />
                        )}

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
                                                <span className={`text-t-2xs font-black px-1.5 py-0.5 rounded ${theme.bg} ${theme.accent}`}>{theme.key}</span>
                                                <span className="text-t-2xs font-bold text-ink-subtle uppercase">#{i + 1}</span>
                                                {ex.vbt_file_url && <Activity size={10} className="text-success" />}
                                                <span className="ml-auto"><Sparkline values={spark} /></span>
                                            </div>
                                            <p className={`font-black uppercase text-sm leading-tight truncate ${isSelected ? 'text-ink' : 'text-ink-muted'}`}>
                                                {ex.exercise?.name || 'Ejercicio'}
                                            </p>
                                            {ex.variant_name && (
                                                <p className={`text-t-2xs font-bold truncate ${theme.accent}`}>{ex.variant_name}</p>
                                            )}
                                            <div className="flex items-center justify-between mt-1 gap-2">
                                                <p className="text-t-2xs text-ink-subtle font-mono truncate">{summarizeSets(ex.sets)}</p>
                                                {spark.length >= 2 && (
                                                    <p className="text-t-2xs font-bold text-ink-subtle shrink-0">últ. {spark[spark.length - 1]}kg</p>
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
                                    className="w-full py-3.5 border-2 border-dashed border-[var(--border-default)] hover:border-brand/50 hover:bg-brand/5 rounded-card text-ink-subtle hover:text-brand-text transition-colors text-t-2xs font-black tracking-widest uppercase flex items-center justify-center gap-2"
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

                    </div>

                    {/* CENTRO: detalle del ejercicio seleccionado (pop-up animado) */}
                    <div className="w-1/3 shrink-0 overflow-y-auto p-4 min-h-0 md:p-6 lg:w-auto lg:flex-1 lg:shrink">
                        <AnimatePresence mode="wait">
                            {selectedEx ? (
                                <m.div
                                    key={selectedEx.id}
                                    initial={{ opacity: 0, x: 24, scale: 0.98 }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    exit={{ opacity: 0, x: -12, scale: 0.98 }}
                                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                    className="max-w-xl mx-auto"
                                >
                                    <ExerciseCard
                                        sessionExercise={selectedEx}
                                        athleteId={athleteId}
                                        coachId={coachId}
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
                                </m.div>
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
                        {/* CENTRO DE CONTEXTO DEL ATLETA.
                            Va ARRIBA del resumen del día, y el orden importa:
                            lo de abajo describe lo que se está escribiendo
                            —cuántas series lleva este día— y lo de aquí es
                            aquello CONTRA lo que se escribe: cuánto lleva la
                            semana, qué hizo la anterior, qué es lo mejor que ha
                            levantado. Es lo que se consulta antes de decidir.

                            El resumen del día que había se conserva entero
                            debajo, sin tocar. */}
                        <AthleteContextPanel
                            athleteId={athleteId}
                            sessions={volumeSessions}
                            sessionMeta={allSessions}
                            exercises={session.exercises}
                            currentSessionId={session.id}
                            currentWeek={session.week_number}
                            maxes={maxes}
                            declaredMaxes={declaredMaxes}
                        />

                        <p className="border-t border-subtle pt-4 text-t-2xs font-black uppercase tracking-[0.25em] text-ink-subtle flex items-center gap-2">
                            <BarChart3 size={13} className="text-brand-text" /> Resumen del día
                        </p>

                        <div className="grid grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
                            <div className="bg-surface-raised border border-subtle rounded-xl p-3 text-center">
                                <Dumbbell size={14} className="mx-auto text-brand-text mb-1" />
                                <p className="text-xl font-black text-ink leading-none">{session.exercises.length}</p>
                                <p className="text-t-2xs font-bold uppercase text-ink-subtle mt-1">Ejercicios</p>
                            </div>
                            <div className="bg-surface-raised border border-subtle rounded-xl p-3 text-center">
                                <Timer size={14} className="mx-auto text-info mb-1" />
                                <p className="text-xl font-black text-ink leading-none">{metrics.totalSeries}</p>
                                <p className="text-t-2xs font-bold uppercase text-ink-subtle mt-1">Series</p>
                            </div>
                            <div className="bg-surface-raised border border-subtle rounded-xl p-3 text-center">
                                <Flame size={14} className="mx-auto text-orange-400 mb-1" />
                                <p className="text-xl font-black text-ink leading-none">
                                    {metrics.tonnage >= 1000 ? `${(metrics.tonnage / 1000).toFixed(1)}t` : `${metrics.tonnage}`}
                                </p>
                                <p className="text-t-2xs font-bold uppercase text-ink-subtle mt-1">{metrics.tonnage >= 1000 ? 'Tonelaje' : 'Kg totales'}</p>
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
                                <p className="text-t-2xs font-black uppercase tracking-widest text-ink-subtle">Series por patrón</p>
                                {(['SQ', 'BP', 'DL', 'ACC'] as const).map(key => {
                                    const count = metrics.byLift[key];
                                    if (count === 0) return null;
                                    const pct = Math.round((count / metrics.totalSeries) * 100);
                                    const theme = key === 'SQ' ? getLiftTheme('sentadilla') : key === 'BP' ? getLiftTheme('banca') : key === 'DL' ? getLiftTheme('muerto') : getLiftTheme('acc');
                                    const label = key === 'ACC' ? 'Accesorios' : key;
                                    return (
                                        <div key={key}>
                                            <div className="flex justify-between text-t-2xs font-bold mb-1">
                                                <span className={theme.accent}>{label}</span>
                                                <span className="text-ink-subtle">{count} series · {pct}%</span>
                                            </div>
                                            <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                                                <m.div
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
                            <div className="bg-gradient-to-br from-brand/10 to-transparent border border-brand/20 rounded-xl p-3.5 text-center">
                                <p className="text-t-2xs font-black uppercase tracking-widest text-ink-subtle mb-1">Carga más pesada del día</p>
                                <p className="text-2xl font-black text-brand-text italic">{metrics.maxLoad}<span className="text-sm text-ink-subtle not-italic"> kg</span></p>
                            </div>
                        )}

                        {/* Índice del día */}
                        <div className="space-y-1.5">
                            <p className="text-t-2xs font-black uppercase tracking-widest text-ink-subtle">Sesión completa</p>
                            {session.exercises.map((ex, i) => {
                                const theme = getLiftTheme(ex.exercise?.name || '');
                                return (
                                    <button
                                        key={ex.id}
                                        onClick={() => pickExercise(ex.id)}
                                        className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${theme.bar} shrink-0`} />
                                        <span className="text-t-2xs font-bold text-ink-muted truncate flex-1">{i + 1}. {ex.exercise?.name}</span>
                                        <span className="text-t-2xs font-mono text-ink-subtle shrink-0">{summarizeSets(ex.sets).split(' · ')[0]}{ex.sets.length > 1 ? '…' : ''}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </m.div>
                </div>
                </>
            )}
        </div>
    );
}
