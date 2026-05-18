
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { X, Trophy, User as UserIcon } from 'lucide-react';
import { calculateGLPoints, getGenderAndWeightFromCategory } from '../../../lib/glPoints';
import { motion } from 'framer-motion';

interface AnvilRankingProps {
    isOpen?: boolean;
    onClose?: () => void;
    user?: any;
    onBack?: () => void;
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
    anvil_points: number;
}

export function AnvilRanking({ isOpen, onClose, user: _user, onBack }: AnvilRankingProps) {
    // If used as a view in dashboard, it's always "open"
    const isModal = isOpen !== undefined;
    const isVisible = isModal ? isOpen : true;
    const [athletes, setAthletes] = useState<RankedAthlete[]>([]);
    const [loading, setLoading] = useState(true);
    const [rankingType, setRankingType] = useState<'gl' | 'coins'>('gl');

    useEffect(() => {
        if (isVisible) {
            fetchRankings();
        }
    }, [isVisible, rankingType]);

    const fetchRankings = async () => {
        setLoading(true);
        try {
            // Fetch profiles and their points
            const { data: profiles, error: profError } = await supabase
                .from('profiles')
                .select(`
                    *,
                    user_points (
                        balance
                    )
                `)
                .eq('role', 'athlete');

            if (profError) throw profError;

            const rankedData = (profiles || [])
                .map(profile => {
                    const squat = profile.squat_pr || 0;
                    const bench = profile.bench_pr || 0;
                    const deadlift = profile.deadlift_pr || 0;
                    const total = squat + bench + deadlift;
                    const catInfo = getGenderAndWeightFromCategory(profile.weight_category);
                    const gender = (profile.gender as 'male' | 'female') || catInfo?.gender || 'male';
                    const weight = catInfo?.weight || 80;
                    const gl = calculateGLPoints(total, weight, gender);
                    
                    return {
                        id: profile.id,
                        full_name: profile.full_name || 'Atleta',
                        avatar_url: profile.avatar_url,
                        gender,
                        weight_category: profile.weight_category || 'N/A',
                        squat_pr: squat,
                        bench_pr: bench,
                        deadlift_pr: deadlift,
                        total,
                        gl_points: gl,
                        anvil_points: profile.user_points?.[0]?.balance || 0
                    };
                })
                .sort((a, b) => rankingType === 'gl' ? b.gl_points - a.gl_points : b.anvil_points - a.anvil_points);

            setAthletes(rankedData);
        } catch (error) {
            console.error('Error fetching rankings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = isModal ? onClose : onBack;

    if (isModal && !isOpen) return null;

    const content = (
        <div className={isModal ? "fixed inset-0 z-[100] flex items-center justify-center p-4" : "w-full"}>
            {isModal && (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    onClick={onClose} 
                    className="absolute inset-0 bg-black/90 backdrop-blur-sm" 
                />
            )}
            
            <motion.div 
                initial={isModal ? { scale: 0.9, opacity: 0, y: 20 } : { opacity: 1 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className={`${isModal ? 'relative w-full max-w-4xl bg-[#1a1a1a] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col' : 'w-full bg-[#1a1a1a] border border-white/5 rounded-[2rem] flex flex-col'} max-h-[90vh] md:max-h-[85vh]`}
            >
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-anvil-red/10 to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-anvil-red rounded-xl text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                            <Trophy size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">Ranking <span className="text-anvil-red">Anvil</span></h2>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Donde se forjan las leyendas</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {/* Selector de Ranking */}
                        <div className="flex gap-1 p-1 bg-black/40 rounded-xl border border-white/5">
                            <button 
                                onClick={() => setRankingType('gl')}
                                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${rankingType === 'gl' ? 'bg-anvil-red text-white' : 'text-gray-500 hover:text-white'}`}
                            >
                                GL Points
                            </button>
                            <button 
                                onClick={() => setRankingType('coins')}
                                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${rankingType === 'coins' ? 'bg-yellow-500 text-black' : 'text-gray-500 hover:text-white'}`}
                            >
                                Coins
                            </button>
                        </div>
                        
                        {handleClose && (
                            <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-500 hover:text-white">
                                <X size={24} />
                            </button>
                        )}
                    </div>
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
                                {/* Rank */}
                                <div className={`w-8 h-8 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-lg md:rounded-xl font-black text-sm md:text-lg ${index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                                    index === 1 ? 'bg-gray-400/20 text-gray-400' :
                                        index === 2 ? 'bg-orange-700/20 text-orange-700' :
                                            'bg-white/5 text-gray-500'
                                    }`}>
                                    {index + 1}
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

                                {/* Score */}
                                <div className="text-right shrink-0">
                                    <p className={`text-xl md:text-2xl font-black italic tracking-tighter ${rankingType === 'coins' ? 'text-yellow-500' : 'text-white'}`}>
                                        {rankingType === 'gl' ? athlete.gl_points.toFixed(1) : athlete.anvil_points.toLocaleString()}
                                    </p>
                                    <p className={`text-[8px] md:text-[10px] font-bold uppercase tracking-widest ${rankingType === 'coins' ? 'text-yellow-600' : 'text-anvil-red'}`}>
                                        {rankingType === 'gl' ? 'GL Points' : 'Anvil Coins'}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </motion.div>
        </div>
    );

    return isModal ? createPortal(content, document.body) : content;
}
