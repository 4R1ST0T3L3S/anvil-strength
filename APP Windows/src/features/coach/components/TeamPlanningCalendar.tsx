import { useMemo, useState } from 'react';
import { CalendarOff, ChevronRight, Info, Trophy } from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { useTeamCoverage } from '../hooks/useTeamCoverage';
import {
    addDays, daysBetween, ymd, parseYmd,
    type AthleteCoverage,
} from '../../../lib/planning/coverage';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { Skeleton } from '../../../components/ui/Skeleton';
import { SafeImage } from '../../../components/ui/SafeImage';

/**
 * CALENDARIO GENERAL DEL EQUIPO — REJILLA DE DÍAS
 * =====================================================================
 *
 * Rediseño del 30 de agosto de 2026 (decisión D1: "las dos"). Antes era un
 * carril horizontal por atleta, con una barra por bloque — correcto para
 * "hasta cuándo está programado cada uno" pero, como pediste, "una tira
 * horizontal", no un calendario de verdad.
 *
 * Ahora son DOS piezas, no una:
 *
 *   1. LA REJILLA, arriba — lunes a domingo, una columna por semana. Cada
 *      casilla es la CUENTA de sesiones de TODO el equipo ese día (un
 *      mapa de calor, no un carril por persona): cuántas hay programadas y
 *      cuántas de esas ya tienen contenido de verdad.
 *   2. LA LISTA, debajo — quién se queda antes sin programación, la misma
 *      que ya había, para poder "pinchar un atleta y ver la suya" (que
 *      ahora es su propio calendario en rejilla — ver
 *      `AthleteTimelineCalendar`).
 *
 * POR QUÉ LA CASILLA NO DICE QUÉ SE ENTRENA
 * Para el calendario INDIVIDUAL sí compensa pedir el nombre de cada
 * ejercicio —es un atleta—. Para el de equipo sería una consulta por cada
 * sesión de cada atleta, y `useTeamCoverage` existe precisamente para
 * evitar ese coste (ver su cabecera: "cuatro consultas, no ochenta"). La
 * cuenta agregada contesta la pregunta de esta pantalla —¿cuánta carga de
 * trabajo cae ese día en todo el equipo?— sin pagar ese precio.
 */

interface TeamPlanningCalendarProps {
    user: UserProfile;
    /** Ir a la ficha de un atleta. */
    onSelectAthlete: (athleteId: string) => void;
}

/** Meses hacia delante disponibles. Sustituye al antiguo 4/6/14 (30 ago 2026). */
const MONTH_PRESETS = [3, 6, 12];
/** Cuánto retrocede cada pulsación de "Atrás". */
const MONTHS_BACK_STEP = 3;
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEK_COL_WIDTH = 30;

export function TeamPlanningCalendar({ user, onSelectAthlete }: TeamPlanningCalendarProps) {
    const [monthsForward, setMonthsForward] = useState(6);
    const [monthsBack, setMonthsBack] = useState(1);

    const { data, byUrgency, loading, error, refetch } = useTeamCoverage(user.id, { monthsForward, monthsBack });

    const weeks = useMemo(
        () => (data ? buildWeekColumns(data.axisStart, data.axisEnd) : []),
        [data]
    );

    const maxCount = useMemo(() => {
        if (!data) return 0;
        let max = 0;
        for (const cell of data.cells.values()) max = Math.max(max, cell.count);
        return max;
    }, [data]);

    const todayYmd = ymd(new Date());

    return (
        <section className="space-y-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-t-base font-bold text-ink">Programación del equipo</h2>
                    <p className="mt-0.5 text-t-xs text-ink-subtle">
                        Cuántas sesiones caen cada día, y a quién se le acaba la programación.
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                    <button
                        onClick={() => setMonthsBack(b => b + MONTHS_BACK_STEP)}
                        title={`Ver ${MONTHS_BACK_STEP} meses más atrás`}
                        className="rounded-chip bg-surface-sunken px-2 py-1 text-t-2xs font-bold uppercase tracking-wide text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                        ← Atrás
                    </button>
                    {monthsBack !== 1 && (
                        <button
                            onClick={() => setMonthsBack(1)}
                            className="rounded-chip px-2 py-1 text-t-2xs font-bold uppercase tracking-wide text-brand-text transition-colors duration-fast ease-snap hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                            Hoy
                        </button>
                    )}
                    <div role="group" aria-label="Meses hacia delante" className="flex shrink-0 rounded-field bg-surface-sunken p-0.5">
                        {MONTH_PRESETS.map(m => (
                            <button
                                key={m}
                                onClick={() => setMonthsForward(m)}
                                aria-pressed={monthsForward === m}
                                className={`rounded-chip px-2.5 py-1 text-t-2xs font-bold uppercase tracking-wide transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${monthsForward === m
                                    ? 'bg-brand text-brand-ink'
                                    : 'text-ink-subtle hover:text-ink'
                                    }`}
                            >
                                {m} meses
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <EstadoDeDatos
                consulta={{ isLoading: loading, isError: !!error, error, refetch }}
                queEs="que.atletas"
                vacio={!!data && data.athletes.length === 0}
                esqueleto={<Skeleton className="h-64 w-full rounded-card" />}
                vacioIcono={<CalendarOff size={20} aria-hidden="true" />}
                vacioTitulo="Todavía no tienes atletas"
                vacioCuerpo="Cuando tengas atletas en tu equipo verás aquí cuánta carga cae cada día."
            >
                {data && (
                    <>
                        {/* LA REJILLA */}
                        <div className="overflow-x-auto rounded-card border border-[var(--border-default)] bg-surface-raised">
                            <div style={{ minWidth: weeks.length * WEEK_COL_WIDTH + 40 }}>
                                <div className="flex border-b border-[var(--border-subtle)]">
                                    <div className="sticky left-0 z-10 w-10 shrink-0 border-r border-[var(--border-subtle)] bg-surface-raised" />
                                    {weeks.map((w, i) => (
                                        <div key={i} style={{ width: WEEK_COL_WIDTH }} className="shrink-0 border-r border-[var(--border-subtle)] py-1 text-center last:border-r-0">
                                            {w.label && (
                                                <span className="block truncate text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">{w.label}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {WEEKDAY_LABELS.map((label, dayIdx) => (
                                    <div key={label} className="flex border-b border-[var(--border-subtle)] last:border-b-0">
                                        <div className="sticky left-0 z-10 flex w-10 shrink-0 items-center justify-center border-r border-[var(--border-subtle)] bg-surface-raised">
                                            <span className="text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">{label}</span>
                                        </div>
                                        {weeks.map((w, i) => {
                                            const date = addDays(w.monday, dayIdx);
                                            const key = ymd(date);
                                            const cell = data.cells.get(key);
                                            const isToday = key === todayYmd;
                                            const level = heatLevel(cell?.withContent ?? 0, maxCount);

                                            return (
                                                <div
                                                    key={i}
                                                    title={cell ? `${key} — ${cell.withContent} de ${cell.count} sesiones con contenido` : key}
                                                    style={{ width: WEEK_COL_WIDTH }}
                                                    className={`flex h-7 shrink-0 items-center justify-center border-r border-[var(--border-subtle)] last:border-r-0 ${isToday ? 'ring-1 ring-inset ring-[var(--brand-line)]' : ''}`}
                                                >
                                                    {cell && (
                                                        <span
                                                            aria-hidden="true"
                                                            className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-black tabular-nums ${HEAT_CLASSES[level]}`}
                                                        >
                                                            {cell.withContent}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <HeatLegend />

                        {/* LA LISTA — a quién se le acaba antes, y el acceso a su propio calendario. */}
                        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised">
                            <h3 className="border-b border-[var(--border-subtle)] px-3.5 py-2.5 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                Atletas, por urgencia
                            </h3>
                            <ul>
                                {byUrgency.map(athlete => {
                                    const cov = data.coverage.get(athlete.id);
                                    if (!cov) return null;
                                    return (
                                        <AthleteRow
                                            key={athlete.id}
                                            name={athlete.full_name ?? 'Atleta'}
                                            avatarUrl={athlete.avatar_url}
                                            coverage={cov}
                                            onClick={() => onSelectAthlete(athlete.id)}
                                        />
                                    );
                                })}
                            </ul>
                        </div>

                        <UndatedNotice coverage={[...data.coverage.values()]} athletes={data.athletes} />
                    </>
                )}
            </EstadoDeDatos>
        </section>
    );
}

function getMonday(d: Date): Date {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(d, diff);
}

interface WeekColumn { monday: Date; label: string }

function buildWeekColumns(axisStart: Date, axisEnd: Date): WeekColumn[] {
    const weeks: WeekColumn[] = [];
    let cursor = getMonday(axisStart);
    let lastMonth = -1;
    while (cursor <= axisEnd) {
        const m = cursor.getMonth();
        weeks.push({ monday: new Date(cursor), label: m !== lastMonth ? MONTHS[m] : '' });
        lastMonth = m;
        cursor = addDays(cursor, 7);
    }
    return weeks;
}

/** Cuatro niveles sobre el máximo del periodo, mismo criterio que ConsistencyCalendar. */
function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 {
    if (count <= 0 || max <= 0) return 0;
    const q = count / max;
    if (q > 0.66) return 3;
    if (q > 0.33) return 2;
    return 1;
}

const HEAT_CLASSES: Record<0 | 1 | 2 | 3, string> = {
    0: 'bg-surface-sunken text-ink-faint',
    1: 'bg-brand/25 text-ink',
    2: 'bg-brand/55 text-ink',
    3: 'bg-brand text-brand-ink',
};

function HeatLegend() {
    return (
        <div className="flex items-center gap-1.5 text-t-2xs text-ink-subtle">
            Menos
            {([0, 1, 2, 3] as const).map(level => (
                <span key={level} aria-hidden="true" className={`h-3.5 w-3.5 rounded ${HEAT_CLASSES[level]}`} />
            ))}
            Más sesiones ese día
        </div>
    );
}

// =====================================================================

function AthleteRow({
    name, avatarUrl, coverage, onClick,
}: {
    name: string;
    avatarUrl: string | null;
    coverage: AthleteCoverage;
    onClick: () => void;
}) {
    const today = new Date();
    const covered = coverage.coveredUntil;
    const daysLeft = covered ? daysBetween(today, covered) : null;

    const tone =
        daysLeft === null ? 'none'
            : daysLeft < 0 ? 'bad'
                : daysLeft <= 7 ? 'warn'
                    : 'good';

    const nextComp = [...coverage.competitions].sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

    return (
        <li className="border-b border-[var(--border-subtle)] last:border-b-0">
            <button
                onClick={onClick}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
                <SafeImage
                    src={avatarUrl ?? undefined}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                    fallback={
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-t-2xs font-bold text-ink-subtle">
                            {name.charAt(0)}
                        </span>
                    }
                />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-t-sm font-semibold text-ink">{name}</span>
                    <span
                        className={`block truncate text-t-2xs ${tone === 'bad' ? 'text-danger-text'
                            : tone === 'warn' ? 'text-warning'
                                : tone === 'good' ? 'text-ink-subtle'
                                    : 'text-ink-faint'
                            }`}
                    >
                        {coverageLabel(daysLeft, covered)}
                    </span>
                </span>
                {nextComp && (
                    <span className="flex shrink-0 items-center gap-1 text-t-2xs text-ink-subtle">
                        <Trophy size={11} className="text-danger-text" aria-hidden="true" />
                        {formatShortDate(nextComp.date)}
                    </span>
                )}
                <ChevronRight size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
            </button>
        </li>
    );
}

function formatShortDate(raw: string): string {
    const d = parseYmd(raw);
    if (!d) return raw;
    const [, m, day] = ymd(d).split('-');
    return `${Number(day)}/${Number(m)}`;
}

/** Qué se lee bajo el nombre del atleta. */
function coverageLabel(daysLeft: number | null, covered: Date | null): string {
    if (daysLeft === null || !covered) return 'Sin programación';
    if (daysLeft < 0) return `Sin plan desde hace ${Math.abs(daysLeft)} d`;
    if (daysLeft === 0) return 'Se le acaba hoy';
    if (daysLeft <= 7) return `Le quedan ${daysLeft} d`;
    const [, m, d] = ymd(covered).split('-');
    return `Hasta el ${Number(d)}/${Number(m)}`;
}

// =====================================================================

/**
 * Los bloques que NO se pueden situar en el calendario.
 *
 * NO se colocan a ojo (decisión K10: nunca inventar una fecha). Se listan
 * aquí con el motivo, porque un bloque que no aparece en la rejilla y del que
 * nadie dice nada se lee como un fallo de la aplicación.
 */
function UndatedNotice({
    coverage,
    athletes,
}: {
    coverage: AthleteCoverage[];
    athletes: { id: string; full_name: string | null }[];
}) {
    const undated = coverage.flatMap(c => c.undated);
    if (undated.length === 0) return null;

    const nameOf = (id: string) =>
        athletes.find(a => a.id === id)?.full_name ?? 'Atleta';

    return (
        <div className="flex items-start gap-2.5 rounded-card border border-[var(--border-default)] bg-surface-sunken px-3.5 py-3">
            <Info size={15} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
            <div className="min-w-0 text-t-xs leading-relaxed text-ink-subtle">
                <p>
                    <strong className="font-semibold text-ink-muted">
                        {undated.length} {undated.length === 1 ? 'bloque no aparece' : 'bloques no aparecen'}
                    </strong>{' '}
                    en el calendario porque no tienen fecha de inicio, y sin ella sus semanas no se
                    pueden situar. Ponles la fecha desde la ficha del atleta y aparecerán.
                </p>
                <ul className="mt-1.5 space-y-0.5">
                    {undated.slice(0, 5).map(u => (
                        <li key={u.blockId} className="truncate">
                            · {nameOf(u.athleteId)} — {u.name}
                        </li>
                    ))}
                    {undated.length > 5 && <li>· y {undated.length - 5} más</li>}
                </ul>
            </div>
        </div>
    );
}
