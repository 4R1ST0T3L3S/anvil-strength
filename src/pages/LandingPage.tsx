import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, FileText, Mail, Instagram, Menu, X, User, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react';
import { TeamModal } from '../components/TeamModal';
import { AthleteDetailsModal } from '../components/AthleteDetailsModal';
import { CoachDetailsModal } from '../components/CoachDetailsModal';
import { BlogSection } from '../components/BlogSection';
import { athletes, Athlete } from '../data/athletes';
import { coaches, Coach } from '../data/coaches';

interface LandingPageProps {
    onLoginClick: () => void;
    user?: any; // Just in case we need to show user specific things on landing later
    onGoToDashboard?: () => void;
}

export function LandingPage({ onLoginClick, user, onGoToDashboard }: LandingPageProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
    const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);

    // Carousel State
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [isManualMode, setIsManualMode] = useState(false);
    const [lastInteraction, setLastInteraction] = useState(Date.now());

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

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        e.preventDefault();
        const element = document.querySelector(href);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setIsMobileMenuOpen(false);
        }
    };

    const navLinks = [
        { name: 'FILOSOFÍA', href: '#filosofia' },
        { name: 'ENTRENADORES', href: '#entrenadores' },
        { name: 'ATLETAS', href: '#atletas' },
        { name: 'LOGROS', href: '#logros' },
        { name: 'COMUNIDAD', href: '#blog' },
        { name: 'AFILIATE', href: '#afiliacion' },
    ];

    return (
        <div className="font-sans">
            {/* SBD-style Header */}
            <header
                className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-[#1c1c1c] shadow-lg py-2' : 'bg-transparent py-6'
                    }`}
            >
                <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between md:justify-center md:gap-12">
                    {/* Logo */}
                    <div className="flex-shrink-0">
                        <a href="#" className="block hover:opacity-80 transition-opacity">
                            <img
                                src="/logo.svg"
                                alt="Anvil Strength Logo"
                                className="h-10 md:h-12 w-auto object-contain"
                            />
                        </a>
                    </div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center space-x-8">
                        {navLinks.map((link) => (
                            <a
                                key={link.name}
                                href={link.href}
                                onClick={(e) => handleNavClick(e, link.href)}
                                className="text-sm font-bold tracking-wider text-gray-300 hover:text-white transition-colors uppercase"
                            >
                                {link.name}
                            </a>
                        ))}
                    </nav>

                    <div className="flex items-center space-x-4 md:space-x-6">
                        {user ? (
                            <button
                                onClick={onGoToDashboard}
                                className="text-gray-300 hover:text-white flex items-center gap-2"
                            >
                                <User className="h-5 w-5" />
                                <span className="hidden md:inline text-sm font-bold uppercase">Mis Cosas</span>
                            </button>
                        ) : (
                            <button
                                onClick={onLoginClick}
                                className="text-gray-300 hover:text-white flex items-center gap-2"
                            >
                                <User className="h-5 w-5" />
                                <span className="hidden md:inline text-sm font-bold uppercase">Acceso</span>
                            </button>
                        )}
                        <button className="hidden md:block text-gray-300 hover:text-white relative">
                            <ShoppingBag className="h-5 w-5" />
                            <span className="absolute -top-2 -right-2 bg-anvil-red text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">0</span>
                        </button>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="text-white p-2"
                        >
                            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                        </button>
                    </div>
                </div>

                {/* Mobile Navigation */}
                {isMobileMenuOpen && (
                    <div className="md:hidden bg-[#1c1c1c] border-t border-white/10 absolute w-full rounded-b-xl shadow-2xl">
                        <div className="px-4 pt-2 pb-4 space-y-1">
                            {navLinks.map((link) => (
                                <a
                                    key={link.name}
                                    href={link.href}
                                    className="block px-3 py-4 text-base font-bold text-gray-300 hover:text-white hover:bg-white/5 border-b border-white/5"
                                    onClick={(e) => handleNavClick(e, link.href)}
                                >
                                    {link.name}
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            {/* Hero Section */}
            <section className="relative h-screen flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
                    <div className="absolute inset-0 bg-black/40" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c1c] via-transparent to-transparent" />
                </div>
                <div className="relative z-10 text-center px-4 max-w-5xl mx-auto mt-20 md:mt-80">
                    <h1 className="text-5xl sm:text-6xl md:text-9xl font-black tracking-tighter mb-8 text-white flex flex-col md:block items-center gap-2 md:gap-0">
                        <span>ANVIL</span>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500">STRENGTH</span>
                    </h1>
                    <p className="text-lg md:text-3xl text-gray-200 mb-12 font-bold tracking-wide uppercase max-w-lg mx-auto md:max-w-none">
                        Trabajamos con datos no con sensaciones
                    </p>
                    <div className="flex flex-col md:flex-row gap-4 justify-center">
                        <a
                            href="#afiliacion"
                            onClick={(e) => handleNavClick(e, '#afiliacion')}
                            className="inline-block bg-white text-black hover:bg-gray-200 font-black py-4 px-10 rounded-xl transition-all uppercase tracking-wider"
                        >
                            Únete al equipo
                        </a>
                        <a
                            href="#filosofia"
                            onClick={(e) => handleNavClick(e, '#filosofia')}
                            className="inline-block border-2 border-white text-white hover:bg-white hover:text-black font-black py-4 px-10 rounded-xl transition-all uppercase tracking-wider"
                        >
                            Nuestra Filosofía
                        </a>
                    </div>
                </div>

                {/* Federation Logos */}
                <div className="absolute bottom-[10%] md:bottom-8 left-0 right-0 flex justify-center md:left-auto md:right-8 md:justify-end items-center gap-4 z-10">
                    <img
                        src="/Logo-ipf.png"
                        alt="IPF Approved"
                        className="h-[54px] w-auto object-contain opacity-80 hover:opacity-100 transition-opacity translate-x-8 md:translate-x-0"
                    />
                    <img
                        src="/logo-aep.png"
                        alt="AEP Federación"
                        className="h-12 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity"
                    />
                </div>
            </section>

            {/* Filosofía Section */}
            <section id="filosofia" className="min-h-screen flex flex-col justify-center py-32 bg-[#1c1c1c]">
                <div className="max-w-[1400px] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
                    <div className="text-center md:text-left">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 uppercase">
                            Forjados en <br /> <span className="text-anvil-red">Hierro</span>
                        </h2>
                        <div className="space-y-6 text-lg text-gray-400 leading-relaxed font-medium">
                            <p>
                                No somos un club que se basa en sensaciones o planificaciones tradicionales. <span className="text-white font-bold">Llevamos la ciencia al límite.</span>
                            </p>
                            <p>
                                Nos basamos en <span className="text-anvil-red font-bold">VBT (Velocity Based Training)</span>, llevando la calidad, personalización y precisión al máximo en cada entrenamiento.
                            </p>
                            <p>
                                No construimos perdedores, <span className="text-white font-bold">construimos atletas de alto rendimiento</span>. Porque para rendir como tal, necesitas programaciones de alto nivel. En un deporte con normas de competición, <span className="text-anvil-red font-bold">debes entrenar con normas de competición.</span>
                            </p>
                        </div>
                    </div>
                    <div className="relative">
                        <div className="aspect-[4/5] bg-gray-800 rounded-xl overflow-hidden grayscale hover:grayscale-0 transition-all duration-500 shadow-2xl">
                            <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070&auto=format&fit=crop" alt="Filosofía" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute -bottom-10 -left-10 w-full h-full border-2 border-anvil-red -z-10 hidden md:block rounded-xl"></div>
                    </div>
                </div>
            </section>

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
                                    <img src={athlete.image} alt={athlete.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
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

            {/* Blog/Comunidad Section */}
            <BlogSection user={user} />

            {/* Logros Section */}
            <section id="logros" className="min-h-screen flex flex-col justify-center py-32 bg-[#252525]">
                <div className="max-w-[1400px] mx-auto px-6">
                    <div className="text-center mb-20">
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4">Logros Recientes</h2>
                        <p className="text-gray-400">Resultados que hablan por sí solos.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { title: "Campeonato Nacional 2024", result: "3 Medallas de Oro", desc: "Récord Nacional Peso Muerto" },
                            { title: "Copa Regional Norte", result: "1er Lugar por Equipos", desc: "Dominio total categoría -93kg" },
                            { title: "Mundial Powerlifting", result: "Top 10 Mundial", desc: "Representación Internacional" }
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
                        <a href="https://docs.google.com/forms/d/e/1FAIpQLSckZ2BU0Plvxk0ceGvYsRgg3ELS2jap8Rnqjzicbpy_zjwR2g/viewform" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 bg-black text-white hover:bg-gray-900 py-4 px-8 rounded-xl font-bold uppercase tracking-wider transition-all shadow-2xl">
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
                    <img
                        src="/Logo-ipf.png"
                        alt="IPF Approved"
                        className="h-[54px] w-auto object-contain opacity-80 hover:opacity-100 transition-opacity translate-x-8 md:translate-x-0"
                    />
                    <img
                        src="/logo-aep.png"
                        alt="AEP Federación"
                        className="h-12 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity"
                    />
                </div>
            </section>
            <footer className="bg-black py-16 border-t border-white/10">
                <div className="max-w-[1400px] mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                        <div className="flex items-center gap-2">
                            {/* Footer Logo */}
                            <span className="font-black text-2xl tracking-tighter text-white">ANVIL STRENGTH</span>
                        </div>
                        <div className="flex gap-8 text-sm font-bold text-gray-500 uppercase tracking-wider">
                            <a href="https://www.instagram.com/anvilstrength_?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Instagram</a>
                            <a href="#" className="hover:text-white transition-colors">Email</a>
                            <a href="#" className="hover:text-white transition-colors">Aviso Legal</a>
                        </div>
                    </div>
                    <div className="mt-8 text-center md:text-left text-xs text-gray-700 font-medium uppercase tracking-widest">
                        © 2026 Anvil Strength Powerlifting Club. Todos los derechos reservados.
                    </div>
                </div>
            </footer>

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
        </div>
    );
}
