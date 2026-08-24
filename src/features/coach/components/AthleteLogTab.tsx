import { useEffect, useMemo, useState } from 'react';
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    AlertTriangle, Check, ChevronDown, ClipboardList, Loader, MessageSquareText,
    Minus, Pencil, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trainingService, type LoggedSession, type LoggedSet } from '../../../services/trainingService';
import {
    adherenceByExercise, buildFlags, collectDeviations, exerciseNames, prescribedKg,
    prescribedReps, prescribedRpe, scopeToExercise, summarizeSession, weeklyExecution,
    acuteChronicRatio,
    type DeviationRow, type Flag,
} from '../../../lib/stats/executionLog';
import { weekdayLabel } from '../../../types/training';
import { cn } from '../../../lib/utils';

/**
 * REGISTRO: QUÉ HIZO EL ATLETA
 * =====================================================================
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * El entrenador programaba a ciegas. La aplicación guardaba desde siempre lo
 * que el atleta registraba —repeticiones, kilos, RPE y notas por serie— pero
 * no había NINGUNA pantalla donde leerlo. Un atleta bajaba de 300 a 280 en la
 * prensa, lo anotaba, y esa información no salía por ninguna parte: el coach
 * escribía la semana siguiente con la prescripción de la anterior como única
 * referencia.
 *
 * QUÉ NO HACE, Y ES DELIBERADO
 *
 * No modifica el plan. Si el coach pautó RPE 8 y el atleta hizo 7-9-9, el
 * plan sigue diciendo 8 y aquí se ve 7-9-9. Reescribir la prescripción con lo
 * ejecutado destruiría la única comparación que tiene valor.
 *
 * CUATRO VISTAS, CUATRO PREGUNTAS
 *
 *   Sesiones     — ¿cómo le fue AYER? Es la consulta del martes por la mañana.
 *   Desviaciones — ¿dónde se ha separado de lo pautado, y cuánto?
 *   Ejercicios   — ¿qué movimiento va bien y cuál se atasca?
 *   Carga        — ¿cómo evoluciona el trabajo semana a semana?
 */

type LogTab = 'sesiones' | 'desviaciones' | 'ejercicios' | 'carga';

const TABS: [LogTab, string][] = [
    ['sesiones', 'Sesiones'],
    ['desviaciones', 'Desviaciones'],
    ['ejercicios', 'Por ejercicio'],
    ['carga', 'Carga'],
];

const AXIS = { fill: 'var(--ink-subtle)', fontSize: 11 };
const GRID = 'var(--border-subtle)';
const TOOLTIP = {
    background: 'var(--surface-overlay)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    fontSize: 12,
    color: 'var(--ink)',
};

export function AthleteLogTab({ athleteId }: { athleteId: string }) {
    const [sessions, setSessions] = useState<LoggedSession[]>([]);
    /**
     * EL ENTRENADOR PUEDE CORREGIR LO QUE EL ATLETA REGISTRÓ.
     *
     * `sets_coach_all` (database/FIX_TIMEOUT_SERIES.sql) ya le da al coach
     * dueño del bloque permiso de UPDATE sobre `training_sets` — no hacía
     * falta ninguna migración nueva, solo la interfaz para usarlo. Esto NO
     * toca el plan: solo `actual_reps`/`actual_load`/`actual_rpe`, exactamente
     * los mismos campos que escribe el atleta desde el registro. Sirve para
     * el caso que motivó el pedido: el atleta se equivoca al anotar y el
     * coach lo arregla sin tener que pedirle que vuelva a entrar.
     */
    const applySetPatch = (sessionId: string, exerciseId: string, setId: string, patch: Partial<LoggedSet>) => {
        setSessions(prev => prev.map(session => {
            if (session.id !== sessionId) return session;
            return {
                ...session,
                exercises: session.exercises.map(ex => {
                    if (ex.id !== exerciseId) return ex;
                    return { ...ex, sets: ex.sets.map(s => (s.id === setId ? { ...s, ...patch } : s)) };
                }),
            };
        }));
    };
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<LogTab>('sesiones');
    const [blockFilter, setBlockFilter] = useState<string>('all');
    /**
     * Ejercicio al que se acota TODA la pantalla. `all` = el bloque entero.
     *
     * Vive aquí arriba y no dentro de la pestaña "Por ejercicio" a propósito:
     * lo que el coach quiere saber es "cómo va la sentadilla", y eso incluye
     * su tonelaje semanal, sus desviaciones y sus avisos, no solo una fila de
     * una tabla. Ver `scopeToExercise`.
     */
    const [exerciseFilter, setExerciseFilter] = useState<string>('all');

    useEffect(() => {
        let alive = true;

        // El estado se toca solo DESPUÉS de la petición, nunca en el cuerpo
        // del efecto: hacerlo de forma síncrona provoca un render en cascada
        // (y `loading` ya arranca en `true`, así que tampoco cambiaba nada).
        trainingService.getExecutionLog(athleteId)
            .then(rows => { if (alive) { setSessions(rows); setError(null); } })
            .catch(err => {
                console.error(err);
                if (alive) setError(err instanceof Error ? err.message : 'No se pudo cargar el registro');
            })
            .finally(() => { if (alive) setLoading(false); });

        return () => { alive = false; };
    }, [athleteId]);

    const blocks = useMemo(() => {
        const seen = new Map<string, string>();
        sessions.forEach(s => seen.set(s.blockId, s.blockName));
        return [...seen.entries()].map(([id, name]) => ({ id, name }));
    }, [sessions]);

    /** Las sesiones del bloque elegido. Base de todo lo demás. */
    const byBlock = useMemo(
        () => (blockFilter === 'all' ? sessions : sessions.filter(s => s.blockId === blockFilter)),
        [sessions, blockFilter]
    );

    /**
     * Las opciones del desplegable salen del BLOQUE, no del ámbito ya
     * filtrado: si salieran de `scoped`, al elegir sentadilla el desplegable
     * se quedaría con una sola opción y no habría forma de cambiar.
     */
    const exercises = useMemo(() => exerciseNames(byBlock), [byBlock]);

    /**
     * El ejercicio que de verdad se aplica. Se DERIVA en el render en vez de
     * corregirse en un efecto: cambiar de bloque puede dejar elegido un
     * ejercicio que allí no existe, y sincronizarlo con un `setState` dentro
     * de un efecto pinta un fotograma con la pantalla vacía antes de
     * arreglarse. Aquí, sencillamente, nunca llega a estar mal.
     */
    const activeExercise =
        exerciseFilter !== 'all' && exercises.includes(exerciseFilter) ? exerciseFilter : 'all';

    /**
     * El ámbito del que come TODO lo de abajo. Todo lo que se calcula después
     * —totales, avisos, desviaciones, gráficas de carga y tarjetas de sesión—
     * parte de aquí, así que acotar por ejercicio no exige duplicar ni una
     * sola cuenta.
     */
    const scoped = useMemo(
        () => (activeExercise === 'all' ? byBlock : scopeToExercise(byBlock, activeExercise)),
        [byBlock, activeExercise]
    );

    /**
     * Solo los días CON ALGO REGISTRADO, del más reciente al más antiguo.
     *
     * Un bloque de ocho semanas tiene treinta y dos días programados y puede
     * tener cuatro hechos. Listarlos todos obligaría a bajar por veintiocho
     * tarjetas vacías para llegar a lo que se venía a ver.
     */
    const logged = useMemo(
        () => scoped
            .filter(s => s.exercises.some(e => e.sets.some(
                x => x.isCompleted || x.actualReps != null || x.actualLoad != null
            )) || s.completedAt || s.athleteNotes?.trim())
            .sort((a, b) => b.weekNumber - a.weekNumber || b.dayNumber - a.dayNumber),
        [scoped]
    );

    const byExercise = useMemo(() => adherenceByExercise(scoped), [scoped]);
    const weekly = useMemo(() => weeklyExecution(scoped), [scoped]);
    const deviations = useMemo(() => collectDeviations(scoped), [scoped]);
    const flags = useMemo(() => buildFlags(scoped, byExercise, weekly), [scoped, byExercise, weekly]);
    const acwr = useMemo(() => acuteChronicRatio(weekly), [weekly]);

    const totals = useMemo(() => {
        const summaries = scoped.map(summarizeSession);
        const planned = summaries.reduce((a, s) => a + s.plannedSets, 0);
        const done = summaries.reduce((a, s) => a + s.loggedSets, 0);
        const plannedT = summaries.reduce((a, s) => a + s.plannedTonnage, 0);
        const actualT = summaries.reduce((a, s) => a + s.actualTonnage, 0);
        const rpes = summaries.map(s => s.actualRpe).filter((v): v is number => v != null);

        return {
            planned,
            done,
            pct: planned > 0 ? Math.round((done / planned) * 100) : 0,
            plannedT,
            actualT,
            avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
            sessionsDone: summaries.filter(s => s.loggedSets > 0).length,
        };
    }, [scoped]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader className="animate-spin text-brand-text" size={28} />
            </div>
        );
    }

    if (error) {
        return (
            <p className="mx-auto max-w-lg rounded-card bg-[var(--danger-quiet)] px-4 py-3 text-t-sm text-danger-text">
                {error}
            </p>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className="mx-auto max-w-md py-16 text-center">
                <ClipboardList size={40} className="mx-auto mb-4 text-ink-faint" aria-hidden="true" />
                <h3 className="text-t-lg font-bold text-ink">Sin registro todavía</h3>
                <p className="mt-2 text-t-sm text-ink-subtle">
                    Aquí aparecerá lo que el atleta anote al entrenar: repeticiones, kilos,
                    RPE y sus notas por serie, junto a lo que le pautaste.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Controles + cifras de cabecera */}
            <div className="flex flex-wrap items-center gap-3">
                {blocks.length > 1 && (
                    <select
                        value={blockFilter}
                        onChange={e => setBlockFilter(e.target.value)}
                        aria-label="Bloque"
                        className="rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-t-sm text-ink"
                    >
                        <option value="all">Todos los bloques</option>
                        {blocks.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                )}

                {/* Acota la pantalla ENTERA a un ejercicio: gráficas, avisos,
                    desviaciones y sesiones. "Sentadilla" tiene que significar
                    sentadilla también en el tonelaje semanal, no solo en la
                    tabla de cumplimiento. */}
                {exercises.length > 1 && (
                    <select
                        value={activeExercise}
                        onChange={e => setExerciseFilter(e.target.value)}
                        aria-label="Ejercicio"
                        className={cn(
                            'max-w-[13rem] rounded-field border px-3 py-2 text-t-sm',
                            activeExercise === 'all'
                                ? 'border-[var(--border-default)] bg-surface-raised text-ink'
                                : 'border-[var(--brand-line)] bg-[var(--brand-quiet)] text-brand-text'
                        )}
                    >
                        <option value="all">Todos los ejercicios</option>
                        {exercises.map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                )}

                <div role="tablist" className="flex gap-1 overflow-x-auto rounded-field bg-surface-sunken p-0.5">
                    {TABS.map(([value, label]) => (
                        <button
                            key={value}
                            role="tab"
                            aria-selected={tab === value}
                            onClick={() => setTab(value)}
                            className={cn(
                                'shrink-0 rounded-chip px-3 py-1.5 text-t-xs font-semibold transition-colors duration-fast ease-snap',
                                tab === value ? 'bg-brand text-brand-ink' : 'text-ink-subtle hover:text-ink'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                    label="Cumplimiento"
                    value={`${totals.pct}%`}
                    hint={`${totals.done} de ${totals.planned} series`}
                    tone={totals.pct >= 85 ? 'good' : totals.pct >= 60 ? 'neutral' : 'warn'}
                />
                <Metric
                    label="Tonelaje real"
                    value={totals.actualT > 0 ? `${(totals.actualT / 1000).toFixed(1)} t` : '—'}
                    hint={
                        totals.plannedT > 0
                            ? `${Math.round((totals.actualT / totals.plannedT) * 100)}% de lo pautado`
                            : 'Sin cargas prescritas en kg'
                    }
                />
                <Metric
                    label="RPE real medio"
                    value={totals.avgRpe != null ? String(totals.avgRpe) : '—'}
                    hint="De lo que el atleta anotó, no de lo pautado"
                />
                <Metric
                    label="Sesiones con datos"
                    value={String(totals.sessionsDone)}
                    hint={`De ${scoped.length} programadas`}
                />
            </div>

            {/* Avisos. Van arriba y en todas las pestañas: es lo que hace que
                esta pantalla se abra sin tener que buscar nada. */}
            {flags.length > 0 && (
                <ul className="space-y-2">
                    {flags.map((flag, i) => <FlagRow key={i} flag={flag} />)}
                </ul>
            )}

            {tab === 'sesiones' && (
                <section className="space-y-3">
                    {logged.length === 0 ? (
                        <Empty>Este atleta todavía no ha registrado ninguna sesión de este bloque.</Empty>
                    ) : (
                        logged.map(session => (
                            <SessionCard key={session.id} session={session} onSetPatched={applySetPatch} />
                        ))
                    )}
                </section>
            )}

            {tab === 'desviaciones' && <DeviationsView rows={deviations} />}

            {tab === 'ejercicios' && (
                <section className="space-y-4">
                    <Card
                        title="Cumplimiento por ejercicio"
                        subtitle="La desviación de carga es la media de (movido − pautado) sobre lo pautado. Negativa significa que se está bajando el peso."
                    >
                        {byExercise.length === 0 ? (
                            <Empty>Sin ejercicios registrados.</Empty>
                        ) : (
                            <div className="-mx-1 overflow-x-auto">
                                <table className="w-full min-w-[34rem] border-collapse text-t-xs">
                                    <thead>
                                        <tr className="text-ink-subtle">
                                            <th className="px-2 py-2 text-left font-medium">Ejercicio</th>
                                            <th className="px-2 py-2 text-right font-medium">Series</th>
                                            <th className="px-2 py-2 text-right font-medium">Hechas</th>
                                            <th className="px-2 py-2 text-right font-medium">Δ carga</th>
                                            <th className="px-2 py-2 text-right font-medium">Δ RPE</th>
                                            <th className="px-2 py-2 text-right font-medium">Top</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {byExercise.map(ex => (
                                            <tr key={ex.name} className="border-t border-[var(--border-subtle)]">
                                                <td className="px-2 py-2 text-ink">{ex.name}</td>
                                                <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{ex.plannedSets}</td>
                                                <td className={cn(
                                                    'px-2 py-2 text-right tabular-nums',
                                                    ex.completionPct >= 85 ? 'text-success'
                                                        : ex.completionPct >= 50 ? 'text-ink-muted' : 'text-warning'
                                                )}>
                                                    {ex.loggedSets} <span className="opacity-60">({ex.completionPct}%)</span>
                                                </td>
                                                <td className="px-2 py-2 text-right tabular-nums">
                                                    <Delta value={ex.loadDeltaPct} unit="%" />
                                                </td>
                                                <td className="px-2 py-2 text-right tabular-nums">
                                                    <Delta value={ex.rpeDelta} unit="" invert />
                                                </td>
                                                <td className="px-2 py-2 text-right tabular-nums text-ink-muted">
                                                    {ex.topLoad != null ? `${ex.topLoad} kg` : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    <Card
                        title="Series pautadas frente a registradas"
                        subtitle="La distancia entre las dos barras es el trabajo que se programó y no llegó a hacerse."
                    >
                        {byExercise.length === 0 ? <Empty>Sin datos.</Empty> : (
                            <div className="h-72">
                                <ResponsiveContainer>
                                    <BarChart
                                        data={byExercise.slice(0, 12)}
                                        layout="vertical"
                                        margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
                                    >
                                        <CartesianGrid stroke={GRID} horizontal={false} />
                                        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            width={120}
                                            tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip contentStyle={TOOLTIP} cursor={{ fill: 'var(--border-subtle)' }} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="plannedSets" name="Pautadas" fill="var(--border-strong)" />
                                        <Bar dataKey="loggedSets" name="Registradas" fill="var(--brand)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Card>
                </section>
            )}

            {tab === 'carga' && (
                <section className="space-y-4">
                    <Card
                        title="Tonelaje: pautado frente a movido"
                        subtitle="El área sombreada es lo prescrito; la línea, lo que de verdad se levantó."
                    >
                        {weekly.length < 2 ? <Empty>Hacen falta al menos dos semanas.</Empty> : (
                            <div className="h-64">
                                <ResponsiveContainer>
                                    <AreaChart data={weekly} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                        <XAxis dataKey="label" tick={AXIS} />
                                        <YAxis tick={AXIS} />
                                        <Tooltip contentStyle={TOOLTIP} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Area
                                            type="monotone"
                                            dataKey="plannedTonnage"
                                            name="Pautado (kg)"
                                            stroke="var(--border-strong)"
                                            fill="var(--border-subtle)"
                                            strokeWidth={1.5}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="actualTonnage"
                                            name="Movido (kg)"
                                            stroke="var(--brand)"
                                            fill="var(--brand-quiet)"
                                            strokeWidth={2.5}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Card>

                    <Card
                        title="Carga interna y esfuerzo"
                        subtitle="Series registradas × RPE real. Es el sRPE de Foster adaptado a series: sirve para comparar semanas entre sí, no como valor absoluto."
                    >
                        {weekly.length < 2 ? <Empty>Hacen falta al menos dos semanas.</Empty> : (
                            <>
                                <div className="h-56">
                                    <ResponsiveContainer>
                                        <LineChart data={weekly} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                            <XAxis dataKey="label" tick={AXIS} />
                                            <YAxis yAxisId="l" tick={AXIS} />
                                            <YAxis yAxisId="r" orientation="right" domain={[0, 10]} tick={AXIS} />
                                            <Tooltip contentStyle={TOOLTIP} />
                                            <Legend wrapperStyle={{ fontSize: 12 }} />
                                            <Line yAxisId="l" type="monotone" dataKey="internalLoad" name="Carga interna" stroke="var(--brand)" strokeWidth={2.5} dot={{ r: 3 }} />
                                            <Line yAxisId="r" type="monotone" dataKey="actualRpe" name="RPE real" stroke="var(--warning)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                            <Line yAxisId="r" type="monotone" dataKey="plannedRpe" name="RPE pautado" stroke="var(--ink-faint)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>

                                {acwr && (
                                    <p className="mt-4 rounded-field bg-surface-sunken px-3 py-2.5 text-t-xs leading-relaxed text-ink-muted">
                                        <span className="font-semibold text-ink">
                                            Aguda / crónica: {acwr.ratio}
                                        </span>{' '}
                                        — la última semana ({acwr.acute}) frente a la media de las{' '}
                                        {acwr.weeksUsed} anteriores ({acwr.chronic}). La lectura habitual
                                        sitúa lo razonable entre 0,8 y 1,3. Es un descriptor de cómo salta
                                        la carga, no una predicción de lesión: la asociación no es causal
                                        y el resultado depende de la ventana elegida.
                                    </p>
                                )}
                            </>
                        )}
                    </Card>

                    <Card
                        title="Cumplimiento por semana"
                        subtitle="Porcentaje de series registradas sobre las pautadas."
                    >
                        {weekly.length === 0 ? <Empty>Sin datos.</Empty> : (
                            <div className="h-48">
                                <ResponsiveContainer>
                                    <BarChart data={weekly} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                                        <XAxis dataKey="label" tick={AXIS} />
                                        <YAxis tick={AXIS} unit="%" domain={[0, 100]} />
                                        <Tooltip contentStyle={TOOLTIP} cursor={{ fill: 'var(--border-subtle)' }} />
                                        <Bar dataKey="completionPct" name="Cumplimiento" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Card>
                </section>
            )}
        </div>
    );
}

// =====================================================================
// TARJETA DE UNA SESIÓN
// =====================================================================

/**
 * Un día, con lo pautado y lo hecho al lado.
 *
 * Arranca PLEGADA con su resumen visible. Un bloque tiene treinta días y
 * abrirlos todos convertiría la pantalla en un muro; el resumen —cuántas
 * series, cuánto tonelaje, cuántas desviaciones— basta para decidir en cuál
 * merece la pena entrar.
 */
type SetPatchHandler = (sessionId: string, exerciseId: string, setId: string, patch: Partial<LoggedSet>) => void;

function SessionCard({ session, onSetPatched }: { session: LoggedSession; onSetPatched: SetPatchHandler }) {
    const [open, setOpen] = useState(false);
    const summary = useMemo(() => summarizeSession(session), [session]);

    const title =
        session.name
        || weekdayLabel(session.dayOfWeek)
        || `Día ${session.dayNumber}`;

    return (
        <article className="overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised">
            <button
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-surface-overlay"
            >
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-t-sm font-bold text-ink">{title}</span>
                        <span className="text-t-2xs text-ink-subtle">
                            Semana {session.weekNumber}
                            {session.date && ` · ${session.date.split('-').reverse().join('/')}`}
                        </span>
                        {summary.completed && (
                            <span className="rounded-chip bg-[var(--success-quiet)] px-1.5 py-0.5 text-t-2xs font-black uppercase tracking-wider text-success">
                                Cerrado
                            </span>
                        )}
                    </p>

                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-t-2xs tabular-nums text-ink-muted">
                        <span>{summary.loggedSets}/{summary.plannedSets} series</span>
                        {summary.actualTonnage > 0 && (
                            <span>{Math.round(summary.actualTonnage).toLocaleString('es-ES')} kg</span>
                        )}
                        {summary.actualRpe != null && (
                            <span>
                                RPE {summary.actualRpe}
                                {summary.plannedRpe != null && (
                                    <span className="text-ink-faint"> · pautado {summary.plannedRpe}</span>
                                )}
                            </span>
                        )}
                        {summary.deviations > 0 && (
                            <span className="text-warning">{summary.deviations} desviaciones</span>
                        )}
                        {session.athleteNotes?.trim() && (
                            <MessageSquareText size={12} className="text-brand-text" aria-label="Con notas del atleta" />
                        )}
                    </p>
                </div>

                <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={cn('shrink-0 text-ink-subtle transition-transform', open && 'rotate-180')}
                />
            </button>

            {open && (
                <div className="space-y-3 border-t border-subtle px-4 py-3">
                    {session.athleteNotes?.trim() && (
                        <p className="rounded-field bg-[var(--brand-quiet)] px-3 py-2 text-t-xs italic leading-relaxed text-ink-muted">
                            “{session.athleteNotes.trim()}”
                        </p>
                    )}

                    {session.exercises.map(ex => (
                        <ExerciseLog
                            key={ex.id}
                            exercise={ex}
                            onSetPatched={(setId, patch) => onSetPatched(session.id, ex.id, setId, patch)}
                        />
                    ))}

                    {session.exercises.length === 0 && (
                        <p className="py-4 text-center text-t-xs text-ink-subtle">Día sin ejercicios.</p>
                    )}
                </div>
            )}
        </article>
    );
}

function ExerciseLog({
    exercise,
    onSetPatched,
}: {
    exercise: LoggedSession['exercises'][number];
    onSetPatched: (setId: string, patch: Partial<LoggedSet>) => void;
}) {
    const anyLogged = exercise.sets.some(
        s => s.isCompleted || s.actualReps != null || s.actualLoad != null
    );

    return (
        <div className={cn('rounded-field bg-surface-sunken px-3 py-2.5', !anyLogged && 'opacity-60')}>
            <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-t-xs font-bold text-ink">{exercise.name}</span>
                {exercise.variantName && (
                    <span className="text-t-2xs font-semibold text-brand-text">{exercise.variantName}</span>
                )}
                {!anyLogged && (
                    <span className="text-t-2xs text-ink-faint">sin registrar</span>
                )}
            </p>

            {exercise.coachNotes?.trim() && (
                <p className="mt-1 text-t-2xs leading-snug text-ink-subtle">{exercise.coachNotes.trim()}</p>
            )}

            <div className="mt-2 -mx-1 overflow-x-auto">
                <table className="w-full min-w-[24rem] border-collapse text-t-2xs tabular-nums">
                    <thead>
                        <tr className="text-ink-faint">
                            <th className="px-1 py-1 text-left font-medium">#</th>
                            <th className="px-1 py-1 text-left font-medium">Pautado</th>
                            <th className="px-1 py-1 text-left font-medium">Hecho</th>
                            <th className="px-1 py-1 text-right font-medium">Δ</th>
                            <th className="px-1 py-1 text-right font-medium sr-only">Corregir</th>
                        </tr>
                    </thead>
                    <tbody>
                        {exercise.sets.map((set, i) => (
                            <SetRow key={set.id} set={set} index={i} onSaved={(patch) => onSetPatched(set.id, patch)} />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Las notas por serie son lo más valioso y lo más fácil de perder:
                el atleta escribe ahí "me ha molestado el hombro". Van completas,
                no truncadas. */}
            {exercise.sets.some(s => s.notes?.trim()) && (
                <ul className="mt-2 space-y-1 border-t border-[var(--border-subtle)] pt-2">
                    {exercise.sets.map((set, i) =>
                        set.notes?.trim() ? (
                            <li key={set.id} className="flex gap-2 text-t-2xs leading-relaxed text-ink-muted">
                                <span className="shrink-0 text-ink-faint">S{i + 1}</span>
                                <span className="italic">“{set.notes.trim()}”</span>
                            </li>
                        ) : null
                    )}
                </ul>
            )}
        </div>
    );
}

/**
 * UNA FILA DEL REGISTRO, CON CORRECCIÓN INLINE.
 * =====================================================================
 * Solo toca `actual_reps`/`actual_load`/`actual_rpe` — los mismos tres
 * campos que escribe el atleta desde WorkoutLogger. El plan (`target_*`)
 * no es editable desde aquí; para eso está la pestaña de Programación.
 */
function SetRow({
    set,
    index,
    onSaved,
}: {
    set: LoggedSet;
    index: number;
    onSaved: (patch: Partial<LoggedSet>) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draftReps, setDraftReps] = useState('');
    const [draftLoad, setDraftLoad] = useState('');
    const [draftRpe, setDraftRpe] = useState('');

    const kg = prescribedKg(set);
    const reps = prescribedReps(set);
    const rpe = prescribedRpe(set);
    const hasData = set.isCompleted || set.actualReps != null || set.actualLoad != null;

    const loadDelta =
        kg != null && kg > 0 && set.actualLoad != null
            ? Math.round(((set.actualLoad - kg) / kg) * 1000) / 10
            : null;
    const rpeDelta =
        rpe != null && set.actualRpe != null
            ? Math.round((set.actualRpe - rpe) * 10) / 10
            : null;

    const startEditing = () => {
        setDraftReps(set.actualReps != null ? String(set.actualReps) : '');
        setDraftLoad(set.actualLoad != null ? String(set.actualLoad) : '');
        setDraftRpe(set.actualRpe != null ? String(set.actualRpe) : '');
        setEditing(true);
    };

    const parse = (v: string): number | null => {
        if (v.trim() === '') return null;
        const n = Number.parseFloat(v.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    };

    const handleSave = async () => {
        const patch = {
            actual_reps: parse(draftReps),
            actual_load: parse(draftLoad),
            actual_rpe: parse(draftRpe),
        };
        setSaving(true);
        try {
            await trainingService.updateSet(set.id, patch);
            onSaved({
                actualReps: patch.actual_reps,
                actualLoad: patch.actual_load,
                actualRpe: patch.actual_rpe,
                isCompleted: true,
            });
            setEditing(false);
            toast.success('Serie corregida');
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar la corrección');
        } finally {
            setSaving(false);
        }
    };

    if (editing) {
        return (
            <tr className="border-t border-[var(--border-subtle)] bg-[var(--brand-quiet)]">
                <td className="px-1 py-1.5 text-ink-faint">{index + 1}</td>
                <td colSpan={3} className="px-1 py-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <input
                            type="number"
                            inputMode="decimal"
                            value={draftReps}
                            onChange={(e) => setDraftReps(e.target.value)}
                            placeholder="reps"
                            aria-label={`Repeticiones corregidas, serie ${index + 1}`}
                            className="w-16 rounded-chip border border-[var(--border-default)] bg-surface-canvas px-1.5 py-1 text-center text-t-2xs text-ink focus:border-brand"
                        />
                        <span className="text-ink-faint">×</span>
                        <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            value={draftLoad}
                            onChange={(e) => setDraftLoad(e.target.value)}
                            placeholder="kg"
                            aria-label={`Kilos corregidos, serie ${index + 1}`}
                            className="w-16 rounded-chip border border-[var(--border-default)] bg-surface-canvas px-1.5 py-1 text-center text-t-2xs text-ink focus:border-brand"
                        />
                        <span className="text-ink-faint">@</span>
                        <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            value={draftRpe}
                            onChange={(e) => setDraftRpe(e.target.value)}
                            placeholder="RPE"
                            aria-label={`RPE corregido, serie ${index + 1}`}
                            className="w-14 rounded-chip border border-[var(--border-default)] bg-surface-canvas px-1.5 py-1 text-center text-t-2xs text-ink focus:border-brand"
                        />
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            aria-label="Guardar corrección"
                            className="flex h-7 w-7 items-center justify-center rounded-chip bg-success text-[var(--surface-sunken)] transition-colors duration-fast ease-snap hover:opacity-90 disabled:opacity-50"
                        >
                            <Check size={13} strokeWidth={3} />
                        </button>
                        <button
                            onClick={() => setEditing(false)}
                            disabled={saving}
                            aria-label="Cancelar"
                            className="flex h-7 w-7 items-center justify-center rounded-chip text-ink-faint transition-colors duration-fast ease-snap hover:bg-surface-overlay hover:text-ink"
                        >
                            <X size={13} strokeWidth={3} />
                        </button>
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <tr className="border-t border-[var(--border-subtle)]">
            <td className="px-1 py-1 text-ink-faint">{index + 1}</td>
            <td className="px-1 py-1 text-ink-subtle">
                {set.targetReps ?? '—'}
                {kg != null && ` × ${kg} kg`}
                {set.targetRpe && ` @${set.targetRpe}`}
                {reps == null && kg == null && !set.targetRpe && '—'}
            </td>
            <td className={cn('px-1 py-1', hasData ? 'font-semibold text-ink' : 'text-ink-faint')}>
                {hasData ? (
                    <>
                        {set.actualReps ?? '—'}
                        {set.actualLoad != null && ` × ${set.actualLoad} kg`}
                        {set.actualRpe != null && ` @${set.actualRpe}`}
                        {set.vbtMeanVelocity != null && (
                            <span className="ml-1 font-normal text-ink-subtle">
                                {set.vbtMeanVelocity} m/s
                            </span>
                        )}
                    </>
                ) : '—'}
            </td>
            <td className="px-1 py-1 text-right">
                <span className="inline-flex items-center gap-1.5">
                    {loadDelta != null && Math.abs(loadDelta) >= 2 && (
                        <span className={loadDelta < 0 ? 'text-warning' : 'text-success'}>
                            {loadDelta > 0 ? '+' : ''}{loadDelta}%
                        </span>
                    )}
                    {rpeDelta != null && Math.abs(rpeDelta) >= 1 && (
                        <span className={rpeDelta > 0 ? 'text-warning' : 'text-info'}>
                            RPE {rpeDelta > 0 ? '+' : ''}{rpeDelta}
                        </span>
                    )}
                </span>
            </td>
            <td className="w-6 px-0.5 py-1 text-right">
                <button
                    onClick={startEditing}
                    aria-label={`Corregir la serie ${index + 1}`}
                    // Siempre presente y a baja opacidad —no solo al pasar el
                    // ratón—: en un móvil no hay hover, y ocultarlo del todo
                    // hasta ese gesto lo habría dejado indescubrible ahí.
                    className="flex h-6 w-6 items-center justify-center rounded-chip text-ink-faint/40 transition-colors duration-fast ease-snap hover:bg-surface-overlay hover:text-ink"
                >
                    <Pencil size={11} />
                </button>
            </td>
        </tr>
    );
}

// =====================================================================
// DESVIACIONES
// =====================================================================

const DEVIATION_LABEL: Record<string, string> = {
    'load-down': 'Menos carga',
    'load-up': 'Más carga',
    'reps-down': 'Menos reps',
    'reps-up': 'Más reps',
    'rpe-over': 'Más esfuerzo',
    'rpe-under': 'Menos esfuerzo',
};

function DeviationsView({ rows }: { rows: DeviationRow[] }) {
    const [filter, setFilter] = useState<string>('all');

    const filtered = useMemo(
        () => (filter === 'all' ? rows : rows.filter(r => r.deviations.some(d => d.kind === filter))),
        [rows, filter]
    );

    if (rows.length === 0) {
        return (
            <Card
                title="Sin desviaciones"
                subtitle="Todas las series registradas se han hecho dentro de lo pautado, con los márgenes de 2% en carga y 1 punto en RPE."
            >
                <Empty>Nada que revisar.</Empty>
            </Card>
        );
    }

    const kinds = [...new Set(rows.flatMap(r => r.deviations.map(d => d.kind)))];

    return (
        <Card
            title="Series que se separaron de lo pautado"
            subtitle="Umbrales: 2% en carga (por debajo es la diferencia entre discos) y 1 punto en RPE (por debajo es ruido de medición). La prescripción NO se modifica: esto es solo lectura."
        >
            <div className="mb-3 flex flex-wrap gap-1.5">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                    Todas ({rows.length})
                </FilterChip>
                {kinds.map(kind => (
                    <FilterChip key={kind} active={filter === kind} onClick={() => setFilter(kind)}>
                        {DEVIATION_LABEL[kind] ?? kind} (
                        {rows.filter(r => r.deviations.some(d => d.kind === kind)).length})
                    </FilterChip>
                ))}
            </div>

            <ul className="divide-y divide-[var(--border-subtle)]">
                {filtered.slice(0, 120).map((row, i) => {
                    const kg = prescribedKg(row.set);
                    return (
                        <li key={`${row.set.id}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-t-xs">
                            <span className="w-24 shrink-0 text-t-2xs text-ink-faint">
                                S{row.weekNumber} · {row.sessionLabel}
                            </span>
                            <span className="min-w-0 flex-1 font-semibold text-ink">
                                {row.exercise.name}
                                <span className="ml-1.5 font-normal text-ink-subtle">serie {row.setNumber}</span>
                            </span>
                            <span className="tabular-nums text-ink-muted">
                                {row.set.targetReps ?? '—'}{kg != null && ` × ${kg}`}
                                {' → '}
                                <span className="font-semibold text-ink">
                                    {row.set.actualReps ?? '—'}
                                    {row.set.actualLoad != null && ` × ${row.set.actualLoad}`}
                                </span>
                            </span>
                            <span className="flex shrink-0 gap-1.5">
                                {row.deviations.map((d, j) => (
                                    <span
                                        key={j}
                                        className={cn(
                                            'rounded-chip px-1.5 py-0.5 text-t-2xs font-semibold tabular-nums',
                                            d.kind === 'load-down' || d.kind === 'rpe-over' || d.kind === 'reps-down'
                                                ? 'bg-[var(--warning-quiet)] text-warning'
                                                : 'bg-[var(--success-quiet)] text-success'
                                        )}
                                    >
                                        {DEVIATION_LABEL[d.kind]} {d.pct != null ? `${d.pct > 0 ? '+' : ''}${d.pct}%` : `${d.delta > 0 ? '+' : ''}${d.delta}`}
                                    </span>
                                ))}
                            </span>
                        </li>
                    );
                })}
            </ul>

            {filtered.length > 120 && (
                <p className="mt-3 text-t-2xs text-ink-faint">
                    Se muestran las 120 más recientes de {filtered.length}.
                </p>
            )}
        </Card>
    );
}

// =====================================================================
// PIEZAS
// =====================================================================

function Metric({
    label, value, hint, tone = 'neutral',
}: {
    label: string; value: string; hint?: string; tone?: 'good' | 'neutral' | 'warn';
}) {
    return (
        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
            <p className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">{label}</p>
            <p className={cn(
                'mt-1.5 text-2xl font-black leading-none tabular-nums',
                tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-ink'
            )}>
                {value}
            </p>
            {hint && <p className="mt-1.5 text-t-2xs text-ink-subtle">{hint}</p>}
        </div>
    );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4 md:p-5">
            <h3 className="text-t-sm font-bold text-ink">{title}</h3>
            {subtitle && <p className="mt-1 text-t-2xs leading-relaxed text-ink-subtle">{subtitle}</p>}
            <div className="mt-4">{children}</div>
        </section>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="py-10 text-center text-t-sm text-ink-subtle">{children}</p>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'rounded-chip px-2.5 py-1 text-t-2xs font-semibold transition-colors duration-fast ease-snap',
                active ? 'bg-brand text-brand-ink' : 'bg-surface-sunken text-ink-subtle hover:text-ink'
            )}
        >
            {children}
        </button>
    );
}

/**
 * Una diferencia con su signo y su color.
 *
 * `invert` existe porque el signo bueno no es el mismo en las dos columnas:
 * en carga, más es mejor; en RPE, más significa que costó más de lo previsto.
 */
function Delta({ value, unit, invert }: { value: number | null; unit: string; invert?: boolean }) {
    if (value === null) return <span className="text-ink-faint">—</span>;

    const negligible = unit === '%' ? Math.abs(value) < 2 : Math.abs(value) < 0.5;
    if (negligible) {
        return (
            <span className="inline-flex items-center gap-0.5 text-ink-faint">
                <Minus size={11} aria-hidden="true" />
            </span>
        );
    }

    const good = invert ? value < 0 : value > 0;
    const Icon = value > 0 ? TrendingUp : TrendingDown;

    return (
        <span className={cn('inline-flex items-center gap-1', good ? 'text-success' : 'text-warning')}>
            <Icon size={11} aria-hidden="true" />
            {value > 0 ? '+' : ''}{value}{unit}
        </span>
    );
}

function FlagRow({ flag }: { flag: Flag }) {
    const tone =
        flag.severity === 'alta'
            ? 'bg-[var(--warning-quiet)] text-warning'
            : flag.severity === 'media'
                ? 'bg-[var(--info-quiet)] text-info'
                : 'bg-surface-sunken text-ink-muted';

    const Icon = flag.severity === 'baja' ? Check : AlertTriangle;

    return (
        <li className={cn('flex items-start gap-2.5 rounded-field px-3 py-2.5', tone)}>
            <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
                <span className="block text-t-xs font-semibold">{flag.title}</span>
                <span className="mt-0.5 block text-t-2xs leading-relaxed opacity-80">{flag.detail}</span>
            </span>
        </li>
    );
}
