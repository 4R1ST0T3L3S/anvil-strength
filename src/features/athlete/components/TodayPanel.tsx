import { useEffect, useState } from 'react';
import { ChevronRight, Dumbbell, Utensils, Check, Flame, Sparkles, Moon } from 'lucide-react';
import { trainingService, type TodayTraining } from '../../../services/trainingService';
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

function TrainingCard({
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
    const progress = session && session.totalSets > 0
        ? Math.round((session.completedSets / session.totalSets) * 100)
        : 0;

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

                {/* La lista de ejercicios es LO IMPORTANTE de esta tarjeta:
                    responde a "¿qué toca hoy?" sin abrir nada. */}
                {!loading && session && session.exerciseNames.length > 0 && (
                    <ul className="mt-3 space-y-0.5">
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

                {!loading && session && (session.hasWarmup || session.hasExtras) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {session.hasWarmup && <Tag icon={Flame}>Calentamiento</Tag>}
                        {session.hasExtras && <Tag icon={Sparkles}>Extras</Tag>}
                    </div>
                )}
            </div>

            <div className="relative mt-4">
                <span className="block truncate text-t-2xl font-black uppercase leading-none tracking-display text-brand-ink">
                    {loading
                        ? 'Cargando…'
                        : training?.isRestDay
                            ? 'Descanso'
                            : session?.title ?? 'Entrenar'}
                </span>

                <span className="mt-1.5 flex items-center gap-1 text-t-sm text-brand-ink/80">
                    {loading
                        ? 'Tu sesión de hoy'
                        : locked
                            ? 'Necesitas acceso completo'
                            : training?.isRestDay
                                ? 'Hoy no hay sesión pautada'
                                : session
                                    ? `${session.completedSets} de ${session.totalSets} series · ${training?.blockName}`
                                    : 'Tu entrenador aún no te ha pautado nada'}
                    {!locked && (
                        <ChevronRight size={14} aria-hidden="true" className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                    )}
                </span>

                {/* Barra de progreso. Solo cuando hay algo que medir: en un día
                    de descanso una barra al 0% se lee como trabajo pendiente. */}
                {!loading && session && session.totalSets > 0 && (
                    <div className="mt-3 h-1 overflow-hidden rounded-pill bg-brand-ink/20">
                        <div
                            className="h-full rounded-pill bg-brand-ink transition-[width] duration-base ease-snap"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}
            </div>

            {training?.isRestDay && (
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
                {unit && <span className="text-t-2xs font-bold text-ink-faint">{unit}</span>}
            </p>
            <p className="mt-0.5 text-t-2xs font-bold uppercase tracking-wide text-ink-faint">{label}</p>
        </div>
    );
}
