import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, MapPin, Users, Star, Award } from 'lucide-react';
import { fetchCompetitions, Competition } from '../../../services/aepService';
import { AssignCompetitionModal } from './AssignCompetitionModal';
import { useUser } from '../../../hooks/useUser';

// 1. LISTA BLANCA DE CLUBES (Valencia, Murcia, Baleares)
const CLUBES_ZONA_ANVIL = [
    "flowerlifting club altea-finestrat-l'alfas", "iron team", "begoal power san vicente",
    "anvil strength", "elite lifters", "fuerza isabel atlas", "kraken strength",
    "gr strength torrent", "banzai strength", "montocan ceuti", "myrtea lifting club",
    "sparta murcia", "conra club de forca", "fuerza kb", "ciutat de palma",
    "asociacion iron lifters", "powerlifting ibiza"
];

// 2. PROVINCIAS DE TU TERRITORIAL
const PROVINCIAS_ZONA = ["valencia", "alicante", "castellon", "castellón", "murcia", "baleares", "palma", "ibiza", "menorca", "chiva", "elche", "sagunto", "torrent"];

// 3. BLACKLIST MANUAL (Para forzar "Invitado")
const FORZAR_INVITADOS = ["guanche", "arinaga", "palmas", "canarias", "tenerife", "tarragona", "barcelona", "vitoria", "gasteiz", "araba"];

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const esDeNuestraZona = (comp: Competition) => {
    const org = normalizar(comp.organizador || "");
    const sede = normalizar(comp.sede || "");
    const camp = normalizar(comp.campeonato || "");

    const esFalsoPositivo = FORZAR_INVITADOS.some(bad => org.includes(bad) || sede.includes(bad) || camp.includes(bad));
    if (esFalsoPositivo) return false;

    const matchClub = CLUBES_ZONA_ANVIL.some(club => org.includes(normalizar(club)) || camp.includes(normalizar(club)));
    const matchSede = PROVINCIAS_ZONA.some(s => sede.includes(s));

    return matchClub || matchSede;
};

export function CalendarSection() {
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
    const { data: user } = useUser();

    useEffect(() => {
        const loadAEPData = async () => {
            try {
                setLoading(true);
                const data = await fetchCompetitions();
                const filtered = data.filter(c => {
                    if (!c.fecha || !c.campeonato) return false;
                    const nivel = (c.level || "").toUpperCase().trim().replace(/\s/g, '');
                    const local = esDeNuestraZona(c);

                    if (nivel.includes('AEP1') || nivel.includes('COPA') || nivel.includes('EPF') || nivel.includes('IPF') || nivel.includes('NACIONAL') || nivel === 'ESP.') return true;
                    if (nivel.includes('AEP3')) return true;
                    if (nivel.includes('AEP2')) return local;
                    return false;
                });
                setCompetitions(filtered);
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        loadAEPData();
    }, []);

    const getCompetitionMeta = (comp: Competition) => {
        let level = (comp.level || 'COMPETICIÓN').toUpperCase().trim();
        const nombre = (comp.campeonato || "").toLowerCase();

        if (nombre.includes('clasificatorio')) level = 'CLASIFICATORIO';
        if (level === 'ESP.') level = 'EVENTO PATROCINADO';

        const esInvitado = (level.includes('AEP 3') || level === 'AEP3') && !esDeNuestraZona(comp);

        const config: Record<string, any> = {
            'AEP 3': { color: 'text-orange-400', border: 'border-orange-500/50', bg: 'bg-orange-500/10' },
            'AEP 2': { color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' },
            'AEP 1': { color: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-blue-500/10' },
            'CLASIFICATORIO': { color: 'text-purple-400', border: 'border-purple-500/50', bg: 'bg-purple-500/10', icon: <Award size={12} /> },
            'EVENTO PATROCINADO': { color: 'text-pink-400', border: 'border-pink-500/50', bg: 'bg-pink-500/10', icon: <Star size={12} /> },
            'EPF': { color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-500/10' },
            'IPF': { color: 'text-[#e6c2a5]', border: 'border-[#e6c2a5]/50', bg: 'bg-[#e6c2a5]/10' },
        };

        const theme = config[level] || { color: 'text-anvil-red', border: 'border-anvil-red/50', bg: 'bg-anvil-red/10' };
        return { ...theme, level, esInvitado };
    };

    return (
        <div className="block space-y-6">
            <div className="flex items-center gap-3">
                <CalendarIcon className="h-6 w-6 text-anvil-red" />
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-white">
                    Calendario AEP 2026
                </h2>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64 bg-[#1c1c1c] rounded-xl border border-white/5 font-black text-gray-500 italic">CARGANDO...</div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {competitions.map((comp, index) => {
                        const meta = getCompetitionMeta(comp);
                        // Desestructuración para evitar el error "isInvitado is not defined"
                        const { esInvitado, level, color, bg, border, icon } = meta;

                        return (
                            <div key={index} className={`relative bg-[#1c1c1c] border p-5 rounded-xl transition-all ${border} ${esInvitado ? 'opacity-70' : ''}`}>
                                <div className="flex flex-col gap-4">

                                    {/* SECCIÓN SUPERIOR: Badges y Fecha */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-2">
                                            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${bg} ${color}`}>
                                                {icon && icon}
                                                {level}
                                            </div>
                                            {esInvitado && (
                                                <div className={`flex items-center gap-1 ${bg} ${color} text-[10px] font-black px-2 py-1 rounded uppercase border ${border} border-opacity-30`}>
                                                    <Users size={12} /> Atleta Invitado
                                                </div>
                                            )}
                                        </div>

                                        {/* CAJA DE FECHA ESTILO ORIGINAL */}
                                        <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider bg-[#121212] border border-white/10 px-3 py-2 rounded-lg shrink-0 text-xs md:text-sm">
                                            <CalendarIcon size={16} className="text-gray-400" />
                                            <span>{comp.fecha}</span>
                                        </div>
                                    </div>

                                    {/* SECCIÓN CENTRAL: NOMBRE DEL CAMPEONATO (MÁS ARRIBA Y GRANDE) */}
                                    <div className="mt-1">
                                        <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter leading-tight italic">
                                            {comp.campeonato}
                                        </h3>
                                    </div>

                                    <div className="h-px w-full bg-white/5" />

                                    {/* SECCIÓN INFERIOR: UBICACIÓN Y BOTÓN */}
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-2 text-white font-black uppercase text-sm md:text-base">
                                            <MapPin size={18} className={color} />
                                            <span className="tracking-tight">{comp.sede}</span>
                                        </div>

                                        <div className="flex items-center gap-2 self-end md:self-auto">
                                            {user?.role === 'coach' && (
                                                <button
                                                    onClick={() => setSelectedCompetition(comp)}
                                                    className="px-8 py-2.5 bg-anvil-red text-white text-xs font-black uppercase rounded hover:bg-red-600 transition-all shadow-lg active:scale-95"
                                                >
                                                    Asignar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <AssignCompetitionModal
                isOpen={!!selectedCompetition}
                onClose={() => setSelectedCompetition(null)}
                competition={selectedCompetition}
            />
        </div>
    );
}