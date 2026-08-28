import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, ChevronRight, Trophy, Weight, List, Calculator, Users, Swords,
    Lock, FileText, User, Fish, Dumbbell, Loader, BookOpen, Quote,
    Zap, Medal, Crown, FlaskConical
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
import { competitionsService, CompetitionAssignment } from '../../../services/competitionsService';
import { CountdownWidget } from '../../../components/ui/CountdownWidget';

interface AthleteHomeProps {
    user: UserProfile;
    onNavigate: (view: string) => void;
}

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return 'Buenos días';
    if (hour >= 14 && hour < 21) return 'Buenas tardes';
    return 'Buenas noches';
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
    train: { icon: 'text-brand', chip: 'bg-brand-quiet', ring: 'group-hover:border-[var(--brand-line)]' },
    food: { icon: 'text-success', chip: 'bg-success-quiet', ring: 'group-hover:border-[var(--border-strong)]' },
    club: { icon: 'text-warning', chip: 'bg-warning-quiet', ring: 'group-hover:border-[var(--border-strong)]' },
    tool: { icon: 'text-ink-muted', chip: 'bg-surface-overlay', ring: 'group-hover:border-[var(--border-strong)]' },
} as const;

type AreaKey = keyof typeof AREA;

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
    area = 'tool',
    disabled = false,
    customColor,
}: {
    icon: LucideIcon;
    title: string;
    hint: string;
    onClick: () => void;
    area?: AreaKey;
    disabled?: boolean;
    customColor?: { icon: string, chip: string, ring: string };
}) {
    const a = customColor || AREA[area];
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`group relative flex h-full min-h-[110px] xl:min-h-0 w-full flex-col justify-between overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-3 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay active:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-raised ${a.ring}`}
        >
            {/* Marca de agua. Decorativa y a muy baja opacidad: da cuerpo a la
                tarjeta sin competir con el texto. */}
            <Icon
                size={72}
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -top-3 text-ink opacity-[0.04] transition-transform duration-base ease-snap group-hover:scale-110"
            />

            <span className={`flex h-8 w-8 xl:h-7 xl:w-7 shrink-0 items-center justify-center rounded-field ${a.chip}`}>
                {disabled
                    ? <Lock size={16} className="text-ink-faint" aria-hidden="true" />
                    : <Icon size={16} className={a.icon} aria-hidden="true" />}
            </span>

            <span className="relative mt-1.5 xl:mt-1 flex flex-col min-h-0 overflow-hidden">
                <span className="block text-t-sm xl:text-t-base font-bold leading-tight text-ink truncate">{title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] xl:text-t-xs text-ink-subtle truncate">
                    <span className="truncate">{hint}</span>
                    {!disabled && (
                        <ChevronRight
                            size={12}
                            aria-hidden="true"
                            className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5"
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
                <Loader className="animate-spin text-brand" size={28} />
            </div>
        );
    }

    const firstName = user.full_name?.split(' ')[0] || 'Atleta';
    const teamName = user.role === 'athlete' ? getTeamName(user.coach_name) : null;
    const locked = user.has_access === false;
    const accent = user.coach_brand_color || 'var(--brand)';

    return (
        <>
            <div className="mx-auto flex min-h-full xl:h-[calc(100vh-64px)] w-full max-w-none flex-col px-4 py-4 md:px-8 xl:px-12 xl:py-4 xl:overflow-hidden">
                {/* ---------------------------------------------------------
                    CABECERA                                              */}
                <header className="mb-4 shrink-0 flex items-start justify-between gap-4">
                    <div>
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
                                    className="text-t-2xs font-bold uppercase tracking-widest"
                                    style={{ color: accent }}
                                >
                                    {teamName}
                                </p>
                            </div>
                        )}
                        <h1 className="text-t-xl md:text-t-2xl font-black uppercase tracking-display text-ink">
                            {getGreeting()},{' '}
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
                        <div className="hidden md:flex items-center gap-1">
                            {headerActions}
                        </div>
                    )}
                </header>

                <div className="flex flex-1 flex-col xl:flex-row gap-4 min-h-0">
                    {/* COLUMNA IZQUIERDA (Principal) */}
                    <div className="flex flex-1 flex-col gap-4 min-w-0 xl:overflow-hidden">
                        
                        <div className="shrink-0">
                            <CheckInCard athleteId={user.id} />
                        </div>

                        {/* ---------------------------------------------------------
                            FRASE + COMPETICIÓN
                            El panel de la izquierda tiene el saludo, que da el
                            contexto personal, y debajo el bloque motivacional.
                            Sin competición asignada, la frase se queda con la fila
                            entera en vez de dejar un hueco.                       */}
                        <section className={`flex flex-1 grid gap-2 min-h-0 ${nextCompetition ? 'lg:grid-cols-[1.6fr_1fr]' : ''}`}>
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
                                    <p className="relative mt-4 text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                                        Anvil Strength Club
                                    </p>
                                </div>
                            </div>

                            {nextCompetition && (
                                <div className="flex flex-col h-full min-h-0">
                                    <SectionLabel icon={Trophy} colorClass="text-[#f59e0b]">Próxima competición</SectionLabel>
                                    <div className="flex flex-1 flex-col">
                                        <CountdownWidget assigned={nextCompetition} userId={user.id} />
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>

                    {/* COLUMNA DERECHA (Secundaria) */}
                    <div className="flex shrink-0 flex-col gap-4 xl:w-[50%] 2xl:w-[45%] min-h-0 xl:overflow-hidden">
                        {/* ---------------------------------------------------------
                            PANEL DE CONTROL                                      */}
                        <section className="flex flex-[3] flex-col min-h-0">
                            <SectionLabel icon={Swords} colorClass="text-[#cd7f32]">El Club</SectionLabel>
                            <div className="grid flex-1 grid-cols-2 gap-2 min-h-0">
                                <NavTile icon={FileText} title="Planificación" hint="Bloques y sesiones" onClick={() => onNavigate('planning')} customColor={{ icon: 'text-red-500', chip: 'bg-red-500/10', ring: 'group-hover:border-red-500/50' }} />
                                <NavTile icon={Trophy} title="Competiciones" hint="Marcas y eventos" onClick={() => onNavigate('competitions')} customColor={{ icon: 'text-amber-500', chip: 'bg-amber-500/10', ring: 'group-hover:border-amber-500/50' }} />
                                <NavTile icon={Swords} title="La Arena" hint={locked ? 'Necesitas acceso completo' : 'Apuestas del club'} disabled={locked} onClick={() => onNavigate('arena')} customColor={{ icon: 'text-orange-500', chip: 'bg-orange-500/10', ring: 'group-hover:border-orange-500/50' }} />
                                <NavTile icon={Medal} title="Ranking Anvil" hint="Clasificación general" onClick={() => onNavigate('ranking')} customColor={{ icon: 'text-purple-500', chip: 'bg-purple-500/10', ring: 'group-hover:border-purple-500/50' }} />
                            </div>
                        </section>

                        {/* ---------------------------------------------------------
                            HERRAMIENTAS                                          */}
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
