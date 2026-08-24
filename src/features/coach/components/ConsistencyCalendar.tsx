import { useMemo } from 'react';
import type { ConsistencyDay } from '../../../lib/stats/athleteStats';

/**
 * MAPA DE CONSTANCIA (estilo GitHub)
 *
 * Una casilla por día, coloreada por las series hechas ese día. De un vistazo
 * se ven las rachas y —más importante— los huecos: dos semanas en blanco
 * cuentan una historia que ninguna media mensual llega a contar.
 *
 * TRAMPA DE ZONA HORARIA, EVITADA A PROPÓSITO
 * Las fechas llegan como 'YYYY-MM-DD' sin hora. `new Date('2026-03-01')` las
 * interpreta como MEDIANOCHE UTC, que en España es el día anterior a las 23:00,
 * así que una sesión podía pintarse en la casilla equivocada. Aquí las fechas
 * se parten a mano y se construyen con `new Date(y, m, d)` —hora LOCAL— y se
 * formatean del mismo modo. Nunca se cruza una cadena ISO por el constructor.
 */

const WEEKS_TO_SHOW = 18;

/** 'YYYY-MM-DD' en hora local, sin pasar por UTC. */
function ymd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Parse local de 'YYYY-MM-DD' a un Date a medianoche local. */
function parseYmd(s: string): Date {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Lunes=0 … Domingo=6 (getDay da Domingo=0). */
const isoWeekday = (d: Date): number => (d.getDay() + 6) % 7;

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function ConsistencyCalendar({ days }: { days: ConsistencyDay[] }) {
    const { columns, maxCompleted, monthLabels, totalSessions, activeDays } = useMemo(() => {
        const byDate = new Map(days.map(d => [d.date, d]));

        // Se ancla al último día con actividad —no a "hoy"— para que un
        // historial antiguo se vea igual en vez de salir una rejilla vacía.
        const last = days.length ? parseYmd(days[days.length - 1].date) : new Date();
        // Fin de SU semana (domingo), para que la última columna quede completa.
        const end = new Date(last);
        end.setDate(end.getDate() + (6 - isoWeekday(end)));
        // Inicio: lunes, WEEKS_TO_SHOW semanas atrás.
        const start = new Date(end);
        start.setDate(start.getDate() - (WEEKS_TO_SHOW * 7 - 1));

        const cols: { date: string; completed: number; sets: number; sessions: number; inFuture: boolean }[][] = [];
        const labels: { col: number; text: string }[] = [];
        let max = 0;
        let sessionsTotal = 0;
        let active = 0;
        let lastMonth = -1;

        const cursor = new Date(start);
        const today = ymd(new Date());
        for (let w = 0; w < WEEKS_TO_SHOW; w++) {
            const week: typeof cols[number] = [];
            for (let d = 0; d < 7; d++) {
                const key = ymd(cursor);
                const hit = byDate.get(key);
                const completed = hit?.completedSets ?? 0;
                if (completed > max) max = completed;
                if (hit && completed > 0) { active += 1; sessionsTotal += hit.sessions; }

                if (d === 0) {
                    const m = cursor.getMonth();
                    if (m !== lastMonth) { labels.push({ col: w, text: MONTHS[m] }); lastMonth = m; }
                }

                week.push({
                    date: key,
                    completed,
                    sets: hit?.sets ?? 0,
                    sessions: hit?.sessions ?? 0,
                    inFuture: key > today,
                });
                cursor.setDate(cursor.getDate() + 1);
            }
            cols.push(week);
        }

        return { columns: cols, maxCompleted: max, monthLabels: labels, totalSessions: sessionsTotal, activeDays: active };
    }, [days]);

    if (days.length === 0) {
        return (
            <p className="py-8 text-center text-t-sm text-ink-subtle">
                Sin sesiones con fecha todavía. El mapa aparece cuando el bloque tiene días fijados en el calendario.
            </p>
        );
    }

    // Cuatro niveles de intensidad sobre el máximo del periodo. Un umbral fijo
    // no vale: 10 series/día es mucho para un principiante y poco para un avanzado.
    const level = (completed: number): number => {
        if (completed <= 0 || maxCompleted <= 0) return 0;
        const q = completed / maxCompleted;
        if (q > 0.66) return 3;
        if (q > 0.33) return 2;
        return 1;
    };
    const LEVEL_BG = [
        'var(--surface-sunken)',
        'color-mix(in srgb, var(--brand) 30%, transparent)',
        'color-mix(in srgb, var(--brand) 60%, transparent)',
        'var(--brand)',
    ];

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-t-xs text-ink-subtle">
                <span><strong className="text-ink">{activeDays}</strong> días entrenados</span>
                <span><strong className="text-ink">{totalSessions}</strong> sesiones en {WEEKS_TO_SHOW} semanas</span>
            </div>

            <div className="overflow-x-auto pb-1 scrollbar-hide">
                <div className="inline-flex flex-col gap-1">
                    {/* Etiquetas de mes */}
                    <div className="relative ml-0 h-4" style={{ width: columns.length * 16 }}>
                        {monthLabels.map(({ col, text }) => (
                            <span
                                key={`${col}-${text}`}
                                className="absolute text-t-2xs text-ink-subtle"
                                style={{ left: col * 16 }}
                            >
                                {text}
                            </span>
                        ))}
                    </div>
                    {/* Rejilla: una columna por semana */}
                    <div className="flex gap-1">
                        {columns.map((week, wi) => (
                            <div key={wi} className="flex flex-col gap-1">
                                {week.map((cell) => (
                                    <div
                                        key={cell.date}
                                        title={
                                            cell.inFuture
                                                ? cell.date
                                                : `${cell.date} · ${cell.completed} series${cell.sessions ? ` · ${cell.sessions} sesión(es)` : ''}`
                                        }
                                        className="h-3 w-3 rounded-[3px] transition-colors"
                                        style={{
                                            background: cell.inFuture ? 'transparent' : LEVEL_BG[level(cell.completed)],
                                            border: cell.inFuture ? '1px dashed var(--border-subtle)' : '1px solid var(--border-subtle)',
                                        }}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Leyenda */}
            <div className="mt-3 flex items-center gap-1.5 text-t-2xs text-ink-subtle">
                <span>Menos</span>
                {LEVEL_BG.map((bg, i) => (
                    <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: bg, border: '1px solid var(--border-subtle)' }} />
                ))}
                <span>Más</span>
            </div>
        </div>
    );
}
