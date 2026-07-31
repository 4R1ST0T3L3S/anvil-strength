import { useMemo, useState } from 'react';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { Info } from 'lucide-react';
import type { ExerciseHistoryRow } from '../../../services/trainingService';
import type { Macrocycle } from '../../../types/training';
import {
    computeVolume,
    computeWeeklySeries,
    weeklyAverages,
    type VolumeSessionInput,
    type VolumeSource,
} from '../../../lib/volume/engine';
import { WEEKLY_SET_REFERENCE } from '../../../lib/volume/muscles';
import { cn } from '../../../lib/utils';

/**
 * Progresión de volumen de un atleta.
 *
 * Cuatro alturas de lectura, que responden a preguntas distintas:
 *   General    — ¿cómo ha evolucionado desde que entrena aquí?
 *   Macrociclo — ¿cómo se reparte la carga de cara a la competición?
 *   Bloque     — ¿la progresión dentro del mesociclo es la prevista?
 *
 * Dos fuentes, y la distinción no es un detalle:
 *   Prescrito — lo que el coach programó.
 *   Realizado — lo que el atleta registró de verdad.
 * La diferencia entre ambas ES el dato de adherencia.
 */

type Scope =
    | { kind: 'all' }
    | { kind: 'macro'; id: string }
    | { kind: 'block'; id: string };

export interface AthleteVolumeTabProps {
    history: ExerciseHistoryRow[];
    macros: Macrocycle[];
}

export function AthleteVolumeTab({ history, macros }: AthleteVolumeTabProps) {
    const [scope, setScope] = useState<Scope>({ kind: 'all' });
    const [source, setSource] = useState<VolumeSource>('planned');

    /** Bloques presentes en el historial, del más reciente al más antiguo. */
    const blocks = useMemo(() => {
        const seen = new Map<string, { id: string; name: string; macroId: string | null }>();
        for (const r of history) {
            if (!seen.has(r.blockId)) {
                seen.set(r.blockId, { id: r.blockId, name: r.blockName, macroId: r.macroId });
            }
        }
        return [...seen.values()];
    }, [history]);

    const filtered = useMemo(() => {
        if (scope.kind === 'macro') return history.filter((r) => r.macroId === scope.id);
        if (scope.kind === 'block') return history.filter((r) => r.blockId === scope.id);
        return history;
    }, [history, scope]);

    /**
     * El historial llega como filas de ejercicio; el motor trabaja con
     * sesiones. Se reagrupan por sessionId.
     *
     * `week_number` se hace único por bloque (`blockId#week`) solo a efectos
     * de ordenación en el eje X: dos bloques distintos tienen ambos una
     * "semana 1" y sumarlas juntas mezclaría mesociclos.
     */
    const sessions: VolumeSessionInput[] = useMemo(() => {
        const map = new Map<string, VolumeSessionInput>();
        const weekKeys: string[] = [];

        for (const r of filtered) {
            const key = `${r.blockId}#${r.weekNumber}`;
            if (!weekKeys.includes(key)) weekKeys.push(key);
        }
        weekKeys.sort();

        for (const r of filtered) {
            const weekIndex = weekKeys.indexOf(`${r.blockId}#${r.weekNumber}`) + 1;
            let s = map.get(r.sessionId);
            if (!s) {
                s = {
                    id: r.sessionId,
                    week_number: weekIndex,
                    day_number: r.dayNumber,
                    exercises: [],
                };
                map.set(r.sessionId, s);
            }
            s.exercises.push({
                id: r.sessionExerciseId,
                exercise: { name: r.exerciseName, muscle_group: null },
                variant_name: r.variantName,
                sets: r.sets,
            });
        }

        return [...map.values()];
    }, [filtered]);

    const report = useMemo(() => computeVolume(sessions, source), [sessions, source]);
    const weekly = useMemo(() => computeWeeklySeries(sessions, source), [sessions, source]);
    const averages = useMemo(
        () => weeklyAverages(report).sort((a, b) => b.total - a.total),
        [report]
    );

    const weekChart = useMemo(
        () =>
            weekly.map((w) => ({
                semana: `S${w.week}`,
                series: w.report.totalSets,
                tonelaje: Math.round(w.report.totalTonnage / 1000),
            })),
        [weekly]
    );

    const muscleChart = useMemo(
        () =>
            averages.slice(0, 10).map((a) => ({
                musculo: a.muscle,
                directo: a.perWeek,
                indirecto: Math.round((a.indirect / report.weekCount) * 10) / 10,
                min: WEEKLY_SET_REFERENCE[a.muscle].min,
            })),
        [averages, report.weekCount]
    );

    if (history.length === 0) {
        return (
            <p className="py-12 text-center text-sm text-ink-subtle">
                Este atleta todavía no tiene sesiones programadas.
            </p>
        );
    }

    return (
        <div className="space-y-6">
            {/* Controles */}
            <div className="flex flex-wrap items-center gap-3">
                <select
                    value={
                        scope.kind === 'all' ? 'all' : `${scope.kind}:${scope.id}`
                    }
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'all') return setScope({ kind: 'all' });
                        const [kind, id] = v.split(':');
                        setScope({ kind: kind as 'macro' | 'block', id });
                    }}
                    aria-label="Ámbito"
                    className="rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                    <option value="all">Progresión general</option>
                    {macros.length > 0 && (
                        <optgroup label="Macrociclos">
                            {macros.map((m) => (
                                <option key={m.id} value={`macro:${m.id}`}>
                                    {m.name}
                                </option>
                            ))}
                        </optgroup>
                    )}
                    <optgroup label="Bloques / mesociclos">
                        {blocks.map((b) => (
                            <option key={b.id} value={`block:${b.id}`}>
                                {b.name}
                            </option>
                        ))}
                    </optgroup>
                </select>

                <div className="flex rounded-field bg-surface-sunken p-0.5">
                    {(
                        [
                            ['planned', 'Prescrito'],
                            ['actual', 'Realizado'],
                        ] as const
                    ).map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setSource(value)}
                            aria-pressed={source === value}
                            className={cn(
                                'rounded-chip px-3 py-1.5 text-xs font-semibold transition-colors duration-fast ease-snap',
                                source === value
                                    ? 'bg-brand text-brand-ink'
                                    : 'text-ink-subtle hover:text-ink'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Cifras de cabecera */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Series totales" value={report.totalSets.toString()} />
                <Stat
                    label="Series / semana"
                    value={(Math.round((report.totalSets / report.weekCount) * 10) / 10).toString()}
                />
                <Stat
                    label="Tonelaje"
                    value={
                        report.totalTonnage > 0
                            ? `${(report.totalTonnage / 1000).toFixed(1)} t`
                            : '—'
                    }
                />
                <Stat label="Semanas" value={report.weekCount.toString()} />
            </div>

            {source === 'actual' && report.totalSets === 0 && (
                <p className="flex items-start gap-2 rounded-field bg-[var(--info-quiet)] px-3 py-2.5 text-xs text-info">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                    No hay series registradas en este ámbito. El atleta no ha
                    anotado sus levantamientos, o el bloque todavía no ha empezado.
                </p>
            )}

            {/* Progresión semanal */}
            <section>
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Progresión semanal
                </h4>
                <div className="h-56 w-full">
                    <ResponsiveContainer>
                        <LineChart data={weekChart} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                            <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                            <XAxis
                                dataKey="semana"
                                tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--surface-overlay)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: 12,
                                }}
                                labelStyle={{ color: 'var(--ink)' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="series"
                                name="Series"
                                stroke="var(--brand)"
                                strokeWidth={2}
                                dot={{ r: 2.5 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="tonelaje"
                                name="Tonelaje (t)"
                                stroke="var(--info)"
                                strokeWidth={2}
                                dot={{ r: 2.5 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </section>

            {/* Reparto por músculo */}
            <section>
                <h4 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Series por grupo muscular
                </h4>
                <p className="mb-3 text-xs text-ink-subtle">
                    Media semanal. Directas sólidas, indirectas atenuadas (también cuentan 1).
                </p>
                <div className="h-72 w-full">
                    <ResponsiveContainer>
                        <BarChart
                            data={muscleChart}
                            layout="vertical"
                            margin={{ top: 4, right: 12, bottom: 0, left: 12 }}
                        >
                            <CartesianGrid stroke="var(--border-subtle)" horizontal={false} />
                            <XAxis
                                type="number"
                                tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                type="category"
                                dataKey="musculo"
                                width={96}
                                tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: 'var(--border-subtle)' }}
                                contentStyle={{
                                    background: 'var(--surface-overlay)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: 12,
                                }}
                            />
                            <Bar dataKey="directo" name="Directas" stackId="v" fill="var(--brand)" />
                            <Bar
                                dataKey="indirecto"
                                name="Indirectas"
                                stackId="v"
                                fill="var(--brand-line)"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </section>

            {/* Lectura frente a las referencias */}
            <section>
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Frente a las referencias semanales
                </h4>
                <ul className="grid gap-2 sm:grid-cols-2">
                    {averages.map((a) => (
                        <li
                            key={a.muscle}
                            className="flex items-center justify-between gap-3 rounded-field bg-surface-raised px-3 py-2 text-xs"
                        >
                            <span className="text-ink">{a.muscle}</span>
                            <span className="flex items-center gap-2">
                                <span className="text-ink-muted">
                                    {a.perWeek} / sem
                                </span>
                                <VerdictTag verdict={a.verdict} />
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs text-ink-faint">
                    Los rangos son orientativos de hipertrofia. En un bloque de pico
                    es normal y correcto estar por debajo: sirven de contexto, no de
                    aprobado.
                </p>
            </section>

            {report.unclassified.length > 0 && (
                <p className="flex items-start gap-2 rounded-field bg-surface-sunken px-3 py-2.5 text-xs text-ink-subtle">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>
                        Fuera del reparto por no estar clasificados:{' '}
                        <span className="text-ink-muted">{report.unclassified.join(', ')}</span>
                    </span>
                </p>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-card bg-surface-raised px-3 py-2.5">
            <p className="text-t-2xs uppercase tracking-wide text-ink-subtle">{label}</p>
            <p className="mt-0.5 text-xl font-semibold text-ink">{value}</p>
        </div>
    );
}

function VerdictTag({ verdict }: { verdict: 'below' | 'in-range' | 'above' | 'none' }) {
    if (verdict === 'none') return null;

    const map = {
        below: { label: 'Bajo', className: 'bg-[var(--info-quiet)] text-info' },
        'in-range': { label: 'En rango', className: 'bg-[var(--success-quiet)] text-success' },
        above: { label: 'Alto', className: 'bg-[var(--warning-quiet)] text-warning' },
    } as const;

    const { label, className } = map[verdict];
    return (
        <span className={cn('rounded-chip px-1.5 py-0.5 text-t-2xs font-semibold', className)}>
            {label}
        </span>
    );
}
