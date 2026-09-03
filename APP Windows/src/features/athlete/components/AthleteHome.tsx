import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, Trophy, Weight, List, Calculator, Users, Swords,
    FileText, User, Fish, Dumbbell, Loader, BookOpen, Quote, Compass, FlaskConical,
} from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { NavTile, SectionLabel, SECTION, TILE } from '../../../components/ui/HomeTiles';
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

interface AthleteHomeProps {
    user: UserProfile;
    onNavigate: (view: string) => void;
    /** Acciones de la cabecera, si algún día vuelve a haberlas. */
    headerActions?: ReactNode;
}

/**
 * Devuelve la CLAVE del saludo, no la frase.
 *
 * La franja horaria la decide el reloj del dispositivo; la palabra, el idioma.
 * Son dos cosas distintas y mezclarlas dejaba "Buenos días" en una pantalla
 * inglesa.
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

// =====================================================================
// PANTALLA
// =====================================================================

/**
 * Inicio del atleta.
 *
 * MISMO ARMAZÓN QUE EL INICIO DEL ENTRENADOR: la pantalla entera, sin tope
 * de ancho y sin scroll. Las columnas reparten el ancho y las secciones el
 * alto (`flex-1`, `min-h-0`), así que la Home llena la ventana que tenga.
 *
 * Izquierda: lo que toca hacer hoy (entreno + dieta), el check-in y la
 * frase con la competición. Derecha: el resto de la app en accesos.
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

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader className="animate-spin text-brand-text" size={28} />
            </div>
        );
    }

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
            <div className="flex h-[calc(100vh-64px)] min-h-full w-full max-w-none flex-col overflow-hidden px-12 py-4">
                {/* Con la puerta en modo aviso (K1) esto informa y no corta.
                    Con la puerta cerrada, el panel de "Hoy" ya está bloqueado
                    mas abajo y esta franja explica por que. */}
                <AvisoDePago resultado={puerta.resultado} />

                {/* ---------------------------------------------------------
                    CABECERA                                              */}
                <header className="mb-4 flex shrink-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                        {teamName && (
                            <div className="mb-1.5 flex items-center gap-2.5">
                                {user.coach_logo_url && (
                                    <img
                                        src={user.coach_logo_url}
                                        alt=""
                                        aria-hidden="true"
                                        className="h-6 w-auto rounded-chip object-contain"
                                    />
                                )}
                                <p
                                    className="text-t-2xs font-bold uppercase tracking-widest"
                                    style={{ color: accent }}
                                >
                                    {teamName}
                                </p>
                            </div>
                        )}
                        <h1 className="font-black uppercase tracking-display text-ink text-t-2xl">
                            {t(getGreeting())},{' '}
                            <span style={{ color: accent }}>{firstName}</span>
                        </h1>
                        <p className="mt-0.5 flex items-center gap-2 text-t-xs capitalize text-ink-muted">
                            <Calendar size={14} className="text-ink-faint" aria-hidden="true" />
                            {new Date().toLocaleDateString('es-ES', {
                                weekday: 'long', day: 'numeric', month: 'long',
                            })}
                        </p>
                    </div>
                    {headerActions && (
                        <div className="flex shrink-0 items-center gap-1">
                            {headerActions}
                        </div>
                    )}
                </header>

                <div className="flex min-h-0 flex-1 flex-row gap-4">
                    {/* COLUMNA IZQUIERDA (Principal) */}
                    <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
                        {/* HOY
                            Entrenar es la razón por la que el atleta abre la
                            app. Alto fijo por tramos, igual que "Tu equipo"
                            en el inicio del entrenador. */}
                        <section className="flex shrink-0 flex-col">
                            <SectionLabel icon={Dumbbell} colorClass={SECTION.primary}>{t('inicio.hoy')}</SectionLabel>
                            <TodayPanel
                                athleteId={user.id}
                                locked={locked}
                                onOpenTraining={() => onNavigate('planning')}
                                onOpenNutrition={() => onNavigate('nutrition')}
                                className="h-52 2xl:h-60"
                            />
                        </section>

                        {/* CHECK-IN. Trae su propia etiqueta. */}
                        <section className="mt-2 shrink-0">
                            <CheckInCard athleteId={user.id} />
                        </section>

                        {/* FRASE + COMPETICIÓN
                            Se reparten el alto que sobra. Sin competición
                            asignada, la frase se queda con la fila entera. */}
                        <section className={`grid min-h-0 flex-1 gap-2 ${nextCompetition ? 'grid-cols-[1.6fr_1fr]' : ''}`}>
                            <div className="flex h-full min-h-0 flex-col">
                                <SectionLabel icon={BookOpen} colorClass={SECTION.lessons}>Anvil Lessons</SectionLabel>
                                <div className="relative flex min-h-0 flex-1 flex-col justify-center overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-6">
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

                            {nextCompetition && (
                                <div className="flex h-full min-h-0 flex-col">
                                    <SectionLabel icon={Trophy} colorClass={SECTION.competition}>{t('inicio.proximaCompeticion')}</SectionLabel>
                                    <div className="flex min-h-0 flex-1 flex-col">
                                        <CountdownWidget assigned={nextCompetition} userId={user.id} />
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>

                    {/* COLUMNA DERECHA (Secundaria) */}
                    <div className="flex min-h-0 w-[50%] shrink-0 flex-col gap-2 overflow-hidden 2xl:w-[45%]">
                        <section className="flex min-h-0 flex-[3] flex-col">
                            <SectionLabel icon={Compass} colorClass={SECTION.hub}>Anvil Hub</SectionLabel>
                            <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
                                <NavTile icon={FileText} title={t('inicio.planificacion')} hint={t('inicio.planificacionPista')} onClick={() => onNavigate('planning')} customColor={TILE.cyan} />
                                <NavTile icon={Trophy} title={t('nav.competiciones')} hint={t('inicio.competicionesPista')} onClick={() => onNavigate('competitions')} customColor={TILE.amber} />
                                <NavTile icon={Calendar} title={t('nav.calendario')} hint={t('inicio.calendarioPista')} onClick={() => onNavigate('calendar')} customColor={TILE.purple} />
                                <NavTile icon={User} title={t('inicio.miPerfil')} hint={t('inicio.miPerfilPista')} onClick={() => onNavigate('profile')} customColor={TILE.teal} />
                                <NavTile
                                    icon={Swords}
                                    title={t('nav.arena')}
                                    hint={locked ? t('inicio.necesitasAcceso') : t('inicio.arenaPista')}
                                    onClick={() => navigate('/dashboard/community')}
                                    disabled={locked}
                                    customColor={TILE.orange}
                                />
                                <NavTile
                                    icon={Users}
                                    title={t('nav.ranking')}
                                    hint={locked ? t('inicio.necesitasAcceso') : t('inicio.rankingPista')}
                                    onClick={() => setIsRankingOpen(true)}
                                    disabled={locked}
                                    customColor={TILE.indigo}
                                />
                            </div>
                        </section>

                        <section className="flex min-h-0 flex-[2] flex-col">
                            <SectionLabel icon={FlaskConical} colorClass={SECTION.lab}>Anvil Lab</SectionLabel>
                            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
                                <NavTile icon={Weight} title={t('inicio.cargaDeBarra')} hint={t('inicio.cargaDeBarraPista')} onClick={() => setIsPlateCalcOpen(true)} customColor={TILE.pink} />
                                <NavTile icon={List} title={t('inicio.aproximaciones')} hint={t('inicio.aproximacionesPista')} onClick={() => setIsWarmUpCalcOpen(true)} customColor={TILE.indigo} />
                                <NavTile icon={Calculator} title={t('inicio.unRm')} hint={t('inicio.unRmPista')} onClick={() => setIs1RMCalcOpen(true)} customColor={TILE.emerald} />
                                <NavTile icon={Fish} title={t('inicio.sushi')} hint={t('inicio.sushiPista')} onClick={() => setIsSushiCounterOpen(true)} customColor={TILE.rose} />
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
