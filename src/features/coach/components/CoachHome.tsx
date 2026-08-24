import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import {
    Users, Trophy, Calendar, User, Weight, List, Calculator,
    ChevronRight, Swords, Activity, Fish, Loader,
    BookOpen, Quote, LayoutDashboard, AlertTriangle,
} from 'lucide-react';
import { AttentionPanel } from './AttentionPanel';
import { fetchRosterIds } from '../hooks/useCoachRoster';
import { TeamCard, NextCompCard, NoCompCard, type NextComp } from './CoachHomeCards';
import type { LucideIcon } from 'lucide-react';
import { getAnvilQuote } from '../../../lib/dailyQuotes';
import { OneRMCalculator } from '../../athlete/components/OneRMCalculator';
import { WarmUpCalculator } from '../../athlete/components/WarmUpCalculator';
import { PlateCalculator } from '../../athlete/components/PlateCalculator';
import { SushiCounter } from '../../athlete/components/SushiCounter';
import { AnvilRanking } from '../../athlete/components/AnvilRanking';

/**
 * Acento por AREA, no por boton. Mismo criterio que en el inicio del atleta:
 * rojo es programar, ambar es la comunidad, neutro son las herramientas.
 */
const AREA = {
    coach: { icon: 'text-brand-text', chip: 'bg-brand-quiet' },
    club: { icon: 'text-warning', chip: 'bg-warning-quiet' },
    tool: { icon: 'text-ink-muted', chip: 'bg-surface-overlay' },
} as const;

type AreaKey = keyof typeof AREA;

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
    return (
        <h2 className="mb-3 flex items-center gap-2 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
            <Icon size={14} aria-hidden="true" className="text-ink-faint" />
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
    area = 'tool',
}: {
    icon: LucideIcon;
    title: string;
    hint: string;
    onClick: () => void;
    area?: AreaKey;
}) {
    const a = AREA[area];
    return (
        <button
            onClick={onClick}
            className="group relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-4 text-left transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay active:bg-surface-raised"
        >
            <Icon
                size={72}
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -top-3 text-ink opacity-[0.04] transition-transform duration-base ease-snap group-hover:scale-110"
            />
            <span className={`flex h-9 w-9 items-center justify-center rounded-field ${a.chip}`}>
                <Icon size={17} className={a.icon} aria-hidden="true" />
            </span>
            <span className="relative">
                <span className="block text-t-base font-bold leading-tight text-ink">{title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-t-xs text-ink-subtle">
                    {hint}
                    <ChevronRight size={12} aria-hidden="true" className="transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                </span>
            </span>
        </button>
    );
}

/**
 * Inicio del entrenador (y del nutricionista: los dos gestionan atletas
 * asignados y ven las mismas herramientas).
 *
 * Un solo árbol responsive, igual que el del atleta. La pantalla la abre
 * alguien que viene a programar, así que "Mis atletas" es lo único con
 * tratamiento de acción primaria.
 */
export function CoachHome({ user, onNavigate }: { user: UserProfile; onNavigate: (view: string) => void }) {
    const navigate = useNavigate();

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 14) return 'Buenos días';
        if (hour >= 14 && hour < 21) return 'Buenas tardes';
        return 'Buenas noches';
    };

    const [athleteCount, setAthleteCount] = useState<number | null>(null);
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
                // sumando aquí aunque ya hubiera desaparecido de la lista: el
                // contador de inicio y la lista de abajo se contradecían.
                // El filtro vive en la puerta única, no aquí: ver
                // src/features/coach/hooks/useCoachRoster.ts.
                const athleteIds = await fetchRosterIds(user.id, 'active');
                if (alive) setAthleteCount(athleteIds.length);

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

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader className="animate-spin text-brand-text" size={28} />
            </div>
        );
    }

    const firstName = user.full_name?.split(' ')[0] || 'Entrenador';
    const isNutritionist = user.role === 'nutritionist';

    return (
        <>
            <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 pb-24 md:px-8 md:py-10">
                <header>
                    <h1 className="text-t-3xl font-black uppercase tracking-display text-ink md:text-t-4xl">
                        {getGreeting()}, {firstName}
                    </h1>
                    <p className="mt-1.5 flex items-center gap-2 text-t-sm capitalize text-ink-muted">
                        <Calendar size={14} className="text-ink-faint" aria-hidden="true" />
                        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </header>

                {/* -----------------------------------------------------
                    ACCIÓN PRINCIPAL + PRÓXIMA COMPETICIÓN
                    Las dos cosas que un entrenador quiere saber al entrar:
                    a quién tiene que atender y cuánto queda para la
                    siguiente tarima.                                    */}
                <section>
                    <SectionLabel icon={Users}>Tu equipo</SectionLabel>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <TeamCard athleteCount={athleteCount} onClick={() => onNavigate('athletes')} />

                        {nextComp
                            ? <NextCompCard comp={nextComp} onClick={() => onNavigate('calendar')} />
                            : <NoCompCard />}
                    </div>
                </section>

                {/* -----------------------------------------------------
                    QUÉ REQUIERE TU ATENCIÓN
                    Va justo después de la acción principal y por delante de
                    la rejilla de herramientas: es lo que decide a qué se
                    dedica el coach hoy, y las calculadoras no. */}
                <section>
                    <SectionLabel icon={AlertTriangle}>Requiere tu atención</SectionLabel>
                    <AttentionPanel coachId={user.id} />
                </section>

                {/* ----------------------------------------------------- */}
                <section>
                    <SectionLabel icon={LayoutDashboard}>Gestión</SectionLabel>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        <NavTile area="coach" icon={Calendar} title="Mis competiciones" hint="Sesiones del equipo" onClick={() => onNavigate('schedule')} />
                        <NavTile area="coach" icon={Trophy} title="Calendario" hint="Competiciones del año" onClick={() => onNavigate('calendar')} />
                        {!isNutritionist && (
                            <NavTile area="coach" icon={Activity} title="Análisis PWR" hint="Velocidad y perfiles de barra" onClick={() => onNavigate('pwr_analysis')} />
                        )}
                        <NavTile icon={User} title="Mi perfil" hint="Marca, logo y datos" onClick={() => onNavigate('profile')} />
                        <NavTile area="club" icon={Swords} title="La Arena" hint="Comunidad del club" onClick={() => navigate('/dashboard/community')} />
                        <NavTile area="club" icon={Users} title="Ranking" hint="Clasificación de atletas" onClick={() => setIsRankingOpen(true)} />
                    </div>
                </section>

                <section>
                    <SectionLabel icon={Calculator}>Anvil Lab</SectionLabel>
                    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                        <NavTile icon={Weight} title="Carga de barra" hint="Qué discos poner" onClick={() => setIsPlateCalcOpen(true)} />
                        <NavTile icon={List} title="Aproximaciones" hint="Escalera de calentamiento" onClick={() => setIsWarmUpCalcOpen(true)} />
                        <NavTile icon={Calculator} title="1RM" hint="Desde RPE o velocidad" onClick={() => setIs1RMCalcOpen(true)} />
                        <NavTile icon={Fish} title="Sushi" hint="Recuento post-competición" onClick={() => setIsSushiCounterOpen(true)} />
                    </div>
                </section>

                <section>
                    <SectionLabel icon={BookOpen}>Anvil Lessons</SectionLabel>
                    <div className="relative flex min-h-[140px] flex-col justify-center overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
                        <Quote
                            size={112}
                            aria-hidden="true"
                            className="pointer-events-none absolute -right-4 -top-2 text-ink opacity-[0.04]"
                        />
                        <p className="relative text-t-xl font-black uppercase leading-snug tracking-display text-ink md:text-t-2xl">
                            {getAnvilQuote()}
                        </p>
                        <p className="relative mt-4 text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                            Anvil Strength Club
                        </p>
                    </div>
                </section>
            </div>

            <AnvilRanking isOpen={isRankingOpen} onClose={() => setIsRankingOpen(false)} />
            <OneRMCalculator isOpen={is1RMCalcOpen} onClose={() => setIs1RMCalcOpen(false)} />
            <WarmUpCalculator isOpen={isWarmUpCalcOpen} onClose={() => setIsWarmUpCalcOpen(false)} />
            <PlateCalculator isOpen={isPlateCalcOpen} onClose={() => setIsPlateCalcOpen(false)} />
            <SushiCounter isOpen={isSushiCounterOpen} onClose={() => setIsSushiCounterOpen(false)} />
        </>
    );
}
