import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { fetchRoster, type RosterAthlete } from './useCoachRoster';
import { competitionsService } from '../../../services/competitionsService';
import {
    buildAthleteCoverage,
    resolveBlockSpan,
    sessionDate,
    addDays,
    ymd,
    type AthleteCoverage,
    type CoverageBlockInput,
    type CoverageSessionInput,
    type CoverageCompetitionInput,
} from '../../../lib/planning/coverage';

/**
 * ANVIL STRENGTH — LA COBERTURA DE PROGRAMACIÓN DE TODO EL EQUIPO
 * =====================================================================
 *
 * CUATRO CONSULTAS PARA VEINTE ATLETAS, NO OCHENTA
 *
 * Es la decisión que define este archivo. La versión ingenua sería, por cada
 * atleta: sus bloques, sus sesiones y sus competiciones — o sea 3N+1
 * consultas, que con veinte atletas son sesenta y uno encadenados contra
 * Supabase. En una conexión normal eso son varios segundos de pantalla en
 * blanco cada vez que se abre el calendario, y en móvil bastante más.
 *
 * Aquí se piden por lotes con `.in(...)`: el equipo, TODOS sus bloques, TODAS
 * las sesiones de esos bloques, y las competiciones del entrenador. Cuatro
 * viajes, independientes del tamaño del equipo.
 *
 *
 * POR QUÉ LAS SESIONES SE PIDEN CON UN `count` Y NO ENTERAS
 *
 * Lo único que el calendario necesita saber de una sesión es si tiene
 * ejercicios o no — para distinguir "semana programada" de "semana creada y
 * vacía", que es la diferencia entre que el atleta tenga algo que hacer o
 * abra la aplicación y no encuentre nada.
 *
 * Traer los ejercicios y sus series para contarlos serían decenas de miles de
 * filas. PostgREST sabe contar en el servidor con `session_exercises(count)`,
 * así que viene un número por sesión y no una lista.
 *
 *
 * DEGRADA POR PARTES
 *
 * Un fallo en las competiciones NO puede tumbar el calendario de
 * programación, y al revés. Cada bloque de datos se captura por separado y lo
 * que falla se queda vacío: es mejor un calendario sin los pines de
 * competición que ningún calendario.
 */

export interface TeamCoverage {
    athletes: RosterAthlete[];
    /** Una entrada por atleta, en el mismo orden que `athletes`. */
    coverage: Map<string, AthleteCoverage>;
    /**
     * Una entrada por FECHA (clave `ymd`) — la rejilla del calendario de
     * equipo. `count` son las sesiones de ESE día en todo el equipo,
     * `withContent` las que además tienen algún ejercicio (no solo el día
     * creado y vacío), y `athletes` sus ids, para el resumen al pasar el
     * ratón. Ausente = ningún atleta entrena ese día.
     */
    cells: Map<string, { count: number; withContent: number; athletes: string[] }>;
    /** Extremos del eje temporal, ya calculados sobre los datos reales. */
    axisStart: Date;
    axisEnd: Date;
}

export const teamCoverageKey = (coachId: string | null | undefined, months: number) =>
    ['team-coverage', coachId ?? null, months] as const;

/**
 * Ventana temporal por defecto: un mes hacia atrás y cinco hacia delante.
 *
 * Hacia atrás poco, porque lo que se decide en este calendario es el FUTURO —
 * a quién le falta programación—. Hacia delante bastante, porque un macro de
 * preparación a una competición dura cuatro o cinco meses y verlo cortado no
 * sirve de nada.
 */
export const DEFAULT_MONTHS_BACK = 1;
export const DEFAULT_MONTHS_FORWARD = 5;

export function useTeamCoverage(
    coachId: string | null | undefined,
    options: { monthsBack?: number; monthsForward?: number; enabled?: boolean } = {}
) {
    const monthsBack = options.monthsBack ?? DEFAULT_MONTHS_BACK;
    const monthsForward = options.monthsForward ?? DEFAULT_MONTHS_FORWARD;

    const query = useQuery({
        queryKey: teamCoverageKey(coachId, monthsBack * 100 + monthsForward),
        enabled: !!coachId && options.enabled !== false,
        staleTime: 60 * 1000,
        queryFn: async (): Promise<TeamCoverage> => {
            const athletes = await fetchRoster(coachId as string, 'active');

            // El eje se ancla a HOY y no al primer bloque: el calendario
            // contesta "¿quién se queda sin programación?", y esa pregunta es
            // siempre sobre el presente y lo que viene.
            const today = new Date();
            const axisStart = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
            const axisEnd = new Date(today.getFullYear(), today.getMonth() + monthsForward + 1, 0);

            if (athletes.length === 0) {
                return { athletes, coverage: new Map(), cells: new Map(), axisStart, axisEnd };
            }

            const athleteIds = athletes.map(a => a.id);

            // 1. TODOS los bloques del equipo, de una vez.
            const { data: blockRows, error: blocksError } = await supabase
                .from('training_blocks')
                .select('id, athlete_id, name, start_week, end_week, start_date, is_active, color, macro_id')
                .in('athlete_id', athleteIds);

            if (blocksError) throw blocksError;
            const blocks = (blockRows ?? []) as CoverageBlockInput[];

            // 2. Cuántos ejercicios tiene cada día. Ver la cabecera: viene un
            //    número contado en el servidor, no las filas.
            let sessions: CoverageSessionInput[] = [];
            if (blocks.length > 0) {
                const { data: sessionRows } = await supabase
                    .from('training_sessions')
                    .select('id, block_id, week_number, day_number, day_of_week, completed_at, session_exercises(count)')
                    .in('block_id', blocks.map(b => b.id))
                    .then(r => r, () => ({ data: null }));

                type Row = {
                    id: string; block_id: string; week_number: number; day_number: number;
                    day_of_week: string | null; completed_at: string | null;
                    session_exercises: { count: number }[] | null;
                };

                sessions = ((sessionRows ?? []) as unknown as Row[]).map(s => ({
                    id: s.id,
                    block_id: s.block_id,
                    week_number: s.week_number,
                    day_number: s.day_number,
                    day_of_week: s.day_of_week,
                    completed_at: s.completed_at,
                    exerciseCount: s.session_exercises?.[0]?.count ?? 0,
                }));
            }

            // 3. Competiciones. Un fallo aquí deja el calendario sin pines,
            //    no sin calendario.
            let competitions: CoverageCompetitionInput[] = [];
            try {
                const assignments = await competitionsService.getCoachAssignments(coachId as string);
                competitions = assignments
                    .filter(a => athleteIds.includes(a.athlete_id))
                    .map(a => ({
                        id: a.id,
                        athlete_id: a.athlete_id,
                        name: a.name,
                        date: a.date,
                        end_date: a.end_date ?? null,
                        level: a.level ?? null,
                        location: a.location ?? null,
                    }));
            } catch (err) {
                console.error('No se pudieron cargar las competiciones del calendario:', err);
            }

            // El horizonte de los huecos abiertos es el final del eje: sin él,
            // "se queda sin programación" sería un hueco infinito.
            const horizon = addDays(axisEnd, 0);

            const coverage = new Map<string, AthleteCoverage>(
                athletes.map(a => [
                    a.id,
                    buildAthleteCoverage(a.id, blocks, sessions, competitions, horizon),
                ])
            );

            // 4. UNA CASILLA POR FECHA, con cuántos atletas entrenan ese día —
            //    lo que pinta la rejilla del calendario de equipo (30 ago
            //    2026). Se resuelve aquí, una vez, reutilizando los mismos
            //    `blocks`/`sessions` que ya se han pedido: ni una consulta de
            //    más por tener también la rejilla.
            const cells = new Map<string, { count: number; withContent: number; athletes: string[] }>();
            for (const block of blocks) {
                const resolved = resolveBlockSpan(block, sessions);
                if (!('span' in resolved)) continue;
                for (const session of sessions) {
                    if (session.block_id !== block.id) continue;
                    const date = sessionDate(session, resolved.span);
                    if (!date) continue;
                    const key = ymd(date);
                    const cell = cells.get(key) ?? { count: 0, withContent: 0, athletes: [] };
                    cell.count += 1;
                    if (session.exerciseCount > 0) cell.withContent += 1;
                    cell.athletes.push(block.athlete_id);
                    cells.set(key, cell);
                }
            }

            return { athletes, coverage, cells, axisStart, axisEnd };
        },
    });

    /**
     * Los atletas ordenados por URGENCIA, no por nombre.
     *
     * Primero quien no tiene ninguna programación, luego quien se queda sin
     * ella antes. Es el orden en el que hay que atenderlos, y es la razón de
     * que este calendario exista: una lista alfabética obliga a recorrerla
     * entera para encontrar los tres que importan.
     */
    const byUrgency = useMemo(() => {
        const data = query.data;
        if (!data) return [];
        return [...data.athletes].sort((a, b) => {
            const ca = data.coverage.get(a.id)?.coveredUntil ?? null;
            const cb = data.coverage.get(b.id)?.coveredUntil ?? null;
            if (ca === null && cb === null) return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'es');
            if (ca === null) return -1;
            if (cb === null) return 1;
            return ca.getTime() - cb.getTime();
        });
    }, [query.data]);

    return {
        data: query.data,
        byUrgency,
        loading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}
