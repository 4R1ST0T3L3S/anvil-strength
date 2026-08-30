import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarOff, Info, Layers, Trophy } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { trainingService } from '../../../services/trainingService';
import { competitionsService } from '../../../services/competitionsService';
import {
    buildAthleteCoverage, macroSpans, monthsBetween, positionInAxis,
    daysBetween, parseYmd, ymd,
    type BlockSpan, type MacroSpan, type CoverageBlockInput,
    type CoverageSessionInput, type CoverageCompetitionInput,
} from '../../../lib/planning/coverage';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { Skeleton } from '../../../components/ui/Skeleton';

/**
 * CALENDARIO INDIVIDUAL DEL ATLETA
 * =====================================================================
 *
 * TRES CARRILES SOBRE EL MISMO EJE
 *
 *     MACRO    ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
 *     BLOQUE   ▬▬▬▬▬ ▬▬▬▬▬▬ ▬▬▬▬▬  ▬▬▬▬
 *     COMP                          ▼
 *
 * Apilados y no mezclados porque son tres NIVELES de la misma estructura, y
 * lo que hay que poder leer de un vistazo es cómo encaja uno dentro de otro:
 * dónde empieza el macro, qué bloques contiene, y si la competición cae donde
 * tenía que caer.
 *
 *
 * LOS MACROS NO TIENEN FECHAS. SE DERIVAN.
 *
 * `macrocycles` guarda `name`, `competition_name` y `competition_date` — y
 * nada más. No hay inicio ni fin. Su extensión sale de los bloques que lo
 * componen (`macroSpans`), que es la única fuente honesta que existe.
 *
 * Consecuencia: un macro cuyos bloques no se puedan situar en el calendario
 * tampoco se sitúa. No se estima, no se coloca "más o menos ahí". Sale en el
 * aviso de abajo con su motivo. Ver la decisión K10 y la cabecera de
 * `lib/planning/coverage.ts`.
 *
 *
 * DE DÓNDE SALEN LOS COLORES
 *
 * Del bloque: `training_blocks.color`, que el coach elige al crearlo. Ya
 * existe y ya lo usa la lista de bloques, así que el calendario habla el
 * mismo idioma visual que el resto de la ficha.
 *
 * El macro toma el color de su PRIMER bloque, atenuado. Así se ve a simple
 * vista qué bloques pertenecen a qué macro sin necesidad de una leyenda ni de
 * una paleta nueva que aprenderse.
 */

interface AthleteTimelineCalendarProps {
    athleteId: string;
    /** Abrir un bloque concreto. Opcional: sin esto el calendario solo informa. */
    onSelectBlock?: (blockId: string) => void;
    /** Meses hacia delante. El de por defecto cubre una preparación completa. */
    monthsForward?: number;
    monthsBack?: number;
}

const MONTH_MIN_WIDTH = 120;

export const athleteTimelineKey = (athleteId: string) => ['athlete-timeline', athleteId] as const;

export function AthleteTimelineCalendar({
    athleteId,
    onSelectBlock,
    monthsForward: monthsForwardProp,
    monthsBack = 2,
}: AthleteTimelineCalendarProps) {
    const [monthsForward, setMonthsForward] = useState(monthsForwardProp ?? 5);

    const query = useQuery({
        queryKey: [...athleteTimelineKey(athleteId), monthsBack, monthsForward],
        staleTime: 60 * 1000,
        queryFn: async () => {
            const [blockRows, macros, competitions] = await Promise.all([
                supabase
                    .from('training_blocks')
                    .select('id, athlete_id, name, start_week, end_week, start_date, is_active, color, macro_id')
                    .eq('athlete_id', athleteId)
                    .then(r => { if (r.error) throw r.error; return (r.data ?? []) as CoverageBlockInput[]; }),
                // Los macros pueden fallar: la tabla puede no estar migrada en
                // una base antigua. Eso NO puede tumbar el calendario entero —
                // los bloques y las competiciones siguen siendo útiles solos.
                trainingService.getMacrosByAthlete(athleteId).catch(() => []),
                competitionsService.getAthleteCompetitions(athleteId).catch(() => []),
            ]);

            let sessions: CoverageSessionInput[] = [];
            if (blockRows.length > 0) {
                const { data } = await supabase
                    .from('training_sessions')
                    .select('id, block_id, week_number, day_number, day_of_week, completed_at, session_exercises(count)')
                    .in('block_id', blockRows.map(b => b.id))
                    .then(r => r, () => ({ data: null }));

                type Row = {
                    id: string; block_id: string; week_number: number; day_number: number;
                    day_of_week: string | null; completed_at: string | null;
                    session_exercises: { count: number }[] | null;
                };

                sessions = ((data ?? []) as unknown as Row[]).map(s => ({
                    id: s.id,
                    block_id: s.block_id,
                    week_number: s.week_number,
                    day_number: s.day_number,
                    day_of_week: s.day_of_week,
                    completed_at: s.completed_at,
                    exerciseCount: s.session_exercises?.[0]?.count ?? 0,
                }));
            }

            const comps: CoverageCompetitionInput[] = competitions.map(c => ({
                id: c.id,
                athlete_id: c.athlete_id,
                name: c.name,
                date: c.date,
                end_date: c.end_date ?? null,
                level: c.level ?? null,
                location: c.location ?? null,
            }));

            const today = new Date();
            const axisStart = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
            const axisEnd = new Date(today.getFullYear(), today.getMonth() + monthsForward + 1, 0);

            const coverage = buildAthleteCoverage(athleteId, blockRows, sessions, comps, axisEnd);
            const macroLanes = macroSpans(
                macros.map(m => ({ id: m.id, name: m.name })),
                coverage.spans
            );

            // Los macros que NO se han podido situar. Se dicen igual que los
            // bloques sin fecha: un macro que existe en la ficha y no aparece
            // en el calendario se lee como una avería.
            const placedMacroIds = new Set(macroLanes.map(m => m.macroId));
            const unplacedMacros = macros
                .filter(m => !placedMacroIds.has(m.id))
                .map(m => m.name);

            return { coverage, macroLanes, unplacedMacros, axisStart, axisEnd };
        },
    });

    const data = query.data;

    const months = useMemo(
        () => (data ? monthsBetween(data.axisStart, data.axisEnd) : []),
        [data]
    );

    const todayPos = useMemo(() => {
        if (!data) return null;
        const today = new Date();
        return positionInAxis(today, today, data.axisStart, data.axisEnd);
    }, [data]);

    const axisWidth = Math.max(months.length * MONTH_MIN_WIDTH, 560);
    const spanDays = data ? daysBetween(data.axisStart, data.axisEnd) + 1 : 1;

    // El color del macro sale de su primer bloque. Ver la cabecera.
    const macroColor = (macro: MacroSpan): string => {
        const first = data?.coverage.spans.find(s => s.blockId === macro.blockIds[0]);
        return first?.color || 'var(--brand)';
    };

    return (
        <section className="space-y-3">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-t-sm font-bold text-ink">
                        <Layers size={15} className="text-brand-text" aria-hidden="true" />
                        Línea temporal
                    </h3>
                    <p className="mt-0.5 text-t-xs text-ink-subtle">
                        Macros, bloques y competiciones sobre el mismo eje.
                    </p>
                </div>

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
                            {m + monthsBack + 1}m
                        </button>
                    ))}
                </div>
            </header>

            <EstadoDeDatos
                consulta={query}
                queEs="que.bloques"
                vacio={!!data && data.coverage.spans.length === 0 && data.coverage.competitions.length === 0}
                esqueleto={<Skeleton className="h-40 w-full rounded-card" />}
                vacioIcono={<CalendarOff size={20} aria-hidden="true" />}
                vacioTitulo="Nada que situar todavía"
                vacioCuerpo="Cuando este atleta tenga bloques con fecha de inicio o competiciones asignadas, aparecerán aquí."
            >
                {data && (
                    <>
                        <div className="overflow-x-auto rounded-card border border-[var(--border-default)] bg-surface-raised">
                            <div style={{ minWidth: axisWidth + 88 }}>
                                {/* Meses */}
                                <div className="flex border-b border-[var(--border-subtle)]">
                                    <div className="sticky left-0 z-10 w-[88px] shrink-0 border-r border-[var(--border-subtle)] bg-surface-raised" />
                                    <div className="flex flex-1">
                                        {months.map(m => (
                                            <div
                                                key={`${m.year}-${m.month}`}
                                                style={{ width: `${(m.days / spanDays) * 100}%` }}
                                                className="border-r border-[var(--border-subtle)] px-1.5 py-1.5 last:border-r-0"
                                            >
                                                <span className="block truncate text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">
                                                    {m.label.slice(0, 3)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* CARRIL 1 — MACROS */}
                                <Lane label="Macro" empty={data.macroLanes.length === 0} todayLeft={todayPos?.left ?? null}>
                                    {data.macroLanes.map(macro => {
                                        const pos = positionInAxis(macro.from, macro.to, data.axisStart, data.axisEnd);
                                        if (!pos) return null;
                                        const color = macroColor(macro);
                                        return (
                                            <span
                                                key={macro.macroId}
                                                style={{
                                                    left: `${pos.left}%`,
                                                    width: `${pos.width}%`,
                                                    backgroundColor: color,
                                                    opacity: 0.28,
                                                    borderColor: color,
                                                }}
                                                title={`${macro.name} — ${macro.blockIds.length} bloque(s)`}
                                                className="absolute top-1/2 z-10 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded-chip border"
                                            >
                                                <span className="truncate px-2 text-t-2xs font-bold text-ink">
                                                    {macro.name}
                                                </span>
                                            </span>
                                        );
                                    })}
                                </Lane>

                                {/* CARRIL 2 — BLOQUES */}
                                <Lane label="Bloque" empty={data.coverage.spans.length === 0} todayLeft={todayPos?.left ?? null}>
                                    {data.coverage.spans.map(span => (
                                        <BlockChip
                                            key={span.blockId}
                                            span={span}
                                            axisStart={data.axisStart}
                                            axisEnd={data.axisEnd}
                                            onClick={onSelectBlock ? () => onSelectBlock(span.blockId) : undefined}
                                        />
                                    ))}
                                </Lane>

                                {/* CARRIL 3 — COMPETICIONES */}
                                <Lane
                                    label="Compet."
                                    empty={data.coverage.competitions.length === 0}
                                    todayLeft={todayPos?.left ?? null}
                                    last
                                >
                                    {data.coverage.competitions.map(comp => {
                                        const date = parseYmd(comp.date);
                                        if (!date) return null;
                                        const pos = positionInAxis(date, date, data.axisStart, data.axisEnd);
                                        if (!pos) return null;
                                        const [, m, d] = ymd(date).split('-');
                                        return (
                                            <span
                                                key={comp.id}
                                                style={{ left: `${pos.left}%` }}
                                                title={`${comp.name} — ${comp.date}`}
                                                className="absolute top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-chip border border-[var(--danger)] bg-surface-raised px-1.5 py-0.5"
                                            >
                                                <Trophy size={10} className="shrink-0 text-danger-text" aria-hidden="true" />
                                                <span className="whitespace-nowrap text-t-2xs font-bold tabular-nums text-danger-text">
                                                    {Number(d)}/{Number(m)}
                                                </span>
                                                <span className="sr-only">{comp.name}</span>
                                            </span>
                                        );
                                    })}
                                </Lane>
                            </div>
                        </div>

                        <UndatedNotice
                            blocks={data.coverage.undated}
                            macros={data.unplacedMacros}
                        />
                    </>
                )}
            </EstadoDeDatos>
        </section>
    );
}

// =====================================================================

function Lane({
    label, children, empty, todayLeft, last = false,
}: {
    label: string;
    children: React.ReactNode;
    empty: boolean;
    todayLeft: number | null;
    last?: boolean;
}) {
    return (
        <div className={`flex ${last ? '' : 'border-b border-[var(--border-subtle)]'}`}>
            <div className="sticky left-0 z-10 flex w-[88px] shrink-0 items-center border-r border-[var(--border-subtle)] bg-surface-raised px-2.5">
                <span className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                    {label}
                </span>
            </div>
            <div className="relative min-h-[40px] flex-1">
                {todayLeft !== null && (
                    <span
                        aria-hidden="true"
                        style={{ left: `${todayLeft}%` }}
                        className="absolute inset-y-0 z-0 w-px bg-[var(--border-strong)]"
                    />
                )}
                {/* Un carril vacío se DICE. Sin esto, "no hay macros" y "los
                    macros no se han cargado" se ven exactamente igual. */}
                {empty && (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-t-2xs text-ink-faint">
                        —
                    </span>
                )}
                {children}
            </div>
        </div>
    );
}

function BlockChip({
    span, axisStart, axisEnd, onClick,
}: {
    span: BlockSpan;
    axisStart: Date;
    axisEnd: Date;
    onClick?: () => void;
}) {
    const pos = positionInAxis(span.from, span.to, axisStart, axisEnd);
    if (!pos) return null;

    const color = span.color || 'var(--brand)';
    const empty = span.emptyWeeks.length > 0;
    const weeks = span.weeks.length;

    const title = `${span.name} · ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}${empty ? ` · ${span.emptyWeeks.length} sin ejercicios` : ''}`;

    const inner = (
        <>
            <span
                aria-hidden="true"
                className="absolute inset-0 rounded-chip"
                style={
                    empty
                        ? {
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
            <span aria-hidden="true" className="absolute inset-y-0 right-0 w-0.5 bg-warning" />
        </>
    );

    // Botón solo si hay a dónde ir. Un elemento que parece pulsable y no hace
    // nada es peor que uno que no lo parece.
    return onClick ? (
        <button
            onClick={onClick}
            title={title}
            style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
            className="absolute top-1/2 z-10 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-chip transition-opacity duration-fast ease-snap hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
            {inner}
        </button>
    ) : (
        <span
            title={title}
            style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
            className="absolute top-1/2 z-10 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-chip"
        >
            {inner}
        </span>
    );
}

function UndatedNotice({
    blocks,
    macros,
}: {
    blocks: { blockId: string; name: string }[];
    macros: string[];
}) {
    if (blocks.length === 0 && macros.length === 0) return null;

    return (
        <div className="flex items-start gap-2.5 rounded-card border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5">
            <Info size={14} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
            <div className="min-w-0 text-t-xs leading-relaxed text-ink-subtle">
                {blocks.length > 0 && (
                    <p>
                        Sin fecha de inicio, así que no se pueden situar:{' '}
                        <span className="text-ink-muted">{blocks.map(b => b.name).join(', ')}</span>.
                    </p>
                )}
                {macros.length > 0 && (
                    <p className={blocks.length > 0 ? 'mt-1' : ''}>
                        Macros sin bloques fechados:{' '}
                        <span className="text-ink-muted">{macros.join(', ')}</span>.
                    </p>
                )}
            </div>
        </div>
    );
}
