import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, Trophy, Weight, List, Calculator, Users, Swords,
    FileText, User, Fish, Dumbbell, Loader, BookOpen, FlaskConical,
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
import {
    InicioArmazon, Seccion, RejillaAccesos, Acceso, FraseDelDia, FilaDeContexto,
} from '../../../components/layout/InicioPanel';

interface AthleteHomeProps {
    user: UserProfile;
    onNavigate: (view: string) => void;
    /**
     * Acciones de la cabecera: avisos, conmutador de panel y menú de cuenta.
     *
     * La barra superior del armazón se oculta SIEMPRE en el inicio
     * (`hideHeaderOnDesktop` en escritorio, y en móvil desde el 30 ago 2026
     * no se ve en ninguna pantalla), así que estas acciones se sirven desde
     * aquí en los dos tamaños.
     */
    headerActions?: ReactNode;
}

/**
 * Devuelve la CLAVE del saludo, no la frase.
 *
 * La franja horaria la decide el reloj del dispositivo; la palabra, el idioma.
 */
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
 * MISMA FORMA QUE EL DEL ENTRENADOR, con `InicioArmazon`: arriba a la
 * izquierda lo que toca hoy, debajo la frase y la competición, y a la derecha
 * el resto de la app y el Anvil Lab. En el ordenador cabe en una pantalla sin
 * scroll; en el móvil se apila. Ver `InicioPanel.tsx`.
 *
 * La competición tiene SIEMPRE su hueco, haya o no: antes desaparecía cuando no
 * había ninguna asignada y la pantalla cambiaba de forma según el atleta, que
 * es justo lo que hacía que no se pareciera a la del entrenador.
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
    /*
     * EL PANEL DE "HOY" SE CIERRA POR PAGO, NO POR `has_access` (K3, K5).
     *
     * Enseña el entrenamiento del día, así que es servicio del entrenador. El
     * resto del inicio —competiciones, ranking, comunidad, cuestionarios— se
     * ve con normalidad: no es suyo.
     */
    const locked = vistaBloqueada('hoy', puerta.resultado, puerta.prefs.billing.blocks);
    const accent = user.coach_brand_color || 'var(--brand)';

    return (
        <>
            <InicioArmazon
                antetitulo={teamName && (
                    <div className="mb-2 flex items-center gap-2.5">
                        {user.coach_logo_url && (
                            <img
                                src={user.coach_logo_url}
                                alt=""
                                aria-hidden="true"
                                className="h-7 w-auto rounded-chip object-contain"
                            />
                        )}
                        <p className="text-t-2xs font-bold uppercase tracking-widest" style={{ color: accent }}>
                            {teamName}
                        </p>
                    </div>
                )}
                titulo={<>{t(getGreeting())}, <span style={{ color: accent }}>{firstName}</span></>}
                acciones={headerActions}
                // Con la puerta en modo aviso (K1) esto informa y no corta.
                // Con la puerta cerrada, el panel de "Hoy" ya está bloqueado
                // y esta franja explica por qué.
                aviso={<AvisoDePago resultado={puerta.resultado} />}
                principal={
                    <Seccion icono={Dumbbell} titulo={t('inicio.hoy')}>
                        {/* El entrenamiento pautado y los macros del día, con
                            datos de verdad: responde a "qué toca hoy" sin
                            entrar en ninguna otra pantalla. */}
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
                                <div className="flex min-h-[132px] items-center justify-center rounded-card border border-[var(--border-default)] bg-surface-raised pc:min-h-0 pc:flex-1">
                                    <Loader className="animate-spin text-brand-text" size={24} />
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
                            <Acceso area="entreno" icono={FileText} titulo={t('inicio.planificacion')} pista={t('inicio.planificacionPista')} onClick={() => onNavigate('planning')} />
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

                            {/* PASAR AL PANEL DE ENTRENADOR. Solo para quien de
                                verdad entrena a gente (`tieneAmbosPaneles` =
                                `isStaff && isAthlete`; la capacidad la decide la
                                base de datos). Esto solo decide qué se ENSEÑA:
                                el guarda de /coach-dashboard sigue mandando. */}
                            {tieneAmbosPaneles(user) && (
                                <Acceso
                                    icono={Users}
                                    titulo="Vista entrenador"
                                    pista="Tus atletas y su programación"
                                    onClick={() => navigate('/coach-dashboard')}
                                />
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
