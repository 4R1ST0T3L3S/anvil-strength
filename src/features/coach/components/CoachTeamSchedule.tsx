import { useEffect, useState } from 'react';
import { Calendar, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from '../../../hooks/useUser';
import { competitionsService } from '../../../services/competitionsService';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';

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

export function CoachTeamSchedule({ user, onBack }: { user: UserProfile, onBack?: () => void }) {
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', description: '', onConfirm: () => { } });

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

    const handleUnassign = (entryId: string, athleteName: string, competitionName: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Desasignar Atleta',
            description: `¿Estás seguro de que quieres desasignar a ${athleteName} de "${competitionName}"?`,
            onConfirm: async () => {
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
                    // alert('Error al eliminar la asignación.'); // Removed alert, maybe add toast?
                }
            }
        });
    };

    if (loading) return <div className="p-8 text-center">Cargando agenda...</div>;

    return (
        <div className="p-8">
            <header className="mb-6">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-3 text-xs font-bold uppercase tracking-wider"
                    >
                        ← Volver al Dashboard
                    </button>
                )}
                <div className="flex items-center gap-3">
                    <Calendar size={28} className="text-anvil-red" />
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight text-white">Agenda del Equipo</h1>
                        <p className="text-sm text-gray-400">Próximas competiciones y asistencia</p>
                    </div>
                </div>
            </header>

            <div className="space-y-4">
                <AnimatePresence>
                {competitions.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-[#1c1c1c] border border-white/5 rounded-xl p-8 text-center flex flex-col items-center justify-center">
                        <Calendar size={24} className="text-gray-600 mb-3" />
                        <p className="text-sm font-medium text-gray-400">No hay competiciones programadas.</p>
                    </motion.div>
                ) : (
                    competitions.map((comp: CompetitionGroup, index: number) => (
                        <motion.div 
                            key={`${comp.name}-${comp.date}`} 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="bg-[#1c1c1c] rounded-xl overflow-hidden border border-white/5 shadow-md flex flex-col md:flex-row relative"
                        >
                            <div className="p-4 md:pr-16 flex-1 flex flex-col xl:flex-row gap-6">
                                {/* Competition Info */}
                                <div className="xl:w-1/3 flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-[#252525] border border-white/10 flex items-center justify-center shrink-0">
                                        <Calendar size={20} className="text-anvil-red" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white uppercase leading-tight mb-1">{comp.name}</h3>
                                        <p className="text-xs text-gray-400 font-medium tracking-wide">
                                            {new Date(comp.date + 'T00:00:00').toLocaleDateString('es-ES', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                </div>

                                {/* Athletes List */}
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 border-t xl:border-t-0 border-white/5 pt-4 xl:pt-0">
                                    {comp.entries.map((entry: CompetitionEntry) => (
                                        <div 
                                            key={entry.id} 
                                            className="flex items-center gap-2 p-2 bg-[#252525] hover:bg-[#333] transition-colors rounded-lg border border-transparent hover:border-white/10"
                                        >
                                            {entry.profiles?.avatar_url ? (
                                                <img src={entry.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-[#111] border border-white/10 flex items-center justify-center font-bold text-xs text-gray-300">
                                                    {entry.profiles?.full_name?.[0]?.toUpperCase()}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-xs text-white truncate">{entry.profiles?.full_name}</p>
                                                <p className="text-[10px] text-gray-500 uppercase truncate">{entry.category || 'N/A'}</p>
                                            </div>
                                            <button
                                                onClick={() => handleUnassign(entry.id, entry.profiles?.full_name || 'Atleta', comp.name)}
                                                className="p-1.5 text-gray-500 hover:text-red-500 rounded-md transition-colors"
                                                title="Desasignar atleta"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Side tag */}
                            <div className="absolute right-0 top-0 h-full w-14 bg-black/40 hidden md:flex flex-col items-center justify-center border-l border-white/5">
                                <span className="text-xl font-black text-anvil-red">{comp.entries.length}</span>
                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mt-1">Convoc.</span>
                            </div>
                        </motion.div>
                    ))
                )}
                </AnimatePresence>
            </div>

            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                description={confirmModal.description}
                confirmText="Desasignar"
                cancelText="Cancelar"
                variant="danger"
            />
        </div >
    );
}
