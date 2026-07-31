import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, TrendingUp } from 'lucide-react';
import {
    computeVolume,
    weeklyAverages,
    type VolumeSessionInput,
} from '../../../lib/volume/engine';
import { WEEKLY_SET_REFERENCE, type MuscleGroup } from '../../../lib/volume/muscles';
import { transition, DURATION, stagger } from '../../../lib/motion';
import { cn } from '../../../lib/utils';

/**
 * Panel de volumen en vivo.
 *
 * Se actualiza mientras el coach programa, sin guardar ni recargar: recibe
 * el estado local del builder y recalcula en cada cambio.
 *
 * POR QUÉ NO ES UN POP-UP
 * Un diálogo que aparece al añadir una serie robaría el foco justo mientras
 * se escribe, y habría que cerrarlo decenas de veces por sesión. El volumen
 * es información de referencia continua, así que vive en un panel siempre
 * visible. Lo que SÍ interrumpe es cruzar un umbral: eso se avisa una vez,
 * en la cabecera, y desaparece solo (ver `alerts`).
 *
 * Tres ámbitos, porque las tres preguntas son distintas:
 *   Día     — ¿está equilibrada esta sesión?
 *   Semana  — ¿llega el atleta a su volumen semanal? Es el que importa.
 *   Bloque  — ¿cómo progresa el volumen a lo largo del mesociclo?
 */

type Scope = 'day' | 'week' | 'block';

export interface VolumePanelProps {
    /** Todas las sesiones del bloque, con el estado local sin guardar. */
    sessions: VolumeSessionInput[];
    /** Sesión que se está editando, para los ámbitos Día y Semana. */
    currentSessionId: string;
    currentWeek: number;
    className?: string;
}

const SCOPE_LABEL: Record<Scope, string> = {
    day: 'Día',
    week: 'Semana',
    block: 'Bloque',
};

export function VolumePanel({
    sessions,
    currentSessionId,
    currentWeek,
    className,
}: VolumePanelProps) {
    const [scope, setScope] = useState<Scope>('week');

    const scoped = useMemo(() => {
        if (scope === 'day') return sessions.filter((s) => s.id === currentSessionId);
        if (scope === 'week') return sessions.filter((s) => s.week_number === currentWeek);
        return sessions;
    }, [sessions, scope, currentSessionId, currentWeek]);

    const report = useMemo(() => computeVolume(scoped), [scoped]);

    // Las referencias son semanales. En el ámbito Día no se comparan: una
    // sesión suelta siempre quedaría "por debajo" y el aviso sería ruido.
    const rows = useMemo(() => {
        const averages = weeklyAverages(report);
        return averages.sort((a, b) => b.total - a.total);
    }, [report]);

    const alerts = useMemo(() => {
        if (scope === 'day') return [];
        return rows.filter((r) => r.verdict === 'above' || (r.verdict === 'below' && r.direct > 0));
    }, [rows, scope]);

    const maxTotal = Math.max(...rows.map((r) => r.total), 1);

    return (
        <div className={cn('flex flex-col gap-4', className)}>
            <header className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                    Volumen por grupo muscular
                </h3>

                <div
                    role="tablist"
                    aria-label="Ámbito del cálculo"
                    className="flex rounded-field bg-surface-sunken p-0.5"
                >
                    {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                        <button
                            key={s}
                            role="tab"
                            aria-selected={scope === s}
                            onClick={() => setScope(s)}
                            className={cn(
                                'rounded-chip px-2.5 py-1 text-t-2xs font-semibold uppercase transition-colors duration-fast ease-snap',
                                scope === s
                                    ? 'bg-brand text-brand-ink'
                                    : 'text-ink-subtle hover:text-ink'
                            )}
                        >
                            {SCOPE_LABEL[s]}
                        </button>
                    ))}
                </div>
            </header>

            {/* Resumen: las dos cifras que el coach mira primero. */}
            <div className="flex items-baseline gap-6">
                <Metric label="Series" value={report.totalSets.toString()} />
                <Metric
                    label="Tonelaje"
                    value={
                        report.totalTonnage > 0
                            ? `${(report.totalTonnage / 1000).toFixed(1)} t`
                            : '—'
                    }
                    hint={report.totalTonnage === 0 ? 'Sin cargas prescritas' : undefined}
                />
                {scope === 'block' && (
                    <Metric label="Semanas" value={report.weekCount.toString()} />
                )}
            </div>

            {/* El aviso aparece solo cuando algo cruza el rango, y explica
                qué hacer. Un badge de color sin texto no accionaría nada. */}
            <AnimatePresence initial={false}>
                {alerts.length > 0 && (
                    <motion.ul
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={transition(DURATION.base)}
                        className="space-y-1.5 overflow-hidden"
                    >
                        {alerts.slice(0, 3).map((a) => (
                            <li
                                key={a.muscle}
                                className={cn(
                                    'flex items-start gap-2 rounded-field px-2.5 py-2 text-xs',
                                    a.verdict === 'above'
                                        ? 'bg-[var(--warning-quiet)] text-warning'
                                        : 'bg-[var(--info-quiet)] text-info'
                                )}
                            >
                                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                                <span>
                                    <strong className="font-semibold">{a.muscle}</strong>{' '}
                                    {a.verdict === 'above'
                                        ? `a ${a.perWeek} series/semana, por encima de ${WEEKLY_SET_REFERENCE[a.muscle].max}. Vigila la recuperación.`
                                        : `a ${a.perWeek} series/semana, por debajo de ${WEEKLY_SET_REFERENCE[a.muscle].min}. Puede ser intencionado en fase de pico.`}
                                </span>
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>

            {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-subtle">
                    Añade ejercicios y el reparto de volumen aparecerá aquí.
                </p>
            ) : (
                <ul className="space-y-2">
                    {rows.map((row, i) => (
                        <motion.li
                            key={row.muscle}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={stagger(i)}
                        >
                            <MuscleBar
                                muscle={row.muscle}
                                direct={row.direct}
                                indirect={row.indirect}
                                total={row.total}
                                max={maxTotal}
                                perWeek={scope === 'day' ? null : row.perWeek}
                            />
                        </motion.li>
                    ))}
                </ul>
            )}

            {/* Los ejercicios sin clasificar se declaran. Repartirlos a ojo
                daría una cifra falsa sobre la que el coach decidiría. */}
            {report.unclassified.length > 0 && (
                <div className="flex items-start gap-2 rounded-field bg-surface-sunken px-2.5 py-2 text-xs text-ink-subtle">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>
                        Sin clasificar y fuera del reparto:{' '}
                        <span className="text-ink-muted">
                            {report.unclassified.join(', ')}
                        </span>
                    </span>
                </div>
            )}

            <p className="flex items-center gap-1.5 text-t-2xs text-ink-faint">
                <TrendingUp className="h-3 w-3" />
                Directa = músculo motor. Indirecta = sinergista, también cuenta 1.
                Los rangos de referencia se comparan con las directas.
            </p>
        </div>
    );
}

function Metric({
    label,
    value,
    hint,
}: {
    label: string;
    value: string;
    hint?: string;
}) {
    return (
        <div>
            <p className="text-t-2xs uppercase tracking-wide text-ink-subtle">{label}</p>
            <p className="text-xl font-semibold text-ink">{value}</p>
            {hint && <p className="text-t-2xs text-ink-faint">{hint}</p>}
        </div>
    );
}

function MuscleBar({
    muscle,
    direct,
    indirect,
    total,
    max,
    perWeek,
}: {
    muscle: MuscleGroup;
    direct: number;
    indirect: number;
    total: number;
    max: number;
    perWeek: number | null;
}) {
    const ref = WEEKLY_SET_REFERENCE[muscle];
    const directPct = (direct / max) * 100;
    const indirectPct = (indirect / max) * 100;

    return (
        <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-ink">{muscle}</span>
                <span className="text-xs text-ink-muted">
                    <span className="font-semibold text-ink">{direct}</span>
                    {indirect > 0 && (
                        <span className="text-ink-subtle"> + {indirect} ind.</span>
                    )}
                    {perWeek !== null && (
                        <span className="ml-1.5 text-ink-faint">
                            · {ref.min}–{ref.max}/sem
                        </span>
                    )}
                </span>
            </div>

            {/* Una sola barra en dos tramos: directo sólido, indirecto
                atenuado. Dos barras separadas obligarían a sumarlas mentalmente. */}
            <div
                className="flex h-1.5 overflow-hidden rounded-pill bg-surface-sunken"
                role="img"
                aria-label={`${muscle}: ${direct} series directas, ${indirect} indirectas, ${total} en total`}
            >
                <motion.div
                    className="bg-brand"
                    initial={false}
                    animate={{ width: `${directPct}%` }}
                    transition={transition(DURATION.base)}
                />
                <motion.div
                    className="bg-brand/35"
                    initial={false}
                    animate={{ width: `${indirectPct}%` }}
                    transition={transition(DURATION.base)}
                />
            </div>
        </div>
    );
}
