import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { Calendar, MapPin, Users } from 'lucide-react'; // Added Users icon
import { UserProfile } from '../../../hooks/useUser';
import { competitionsService } from '../../../services/competitionsService'; // Import service

interface CompetitionsPageProps {
    onLoginClick: () => void;
    user?: UserProfile | null;
}

interface GroupedCompetition {
    name: string;
    date: string;
    location: string;
    level: string;
    athletes: { full_name: string; avatar_url: string | null }[];
}

export function CompetitionsPage({ onLoginClick }: CompetitionsPageProps) {
    const [upcomingEvents, setUpcomingEvents] = useState<GroupedCompetition[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCompetitions = async () => {
            try {
                const data = await competitionsService.getPublicCompetitions();

                if (!data) return;

                // Group by name + date
                const groupedMap = new Map<string, GroupedCompetition>();

                data.forEach((assignment: any) => {
                    const key = `${assignment.name}-${assignment.date}`;

                    if (!groupedMap.has(key)) {
                        groupedMap.set(key, {
                            name: assignment.name,
                            date: assignment.date,
                            location: assignment.location || 'Ubicación por confirmar',
                            level: assignment.level || 'Competición',
                            athletes: []
                        });
                    }

                    const group = groupedMap.get(key)!;
                    // Avoid duplicate athletes if same athlete assigned twice (should not happen but safety)
                    if (assignment.athlete && !group.athletes.some(a => a.full_name === assignment.athlete.full_name)) {
                        group.athletes.push(assignment.athlete);
                    }
                });


                // Filter out groups that have no valid athletes
                const validEvents = Array.from(groupedMap.values()).filter(group => group.athletes.length > 0);
                setUpcomingEvents(validEvents);
            } catch (error) {
                console.error("Error fetching competitions:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCompetitions();
    }, []);

    const pastResults = [
        {
            id: 1,
            title: "SBJ 2024",
            result: "3 Oros, 2 Platas",
            image: "/filosofia-competition.jpg"
        },
        {
            id: 2,
            title: "Copa de España 2025",
            result: "Campeones por Equipos",
            image: "/portadaanvil2.jpg"
        }
    ];

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return new Intl.DateTimeFormat('es-ES', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }).format(date);
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <div className="font-sans min-h-screen bg-[#0a0a0a] text-white selection:bg-anvil-red selection:text-white overflow-x-hidden">
            <PublicHeader onLoginClick={onLoginClick} />

            {/* --- HERO SECTION --- */}
            <section className="relative h-[60vh] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[#0a0a0a]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900/40 via-[#0a0a0a] to-[#0a0a0a]" />
                    <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                </div>

                <div className="relative z-10 text-center px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h1 className="text-5xl sm:text-7xl md:text-9xl font-black tracking-tighter uppercase italic mb-4">
                            CALENDARIO <span className="text-transparent bg-clip-text bg-gradient-to-r from-anvil-red to-red-600 block sm:inline">COMPETITIVO</span>
                        </h1>
                        <p className="text-gray-400 text-lg sm:text-2xl font-bold tracking-widest uppercase max-w-2xl mx-auto">
                            Donde la preparación se encuentra con la plataforma.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* --- PRÓXIMAS COMPETICIONES --- */}
            <section className="py-20 bg-[#0a0a0a]">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="flex items-end justify-between mb-12 border-b border-white/10 pb-6">
                        <h2 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter">
                            Próximos <span className="text-white/50">Eventos</span>
                        </h2>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="w-12 h-12 border-4 border-anvil-red border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : upcomingEvents.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {upcomingEvents.map((event, index) => (
                                <motion.div
                                    key={`${event.name}-${index}`}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    className="group bg-[#111] border border-white/5 hover:border-anvil-red/50 p-8 rounded-2xl relative overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-anvil-red/10 flex flex-col"
                                >


                                    <span className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full mb-6 bg-anvil-red/10 text-anvil-red w-fit">
                                        {event.level}
                                    </span>

                                    <h3 className="text-2xl font-black uppercase italic mb-2 line-clamp-2 min-h-[4rem]">{event.name}</h3>

                                    <div className="space-y-3 text-gray-400 font-medium mt-4 flex-1">
                                        <div className="flex items-center gap-3">
                                            <Calendar size={18} className="text-anvil-red" />
                                            <span className="capitalize">{formatDate(event.date)}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <MapPin size={18} className="text-anvil-red" />
                                            <span>{event.location}</span>
                                        </div>
                                        <div className="flex items-start gap-3 mt-4 pt-4 border-t border-white/5">
                                            <Users size={18} className="text-anvil-red mt-1 shrink-0" />
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Atletas convocados:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {event.athletes.map((athlete, i) => (
                                                        <span key={i} className="text-sm text-white bg-white/5 px-2 py-1 rounded">
                                                            {athlete.full_name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-gray-500">
                            <p className="text-xl font-bold uppercase tracking-wider">No hay competiciones programadas próximamente.</p>
                        </div>
                    )}
                </div>
            </section>

            {/* --- RESULTADOS DESTACADOS --- */}
            <section className="py-20 bg-[#0f0f0f]">
                <div className="max-w-6xl mx-auto px-6">
                    <h2 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter mb-12 text-right">
                        Resultados <span className="text-anvil-red">Anteriores</span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {pastResults.map((result) => (
                            <div key={result.id} className="relative aspect-video bg-[#111] rounded-2xl overflow-hidden group cursor-pointer">
                                <img
                                    src={result.image}
                                    alt={result.title}
                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-700"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-8 flex flex-col justify-end">
                                    <h3 className="text-3xl font-black uppercase italic text-white mb-2">{result.title}</h3>
                                    <p className="text-xl text-anvil-red font-bold uppercase">{result.result}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <PublicFooter />
        </div>
    );
}
