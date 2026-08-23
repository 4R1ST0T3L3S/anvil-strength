import { useCallback, useEffect, useState } from 'react';
import { Calendar as CalendarIcon, MapPin, Users, Star, Award, Plus, RefreshCw, CloudOff, AlertTriangle } from 'lucide-react';
import { fetchCompetitionsDetailed, Competition, CompetitionSource } from '../../../services/aepService';
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
    const [refreshing, setRefreshing] = useState(false);
    const [source, setSource] = useState<CompetitionSource>('red');
    const [warning, setWarning] = useState<string | null>(null);
    const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
    const [addingCompId, setAddingCompId] = useState<number | string | null>(null);
    const { data: user } = useUser();

    /**
     * Carga el calendario.
     *
     * `fetchCompetitionsDetailed` no lanza nunca: cuando la federacion no
     * responde devuelve la ultima copia descargada o la del Excel oficial que
     * viaja con la aplicacion, y dice de donde vienen los datos. Antes esto
     * hacia `catch { console.error }` y dejaba la lista vacia, que es lo que
     * se veia como "el calendario no funciona": ni datos, ni error, ni forma
     * de reintentar.
     */
    const load = useCallback(async (force = false) => {
        if (force) setRefreshing(true); else setLoading(true);

        const result = await fetchCompetitionsDetailed({ force });

        const filtered = result.competitions.filter(c => {
            if (!c.fecha || !c.campeonato) return false;
            const nivel = (c.level || "").toUpperCase().trim().replace(/\s/g, '');
            const local = esDeNuestraZona(c);

            if (nivel.includes('AEP1') || nivel.includes('COPA') || nivel.includes('EPF') || nivel.includes('IPF') || nivel.includes('NACIONAL') || nivel === 'ESP.') return true;
            if (nivel.includes('AEP3')) return true;
            if (nivel.includes('AEP2')) return local;
            return false;
        });

        setCompetitions(filtered);
        setSource(result.source);
        setWarning(result.warning);
        setLoading(false);
        setRefreshing(false);
    }, []);

    // La primera carga del calendario. `load` empieza con un setState, asi
    // que llamarlo desde el CUERPO del efecto encadenaba un render; metido en
    // una promesa ocurre igual de pronto pero fuera del cuerpo, que es donde
    // el analizador si lo admite. El calendario AEP se descarga de un tercero
    // y no encaja bien en una consulta con cache: tiene su propio respaldo en
    // disco y su propio "reintentar" (ver fetchCompetitionsDetailed).
    useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

    const handleAddSelfCompetition = async (comp: Competition, indexKey: number) => {
        if (!user) return;
        try {
            setAddingCompId(indexKey);
            
            let finalDate = comp.dateIso;
            if (!finalDate) {
                finalDate = new Date().toISOString().split('T')[0];
            }

            const creada = await competitionsService.addSelfCompetition(user.id, {
                name: comp.campeonato,
                date: finalDate,
                end_date: comp.endDateIso,
                location: comp.sede,
                level: comp.level
            });

            // Si tu entrenador ya te la había asignado no se crea otra fila:
            // decir "añadida" cuando no se ha añadido nada haría pulsar de
            // nuevo pensando que falló.
            toast.success(
                (creada?.length ?? 0) > 0
                    ? 'Competición añadida a tu calendario'
                    : 'Ya la tenías en tu calendario'
            );
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <CalendarIcon className="h-6 w-6 text-anvil-red" />
                        <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-white">
                            Calendario AEP 2026
                        </h2>
                    </div>

                    {/* Reintentar tiene que estar SIEMPRE, no solo cuando algo
                        falla: la federacion publica cambios durante la
                        temporada y la cache dura horas. */}
                    <button
                        onClick={() => load(true)}
                        disabled={refreshing || loading}
                        className="flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2 text-t-2xs font-black uppercase tracking-widest text-ink-muted transition-colors hover:border-anvil-red/40 hover:text-white disabled:opacity-40"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Actualizando' : 'Actualizar'}
                    </button>
                </div>

                {/* De donde salen los datos. Solo se dice cuando NO vienen
                    frescos de la federacion: en el caso normal es ruido. */}
                {warning && (
                    <div className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3.5">
                        {source === 'local'
                            ? <CloudOff size={16} className="mt-0.5 shrink-0 text-yellow-500" />
                            : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-yellow-500" />}
                        <p className="text-xs leading-relaxed text-yellow-200/90">{warning}</p>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center rounded-xl border border-white/5 bg-[#0a0a0a] font-black italic text-gray-500">CARGANDO...</div>
            ) : competitions.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-[#0a0a0a] p-12 text-center">
                    <CalendarIcon size={40} className="mx-auto mb-4 text-gray-700" />
                    <p className="font-black uppercase tracking-wider text-gray-400">Sin competiciones</p>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600">
                        No se ha podido leer el calendario de la federacion y no hay ninguna copia guardada.
                    </p>
                    <button
                        onClick={() => load(true)}
                        className="mt-6 text-xs font-black uppercase tracking-widest text-anvil-red transition-colors hover:text-red-400"
                    >
                        Reintentar &rarr;
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {competitions.map((comp, index) => {
                        const meta = getCompetitionMeta(comp);
                        // Desestructuración para evitar el error "isInvitado is not defined"
                        const { esInvitado, level, color, bg, border, line, icon } = meta;

                        return (
                            <div key={index} className={`relative bg-[#0a0a0a] border-y border-r ${border} border-l-[6px] ${line} p-6 md:p-8 rounded-[1.5rem] transition-[background-color,border-color,opacity] hover:bg-[#111] hover:border-r-white/10 ${esInvitado ? 'opacity-70' : ''}`}>
                                <div className="flex flex-col gap-5 md:gap-6">

                                    {/* SECCIÓN SUPERIOR: Badges y Fecha */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-2">
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-t-2xs md:text-xs font-black uppercase tracking-widest ${bg} ${color}`}>
                                                {icon && icon}
                                                {level}
                                            </div>
                                            {esInvitado && (
                                                <div className={`flex items-center gap-1.5 ${bg} ${color} text-t-2xs font-black px-3 py-1.5 rounded-lg uppercase border border-white/5`}>
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
                                                    className="px-8 py-3 bg-anvil-red text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-red-600 transition-[background-color,transform] shadow-lg active:scale-95"
                                                >
                                                    Asignar
                                                </button>
                                            )}
                                            {user?.role === 'athlete' && (
                                                <button
                                                    onClick={() => handleAddSelfCompetition(comp, index)}
                                                    disabled={addingCompId === index}
                                                    className="px-8 py-3 bg-white text-black text-xs font-black uppercase tracking-widest rounded-xl hover:bg-gray-200 transition-[background-color,opacity,transform] active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
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
