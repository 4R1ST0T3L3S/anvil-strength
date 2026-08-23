import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Search, MessageSquare, ArrowLeft, UserPlus, UserMinus, Mail, Link2, Loader, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { InviteAthleteModal } from './InviteAthleteModal';
import { RemoveAthleteModal } from './RemoveAthleteModal';
import { athletesService, ACCOUNT_STATUS_LABEL, hasAccount } from '../../../services/athletesService';
import { fetchRosterIds, useCoachRoster, rosterQueryKey, type RosterAthlete } from '../hooks/useCoachRoster';
import { AddAthleteModal } from './AddAthleteModal';
import { Modal } from '../../../components/ui/Modal';
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
    /** Correo real del atleta. NULL mientras no se tenga ninguno. */
    contact_email?: string | null;
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
    /**
     * Los que se fueron. Va el ÚLTIMO y separado del resto porque no es un
     * filtro sobre la misma lista: cambia de qué lista se habla —de las
     * relaciones vivas a las cerradas—, y por eso trae su propia consulta y
     * sus propias acciones.
     *
     * Existe porque sin él "archivar" perdería gente: se puede archivar a un
     * atleta y no habría ninguna pantalla desde la que traerlo de vuelta.
     */
    { key: 'archived', label: 'Archivados' },
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
    const [isAddOpen, setIsAddOpen] = useState(false);
    /** Fuerza a recargar la lista tras dar de alta a alguien. */
    const [reloadKey, setReloadKey] = useState(0);
    const [athleteToRemove, setAthleteToRemove] = useState<AthleteWithPlan | null>(null);
    const [athleteToInvite, setAthleteToInvite] = useState<AthleteWithPlan | null>(null);
    const [copyingLinkFor, setCopyingLinkFor] = useState<string | null>(null);
    const [reactivating, setReactivating] = useState<string | null>(null);
    const queryClient = useQueryClient();

    /**
     * Los archivados y los que se fueron. `enabled` los pide solo cuando se
     * mira esa pestaña: es la lista que menos se abre y no tiene por qué
     * costar una consulta en cada visita a "Atletas".
     */
    const { athletes: pasados, loading: cargandoPasados } = useCoachRoster(user.id, {
        scope: 'inactive',
        enabled: filter === 'archived',
    });

    /** Devuelve a alguien al equipo. Deshace tanto archivar como sacar. */
    const handleReactivate = async (athlete: RosterAthlete) => {
        setReactivating(athlete.id);
        try {
            await athletesService.setRelationStatus(athlete.id, 'active');
            toast.success(`${athlete.full_name ?? 'El atleta'} vuelve a tu equipo`);
            // Las DOS listas cambian: sale de una y entra en la otra.
            queryClient.invalidateQueries({ queryKey: rosterQueryKey(user.id, 'inactive') });
            queryClient.invalidateQueries({ queryKey: rosterQueryKey(user.id, 'active') });
            setReloadKey(k => k + 1);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo reactivar.');
        } finally {
            setReactivating(null);
        }
    };

    /**
     * ALTERNATIVA AL CORREO: un enlace que se copia y se manda por donde
     * quiera. `onInvite` (el sobre) sigue existiendo para quien prefiere
     * mandarlo por email; esto es para cuando el atleta no va a mirar el
     * correo, o el coach prefiere pasárselo en persona o por WhatsApp.
     */
    const handleCopyClaimLink = async (athlete: AthleteWithPlan) => {
        setCopyingLinkFor(athlete.id);
        try {
            const { url } = await athletesService.createClaimLink(athlete.id);
            await navigator.clipboard.writeText(url);
            toast.success(`Enlace de acceso de ${athlete.full_name} copiado`);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo crear el enlace.');
        } finally {
            setCopyingLinkFor(null);
        }
    };

    /**
     * Qué hacer DESPUÉS de archivar, sacar del equipo o borrar.
     *
     * Los tres niveles y sus confirmaciones viven en `RemoveAthleteModal`; lo
     * único que le queda a la lista es quitar la tarjeta. Se quita en local en
     * vez de recargar la lista entera: el cambio ya está hecho en el servidor
     * y volver a pedirlo todo haría parpadear las veinte fichas para borrar una.
     */
    const handleRemoved = (athleteId: string) => {
        setAthletes(prev => prev.filter(a => a.id !== athleteId));
    };

    useEffect(() => {
        let alive = true;

        const fetchAthletes = async () => {
            try {
                // Solo las relaciones VIVAS. Las cerradas y las archivadas
                // siguen en la tabla —son el histórico— y sin este filtro la
                // lista iría creciendo con gente que ya no se entrena aquí.
                // El filtro vive en la puerta única, no aquí: ver
                // src/features/coach/hooks/useCoachRoster.ts.
                const athleteIds = await fetchRosterIds(user.id, 'active');

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
    }, [user.id, reloadKey]);

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
                // 'archived' no se filtra aquí: es otra lista entera, con su
                // propia consulta. Ver el bloque de render de más abajo.
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

                    {/* DOS CAMINOS, Y EL ORDEN IMPORTA.
                        "Nuevo atleta" es la acción principal porque no depende
                        de nadie: el coach da de alta y programa. El enlace de
                        invitación exige que la otra persona haga algo, así que
                        es la secundaria aunque sea la que existía antes. */}
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            onClick={() => setIsInviteOpen(true)}
                            className="flex items-center gap-2 rounded-field border border-[var(--border-default)] px-3 py-2.5 text-t-sm font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
                        >
                            <Link2 size={16} aria-hidden="true" />
                            <span className="hidden sm:inline">Enlace</span>
                        </button>

                        <button
                            onClick={() => setIsAddOpen(true)}
                            className="flex items-center gap-2 rounded-field bg-brand px-4 py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover"
                        >
                            <UserPlus size={16} aria-hidden="true" />
                            Nuevo atleta
                        </button>
                    </div>
                </div>
            </header>

            <InviteAthleteModal
                open={isInviteOpen}
                onClose={() => setIsInviteOpen(false)}
                coachId={user.id}
            />

            <AddAthleteModal
                key={isAddOpen ? 'alta-abierta' : 'alta-cerrada'}
                open={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onCreated={() => setReloadKey(k => k + 1)}
            />

            <SendAccessModal
                key={athleteToInvite?.id ?? 'sin-atleta'}
                athlete={athleteToInvite}
                onClose={() => setAthleteToInvite(null)}
                onSent={() => { setAthleteToInvite(null); setReloadKey(k => k + 1); }}
            />

            <RemoveAthleteModal
                open={athleteToRemove !== null}
                onClose={() => setAthleteToRemove(null)}
                athlete={athleteToRemove}
                onDone={() => {
                    if (athleteToRemove) handleRemoved(athleteToRemove.id);
                    setAthleteToRemove(null);
                }}
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
                        className="w-full rounded-field border border-subtle bg-surface-raised py-2.5 pl-9 pr-3 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
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
                        className="ml-auto rounded-field border border-subtle bg-surface-raised px-2.5 py-1.5 text-t-xs font-semibold text-ink-muted transition-colors duration-fast focus:border-brand"
                    >
                        {SORTS.map(({ key, label }) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {filter === 'archived' ? (
                <ArchivedList
                    athletes={pasados}
                    loading={cargandoPasados}
                    searchTerm={searchTerm}
                    reactivatingId={reactivating}
                    onReactivate={handleReactivate}
                    onBackToTeam={() => setFilter('all')}
                />
            ) : visible.length === 0 ? (
                <EmptyList
                    hasAthletes={athletes.length > 0}
                    onClear={() => { setFilter('all'); setSearchTerm(''); }}
                    onInvite={() => setIsInviteOpen(true)}
                />
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                            onInvite={() => setAthleteToInvite(athlete)}
                            onCopyClaimLink={() => handleCopyClaimLink(athlete)}
                            copyingClaimLink={copyingLinkFor === athlete.id}
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
    onInvite,
    onCopyClaimLink,
    copyingClaimLink,
}: {
    athlete: AthleteWithPlan;
    index: number;
    onSelect: () => void;
    onChat: () => void;
    onRemove: () => void;
    /** Pide mandarle el acceso a la app. El diálogo lo abre la lista. */
    onInvite: () => void;
    /** Copia un enlace de reclamación (email + contraseña) al portapapeles. */
    onCopyClaimLink: () => void;
    copyingClaimLink: boolean;
}) {
    const days = daysSince(athlete.adherence?.lastCompletedAt);
    /**
     * Un atleta sin cuenta no recibe mensajes, ni avisos, ni check-ins.
     * Ofrecerle al coach un botón de chat que no va a llegar a ninguna parte
     * es peor que no ofrecerlo: parece que se ha enviado algo.
     */
    const online = hasAccount(athlete.account_status);
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
                className="group cursor-pointer rounded-card border border-[var(--border-default)] bg-surface-raised p-4 transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay focus-visible:border-brand"
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
                        <h3 className="flex items-center gap-2 text-t-base font-bold leading-tight text-ink">
                            <span className="truncate">{athlete.full_name}</span>

                            {/* SIN CUENTA / INVITADO.
                                Va junto al nombre y no abajo del todo porque
                                cambia lo que el coach puede esperar de esa
                                persona: no va a registrar series, no va a
                                contestar el chat y su constancia siempre será
                                cero. Sin este distintivo, la tarjeta parecería
                                la de un atleta que ha dejado de entrenar. */}
                            {!online && (
                                <span className="shrink-0 rounded-chip bg-surface-sunken px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                                    {ACCOUNT_STATUS_LABEL[athlete.account_status ?? 'active']}
                                </span>
                            )}
                        </h3>

                        {/* EL TITULAR: cuándo entrenó por última vez. Para
                            quien no tiene cuenta, "hace 0 días" no significa
                            nada: lo que hay que decirle al coach es qué le
                            falta a esa ficha para estar completa. */}
                        {online ? (
                            <p className="mt-1 flex items-center gap-1.5 text-t-xs text-ink-muted">
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${toneClass}`} aria-hidden="true" />
                                {activityLabel(days)}
                            </p>
                        ) : (
                            <p className="mt-1 text-t-xs text-ink-subtle">
                                {athlete.account_status === 'invited'
                                    ? 'Acceso enviado, aún sin entrar'
                                    : 'Le programas y le mandas el PDF'}
                            </p>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center">
                        {online ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); onChat(); }}
                                aria-label={`Escribir a ${athlete.full_name}`}
                                className="rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-surface-sunken hover:text-ink"
                            >
                                <MessageSquare size={16} aria-hidden="true" />
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onInvite(); }}
                                    aria-label={`Enviar el acceso por correo a ${athlete.full_name}`}
                                    title="Mandarle el acceso por correo"
                                    className="rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-[var(--brand-quiet)] hover:text-brand disabled:opacity-40"
                                >
                                    <Mail size={16} aria-hidden="true" />
                                </button>
                                {/* Alternativa al correo: copia un enlace para
                                    mandarlo por donde quiera (WhatsApp, en
                                    persona). El atleta pone su propio email y
                                    contraseña al abrirlo. */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onCopyClaimLink(); }}
                                    disabled={copyingClaimLink}
                                    aria-label={`Copiar enlace de acceso de ${athlete.full_name}`}
                                    title="Copiar enlace de acceso"
                                    className="rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-[var(--brand-quiet)] hover:text-brand disabled:opacity-40"
                                >
                                    {copyingClaimLink
                                        ? <Loader size={16} className="animate-spin" aria-hidden="true" />
                                        : <Link2 size={16} aria-hidden="true" />}
                                </button>
                            </>
                        )}

                        {/* Quitar del equipo: abre las tres opciones
                            (archivar, sacar, borrar la ficha). Aparece al pasar
                            por encima de la tarjeta y no siempre: es la única
                            acción destructiva de la lista y no tiene por qué
                            competir por atención con el resto en cada una de las
                            veinte fichas. En táctil no hay hover, así que ahí se
                            ve siempre. */}
                        <button
                            onClick={(e) => { e.stopPropagation(); onRemove(); }}
                            aria-label={`Quitar a ${athlete.full_name} del equipo`}
                            title="Quitar del equipo"
                            className="rounded-field p-2 text-ink-faint opacity-100 transition-colors duration-fast ease-snap hover:bg-[var(--danger-quiet)] hover:text-danger [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
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
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

/**
 * ENVIAR EL ACCESO A UN ATLETA GESTIONADO
 *
 * QUÉ MANDA, EXACTAMENTE
 *
 * Un enlace a la cuenta que ese atleta YA TIENE. No se le crea nada nuevo:
 * la ficha existe desde que su entrenador la dio de alta, con sus bloques y
 * su historial dentro, y este correo es lo único que faltaba para que su
 * dueño pudiera entrar en ella. Por eso reclamarla no fusiona ni migra nada.
 *
 * El correo se pide aquí cuando la ficha se creó sin él —el caso de "solo le
 * mando el PDF"—, que es justo el dato que le falta para poder alcanzarle.
 */
function SendAccessModal({
    athlete,
    onClose,
    onSent,
}: {
    athlete: AthleteWithPlan | null;
    onClose: () => void;
    onSent: () => void;
}) {
    const [email, setEmail] = useState(athlete?.contact_email ?? '');
    const [sending, setSending] = useState(false);

    if (!athlete) return null;

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (sending) return;

        setSending(true);
        try {
            const result = await athletesService.invite(athlete.id, email);
            toast.success(`Acceso enviado a ${result.email}`);
            onSent();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo enviar el acceso');
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal open onClose={onClose} title="Enviar el acceso" size="sm">
            <form onSubmit={handleSend} className="space-y-5">
                <p className="text-t-sm leading-relaxed text-ink-muted">
                    <strong className="font-bold text-ink">{athlete.full_name}</strong> recibirá un
                    enlace para entrar en su ficha. Se encontrará dentro todo lo que ya le has
                    programado: no empieza de cero.
                </p>

                <div className="space-y-1.5">
                    <label htmlFor="acceso-correo" className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                        Correo
                    </label>
                    <div className="relative">
                        <Mail size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                        <input
                            id="acceso-correo"
                            type="email"
                            required
                            autoFocus
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="marta@ejemplo.com"
                            className="h-11 w-full rounded-field border border-subtle bg-surface-sunken pl-9 pr-3 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-field px-4 py-2.5 text-t-sm font-bold text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={sending || !email.includes('@')}
                        className="flex items-center gap-2 rounded-field bg-brand px-5 py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                    >
                        {sending ? <Loader size={15} className="animate-spin" /> : <Mail size={15} />}
                        Enviar
                    </button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * LOS QUE SE FUERON.
 *
 * Lista aparte y deliberadamente sosa: sin constancia, sin plan activo, sin
 * récords. Esa información describe a alguien que entrena AHORA, y aquí no
 * entrena nadie — pintarla invitaría a compararlos con el equipo, que es
 * justo lo que no hay que hacer.
 *
 * Lo único que se ofrece es traerlos de vuelta, porque es lo único que tiene
 * sentido hacer desde aquí. Y existe sobre todo por eso: sin esta pantalla,
 * "archivar" sería una forma de perder gente.
 */
export function ArchivedList({
    athletes,
    loading,
    searchTerm,
    reactivatingId,
    onReactivate,
    onBackToTeam,
}: {
    athletes: RosterAthlete[];
    loading: boolean;
    searchTerm: string;
    reactivatingId: string | null;
    onReactivate: (a: RosterAthlete) => void;
    onBackToTeam: () => void;
}) {
    const term = searchTerm.trim().toLowerCase();
    const visible = term
        ? athletes.filter(a => (a.full_name?.toLowerCase() ?? '').includes(term))
        : athletes;

    if (loading) {
        return (
            <div className="space-y-2">
                <Skeleton className="h-16 w-full rounded-card" />
                <Skeleton className="h-16 w-full rounded-card" />
            </div>
        );
    }

    if (visible.length === 0) {
        return (
            <div className="rounded-card border border-[var(--border-default)] bg-surface-raised px-5 py-10 text-center">
                <Archive size={22} className="mx-auto mb-3 text-ink-faint" aria-hidden="true" />
                <p className="text-t-sm font-bold text-ink">
                    {term ? 'Nadie con ese nombre' : 'No has archivado a nadie'}
                </p>
                <p className="mx-auto mt-1.5 max-w-sm text-t-xs leading-relaxed text-ink-subtle">
                    {term
                        ? 'Prueba con otro nombre.'
                        : 'Aquí aparecen los atletas que archivas o sacas del equipo. Se conservan enteros y puedes traerlos de vuelta cuando quieras.'}
                </p>
                <button
                    onClick={onBackToTeam}
                    className="mt-4 rounded-field border border-subtle px-4 py-2 text-t-xs font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
                >
                    Volver al equipo
                </button>
            </div>
        );
    }

    return (
        <ul className="space-y-2">
            {visible.map((athlete, index) => {
                const trabajando = reactivatingId === athlete.id;
                // Se dice CUÁNDO se fue: "hace ocho meses" y "la semana
                // pasada" son dos decisiones distintas sobre la misma persona.
                const desde = athlete.endedAt ?? athlete.startedAt;
                const cuando = desde
                    ? new Date(desde).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                    : null;

                return (
                    <motion.li
                        key={athlete.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={stagger(index)}
                        className="flex items-center gap-3.5 rounded-card border border-[var(--border-default)] bg-surface-raised p-3.5"
                    >
                        <SafeImage
                            src={athlete.avatar_url}
                            alt=""
                            // Atenuado: es un dato del pasado y se lee como tal.
                            className="h-10 w-10 shrink-0 rounded-pill object-cover opacity-60"
                            fallback={
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-t-xs font-bold text-ink-faint">
                                    {(athlete.full_name ?? '?').charAt(0).toUpperCase()}
                                </span>
                            }
                        />

                        <div className="min-w-0 flex-1">
                            <p className="truncate text-t-sm font-bold text-ink-muted">
                                {athlete.full_name ?? 'Atleta'}
                            </p>
                            <p className="mt-0.5 truncate text-t-xs text-ink-subtle">
                                {athlete.status === 'archived' ? 'Archivado' : 'Fuera del equipo'}
                                {cuando && ` · desde ${cuando}`}
                            </p>
                        </div>

                        <button
                            onClick={() => onReactivate(athlete)}
                            disabled={trabajando}
                            className="flex shrink-0 items-center gap-1.5 rounded-field border border-subtle px-3 py-2 text-t-xs font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink disabled:opacity-40"
                        >
                            {trabajando
                                ? <Loader size={13} className="animate-spin" aria-hidden="true" />
                                : <RotateCcw size={13} aria-hidden="true" />}
                            Reactivar
                        </button>
                    </motion.li>
                );
            })}
        </ul>
    );
}
