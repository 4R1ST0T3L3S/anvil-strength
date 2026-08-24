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
import { PeriodSelector } from '../../../components/ui/PeriodSelector';
import { dentroDelPeriodo, reglaDe, usePeriodo } from '../../../lib/period';
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

/**
 * EL ÁMBITO YA NO INCLUYE EL TIEMPO.
 *
 * Antes este selector mezclaba dos ejes en uno: "progresión general / un
 * macrociclo / un bloque". Los dos extremos son PERIODOS —todo el historial,
 * o el rango de un bloque— y el de en medio es un agrupamiento.
 *
 * Ahora el tiempo lo lleva `PeriodSelector`, que además ofrece lo que aquí
 * no había forma de pedir: esta semana, este mes, las últimas cuatro. El
 * macrociclo se queda como lo que es, un filtro por pertenencia.
 */
type Scope =
    | { kind: 'all' }
    | { kind: 'macro'; id: string };

/**
 * Colores de las líneas por músculo.
 *
 * Salen de los tokens y no de una paleta propia: diez colores inventados aquí
 * serían un segundo sistema de color viviendo dentro de recharts. El orden
 * está pensado para que los cuatro primeros —que son los músculos con más
 * volumen— se distingan también en escala de grises y para quien no separa
 * rojo de verde.
 */
const MUSCLE_COLORS = [
    'var(--brand)',
    'var(--info)',
    'var(--success)',
    'var(--warning)',
    'var(--effort-high)',
    'var(--ink-muted)',
    'var(--brand-line)',
    'var(--info-quiet)',
    'var(--ink-subtle)',
    'var(--success-quiet)',
];

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

    /**
     * Los bloques que hay en el historial, en el formato que entiende el
     * módulo de periodo. `start_week`/`end_week` se deducen de las semanas
     * que aparecen: el historial no trae los límites del bloque, trae las
     * sesiones que se hicieron dentro.
     */
    const bloquesTemporales = useMemo(() => blocks.map((b) => {
        const semanas = history.filter((r) => r.blockId === b.id).map((r) => r.weekNumber);
        return {
            id: b.id,
            name: b.name,
            start_week: semanas.length ? Math.min(...semanas) : null,
            end_week: semanas.length ? Math.max(...semanas) : null,
            start_date: history.find((r) => r.blockId === b.id)?.blockStartDate ?? null,
        };
    }), [blocks, history]);

    const { periodo, resuelto, cambiar, opciones } = usePeriodo('volumen', { bloques: bloquesTemporales });

    /**
     * FILTRADO POR PERIODO, en dos modos.
     *
     * Cuando el periodo se ha podido resolver contra el calendario, se filtra
     * por la FECHA de la sesión. Si una sesión no tiene fecha —las hay— se
     * conserva: esconder trabajo que sí ocurrió porque falta un dato de
     * calendario sería peor que enseñarlo de más.
     *
     * En modo ordinal (un bloque sin fecha de inicio, decisión K10) no hay
     * calendario contra el que filtrar, así que se filtra por bloque, que es
     * lo único que se sabe con certeza.
     */
    const filtered = useMemo(() => {
        let filas = history;

        if (scope.kind === 'macro') filas = filas.filter((r) => r.macroId === scope.id);

        if (periodo.tipo === 'bloque' && periodo.blockId) {
            filas = filas.filter((r) => r.blockId === periodo.blockId);
        } else if (resuelto.resolucion === 'calendar' && (resuelto.desde || resuelto.hasta)) {
            filas = filas.filter((r) => (r.date ? dentroDelPeriodo(r.date, resuelto) : true));
        }

        return filas;
    }, [history, scope, periodo, resuelto]);

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
                // La clasificación que fijó el coach viaja con la fila: sin
                // esto, esta pantalla y el planificador darían repartos
                // distintos del mismo bloque y no habría forma de saber cuál
                // creerse.
                primary_muscles: r.primaryMuscles,
                secondary_muscles: r.secondaryMuscles,
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

    /**
     * Los músculos que se representan, ordenados por volumen total.
     *
     * Se limita a diez porque una barra por cada uno de los diecisiete
     * grupos convierte la gráfica en una lista ilegible, y los siete
     * últimos son siempre residuales.
     */
    const topMuscles = useMemo(
        () => averages.slice(0, 10).map((a) => a.muscle),
        [averages]
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

    /**
     * SERIES DIRECTAS POR MÚSCULO Y POR SEMANA.
     *
     * Lo que había era la MEDIA de todas las semanas del ámbito, y una media
     * esconde justo lo que se quiere ver: un bloque que sube de 10 a 22 series
     * de cuádriceps y otro que se queda clavado en 16 dan los mismos 16 de
     * media. La progresión de volumen es el diseño del mesociclo; la media es
     * su resumen menos informativo.
     */
    const weeklyByMuscle = useMemo(
        () =>
            weekly.map((w) => {
                const row: Record<string, string | number> = { semana: `S${w.week}` };
                for (const muscle of topMuscles) {
                    const entry = w.report.byMuscle.find((m) => m.muscle === muscle);
                    row[muscle] = entry ? entry.direct : 0;
                }
                return row;
            }),
        [weekly, topMuscles]
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
                        scope.kind === 'all' ? 'all' : `macro:${scope.id}`
                    }
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'all') return setScope({ kind: 'all' });
                        setScope({ kind: 'macro', id: v.slice('macro:'.length) });
                    }}
                    aria-label="Macrociclo"
                    className="rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                    <option value="all">Todos los macrociclos</option>
                    {macros.map((m) => (
                        <option key={m.id} value={`macro:${m.id}`}>
                            {m.name}
                        </option>
                    ))}
                </select>

                {/* EL PERIODO. Va primero en el orden de lectura porque es la
                    pregunta que se hace antes: "¿de cuándo?" y luego "¿de
                    quién?". Su estado vive en la URL, así que este enlace se
                    puede pegar en un mensaje y el otro ve lo mismo. */}
                <PeriodSelector
                    opciones={opciones}
                    valor={periodo}
                    onChange={cambiar}
                    bloques={bloquesTemporales}
                    resuelto={resuelto}
                    nota={reglaDe('volumen').nota}
                />

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
                            {/* Series y tonelaje van en ejes separados: una cuenta
                                decenas y la otra toneladas, y compartir un solo eje
                                aplastaba la que tuviera el rango más pequeño. */}
                            <YAxis
                                yAxisId="series"
                                tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                yAxisId="tonelaje"
                                orientation="right"
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
                                yAxisId="series"
                                type="monotone"
                                dataKey="series"
                                name="Series"
                                stroke="var(--brand)"
                                strokeWidth={2}
                                dot={{ r: 2.5 }}
                            />
                            <Line
                                yAxisId="tonelaje"
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

            {/* SERIES DIRECTAS SEMANA A SEMANA.
                Va ANTES del reparto medio porque es la pregunta principal:
                cómo progresa el volumen dentro del bloque. La media queda
                debajo, como resumen. */}
            <section>
                <h4 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Series directas por semana
                </h4>
                <p className="mb-3 text-xs text-ink-subtle">
                    Cada línea es un grupo muscular. Es donde se ve si el bloque
                    progresa, se estanca o descarga.
                </p>

                {weeklyByMuscle.length < 2 ? (
                    <p className="py-8 text-center text-xs text-ink-subtle">
                        Hacen falta al menos dos semanas para dibujar una progresión.
                    </p>
                ) : (
                    <>
                        <div className="h-64 w-full">
                            <ResponsiveContainer>
                                <LineChart data={weeklyByMuscle} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
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
                                        width={32}
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
                                    {topMuscles.map((muscle, i) => (
                                        <Line
                                            key={muscle}
                                            type="monotone"
                                            dataKey={muscle}
                                            name={muscle}
                                            stroke={MUSCLE_COLORS[i % MUSCLE_COLORS.length]}
                                            strokeWidth={2}
                                            dot={{ r: 2 }}
                                            connectNulls
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* La tabla no es redundante con la gráfica: diez líneas
                            superpuestas dicen la FORMA, y para leer "22 series de
                            cuádriceps en la semana 3" hace falta el número. */}
                        <div className="mt-3 -mx-1 overflow-x-auto">
                            <table className="w-full min-w-[28rem] border-collapse text-xs">
                                <thead>
                                    <tr className="text-ink-subtle">
                                        <th className="sticky left-0 bg-surface-canvas px-2 py-1.5 text-left font-medium">
                                            Músculo
                                        </th>
                                        {weekly.map((w) => (
                                            <th key={w.week} className="px-2 py-1.5 text-right font-medium tabular-nums">
                                                S{w.week}
                                            </th>
                                        ))}
                                        <th className="px-2 py-1.5 text-right font-medium">Rango</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topMuscles.map((muscle, i) => {
                                        const ref = WEEKLY_SET_REFERENCE[muscle];
                                        return (
                                            <tr key={muscle} className="border-t border-[var(--border-subtle)]">
                                                <td className="sticky left-0 bg-surface-canvas px-2 py-1.5 text-ink">
                                                    <span className="flex items-center gap-1.5">
                                                        <span
                                                            className="h-2 w-2 shrink-0 rounded-pill"
                                                            style={{ background: MUSCLE_COLORS[i % MUSCLE_COLORS.length] }}
                                                            aria-hidden="true"
                                                        />
                                                        {muscle}
                                                    </span>
                                                </td>
                                                {weekly.map((w) => {
                                                    const value = Number(weeklyByMuscle.find(r => r.semana === `S${w.week}`)?.[muscle] ?? 0);
                                                    // El color sale de comparar con el rango
                                                    // SEMANAL, que es la unidad en la que
                                                    // están definidas las referencias.
                                                    const tone =
                                                        // `subtle` y no `faint`: un cero es un DATO
                                                        // de la tabla, y --ink-faint da 2,6:1.
                                                        value === 0 ? 'text-ink-subtle'
                                                            : value < ref.min ? 'text-info'
                                                                : value > ref.max ? 'text-warning'
                                                                    : 'text-ink-muted';
                                                    return (
                                                        <td key={w.week} className={cn('px-2 py-1.5 text-right tabular-nums', tone)}>
                                                            {value || '—'}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-2 py-1.5 text-right tabular-nums text-ink-subtle">
                                                    {ref.min}–{ref.max}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>

            {/* Reparto por músculo */}
            <section>
                <h4 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Series por grupo muscular
                </h4>
                <p className="mb-3 text-xs text-ink-subtle">
                    Media semanal del ámbito elegido. Directas sólidas, indirectas
                    atenuadas (también cuentan 1).
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
                <p className="mt-3 text-xs text-ink-subtle">
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
