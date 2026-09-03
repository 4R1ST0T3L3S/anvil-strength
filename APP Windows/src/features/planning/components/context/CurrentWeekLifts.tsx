import { useMemo, useRef, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import type { VolumeSessionInput } from '../../../../lib/volume/engine';
import { weeklyLiftSummary, type LiftWeekSummary } from '../../../../lib/planning/liftSummary';
import { AnchoredMenu } from '../../../../components/ui/AnchoredMenu';
import { ContextSection, ContextEmpty } from './ContextSection';

/**
 * SERIES SEMANALES DE LOS TRES BÁSICOS — LO PROGRAMADO
 * =====================================================================
 *
 * Va ARRIBA DEL TODO del panel y abierta por defecto, porque es la cifra que
 * decide lo que el coach está a punto de escribir: si la sentadilla lleva ya
 * 16 series esta semana, el día que se está editando no lleva otras seis.
 *
 * Se recalcula con cada tecla. No hace ninguna consulta: recibe el estado
 * LOCAL del constructor (el mismo array que alimenta al panel de volumen), así
 * que refleja también lo que todavía no se ha guardado — que es precisamente
 * lo que se necesita mientras se decide si guardarlo.
 *
 *
 * EL DESGLOSE VA EN UN MENÚ ANCLADO, NO EN UN `title`
 *
 * Un `title` nativo tarda un segundo largo en aparecer, no se puede tocar en
 * móvil y no admite formato — y aquí lo que hay que enseñar son tres o cuatro
 * líneas con día, series y porcentaje. `AnchoredMenu` ya resuelve el portal,
 * el cierre al pulsar fuera y el foco, y sobre todo resuelve el recorte: este
 * panel tiene `overflow-y-auto`, así que un desplegable en `absolute` se
 * cortaría contra su borde.
 *
 * Se abre al PULSAR y no al pasar por encima: en móvil no hay hover, y un
 * panel donde la mitad de la información solo existe con ratón es medio panel.
 */

interface CurrentWeekLiftsProps {
    sessions: VolumeSessionInput[];
    week: number;
    /** 1RM declarados del atleta, para poder escribir el % en el desglose. */
    declaredMaxes?: Record<string, number>;
}

export function CurrentWeekLifts({ sessions, week, declaredMaxes = {} }: CurrentWeekLiftsProps) {
    const summary = useMemo(
        () => weeklyLiftSummary(sessions, week, declaredMaxes),
        [sessions, week, declaredMaxes]
    );

    const total = summary.reduce((n, s) => n + s.sets, 0);

    return (
        <ContextSection
            icon={Dumbbell}
            title="Semana actual"
            defaultOpen
            badge={`${total} series`}
            hint={summary.filter(s => s.sets > 0).map(s => `${s.label} ${s.sets}`).join(' · ') || 'Sin básicos'}
        >
            {total === 0 ? (
                <ContextEmpty>
                    Esta semana no hay ninguna serie de sentadilla, banca ni peso muerto
                    programada todavía.
                </ContextEmpty>
            ) : (
                <ul className="space-y-1.5">
                    {summary.map(lift => (
                        <LiftRow key={lift.lift} lift={lift} />
                    ))}
                </ul>
            )}
        </ContextSection>
    );
}

// =====================================================================

function LiftRow({ lift }: { lift: LiftWeekSummary }) {
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLButtonElement>(null);

    const hasDetail = lift.days.length > 0;

    return (
        <li>
            <button
                ref={anchor}
                onClick={() => hasDetail && setOpen(v => !v)}
                aria-expanded={hasDetail ? open : undefined}
                aria-haspopup={hasDetail ? 'dialog' : undefined}
                disabled={!hasDetail}
                className={`flex w-full items-center justify-between gap-2 rounded-field px-2.5 py-2 text-left transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${hasDetail
                    ? 'bg-surface-sunken hover:bg-surface-overlay'
                    : 'bg-surface-sunken/50'
                    }`}
            >
                <span className="min-w-0">
                    <span className="block truncate text-t-xs font-bold text-ink">{lift.label}</span>
                    {/* La frecuencia al lado de las series: 12 series en un día
                        y 12 en tres no son el mismo estímulo, y el número solo
                        no lo distingue. */}
                    <span className="block text-t-2xs text-ink-subtle">
                        {lift.sets === 0
                            ? 'Sin programar'
                            : `${lift.frequency} ${lift.frequency === 1 ? 'día' : 'días'}${lift.reps > 0 ? ` · ${lift.reps} reps` : ''}`}
                    </span>
                </span>

                <span className="shrink-0 text-right">
                    <span className={`block text-t-lg font-black leading-none tabular-nums ${lift.sets > 0 ? 'text-brand-text' : 'text-ink-faint'}`}>
                        {lift.sets}
                    </span>
                    <span className="block text-t-2xs uppercase tracking-wide text-ink-subtle">
                        series
                    </span>
                </span>
            </button>

            <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={anchor}>
                <div className="min-w-[200px] max-w-[260px] p-1">
                    <p className="px-2 pb-1.5 pt-0.5 text-t-2xs font-black uppercase tracking-widest text-ink-subtle">
                        {lift.label} — {lift.sets} series
                    </p>

                    <ul className="space-y-1.5 px-2 pb-1">
                        {lift.days.map(day => (
                            <li key={day.sessionId}>
                                <p className="text-t-2xs font-bold text-ink">{day.dayLabel}</p>
                                <p className="text-t-2xs tabular-nums text-ink-muted">{day.detail}</p>
                            </li>
                        ))}
                    </ul>

                    {lift.tonnage > 0 && (
                        <p className="border-t border-[var(--border-subtle)] px-2 pb-0.5 pt-1.5 text-t-2xs tabular-nums text-ink-subtle">
                            {lift.reps} reps · {(lift.tonnage / 1000).toFixed(1)} t
                        </p>
                    )}
                </div>
            </AnchoredMenu>
        </li>
    );
}
