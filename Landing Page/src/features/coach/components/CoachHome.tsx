import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import {
    Users, Trophy, CalendarDays, Weight, List, Calculator, Swords, Fish, Loader,
    Apple, BookOpen, LayoutDashboard, FlaskConical, Activity, User,
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
 * Inicio del entrenador (y del nutricionista: los dos gestionan atletas
 * asignados y ven las mismas herramientas).
 *
 * MISMA FORMA QUE EL DEL ATLETA, con `InicioArmazon`: arriba a la izquierda lo
 * que se viene a hacer (aquí, el equipo; allí, el entrenamiento de hoy), debajo
 * la frase y la competición, y a la derecha los accesos y el Anvil Lab. En el
 * ordenador cabe en una pantalla sin scroll; ver `InicioPanel.tsx`.
 *
 * Lo que cambia respecto a la versión anterior:
 *   - «Mis atletas» y «Dietas» vuelven a ser las dos tarjetas grandes —como
 *     «Entrenar» y «Mi dieta» del atleta— y «Mis atletas» dice cuántos hay.
 *   - Los doce colores (uno por tarjeta) pasan a los tres de área del sistema.
 *   - «Mensajes · Próximamente» se va: era un botón que no hacía nada. Su hueco
 *     lo ocupa la Agenda del equipo, que existía y no tenía acceso desde aquí.
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

    const firstName = user.full_name?.split(' ')[0] || 'Entrenador';
    const nutritionist = isNutritionist(user);

    const pistaAtletas = athleteCount === null
        ? 'Programación y seguimiento'
        : athleteCount === 0
            ? 'Todavía no tienes ninguno asignado'
            : `${athleteCount} ${athleteCount === 1 ? 'atleta asignado' : 'atletas asignados'}`;

    return (
        <>
            <InicioArmazon
                titulo={<>{saludo()}, <span className="text-brand-text">{firstName}</span></>}
                acciones={headerActions}
                principal={
                    <Seccion icono={Users} titulo="Tu equipo">
                        <ParDePrincipales>
                            <TarjetaPrincipal
                                icono={Users}
                                titulo="Mis atletas"
                                pista={pistaAtletas}
                                onClick={() => onNavigate('athletes')}
                            />
                            <TarjetaPrincipal
                                tono="comida"
                                icono={Apple}
                                titulo="Dietas"
                                pista="Planes nutricionales del equipo"
                                onClick={() => onNavigate('diets')}
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
                                <div className="flex min-h-[132px] items-center justify-center rounded-card border border-[var(--border-default)] bg-surface-raised pc:min-h-0 pc:flex-1">
                                    <Loader className="animate-spin text-brand-text" size={24} />
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
                            <Acceso area="entreno" icono={CalendarDays} titulo="Agenda" pista="Las sesiones del equipo" onClick={() => onNavigate('schedule')} />
                            <Acceso area="entreno" icono={Trophy} titulo="Competiciones" pista="Calendario del año" onClick={() => onNavigate('calendar')} />
                            {!nutritionist && (
                                <Acceso area="entreno" icono={Activity} titulo="Análisis PWR" pista="Velocidad y perfiles de barra" onClick={() => onNavigate('pwr_analysis')} />
                            )}
                            <Acceso icono={User} titulo="Mi perfil" pista="Marca, logo y datos" onClick={() => onNavigate('profile')} />
                            <Acceso area="club" icono={Swords} titulo="La Arena" pista="Comunidad del club" onClick={() => navigate('/dashboard/community')} />
                            <Acceso area="club" icono={Users} titulo="Ranking" pista="Clasificación de atletas" onClick={() => setIsRankingOpen(true)} />
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
