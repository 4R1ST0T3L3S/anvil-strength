import { motion } from 'framer-motion';
import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { Calendar, Trophy, MapPin, ArrowRight, ExternalLink } from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';

interface CompetitionsPageProps {
    onLoginClick: () => void;
    user?: UserProfile | null;
}

export function CompetitionsPage({ onLoginClick }: CompetitionsPageProps) {
    const upcomingEvents = [
        {
            id: 1,
            title: "Campeonato Regional de Madrid",
            date: "15-16 Marzo 2026",
            location: "Madrid, España",
            type: "Regional AEP",
            status: "Inscripciones Abiertas"
        },
        {
            id: 2,
            title: "Copa de España 2026",
            date: "20-22 Mayo 2026",
            location: "Alhaurín de la Torre, Málaga",
            type: "Nacional AEP",
            status: "Próximamente"
        },
        {
            id: 3,
            title: "Arnold Classic Europe",
            date: "10-12 Octubre 2026",
            location: "Madrid, España",
            type: "Internacional",
            status: "Próximamente"
        }
    ];

    const pastResults = [
        {
            id: 1,
            title: "SBJ 2024",
            result: "3 Oros, 2 Platas",
            image: "/filosofia-competition.jpg" // Usando imagen existente como placeholder
        },
        {
            id: 2,
            title: "Copa de España 2025",
            result: "Campeones por Equipos",
            image: "/portadaanvil2.jpg" // Usando imagen existente como placeholder
        }
    ];

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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {upcomingEvents.map((event, index) => (
                            <motion.div
                                key={event.id}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="group bg-[#111] border border-white/5 hover:border-anvil-red/50 p-8 rounded-2xl relative overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-anvil-red/10"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ExternalLink size={20} />
                                </div>

                                <span className={`inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full mb-6 ${event.status === "Inscripciones Abiertas" ? "bg-green-500/10 text-green-500" : "bg-gray-800 text-gray-500"
                                    }`}>
                                    {event.status}
                                </span>

                                <h3 className="text-2xl font-black uppercase italic mb-2 line-clamp-2 min-h-[4rem]">{event.title}</h3>

                                <div className="space-y-3 text-gray-400 font-medium mt-4">
                                    <div className="flex items-center gap-3">
                                        <Calendar size={18} className="text-anvil-red" />
                                        <span>{event.date}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <MapPin size={18} className="text-anvil-red" />
                                        <span>{event.location}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Trophy size={18} className="text-anvil-red" />
                                        <span>{event.type}</span>
                                    </div>
                                </div>

                                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between group-hover:text-anvil-red transition-colors">
                                    <span className="text-xs font-bold uppercase tracking-widest">Ver Detalles</span>
                                    <ArrowRight size={16} />
                                </div>
                            </motion.div>
                        ))}
                    </div>
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
