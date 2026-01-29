import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, MapPin, ExternalLink, AlertCircle } from 'lucide-react';
import { fetchCompetitions, Competition } from '../services/aepService';

export function CalendarSection() {
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchCompetitions();
                // Additional filtering to remove placeholder rows often found in these sheets
                const filtered = data.filter(c =>
                    c.fecha &&
                    c.fecha.length > 2 &&
                    !c.fecha.toLowerCase().includes('fecha') &&
                    c.campeonato
                );
                setCompetitions(filtered);
            } catch (err) {
                console.error('Calendar Error:', err);
                setError(err instanceof Error ? err.message : 'No se pudo cargar el calendario. Inténtalo más tarde.');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64 bg-[#252525] rounded-xl border border-white/5 animate-pulse">
                <div className="text-gray-400 font-bold tracking-wider uppercase">Cargando Calendario...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-64 bg-[#252525] rounded-xl border border-red-500/20 p-8 text-center">
                <AlertCircle className="h-10 w-10 text-anvil-red mb-4" />
                <p className="text-white font-bold mb-2">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="text-sm text-gray-400 hover:text-white underline"
                >
                    Recargar página
                </button>
            </div>
        );
    }

    if (competitions.length === 0) {
        return (
            <div className="flex justify-center items-center h-64 bg-[#252525] rounded-xl border border-white/5">
                <p className="text-gray-400">No hay competiciones programadas por ahora.</p>
            </div>
        );
    }

    return (
        <div className="block">
            <div className="flex items-center gap-3 mb-6">
                <CalendarIcon className="h-6 w-6 text-anvil-red" />
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-white">
                    Calendario AEP 2025
                </h2>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {competitions.map((comp, index) => (
                    <div
                        key={index}
                        className="group relative bg-[#1c1c1c] border border-white/5 p-6 rounded-xl hover:border-anvil-red/50 transition-all duration-300"
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                            {/* Date & Location */}
                            <div className="flex-shrink-0 md:w-1/4">
                                <div className="flex items-center gap-2 text-anvil-red font-bold uppercase tracking-wider mb-1">
                                    <CalendarIcon size={16} />
                                    <span>{comp.fecha}</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-400 text-sm">
                                    <MapPin size={16} />
                                    <span>{comp.sede}</span>
                                </div>
                            </div>

                            {/* Championship Name */}
                            <div className="flex-grow">
                                <h3 className="text-lg md:text-xl font-bold text-white uppercase leading-tight group-hover:text-anvil-red transition-colors">
                                    {comp.campeonato}
                                </h3>
                            </div>

                            {/* Action */}
                            <div className="flex-shrink-0">
                                {comp.inscripciones && comp.inscripciones.toLowerCase().startsWith('http') && (
                                    <a
                                        href={comp.inscripciones}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-bold uppercase tracking-wider rounded-lg transition-colors border border-white/10"
                                    >
                                        <span>Inscribirse</span>
                                        <ExternalLink size={16} />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 text-center">
                <a
                    href="https://calendar.google.com/calendar/u/0/embed?src=asociacionpowerlifting@gmail.com&ctz=Europe/Madrid"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-500 hover:text-white transition-colors uppercase tracking-widest"
                >
                    Ver Calendario Oficial Completo &rarr;
                </a>
            </div>
        </div>
    );
}
