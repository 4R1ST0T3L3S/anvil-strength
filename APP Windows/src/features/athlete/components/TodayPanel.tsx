import { useEffect, useState } from 'react';
import { Dumbbell, Utensils, Moon } from 'lucide-react';
import { NavTile, TILE } from '../../../components/ui/HomeTiles';
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
    /** Clases para la rejilla raíz: el inicio le fija el alto. */
    className?: string;
}

export function TodayPanel({ athleteId, onOpenTraining, onOpenNutrition, locked, className = '' }: TodayPanelProps) {
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
        <div className={`grid grid-cols-2 gap-2 ${className}`}>
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
    const noSession = training && !session ? NO_SESSION_TEXT[training.reason ?? 'empty'] : null;

    const title = loading ? 'Cargando…' : noSession ? noSession.title : session?.title ?? 'Entrenar';
    const hint = loading
        ? 'Tu sesión de hoy'
        : locked
            ? 'Necesitas acceso completo'
            : noSession
                ? noSession.hint
                : session
                    ? `${session.completedSets} de ${session.totalSets} series • ${training?.blockName}`
                    : 'Tu entrenador aún no te ha pautado nada';

    return (
        <NavTile
            icon={Dumbbell}
            title={title}
            hint={hint}
            onClick={onOpen}
            disabled={locked}
            customColor={TILE.brand}
            decoration={training?.reason === 'rest' ? (
                <Moon
                    size={112}
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-4 right-2 text-ink opacity-[0.06]"
                />
            ) : undefined}
        />
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
    const hint = loading
        ? 'Tu plan nutricional'
        : locked
            ? 'Necesitas acceso completo'
            : plan
                ? `${plan.calories_target} kcal • ${plan.protein_target}g P`
                : 'Todavía no tienes plan asignado';

    return (
        <NavTile
            icon={Utensils}
            title={loading ? 'Cargando…' : 'Mi dieta'}
            hint={hint}
            onClick={onOpen}
            disabled={locked}
            customColor={TILE.lime}
        />
    );
}






