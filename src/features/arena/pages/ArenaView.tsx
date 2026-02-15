import React, { useEffect, useState } from 'react';
import {
    Trophy, TrendingUp, Coins,
    LayoutDashboard, Plus, Calendar, X,
    Swords, User,
    Trash2, CheckCircle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Link } from 'react-router-dom';

interface ExtendedProfile extends UserProfile {
    is_developer?: boolean;
}

interface Competition {
    id: string;
    name: string;
    date: string;
    athlete_id?: string;
}

interface Fight {
    id: string;
    title: string;
    athlete_a_id?: string;
    athlete_b_id?: string;
    athlete_a_name_manual?: string;
    athlete_b_name_manual?: string;
    pool_a: number;
    pool_b: number;
    status: 'open' | 'locked' | 'resolved';
    winner_side?: 'a' | 'b';
    athlete_a?: { full_name: string };
    athlete_b?: { full_name: string };
}

export function ArenaView({ user }: { user: ExtendedProfile }) {
    const [balance, setBalance] = useState<number>(0);
    const [isDev, setIsDev] = useState(false);
    const [events, setEvents] = useState<Competition[]>([]);
    const [activeFights, setActiveFights] = useState<Fight[]>([]);
    const [resolvedFights, setResolvedFights] = useState<Fight[]>([]);
    const [loading, setLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [betModal, setBetModal] = useState<{ open: boolean, fight: Fight | null }>({ open: false, fight: null });
    const [resolveModal, setResolveModal] = useState<{ open: boolean, fight: Fight | null }>({ open: false, fight: null });

    const [fightForm, setFightForm] = useState({ title: '', athlete_a: '', athlete_b: '' });
    const [betAmount, setBetAmount] = useState<number>(10);
    const [selectedSide, setSelectedSide] = useState<'a' | 'b' | null>(null);

    const fetchData = async () => {
        if (!user?.id) return;
        try {
            const { data: profileData } = await supabase.from('profiles').select('anvil_coins, is_developer').eq('id', user.id).single();
            if (profileData) {
                setBalance(profileData.anvil_coins || 0);
                setIsDev(profileData.is_developer || false);
            }

            const today = new Date().toISOString().split('T')[0];
            const { data: eventsData } = await supabase.from('competitions').select('id, name, date, athlete_id').gte('date', today).not('athlete_id', 'is', null).order('date', { ascending: true });
            if (eventsData) {
                const unique = eventsData.filter((v, i, a) => a.findIndex(t => (t.name === v.name && t.date === v.date)) === i);
                setEvents(unique.slice(0, 3));
            }

            const { data: active } = await supabase.from('arena_fights').select(`*, athlete_a:profiles!athlete_a_id(full_name), athlete_b:profiles!athlete_b_id(full_name)`).eq('status', 'open');
            if (active) setActiveFights(active as Fight[]);

            const { data: resolved } = await supabase.from('arena_fights').select(`*, athlete_a:profiles!athlete_a_id(full_name), athlete_b:profiles!athlete_b_id(full_name)`).eq('status', 'resolved').order('created_at', { ascending: false });
            if (resolved) setResolvedFights(resolved as Fight[]);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, [user.id]);

    // JERARQUÍA DE COLORES (AEP 3: Naranja, AEP 2: Amarillo)
    const getEventStyles = (name: string) => {
        const n = name.toUpperCase();
        if (n.includes('IPF') || n.includes('MUNDIAL')) return { label: 'IPF', border: 'border-l-pink-400', badge: 'bg-pink-400/20 text-pink-300', text: 'text-pink-400' };
        if (n.includes('EPF')) return { label: 'EPF', border: 'border-l-green-500', badge: 'bg-green-500/20 text-green-300', text: 'text-green-400' };
        if (n.includes('NACIONAL') || n.includes('ESPAÑA') || n.includes('AEP 1')) return { label: 'AEP 1', border: 'border-l-blue-500', badge: 'bg-blue-500/20 text-blue-300', text: 'text-blue-400' };
        if (n.includes('AEP 3') || n.includes('BLACK ONI')) return { label: 'AEP 3', border: 'border-l-orange-500', badge: 'bg-orange-500/20 text-orange-300', text: 'text-orange-400' };
        if (n.includes('REGIONAL') || n.includes('AEP 2') || n.includes('AEP')) return { label: 'AEP 2', border: 'border-l-yellow-500', badge: 'bg-yellow-500/20 text-yellow-300', text: 'text-yellow-400' };
        return { label: 'ESPECIAL', border: 'border-l-gray-500', badge: 'bg-gray-500/20 text-gray-300', text: 'text-gray-400' };
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return `${date.getDate()} ${date.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase()}`;
    };

    // --- ACCIONES CORREGIDAS ---

    const handleBet = async () => {
        if (!betModal.fight || !selectedSide || betAmount <= 0) return;
        if (betAmount > balance) { alert("Saldo insuficiente"); return; }
        setIsActionLoading(true);
        try {
            const sidePool = selectedSide === 'a' ? 'pool_a' : 'pool_b';
            const currentPool = selectedSide === 'a' ? betModal.fight.pool_a : betModal.fight.pool_b;

            await supabase.from('profiles').update({ anvil_coins: balance - betAmount }).eq('id', user.id);
            await supabase.from('arena_fights').update({ [sidePool]: currentPool + betAmount }).eq('id', betModal.fight.id);
            // Guardamos en 'selected_side' para que la resolución manual funcione
            await supabase.from('arena_fight_bets').insert([{
                fight_id: betModal.fight.id,
                user_id: user.id,
                amount: betAmount,
                selected_side: selectedSide
            }]);

            setBetModal({ open: false, fight: null });
            fetchData();
        } catch (err) { console.error(err); } finally { setIsActionLoading(false); }
    };

    const handleResolveFight = async (side: 'a' | 'b') => {
        const fight = resolveModal.fight;
        if (!fight) return;
        setIsActionLoading(true);
        try {
            const totalPool = fight.pool_a + fight.pool_b;
            const winnerPool = side === 'a' ? fight.pool_a : fight.pool_b;

            // Buscamos apuestas por LADO (a o b)
            const { data: winners } = await supabase.from('arena_fight_bets').select('*').eq('fight_id', fight.id).eq('selected_side', side);

            if (winners && winnerPool > 0) {
                const payouts: Record<string, number> = {};
                winners.forEach(bet => {
                    const share = Math.floor((bet.amount / winnerPool) * totalPool);
                    payouts[bet.user_id] = (payouts[bet.user_id] || 0) + share;
                });

                for (const [uid, amt] of Object.entries(payouts)) {
                    const { data: p } = await supabase.from('profiles').select('anvil_coins').eq('id', uid).single();
                    if (p) await supabase.from('profiles').update({ anvil_coins: p.anvil_coins + amt }).eq('id', uid);
                }
            }

            await supabase.from('arena_fights').update({ status: 'resolved', winner_side: side }).eq('id', fight.id);
            setResolveModal({ open: false, fight: null });
            fetchData();
            alert("Combate resuelto correctamente.");
        } catch (err) { console.error(err); } finally { setIsActionLoading(false); }
    };

    const handleCancelFight = async (fight: Fight) => {
        if (!window.confirm("¿Anular combate?")) return;
        setIsActionLoading(true);
        try {
            const { data: bets } = await supabase.from('arena_fight_bets').select('*').eq('fight_id', fight.id);
            if (bets) {
                const refunds: Record<string, number> = {};
                bets.forEach(b => refunds[b.user_id] = (refunds[b.user_id] || 0) + b.amount);
                for (const [uid, amt] of Object.entries(refunds)) {
                    const { data: p } = await supabase.from('profiles').select('anvil_coins').eq('id', uid).single();
                    if (p) await supabase.from('profiles').update({ anvil_coins: p.anvil_coins + amt }).eq('id', uid);
                }
            }
            await supabase.from('arena_fight_bets').delete().eq('fight_id', fight.id);
            await supabase.from('arena_fights').delete().eq('id', fight.id);
            fetchData();
        } catch (err) { console.error(err); } finally { setIsActionLoading(false); }
    };

    const handleCreateFight = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('arena_fights').insert([{
            title: fightForm.title.toUpperCase(),
            athlete_a_name_manual: fightForm.athlete_a,
            athlete_b_name_manual: fightForm.athlete_b,
            pool_a: 0, pool_b: 0, status: 'open'
        }]);
        if (!error) { setIsModalOpen(false); fetchData(); }
    };

    return (
        <div className="p-4 md:p-8 text-white min-h-screen animate-in fade-in duration-500">
            <header className="mb-10 border-b border-gray-800 pb-6 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <h1 className="text-4xl font-black text-yellow-500 flex items-center gap-3 italic uppercase"><Trophy size={40} /> LA ARENA</h1>
                        {isDev && <button onClick={() => setIsModalOpen(true)} className="p-2 bg-yellow-500 text-black rounded-full hover:scale-110 shadow-lg"><Plus size={24} strokeWidth={3} /></button>}
                    </div>
                </div>
                <Link to="/dashboard" className="px-4 py-2 rounded-lg bg-[#252525] border border-white/10 text-xs font-black flex items-center gap-2">Dashboard <LayoutDashboard size={14} /></Link>
            </header>

            <div className="grid lg:grid-cols-2 gap-8 items-start w-full">
                <div className="space-y-8 w-full">
                    {/* SALDO */}
                    <div className="bg-gradient-to-b from-[#252525] to-[#1a1a1a] px-10 py-6 rounded-2xl border border-yellow-500/30 flex flex-col items-center w-full max-w-sm shadow-2xl mx-auto">
                        <span className="text-yellow-500 text-[10px] font-black uppercase mb-2">SALDO DISPONIBLE</span>
                        <div className="flex items-center gap-4">
                            <Coins className="text-yellow-400" size={32} />
                            <span className="text-6xl font-black">{loading ? '...' : balance}</span>
                            <span className="text-yellow-500 font-black text-2xl mt-3 italic">AC</span>
                        </div>
                    </div>

                    {/* SELECTOR PESTAÑAS */}
                    <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-white/5 max-w-md mx-auto">
                        <button onClick={() => setActiveTab('active')} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase italic transition-all ${activeTab === 'active' ? 'bg-yellow-500 text-black' : 'text-gray-500'}`}>En Vivo</button>
                        <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase italic transition-all ${activeTab === 'history' ? 'bg-yellow-500 text-black' : 'text-gray-500'}`}>Historial</button>
                    </div>

                    <div className="space-y-6">
                        {activeTab === 'active' ? (
                            activeFights.map(f => {
                                const total = f.pool_a + f.pool_b;
                                const pctA = total > 0 ? (f.pool_a / total) * 100 : 50;
                                const pctB = total > 0 ? (f.pool_b / total) * 100 : 50;
                                return (
                                    <div key={f.id} className="bg-[#1a1a1a] border border-white/5 rounded-[2.5rem] p-8 shadow-xl border-t-red-500/20 border-t-4">
                                        <div className="flex justify-between items-center mb-6 uppercase italic font-black text-[10px] text-gray-500 tracking-widest">
                                            <span className="text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">1VS1 EN VIVO</span>
                                            {f.title}
                                        </div>
                                        <div className="flex justify-between gap-4 text-center">
                                            <div className="flex-1">
                                                <div className="w-16 h-16 bg-gray-800 rounded-full mx-auto mb-2 border border-white/5 flex items-center justify-center overflow-hidden"><User size={30} className="text-gray-600" /></div>
                                                <h4 className="font-black text-white uppercase italic text-xs truncate px-2">{f.athlete_a_name_manual || f.athlete_a?.full_name}</h4>
                                                <p className="text-red-500 font-black text-xl">{f.pool_a} AC</p>
                                            </div>
                                            <div className="mt-4"><Swords size={24} className="text-white/20" /></div>
                                            <div className="flex-1">
                                                <div className="w-16 h-16 bg-gray-800 rounded-full mx-auto mb-2 border border-white/5 flex items-center justify-center overflow-hidden"><User size={30} className="text-gray-600" /></div>
                                                <h4 className="font-black text-white uppercase italic text-xs truncate px-2">{f.athlete_b_name_manual || f.athlete_b?.full_name}</h4>
                                                <p className="text-blue-500 font-black text-xl">{f.pool_b} AC</p>
                                            </div>
                                        </div>
                                        <div className="mt-8">
                                            <div className="h-2 w-full bg-black rounded-full flex overflow-hidden border border-white/5">
                                                <div style={{ width: `${pctA}%` }} className="h-full bg-red-600 transition-all duration-1000 shadow-[0_0_10px_rgba(220,38,38,0.3)]" />
                                                <div style={{ width: `${pctB}%` }} className="h-full bg-blue-600 transition-all duration-1000 shadow-[0_0_10px_rgba(37,99,235,0.3)]" />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mt-6">
                                            <button onClick={() => setBetModal({ open: true, fight: f })} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-black uppercase text-[10px] hover:bg-white/10 transition-all">Apostar AC</button>
                                            {isDev && (
                                                <div className="flex gap-2">
                                                    <button onClick={() => setResolveModal({ open: true, fight: f })} className="px-4 bg-green-500/10 text-green-500 border border-green-500/20 rounded-2xl hover:bg-green-500/20 transition-all"><CheckCircle size={18} /></button>
                                                    <button onClick={() => handleCancelFight(f)} className="px-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl hover:bg-red-500/20 transition-all"><Trash2 size={18} /></button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            // HISTORIAL CORREGIDO
                            resolvedFights.map(f => {
                                const isAWinner = f.winner_side === 'a';
                                const isBWinner = f.winner_side === 'b';
                                return (
                                    <div key={f.id} className="bg-[#1a1a1a]/40 border border-white/5 rounded-3xl p-6 shadow-lg w-full">
                                        <div className="flex justify-between mb-4 text-[10px] font-black text-gray-600 uppercase tracking-widest">
                                            <span>FINALIZADO</span>
                                            <span className="text-yellow-500/80">REPARTIDO: {f.pool_a + f.pool_b} AC</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <div className={`flex-1 text-xs font-black uppercase italic ${isAWinner ? 'text-green-400' : 'text-gray-700 opacity-40 grayscale'}`}>
                                                {f.athlete_a_name_manual || f.athlete_a?.full_name} {isAWinner && '🏆'}
                                            </div>
                                            <div className="text-gray-800 font-black text-xs italic">VS</div>
                                            <div className={`flex-1 text-right text-xs font-black uppercase italic ${isBWinner ? 'text-green-400' : 'text-gray-700 opacity-40 grayscale'}`}>
                                                {isBWinner && '🏆'} {f.athlete_b_name_manual || f.athlete_b?.full_name}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* PRÓXIMOS EVENTOS (FIX MOBILE MARGINS) */}
                <div className="space-y-6 w-full pr-4 md:pr-0">
                    <h3 className="text-xl font-black text-gray-400 uppercase tracking-widest flex items-center gap-3"><TrendingUp size={20} className="text-yellow-500" /> PRÓXIMOS EVENTOS</h3>
                    <div className="space-y-4">
                        {events.map(e => {
                            const st = getEventStyles(e.name);
                            return (
                                <div key={e.id} className={`group bg-[#1a1a1a]/60 p-6 rounded-2xl border-l-4 ${st.border} border-y border-r border-white/5 shadow-lg w-full`}>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className={`text-[10px] font-black px-3 py-1 rounded-full ${st.badge}`}>{st.label}</span>
                                        <span className="text-gray-500 text-[10px] font-black uppercase"><Calendar size={12} className="inline mr-1" /> {formatDate(e.date)}</span>
                                    </div>
                                    <h4 className="text-2xl font-black text-white uppercase italic leading-tight">{e.name}</h4>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest mt-2 ${st.text}`}>Participa Anvil Strength</p>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* MODALES (Apostar, Crear, Resolver) */}
            {betModal.open && betModal.fight && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
                    <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md relative animate-in zoom-in-95">
                        <button onClick={() => setBetModal({ open: false, fight: null })} className="absolute top-8 right-8 text-gray-500 hover:text-white transition-colors"><X size={24} /></button>
                        <h2 className="text-2xl font-black uppercase italic mb-8 text-center text-yellow-500 tracking-tighter">Tu Apuesta</h2>
                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <button onClick={() => setSelectedSide('a')} className={`p-5 rounded-2xl border-2 transition-all ${selectedSide === 'a' ? 'border-red-500 bg-red-500/10' : 'border-white/5 bg-black/40'}`}>
                                <span className="font-black text-xs uppercase truncate block">{betModal.fight.athlete_a_name_manual || betModal.fight.athlete_a?.full_name}</span>
                            </button>
                            <button onClick={() => setSelectedSide('b')} className={`p-5 rounded-2xl border-2 transition-all ${selectedSide === 'b' ? 'border-blue-500 bg-blue-500/10' : 'border-white/5 bg-black/40'}`}>
                                <span className="font-black text-xs uppercase truncate block">{betModal.fight.athlete_b_name_manual || betModal.fight.athlete_b?.full_name}</span>
                            </button>
                        </div>
                        <input type="number" value={betAmount} onChange={e => setBetAmount(parseInt(e.target.value))} className="w-full bg-black border border-white/10 p-5 rounded-2xl font-black text-center text-3xl text-yellow-500 outline-none" />
                        <button onClick={handleBet} disabled={isActionLoading} className="w-full py-5 bg-yellow-500 text-black font-black uppercase italic rounded-2xl hover:bg-yellow-400 transition-all mt-8 shadow-xl">Confirmar Apuesta</button>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
                    <div className="bg-[#1a1a1a] border border-white/10 p-10 rounded-[2.5rem] w-full max-w-md relative animate-in zoom-in-95">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-8 right-8 text-gray-500 hover:text-white transition-colors"><X /></button>
                        <form onSubmit={handleCreateFight} className="space-y-4">
                            <h2 className="text-2xl font-black uppercase italic text-red-500 mb-6 text-center">Configurar 1VS1</h2>
                            <input required placeholder="TÍTULO (EJ: DUELO MUNDIAL)" className="w-full bg-black border border-white/10 p-4 rounded-xl outline-none font-bold uppercase text-xs" onChange={e => setFightForm({ ...fightForm, title: e.target.value })} />
                            <input required placeholder="NOMBRE ATLETA A" className="w-full bg-black border border-white/10 p-4 rounded-xl outline-none font-bold uppercase text-xs" onChange={e => setFightForm({ ...fightForm, athlete_a: e.target.value })} />
                            <input required placeholder="NOMBRE ATLETA B" className="w-full bg-black border border-white/10 p-4 rounded-xl outline-none font-bold uppercase text-xs" onChange={e => setFightForm({ ...fightForm, athlete_b: e.target.value })} />
                            <button type="submit" className="w-full py-5 bg-red-600 text-white font-black uppercase italic rounded-2xl hover:bg-red-500 mt-4 shadow-lg shadow-red-900/20">Publicar Combate</button>
                        </form>
                    </div>
                </div>
            )}

            {resolveModal.open && resolveModal.fight && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/98 backdrop-blur-xl">
                    <div className="bg-[#1a1a1a] border border-white/10 p-10 rounded-[3rem] w-full max-w-md text-center shadow-2xl">
                        <h2 className="text-3xl font-black uppercase italic mb-10 text-white tracking-tighter">Marcar Ganador</h2>
                        <div className="grid grid-cols-1 gap-4">
                            <button onClick={() => handleResolveFight('a')} disabled={isActionLoading} className="p-6 bg-red-500/10 border border-red-500/30 rounded-3xl text-red-500 font-black uppercase italic text-lg hover:bg-red-500/20 transition-all">{resolveModal.fight.athlete_a_name_manual || resolveModal.fight.athlete_a?.full_name}</button>
                            <button onClick={() => handleResolveFight('b')} disabled={isActionLoading} className="p-6 bg-blue-500/10 border border-blue-500/30 rounded-3xl text-blue-500 font-black uppercase italic text-lg hover:bg-blue-500/20 transition-all">{resolveModal.fight.athlete_b_name_manual || resolveModal.fight.athlete_b?.full_name}</button>
                        </div>
                        <button onClick={() => setResolveModal({ open: false, fight: null })} className="mt-8 text-gray-600 font-black uppercase hover:text-white transition-colors">Volver</button>
                    </div>
                </div>
            )}
        </div>
    );
}