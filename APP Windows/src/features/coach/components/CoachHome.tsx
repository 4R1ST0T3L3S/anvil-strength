import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import {
    Users, Trophy, Calendar, Weight, List, Calculator,
    Swords, Fish, Loader, MessageCircle, Apple,
    BookOpen, Quote, LayoutDashboard, FlaskConical,
} from 'lucide-react';
import { NavTile, SectionLabel, SECTION, TILE } from '../../../components/ui/HomeTiles';
import { fetchRosterIds } from '../hooks/useCoachRoster';
import { CountdownWidget } from '../../../components/ui/CountdownWidget';
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
            <div className="mx-auto flex min-h-full w-full max-w-none flex-col h-[calc(100vh-64px)] px-12 py-4 overflow-hidden">
                <header className="mb-4 shrink-0 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="font-black uppercase tracking-display text-ink text-t-2xl">
                            {getGreeting()},{' '}
                            <span className="text-brand-text">{firstName}</span>
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

                <div className="flex flex-1 gap-4 min-h-0 flex-row">
                    {/* COLUMNA IZQUIERDA (Principal) */}
                    <div className="flex flex-1 flex-col gap-4 min-w-0 overflow-hidden">
                        {/* NUEVO: "Mis atletas" y "Dietas", el único añadido
                            sobre la versión de Javier.

                            LLEVA ETIQUETA, y no es decoración: era el ÚNICO
                            grupo de la pantalla sin ella, y por eso sus
                            tarjetas empezaban 54px más arriba que las de la
                            columna derecha (los 54px que ocupa un
                            `SectionLabel`: 16 de margen + 22 de texto + 16).
                            Con la etiqueta, las dos columnas arrancan sus
                            tarjetas a la misma altura sin números mágicos —
                            se alinean solas a cualquier alto de ventana.

                            El alto va por tramos porque las tarjetas de
                            Gestión, al ser `flex`, encogen con la ventana:
                            240px las iguala en una pantalla de 1920x1080
                            (miden 238) y 208px se acerca en un portátil de
                            1440x900 (miden 184). Con un solo valor, o se
                            quedaban cortas en la grande o desproporcionadas
                            en la pequeña. El alto sale de la sección de abajo
                            (Anvil Lessons), que iba sobradísima de espacio. */}
                        <section className="flex shrink-0 flex-col">
                            <SectionLabel icon={Users} colorClass={SECTION.primary}>Tu equipo</SectionLabel>
                            <div className="grid grid-cols-2 gap-2 2xl:h-60 h-52">
                                <NavTile
                                    icon={Users}
                                    title="Mis atletas"
                                    hint="Programación y seguimiento"
                                    onClick={() => onNavigate('athletes')}
                                    customColor={TILE.brand}
                                />
                                <NavTile
                                    icon={Apple}
                                    title="Dietas"
                                    hint="Planes nutricionales del equipo"
                                    onClick={() => onNavigate('diets')}
                                    customColor={TILE.lime}
                                />
                            </div>
                        </section>

                        {/* FRASE + COMPETICIÓN */}
                        <section className="flex-1 grid gap-2 min-h-0 grid-cols-[1.6fr_1fr]">
                            <div className="flex flex-col h-full min-h-0">
                                <SectionLabel icon={BookOpen} colorClass={SECTION.lessons}>Anvil Lessons</SectionLabel>
                                <div className="relative flex-1 flex flex-col justify-center overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-6">
                                    <Quote
                                        size={112}
                                        aria-hidden="true"
                                        className="pointer-events-none absolute -right-4 -top-2 text-ink opacity-[0.04]"
                                    />
                                    <p className="relative font-black uppercase tracking-display text-ink text-t-2xl">
                                        {getAnvilQuote()}
                                    </p>
                                    <p className="relative mt-4 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                        Anvil Strength Club
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col h-full min-h-0">
                                <SectionLabel icon={Trophy} colorClass={SECTION.competition}>Próxima competición</SectionLabel>
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
                    <div className="flex shrink-0 flex-col gap-4 2xl:w-[45%] min-h-0 w-[50%] overflow-hidden">
                        <section className="flex flex-[3] flex-col min-h-0">
                            <SectionLabel icon={LayoutDashboard} colorClass={SECTION.hub}>Gestión</SectionLabel>
                            <div className="grid flex-1 grid-cols-2 gap-2 min-h-0">
                                <NavTile icon={MessageCircle} title="Mensajes" hint="Próximamente..." onClick={() => {}} customColor={TILE.cyan} />
                                <NavTile icon={Trophy} title="Competiciones" hint="Calendario anual" onClick={() => onNavigate('calendar')} customColor={TILE.amber} />
                                <NavTile icon={Swords} title="La Arena" hint="Comunidad del club" onClick={() => navigate('/dashboard/community')} customColor={TILE.orange} />
                                <NavTile icon={Users} title="Ranking" hint="Clasificación de atletas" onClick={() => setIsRankingOpen(true)} customColor={TILE.purple} />
                            </div>
                        </section>

                        <section className="flex flex-[2] flex-col min-h-0">
                            <SectionLabel icon={FlaskConical} colorClass={SECTION.lab}>Anvil Lab</SectionLabel>
                            <div className="grid flex-1 grid-cols-2 gap-2 min-h-0">
                                <NavTile icon={Weight} title="Carga de barra" hint="Qué discos poner" onClick={() => setIsPlateCalcOpen(true)} customColor={TILE.pink} />
                                <NavTile icon={List} title="Aproximaciones" hint="Escalera de calentamiento" onClick={() => setIsWarmUpCalcOpen(true)} customColor={TILE.indigo} />
                                <NavTile icon={Calculator} title="1RM" hint="Desde RPE o velocidad" onClick={() => setIs1RMCalcOpen(true)} customColor={TILE.emerald} />
                                <NavTile icon={Fish} title="Sushi" hint="Recuento post-competición" onClick={() => setIsSushiCounterOpen(true)} customColor={TILE.rose} />
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
