import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Calendar } from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';

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
                // 1. Get athletes assigned to this coach
                const { data: athleteLinks, error: linksError } = await supabase
                    .from('coach_athletes')
                    .select('athlete_id')
                    .eq('coach_id', user.id);

                if (linksError) throw linksError;

                const athleteIds = athleteLinks?.map(link => link.athlete_id) || [];

                if (athleteIds.length === 0) {
                    setCompetitions([]);
                    setLoading(false);
                    return;
                }

                // 2. Fetch entries ONLY for these athletes
                const { data, error } = await supabase
                    .from('competition_entries')
                    .select(`
                        *,
                        profiles (
                            id,
                            full_name,
                            nickname,
                            avatar_url
                        )
                    `)
                    .in('athlete_id', athleteIds)
                    .order('target_date', { ascending: true });

                if (error) throw error;

                // Group by competition
                const grouped = (data || []).reduce((acc: Record<string, CompetitionGroup>, entry: CompetitionEntry) => {
                    const key = `${entry.competition_name}-${entry.target_date}`;
                    if (!acc[key]) {
                        acc[key] = {
                            name: entry.competition_name,
                            date: entry.target_date,
                            entries: []
                        };
                    }
                    acc[key].entries.push(entry as CompetitionEntry);
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
    }, []);

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
                                        <p className="text-gray-400 text-sm">Fecha: <span className="text-white font-bold">{comp.date}</span></p>
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
                                        <div key={entry.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                            {entry.profiles?.avatar_url ? (
                                                <img src={entry.profiles.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center font-bold text-xs">
                                                    {entry.profiles?.full_name?.[0]}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-bold text-sm">{entry.profiles?.full_name}</p>
                                                <p className="text-xs text-gray-400">Categoría: {entry.category || 'N/A'}</p>
                                            </div>
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
