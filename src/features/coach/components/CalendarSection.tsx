import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, MapPin, ExternalLink, AlertCircle } from 'lucide-react';
import { fetchCompetitions, Competition } from '../../../services/aepService';
import { AssignCompetitionModal } from './AssignCompetitionModal';
import { useUser } from '../../../hooks/useUser';

export function CalendarSection() {
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
    const { data: user } = useUser();

    // Load AEP Calendar
    useEffect(() => {
        const loadAEPData = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await fetchCompetitions();

                const filtered = data.filter(c => {
                    const isValid = c.fecha &&
                        c.fecha.length > 2 &&
                        !c.fecha.toLowerCase().includes('fecha') &&
                        c.campeonato;
                    return !!isValid;
                });

                setCompetitions(filtered);
            } catch (err) {
                console.error('Error fetching AEP calendar:', err);
                setError('No se pudo cargar el calendario de la AEP.');
            } finally {
                setLoading(false);
            }
        };

        loadAEPData();
    }, []);



    const getCompetitionMeta = (comp: Competition) => {
        // Handle both types (AEP Competition has 'level', Team Group needs mapping or might have it)
        const level = comp.level || 'COMPETICIÓN';

        switch (level) {
            case 'AEP 3': return { level, color: 'text-orange-400', border: 'border-orange-500/50', bg: 'bg-orange-500/10', hover: 'hover:border-orange-500' };
            case 'AEP 2': return { level, color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10', hover: 'hover:border-yellow-500' };
            case 'AEP 1': return { level, color: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-blue-500/10', hover: 'hover:border-blue-500' };
            case 'NACIONAL': return { level, color: 'text-purple-400', border: 'border-purple-500/50', bg: 'bg-purple-500/10', hover: 'hover:border-purple-500' };
            case 'EPF': return { level, color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-500/10', hover: 'hover:border-green-500' };
            case 'IPF': return { level, color: 'text-[#e6c2a5]', border: 'border-[#e6c2a5]/50', bg: 'bg-[#e6c2a5]/10', hover: 'hover:border-[#e6c2a5]' };
            default: return { level: 'COMPETICIÓN', color: 'text-anvil-red', border: 'border-anvil-red/50', bg: 'bg-anvil-red/10', hover: 'hover:border-anvil-red' };
        }
    };

    return (
        <div className="block space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <CalendarIcon className="h-6 w-6 text-anvil-red" />
                    <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-white">
                        Calendario AEP 2026
                    </h2>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64 bg-[#252525] rounded-xl border border-white/5 animate-pulse">
                    <div className="text-gray-400 font-bold tracking-wider uppercase">Cargando...</div>
                </div>
            ) : error ? (
                <div className="flex flex-col justify-center items-center h-64 bg-[#252525] rounded-xl border border-red-500/20 p-8 text-center">
                    <AlertCircle className="h-10 w-10 text-anvil-red mb-4" />
                    <p className="text-white font-bold mb-2">{error}</p>
                    <button onClick={() => window.location.reload()} className="text-sm text-gray-400 hover:text-white underline">
                        Reintentar
                    </button>
                </div>
            ) : (
                /* AEP VIEW */
                <div className="grid grid-cols-1 gap-4">
                    {competitions.map((comp, index) => {
                        const meta = getCompetitionMeta(comp);
                        return (
                            <div key={index} className={`group relative bg-[#1c1c1c] border p-5 rounded-xl transition-all duration-300 ${meta.border} ${meta.hover}`}>
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-1">
                                            <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-black uppercase tracking-widest w-fit ${meta.bg} ${meta.color}`}>
                                                {meta.level}
                                            </div>
                                            <div className="flex items-center gap-2 text-white font-black uppercase text-xl md:text-2xl leading-none mt-1">
                                                <MapPin size={20} className={meta.color} />
                                                <span>{comp.sede}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-400 font-bold uppercase tracking-wider bg-black/30 px-3 py-1 rounded-lg">
                                            <CalendarIcon size={16} />
                                            <span>{comp.fecha}</span>
                                        </div>
                                    </div>
                                    <div className={`h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-1`} />
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <h3 className="text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wide truncate max-w-full md:max-w-[60%]">
                                            {comp.campeonato}
                                        </h3>
                                        <div className="flex-shrink-0 flex items-center gap-2 self-end md:self-auto">
                                            {user?.role === 'coach' && (
                                                <button
                                                    onClick={() => setSelectedCompetition(comp)}
                                                    className="inline-flex items-center gap-2 px-6 py-2 bg-anvil-red text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-red-600 transition-colors"
                                                >
                                                    Asignar
                                                </button>
                                            )}
                                            {comp.inscripciones && comp.inscripciones.toLowerCase().startsWith('http') && (
                                                <a href={comp.inscripciones} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold uppercase tracking-widest rounded transition-colors border border-white/10">
                                                    <ExternalLink size={14} />
                                                    <span className="hidden md:inline">Inscripción</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

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

            {/* Modal */}
            <AssignCompetitionModal
                isOpen={!!selectedCompetition}
                onClose={() => setSelectedCompetition(null)}
                competition={selectedCompetition}
            />
        </div>
    );
}
