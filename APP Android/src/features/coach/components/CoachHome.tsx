import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import {
    Users, Trophy, CalendarDays, Weight, List, Calculator, Swords, Fish, Loader,
    Apple, BookOpen, LayoutDashboard, FlaskConical, Activity, User, Inbox, MessageSquare, SlidersHorizontal,
} from 'lucide-react';
import { fetchRosterIds } from '../hooks/useCoachRoster';
import { CountdownWidget } from '../../../components/ui/CountdownWidget';
import { getAnvilQuote } from '../../../lib/dailyQuotes';
import { isNutritionist } from '../../../lib/roles';
import { OneRMCalculator } from '../../athlete/components/OneRMCalculator';
import { WarmUpCalculator } from '../../athlete/components/WarmUpCalculator';
import { PlateCalculator } from '../../athlete/components/PlateCalculator';
import { SushiCounter } from '../../athlete/components/SushiCounter';
import { AnvilRanking } from '../../athlete/components/AnvilRanking';
import { useCoachInboxSummary } from '../../inbox/hooks/useInbox';
import { useChatSinLeer } from '../../chat/hooks/useChat';
import { Avatar } from '../../../components/ui/Avatar';
import {
    InicioArmazon, Seccion, RejillaAccesos, Acceso, TarjetaPrincipal,
    ParDePrincipales, FraseDelDia, FilaDeContexto,
} from '../../../components/layout/InicioPanel';

interface NextComp {
    name: string;
    date: string;
    days: number;
    level: string;
    location: string;
}

const saludo = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return 'Buenos días';
    if (hour >= 14 && hour < 21) return 'Buenas tardes';
    return 'Buenas noches';
};

/**
 * Inicio del entrenador (y del nutricionista).
 *
 * LO PRIMERO ES LO QUE PIDE ATENCIÓN: la bandeja de entrada con cuántos
 * entrenamientos esperan y de quién, al lado del equipo. Debajo, el contexto
 * (frase y competición); a la derecha, el resto de la aplicación con los
 * mensajes sin leer marcados, y el laboratorio.
 */
export function CoachHome({ user, onNavigate, headerActions }: { user: UserProfile; onNavigate: (view: string) => void; headerActions?: ReactNode }) {
    const navigate = useNavigate();

    const [nextComp, setNextComp] = useState<NextComp | null>(null);
    const [athleteCount, setAthleteCount] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [is1RMCalcOpen, setIs1RMCalcOpen] = useState(false);
    const [isWarmUpCalcOpen, setIsWarmUpCalcOpen] = useState(false);
    const [isPlateCalcOpen, setIsPlateCalcOpen] = useState(false);
    const [isSushiCounterOpen, setIsSushiCounterOpen] = useState(false);
    const [isRankingOpen, setIsRankingOpen] = useState(false);

    const bandeja = useCoachInboxSummary(user.id);
    const sinLeer = useChatSinLeer(user.id);

    useEffect(() => {
        let alive = true;

        const fetchStats = async () => {
            try {
                // Solo relaciones VIVAS, por la puerta única (useCoachRoster).
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
                    const target = new Date(comp.date);
                    target.setHours(0, 0, 0, 0);
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const days = Math.round((target.getTime() - now.getTime()) / 86400000);
                    setNextComp({ name: comp.name, date: comp.date, days, level: comp.level || '', location: comp.location || '' });
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
    const nutritionist = isNutritionist(user);

    const pistaAtletas = athleteCount === null
        ? 'Programación y seguimiento'
        : athleteCount === 0
            ? 'Todavía no tienes ninguno asignado'
            : `${athleteCount} ${athleteCount === 1 ? 'atleta en el equipo' : 'atletas en el equipo'}`;

    const pendientes = bandeja.totalPendientes;
    const pistaBandeja = bandeja.isPending
        ? 'Entrenamientos por revisar'
        : pendientes === 0
            ? 'Todo revisado'
            : `${pendientes} ${pendientes === 1 ? 'entrenamiento por revisar' : 'entrenamientos por revisar'}`;

    return (
        <>
            <InicioArmazon
                titulo={<>{saludo()}, {firstName}</>}
                acciones={headerActions}
                principal={
                    <Seccion icono={LayoutDashboard} titulo="Hoy">
                        <ParDePrincipales>
                            <TarjetaPrincipal
                                icono={Inbox}
                                titulo="Bandeja de entrada"
                                pista={pistaBandeja}
                                insignia={pendientes}
                                tono={pendientes > 0 ? 'marca' : 'neutro'}
                                onClick={() => onNavigate('inbox')}
                            >
                                {bandeja.atletas.length > 0 && (
                                    <span className="mt-3 flex items-center gap-1.5">
                                        <span className="flex -space-x-2">
                                            {bandeja.atletas.slice(0, 4).map(a => (
                                                <Avatar key={a.athleteId} nombre={a.fullName} src={a.avatarUrl} size={24} anillo />
                                            ))}
                                        </span>
                                        <span className={pendientes > 0 ? 'text-t-xs text-brand-ink/80' : 'text-t-xs text-ink-subtle'}>
                                            {bandeja.atletas.slice(0, 2).map(a => a.fullName.split(' ')[0]).join(', ')}
                                            {bandeja.atletas.length > 2 && ` y ${bandeja.atletas.length - 2} más`}
                                        </span>
                                    </span>
                                )}
                            </TarjetaPrincipal>
                            <TarjetaPrincipal
                                tono="neutro"
                                icono={Users}
                                titulo="Mis atletas"
                                pista={pistaAtletas}
                                onClick={() => onNavigate('athletes')}
                            />
                        </ParDePrincipales>
                    </Seccion>
                }
                contexto={
                    <FilaDeContexto>
                        <Seccion icono={BookOpen} titulo="Anvil Lessons">
                            <FraseDelDia frase={getAnvilQuote()} />
                        </Seccion>
                        <Seccion icono={Trophy} titulo="Próxima competición">
                            {loading ? (
                                <div className="flex min-h-[124px] items-center justify-center rounded-card border border-[var(--card-border)] bg-surface-raised shadow-card pc:min-h-0 pc:flex-1">
                                    <Loader className="animate-spin text-ink-subtle" size={22} />
                                </div>
                            ) : (
                                <CountdownWidget assigned={nextComp} userId={user.id} />
                            )}
                        </Seccion>
                    </FilaDeContexto>
                }
                accesos={
                    <Seccion icono={LayoutDashboard} titulo="Gestión">
                        <RejillaAccesos>
                            <Acceso area="entreno" icono={MessageSquare} titulo="Mensajes" pista="Chat con tus atletas" insignia={sinLeer} onClick={() => onNavigate('messages')} />
                            <Acceso area="comida" icono={Apple} titulo="Dietas" pista="Planes nutricionales del equipo" onClick={() => onNavigate('diets')} />
                            <Acceso area="datos" icono={CalendarDays} titulo="Agenda" pista="Las sesiones del equipo" onClick={() => onNavigate('schedule')} />
                            <Acceso area="club" icono={Trophy} titulo="Competiciones" pista="Calendario del año" onClick={() => onNavigate('calendar')} />
                            {!nutritionist && (
                                <Acceso area="datos" icono={Activity} titulo="Análisis PWR" pista="Velocidad y perfiles de barra" onClick={() => onNavigate('pwr_analysis')} />
                            )}
                            <Acceso area="ajustes" icono={User} titulo="Mi perfil" pista="Marca, logo y datos" onClick={() => onNavigate('profile')} />
                            <Acceso area="club" icono={Swords} titulo="La Arena" pista="Comunidad del club" onClick={() => navigate('/dashboard/community')} />
                            <Acceso area="club" icono={Users} titulo="Ranking" pista="Clasificación de atletas" onClick={() => setIsRankingOpen(true)} />
                            <Acceso area="ajustes" icono={SlidersHorizontal} titulo="Preferencias y ajustes" pista="Programación, avisos, tema y cuenta" onClick={() => onNavigate('settings')} />
                        </RejillaAccesos>
                    </Seccion>
                }
                herramientas={
                    <Seccion icono={FlaskConical} titulo="Anvil Lab">
                        <RejillaAccesos>
                            <Acceso icono={Weight} titulo="Carga de barra" pista="Qué discos poner" onClick={() => setIsPlateCalcOpen(true)} />
                            <Acceso icono={List} titulo="Aproximaciones" pista="Escalera de calentamiento" onClick={() => setIsWarmUpCalcOpen(true)} />
                            <Acceso icono={Calculator} titulo="1RM" pista="Desde RPE o velocidad" onClick={() => setIs1RMCalcOpen(true)} />
                            <Acceso icono={Fish} titulo="Sushi" pista="Recuento post-competición" onClick={() => setIsSushiCounterOpen(true)} />
                        </RejillaAccesos>
                    </Seccion>
                }
            />

            <AnvilRanking isOpen={isRankingOpen} onClose={() => setIsRankingOpen(false)} />
            <OneRMCalculator isOpen={is1RMCalcOpen} onClose={() => setIs1RMCalcOpen(false)} />
            <WarmUpCalculator isOpen={isWarmUpCalcOpen} onClose={() => setIsWarmUpCalcOpen(false)} />
            <PlateCalculator isOpen={isPlateCalcOpen} onClose={() => setIsPlateCalcOpen(false)} />
            <SushiCounter isOpen={isSushiCounterOpen} onClose={() => setIsSushiCounterOpen(false)} />
        </>
    );
}
