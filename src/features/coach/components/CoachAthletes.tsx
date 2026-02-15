import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Search, Dumbbell, Calendar, User as UserIcon } from 'lucide-react';
import { Skeleton } from '../../../components/ui/Skeleton';

interface CoachAthletesProps {
    user: UserProfile;
    onSelectAthlete: (id: string) => void;
    onBack?: () => void;
}

import { getWeekNumber } from '../../../utils/dateUtils';

interface AthleteWithPlan extends UserProfile {
    active_plan_name?: string;
    current_block_week?: number | string;
}

export function CoachAthletes({ user, onSelectAthlete, onBack }: CoachAthletesProps) {
    const [athletes, setAthletes] = useState<AthleteWithPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchAthletes = async () => {
            try {
                // 1. Get athlete IDs assigned to this coach
                const { data: links, error: linksError } = await supabase
                    .from('coach_athletes')
                    .select('athlete_id')
                    .eq('coach_id', user.id);

                if (linksError) throw linksError;

                const athleteIds = links?.map((l: { athlete_id: any; }) => l.athlete_id) || [];

                if (athleteIds.length === 0) {
                    setAthletes([]);
                    setLoading(false);
                    return;
                }

                // 2. Fetch profiles for these athletes
                const { data: profiles, error: profilesError } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', athleteIds)
                    .order('full_name', { ascending: true });

                if (profilesError) throw profilesError;

                // 3. Fetch active training BLOCKS (not plans) for these athletes
                // We fetch all active or seemingly active blocks to filter in JS
                const { data: blocks, error: blocksError } = await supabase
                    .from('training_blocks')
                    .select('athlete_id, name, start_week, end_week, is_active, created_at')
                    .in('athlete_id', athleteIds)
                    .order('created_at', { ascending: false });

                if (blocksError) {
                    console.error('Error fetching blocks:', blocksError);
                }

                // Merge data
                const currentWeek = getWeekNumber(new Date());


                const athletesWithPlans = profiles?.map(profile => {
                    // Find blocks for this athlete
                    const athleteBlocks = blocks?.filter(b => b.athlete_id === profile.id) || [];

                    // Priority 1: Explicitly Active AND covers current week
                    let activeBlock = athleteBlocks.find(b =>
                        b.is_active &&
                        (b.start_week || 0) <= currentWeek &&
                        (b.end_week || 53) >= currentWeek
                    );

                    // Priority 2: Covers current week (even if not explicitly marked active, maybe user forgot)
                    if (!activeBlock) {
                        activeBlock = athleteBlocks.find(b =>
                            (b.start_week || 0) <= currentWeek &&
                            (b.end_week || 53) >= currentWeek
                        );
                    }

                    // Priority 3: Fallback to just the most recently created active block
                    if (!activeBlock) {
                        activeBlock = athleteBlocks.find(b => b.is_active);
                    }

                    // Calculate relative week
                    let blockWeek: number | string | undefined;
                    if (activeBlock && activeBlock.start_week) {
                        if (currentWeek >= activeBlock.start_week && currentWeek <= (activeBlock.end_week || 53)) {
                            blockWeek = currentWeek - activeBlock.start_week + 1;
                        } else if (currentWeek < activeBlock.start_week) {
                            blockWeek = "Pre";
                        } else {
                            blockWeek = "Fin";
                        }
                    }

                    return {
                        ...profile,
                        active_plan_name: activeBlock?.name,
                        current_block_week: blockWeek
                    };
                }) || [];

                setAthletes(athletesWithPlans);
            } catch (err) {
                console.error('Error fetching athletes:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchAthletes();
    }, [user.id]);

    const filteredAthletes = athletes.filter(athlete =>
        (athlete.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (athlete.nickname?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="p-8">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-10 w-full md:w-64 rounded-lg" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <div key={i} className="bg-[#252525] rounded-2xl border border-white/5 p-6 space-y-4">
                            <div className="flex items-center gap-4">
                                <Skeleton className="w-16 h-16 rounded-full" />
                                <div className="space-y-2">
                                    <Skeleton className="h-5 w-32" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 py-3 border-t border-white/5">
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="hidden md:flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-2"
                        >
                            ← Volver al Dashboard
                        </button>
                    )}
                    <h1 className="text-3xl font-black uppercase tracking-tighter">Mis Atletas</h1>
                    <p className="text-gray-400">Gestiona el progreso de tu equipo</p>
                </div>

                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar atleta..."
                        className="w-full bg-[#252525] border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-anvil-red transition-all text-sm placeholder:text-gray-600"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredAthletes.map((athlete) => (
                    <div
                        key={athlete.id}
                        onClick={() => onSelectAthlete(athlete.id)}
                        className="group bg-[#252525] hover:bg-[#2a2a2a] rounded-2xl p-4 border border-white/5 hover:border-anvil-red/30 transition-all duration-300 cursor-pointer relative overflow-hidden"
                    >


                        <div className="flex items-start gap-3 mb-3">
                            {/* Avatar */}
                            <div className="relative">
                                {athlete.avatar_url ? (
                                    <img
                                        src={athlete.avatar_url}
                                        alt={athlete.full_name}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-white/10 group-hover:border-anvil-red transition-colors duration-300"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-lg font-bold border-2 border-white/10 group-hover:border-anvil-red transition-colors duration-300 shadow-inner">
                                        {athlete.full_name?.[0] || 'A'}
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 pt-1">
                                <h3 className="font-bold text-base leading-tight truncate text-white group-hover:text-anvil-red transition-colors">
                                    {athlete.full_name}
                                </h3>

                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-400">
                                    {athlete.weight_category && (
                                        <div className="flex items-center gap-1">
                                            <Dumbbell size={12} className="text-anvil-red/70" />
                                            <span>{athlete.weight_category}</span>
                                        </div>
                                    )}
                                    {athlete.age_category && (
                                        <div className="flex items-center gap-1">
                                            <UserIcon size={12} className="text-anvil-red/70" />
                                            <span>{athlete.age_category}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mb-3 bg-gradient-to-r from-white/5 to-transparent rounded-xl p-3 border border-white/5 relative group">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5 font-semibold">
                                <Calendar size={12} className="text-anvil-red" />
                                Bloque Actual
                            </p>
                            <div className="flex justify-between items-end gap-2">
                                <p className={`font-bold text-sm truncate ${athlete.active_plan_name ? 'text-white' : 'text-gray-500 italic'}`}>
                                    {athlete.active_plan_name || 'Sin plan activo'}
                                </p>
                                {athlete.active_plan_name && athlete.current_block_week && (
                                    <div className="flex flex-col items-end shrink-0">
                                        <span className="text-[10px] font-bold bg-anvil-red text-white px-2 py-0.5 rounded-full shadow-lg shadow-anvil-red/20 uppercase tracking-wide">
                                            {typeof athlete.current_block_week === 'number'
                                                ? `Semana ${athlete.current_block_week}`
                                                : athlete.current_block_week}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>



                        {/* PR Stats Grid - Cleaner look */}
                        <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/10 p-1">
                            <div className="text-center py-2 px-1 rounded-lg hover:bg-white/5 transition-colors">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">SQ</p>
                                <p className="font-bold text-white tabular-nums">{athlete.squat_pr || '-'}</p>
                            </div>
                            <div className="text-center py-2 px-1 rounded-lg hover:bg-white/5 transition-colors">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">BP</p>
                                <p className="font-bold text-white tabular-nums">{athlete.bench_pr || '-'}</p>
                            </div>
                            <div className="text-center py-2 px-1 rounded-lg hover:bg-white/5 transition-colors">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">DL</p>
                                <p className="font-bold text-white tabular-nums">{athlete.deadlift_pr || '-'}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredAthletes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                        <Search size={24} className="opacity-50" />
                    </div>
                    <p>No se encontraron atletas.</p>
                </div>
            )}
        </div>
    );
}
