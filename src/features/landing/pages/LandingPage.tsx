import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AnvilMascot } from '../../../components/ui/AnvilMascot';
import { Trophy, FileText, Mail, Instagram, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { TeamModal } from '../../../components/modals/TeamModal';
import { AthleteDetailsModal } from '../../../components/modals/AthleteDetailsModal';
import { CoachDetailsModal } from '../../../components/modals/CoachDetailsModal';
import { ReviewsSection } from '../../reviews/components/ReviewsSection';
import { BenefitsSection } from '../components/BenefitsSection';
import { SmartAuthButton } from '../../../components/ui/SmartAuthButton';
import { athletes, Athlete } from '../../../data/athletes';
import { coaches, Coach } from '../../../data/coaches';

import { UserProfile } from '../../../hooks/useUser';
import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';

interface LandingPageProps {
    onLoginClick: () => void;
    user?: UserProfile | null;
}

export function LandingPage({ onLoginClick, user }: LandingPageProps) {
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
    const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);

    // Carousel State
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [isManualMode, setIsManualMode] = useState(false);
    const [lastInteraction, setLastInteraction] = useState(() => Date.now());

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
        <div className="font-sans">
            {/* Shared Public Header */}
            <PublicHeader onLoginClick={onLoginClick} />

            {/* Hero Section */}
            <section className="relative h-screen flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[url('/portadaanvil2.jpg')] bg-cover bg-center">
                    <div className="absolute inset-0 bg-black/40" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c1c] via-transparent to-transparent" />
                </div>
                <div className="relative z-10 text-center px-4 max-w-5xl mx-auto mt-24 md:mt-24<">
                    <h1 className="text-5xl sm:text-6xl md:text-9xl font-black tracking-tighter mb-8 text-white flex flex-col md:block items-center gap-2 md:gap-0">
                        <span>ANVIL</span>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500">STRENGTH</span>
                    </h1>
                    <p className="text-lg md:text-3xl text-gray-200 mb-12 font-bold tracking-wide uppercase max-w-lg mx-auto md:max-w-none">
                        WHERE CHAMPIONS ARE FORGED
                    </p>
                    <div className="flex flex-col md:flex-row gap-4 justify-center mt-16 md:mt-50">
                        <SmartAuthButton variant="primary" onLoginClick={onLoginClick} className="w-full md:w-auto" />
                        <a
                            href="#afiliacion"
                            onClick={(e) => scrollToSection(e, '#afiliacion')}
                            className="inline-block bg-white text-black hover:bg-gray-200 font-black py-4 px-10 rounded-xl transition-all uppercase tracking-wider"
                        >
                            Únete al equipo
                        </a>
                    </div>
                </div>

                {/* Federation Logos */}
                <div className="absolute bottom-[10%] md:bottom-8 left-0 right-0 flex justify-center md:left-auto md:right-8 md:justify-end items-center gap-4 z-10">
                    <a
                        href="https://www.powerlifting.sport/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block hover:scale-105 transition-transform"
                    >
                        <img
                            src="/Logo-ipf.png"
                            alt="IPF Approved"
                            className="h-[54px] w-auto object-contain opacity-80 hover:opacity-100 transition-opacity translate-x-8 md:translate-x-0"
                        />
                    </a>
                    <a
                        href="https://powerliftingspain.es/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block hover:scale-105 transition-transform"
                    >
                        <img
                            src="/logo-aep.png"
                            alt="AEP Federación"
                            className="h-12 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity"
                        />
                    </a>
                </div>
            </section>

            {/* Filosofía Section */}
            <section id="filosofia" className="min-h-screen flex flex-col justify-center py-32 bg-[#1c1c1c]">
                <div className="max-w-[1400px] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
                    <div className="text-center md:text-left">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 uppercase">
                            WHERE <span className="text-anvil-red">CHAMPIONS</span> <br /> ARE <span className="text-anvil-red">FORGED</span>
                        </h2>
                        <div className="space-y-6 text-lg text-gray-400 leading-relaxed font-medium">
                            <p>
                                No somos un club convencional, buscamos que tu experiencia en tarima sea inmejorable. Como nuestro propio lema dice, <span className="text-white font-bold">FORJAMOS CAMPEONES.</span>
                            </p>
                            <p>
                                En Anvil Strength no solo te unes a un club, <span className="text-anvil-red font-bold">te unes a una familia.</span> Queremos que tu camino vaya más allá de la competición; por eso, contamos con los mejores entrenadores del panorama para garantizarte un proceso claro, directo y sin trabas. <span className="text-white font-bold">Tú pones el esfuerzo, nosotros la estructura.</span>
                            </p>
                            <p>
                                No construimos perdedores, <span className="text-white font-bold">construimos atletas de alto rendimiento</span>, porque para rendir como tal necesitas planificaciones de alto rendimiento. En un deporte con normas de competición, <span className="text-anvil-red font-bold">entrena con normas de competición.</span>
                            </p>
                        </div>
                    </div>
                    <div className="relative">
                        <div className="aspect-[4/5] bg-gray-800 rounded-xl overflow-hidden grayscale hover:grayscale-0 transition-all duration-500 shadow-2xl">
                            <img src="/filosofia-competition.jpg" alt="Filosofía" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <div className="absolute -bottom-10 -left-10 w-full h-full border-2 border-anvil-red -z-10 hidden md:block rounded-xl"></div>
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <BenefitsSection />

            {/* Entrenadores Section */}
            <section id="entrenadores" className="min-h-[70vh] flex flex-col justify-center py-20 bg-[#252525]">
                <div className="max-w-[1400px] mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4">Entrenadores</h2>
                        <div className="w-20 h-1 bg-anvil-red mx-auto"></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
                        {coaches.map((coach) => (
                            <div
                                key={coach.id}
                                className="group relative overflow-hidden bg-[#1c1c1c] aspect-[3/4] shadow-2xl rounded-xl cursor-pointer"
                                onClick={() => setSelectedCoach(coach)}
                            >
                                <img
                                    src={coach.image}
                                    alt={coach.name}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 grayscale group-hover:grayscale-0"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-8">
                                    <h3 className="text-3xl font-bold text-white uppercase mb-1">{coach.name}</h3>
                                    <p className="text-anvil-red font-bold tracking-wider mb-4">{coach.role}</p>
                                    <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-4 group-hover:translate-y-0">
                                        <button className="p-2 bg-white text-black hover:bg-anvil-red hover:text-white transition-colors rounded-lg" onClick={(e) => { e.stopPropagation(); window.open(coach.instagram, '_blank'); }}>
                                            <Instagram size={20} />
                                        </button>
                                        <button className="p-2 bg-white text-black hover:bg-anvil-red hover:text-white transition-colors rounded-lg" onClick={(e) => { e.stopPropagation(); if (coach.email) window.location.href = `mailto:${coach.email}`; }}>
                                            <Mail size={20} />
                                        </button>
                                    </div>
                                </div>
                                {/* Coach Logo in Bottom Right */}
                                {coach.logo && (
                                    <div className="absolute bottom-4 right-4 z-10">
                                        <img
                                            src={coach.logo}
                                            alt={`${coach.name} logo`}
                                            className="w-16 h-16 object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Atletas Section */}
            <section id="atletas" className="py-32 bg-[#1c1c1c] overflow-hidden">
                <div className="max-w-[1400px] mx-auto px-6 mb-16">
                    <div className="flex justify-between items-end">
                        <div>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4">Nuestros Atletas</h2>
                            <div className="w-20 h-1 bg-anvil-red"></div>
                        </div>
                        <button
                            onClick={() => setIsTeamModalOpen(true)}
                            className="hidden md:block text-gray-400 hover:text-white font-bold uppercase tracking-wider text-sm transition-colors"
                        >
                            Ver todo el equipo &rarr;
                        </button>
                    </div>
                </div>

                {/* Infinite Carousel */}
                <div className="relative group/carousel">
                    {/* Gradient Fades */}
                    <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#1c1c1c] to-transparent z-10 pointer-events-none" />
                    <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#1c1c1c] to-transparent z-10 pointer-events-none" />

                    {/* Navigation Arrows */}
                    <button
                        onClick={() => handleManualNav('prev')}
                        className="absolute left-8 top-1/2 -translate-y-1/2 z-20 p-4 bg-black/50 hover:bg-anvil-red text-white rounded-full backdrop-blur-sm transition-all opacity-0 group-hover/carousel:opacity-100"
                    >
                        <ChevronLeft size={32} />
                    </button>
                    <button
                        onClick={() => handleManualNav('next')}
                        className="absolute right-8 top-1/2 -translate-y-1/2 z-20 p-4 bg-black/50 hover:bg-anvil-red text-white rounded-full backdrop-blur-sm transition-all opacity-0 group-hover/carousel:opacity-100"
                    >
                        <ChevronRight size={32} />
                    </button>

                    <div
                        className="flex overflow-hidden"
                        onMouseEnter={() => setIsPaused(true)}
                        onMouseLeave={() => setIsPaused(false)}
                    >
                        <motion.div
                            className="flex gap-4 px-4"
                            animate={{ x: -(carouselIndex * (280 + 16)) }}
                            transition={isTransitioning ? {
                                duration: 0.8,
                                ease: [0.4, 0, 0.2, 1]
                            } : { duration: 0 }}
                        >
                            {[...athletes, ...athletes, ...athletes, ...athletes].map((athlete, index) => (
                                <div
                                    key={`${athlete.id}-${index}`}
                                    className="relative flex-shrink-0 w-[280px] aspect-[4/5] bg-[#252525] rounded-xl overflow-hidden cursor-pointer shadow-xl group"
                                    onClick={() => setSelectedAthlete(athlete)}
                                >
                                    <img src={athlete.image} alt={athlete.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" loading="lazy" />
                                    <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/90 to-transparent">
                                        <p className="text-white font-bold uppercase">{athlete.name}</p>
                                        <p className="text-xs text-gray-400 uppercase">{athlete.category}</p>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Reviews Section */}
            <ReviewsSection isAuthenticated={!!user} />

            {/* Logros Section */}
            <section id="logros" className="min-h-screen flex flex-col justify-center py-32 bg-[#252525]">
                <div className="max-w-[1400px] mx-auto px-6">
                    <div className="text-center mb-20">
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4">Logros Recientes</h2>
                        <p className="text-gray-400">Resultados que hablan por sí solos.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { title: "Campeonato Nacional SBJ 2024", result: "Medalla de Oro", desc: "Medalla de oro Press Banca SBJ -105 2024" },
                            { title: "SBD CUP 2025", result: "2 Segundos puestos", desc: "Plata en la categoría de -83Kg y -105Kg. En esta última, un record de España (no oficial) en press banca con 192.5kg." },
                            { title: "Campeonato Regional Murcia 2025", result: "2 Oros", desc: "Campeones en la categoría de -83Kg masculina y -63Kg femenina." }
                        ].map((item, i) => (
                            <div key={i} className="bg-[#1c1c1c] p-10 border border-white/5 hover:border-anvil-red/50 transition-colors group rounded-xl shadow-xl">
                                <Trophy className="h-10 w-10 text-anvil-red mb-6" />
                                <h3 className="text-2xl font-bold text-white uppercase mb-2">{item.title}</h3>
                                <p className="text-xl text-gray-300 font-bold mb-4">{item.result}</p>
                                <p className="text-gray-500">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Afiliación Section */}
            <section id="afiliacion" className="min-h-screen flex flex-col justify-center py-32 bg-anvil-red relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 text-white uppercase">
                        ¿Listo para competir?
                    </h2>
                    <p className="text-white/90 text-xl mb-12 font-medium">
                        Únete a Anvil Strength. Descarga los documentos necesarios y comienza tu camino hacia la tarima.
                    </p>

                    <div className="flex flex-col md:flex-row gap-6 justify-center">
                        <a href="https://typebot.co/lead-generation-hhwa24t" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 bg-black text-white hover:bg-gray-900 py-4 px-8 rounded-xl font-bold uppercase tracking-wider transition-all shadow-2xl">
                            <FileText size={20} />
                            Formulario de Inscripción
                        </a>
                        <button className="flex items-center justify-center gap-3 bg-white text-anvil-red hover:bg-gray-100 py-4 px-8 rounded-xl font-bold uppercase tracking-wider transition-all shadow-2xl">
                            <FileText size={20} />
                            Normativa del Equipo
                        </button>
                    </div>
                </div>

                {/* Federation Logos */}
                <div className="absolute bottom-[10%] md:bottom-8 left-0 right-0 flex justify-center md:left-auto md:right-8 md:justify-end items-center gap-4 z-10">
                    <a
                        href="https://www.powerlifting.sport/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block hover:scale-105 transition-transform"
                    >
                        <img
                            src="/Logo-ipf.png"
                            alt="IPF Approved"
                            className="h-[54px] w-auto object-contain opacity-80 hover:opacity-100 transition-opacity translate-x-8 md:translate-x-0"
                        />
                    </a>
                    <a
                        href="https://powerliftingspain.es/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block hover:scale-105 transition-transform"
                    >
                        <img
                            src="/logo-aep.png"
                            alt="AEP Federación"
                            className="h-12 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity"
                        />
                    </a>
                </div>
            </section>

            {/* Contacto Section */}
            <section id="contacto" className="py-20 bg-[#1c1c1c] border-t border-white/5">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl md:text-5xl font-black tracking-tighter uppercase mb-2 text-white">Contacto</h2>
                    <div className="w-20 h-1 bg-anvil-red mx-auto mb-12"></div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Instagram */}
                        <a
                            href="https://www.instagram.com/anvilstrength_"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 hover:-translate-y-2 transition-all group shadow-xl flex flex-col items-center"
                        >
                            <div className="bg-white/5 p-4 rounded-full mb-4 group-hover:bg-anvil-red/20 group-hover:text-anvil-red transition-colors">
                                <Instagram size={32} />
                            </div>
                            <h3 className="font-bold text-xl uppercase mb-2 text-white">Instagram</h3>
                            <p className="text-gray-400 text-sm">@anvilstrength_</p>
                        </a>

                        {/* Email */}
                        <a
                            href="mailto:anvilstrengthclub@gmail.com"
                            className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 hover:-translate-y-2 transition-all group shadow-xl flex flex-col items-center"
                        >
                            <div className="bg-white/5 p-4 rounded-full mb-4 group-hover:bg-anvil-red/20 group-hover:text-anvil-red transition-colors">
                                <Mail size={32} />
                            </div>
                            <h3 className="font-bold text-xl uppercase mb-2 text-white">Email</h3>
                            <p className="text-gray-400 text-sm">anvilstrengthclub@gmail.com</p>
                        </a>

                        {/* WhatsApp */}
                        <a
                            href="https://wa.me/34640761674"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 hover:-translate-y-2 transition-all group shadow-xl flex flex-col items-center"
                        >
                            <div className="bg-white/5 p-4 rounded-full mb-4 group-hover:bg-anvil-red/20 group-hover:text-anvil-red transition-colors">
                                <MessageCircle size={32} />
                            </div>
                            <h3 className="font-bold text-xl uppercase mb-2 text-white">WhatsApp</h3>
                            <p className="text-gray-400 text-sm">+34 640 76 16 74</p>
                        </a>
                    </div>
                </div>
            </section>
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

            {/* --- ANVIL MASCOT (Fixed Bottom Left) --- */}
            <MascotWithChat />
        </div>
    );
}

function MascotWithChat() {
    const [messageIndex, setMessageIndex] = useState(0);
    const messages = [
        "¿Necesitas ayuda?",
        "¿Quieres afiliarte?",
        "¡Forja tu legado!",
        "¿Listo para competir?"
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setMessageIndex((prev) => (prev + 1) % messages.length);
        }, 5000); // Cambia mensaje cada 5 segundos
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed bottom-4 left-4 z-50 hidden md:block group/mascot">
            <AnvilMascot className="w-24 h-24 drop-shadow-2xl hover:scale-110 transition-transform cursor-pointer" />

            {/* Chat Bubble Dinámico */}
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 bg-white text-black px-4 py-3 rounded-2xl font-bold uppercase text-xs shadow-xl whitespace-nowrap pointer-events-none">
                <motion.div
                    key={messageIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.5 }}
                >
                    {messages[messageIndex]}
                </motion.div>
                {/* Flechita del bocadillo */}
                <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-3 h-3 bg-white rotate-45"></div>
            </div>
        </div>
    );
}

