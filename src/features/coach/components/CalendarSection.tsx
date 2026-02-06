import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, MapPin, ExternalLink, AlertCircle, Users, Trophy, Trash2 } from 'lucide-react';
import { fetchCompetitions, Competition } from '../../../services/aepService';
import { competitionsService } from '../../../services/competitionsService';
import { AssignCompetitionModal } from './AssignCompetitionModal';
import { useUser } from '../../../hooks/useUser';

interface TeamCompetitionGroup {
    id: string; // use first assignment id as key
    name: string;
    date: string;
    location?: string;
    level?: string;
    athletes: { full_name: string, avatar_url?: string }[];
}

export function CalendarSection() {
    const [viewMode, setViewMode] = useState<'AEP' | 'TEAM'>('AEP');
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [teamCompetitions, setTeamCompetitions] = useState<TeamCompetitionGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
    const { data: user } = useUser();

    // Load AEP Calendar
    useEffect(() => {
        const loadAEPData = async () => {
            if (viewMode !== 'AEP') return;
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
            } catch (err: any) {
                console.error('Error fetching AEP calendar:', err);
                setError('No se pudo cargar el calendario de la AEP.');
            } finally {
                setLoading(false);
            }
        };

        const loadTeamData = async () => {
            if (viewMode !== 'TEAM' || !user?.id) return;
            try {
                setLoading(true);
                setError(null);

                const data = await competitionsService.getCoachAssignments(user.id);

                // Group by Competition (Name + Date)
                const groups: { [key: string]: TeamCompetitionGroup } = {};

                if (data) {
                    data.forEach((assignment: any) => {
                        const key = `${assignment.name}-${assignment.date}`;
                        if (!groups[key]) {
                            groups[key] = {
                                id: assignment.id,
                                name: assignment.name,
                                date: assignment.date,
                                location: assignment.location,
                                level: assignment.level,
                                athletes: []
                            };
                        }
                        groups[key].athletes.push({
                            ...assignment.athlete,
                            id: assignment.id // Store Assignment ID, not Athlete ID, for deletion
                        });
                    });
                }

                setTeamCompetitions(Object.values(groups));

            } catch (err: any) {
                console.error('Error fetching team calendar:', err);
                setError('No se pudieron cargar las competiciones asignadas.');
            } finally {
                setLoading(false);
            }
        };

        if (viewMode === 'AEP') {
            loadAEPData();
        } else {
            loadTeamData();
        }
    }, [viewMode, user?.id]);

    const handleUnassign = async (assignmentId: string, athleteName: string) => {
        if (!confirm(`¿Seguro que quieres desasignar a ${athleteName} de esta competición?`)) return;

        try {
            await competitionsService.removeAssignment(assignmentId);

            // Optimistic update
            setTeamCompetitions(prev => prev.map(group => ({
                ...group,
                athletes: group.athletes.filter(a => (a as any).id !== assignmentId) // Filter out the deleted assignment
            })).filter(group => group.athletes.length > 0)); // Remove empty groups

        } catch (err) {
            console.error('Error removing assignment:', err);
            alert('Error al desasignar.');
        }
    };

    const getCompetitionMeta = (comp: Competition | TeamCompetitionGroup) => {
        // Handle both types (AEP Competition has 'level', Team Group needs mapping or might have it)
        const level = (comp as any).level || 'COMPETICIÓN';

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
            {/* Header + Toggles */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <CalendarIcon className="h-6 w-6 text-anvil-red" />
                    <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-white">
                        {viewMode === 'AEP' ? 'Calendario AEP 2026' : 'Competiciones de Equipo'}
                    </h2>
                </div>

                {/* View Toggle */}
                <div className="bg-[#1c1c1c] p-1 rounded-lg flex border border-white/10 w-full md:w-auto">
                    <button
                        onClick={() => setViewMode('AEP')}
                        className={`flex-1 md:flex-none px-4 py-2 rounded-md text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'AEP'
                            ? 'bg-white text-black shadow-lg'
                            : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        Oficial AEP
                    </button>
                    <button
                        onClick={() => setViewMode('TEAM')}
                        className={`flex-1 md:flex-none px-4 py-2 rounded-md text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${viewMode === 'TEAM'
                            ? 'bg-anvil-red text-white shadow-lg'
                            : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Users size={14} />
                        Equipo
                    </button>
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
                    <button onClick={() => setViewMode(viewMode)} className="text-sm text-gray-400 hover:text-white underline">
                        Reintentar
                    </button>
                </div>
            ) : viewMode === 'AEP' ? (
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
            ) : (
                /* TEAM VIEW */
                <div className="space-y-4">
                    {teamCompetitions.length === 0 ? (
                        <div className="flex flex-col justify-center items-center h-64 bg-[#252525] rounded-xl border border-white/5 text-center p-8">
                            <Trophy className="h-12 w-12 text-gray-600 mb-4" />
                            <p className="text-gray-400 font-bold mb-2">No hay competiciones asignadas.</p>
                            <p className="text-sm text-gray-500">
                                Ve a la pestaña <span className="text-white font-bold cursor-pointer" onClick={() => setViewMode('AEP')}>"Oficial AEP"</span> para asignar competiciones a tus atletas.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6">
                            {teamCompetitions.map((group) => {
                                const meta = getCompetitionMeta(group);
                                return (
                                    <div key={group.id} className="bg-[#1c1c1c] border border-white/10 rounded-xl overflow-hidden">
                                        {/* Header */}
                                        <div className={`p-5 border-b border-white/5 ${meta.bg.replace('/10', '/5')}`}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-black uppercase tracking-widest w-fit mb-2 ${meta.bg} ${meta.color}`}>
                                                        {meta.level}
                                                    </div>
                                                    <h3 className="text-xl md:text-2xl font-black uppercase italic text-white leading-tight">
                                                        {group.location || 'Ubicación desconocida'}
                                                    </h3>
                                                    <p className="text-xs text-gray-400 uppercase tracking-widest mt-1">{group.name}</p>
                                                </div>
                                                <div className="flex items-center gap-2 text-white font-bold uppercase bg-black/40 px-3 py-2 rounded-lg">
                                                    <CalendarIcon size={16} className="text-gray-400" />
                                                    <span>{group.date}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Athletes List */}
                                        <div className="p-5">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
                                                <Users size={14} /> Atletas Convocados ({group.athletes.length})
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                {group.athletes.map((athlete: any, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-[#252525] border border-white/5 group/athlete">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className="w-8 h-8 flex-shrink-0 rounded-full bg-anvil-red/20 flex items-center justify-center text-anvil-red font-bold text-xs uppercase">
                                                                {athlete.full_name?.charAt(0) || 'A'}
                                                            </div>
                                                            <span className="text-sm font-bold text-gray-200 truncate">{athlete.full_name}</span>
                                                        </div>

                                                        {user?.role === 'coach' && (
                                                            <button
                                                                onClick={() => handleUnassign(athlete.id, athlete.full_name)}
                                                                className="opacity-0 group-hover/athlete:opacity-100 p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                                                                title="Desasignar"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
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
