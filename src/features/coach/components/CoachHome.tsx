import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import {
    Users, Trophy, Calendar, Weight, List, Calculator,
    ChevronRight, Swords, Fish, Loader, MessageCircle, Apple,
    BookOpen, Quote, LayoutDashboard, FlaskConical,
} from 'lucide-react';
import { fetchRosterIds } from '../hooks/useCoachRoster';
import { CountdownWidget } from '../../../components/ui/CountdownWidget';
import type { LucideIcon } from 'lucide-react';
import { getAnvilQuote } from '../../../lib/dailyQuotes';
import { OneRMCalculator } from '../../athlete/components/OneRMCalculator';
import { WarmUpCalculator } from '../../athlete/components/WarmUpCalculator';
import { PlateCalculator } from '../../athlete/components/PlateCalculator';
import { SushiCounter } from '../../athlete/components/SushiCounter';
import { AnvilRanking } from '../../athlete/components/AnvilRanking';

interface NextComp {
    name: string;
    date: string;
    days: number;
    level: string;
    location: string;
}

function SectionLabel({ icon: Icon, children, colorClass }: { icon: LucideIcon; children: React.ReactNode; colorClass?: string }) {
    return (
        <h2 className="my-4 flex items-center gap-2 text-t-sm font-bold uppercase tracking-widest text-ink-subtle">
            <Icon size={18} aria-hidden="true" className={colorClass || 'text-ink-faint'} />
            {children}
        </h2>
    );
}

/** Mismo componente y mismo tratamiento que en el inicio del atleta. */
function NavTile({
    icon: Icon,
    title,
    hint,
    onClick,
    customColor,
}: {
    icon: LucideIcon;
    title: string;
    hint: string;
    onClick: () => void;
    customColor: { icon: string; chip: string; ring: string };
}) {
    return (
        <button
            onClick={onClick}
            className={`group relative flex h-full min-h-[110px] xl:min-h-0 w-full flex-col justify-between overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-3 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay active:bg-surface-raised ${customColor.ring}`}
        >
            <Icon
                size={72}
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -top-3 text-ink opacity-[0.04] transition-transform duration-base ease-snap group-hover:scale-110"
            />
            <span className={`flex h-8 w-8 xl:h-7 xl:w-7 shrink-0 items-center justify-center rounded-field ${customColor.chip}`}>
                <Icon size={16} className={customColor.icon} aria-hidden="true" />
            </span>
            <span className="relative mt-1.5 xl:mt-1 flex flex-col min-h-0 overflow-hidden">
                <span className="block text-t-sm xl:text-t-base font-bold leading-tight text-ink truncate">{title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] xl:text-t-xs text-ink-subtle truncate">
                    <span className="truncate">{hint}</span>
                    <ChevronRight size={12} aria-hidden="true" className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                </span>
            </span>
        </button>
    );
}

/**
 * Inicio del entrenador (y del nutricionista: los dos gestionan atletas
 * asignados y ven las mismas herramientas).
 *
 * Mismo armazón de dos columnas que el inicio del atleta y que la versión
 * que Javier subió a `main`: izquierda el contexto (frase + competición),
 * derecha los accesos. La única diferencia con esa versión es la fila de
 * arriba a la izquierda, con "Mis atletas" y "Dietas" — los dos accesos que
 * antes solo vivían en la barra lateral y no tenían atajo desde el inicio.
 */
export function CoachHome({ user, onNavigate, headerActions }: { user: UserProfile; onNavigate: (view: string) => void; headerActions?: ReactNode }) {
    const navigate = useNavigate();

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 14) return 'Buenos días';
        if (hour >= 14 && hour < 21) return 'Buenas tardes';
        return 'Buenas noches';
    };

    const [nextComp, setNextComp] = useState<NextComp | null>(null);
    const [loading, setLoading] = useState(true);
    const [is1RMCalcOpen, setIs1RMCalcOpen] = useState(false);
    const [isWarmUpCalcOpen, setIsWarmUpCalcOpen] = useState(false);
    const [isPlateCalcOpen, setIsPlateCalcOpen] = useState(false);
    const [isSushiCounterOpen, setIsSushiCounterOpen] = useState(false);
    const [isRankingOpen, setIsRankingOpen] = useState(false);

    useEffect(() => {
        let alive = true;

        const fetchStats = async () => {
            try {
                // Solo relaciones VIVAS, igual que CoachAthletes.tsx. Sin este
                // filtro, un atleta desvinculado (`ended`) o archivado seguía
                // sumando aquí aunque ya hubiera desaparecido de la lista.
                // El filtro vive en la puerta única, no aquí: ver
                // src/features/coach/hooks/useCoachRoster.ts.
                const athleteIds = await fetchRosterIds(user.id, 'active');

                if (athleteIds.length === 0) {
                    if (alive) setNextComp(null);
                    return;
                }

                const today = new Date().toISOString().split('T')[0];
                const { data: comp } = await supabase
                    .from('competitions')
                    .select('name, date, end_date, level, location')
                    .in('athlete_id', athleteIds)
                    .or(`date.gte.${today},end_date.gte.${today}`)
                    .order('date', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (!alive) return;

                if (comp) {
                    // Días naturales que faltan. `Math.abs` habría convertido
                    // una competición ya pasada en una futura.
                    const target = new Date(comp.date);
                    target.setHours(0, 0, 0, 0);
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const days = Math.round((target.getTime() - now.getTime()) / 86400000);

                    setNextComp({
                        name: comp.name,
                        date: comp.date,
                        days,
                        level: comp.level || '',
                        location: comp.location || '',
                    });
                } else {
                    setNextComp(null);
                }
            } catch (err) {
                console.error('Error cargando los datos del panel:', err);
            } finally {
                if (alive) setLoading(false);
            }
        };

        fetchStats();
        return () => { alive = false; };
    }, [user.id]);

    const firstName = user.full_name?.split(' ')[0] || 'Entrenador';

    return (
        <>
            <div className="mx-auto flex min-h-full xl:h-[calc(100vh-64px)] w-full max-w-none flex-col px-4 py-4 md:px-8 xl:px-12 xl:py-4 xl:overflow-hidden">
                <header className="mb-4 shrink-0 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-t-xl md:text-t-2xl font-black uppercase tracking-display text-ink">
                            {getGreeting()},{' '}
                            <span className="text-anvil-red">{firstName}</span>
                        </h1>
                        <p className="mt-0.5 flex items-center gap-2 text-t-xs capitalize text-ink-muted">
                            <Calendar size={14} className="text-ink-faint" aria-hidden="true" />
                            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </div>
                    {/* La barra superior del armazón se oculta siempre en
                        móvil (no solo en escritorio, desde el 30 ago 2026),
                        así que estas acciones —avisos, conmutador de panel,
                        cuenta— se pintan aquí en los dos tamaños. */}
                    {headerActions && (
                        <div className="flex items-center gap-1">
                            {headerActions}
                        </div>
                    )}
                </header>

                <div className="flex flex-1 flex-col xl:flex-row gap-4 min-h-0">
                    {/* COLUMNA IZQUIERDA (Principal) */}
                    <div className="flex flex-1 flex-col gap-2 min-w-0 overflow-hidden">
                        {/* NUEVO: "Mis atletas" y "Dietas", el único añadido
                            sobre la versión de Javier. Mismo NavTile denso
                            que el resto de accesos, para que quede igual de
                            espaciado. */}
                        <div className="grid shrink-0 grid-cols-2 gap-2">
                            <NavTile
                                icon={Users}
                                title="Mis atletas"
                                hint="Programación y seguimiento"
                                onClick={() => onNavigate('athletes')}
                                customColor={{ icon: 'text-brand', chip: 'bg-brand/10', ring: 'group-hover:border-brand/50' }}
                            />
                            <NavTile
                                icon={Apple}
                                title="Dietas"
                                hint="Planes nutricionales del equipo"
                                onClick={() => onNavigate('diets')}
                                customColor={{ icon: 'text-lime-500', chip: 'bg-lime-500/10', ring: 'group-hover:border-lime-500/50' }}
                            />
                        </div>

                        {/* FRASE + COMPETICIÓN */}
                        <section className="flex flex-1 grid gap-2 min-h-0 lg:grid-cols-[1.6fr_1fr]">
                            <div className="flex flex-col h-full min-h-0">
                                <SectionLabel icon={BookOpen} colorClass="text-[#eab308]">Anvil Lessons</SectionLabel>
                                <div className="relative flex-1 flex flex-col justify-center overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
                                    <Quote
                                        size={112}
                                        aria-hidden="true"
                                        className="pointer-events-none absolute -right-4 -top-2 text-ink opacity-[0.04]"
                                    />
                                    <p className="relative text-t-xl font-black uppercase leading-snug tracking-display text-ink md:text-t-2xl">
                                        {getAnvilQuote()}
                                    </p>
                                    <p className="relative mt-4 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                        Anvil Strength Club
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col h-full min-h-0">
                                <SectionLabel icon={Trophy} colorClass="text-[#f59e0b]">Próxima competición</SectionLabel>
                                <div className="flex flex-1 flex-col">
                                    {loading ? (
                                        <div className="flex flex-1 items-center justify-center rounded-card border border-[var(--border-default)] bg-surface-raised min-h-[160px]">
                                            <Loader className="animate-spin text-brand" size={24} />
                                        </div>
                                    ) : (
                                        <CountdownWidget assigned={nextComp} userId={user.id} />
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* COLUMNA DERECHA (Secundaria) */}
                    <div className="flex shrink-0 flex-col gap-4 xl:w-[50%] 2xl:w-[45%] min-h-0 xl:overflow-hidden">
                        <section className="flex flex-[3] flex-col min-h-0">
                            <SectionLabel icon={LayoutDashboard} colorClass="text-[#3b82f6]">Gestión</SectionLabel>
                            <div className="grid flex-1 grid-cols-2 gap-2 min-h-0">
                                <NavTile icon={MessageCircle} title="Mensajes" hint="Próximamente..." onClick={() => {}} customColor={{ icon: 'text-cyan-500', chip: 'bg-cyan-500/10', ring: 'group-hover:border-cyan-500/50' }} />
                                <NavTile icon={Trophy} title="Competiciones" hint="Calendario anual" onClick={() => onNavigate('calendar')} customColor={{ icon: 'text-amber-500', chip: 'bg-amber-500/10', ring: 'group-hover:border-amber-500/50' }} />
                                <NavTile icon={Swords} title="La Arena" hint="Comunidad del club" onClick={() => navigate('/dashboard/community')} customColor={{ icon: 'text-orange-500', chip: 'bg-orange-500/10', ring: 'group-hover:border-orange-500/50' }} />
                                <NavTile icon={Users} title="Ranking" hint="Clasificación de atletas" onClick={() => setIsRankingOpen(true)} customColor={{ icon: 'text-purple-500', chip: 'bg-purple-500/10', ring: 'group-hover:border-purple-500/50' }} />
                            </div>
                        </section>

                        <section className="flex flex-[2] flex-col min-h-0">
                            <SectionLabel icon={FlaskConical} colorClass="text-[#10b981]">Anvil Lab Tools</SectionLabel>
                            <div className="grid flex-1 grid-cols-2 gap-2 min-h-0">
                                <NavTile icon={Weight} title="Carga de barra" hint="Qué discos poner" onClick={() => setIsPlateCalcOpen(true)} customColor={{ icon: 'text-pink-500', chip: 'bg-pink-500/10', ring: 'group-hover:border-pink-500/50' }} />
                                <NavTile icon={List} title="Aproximaciones" hint="Escalera de calentamiento" onClick={() => setIsWarmUpCalcOpen(true)} customColor={{ icon: 'text-indigo-500', chip: 'bg-indigo-500/10', ring: 'group-hover:border-indigo-500/50' }} />
                                <NavTile icon={Calculator} title="1RM" hint="Desde RPE o velocidad" onClick={() => setIs1RMCalcOpen(true)} customColor={{ icon: 'text-emerald-500', chip: 'bg-emerald-500/10', ring: 'group-hover:border-emerald-500/50' }} />
                                <NavTile icon={Fish} title="Sushi" hint="Recuento post-competición" onClick={() => setIsSushiCounterOpen(true)} customColor={{ icon: 'text-rose-500', chip: 'bg-rose-500/10', ring: 'group-hover:border-rose-500/50' }} />
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            <AnvilRanking isOpen={isRankingOpen} onClose={() => setIsRankingOpen(false)} />
            <OneRMCalculator isOpen={is1RMCalcOpen} onClose={() => setIs1RMCalcOpen(false)} />
            <WarmUpCalculator isOpen={isWarmUpCalcOpen} onClose={() => setIsWarmUpCalcOpen(false)} />
            <PlateCalculator isOpen={isPlateCalcOpen} onClose={() => setIsPlateCalcOpen(false)} />
            <SushiCounter isOpen={isSushiCounterOpen} onClose={() => setIsSushiCounterOpen(false)} />
        </>
    );
}
