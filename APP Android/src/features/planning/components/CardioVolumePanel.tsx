import { useMemo } from 'react';
import { HeartPulse } from 'lucide-react';
import {
    summarizeCardioVolume, formatCardioDuration, formatCardioDistance,
    type CardioSessionLike,
} from '../../../lib/planning/cardioVolume';

/**
 * VOLUMEN DE CARDIO DE LA SEMANA — G1.
 *
 * Su propio recuento, aparte del panel de volumen de fuerza: minutos y
 * kilómetros, programados y realizados. Nunca se mezcla con el tonelaje de
 * `VolumePanel` — ver la cabecera de `lib/planning/cardioVolume.ts`.
 *
 * Solo aparece si hay algo de cardio en la semana: en un bloque de fuerza
 * pura, esta tarjeta no debe ocupar sitio diciendo "0 min" todo el tiempo.
 */
export function CardioVolumePanel({
    sessions, currentWeek,
}: {
    sessions: CardioSessionLike[];
    currentWeek: number;
}) {
    const summary = useMemo(
        () => summarizeCardioVolume(sessions.filter(s => s.week_number === currentWeek)),
        [sessions, currentWeek]
    );

    const hayAlgo = summary.programado.seconds > 0 || summary.programado.km > 0
        || summary.realizado.seconds > 0 || summary.realizado.km > 0;
    if (!hayAlgo) return null;

    return (
        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-t-2xs font-black uppercase tracking-widest text-ink-subtle">
                <HeartPulse size={13} className="text-emerald-500" aria-hidden="true" />
                Cardio — esta semana
            </h4>
            <div className="grid grid-cols-2 gap-2">
                <Stat label="Programado" duration={summary.programado.seconds} km={summary.programado.km} />
                <Stat label="Realizado" duration={summary.realizado.seconds} km={summary.realizado.km} />
            </div>
        </div>
    );
}

function Stat({ label, duration, km }: { label: string; duration: number; km: number }) {
    return (
        <div className="rounded-field bg-surface-sunken px-2.5 py-2">
            <p className="text-t-2xs uppercase tracking-wide text-ink-faint">{label}</p>
            <p className="text-t-sm font-bold tabular-nums text-ink">{formatCardioDuration(duration)}</p>
            {km > 0 && <p className="text-t-2xs tabular-nums text-ink-subtle">{formatCardioDistance(km)}</p>}
        </div>
    );
}
