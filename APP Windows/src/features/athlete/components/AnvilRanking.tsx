import { useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { X, Trophy, User as UserIcon, Fish, ArrowUpRight, AlertTriangle, RefreshCw } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState';
import { calculateGLPoints, getGenderAndWeightFromCategory } from '../../../lib/glPoints';
import { m, AnimatePresence } from 'framer-motion';
import { lockBodyScroll } from '../../../lib/scrollLock';
import { useQuery } from '@tanstack/react-query';

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
    const [rankingType, setRankingType] = useState<'gl' | 'sushi'>('gl');

    const fetchRankings = useCallback(async (): Promise<RankedAthlete[]> => {
        try {
            const { data: profiles, error: profError } = await supabase
                .from('profiles')
                .select('*')
                .in('role', ['athlete', 'coach']);

            if (profError) throw profError;

            const rankedData = (profiles || [])
                .filter(profile => {
                    const email = profile.email?.toLowerCase() || '';
                    if (email.includes('anvilstrength')) return false;

                    // Un atleta ficticio (dado de alta por su entrenador, sin
                    // cuenta propia todavía) es una ficha de `profiles` como
                    // cualquier otra: sin este filtro seguía en el ranking
                    // aunque el entrenador ya lo hubiera borrado del equipo,
                    // porque desvincular NO borra el perfil (ver
                    // invitesService.unlinkAthlete). El ranking es una
                    // clasificación de PERSONAS que compiten con Anvil, no de
                    // fichas latentes.
                    if (profile.account_status === 'managed') return false;

                    const hasWeightCategory = profile.weight_category && profile.weight_category !== 'N/A';
                    const hasAnyPR = (profile.squat_pr || 0) > 0 || (profile.bench_pr || 0) > 0 || (profile.deadlift_pr || 0) > 0;

                    return hasWeightCategory || hasAnyPR;
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

            return rankedData;
        } catch (error) {
            console.error('Error fetching rankings:', error);
            return [];
        }
    }, [rankingType]);

    /*
     * El ranking del club.
     *
     * `enabled` sustituye al `if (isVisible)` que habia dentro del efecto:
     * cerrado no pide nada, y al reabrirlo aparece al instante desde la cache
     * en vez de con el giro de siempre. Ademas, el efecto llamaba a una
     * funcion declarada MAS ABAJO, que es lo que el analizador marcaba.
     */
    const consulta = useQuery({
        queryKey: ['ranking-club'],
        queryFn: fetchRankings,
        enabled: isVisible,
    });
    const athletes = consulta.data ?? [];
    const loading = consulta.isPending;

    // Cerradura de scroll compartida y con contador: ver src/lib/scrollLock.ts.
    useEffect(() => {
        if (!isVisible) return;
        return lockBodyScroll();
    }, [isVisible]);


    const handleClose = isModal ? onClose : onBack;

    if (isModal && !isOpen) return null;

    const content = (
        <div
            className="fixed inset-x-0 bottom-0 z-[20000] flex bg-black/95 backdrop-blur-xl top-0 items-center justify-center"
            onClick={(e) => e.target === e.currentTarget && handleClose?.()}
        >
            <div className="bg-surface-sunken border-line shadow-[0_0_100px_rgba(255,255,255,0.05)] overflow-hidden flex flex-col scale-in-center mt-0 relative border-2 border-t h-[90vh] w-[95vw] max-w-[1200px] rounded-[2rem]">
                
                {/* Ambient Background Gradient based on ranking type */}
                <div 
                    className="absolute inset-0 opacity-10 pointer-events-none transition-colors duration-slow"
                    style={{
                        background: `radial-gradient(circle at top right, ${rankingType === 'gl' ? '#ef4444' : '#06b6d4'}, transparent 60%)`,
                        filter: 'blur(100px)'
                    }}
                />

                {/* Header */}
                <div className="relative z-10 p-4 border-b border-subtle flex justify-between items-center bg-surface-sunken/80 backdrop-blur-sm shrink-0 px-6 py-4 h-24">
                    <div className="flex items-center gap-5">
                        <div className={`transition-colors origin-left ${rankingType === 'gl' ? 'text-brand-text' : 'text-cyan-400'}`}>
                            {rankingType === 'gl' ? <Trophy size={40} strokeWidth={1.5} className="w-12 h-12" /> : <Fish size={40} strokeWidth={1.5} className="w-12 h-12" />}
                        </div>
                        <div>
                            <h2 className="font-black uppercase tracking-tighter text-ink italic text-4xl">Ranking Anvil</h2>
                            <p className="font-black uppercase tracking-[0.3em] block text-t-xs" style={{ color: rankingType === 'gl' ? '#ef4444' : '#22d3ee' }}>Donde se forjan las leyendas</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {/* Selector de Ranking */}
                        <div className="bg-white/5 border border-line shadow-inner mr-2 flex p-1.5 rounded-2xl">
                            <button 
                                onClick={() => setRankingType('gl')}
                                className={`font-black uppercase tracking-widest transition-[background-color,box-shadow,color] px-6 py-3 rounded-xl text-t-xs ${rankingType === 'gl' ? 'bg-brand text-ink shadow-lg' : 'text-ink-subtle hover:text-ink hover:bg-white/5'}`}
                            >
                                <span className="flex items-center gap-2"><Trophy size={14} className="block" /> GL Points</span>
                            </button>
                            <button 
                                onClick={() => setRankingType('sushi')}
                                className={`font-black uppercase tracking-widest transition-[background-color,box-shadow,color] px-6 py-3 rounded-xl text-t-xs ${rankingType === 'sushi' ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'text-ink-subtle hover:text-ink hover:bg-white/5'}`}
                            >
                                <span className="flex items-center gap-2"><Fish size={14} className="block" /> Sushi</span>
                            </button>
                        </div>
                        
                        {handleClose && (
                            <button
                                onClick={handleClose}
                                className="bg-white/5 hover:bg-brand hover:text-ink flex items-center justify-center text-ink-muted transition-colors font-black text-xl shadow-inner w-14 h-14 rounded-2xl"
                            >
                                <X size={24} />
                            </button>
                        )}
                    </div>
                </div>

                {/* List - Scrollable Area */}
                <div className="relative z-10 flex-1 overflow-y-auto space-y-3 custom-scrollbar p-8">
                    {/* Sin esta rama, un fallo de red pintaba la lista VACÍA:
                        un ranking de club sin una sola fila, que se lee como
                        "aquí no compite nadie" en vez de como un error. */}
                    {consulta.isError ? (
                        <div className="mx-auto max-w-4xl">
                            <EmptyState
                                kind="error"
                                icon={<AlertTriangle size={20} aria-hidden="true" />}
                                title="No se ha podido cargar el ranking"
                                body="Ha sido un fallo puntual: lo más probable es que reintentando funcione."
                                action={
                                    <button
                                        onClick={() => consulta.refetch()}
                                        className="flex min-h-[44px] items-center gap-2 rounded-field border border-[var(--border-default)] px-4 text-t-xs font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
                                    >
                                        <RefreshCw size={14} aria-hidden="true" />
                                        Reintentar
                                    </button>
                                }
                            />
                        </div>
                    ) : loading ? (
                        <div className="max-w-4xl mx-auto space-y-4">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="bg-white/5 animate-pulse border border-subtle h-28 rounded-[2rem]" />
                            ))}
                        </div>
                    ) : athletes.length === 0 ? (
                        <div className="mx-auto max-w-4xl">
                            <EmptyState
                                icon={<Trophy size={20} aria-hidden="true" />}
                                title="El ranking está vacío"
                                body="Aparecerá en cuanto haya atletas con marcas registradas."
                            />
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto pb-12 space-y-4">
                            <AnimatePresence mode="popLayout">
                                {athletes.map((athlete, index) => (
                                    <m.div
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ delay: index * 0.05 }}
                                        key={athlete.id}
                                        className={`group relative bg-black/40 border border-line flex items-center hover:bg-white/5 hover:border-strong transition-[background-color,border-color,box-shadow] overflow-hidden rounded-[2rem] p-6 gap-6 ${
 index === 0 ? 'bg-gradient-to-r from-yellow-500/10 to-transparent border-yellow-500/30 shadow-[inset_4px_0_0_#eab308]' :
 index === 1 ? 'bg-gradient-to-r from-gray-400/10 to-transparent border-gray-400/30 shadow-[inset_4px_0_0_#9ca3af]' :
 index === 2 ? 'bg-gradient-to-r from-amber-700/10 to-transparent border-amber-700/30 shadow-[inset_4px_0_0_#b45309]' :
 ''
 }`}
                                    >
                                        {/* Rank Number */}
                                        <div className={`shrink-0 flex flex-col items-center justify-center font-black italic tracking-tighter w-12 ${
 index === 0 ? 'text-warning drop-shadow-[0_0_10px_rgba(234,179,8,0.5)] text-5xl' :
 index === 1 ? 'text-ink-muted text-4xl' :
 index === 2 ? 'text-amber-700 text-4xl' :
 'text-gray-600 text-3xl'
 }`}>
                                            {index + 1}
                                            {index === 0 && <span className="text-t-2xs font-black tracking-widest uppercase mt-1 not-italic">MVP</span>}
                                        </div>

                                        {/* Avatar */}
                                        <div className={`rounded-full overflow-hidden shrink-0 border-2 w-16 h-16 ${
 index === 0 ? 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' :
 index === 1 ? 'border-gray-400' :
 index === 2 ? 'border-amber-700' :
 'border-line'
 }`}>
                                            {athlete.avatar_url ? (
                                                <img src={athlete.avatar_url} alt={athlete.full_name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-white/5 flex items-center justify-center text-ink-subtle">
                                                    <UserIcon size={24} className="w-8 h-8" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Name & Info */}
                                        <div className="flex-1 min-w-0 pr-2">
                                            <h3 className={`font-black uppercase truncate italic text-xl ${index === 0 ? 'text-warning' : 'text-ink'}`}>
                                                {athlete.full_name}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="bg-white/10 text-ink-muted font-black uppercase tracking-widest px-2 py-0.5 rounded-md border border-subtle text-t-xs">
                                                    {athlete.weight_category !== 'N/A' ? athlete.weight_category : 'SIN CATEGORÍA'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Score */}
                                        <div className="text-right shrink-0 flex flex-col items-end">
                                            <div className="flex items-center gap-2">
                                                <p className={`font-black italic tracking-tighter text-4xl ${rankingType === 'sushi' ? 'text-cyan-400' : 'text-ink'}`}>
                                                    {rankingType === 'gl' ? athlete.gl_points.toFixed(1) : athlete.sushi_pieces}
                                                </p>
                                                <ArrowUpRight size={16} className={`mb-3 ${rankingType === 'sushi' ? 'text-cyan-600' : 'text-brand-text'}`} />
                                            </div>
                                            <p className={`font-black uppercase tracking-widest text-t-xs ${rankingType === 'sushi' ? 'text-cyan-600' : 'text-brand-text'}`}>
                                                {rankingType === 'gl' ? 'GL POINTS' : 'PIEZAS'}
                                            </p>
                                        </div>
                                    </m.div>
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
