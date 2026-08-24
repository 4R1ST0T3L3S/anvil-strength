import { useState, useCallback } from 'react';
import { Swords, X, TrendingUp, History, Info, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Link } from 'react-router-dom';
import { useAnvilPoints } from '../../profile/hooks/useAnvilPoints';
import { ArenaBet, ArenaOption } from '../../../types/database';
import { ArenaBetCard } from '../components/ArenaBetCard';
import { ArenaBettingModal } from '../components/ArenaBettingModal';
import { ArenaAdminPanel } from '../components/ArenaAdminPanel';
import { m, AnimatePresence } from 'framer-motion';
import { puede } from '../../../lib/roles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { SkeletonCard } from '../../../components/ui/Skeleton';

interface ExtendedProfile extends UserProfile {
    is_developer?: boolean;
}

export function ArenaView({ user }: { user: ExtendedProfile }) {
    const { data: pointsData, refetch: refetchPoints } = useAnvilPoints(user.id);
    const queryClient = useQueryClient();
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

    /**
     * Las apuestas de la Arena, con sondeo cada tres segundos.
     *
     * El sondeo lo lleva react-query y no un setInterval a pelo, que es lo
     * que habia. Dos cosas se arreglan solas al cambiarlo:
     *
     *   · Seguia consultando con la PESTANA EN SEGUNDO PLANO. Alguien que
     *     dejaba la Arena abierta en otra pestana hacia 1.200 consultas por
     *     hora sin mirar ninguna. react-query para al perder el foco.
     *   · Si una consulta tardaba mas de 3s, se solapaba con la siguiente.
     *     Aqui la siguiente se programa cuando termina la anterior.
     *
     * Tres segundos se mantienen: la Arena no necesita aviso al instante como
     * los mensajes, pero si que las apuestas de los demas aparezcan mientras
     * se esta mirando.
     */
    const consultaApuestas = useQuery({
        queryKey: ['apuestas-arena'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('arena_bets')
                .select('*, options:arena_options(*)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []) as (ArenaBet & { options: ArenaOption[] })[];
        },
        refetchInterval: 3000,
    });
    const bets = consultaApuestas.data ?? [];

    /** Tras apostar, resolver o borrar: se pide ya, sin esperar al sondeo. */
    const fetchBets = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['apuestas-arena'] });
    }, [queryClient]);

    /*
     * El sondeo cada 3 segundos lo lleva ahora react-query.
     *
     * Lo que habia era un setInterval a pelo. Dos problemas que se arreglan
     * solos al pasarlo a 'refetchInterval':
     *
     *   · Seguia sondeando con la PESTANA EN SEGUNDO PLANO. Alguien que dejaba
     *     la Arena abierta en otra pestana hacia 1.200 consultas por hora sin
     *     mirarlas. Por defecto, react-query para al perder el foco.
     *   · Si una consulta tardaba mas de 3s, se solapaba con la siguiente.
     *     react-query espera a que termine antes de programar la siguiente.
     *
     * Tres segundos se mantienen: la Arena no necesita aviso al instante como
     * los mensajes o el entrenamiento, pero si que las apuestas de los demas
     * aparezcan mientras se mira.
     */

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
        <div className="min-h-[100dvh] bg-surface-sunken text-ink">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-xl border-b border-subtle px-4 md:px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-anvil-red rounded-lg text-black shadow-[0_0_15px_rgba(220,38,38,0.4)]">
                        <Swords size={18} />
                    </div>
                    <div>
                        <h1 className="text-lg md:text-xl font-black uppercase italic tracking-tighter leading-none">La Arena</h1>
                        <p className="text-t-2xs font-bold text-ink-subtle uppercase tracking-widest mt-1">Anvil Strength</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-t-2xs font-black text-ink-subtle uppercase tracking-widest leading-none mb-1">Tu Saldo</span>
                        <span className="text-lg font-black text-warning leading-none">
                            {pointsData?.balance?.toLocaleString() || 0} <span className="text-xs italic">AC</span>
                        </span>
                    </div>
                    <Link to="/dashboard" className="p-2 hover:bg-white/10 rounded-full transition-colors text-ink-subtle hover:text-ink">
                        <X size={24} />
                    </Link>
                </div>
            </header>

            <main className="pt-24 pb-12 px-2 md:px-8 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Section */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Tab Selector */}
                        <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl border border-subtle w-fit">
                            <button 
                                onClick={() => setActiveTab('active')}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-t-2xs uppercase tracking-widest transition-[background-color,box-shadow,color] ${
 activeTab === 'active' ? 'bg-anvil-red text-ink shadow-lg shadow-red-900/20' : 'text-ink-subtle hover:text-ink'
 }`}
                            >
                                <TrendingUp size={14} />
                                Apuestas Activas
                            </button>
                            <button 
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-t-2xs uppercase tracking-widest transition-[background-color,box-shadow,color] ${
 activeTab === 'history' ? 'bg-anvil-red text-ink shadow-lg shadow-red-900/20' : 'text-ink-subtle hover:text-ink'
 }`}
                            >
                                <History size={14} />
                                Historial
                            </button>
                        </div>

                        {/* Los cuatro estados.
                            Antes eran dos y ninguno era el error: si la
                            consulta fallaba, `bets` venía vacío y la pantalla
                            decía "No hay apuestas activas en este momento",
                            que es una frase que suena a que la Arena está
                            tranquila — no a que no ha podido cargar.

                            El giro también se va: un esqueleto con la forma de
                            las tarjetas reserva el hueco, así que al llegar los
                            datos nada salta. */}
                        <EstadoDeDatos
                            consulta={consultaApuestas}
                            queEs="los combates"
                            vacio={(activeTab === 'active' ? activeBets : historyBets).length === 0}
                            esqueleto={
                                <div className="grid grid-cols-1 gap-6">
                                    <SkeletonCard />
                                    <SkeletonCard />
                                </div>
                            }
                            vacioIcono={<Info size={20} aria-hidden="true" />}
                            vacioTitulo={activeTab === 'active' ? 'No hay combates abiertos' : 'El historial está vacío'}
                            vacioCuerpo={
                                activeTab === 'active'
                                    ? 'Cuando alguien abra una apuesta, aparecerá aquí.'
                                    : 'Aquí irán quedando los combates que ya se hayan resuelto.'
                            }
                        >
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
                            </div>
                        </EstadoDeDatos>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6 w-full pr-4 md:pr-0">
                        {/* Mobile Balance Card */}
                        <div className="md:hidden bg-gradient-to-br from-yellow-500/20 to-transparent border border-warning/20 p-6 rounded-[2rem] text-center">
                            <span className="text-t-2xs font-black text-warning/60 uppercase tracking-widest block mb-1">TU SALDO</span>
                            <div className="text-4xl font-black text-ink italic tracking-tighter mb-1">
                                {pointsData?.balance?.toLocaleString() || 0}
                            </div>
                            <span className="text-t-2xs font-black text-warning uppercase tracking-widest italic">Anvil Coins</span>
                        </div>

                        {/* Trastienda de la Arena: crear, resolver y borrar
                            apuestas. `puede(..., 'ver_trastienda')` y no
                            `user.is_developer`: la marca sigue existiendo
                            como columna, pero desde los roles múltiples la
                            respuesta correcta la da el modelo de capacidades
                            —que además incluye a administración, que antes
                            se quedaba fuera sin ninguna razón—. */}
                        {puede(user, 'ver_trastienda') && (
                            <ArenaAdminPanel 
                                bets={bets}
                                onCreateBet={handleCreateBet}
                                onResolveBet={handleResolveBet}
                                onDeleteBet={handleDeleteBet}
                            />
                        )}

                        {/* Rules / Legend Card */}
                        <div className="bg-surface-sunken border border-subtle p-8 rounded-[2rem] space-y-6">
                            <h3 className="text-sm font-black uppercase italic text-ink flex items-center gap-2">
                                <Info size={16} className="text-brand-text" /> Reglas de La Arena
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
                    <m.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4"
                    >
                        <div className="bg-surface-sunken border border-anvil-red/30 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
                            <div className="bg-anvil-red px-6 py-3 flex justify-between items-center">
                                <h3 className="text-xs font-black uppercase tracking-widest text-ink flex items-center gap-2">
                                    <Swords size={14} /> Boleto de Apuestas ({betSlip.length})
                                </h3>
                                <button onClick={() => setBetSlip([])} className="text-ink-subtle hover:text-ink">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            
                            <div className="p-4 max-h-60 overflow-y-auto space-y-2 scrollbar-hide">
                                {betSlip.map(leg => (
                                    <div key={leg.bet.id} className="bg-white/5 rounded-xl p-3 flex justify-between items-center border border-subtle">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-t-2xs font-black uppercase text-ink-subtle truncate">{leg.bet.title}</p>
                                            <p className="text-xs font-bold text-ink uppercase italic">
                                                Gana: <span className="text-brand-text">{leg.option?.name || leg.predictionValue}</span>
                                            </p>
                                        </div>
                                        <button onClick={() => removeFromSlip(leg.bet.id)} className="p-2 text-ink-subtle hover:text-brand-text transition-colors">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 bg-black/40 border-t border-subtle">
                                {betSlip.length >= 2 ? (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center px-2">
                                            <span className="text-t-2xs font-black text-ink-subtle uppercase tracking-widest">Multiplicador Estimado</span>
                                            <span className="text-sm font-black text-warning italic">x{Math.pow(2, betSlip.length - 1).toFixed(1)}</span>
                                        </div>
                                        <button 
                                            onClick={() => handlePlaceParlay(100)} // Valor por defecto o abrir modal de importe
                                            className="w-full py-4 bg-anvil-red hover:bg-red-700 text-ink font-black uppercase tracking-widest rounded-2xl transition-colors shadow-lg flex items-center justify-center gap-3"
                                        >
                                            Realizar Combinada (100 AC)
                                            <Send size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-center text-t-2xs font-black text-ink-subtle uppercase tracking-widest py-2">
                                        Añade {2 - betSlip.length} más para una combinada
                                    </p>
                                )}
                            </div>
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function RuleItem({ title, desc }: { title: string; desc: string }) {
    return (
        <div className="space-y-1">
            <p className="text-t-2xs font-black text-brand-text uppercase italic tracking-widest">{title}</p>
            <p className="text-t-2xs font-bold text-ink-subtle uppercase leading-relaxed tracking-wider">{desc}</p>
        </div>
    );
}
