import { memo, useMemo, useState, useRef } from 'react';
import { Trash2, Check } from 'lucide-react';
import { orderedWeekdays, weekdayLabel, type Weekday, type TrainingSet } from '../../../../types/training';
import type { FirstWeekday } from '../../../../lib/prefs/contract';
import { AnchoredMenu } from '../../../../components/ui/AnchoredMenu';
import type { ExtendedSession, ExtendedSessionExercise } from './types';
import { getSeriesCount, getRepsCount } from './helpers';
import { CopyDayMenu, type DayOption } from './CopyDayMenu';

/**
 * Tarjeta de día dentro de una semana.
 *
 * Antes solo decía "3 ejercicios", lo que obligaba a abrir el editor para
 * saber si un día era de sentadilla o de banca. Ahora enseña los ejercicios y
 * las series, que es lo que hace falta para escanear una semana entera y
 * decidir dónde tocar.
 */
export const DayCard = memo(function DayCard({
    session,
    onOpen,
    onRemove,
    onChangeWeekday,
    copiedDay,
    dayOptions,
    weekLabelFor,
    onCopyDay,
    onPasteDay,
    onCopyDayToMany,
    firstWeekday = 'monday',
}: {
    session: ExtendedSession;
    // Reciben el id en vez de venir ya cerrados sobre él. Con una lambda por
    // tarjeta, `memo` no servía de nada: las props cambiaban de identidad en
    // cada render del constructor aunque el día fuese exactamente el mismo.
    onOpen: (sessionId: string) => void;
    onRemove: (sessionId: string) => void;
    onChangeWeekday: (sessionId: string, day: Weekday | null) => void;
    /** Día copiado al portapapeles interno del constructor. null = vacío. */
    copiedDay: { sessionId: string; label: string } | null;
    /** Lista ESTRUCTURAL de todos los días del bloque, para "copiar a varios".
        Estable entre pulsaciones de kilos y reps: solo cambia si se añade,
        renombra o reagenda un día — ver `dayOptionsSignature` en el padre. */
    dayOptions: DayOption[];
    weekLabelFor: (weekNumber: number) => string;
    onCopyDay: (sessionId: string) => void;
    onPasteDay: (sessionId: string) => void;
    onCopyDayToMany: (sessionId: string, targetIds: string[], mode: 'replace' | 'append') => void;
    /** Preferencia del entrenador (src/lib/prefs/contract.ts). Solo cambia el ORDEN del menú "Agendar en", nunca el índice ISO real. */
    firstWeekday?: FirstWeekday;
}) {
    const metrics = useMemo(() => computeDayMetrics(session.exercises), [session.exercises]);
    const names = session.exercises
        .map(ex => ex.exercise?.name)
        .filter((n): n is string => Boolean(n));

    // Agendar es opcional: sin día asignado la tarjeta se sigue llamando
    // "Día 1", que es como funcionaba antes de poder ponerles fecha.
    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerAnchor = useRef<HTMLButtonElement>(null);
    const scheduled = weekdayLabel(session.day_of_week);
    const dayLabel = session.name || scheduled || `Día ${session.day_number}`;

    return (
        <div className="group/day relative rounded-card border border-[var(--border-default)] bg-surface-canvas transition-colors duration-fast ease-snap hover:border-[var(--border-strong)]">
            {/* Copiar y eliminar van fuera del botón principal: un <button>
                dentro de otro <button> es HTML inválido y el navegador lo
                reestructura. */}
            <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5">
                <CopyDayMenu
                    sessionId={session.id}
                    sessionLabel={dayLabel}
                    hasExercises={session.exercises.length > 0}
                    copiedDay={copiedDay}
                    dayOptions={dayOptions}
                    weekLabelFor={weekLabelFor}
                    onCopy={() => onCopyDay(session.id)}
                    onPasteHere={() => onPasteDay(session.id)}
                    onCopyToMany={(targets, mode) => onCopyDayToMany(session.id, targets, mode)}
                />
                <button
                    onClick={() => onRemove(session.id)}
                    title="Eliminar día"
                    aria-label={`Eliminar ${dayLabel}`}
                    className="rounded-field p-1.5 text-ink-faint opacity-0 transition-opacity duration-fast ease-snap hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover/day:opacity-100"
                >
                    <Trash2 size={14} aria-hidden="true" />
                </button>
            </div>

            {/* Agenda. Va fuera del botón principal por lo mismo. */}
            <div className="absolute left-3 top-3 z-10">
                <button
                    ref={pickerAnchor}
                    onClick={() => setPickerOpen(v => !v)}
                    aria-expanded={pickerOpen}
                    aria-haspopup="menu"
                    title="Agendar en un día de la semana"
                    className={`rounded-chip px-1.5 py-0.5 text-t-2xs uppercase tracking-wide transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${scheduled
 ? 'bg-brand-quiet font-semibold text-brand'
 : 'text-ink-subtle hover:text-ink'
 }`}
                >
                    {scheduled || `Día ${session.day_number}`}
                </button>

                {/* En portal, no en `absolute`.
                    Este menú vive dentro del acordeón de la semana, que lleva
                    `overflow-hidden` para poder animar su plegado. Un
                    desplegable absoluto se recortaba contra ese borde: los
                    últimos días de la lista quedaban fuera y no había forma de
                    asignar jueves, viernes, sábado ni domingo. `z-index` no lo
                    arreglaba porque `overflow` recorta, no ordena. */}
                <AnchoredMenu
                    open={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    anchorRef={pickerAnchor}
                >
                    <p className="px-2 pb-1 pt-0.5 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                        Agendar en
                    </p>
                    {orderedWeekdays(firstWeekday).map(d => (
                        <button
                            key={d.key}
                            role="menuitem"
                            onClick={() => { onChangeWeekday(session.id, d.key); setPickerOpen(false); }}
                            className={`flex w-full items-center justify-between rounded-field px-2.5 py-2 text-left text-t-sm transition-colors duration-fast ease-snap hover:bg-brand hover:text-brand-ink ${session.day_of_week === d.key ? 'font-semibold text-ink' : 'text-ink-muted'
 }`}
                        >
                            {d.label}
                            {session.day_of_week === d.key && <Check size={13} aria-hidden="true" />}
                        </button>
                    ))}
                    {session.day_of_week && (
                        <button
                            role="menuitem"
                            onClick={() => { onChangeWeekday(session.id, null); setPickerOpen(false); }}
                            className="mt-1 w-full rounded-field border-t border-[var(--border-subtle)] px-2.5 py-2 text-left text-t-xs text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink"
                        >
                            Quitar día — usar «Día {session.day_number}»
                        </button>
                    )}
                </AnchoredMenu>
            </div>

            <button
                onClick={() => onOpen(session.id)}
                className="flex min-h-[150px] w-full flex-col rounded-card p-4 pt-9 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
                <h4 className="mt-0.5 truncate pr-6 text-t-base font-semibold text-ink">
                    {session.name || scheduled || `Día ${session.day_number}`}
                </h4>

                {names.length === 0 ? (
                    <p className="mt-2 text-t-xs text-ink-subtle">Sin ejercicios todavía</p>
                ) : (
                    <>
                        <ul className="mt-2 space-y-0.5">
                            {names.slice(0, 3).map((name, i) => (
                                <li key={i} className="truncate text-t-xs text-ink-muted">
                                    {name}
                                </li>
                            ))}
                            {names.length > 3 && (
                                <li className="text-t-xs text-ink-faint">
                                    +{names.length - 3} más
                                </li>
                            )}
                        </ul>

                        <p className="mt-auto pt-3 text-t-2xs tabular-nums text-ink-subtle">
                            {metrics.totalSeries} series
                            {metrics.tonnage > 0 && ` · ${(metrics.tonnage / 1000).toFixed(1)} t`}
                        </p>
                    </>
                )}
            </button>
        </div>
    );
});

// ==========================================
// HELPERS: TEMA POR LEVANTAMIENTO + MÉTRICAS DEL DÍA
// ==========================================

/**
 * Palabras que convierten un movimiento en OTRO ejercicio, no en una variante
 * del básico.
 *
 * "Sentadilla búlgara" contenía "sentadilla", así que se marcaba SQ en rojo
 * como si fuese el movimiento de competición — y lo mismo pasaba con la
 * frontal, la hack o el press militar. Un accesorio no puede vestirse igual
 * que el levantamiento al que acompaña: la etiqueta deja de significar nada.
 *
 * Las variantes de competición SÍ siguen contando como el básico (pausada,
 * con cadenas, sin despegue...): son el mismo patrón a distinta dificultad.
 */
const NOT_THE_MAIN_LIFT = /bulgara|búlgara|frontal|hack|goblet|sissy|jaca|zercher|bulgaro|pistol|split|zancada|prensa|militar|inclinado|declinado|frances|francés|mancuerna|polea|maquina|máquina|banco|hombro|rumano|piernas rigidas|piernas rígidas|stiff|rdl|sumo alto|jefferson/;

/**
 * Clasifica el ejercicio por nombre y devuelve su tema de color.
 *
 * Solo los tres de competición reciben color propio. Todo lo demás es
 * accesorio, que es lo que pedía la app al dejar de ser exclusivamente de
 * powerlifting: el que entrena para otra cosa no tiene por qué hacer siempre
 * uno de los tres.
 */
export function getLiftTheme(name: string) {
    const n = name.toLowerCase();
    const accessory = { key: 'ACC', accent: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', bar: 'bg-emerald-500', gradient: 'from-emerald-500/15 to-transparent' };

    if (NOT_THE_MAIN_LIFT.test(n)) return accessory;

    if (n.includes('sentadilla') || n.includes('squat')) {
        return { key: 'SQ', accent: 'text-red-400', border: 'border-red-500/40', bg: 'bg-[var(--danger-quiet)]', bar: 'bg-red-500', gradient: 'from-red-500/15 to-transparent' };
    }
    // "press" a secas ya no basta: arrastraba press militar, press francés y
    // cualquier press de máquina a la etiqueta de banca.
    if (n.includes('banca') || n.includes('bench')) {
        return { key: 'BP', accent: 'text-sky-400', border: 'border-sky-500/40', bg: 'bg-sky-500/10', bar: 'bg-sky-500', gradient: 'from-sky-500/15 to-transparent' };
    }
    if (n.includes('peso muerto') || n.includes('deadlift')) {
        return { key: 'DL', accent: 'text-purple-400', border: 'border-purple-500/40', bg: 'bg-purple-500/10', bar: 'bg-purple-500', gradient: 'from-purple-500/15 to-transparent' };
    }
    return accessory;
}

/** Resumen compacto de la prescripción de un ejercicio: "3×3 · 5×5". */
export function summarizeSets(sets: TrainingSet[]): string {
    if (sets.length === 0) return 'Sin series';
    return sets.map(s => s.target_reps || '?').join(' · ');
}

/** Métricas agregadas del día para el panel derecho. */
export function computeDayMetrics(exercises: ExtendedSessionExercise[]) {
    let totalSeries = 0;
    let tonnage = 0;
    let maxLoad = 0;
    const byLift: Record<string, number> = { SQ: 0, BP: 0, DL: 0, ACC: 0 };

    exercises.forEach(ex => {
        const theme = getLiftTheme(ex.exercise?.name || '');
        ex.sets.forEach(set => {
            const series = parseInt(getSeriesCount(set.target_reps)) || 1;
            const reps = parseInt(getRepsCount(set.target_reps)) || 0;
            totalSeries += series;
            byLift[theme.key] += series;
            if (set.target_load) {
                tonnage += series * reps * set.target_load;
                if (set.target_load > maxLoad) maxLoad = set.target_load;
            }
        });
    });

    return { totalSeries, tonnage: Math.round(tonnage), maxLoad, byLift };
}

// ==========================================
// SUB-COMPONENT: DAY EDITOR (Pantalla completa)
// ==========================================
/** Mini-gráfica de las últimas cargas top de un ejercicio. */
export function Sparkline({ values, className = '' }: { values: number[]; className?: string }) {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 56, h = 16;
    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 3) - 1.5;
        return `${x},${y}`;
    }).join(' ');
    const rising = values[values.length - 1] >= values[0];
    return (
        <svg width={w} height={h} className={className} aria-hidden="true">
            <polyline
                points={points}
                fill="none"
                stroke={rising ? '#4ade80' : '#f87171'}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}
