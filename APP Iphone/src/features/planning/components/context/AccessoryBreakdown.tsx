import { useMemo } from 'react';
import { Layers, ArrowUp, ArrowDown, Minus, AlertCircle } from 'lucide-react';
import type { VolumeSessionInput } from '../../../../lib/volume/engine';
import {
    accessoryReport, compareAccessoryWeeks, type AccessoryComparison,
} from '../../../../lib/planning/accessoryStats';
import { ContextSection, ContextEmpty } from './ContextSection';

/**
 * ACCESORIOS DE LA SEMANA, POR LO QUE APOYAN
 * =====================================================================
 *
 * VOLUMEN AQUÍ ES SERIES × REPETICIONES. NO TONELAJE.
 *
 * Y se escribe en la interfaz para que no haya duda: la columna dice "reps".
 * El razonamiento está en la cabecera de `lib/planning/accessoryStats.ts` —
 * 4×12 de face pull con 15 kg y 4×12 de remo con 100 tienen tonelajes que se
 * diferencian en un factor de siete y un coste de recuperación comparable.
 *
 *
 * QUÉ SE COMPARA CONTRA QUÉ
 *
 * Las series de ESTA semana frente a las de la ANTERIOR, las dos
 * PROGRAMADAS. No se mezcla con lo ejecutado a propósito: el trabajo de apoyo
 * se ajusta sobre lo que se pautó, y para saber si se hizo está la sección de
 * la semana anterior, que sí va contra el registro.
 *
 *
 * LO SIN CLASIFICAR SE ENSEÑA, NO SE ESCONDE
 *
 * Un accesorio sin categoría no se reparte a ojo. Sale abajo, con el número
 * de series y los nombres, porque es trabajo que existe y que no está
 * contando en ninguna categoría — y porque saberlo es lo que lleva al coach a
 * clasificarlo.
 */

interface AccessoryBreakdownProps {
    sessions: VolumeSessionInput[];
    currentWeek: number;
    /** La semana anterior DEL BLOQUE. `null` si esta es la primera. */
    previousWeek: number | null;
}

export function AccessoryBreakdown({
    sessions, currentWeek, previousWeek,
}: AccessoryBreakdownProps) {
    const current = useMemo(
        () => accessoryReport(sessions, [currentWeek]),
        [sessions, currentWeek]
    );

    const rows = useMemo(
        () =>
            previousWeek === null
                ? []
                : compareAccessoryWeeks(sessions, currentWeek, previousWeek),
        [sessions, currentWeek, previousWeek]
    );

    // Sin semana anterior se enseñan igual las categorías de esta, solo que
    // sin comparación. Es el caso de la primera semana de un bloque, y
    // esconder el reparto ahí sería peor que enseñarlo a medias.
    const display: AccessoryComparison[] =
        previousWeek === null
            ? current.buckets.map(b => ({
                key: b.key,
                label: b.label,
                short: b.short,
                currentSets: b.sets,
                previousSets: 0,
                previousVolume: 0,
                rpe: b.rpe,
                delta: 0,
            }))
            : rows;

    const hasAny = display.length > 0 || current.unclassified.sets > 0;

    return (
        <ContextSection
            icon={Layers}
            title="Accesorios"
            badge={`${current.totalSets} series`}
            hint={
                display.length > 0
                    ? display.filter(d => d.currentSets > 0).map(d => `${d.short} ${d.currentSets}`).join(' · ')
                    : 'Sin accesorios esta semana'
            }
        >
            {!hasAny ? (
                <ContextEmpty>
                    Esta semana no hay ningún ejercicio accesorio programado.
                </ContextEmpty>
            ) : (
                <div className="space-y-2">
                    {display.length > 0 && (
                        <table className="w-full text-t-2xs tabular-nums">
                            <thead>
                                <tr className="text-ink-faint">
                                    <th scope="col" className="pb-1 text-left font-bold uppercase tracking-wide">
                                        Grupo
                                    </th>
                                    <th scope="col" className="pb-1 text-right font-bold uppercase tracking-wide" title="Series programadas esta semana">
                                        Act.
                                    </th>
                                    <th scope="col" className="pb-1 text-right font-bold uppercase tracking-wide" title="Series programadas la semana anterior">
                                        Ant.
                                    </th>
                                    <th scope="col" className="pb-1 text-right font-bold uppercase tracking-wide" title="Volumen de la semana anterior: series × repeticiones">
                                        Reps
                                    </th>
                                    <th scope="col" className="pb-1 text-right font-bold uppercase tracking-wide" title="RPE pautado esta semana">
                                        RPE
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {display.map(row => (
                                    <tr key={row.key} className="border-t border-[var(--border-subtle)]">
                                        <th scope="row" className="py-1.5 pr-1 text-left">
                                            <span className="flex items-center gap-1">
                                                <span className="truncate font-bold text-ink" title={row.label}>
                                                    {row.short}
                                                </span>
                                                <Trend delta={row.delta} comparable={previousWeek !== null} />
                                            </span>
                                        </th>
                                        <td className="py-1.5 text-right font-bold text-brand-text">
                                            {row.currentSets}
                                        </td>
                                        <td className="py-1.5 text-right text-ink-subtle">
                                            {previousWeek === null ? '—' : row.previousSets}
                                        </td>
                                        <td className="py-1.5 text-right text-ink-subtle">
                                            {previousWeek === null || row.previousVolume === 0 ? '—' : row.previousVolume}
                                        </td>
                                        <td className="py-1.5 text-right text-ink-muted">
                                            {row.rpe ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Lo que no está clasificado. Con la salida a la vista:
                        se marca en la ficha del ejercicio. */}
                    {current.unclassified.sets > 0 && (
                        <div className="flex items-start gap-2 rounded-field bg-[var(--warning-quiet)] px-2.5 py-2">
                            <AlertCircle size={12} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                            <p className="min-w-0 text-t-2xs leading-relaxed text-ink-muted">
                                <strong className="font-bold text-ink">
                                    {current.unclassified.sets} series sin clasificar
                                </strong>{' '}
                                — no cuentan en ningún grupo. Márcalas en la ficha del
                                ejercicio.
                                <span className="mt-0.5 block truncate text-ink-subtle">
                                    {current.unclassified.exercises.slice(0, 4).join(', ')}
                                    {current.unclassified.exercises.length > 4 &&
                                        ` +${current.unclassified.exercises.length - 4}`}
                                </span>
                            </p>
                        </div>
                    )}
                </div>
            )}
        </ContextSection>
    );
}

/**
 * La flecha de tendencia.
 *
 * `comparable` distingue "no ha cambiado" de "no hay con qué comparar". Sin
 * esa distinción, la primera semana de un bloque enseñaría un guion plano en
 * todas las categorías y se leería como estancamiento.
 */
function Trend({ delta, comparable }: { delta: number; comparable: boolean }) {
    if (!comparable) return null;
    if (delta === 0) {
        return <Minus size={9} className="shrink-0 text-ink-faint" aria-label="igual que la semana anterior" />;
    }
    return delta > 0 ? (
        <ArrowUp size={9} className="shrink-0 text-success" aria-label={`${delta} series más`} />
    ) : (
        <ArrowDown size={9} className="shrink-0 text-warning" aria-label={`${Math.abs(delta)} series menos`} />
    );
}
