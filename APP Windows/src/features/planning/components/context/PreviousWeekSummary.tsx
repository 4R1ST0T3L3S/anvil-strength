import { useMemo } from 'react';
import { History, Gauge, Zap } from 'lucide-react';
import type { LoggedSession } from '../../../../services/trainingService';
import {
    previousWeekByLift, previousWeekOf, weekContrast,
    type ExecutedLiftWeek,
} from '../../../../lib/stats/weekExecutionSummary';
import { findMax, type MaxesByExercise } from '../../../../services/maxesService';
import { ContextSection, ContextEmpty } from './ContextSection';

/**
 * LA SEMANA ANTERIOR — LO QUE EL ATLETA HIZO DE VERDAD
 * =====================================================================
 *
 * TODO LO DE AQUÍ SALE DE `actual_*`, NUNCA DE `target_*`.
 *
 * Es la diferencia entre esta sección y la de arriba, y está señalada en la
 * interfaz con una etiqueta explícita —REALIZADO frente a PROGRAMADO— porque
 * las dos enseñan cifras con la misma forma y confundirlas lleva a programar
 * sobre algo que no pasó.
 *
 * Una serie que el atleta no registró NO se cuenta. Ni como cero, ni
 * rellenada con lo que ponía en el plan. El cálculo vive en
 * `lib/stats/weekExecutionSummary.ts` y tiene su propio banco de pruebas
 * dedicado a esa regla.
 *
 *
 * EL PORCENTAJE SOLO APARECE SI HAY 1RM DECLARADO
 *
 * Se resuelve con `findMax` del `maxesService`, que ya sabe caer de
 * "Sentadilla Pausada" a "Sentadilla". Si el atleta no tiene máximo
 * registrado, el hueco se queda vacío. No se estima a partir de las cargas de
 * la propia semana: un porcentaje sobre una referencia sacada de la semana
 * que se está juzgando no significa nada.
 */

interface PreviousWeekSummaryProps {
    /** Registro de ejecución del atleta. Vacío mientras carga o si falla. */
    logged: LoggedSession[];
    /** La semana que se está programando. La anterior se deduce del registro. */
    currentWeek: number;
    maxes?: MaxesByExercise | null;
    loading?: boolean;
}

export function PreviousWeekSummary({
    logged, currentWeek, maxes, loading = false,
}: PreviousWeekSummaryProps) {
    const previousWeek = useMemo(
        () => previousWeekOf(logged, currentWeek),
        [logged, currentWeek]
    );

    const resolveMax = useMemo(
        () => (name: string) => findMax(maxes, name)?.one_rm ?? null,
        [maxes]
    );

    const lifts = useMemo(
        () => (previousWeek === null ? [] : previousWeekByLift(logged, previousWeek, resolveMax)),
        [logged, previousWeek, resolveMax]
    );

    const contrast = useMemo(
        () => (previousWeek === null ? null : weekContrast(logged, previousWeek)),
        [logged, previousWeek]
    );

    const withData = lifts.filter(l => l.hasData);
    const totalSets = withData.reduce((n, l) => n + l.totalSets, 0);

    return (
        <ContextSection
            icon={History}
            title="Semana anterior"
            badge={previousWeek !== null ? `S${previousWeek}` : undefined}
            hint={
                loading
                    ? 'Cargando el registro…'
                    : previousWeek === null
                        ? 'Sin semanas anteriores'
                        : `${totalSets} series realizadas${contrast ? ` · ${contrast.completionPct}% cumplido` : ''}`
            }
        >
            {loading ? (
                <ContextEmpty>Cargando lo que hizo el atleta…</ContextEmpty>
            ) : previousWeek === null ? (
                <ContextEmpty>
                    No hay ninguna semana anterior registrada. Es la primera de este
                    atleta en el historial que se ha cargado.
                </ContextEmpty>
            ) : (
                <div className="space-y-3">
                    {/* La cabecera de contraste: antes de mirar movimiento a
                        movimiento, saber si la semana se cumplió al 95% o al
                        40% cambia cómo se lee todo lo demás. */}
                    {contrast && (
                        <div className="rounded-field bg-surface-sunken p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-t-2xs font-black uppercase tracking-widest text-ink-subtle">
                                    Cumplimiento
                                </span>
                                <span className={`text-t-sm font-black tabular-nums ${contrast.completionPct >= 85 ? 'text-success'
                                    : contrast.completionPct >= 60 ? 'text-warning'
                                        : 'text-danger-text'
                                    }`}>
                                    {contrast.completionPct}%
                                </span>
                            </div>
                            <p className="mt-1 text-t-2xs tabular-nums text-ink-subtle">
                                {contrast.loggedSets} de {contrast.plannedSets} series ·{' '}
                                {contrast.completedSessions}/{contrast.totalSessions} días cerrados
                            </p>
                        </div>
                    )}

                    {withData.length === 0 ? (
                        <ContextEmpty>
                            La semana {previousWeek} estaba programada pero el atleta no
                            registró ninguna serie de los básicos.
                        </ContextEmpty>
                    ) : (
                        <ul className="space-y-2.5">
                            {withData.map(lift => (
                                <ExecutedLiftRow key={lift.lift} lift={lift} />
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </ContextSection>
    );
}

// =====================================================================

function ExecutedLiftRow({ lift }: { lift: ExecutedLiftWeek }) {
    return (
        <li className="rounded-field border border-[var(--border-subtle)] bg-surface-sunken p-2.5">
            <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-t-xs font-black uppercase tracking-wide text-ink">
                    {lift.label}
                </span>
                {/* REALIZADO, dicho con todas las letras. Ver la cabecera. */}
                <span className="shrink-0 rounded-chip bg-[var(--success-quiet)] px-1.5 py-0.5 text-t-2xs font-bold uppercase tracking-wide text-success">
                    Realizado
                </span>
            </div>

            <ul className="mt-1.5 space-y-1.5">
                {lift.days.filter(d => d.sets > 0).map(day => (
                    <li key={day.sessionId} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-t-2xs font-semibold text-ink-muted">
                                {day.dayLabel}
                            </span>
                            <span className="block truncate text-t-2xs tabular-nums text-ink-subtle">
                                {day.detail}
                                {day.intensityPct != null && ` · ${Math.round(day.intensityPct)}%`}
                            </span>
                        </span>

                        {/* RPE y velocidad solo cuando existen. Un hueco vacío
                            es información: dice que ese día no se midió. */}
                        <span className="flex shrink-0 items-center gap-1.5 text-t-2xs tabular-nums text-ink-subtle">
                            {day.rpe != null && (
                                <span className="flex items-center gap-0.5" title={`RPE ${day.rpe}`}>
                                    <Gauge size={9} aria-hidden="true" />
                                    {day.rpe}
                                </span>
                            )}
                            {day.velocity != null && (
                                <span className="flex items-center gap-0.5" title={`${day.velocity} m/s`}>
                                    <Zap size={9} aria-hidden="true" />
                                    {day.velocity.toFixed(2)}
                                </span>
                            )}
                        </span>
                    </li>
                ))}
            </ul>

            {/* Total semanal. Las tres cifras que pide la especificación:
                series, repeticiones y tonelaje. */}
            <p className="mt-2 border-t border-[var(--border-subtle)] pt-1.5 text-t-2xs tabular-nums text-ink-subtle">
                <span className="font-bold text-ink-muted">{lift.totalSets}</span> series ·{' '}
                <span className="font-bold text-ink-muted">{lift.totalReps}</span> reps
                {lift.totalTonnage > 0 && (
                    <>
                        {' · '}
                        <span className="font-bold text-ink-muted">
                            {lift.totalTonnage >= 1000
                                ? `${(lift.totalTonnage / 1000).toFixed(1)} t`
                                : `${lift.totalTonnage} kg`}
                        </span>
                    </>
                )}
                {lift.avgIntensity != null && ` · ${Math.round(lift.avgIntensity)}% medio`}
            </p>
        </li>
    );
}
