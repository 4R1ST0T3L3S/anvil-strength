import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, ChevronRight, Trophy, Weight, List, Calculator, Users, Swords,
    Lock, FileText, User, Fish, Dumbbell, Loader, BookOpen, Quote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

interface AthleteHomeProps {
    user: UserProfile;
    onNavigate: (view: string) => void;
    /**
     * Acciones de la cabecera en ESCRITORIO.
     *
     * En el inicio de escritorio la barra superior del armazon se oculta
     * (hideHeaderOnDesktop), asi que la campana, el conmutador de panel y
     * el menu de cuenta se sirven desde aqui. En movil llega undefined y
     * manda la barra superior de siempre.
     */
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
// PIEZAS
// =====================================================================

/**
 * Acento por ÁREA, no por botón.
 *
 * El panel anterior daba un color distinto a cada acceso: azul, verde,
 * amarillo, morado, cian, rojo… nueve tonos para nueve destinos igual de
 * importantes, que es lo mismo que no destacar ninguno.
 *
 * Aquí hay tres, y cada uno significa algo: rojo es entrenar, verde es
 * comer, ámbar es la comunidad. Se repite en todos los elementos de esa
 * área, así que el color enseña a orientarse en vez de decorar.
 */
const AREA = {
    train: { icon: 'text-brand-text', chip: 'bg-brand-quiet', ring: 'group-hover:border-[var(--brand-line)]' },
    food: { icon: 'text-success', chip: 'bg-success-quiet', ring: 'group-hover:border-[var(--border-strong)]' },
    club: { icon: 'text-warning', chip: 'bg-warning-quiet', ring: 'group-hover:border-[var(--border-strong)]' },
    tool: { icon: 'text-ink-muted', chip: 'bg-surface-overlay', ring: 'group-hover:border-[var(--border-strong)]' },
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

/**
 * Acceso del panel.
 *
 * Recupera el peso visual del panel antiguo —chip de icono, marca de agua al
 * fondo, altura de tarjeta de verdad— sin lo que sobraba: el degradado, el
 * resplandor difuminado y un color por botón.
 */
function NavTile({
    icon: Icon,
    title,
    hint,
    onClick,
    area = 'tool',
    disabled = false,
}: {
    icon: LucideIcon;
    title: string;
    hint: string;
    onClick: () => void;
    area?: AreaKey;
    disabled?: boolean;
}) {
    const a = AREA[area];
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`group relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-4 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay active:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-raised ${a.ring}`}
        >
            {/* Marca de agua. Decorativa y a muy baja opacidad: da cuerpo a la
                tarjeta sin competir con el texto. */}
            <Icon
                size={72}
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -top-3 text-ink opacity-[0.04] transition-transform duration-base ease-snap group-hover:scale-110"
            />

            <span className={`flex h-9 w-9 items-center justify-center rounded-field ${a.chip}`}>
                {disabled
                    ? <Lock size={16} className="text-ink-faint" aria-hidden="true" />
                    : <Icon size={17} className={a.icon} aria-hidden="true" />}
            </span>

            <span className="relative">
                <span className="block text-t-base font-bold leading-tight text-ink">{title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-t-xs text-ink-subtle">
                    {hint}
                    {!disabled && (
                        <ChevronRight
                            size={12}
                            aria-hidden="true"
                            className="transition-transform duration-fast ease-snap group-hover:translate-x-0.5"
                        />
                    )}
                </span>
            </span>
        </button>
    );
}

// =====================================================================
// PANTALLA
// =====================================================================

/**
 * Inicio del atleta.
 *
 * Un solo árbol para móvil y escritorio. Antes había DOS —`MobileHome` y
 * `DesktopHome`, ocultos con `md:hidden` / `hidden md:flex`— con el mismo
 * contenido escrito dos veces: cada arreglo había que hacerlo por duplicado,
 * llevaban meses divergiendo, y el navegador recibía el doble de marcado del
 * que llega a pintar.
 *
 * El orden es el de un día real: lo que toca hacer hoy, lo que viene después,
 * y al final las herramientas que se abren de vez en cuando.
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
            <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 pb-24 md:px-8 md:py-10">
                {/* Con la puerta en modo aviso (K1) esto informa y no corta.
                    Con la puerta cerrada, el panel de "Hoy" ya está bloqueado
                    mas abajo y esta franja explica por que. */}
                <AvisoDePago resultado={puerta.resultado} />
                {/* ---------------------------------------------------------
                    CABECERA                                              */}
                <header className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        {teamName && (
                            <div className="mb-2.5 flex items-center gap-2.5">
                                {user.coach_logo_url && (
                                    <img
                                        src={user.coach_logo_url}
                                        alt=""
                                        aria-hidden="true"
                                        className="h-7 w-auto rounded-chip object-contain"
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
                        <h1 className="text-t-3xl font-black uppercase tracking-display text-ink md:text-t-4xl">
                            {t(getGreeting())},{' '}
                            <span style={{ color: accent }}>{firstName}</span>
                        </h1>
                        <p className="mt-1.5 flex items-center gap-2 text-t-sm capitalize text-ink-muted">
                            <Calendar size={14} className="text-ink-faint" aria-hidden="true" />
                            {new Date().toLocaleDateString('es-ES', {
                                weekday: 'long', day: 'numeric', month: 'long',
                            })}
                        </p>
                    </div>
                    {/* En el inicio de escritorio la barra superior del armazon se
                        oculta, asi que sus acciones (avisos, conmutador de panel,
                        cuenta) se pintan aqui. En movil llega undefined y manda la
                        barra superior de siempre. */}
                    {headerActions && (
                        <div className="hidden shrink-0 items-center gap-1 md:flex">
                            {headerActions}
                        </div>
                    )}
                </header>

                {/* ---------------------------------------------------------
                    HOY
                    Entrenar es la razón por la que el atleta abre la app: es
                    lo único con tratamiento de acción primaria en toda la
                    pantalla, y ocupa el ancho que le corresponde.        */}
                <section>
                    <SectionLabel icon={Dumbbell}>{t('inicio.hoy')}</SectionLabel>

                    {/* El entrenamiento pautado y los macros del día, con datos
                        de verdad. Antes eran dos botones que no decían nada de
                        lo que había detrás: para saber qué tocaba hoy había que
                        entrar en otra pantalla y esperar a que cargara. */}
                    <TodayPanel
                        athleteId={user.id}
                        locked={locked}
                        onOpenTraining={() => onNavigate('planning')}
                        onOpenNutrition={() => onNavigate('nutrition')}
                    />

                    <div className="mt-3">
                        <CheckInCard athleteId={user.id} />
                    </div>
                </section>

                {/* ---------------------------------------------------------
                    FRASE + COMPETICIÓN
                    Las dos cosas que se miran y no se tocan van juntas en una
                    fila, la frase con más peso porque es lo que se lee.
                    Sin competición asignada, la frase se queda con la fila
                    entera en vez de dejar un hueco.                       */}
                <section className={`grid gap-3 ${nextCompetition ? 'lg:grid-cols-[1.6fr_1fr]' : ''}`}>
                    <div>
                        <SectionLabel icon={BookOpen}>Anvil Lessons</SectionLabel>
                        <div className="relative flex min-h-[160px] flex-col justify-center overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
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

                    {nextCompetition && (
                        <div>
                            <SectionLabel icon={Trophy}>{t('inicio.proximaCompeticion')}</SectionLabel>
                            <CountdownWidget assigned={nextCompetition} userId={user.id} />
                        </div>
                    )}
                </section>

                {/* ---------------------------------------------------------
                    PANEL DE CONTROL                                      */}
                <section>
                    <SectionLabel icon={FileText}>{t('inicio.tuCarrera')}</SectionLabel>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <NavTile area="train" icon={FileText} title={t('inicio.planificacion')} hint={t('inicio.planificacionPista')} onClick={() => onNavigate('planning')} />
                        <NavTile area="club" icon={Trophy} title={t('nav.competiciones')} hint={t('inicio.competicionesPista')} onClick={() => onNavigate('competitions')} />
                        <NavTile area="train" icon={Calendar} title={t('nav.calendario')} hint={t('inicio.calendarioPista')} onClick={() => onNavigate('calendar')} />
                        <NavTile area="tool" icon={User} title={t('inicio.miPerfil')} hint={t('inicio.miPerfilPista')} onClick={() => onNavigate('profile')} />
                        <NavTile
                            area="club"
                            icon={Swords}
                            title={t('nav.arena')}
                            hint={locked ? t('inicio.necesitasAcceso') : t('inicio.arenaPista')}
                            onClick={() => navigate('/dashboard/community')}
                            disabled={locked}
                        />
                        <NavTile
                            area="club"
                            icon={Users}
                            title={t('nav.ranking')}
                            hint={locked ? t('inicio.necesitasAcceso') : t('inicio.rankingPista')}
                            onClick={() => setIsRankingOpen(true)}
                            disabled={locked}
                        />
                    </div>
                </section>

                {/* ---------------------------------------------------------
                    HERRAMIENTAS                                          */}
                <section>
                    <SectionLabel icon={Calculator}>Anvil Lab</SectionLabel>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <NavTile icon={Weight} title={t('inicio.cargaDeBarra')} hint={t('inicio.cargaDeBarraPista')} onClick={() => setIsPlateCalcOpen(true)} />
                        <NavTile icon={List} title={t('inicio.aproximaciones')} hint={t('inicio.aproximacionesPista')} onClick={() => setIsWarmUpCalcOpen(true)} />
                        <NavTile icon={Calculator} title={t('inicio.unRm')} hint={t('inicio.unRmPista')} onClick={() => setIs1RMCalcOpen(true)} />
                        <NavTile icon={Fish} title={t('inicio.sushi')} hint={t('inicio.sushiPista')} onClick={() => setIsSushiCounterOpen(true)} />
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
