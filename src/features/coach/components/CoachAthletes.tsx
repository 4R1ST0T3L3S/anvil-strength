import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Search, MessageSquare, ArrowLeft, UserPlus, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { InviteAthleteModal } from './InviteAthleteModal';
import { DangerConfirmModal } from '../../../components/modals/DangerConfirmModal';
import { invitesService } from '../../../services/invitesService';
import { Skeleton } from '../../../components/ui/Skeleton';
import { SafeImage } from '../../../components/ui/SafeImage';
import { getWeekNumber } from '../../../utils/dateUtils';
import { trainingService, type AthleteAdherence } from '../../../services/trainingService';
import { stagger } from '../../../lib/motion';
import {
    daysSince,
    activityLabel,
    activityTone,
    adherenceRatio,
    ATTENTION_THRESHOLDS,
} from '../lib/athleteSignals';

interface CoachAthletesProps {
    user: UserProfile;
    onSelectAthlete: (id: string) => void;
    onOpenChat: (athlete: { id: string; full_name: string; avatar_url?: string }) => void;
    onBack?: () => void;
}

export interface AthleteWithPlan extends UserProfile {
    active_plan_name?: string;
    current_block_week?: number | string;
    adherence?: AthleteAdherence;
}

/**
 * Filtros de la lista.
 *
 * No son categorías abstractas: cada uno responde a una pregunta que un
 * entrenador se hace de verdad al abrir la pantalla. "Sin plan" es trabajo
 * pendiente suyo; "sin entrenar" y "flojos" son atletas a los que escribir.
 */
const FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'inactive', label: 'Sin entrenar' },
    { key: 'lowAdherence', label: 'Flojos' },
    { key: 'noPlan', label: 'Sin plan' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const SORTS = [
    { key: 'attention', label: 'Los que necesitan atención' },
    { key: 'name', label: 'Nombre' },
    { key: 'adherence', label: 'Menos constantes' },
] as const;

type SortKey = (typeof SORTS)[number]['key'];

export function CoachAthletes({ user, onSelectAthlete, onOpenChat, onBack }: CoachAthletesProps) {
    const [athletes, setAthletes] = useState<AthleteWithPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');
    const [sort, setSort] = useState<SortKey>('attention');
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [athleteToRemove, setAthleteToRemove] = useState<AthleteWithPlan | null>(null);
    const [removing, setRemoving] = useState(false);

    const handleRemove = async () => {
        if (!athleteToRemove) return;
        setRemoving(true);
        try {
            await invitesService.unlinkAthlete(user.id, athleteToRemove.id);
            setAthletes(prev => prev.filter(a => a.id !== athleteToRemove.id));
            toast.success(`${athleteToRemove.full_name} ya no está en tu equipo`);
            setAthleteToRemove(null);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo sacar del equipo.');
        } finally {
            setRemoving(false);
        }
    };

    useEffect(() => {
        let alive = true;

        const fetchAthletes = async () => {
            try {
                const { data: links, error: linksError } = await supabase
                    .from('coach_athletes')
                    .select('athlete_id')
                    .eq('coach_id', user.id);

                if (linksError) throw linksError;

                const athleteIds = links?.map((l: { athlete_id: string }) => l.athlete_id) || [];

                if (athleteIds.length === 0) {
                    if (alive) { setAthletes([]); setLoading(false); }
                    return;
                }

                const { data: profiles, error: profilesError } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', athleteIds)
                    .order('full_name', { ascending: true });

                if (profilesError) throw profilesError;

                const { data: blocks, error: blocksError } = await supabase
                    .from('training_blocks')
                    .select('athlete_id, name, start_week, end_week, is_active, created_at')
                    .in('athlete_id', athleteIds)
                    .order('created_at', { ascending: false });

                if (blocksError) console.error('Error fetching blocks:', blocksError);

                // La constancia se pide para TODO el equipo de una vez. Atleta
                // por atleta serían N+1 consultas y con veinte atletas la lista
                // tardaría segundos en aparecer.
                const adherence: Record<string, AthleteAdherence> = await trainingService
                    .getTeamAdherence(athleteIds)
                    .catch(err => { console.error('Error cargando adherencia:', err); return {}; });

                const currentWeek = getWeekNumber(new Date());

                const merged = (profiles ?? []).map(profile => {
                    const athleteBlocks = blocks?.filter(b => b.athlete_id === profile.id) || [];

                    const covers = (b: { start_week?: number | null; end_week?: number | null }) =>
                        (b.start_week || 0) <= currentWeek && (b.end_week || 53) >= currentWeek;

                    const activeBlock =
                        athleteBlocks.find(b => b.is_active && covers(b)) ??
                        athleteBlocks.find(covers) ??
                        athleteBlocks.find(b => b.is_active);

                    let blockWeek: number | string | undefined;
                    if (activeBlock?.start_week) {
                        if (currentWeek >= activeBlock.start_week && currentWeek <= (activeBlock.end_week || 53)) {
                            blockWeek = currentWeek - activeBlock.start_week + 1;
                        } else if (currentWeek < activeBlock.start_week) {
                            blockWeek = 'Pre';
                        } else {
                            blockWeek = 'Fin';
                        }
                    }

                    return {
                        ...profile,
                        active_plan_name: activeBlock?.name,
                        current_block_week: blockWeek,
                        adherence: adherence[profile.id],
                    };
                });

                if (alive) setAthletes(merged);
            } catch (err) {
                console.error('Error fetching athletes:', err);
            } finally {
                if (alive) setLoading(false);
            }
        };

        fetchAthletes();
        return () => { alive = false; };
    }, [user.id]);

    const visible = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();

        const matchesSearch = (a: AthleteWithPlan) =>
            !term ||
            (a.full_name?.toLowerCase() ?? '').includes(term) ||
            (a.nickname?.toLowerCase() ?? '').includes(term);

        const matchesFilter = (a: AthleteWithPlan) => {
            const days = daysSince(a.adherence?.lastCompletedAt);
            switch (filter) {
                case 'inactive':
                    return days === null || days >= ATTENTION_THRESHOLDS.inactiveDays;
                case 'lowAdherence': {
                    const ratio = adherenceRatio(a.adherence);
                    return ratio !== null && ratio < ATTENTION_THRESHOLDS.lowAdherence;
                }
                case 'noPlan':
                    return !a.active_plan_name;
                default:
                    return true;
            }
        };

        const list = athletes.filter(a => matchesSearch(a) && matchesFilter(a));

        // Un orden por defecto que no sea alfabético es la diferencia entre
        // una lista y una herramienta: lo primero que ve el coach son los
        // atletas de los que tiene que ocuparse hoy.
        const attentionScore = (a: AthleteWithPlan) => {
            const days = daysSince(a.adherence?.lastCompletedAt);
            const ratio = adherenceRatio(a.adherence);
            let score = 0;
            if (!a.active_plan_name) score += 100;
            if (days === null) score += 60;
            else score += Math.min(days, 30) * 2;
            if (ratio !== null && ratio < ATTENTION_THRESHOLDS.lowAdherence) score += 40;
            return score;
        };

        const byName = (a: AthleteWithPlan, b: AthleteWithPlan) =>
            (a.full_name ?? '').localeCompare(b.full_name ?? '', 'es');

        return [...list].sort((a, b) => {
            if (sort === 'name') return byName(a, b);
            if (sort === 'adherence') {
                return (adherenceRatio(a) ?? 2) - (adherenceRatio(b) ?? 2) || byName(a, b);
            }
            return attentionScore(b) - attentionScore(a) || byName(a, b);
        });
    }, [athletes, searchTerm, filter, sort]);

    if (loading) return <AthletesSkeleton />;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
            <header className="mb-6">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="mb-3 flex items-center gap-1.5 text-t-xs font-bold uppercase tracking-wide text-ink-subtle transition-colors duration-fast hover:text-ink"
                    >
                        <ArrowLeft size={14} aria-hidden="true" />
                        Volver
                    </button>
                )}
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-t-3xl font-black uppercase tracking-display text-ink">Mis atletas</h1>
                        <p className="mt-1 text-t-sm text-ink-muted">
                            {athletes.length} en el equipo
                        </p>
                    </div>

                    {/* Dar de alta a un atleta solo se podía hacer entrando a
                        la base de datos a mano. Esto es lo que lo convierte en
                        algo que el coach hace solo, desde su móvil. */}
                    <button
                        onClick={() => setIsInviteOpen(true)}
                        className="flex items-center gap-2 rounded-field bg-brand px-4 py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover"
                    >
                        <UserPlus size={16} aria-hidden="true" />
                        Invitar atleta
                    </button>
                </div>
            </header>

            <InviteAthleteModal
                open={isInviteOpen}
                onClose={() => setIsInviteOpen(false)}
                coachId={user.id}
            />

            <DangerConfirmModal
                key={athleteToRemove?.id ?? 'sin-atleta'}
                open={athleteToRemove !== null}
                onClose={() => setAthleteToRemove(null)}
                onConfirm={handleRemove}
                working={removing}
                title="Sacar del equipo"
                confirmLabel="Sacar del equipo"
                description={
                    <>
                        <strong className="font-bold">{athleteToRemove?.full_name}</strong> dejará de
                        aparecer en tu lista, en el chat y en tu panel. Tú dejarás de ver su
                        entrenamiento y él dejará de verte a ti.
                        {/* Se dice EXPLÍCITAMENTE qué NO se borra. Un botón que
                            pone "eliminar" hace pensar que se pierde todo, y esa
                            duda es la que hace que nadie lo use nunca. */}
                        <span className="mt-2 block text-t-xs text-ink-muted">
                            No se borra su cuenta ni su historial de entrenamiento. Si vuelve a
                            entrar con una invitación tuya, lo recuperas todo tal y como estaba.
                        </span>
                    </>
                }
            />

            {/* Búsqueda, filtros y orden. Antes solo existía la búsqueda por
                nombre, que sirve cuando ya sabes a quién buscas — es decir,
                nunca al abrir la pantalla. */}
            <div className="mb-5 space-y-3">
                <div className="relative">
                    <Search
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                        size={16}
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        placeholder="Buscar atleta…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-field border border-subtle bg-surface-raised py-2.5 pl-9 pr-3 text-t-sm text-ink outline-none transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1.5">
                        {FILTERS.map(({ key, label }) => {
                            const active = filter === key;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setFilter(key)}
                                    aria-pressed={active}
                                    className={`relative rounded-pill px-3 py-1.5 text-t-xs font-bold transition-colors duration-fast ease-snap active:scale-[0.97] ${
                                        active ? 'text-brand-ink' : 'text-ink-muted hover:text-ink'
                                    }`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="athlete-filter-pill"
                                            className="absolute inset-0 rounded-pill bg-brand"
                                            transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                                        />
                                    )}
                                    <span className="relative">{label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        aria-label="Ordenar la lista"
                        className="ml-auto rounded-field border border-subtle bg-surface-raised px-2.5 py-1.5 text-t-xs font-semibold text-ink-muted outline-none transition-colors duration-fast focus:border-brand"
                    >
                        {SORTS.map(({ key, label }) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {visible.length === 0 ? (
                <EmptyList
                    hasAthletes={athletes.length > 0}
                    onClear={() => { setFilter('all'); setSearchTerm(''); }}
                    onInvite={() => setIsInviteOpen(true)}
                />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map((athlete, index) => (
                        <AthleteCard
                            key={athlete.id}
                            athlete={athlete}
                            index={index}
                            onSelect={() => onSelectAthlete(athlete.id)}
                            onChat={() => onOpenChat({
                                id: athlete.id,
                                full_name: athlete.full_name || '',
                                avatar_url: athlete.avatar_url,
                            })}
                            onRemove={() => setAthleteToRemove(athlete)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Ficha de un atleta.
 *
 * Lo que cambia respecto a la anterior: las dos primeras cosas que se leen
 * ya no son la categoría de peso y los récords, sino CUÁNDO entrenó por
 * última vez y CUÁNTO está cumpliendo. Los récords siguen ahí abajo, pero
 * son el dato de consulta, no el titular — un coach con veinte atletas no
 * abre esta pantalla para recordar cuánto levanta cada uno.
 */
function AthleteCard({
    athlete,
    index,
    onSelect,
    onChat,
    onRemove,
}: {
    athlete: AthleteWithPlan;
    index: number;
    onSelect: () => void;
    onChat: () => void;
    onRemove: () => void;
}) {
    const days = daysSince(athlete.adherence?.lastCompletedAt);
    const tone = activityTone(days);
    const ratio = adherenceRatio(athlete.adherence);

    const toneClass = {
        good: 'bg-success',
        warn: 'bg-warning',
        bad: 'bg-danger',
        none: 'bg-[var(--ink-faint)]',
    }[tone];

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(index)}
        >
            <div
                role="button"
                tabIndex={0}
                onClick={onSelect}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
                className="group cursor-pointer rounded-card border border-[var(--border-default)] bg-surface-raised p-4 transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay focus:outline-none focus-visible:border-brand"
            >
                <div className="flex items-start gap-3">
                    {athlete.avatar_url ? (
                        <SafeImage
                            src={athlete.avatar_url}
                            alt={athlete.full_name}
                            className="h-11 w-11 shrink-0 rounded-pill object-cover"
                        />
                    ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-t-base font-black text-ink-muted">
                            {athlete.full_name?.[0]?.toUpperCase() ?? 'A'}
                        </span>
                    )}

                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-t-base font-bold leading-tight text-ink">
                            {athlete.full_name}
                        </h3>

                        {/* EL TITULAR: cuándo entrenó por última vez. */}
                        <p className="mt-1 flex items-center gap-1.5 text-t-xs text-ink-muted">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${toneClass}`} aria-hidden="true" />
                            {activityLabel(days)}
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center">
                        <button
                            onClick={(e) => { e.stopPropagation(); onChat(); }}
                            aria-label={`Escribir a ${athlete.full_name}`}
                            className="rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-surface-sunken hover:text-ink"
                        >
                            <MessageSquare size={16} aria-hidden="true" />
                        </button>

                        {/* Sacar del equipo. Aparece al pasar por encima de la
                            tarjeta y no siempre: es la única acción destructiva
                            de la lista y no tiene por qué competir por atención
                            con el resto en cada una de las veinte fichas.
                            En táctil no hay hover, así que ahí se ve siempre. */}
                        <button
                            onClick={(e) => { e.stopPropagation(); onRemove(); }}
                            aria-label={`Sacar a ${athlete.full_name} del equipo`}
                            title="Sacar del equipo"
                            className="rounded-field p-2 text-ink-faint opacity-100 transition-all duration-fast ease-snap hover:bg-[var(--danger-quiet)] hover:text-danger [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                        >
                            <UserMinus size={16} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Constancia. Sin días vencidos todavía no se pinta: un atleta
                    que empieza el bloque el lunes no está al 0%, está a cero
                    días de haber empezado, y enseñarle un 0% al coach es
                    directamente información falsa. */}
                {ratio !== null && (
                    <div className="mt-3.5">
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                            <span className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                Constancia
                            </span>
                            <span className="text-t-xs font-bold tabular-nums text-ink">
                                {athlete.adherence!.completedSessions}/{athlete.adherence!.dueSessions}
                                <span className="ml-1 font-semibold text-ink-subtle">
                                    ({Math.round(ratio * 100)}%)
                                </span>
                            </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-pill bg-surface-sunken">
                            <div
                                className={`h-full rounded-pill ${
                                    ratio >= 0.85 ? 'bg-success' : ratio >= ATTENTION_THRESHOLDS.lowAdherence ? 'bg-warning' : 'bg-danger'
                                }`}
                                style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-subtle pt-3">
                    <p className={`min-w-0 truncate text-t-xs font-semibold ${athlete.active_plan_name ? 'text-ink-muted' : 'text-warning'}`}>
                        {athlete.active_plan_name ?? 'Sin plan activo'}
                    </p>
                    {athlete.active_plan_name && athlete.current_block_week && (
                        <span className="shrink-0 rounded-chip bg-surface-sunken px-1.5 py-0.5 text-t-2xs font-bold text-ink-muted">
                            {typeof athlete.current_block_week === 'number'
                                ? `Sem ${athlete.current_block_week}`
                                : athlete.current_block_week}
                        </span>
                    )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {([['SQ', athlete.squat_pr], ['BP', athlete.bench_pr], ['DL', athlete.deadlift_pr]] as const).map(
                        ([label, value]) => (
                            <div key={label}>
                                <p className="text-t-2xs font-bold uppercase tracking-widest text-ink-faint">{label}</p>
                                <p className="text-t-sm font-bold tabular-nums text-ink-muted">{value || '—'}</p>
                            </div>
                        )
                    )}
                </div>
            </div>
        </motion.div>
    );
}

function EmptyList({
    hasAthletes,
    onClear,
    onInvite,
}: {
    hasAthletes: boolean;
    onClear: () => void;
    onInvite: () => void;
}) {
    return (
        <div className="rounded-card border border-dashed border-[var(--border-default)] px-6 py-14 text-center">
            <p className="text-t-base font-bold text-ink">
                {hasAthletes ? 'Ningún atleta encaja con el filtro' : 'Todavía no tienes atletas'}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-t-sm text-ink-muted">
                {hasAthletes
                    ? 'Puede ser buena señal: si buscabas a los que llevan días sin entrenar y no hay ninguno, el equipo está al día.'
                    : 'Comparte un enlace de invitación y se unirán solos, sin que tengas que dar de alta a nadie a mano.'}
            </p>

            {/* Un estado vacío que solo dice "no hay nada" no sirve de nada:
                enseña cuál es el primer paso. */}
            {hasAthletes ? (
                <button
                    onClick={onClear}
                    className="mt-4 rounded-field border border-subtle px-4 py-2 text-t-sm font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
                >
                    Ver todos
                </button>
            ) : (
                <button
                    onClick={onInvite}
                    className="mt-5 inline-flex items-center gap-2 rounded-field bg-brand px-5 py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover"
                >
                    <UserPlus size={16} aria-hidden="true" />
                    Invitar a tu primer atleta
                </button>
            )}
        </div>
    );
}

function AthletesSkeleton() {
    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="mt-2 h-4 w-32" />
            <Skeleton className="mt-6 h-10 w-full rounded-field" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-11 w-11 rounded-pill" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        </div>
                        <Skeleton className="mt-4 h-1 w-full" />
                        <Skeleton className="mt-4 h-3 w-1/2" />
                    </div>
                ))}
            </div>
        </div>
    );
}
