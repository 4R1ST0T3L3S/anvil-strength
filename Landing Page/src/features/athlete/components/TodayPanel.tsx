import { useEffect, useState } from 'react';
import { ChevronRight, Dumbbell, Utensils, Check, Flame, Sparkles, Moon } from 'lucide-react';
import { trainingService, type TodayTraining, type NoSessionReason } from '../../../services/trainingService';
import { nutritionService } from '../../../services/nutritionService';
import type { NutritionPlan } from '../../../types/nutrition';

/**
 * LO QUE TOCA HOY
 * =====================================================================
 *
 * La pantalla de inicio del atleta tenía dos botones enormes, "Entrenar" y
 * "Mi dieta", que no decían absolutamente nada de lo que había detrás. Para
 * saber qué le había pautado su entrenador —o cuántas proteínas le tocaban—
 * había que entrar en otra pantalla y esperar a que cargara.
 *
 * Eso es justo al revés de como se usa la aplicación. El atleta la abre en el
 * vestuario, con una mano, treinta segundos antes de empezar: lo que necesita
 * es ver de un vistazo qué hay hoy y entrar directo.
 *
 * Aquí se enseña el trabajo REAL: el nombre del día, los ejercicios, cuántas
 * series lleva hechas, si hay calentamiento o extras, y los macros del plan
 * que le ha puesto el nutricionista. Los botones siguen llevando a las mismas
 * pantallas; lo que cambia es que ahora se sabe a qué se entra.
 *
 * Ninguna de las dos consultas puede tumbar el inicio: si algo falla, la
 * tarjeta cae al mismo botón de siempre.
 */

interface TodayPanelProps {
    athleteId: string;
    onOpenTraining: () => void;
    onOpenNutrition: () => void;
    /** Sin acceso completo, las dos pantallas están cerradas. */
    locked: boolean;
}

export function TodayPanel({ athleteId, onOpenTraining, onOpenNutrition, locked }: TodayPanelProps) {
    const [training, setTraining] = useState<TodayTraining | null>(null);
    const [plan, setPlan] = useState<NutritionPlan | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;

        // En paralelo: son dos consultas independientes y encadenarlas dobla
        // la espera de la primera pantalla que ve el atleta.
        Promise.all([
            trainingService.getTodayForAthlete(athleteId).catch(() => null),
            nutritionService.getAthleteNutritionPlan(athleteId).catch(() => null),
        ]).then(([todayTraining, nutritionPlan]) => {
            if (!alive) return;
            setTraining(todayTraining);
            setPlan(nutritionPlan);
            setLoading(false);
        });

        return () => { alive = false; };
    }, [athleteId]);

    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TrainingCard
                training={training}
                loading={loading}
                locked={locked}
                onOpen={onOpenTraining}
            />
            <NutritionCard
                plan={plan}
                loading={loading}
                locked={locked}
                onOpen={onOpenNutrition}
            />
        </div>
    );
}

// =====================================================================
// ENTRENAMIENTO
// =====================================================================

/** Lo que se le dice al atleta cuando hoy no hay sesión. */
const NO_SESSION_TEXT: Record<NoSessionReason, { title: string; hint: string }> = {
    rest: { title: 'Descanso', hint: 'Hoy no hay sesión pautada' },
    // El caso que más confusión generaba: el plan EXISTE, solo que su
    // entrenador todavía no lo ha abierto. Decir "no te han pautado nada" hacía
    // que el atleta escribiera para preguntar por algo que ya estaba escrito.
    'not-released': { title: 'Aún no disponible', hint: 'Tu entrenador todavía no ha abierto esta semana' },
    'not-started': { title: 'Sin empezar', hint: 'Tu bloque empieza más adelante' },
    finished: { title: 'Bloque terminado', hint: 'Has llegado al final de este bloque' },
    empty: { title: 'Entrenar', hint: 'Tu entrenador aún no te ha pautado nada' },
};

/**
 * Cabecera de contexto: "Viernes · Semana 6 de 12 · Día 3".
 *
 * Es la respuesta a "¿dónde estoy?", que hasta ahora había que deducir
 * entrando en la planificación y mirando el selector de semana. Cada pieza se
 * omite si no se puede afirmar: un bloque sin `start_week` no tiene ordinal de
 * semana, y un día sin agendar no tiene día de la semana.
 */
function contextLine(training: TodayTraining): string | null {
    const parts: string[] = [];

    if (training.session?.weekday) parts.push(training.session.weekday);

    if (training.programWeek !== null && training.programWeek >= 1) {
        parts.push(
            training.totalWeeks
                ? `Semana ${training.programWeek} de ${training.totalWeeks}`
                : `Semana ${training.programWeek}`
        );
    }

    if (training.session) parts.push(`Día ${training.session.dayNumber}`);

    return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Se exporta para el banco de pruebas de maquetación (`/dev/movil`).
 *
 * Es la tarjeta con más estados de toda la aplicación —sesión a medias,
 * terminada, día de descanso, semana sin abrir, bloque terminado, sin
 * acceso— y todos viven detrás del login y de tener un bloque activo con los
 * datos justos. Sin poder montarla con datos de mentira, revisar cómo le
 * queda a 375px es adivinar.
 */
export function TrainingCard({
    training,
    loading,
    locked,
    onOpen,
}: {
    training: TodayTraining | null;
    loading: boolean;
    locked: boolean;
    onOpen: () => void;
}) {
    const session = training?.session ?? null;
    const done = session?.completed ?? false;
    const started = (session?.completedSets ?? 0) > 0;
    const progress = session && session.totalSets > 0
        ? Math.round((session.completedSets / session.totalSets) * 100)
        : 0;
    const noSession = training && !session ? NO_SESSION_TEXT[training.reason ?? 'empty'] : null;
    const context = training && !loading ? contextLine(training) : null;

    /**
     * El botón dice lo que va a pasar al pulsarlo.
     *
     * "Entrenar" valía para las tres situaciones y no distinguía ninguna:
     * empezar de cero, retomar un día a medias y volver a mirar uno cerrado no
     * son la misma acción.
     */
    const action = done
        ? 'Ver entrenamiento'
        : started
            ? 'Continuar entrenamiento'
            : 'Empezar entrenamiento';

    return (
        <button
            onClick={onOpen}
            disabled={locked}
            className="group relative flex min-h-[168px] flex-col justify-between overflow-hidden rounded-card bg-brand p-5 text-left transition-colors duration-fast ease-snap hover:bg-brand-hover active:bg-brand-active disabled:cursor-not-allowed disabled:opacity-60"
        >
            <Dumbbell
                size={128}
                aria-hidden="true"
                className="pointer-events-none absolute -right-6 -top-4 text-brand-ink opacity-[0.12] transition-transform duration-base ease-snap group-hover:scale-105"
            />

            <div className="relative">
                <div className="flex items-center gap-2">
                    <Dumbbell size={22} className="text-brand-ink" aria-hidden="true" />
                    {done && (
                        <span className="flex items-center gap-1 rounded-chip bg-brand-ink/15 px-2 py-0.5 text-t-2xs font-bold uppercase tracking-wider text-brand-ink">
                            <Check size={11} strokeWidth={3} aria-hidden="true" /> Hecho
                        </span>
                    )}
                </div>

                {/* DÓNDE ESTÁ EL ATLETA, en un renglón.
                    Antes había que entrar en la planificación y leer el
                    selector de semana para saberlo. */}
                {context && (
                    <p className="mt-2 truncate text-t-2xs font-bold uppercase tracking-widest text-brand-ink/70">
                        {context}
                    </p>
                )}

                {/* La lista de ejercicios es LO IMPORTANTE de esta tarjeta:
                    responde a "¿qué toca hoy?" sin abrir nada. */}
                {!loading && session && session.exerciseNames.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                        {session.exerciseNames.slice(0, 3).map((name, i) => (
                            <li key={i} className="truncate text-t-sm font-medium text-brand-ink/90">
                                {name}
                            </li>
                        ))}
                        {session.exerciseNames.length > 3 && (
                            <li className="text-t-xs text-brand-ink/60">
                                +{session.exerciseNames.length - 3} más
                            </li>
                        )}
                    </ul>
                )}

                {!loading && session && (session.hasWarmup || session.considerations) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {session.considerations && <Tag icon={Sparkles}>Consideraciones</Tag>}
                        {session.hasWarmup && <Tag icon={Flame}>Calentamiento</Tag>}
                    </div>
                )}
            </div>

            <div className="relative mt-4">
                <span className="block truncate text-t-2xl font-black uppercase leading-none tracking-display text-brand-ink">
                    {loading
                        ? 'Cargando…'
                        : noSession
                            ? noSession.title
                            : session?.title ?? 'Entrenar'}
                </span>

                <span className="mt-1.5 flex items-center gap-1 text-t-sm text-brand-ink/80">
                    <span className="truncate">
                        {loading
                            ? 'Tu sesión de hoy'
                            : locked
                                ? 'Necesitas acceso completo'
                                : noSession
                                    ? noSession.hint
                                    : session
                                        ? `${session.completedSets} de ${session.totalSets} series · ${training?.blockName}`
                                        : 'Tu entrenador aún no te ha pautado nada'}
                    </span>
                    {/* La flecha solo cuando NO hay botón: con los dos, la
                        tarjeta señala dos veces al mismo sitio. */}
                    {!locked && !session && (
                        <ChevronRight size={14} aria-hidden="true" className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                    )}
                </span>

                {/* Barra de progreso, PEGADA al renglón de series que mide.
                    Solo cuando hay algo que medir: en un día de descanso una
                    barra al 0% se lee como trabajo pendiente. */}
                {!loading && session && session.totalSets > 0 && (
                    <div className="mt-2 h-1 overflow-hidden rounded-pill bg-brand-ink/20">
                        <div
                            className="h-full rounded-pill bg-brand-ink transition-[width] duration-base ease-snap"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}

                {/* LLAMADA A LA ACCIÓN.
                    La tarjeta entera ya era pulsable, pero nada lo decía: era
                    un bloque de información con aspecto de bloque de
                    información. Un botón dentro de un botón no es válido, así
                    que esto es un `span` con aspecto de botón — el clic lo
                    sigue recogiendo la tarjeta. */}
                {!loading && !locked && session && (
                    <span className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-field bg-brand-ink/15 text-t-sm font-black uppercase tracking-wider text-brand-ink transition-colors duration-fast ease-snap group-hover:bg-brand-ink/25">
                        {action}
                        <ChevronRight size={15} aria-hidden="true" />
                    </span>
                )}
            </div>

            {training?.reason === 'rest' && (
                <Moon
                    size={112}
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-4 right-2 text-brand-ink opacity-[0.10]"
                />
            )}
        </button>
    );
}

// =====================================================================
// NUTRICIÓN
// =====================================================================

function NutritionCard({
    plan,
    loading,
    locked,
    onOpen,
}: {
    plan: NutritionPlan | null;
    loading: boolean;
    locked: boolean;
    onOpen: () => void;
}) {
    return (
        <button
            onClick={onOpen}
            disabled={locked}
            className="group relative flex min-h-[168px] flex-col justify-between overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-5 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-60"
        >
            <Utensils
                size={128}
                aria-hidden="true"
                className="pointer-events-none absolute -right-6 -top-4 text-success opacity-[0.06] transition-transform duration-base ease-snap group-hover:scale-105"
            />

            <div className="relative">
                <span className="flex h-10 w-10 items-center justify-center rounded-field bg-success-quiet">
                    <Utensils size={20} className="text-success" aria-hidden="true" />
                </span>

                {/* Los macros del día, del plan que ha escrito el
                    nutricionista. Es el dato que el atleta mira varias veces
                    al día y para el que antes había que cambiar de pantalla. */}
                {!loading && plan && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                        <Macro label="kcal" value={plan.calories_target} />
                        <Macro label="prot" value={plan.protein_target} unit="g" />
                        <Macro label="carb" value={plan.carbs_target} unit="g" />
                        <Macro label="gras" value={plan.fats_target} unit="g" />
                    </div>
                )}
            </div>

            <div className="relative mt-4">
                <span className="block text-t-2xl font-black uppercase leading-none tracking-display text-ink">
                    Mi dieta
                </span>
                <span className="mt-1.5 flex items-center gap-1 text-t-sm text-ink-subtle">
                    {loading
                        ? 'Cargando…'
                        : locked
                            ? 'Necesitas acceso completo'
                            : plan
                                ? `${plan.meals?.length ?? 0} comidas pautadas`
                                : 'Todavía no tienes plan asignado'}
                    {!locked && (
                        <ChevronRight size={14} aria-hidden="true" className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                    )}
                </span>
            </div>
        </button>
    );
}

// =====================================================================
// PIEZAS
// =====================================================================

function Tag({ icon: Icon, children }: { icon: typeof Flame; children: React.ReactNode }) {
    return (
        <span className="flex items-center gap-1 rounded-chip bg-brand-ink/15 px-2 py-0.5 text-t-2xs font-bold uppercase tracking-wider text-brand-ink">
            <Icon size={10} aria-hidden="true" />
            {children}
        </span>
    );
}

function Macro({ label, value, unit = '' }: { label: string; value: number; unit?: string }) {
    return (
        <div className="rounded-field bg-surface-sunken px-2 py-1.5 text-center">
            <p className="text-t-base font-black tabular-nums leading-none text-ink">
                {Math.round(value || 0)}
                {unit && <span className="text-t-2xs font-bold text-ink-subtle">{unit}</span>}
            </p>
            <p className="mt-0.5 text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">{label}</p>
        </div>
    );
}
