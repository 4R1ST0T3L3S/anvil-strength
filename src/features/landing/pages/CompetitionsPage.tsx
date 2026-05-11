import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { Calendar, MapPin, Instagram, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { competitionsService } from '../../../services/competitionsService';
import { LiveCountdown } from '../../../components/ui/CompetitionCountdown';
import { athletes as athletesData } from '../../../data/athletes';
import { getCompetitionMeta, getAthleteRosterPhoto } from '../../../data/competitions';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDate = (dateStr: string): string => {
    try {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(date);
    } catch {
        return dateStr;
    }
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompetitionsPageProps {
    onLoginClick: () => void;
    user?: UserProfile | null;
}

interface GroupedCompetition {
    name: string;
    date: string;        // Earliest date
    location: string;
    level: string;
    athletes: { full_name: string; avatar_url: string | null }[];
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CompetitionsPage({ onLoginClick }: CompetitionsPageProps) {
    const [upcomingEvents, setUpcomingEvents] = useState<GroupedCompetition[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState<GroupedCompetition | null>(null);

    useEffect(() => {
        const fetchCompetitions = async () => {
            try {
                const data = await competitionsService.getPublicCompetitions();
                if (!data) return;

                // ── Group ONLY by name (not name+date) ──────────────────────
                // This ensures that the same competition with different dates
                // (one per athlete) appears only ONCE with all athletes merged.
                const groupedMap = new Map<string, GroupedCompetition>();

                data.forEach((assignment: {
                    name: string;
                    date: string;
                    location?: string;
                    level?: string;
                    athlete?: { full_name: string; avatar_url: string | null };
                }) => {
                    if (!assignment.athlete?.full_name) return;

                    // Normalize key: only by name (case-insensitive, trimmed)
                    const key = assignment.name.trim().toLowerCase();

                    if (!groupedMap.has(key)) {
                        groupedMap.set(key, {
                            name: assignment.name,
                            date: assignment.date,        // Will keep the earliest
                            location: assignment.location || 'Ubicación por confirmar',
                            level: assignment.level || 'Competición',
                            athletes: [],
                        });
                    }

                    const group = groupedMap.get(key)!;

                    // Keep the earliest date across all assignments for this competition
                    if (assignment.date < group.date) {
                        group.date = assignment.date;
                    }

                    // Add athlete if not already present
                    if (!group.athletes.some(a => a.full_name === assignment.athlete!.full_name)) {
                        group.athletes.push(assignment.athlete!);
                    }
                });

                setUpcomingEvents(Array.from(groupedMap.values()));
            } catch (error) {
                console.error('Error fetching competitions:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCompetitions();
    }, []);

    const pastResults = [
        { id: 1, title: 'SBD CUP 2025', result: '2 Platas', image: '/filosofia-competition.jpg' },
        { id: 2, title: 'AEP3 Las Torres de Cotillas', result: '2 Oros (Alejandro -83kg, Gema -63kg)', image: '/portadaanvil2.jpg' },
    ];

    return (
        <div className="font-sans min-h-screen bg-[#0a0a0a] text-white selection:bg-anvil-red selection:text-white overflow-x-hidden">
            <PublicHeader onLoginClick={onLoginClick} />

            {/* ── HERO ─────────────────────────────────────────────────────── */}
            <section className="relative pt-48 pb-24 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[#0a0a0a]">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.07)_0%,transparent_70%)]" />
                    <div className="absolute inset-0 opacity-[0.03]"
                        style={{
                            backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                            backgroundSize: '60px 60px',
                        }}
                    />
                </div>
                <div className="relative z-10 text-center px-4">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
                        <div className="inline-flex items-center gap-2 bg-anvil-red/10 border border-anvil-red/20 text-anvil-red text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-full mb-8">
                            <Calendar className="w-3.5 h-3.5" />
                            Temporada 2025 – 2026
                        </div>
                        <h1 className="text-6xl sm:text-8xl md:text-[11rem] font-black uppercase italic mb-6 font-bebas leading-none tracking-tight">
                            PRÓXIMAS{' '}
                            <span className="text-anvil-red drop-shadow-[0_0_40px_rgba(220,38,38,0.4)]">
                                COMPETICIONES
                            </span>
                        </h1>
                        <p className="text-gray-500 text-base sm:text-lg font-bold tracking-[0.3em] uppercase max-w-xl mx-auto">
                            Donde la preparación se encuentra con la plataforma.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* ── PRÓXIMAS COMPETICIONES ────────────────────────────────────── */}
            <section className="pb-20 pt-4 bg-[#0a0a0a]">
                <div className="max-w-[1400px] mx-auto px-6">
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="w-12 h-12 border-4 border-anvil-red border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : upcomingEvents.length > 0 ? (
                        <div className="space-y-8">
                            {upcomingEvents.map((event, index) => {
                                const meta = getCompetitionMeta(event.name);
                                return (
                                    <motion.div
                                        key={event.name}
                                        initial={{ opacity: 0, x: -30 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: index * 0.1 }}
                                        whileHover={{ scale: 1.01 }}
                                        onClick={() => setSelectedEvent(event)}
                                        className="flex flex-col lg:flex-row bg-[#111] rounded-[2.5rem] overflow-hidden border border-white/5 cursor-pointer group shadow-2xl min-h-[350px] transition-all hover:border-anvil-red/30"
                                    >
                                        {/* Cover Image */}
                                        <div className="w-full lg:w-[480px] h-64 lg:h-auto shrink-0 relative overflow-hidden">
                                            <img
                                                src={meta.coverImage}
                                                className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-110"
                                                alt={event.name}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = '/portadaanvil2.jpg';
                                                }}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
                                            <div className="absolute top-6 left-6">
                                                <span className="bg-anvil-red text-white text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-full shadow-lg">
                                                    {event.level}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-8 lg:p-12 flex-1 flex flex-col justify-center">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                                                <div>
                                                    <h3 className="text-4xl md:text-6xl font-black uppercase font-bebas italic leading-none mb-4 group-hover:text-anvil-red transition-colors duration-300">
                                                        {event.name}
                                                    </h3>
                                                    <div className="flex flex-wrap gap-6 text-gray-500 font-bold uppercase tracking-widest text-xs">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar size={13} className="text-anvil-red" />
                                                            {formatDate(event.date)}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <MapPin size={13} className="text-anvil-red" />
                                                            {event.location}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 bg-[#0a0a0a] backdrop-blur-md rounded-2xl p-4 border border-white/5">
                                                    <LiveCountdown targetDate={event.date} />
                                                </div>
                                            </div>

                                            {/* Athletes preview */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex -space-x-3">
                                                        {event.athletes.slice(0, 4).map((athlete, i) => (
                                                            <div key={i} className="w-10 h-10 rounded-full border-2 border-[#111] overflow-hidden bg-gray-800 shadow-lg">
                                                                {athlete.avatar_url ? (
                                                                    <img src={athlete.avatar_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-400 uppercase bg-[#1a1a1a]">
                                                                        {athlete.full_name.charAt(0)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {event.athletes.length > 4 && (
                                                            <div className="w-10 h-10 rounded-full border-2 border-[#111] bg-anvil-red flex items-center justify-center text-[10px] font-black text-white">
                                                                +{event.athletes.length - 4}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-xs font-black uppercase tracking-widest text-gray-500">
                                                        {event.athletes.length} {event.athletes.length === 1 ? 'Atleta convocado' : 'Atletas convocados'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-anvil-red font-black uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 duration-300">
                                                    Ver Roster <ChevronRight size={16} />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-32 border border-dashed border-white/10 rounded-[2.5rem]">
                            <p className="text-2xl font-bebas italic text-gray-600 uppercase tracking-widest">No hay competiciones programadas próximamente.</p>
                        </div>
                    )}
                </div>
            </section>

            {/* ── RESULTADOS ANTERIORES ─────────────────────────────────────── */}
            <section className="py-24 bg-[#0a0a0a]">
                <div className="max-w-[1400px] mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="flex justify-between items-end mb-16"
                    >
                        <h2 className="text-5xl md:text-9xl font-black uppercase font-bebas italic leading-none tracking-tight">
                            Resultados <span className="text-anvil-red">Anteriores</span>
                        </h2>
                    </motion.div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {pastResults.map((result, i) => (
                            <motion.div
                                key={result.id}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="relative aspect-video bg-[#111] rounded-3xl overflow-hidden group cursor-pointer border border-white/5 hover:border-anvil-red/30 transition-colors shadow-2xl"
                            >
                                <img
                                    src={result.image}
                                    alt={result.title}
                                    className="w-full h-full object-cover opacity-50 group-hover:opacity-70 group-hover:scale-105 transition-all duration-700"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-8 flex flex-col justify-end">
                                    <h3 className="text-4xl font-black uppercase font-bebas italic text-white mb-1">{result.title}</h3>
                                    <p className="text-anvil-red font-black uppercase tracking-widest text-sm">{result.result}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            <PublicFooter />

            {/* ── ROSTER MODAL ──────────────────────────────────────────────── */}
            <AnimatePresence>
                {selectedEvent && (
                    <RosterModal
                        event={selectedEvent}
                        onClose={() => setSelectedEvent(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Roster Modal ─────────────────────────────────────────────────────────────

interface RosterModalProps {
    event: GroupedCompetition;
    onClose: () => void;
}

function RosterModal({ event, onClose }: RosterModalProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [direction, setDirection] = useState(0);
    const dragX = useMotionValue(0);

    const athletes = event.athletes;
    const total = athletes.length;

    // Close on Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const goTo = useCallback((newIndex: number, dir: number) => {
        setDirection(dir);
        setActiveIndex((prev) => (newIndex + total) % total);
    }, [total]);

    const handleDragEnd = useCallback((_: unknown, info: { offset: { x: number } }) => {
        if (info.offset.x < -80) {
            goTo(activeIndex + 1, 1);
        } else if (info.offset.x > 80) {
            goTo(activeIndex - 1, -1);
        }
        dragX.set(0);
    }, [activeIndex, goTo, dragX]);

    // Helper to get relative position in the carousel
    const getRelativeIndex = (index: number) => {
        let diff = index - activeIndex;
        if (diff > total / 2) diff -= total;
        if (diff < -total / 2) diff += total;
        return diff;
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] flex flex-col bg-[#050505] overflow-hidden"
        >
            {/* Background elements */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] bg-anvil-red/[0.03] rounded-full blur-[150px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(220,38,38,0.15),transparent_70%)]" />
            </div>

            {/* Header bar */}
            <div className="relative z-[60] flex items-center justify-between px-8 py-6 flex-shrink-0">
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                    <p className="text-anvil-red text-[10px] font-black uppercase tracking-[0.4em] mb-1">Roster Oficial</p>
                    <h2 className="text-2xl md:text-5xl font-black uppercase font-bebas italic text-white leading-none tracking-tight">{event.name}</h2>
                </motion.div>
                <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-2 text-gray-500 text-[10px] font-black uppercase tracking-widest">
                        <Calendar size={12} className="text-anvil-red" />
                        {formatDate(event.date)}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-anvil-red/40 rounded-full transition-all group"
                    >
                        <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </button>
                </motion.div>
            </div>

            {/* Main Stage */}
            <div className="relative flex-1 flex flex-col items-center justify-start pt-10">
                
                {/* Spiral Carousel Container */}
                <div className="relative w-full h-[55vh] md:h-[60vh] flex items-center justify-center perspective-[1500px]">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <AnimatePresence mode="popLayout" initial={false}>
                            {athletes.map((athlete, index) => {
                                const relIndex = getRelativeIndex(index);
                                if (Math.abs(relIndex) > 1) return null;

                                const isCenter = relIndex === 0;
                                const fullData = athletesData.find(a => a.name === athlete.full_name);
                                const rosterPhoto = getAthleteRosterPhoto(athlete.full_name);

                                return (
                                    <motion.div
                                        key={athlete.full_name}
                                        initial={{ opacity: 0, x: relIndex * 400, scale: 0.5, filter: 'blur(10px)' }}
                                        animate={{ 
                                            opacity: isCenter ? 1 : 0.15, 
                                            x: relIndex * (window.innerWidth > 768 ? 550 : 320), 
                                            scale: isCenter ? 1 : 0.6,
                                            z: isCenter ? 0 : -300,
                                            rotateY: relIndex * -30,
                                            filter: isCenter ? 'blur(0px)' : 'blur(12px)',
                                        }}
                                        exit={{ opacity: 0, scale: 0.5, filter: 'blur(10px)' }}
                                        transition={{ type: 'spring', stiffness: 250, damping: 35 }}
                                        drag={isCenter ? "x" : false}
                                        dragConstraints={{ left: 0, right: 0 }}
                                        onDragEnd={handleDragEnd}
                                        className={`absolute w-full max-w-[600px] h-full flex flex-col items-center justify-end pointer-events-none ${isCenter ? 'z-40 pointer-events-auto cursor-grab active:cursor-grabbing' : 'z-10'}`}
                                    >
                                        <div className="relative w-full h-full flex flex-col items-center justify-end pb-0">
                                            {/* Athlete Image */}
                                            <div 
                                                className="relative w-full h-full flex items-end justify-center"
                                                style={{ maskImage: isCenter ? 'linear-gradient(to top, transparent 0%, black 10%)' : 'none', WebkitMaskImage: isCenter ? 'linear-gradient(to top, transparent 0%, black 10%)' : 'none' }}
                                            >
                                                {rosterPhoto ? (
                                                    <img
                                                        src={rosterPhoto}
                                                        alt={athlete.full_name}
                                                        className="w-auto h-full md:h-[115%] object-contain object-bottom relative z-20 transition-transform duration-500 hover:scale-[1.02]"
                                                        draggable={false}
                                                    />
                                                ) : (
                                                    <div className="w-64 h-64 rounded-full bg-gradient-to-br from-white/5 to-transparent border border-white/10 flex items-center justify-center text-8xl font-black text-gray-800 font-bebas italic mb-10">
                                                        {athlete.full_name.charAt(0)}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Center-only lighting/smoke */}
                                            {isCenter && (
                                                <div className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[250%] h-[70%] pointer-events-none z-10">
                                                    {/* Primary Floor Glow */}
                                                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[60%] h-40 bg-anvil-red/30 blur-[90px] rounded-full" />
                                                    
                                                    {/* Central Bright Spot */}
                                                    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-[30%] h-20 bg-anvil-red/50 blur-[50px] rounded-full" />

                                                    {/* Animated Smoke Layers */}
                                                    <motion.div 
                                                        animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.2, 1], y: [0, -15, 0] }}
                                                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                                                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.2),transparent_70%)] blur-[50px]" 
                                                    />
                                                    
                                                    <motion.div 
                                                        animate={{ opacity: [0.1, 0.3, 0.1], scale: [1.3, 1, 1.3], x: [-30, 30, -30] }}
                                                        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                                                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[140%] h-[90%] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.03),transparent_60%)] blur-[40px]" 
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Nav Arrows */}
                <div className="absolute inset-x-0 top-[40%] -translate-y-1/2 px-4 md:px-10 flex justify-between pointer-events-none z-[70]">
                    <button
                        onClick={() => goTo(activeIndex - 1, -1)}
                        className="p-5 bg-white/5 hover:bg-anvil-red/20 border border-white/10 hover:border-anvil-red/40 rounded-full transition-all group pointer-events-auto backdrop-blur-md"
                    >
                        <ChevronLeft className="w-8 h-8 group-hover:scale-110 transition-transform" />
                    </button>
                    <button
                        onClick={() => goTo(activeIndex + 1, 1)}
                        className="p-5 bg-white/5 hover:bg-anvil-red/20 border border-white/10 hover:border-anvil-red/40 rounded-full transition-all group pointer-events-auto backdrop-blur-md"
                    >
                        <ChevronRight className="w-8 h-8 group-hover:scale-110 transition-transform" />
                    </button>
                </div>

                {/* Description & Info Panel */}
                <div className="relative z-[80] w-full max-w-5xl px-6 pb-16 -mt-8 md:-mt-12 flex flex-col items-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeIndex}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            className="text-center w-full flex flex-col items-center"
                        >
                            {/* Giant Name */}
                            <h3 className="text-6xl md:text-[7rem] font-black uppercase font-bebas italic text-white leading-none mb-6 tracking-wide drop-shadow-2xl">
                                {athletes[activeIndex].full_name}
                            </h3>
                            
                            {/* Badges / Stats */}
                            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                                <div className="inline-flex items-center gap-2 bg-anvil-red text-white text-[11px] font-black uppercase tracking-[0.2em] px-5 py-2.5 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.4)] border border-white/10">
                                    {athletesData.find(a => a.name === athletes[activeIndex].full_name)?.category || 'Atleta Anvil'}
                                </div>
                                
                                {athletesData.find(a => a.name === athletes[activeIndex].full_name)?.competitionDate && (
                                    <div className="inline-flex items-center gap-2 bg-[#0a0a0a]/80 backdrop-blur-xl text-gray-300 text-[11px] font-black uppercase tracking-[0.2em] px-5 py-2.5 rounded-full border border-white/10 shadow-xl">
                                        <Calendar size={14} className="text-anvil-red" />
                                        {athletesData.find(a => a.name === athletes[activeIndex].full_name)!.competitionDate}
                                    </div>
                                )}

                                {athletesData.find(a => a.name === athletes[activeIndex].full_name)?.stats?.total ? (
                                    <div className="inline-flex items-center gap-2 bg-[#0a0a0a]/80 backdrop-blur-xl text-gray-300 text-[11px] font-black uppercase tracking-[0.2em] px-5 py-2.5 rounded-full border border-white/10 shadow-xl">
                                        Total: <span className="text-white text-sm">{athletesData.find(a => a.name === athletes[activeIndex].full_name)!.stats!.total} KG</span>
                                    </div>
                                ) : null}
                            </div>

                            {/* Description and Action */}
                            <div className="relative mx-auto max-w-3xl flex flex-col items-center">
                                <p className="text-lg md:text-xl text-gray-400 font-medium italic leading-relaxed mb-8 px-4 text-center">
                                    "{athletesData.find(a => a.name === athletes[activeIndex].full_name)?.description || 'Compitiendo al más alto nivel por el club Anvil Strength. Superando límites y forjando una nueva historia de éxito en la plataforma.'}"
                                </p>
                                
                                {athletesData.find(a => a.name === athletes[activeIndex].full_name)?.instagram && (
                                    <motion.a
                                        whileHover={{ scale: 1.05, backgroundColor: '#dc2626', borderColor: '#dc2626', color: 'white' }}
                                        whileTap={{ scale: 0.95 }}
                                        href={athletesData.find(a => a.name === athletes[activeIndex].full_name)!.instagram}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-3 text-gray-300 bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 px-8 py-4 rounded-2xl transition-all font-black uppercase tracking-[0.2em] text-xs shadow-xl"
                                    >
                                        <Instagram size={20} />
                                        {athletesData.find(a => a.name === athletes[activeIndex].full_name)!.instagram!.replace('https://www.instagram.com/', '@').replace('/', '')}
                                    </motion.a>
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Pagination dots */}
            <div className="relative z-[90] flex flex-col items-center gap-4 pb-12">
                <div className="flex items-center gap-3">
                    {athletes.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => goTo(i, i > activeIndex ? 1 : -1)}
                            className={`h-1.5 transition-all duration-500 rounded-full ${i === activeIndex ? 'w-16 bg-anvil-red shadow-[0_0_15px_rgba(220,38,38,0.8)]' : 'w-2.5 bg-white/10 hover:bg-white/30'}`}
                        />
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
