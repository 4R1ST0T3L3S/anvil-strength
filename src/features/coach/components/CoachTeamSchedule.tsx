import { useEffect, useState } from 'react';
import { Calendar, Trash2 } from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { competitionsService } from '../../../services/competitionsService';

interface CompetitionEntry {
    id: string;
    competition_name: string;
    target_date: string;
    athlete_id: string;
    category?: string;
    profiles: {
        id: string;
        full_name: string;
        nickname?: string;
        avatar_url?: string;
    } | null;
}

interface CompetitionGroup {
    name: string;
    date: string;
    entries: CompetitionEntry[];
}

export function CoachTeamSchedule({ user }: { user: UserProfile }) {
    const [competitions, setCompetitions] = useState<CompetitionGroup[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSchedule = async () => {
            try {
                // Fetch assignments directly using the service
                const assignments = await competitionsService.getCoachAssignments(user.id);

                if (!assignments || assignments.length === 0) {
                    setCompetitions([]);
                    setLoading(false);
                    return;
                }

                // Group by competition
                // We need to map the 'athlete' nested object to 'profiles' to match the existing rendering or update rendering
                // Let's update the mapping to match the Grouping logic
                const grouped = assignments.reduce((acc: Record<string, CompetitionGroup>, item: { id: string; name: string; date: string; athlete_id: string; level?: string; athlete?: { full_name: string; avatar_url: string } }) => {
                    // Item has: id, name, date, location, level, athlete: { full_name, avatar_url }
                    // We construct a unique key for the competition event
                    const key = `${item.name}-${item.date}`;

                    if (!acc[key]) {
                        acc[key] = {
                            name: item.name,
                            date: item.date,
                            entries: []
                        };
                    }

                    // Map to the structure expected by the render or simplfy the interface
                    // The current interface uses 'CompetitionEntry' with 'profiles'. 
                    // Let's adapt the item to that structure.
                    acc[key].entries.push({
                        id: item.id,
                        competition_name: item.name,
                        target_date: item.date,
                        athlete_id: item.athlete_id,
                        category: item.level || 'N/A', // Using level as category equivalent for display
                        profiles: {
                            id: item.athlete_id,
                            full_name: item.athlete?.full_name || 'Atleta',
                            avatar_url: item.athlete?.avatar_url,
                        }
                    });
                    return acc;
                }, {});

                setCompetitions(Object.values(grouped));
            } catch (err) {
                console.error('Error fetching schedule:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchSchedule();
    }, [user.id]);

    const handleUnassign = async (entryId: string, athleteName: string, competitionName: string) => {
        if (!confirm(`¿Estás seguro de que quieres desasignar a ${athleteName} de "${competitionName}"?`)) return;

        try {
            await competitionsService.removeAssignment(entryId);

            // Optimistic update
            setCompetitions(prevGroups => {
                const newGroups = prevGroups.map(group => ({
                    ...group,
                    entries: group.entries.filter(e => e.id !== entryId)
                })).filter(group => group.entries.length > 0);
                return newGroups;
            });

        } catch (err) {
            console.error('Error removing assignment:', err);
            alert('Error al eliminar la asignación.');
        }
    };

    if (loading) return <div className="p-8 text-center">Cargando agenda...</div>;

    return (
        <div className="p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-black uppercase tracking-tighter">Agenda del Equipo</h1>
                <p className="text-gray-400">Próximas competiciones y asistencia</p>
            </header>

            <div className="space-y-6">
                {competitions.length === 0 ? (
                    <div className="bg-[#252525] border border-white/5 rounded-xl p-8 text-center text-gray-500">
                        No hay competiciones programadas.
                    </div>
                ) : (
                    competitions.map((comp: CompetitionGroup, index: number) => (
                        <div key={index} className="bg-[#252525] border border-white/5 rounded-xl overflow-hidden">
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                                <div className="flex items-center gap-4">
                                    <div className="bg-anvil-red/20 text-anvil-red p-3 rounded-lg">
                                        <Calendar size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold uppercase">{comp.name}</h3>
                                        <p className="text-gray-400 text-sm">Fecha: <span className="text-white font-bold">
                                            {new Date(comp.date + 'T00:00:00').toLocaleDateString('es-ES', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </span></p>
                                    </div>
                                </div>
                                <span className="bg-white/10 px-3 py-1 rounded text-sm font-bold">
                                    {comp.entries.length} Atletas
                                </span>
                            </div>

                            <div className="p-6">
                                <h4 className="text-xs uppercase font-bold text-gray-500 mb-4">Equipo Asistente</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {comp.entries.map((entry: CompetitionEntry) => (
                                        <div key={entry.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/20 transition-colors">
                                            {entry.profiles?.avatar_url ? (
                                                <img src={entry.profiles.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center font-bold text-xs">
                                                    {entry.profiles?.full_name?.[0]}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-bold text-sm">{entry.profiles?.full_name}</p>
                                                <p className="text-xs text-gray-400">Nivel: {entry.category || 'N/A'}</p>
                                            </div>
                                            <button
                                                onClick={() => handleUnassign(entry.id, entry.profiles?.full_name || 'Atleta', comp.name)}
                                                className="ml-auto p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors group/delete"
                                                title="Desasignar competición"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
