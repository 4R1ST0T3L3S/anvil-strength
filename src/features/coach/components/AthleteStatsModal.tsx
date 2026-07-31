import { useState, useEffect, useMemo } from 'react';
import { X, TrendingUp, Loader, Search, Check } from 'lucide-react';
import {
    LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { trainingService, ExerciseHistoryRow } from '../../../services/trainingService';
import { formsService, FormResponse } from '../../../services/formsService';
import { Macrocycle } from '../../../types/training';
import { AthleteVolumeTab } from './AthleteVolumeTab';
import { cn } from '../../../lib/utils';
import {
    summarize, weeklySeries, compareExercises, velocityProfile, summarizeCheckIns,
    kgOf, repsOf, rpeOf, repsKey, parseNum,
} from '../../../lib/stats/athleteStats';

type StatsTab = 'general' | 'exercises' | 'compare' | 'velocity' | 'volume';

interface AthleteStatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    athleteId: string;
    athleteName: string;
}

// Paleta de las gráficas. Sale de los tokens para que no haya un segundo
// juego de colores viviendo dentro de recharts. Ver src/styles/tokens.css.
const SERIES_COLORS = [
    'var(--brand)',
    'var(--info)',
    'var(--success)',
    'var(--warning)',
    'var(--effort-high)',
];

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
export function AthleteStatsModal({ isOpen, onClose, athleteId, athleteName }: AthleteStatsModalProps) {
    const [history, setHistory] = useState<ExerciseHistoryRow[]>([]);
    const [checkIns, setCheckIns] = useState<FormResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
    const [compareWith, setCompareWith] = useState<string[]>([]);
    const [repsFilter, setRepsFilter] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<StatsTab>('general');
    const [macros, setMacros] = useState<Macrocycle[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        // Los macrociclos y los cuestionarios son accesorios: si fallan, el
        // resto de las estadísticas siguen viéndose.
        trainingService.getMacrosByAthlete(athleteId).then(setMacros).catch(() => setMacros([]));
        formsService.getResponsesByAthlete(athleteId).then(setCheckIns).catch(() => setCheckIns([]));
    }, [isOpen, athleteId]);

    useEffect(() => {
        if (!isOpen) return;
        let alive = true;

        // `setLoading(true)` va dentro de la promesa y no en el cuerpo del
        // efecto: llamarlo de forma síncrona ahí provoca un render en cascada
        // (el estado ya arranca en `true`, así que además no cambiaba nada).
        trainingService.getExerciseHistoryByAthlete(athleteId)
            .then(rows => {
                if (!alive) return;
                setHistory(rows);
                const counts = new Map<string, number>();
                rows.forEach(r => counts.set(r.exerciseName, (counts.get(r.exerciseName) || 0) + 1));
                const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
                if (ranked[0]) setSelectedExercise(ranked[0][0]);
                // La comparativa arranca con los dos ejercicios más frecuentes:
                // abrir la pestaña en blanco obliga a adivinar qué hace.
                setCompareWith(ranked.slice(0, 2).map(([name]) => name));
            })
            .catch(console.error)
            .finally(() => { if (alive) setLoading(false); });

        return () => { alive = false; };
    }, [isOpen, athleteId]);

    // ---------------------------------------------------------------
    // DERIVADOS
    // ---------------------------------------------------------------
    const summary = useMemo(() => summarize(history), [history]);
    const weekly = useMemo(() => weeklySeries(history), [history]);
    const checkInData = useMemo(() => summarizeCheckIns(checkIns), [checkIns]);

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

    if (!isOpen) return null;

    const TABS: [StatsTab, string][] = [
        ['general', 'General'],
        ['exercises', 'Por ejercicio'],
        ['compare', 'Comparar'],
        ['velocity', 'Carga-velocidad'],
        ['volume', 'Volumen'],
    ];

    return (
        <div className="fixed inset-0 z-modal flex flex-col bg-surface-canvas animate-in fade-in duration-200">
            {/* ----------------------------------------------------- */}
            <header className="shrink-0 border-b border-subtle bg-surface-raised">
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

                <div role="tablist" aria-label="Vista de estadísticas" className="flex gap-1 overflow-x-auto px-4 pb-2 md:px-8">
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
                                            summary.firstWeek !== null
                                                ? `Semanas ${summary.firstWeek}–${summary.lastWeek}`
                                                : 'Sin registro todavía'
                                        }
                                    />
                                </div>

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
                                <ChartCard
                                    title="Cuestionarios"
                                    subtitle={
                                        checkInData.responseCount === 0
                                            ? 'Todavía no ha respondido ninguno.'
                                            : `${checkInData.responseCount} respuestas. Sueño, dolor, estrés y sensaciones puestos junto a la carga.`
                                    }
                                >
                                    {checkInData.points.length < 2 ? (
                                        <Empty>Hacen falta al menos dos cuestionarios respondidos.</Empty>
                                    ) : (
                                        <>
                                            <div className="h-64">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={checkInData.points} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                        <XAxis dataKey="label" tick={AXIS} />
                                                        <YAxis tick={AXIS} />
                                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                                        {checkInData.questions.map((q, i) => (
                                                            <Line
                                                                key={q.id}
                                                                type="monotone"
                                                                dataKey={q.id}
                                                                name={q.label}
                                                                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                                                                strokeWidth={2}
                                                                dot={{ r: 2.5 }}
                                                                connectNulls
                                                            />
                                                        ))}
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>

                                            {checkInData.comments.length > 0 && (
                                                <div className="mt-6 space-y-3 border-t border-subtle pt-5">
                                                    <p className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                                        Lo que ha contado
                                                    </p>
                                                    {checkInData.comments.map((c, i) => (
                                                        <p key={i} className="text-t-sm leading-relaxed text-ink-muted">
                                                            <span className="mr-2 font-mono text-t-xs text-ink-faint">{c.periodKey}</span>
                                                            {c.text}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                        </>
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
