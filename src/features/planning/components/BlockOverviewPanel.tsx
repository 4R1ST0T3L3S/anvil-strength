import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, XCircle, TrendingDown, Gauge } from 'lucide-react';
import {
    analyzeBlock,
    INTENSITY_ZONES,
    type BlockAnalytics,
    type IntensityZoneKey,
    type WeekAnalytics,
} from '../../../lib/planning/blockAnalytics';
import { computeVolume, weeklyAverages, type VolumeSessionInput } from '../../../lib/volume/engine';
import { WEEKLY_SET_REFERENCE, type MovementPattern } from '../../../lib/volume/muscles';
import { transition, DURATION, stagger } from '../../../lib/motion';
import { cn } from '../../../lib/utils';

/**
 * Resumen analítico del bloque completo.
 *
 * QUÉ PREGUNTA RESPONDE, Y POR QUÉ NO LA RESPONDÍA NADA
 * El editor de día muestra el detalle de una sesión y el panel de volumen el
 * reparto por músculo. Ninguno de los dos deja ver la forma del mesociclo: si
 * la carga sube, dónde está la descarga, a qué intensidad se trabaja, si un
 * día se quedó vacío al copiar una semana. Esa lectura es la que decide si un
 * bloque está bien programado, y hasta ahora había que reconstruirla a mano
 * abriendo día por día.
 *
 * NO ES UN CUADRO DE MANDO
 * Cada cifra de aquí lleva a una decisión concreta del coach. Lo que no
 * cambia una decisión no se pinta: no hay medidores de adorno ni porcentajes
 * sin referencia contra la que compararlos.
 */

export interface BlockOverviewPanelProps {
    /** Todas las sesiones del bloque, con el estado local sin guardar. */
    sessions: VolumeSessionInput[];
    /** Nombres personalizados de semana, para etiquetar los ejes. */
    weekNames?: Record<number, string>;
    /** 1RM declarados por ejercicio. Si faltan, se derivan del bloque. */
    declaredMaxes?: Record<string, number>;
    className?: string;
}

// ---------------------------------------------------------------------
// Métricas que se pueden graficar
// ---------------------------------------------------------------------

type MetricKey = 'tonnage' | 'sets' | 'intensity' | 'rpe' | 'inol';

interface MetricDef {
    key: MetricKey;
    label: string;
    /** null = la semana no tiene el dato. Se dibuja hueco, no cero. */
    get: (w: WeekAnalytics) => number | null;
    format: (v: number) => string;
    /** Explica qué se está mirando. Aparece bajo la gráfica. */
    hint: string;
}

const METRICS: MetricDef[] = [
    {
        key: 'tonnage',
        label: 'Tonelaje',
        get: (w) => (w.tonnage > 0 ? w.tonnage : null),
        format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${Math.round(v)} kg`),
        hint: 'Series × repeticiones × carga. Solo cuenta lo que tiene kg prescritos.',
    },
    {
        key: 'sets',
        label: 'Series',
        get: (w) => (w.totalSets > 0 ? w.totalSets : null),
        format: (v) => `${v}`,
        hint: 'Series totales prescritas en la semana, sumando todos los ejercicios.',
    },
    {
        key: 'intensity',
        label: 'Intensidad',
        get: (w) => w.avgIntensity,
        format: (v) => `${v}%`,
        hint: 'Media de %1RM ponderada por series.',
    },
    {
        key: 'rpe',
        label: 'RPE',
        get: (w) => w.avgRpe,
        format: (v) => `${v}`,
        hint: 'Media del RPE prescrito, ponderada por series. En rangos toma el extremo alto.',
    },
    {
        key: 'inol',
        label: 'INOL',
        get: (w) => w.inol,
        format: (v) => v.toFixed(2),
        hint: 'Repeticiones ÷ (100 − %1RM). Pondera el trabajo por lo cerca del máximo que se hace. Orientativo: 0,4–1,0 por semana y levantamiento.',
    },
];

const PATTERN_LABEL: Record<MovementPattern, string> = {
    squat: 'Sentadilla',
    bench: 'Press banca',
    deadlift: 'Peso muerto',
    press: 'Empuje vertical',
    pull: 'Tirón',
    hinge: 'Bisagra de cadera',
    accessory: 'Accesorio',
    core: 'Core',
};

const ZONE_COLOR: Record<IntensityZoneKey, string> = {
    z1: 'var(--effort-low)',
    z2: 'var(--effort-mid)',
    z3: 'var(--effort-high)',
    z4: 'var(--effort-max)',
};

// ---------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------

export function BlockOverviewPanel({
    sessions,
    weekNames = {},
    declaredMaxes,
    className,
}: BlockOverviewPanelProps) {
    const analytics = useMemo(
        () => analyzeBlock(sessions, { declaredMaxes }),
        [sessions, declaredMaxes]
    );

    const hasContent = analytics.totals.exercises > 0;

    if (!hasContent) {
        return (
            <div className={cn('py-16 text-center', className)}>
                <Gauge className="mx-auto h-8 w-8 text-ink-faint" aria-hidden="true" />
                <p className="mt-3 text-t-sm text-ink-muted">
                    Todavía no hay ejercicios en este bloque.
                </p>
                <p className="mt-1 text-t-xs text-ink-subtle">
                    En cuanto programes el primer día, aquí verás la progresión semanal,
                    el reparto de intensidad y los avisos de prescripción.
                </p>
            </div>
        );
    }

    return (
        <div className={cn('space-y-8', className)}>
            <SummaryRow analytics={analytics} />
            <IssuePanel issues={analytics.issues} />
            <WeeklyChart analytics={analytics} weekNames={weekNames} />

            <div className="grid gap-8 lg:grid-cols-2">
                <IntensityBreakdown analytics={analytics} />
                <FrequencyBreakdown analytics={analytics} />
            </div>

            <MuscleSummary sessions={sessions} weekCount={analytics.weeks.length} />
            <WeekTable analytics={analytics} weekNames={weekNames} />
        </div>
    );
}

// ---------------------------------------------------------------------
// Cifras de cabecera
// ---------------------------------------------------------------------

function SummaryRow({ analytics }: { analytics: BlockAnalytics }) {
    const { totals, weeks } = analytics;
    const activeWeeks = weeks.filter((w) => w.plannedSessionCount > 0).length || 1;

    // Los días vacíos quedan fuera: un día sin ejercicios no es entrenamiento,
    // y contarlo inflaba la frecuencia semanal justo cuando el bloque tenía un
    // hueco que había que corregir.
    const plannedSessions = weeks.reduce((sum, w) => sum + w.plannedSessionCount, 0);

    // El total de un bloque de 8 semanas no dice nada por sí solo; lo que se
    // compara entre atletas y entre bloques es la media semanal.
    const items: { label: string; value: string; sub?: string }[] = [
        {
            label: 'Series / semana',
            value: `${Math.round(totals.sets / activeWeeks)}`,
            sub: `${totals.sets} en el bloque`,
        },
        {
            label: 'Tonelaje / semana',
            value:
                totals.tonnage > 0
                    ? `${(totals.tonnage / activeWeeks / 1000).toFixed(1)} t`
                    : '—',
            sub: totals.tonnage > 0 ? `${(totals.tonnage / 1000).toFixed(1)} t en total` : 'Sin cargas prescritas',
        },
        {
            label: 'Sesiones / semana',
            value: (Math.round((plannedSessions / activeWeeks) * 10) / 10).toString(),
            sub: `${totals.exercises} ejercicios`,
        },
        {
            label: 'Semanas',
            value: `${weeks.length}`,
            sub:
                analytics.deloadWeeks.length > 0
                    ? `${analytics.deloadWeeks.length} de descarga`
                    : 'Sin descarga',
        },
    ];

    return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {items.map((it) => (
                <div key={it.label}>
                    <p className="text-t-2xs uppercase tracking-wide text-ink-subtle">
                        {it.label}
                    </p>
                    <p className="mt-1 text-t-2xl font-semibold text-ink">{it.value}</p>
                    {it.sub && <p className="mt-0.5 text-t-xs text-ink-faint">{it.sub}</p>}
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------

const ISSUE_STYLE = {
    error: { icon: XCircle, className: 'text-danger', bg: 'bg-[var(--danger-quiet)]' },
    warning: { icon: AlertTriangle, className: 'text-warning', bg: 'bg-[var(--warning-quiet)]' },
    info: { icon: Info, className: 'text-info', bg: 'bg-[var(--info-quiet)]' },
} as const;

function IssuePanel({ issues }: { issues: BlockAnalytics['issues'] }) {
    // Con muchos avisos la lista taparía el resto del panel. Se muestran los
    // más graves y el resto se despliega bajo petición.
    const [expanded, setExpanded] = useState(false);
    if (issues.length === 0) return null;

    const visible = expanded ? issues : issues.slice(0, 3);

    return (
        <div className="space-y-1.5">
            {visible.map((issue, i) => {
                const style = ISSUE_STYLE[issue.level];
                const Icon = style.icon;
                return (
                    <motion.div
                        key={`${issue.code}-${issue.week ?? i}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={stagger(i)}
                        className={cn(
                            'flex items-start gap-2.5 rounded-field px-3 py-2.5 text-t-sm',
                            style.bg,
                            style.className
                        )}
                    >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{issue.message}</span>
                    </motion.div>
                );
            })}

            {issues.length > 3 && (
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="text-t-xs font-medium text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink"
                >
                    {expanded
                        ? 'Ver menos'
                        : `Ver ${issues.length - 3} aviso${issues.length - 3 === 1 ? '' : 's'} más`}
                </button>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------
// Progresión semanal
// ---------------------------------------------------------------------

function WeeklyChart({
    analytics,
    weekNames,
}: {
    analytics: BlockAnalytics;
    weekNames: Record<number, string>;
}) {
    const [metricKey, setMetricKey] = useState<MetricKey>('tonnage');
    const [hovered, setHovered] = useState<number | null>(null);

    // Solo se ofrecen las métricas que este bloque puede calcular. Una pestaña
    // que siempre sale vacía enseña al coach a ignorar la barra de pestañas.
    const available = useMemo(
        () => METRICS.filter((m) => analytics.weeks.some((w) => m.get(w) != null)),
        [analytics.weeks]
    );

    const metric = available.find((m) => m.key === metricKey) ?? available[0];

    if (!metric) return null;

    const values = analytics.weeks.map((w) => metric.get(w));
    const nums = values.filter((v): v is number => v != null);
    const max = Math.max(...nums, 1);

    // Las métricas de nivel (intensidad, RPE) se leen mal desde cero: la
    // diferencia entre 78% y 84% desaparece en una barra que arranca en 0.
    const zeroBased = metric.key === 'tonnage' || metric.key === 'sets' || metric.key === 'inol';
    const min = zeroBased ? 0 : Math.max(0, Math.min(...nums) - (max - Math.min(...nums)) * 0.6 - 1);
    const span = max - min || 1;

    return (
        <section>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-t-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Progresión semanal
                </h3>

                <div role="tablist" aria-label="Métrica" className="flex flex-wrap rounded-field bg-surface-sunken p-0.5">
                    {available.map((m) => (
                        <button
                            key={m.key}
                            role="tab"
                            aria-selected={metric.key === m.key}
                            onClick={() => setMetricKey(m.key)}
                            className={cn(
                                'rounded-chip px-2.5 py-1 text-t-2xs font-semibold uppercase transition-colors duration-fast ease-snap',
                                metric.key === m.key
                                    ? 'bg-brand text-brand-ink'
                                    : 'text-ink-subtle hover:text-ink'
                            )}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="flex items-end gap-1.5" style={{ height: 168 }}>
                {analytics.weeks.map((w, i) => {
                    const value = values[i];
                    const isDeload = analytics.deloadWeeks.includes(w.week);
                    const pct = value == null ? 0 : ((value - min) / span) * 100;
                    const isHovered = hovered === w.week;

                    return (
                        <div
                            key={w.week}
                            className="group relative flex h-full flex-1 flex-col justify-end"
                            onMouseEnter={() => setHovered(w.week)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            {/* El valor vive sobre la barra, no en un tooltip: en una
                                gráfica de 4-12 barras caben todos y evitan el hover. */}
                            <p
                                className={cn(
                                    'mb-1.5 text-center text-t-2xs tabular-nums transition-colors duration-fast ease-snap',
                                    isHovered ? 'text-ink' : 'text-ink-subtle'
                                )}
                            >
                                {value == null ? '—' : metric.format(value)}
                            </p>

                            <motion.div
                                initial={false}
                                animate={{ height: `${Math.max(pct, value == null ? 0 : 2)}%` }}
                                transition={transition(DURATION.base)}
                                className={cn(
                                    'w-full rounded-t-chip',
                                    value == null
                                        ? 'bg-[var(--border-subtle)]'
                                        : isDeload
                                          ? 'bg-info/70'
                                          : 'bg-brand'
                                )}
                                role="img"
                                aria-label={`Semana ${w.ordinal}: ${
                                    value == null ? 'sin dato' : metric.format(value)
                                }${isDeload ? ', descarga' : ''}`}
                            />

                            <p className="mt-2 truncate text-center text-t-2xs text-ink-subtle">
                                S{w.ordinal}
                            </p>
                            {weekNames[w.week] && (
                                <p className="truncate text-center text-t-2xs text-ink-faint">
                                    {weekNames[w.week]}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-t-2xs text-ink-faint">
                <span>{metric.hint}</span>
                {analytics.deloadWeeks.length > 0 && (
                    <span className="flex items-center gap-1.5 text-info">
                        <TrendingDown className="h-3 w-3" aria-hidden="true" />
                        Semana de descarga detectada
                    </span>
                )}
            </div>
        </section>
    );
}

// ---------------------------------------------------------------------
// Zonas de intensidad
// ---------------------------------------------------------------------

function IntensityBreakdown({ analytics }: { analytics: BlockAnalytics }) {
    const total = Object.values(analytics.setsByZone).reduce((a, b) => a + b, 0);

    return (
        <section>
            <h3 className="mb-4 text-t-sm font-semibold uppercase tracking-wide text-ink-muted">
                Reparto de intensidad
            </h3>

            {total === 0 ? (
                <p className="text-t-sm text-ink-subtle">
                    Prescribe cargas en kg y aquí verás cuántas series caen en cada zona
                    de %1RM.
                </p>
            ) : (
                <>
                    <div className="flex h-2.5 overflow-hidden rounded-pill bg-surface-sunken">
                        {INTENSITY_ZONES.map((z) => {
                            const sets = analytics.setsByZone[z.key];
                            if (sets === 0) return null;
                            return (
                                <motion.div
                                    key={z.key}
                                    initial={false}
                                    animate={{ width: `${(sets / total) * 100}%` }}
                                    transition={transition(DURATION.base)}
                                    style={{ backgroundColor: ZONE_COLOR[z.key] }}
                                />
                            );
                        })}
                    </div>

                    <ul className="mt-4 space-y-2.5">
                        {INTENSITY_ZONES.map((z) => {
                            const sets = analytics.setsByZone[z.key];
                            return (
                                <li key={z.key} className="flex items-baseline gap-3">
                                    <span
                                        className="mt-1 h-2 w-2 shrink-0 rounded-pill"
                                        style={{ backgroundColor: ZONE_COLOR[z.key] }}
                                        aria-hidden="true"
                                    />
                                    <span className="w-16 shrink-0 text-t-xs font-medium text-ink">
                                        {z.label}
                                    </span>
                                    <span className="flex-1 text-t-xs text-ink-faint">{z.hint}</span>
                                    <span className="shrink-0 text-t-xs tabular-nums text-ink-muted">
                                        {sets === 0 ? '—' : `${sets} series`}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>

                    {/* La procedencia del %1RM cambia lo que la cifra significa, así
                        que se declara siempre en vez de esconderse en una ayuda. */}
                    {analytics.usesBlockDerivedMaxes && (
                        <p className="mt-4 flex items-start gap-2 rounded-field bg-surface-sunken px-2.5 py-2 text-t-xs text-ink-subtle">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>
                                Sin 1RM registrados, los porcentajes se calculan sobre la carga
                                más alta del propio bloque. Sirven para leer la intensidad
                                relativa dentro de este bloque, no para compararla con otro.
                            </span>
                        </p>
                    )}
                </>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------
// Frecuencia por patrón
// ---------------------------------------------------------------------

function FrequencyBreakdown({ analytics }: { analytics: BlockAnalytics }) {
    const rows = (Object.entries(analytics.frequencyPerWeek) as [MovementPattern, number][])
        .filter(([, freq]) => freq > 0)
        .sort((a, b) => b[1] - a[1]);

    const max = Math.max(...rows.map(([, f]) => f), 1);

    return (
        <section>
            <h3 className="mb-4 text-t-sm font-semibold uppercase tracking-wide text-ink-muted">
                Frecuencia semanal
            </h3>

            {rows.length === 0 ? (
                <p className="text-t-sm text-ink-subtle">Aún no hay patrones que medir.</p>
            ) : (
                <ul className="space-y-3">
                    {rows.map(([pattern, freq], i) => (
                        <motion.li
                            key={pattern}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={stagger(i)}
                        >
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                                <span className="text-t-xs font-medium text-ink">
                                    {PATTERN_LABEL[pattern]}
                                </span>
                                <span className="text-t-xs tabular-nums text-ink-muted">
                                    {freq === 1 ? '1 día' : `${freq} días`}/semana
                                </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                                <motion.div
                                    className="h-full bg-brand"
                                    initial={false}
                                    animate={{ width: `${(freq / max) * 100}%` }}
                                    transition={transition(DURATION.base)}
                                />
                            </div>
                        </motion.li>
                    ))}
                </ul>
            )}

            <p className="mt-4 text-t-2xs text-ink-faint">
                Días distintos por semana en los que se toca el patrón. Entrenar banca
                tres días de una semana y ninguno de otra no son 1,5 días de estímulo.
            </p>
        </section>
    );
}

// ---------------------------------------------------------------------
// Resumen muscular del bloque
// ---------------------------------------------------------------------

/**
 * Reutiliza el motor de volumen para dar la vista de bloque que el panel del
 * editor de día solo daba en su ámbito "Bloque", pero aquí ordenada por
 * distancia a la referencia: lo primero que se lee es lo que se sale de rango.
 */
function MuscleSummary({
    sessions,
    weekCount,
}: {
    sessions: VolumeSessionInput[];
    weekCount: number;
}) {
    const rows = useMemo(() => {
        const report = computeVolume(sessions);
        return weeklyAverages(report)
            .filter((r) => r.direct > 0)
            .sort((a, b) => b.perWeek - a.perWeek);
    }, [sessions]);

    if (rows.length === 0) return null;

    return (
        <section>
            <h3 className="mb-4 text-t-sm font-semibold uppercase tracking-wide text-ink-muted">
                Series directas por músculo y semana
            </h3>

            <div className="overflow-x-auto">
                <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {rows.map((r, i) => {
                        const ref = WEEKLY_SET_REFERENCE[r.muscle];
                        const scale = Math.max(ref.max * 1.35, r.perWeek);
                        return (
                            <motion.li
                                key={r.muscle}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={stagger(i)}
                            >
                                <div className="mb-1 flex items-baseline justify-between gap-2">
                                    <span className="text-t-xs font-medium text-ink">{r.muscle}</span>
                                    <span
                                        className={cn(
                                            'text-t-xs tabular-nums',
                                            r.verdict === 'above'
                                                ? 'text-warning'
                                                : r.verdict === 'below'
                                                  ? 'text-info'
                                                  : 'text-ink-muted'
                                        )}
                                    >
                                        {r.perWeek}
                                        <span className="text-ink-faint"> · ref {ref.min}–{ref.max}</span>
                                    </span>
                                </div>

                                {/* La banda de referencia se dibuja detrás de la barra:
                                    ver el número al lado del rango obliga a comparar
                                    mentalmente; verlo dentro de la banda no. */}
                                <div className="relative h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                                    <div
                                        className="absolute inset-y-0 bg-[var(--border-default)]"
                                        style={{
                                            left: `${(ref.min / scale) * 100}%`,
                                            width: `${((ref.max - ref.min) / scale) * 100}%`,
                                        }}
                                        aria-hidden="true"
                                    />
                                    <motion.div
                                        className={cn(
                                            'relative h-full',
                                            r.verdict === 'above'
                                                ? 'bg-warning'
                                                : r.verdict === 'below'
                                                  ? 'bg-info'
                                                  : 'bg-brand'
                                        )}
                                        initial={false}
                                        animate={{ width: `${Math.min((r.perWeek / scale) * 100, 100)}%` }}
                                        transition={transition(DURATION.base)}
                                    />
                                </div>
                            </motion.li>
                        );
                    })}
                </ul>
            </div>

            <p className="mt-4 text-t-2xs text-ink-faint">
                Media sobre {weekCount} {weekCount === 1 ? 'semana' : 'semanas'}. La banda gris es
                el rango semanal de referencia.
            </p>
        </section>
    );
}

// ---------------------------------------------------------------------
// Tabla semana a semana
// ---------------------------------------------------------------------

function WeekTable({
    analytics,
    weekNames,
}: {
    analytics: BlockAnalytics;
    weekNames: Record<number, string>;
}) {
    const [open, setOpen] = useState(false);

    return (
        <section>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="text-t-sm font-semibold uppercase tracking-wide text-ink-muted transition-colors duration-fast ease-snap hover:text-ink"
            >
                Detalle semana a semana {open ? '−' : '+'}
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={transition(DURATION.base)}
                        className="overflow-hidden"
                    >
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[560px] border-collapse text-t-sm">
                                <thead>
                                    <tr className="border-b border-[var(--border-default)] text-left">
                                        <Th>Semana</Th>
                                        <Th align="right">Días</Th>
                                        <Th align="right">Series</Th>
                                        <Th align="right">Reps</Th>
                                        <Th align="right">Tonelaje</Th>
                                        <Th align="right">kg/rep</Th>
                                        <Th align="right">%1RM</Th>
                                        <Th align="right">RPE</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analytics.weeks.map((w) => {
                                        const isDeload = analytics.deloadWeeks.includes(w.week);
                                        return (
                                            <tr
                                                key={w.week}
                                                className="border-b border-[var(--border-subtle)]"
                                            >
                                                <Td>
                                                    <span className="font-medium text-ink">
                                                        S{w.ordinal}
                                                    </span>
                                                    {weekNames[w.week] && (
                                                        <span className="ml-2 text-ink-subtle">
                                                            {weekNames[w.week]}
                                                        </span>
                                                    )}
                                                    {isDeload && (
                                                        <span className="ml-2 rounded-chip bg-[var(--info-quiet)] px-1.5 py-0.5 text-t-2xs text-info">
                                                            descarga
                                                        </span>
                                                    )}
                                                </Td>
                                                <Td align="right">{w.plannedSessionCount}</Td>
                                                <Td align="right">{w.totalSets}</Td>
                                                <Td align="right">{w.totalReps || '—'}</Td>
                                                <Td align="right">
                                                    {w.tonnage > 0
                                                        ? `${(w.tonnage / 1000).toFixed(1)} t`
                                                        : '—'}
                                                </Td>
                                                <Td align="right">{w.avgLoad ?? '—'}</Td>
                                                <Td align="right">
                                                    {w.avgIntensity != null ? `${w.avgIntensity}%` : '—'}
                                                </Td>
                                                <Td align="right">{w.avgRpe ?? '—'}</Td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <p className="mt-3 text-t-2xs text-ink-faint">
                            Un guion significa que falta el dato de partida, no que valga cero.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}

function Th({
    children,
    align = 'left',
}: {
    children: React.ReactNode;
    align?: 'left' | 'right';
}) {
    return (
        <th
            scope="col"
            className={cn(
                'pb-2 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle',
                align === 'right' ? 'text-right' : 'text-left'
            )}
        >
            {children}
        </th>
    );
}

function Td({
    children,
    align = 'left',
}: {
    children: React.ReactNode;
    align?: 'left' | 'right';
}) {
    return (
        <td
            className={cn(
                'py-2.5 tabular-nums text-ink-muted',
                align === 'right' ? 'text-right' : 'text-left'
            )}
        >
            {children}
        </td>
    );
}
