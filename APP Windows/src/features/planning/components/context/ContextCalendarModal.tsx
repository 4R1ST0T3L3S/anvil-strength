import { useMemo, useState } from 'react';
import { CalendarDays, Check } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal';
import { AthleteTimelineCalendar } from '../../../coach/components/AthleteTimelineCalendar';
import type { VolumeSessionInput } from '../../../../lib/volume/engine';
import type { LoggedSession } from '../../../../services/trainingService';
import {
    statsForScope, SCOPE_LABEL, type Scope, type ScopeStats,
} from '../../../../lib/stats/scopeStats';
import { weeksOf } from '../../../../lib/planning/liftSummary';
import { sortSessions } from '../builder/helpers';
import { weekdayLabel } from '../../../../types/training';

/**
 * EL CALENDARIO DEL PROGRAMADOR
 * =====================================================================
 *
 * SE ABRE ENCIMA, NO EN OTRA PANTALLA.
 *
 * `Modal` monta un diálogo sobre lo que ya hay: el editor del día sigue vivo
 * detrás con todo lo que se llevaba escrito, y cerrar devuelve exactamente al
 * sitio. La alternativa —navegar a la ficha del atleta y volver— tira el
 * estado local del constructor, que es donde vive lo que aún no se ha
 * guardado.
 *
 *
 * CUATRO NIVELES DE PROFUNDIDAD, UNA SOLA FUNCIÓN
 *
 * Día, semana, bloque y macro salen todos de `statsForScope`, que compone los
 * motores que ya existían (`analyzeBlock`, `computeVolume`,
 * `weeklyLiftSummary`, `accessoryReport`, `weekContrast`). Aquí no se calcula
 * nada: se elige el ámbito y se pinta.
 *
 * Y se enseñan PROGRAMADO y REALIZADO uno al lado del otro, separados, porque
 * es la comparación con la que se decide la semana siguiente.
 *
 *
 * SIN GRÁFICAS NUEVAS
 *
 * Una barra de progreso por semana en el ámbito bloque, y ya. La prioridad es
 * que las cifras sean correctas y rápidas de leer; un panel de seis gráficas
 * en un modal que se abre a mitad de escribir un día es ruido.
 */

interface ContextCalendarModalProps {
    open: boolean;
    onClose: () => void;
    athleteId: string;
    /** Todas las sesiones del bloque, con el estado local sin guardar. */
    sessions: VolumeSessionInput[];
    /** Metadatos de los días, para poder nombrarlos. */
    sessionMeta: { id: string; week_number: number; day_number: number; day_of_week?: string | null; name?: string | null }[];
    /** Registro de ejecución. Vacío si no ha cargado. */
    logged: LoggedSession[];
    /** El día que se está editando, para arrancar ahí. */
    currentSessionId: string;
    currentWeek: number;
    weekNames?: Record<number, string>;
    declaredMaxes?: Record<string, number>;
}

export function ContextCalendarModal({
    open, onClose, athleteId, sessions, sessionMeta, logged,
    currentSessionId, currentWeek, weekNames = {}, declaredMaxes = {},
}: ContextCalendarModalProps) {
    const [scope, setScope] = useState<Scope>('week');
    const [sessionId, setSessionId] = useState(currentSessionId);
    const [week, setWeek] = useState(currentWeek);

    const weeks = useMemo(() => weeksOf(sessions), [sessions]);

    const daysOfWeek = useMemo(() => {
        const inWeek = sessionMeta.filter(s => s.week_number === week);
        return sortSessions(inWeek);
    }, [sessionMeta, week]);

    const stats = useMemo(
        () =>
            statsForScope(
                { scope, sessionId, week, blockIds: null },
                sessions,
                { logged, declaredMaxes, weekNames }
            ),
        [scope, sessionId, week, sessions, logged, declaredMaxes, weekNames]
    );

    return (
        <Modal open={open} onClose={onClose} title="Calendario y estadísticas" size="xl">
            <div className="space-y-5">
                {/* La línea temporal del atleta. El mismo componente que la
                    ficha: un solo calendario individual en toda la app. */}
                <AthleteTimelineCalendar athleteId={athleteId} monthsBack={2} monthsForward={3} />

                {/* Selector de ámbito */}
                <div>
                    <div
                        role="tablist"
                        aria-label="Nivel de detalle"
                        className="flex rounded-field bg-surface-sunken p-0.5"
                    >
                        {(Object.keys(SCOPE_LABEL) as Scope[]).map(s => (
                            <button
                                key={s}
                                role="tab"
                                aria-selected={scope === s}
                                onClick={() => setScope(s)}
                                className={`flex-1 rounded-chip px-3 py-1.5 text-t-xs font-bold transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${scope === s ? 'bg-brand text-brand-ink' : 'text-ink-subtle hover:text-ink'
                                    }`}
                            >
                                {SCOPE_LABEL[s]}
                            </button>
                        ))}
                    </div>

                    {/* Qué semana / qué día. Solo cuando el ámbito lo pide:
                        elegir un día no significa nada en el ámbito bloque. */}
                    {(scope === 'day' || scope === 'week') && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {weeks.map(w => (
                                <button
                                    key={w}
                                    onClick={() => setWeek(w)}
                                    aria-pressed={week === w}
                                    className={`rounded-pill px-2.5 py-1 text-t-2xs font-bold tabular-nums transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${week === w
                                        ? 'bg-brand text-brand-ink'
                                        : 'bg-surface-sunken text-ink-subtle hover:text-ink'
                                        }`}
                                >
                                    S{w}
                                    {weekNames[w] ? ` · ${weekNames[w]}` : ''}
                                </button>
                            ))}
                        </div>
                    )}

                    {scope === 'day' && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {daysOfWeek.length === 0 ? (
                                <p className="text-t-xs text-ink-subtle">Esta semana no tiene días creados.</p>
                            ) : (
                                daysOfWeek.map(d => {
                                    const label = d.name || weekdayLabel(d.day_of_week) || `Día ${d.day_number}`;
                                    return (
                                        <button
                                            key={d.id}
                                            onClick={() => setSessionId(d.id)}
                                            aria-pressed={sessionId === d.id}
                                            className={`flex items-center gap-1 rounded-pill px-2.5 py-1 text-t-2xs font-bold transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${sessionId === d.id
                                                ? 'bg-brand text-brand-ink'
                                                : 'bg-surface-sunken text-ink-subtle hover:text-ink'
                                                }`}
                                        >
                                            {sessionId === d.id && <Check size={10} aria-hidden="true" />}
                                            {label}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                <ScopeStatsPanel stats={stats} />
            </div>
        </Modal>
    );
}

// =====================================================================

function ScopeStatsPanel({ stats }: { stats: ScopeStats }) {
    const { planned, executed } = stats;

    return (
        <div className="space-y-4">
            {/* ---------------- PROGRAMADO ---------------- */}
            <section>
                <h4 className="mb-2 flex items-center gap-2 text-t-2xs font-black uppercase tracking-widest text-ink-subtle">
                    <CalendarDays size={12} aria-hidden="true" />
                    Programado · {stats.label}
                </h4>

                <div className="grid gap-2 grid-cols-4">
                    <Cell label="Series" value={planned.sets} />
                    <Cell label="Reps" value={planned.reps} />
                    <Cell
                        label="Tonelaje"
                        value={planned.tonnage > 0
                            ? planned.tonnage >= 1000
                                ? `${(planned.tonnage / 1000).toFixed(1)} t`
                                : `${planned.tonnage} kg`
                            : '—'}
                    />
                    <Cell
                        label="Intensidad"
                        value={planned.avgIntensity != null ? `${Math.round(planned.avgIntensity)}%` : '—'}
                        hint={planned.avgIntensity == null ? 'Sin 1RM' : undefined}
                    />
                </div>

                {/* Básicos y accesorios, el reparto que de verdad se mira. */}
                <div className="mt-2 grid gap-2 grid-cols-2">
                    <div className="rounded-field border border-[var(--border-subtle)] bg-surface-sunken p-2.5">
                        <p className="text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">Básicos</p>
                        <ul className="mt-1 space-y-0.5">
                            {planned.lifts.map(l => (
                                <li key={l.lift} className="flex justify-between text-t-2xs tabular-nums">
                                    <span className="text-ink-muted">{l.label}</span>
                                    <span className={l.sets > 0 ? 'font-bold text-ink' : 'text-ink-faint'}>
                                        {l.sets}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="rounded-field border border-[var(--border-subtle)] bg-surface-sunken p-2.5">
                        <p className="text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">
                            Accesorios
                        </p>
                        {planned.accessories.buckets.length === 0 && planned.accessories.unclassified.sets === 0 ? (
                            <p className="mt-1 text-t-2xs text-ink-faint">Ninguno</p>
                        ) : (
                            <ul className="mt-1 space-y-0.5">
                                {planned.accessories.buckets.map(b => (
                                    <li key={b.key} className="flex justify-between text-t-2xs tabular-nums">
                                        <span className="text-ink-muted">{b.short}</span>
                                        <span className="font-bold text-ink">
                                            {b.sets} <span className="font-normal text-ink-subtle">· {b.volume} reps</span>
                                        </span>
                                    </li>
                                ))}
                                {planned.accessories.unclassified.sets > 0 && (
                                    <li className="flex justify-between text-t-2xs tabular-nums text-ink-subtle">
                                        <span>Sin clasificar</span>
                                        <span>{planned.accessories.unclassified.sets}</span>
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Evolución. Solo en bloque y macro: un día no evoluciona. */}
                {planned.weeks && planned.weeks.length > 1 && (
                    <div className="mt-2 rounded-field border border-[var(--border-subtle)] bg-surface-sunken p-2.5">
                        <p className="mb-1.5 text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">
                            Evolución del volumen
                        </p>
                        <WeekBars
                            weeks={planned.weeks.map(w => ({
                                week: w.week,
                                sets: w.totalSets,
                                intensity: w.avgIntensity,
                                deload: planned.deloadWeeks?.includes(w.week) ?? false,
                            }))}
                        />
                    </div>
                )}
            </section>

            {/* ---------------- REALIZADO ---------------- */}
            {executed && executed.contrast.plannedSets > 0 && (
                <section>
                    <h4 className="mb-2 text-t-2xs font-black uppercase tracking-widest text-ink-subtle">
                        Realizado
                    </h4>
                    <div className="grid gap-2 grid-cols-4">
                        <Cell
                            label="Cumplido"
                            value={`${executed.contrast.completionPct}%`}
                            hint={`${executed.contrast.loggedSets}/${executed.contrast.plannedSets} series`}
                        />
                        <Cell
                            label="Tonelaje"
                            value={executed.contrast.actualTonnage > 0
                                ? executed.contrast.actualTonnage >= 1000
                                    ? `${(executed.contrast.actualTonnage / 1000).toFixed(1)} t`
                                    : `${executed.contrast.actualTonnage} kg`
                                : '—'}
                        />
                        <Cell label="RPE real" value={executed.contrast.actualRpe ?? '—'} />
                        <Cell
                            label="Velocidad"
                            value={executed.avgVelocity != null ? `${executed.avgVelocity} m/s` : '—'}
                        />
                    </div>
                    {executed.deviations > 0 && (
                        <p className="mt-1.5 text-t-2xs text-ink-subtle">
                            {executed.deviations}{' '}
                            {executed.deviations === 1 ? 'serie se desvió' : 'series se desviaron'} de lo pautado.
                        </p>
                    )}
                </section>
            )}
        </div>
    );
}

function Cell({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
    return (
        <div className="rounded-field border border-[var(--border-subtle)] bg-surface-sunken p-2.5">
            <p className="truncate text-t-2xs uppercase tracking-wide text-ink-subtle">{label}</p>
            <p className="mt-0.5 text-t-base font-black tabular-nums text-ink">{value}</p>
            {hint && <p className="mt-0.5 truncate text-t-2xs text-ink-faint">{hint}</p>}
        </div>
    );
}

/**
 * Barras de volumen por semana.
 *
 * SVG a mano y no `recharts`: son cinco u ocho barras sin ejes ni tooltip, y
 * montar un `ResponsiveContainer` dentro de un modal que se abre a mitad de
 * escribir un día cuesta más de lo que aporta.
 */
function WeekBars({
    weeks,
}: {
    weeks: { week: number; sets: number; intensity: number | null; deload: boolean }[];
}) {
    const max = Math.max(...weeks.map(w => w.sets), 1);

    return (
        <ul className="flex items-end gap-1">
            {weeks.map(w => (
                <li key={w.week} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-t-2xs tabular-nums text-ink-subtle">{w.sets}</span>
                    <span
                        className={`w-full rounded-t-sm ${w.deload ? 'bg-info' : 'bg-brand'}`}
                        style={{ height: `${Math.max((w.sets / max) * 48, 2)}px` }}
                        title={`Semana ${w.week}: ${w.sets} series${w.intensity != null ? ` · ${Math.round(w.intensity)}%` : ''}${w.deload ? ' · descarga' : ''}`}
                    />
                    <span className="truncate text-t-2xs tabular-nums text-ink-faint">S{w.week}</span>
                </li>
            ))}
        </ul>
    );
}
