import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Apple, Search, ChevronRight, ArrowLeft, Lock, Check } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { useCoachRoster, type RosterAthlete } from '../hooks/useCoachRoster';
import { NutritionPlanEditor } from '../../nutrition/components/NutritionPlanEditor';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { SafeImage } from '../../../components/ui/SafeImage';
import { puede } from '../../../lib/roles';

/**
 * DIETAS — LA ENTRADA DEL ENTRENADOR A LA NUTRICIÓN DE SU EQUIPO
 * =====================================================================
 *
 * QUÉ ES Y QUÉ NO ES
 *
 * Es la MISMA estructura que "Mis atletas": una lista del equipo desde la que
 * se entra a la ficha de uno. Lo que cambia es a dónde lleva — al plan
 * nutricional en vez de a la programación.
 *
 * NO es una plataforma nutricional nueva. El editor de planes
 * (`NutritionPlanEditor`), las comidas, el buscador de alimentos y la
 * exportación a PDF ya existen y funcionan; esto es la puerta que faltaba
 * para llegar a ellos desde el panel del entrenador sin pasar por la ficha de
 * un atleta y buscar la pestaña.
 *
 *
 * POR QUÉ NO REUTILIZA `NutritionAthletes` NI `/nutrition`
 *
 * `NutritionDashboard` (/nutrition) es el panel del NUTRICIONISTA: tiene su
 * propio armazón, su propio menú lateral y sus propias gráficas. Meter al
 * entrenador ahí significaría o darle un panel entero que no es el suyo, o
 * recortarlo con condicionales por todas partes.
 *
 * Y `NutritionAthletes`, la lista que vive dentro de aquel, consulta
 * `profiles` por `coach_id`/`nutritionist_id` a mano — un patrón que aquí no
 * se puede usar: los atletas de un entrenador salen por `useCoachRoster`, que
 * es la única puerta a `coach_athletes` y la que no se olvida el filtro de
 * relación activa. Aquella pantalla se queda como está; esta usa la puerta
 * buena.
 *
 *
 * EL PERMISO
 *
 * Pautar nutrición es la capacidad `pautar_nutricion`, y un rol `coach` puro
 * NO la tiene. En vez de esconder la sección —lo que dejaría al entrenador
 * pulsando una tarjeta que no hace nada— se entra siempre y se explica.
 * Un acceso que falla en silencio se lee como una avería.
 */

interface CoachDietsProps {
    user: UserProfile;
    onBack?: () => void;
}

/** Los atletas que YA tienen un plan activo. Una consulta para todo el equipo. */
function usePlanStatus(athleteIds: string[]) {
    return useQuery({
        queryKey: ['dietas-estado', [...athleteIds].sort().join(',')],
        enabled: athleteIds.length > 0,
        staleTime: 60 * 1000,
        queryFn: async () => {
            // Solo los identificadores y solo de los planes ACTIVOS: es lo
            // único que hace falta para poner un sello en la lista, y traer
            // los planes enteros con sus comidas y sus alimentos para eso
            // serían cientos de filas por nada.
            const { data, error } = await supabase
                .from('nutrition_plans')
                .select('athlete_id, calories_target, updated_at')
                .in('athlete_id', athleteIds)
                .eq('status', 'active');

            if (error) throw error;

            return new Map(
                (data ?? []).map(p => [
                    p.athlete_id as string,
                    { calories: p.calories_target as number | null, updatedAt: p.updated_at as string | null },
                ])
            );
        },
    });
}

export function CoachDiets({ user, onBack }: CoachDietsProps) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<RosterAthlete | null>(null);

    const { athletes, loading, error, refetch } = useCoachRoster(user.id);
    const athleteIds = useMemo(() => athletes.map(a => a.id), [athletes]);
    const planStatus = usePlanStatus(athleteIds);

    const puedePautar = puede(user, 'pautar_nutricion');

    const visibles = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return athletes;
        return athletes.filter(a => (a.full_name ?? '').toLowerCase().includes(term));
    }, [athletes, search]);

    const buscando = search.trim().length > 0;

    // ---------------------------------------------------------------
    // FICHA DE UN ATLETA
    // ---------------------------------------------------------------
    if (selected) {
        return (
            <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:px-8 md:py-10">
                <button
                    onClick={() => setSelected(null)}
                    className="mb-5 flex items-center gap-2 rounded-field px-2 py-1.5 text-t-sm font-semibold text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Ver todas las dietas
                </button>

                <header className="mb-6 flex items-center gap-3">
                    <SafeImage
                        src={selected.avatar_url ?? undefined}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full object-cover"
                        fallback={
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-t-sm font-bold text-ink-subtle">
                                {(selected.full_name ?? '?').charAt(0)}
                            </span>
                        }
                    />
                    <div className="min-w-0">
                        <h1 className="truncate text-t-xl font-black uppercase tracking-display text-ink md:text-t-2xl">
                            {selected.full_name ?? 'Atleta'}
                        </h1>
                        <p className="text-t-xs text-ink-subtle">Plan nutricional</p>
                    </div>
                </header>

                <NutritionPlanEditor athleteId={selected.id} />
            </div>
        );
    }

    // ---------------------------------------------------------------
    // LISTA
    // ---------------------------------------------------------------
    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 pb-24 md:px-8 md:py-10">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="flex items-center gap-2.5 text-t-2xl font-black uppercase tracking-display text-ink md:text-t-3xl">
                        <Apple size={26} className="shrink-0 text-brand-text" aria-hidden="true" />
                        Dietas
                    </h1>
                    <p className="mt-1.5 text-t-sm text-ink-muted">
                        Elige un atleta para pautar o revisar su plan nutricional.
                    </p>
                </div>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 rounded-field px-2 py-1.5 text-t-sm font-semibold text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                        <ArrowLeft size={16} aria-hidden="true" />
                        Volver
                    </button>
                )}
            </header>

            {/* El permiso se explica, no se esconde. Ver la cabecera. */}
            {!puedePautar && (
                <div className="flex items-start gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-field bg-[var(--warning-quiet)]">
                        <Lock size={15} className="text-warning" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-t-sm font-bold text-ink">Solo lectura</p>
                        <p className="mt-0.5 text-t-xs leading-relaxed text-ink-subtle">
                            Para crear y editar planes hace falta el rol de <strong className="font-semibold text-ink-muted">Nutricionista</strong>.
                            Puedes añadírtelo desde Mi perfil → Roles. Mientras tanto puedes consultar
                            lo que tengan pautado tus atletas.
                        </p>
                    </div>
                </div>
            )}

            <div className="relative">
                <Search
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
                />
                <input
                    type="search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar atleta"
                    aria-label="Buscar atleta"
                    className="w-full rounded-field border border-[var(--border-default)] bg-surface-raised py-3 pl-11 pr-4 text-t-sm text-ink transition-colors duration-fast ease-snap placeholder:text-ink-subtle focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
            </div>

            <EstadoDeDatos
                consulta={{ isLoading: loading, isError: !!error, error, refetch }}
                queEs="que.atletas"
                vacio={visibles.length === 0}
                esqueleto={<SkeletonList filas={6} />}
                vacioIcono={<Apple size={20} aria-hidden="true" />}
                vacioTitulo={buscando ? 'Ningún atleta coincide' : 'Todavía no tienes atletas'}
                vacioCuerpo={
                    buscando
                        ? `No hay nadie que se llame «${search.trim()}».`
                        : 'Cuando tengas atletas en tu equipo aparecerán aquí para poder pautarles la dieta.'
                }
                vacioAccion={
                    buscando && (
                        <button
                            onClick={() => setSearch('')}
                            className="rounded-field border border-[var(--border-default)] px-4 py-2.5 text-t-xs font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                            Quitar el filtro
                        </button>
                    )
                }
            >
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {visibles.map(athlete => {
                        const plan = planStatus.data?.get(athlete.id);
                        return (
                            <li key={athlete.id} className="min-w-0">
                                <button
                                    onClick={() => setSelected(athlete)}
                                    className="group flex w-full min-w-0 items-center gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-4 text-left transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                >
                                    <SafeImage
                                        src={athlete.avatar_url ?? undefined}
                                        alt=""
                                        className="h-11 w-11 shrink-0 rounded-full object-cover"
                                        fallback={
                                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-t-sm font-bold text-ink-subtle">
                                                {(athlete.full_name ?? '?').charAt(0)}
                                            </span>
                                        }
                                    />

                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-t-sm font-bold text-ink">
                                            {athlete.full_name ?? 'Atleta'}
                                        </span>
                                        {/* Tres estados distintos y no dos: "no se
                                            sabe todavía" no es lo mismo que "no
                                            tiene plan". */}
                                        <span className="mt-0.5 flex items-center gap-1.5 text-t-xs text-ink-subtle">
                                            {planStatus.isLoading ? (
                                                'Comprobando…'
                                            ) : plan ? (
                                                <>
                                                    <Check size={12} className="shrink-0 text-success" aria-hidden="true" />
                                                    {plan.calories ? `${plan.calories} kcal` : 'Plan activo'}
                                                </>
                                            ) : (
                                                'Sin plan'
                                            )}
                                        </span>
                                    </span>

                                    <ChevronRight
                                        size={16}
                                        aria-hidden="true"
                                        className="shrink-0 text-ink-faint transition-transform duration-fast ease-snap group-hover:translate-x-0.5"
                                    />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </EstadoDeDatos>
        </div>
    );
}
