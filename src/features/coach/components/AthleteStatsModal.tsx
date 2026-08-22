import { useState, useEffect, useMemo } from 'react';
import { X, TrendingUp, Loader, Search, Check } from 'lucide-react';
import {
    LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, ReferenceLine,
    ComposedChart, Bar, BarChart, Cell,
} from 'recharts';
import { trainingService, ExerciseHistoryRow } from '../../../services/trainingService';
import { formsService, FormResponse, type FormType } from '../../../services/formsService';
import { Macrocycle } from '../../../types/training';
import { AthleteVolumeTab } from './AthleteVolumeTab';
import { ConsistencyCalendar } from './ConsistencyCalendar';
import { cn } from '../../../lib/utils';
import { SERIES_COLORS } from '../../../lib/charts/palette';
import {
    summarize, weeklySeries, compareExercises, velocityProfile,
    adherenceSeries, intensityDistribution, consistencyByDay, plannedVsActualWeekly,
    kgOf, repsOf, rpeOf, repsKey, parseNum,
} from '../../../lib/stats/athleteStats';
import { summarizeCheckIns, type CheckInSummary } from '../../../lib/forms/checkInStats';

type StatsTab = 'general' | 'adherence' | 'exercises' | 'compare' | 'velocity' | 'volume';

interface AthleteStatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    athleteId: string;
    athleteName: string;
    /**
     * En la ficha del atleta (pestaña Estadísticas > Resumen) esto vive
     * EMBEBIDO, no como modal a pantalla completa: sin fondo fijo, sin
     * cabecera propia ni botón de cerrar — la cabecera y las pestañas de la
     * ficha ya cumplen ese papel. `isOpen`/`onClose` se ignoran en este modo.
     */
    embedded?: boolean;
}


const AXIS = { fill: 'var(--ink-subtle)', fontSize: 11 };
const GRID = 'var(--border-subtle)';
const TOOLTIP_STYLE = {
    background: 'var(--surface-overlay)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    fontSize: 12,
    color: 'var(--ink)',
};

/** Cifra grande con su etiqueta. */
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-5">
            <p className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">{label}</p>
            <p className="mt-2 text-metric font-black leading-none text-ink">{value}</p>
            {hint && <p className="mt-2 text-t-xs text-ink-subtle">{hint}</p>}
        </div>
    );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
            <h3 className="text-t-base font-bold text-ink">{title}</h3>
            {subtitle && <p className="mt-1 text-t-xs text-ink-subtle">{subtitle}</p>}
            <div className="mt-5">{children}</div>
        </section>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="py-12 text-center text-t-sm text-ink-subtle">{children}</p>;
}

/**
 * ESTADÍSTICAS DEL ATLETA
 *
 * Cinco vistas, porque son cinco preguntas distintas y mezclarlas en una
 * pantalla era lo que hacía que no se usara ninguna:
 *
 *   General   — ¿cómo va en conjunto? Carga, intensidad, esfuerzo, cuestionarios.
 *   Ejercicio — ¿está subiendo ESTE movimiento?
 *   Comparar  — ¿va uno más rápido que otro? (2 o más a la vez)
 *   Vel       — perfil carga-velocidad y 1RM estimado sin probar el máximo.
 *   Volumen   — reparto por grupo muscular.
 *
 * Todo el cálculo vive en src/lib/stats/athleteStats.ts.
 */
export function AthleteStatsModal({ isOpen, onClose, athleteId, athleteName, embedded = false }: AthleteStatsModalProps) {
    const [history, setHistory] = useState<ExerciseHistoryRow[]>([]);
    const [checkIns, setCheckIns] = useState<FormResponse[]>([]);
    /** Diario o semanal. Son dos granularidades y NO comparten gráfica (K9). */
    const [checkInType, setCheckInType] = useState<FormType>('daily');
    const [loading, setLoading] = useState(true);
    const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
    const [compareWith, setCompareWith] = useState<string[]>([]);
    const [repsFilter, setRepsFilter] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<StatsTab>('general');
    const [macros, setMacros] = useState<Macrocycle[]>([]);
    /**
     * Antes un fallo de red o de permisos (RLS) y "este atleta no tiene
     * entrenamientos" se veían EXACTAMENTE IGUAL: el `.catch(console.error)`
     * de abajo tragaba el error y la pantalla mostraba el mismo mensaje de
     * "sin datos" para los dos casos. Un entrenador viendo "sin datos" no
     * tiene ninguna pista de que el problema es un permiso mal concedido y
     * no que el atleta de verdad no haya entrenado.
     */
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        // Los macrociclos y los cuestionarios son accesorios: si fallan, el
        // resto de las estadísticas siguen viéndose.
        trainingService.getMacrosByAthlete(athleteId).then(setMacros).catch(() => setMacros([]));
        // Los DOS tipos, cada uno con su propio cupo. Pedirlos juntos con un
        // solo `limit` hacía que un atleta que rellena el diario a diario se
        // comiera las 60 respuestas con dos meses de diarios y sus
        // cuestionarios SEMANALES no llegaran nunca a la gráfica.
        Promise.all([
            formsService.getResponsesByAthlete(athleteId, 'daily'),
            formsService.getResponsesByAthlete(athleteId, 'weekly'),
        ])
            .then(([daily, weekly]) => setCheckIns([...daily, ...weekly]))
            .catch(() => setCheckIns([]));
    }, [isOpen, athleteId]);

    useEffect(() => {
        if (!isOpen) return;
        let alive = true;

        // `setLoading(true)` va dentro de la promesa y no en el cuerpo del
        // efecto: llamarlo de forma síncrona ahí provoca un render en cascada
        // (el estado ya arranca en `true`, así que además no cambiaba nada).
        // `setLoadError(null)` sigue la misma regla, dentro del `.then`.
        trainingService.getExerciseHistoryByAthlete(athleteId)
            .then(rows => {
                if (!alive) return;
                setLoadError(null);
                setHistory(rows);
                const counts = new Map<string, number>();
                rows.forEach(r => counts.set(r.exerciseName, (counts.get(r.exerciseName) || 0) + 1));
                const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
                if (ranked[0]) setSelectedExercise(ranked[0][0]);
                // La comparativa arranca con los dos ejercicios más frecuentes:
                // abrir la pestaña en blanco obliga a adivinar qué hace.
                setCompareWith(ranked.slice(0, 2).map(([name]) => name));
            })
            .catch((err: unknown) => {
                if (!alive) return;
                console.error('Error cargando el historial de entrenamiento:', err);
                const code = (err as { code?: string })?.code;
                const message = err instanceof Error ? err.message : String(err);
                // 42501 (permiso denegado) y PGRST301/401 (JWT) son casi
                // siempre una política RLS sin desplegar — el caso que se
                // confundía con "el atleta no ha entrenado". El resto se
                // enseña tal cual: es información real para depurar.
                setLoadError(
                    code === '42501' || message.includes('permission denied')
                        ? 'Sin permiso para leer el entrenamiento de este atleta. Probablemente falta ejecutar una migración de la base de datos (revisa database/FIX_TIMEOUT_SERIES.sql y database/REESTRUCTURACION_2026-08.sql).'
                        : `No se pudo cargar el historial: ${message}`
                );
            })
            .finally(() => { if (alive) setLoading(false); });

        return () => { alive = false; };
    }, [isOpen, athleteId]);

    // ---------------------------------------------------------------
    // DERIVADOS
    // ---------------------------------------------------------------
    const summary = useMemo(() => summarize(history), [history]);
    const weekly = useMemo(() => weeklySeries(history), [history]);
    const plannedVsActual = useMemo(() => plannedVsActualWeekly(history), [history]);
    const checkInData = useMemo(() => summarizeCheckIns(checkIns, checkInType), [checkIns, checkInType]);
    /** Cuántas hay de cada tipo, para poder decirlo en el selector. */
    const checkInCounts = useMemo(() => ({
        daily: checkIns.filter(r => r.type === 'daily').length,
        weekly: checkIns.filter(r => r.type === 'weekly').length,
    }), [checkIns]);
    const adherence = useMemo(() => adherenceSeries(history), [history]);
    const intensity = useMemo(() => intensityDistribution(history), [history]);
    const consistency = useMemo(() => consistencyByDay(history), [history]);

    // Media de adherencia sobre las sesiones ya entrenadas: el titular de la
    // pestaña, para no obligar a leerlo de la gráfica.
    const adherenceAvg = useMemo(() => {
        const withLoad = adherence.filter(a => a.loadPct !== null);
        const load = withLoad.length
            ? Math.round(withLoad.reduce((s, a) => s + (a.loadPct ?? 0), 0) / withLoad.length)
            : null;
        const completion = adherence.length
            ? Math.round(adherence.reduce((s, a) => s + a.completionPct, 0) / adherence.length)
            : null;
        return { load, completion };
    }, [adherence]);

    const intensityTotalSets = useMemo(
        () => intensity.reduce((s, b) => s + b.sets, 0),
        [intensity]
    );

    const rankedNames = useMemo(() => {
        const counts = new Map<string, number>();
        history.forEach(r => counts.set(r.exerciseName, (counts.get(r.exerciseName) || 0) + 1));
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    }, [history]);

    const filteredNames = useMemo(
        () => rankedNames.filter(n => n.toLowerCase().includes(search.toLowerCase())),
        [rankedNames, search]
    );

    const exerciseRows = useMemo(
        () => history.filter(r => r.exerciseName === selectedExercise),
        [history, selectedExercise]
    );

    const availableReps = useMemo(() => {
        const reps = new Set<string>();
        exerciseRows.forEach(r => r.sets.forEach(s => {
            const rp = repsKey(s.target_reps);
            if (rp) reps.add(rp);
        }));
        return [...reps].sort((a, b) => (parseNum(a) || 0) - (parseNum(b) || 0));
    }, [exerciseRows]);

    const chartData = useMemo(() => {
        return exerciseRows
            .map(row => {
                const sets = repsFilter
                    ? row.sets.filter(s => repsKey(s.target_reps) === repsFilter)
                    : row.sets;
                if (sets.length === 0) return null;

                const loads = sets.map(kgOf).filter((v): v is number => v !== null);
                if (loads.length === 0) return null;

                const rpes = sets.map(rpeOf).filter((v): v is number => v !== null);
                const reps = sets.map(repsOf).filter((v): v is number => v !== null);

                return {
                    label: `S${row.weekNumber}·D${row.dayNumber}`,
                    block: row.blockName,
                    carga: Math.max(...loads),
                    rpe: rpes.length ? Math.max(...rpes) : null,
                    velocidad: parseNum(row.velocityAvg),
                    series: sets.length,
                    reps: reps.length ? Math.max(...reps) : null,
                };
            })
            .filter((d): d is NonNullable<typeof d> => d !== null);
    }, [exerciseRows, repsFilter]);

    const comparison = useMemo(() => compareExercises(history, compareWith), [history, compareWith]);
    const profile = useMemo(
        () => (selectedExercise ? velocityProfile(history, selectedExercise) : null),
        [history, selectedExercise]
    );

    // La recta ajustada se dibuja con dos puntos: es una recta.
    const profileLine = useMemo(() => {
        if (!profile) return [];
        const xs = profile.points.map(p => p.kg);
        const min = Math.min(...xs);
        const max = Math.max(...xs);
        return [
            { kg: min, ajuste: profile.slope * min + profile.intercept },
            { kg: max, ajuste: profile.slope * max + profile.intercept },
        ];
    }, [profile]);

    const toggleCompare = (name: string) => {
        setCompareWith(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    if (!embedded && !isOpen) return null;

    const TABS: [StatsTab, string][] = [
        ['general', 'General'],
        ['adherence', 'Adherencia'],
        ['exercises', 'Por ejercicio'],
        ['compare', 'Comparar'],
        ['velocity', 'Carga-velocidad'],
        ['volume', 'Volumen'],
    ];

    // Color de cada zona de intensidad: de frío (trabajo ligero) a caliente
    // (cerca del máximo). Reutiliza los tokens de esfuerzo del sistema.
    const ZONE_COLORS = [
        'var(--info)', 'var(--success)', 'var(--brand)',
        'var(--warning)', 'var(--effort-high)', 'var(--danger)',
    ];

    return (
        <div className={embedded
            ? 'flex min-h-[60vh] flex-col'
            : 'fixed inset-0 z-modal flex flex-col bg-surface-canvas animate-in fade-in duration-200'
        }>
            {/* ----------------------------------------------------- */}
            <header className={embedded ? 'shrink-0' : 'shrink-0 border-b border-subtle bg-surface-raised'}>
                {!embedded && (
                    <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
                        <h2 className="flex min-w-0 items-center gap-2.5 text-t-lg font-black uppercase tracking-display text-ink md:text-t-2xl">
                            <TrendingUp className="shrink-0 text-brand" size={20} aria-hidden="true" />
                            <span className="truncate">{athleteName}</span>
                        </h2>
                        <button
                            onClick={onClose}
                            className="shrink-0 rounded-field p-2.5 text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                            aria-label="Cerrar estadísticas"
                        >
                            <X size={20} />
                        </button>
                    </div>
                )}

                <div role="tablist" aria-label="Vista de estadísticas" className={embedded ? 'flex gap-1 overflow-x-auto pb-2' : 'flex gap-1 overflow-x-auto px-4 pb-2 md:px-8'}>
                    {TABS.map(([value, label]) => (
                        <button
                            key={value}
                            role="tab"
                            aria-selected={tab === value}
                            onClick={() => setTab(value)}
                            className={cn(
                                'shrink-0 rounded-field px-3.5 py-2 text-t-sm font-semibold transition-colors duration-fast ease-snap',
                                tab === value
                                    ? 'bg-brand text-brand-ink'
                                    : 'text-ink-subtle hover:bg-surface-overlay hover:text-ink'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </header>

            {loading ? (
                <div className="flex flex-1 items-center justify-center">
                    <Loader className="animate-spin text-brand" size={28} />
                </div>
            ) : loadError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-t-sm font-bold text-danger">No se pudo cargar</p>
                    <p className="max-w-md text-t-sm text-ink-subtle">{loadError}</p>
                </div>
            ) : history.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-t-sm text-ink-subtle">
                    Este atleta todavía no tiene entrenamientos registrados.
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                    {/* ---------------------------------------------------
                        SELECTOR DE EJERCICIO
                        Solo aparece donde sirve de algo. En "General" y en
                        "Volumen" no hay ejercicio seleccionado que valga.  */}
                    {(tab === 'exercises' || tab === 'compare' || tab === 'velocity') && (
                        <aside className="flex max-h-56 w-full shrink-0 flex-col border-b border-subtle bg-surface-sunken p-4 md:max-h-none md:w-72 md:border-b-0 md:border-r">
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={14} aria-hidden="true" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar ejercicio…"
                                    className="w-full rounded-field border border-[var(--border-default)] bg-surface-canvas py-2 pl-8 pr-3 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand focus:outline-none"
                                />
                            </div>

                            {tab === 'compare' && (
                                <p className="mb-2 text-t-2xs text-ink-subtle">
                                    Marca los que quieras superponer.
                                </p>
                            )}

                            <div className="flex-1 space-y-0.5 overflow-y-auto">
                                {filteredNames.map(name => {
                                    const active = tab === 'compare'
                                        ? compareWith.includes(name)
                                        : selectedExercise === name;
                                    return (
                                        <button
                                            key={name}
                                            onClick={() => {
                                                if (tab === 'compare') toggleCompare(name);
                                                else { setSelectedExercise(name); setRepsFilter(null); }
                                            }}
                                            className={cn(
                                                'flex w-full items-center gap-2 rounded-field px-3 py-2 text-left text-t-sm transition-colors duration-fast ease-snap',
                                                active
                                                    ? 'bg-brand font-semibold text-brand-ink'
                                                    : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                                            )}
                                        >
                                            {tab === 'compare' && (
                                                <span className={cn(
                                                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-chip border',
                                                    active ? 'border-brand-ink bg-brand-ink/20' : 'border-[var(--border-strong)]'
                                                )}>
                                                    {active && <Check size={11} />}
                                                </span>
                                            )}
                                            <span className="truncate">{name}</span>
                                        </button>
                                    );
                                })}
                                {filteredNames.length === 0 && (
                                    <p className="px-3 py-4 text-t-xs text-ink-subtle">Ningún ejercicio coincide.</p>
                                )}
                            </div>
                        </aside>
                    )}

                    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
                        {/* =========================================
                            GENERAL
                            ========================================= */}
                        {tab === 'general' && (
                            <div className="mx-auto max-w-5xl space-y-6">
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                    <Metric
                                        label="Tonelaje"
                                        value={`${(summary.tonnage / 1000).toFixed(1)} t`}
                                        hint={`${summary.totalSets} series en ${summary.totalSessions} sesiones`}
                                    />
                                    <Metric
                                        label="Intensidad media"
                                        value={summary.avgIntensityPct !== null ? `${summary.avgIntensityPct}%` : '—'}
                                        hint="Sobre el mejor 1RM estimado de cada ejercicio"
                                    />
                                    <Metric
                                        label="RPE medio"
                                        value={summary.avgRpe !== null ? String(summary.avgRpe) : '—'}
                                        hint={`${summary.hardSets} series a RPE 8 o más`}
                                    />
                                    <Metric
                                        label="Ejercicios"
                                        value={String(summary.exercisesTracked)}
                                        hint={
                                            summary.weeksTracked > 0
                                                ? `${summary.weeksTracked} ${summary.weeksTracked === 1 ? 'semana' : 'semanas'} · ${summary.blocksTracked} ${summary.blocksTracked === 1 ? 'bloque' : 'bloques'}`
                                                : 'Sin registro todavía'
                                        }
                                    />
                                </div>

                                <ChartCard
                                    title="Constancia"
                                    subtitle="Cada casilla es un día; cuanto más intensa, más series se hicieron. Los huecos cuentan lo que ninguna media mensual llega a contar."
                                >
                                    <ConsistencyCalendar days={consistency} />
                                </ChartCard>

                                <ChartCard
                                    title="Pautado contra real"
                                    subtitle="Discontinua: lo que programaste, completo desde el primer día. Sólida: lo que el atleta ha registrado de verdad, semana a semana."
                                >
                                    {plannedVsActual.length === 0 ? (
                                        <Empty>Programa la primera semana para ver aquí la progresión prevista.</Empty>
                                    ) : (
                                        <div className="h-72">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={plannedVsActual} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                    <XAxis dataKey="label" tick={AXIS} />
                                                    <YAxis tick={AXIS} />
                                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                                    <Line type="monotone" dataKey="plannedTonnage" name="Tonelaje pautado (kg)" stroke={SERIES_COLORS[1]} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2.5 }} connectNulls />
                                                    <Line type="monotone" dataKey="actualTonnage" name="Tonelaje real (kg)" stroke={SERIES_COLORS[0]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </ChartCard>

                                <ChartCard
                                    title="Carga y esfuerzo por semana"
                                    subtitle="El tonelaje dice cuánto trabajo hay; el RPE, cuánto cuesta. Se leen juntos: subir los dos a la vez es lo que acaba en lesión."
                                >
                                    {weekly.length < 2 ? (
                                        <Empty>Hacen falta al menos dos semanas registradas.</Empty>
                                    ) : (
                                        <div className="h-72">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={weekly} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                    <XAxis dataKey="label" tick={AXIS} />
                                                    <YAxis yAxisId="t" tick={AXIS} />
                                                    <YAxis yAxisId="r" orientation="right" domain={[0, 10]} tick={AXIS} />
                                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                                    <Line yAxisId="t" type="monotone" dataKey="tonnage" name="Tonelaje (kg)" stroke={SERIES_COLORS[0]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                                                    <Line yAxisId="r" type="monotone" dataKey="avgRpe" name="RPE medio" stroke={SERIES_COLORS[3]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </ChartCard>

                                <ChartCard
                                    title="Intensidad relativa y número de series"
                                    subtitle="Cuando la intensidad sube, las series deberían bajar. Si suben las dos, la semana no es sostenible."
                                >
                                    {weekly.length < 2 ? (
                                        <Empty>Hacen falta al menos dos semanas registradas.</Empty>
                                    ) : (
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={weekly} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                    <XAxis dataKey="label" tick={AXIS} />
                                                    <YAxis yAxisId="i" tick={AXIS} unit="%" />
                                                    <YAxis yAxisId="s" orientation="right" tick={AXIS} />
                                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                                    <Line yAxisId="i" type="monotone" dataKey="avgIntensityPct" name="Intensidad (%)" stroke={SERIES_COLORS[1]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                                                    <Line yAxisId="s" type="monotone" dataKey="sets" name="Series" stroke={SERIES_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </ChartCard>

                                {/* CUESTIONARIOS ------------------------------- */}
                                <CheckInsCard
                                    data={checkInData}
                                    type={checkInType}
                                    counts={checkInCounts}
                                    onTypeChange={setCheckInType}
                                />
                            </div>
                        )}

                        {/* =========================================
                            ADHERENCIA — lo pautado contra lo hecho
                            ========================================= */}
                        {tab === 'adherence' && (
                            <div className="mx-auto max-w-5xl space-y-6">
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                                    <Metric
                                        label="Series completadas"
                                        value={adherenceAvg.completion !== null ? `${adherenceAvg.completion}%` : '—'}
                                        hint="De lo pautado, cuánto se cierra de media"
                                    />
                                    <Metric
                                        label="Carga cumplida"
                                        value={adherenceAvg.load !== null ? `${adherenceAvg.load}%` : '—'}
                                        hint="Tonelaje real sobre el prescrito"
                                    />
                                    <Metric
                                        label="Sesiones"
                                        value={String(adherence.length)}
                                        hint="Entrenadas, de las que hay registro"
                                    />
                                </div>

                                <ChartCard
                                    title="Pautado contra hecho, por sesión"
                                    subtitle="La barra clara es lo prescrito; la de marca, lo que de verdad se movió. La línea es el % de series cerradas. Cuando la carga real supera a la prescrita de forma sistemática, el plan se le queda corto."
                                >
                                    {adherence.length < 2 ? (
                                        <Empty>Hacen falta al menos dos sesiones registradas.</Empty>
                                    ) : (
                                        <div className="h-80">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={adherence} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                    <XAxis dataKey="label" tick={AXIS} />
                                                    <YAxis yAxisId="kg" tick={AXIS} unit="kg" />
                                                    <YAxis yAxisId="pct" orientation="right" domain={[0, 110]} tick={AXIS} unit="%" />
                                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                                    <Bar yAxisId="kg" dataKey="plannedTonnage" name="Pautado (kg)" fill="var(--border-strong)" radius={[3, 3, 0, 0]} maxBarSize={26} />
                                                    <Bar yAxisId="kg" dataKey="actualTonnage" name="Hecho (kg)" fill={SERIES_COLORS[0]} radius={[3, 3, 0, 0]} maxBarSize={26} />
                                                    <Line yAxisId="pct" type="monotone" dataKey="completionPct" name="Series cerradas (%)" stroke={SERIES_COLORS[2]} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </ChartCard>

                                <ChartCard
                                    title="Distribución de intensidad"
                                    subtitle={
                                        intensityTotalSets === 0
                                            ? 'Sin series con carga y 1RM estimado todavía.'
                                            : `${intensityTotalSets} series repartidas por zona de %1RM. Dice en qué vive el bloque: fuerza (90%+), básicos pesados (80–90), hipertrofia (70–80) o técnico.`
                                    }
                                >
                                    {intensityTotalSets === 0 ? (
                                        <Empty>Hacen falta series con carga registrada para estimar la intensidad.</Empty>
                                    ) : (
                                        <div className="h-72">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={intensity} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                    <XAxis dataKey="label" tick={AXIS} />
                                                    <YAxis tick={AXIS} allowDecimals={false} />
                                                    <Tooltip
                                                        contentStyle={TOOLTIP_STYLE}
                                                        formatter={(value, _n, item) => {
                                                            const t = (item?.payload as { tonnage?: number })?.tonnage ?? 0;
                                                            return [`${Number(value)} series · ${(t / 1000).toFixed(1)} t`, 'Trabajo'];
                                                        }}
                                                    />
                                                    <Bar dataKey="sets" name="Series" radius={[4, 4, 0, 0]}>
                                                        {intensity.map((_, i) => (
                                                            <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </ChartCard>
                            </div>
                        )}

                        {/* =========================================
                            POR EJERCICIO
                            ========================================= */}
                        {tab === 'exercises' && (
                            <div className="mx-auto max-w-5xl space-y-6">
                                <div>
                                    <p className="mb-2 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                        Comparar solo series de las mismas repeticiones
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setRepsFilter(null)}
                                            className={cn(
                                                'rounded-field px-3 py-1.5 text-t-xs font-semibold transition-colors duration-fast',
                                                repsFilter === null
                                                    ? 'bg-brand text-brand-ink'
                                                    : 'bg-surface-raised text-ink-muted hover:text-ink'
                                            )}
                                        >
                                            Todas
                                        </button>
                                        {availableReps.map(r => (
                                            <button
                                                key={r}
                                                onClick={() => setRepsFilter(r)}
                                                className={cn(
                                                    'rounded-field px-3 py-1.5 text-t-xs font-semibold transition-colors duration-fast',
                                                    repsFilter === r
                                                        ? 'bg-brand text-brand-ink'
                                                        : 'bg-surface-raised text-ink-muted hover:text-ink'
                                                )}
                                            >
                                                {r} reps
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <ChartCard
                                    title={selectedExercise ?? 'Ejercicio'}
                                    subtitle={
                                        repsFilter
                                            ? `Series de ${repsFilter} repeticiones a lo largo del tiempo.`
                                            : 'Serie más pesada de cada día, con su RPE y su velocidad.'
                                    }
                                >
                                    {chartData.length < 2 ? (
                                        <Empty>
                                            No hay suficientes registros{repsFilter ? ' con ese filtro' : ''} para dibujar una tendencia.
                                        </Empty>
                                    ) : (
                                        <div className="h-80">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                    <XAxis dataKey="label" tick={AXIS} />
                                                    <YAxis yAxisId="load" tick={AXIS} unit="kg" domain={['auto', 'auto']} />
                                                    <YAxis yAxisId="rpe" orientation="right" domain={[0, 10]} tick={AXIS} />
                                                    <Tooltip
                                                        contentStyle={TOOLTIP_STYLE}
                                                        labelFormatter={(label, payload) => {
                                                            const p = payload?.[0]?.payload as { block?: string } | undefined;
                                                            return p?.block ? `${label} · ${p.block}` : String(label);
                                                        }}
                                                    />
                                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                                    <Line yAxisId="load" type="monotone" dataKey="carga" name="Carga (kg)" stroke={SERIES_COLORS[0]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                                                    <Line yAxisId="rpe" type="monotone" dataKey="rpe" name="RPE" stroke={SERIES_COLORS[3]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                                    <Line yAxisId="rpe" type="monotone" dataKey="velocidad" name="Vel (m/s)" stroke={SERIES_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </ChartCard>
                            </div>
                        )}

                        {/* =========================================
                            COMPARAR
                            ========================================= */}
                        {tab === 'compare' && (
                            <div className="mx-auto max-w-5xl space-y-6">
                                <ChartCard
                                    title="Comparativa de progresión"
                                    subtitle="Se compara el 1RM estimado, no los kilos brutos: así un peso muerto y un press de banca caben en el mismo eje sin que uno aplaste al otro."
                                >
                                    {compareWith.length === 0 ? (
                                        <Empty>Marca al menos un ejercicio en la lista de la izquierda.</Empty>
                                    ) : comparison.length < 2 ? (
                                        <Empty>Hacen falta al menos dos semanas con datos de esos ejercicios.</Empty>
                                    ) : (
                                        <div className="h-80">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={comparison} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                    <XAxis dataKey="label" tick={AXIS} />
                                                    <YAxis tick={AXIS} unit="kg" domain={['auto', 'auto']} />
                                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                                    {compareWith.map((name, i) => (
                                                        <Line
                                                            key={name}
                                                            type="monotone"
                                                            dataKey={name}
                                                            name={name}
                                                            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                                                            strokeWidth={2.5}
                                                            dot={{ r: 3 }}
                                                            connectNulls
                                                        />
                                                    ))}
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </ChartCard>
                            </div>
                        )}

                        {/* =========================================
                            PERFIL CARGA-VELOCIDAD
                            ========================================= */}
                        {tab === 'velocity' && (
                            <div className="mx-auto max-w-5xl space-y-6">
                                {profile && (
                                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                                        <Metric
                                            label="1RM estimado"
                                            value={profile.estimated1RM !== null ? `${profile.estimated1RM} kg` : '—'}
                                            hint="Extrapolado a 0,15 m/s"
                                        />
                                        <Metric
                                            label="Ajuste (R²)"
                                            value={String(profile.r2)}
                                            hint={profile.r2 < 0.5 ? 'Demasiado disperso: no te fíes' : 'Los puntos describen una recta'}
                                        />
                                        <Metric
                                            label="Mediciones"
                                            value={String(profile.points.length)}
                                            hint="Días con velocidad registrada"
                                        />
                                    </div>
                                )}

                                <ChartCard
                                    title={`Perfil carga-velocidad · ${selectedExercise ?? ''}`}
                                    subtitle="Cada punto es un día. La recta cruza la velocidad a la que se mueve un máximo, así que da un 1RM sin tener que probarlo."
                                >
                                    {!profile ? (
                                        <Empty>
                                            Hacen falta al menos tres días con velocidad media registrada en este
                                            ejercicio. Se registra al subir el archivo del encoder.
                                        </Empty>
                                    ) : (
                                        <div className="h-80">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ScatterChart margin={{ top: 5, right: 12, left: -8, bottom: 12 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                    <XAxis
                                                        type="number"
                                                        dataKey="kg"
                                                        name="Carga"
                                                        unit="kg"
                                                        tick={AXIS}
                                                        domain={['dataMin - 5', 'dataMax + 5']}
                                                    />
                                                    <YAxis
                                                        type="number"
                                                        dataKey="velocity"
                                                        name="Velocidad"
                                                        unit=" m/s"
                                                        tick={AXIS}
                                                        domain={[0, 'dataMax + 0.1']}
                                                    />
                                                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
                                                    <ReferenceLine
                                                        y={0.15}
                                                        stroke={SERIES_COLORS[3]}
                                                        strokeDasharray="4 4"
                                                        label={{ value: '1RM (0,15 m/s)', fill: 'var(--ink-subtle)', fontSize: 11, position: 'insideTopRight' }}
                                                    />
                                                    <Scatter name="Mediciones" data={profile.points} fill={SERIES_COLORS[0]} />
                                                    <Scatter
                                                        name="Ajuste"
                                                        data={profileLine}
                                                        dataKey="ajuste"
                                                        line={{ stroke: SERIES_COLORS[1], strokeWidth: 2 }}
                                                        shape={() => <g />}
                                                    />
                                                </ScatterChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </ChartCard>
                            </div>
                        )}

                        {/* =========================================
                            VOLUMEN
                            ========================================= */}
                        {tab === 'volume' && (
                            <div className="mx-auto max-w-5xl">
                                <AthleteVolumeTab history={history} macros={macros} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// =====================================================================
// CUESTIONARIOS
// =====================================================================

/**
 * DOS GRANULARIDADES Y UNA GRÁFICA POR FAMILIA DE ESCALA (decisión K9).
 *
 * Antes esto era UNA sola gráfica con todo dentro, y fallaba por dos sitios
 * a la vez:
 *
 *   · Diarios y semanales compartían serie. Como '2026-08-02' ordena antes
 *     que '2026-W31' por orden alfabético, salían primero todos los días del
 *     año y después todas las semanas, seguidos: el eje X no significaba
 *     nada.
 *   · Un solo eje Y. "Media de pasos" (~9.000) estiraba la escala y dejaba
 *     el sueño, el dolor y el estrés aplastados contra el suelo.
 *
 * Ahora la granularidad la elige quien mira, y cada familia de escala tiene
 * su propia gráfica con su propio eje. Ver `src/lib/forms/axes.ts`.
 */
function CheckInsCard({
    data,
    type,
    counts,
    onTypeChange,
}: {
    data: CheckInSummary;
    type: FormType;
    counts: { daily: number; weekly: number };
    onTypeChange: (t: FormType) => void;
}) {
    const OPTIONS: { value: FormType; label: string }[] = [
        { value: 'daily', label: 'Diario' },
        { value: 'weekly', label: 'Semanal' },
    ];

    return (
        <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-t-base font-bold text-ink">Cuestionarios</h3>
                    <p className="mt-1 text-t-xs text-ink-subtle">
                        {data.responseCount === 0
                            ? `Todavía no ha respondido ningún cuestionario ${type === 'daily' ? 'diario' : 'semanal'}.`
                            : `${data.responseCount} respuestas. Cada familia de escala va en su propia gráfica: comparten eje solo las que se pueden comparar.`}
                    </p>
                </div>

                {/* El selector se enseña SIEMPRE, aunque un tipo esté vacío:
                    esconderlo dejaría al coach sin forma de descubrir que el
                    otro cuestionario existe. */}
                <div role="tablist" aria-label="Granularidad" className="flex shrink-0 gap-1 rounded-field bg-surface-sunken p-1">
                    {OPTIONS.map(o => (
                        <button
                            key={o.value}
                            role="tab"
                            aria-selected={type === o.value}
                            onClick={() => onTypeChange(o.value)}
                            className={cn(
                                'rounded-field px-3 py-1.5 text-t-xs font-semibold transition-colors duration-fast',
                                type === o.value
                                    ? 'bg-surface-raised text-ink shadow-sm'
                                    : 'text-ink-subtle hover:text-ink'
                            )}
                        >
                            {o.label}
                            <span className="ml-1.5 tabular-nums text-ink-faint">{counts[o.value]}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-5">
                {data.points.length < 2 ? (
                    <Empty>
                        Hacen falta al menos dos cuestionarios {type === 'daily' ? 'diarios' : 'semanales'} respondidos.
                    </Empty>
                ) : (
                    <div className="space-y-6">
                        {data.groups.map(group => (
                            <div key={group.key}>
                                <p className="text-t-xs font-semibold text-ink">{group.label}</p>
                                <p className="mt-0.5 text-t-2xs text-ink-faint">{group.description}</p>
                                <div className="mt-3 h-56">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={data.points} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                            <XAxis dataKey="label" tick={AXIS} />
                                            <YAxis
                                                tick={AXIS}
                                                domain={group.domain ?? ['auto', 'auto']}
                                                unit={group.unit ?? undefined}
                                                allowDecimals={group.axis !== 'count'}
                                            />
                                            <Tooltip
                                                contentStyle={TOOLTIP_STYLE}
                                                labelFormatter={(label, payload) =>
                                                    (payload?.[0]?.payload?.fullLabel as string) ?? label
                                                }
                                            />
                                            <Legend wrapperStyle={{ fontSize: 12 }} />
                                            {group.series.map(serie => (
                                                <Line
                                                    key={serie.id}
                                                    type="monotone"
                                                    dataKey={serie.id}
                                                    name={serie.label}
                                                    stroke={serie.color}
                                                    strokeWidth={2}
                                                    dot={{ r: 2.5 }}
                                                    connectNulls
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        ))}

                        {data.comments.length > 0 && (
                            <div className="space-y-3 border-t border-subtle pt-5">
                                <p className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                    Lo que ha contado
                                </p>
                                {data.comments.map((c, i) => (
                                    <p key={`${c.periodKey}-${i}`} className="text-t-sm leading-relaxed text-ink-muted">
                                        <span className="mr-2 font-mono text-t-xs text-ink-faint">{c.label}</span>
                                        {c.text}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
