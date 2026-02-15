import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Users, Trophy, Calendar, User, MapPin, LayoutDashboard, BookOpen, FlaskConical, Weight, List, Calculator, ChevronRight, Swords } from 'lucide-react';
import { getAnvilQuote } from '../../../lib/dailyQuotes';
import { OneRMCalculator } from '../../athlete/components/OneRMCalculator';
import { WarmUpCalculator } from '../../athlete/components/WarmUpCalculator';
import { PlateCalculator } from '../../athlete/components/PlateCalculator';

export function CoachHome({ user, onNavigate }: { user: UserProfile, onNavigate: (view: any) => void }) {
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 14) return 'Buenos días';
        if (hour >= 14 && hour < 21) return 'Buenas tardes';
        return 'Buenas noches';
    };

    const [stats, setStats] = useState({
        nextCompDays: null as number | null,
        nextCompName: '',
        nextCompLevel: '',
        nextCompLocation: ''
    });
    const [loading, setLoading] = useState(true);
    const [is1RMCalcOpen, setIs1RMCalcOpen] = useState(false);
    const [isWarmUpCalcOpen, setIsWarmUpCalcOpen] = useState(false);
    const [isPlateCalcOpen, setIsPlateCalcOpen] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // 1. Get athletes assigned to this coach
                const { data: athleteLinks, error: linksError } = await supabase
                    .from('coach_athletes')
                    .select('athlete_id')
                    .eq('coach_id', user.id);

                if (linksError) throw linksError;

                const athleteIds = athleteLinks?.map((link: { athlete_id: any; }) => link.athlete_id) || [];

                if (athleteIds.length === 0) {
                    setStats({
                        nextCompDays: null,
                        nextCompName: '',
                        nextCompLevel: '',
                        nextCompLocation: ''
                    });
                    setLoading(false);
                    return;
                }



                // 3. Get Next Competition for these athletes
                const today = new Date().toISOString().split('T')[0];
                const { data: nextComp } = await supabase
                    .from('competitions')
                    .select('name, date, end_date, level, location')
                    .in('athlete_id', athleteIds)
                    .or(`date.gte.${today},end_date.gte.${today}`)
                    .order('date', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                let daysUntil = null;
                let compName = '';
                let compLevel = '';
                let compLocation = '';

                if (nextComp) {
                    const target = new Date(nextComp.date);
                    const now = new Date();
                    const diffTime = Math.abs(target.getTime() - now.getTime());
                    daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    compName = nextComp.name;
                    compLevel = nextComp.level || '';
                    compLocation = nextComp.location || '';
                }

                setStats({
                    nextCompDays: daysUntil,
                    nextCompName: compName,
                    nextCompLevel: compLevel,
                    nextCompLocation: compLocation
                });

            } catch (err) {
                console.error('Error fetching dashboard stats:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user.id]);

    if (loading) {
        return (
            <div className="p-8 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-anvil-red"></div>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-6">
                <header className="mb-8">
                    <h1 className="text-3xl font-black uppercase tracking-tighter">
                        {getGreeting()}, <span className="text-anvil-red">{user.full_name?.split(' ')[0] || 'Coach'}</span>
                    </h1>
                    <p className="text-gray-400 font-bold tracking-widest text-xs uppercase flex items-center gap-2 mt-1">
                        <Calendar size={14} className="text-anvil-red" />
                        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </header>

                {/* All sections in a single container with mobile reordering */}
                <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">

                    {/* Anvil Lessons - 1st on mobile, full row after grid on desktop */}
                    <div className="order-1 lg:order-3 lg:col-span-3 space-y-3">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                            <BookOpen size={16} className="text-yellow-500" /> Anvil Lessons
                        </h2>
                        <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-6 lg:p-8 relative overflow-hidden group hover:border-yellow-500/30 transition-all">
                            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-50 group-hover:opacity-80 transition-opacity"></div>
                            <div className="absolute -top-6 -right-6 text-yellow-500/5 rotate-12">
                                <BookOpen size={120} />
                            </div>
                            <div className="relative z-10">
                                <p className="text-xl lg:text-3xl font-black uppercase italic text-white leading-tight tracking-tighter mb-4 lg:mb-6">
                                    "{getAnvilQuote()}"
                                </p>
                                <div className="flex items-center justify-between border-t border-white/5 pt-4">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Anvil Strength Club</span>
                                    <div className="w-20 h-1 bg-gradient-to-r from-yellow-500 to-transparent rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Próxima Competición - 2nd on mobile, right column on desktop */}
                    <div className="order-2 lg:order-2 flex flex-col gap-3">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                            <Trophy size={16} className="text-anvil-red" /> Próxima Competición
                        </h2>
                        {stats.nextCompDays !== null ? (
                            <div className="bg-gradient-to-br from-[#252525] to-[#1c1c1c] p-6 rounded-xl border border-white/5 relative overflow-hidden group flex flex-col justify-between flex-1">
                                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Trophy size={80} />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="bg-anvil-red/10 p-2.5 rounded-lg">
                                            <Trophy size={20} className="text-anvil-red" />
                                        </div>
                                        <p className="text-gray-400 text-sm font-bold uppercase tracking-wider">Próximo Evento</p>
                                    </div>
                                    {stats.nextCompLevel && (
                                        <span className="inline-block bg-white/5 text-gray-400 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3 border border-white/10">
                                            {stats.nextCompLevel}
                                        </span>
                                    )}
                                    <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3">
                                        {stats.nextCompName}
                                    </h3>
                                    {stats.nextCompLocation && (
                                        <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-4">
                                            <MapPin size={14} />
                                            <span>{stats.nextCompLocation}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="bg-anvil-red text-white text-sm font-black px-4 py-2 rounded-lg text-center">
                                    {stats.nextCompDays === 0 ? '¡HOY!' : stats.nextCompDays === 1 ? 'MAÑANA' : `Faltan ${stats.nextCompDays} días`}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-[#252525] p-6 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center flex-1">
                                <Trophy size={32} className="text-gray-600 mb-3" />
                                <p className="text-sm font-bold uppercase text-gray-500">Sin eventos próximos</p>
                            </div>
                        )}
                    </div>

                    {/* Panel de Control - 3rd on mobile, left 2 columns on desktop */}
                    <div className="order-3 lg:order-1 lg:col-span-2 space-y-3">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                            <LayoutDashboard size={16} className="text-anvil-red" /> Panel de Control
                        </h2>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => onNavigate('athletes')}
                                className="bg-[#252525] p-5 rounded-xl border border-white/5 hover:bg-[#303030] hover:border-anvil-red transition-all group text-left"
                            >
                                <div className="bg-anvil-red/10 w-10 h-10 rounded-lg flex items-center justify-center text-anvil-red mb-3 group-hover:scale-110 transition-transform">
                                    <Users size={20} />
                                </div>
                                <span className="font-bold text-white block">Mis Atletas</span>
                                <span className="text-xs text-gray-500">Gestión de deportistas</span>
                            </button>

                            <button
                                onClick={() => onNavigate('schedule')}
                                className="bg-[#252525] p-5 rounded-xl border border-white/5 hover:bg-[#303030] hover:border-anvil-red transition-all group text-left"
                            >
                                <div className="bg-blue-500/10 w-10 h-10 rounded-lg flex items-center justify-center text-blue-500 mb-3 group-hover:scale-110 transition-transform">
                                    <Trophy size={20} />
                                </div>
                                <span className="font-bold text-white block">Agenda Equipo</span>
                                <span className="text-xs text-gray-500">Competiciones y eventos</span>
                            </button>

                            <button
                                onClick={() => onNavigate('calendar')}
                                className="bg-[#252525] p-5 rounded-xl border border-white/5 hover:bg-[#303030] hover:border-anvil-red transition-all group text-left"
                            >
                                <div className="bg-green-500/10 w-10 h-10 rounded-lg flex items-center justify-center text-green-500 mb-3 group-hover:scale-110 transition-transform">
                                    <Calendar size={20} />
                                </div>
                                <span className="font-bold text-white block">Calendario AEP</span>
                                <span className="text-xs text-gray-500">Eventos oficiales</span>
                            </button>

                            <button
                                onClick={() => onNavigate('profile')}
                                className="bg-[#252525] p-5 rounded-xl border border-white/5 hover:bg-[#303030] hover:border-anvil-red transition-all group text-left"
                            >
                                <div className="bg-purple-500/10 w-10 h-10 rounded-lg flex items-center justify-center text-purple-500 mb-3 group-hover:scale-110 transition-transform">
                                    <User size={20} />
                                </div>
                                <span className="font-bold text-white block">Mi Perfil</span>
                                <span className="text-xs text-gray-500">Ajustes de cuenta</span>
                            </button>
                        </div>
                    </div>

                    {/* La Arena - Predictions */}
                    <div className="order-4 lg:order-4 lg:col-span-3 space-y-3">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                            <Users size={16} className="text-anvil-red" /> Comunidad
                        </h2>
                        <div
                            onClick={() => window.location.href = '/dashboard/predictions'}
                            className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98] relative overflow-hidden"
                        >
                            <div className="relative z-10 flex items-center gap-4">
                                <div className="p-3 bg-anvil-red/10 rounded-xl text-anvil-red group-hover:bg-anvil-red group-hover:text-white transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)]">
                                    <Swords size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black uppercase italic text-white leading-none mb-1">La Arena</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Apuesta por los nuestros y gana prestigio</p>
                                </div>
                            </div>
                            <ChevronRight size={20} className="text-gray-500 group-hover:text-white transition-colors relative z-10" />

                            {/* Background Pattern */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-anvil-red/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-anvil-red/10 transition-all"></div>
                        </div>
                    </div>

                    {/* Anvil Lab Tools - 4th on mobile, full row on desktop */}
                    <div className="order-4 lg:order-4 lg:col-span-3 space-y-3">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                            <FlaskConical size={16} className="text-anvil-red" /> Anvil Lab Tools
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div
                                onClick={() => setIsPlateCalcOpen(true)}
                                className="bg-[#252525] border border-white/5 p-5 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-green-500/30 transition-all active:scale-[0.98]"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-green-500/10 rounded-xl text-green-500 group-hover:bg-green-600 group-hover:text-white transition-all">
                                        <Weight size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white uppercase tracking-tight text-sm">Carga de Barra</h3>
                                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Calculadora de Discos</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
                            </div>

                            <div
                                onClick={() => setIsWarmUpCalcOpen(true)}
                                className="bg-[#252525] border border-white/5 p-5 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-blue-500/30 transition-all active:scale-[0.98]"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                        <List size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white uppercase tracking-tight text-sm">Aproximaciones</h3>
                                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Escalera de Calentamiento</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
                            </div>

                            <div
                                onClick={() => setIs1RMCalcOpen(true)}
                                className="bg-[#252525] border border-white/5 p-5 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98]"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-anvil-red/10 rounded-xl text-anvil-red group-hover:bg-anvil-red group-hover:text-white transition-all">
                                        <Calculator size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white uppercase tracking-tight text-sm">Calculadora 1RM</h3>
                                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">RPE & Velocidad</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Modal Components */}
            <OneRMCalculator isOpen={is1RMCalcOpen} onClose={() => setIs1RMCalcOpen(false)} />
            <WarmUpCalculator isOpen={isWarmUpCalcOpen} onClose={() => setIsWarmUpCalcOpen(false)} />
            <PlateCalculator isOpen={isPlateCalcOpen} onClose={() => setIsPlateCalcOpen(false)} />
        </>
    );
}
