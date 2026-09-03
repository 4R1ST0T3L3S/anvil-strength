import { useRef, useState } from 'react';
import { Check, HeartPulse } from 'lucide-react';
import { TrainingSet } from '../../../types/training';
import { writeQueue } from '../../../lib/offlineQueue';

/**
 * UNA SERIE (O UN INTERVALO) DE CARDIO, EN EL REGISTRO DEL ATLETA.
 * =====================================================================
 *
 * Hermana de `LoggerSetRow`, pero para cardio: en vez de reps × kg, lo que
 * se marca es duración o distancia, y en vez de RPE hay frecuencia
 * cardíaca. Es un componente APARTE y no una rama dentro de `LoggerSetRow`
 * porque las dos filas no comparten ni una columna — mezclar las dos
 * habría significado un componente con la mitad de los campos siempre
 * ocultos, para el otro tipo de fila.
 *
 * Igual que `LoggerSetRow`: optimista, con `writeQueue` (tolera sin
 * cobertura) y sin la sofisticación de esa fila (conversión de unidad,
 * color de desviación de RPE) — el cardio no tiene esas necesidades: no
 * hay unidad de peso que convertir, y "más rápido de lo pautado" no es una
 * desviación que avisar en rojo.
 */

const COMMIT_DELAY = 500;

interface LoggerCardioRowProps {
    set: TrainingSet;
    displayIndex: number;
    needsExpansion?: boolean;
    onExpand?: (groupIndex: number) => Promise<string | null>;
    groupIndex?: number;
    onChange?: (setId: string, completed: boolean) => void;
}

/** Segundos → "45 min" o "1 h 15 min". */
function formatDuration(seconds: number): string {
    const totalMin = Math.round(seconds / 60);
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    if (h === 0) return `${min} min`;
    if (min === 0) return `${h} h`;
    return `${h} h ${min} min`;
}

export function LoggerCardioRow({
    set, displayIndex, needsExpansion = false, onExpand, groupIndex = 0, onChange,
}: LoggerCardioRowProps) {
    const [duration, setDuration] = useState('');
    const [hr, setHr] = useState('');
    const [distance, setDistance] = useState('');
    const [done, setDone] = useState(!!set.is_completed);
    const [saving, setSaving] = useState(false);

    const targetId = useRef(set.id);
    const expanding = useRef<Promise<string | null> | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const targetIsDuration = set.target_metric === 'duracion_seg';
    const targetIsDistance = set.target_metric === 'distancia_km';
    const targetText = targetIsDuration && set.target_load != null
        ? formatDuration(set.target_load)
        : targetIsDistance && set.target_load != null
            ? `${set.target_load} km`
            : null;

    const hrTarget = (() => {
        const bag = set.vbt_metrics;
        if (!bag) return null;
        if (bag.hr_target_min != null && bag.hr_target_max != null) return `${bag.hr_target_min}-${bag.hr_target_max} ppm`;
        if (bag.hr_target != null) return `${bag.hr_target} ppm`;
        return null;
    })();

    const commit = async (patch: Partial<TrainingSet>): Promise<string | null> => {
        if (needsExpansion && onExpand) {
            expanding.current ??= onExpand(groupIndex);
            const realId = await expanding.current;
            if (!realId) { expanding.current = null; return null; }
            targetId.current = realId;
        }
        writeQueue.enqueue('training_sets', targetId.current, patch as Record<string, unknown>);
        return targetId.current;
    };

    const handleDone = async () => {
        setSaving(true);
        setDone(true);

        const bag: Record<string, number> = {};
        const hrNum = Number.parseFloat(hr.replace(',', '.'));
        if (Number.isFinite(hrNum) && hrNum > 0) bag.hr_avg = hrNum;

        const durMin = Number.parseFloat(duration.replace(',', '.'));
        if (Number.isFinite(durMin) && durMin > 0) bag.duration_actual_seconds = Math.round(durMin * 60);

        const distNum = Number.parseFloat(distance.replace(',', '.'));
        if (Number.isFinite(distNum) && distNum > 0) bag.distance_km = distNum;

        const existing = set.vbt_metrics ?? {};
        const merged = { ...existing, ...bag };

        const realId = await commit({
            is_completed: true,
            vbt_metrics: Object.keys(merged).length > 0 ? merged : null,
        });
        setSaving(false);
        if (realId) onChange?.(realId, true);
    };

    const scheduleField = (setter: (v: string) => void, value: string) => {
        setter(value);
        if (timer.current) clearTimeout(timer.current);
        // Solo se reescribe si YA estaba hecho: mientras se está rellenando
        // antes de marcar, "hecho" es quien dispara el guardado.
        if (!done) return;
        timer.current = setTimeout(() => { void handleDone(); }, COMMIT_DELAY);
    };

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 px-4">
            <span className="w-5 shrink-0 text-center text-t-2xs font-black tabular-nums text-ink-subtle">{displayIndex}</span>

            <div className="min-w-0 flex-1">
                {targetText && (
                    <p className="text-t-xs font-bold text-ink">{targetText}</p>
                )}
                {hrTarget && (
                    <p className="flex items-center gap-1 text-t-2xs text-ink-subtle">
                        <HeartPulse size={10} aria-hidden="true" /> {hrTarget}
                    </p>
                )}
                {!targetText && !hrTarget && (
                    <p className="text-t-2xs text-ink-faint">Sin objetivo pautado</p>
                )}
            </div>

            <input
                type="text"
                inputMode="decimal"
                value={duration}
                onChange={(e) => scheduleField(setDuration, e.target.value)}
                placeholder="min"
                aria-label="Duración realizada, en minutos"
                className="h-9 w-16 rounded-field border border-[var(--border-default)] bg-surface-sunken text-center text-t-sm tabular-nums text-ink placeholder:text-ink-faint focus:border-brand"
            />
            <input
                type="text"
                inputMode="decimal"
                value={hr}
                onChange={(e) => scheduleField(setHr, e.target.value)}
                placeholder="ppm"
                aria-label="Frecuencia cardíaca media"
                className="h-9 w-16 rounded-field border border-[var(--border-default)] bg-surface-sunken text-center text-t-sm tabular-nums text-ink placeholder:text-ink-faint focus:border-brand"
            />
            <input
                type="text"
                inputMode="decimal"
                value={distance}
                onChange={(e) => scheduleField(setDistance, e.target.value)}
                placeholder="km"
                aria-label="Distancia recorrida"
                className="h-9 w-16 rounded-field border border-[var(--border-default)] bg-surface-sunken text-center text-t-sm tabular-nums text-ink placeholder:text-ink-faint focus:border-brand"
            />

            <button
                onClick={handleDone}
                disabled={saving}
                aria-pressed={done}
                aria-label={done ? 'Serie hecha' : 'Marcar como hecha'}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-field border transition-colors duration-fast ease-snap disabled:opacity-60 ${done
                    ? 'border-success/40 bg-[var(--success-quiet)] text-success'
                    : 'border-[var(--border-default)] bg-surface-sunken text-ink-faint hover:text-ink'
                    }`}
            >
                <Check size={16} aria-hidden="true" />
            </button>
        </div>
    );
}
