import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, MapPin, Users, Star, Award, Plus } from 'lucide-react';
import { fetchCompetitions, Competition } from '../../../services/aepService';
import { AssignCompetitionModal } from './AssignCompetitionModal';
import { useUser } from '../../../hooks/useUser';
import { toast } from 'sonner';
import { competitionsService } from '../../../services/competitionsService';
import { Loader } from 'lucide-react';

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

export function CalendarSection({ onBack }: { onBack?: () => void }) {
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
    const [addingCompId, setAddingCompId] = useState<number | string | null>(null);
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

    const handleAddSelfCompetition = async (comp: Competition, indexKey: number) => {
        if (!user) return;
        try {
            setAddingCompId(indexKey);
            
            let finalDate = comp.dateIso;
            if (!finalDate) {
                finalDate = new Date().toISOString().split('T')[0];
            }

            await competitionsService.addSelfCompetition(user.id, {
                name: comp.campeonato,
                date: finalDate,
                end_date: comp.endDateIso,
                location: comp.sede,
                level: comp.level
            });

            toast.success("Competición añadida a tu calendario");
        } catch (error) {
            console.error('Error adding self competition', error);
            const msg = (error as Error).message || 'Error desconocido';
            toast.error(`No se pudo añadir: ${msg}`);
        } finally {
            setAddingCompId(null);
        }
    };

    const getCompetitionMeta = (comp: Competition) => {
        let level = (comp.level || 'COMPETICIÓN').toUpperCase().trim();
        const nombre = (comp.campeonato || "").toLowerCase();

        if (nombre.includes('clasificatorio')) level = 'CLASIFICATORIO';
        if (level === 'ESP.') level = 'EVENTO PATROCINADO';

        const esInvitado = (level.includes('AEP 3') || level === 'AEP3') && !esDeNuestraZona(comp);

        interface CompetitionTheme {
            color: string;
            border: string;
            line: string;
            bg: string;
            icon?: React.ReactNode;
        }

        const config: Record<string, CompetitionTheme> = {
            'AEP 3': { color: 'text-orange-400', border: 'border-white/5', line: 'border-l-orange-500', bg: 'bg-orange-500/10' },
            'AEP 2': { color: 'text-yellow-400', border: 'border-white/5', line: 'border-l-yellow-500', bg: 'bg-yellow-500/10' },
            'AEP 1': { color: 'text-blue-400', border: 'border-white/5', line: 'border-l-blue-500', bg: 'bg-blue-500/10' },
            'CLASIFICATORIO': { color: 'text-purple-400', border: 'border-white/5', line: 'border-l-purple-500', bg: 'bg-purple-500/10', icon: <Award size={12} /> },
            'EVENTO PATROCINADO': { color: 'text-pink-400', border: 'border-white/5', line: 'border-l-pink-500', bg: 'bg-pink-500/10', icon: <Star size={12} /> },
            'EPF': { color: 'text-green-400', border: 'border-white/5', line: 'border-l-green-500', bg: 'bg-green-500/10' },
            'IPF': { color: 'text-[#e6c2a5]', border: 'border-white/5', line: 'border-l-[#e6c2a5]', bg: 'bg-[#e6c2a5]/10' },
        };

        const theme = config[level] || { color: 'text-anvil-red', border: 'border-white/5', line: 'border-l-anvil-red', bg: 'bg-anvil-red/10' };
        return { ...theme, level, esInvitado };
    };

    return (
        <div className="block space-y-6">
            <div className="flex flex-col gap-2">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="self-start flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-2"
                    >
                        ← Volver al Dashboard
                    </button>
                )}
                <div className="flex items-center gap-3">
                    <CalendarIcon className="h-6 w-6 text-anvil-red" />
                    <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-white">
                        Calendario AEP 2026
                    </h2>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64 bg-[#0a0a0a] rounded-xl border border-white/5 font-black text-gray-500 italic">CARGANDO...</div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {competitions.map((comp, index) => {
                        const meta = getCompetitionMeta(comp);
                        // Desestructuración para evitar el error "isInvitado is not defined"
                        const { esInvitado, level, color, bg, border, line, icon } = meta;

                        return (
                            <div key={index} className={`relative bg-[#0a0a0a] border-y border-r ${border} border-l-[6px] ${line} p-6 md:p-8 rounded-[1.5rem] transition-all hover:bg-[#111] hover:border-r-white/10 ${esInvitado ? 'opacity-70' : ''}`}>
                                <div className="flex flex-col gap-5 md:gap-6">

                                    {/* SECCIÓN SUPERIOR: Badges y Fecha */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-2">
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest ${bg} ${color}`}>
                                                {icon && icon}
                                                {level}
                                            </div>
                                            {esInvitado && (
                                                <div className={`flex items-center gap-1.5 ${bg} ${color} text-[10px] font-black px-3 py-1.5 rounded-lg uppercase border border-white/5`}>
                                                    <Users size={12} /> Atleta Invitado
                                                </div>
                                            )}
                                        </div>

                                        {/* CAJA DE FECHA ESTILO CLEAN */}
                                        <div className="flex items-center gap-2 text-white font-black uppercase tracking-widest bg-white/5 border border-white/5 px-4 py-2.5 rounded-xl shrink-0 text-xs md:text-sm shadow-inner">
                                            <CalendarIcon size={16} className={color.replace('text-', 'text-')} />
                                            <span>{comp.fecha}</span>
                                        </div>
                                    </div>

                                    {/* SECCIÓN CENTRAL: NOMBRE DEL CAMPEONATO */}
                                    <div className="mt-1">
                                        <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-tight italic">
                                            {comp.campeonato}
                                        </h3>
                                    </div>

                                    <div className="h-px w-full bg-white/5" />

                                    {/* SECCIÓN INFERIOR: UBICACIÓN Y BOTÓN */}
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 md:gap-0">
                                        <div className="flex items-center gap-3 text-white font-black uppercase text-xs md:text-sm tracking-widest">
                                            <div className={`p-2 rounded-lg ${bg}`}>
                                                <MapPin size={18} className={color} />
                                            </div>
                                            <span>{comp.sede}</span>
                                        </div>

                                        <div className="flex items-center gap-2 self-end md:self-auto">
                                            {user?.role === 'coach' && (
                                                <button
                                                    onClick={() => setSelectedCompetition(comp)}
                                                    className="px-8 py-3 bg-anvil-red text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-red-600 transition-all shadow-lg active:scale-95"
                                                >
                                                    Asignar
                                                </button>
                                            )}
                                            {user?.role === 'athlete' && (
                                                <button
                                                    onClick={() => handleAddSelfCompetition(comp, index)}
                                                    disabled={addingCompId === index}
                                                    className="px-8 py-3 bg-white text-black text-xs font-black uppercase tracking-widest rounded-xl hover:bg-gray-200 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                                >
                                                    {addingCompId === index ? <Loader size={14} className="animate-spin" /> : <Plus size={16} />}
                                                    Añadir
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
