import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { X, Trophy, User as UserIcon, Fish, ArrowUpRight } from 'lucide-react';
import { calculateGLPoints, getGenderAndWeightFromCategory } from '../../../lib/glPoints';
import { motion, AnimatePresence } from 'framer-motion';

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
    sushi_pieces: number;
}

export function AnvilRanking({ isOpen, onClose, onBack }: AnvilRankingProps) {
    const isModal = isOpen !== undefined;
    const isVisible = isModal ? isOpen : true;
    const [athletes, setAthletes] = useState<RankedAthlete[]>([]);
    const [loading, setLoading] = useState(true);
    const [rankingType, setRankingType] = useState<'gl' | 'sushi'>('gl');

    useEffect(() => {
        if (isVisible) {
            fetchRankings();
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isVisible, rankingType]);

    const fetchRankings = async () => {
        setLoading(true);
        try {
            const { data: profiles, error: profError } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'athlete');

            if (profError) throw profError;

            const rankedData = (profiles || [])
                .filter(profile => {
                    const email = profile.email?.toLowerCase() || '';
                    return !email.includes('anvilstrength');
                })
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
                        sushi_pieces: profile.max_sushi_pieces || 0
                    };
                })
                .sort((a, b) => rankingType === 'gl' ? b.gl_points - a.gl_points : b.sushi_pieces - a.sushi_pieces);

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
        <div
            className="fixed inset-x-0 bottom-0 top-0 md:top-0 z-[20000] flex md:items-center md:justify-center bg-black/95 backdrop-blur-xl"
            onClick={(e) => e.target === e.currentTarget && handleClose?.()}
        >
            <div className="bg-[#0a0a0a] border-x-0 md:border-2 border-t-0 md:border-t border-white/10 w-full h-full md:h-[90vh] md:w-[95vw] md:max-w-[1200px] md:rounded-[2rem] shadow-[0_0_100px_rgba(255,255,255,0.05)] overflow-hidden flex flex-col scale-in-center mt-0 relative">
                
                {/* Ambient Background Gradient based on ranking type */}
                <div 
                    className="absolute inset-0 opacity-10 pointer-events-none transition-colors duration-1000"
                    style={{
                        background: `radial-gradient(circle at top right, ${rankingType === 'gl' ? '#ef4444' : '#06b6d4'}, transparent 60%)`,
                        filter: 'blur(100px)'
                    }}
                />

                {/* Header */}
                <div className="relative z-10 p-4 md:px-6 md:py-4 border-b border-white/5 flex justify-between items-center bg-[#0a0a0a]/80 backdrop-blur-sm shrink-0 h-16 md:h-24">
                    <div className="flex items-center gap-3 md:gap-5">
                        <div className={`w-10 h-10 md:w-16 md:h-16 rounded-[0.8rem] md:rounded-[1.4rem] flex items-center justify-center text-white shadow-2xl -rotate-3 border-2 border-white/10 transition-colors ${rankingType === 'gl' ? 'bg-gradient-to-br from-red-600 to-red-950 shadow-red-500/40' : 'bg-gradient-to-br from-cyan-400 to-blue-600 shadow-blue-500/40'}`}>
                            {rankingType === 'gl' ? <Trophy className="w-5 h-5 md:w-8 md:h-8" /> : <Fish className="w-5 h-5 md:w-8 md:h-8" />}
                        </div>
                        <div>
                            <h2 className="text-xl md:text-4xl font-black uppercase tracking-tighter text-white italic">Ranking Anvil</h2>
                            <p className="hidden md:block text-[10px] md:text-[12px] font-black uppercase tracking-[0.3em]" style={{ color: rankingType === 'gl' ? '#ef4444' : '#22d3ee' }}>Donde se forjan las leyendas</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 md:gap-3">
                        {/* Selector de Ranking */}
                        <div className="hidden sm:flex p-1 md:p-1.5 bg-white/5 rounded-xl md:rounded-2xl border border-white/10 shadow-inner mr-2">
                            <button 
                                onClick={() => setRankingType('gl')}
                                className={`px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-xs font-black uppercase tracking-widest transition-all ${rankingType === 'gl' ? 'bg-anvil-red text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                            >
                                <span className="flex items-center gap-2"><Trophy size={14} className="hidden md:block" /> GL Points</span>
                            </button>
                            <button 
                                onClick={() => setRankingType('sushi')}
                                className={`px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-xs font-black uppercase tracking-widest transition-all ${rankingType === 'sushi' ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                            >
                                <span className="flex items-center gap-2"><Fish size={14} className="hidden md:block" /> Sushi</span>
                            </button>
                        </div>
                        
                        {handleClose && (
                            <button
                                onClick={handleClose}
                                className="w-10 h-10 md:w-14 md:h-14 bg-white/5 hover:bg-anvil-red hover:text-white rounded-xl md:rounded-2xl flex items-center justify-center text-gray-400 transition-all font-black text-xl shadow-inner"
                            >
                                <X size={24} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Mobile Ranking Selector */}
                <div className="sm:hidden p-4 border-b border-white/5 bg-[#0a0a0a] shrink-0 relative z-10">
                    <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 shadow-inner">
                        <button 
                            onClick={() => setRankingType('gl')}
                            className={`flex-1 py-3 flex justify-center items-center gap-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${rankingType === 'gl' ? 'bg-anvil-red text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                        >
                            <Trophy size={14} /> GL Points
                        </button>
                        <button 
                            onClick={() => setRankingType('sushi')}
                            className={`flex-1 py-3 flex justify-center items-center gap-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${rankingType === 'sushi' ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                        >
                            <Fish size={14} /> Sushi
                        </button>
                    </div>
                </div>

                {/* List - Scrollable Area */}
                <div className="relative z-10 flex-1 overflow-y-auto p-4 md:p-8 space-y-3 custom-scrollbar">
                    {loading ? (
                        <div className="max-w-4xl mx-auto space-y-4">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="h-20 md:h-28 bg-white/5 rounded-2xl md:rounded-[2rem] animate-pulse border border-white/5" />
                            ))}
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto space-y-3 md:space-y-4 pb-12">
                            <AnimatePresence mode="popLayout">
                                {athletes.map((athlete, index) => (
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ delay: index * 0.05 }}
                                        key={athlete.id}
                                        className={`group relative bg-black/40 border border-white/10 rounded-2xl md:rounded-[2rem] p-4 md:p-6 flex items-center gap-3 md:gap-6 hover:bg-white/5 hover:border-white/20 transition-all overflow-hidden ${
                                            index === 0 ? 'bg-gradient-to-r from-yellow-500/10 to-transparent border-yellow-500/30 shadow-[inset_4px_0_0_#eab308]' :
                                            index === 1 ? 'bg-gradient-to-r from-gray-400/10 to-transparent border-gray-400/30 shadow-[inset_4px_0_0_#9ca3af]' :
                                            index === 2 ? 'bg-gradient-to-r from-amber-700/10 to-transparent border-amber-700/30 shadow-[inset_4px_0_0_#b45309]' :
                                            ''
                                        }`}
                                    >
                                        {/* Rank Number */}
                                        <div className={`w-8 md:w-12 shrink-0 flex flex-col items-center justify-center font-black italic tracking-tighter ${
                                            index === 0 ? 'text-yellow-500 text-3xl md:text-5xl drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]' :
                                            index === 1 ? 'text-gray-400 text-2xl md:text-4xl' :
                                            index === 2 ? 'text-amber-700 text-2xl md:text-4xl' :
                                            'text-gray-600 text-xl md:text-3xl'
                                        }`}>
                                            {index + 1}
                                            {index === 0 && <span className="text-[8px] md:text-[10px] font-black tracking-widest uppercase mt-1 not-italic">MVP</span>}
                                        </div>

                                        {/* Avatar */}
                                        <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full overflow-hidden shrink-0 border-2 ${
                                            index === 0 ? 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' :
                                            index === 1 ? 'border-gray-400' :
                                            index === 2 ? 'border-amber-700' :
                                            'border-white/10'
                                        }`}>
                                            {athlete.avatar_url ? (
                                                <img src={athlete.avatar_url} alt={athlete.full_name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-white/5 flex items-center justify-center text-gray-500">
                                                    <UserIcon size={24} className="md:w-8 md:h-8" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Name & Info */}
                                        <div className="flex-1 min-w-0 pr-2">
                                            <h3 className={`font-black uppercase truncate text-base md:text-xl italic ${index === 0 ? 'text-yellow-500' : 'text-white'}`}>
                                                {athlete.full_name}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="bg-white/10 text-gray-400 text-[9px] md:text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border border-white/5">
                                                    {athlete.weight_category !== 'N/A' ? athlete.weight_category : 'SIN CATEGORÍA'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Score */}
                                        <div className="text-right shrink-0 flex flex-col items-end">
                                            <div className="flex items-center gap-1.5 md:gap-2">
                                                <p className={`text-2xl md:text-4xl font-black italic tracking-tighter ${rankingType === 'sushi' ? 'text-cyan-400' : 'text-white'}`}>
                                                    {rankingType === 'gl' ? athlete.gl_points.toFixed(1) : athlete.sushi_pieces}
                                                </p>
                                                <ArrowUpRight size={16} className={`mb-2 md:mb-3 ${rankingType === 'sushi' ? 'text-cyan-600' : 'text-anvil-red'}`} />
                                            </div>
                                            <p className={`text-[9px] md:text-[11px] font-black uppercase tracking-widest ${rankingType === 'sushi' ? 'text-cyan-600' : 'text-anvil-red'}`}>
                                                {rankingType === 'gl' ? 'GL POINTS' : 'PIEZAS'}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return isModal ? createPortal(content, document.body) : content;
}
