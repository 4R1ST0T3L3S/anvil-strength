import { History } from 'lucide-react';
import { formatDaysAgo } from '../../../utils/dateUtils';
import type { LastSessionSetReference } from '../../../services/trainingService';
import { formatLoad } from '../../../lib/units';
import type { WeightUnit } from '../../../lib/prefs/contract';

/**
 * Referencia discreta a la última vez que el atleta hizo este ejercicio.
 *
 * Solo se enseña cuando el coach NO pautó un peso explícito (ver
 * `LoggerExerciseCard` — la decisión de mostrarla o no es de quien la
 * llama, este componente solo pinta lo que le pasan). Puramente informativa:
 * no escribe nada en la serie de hoy, el atleta sigue introduciendo sus
 * propios números.
 */
export function LastSessionReference({ reference, unit = 'kg' }: { reference: LastSessionSetReference; unit?: WeightUnit }) {
    const { reps, weight, rpe } = reference;

    return (
        <div className="flex items-center gap-1.5 border-b border-subtle bg-surface-sunken px-4 py-1.5 text-t-xs text-ink-subtle">
            <History size={12} className="shrink-0 text-ink-faint" />
            <span className="font-bold text-ink-muted">
                {reps} × {weight != null ? formatLoad(weight, unit) : 'corporal'}
                {rpe != null ? ` @${rpe}` : ''}
            </span>
            <span className="text-ink-subtle">· {formatDaysAgo(reference.completedAt)}</span>
        </div>
    );
}
