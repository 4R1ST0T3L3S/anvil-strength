import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, ChevronRight, Trophy, Weight, List, Calculator, Users, Swords,
    Lock, FileText, Fish, Dumbbell, Loader, BookOpen, Quote, FlaskConical, Compass,
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
import { Preferences } from '@capacitor/preferences';
import { CountdownWidget } from '../../../components/ui/CountdownWidget';
import { usePuertaDePago } from '../../../hooks/usePuertaDePago';
import { vistaBloqueada } from '../../../lib/billing';
import { AvisoDePago } from '../../../components/ui/BloqueoDePago';

interface AthleteHomeProps {
    user: UserProfile;
    onNavigate: (view: string) => void;
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

function SectionLabel({ icon: Icon, children, colorClass }: { icon: LucideIcon; children: React.ReactNode; colorClass?: string }) {
    return (
        <h2 className="my-4 flex items-center gap-2 text-t-sm font-bold uppercase tracking-widest text-ink-subtle">
            <Icon size={18} aria-hidden="true" className={colorClass || "text-ink-faint"} />
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
    customColor,
    disabled = false,
}: {
    icon: LucideIcon;
    title: string;
    hint: string;
    onClick: () => void;
    customColor: { icon: string; chip: string; ring: string };
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`group relative flex h-full min-h-[96px] xl:min-h-0 w-full flex-col justify-between overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-3 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay active:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-raised ${customColor.ring}`}
        >
            <Icon
                size={72}
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -top-3 text-ink opacity-[0.04] transition-transform duration-base ease-snap group-hover:scale-110"
            />
            <span className={`flex h-8 w-8 xl:h-7 xl:w-7 shrink-0 items-center justify-center rounded-field ${customColor.chip}`}>
                {disabled
                    ? <Lock size={16} className="text-ink-faint" aria-hidden="true" />
                    : <Icon size={16} className={customColor.icon} aria-hidden="true" />}
            </span>
            <span className="relative mt-1.5 xl:mt-1 flex flex-col min-h-0 overflow-hidden">
                <span className="block text-t-sm xl:text-t-base font-bold leading-tight text-ink truncate">{title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] xl:text-t-xs text-ink-subtle truncate">
                    <span className="truncate">{hint}</span>
                    {!disabled && (
                        <ChevronRight size={12} aria-hidden="true" className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
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
        
        // Guardar la frase para el widget nativo
        const quote = getAnvilQuote();
        Preferences.set({ key: 'widget_lesson_quote', value: quote }).catch(console.error);

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
            <div className="mx-auto flex min-h-full xl:h-[calc(100vh-64px)] w-full max-w-none flex-col px-4 py-4 md:px-8 xl:px-12 xl:py-4 xl:overflow-hidden">
                {/* Con la puerta en modo aviso (K1) esto informa y no corta.
                    Con la puerta cerrada, el panel de "Hoy" ya est bloqueado
                    mas abajo y esta franja explica por que. */}
                <AvisoDePago resultado={puerta.resultado} />
                {/* ---------------------------------------------------------
                    CABECERA                                              */}
                <header className="mb-4 shrink-0 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        {teamName && (
                            <div className="mb-2 flex items-center gap-2">
                                {user.coach_logo_url && (
                                    <img
                                        src={user.coach_logo_url}
                                        alt=""
                                        aria-hidden="true"
                                        className="h-6 w-auto rounded-chip object-contain"
                                    />
                                )}
                                <p
                                    className="text-[10px] font-bold uppercase tracking-widest"
                                    style={{ color: accent }}
                                >
                                    {teamName}
                                </p>
                            </div>
                        )}
                        <h1 className="text-t-xl md:text-t-2xl font-black uppercase tracking-display text-ink">
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
                    {/* La barra superior del armazón se oculta siempre en
                        móvil (no solo en escritorio, desde el 30 ago 2026),
                        así que sus acciones (avisos, conmutador de panel,
                        cuenta) se pintan aquí en los dos tamaños. */}
                    {headerActions && (
                        <div className="flex shrink-0 items-center gap-1">
                            {headerActions}
                        </div>
                    )}
                </header>

                {/* -----------------------------------------------------
                    DOS COLUMNAS — HOY Y ACCESOS

                    Izquierda: lo que toca hacer hoy (entreno + dieta),
                    el cuestionario, la frase del día y la competición.
                    Derecha: el resto de la app, en accesos compactos.

                    En móvil y tablet, la derecha cae debajo de la
                    izquierda; nada se apila fila a fila como antes.       */}
                <div className="flex flex-1 flex-col xl:flex-row gap-4 min-h-0">
                    {/* COLUMNA IZQUIERDA (Principal) */}
                    <div className="flex flex-1 flex-col gap-4 min-w-0 overflow-hidden">
                        {/* HOY
                            Entrenar es la razón por la que el atleta abre la
                            app: es lo único con tratamiento de acción
                            primaria en toda la pantalla. */}
                        <section className="flex shrink-0 flex-col">
                            <SectionLabel icon={Dumbbell} colorClass="text-brand">{t('inicio.hoy')}</SectionLabel>

                            {/* El entrenamiento pautado y los macros del día,
                                con datos de verdad. Antes eran dos botones
                                que no decían nada de lo que había detrás:
                                para saber qué tocaba hoy había que entrar en
                                otra pantalla y esperar a que cargara. */}
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

                        {/* FRASE + COMPETICIÓN
                            Las dos cosas que se miran y no se tocan van
                            juntas en una fila, la frase con más peso porque
                            es lo que se lee. Sin competición asignada, la
                            frase se queda con la fila entera en vez de
                            dejar un hueco. */}
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
                                <SectionLabel icon={Trophy} colorClass="text-[#f59e0b]">{t('inicio.proximaCompeticion')}</SectionLabel>
                                <div className="flex flex-1 flex-col">
                                    {loading ? (
                                        <div className="flex flex-1 items-center justify-center rounded-card border border-[var(--border-default)] bg-surface-raised min-h-[160px]">
                                            <Loader className="animate-spin text-brand" size={24} />
                                        </div>
                                    ) : (
                                        <CountdownWidget assigned={nextCompetition} userId={user.id} />
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* COLUMNA DERECHA (Secundaria) */}
                    <div className="flex flex-col xl:w-80 2xl:w-96 gap-4 shrink-0 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-hide pb-20 xl:pb-0">
                        <section className="flex shrink-0 flex-col">
                            <SectionLabel icon={Compass} colorClass="text-[#3b82f6]">Anvil Hub</SectionLabel>
                            <div className="grid grid-cols-2 gap-2">
                                <NavTile icon={FileText} title={t('inicio.planificacion')} hint={t('inicio.planificacionPista')} onClick={() => onNavigate('planning')} customColor={{ icon: 'text-cyan-500', chip: 'bg-cyan-500/10', ring: 'group-hover:border-cyan-500/50' }} />
                                <NavTile icon={Calendar} title={t('nav.calendario')} hint={t('inicio.calendarioPista')} onClick={() => onNavigate('calendar')} customColor={{ icon: 'text-purple-500', chip: 'bg-purple-500/10', ring: 'group-hover:border-purple-500/50' }} />
                                <NavTile
                                    icon={Swords} title={t('nav.arena')} hint={locked ? t('inicio.necesitasAcceso') : t('inicio.arenaPista')} onClick={() => navigate('/dashboard/community')} disabled={locked} customColor={{ icon: 'text-orange-500', chip: 'bg-orange-500/10', ring: 'group-hover:border-orange-500/50' }} />
                                <NavTile
                                    icon={Users} title={t('nav.ranking')} hint={locked ? t('inicio.necesitasAcceso') : t('inicio.rankingPista')} onClick={() => setIsRankingOpen(true)} disabled={locked} customColor={{ icon: 'text-indigo-500', chip: 'bg-indigo-500/10', ring: 'group-hover:border-indigo-500/50' }} />
                            </div>
                        </section>

                        <section className="flex shrink-0 flex-col">
                            <SectionLabel icon={FlaskConical} colorClass="text-[#10b981]">Anvil Lab</SectionLabel>
                            <div className="grid grid-cols-2 gap-2">
                                <NavTile icon={Weight} title={t('inicio.cargaDeBarra')} hint={t('inicio.cargaDeBarraPista')} onClick={() => setIsPlateCalcOpen(true)} customColor={{ icon: 'text-pink-500', chip: 'bg-pink-500/10', ring: 'group-hover:border-pink-500/50' }} />
                                <NavTile icon={List} title={t('inicio.aproximaciones')} hint={t('inicio.aproximacionesPista')} onClick={() => setIsWarmUpCalcOpen(true)} customColor={{ icon: 'text-indigo-500', chip: 'bg-indigo-500/10', ring: 'group-hover:border-indigo-500/50' }} />
                                <NavTile icon={Calculator} title={t('inicio.unRm')} hint={t('inicio.unRmPista')} onClick={() => setIs1RMCalcOpen(true)} customColor={{ icon: 'text-emerald-500', chip: 'bg-emerald-500/10', ring: 'group-hover:border-emerald-500/50' }} />
                                <NavTile icon={Fish} title={t('inicio.sushi')} hint={t('inicio.sushiPista')} onClick={() => setIsSushiCounterOpen(true)} customColor={{ icon: 'text-rose-500', chip: 'bg-rose-500/10', ring: 'group-hover:border-rose-500/50' }} />
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











