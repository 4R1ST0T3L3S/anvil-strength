import React, { useState, useEffect, lazy, Suspense } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AnvilMascot } from '../../../components/ui/AnvilMascot';
import { Trophy, FileText, Mail, Instagram, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { TeamModal } from '../../../components/modals/TeamModal';
import { AthleteDetailsModal } from '../../../components/modals/AthleteDetailsModal';
import { CoachDetailsModal } from '../../../components/modals/CoachDetailsModal';
import { ReviewsSection } from '../../reviews/components/ReviewsSection';
import { StatsSection } from '../components/StatsSection';
import { Fold, PressButton, Reveal, StaggerList, StaggerItem } from '../components/landingKit';
import { HowItWorksSection } from '../components/HowItWorksSection';
import { FAQSection } from '../components/FAQSection';
import { SmartAuthButton } from '../../../components/ui/SmartAuthButton';
import { athletes, Athlete } from '../../../data/athletes';
import { coaches, Coach } from '../../../data/coaches';
import { nutritionists } from '../../../data/nutritionists';
import { achievements as allAchievements, Achievement } from '../../../data/achievements';
import { SafeImage } from '../../../components/ui/SafeImage';
import { Modal } from '../../../components/ui/Modal';

import { useSeo } from '../../../hooks/useSeo';
import { UserProfile } from '../../../hooks/useUser';
import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';

/**
 * Typebot pesa 608 KB minificado — más que React, el router y Supabase juntos.
 * Se cargaba en el bundle inicial de la portada aunque el widget arranca
 * oculto (`.typebot-bubble-button { display: none }` en index.css) y solo se
 * abre al pulsar la mascota. Ahora el chunk se descarga en ese clic.
 */
const Bubble = lazy(() =>
    import("@typebot.io/react").then((m) => ({ default: m.Bubble }))
);

interface LandingPageProps {
    onLoginClick: () => void;
    /** Abre el modal directamente en la pestaña de alta. */
    onSignupClick?: () => void;
    user?: UserProfile | null;
    /** La misma portada servida en /inicio, que no debe indexarse. */
    noindex?: boolean;
}

const featuredAchievements = allAchievements;



export function LandingPage({ onLoginClick, onSignupClick, user, noindex }: LandingPageProps) {
    // Solo se declara metainformación en /inicio. En "/" mandan las etiquetas
    // de index.html, que ya son las correctas y las únicas que ven los
    // rastreadores que no ejecutan JavaScript.
    useSeo({
        title: 'Anvil Strength | Club de Powerlifting Online en España — Gratis',
        description: 'Anvil Strength es el club de powerlifting digital de España. Gratis, sin sede física, afiliado AEP e IPF. Entrenadores de élite, app exclusiva y comunidad real. ¿Empezamos?',
        canonical: 'https://anvilstrength.es/',
        noindex: noindex === true,
    });

    const reduceMotion = useReducedMotion();

    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
    const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
    // El widget de chat solo se monta cuando el usuario lo pide. `pendingOpen`
    // recuerda que hay que abrirlo en cuanto el chunk termine de cargar, para
    // que el primer clic no se pierda.
    const [isBotMounted, setIsBotMounted] = useState(false);
    const [pendingOpen, setPendingOpen] = useState(false);
    // Carousel State
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [isManualMode, setIsManualMode] = useState(false);
    const [lastInteraction, setLastInteraction] = useState(() => Date.now());
        // Dentro de la función LandingPage, junto a los otros useState:
    const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
    const [isAllAchievementsModalOpen, setIsAllAchievementsModalOpen] = useState(false);


    // Añade esto debajo de tus useState
    // Typebot vuelve a pintar su propio botón, que aquí sobra porque abrimos
    // desde la mascota. Antes esto corría cada 100ms durante toda la vida de
    // la página; ahora solo mientras el widget existe, y para en cuanto lo oculta.
    useEffect(() => {
        if (!isBotMounted) return;
        const hide = () => {
            const btn = document.querySelector<HTMLElement>('.typebot-bubble-button');
            if (btn) { btn.style.display = 'none'; return true; }
            return false;
        };
        if (hide()) return;
        const interval = setInterval(() => { if (hide()) clearInterval(interval); }, 100);
        return () => clearInterval(interval);
    }, [isBotMounted]);

    // Al llegar a la portada desde otra ruta (por ejemplo pulsando ATLETAS
    // estando en /competiciones) la URL trae un hash, pero el navegador no
    // puede saltar solo porque la sección todavía no existe en el DOM. Se
    // espera un frame y se hace el salto a mano.
    useEffect(() => {
        const hash = window.location.hash;
        if (!hash || hash.length < 2) return;
        const timer = window.setTimeout(() => {
            document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
        return () => window.clearTimeout(timer);
    }, []);

    // Abre el chat en cuanto está disponible, aunque el clic ocurriera antes
    // de que el chunk terminase de descargarse: así no se pierde el primer clic.
    useEffect(() => {
        if (!pendingOpen || !isBotMounted) return;
        const timer = setInterval(() => {
            const api = (window as { Typebot?: { toggle?: () => void } }).Typebot;
            if (api?.toggle) {
                api.toggle();
                setPendingOpen(false);
                clearInterval(timer);
            }
        }, 120);
        return () => clearInterval(timer);
    }, [pendingOpen, isBotMounted]);

    useEffect(() => {
        if (isPaused || isManualMode) return;
        const timer = setInterval(() => {
            setIsTransitioning(true);
            setCarouselIndex((prev) => prev + 1);
        }, 3000);
        return () => clearInterval(timer);
    }, [isPaused, isManualMode]);

    useEffect(() => {
        if (!isManualMode) return;
        const checkIdle = setInterval(() => {
            const now = Date.now();
            if (now - lastInteraction > 30000 && !selectedAthlete) {
                setIsManualMode(false);
            }
        }, 1000);
        return () => clearInterval(checkIdle);
    }, [isManualMode, lastInteraction, selectedAthlete]);

    const handleManualNav = (direction: 'prev' | 'next') => {
        setIsManualMode(true);
        setLastInteraction(Date.now());
        if (direction === 'next') {
            setIsTransitioning(true);
            setCarouselIndex((prev) => prev + 1);
        } else {
            if (carouselIndex === 0) {
                setIsTransitioning(false);
                setCarouselIndex(athletes.length);
                setTimeout(() => {
                    setIsTransitioning(true);
                    setCarouselIndex(athletes.length - 1);
                }, 10);
            } else {
                setIsTransitioning(true);
                setCarouselIndex((prev) => prev - 1);
            }
        }
    };

    useEffect(() => {
        if (carouselIndex === athletes.length) {
            const timer = setTimeout(() => {
                setIsTransitioning(false);
                setCarouselIndex(0);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [carouselIndex]);


    const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        e.preventDefault();
        const element = document.querySelector(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    return (
        <div className="font-sans bg-surface-canvas">
            <PublicHeader onLoginClick={onLoginClick} onSignupClick={onSignupClick} />

            {/* =====================================================
                1. PORTADA
                =====================================================
                Una sola idea: quién somos y qué se hace aquí. La foto
                ocupa el fold entero porque un club se vende enseñando
                gente levantando, no describiéndolo.

                El degradado inferior no es decoración: sin él, el texto
                blanco se apoya en la zona clara de la foto y deja de
                leerse. Va del color del siguiente fold para que el corte
                entre secciones no se vea.                              */}
            <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src="/portadaanvil2.jpg"
                        alt="Atleta de Anvil Strength en plena sentadilla durante una competición"
                        className="h-full w-full object-cover"
                        fetchPriority="high"
                    />
                    <div className="absolute inset-0 bg-surface-sunken/55" />
                    <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-fold-light to-transparent" />
                </div>

                <div className="relative z-10 mx-auto w-full max-w-[1180px] px-6 pb-24 pt-32 text-center md:px-10">
                    <m.h1
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                        className="text-d-lg font-black uppercase text-white"
                    >
                        Anvil Strength
                    </m.h1>

                    {/* LEMA, en la fuente display — el único contraste
                        tipográfico deliberado de toda la portada. La frase
                        descriptiva ("club de powerlifting digital...") no
                        desaparece: vive en el fold siguiente, que es donde
                        de verdad se explica qué es el club. Aquí solo hace
                        falta una idea, no un resumen. */}
                    <m.p
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                        className="mt-5 font-display text-[clamp(1.75rem,5vw,3rem)] uppercase leading-[0.95] tracking-[0.01em] text-white/90"
                    >
                        Where champions are forged
                    </m.p>

                    <m.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.65, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
                    >
                        {!user ? (
                            <PressButton onClick={onSignupClick ?? onLoginClick} className="w-full sm:w-auto">
                                Crear cuenta gratis
                            </PressButton>
                        ) : (
                            <SmartAuthButton variant="primary" onLoginClick={onLoginClick} className="w-full sm:w-auto" />
                        )}
                        <a
                            href="#filosofia"
                            onClick={(e) => scrollToSection(e, '#filosofia')}
                            className="text-t-sm font-bold uppercase tracking-wide text-white/70 underline-offset-8 transition-colors duration-fast hover:text-white hover:underline"
                        >
                            Ver de qué va
                        </a>
                    </m.div>
                </div>
            </section>

            {/* =====================================================
                2. QUÉ ES ANVIL — fold claro
                =====================================================
                Sustituye a las dos rejillas de tarjetas que había aquí
                (cuatro "pilares" + seis "beneficios"): dieciséis cajas
                idénticas con un icono arriba, que es la forma más rápida
                de que una página parezca una plantilla y la más lenta de
                leer. Ahora son cuatro afirmaciones en texto corrido, que
                es como se lee una idea.                                */}
            <Fold id="filosofia" tone="light" className="py-24 md:py-32">
                <div className="grid gap-14 md:grid-cols-[1fr_0.85fr] md:items-start md:gap-20">
                    <div>
                        <h2 className="text-d-md font-black uppercase leading-[0.95] text-fold-light-ink text-balance">
                            Un club sin
                            <br />
                            puerta de entrada
                        </h2>
                        <p className="mt-8 max-w-[62ch] text-t-lg leading-relaxed text-fold-light-ink-muted">
                            Anvil Strength nació de una idea sencilla: el powerlifting no debería
                            ser un deporte cerrado. Si quieres competir, ya tienes sitio. No hace
                            falta que muevas ningún número concreto ni que vengas de ningún lado.
                        </p>

                        <dl className="mt-12 space-y-8">
                            {[
                                {
                                    t: 'No tiene sede, y es a propósito',
                                    d: 'Entrenas en tu gimnasio, estés donde estés, y compites bajo el nombre del club. Nadie se muda por entrenar.',
                                },
                                {
                                    t: 'Cuesta cero euros',
                                    d: 'Unirse no tiene coste. Solo pagas las tasas oficiales de federación y las inscripciones a cada competición, que van íntegras a la AEP.',
                                },
                                {
                                    t: 'Federados en AEP e IPF',
                                    d: 'Compites en campeonatos oficiales, con marcas homologadas y ranking que cuenta.',
                                },
                                {
                                    t: 'Entrenador y nutricionista',
                                    d: 'Asignados de verdad, con la programación dentro de la app y contacto directo por chat.',
                                },
                            ].map(({ t, d }) => (
                                <Reveal key={t}>
                                    <dt className="text-t-xl font-black uppercase tracking-display text-fold-light-ink">
                                        {t}
                                    </dt>
                                    <dd className="mt-2 max-w-[62ch] text-t-base leading-relaxed text-fold-light-ink-muted">
                                        {d}
                                    </dd>
                                </Reveal>
                            ))}
                        </dl>
                    </div>

                    <Reveal className="md:sticky md:top-28">
                        <div className="overflow-hidden rounded-sheet">
                            <img
                                src="/filosofia-competition.jpg"
                                alt="Un atleta del club bloquea un peso muerto ante los tres jueces"
                                className="aspect-[4/5] w-full object-cover"
                                loading="lazy"
                            />
                        </div>
                        <p className="mt-4 text-t-sm leading-relaxed text-fold-light-ink-muted">
                            En un deporte con normas de competición, entrena con normas de
                            competición. Tú pones el esfuerzo; nosotros, la estructura.
                        </p>
                    </Reveal>
                </div>
            </Fold>

            {/* 3. CIFRAS — banda estrecha, no un fold entero. Son un dato
                   de apoyo, no el argumento. */}
            <StatsSection />

            {/* 4. CÓMO SE EMPIEZA — los números aquí SÍ son una secuencia
                   real, no un adorno de sección. */}
            <HowItWorksSection />

            {/* =====================================================
                5. QUÉ TRAE LA APP
                ===================================================== */}
            <Fold id="software" tone="dark" className="py-24 md:py-28">
                <div className="max-w-2xl">
                    <h2 className="text-d-sm font-black uppercase leading-[1.02] text-ink text-balance">
                        Y una aplicación que hace el trabajo aburrido
                    </h2>
                    <p className="mt-5 text-t-lg leading-relaxed text-ink-muted">
                        La misma que usan los entrenadores del club para programar. Incluida.
                    </p>
                </div>

                <StaggerList className="mt-14 grid grid-cols-1 gap-x-12 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                        ['Programación semanal', 'Tu entrenador publica la semana y la ves con sus series, kilos y RPE. Registras desde el móvil entre series.'],
                        ['Vídeo y VBT', 'Subes la serie, tu entrenador la corrige. Si usas encoder, el archivo se asocia a la serie que toca.'],
                        ['Estadísticas reales', 'Tonelaje, intensidad y progresión por ejercicio. Sin hojas de cálculo.'],
                        ['Chat directo', 'Con tu entrenador y tu nutricionista. Sin buscar el mensaje entre cien de un grupo.'],
                        ['Calendario', 'Competiciones, inscripciones y la planificación del año de un vistazo.'],
                        ['Comunidad', 'Ranking del club, logros y la Arena. Entrenas solo, pero no estás solo.'],
                    ].map(([t, d]) => (
                        <StaggerItem key={t}>
                            <h3 className="text-t-lg font-black uppercase tracking-display text-ink">{t}</h3>
                            <p className="mt-2 text-t-sm leading-relaxed text-ink-muted">{d}</p>
                        </StaggerItem>
                    ))}
                </StaggerList>
            </Fold>

            {/* =====================================================
                6. STAFF TÉCNICO
                ===================================================== */}
            <Fold id="entrenadores" tone="light" className="py-24 md:py-32">
                <Reveal>
                    <h2 className="text-d-md font-black uppercase leading-[0.95] text-fold-light-ink">
                        Quién te entrena
                    </h2>
                    <p className="mt-5 max-w-[52ch] text-t-lg leading-relaxed text-fold-light-ink-muted">
                        Personas concretas, con nombre y con historial. Pulsa para ver el suyo.
                    </p>
                    <p className="mt-3 max-w-[52ch] text-t-sm text-fold-light-ink-muted/70">
                        El club no cobra cuota. El entrenamiento personalizado con cualquiera de
                        ellos es un servicio de pago que se acuerda directamente con el entrenador.
                    </p>
                </Reveal>

                <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {coaches.map((coach) => (
                        <button
                            key={coach.id}
                            onClick={() => setSelectedCoach(coach)}
                            className="group relative aspect-[3/4] overflow-hidden rounded-sheet bg-surface-sunken text-left transition-transform duration-base ease-snap hover:-translate-y-1"
                        >
                            <SafeImage
                                src={coach.image}
                                alt={`${coach.name}, ${coach.role} de Anvil Strength`}
                                className="h-full w-full object-cover transition-transform duration-slow ease-snap group-hover:scale-[1.04]"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-surface-sunken via-surface-sunken/25 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 p-6">
                                <span className="text-t-2xs font-black uppercase tracking-widest text-brand">
                                    Entrenador
                                </span>
                                <h3 className="mt-1 text-t-2xl font-black uppercase leading-none text-white">
                                    {coach.name}
                                </h3>
                                <p className="mt-1.5 text-t-sm font-medium text-white/70">{coach.role}</p>
                            </div>
                            {coach.logo && (
                                <img
                                    src={coach.logo}
                                    alt=""
                                    aria-hidden="true"
                                    className="absolute right-5 top-5 h-12 w-12 object-contain opacity-70"
                                />
                            )}
                        </button>
                    ))}

                    {nutritionists.map((nutri) => (
                        <div
                            key={nutri.id}
                            className="group relative aspect-[3/4] overflow-hidden rounded-sheet bg-surface-sunken"
                        >
                            <SafeImage
                                src={nutri.image}
                                alt={`${nutri.name}, ${nutri.role} de Anvil Strength`}
                                className="h-full w-full object-cover transition-transform duration-slow ease-snap group-hover:scale-[1.04]"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-surface-sunken via-surface-sunken/25 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 p-6">
                                <span className="text-t-2xs font-black uppercase tracking-widest text-success">
                                    Nutrición
                                </span>
                                <h3 className="mt-1 text-t-2xl font-black uppercase leading-none text-white">
                                    {nutri.name}
                                </h3>
                                <p className="mt-1.5 text-t-sm font-medium text-white/70">{nutri.role}</p>
                                <div className="mt-4 flex gap-2">
                                    <a
                                        href={nutri.instagram}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`Instagram de ${nutri.name}`}
                                        className="flex h-11 w-11 items-center justify-center rounded-field bg-white/10 text-white transition-colors duration-fast hover:bg-white hover:text-fold-light-ink"
                                    >
                                        <Instagram size={16} />
                                    </a>
                                    <a
                                        href={nutri.contactForm}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`Formulario de contacto de ${nutri.name}`}
                                        className="flex h-11 w-11 items-center justify-center rounded-field bg-white/10 text-white transition-colors duration-fast hover:bg-white hover:text-fold-light-ink"
                                    >
                                        <FileText size={16} />
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Fold>

            {/* =====================================================
                7. ATLETAS — carrusel infinito
                ===================================================== */}
            <section id="atletas" className="overflow-hidden bg-surface-canvas py-24 md:py-28">
                <div className="mx-auto mb-12 flex max-w-[1180px] items-end justify-between gap-6 px-6 md:px-10">
                    <h2 className="text-d-sm font-black uppercase leading-none text-ink">
                        Nuestros atletas
                    </h2>
                    <button
                        onClick={() => setIsTeamModalOpen(true)}
                        className="shrink-0 text-t-sm font-bold uppercase tracking-wide text-ink-muted underline-offset-8 transition-colors duration-fast hover:text-ink hover:underline"
                    >
                        Ver equipo
                    </button>
                </div>

                <div className="group/carousel relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-surface-canvas to-transparent md:w-28" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-surface-canvas to-transparent md:w-28" />

                    <button
                        onClick={() => handleManualNav('prev')}
                        aria-label="Atletas anteriores"
                        className="absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 rounded-pill bg-surface-sunken/80 p-3 text-ink opacity-0 transition-opacity duration-fast hover:bg-brand group-hover/carousel:opacity-100 focus-visible:opacity-100 md:block"
                    >
                        <ChevronLeft size={22} />
                    </button>
                    <button
                        onClick={() => handleManualNav('next')}
                        aria-label="Atletas siguientes"
                        className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 rounded-pill bg-surface-sunken/80 p-3 text-ink opacity-0 transition-opacity duration-fast hover:bg-brand group-hover/carousel:opacity-100 focus-visible:opacity-100 md:block"
                    >
                        <ChevronRight size={22} />
                    </button>

                    <div
                        className="flex overflow-hidden"
                        onMouseEnter={() => setIsPaused(true)}
                        onMouseLeave={() => setIsPaused(false)}
                    >
                        <m.div
                            className="flex gap-4 px-4"
                            animate={{ x: -(carouselIndex * (280 + 16)) }}
                            transition={isTransitioning ? { duration: 0.8, ease: [0.22, 1, 0.36, 1] } : { duration: 0 }}
                        >
                            {[...athletes, ...athletes, ...athletes, ...athletes].map((athlete, index) => (
                                <button
                                    key={`${athlete.id}-${index}`}
                                    onClick={() => setSelectedAthlete(athlete)}
                                    className="group relative aspect-[4/5] w-[280px] shrink-0 overflow-hidden rounded-sheet bg-surface-raised text-left"
                                >
                                    <SafeImage
                                        src={athlete.image}
                                        alt={`${athlete.name}, categoría ${athlete.category}`}
                                        className="h-full w-full object-cover transition-transform duration-slow ease-snap group-hover:scale-[1.04]"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-sunken to-transparent p-4 pt-12">
                                        <p className="text-t-base font-black uppercase leading-tight text-white">
                                            {athlete.name}
                                        </p>
                                        <p className="text-t-xs uppercase tracking-wide text-white/60">
                                            {athlete.category}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </m.div>
                    </div>
                </div>
            </section>

            {/* =====================================================
                8. LOGROS
                ===================================================== */}
            <Fold id="logros" tone="black" className="py-24 md:py-32">
                <div className="flex flex-wrap items-end justify-between gap-6">
                    <h2 className="text-d-md font-black uppercase leading-[0.95] text-ink">
                        Lo que ha ganado
                        <br />
                        el club
                    </h2>
                    <button
                        onClick={() => setIsAllAchievementsModalOpen(true)}
                        className="group flex items-center gap-1.5 text-t-sm font-bold uppercase tracking-wide text-ink-muted transition-colors duration-fast hover:text-ink"
                    >
                        Historial completo
                        <ChevronRight size={16} className="transition-transform duration-fast ease-snap group-hover:translate-x-1" />
                    </button>
                </div>

                <StaggerList className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
                    {featuredAchievements.slice(0, 3).map((item) => (
                        <StaggerItem key={item.id}>
                            <button
                                onClick={() => setSelectedAchievement(item)}
                                className="flex h-full w-full flex-col rounded-sheet bg-surface-canvas p-8 text-left transition-transform duration-base ease-snap hover:-translate-y-1"
                            >
                                <Trophy className="h-8 w-8 text-brand" aria-hidden="true" />
                                <h3 className="mt-8 text-t-2xl font-black uppercase leading-tight tracking-display text-ink">
                                    {item.title}
                                </h3>
                                <p className="mt-auto pt-8 text-t-lg font-black uppercase tracking-display text-brand">
                                    {item.result}
                                </p>
                            </button>
                        </StaggerItem>
                    ))}
                </StaggerList>
            </Fold>

            <ReviewsSection isAuthenticated={!!user} />

            {/* =====================================================
                9. AFILIACIÓN — el fold de conversión
                =====================================================
                Es el único drenado en rojo de toda la página. Funciona
                porque llega después de nueve pantallas donde el rojo
                casi no ha aparecido: si el rojo estuviera por todas
                partes, aquí no diría nada.                            */}
            <Fold id="afiliacion" tone="brand" className="py-24 md:py-32">
                <div className="mx-auto max-w-2xl text-center">
                    <Reveal>
                        <p className="text-t-sm font-black uppercase tracking-widest text-brand-ink/70">
                            Gratis · Sin cuota · Sin compromiso
                        </p>
                        <h2 className="mt-5 text-d-md font-black uppercase leading-[0.95] text-brand-ink text-balance">
                            ¿Te vienes?
                        </h2>
                        <p className="mx-auto mt-6 max-w-[48ch] text-t-lg leading-relaxed text-brand-ink/85">
                            Créate la cuenta y entra a ver la app. Si luego quieres competir con
                            nosotros, rellenas la ficha de inscripción y listo.
                        </p>
                        <p className="mx-auto mt-4 max-w-[48ch] text-t-xs text-brand-ink/60">
                            El club es gratis. El entrenamiento con tu entrenador se paga aparte,
                            directamente con él.
                        </p>
                    </Reveal>

                    <Reveal delay={0.08} className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                        {!user ? (
                            <PressButton tone="light" onClick={onSignupClick ?? onLoginClick} className="w-full sm:w-auto">
                                Crear cuenta gratis
                            </PressButton>
                        ) : (
                            <PressButton tone="light" href="https://typebot.co/lead-generation-hhwa24t" className="w-full sm:w-auto">
                                Ficha de inscripción
                            </PressButton>
                        )}
                        <a
                            href="/normativa_equipo.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-t-sm font-bold uppercase tracking-wide text-brand-ink/80 underline-offset-8 transition-colors duration-fast hover:text-brand-ink hover:underline"
                        >
                            <FileText size={16} />
                            Normativa del equipo
                        </a>
                    </Reveal>

                    <Reveal delay={0.16} className="mt-16 flex items-center justify-center gap-8">
                        <a href="https://www.powerlifting.sport/" target="_blank" rel="noopener noreferrer">
                            <img
                                src="/Logo-ipf.png"
                                alt="IPF — International Powerlifting Federation"
                                className="h-11 w-auto object-contain opacity-80 transition-opacity duration-fast hover:opacity-100"
                            />
                        </a>
                        <a href="https://powerliftingspain.es/" target="_blank" rel="noopener noreferrer">
                            <img
                                src="/logo-aep.png"
                                alt="AEP — Asociación Española de Powerlifting"
                                className="h-10 w-auto object-contain opacity-80 transition-opacity duration-fast hover:opacity-100"
                            />
                        </a>
                    </Reveal>
                </div>
            </Fold>

            <FAQSection />

            {/* =====================================================
                10. CONTACTO
                =====================================================
                Tres enlaces, no tres tarjetas. Es una lista de formas de
                escribirnos; envolverlas en cajas con icono y borde no
                añadía ninguna información.                             */}
            <Fold id="contacto" tone="dark" className="border-t border-subtle py-20">
                <h2 className="text-d-sm font-black uppercase leading-none text-ink">Hablamos</h2>

                <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-sheet bg-[var(--border-subtle)] sm:grid-cols-3">
                    {[
                        { icon: Instagram, label: 'Instagram', value: '@anvilstrength_', href: 'https://www.instagram.com/anvilstrength_', external: true },
                        { icon: Mail, label: 'Email', value: 'anvilstrengthclub@gmail.com', href: 'mailto:anvilstrengthclub@gmail.com', external: false },
                        { icon: MessageCircle, label: 'WhatsApp', value: '+34 640 76 16 74', href: 'https://wa.me/34640761674', external: true },
                    ].map(({ icon: Icon, label, value, href, external }) => (
                        <a
                            key={label}
                            href={href}
                            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            className="group flex flex-col gap-3 bg-surface-canvas p-7 transition-colors duration-fast hover:bg-surface-raised"
                        >
                            <Icon size={20} className="text-ink-subtle transition-colors duration-fast group-hover:text-brand" aria-hidden="true" />
                            <span className="text-t-lg font-black uppercase tracking-display text-ink">{label}</span>
                            <span className="break-all text-t-sm text-ink-muted">{value}</span>
                        </a>
                    ))}
                </div>
            </Fold>

            <PublicFooter />

            <TeamModal
                isOpen={isTeamModalOpen}
                onClose={() => setIsTeamModalOpen(false)}
                athletes={athletes}
                onAthleteClick={setSelectedAthlete}
            />

            <AthleteDetailsModal
                isOpen={!!selectedAthlete}
                onClose={() => setSelectedAthlete(null)}
                athlete={selectedAthlete}
            />

            <CoachDetailsModal
                isOpen={!!selectedCoach}
                onClose={() => setSelectedCoach(null)}
                coach={selectedCoach}
            />

            <AchievementModal
                isOpen={!!selectedAchievement}
                onClose={() => setSelectedAchievement(null)}
                achievement={selectedAchievement}
            />

            <AllAchievementsModal
                isOpen={isAllAchievementsModalOpen}
                onClose={() => setIsAllAchievementsModalOpen(false)}
                achievements={featuredAchievements}
                onSelect={setSelectedAchievement}
            />

            {/* --- TYPEBOT BUBBLE (se monta bajo demanda, ver import) --- */}
            {isBotMounted && (
                <Suspense fallback={null}>
                    <Bubble typebot="lead-generation-hhwa24t" apiHost="https://typebot.io" />
                </Suspense>
            )}

            {/* =====================================================
                MASCOTA
                =====================================================
                Es el único elemento de la página que se mueve solo, y por
                eso puede permitírselo: es el punto de entrada al chat y
                tiene que pedir el clic. El balanceo se para con
                `prefers-reduced-motion` — una animación infinita es
                justo la que peor sienta a quien la desactiva.          */}
            <m.button
                type="button"
                aria-label="Abrir el chat de Anvil Strength"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: [0, -8, 0] }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                transition={{
                    y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
                    duration: 0.4,
                    ease: [0.22, 1, 0.36, 1],
                }}
                onClick={() => {
                    setIsBotMounted(true);
                    const api = (window as { Typebot?: { toggle?: () => void } }).Typebot;
                    if (api?.toggle) api.toggle();
                    else setPendingOpen(true);
                }}
                className="group fixed bottom-6 right-6 z-toast cursor-pointer"
            >
                <span className="absolute -top-12 right-0 whitespace-nowrap rounded-card rounded-br-none bg-white px-3.5 py-2 text-t-2xs font-black uppercase text-fold-light-ink shadow-overlay transition-colors duration-fast group-hover:bg-brand group-hover:text-brand-ink">
                    ¿Hablamos?
                </span>
                <AnvilMascot className="h-24 w-24 md:h-28 md:w-28" />
            </m.button>
        </div>
    );
}



/**
 * FICHA DE UN LOGRO
 *
 * Antes era un lightbox propio: fondo negro al 90% con desenfoque, `z-[300]`
 * a mano (que es la capa del BACKDROP, no la del modal), sin trampa de foco,
 * sin Escape y sin bloqueo de scroll. Y dentro, el registro visual de otra
 * página — `bg-[#1c1c1c]`, `text-gray-400`, cursiva, `tracking-tighter` y un
 * trofeo de 48px de adorno. Ahora usa el `Modal` del sistema, que ya trae los
 * tres comportamientos, y el color sale de los tokens.
 *
 * El trofeo se ha ido: la tarjeta desde la que se abre ya lleva uno, así que
 * repetirlo aquí a tamaño grande no informa de nada. Lo que sí necesita sitio
 * es la foto — un podio se enseña, no se ilustra.
 */
function AchievementModal({ isOpen, onClose, achievement }: { isOpen: boolean; onClose: () => void; achievement: Achievement | null }) {
    const [imgIndex, setImgIndex] = useState(0);
    const reduce = useReducedMotion();

    // Se retiene el último logro para que el modal siga teniendo contenido
    // durante su animación de salida. Al cerrar, el estado del padre pasa a
    // `null` en el mismo instante: sin esto el panel se queda vacío y la
    // salida se ve como un parpadeo en vez de como un cierre.
    const [shown, setShown] = useState<Achievement | null>(achievement);
    // Ajuste durante el render: al abrir el modal sobre otro logro, con el
    // efecto se veia un frame con la foto del logro anterior.
    const [logroAnterior, setLogroAnterior] = useState(achievement);
    if (logroAnterior !== achievement) {
        setLogroAnterior(achievement);
        if (achievement) { setShown(achievement); setImgIndex(0); }
    }

    const images = shown?.images ?? [];
    const many = images.length > 1;
    const go = (dir: 1 | -1) => setImgIndex((i) => (i + dir + images.length) % images.length);

    return (
        <Modal open={isOpen} onClose={onClose} title={shown?.title} size="xl">
            {shown && (
                <>
                    <figure className="group/img relative aspect-[16/10] overflow-hidden rounded-card bg-surface-sunken">
                        <AnimatePresence initial={false} mode="popLayout">
                            <m.div
                                key={imgIndex}
                                className="absolute inset-0"
                                initial={reduce ? false : { opacity: 0, x: 40 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -40 }}
                                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                drag={many ? 'x' : false}
                                dragConstraints={{ left: 0, right: 0 }}
                                dragElastic={0.12}
                                onDragEnd={(_, info) => {
                                    if (info.offset.x < -50) go(1);
                                    if (info.offset.x > 50) go(-1);
                                }}
                            >
                                <SafeImage
                                    src={images[imgIndex]}
                                    alt={`${shown.title} — ${shown.result}`}
                                    className={`h-full w-full object-cover ${many ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    fallbackClassName="bg-surface-sunken"
                                    draggable={false}
                                />
                            </m.div>
                        </AnimatePresence>

                        {/* Flechas solo en escritorio: en móvil se arrastra. */}
                        {many && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => go(-1)}
                                    aria-label="Foto anterior"
                                    className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-sunken/70 text-ink opacity-0 transition-opacity duration-fast ease-snap hover:bg-brand group-hover/img:opacity-100 focus-visible:opacity-100 sm:flex"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => go(1)}
                                    aria-label="Foto siguiente"
                                    className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-sunken/70 text-ink opacity-0 transition-opacity duration-fast ease-snap hover:bg-brand group-hover/img:opacity-100 focus-visible:opacity-100 sm:flex"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </>
                        )}
                    </figure>

                    {/* Indicadores fuera de la foto: sobre la superficie tienen
                        contraste garantizado, y encima de la imagen dependían
                        de que esa esquina saliera oscura. Barras y no puntos —
                        el mismo lenguaje que el resto de la página.
                        La zona pulsable mide 44px aunque la barra mida 3. */}
                    {many && (
                        <div className="mt-1 flex justify-center gap-1">
                            {images.map((src, i) => (
                                <button
                                    key={src}
                                    type="button"
                                    onClick={() => setImgIndex(i)}
                                    aria-label={`Ver foto ${i + 1} de ${images.length}`}
                                    aria-current={i === imgIndex}
                                    className="flex h-11 w-8 items-center justify-center"
                                >
                                    <span
                                        className={`h-[3px] w-full rounded-pill transition-colors duration-fast ease-snap ${i === imgIndex ? 'bg-brand' : 'bg-[var(--border-strong)]'}`}
                                    />
                                </button>
                            ))}
                        </div>
                    )}

                    <p className={`text-t-lg font-black uppercase tracking-display text-brand ${many ? 'mt-4' : 'mt-6'}`}>
                        {shown.result}
                    </p>
                    <p className="mt-3 max-w-[62ch] text-t-base leading-relaxed text-ink-muted">
                        {shown.desc}
                    </p>
                </>
            )}
        </Modal>
    );
}

/**
 * HISTORIAL COMPLETO
 *
 * Era una capa a pantalla completa con un titular de 6rem en cursiva
 * ("Historial de Gloria") y una rejilla de tarjetas con borde, cada una con su
 * trofeo. Diez tarjetas idénticas para diez líneas de texto.
 *
 * Ahora es una lista con separadores, que es la misma forma que ya usan las
 * preguntas frecuentes y el bloque de contacto de esta página: si el contenido
 * es una lista, se pinta como una lista. Se lee de un vistazo y el trofeo
 * repetido diez veces deja de ser ruido.
 */
function AllAchievementsModal({ isOpen, onClose, achievements, onSelect }: { isOpen: boolean; onClose: () => void; achievements: Achievement[]; onSelect: (a: Achievement) => void }) {
    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Historial del club"
            description={`${achievements.length} resultados en competición oficial.`}
            size="lg"
        >
            <ul className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                {achievements.map((item) => (
                    <li key={item.id}>
                        <button
                            type="button"
                            onClick={() => { onSelect(item); onClose(); }}
                            className="group flex w-full items-center gap-4 py-4 text-left"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block text-t-base font-bold leading-snug text-ink">
                                    {item.title}
                                </span>
                                <span className="mt-1 block text-t-sm font-black uppercase tracking-display text-brand">
                                    {item.result}
                                </span>
                            </span>
                            <ChevronRight
                                size={18}
                                aria-hidden="true"
                                className="shrink-0 text-ink-faint transition-[transform,color] duration-fast ease-snap group-hover:translate-x-0.5 group-hover:text-ink"
                            />
                        </button>
                    </li>
                ))}
            </ul>
        </Modal>
    );
}