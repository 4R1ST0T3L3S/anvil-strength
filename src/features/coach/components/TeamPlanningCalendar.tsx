import { useMemo, useRef, useState } from 'react';
import { CalendarOff, Info, Trophy } from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { useTeamCoverage } from '../hooks/useTeamCoverage';
import {
    monthsBetween, positionInAxis, daysBetween, ymd, parseYmd,
    type AthleteCoverage, type BlockSpan,
} from '../../../lib/planning/coverage';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { Skeleton } from '../../../components/ui/Skeleton';
import { SafeImage } from '../../../components/ui/SafeImage';

/**
 * CALENDARIO GENERAL DEL EQUIPO
 * =====================================================================
 *
 * LA PREGUNTA QUE CONTESTA, Y ES UNA SOLA
 *
 * "¿A quién se le acaba la programación, y cuándo?". Un entrenador con veinte
 * atletas no puede llevar eso en la cabeza, y hasta ahora la aplicación solo
 * lo decía de uno en uno: había que entrar en cada ficha, mirar el bloque
 * activo y calcular. Con veinte atletas eso significa que no se mira.
 *
 *
 * POR QUÉ CARRILES HORIZONTALES Y NO UNA REJILLA DE MES
 *
 * Una rejilla de mes (7 columnas × 5 filas) enseña UN mes y obliga a meter a
 * los veinte atletas dentro de cada casilla. Es la forma correcta para "qué
 * pasa el día 12" y la peor posible para "hasta cuándo está programado cada
 * uno", que es una pregunta sobre INTERVALOS y sobre varios meses a la vez.
 *
 * Un carril por atleta y el tiempo en el eje X contesta las dos que importan
 * de un vistazo: dónde acaba cada barra, y dónde hay hueco entre barras.
 *
 *
 * LA SEMÁNTICA DE COLOR — CUATRO ESTADOS Y NI UNO MÁS
 *
 *   · Barra sólida de marca      → programado y con contenido escrito.
 *   · Barra rayada y atenuada    → bloque creado pero con semanas VACÍAS.
 *     Es el estado que más daño hace y el que nadie veía: el bloque existe,
 *     la lista de atletas dice que tiene plan, y el atleta abre la aplicación
 *     el lunes y no hay nada.
 *   · Borde ámbar al final       → aquí se le acaba.
 *   · Pin rojo                   → compite.
 *
 * No hay un quinto color para "descarga", ni para "bloque activo frente a
 * inactivo", ni para el tipo de bloque. Cada color de más es una leyenda que
 * hay que aprender, y un calendario que necesita leyenda deja de leerse de un
 * vistazo — que es lo único que este calendario tiene que hacer bien.
 */

interface TeamPlanningCalendarProps {
    user: UserProfile;
    /** Ir a la ficha de un atleta. */
    onSelectAthlete: (athleteId: string) => void;
}

/** Ancho mínimo de un mes en el eje, en píxeles. Por debajo no se lee nada. */
const MONTH_MIN_WIDTH = 132;

export function TeamPlanningCalendar({ user, onSelectAthlete }: TeamPlanningCalendarProps) {
    const [monthsForward, setMonthsForward] = useState(5);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { data, byUrgency, loading, error, refetch } = useTeamCoverage(user.id, { monthsForward });

    const months = useMemo(
        () => (data ? monthsBetween(data.axisStart, data.axisEnd) : []),
        [data]
    );

    // Hoy, situado en el eje. Es la referencia que hace legible todo lo demás:
    // sin la línea de hoy, una barra que termina "por la izquierda" no se
    // distingue de una que termina "por la derecha".
    const todayPos = useMemo(() => {
        if (!data) return null;
        const today = new Date();
        return positionInAxis(today, today, data.axisStart, data.axisEnd);
    }, [data]);

    const axisWidth = Math.max(months.length * MONTH_MIN_WIDTH, 600);

    return (
        <section className="space-y-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-t-base font-bold text-ink">Programación del equipo</h2>
                    <p className="mt-0.5 text-t-xs text-ink-subtle">
                        Hasta cuándo está programado cada atleta y cuándo compite.
                    </p>
                </div>

                {/* Cuántos meses se ven. Es lo que convierte esto en una
                    herramienta de planificación y no en una vista de "esta
                    semana": una preparación a una competición dura meses. */}
                <div
                    role="group"
                    aria-label="Meses visibles"
                    className="flex shrink-0 rounded-field bg-surface-sunken p-0.5"
                >
                    {[3, 5, 11].map(m => (
                        <button
                            key={m}
                            onClick={() => setMonthsForward(m)}
                            aria-pressed={monthsForward === m}
                            className={`rounded-chip px-2.5 py-1 text-t-2xs font-bold uppercase tracking-wide transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${monthsForward === m
                                ? 'bg-brand text-brand-ink'
                                : 'text-ink-subtle hover:text-ink'
                                }`}
                        >
                            {m + 1} meses
                        </button>
                    ))}
                </div>
            </header>

            <EstadoDeDatos
                consulta={{ isLoading: loading, isError: !!error, error, refetch }}
                queEs="que.atletas"
                vacio={!!data && data.athletes.length === 0}
                esqueleto={
                    <div className="space-y-2">
                        {Array.from({ length: 5 }, (_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-card" />
                        ))}
                    </div>
                }
                vacioIcono={<CalendarOff size={20} aria-hidden="true" />}
                vacioTitulo="Todavía no tienes atletas"
                vacioCuerpo="Cuando tengas atletas en tu equipo verás aquí hasta cuándo está programado cada uno."
            >
                {data && (
                    <>
                        <Legend />

                        {/* EL CARRIL. La columna de nombres es `sticky` para
                            que al desplazarse por los meses no se pierda de
                            vista de quién es cada fila — que es el fallo
                            clásico de las tablas anchas en móvil. */}
                        <div
                            ref={scrollRef}
                            className="overflow-x-auto rounded-card border border-[var(--border-default)] bg-surface-raised"
                        >
                            <div style={{ minWidth: axisWidth + 160 }}>
                                {/* Cabecera de meses */}
                                <div className="flex border-b border-[var(--border-subtle)]">
                                    <div className="sticky left-0 z-10 w-40 shrink-0 border-r border-[var(--border-subtle)] bg-surface-raised px-3 py-2">
                                        <span className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                            Atleta
                                        </span>
                                    </div>
                                    <div className="relative flex flex-1">
                                        {months.map(m => (
                                            <div
                                                key={`${m.year}-${m.month}`}
                                                style={{ width: `${(m.days / totalDays(data.axisStart, data.axisEnd)) * 100}%` }}
                                                className="border-r border-[var(--border-subtle)] px-2 py-2 last:border-r-0"
                                            >
                                                <span className="block truncate text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">
                                                    {m.label.slice(0, 3)}
                                                </span>
                                                <span className="block text-t-2xs text-ink-faint">{m.year}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Un carril por atleta */}
                                <ul>
                                    {byUrgency.map(athlete => {
                                        const cov = data.coverage.get(athlete.id);
                                        if (!cov) return null;
                                        return (
                                            <AthleteLane
                                                key={athlete.id}
                                                name={athlete.full_name ?? 'Atleta'}
                                                avatarUrl={athlete.avatar_url}
                                                coverage={cov}
                                                axisStart={data.axisStart}
                                                axisEnd={data.axisEnd}
                                                todayLeft={todayPos?.left ?? null}
                                                onClick={() => onSelectAthlete(athlete.id)}
                                            />
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>

                        <UndatedNotice coverage={[...data.coverage.values()]} athletes={data.athletes} />
                    </>
                )}
            </EstadoDeDatos>
        </section>
    );
}

const totalDays = (from: Date, to: Date) => daysBetween(from, to) + 1;

// =====================================================================

function Legend() {
    return (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-t-2xs text-ink-subtle">
            <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-5 rounded-pill bg-brand" aria-hidden="true" />
                Programado
            </li>
            <li className="flex items-center gap-1.5">
                <span
                    aria-hidden="true"
                    className="h-2.5 w-5 rounded-pill bg-brand/25"
                    style={{
                        backgroundImage:
                            'repeating-linear-gradient(45deg, transparent, transparent 2px, var(--brand) 2px, var(--brand) 3px)',
                    }}
                />
                Semanas vacías
            </li>
            <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-0.5 rounded-pill bg-warning" aria-hidden="true" />
                Fin de programación
            </li>
            <li className="flex items-center gap-1.5">
                <Trophy size={11} className="text-danger-text" aria-hidden="true" />
                Competición
            </li>
        </ul>
    );
}

// =====================================================================

function AthleteLane({
    name, avatarUrl, coverage, axisStart, axisEnd, todayLeft, onClick,
}: {
    name: string;
    avatarUrl: string | null;
    coverage: AthleteCoverage;
    axisStart: Date;
    axisEnd: Date;
    todayLeft: number | null;
    onClick: () => void;
}) {
    const today = new Date();
    const covered = coverage.coveredUntil;

    // Cuántos días le quedan de programación. Es la cifra que ordena la lista
    // y la que decide el color del texto de la columna de nombres.
    const daysLeft = covered ? daysBetween(today, covered) : null;

    const tone =
        daysLeft === null ? 'none'
            : daysLeft < 0 ? 'bad'
                : daysLeft <= 7 ? 'warn'
                    : 'good';

    return (
        <li className="flex border-b border-[var(--border-subtle)] last:border-b-0">
            {/* Columna de nombres, fija al desplazarse */}
            <button
                onClick={onClick}
                className="sticky left-0 z-10 flex w-40 shrink-0 items-center gap-2 border-r border-[var(--border-subtle)] bg-surface-raised px-3 py-2.5 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
                <SafeImage
                    src={avatarUrl ?? undefined}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full object-cover"
                    fallback={
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-t-2xs font-bold text-ink-subtle">
                            {name.charAt(0)}
                        </span>
                    }
                />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-t-xs font-semibold text-ink">{name}</span>
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
            </button>

            {/* El carril temporal */}
            <div className="relative min-h-[52px] flex-1">
                {/* Línea de HOY. Va debajo de las barras a propósito: es una
                    referencia, no un elemento que haya que leer. */}
                {todayLeft !== null && (
                    <span
                        aria-hidden="true"
                        style={{ left: `${todayLeft}%` }}
                        className="absolute inset-y-0 z-0 w-px bg-[var(--border-strong)]"
                    />
                )}

                {coverage.spans.map(span => (
                    <BlockBar key={span.blockId} span={span} axisStart={axisStart} axisEnd={axisEnd} />
                ))}

                {coverage.competitions.map(comp => {
                    const date = parseYmd(comp.date);
                    if (!date) return null;
                    const end = comp.end_date ? parseYmd(comp.end_date) : null;
                    const pos = positionInAxis(date, end ?? date, axisStart, axisEnd);
                    if (!pos) return null;
                    return (
                        <span
                            key={comp.id}
                            style={{ left: `${pos.left}%` }}
                            title={`${comp.name} — ${comp.date}`}
                            className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                        >
                            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--danger)] bg-surface-raised">
                                <Trophy size={11} className="text-danger-text" aria-hidden="true" />
                            </span>
                            <span className="sr-only">{comp.name}, {comp.date}</span>
                        </span>
                    );
                })}
            </div>
        </li>
    );
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

function BlockBar({ span, axisStart, axisEnd }: { span: BlockSpan; axisStart: Date; axisEnd: Date }) {
    const pos = positionInAxis(span.from, span.to, axisStart, axisEnd);
    if (!pos) return null;

    // El color del bloque lo eligió el coach al crearlo. Se respeta: es su
    // código visual, y el calendario no tiene por qué inventarse otro.
    const color = span.color || 'var(--brand)';
    const empty = span.emptyWeeks.length > 0;

    return (
        <span
            style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
            title={`${span.name}${empty ? ` — ${span.emptyWeeks.length} semana(s) sin ejercicios` : ''}`}
            className="absolute top-1/2 z-10 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-chip"
        >
            {/* Relleno. Rayado cuando hay semanas vacías: el bloque existe
                pero el atleta no tiene qué hacer en parte de él. */}
            <span
                aria-hidden="true"
                className="absolute inset-0 rounded-chip"
                style={
                    empty
                        ? {
                            backgroundColor: 'transparent',
                            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, ${color} 3px, ${color} 4px)`,
                            border: `1px solid ${color}`,
                            opacity: 0.75,
                        }
                        : { backgroundColor: color }
                }
            />

            <span className="relative truncate px-2 text-t-2xs font-bold text-white mix-blend-luminosity">
                {span.name}
            </span>

            {/* El final de la programación. Una marca de 2px al borde derecho:
                es el punto exacto que el coach viene a buscar. */}
            <span
                aria-hidden="true"
                className="absolute inset-y-0 right-0 w-0.5 bg-warning"
            />
        </span>
    );
}

// =====================================================================

/**
 * Los bloques que NO se pueden situar en el calendario.
 *
 * NO se colocan a ojo (decisión K10: nunca inventar una fecha). Se listan
 * aquí con el motivo, porque un bloque que no aparece en el carril y del que
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
