import React, { useEffect, useState } from 'react';
import {
    Trophy, TrendingUp, AlertCircle, Coins,
    LayoutDashboard, Plus, Calendar, X,
    Swords, BarChart2, Zap, ArrowRight, User,
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
    athlete_a_id: string;
    athlete_b_id: string;
    pool_a: number;
    pool_b: number;
    status: 'open' | 'locked' | 'resolved';
    athlete_a?: { full_name: string };
    athlete_b?: { full_name: string };
}

export function ArenaView({ user }: { user: ExtendedProfile }) {
    const [balance, setBalance] = useState<number>(0);
    const [isDev, setIsDev] = useState(false);
    const [events, setEvents] = useState<Competition[]>([]);
    const [fights, setFights] = useState<Fight[]>([]);
    const [loading, setLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);

    // MODALES
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [creationStep, setCreationStep] = useState<'menu' | 'pelea'>('menu');
    const [betModal, setBetModal] = useState<{ open: boolean, fight: Fight | null }>({ open: false, fight: null });
    const [resolveModal, setResolveModal] = useState<{ open: boolean, fight: Fight | null }>({ open: false, fight: null });

    // FORMULARIOS
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

            const { data: fightsData } = await supabase.from('arena_fights').select(`*, athlete_a:profiles!athlete_a_id(full_name), athlete_b:profiles!athlete_b_id(full_name)`).eq('status', 'open');
            if (fightsData) setFights(fightsData as any);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, [user.id]);

    // LÓGICA DE COLORES POR CATEGORÍA
    const getEventStyles = (name: string) => {
        const n = name.toUpperCase();
        if (n.includes('IPF') || n.includes('MUNDIAL') || n.includes('SHEFFIELD'))
            return { label: 'IPF', border: 'border-l-pink-400', badge: 'bg-pink-400/20 text-pink-300', text: 'text-pink-400' };
        if (n.includes('EPF') || n.includes('EUROPE'))
            return { label: 'EPF', border: 'border-l-green-500', badge: 'bg-green-500/20 text-green-300', text: 'text-green-400' };
        if (n.includes('NACIONAL') || n.includes('ESPAÑA') || n.includes('AEP 1'))
            return { label: 'AEP 1', border: 'border-l-blue-500', badge: 'bg-blue-500/20 text-blue-300', text: 'text-blue-400' };
        if (n.includes('REGIONAL') || n.includes('AEP 2'))
            return { label: 'AEP 2', border: 'border-l-yellow-500', badge: 'bg-yellow-500/20 text-yellow-300', text: 'text-yellow-400' };
        if (n.includes('AEP 3') || n.includes('BLACK ONI'))
            return { label: 'AEP 3', border: 'border-l-orange-500', badge: 'bg-orange-500/20 text-orange-300', text: 'text-orange-400' };
        if (n.includes('CLASIFICATORIO'))
            return { label: 'CLASIFICATORIO', border: 'border-l-purple-500', badge: 'bg-purple-500/20 text-purple-300', text: 'text-purple-400' };
        return { label: 'ESPECIAL', border: 'border-l-gray-500', badge: 'bg-gray-500/20 text-gray-300', text: 'text-gray-400' };
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return `${date.getDate()} ${date.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase()}`;
    };

    // --- ACCIONES ---
    const handleCancelFight = async (fight: Fight) => {
        if (!window.confirm("¿Anular combate? Se devolverán los AC a todos.")) return;
        setIsActionLoading(true);
        try {
            const { data: bets } = await supabase.from('arena_fight_bets').select('*').eq('fight_id', fight.id);
            if (bets && bets.length > 0) {
                const refunds: Record<string, number> = {};
                bets.forEach(bet => { refunds[bet.user_id] = (refunds[bet.user_id] || 0) + bet.amount; });
                for (const [userId, amount] of Object.entries(refunds)) {
                    const { data: prof } = await supabase.from('profiles').select('anvil_coins').eq('id', userId).single();
                    if (prof) await supabase.from('profiles').update({ anvil_coins: prof.anvil_coins + amount }).eq('id', userId);
                }
            }
            await supabase.from('arena_fight_bets').delete().eq('fight_id', fight.id);
            await supabase.from('arena_fights').delete().eq('id', fight.id);
            alert("Combate eliminado y AC devueltos.");
            await fetchData();
        } catch (err) { console.error(err); } finally { setIsActionLoading(false); }
    };

    const handleResolveFight = async (winnerSide: 'a' | 'b') => {
        const fight = resolveModal.fight;
        if (!fight) return;
        setIsActionLoading(true);
        const totalPool = fight.pool_a + fight.pool_b;
        const winnerPool = winnerSide === 'a' ? fight.pool_a : fight.pool_b;
        const winnerId = winnerSide === 'a' ? fight.athlete_a_id : fight.athlete_b_id;
        if (winnerPool === 0) { alert("Nadie apostó por el ganador."); setIsActionLoading(false); return; }

        try {
            const { data: winners } = await supabase.from('arena_fight_bets').select('*').eq('fight_id', fight.id).eq('selected_athlete_id', winnerId);
            if (winners) {
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
            await supabase.from('arena_fights').update({ status: 'resolved' }).eq('id', fight.id);
            setResolveModal({ open: false, fight: null });
            await fetchData();
            alert("Premios repartidos.");
        } catch (err) { console.error(err); } finally { setIsActionLoading(false); }
    };

    const handleBet = async () => {
        if (!betModal.fight || !selectedSide || betAmount <= 0) return;
        if (betAmount > balance) { alert("Saldo insuficiente"); return; }
        setIsActionLoading(true);
        try {
            const poolColumn = selectedSide === 'a' ? 'pool_a' : 'pool_b';
            const currentPool = selectedSide === 'a' ? betModal.fight.pool_a : betModal.fight.pool_b;
            const athleteId = selectedSide === 'a' ? betModal.fight.athlete_a_id : betModal.fight.athlete_b_id;
            await supabase.from('profiles').update({ anvil_coins: balance - betAmount }).eq('id', user.id);
            await supabase.from('arena_fights').update({ [poolColumn]: currentPool + betAmount }).eq('id', betModal.fight.id);
            await supabase.from('arena_fight_bets').insert([{ fight_id: betModal.fight.id, user_id: user.id, amount: betAmount, selected_athlete_id: athleteId }]);
            setBetModal({ open: false, fight: null });
            await fetchData();
        } catch (err) { console.error(err); } finally { setIsActionLoading(false); }
    };

    const handleCreateFight = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('arena_fights').insert([{ title: fightForm.title.toUpperCase(), athlete_a_id: fightForm.athlete_a, athlete_b_id: fightForm.athlete_b, pool_a: 0, pool_b: 0, status: 'open' }]);
        if (!error) { setIsModalOpen(false); setCreationStep('menu'); fetchData(); }
    };

    return (
        <div className="p-4 md:p-8 text-white min-h-screen animate-in fade-in duration-500">
            <header className="mb-10 border-b border-gray-800 pb-6 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <h1 className="text-4xl font-black text-yellow-500 flex items-center gap-3 italic uppercase">
                            <Trophy size={40} /> LA ARENA
                        </h1>
                        {isDev && (
                            <button onClick={() => setIsModalOpen(true)} className="p-2 bg-yellow-500 text-black rounded-full hover:scale-110 transition-all shadow-lg"><Plus size={24} strokeWidth={3} /></button>
                        )}
                    </div>
                    <p className="text-gray-400 text-lg italic tracking-tight">Gestiona tus <strong>Anvil Coins</strong> y domina las predicciones.</p>
                </div>
                <Link to="/dashboard" className="px-4 py-2 rounded-lg bg-[#252525] border border-white/10 text-xs font-black uppercase flex items-center gap-2 hover:bg-white/5 transition-all">Dashboard <LayoutDashboard size={14} /></Link>
            </header>

            <div className="grid lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-8">
                    {/* SALDO */}
                    <div className="bg-[#1a1a1a]/50 border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center">
                        <div className="bg-gradient-to-b from-[#252525] to-[#1a1a1a] px-10 py-6 rounded-2xl border border-yellow-500/30 flex flex-col items-center w-full max-w-sm shadow-2xl">
                            <span className="text-yellow-500 text-[10px] font-black uppercase mb-2 tracking-widest">SALDO DISPONIBLE</span>
                            <div className="flex items-center gap-4">
                                <Coins className="text-yellow-400" size={32} />
                                <span className="text-6xl font-black">{loading ? '...' : balance}</span>
                                <span className="text-yellow-500 font-black text-2xl mt-3 italic">AC</span>
                            </div>
                        </div>
                    </div>

                    {/* COMBATES */}
                    <div className="space-y-6">
                        <h3 className="text-xl font-black text-white/80 uppercase tracking-widest flex items-center gap-3"><Swords size={24} className="text-red-500" /> COMBATES EN VIVO</h3>
                        {fights.map(fight => {
                            const total = fight.pool_a + fight.pool_b;
                            const pctA = total > 0 ? (fight.pool_a / total) * 100 : 50;
                            const pctB = total > 0 ? (fight.pool_b / total) * 100 : 50;
                            return (
                                <div key={fight.id} className="bg-[#1a1a1a] border border-white/5 rounded-[2.5rem] p-8 shadow-xl border-t-red-500/20 border-t-4">
                                    <div className="flex justify-between items-center mb-6 text-[10px] font-black text-gray-500 tracking-widest uppercase italic">
                                        <span className="text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">DUELO 1VS1</span>
                                        {fight.title}
                                    </div>
                                    <div className="flex justify-between items-center gap-4 text-center">
                                        <div className="flex-1">
                                            <div className="w-16 h-16 bg-gray-800 rounded-full mx-auto mb-2 border border-white/5 flex items-center justify-center overflow-hidden"><User size={30} className="text-gray-600" /></div>
                                            <h4 className="font-black text-white uppercase italic text-xs truncate">{fight.athlete_a?.full_name || "Atleta A"}</h4>
                                            <p className="text-red-500 font-black text-xl mt-1">{fight.pool_a} AC</p>
                                        </div>
                                        <div className="bg-black p-3 rounded-full border border-white/10"><Swords size={20} /></div>
                                        <div className="flex-1">
                                            <div className="w-16 h-16 bg-gray-800 rounded-full mx-auto mb-2 border border-white/5 flex items-center justify-center overflow-hidden"><User size={30} className="text-gray-600" /></div>
                                            <h4 className="font-black text-white uppercase italic text-xs truncate">{fight.athlete_b?.full_name || "Atleta B"}</h4>
                                            <p className="text-blue-500 font-black text-xl mt-1">{fight.pool_b} AC</p>
                                        </div>
                                    </div>
                                    <div className="mt-8">
                                        <div className="h-2 w-full bg-black rounded-full flex overflow-hidden border border-white/5 p-[1px]">
                                            <div style={{ width: `${pctA}%` }} className="h-full bg-red-600 transition-all duration-1000" />
                                            <div style={{ width: `${pctB}%` }} className="h-full bg-blue-600 transition-all duration-1000" />
                                        </div>
                                        <div className="flex justify-between mt-3 font-black text-[10px] uppercase italic tracking-tighter">
                                            <span className="text-red-500">{pctA.toFixed(0)}% DEL BOTE</span>
                                            <span className="text-blue-500">{pctB.toFixed(0)}% DEL BOTE</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-6">
                                        <button onClick={() => setBetModal({ open: true, fight })} disabled={isActionLoading} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-black uppercase italic text-[10px] tracking-widest hover:bg-white/10 transition-all disabled:opacity-50">APOSTAR AC</button>
                                        {isDev && (
                                            <div className="flex gap-2">
                                                <button onClick={() => setResolveModal({ open: true, fight })} disabled={isActionLoading} className="px-4 bg-green-500/10 text-green-500 border border-green-500/20 rounded-2xl hover:bg-green-500/20"><CheckCircle size={18} /></button>
                                                <button onClick={() => handleCancelFight(fight)} disabled={isActionLoading} className="px-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl hover:bg-red-500/20"><Trash2 size={18} /></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* EVENTOS EQUIPO (VINCULADO A getEventStyles) */}
                <div className="space-y-6">
                    <h3 className="text-xl font-black text-white/80 uppercase tracking-widest flex items-center gap-3"><TrendingUp size={20} className="text-yellow-500" /> PRÓXIMOS EVENTOS</h3>
                    <div className="space-y-4">
                        {events.length > 0 ? events.map(event => {
                            const st = getEventStyles(event.name); // CARGAMOS LOS ESTILOS
                            return (
                                <div key={event.id} className={`group bg-[#1a1a1a]/60 p-6 rounded-2xl border-l-4 ${st.border} border-y border-r border-white/5 hover:bg-[#252525] transition-all shadow-lg`}>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${st.badge}`}>
                                            {st.label}
                                        </span>
                                        <div className="flex items-center gap-2 text-gray-500 text-[10px] font-black uppercase">
                                            <Calendar size={14} className={st.text} /> {formatDate(event.date)}
                                        </div>
                                    </div>
                                    <h4 className="text-2xl font-black text-white uppercase italic group-hover:translate-x-1 transition-transform leading-tight">
                                        {event.name}
                                    </h4>
                                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-2 ${st.text}`}>Participa Anvil Strength</p>
                                </div>
                            );
                        }) : (
                            <div className="bg-[#1a1a1a]/20 p-8 rounded-xl border border-dashed border-white/5 text-center text-gray-600 italic">No hay batallas programadas... aún.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* MODAL APUESTA */}
            {betModal.open && betModal.fight && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
                    <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md relative animate-in zoom-in-95">
                        <button onClick={() => setBetModal({ open: false, fight: null })} className="absolute top-8 right-8 text-gray-500 hover:text-white"><X size={24} /></button>
                        <h2 className="text-2xl font-black uppercase italic mb-8 text-center text-yellow-500">Tu Apuesta</h2>
                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <button onClick={() => setSelectedSide('a')} className={`p-5 rounded-2xl border-2 transition-all ${selectedSide === 'a' ? 'border-red-500 bg-red-500/10' : 'border-white/5 bg-black/40'}`}>
                                <span className="block text-[8px] font-black text-gray-500 uppercase mb-1">Apuesta por</span>
                                <span className="font-black text-xs uppercase italic truncate block">{betModal.fight.athlete_a?.full_name}</span>
                            </button>
                            <button onClick={() => setSelectedSide('b')} className={`p-5 rounded-2xl border-2 transition-all ${selectedSide === 'b' ? 'border-blue-500 bg-blue-500/10' : 'border-white/5 bg-black/40'}`}>
                                <span className="block text-[8px] font-black text-gray-500 uppercase mb-1">Apuesta por</span>
                                <span className="font-black text-xs uppercase italic truncate block">{betModal.fight.athlete_b?.full_name}</span>
                            </button>
                        </div>
                        <input type="number" value={betAmount} onChange={(e) => setBetAmount(parseInt(e.target.value))} className="w-full bg-black border border-white/10 p-5 rounded-2xl outline-none font-black text-center text-3xl text-yellow-500" />
                        <button onClick={handleBet} disabled={isActionLoading} className="w-full py-5 bg-yellow-500 text-black font-black uppercase italic rounded-2xl hover:bg-yellow-400 transition-all mt-8 text-sm shadow-xl">Confirmar Apuesta</button>
                    </div>
                </div>
            )}

            {/* MODAL CREACIÓN */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
                    <div className="bg-[#1a1a1a] border border-white/10 p-10 rounded-[2.5rem] w-full max-w-md relative animate-in zoom-in-95">
                        <button onClick={() => { setIsModalOpen(false); setCreationStep('menu'); }} className="absolute top-8 right-8 text-gray-500"><X /></button>
                        {creationStep === 'menu' ? (
                            <div className="space-y-4 text-center">
                                <h2 className="text-3xl font-black uppercase italic mb-8">Nueva Batalla</h2>
                                <button onClick={() => setCreationStep('pelea')} className="w-full flex items-center justify-between p-6 bg-[#252525] rounded-3xl border border-white/5 hover:border-red-500/50 hover:bg-red-500/5 transition-all group">
                                    <div className="text-left"><h3 className="font-black uppercase italic text-xl">Pelea 1vs1</h3><p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Cara a cara directo</p></div>
                                    <Swords size={32} className="text-red-500 group-hover:scale-110 transition-transform" />
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleCreateFight} className="space-y-4">
                                <h2 className="text-2xl font-black uppercase italic text-red-500 mb-6 text-center">Configurar 1VS1</h2>
                                <input required placeholder="TÍTULO (EJ: DUELO PESO MUERTO)" className="w-full bg-black border border-white/10 p-4 rounded-xl outline-none font-bold uppercase text-xs" onChange={e => setFightForm({ ...fightForm, title: e.target.value })} />
                                <input required placeholder="ID ATLETA A" className="w-full bg-black border border-white/10 p-4 rounded-xl outline-none text-[10px]" onChange={e => setFightForm({ ...fightForm, athlete_a: e.target.value })} />
                                <input required placeholder="ID ATLETA B" className="w-full bg-black border border-white/10 p-4 rounded-xl outline-none text-[10px]" onChange={e => setFightForm({ ...fightForm, athlete_b: e.target.value })} />
                                <button type="submit" className="w-full py-5 bg-red-600 text-white font-black uppercase italic rounded-2xl hover:bg-red-500 transition-all mt-4 text-xs">Publicar</button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL RESOLUCIÓN */}
            {resolveModal.open && resolveModal.fight && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/98 backdrop-blur-xl">
                    <div className="bg-[#1a1a1a] border border-white/10 p-10 rounded-[3rem] w-full max-w-md text-center shadow-2xl">
                        <h2 className="text-3xl font-black uppercase italic mb-2 text-white">Finalizar Duelo</h2>
                        <p className="text-gray-500 text-xs mb-10 font-medium tracking-widest">BOTE TOTAL: <span className="text-yellow-500 font-black">{resolveModal.fight.pool_a + resolveModal.fight.pool_b} AC</span></p>
                        <div className="grid grid-cols-1 gap-4">
                            <button onClick={() => handleResolveFight('a')} disabled={isActionLoading} className="p-6 bg-red-500/10 border border-red-500/30 rounded-3xl hover:bg-red-500/20 transition-all">
                                <span className="block text-red-500 font-black uppercase italic text-lg">{resolveModal.fight.athlete_a?.full_name}</span>
                                <span className="text-[10px] text-red-400 font-black">VENCEDOR</span>
                            </button>
                            <button onClick={() => handleResolveFight('b')} disabled={isActionLoading} className="p-6 bg-blue-500/10 border border-blue-500/30 rounded-3xl hover:bg-blue-500/20 transition-all">
                                <span className="block text-blue-500 font-black uppercase italic text-lg">{resolveModal.fight.athlete_b?.full_name}</span>
                                <span className="text-[10px] text-blue-400 font-black">VENCEDOR</span>
                            </button>
                        </div>
                        <button onClick={() => setResolveModal({ open: false, fight: null })} className="mt-8 text-gray-600 text-[10px] font-black uppercase hover:text-white transition-colors">Volver</button>
                    </div>
                </div>
            )}
        </div>
    );
}