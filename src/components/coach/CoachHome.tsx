import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Trophy, AlertTriangle, TrendingUp } from 'lucide-react';

export function CoachHome({ user }: { user: any }) {
    const [stats, setStats] = useState({
        totalAthletes: 0,
        nextCompDays: null as number | null,
        nextCompName: '',
        activeWarnings: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // 1. Get Total Athletes
                const { count: athleteCount, error: countError } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true });

                if (countError) throw countError;

                // 2. Get Next Competition
                const today = new Date().toISOString().split('T')[0];
                const { data: nextComp } = await supabase
                    .from('competition_entries')
                    .select('competition_name, target_date')
                    .gte('target_date', today)
                    .order('target_date', { ascending: true })
                    .limit(1)
                    .single();

                let daysUntil = null;
                let compName = '';

                if (nextComp) {
                    const target = new Date(nextComp.target_date);
                    const now = new Date();
                    const diffTime = Math.abs(target.getTime() - now.getTime());
                    daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    compName = nextComp.competition_name;
                }

                setStats({
                    totalAthletes: athleteCount || 0,
                    nextCompDays: daysUntil,
                    nextCompName: compName,
                    activeWarnings: 0 // Placeholder logic
                });

            } catch (err) {
                console.error('Error fetching dashboard stats:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="p-8 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-anvil-red"></div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-black uppercase tracking-tighter">Bienvenido, {user.user_metadata?.full_name?.split(' ')[0] || 'Coach'}</h1>
                <p className="text-gray-400">Resumen del estado del equipo</p>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Athletes Card */}
                <div className="bg-[#252525] p-6 rounded-xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Users size={64} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-gray-400 text-sm font-bold uppercase mb-1">Atletas Activos</p>
                        <p className="text-4xl font-black text-white">{stats.totalAthletes}</p>
                        <p className="text-xs text-gray-500 mt-2">En seguimiento</p>
                    </div>
                </div>

                {/* Next Comp Card */}
                <div className="bg-[#252525] p-6 rounded-xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Trophy size={64} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-gray-400 text-sm font-bold uppercase mb-1">Próximo Evento</p>
                        <p className="text-4xl font-black text-anvil-red">
                            {stats.nextCompDays !== null ? `${stats.nextCompDays} días` : '-'}
                        </p>
                        <p className="text-xs text-gray-500 mt-2 truncate">
                            {stats.nextCompName || 'Sin eventos próximos'}
                        </p>
                    </div>
                </div>

                {/* Warnings Card */}
                <div className="bg-[#252525] p-6 rounded-xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <AlertTriangle size={64} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-gray-400 text-sm font-bold uppercase mb-1">Avisos</p>
                        <p className="text-4xl font-black text-white">{stats.activeWarnings}</p>
                        <p className="text-xs text-gray-500 mt-2">Requieren atención</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions / Recent Activity could go here */}
            <div className="bg-[#252525] rounded-xl border border-white/5 p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <TrendingUp size={20} className="text-anvil-red" />
                    Actividad Reciente
                </h3>
                <div className="text-gray-400 text-sm py-4 text-center border-2 border-dashed border-white/5 rounded-lg">
                    No hay actividad reciente registrada
                </div>
            </div>
        </div>
    );
}
