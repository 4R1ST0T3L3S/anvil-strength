import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import type { VolumeSessionInput } from '../../../../lib/volume/engine';
import type { ExtendedSessionExercise } from '../builder/types';
import { trainingService, type LoggedSession } from '../../../../services/trainingService';
import { repMaxesService } from '../../../../services/repMaxesService';
import type { RepMax } from '../../../../lib/stats/repMaxes';
import type { MaxesByExercise } from '../../../../services/maxesService';
import { CurrentWeekLifts } from './CurrentWeekLifts';
import { PreviousWeekSummary } from './PreviousWeekSummary';
import { AccessoryBreakdown } from './AccessoryBreakdown';
import { BestMarksMini } from './BestMarksMini';
import { ContextCalendarModal } from './ContextCalendarModal';
import { GoalsPanel } from './GoalsPanel';

/**
 * CENTRO DE CONTEXTO DEL ATLETA
 * =====================================================================
 *
 * Lo que el coach necesita tener delante mientras programa, para no tener que
 * salir del constructor a buscarlo:
 *
 *   1. SEMANA ACTUAL   — series de básicos ya programadas (dinámico)
 *   2. SEMANA ANTERIOR — lo que el atleta HIZO de verdad
 *   3. ACCESORIOS      — reparto del trabajo de apoyo, con comparación
 *   4. CALENDARIO      — botón que abre la línea temporal y las estadísticas
 *   5. HISTÓRICO       — mejores marcas para lo que se está escribiendo
 *
 * Vive en el panel derecho de `DayEditorModal`, encima del resumen del día
 * que ya había (que se conserva intacto, más abajo).
 *
 *   6. OBJETIVOS       — hacia dónde se lleva al atleta en este bloque
 *
 *
 * LA CARGA DEL REGISTRO ES DIFERIDA Y NO BLOQUEA
 *
 * Las secciones 1, 3 y 4 funcionan con el estado LOCAL del constructor: no
 * esperan a nada. Las 2 y 5 necesitan ir al servidor —el registro de
 * ejecución y las marcas—, así que se piden en segundo plano y cada sección
 * enseña su propio "cargando". Bloquear el panel entero hasta que lleguen
 * dejaría al coach sin las cifras de la semana actual, que son las que se
 * miran continuamente.
 *
 *
 * TRES BLOQUES DE HISTORIAL, NO DOS
 *
 * `getExecutionLog` trae dos bloques por defecto, y eso deja un agujero: al
 * empezar un bloque nuevo, "la semana anterior" cae en el bloque anterior y
 * puede quedarse justo fuera de la ventana. Con tres se cubre el mesociclo en
 * curso, el anterior y el margen de un bloque corto.
 */

interface AthleteContextPanelProps {
    athleteId: string;
    /** Del bloque que se está editando. Ata los objetivos nuevos a este bloque. */
    blockId: string;
    coachId: string | null;
    /** Todas las sesiones del bloque, con el estado local sin guardar. */
    sessions: VolumeSessionInput[];
    /** Metadatos de los días, para el selector del calendario. */
    sessionMeta: { id: string; week_number: number; day_number: number; day_of_week?: string | null; name?: string | null }[];
    /** Ejercicios del día que se está editando. */
    exercises: ExtendedSessionExercise[];
    currentSessionId: string;
    currentWeek: number;
    /** 1RM declarados del atleta, ya cargados por el constructor. */
    maxes?: MaxesByExercise | null;
    declaredMaxes?: Record<string, number>;
    weekNames?: Record<number, string>;
}

export function AthleteContextPanel({
    athleteId, blockId, coachId, sessions, sessionMeta, exercises,
    currentSessionId, currentWeek, maxes, declaredMaxes = {}, weekNames = {},
}: AthleteContextPanelProps) {
    const [calendarOpen, setCalendarOpen] = useState(false);

    /**
     * Registro de ejecución y marcas, con `useQuery` y no con efectos.
     *
     * No es solo estilo: un `setState` síncrono dentro de un `useEffect`
     * dispara renders en cascada, y eslint lo marca como error en este
     * proyecto. Además react-query da la caché compartida gratis — abrir y
     * cerrar el editor de un día cinco veces seguidas no vuelve a pedir el
     * historial cinco veces.
     *
     * Un fallo deja la sección que depende de esos datos vacía y con su
     * motivo; nunca tumba el panel. Las secciones 1, 3 y 4 no dependen de
     * ninguna de las dos consultas y funcionan desde el primer frame.
     */
    const loggedQuery = useQuery({
        queryKey: ['contexto-registro', athleteId],
        staleTime: 60 * 1000,
        queryFn: () => trainingService.getExecutionLog(athleteId, { blockLimit: 3 }),
    });

    const marksQuery = useQuery({
        queryKey: ['rep-maxes', athleteId],
        staleTime: 60 * 1000,
        queryFn: () => repMaxesService.list(athleteId),
    });

    /**
     * ¿Está la migración de marcas ejecutada?
     *
     * Solo se pregunta cuando la lista viene VACÍA, porque es el único caso
     * ambiguo: sin marcas puede significar "este atleta no tiene ninguna" o
     * "la tabla no existe todavía", y las dos se arreglan de formas opuestas.
     * Con marcas en la lista la pregunta sobra.
     */
    const availabilityQuery = useQuery({
        queryKey: ['rep-maxes-disponible'],
        staleTime: 5 * 60 * 1000,
        enabled: marksQuery.isSuccess && (marksQuery.data?.length ?? 0) === 0,
        queryFn: () => repMaxesService.isAvailable(),
    });

    const logged: LoggedSession[] = loggedQuery.data ?? [];
    const marks: RepMax[] = marksQuery.data ?? [];

    /**
     * La semana anterior DENTRO DEL BLOQUE, para comparar accesorios.
     *
     * Distinta de la que usa `PreviousWeekSummary`: aquella busca en el
     * REGISTRO (lo que el atleta hizo, que puede estar en otro bloque) y esta
     * en lo PROGRAMADO del bloque actual. Son dos preguntas distintas y
     * mezclarlas compararía las series pautadas de esta semana contra las
     * ejecutadas de otra.
     */
    const previousPlannedWeek = (() => {
        const weeks = [...new Set(sessions.map(s => s.week_number))].sort((a, b) => a - b);
        const earlier = weeks.filter(w => w < currentWeek);
        return earlier.length > 0 ? earlier[earlier.length - 1] : null;
    })();

    return (
        <div className="space-y-2">
            <CurrentWeekLifts
                sessions={sessions}
                week={currentWeek}
                declaredMaxes={declaredMaxes}
            />

            {/* Hacia dónde se lleva a este atleta — F4/F7. Va justo debajo de
                la semana en curso porque las dos contestan "qué estoy
                escribiendo": una lo compara con la semana pasada, esta con
                la meta del bloque. */}
            <GoalsPanel
                athleteId={athleteId}
                coachId={coachId}
                blockId={blockId}
                logged={logged}
                marks={marks}
            />

            <PreviousWeekSummary
                logged={logged}
                currentWeek={currentWeek}
                maxes={maxes}
                loading={loggedQuery.isLoading}
            />

            <AccessoryBreakdown
                sessions={sessions}
                currentWeek={currentWeek}
                previousWeek={previousPlannedWeek}
            />

            {/* EL CALENDARIO ES UN BOTÓN, NO UNA SECCIÓN PLEGABLE.
                Lo que hay detrás no cabe en una columna de 380px — es una
                línea temporal de varios meses y cuatro niveles de
                estadísticas—, así que abre en un diálogo a pantalla ancha. Un
                acordeón que al abrirse mide 600px de alto dentro de un panel
                con scroll no se puede usar. */}
            <button
                onClick={() => setCalendarOpen(true)}
                className="flex w-full items-center gap-2 rounded-card border border-[var(--border-default)] bg-surface-raised px-3 py-2.5 text-left transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
                <CalendarDays size={13} className="shrink-0 text-brand-text" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                    <span className="block text-t-2xs font-black uppercase tracking-[0.18em] text-ink-subtle">
                        Calendario
                    </span>
                    <span className="mt-0.5 block truncate text-t-2xs text-ink-faint">
                        Historial y estadísticas por día, semana, bloque y macro
                    </span>
                </span>
            </button>

            <BestMarksMini
                exercises={exercises}
                marks={marks}
                loading={marksQuery.isLoading}
                unavailable={availabilityQuery.data === false}
            />

            {/* Se monta solo cuando se abre: trae sus propias consultas y
                recalcula sobre todo el bloque. */}
            {calendarOpen && (
                <ContextCalendarModal
                    open
                    onClose={() => setCalendarOpen(false)}
                    athleteId={athleteId}
                    sessions={sessions}
                    sessionMeta={sessionMeta}
                    logged={logged}
                    currentSessionId={currentSessionId}
                    currentWeek={currentWeek}
                    weekNames={weekNames}
                    declaredMaxes={declaredMaxes}
                />
            )}
        </div>
    );
}
