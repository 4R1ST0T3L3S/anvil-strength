import React, { useEffect, useState } from 'react';
import { Trophy, TrendingUp, AlertCircle, Coins, LayoutDashboard, Plus, Calendar } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Link } from 'react-router-dom';

interface Competition {
    id: string;
    name: string;
    date: string;
    athlete_id?: string;
}

interface ExtendedProfile extends UserProfile {
    is_developer?: boolean;
}

interface ArenaViewProps {
    user: ExtendedProfile;
}

export function ArenaView({ user }: ArenaViewProps) {
    const [balance, setBalance] = useState<number>(0);
    const [isDev, setIsDev] = useState(false);
    const [events, setEvents] = useState<Competition[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            if (!user?.id) return;
            try {
                // 1. Datos del perfil (Monedas y Rol Dev)
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('anvil_coins, is_developer')
                    .eq('id', user.id)
                    .single();

                if (profileData) {
                    setBalance(profileData.anvil_coins || 0);
                    setIsDev(profileData.is_developer || false);
                }

                // 2. Competiciones Únicas
                const today = new Date().toISOString().split('T')[0];
                const { data: eventsData, error: eventsError } = await supabase
                    .from('competitions')
                    .select('id, name, date, athlete_id')
                    .gte('date', today)
                    .not('athlete_id', 'is', null)
                    .order('date', { ascending: true });

                if (eventsData) {
                    const uniqueEvents = eventsData.filter((v, i, a) => 
                        a.findIndex(t => (t.name === v.name && t.date === v.date)) === i
                    );
                    setEvents(uniqueEvents.slice(0, 3));
                }
            } catch (err) {
                console.error('Error cargando Arena:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [user.id]);

    const getEventStyles = (name: string) => {
        const n = name.toUpperCase();
        if (n.includes('IPF') || n.includes('MUNDIAL') || n.includes('SHEFFIELD')) 
            return { label: 'IPF', border: 'border-l-pink-400', text: 'text-pink-400', badge: 'bg-pink-400/20 text-pink-300' };
        if (n.includes('EPF') || n.includes('EUROPE')) 
            return { label: 'EPF', border: 'border-l-green-500', text: 'text-green-400', badge: 'bg-green-500/20 text-green-300' };
        if (n.includes('NACIONAL') || n.includes('ESPAÑA') || n.includes('AEP 1')) 
            return { label: 'AEP 1', border: 'border-l-blue-500', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' };
        if (n.includes('REGIONAL') || n.includes('COPA') || n.includes('AEP 2')) 
            return { label: 'AEP 2', border: 'border-l-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300' };
        if (n.includes('AEP 3') || n.includes('OPEN') || n.includes('BLACK ONI')) 
            return { label: 'AEP 3', border: 'border-l-orange-500', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' };
        if (n.includes('CLASIFICATORIO')) 
            return { label: 'CLASIFICATORIO', border: 'border-l-purple-500', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' };
        return { label: 'ESPECIAL', border: 'border-l-gray-500', text: 'text-gray-400', badge: 'bg-gray-500/20 text-gray-300' };
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return `${date.getDate()} ${date.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase()}`;
    };

    return (
        <div className="p-4 md:p-8 text-white min-h-screen animate-in fade-in duration-500">
            {/* HEADER CON BOTÓN DEV */}
            <header className="mb-10 border-b border-gray-800 pb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <h1 className="text-4xl md:text-5xl font-black text-yellow-500 tracking-tighter uppercase flex items-center gap-3">
                                <div className="p-2 bg-yellow-500/10 rounded-xl">
                                    <Trophy className="h-8 w-8 md:h-12 md:w-12" />
                                </div>
                                LA ARENA
                            </h1>
                            {isDev && (
                                <button 
                                    onClick={() => alert('Próximamente: Creador de predicciones')}
                                    className="p-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-full transition-all hover:scale-110 active:scale-95 shadow-lg group relative"
                                >
                                    <Plus size={24} strokeWidth={3} />
                                </button>
                            )}
                        </div>
                        <p className="text-gray-400 text-lg italic">
                            Gestiona tus <strong>Anvil Coins</strong> y compite en las predicciones.
                        </p>
                    </div>

                    <Link to="/dashboard" className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-[#252525] hover:bg-white/5 transition-all">
                        <span className="text-sm font-medium text-gray-300">Dashboard</span>
                        <LayoutDashboard size={16} className="text-gray-400" />
                    </Link>
                </div>
            </header>

            <div className="grid md:grid-cols-2 gap-8 items-start">
                {/* ZONA DE APUESTAS (RESTAURADA) */}
                <div className="bg-[#1a1a1a]/50 border border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden min-h-[450px]">
                    <div className="p-5 bg-black/40 rounded-full border border-white/5 relative z-10 shadow-xl">
                        <AlertCircle size={48} className="text-gray-600" />
                    </div>
                    <div className="relative z-10">
                        <h2 className="text-3xl font-black uppercase italic text-white mb-2 tracking-tight">ZONA DE APUESTAS</h2>
                        <p className="text-gray-400 font-medium max-w-xs mx-auto">Pronto podrás multiplicar tus monedas con los resultados de la AEP.</p>
                    </div>
                    <div className="bg-gradient-to-b from-[#252525] to-[#1a1a1a] px-10 py-6 rounded-2xl border border-yellow-500/30 flex flex-col items-center w-full max-w-sm relative z-10 shadow-xl">
                        <span className="text-yellow-500 text-[10px] font-black tracking-[0.2em] uppercase mb-2">SALDO DISPONIBLE</span>
                        <div className="flex items-center gap-4">
                            <Coins className="h-8 w-8 text-yellow-400 drop-shadow-md" />
                            <span className="text-6xl font-black text-white tracking-tighter">
                                {loading ? '...' : balance}
                            </span>
                            <span className="text-yellow-500 font-black text-2xl mt-3 italic">AC</span>
                        </div>
                    </div>
                </div>

                {/* PRÓXIMOS EVENTOS (RESTAURADOS) */}
                <div className="space-y-6">
                    <h3 className="text-xl font-black text-white/80 uppercase tracking-widest flex items-center gap-3">
                        <TrendingUp size={20} className="text-yellow-500" /> PRÓXIMOS EVENTOS
                    </h3>

                    <div className="space-y-4">
                        {events.length > 0 ? (
                            events.map((event) => {
                                const styles = getEventStyles(event.name);
                                return (
                                    <div key={event.id} className={`group relative bg-[#1a1a1a]/60 p-6 rounded-xl border-l-4 ${styles.border} border-y border-r border-white/5 hover:bg-[#252525] transition-all duration-300 shadow-lg`}>
                                        <div className="flex justify-between items-center mb-3">
                                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${styles.badge}`}>
                                                {styles.label}
                                            </span>
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <Calendar size={14} className={styles.text} />
                                                <span className="text-xs font-black">{formatDate(event.date)}</span>
                                            </div>
                                        </div>
                                        <h4 className="text-2xl font-black text-white uppercase italic group-hover:translate-x-1 transition-transform leading-tight">
                                            {event.name}
                                        </h4>
                                        <div className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${styles.text}`}>
                                            PARTICIPA ANVIL STRENGTH
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="bg-[#1a1a1a]/20 p-8 rounded-xl border border-dashed border-white/10 text-center text-gray-600 italic font-medium">
                                No hay batallas programadas... aún.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
