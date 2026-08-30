import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarOff, Info, CalendarDays, Trophy } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { competitionsService } from '../../../services/competitionsService';
import {
    buildAthleteCoverage, resolveBlockSpan, sessionDate, addDays, ymd, parseYmd,
    type CoverageBlockInput, type CoverageSessionInput, type CoverageCompetitionInput,
} from '../../../lib/planning/coverage';
import { getLiftTheme } from '../../planning/components/builder/DayCard';
import { WEEKDAYS } from '../../../types/training';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { Skeleton } from '../../../components/ui/Skeleton';

/**
 * CALENDARIO INDIVIDUAL DEL ATLETA — REJILLA DE DÍAS
 * =====================================================================
 *
 * Rediseño del 30 de agosto de 2026: antes esto era tres carriles
 * proporcionales (macro/bloque/competición) sobre un eje continuo — una
 * línea de tiempo. Ahora es un CALENDARIO de verdad: lunes arriba, domingo
 * abajo, una columna por semana, desplazable de lado para caber muchos
 * meses. Decisión cerrada (apartado 5 del encargo): "quiero que se sienta
 * como un calendario de planificación real, no como una timeline de
 * bloques".
 *
 * QUÉ SE ENSEÑA EN CADA CASILLA (D2)
 * Un punto de color + el código corto del básico —SQ/BP/DL/ACC, el mismo
 * criterio de `lib/planning/mainLift.ts` que ya usa el constructor— del
 * PRIMER básico de competición del día, o del primer accesorio si no hay
 * ninguno. Sin sesión programada, la casilla queda vacía. Una competición
 * asignada se marca con su propio trofeo, encima de lo que hubiera.
 *
 * QUÉ SE HA DEJADO FUERA A PROPÓSITO
 * El carril de MACROS de la versión anterior no tiene un sitio natural en
 * una rejilla de días: un macro dura meses, no cabe en una casilla. El
 * encargo no pide verlo aquí —pide ver el entrenamiento día a día—, así que
 * se ha quitado de este componente en vez de forzarlo en algo que no le
 * corresponde. Los macros se siguen viendo donde ya vivían: la lista de
 * bloques y su selector.
 *
 * POR QUÉ SIGUE USANDO coverage.ts Y NO session.date
 * `training_sessions.date` es NULL siempre. La fecha real se deriva de
 * `training_blocks.start_date` + la semana ISO + `day_of_week` — ver
 * `sessionDate()`, nueva en coverage.ts para esta rejilla, y la cabecera de
 * ese archivo. Una sesión sin `day_of_week` no se sitúa: no se inventa un
 * día (decisión K10).
 */

interface AthleteTimelineCalendarProps {
    athleteId: string;
    /** Abrir un bloque concreto. Opcional: sin esto el calendario solo informa. */
    onSelectBlock?: (blockId: string) => void;
    monthsForward?: number;
    monthsBack?: number;
}

export const athleteTimelineKey = (athleteId: string) => ['athlete-timeline', athleteId] as const;

/** Meses hacia delante disponibles. Sustituye al antiguo 4/6/14 (30 ago 2026). */
const MONTH_PRESETS = [3, 6, 12];
/** Cuánto retrocede cada pulsación de "Atrás". */
const MONTHS_BACK_STEP = 3;
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const WEEK_COL_WIDTH = 34;

interface DayCell {
    blockId: string;
    lift: 'SQ' | 'BP' | 'DL' | 'ACC';
    hasContent: boolean;
}

export function AthleteTimelineCalendar({
    athleteId,
    onSelectBlock,
    monthsForward: monthsForwardProp,
    monthsBack: monthsBackProp = 1,
}: AthleteTimelineCalendarProps) {
    const [monthsForward, setMonthsForward] = useState(monthsForwardProp ?? 6);
    const [monthsBack, setMonthsBack] = useState(monthsBackProp);

    const query = useQuery({
        queryKey: [...athleteTimelineKey(athleteId), monthsBack, monthsForward],
        staleTime: 60 * 1000,
        queryFn: async () => {
            const [blockRows, competitions] = await Promise.all([
                supabase
                    .from('training_blocks')
                    .select('id, athlete_id, name, start_week, end_week, start_date, is_active, color, macro_id')
                    .eq('athlete_id', athleteId)
                    .then(r => { if (r.error) throw r.error; return (r.data ?? []) as CoverageBlockInput[]; }),
                competitionsService.getAthleteCompetitions(athleteId).catch(() => []),
            ]);

            // Nombres de ejercicio, no solo el recuento — es lo que hace falta
            // para clasificar el básico del día. Un solo atleta a la vez: el
            // coste que la versión de equipo evita a propósito (ver
            // useTeamCoverage.ts) no aplica aquí.
            let sessions: CoverageSessionInput[] = [];
            let sessionLifts = new Map<string, string[]>(); // sessionId -> nombres de ejercicio
            if (blockRows.length > 0) {
                const { data } = await supabase
                    .from('training_sessions')
                    .select('id, block_id, week_number, day_number, day_of_week, completed_at, session_exercises(exercise:exercise_library(name))')
                    .in('block_id', blockRows.map(b => b.id))
                    .then(r => r, () => ({ data: null }));

                type Row = {
                    id: string; block_id: string; week_number: number; day_number: number;
                    day_of_week: string | null; completed_at: string | null;
                    session_exercises: { exercise: { name: string } | null }[] | null;
                };

                sessions = ((data ?? []) as unknown as Row[]).map(s => ({
                    id: s.id,
                    block_id: s.block_id,
                    week_number: s.week_number,
                    day_number: s.day_number,
                    day_of_week: s.day_of_week,
                    completed_at: s.completed_at,
                    exerciseCount: s.session_exercises?.length ?? 0,
                }));
                sessionLifts = new Map(
                    ((data ?? []) as unknown as Row[]).map(s => [
                        s.id,
                        (s.session_exercises ?? []).map(e => e.exercise?.name ?? '').filter(Boolean),
                    ])
                );
            }

            const comps: CoverageCompetitionInput[] = competitions.map(c => ({
                id: c.id, athlete_id: c.athlete_id, name: c.name, date: c.date,
                end_date: c.end_date ?? null, level: c.level ?? null, location: c.location ?? null,
            }));

            const today = new Date();
            const axisStart = getMonday(new Date(today.getFullYear(), today.getMonth() - monthsBack, 1));
            const axisEnd = new Date(today.getFullYear(), today.getMonth() + monthsForward + 1, 0);

            const coverage = buildAthleteCoverage(athleteId, blockRows, sessions, comps, axisEnd);

            // Una casilla por FECHA. Se resuelve una sola vez, aquí, y la
            // rejilla solo lee del mapa — nada de recalcular fechas en cada
            // celda al pintar.
            const cells = new Map<string, DayCell>();
            for (const block of blockRows) {
                const resolved = resolveBlockSpan(block, sessions);
                if (!('span' in resolved)) continue;
                const blockSessions = sessions.filter(s => s.block_id === block.id);
                for (const session of blockSessions) {
                    const date = sessionDate(session, resolved.span);
                    if (!date) continue;
                    const names = sessionLifts.get(session.id) ?? [];
                    if (names.length === 0) continue;
                    cells.set(ymd(date), {
                        blockId: block.id,
                        lift: dominantLift(names),
                        hasContent: session.exerciseCount > 0,
                    });
                }
            }

            return { coverage, cells, comps, axisStart, axisEnd };
        },
    });

    const data = query.data;

    const weeks = useMemo(
        () => (data ? buildWeekColumns(data.axisStart, data.axisEnd) : []),
        [data]
    );

    const compsByDate = useMemo(() => {
        const map = new Map<string, CoverageCompetitionInput>();
        for (const c of data?.comps ?? []) {
            const d = parseYmd(c.date);
            if (d) map.set(ymd(d), c);
        }
        return map;
    }, [data]);

    const todayYmd = ymd(new Date());

    return (
        <section className="space-y-3">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-t-sm font-bold text-ink">
                        <CalendarDays size={15} className="text-brand-text" aria-hidden="true" />
                        Calendario
                    </h3>
                    <p className="mt-0.5 text-t-xs text-ink-subtle">
                        Qué se entrena cada día. Un punto de color por básico.
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
                    {monthsBack !== monthsBackProp && (
                        <button
                            onClick={() => setMonthsBack(monthsBackProp)}
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
                                className={`rounded-chip px-2.5 py-1 text-t-2xs font-bold uppercase tracking-wide transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${monthsForward === m ? 'bg-brand text-brand-ink' : 'text-ink-subtle hover:text-ink'}`}
                            >
                                {m}m
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <EstadoDeDatos
                consulta={query}
                queEs="que.bloques"
                vacio={!!data && data.cells.size === 0 && data.comps.length === 0}
                esqueleto={<Skeleton className="h-56 w-full rounded-card" />}
                vacioIcono={<CalendarOff size={20} aria-hidden="true" />}
                vacioTitulo="Nada que situar todavía"
                vacioCuerpo="Cuando este atleta tenga bloques con fecha de inicio y días con día de la semana asignado, aparecerán aquí."
            >
                {data && (
                    <>
                        <Legend />
                        <div className="overflow-x-auto rounded-card border border-[var(--border-default)] bg-surface-raised">
                            <div style={{ minWidth: weeks.length * WEEK_COL_WIDTH + 56 }}>
                                {/* Meses */}
                                <div className="flex border-b border-[var(--border-subtle)]">
                                    <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-[var(--border-subtle)] bg-surface-raised" />
                                    {weeks.map((w, i) => (
                                        <div key={i} style={{ width: WEEK_COL_WIDTH }} className="shrink-0 border-r border-[var(--border-subtle)] py-1 text-center last:border-r-0">
                                            {w.label && (
                                                <span className="block truncate text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">{w.label}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Un renglón por día de la semana, lunes arriba */}
                                {WEEKDAYS.map(day => (
                                    <div key={day.key} className="flex border-b border-[var(--border-subtle)] last:border-b-0">
                                        <div className="sticky left-0 z-10 flex w-14 shrink-0 items-center border-r border-[var(--border-subtle)] bg-surface-raised px-1.5 py-1.5">
                                            <span className="text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">{day.short}</span>
                                        </div>
                                        {weeks.map((w, i) => {
                                            const date = addDays(w.monday, day.index - 1);
                                            const key = ymd(date);
                                            const cell = data.cells.get(key);
                                            const comp = compsByDate.get(key);
                                            const isToday = key === todayYmd;
                                            const theme = cell ? getLiftTheme(cell.lift === 'ACC' ? 'accesorio' : LIFT_NAME[cell.lift]) : null;

                                            return (
                                                <button
                                                    key={i}
                                                    onClick={cell && onSelectBlock ? () => onSelectBlock(cell.blockId) : undefined}
                                                    disabled={!cell || !onSelectBlock}
                                                    title={
                                                        comp
                                                            ? `${comp.name} — ${comp.date}`
                                                            : cell
                                                                ? `${LIFT_NAME[cell.lift]}${cell.hasContent ? '' : ' · día vacío'} — ${key}`
                                                                : key
                                                    }
                                                    style={{ width: WEEK_COL_WIDTH }}
                                                    className={`relative flex h-9 shrink-0 items-center justify-center border-r border-[var(--border-subtle)] transition-colors duration-fast ease-snap last:border-r-0 ${cell && onSelectBlock ? 'cursor-pointer hover:bg-surface-overlay' : 'cursor-default'} ${isToday ? 'bg-[var(--brand-quiet)]' : ''}`}
                                                >
                                                    {comp && (
                                                        <Trophy size={11} className="absolute right-0.5 top-0.5 text-danger-text" aria-hidden="true" />
                                                    )}
                                                    {cell && theme && (
                                                        <span className="flex flex-col items-center gap-0.5">
                                                            <span className={`h-1.5 w-1.5 rounded-full ${theme.bar} ${cell.hasContent ? '' : 'opacity-40'}`} aria-hidden="true" />
                                                            <span className={`text-[9px] font-black uppercase leading-none ${theme.accent} ${cell.hasContent ? '' : 'opacity-50'}`}>
                                                                {cell.lift}
                                                            </span>
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <UndatedNotice blocks={data.coverage.undated} />
                    </>
                )}
            </EstadoDeDatos>
        </section>
    );
}

const LIFT_NAME: Record<'SQ' | 'BP' | 'DL' | 'ACC', string> = {
    SQ: 'Sentadilla', BP: 'Press Banca', DL: 'Peso muerto', ACC: 'Accesorio',
};

/** El básico dominante del día: el primero de competición que aparezca, o el primer accesorio. */
function dominantLift(exerciseNames: string[]): 'SQ' | 'BP' | 'DL' | 'ACC' {
    for (const name of exerciseNames) {
        const theme = getLiftTheme(name);
        if (theme.key !== 'ACC') return theme.key as 'SQ' | 'BP' | 'DL';
    }
    return 'ACC';
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

// =====================================================================

function Legend() {
    return (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-t-2xs text-ink-subtle">
            {(['SQ', 'BP', 'DL', 'ACC'] as const).map(key => {
                const theme = getLiftTheme(key === 'ACC' ? 'accesorio' : LIFT_NAME[key]);
                return (
                    <li key={key} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${theme.bar}`} aria-hidden="true" />
                        {LIFT_NAME[key]}
                    </li>
                );
            })}
            <li className="flex items-center gap-1.5">
                <Trophy size={11} className="text-danger-text" aria-hidden="true" />
                Competición
            </li>
        </ul>
    );
}

function UndatedNotice({ blocks }: { blocks: { blockId: string; name: string }[] }) {
    if (blocks.length === 0) return null;

    return (
        <div className="flex items-start gap-2.5 rounded-card border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5">
            <Info size={14} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
            <p className="min-w-0 text-t-xs leading-relaxed text-ink-subtle">
                Sin fecha de inicio, así que no se pueden situar:{' '}
                <span className="text-ink-muted">{blocks.map(b => b.name).join(', ')}</span>.
            </p>
        </div>
    );
}
