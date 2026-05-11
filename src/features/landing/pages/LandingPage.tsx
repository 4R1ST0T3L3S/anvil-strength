import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AnvilMascot } from '../../../components/ui/AnvilMascot';
import { Trophy, FileText, Mail, Instagram, ChevronLeft, ChevronRight, MessageCircle, MapPin } from 'lucide-react';
import { TeamModal } from '../../../components/modals/TeamModal';
import { AthleteDetailsModal } from '../../../components/modals/AthleteDetailsModal';
import { CoachDetailsModal } from '../../../components/modals/CoachDetailsModal';
import { ReviewsSection } from '../../reviews/components/ReviewsSection';
import { BenefitsSection } from '../components/BenefitsSection';
import { SoftwareSection } from '../components/SoftwareSection';
import { SmartAuthButton } from '../../../components/ui/SmartAuthButton';
import { athletes, Athlete } from '../../../data/athletes';
import { coaches, Coach } from '../../../data/coaches';
import { UserProfile } from '../../../hooks/useUser';
import { PublicHeader } from '../../../components/layout/PublicHeader';
// @ts-ignore
import { Bubble } from "@typebot.io/react";

const featuredAchievements = [
    {
        id: 1,
        title: "Campeonato Nacional SBJ 2026",
        result: "Primer puesto -105Kg",
        images: ["/Logros/PAU RODRIGUEZ-44.jpg", "/Logros/PODIO_SBJ26.jpg"],
        desc: "Campeón de España en los 3 movimientos y pase directo para competir en el Europeo Subjunior para Pau Rodríguez."
    },
    {
        id: 2,
        title: "SBD CUP 2025",
        result: "2 Segundos puestos",
        images: ["/Logros/podio_sbd.jpg"],
        desc: "Plata en la categoría de -83Kg y -105Kg. En esta última, un record de España (no oficial) en press banca con 192.5kg."
    }
];

interface LandingPageProps {
    onLoginClick: () => void;
    user?: UserProfile | null;
}

export function LandingPage({ onLoginClick, user }: LandingPageProps) {
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
    const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [isManualMode, setIsManualMode] = useState(false);
    const [lastInteraction, setLastInteraction] = useState(() => Date.now());
    const [selectedAchievement, setSelectedAchievement] = useState<any | null>(null);
    const [isAllAchievementsModalOpen, setIsAllAchievementsModalOpen] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            const botButton = document.querySelector('.typebot-bubble-button');
            if (botButton) {
                (botButton as HTMLElement).style.display = 'none';
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (isPaused || isManualMode) return;
        const timer = setInterval(() => {
            setIsTransitioning(true);
            setCarouselIndex((prev) => prev + 1);
        }, 3000);
        return () => clearInterval(timer);
    }, [isPaused, isManualMode]);

    useEffect(() => {
        if (carouselIndex === athletes.length) {
            const timer = setTimeout(() => {
                setIsTransitioning(false);
                setCarouselIndex(0);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [carouselIndex]);

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

    const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        e.preventDefault();
        const element = document.querySelector(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    return (
        <div className="font-sans bg-[#050505] text-white">
            <PublicHeader onLoginClick={onLoginClick} />

            {/* Hero Section */}
            <section className="relative h-screen flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-[url('/portadaanvil2.jpg')] bg-cover bg-[center_top_20%] md:bg-center" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-[#0a0a0a]" />

                    {/* Efecto Magnesio (Partículas) */}
                    {[...Array(25)].map((_, i) => (
                        <motion.div
                            key={`chalk-${i}`}
                            className="absolute bg-white rounded-full blur-[2px]"
                            style={{
                                width: Math.random() * 6 + 4 + 'px',
                                height: Math.random() * 6 + 4 + 'px',
                                left: Math.random() * 100 + '%',
                                top: Math.random() * 100 + 10 + '%',
                            }}
                            initial={{ opacity: 0, y: 0 }}
                            animate={{
                                y: - (Math.random() * 200 + 100),
                                opacity: [0, Math.random() * 0.2 + 0.1, 0],
                            }}
                            transition={{
                                duration: Math.random() * 4 + 4,
                                repeat: Infinity,
                                ease: "linear",
                                delay: Math.random() * 4,
                            }}
                        />
                    ))}
                </div>

                <div className="relative z-10 text-center px-4 max-w-7xl mx-auto flex flex-col items-center">
                    {/* Animación de "Golpe de Yunque" con capas precisas */}
                    <motion.div
                        initial={{ scale: 1.5, filter: 'blur(20px)', opacity: 0 }}
                        animate={{ scale: 1, filter: 'blur(0px)', opacity: 1 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="relative mb-12 w-full flex flex-col items-center justify-center pt-20 md:pt-32"
                    >
                        {/* ANVIL: Bajado ligeramente para acercarlo a STRENGTH */}
                        <h1 className="text-[8rem] md:text-[18rem] font-black tracking-normal font-bebas italic text-gray-200 uppercase leading-none select-none relative z-0 drop-shadow-2xl -translate-y-10 md:-translate-y-14 -translate-x-8 md:-translate-x-20">
                            ANVIL
                        </h1>

                        {/* STRENGTH: Subido ligeramente para acercarlo a ANVIL */}
                        <h2
                            className="absolute text-5xl md:text-[9rem] font-black font-bebas italic text-anvil-red uppercase leading-none z-10 translate-y-20 md:translate-y-26 translate-x-8 md:translate-x-24"
                            style={{
                                textShadow: "0 0 30px rgba(220,38,38,0.8), 0 0 60px rgba(220,38,38,0.4)",
                                letterSpacing: "-0.05em"
                            }}
                        >
                            STRENGTH
                        </h2>
                    </motion.div>

                    {/* Subtítulo Técnico */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8, duration: 0.8 }}
                        className="text-xs md:text-sm text-gray-400 mb-12 font-mono tracking-[0.4em] uppercase mt-4"
                    >
                        WHERE CHAMPIONS ARE FORGED
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.0 }}
                        className="flex flex-col md:flex-row gap-6 justify-center items-center w-full md:w-auto"
                    >
                        {/* Primario: Únete al equipo (Minimalista con hover de llenado rojo) */}
                        <a
                            href="#afiliacion"
                            onClick={(e) => scrollToSection(e, '#afiliacion')}
                            className="relative overflow-hidden border-2 border-anvil-red text-white py-4 px-12 rounded-xl font-black uppercase tracking-widest text-sm transition-all group w-full md:w-auto flex justify-center items-center"
                        >
                            <div className="absolute inset-0 bg-anvil-red translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
                            <span className="relative z-10 group-hover:animate-pulse">
                                Únete al equipo
                            </span>
                        </a>

                        {/* Secundario: SmartAuth unificado al estilo oscuro */}
                        <div className="w-full md:w-auto">
                            <SmartAuthButton
                                variant="ghost"
                                className="w-full py-4 px-12 text-sm rounded-xl font-black uppercase tracking-widest border-2 border-white/20 hover:border-white hover:bg-white/10"
                            />
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Filosofía */}
            <section id="filosofia" className="py-32 relative overflow-hidden">
                <div className="absolute top-20 -left-10 text-[20rem] font-black text-white/[0.02] font-bebas italic leading-none pointer-events-none">01</div>
                <div className="max-w-[1400px] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
                    <motion.div initial={{ opacity: 0, x: -50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                        <h2 className="text-5xl md:text-8xl font-black tracking-[0.05em] mb-12 uppercase font-bebas italic leading-[1.1] py-4">
                            WHERE <span className="text-anvil-red">CHAMPIONS</span> ARE <span className="text-white">FORGED</span>
                        </h2>
                        <div className="space-y-8 text-lg text-gray-400 leading-relaxed font-medium">
                            <p className="border-l-2 border-anvil-red pl-6">No somos un club convencional, buscamos que tu experiencia en tarima sea inmejorable. Como nuestro propio lema dice, <span className="text-white font-black italic">FORJAMOS CAMPEONES.</span></p>
                            <p>En Anvil Strength no solo te unes a un club, <span className="text-anvil-red font-black italic">te unes a una familia.</span> Queremos que tu camino vaya más allá de la competición. <span className="text-white font-bold">Tú pones el esfuerzo, nosotros la estructura.</span></p>
                        </div>
                    </motion.div>
                    <div className="relative">
                        <div className="aspect-[4/5] bg-gray-900 rounded-3xl overflow-hidden shadow-3xl">
                            <img src="/filosofia-competition.jpg" alt="Filosofía" className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700" />
                        </div>
                    </div>
                </div>
            </section>

            <BenefitsSection />
            <SoftwareSection />

            <section id="entrenadores" className="py-32 bg-[#050505]">
                <div className="max-w-[1400px] mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-24"
                    >
                        <h2 className="text-5xl md:text-7xl font-black tracking-[0.1em] uppercase font-bebas italic leading-[1.1] py-4">Nuestro <span className="text-anvil-red">Equipo</span></h2>
                        <div className="w-24 h-1 bg-anvil-red mx-auto mt-4"></div>
                    </motion.div>

                    {/* Entrenadores */}
                    <div className="mb-24">
                        <h3 className="text-3xl md:text-5xl font-black uppercase font-bebas italic text-gray-500 mb-12 tracking-[0.2em] text-center">Entrenadores</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-5xl mx-auto">
                            {coaches.filter(c => c.role.includes('ENTRENADOR')).map((coach, index) => (
                                <motion.div
                                    key={coach.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.1 }}
                                    whileHover={{ y: -10 }}
                                    onClick={() => setSelectedCoach(coach)}
                                    className="group relative aspect-[3/4] rounded-3xl overflow-hidden cursor-pointer border border-white/5 shadow-2xl"
                                >
                                    <img src={coach.image} alt={coach.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-8 flex flex-col justify-end">
                                        <h3 className="text-4xl font-black uppercase font-bebas italic leading-[1.1]">{coach.name}</h3>
                                        <p className="text-anvil-red font-black text-sm uppercase tracking-widest">{coach.role}</p>
                                    </div>
                                    <div className="absolute top-6 right-6 w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                        <Instagram className="w-5 h-5 text-white" />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Nutrición */}
                    <div>
                        <h3 className="text-3xl md:text-5xl font-black uppercase font-bebas italic text-gray-500 mb-12 tracking-[0.2em] text-center">Nutrición <span className="text-white">Deportiva</span></h3>
                        <div className="grid grid-cols-1 gap-10 max-w-md mx-auto">
                            {coaches.filter(c => c.role.includes('NUTRICIONISTA')).map((coach) => (
                                <motion.div
                                    key={coach.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    whileHover={{ y: -10 }}
                                    onClick={() => setSelectedCoach(coach)}
                                    className="group relative aspect-[3/4] rounded-3xl overflow-hidden cursor-pointer border border-white/5 shadow-2xl"
                                >
                                    <img src={coach.image} alt={coach.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-8 flex flex-col justify-end">
                                        <h3 className="text-4xl font-black uppercase font-bebas italic leading-[1.1]">{coach.name}</h3>
                                        <p className="text-anvil-red font-black text-sm uppercase tracking-widest">{coach.role}</p>
                                    </div>
                                    <div className="absolute top-6 right-6 w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                        <Instagram className="w-5 h-5 text-white" />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Atletas */}
            <section id="atletas" className="py-32 overflow-hidden relative">
                <div className="max-w-[1400px] mx-auto px-6 mb-16 flex justify-between items-end">
                    <h2 className="text-5xl md:text-8xl font-black tracking-tighter uppercase font-bebas italic leading-[1.1] py-6">Atletas <span className="text-anvil-red">Anvil</span></h2>
                    <button onClick={() => setIsTeamModalOpen(true)} className="text-gray-500 hover:text-white font-black uppercase tracking-widest text-xs border-b border-white/10 pb-2">Ver equipo completo</button>
                </div>
                <div className="relative flex overflow-hidden">
                    <motion.div className="flex gap-6 px-6" animate={{ x: -(carouselIndex * 344) }} transition={isTransitioning ? { duration: 1, ease: "easeOut" } : { duration: 0 }}>
                        {[...athletes, ...athletes, ...athletes].map((athlete, i) => (
                            <div key={i} className="relative w-[320px] aspect-[4/5] bg-gray-900 rounded-2xl overflow-hidden cursor-pointer group" onClick={() => setSelectedAthlete(athlete)}>
                                <img src={athlete.image} alt={athlete.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                                <div className="absolute bottom-0 p-8 bg-gradient-to-t from-black to-transparent w-full">
                                    <p className="text-anvil-red text-[10px] font-black uppercase tracking-widest">{athlete.category}</p>
                                    <p className="text-2xl font-black uppercase font-bebas italic">{athlete.name}</p>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>

            <ReviewsSection isAuthenticated={!!user} />

            {/* Logros */}
            <section id="logros" className="py-32 relative">
                <div className="max-w-[1400px] mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 gap-8"
                    >
                        <h2 className="text-5xl md:text-9xl font-black tracking-[0.05em] uppercase font-bebas italic leading-[1.1] py-4"><span className="text-anvil-red">Logros</span> del club</h2>
                        <button onClick={() => setIsAllAchievementsModalOpen(true)} className="bg-white/5 px-8 py-4 rounded-full text-xs font-black uppercase tracking-widest hover:bg-anvil-red transition-all border border-white/10">Ver historial completo</button>
                    </motion.div>
                    <div className="space-y-8">
                        {featuredAchievements.map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                whileHover={{ scale: 1.01 }}
                                className="flex flex-col md:flex-row bg-[#0a0a0a] rounded-3xl overflow-hidden border border-white/5 cursor-pointer group shadow-2xl h-auto md:h-[300px]"
                                onClick={() => setSelectedAchievement(item)}
                            >
                                <div className="w-full md:w-[350px] h-64 md:h-full shrink-0">
                                    <img src={item.images[0]} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" alt={item.title} />
                                </div>
                                <div className="p-8 md:p-12 flex-1 flex flex-col justify-center">
                                    <div className="flex items-center gap-4 mb-4">
                                        <Trophy className="text-anvil-red" size={24} />
                                        <span className="text-anvil-red font-black uppercase tracking-widest text-xs">{item.result}</span>
                                    </div>
                                    <h3 className="text-3xl md:text-5xl font-black uppercase font-bebas italic mb-4 leading-[1.1] tracking-wide">{item.title}</h3>
                                    <p className="text-gray-400 text-base leading-relaxed max-w-3xl line-clamp-3">{item.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Afiliación */}
            <section id="afiliacion" className="py-32 relative overflow-hidden">
                <div className="max-w-[1400px] mx-auto px-6">
                    <div className="bg-gradient-to-br from-[#111111] to-black p-12 md:p-24 rounded-[3rem] border border-white/5 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-5xl md:text-8xl font-black tracking-[0.05em] uppercase font-bebas italic leading-[1.1] py-6 mb-8">Únete al <br /><span className="text-anvil-red">Power Club</span></h2>
                            <p className="text-gray-400 text-lg mb-12">Buscamos atletas comprometidos. Si quieres llevar tu rendimiento al siguiente nivel, este es tu sitio.</p>
                            <div className="space-y-6">
                                {['Entrenamientos Personalizados', 'Software propio', 'Comunidad activa'].map(item => (
                                    <div key={item} className="flex items-center gap-4 text-xs font-black uppercase tracking-widest">
                                        <div className="w-2 h-2 bg-anvil-red rounded-full" /> {item}
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-black p-10 rounded-3xl border border-white/5"
                        >
                            <form className="space-y-6">
                                <input type="text" placeholder="NOMBRE" className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-xs font-black outline-none focus:border-anvil-red" />
                                <input type="email" placeholder="EMAIL" className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-xs font-black outline-none focus:border-anvil-red" />
                                <textarea placeholder="¿POR QUÉ ANVIL?" className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-xs font-black outline-none focus:border-anvil-red h-32 resize-none" />
                                <button className="w-full bg-anvil-red py-5 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-red-700 transition-all">Enviar Solicitud</button>
                            </form>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Contacto */}
            <section id="contacto" className="py-32">
                <div className="max-w-[1400px] mx-auto px-6 text-center">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-5xl md:text-8xl font-black tracking-[0.1em] uppercase font-bebas italic leading-[1.1] py-6 mb-20"
                    >
                        ¿Hablamos?
                    </motion.h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                        {[
                            { icon: <Mail />, title: 'EMAIL', info: 'anvilstrengthclub@gmail.com', href: 'mailto:anvilstrengthclub@gmail.com' },
                            { icon: <Instagram />, title: 'INSTAGRAM', info: 'anvilstrength_', href: 'https://www.instagram.com/anvilstrength_' },
                            { icon: <MessageCircle />, title: 'CONTACTO', info: '+34 640 76 16 74', href: 'https://api.whatsapp.com/send?phone=34640761674&text=Hola!%20Quer%C3%ADa%20solicitar%20informaci%C3%B3n%20para%20afiliarme%20al%20club.' }
                        ].map((item, i) => (
                            <motion.a
                                href={item.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                key={i}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-[#111111] p-12 rounded-[2.5rem] border border-white/5 hover:border-anvil-red/40 transition-all group block cursor-pointer"
                            >
                                <div className="text-anvil-red mb-6 flex justify-center group-hover:scale-110 transition-transform">{item.icon}</div>
                                <h3 className="font-black uppercase tracking-widest text-xs mb-2 text-white">{item.title}</h3>
                                <p className="text-gray-400 font-bold group-hover:text-white transition-colors">{item.info}</p>
                            </motion.a>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-24 border-t border-white/5">
                <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-12">
                    <img src="/logo-dark-removebg-preview.png" className="h-12 grayscale" alt="Logo" />
                    <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest">© {new Date().getFullYear()} ANVIL STRENGTH. ALL RIGHTS RESERVED.</p>
                    <div className="flex gap-8">
                        <a href="https://www.instagram.com/anvilstrength_" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-white transition-colors">
                            <Instagram />
                        </a>
                        <a href="mailto:anvilstrengthclub@gmail.com" className="text-gray-600 hover:text-white transition-colors">
                            <Mail />
                        </a>
                    </div>
                </div>
            </footer>

            <TeamModal isOpen={isTeamModalOpen} onClose={() => setIsTeamModalOpen(false)} athletes={athletes} onAthleteClick={setSelectedAthlete} />
            <AthleteDetailsModal isOpen={!!selectedAthlete} onClose={() => setSelectedAthlete(null)} athlete={selectedAthlete} />
            <CoachDetailsModal isOpen={!!selectedCoach} onClose={() => setSelectedCoach(null)} coach={selectedCoach} />
            <AchievementModal isOpen={!!selectedAchievement} onClose={() => setSelectedAchievement(null)} achievement={selectedAchievement} />
            <AllAchievementsModal isOpen={isAllAchievementsModalOpen} onClose={() => setIsAllAchievementsModalOpen(false)} achievements={featuredAchievements} onSelect={setSelectedAchievement} />

            <Bubble typebot="lead-generation-hhwa24t" apiHost="https://typebot.io" />

            <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                onClick={() => {
                    if ((window as any).Typebot) {
                        (window as any).Typebot.toggle();
                    } else {
                        console.warn('Typebot is not initialized yet');
                    }
                }}
                className="fixed bottom-6 right-6 z-[100] cursor-pointer group"
            >
                <div className="absolute -top-12 right-0 bg-white text-black text-[8px] font-black px-3 py-1 rounded-full whitespace-nowrap border-2 border-anvil-red">¿HABLAMOS? 🦍</div>
                <AnvilMascot className="w-24 h-24" />
            </motion.div>
        </div>
    );
}

function AchievementModal({ isOpen, onClose, achievement }: { isOpen: boolean, onClose: () => void, achievement: any }) {
    if (!isOpen || !achievement) return null;
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-[#1c1c1c] w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
                <div className="w-full md:w-1/2 md:h-auto bg-black">
                    <img src={achievement.images[0]} className="w-full h-full object-cover" alt="" />
                </div>
                <div className="p-12 md:w-1/2 overflow-y-auto">
                    <Trophy className="text-anvil-red mb-6" size={48} />
                    <h2 className="text-4xl md:text-5xl font-black text-white uppercase font-bebas italic leading-[1.1] mb-4 py-2 tracking-wide">{achievement.title}</h2>
                    <p className="text-xl text-anvil-red font-black italic mb-8 uppercase tracking-widest">{achievement.result}</p>
                    <p className="text-gray-400 leading-relaxed text-lg">{achievement.desc}</p>
                </div>
            </motion.div>
        </div>
    );
}

function AllAchievementsModal({ isOpen, onClose, achievements, onSelect }: { isOpen: boolean, onClose: () => void, achievements: any[], onSelect: (a: any) => void }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-md flex flex-col p-20 overflow-y-auto">
            <div className="flex justify-between items-center mb-12">
                <h2 className="text-6xl font-black text-white uppercase font-bebas italic">Historial de <span className="text-anvil-red">Gloria</span></h2>
                <button onClick={onClose} className="p-4 bg-white/10 rounded-full"><ChevronRight className="rotate-180" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {achievements.map((item) => (
                    <div key={item.id} onClick={() => { onSelect(item); onClose(); }} className="bg-[#1a1a1a] p-8 rounded-2xl border border-white/5 cursor-pointer hover:border-anvil-red/50 transition-all group">
                        <Trophy className="text-anvil-red mb-4 group-hover:scale-110 transition-transform" />
                        <h3 className="text-xl font-bold text-white uppercase">{item.title}</h3>
                        <p className="text-anvil-red text-sm font-black italic">{item.result}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}