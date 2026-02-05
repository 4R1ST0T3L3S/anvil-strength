
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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

    return createPortal(
        <div
            className="fixed inset-x-0 bottom-0 top-0 md:top-0 z-[20000] flex md:items-center md:justify-center bg-black/95 backdrop-blur-xl"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-[#1c1c1c] border-x-0 md:border-2 border-t-0 md:border-t border-white/10 w-full h-full md:w-full md:max-w-2xl md:h-[85vh] md:rounded-3xl shadow-[0_0_100px_rgba(255,0,0,0.15)] overflow-hidden flex flex-col scale-in-center mt-0">

                {/* Header */}
                <div className="p-4 md:p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-anvil-red/10 to-transparent shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 md:p-3 bg-anvil-red rounded-xl text-white shadow-lg shadow-anvil-red/20">
                            <Trophy size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-white">Anvil Ranking</h2>
                            <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest">Top GL Points</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* List - Scrollable Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 custom-scrollbar">
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-24 bg-[#1c1c1c] rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        athletes.map((athlete, index) => (
                            <div
                                key={athlete.id}
                                className="group relative bg-[#252525] border border-white/5 rounded-xl md:rounded-2xl p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 hover:border-anvil-red/30 transition-all"
                            >
                                {/* Top Row: Rank, Avatar, Name */}
                                <div className="flex items-center gap-3 w-full md:w-auto md:flex-1">
                                    {/* Rank */}
                                    <div className={`w-8 h-8 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-lg md:rounded-xl font-black text-sm md:text-lg ${index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                                        index === 1 ? 'bg-gray-400/20 text-gray-400' :
                                            index === 2 ? 'bg-orange-700/20 text-orange-700' :
                                                'bg-white/5 text-gray-500'
                                        }`}>
                                        {index <= 2 ? <Medal size={16} /> : `#${index + 1}`}
                                    </div>

                                    {/* Avatar */}
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 border border-white/10 overflow-hidden shrink-0">
                                        {athlete.avatar_url ? (
                                            <img src={athlete.avatar_url} alt={athlete.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-500">
                                                <UserIcon size={16} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Name & Category */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-white font-bold uppercase truncate text-sm md:text-base">{athlete.full_name}</h3>
                                        <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase tracking-wider">
                                            {athlete.weight_category}
                                        </p>
                                    </div>

                                    {/* GL Score - Mobile inline */}
                                    <div className="text-right md:hidden">
                                        <p className="text-xl font-black text-white italic tracking-tighter">
                                            {athlete.gl_points.toFixed(1)}
                                        </p>
                                        <p className="text-[8px] font-bold text-anvil-red uppercase">GL</p>
                                    </div>
                                </div>

                                {/* Mobile: PRs Row */}
                                <div className="flex md:hidden items-center justify-between gap-2 pl-11 text-[10px] text-gray-500">
                                    <span>S: <span className="text-white font-bold">{athlete.squat_pr}</span></span>
                                    <span>B: <span className="text-white font-bold">{athlete.bench_pr}</span></span>
                                    <span>D: <span className="text-white font-bold">{athlete.deadlift_pr}</span></span>
                                    <span className="text-gray-600">Total: {athlete.total}kg</span>
                                </div>

                                {/* Desktop: GL Score */}
                                <div className="hidden md:block text-right shrink-0">
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
        </div>,
        document.body
    );
}
