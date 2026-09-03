import { useMemo, useState } from 'react';
import { Check, ChevronRight, Loader, Zap } from 'lucide-react';
import {
    getAthleteTrainingTree, getBlockTree,
    type TrainingTreeSession,
} from '../../../services/vbtService';
import { getWeekNumber } from '../../../utils/dateUtils';
import { WEEKDAYS } from '../../../types/training';
import { cn } from '../../../lib/utils';
import { useQuery } from '@tanstack/react-query';

/**
 * ELEGIR UNA SERIE BAJANDO POR EL PLAN
 * =====================================================================
 *
 * Macro → Bloque → Semana → Día → Ejercicio → Serie.
 *
 * POR QUÉ UNA CASCADA Y NO UNA LISTA
 *
 * La lista plana de series recientes (la que usa `SavePwrResultModal`)
 * resuelve el caso fácil: se acaba de grabar la serie y está entre las diez
 * últimas. Deja fuera todo lo demás — un vídeo de hace tres semanas, un
 * bloque anterior, un atleta con dos macrociclos abiertos — porque
 * "sentadilla · S12·D2 · serie 3" repetido cuarenta veces no se puede leer.
 *
 * La cascada convierte esa búsqueda en seis elecciones de tres o cuatro
 * opciones cada una. Es más pulsaciones y muchísimo menos esfuerzo.
 *
 * LOS ATAJOS SON LA MITAD DEL DISEÑO
 *
 * Una cascada de seis niveles, tomada al pie de la letra, sería peor que la
 * lista. Por eso:
 *
 *   · Si solo hay un macrociclo (o ninguno), ese nivel no se enseña.
 *   · Si el macro tiene un solo bloque, se elige solo.
 *   · La semana arranca en la ACTUAL si el bloque la tiene, que es el caso
 *     normal: se está guardando el vídeo de hoy.
 *   · Cada nivel elegido se colapsa a un renglón pulsable, así que corregir
 *     el paso tres no obliga a rehacer los pasos uno y dos.
 *
 * En el camino habitual —bloque activo, semana actual— el coach toca tres
 * veces: día, ejercicio y serie.
 */

export interface AssignSetSelection {
    setId: string;
    sessionExerciseId: string;
    exerciseId: string | null;
    exerciseName: string;
    variantName: string | null;
    setNumber: number;
    loadKg: number | null;
    reps: number | null;
    blockName: string;
    weekNumber: number;
    dayNumber: number;
    /** Ya tenía métricas: quien llama avisa antes de pisarlas. */
    hadMetrics: boolean;
}

export function AssignSetPicker({
    athleteId,
    /** Nombre del ejercicio analizado, para subir arriba los que casan. */
    exerciseHint,
    value,
    onChange,
}: {
    athleteId: string;
    exerciseHint?: string | null;
    value: AssignSetSelection | null;
    onChange: (selection: AssignSetSelection | null) => void;
}) {
    const [macroId, setMacroId] = useState<string | null | undefined>(undefined);
    const [blockId, setBlockId] = useState<string | null>(null);

    /*
     * EL ÁRBOL DE ENTRENAMIENTO DEL ATLETA, POR CONSULTA.
     *
     * Este selector se abre desde el análisis de vídeo para decir a qué serie
     * pertenece la medición, y se abre varias veces seguidas cuando se
     * analizan varias series de la misma sesión. Con los efectos que había,
     * cada apertura volvía a pedir el árbol entero y luego el bloque entero:
     * dos viajes completos para elegir lo mismo que se acababa de elegir.
     */
    const { data: macros = [], isPending: loadingTree } = useQuery({
        queryKey: ['arbol-entrenamiento', athleteId],
        queryFn: () => getAthleteTrainingTree(athleteId),
    });

    const { data: sessions = [], isPending: cargandoBloque } = useQuery({
        queryKey: ['arbol-bloque', blockId],
        queryFn: () => getBlockTree(blockId!),
        enabled: !!blockId,
    });
    const loadingBlock = !!blockId && cargandoBloque;

    const [week, setWeek] = useState<number | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [exerciseId, setExerciseId] = useState<string | null>(null);

    // ---------------------------------------------------------------
    // Carga del árbol
    // ---------------------------------------------------------------
    /*
     * PROPUESTA AUTOMÁTICA AL LLEGAR EL ÁRBOL.
     *
     * Con un solo macrociclo no hay nada que elegir: se salta el nivel
     * entero en vez de enseñar un botón obligatorio. Y si el macro tiene un
     * solo bloque, también se elige; si tiene varios, se propone el activo.
     *
     * Ajuste durante el render y no un efecto: con el efecto se pintaba un
     * frame con los tres niveles vacíos —tres listas montadas para nada—
     * antes de plegarse solos.
     */
    const [arbolAnterior, setArbolAnterior] = useState(macros);
    if (arbolAnterior !== macros) {
        setArbolAnterior(macros);
        if (macros.length === 1) {
            setMacroId(macros[0].id);
            if (macros[0].blocks.length === 1) {
                setBlockId(macros[0].blocks[0].id);
            } else {
                const activo = macros[0].blocks.find(b => b.isActive);
                if (activo) setBlockId(activo.id);
            }
        }
    }

    /*
     * LA SEMANA ACTUAL POR DEFECTO, al llegar el contenido del bloque.
     *
     * Es lo correcto: se está guardando el vídeo de hoy. Si el bloque no
     * llega a la semana de hoy —uno pasado— se cae en la última que tenga,
     * no en la primera: lo último que se entrenó está más cerca de lo que
     * se busca.
     */
    const [bloqueAnterior, setBloqueAnterior] = useState(sessions);
    if (bloqueAnterior !== sessions) {
        setBloqueAnterior(sessions);
        const semanas = [...new Set(sessions.map(r => r.weekNumber))].sort((a, b) => a - b);
        const actual = getWeekNumber();
        setWeek(semanas.includes(actual) ? actual : (semanas[semanas.length - 1] ?? null));
        setSessionId(null);
        setExerciseId(null);
    }

    // ---------------------------------------------------------------
    // Derivados
    // ---------------------------------------------------------------
    const macro = macros.find(m => m.id === macroId) ?? null;
    const blocks = macro?.blocks ?? [];
    const block = blocks.find(b => b.id === blockId) ?? null;

    const weeks = useMemo(
        () => [...new Set(sessions.map(s => s.weekNumber))].sort((a, b) => a - b),
        [sessions]
    );

    const daysOfWeek = useMemo(
        () => sessions.filter(s => s.weekNumber === week),
        [sessions, week]
    );

    const session = daysOfWeek.find(s => s.id === sessionId) ?? null;

    /**
     * Ejercicios del día, con los que casan con el vídeo primero.
     *
     * Se compara por la primera palabra: "Sentadilla" del analizador tiene
     * que encontrar "Sentadilla trasera con pausa" del plan. No se filtra,
     * se ORDENA — el coach puede haber analizado un vídeo de sentadilla y
     * querer colgarlo de un ejercicio con otro nombre, y esconderle el
     * resto sería decidir por él.
     */
    const exercises = useMemo(() => {
        const list = session?.exercises ?? [];
        const needle = exerciseHint?.trim().toLowerCase().split(' ')[0];
        if (!needle) return list;

        return [...list].sort((a, b) => {
            const am = a.name.toLowerCase().includes(needle) ? 0 : 1;
            const bm = b.name.toLowerCase().includes(needle) ? 0 : 1;
            return am - bm;
        });
    }, [session, exerciseHint]);

    const exercise = exercises.find(e => e.id === exerciseId) ?? null;

    // ---------------------------------------------------------------
    // Selección
    // ---------------------------------------------------------------
    const pickSet = (setId: string) => {
        const set = exercise?.sets.find(s => s.id === setId);
        if (!set || !exercise || !session || !block) return;

        onChange({
            setId: set.id,
            sessionExerciseId: exercise.id,
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.name,
            variantName: exercise.variantName,
            setNumber: set.setNumber,
            loadKg: set.loadKg,
            reps: set.reps,
            blockName: block.name,
            weekNumber: session.weekNumber,
            dayNumber: session.dayNumber,
            hadMetrics: set.hasMetrics,
        });
    };

    // Cambiar un nivel de arriba invalida lo de abajo. Sin esto se podría
    // guardar contra una serie de un día que ya no está seleccionado.
    const changeMacro = (id: string | null) => {
        setMacroId(id); setBlockId(null);
        setWeek(null); setSessionId(null); setExerciseId(null); onChange(null);
    };
    const changeBlock = (id: string) => {
        setBlockId(id); setSessionId(null); setExerciseId(null); onChange(null);
    };
    const changeWeek = (w: number) => {
        setWeek(w); setSessionId(null); setExerciseId(null); onChange(null);
    };
    const changeSession = (id: string) => {
        setSessionId(id); setExerciseId(null); onChange(null);
    };
    const changeExercise = (id: string) => {
        setExerciseId(id); onChange(null);
    };

    // ---------------------------------------------------------------
    if (loadingTree) {
        return (
            <div className="flex justify-center py-8">
                <Loader size={18} className="animate-spin text-ink-faint" />
            </div>
        );
    }

    if (macros.length === 0) {
        return (
            <p className="rounded-field bg-surface-sunken px-3 py-2.5 text-t-2xs leading-relaxed text-ink-subtle">
                Este atleta todavía no tiene bloques programados. El análisis se puede
                guardar igual en su historial: contará para su perfil carga-velocidad.
            </p>
        );
    }

    const showMacroLevel = macros.length > 1;

    return (
        <div className="space-y-2">
            {showMacroLevel && (
                <Level
                    label="Macrociclo"
                    chosen={macro ? macro.name : null}
                    onReopen={() => changeMacro(null)}
                >
                    {macros.map(m => (
                        <Option
                            key={m.id ?? 'none'}
                            active={macroId === m.id}
                            onClick={() => changeMacro(m.id)}
                            title={m.name}
                            hint={`${m.blocks.length} bloque${m.blocks.length === 1 ? '' : 's'}`}
                        />
                    ))}
                </Level>
            )}

            {(macroId !== undefined) && blocks.length > 0 && (
                <Level
                    label="Bloque"
                    chosen={block ? block.name : null}
                    onReopen={() => changeBlock('')}
                >
                    {blocks.map(b => (
                        <Option
                            key={b.id}
                            active={blockId === b.id}
                            onClick={() => changeBlock(b.id)}
                            title={b.name}
                            hint={b.isActive ? 'Activo' : undefined}
                            accent={b.isActive}
                        />
                    ))}
                </Level>
            )}

            {loadingBlock && (
                <div className="flex justify-center py-4">
                    <Loader size={15} className="animate-spin text-ink-faint" />
                </div>
            )}

            {!loadingBlock && blockId && weeks.length > 0 && (
                <Level
                    label="Semana"
                    chosen={week !== null ? weekLabel(weeks, week) : null}
                    onReopen={() => changeWeek(-1)}
                >
                    {weeks.map((w, i) => (
                        <Option
                            key={w}
                            active={week === w}
                            onClick={() => changeWeek(w)}
                            title={`Semana ${i + 1}`}
                            hint={w === getWeekNumber() ? 'Actual' : undefined}
                            accent={w === getWeekNumber()}
                        />
                    ))}
                </Level>
            )}

            {week !== null && daysOfWeek.length > 0 && (
                <Level
                    label="Día"
                    chosen={session ? dayLabel(session) : null}
                    onReopen={() => changeSession('')}
                >
                    {daysOfWeek.map(s => (
                        <Option
                            key={s.id}
                            active={sessionId === s.id}
                            onClick={() => changeSession(s.id)}
                            title={dayLabel(s)}
                            hint={`${s.exercises.length} ejercicio${s.exercises.length === 1 ? '' : 's'}`}
                        />
                    ))}
                </Level>
            )}

            {session && exercises.length > 0 && (
                <Level
                    label="Ejercicio"
                    chosen={exercise ? exercise.name : null}
                    onReopen={() => changeExercise('')}
                >
                    {exercises.map(e => (
                        <Option
                            key={e.id}
                            active={exerciseId === e.id}
                            onClick={() => changeExercise(e.id)}
                            title={e.name}
                            hint={e.variantName ?? `${e.sets.length} serie${e.sets.length === 1 ? '' : 's'}`}
                        />
                    ))}
                </Level>
            )}

            {exercise && (
                <Level label="Serie" chosen={null} onReopen={() => {}}>
                    {exercise.sets.length === 0 ? (
                        <p className="px-1 py-2 text-t-2xs text-ink-subtle">
                            Este ejercicio no tiene series programadas.
                        </p>
                    ) : (
                        exercise.sets.map(s => (
                            <Option
                                key={s.id}
                                active={value?.setId === s.id}
                                onClick={() => pickSet(s.id)}
                                title={`Serie ${s.setNumber}`}
                                hint={[
                                    s.targetReps,
                                    s.loadKg ? `${s.loadKg} kg` : null,
                                ].filter(Boolean).join(' · ') || undefined}
                                // Una serie que ya tiene medición se marca:
                                // guardar encima la sustituye, y enterarse
                                // DESPUÉS es perder un dato sin saberlo.
                                warn={s.hasMetrics}
                            />
                        ))
                    )}
                </Level>
            )}

            {value?.hadMetrics && (
                <p className="flex items-start gap-1.5 rounded-field bg-[var(--warning-quiet)] px-2.5 py-2 text-t-2xs leading-relaxed text-warning">
                    <Zap size={12} className="mt-px shrink-0" aria-hidden="true" />
                    Esta serie ya tenía métricas guardadas. Al guardar se sustituyen por las
                    de este análisis.
                </p>
            )}
        </div>
    );
}

// =====================================================================
// PIEZAS
// =====================================================================

/**
 * Un nivel de la cascada.
 *
 * Cuando ya se ha elegido algo en él, se pliega a un solo renglón con lo
 * elegido. Es lo que evita que seis niveles abiertos a la vez conviertan el
 * diálogo en un scroll infinito, y a la vez deja corregir cualquier paso sin
 * empezar de cero.
 */
function Level({
    label, chosen, onReopen, children,
}: {
    label: string;
    chosen: string | null;
    onReopen: () => void;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(true);

    // Al elegir se pliega solo; al deshacer la elección se vuelve a abrir.
    // Ajuste durante el render y no un efecto: con el efecto se veía un frame
    // con el nivel todavía abierto después de elegir, y como cada nivel monta
    // su lista entera, ese frame de más se notaba.
    const [elegidoAntes, setElegidoAntes] = useState(chosen);
    if (elegidoAntes !== chosen) {
        setElegidoAntes(chosen);
        setOpen(chosen === null);
    }

    if (chosen !== null && !open) {
        return (
            <button
                onClick={() => { setOpen(true); onReopen(); }}
                className="flex w-full items-center gap-2 rounded-field border border-[var(--border-default)] bg-surface-sunken px-2.5 py-2 text-left transition-colors duration-fast hover:border-[var(--border-strong)]"
            >
                <span className="w-20 shrink-0 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                    {label}
                </span>
                <span className="min-w-0 flex-1 truncate text-t-xs font-semibold text-ink">{chosen}</span>
                <ChevronRight size={13} className="shrink-0 text-ink-faint" aria-hidden="true" />
            </button>
        );
    }

    return (
        <div>
            <p className="mb-1 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                {label}
            </p>
            {/* Rejilla y no lista: los niveles de arriba tienen dos o tres
                opciones cortas y en una columna desperdiciarían tres cuartos
                del ancho del diálogo. */}
            <div className="grid max-h-44 gap-1 overflow-y-auto grid-cols-3">
                {children}
            </div>
        </div>
    );
}

function Option({
    active, onClick, title, hint, accent, warn,
}: {
    active: boolean;
    onClick: () => void;
    title: string;
    hint?: string;
    accent?: boolean;
    warn?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex min-w-0 flex-col gap-0.5 rounded-field border px-2.5 py-2 text-left transition-colors duration-fast',
                active
                    ? 'border-brand bg-[var(--brand-quiet)] text-ink'
                    : 'border-[var(--border-default)] text-ink-muted hover:border-[var(--border-strong)] hover:text-ink'
            )}
        >
            <span className="flex items-center gap-1 truncate text-t-xs font-semibold">
                <span className="truncate">{title}</span>
                {active && <Check size={11} className="shrink-0 text-brand-text" aria-hidden="true" />}
                {warn && !active && (
                    <span
                        className="ml-auto h-1.5 w-1.5 shrink-0 rounded-pill bg-warning"
                        title="Ya tiene métricas"
                        aria-label="Ya tiene métricas"
                    />
                )}
            </span>
            {hint && (
                <span className={cn(
                    'truncate text-t-2xs',
                    accent ? 'font-semibold text-brand-text' : 'text-ink-subtle'
                )}>
                    {hint}
                </span>
            )}
        </button>
    );
}

// =====================================================================

/** "Semana 3" por posición dentro del bloque, no por número ISO del año. */
function weekLabel(weeks: number[], week: number): string {
    const i = weeks.indexOf(week);
    return i >= 0 ? `Semana ${i + 1}` : `Semana ${week}`;
}

/** "Lun · Día 1", o el nombre que le puso el coach si lo tiene. */
function dayLabel(s: TrainingTreeSession): string {
    if (s.name?.trim()) return s.name.trim();
    const wd = WEEKDAYS.find(d => d.key === s.dayOfWeek);
    return wd ? `${wd.short} · Día ${s.dayNumber}` : `Día ${s.dayNumber}`;
}
