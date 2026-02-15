import React, { useEffect, useState } from 'react';
import { Trophy, TrendingUp, AlertCircle, Coins } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';

interface ArenaViewProps {
    user: UserProfile;
}

export function ArenaView({ user }: ArenaViewProps) {
    const [balance, setBalance] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchCoins() {
            if (!user) return;

            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('coins')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.error('Error buscando monedas:', error);
                } else if (data) {
                    setBalance(data.coins || 0);
                }
            } catch (err) {
                console.error('Error de conexión:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchCoins();
    }, [user.id]);

    return (
        <div className="p-4 md:p-8 text-white min-h-screen animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* CABECERA */}
            <header className="mb-10 border-b border-gray-800 pb-6">
                <h1 className="text-4xl md:text-5xl font-black text-yellow-500 tracking-tighter uppercase mb-2 flex items-center gap-3">
                    <div className="p-2 bg-yellow-500/10 rounded-xl">
                        <Trophy className="h-8 w-8 md:h-12 md:w-12" />
                    </div>
                    LA ARENA
                </h1>
                <p className="text-gray-400 text-lg max-w-2xl">
                    Usa tus <strong>Anvil Coins</strong> para apostar en los grandes eventos y ganar premios exclusivos del club.
                </p>
            </header>

            {/* CONTENIDO PRINCIPAL */}
            <div className="grid md:grid-cols-2 gap-8">

                {/* TARJETA DE ESTADO (MONEDERO) */}
                <div className="bg-[#252525] border border-white/5 rounded-[2rem] p-8 flex flex-col items-center justify-center text-center space-y-8 relative overflow-hidden group hover:border-yellow-500/30 transition-all">

                    <div className="absolute top-0 right-0 w-48 h-48 bg-yellow-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-yellow-500/10 transition-all" />

                    <div className="p-5 bg-black/40 rounded-full border border-white/5 relative z-10">
                        <AlertCircle size={48} className="text-gray-500" />
                    </div>

                    <div className="relative z-10">
                        <h2 className="text-3xl font-black uppercase italic text-white mb-2 tracking-tight">Zona de Apuestas</h2>
                        <p className="text-gray-400 font-medium max-w-xs mx-auto">
                            Pronto podrás multiplicar tus monedas acertando los resultados de la AEP.
                        </p>
                    </div>

                    <div className="bg-gradient-to-r from-yellow-500/10 to-transparent px-10 py-6 rounded-2xl border border-yellow-500/20 flex flex-col items-center w-full max-w-sm relative z-10 backdrop-blur-sm">
                        <span className="text-yellow-500 text-[10px] font-black tracking-[0.2em] uppercase mb-2">SALDO DISPONIBLE</span>
                        <div className="flex items-center gap-4">
                            <Coins className={`h-10 w-10 text-yellow-400 ${loading ? 'animate-pulse' : ''}`} />

                            {loading ? (
                                <span className="text-4xl font-black text-gray-700">...</span>
                            ) : (
                                <span className="text-6xl font-black text-white tracking-tighter drop-shadow-lg">
                                    {balance}
                                </span>
                            )}

                            <span className="text-yellow-500 font-black text-2xl mt-3 italic">AC</span>
                        </div>
                    </div>

                </div>

                {/* PRÓXIMOS EVENTOS */}
                <div className="space-y-6 opacity-60 pointer-events-none select-none grayscale">
                    <h3 className="text-xl font-black text-gray-400 uppercase tracking-widest flex items-center gap-3">
                        <TrendingUp size={24} /> Próximos Eventos
                    </h3>

                    <div className="bg-[#252525] p-6 rounded-[1.5rem] border border-white/5 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[10px] font-black text-green-400 bg-green-400/10 px-3 py-1 rounded-full uppercase tracking-wider border border-green-400/20">EN VIVO</span>
                            <span className="text-xs font-bold text-gray-500 uppercase">Marzo 2026</span>
                        </div>
                        <div className="text-2xl font-black text-white uppercase italic mb-1">Mundial Sheffield 2026</div>
                        <div className="text-sm font-bold text-gray-500 uppercase tracking-wide">Ganador Absoluto Masculino</div>
                    </div>

                    <div className="bg-[#252525] p-6 rounded-[1.5rem] border border-white/5 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[10px] font-black text-gray-500 bg-white/5 px-3 py-1 rounded-full uppercase tracking-wider border border-white/10">PRÓXIMAMENTE</span>
                            <span className="text-xs font-bold text-gray-500 uppercase">Abril 2026</span>
                        </div>
                        <div className="text-2xl font-black text-white uppercase italic mb-1">Nacionales AEP</div>
                        <div className="text-sm font-bold text-gray-500 uppercase tracking-wide">Récord de Total - Javi Bou</div>
                    </div>
                </div>

            </div>
        </div>
    );
}
