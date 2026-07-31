import { useState, useEffect, useCallback } from 'react';
import { Swords, X, TrendingUp, History, Info, Loader, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Link } from 'react-router-dom';
import { useAnvilPoints } from '../../profile/hooks/useAnvilPoints';
import { ArenaBet, ArenaOption } from '../../../types/database';
import { ArenaBetCard } from '../components/ArenaBetCard';
import { ArenaBettingModal } from '../components/ArenaBettingModal';
import { ArenaAdminPanel } from '../components/ArenaAdminPanel';
import { motion, AnimatePresence } from 'framer-motion';

interface ExtendedProfile extends UserProfile {
    is_developer?: boolean;
}

export function ArenaView({ user }: { user: ExtendedProfile }) {
    const { data: pointsData, refetch: refetchPoints } = useAnvilPoints(user.id);
    const [bets, setBets] = useState<(ArenaBet & { options: ArenaOption[] })[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
    
    const [bettingModal, setBettingModal] = useState<{ 
        isOpen: boolean; 
        bet: ArenaBet | null; 
        option: ArenaOption | null; 
    }>({
        isOpen: false,
        bet: null,
        option: null
    });

    const [betSlip, setBetSlip] = useState<{
        bet: ArenaBet;
        option: ArenaOption | null;
        predictionValue?: number;
    }[]>([]);

    const fetchBets = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('arena_bets')
                .select(`
                    *,
                    options:arena_options(*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setBets(data || []);
        } catch (err) {
            console.error('Error fetching bets:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBets();

        // Real-time subscription for bets and options
        const betsChannel = supabase.channel('arena_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'arena_bets' }, () => fetchBets())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'arena_options' }, () => fetchBets())
            .subscribe();

        return () => {
            supabase.removeChannel(betsChannel);
        };
    }, [fetchBets]);

    const activeBets = bets.filter(b => b.status === 'open' || b.status === 'locked');
    const historyBets = bets.filter(b => b.status === 'resolved' || b.status === 'cancelled');

    const handlePlaceSingleBet = async (amount: number, predictionValue?: number) => {
        if (!bettingModal.bet) return;

        try {
            const { error } = await supabase.rpc('place_arena_bet', {
                p_bet_id: bettingModal.bet.id,
                p_option_id: bettingModal.option?.id || null,
                p_prediction_value: predictionValue || null,
                p_amount: amount
            });

            if (error) throw error;
            
            toast.success('¡Apuesta realizada con éxito!');
            refetchPoints();
            fetchBets();
            setBettingModal({ isOpen: false, bet: null, option: null });
        } catch (err: any) {
            toast.error(err.message || 'Error al realizar la apuesta');
        }
    };

    const handlePlaceParlay = async (amount: number) => {
        if (betSlip.length < 2) {
            toast.error('Necesitas al menos 2 apuestas para una combinada');
            return;
        }

        try {
            const legs = betSlip.map(s => ({
                bet_id: s.bet.id,
                option_id: s.option?.id,
                prediction_value: s.predictionValue
            }));

            const { error } = await supabase.rpc('place_arena_parlay', {
                p_amount: amount,
                p_legs: legs
            });

            if (error) throw error;

            toast.success('¡Combinada realizada! Mucha suerte.');
            setBetSlip([]);
            refetchPoints();
            fetchBets();
        } catch (err: any) {
            toast.error(err.message || 'Error al realizar la combinada');
        }
    };

    const addToSlip = (bet: ArenaBet & { options: ArenaOption[] }, option: ArenaOption | null) => {
        // Check if bet already in slip
        if (betSlip.find(s => s.bet.id === bet.id)) {
            toast.error('Ya tienes una apuesta de este combate en el boleto');
            return;
        }
        setBetSlip(prev => [...prev, { bet, option }]);
        toast.success('Añadido al boleto');
    };

    const removeFromSlip = (betId: string) => {
        setBetSlip(prev => prev.filter(s => s.bet.id !== betId));
    };

    const handleCreateBet = async (betData: Partial<ArenaBet>, options: string[]) => {
        const { data: bet, error: betError } = await supabase
            .from('arena_bets')
            .insert([betData])
            .select()
            .single();

        if (betError) throw betError;

        if (options.length > 0) {
            const optionsData = options.map(name => ({
                bet_id: bet.id,
                name: name
            }));

            const { error: optionsError } = await supabase
                .from('arena_options')
                .insert(optionsData);

            if (optionsError) throw optionsError;
        }
        
        fetchBets();
    };

    const handleResolveBet = async (betId: string, winningOptionId?: string, targetValue?: number) => {
        if (!window.confirm('¿Confirmas el resultado? Los puntos se repartirán inmediatamente.')) return;

        const { error } = await supabase.rpc('resolve_arena_bet', {
            p_bet_id: betId,
            p_winner_option_id: winningOptionId || null,
            p_target_value: targetValue || null
        });

        if (error) {
            alert(error.message);
            throw error;
        }
        fetchBets();
    };

    const handleDeleteBet = async (betId: string) => {
        if (!window.confirm('¿Seguro que quieres borrar esta apuesta?')) return;
        const { error } = await supabase.from('arena_bets').delete().eq('id', betId);
        if (error) alert(error.message);
        fetchBets();
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/5 px-4 md:px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-anvil-red rounded-lg text-black shadow-[0_0_15px_rgba(220,38,38,0.4)]">
                        <Swords size={18} />
                    </div>
                    <div>
                        <h1 className="text-lg md:text-xl font-black uppercase italic tracking-tighter leading-none">La Arena</h1>
                        <p className="text-[9px] md:text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Anvil Strength</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">Tu Saldo</span>
                        <span className="text-lg font-black text-yellow-500 leading-none">
                            {pointsData?.balance?.toLocaleString() || 0} <span className="text-xs italic">AC</span>
                        </span>
                    </div>
                    <Link to="/dashboard" className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-500 hover:text-white">
                        <X size={24} />
                    </Link>
                </div>
            </header>

            <main className="pt-24 pb-12 px-2 md:px-8 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Section */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Tab Selector */}
                        <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl border border-white/5 w-fit">
                            <button 
                                onClick={() => setActiveTab('active')}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                                    activeTab === 'active' ? 'bg-anvil-red text-white shadow-lg shadow-red-900/20' : 'text-gray-500 hover:text-white'
                                }`}
                            >
                                <TrendingUp size={14} />
                                Apuestas Activas
                            </button>
                            <button 
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                                    activeTab === 'history' ? 'bg-anvil-red text-white shadow-lg shadow-red-900/20' : 'text-gray-500 hover:text-white'
                                }`}
                            >
                                <History size={14} />
                                Historial
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <Loader className="animate-spin text-anvil-red" size={32} />
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cargando combates...</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6">
                                <AnimatePresence mode="popLayout">
                                    {(activeTab === 'active' ? activeBets : historyBets).map(bet => (
                                        <ArenaBetCard 
                                            key={bet.id} 
                                            bet={bet} 
                                            onBetClick={(b, o) => {
                                                // If parlay mode or just general, offer to add to slip
                                                setBettingModal({ isOpen: true, bet: b, option: o });
                                            }}
                                            onAddToSlip={(b, o) => addToSlip(b as any, o)}
                                        />
                                    ))}
                                </AnimatePresence>
                                
                                {(activeTab === 'active' ? activeBets : historyBets).length === 0 && (
                                    <div className="bg-white/5 border border-dashed border-white/10 rounded-[2.5rem] p-12 text-center">
                                        <Info className="mx-auto text-gray-600 mb-4" size={32} />
                                        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest italic">
                                            No hay apuestas {activeTab === 'active' ? 'activas en este momento' : 'en el historial'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6 w-full pr-4 md:pr-0">
                        {/* Mobile Balance Card */}
                        <div className="md:hidden bg-gradient-to-br from-yellow-500/20 to-transparent border border-yellow-500/20 p-6 rounded-[2rem] text-center">
                            <span className="text-[9px] font-black text-yellow-500/60 uppercase tracking-widest block mb-1">TU SALDO</span>
                            <div className="text-4xl font-black text-white italic tracking-tighter mb-1">
                                {pointsData?.balance?.toLocaleString() || 0}
                            </div>
                            <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest italic">Anvil Coins</span>
                        </div>

                        {/* Admin Panel */}
                        {user.is_developer && (
                            <ArenaAdminPanel 
                                bets={bets}
                                onCreateBet={handleCreateBet}
                                onResolveBet={handleResolveBet}
                                onDeleteBet={handleDeleteBet}
                            />
                        )}

                        {/* Rules / Legend Card */}
                        <div className="bg-[#0a0a0a] border border-white/5 p-8 rounded-[2rem] space-y-6">
                            <h3 className="text-sm font-black uppercase italic text-white flex items-center gap-2">
                                <Info size={16} className="text-anvil-red" /> Reglas de La Arena
                            </h3>
                            <div className="space-y-4">
                                <RuleItem 
                                    title="Reparto Proporcional"
                                    desc="El bote total se reparte entre los ganadores según el % apostado sobre el total de su lado."
                                />
                                <RuleItem 
                                    title="Cierre de Apuestas"
                                    desc="Las apuestas se bloquean poco antes de empezar el evento. ¡No esperes al último segundo!"
                                />
                                <RuleItem 
                                    title="Puntos de Honor"
                                    desc="Pronto: Los mejores apostadores aparecerán en el Salón de la Fama de Anvil."
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Modals */}
            <ArenaBettingModal 
                isOpen={bettingModal.isOpen}
                onClose={() => setBettingModal({ isOpen: false, bet: null, option: null })}
                bet={bettingModal.bet}
                option={bettingModal.option}
                balance={pointsData?.balance || 0}
                onConfirm={handlePlaceSingleBet}
                onAddToSlip={(b, o) => {
                    addToSlip(b as any, o);
                    setBettingModal({ isOpen: false, bet: null, option: null });
                }}
            />

            {/* Bet Slip (Parlay UI) */}
            <AnimatePresence>
                {betSlip.length > 0 && (
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4"
                    >
                        <div className="bg-[#0a0a0a] border border-anvil-red/30 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
                            <div className="bg-anvil-red px-6 py-3 flex justify-between items-center">
                                <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                                    <Swords size={14} /> Boleto de Apuestas ({betSlip.length})
                                </h3>
                                <button onClick={() => setBetSlip([])} className="text-white/60 hover:text-white">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            
                            <div className="p-4 max-h-60 overflow-y-auto space-y-2 scrollbar-hide">
                                {betSlip.map(leg => (
                                    <div key={leg.bet.id} className="bg-white/5 rounded-xl p-3 flex justify-between items-center border border-white/5">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase text-gray-500 truncate">{leg.bet.title}</p>
                                            <p className="text-xs font-bold text-white uppercase italic">
                                                Gana: <span className="text-anvil-red">{leg.option?.name || leg.predictionValue}</span>
                                            </p>
                                        </div>
                                        <button onClick={() => removeFromSlip(leg.bet.id)} className="p-2 text-gray-500 hover:text-anvil-red transition-colors">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 bg-black/40 border-t border-white/5">
                                {betSlip.length >= 2 ? (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center px-2">
                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Multiplicador Estimado</span>
                                            <span className="text-sm font-black text-yellow-500 italic">x{Math.pow(2, betSlip.length - 1).toFixed(1)}</span>
                                        </div>
                                        <button 
                                            onClick={() => handlePlaceParlay(100)} // Valor por defecto o abrir modal de importe
                                            className="w-full py-4 bg-anvil-red hover:bg-red-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3"
                                        >
                                            Realizar Combinada (100 AC)
                                            <Send size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-center text-[10px] font-black text-gray-500 uppercase tracking-widest py-2">
                                        Añade {2 - betSlip.length} más para una combinada
                                    </p>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function RuleItem({ title, desc }: { title: string; desc: string }) {
    return (
        <div className="space-y-1">
            <p className="text-[10px] font-black text-anvil-red uppercase italic tracking-widest">{title}</p>
            <p className="text-[10px] font-bold text-gray-500 uppercase leading-relaxed tracking-wider">{desc}</p>
        </div>
    );
}
