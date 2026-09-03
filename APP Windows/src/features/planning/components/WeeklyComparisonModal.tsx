import { useMemo, useState } from 'react';
import { Search, TrendingUp, TrendingDown } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { toVolumeInput, type VolumeSessionInput } from '../../../lib/volume/engine';
import { weeklyExerciseSummary, MAIN_LIFTS, MAIN_LIFT_LABEL, type MainLift } from '../../../lib/planning/liftSummary';
import { compareWeeks } from '../../../lib/planning/weekComparison';
import { exerciseKey } from '../../../lib/planning/blockAnalytics';
import type { ExtendedSession, ExtendedSessionExercise } from './builder/types';
import type { TrainingSet } from '../../../types/training';

/**
 * SEMANA ANTERIOR ↔ SEMANA SIGUIENTE, POR MOVIMIENTO
 * =====================================================================
 *
 * Apartado 6 del encargo. Decisiones cerradas:
 *   E1 — cualquier ejercicio, con los tres básicos como accesos directos.
 *   E2 — "la siguiente" es la semana que ya se estaba editando al abrir esto.
 *   E3 — el % se calcula contra lo PAUTADO de la anterior (no lo realizado).
 *   E5 — intensidad top-set Y media, las dos.
 *   E6 — todo editable desde aquí: carga, RPE, repeticiones, series.
 *   E7 — diálogo ancho (criterio propio): tres tarjetas de día en paralelo
 *        no caben en la columna de 380px del panel de contexto.
 *
 * LA EDICIÓN NO ABRE UN CAMINO DE GUARDADO NUEVO
 * `onUpdateSet` es el MISMO `updateSetField` que ya usa el resto del
 * constructor: local y optimista, con "Guardar cambios" persistiéndolo
 * después. Un camino de guardado propio aquí habría sido exactamente el
 * error que causó el bug del descanso (dos caminos para el mismo dato).
 */

interface WeeklyComparisonModalProps {
    open: boolean;
    onClose: () => void;
    /** Todas las sesiones del bloque, estado LOCAL del constructor (editable). */
    sessions: ExtendedSession[];
    /** Semanas del bloque, en orden. */
    weeks: number[];
    /** La semana que se estaba editando al abrir esto — E2. */
    currentWeek: number;
    declaredMaxes?: Record<string, number>;
    libraryNames: string[];
    onUpdateSet: (setId: string, field: keyof TrainingSet, value: TrainingSet[keyof TrainingSet]) => void;
}

export function WeeklyComparisonModal({
    open, onClose, sessions, weeks, currentWeek, declaredMaxes = {}, libraryNames, onUpdateSet,
}: WeeklyComparisonModalProps) {
    const [nextWeek, setNextWeek] = useState(currentWeek);
    const [movement, setMovement] = useState<string>(MAIN_LIFT_LABEL.SQ);
    const [search, setSearch] = useState('');

    const volumeSessions = useMemo<VolumeSessionInput[]>(
        () => sessions.map(s => toVolumeInput(s, s.exercises)),
        [sessions]
    );

    const ordinal = weeks.indexOf(nextWeek);
    const previousWeek = ordinal > 0 ? weeks[ordinal - 1] : null;

    const nextSummary = useMemo(
        () => weeklyExerciseSummary(volumeSessions, nextWeek, movement, declaredMaxes),
        [volumeSessions, nextWeek, movement, declaredMaxes]
    );
    const previousSummary = useMemo(
        () => previousWeek != null ? weeklyExerciseSummary(volumeSessions, previousWeek, movement, declaredMaxes) : null,
        [volumeSessions, previousWeek, movement, declaredMaxes]
    );
    const deltas = useMemo(
        () => previousSummary ? compareWeeks(previousSummary, nextSummary) : [],
        [previousSummary, nextSummary]
    );

    // Instancias EDITABLES del movimiento en la semana siguiente: una por
    // día que lo tenga programado. Se buscan en `sessions` (el estado local
    // de verdad, con ids de serie) y no en el resumen —ese solo agrega
    // números—.
    const editableDays = useMemo(() => {
        const key = exerciseKey(movement);
        return sessions
            .filter(s => s.week_number === nextWeek)
            .flatMap(session =>
                session.exercises
                    .filter(ex => exerciseKey(ex.exercise?.name ?? '') === key)
                    .map(ex => ({ session, exercise: ex }))
            );
    }, [sessions, nextWeek, movement]);

    const suggestions = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (q.length < 2) return [];
        return libraryNames.filter(n => n.toLowerCase().includes(q) && n !== movement).slice(0, 6);
    }, [search, libraryNames, movement]);

    return (
        <Modal open={open} onClose={onClose} title="Semana anterior frente a siguiente" size="xl">
            <div className="space-y-4">
                {/* MOVIMIENTO — E1 */}
                <div className="flex flex-wrap items-center gap-2">
                    {MAIN_LIFTS.map((key: MainLift) => (
                        <button
                            key={key}
                            onClick={() => setMovement(MAIN_LIFT_LABEL[key])}
                            aria-pressed={exerciseKey(movement) === exerciseKey(MAIN_LIFT_LABEL[key])}
                            className={`rounded-chip px-3 py-1.5 text-t-xs font-bold uppercase tracking-wide transition-colors duration-fast ease-snap ${exerciseKey(movement) === exerciseKey(MAIN_LIFT_LABEL[key])
                                ? 'bg-brand text-brand-ink'
                                : 'bg-surface-sunken text-ink-subtle hover:text-ink'
                                }`}
                        >
                            {MAIN_LIFT_LABEL[key]}
                        </button>
                    ))}
                    <div className="relative min-w-[200px] flex-1">
                        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Otro ejercicio…"
                            className="h-8 w-full rounded-chip border border-[var(--border-default)] bg-surface-sunken pl-8 pr-2 text-t-xs text-ink placeholder:text-ink-faint focus:border-brand"
                        />
                        {suggestions.length > 0 && (
                            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-field border border-[var(--border-default)] bg-surface-overlay shadow-overlay">
                                {suggestions.map(name => (
                                    <li key={name}>
                                        <button
                                            onClick={() => { setMovement(name); setSearch(''); }}
                                            className="block w-full px-3 py-1.5 text-left text-t-xs text-ink hover:bg-surface-raised"
                                        >
                                            {name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* SEMANAS */}
                <div className="flex flex-wrap items-center gap-2 text-t-xs text-ink-subtle">
                    <span>Comparando</span>
                    <select
                        value={nextWeek}
                        onChange={(e) => setNextWeek(Number(e.target.value))}
                        aria-label="Semana a programar"
                        className="h-8 appearance-none rounded-chip border border-[var(--border-default)] bg-surface-sunken px-2 text-t-xs font-bold text-ink focus:border-brand"
                    >
                        {weeks.map((w, i) => (
                            <option key={w} value={w} className="bg-surface-sunken text-ink">Semana {i + 1}</option>
                        ))}
                    </select>
                    <span>contra la anterior{previousWeek == null && ' — no hay ninguna'}</span>
                </div>

                {/* RESUMEN COMPARATIVO */}
                {previousSummary && (
                    <div className="grid gap-2 grid-cols-6">
                        {deltas.map(d => (
                            <DeltaTile key={d.label} delta={d} />
                        ))}
                    </div>
                )}

                {/* TARJETAS DE DÍA, EN PARALELO */}
                {editableDays.length === 0 ? (
                    <p className="rounded-card border border-dashed border-[var(--border-default)] py-8 text-center text-t-sm text-ink-subtle">
                        {movement} no está programado esta semana todavía.
                    </p>
                ) : (
                    <div className="grid gap-3 grid-cols-3">
                        {editableDays.map(({ session, exercise }) => (
                            <DayEditCard
                                key={exercise.id}
                                dayLabel={session.day_of_week ? WEEKDAY_LABEL[session.day_of_week] ?? `Día ${session.day_number}` : `Día ${session.day_number}`}
                                exercise={exercise}
                                onUpdateSet={onUpdateSet}
                            />
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}

const WEEKDAY_LABEL: Record<string, string> = {
    monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves',
    friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo',
};

// =====================================================================

function DeltaTile({ delta }: { delta: ReturnType<typeof compareWeeks>[number] }) {
    const up = delta.deltaPct != null && delta.deltaPct > 0;
    const down = delta.deltaPct != null && delta.deltaPct < 0;
    return (
        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-2.5">
            <p className="truncate text-t-2xs uppercase tracking-wide text-ink-faint">{delta.label}</p>
            <p className="mt-0.5 text-t-sm font-bold tabular-nums text-ink">
                {delta.previous} → {delta.next}
                {delta.unit ? ` ${delta.unit}` : ''}
            </p>
            {delta.deltaPct != null ? (
                <p className={`flex items-center gap-1 text-t-2xs font-bold tabular-nums ${up ? 'text-success' : down ? 'text-warning' : 'text-ink-subtle'}`}>
                    {up && <TrendingUp size={11} aria-hidden="true" />}
                    {down && <TrendingDown size={11} aria-hidden="true" />}
                    {delta.deltaPct > 0 ? '+' : ''}{delta.deltaPct}%
                </p>
            ) : (
                <p className="text-t-2xs text-ink-faint">—</p>
            )}
        </div>
    );
}

// =====================================================================

function DayEditCard({
    dayLabel, exercise, onUpdateSet,
}: {
    dayLabel: string;
    exercise: ExtendedSessionExercise;
    onUpdateSet: (setId: string, field: keyof TrainingSet, value: TrainingSet[keyof TrainingSet]) => void;
}) {
    return (
        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-3">
            <h4 className="mb-2 text-t-2xs font-black uppercase tracking-widest text-ink-subtle">{dayLabel}</h4>
            <div className="space-y-1.5">
                {exercise.sets.map((set, i) => (
                    <div key={set.id} className="grid grid-cols-[1.5rem_1fr_1fr_1fr] items-center gap-1.5">
                        <span className="text-t-2xs tabular-nums text-ink-faint">{i + 1}</span>
                        <EditCell
                            value={set.target_reps ?? ''}
                            onCommit={(v) => onUpdateSet(set.id, 'target_reps', v)}
                            placeholder="reps"
                        />
                        <EditCell
                            value={set.target_load != null ? String(set.target_load) : ''}
                            onCommit={(v) => onUpdateSet(set.id, 'target_load', v === '' ? null : Number(v))}
                            placeholder="kg"
                            numeric
                        />
                        <EditCell
                            value={set.target_rpe ?? ''}
                            onCommit={(v) => onUpdateSet(set.id, 'target_rpe', v === '' ? null : v)}
                            placeholder="RPE"
                        />
                    </div>
                ))}
                {exercise.sets.length === 0 && (
                    <p className="text-t-2xs text-ink-faint">Sin series</p>
                )}
            </div>
        </div>
    );
}

function EditCell({
    value, onCommit, placeholder, numeric = false,
}: {
    value: string;
    onCommit: (value: string) => void;
    placeholder: string;
    numeric?: boolean;
}) {
    const [draft, setDraft] = useState(value);
    const [prev, setPrev] = useState(value);
    if (prev !== value) { setPrev(value); setDraft(value); }

    return (
        <input
            type="text"
            inputMode={numeric ? 'decimal' : 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { if (draft !== value) onCommit(draft); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-8 w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-1.5 text-center text-t-2xs tabular-nums text-ink placeholder:text-ink-faint focus:border-brand"
        />
    );
}
