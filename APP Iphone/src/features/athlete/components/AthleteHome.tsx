import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, Trophy, Weight, List, Calculator, Users, Swords,
    FileText, User, Fish, Dumbbell, Loader, BookOpen, FlaskConical, Inbox, MessageSquare, TrendingUp,
} from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { CheckInCard } from '../../forms/AthleteCheckIns';
import { TodayPanel } from './TodayPanel';
import { OneRMCalculator } from './OneRMCalculator';
import { WarmUpCalculator } from './WarmUpCalculator';
import { PlateCalculator } from './PlateCalculator';
import { SushiCounter } from './SushiCounter';
import { AnvilRanking } from './AnvilRanking';
import { getAnvilQuote } from '../../../lib/dailyQuotes';
import { useIdioma } from '../../../hooks/useIdioma';
import type { ClaveDeTraduccion } from '../../../lib/i18n/es';
import { competitionsService, CompetitionAssignment } from '../../../services/competitionsService';
import { CountdownWidget } from '../../../components/ui/CountdownWidget';
import { usePuertaDePago } from '../../../hooks/usePuertaDePago';
import { vistaBloqueada } from '../../../lib/billing';
import { AvisoDePago } from '../../../components/ui/BloqueoDePago';
import { tieneAmbosPaneles } from '../../../lib/roles';
import { useAthleteInboxUnread } from '../../inbox/hooks/useInbox';
import { useChatSinLeer } from '../../chat/hooks/useChat';
import {
    InicioArmazon, Seccion, RejillaAccesos, Acceso, FraseDelDia, FilaDeContexto,
} from '../../../components/layout/InicioPanel';

interface AthleteHomeProps {
    user: UserProfile;
    onNavigate: (view: string) => void;
    /** Avisos, conmutador de panel y menú de cuenta: la cabecera los sirve en los dos tamaños. */
    headerActions?: ReactNode;
}

const getGreeting = (): ClaveDeTraduccion => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return 'inicio.saludoManana';
    if (hour >= 14 && hour < 21) return 'inicio.saludoTarde';
    return 'inicio.saludoNoche';
};

const getTeamName = (coachName?: string | null): string | null => {
    if (!coachName) return null;
    const parts = coachName.trim().split(' ');
    const surname = parts.length >= 2 ? parts[1] : parts[0];
    return `Team ${surname}`;
};

/**
 * Inicio del atleta.
 *
 * Arriba a la izquierda, lo que toca hoy (entrenamiento y comida) y el
 * check-in; debajo la frase y la competición; a la derecha el resto de la
 * app —con la bandeja y los mensajes marcados si hay algo nuevo— y el Lab.
 */
export function AthleteHome({ user, onNavigate, headerActions }: AthleteHomeProps) {
    const navigate = useNavigate();
    const puerta = usePuertaDePago(user.id);
    const { t } = useIdioma();
    const [loading, setLoading] = useState(true);
    const [is1RMCalcOpen, setIs1RMCalcOpen] = useState(false);
    const [isWarmUpCalcOpen, setIsWarmUpCalcOpen] = useState(false);
    const [isPlateCalcOpen, setIsPlateCalcOpen] = useState(false);
    const [isSushiCounterOpen, setIsSushiCounterOpen] = useState(false);
    const [isRankingOpen, setIsRankingOpen] = useState(false);
    const [nextCompetition, setNextCompetition] = useState<CompetitionAssignment | null>(null);

    const sinLeerBandeja = useAthleteInboxUnread(user.id);
    const sinLeerChat = useChatSinLeer(user.id);

    useEffect(() => {
        let alive = true;
        competitionsService
            .getNextCompetition(user.id)
            .then((next) => { if (alive) setNextCompetition(next); })
            .catch((error) => console.error('Error cargando la próxima competición:', error))
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [user.id]);

    const firstName = user.full_name?.split(' ')[0] || 'Atleta';
    const teamName = user.role === 'athlete' ? getTeamName(user.coach_name) : null;
    // El panel de "Hoy" se cierra por PAGO, no por `has_access` (K3, K5).
    const locked = vistaBloqueada('hoy', puerta.resultado, puerta.prefs.billing.blocks);

    return (
        <>
            <InicioArmazon
                antetitulo={teamName && (
                    <div className="mb-1.5 flex items-center gap-2">
                        {user.coach_logo_url && (
                            <img src={user.coach_logo_url} alt="" aria-hidden="true" className="h-6 w-auto rounded-chip object-contain" />
                        )}
                        <p className="text-t-xs font-semibold text-ink-subtle">{teamName}</p>
                    </div>
                )}
                titulo={<>{t(getGreeting())}, {firstName}</>}
                acciones={headerActions}
                aviso={<AvisoDePago resultado={puerta.resultado} />}
                principal={
                    <Seccion icono={Dumbbell} titulo={t('inicio.hoy')}>
                        <TodayPanel
                            athleteId={user.id}
                            locked={locked}
                            onOpenTraining={() => onNavigate('planning')}
                            onOpenNutrition={() => onNavigate('nutrition')}
                        />
                        <div className="shrink-0">
                            <CheckInCard athleteId={user.id} />
                        </div>
                    </Seccion>
                }
                contexto={
                    <FilaDeContexto>
                        <Seccion icono={BookOpen} titulo="Anvil Lessons">
                            <FraseDelDia frase={getAnvilQuote()} />
                        </Seccion>
                        <Seccion icono={Trophy} titulo={t('inicio.proximaCompeticion')}>
                            {loading ? (
                                <div className="flex min-h-[124px] items-center justify-center rounded-card border border-[var(--card-border)] bg-surface-raised shadow-card pc:min-h-0 pc:flex-1">
                                    <Loader className="animate-spin text-ink-subtle" size={22} />
                                </div>
                            ) : (
                                <CountdownWidget assigned={nextCompetition} userId={user.id} />
                            )}
                        </Seccion>
                    </FilaDeContexto>
                }
                accesos={
                    <Seccion icono={FileText} titulo={t('inicio.tuCarrera')}>
                        <RejillaAccesos>
                            <Acceso area="entreno" icono={Inbox} titulo="Bandeja de entrada" pista="Feedback y revisiones de tu entrenador" insignia={sinLeerBandeja} onClick={() => onNavigate('inbox')} />
                            <Acceso area="entreno" icono={MessageSquare} titulo="Mensajes" pista="Chat con tu entrenador" insignia={sinLeerChat} onClick={() => onNavigate('messages')} />
                            <Acceso area="entreno" icono={FileText} titulo={t('inicio.planificacion')} pista={t('inicio.planificacionPista')} onClick={() => onNavigate('planning')} />
                            <Acceso area="entreno" icono={TrendingUp} titulo="Estadísticas" pista="Progreso, e1RM y fases" onClick={() => onNavigate('stats')} />
                            <Acceso area="club" icono={Trophy} titulo={t('nav.competiciones')} pista={t('inicio.competicionesPista')} onClick={() => onNavigate('competitions')} />
                            <Acceso area="entreno" icono={Calendar} titulo={t('nav.calendario')} pista={t('inicio.calendarioPista')} onClick={() => onNavigate('calendar')} />
                            <Acceso icono={User} titulo={t('inicio.miPerfil')} pista={t('inicio.miPerfilPista')} onClick={() => onNavigate('profile')} />
                            <Acceso
                                area="club"
                                icono={Swords}
                                titulo={t('nav.arena')}
                                pista={locked ? t('inicio.necesitasAcceso') : t('inicio.arenaPista')}
                                onClick={() => navigate('/dashboard/community')}
                                bloqueado={locked}
                            />
                            <Acceso
                                area="club"
                                icono={Users}
                                titulo={t('nav.ranking')}
                                pista={locked ? t('inicio.necesitasAcceso') : t('inicio.rankingPista')}
                                onClick={() => setIsRankingOpen(true)}
                                bloqueado={locked}
                            />
                            {tieneAmbosPaneles(user) && (
                                <Acceso icono={Users} titulo="Vista entrenador" pista="Tus atletas y su programación" onClick={() => navigate('/coach-dashboard')} />
                            )}
                        </RejillaAccesos>
                    </Seccion>
                }
                herramientas={
                    <Seccion icono={FlaskConical} titulo="Anvil Lab">
                        <RejillaAccesos>
                            <Acceso icono={Weight} titulo={t('inicio.cargaDeBarra')} pista={t('inicio.cargaDeBarraPista')} onClick={() => setIsPlateCalcOpen(true)} />
                            <Acceso icono={List} titulo={t('inicio.aproximaciones')} pista={t('inicio.aproximacionesPista')} onClick={() => setIsWarmUpCalcOpen(true)} />
                            <Acceso icono={Calculator} titulo={t('inicio.unRm')} pista={t('inicio.unRmPista')} onClick={() => setIs1RMCalcOpen(true)} />
                            <Acceso icono={Fish} titulo={t('inicio.sushi')} pista={t('inicio.sushiPista')} onClick={() => setIsSushiCounterOpen(true)} />
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
