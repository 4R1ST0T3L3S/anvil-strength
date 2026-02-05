import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, MapPin, ExternalLink, AlertCircle } from 'lucide-react';
import { fetchCompetitions, Competition } from '../../../services/aepService';
import { AssignCompetitionModal } from './AssignCompetitionModal';

export function CalendarSection() {
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                setError(null); // Reset error state
                const data = await fetchCompetitions();

                // Definimos las keywords para las zonas permitidas en AEP-2 y AEP-3
                const allowedRegionsValues = [
                    'valencia', 'alicante', 'castellon', 'castellón',
                    'baleares', 'palma', 'mallorca', 'ibiza', 'menorca',
                    'murcia', 'cartagena'
                ];

                const filtered = data.filter(c => {
                    // Filtro base de validez (ya existía)
                    const isValid = c.fecha &&
                        c.fecha.length > 2 &&
                        !c.fecha.toLowerCase().includes('fecha') &&
                        c.campeonato;

                    if (!isValid) return false;

                    // Lógica de Negocio: AEP-2 y AEP-3 solo zonas permitidas
                    const name = c.campeonato.toLowerCase();
                    const sede = c.sede.toLowerCase();

                    // Detectar si es AEP-2 o AEP-3
                    const isRestrictedType = name.includes('aep-2') || name.includes('aep 2') ||
                        name.includes('aep-3') || name.includes('aep 3');

                    if (isRestrictedType) {
                        // Si es tipo restringido, debe ser de una zona permitida
                        const isAllowedRegion = allowedRegionsValues.some(region => sede.includes(region));
                        return isAllowedRegion;
                    }

                    // AEP-1 y otros campeonatos se muestran siempre
                    return true;
                });

                setCompetitions(filtered);
            } catch (err) {
                // Detailed error logging for debugging
                console.error('❌ ERROR AL CARGAR CALENDARIO AEP:', {
                    error: err,
                    errorType: err instanceof Error ? err.constructor.name : typeof err,
                    message: err instanceof Error ? err.message : String(err),
                    stack: err instanceof Error ? err.stack : undefined
                });

                // User-friendly error messages based on error type
                let userMessage = 'No se pudo cargar el calendario de la AEP.';

                if (err instanceof Error) {
                    const errMsg = err.message.toLowerCase();

                    if (errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('cors')) {
                        userMessage = '🌐 Problema de conexión con el servidor de la AEP. Por favor, revisa tu conexión a internet.';
                    } else if (errMsg.includes('403') || errMsg.includes('forbidden') || errMsg.includes('unauthorized')) {
                        userMessage = '🔒 No tienes permiso para ver el calendario. Contacta con tu entrenador.';
                    } else if (errMsg.includes('404') || errMsg.includes('not found')) {
                        userMessage = '📅 El calendario de la AEP no está disponible temporalmente.';
                    } else if (errMsg.includes('timeout')) {
                        userMessage = '⏱️ La petición tardó demasiado. Reintenta en unos segundos.';
                    } else {
                        userMessage = `⚠️ ${err.message}`;
                    }
                }

                setError(userMessage);
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
                    Calendario AEP 2026
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
                            <div className="flex-shrink-0 flex items-center gap-2">
                                <button
                                    onClick={() => setSelectedCompetition(comp)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-anvil-red text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-red-600 transition-colors"
                                >
                                    Asignar
                                </button>

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

            {/* Modal */}
            <AssignCompetitionModal
                isOpen={!!selectedCompetition}
                onClose={() => setSelectedCompetition(null)}
                competition={selectedCompetition}
            />
        </div>
    );
}
