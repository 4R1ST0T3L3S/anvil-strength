
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { X, Trophy, Medal, User as UserIcon } from 'lucide-react';
import { calculateGLPoints, getGenderAndWeightFromCategory } from '../../../lib/glPoints';

interface AnvilRankingProps {
    isOpen: boolean;
    onClose: () => void;
}

interface RankedAthlete {
    id: string;
    full_name: string;
    avatar_url?: string;
    gender?: 'male' | 'female';
    weight_category: string;
    squat_pr: number;
    bench_pr: number;
    deadlift_pr: number;
    total: number;
    gl_points: number;
}

export function AnvilRanking({ isOpen, onClose }: AnvilRankingProps) {
    const [athletes, setAthletes] = useState<RankedAthlete[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            fetchRankings();
        }
    }, [isOpen]);

    const fetchRankings = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'athlete');

            if (error) throw error;

            const rankedData = data
                .filter(profile => profile.weight_category && (profile.squat_pr || profile.bench_pr || profile.deadlift_pr))
                .map(profile => {
                    const squat = profile.squat_pr || 0;
                    const bench = profile.bench_pr || 0;
                    const deadlift = profile.deadlift_pr || 0;
                    const total = squat + bench + deadlift;


                    const catInfo = getGenderAndWeightFromCategory(profile.weight_category);

                    // Use explicit gender if available, otherwise infer from category
                    const gender = (profile.gender as 'male' | 'female') || catInfo?.gender || 'male';
                    const weight = catInfo?.weight || 80;

                    const gl = calculateGLPoints(total, weight, gender);

                    return {
                        id: profile.id,
                        full_name: profile.full_name || profile.name || 'Atleta',
                        avatar_url: profile.avatar_url,
                        gender: gender,
                        weight_category: profile.weight_category,
                        squat_pr: squat,
                        bench_pr: bench,
                        deadlift_pr: deadlift,
                        total,
                        gl_points: gl
                    };
                })
                .sort((a, b) => b.gl_points - a.gl_points);

            setAthletes(rankedData);
        } catch (error) {
            console.error('Error fetching rankings:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#121212] w-full max-w-2xl max-h-[90vh] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-anvil-red/10 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-anvil-red rounded-xl text-white shadow-lg shadow-anvil-red/20">
                            <Trophy size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Anvil Ranking Club</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Top GL Points Leaderboard</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 p-6 space-y-4">
                    {loading ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-24 bg-[#1c1c1c] rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        athletes.map((athlete, index) => (
                            <div
                                key={athlete.id}
                                className="group relative bg-[#1c1c1c] border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:border-anvil-red/30 transition-all"
                            >
                                {/* Rank */}
                                <div className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-xl font-black text-lg ${index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                                    index === 1 ? 'bg-gray-400/20 text-gray-400' :
                                        index === 2 ? 'bg-orange-700/20 text-orange-700' :
                                            'bg-white/5 text-gray-500'
                                    }`}>
                                    {index <= 2 ? <Medal size={20} /> : `#${index + 1}`}
                                </div>

                                {/* Avatar */}
                                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 overflow-hidden shrink-0">
                                    {athlete.avatar_url ? (
                                        <img src={athlete.avatar_url} alt={athlete.full_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                                            <UserIcon size={20} />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-bold uppercase truncate">{athlete.full_name}</h3>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center gap-2">
                                        <span>{athlete.weight_category}</span>
                                        <span className="w-1 h-1 bg-gray-600 rounded-full" />
                                        <span>Total: {athlete.total}kg</span>
                                    </p>
                                </div>

                                {/* GL Score */}
                                <div className="text-right">
                                    <p className="text-2xl font-black text-white italic tracking-tighter">
                                        {athlete.gl_points.toFixed(1)}
                                    </p>
                                    <p className="text-[10px] font-bold text-anvil-red uppercase tracking-widest">GL Points</p>
                                </div>

                                {/* Hover Detail (Desktop) */}
                                <div className="hidden md:group-hover:flex absolute inset-0 bg-black/90 z-10 rounded-2xl items-center justify-around px-8 animate-in fade-in duration-200">
                                    <div className="text-center">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Sentadilla</p>
                                        <p className="text-white font-black">{athlete.squat_pr}kg</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Banca</p>
                                        <p className="text-white font-black">{athlete.bench_pr}kg</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Muerto</p>
                                        <p className="text-white font-black">{athlete.deadlift_pr}kg</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
