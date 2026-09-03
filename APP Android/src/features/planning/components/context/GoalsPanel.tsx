import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Target, Plus, Trash2, CheckCircle2, X } from 'lucide-react';
import { ContextSection, ContextEmpty } from './ContextSection';
import { goalsService } from '../../../../services/goalsService';
import {
    resolveGoalComparison, goalIsAchieved,
    type TrainingGoal, type GoalMetric, type GoalSide,
} from '../../../../lib/planning/goals';
import { buildRepMaxIndex, type RepMax } from '../../../../lib/stats/repMaxes';
import type { LoggedSession } from '../../../../services/trainingService';
import { TARGET_METRICS } from '../../../../types/training';

/**
 * OBJETIVOS DE PROGRAMACIÓN
 * =====================================================================
 *
 * Decisiones cerradas del 30 de agosto de 2026:
 *   - Estructurado (series, reps, métrica, valor), no texto libre — F2.
 *   - Programado / realizado / marca, las TRES columnas, con lo programado
 *     como prioritaria — F4.
 *   - Series, reps y valor se comparan por SEPARADO, nunca en un único
 *     porcentaje — F3.
 *   - Se marca cumplido SOLO, nunca a mano — F5.
 *   - El atleta no ve nada de esto — F6. Por eso este panel vive aquí, en
 *     el centro de contexto del COACH, y no en ninguna pantalla del atleta.
 *
 * Esta pantalla crea objetivos atados a ESTE BLOQUE, o sin ámbito (del
 * atleta, sin fecha). Atarlos a un macrociclo concreto es un caso que el
 * modelo ya admite (`training_goals.macro_id`) pero que esta pantalla no
 * ofrece todavía — no hacía falta para el caso que motivó el encargo
 * ("Bloque 4, objetivo 1…").
 */

interface GoalsPanelProps {
    athleteId: string;
    coachId: string | null;
    blockId: string;
    /** Mismo registro que ya carga `PreviousWeekSummary`: trae target_* y actual_* de las sesiones recientes. */
    logged: LoggedSession[];
    marks: RepMax[];
}

export function GoalsPanel({ athleteId, coachId, blockId, logged, marks }: GoalsPanelProps) {
    const queryClient = useQueryClient();
    const [creating, setCreating] = useState(false);

    const queryKey = ['objetivos', athleteId, blockId] as const;
    const query = useQuery({
        queryKey,
        queryFn: () => goalsService.listForAthlete(athleteId, { blockId }),
        staleTime: 30 * 1000,
    });

    const repMaxIndex = useMemo(() => buildRepMaxIndex(marks), [marks]);
    const goals = query.data ?? [];

    const invalidate = () => queryClient.invalidateQueries({ queryKey });

    return (
        <ContextSection
            icon={Target}
            title="Objetivos"
            badge={goals.length > 0 ? goals.length : undefined}
            hint={
                query.isLoading
                    ? 'Cargando…'
                    : goals.length === 0
                        ? 'Sin objetivos en este bloque'
                        : `${goals.filter(g => g.achieved_at).length} de ${goals.length} cumplidos`
            }
        >
            <div className="space-y-2.5">
                {query.isLoading ? (
                    <ContextEmpty>Cargando objetivos…</ContextEmpty>
                ) : goals.length === 0 && !creating ? (
                    <ContextEmpty>
                        Todavía no hay ningún objetivo en este bloque. Define hacia dónde
                        llevas a este atleta en un movimiento.
                    </ContextEmpty>
                ) : (
                    <ul className="space-y-2">
                        {goals.map(goal => (
                            <GoalRow
                                key={goal.id}
                                goal={goal}
                                logged={logged}
                                repMaxIndex={repMaxIndex}
                                onChanged={invalidate}
                            />
                        ))}
                    </ul>
                )}

                {creating ? (
                    <NewGoalForm
                        athleteId={athleteId}
                        coachId={coachId}
                        blockId={blockId}
                        onCancel={() => setCreating(false)}
                        onCreated={() => { setCreating(false); invalidate(); }}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-field border border-dashed border-[var(--border-default)] py-2 text-t-2xs font-bold uppercase tracking-wide text-ink-subtle transition-colors duration-fast ease-snap hover:border-brand/50 hover:text-brand-text"
                    >
                        <Plus size={13} aria-hidden="true" />
                        Nuevo objetivo
                    </button>
                )}
            </div>
        </ContextSection>
    );
}

// =====================================================================

function GoalRow({
    goal, logged, repMaxIndex, onChanged,
}: {
    goal: TrainingGoal;
    logged: LoggedSession[];
    repMaxIndex: ReturnType<typeof buildRepMaxIndex>;
    onChanged: () => void;
}) {
    const comparison = useMemo(
        () => resolveGoalComparison(goal, logged, repMaxIndex),
        [goal, logged, repMaxIndex]
    );
    const cumplidoAhora = !goal.achieved_at && goalIsAchieved(goal, comparison);

    // Se marca en cuanto la comparación lo detecta cumplido — F5, "solo".
    // El `if` de `achieved_at` en el propio servicio evita reescribirlo si
    // dos vistas lo disparan a la vez.
    useEffect(() => {
        if (!cumplidoAhora) return;
        goalsService
            .markAchievedIfPending(goal.id, new Date().toISOString())
            .then(onChanged)
            .catch(err => console.error('No se pudo marcar el objetivo como cumplido:', err));
    }, [cumplidoAhora, goal.id, onChanged]);

    const handleRemove = async () => {
        try {
            await goalsService.remove(goal.id);
            onChanged();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo borrar el objetivo');
        }
    };

    const unidad = TARGET_METRICS.find(m => m.key === goal.metric)?.unit ?? '';
    const cumplido = !!goal.achieved_at || cumplidoAhora;

    return (
        <li className={`rounded-field border p-2.5 ${cumplido ? 'border-[var(--success)]/30 bg-[var(--success-quiet)]' : 'border-[var(--border-subtle)] bg-surface-sunken'}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-t-xs font-black uppercase tracking-wide text-ink">
                        {cumplido && <CheckCircle2 size={12} className="shrink-0 text-success" aria-hidden="true" />}
                        {goal.exercise_name}
                    </p>
                    <p className="mt-0.5 text-t-2xs tabular-nums text-ink-subtle">
                        {goal.sets}×{goal.reps} · {goal.value}{unidad}
                    </p>
                </div>
                <button
                    onClick={handleRemove}
                    aria-label={`Borrar objetivo de ${goal.exercise_name}`}
                    className="shrink-0 text-ink-faint transition-colors duration-fast hover:text-danger-text"
                >
                    <Trash2 size={13} aria-hidden="true" />
                </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
                <ComparisonCell label="Programado" side={comparison.programado} unidad={unidad} />
                <ComparisonCell label="Realizado" side={comparison.realizado} unidad={unidad} />
                <ComparisonCell label="Marca" side={comparison.marca} unidad={unidad} />
            </div>
        </li>
    );
}

function ComparisonCell({ label, side, unidad }: { label: string; side: GoalSide | null; unidad: string }) {
    if (!side || side.valor == null) {
        return (
            <div className="rounded bg-surface-overlay/50 px-1.5 py-1 text-center">
                <p className="text-t-2xs uppercase tracking-wide text-ink-faint">{label}</p>
                <p className="text-t-2xs text-ink-faint">—</p>
            </div>
        );
    }

    const tone = side.deltaValorPct == null
        ? 'text-ink-muted'
        : side.deltaValorPct >= 0 ? 'text-success' : 'text-warning';

    return (
        <div className="rounded bg-surface-overlay/50 px-1.5 py-1 text-center" title={`${side.sets}×${side.reps ?? '?'}`}>
            <p className="text-t-2xs uppercase tracking-wide text-ink-faint">{label}</p>
            <p className={`text-t-xs font-bold tabular-nums ${tone}`}>
                {side.valor}{unidad}
            </p>
            {side.deltaValorPct != null && (
                <p className={`text-t-2xs tabular-nums ${tone}`}>
                    {side.deltaValorPct >= 0 ? '+' : ''}{side.deltaValorPct}%
                </p>
            )}
        </div>
    );
}

// =====================================================================

function NewGoalForm({
    athleteId, coachId, blockId, onCancel, onCreated,
}: {
    athleteId: string;
    coachId: string | null;
    blockId: string;
    onCancel: () => void;
    onCreated: () => void;
}) {
    const [name, setName] = useState('');
    const [sets, setSets] = useState('5');
    const [reps, setReps] = useState('5');
    const [metric, setMetric] = useState<GoalMetric>('kg');
    const [value, setValue] = useState('');
    const [scoped, setScoped] = useState(true);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const setsN = Number.parseInt(sets, 10);
        const repsN = Number.parseInt(reps, 10);
        const valueN = Number.parseFloat(value.replace(',', '.'));

        if (!name.trim()) { toast.error('Falta el ejercicio'); return; }
        if (!Number.isFinite(setsN) || setsN <= 0) { toast.error('Series no válidas'); return; }
        if (!Number.isFinite(repsN) || repsN <= 0) { toast.error('Repeticiones no válidas'); return; }
        if (!Number.isFinite(valueN) || valueN <= 0) { toast.error('Valor no válido'); return; }

        setSaving(true);
        try {
            await goalsService.create({
                coachId: coachId ?? '',
                athleteId,
                blockId: scoped ? blockId : null,
                exerciseName: name.trim(),
                sets: setsN,
                reps: repsN,
                metric,
                value: valueN,
            });
            onCreated();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo crear el objetivo');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-2 rounded-field border border-[var(--border-default)] bg-surface-sunken p-2.5">
            <div className="flex items-center justify-between">
                <p className="text-t-2xs font-black uppercase tracking-widest text-ink-subtle">Nuevo objetivo</p>
                <button type="button" onClick={onCancel} aria-label="Cancelar" className="text-ink-faint hover:text-ink">
                    <X size={14} aria-hidden="true" />
                </button>
            </div>

            <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ejercicio (p. ej. Sentadilla)"
                className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-canvas px-2.5 text-t-xs text-ink placeholder:text-ink-faint focus:border-brand"
                autoFocus
            />

            <div className="grid grid-cols-4 gap-1.5">
                <input
                    value={sets}
                    onChange={e => setSets(e.target.value)}
                    inputMode="numeric"
                    aria-label="Series"
                    placeholder="Series"
                    className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-canvas px-1.5 text-center text-t-xs tabular-nums text-ink focus:border-brand"
                />
                <input
                    value={reps}
                    onChange={e => setReps(e.target.value)}
                    inputMode="numeric"
                    aria-label="Repeticiones"
                    placeholder="Reps"
                    className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-canvas px-1.5 text-center text-t-xs tabular-nums text-ink focus:border-brand"
                />
                <select
                    value={metric}
                    onChange={e => setMetric(e.target.value as GoalMetric)}
                    aria-label="Métrica"
                    className="col-span-1 h-9 w-full appearance-none rounded-field border border-[var(--border-default)] bg-surface-canvas px-1 text-center text-t-2xs font-bold text-ink focus:border-brand"
                >
                    {(['kg', 'rpe', 'rir', 'vel', 'vel_loss'] as GoalMetric[]).map(m => (
                        <option key={m} value={m} className="bg-surface-canvas text-ink">{m}</option>
                    ))}
                </select>
                <input
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    inputMode="decimal"
                    aria-label="Valor"
                    placeholder="Valor"
                    className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-canvas px-1.5 text-center text-t-xs tabular-nums text-ink focus:border-brand"
                />
            </div>

            <label className="flex items-center gap-2 text-t-2xs text-ink-subtle">
                <input
                    type="checkbox"
                    checked={scoped}
                    onChange={e => setScoped(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[var(--border-default)] accent-[var(--brand)]"
                />
                Solo para este bloque (si no, es un objetivo general del atleta)
            </label>

            <button
                type="submit"
                disabled={saving}
                className="flex h-9 w-full items-center justify-center rounded-field bg-brand text-t-xs font-bold uppercase tracking-wide text-brand-ink transition-colors duration-fast disabled:opacity-60"
            >
                {saving ? 'Guardando…' : 'Crear objetivo'}
            </button>
        </form>
    );
}
