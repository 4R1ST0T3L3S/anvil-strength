import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; // <--- 1. IMPORTAR ESTO
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Users, Trophy, Calendar, User, LayoutDashboard, BookOpen, FlaskConical, Weight, List, Calculator, ChevronRight, Swords, Activity, Fish } from 'lucide-react';
import { getAnvilQuote } from '../../../lib/dailyQuotes';
import { OneRMCalculator } from '../../athlete/components/OneRMCalculator';
import { WarmUpCalculator } from '../../athlete/components/WarmUpCalculator';
import { PlateCalculator } from '../../athlete/components/PlateCalculator';
import { SushiCounter } from '../../athlete/components/SushiCounter';
import { AnvilRanking } from '../../athlete/components/AnvilRanking';
import { CompetitionBanner } from '../../../components/ui/CompetitionCountdown';

export function CoachHome({ user, onNavigate }: { user: UserProfile, onNavigate: (view: string) => void }) {
    const navigate = useNavigate();

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 14) return 'Buenos días';
        if (hour >= 14 && hour < 21) return 'Buenas tardes';
        return 'Buenas noches';
    };

    const [stats, setStats] = useState({
        nextCompDate: null as string | null,
        nextCompDays: null as number | null,
        nextCompName: '',
        nextCompLevel: '',
        nextCompLocation: ''
    });
    const [loading, setLoading] = useState(true);
    const [is1RMCalcOpen, setIs1RMCalcOpen] = useState(false);
    const [isWarmUpCalcOpen, setIsWarmUpCalcOpen] = useState(false);
    const [isPlateCalcOpen, setIsPlateCalcOpen] = useState(false);
    const [isSushiCounterOpen, setIsSushiCounterOpen] = useState(false);
    const [isRankingOpen, setIsRankingOpen] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // 1. Get athletes assigned to this coach
                const { data: athleteLinks, error: linksError } = await supabase
                    .from('coach_athletes')
                    .select('athlete_id')
                    .eq('coach_id', user.id);

                if (linksError) throw linksError;

                const athleteIds = athleteLinks?.map((link: { athlete_id: string; }) => link.athlete_id) || [];

                if (athleteIds.length === 0) {
                    setStats({
                        nextCompDate: null,
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

                let compDate = null;
                let daysUntil = null;
                let compName = '';
                let compLevel = '';
                let compLocation = '';

                if (nextComp) {
                    const target = new Date(nextComp.date);
                    const now = new Date();
                    const diffTime = Math.abs(target.getTime() - now.getTime());
                    daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    compDate = nextComp.date;
                    compName = nextComp.name;
                    compLevel = nextComp.level || '';
                    compLocation = nextComp.location || '';
                }

                setStats({
                    nextCompDate: compDate,
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

    const commonProps = {
        user,
        stats,
        getGreeting,
        onNavigate,
        navigate,
        setIs1RMCalcOpen,
        setIsWarmUpCalcOpen,
        setIsPlateCalcOpen,
        setIsSushiCounterOpen,
        setIsRankingOpen
    };

    return (
        <>
            <MobileCoachHome {...commonProps} />
            <DesktopCoachHome {...commonProps} />

            {/* Modal Components */}
            <AnvilRanking isOpen={isRankingOpen} onClose={() => setIsRankingOpen(false)} />
            <OneRMCalculator isOpen={is1RMCalcOpen} onClose={() => setIs1RMCalcOpen(false)} />
            <WarmUpCalculator isOpen={isWarmUpCalcOpen} onClose={() => setIsWarmUpCalcOpen(false)} />
            <PlateCalculator isOpen={isPlateCalcOpen} onClose={() => setIsPlateCalcOpen(false)} />
            <SushiCounter isOpen={isSushiCounterOpen} onClose={() => setIsSushiCounterOpen(false)} />
        </>
    );
}

function MobileCoachHome({ user, stats, getGreeting, onNavigate, navigate, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen, setIsSushiCounterOpen, setIsRankingOpen }: any) {
    return (
        <div className="md:hidden space-y-6 pb-20 px-4 py-6">
            <header className="mb-8">
                <h1 className="text-3xl font-black uppercase tracking-tighter">
                    {getGreeting()}, <span className="text-anvil-red">{user.full_name?.split(' ')[0] || 'Coach'}</span>
                </h1>
                <p className="text-gray-400 font-bold tracking-widest text-xs uppercase flex items-center gap-2 mt-1">
                    <Calendar size={14} className="text-anvil-red" />
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </header>

            <div className="flex flex-col gap-6">

                {/* Anvil Lessons */}
                <div className="space-y-3">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <BookOpen size={16} className="text-yellow-500" /> Anvil Lessons
                    </h2>
                    <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-50 transition-opacity"></div>
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <BookOpen size={64} className="text-yellow-500 rotate-12" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-xl font-black uppercase italic text-white leading-tight tracking-tight mb-2">
                                "{getAnvilQuote()}"
                            </p>
                            <div className="w-12 h-1 bg-gradient-to-r from-yellow-500 to-transparent rounded-full mt-4"></div>
                        </div>
                    </div>
                </div>

                {/* Próxima Competición */}
                <div className="flex flex-col gap-3">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <Trophy size={16} className="text-anvil-red" /> Próxima Competición
                    </h2>
                    {stats.nextCompDate ? (
                        <CompetitionBanner 
                            name={stats.nextCompName}
                            date={stats.nextCompDate}
                            location={stats.nextCompLocation}
                            level={stats.nextCompLevel}
                            mobile={true}
                        />
                    ) : (
                        <div className="bg-[#252525] p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center">
                            <Trophy size={32} className="text-gray-600 mb-3" />
                            <h3 className="text-sm font-bold text-gray-400 italic leading-tight mb-1">
                                Sin eventos próximos
                            </h3>
                            <p className="text-xs text-anvil-red font-bold mt-1 uppercase tracking-wider">
                                ¡Toca preparar a los atletas! 🚀
                            </p>
                        </div>
                    )}
                </div>

                {/* Panel de Control */}
                <div className="flex flex-col gap-3">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <LayoutDashboard size={16} className="text-anvil-red" /> Panel de Control
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => onNavigate('athletes')}
                            className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-anvil-red transition-all text-left flex flex-col justify-center active:scale-[0.98]"
                        >
                            <div className="bg-anvil-red/10 w-10 h-10 rounded-xl flex items-center justify-center text-anvil-red mb-3">
                                <Users size={20} />
                            </div>
                            <div>
                                <span className="font-bold text-white block text-sm">Mis Atletas</span>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Gestión</span>
                            </div>
                        </button>

                        <button
                            onClick={() => onNavigate('schedule')}
                            className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-blue-500 transition-all text-left flex flex-col justify-center active:scale-[0.98]"
                        >
                            <div className="bg-blue-500/10 w-10 h-10 rounded-xl flex items-center justify-center text-blue-500 mb-3">
                                <Trophy size={20} />
                            </div>
                            <div>
                                <span className="font-bold text-white block text-sm">Agenda Equipo</span>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Eventos</span>
                            </div>
                        </button>

                        <button
                            onClick={() => onNavigate('calendar')}
                            className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-purple-500 transition-all text-left flex flex-col justify-center active:scale-[0.98]"
                        >
                            <div className="bg-purple-500/10 w-10 h-10 rounded-xl flex items-center justify-center text-purple-500 mb-3">
                                <Calendar size={20} />
                            </div>
                            <div>
                                <span className="font-bold text-white block text-sm">Calendario AEP</span>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Oficial</span>
                            </div>
                        </button>

                        <button
                            onClick={() => onNavigate('profile')}
                            className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-gray-500 transition-all text-left flex flex-col justify-center active:scale-[0.98]"
                        >
                            <div className="bg-gray-500/10 w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 mb-3">
                                <User size={20} />
                            </div>
                            <div>
                                <span className="font-bold text-white block text-sm">Mi Perfil</span>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Ajustes</span>
                            </div>
                        </button>

                        <button
                            onClick={() => onNavigate('pwr_analysis')}
                            className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-orange-500 transition-all text-left flex flex-col justify-center active:scale-[0.98]"
                        >
                            <div className="bg-orange-500/10 w-10 h-10 rounded-xl flex items-center justify-center text-orange-500 mb-3">
                                <Activity size={20} />
                            </div>
                            <div>
                                <span className="font-bold text-white block text-sm">PWR Análisis</span>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Análisis VBT</span>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Comunidad */}
                <div className="space-y-3">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <Users size={16} className="text-anvil-red" /> Comunidad
                    </h2>
                    <div className="space-y-3">
                        <div
                            onClick={() => navigate('/dashboard/arena')}
                            className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 rounded-2xl p-6 relative overflow-hidden active:scale-[0.98] transition-all cursor-pointer"
                        >
                            <div className="relative z-10 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                                        <Swords size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black uppercase italic text-white leading-none mb-1">La Arena</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Apuesta</p>
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-gray-500" />
                            </div>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                        </div>

                        <div
                            onClick={() => setIsRankingOpen(true)}
                            className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 rounded-2xl p-6 relative overflow-hidden active:scale-[0.98] transition-all cursor-pointer"
                        >
                            <div className="relative z-10 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-anvil-red/10 rounded-xl text-anvil-red shadow-[0_0_15px_rgba(220,38,38,0.2)]">
                                        <Trophy size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black uppercase italic text-white leading-none mb-1">Ranking</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Leaderboard</p>
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-gray-500" />
                            </div>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-anvil-red/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                        </div>
                    </div>
                </div>

                {/* Anvil Lab Tools */}
                <div className="space-y-3">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <FlaskConical size={16} className="text-anvil-red" /> Anvil Lab Tools
                    </h2>
                    <div className="space-y-4">
                        <div onClick={() => setIsPlateCalcOpen(true)} className="bg-[#252525] border border-white/5 p-4 rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-transform">
                            <div className="p-3 bg-green-500/10 rounded-xl text-green-500"><Weight size={24} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase text-sm">Carga de Barra</h3>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Calculadora de Discos</p>
                            </div>
                            <ChevronRight size={18} className="ml-auto text-gray-600" />
                        </div>

                        <div onClick={() => setIsWarmUpCalcOpen(true)} className="bg-[#252525] border border-white/5 p-4 rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-transform">
                            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500"><List size={24} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase text-sm">Aproximaciones</h3>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Escalera de Calentamiento</p>
                            </div>
                            <ChevronRight size={18} className="ml-auto text-gray-600" />
                        </div>

                        <div onClick={() => setIs1RMCalcOpen(true)} className="bg-[#252525] border border-white/5 p-4 rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-transform">
                            <div className="p-3 bg-anvil-red/10 rounded-xl text-anvil-red"><Calculator size={24} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase text-sm">Calculadora 1RM</h3>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">RPE & Velocidad</p>
                            </div>
                            <ChevronRight size={18} className="ml-auto text-gray-600" />
                        </div>

                        <div onClick={() => setIsSushiCounterOpen(true)} className="bg-[#252525] border border-white/5 p-4 rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-transform">
                            <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-500"><Fish size={24} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase text-sm">Contador Sushi</h3>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Calculadora Post-Competición</p>
                            </div>
                            <ChevronRight size={18} className="ml-auto text-gray-600" />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

function DesktopCoachHome({ user, stats, getGreeting, onNavigate, navigate, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen, setIsSushiCounterOpen, setIsRankingOpen }: any) {
    return (
        <div className="hidden md:flex flex-col px-12 py-8 min-h-full animate-in fade-in duration-500 gap-6">
            {/* Header */}
            <header className="flex-none">
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2">
                    {getGreeting()}, <span className="text-anvil-red">{user.full_name?.split(' ')[0] || 'Coach'}</span>
                </h1>
                <p className="text-gray-500 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                    <Calendar size={14} className="text-anvil-red" />
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </header>

            {/* Split Top Row for Desktop */}
            <div className="grid lg:grid-cols-3 gap-6 flex-[2] min-h-0">
                {/* 1. Desktop Anvil Lessons */}
                <div className="lg:col-span-2 flex flex-col gap-3 h-full">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <BookOpen size={20} className="text-yellow-500" /> Anvil Lessons
                    </h2>
                    <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-8 flex flex-col justify-center flex-1 relative overflow-hidden group hover:border-yellow-500/30 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-50 group-hover:opacity-80 transition-opacity"></div>
                        <div className="absolute -top-6 -right-6 text-yellow-500/5 rotate-12"><BookOpen size={120} /></div>
                        <div className="relative z-10 flex flex-col h-full justify-between">
                            <div className="flex items-center justify-end mb-4">
                                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{new Date().toLocaleDateString('es-ES', { weekday: 'long' })}</span>
                            </div>
                            <div className="flex-1 flex items-center">
                                <p className="text-3xl lg:text-4xl font-black uppercase italic text-white leading-tight tracking-tighter mb-4 drop-shadow-lg">"{getAnvilQuote()}"</p>
                            </div>
                            <div className="flex items-center justify-between border-t border-white/5 pt-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Anvil Strength Club</span>
                                <div className="w-20 h-1 bg-gradient-to-r from-yellow-500 to-transparent rounded-full"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Desktop Next Competition */}
                <div className="flex flex-col gap-3 h-full">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <Trophy size={20} className="text-anvil-red" /> Competición En Equipo
                    </h2>
                    {stats.nextCompDate ? (
                        <div className="flex-1 min-h-0">
                            <CompetitionBanner
                                name={stats.nextCompName}
                                date={stats.nextCompDate}
                                location={stats.nextCompLocation}
                                level={stats.nextCompLevel}
                                mobile={false}
                            />
                        </div>
                    ) : (
                        <div className="bg-[#252525] border border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center relative overflow-hidden flex-1 min-h-0">
                            <div className="w-20 h-20 bg-white/5 rounded-full flex flex-col items-center justify-center text-gray-500 mb-4">
                                <Trophy size={40} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-400 italic leading-tight mb-2">
                                Sin eventos próximos
                            </h3>
                            <p className="text-sm text-anvil-red font-bold uppercase tracking-widest">
                                ¡Toca preparar a los atletas! 🚀
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Panel de Control */}
            <div className="flex flex-col gap-3 flex-1 min-h-0">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <LayoutDashboard size={20} className="text-anvil-red" /> Panel de Control
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 h-full">
                    <button
                        onClick={() => onNavigate('athletes')}
                        className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-anvil-red/50 transition-all group text-left flex flex-col h-full justify-center active:scale-[0.98]"
                    >
                        <div className="bg-anvil-red/10 w-12 h-12 rounded-xl flex items-center justify-center text-anvil-red mb-4 group-hover:scale-110 transition-transform">
                            <Users size={24} />
                        </div>
                        <div>
                            <span className="font-bold text-white block text-lg">Mis Atletas</span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Gestión de deportistas</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('schedule')}
                        className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-blue-500/50 transition-all group text-left flex flex-col h-full justify-center active:scale-[0.98]"
                    >
                        <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center text-blue-500 mb-4 group-hover:scale-110 transition-transform">
                            <Trophy size={24} />
                        </div>
                        <div>
                            <span className="font-bold text-white block text-lg">Agenda Equipo</span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Competiciones y eventos</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('calendar')}
                        className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-purple-500/50 transition-all group text-left flex flex-col h-full justify-center active:scale-[0.98]"
                    >
                        <div className="bg-purple-500/10 w-12 h-12 rounded-xl flex items-center justify-center text-purple-500 mb-4 group-hover:scale-110 transition-transform">
                            <Calendar size={24} />
                        </div>
                        <div>
                            <span className="font-bold text-white block text-lg">Calendario AEP</span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Eventos oficiales</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('profile')}
                        className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-gray-500/50 transition-all group text-left flex flex-col h-full justify-center active:scale-[0.98]"
                    >
                        <div className="bg-gray-500/10 w-12 h-12 rounded-xl flex items-center justify-center text-gray-400 mb-4 group-hover:scale-110 transition-transform">
                            <User size={24} />
                        </div>
                        <div>
                            <span className="font-bold text-white block text-lg">Mi Perfil</span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Ajustes de cuenta</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('pwr_analysis')}
                        className="bg-[#252525] p-5 rounded-2xl border border-white/5 hover:bg-[#303030] hover:border-orange-500/50 transition-all group text-left flex flex-col h-full justify-center active:scale-[0.98]"
                    >
                        <div className="bg-orange-500/10 w-12 h-12 rounded-xl flex items-center justify-center text-orange-500 mb-4 group-hover:scale-110 transition-transform">
                            <Activity size={24} />
                        </div>
                        <div>
                            <span className="font-bold text-white block text-lg">PWR Análisis</span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Análisis VBT</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Desktop Community */}
            <div className="flex flex-col gap-3 flex-1 min-h-0">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Users size={20} className="text-anvil-red" /> Comunidad
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                    <div onClick={() => navigate('/dashboard/arena')} className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 p-8 lg:p-10 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-yellow-500/30 transition-all active:scale-[0.98] relative overflow-hidden h-full">
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="p-4 lg:p-5 bg-yellow-500/10 rounded-xl text-yellow-500 group-hover:bg-yellow-500 group-hover:text-black transition-all shadow-[0_0_15px_rgba(234,179,8,0.2)]"><Swords size={32} /></div>
                            <div>
                                <h3 className="text-xl lg:text-3xl font-black uppercase italic text-white leading-none mb-2">La Arena</h3>
                                <p className="text-xs lg:text-sm font-bold text-gray-400 uppercase tracking-widest">Apuesta por los nuestros</p>
                            </div>
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-yellow-500/10 transition-all"></div>
                    </div>

                    <div onClick={() => setIsRankingOpen(true)} className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 p-8 lg:p-10 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98] relative overflow-hidden h-full">
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="p-4 lg:p-5 bg-anvil-red/10 rounded-xl text-anvil-red group-hover:bg-anvil-red group-hover:text-white transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)]"><Trophy size={32} /></div>
                            <div>
                                <h3 className="text-xl lg:text-3xl font-black uppercase italic text-white leading-none mb-2">Ranking</h3>
                                <p className="text-xs lg:text-sm font-bold text-gray-400 uppercase tracking-widest">Leaderboard del Club</p>
                            </div>
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-anvil-red/5 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-anvil-red/10 transition-all"></div>
                    </div>
                </div>
            </div>

            {/* Desktop Tools */}
            <div className="flex flex-col gap-3 flex-1 min-h-0">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <FlaskConical size={20} className="text-anvil-red" /> Anvil Lab Tools
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 h-full">
                    <div onClick={() => setIs1RMCalcOpen(true)} className="bg-[#252525] border border-white/5 p-8 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98] h-full">
                        <div className="flex items-center gap-5">
                            <div className="p-4 lg:p-5 bg-anvil-red/10 rounded-xl text-anvil-red group-hover:bg-anvil-red group-hover:text-white transition-all"><Calculator size={32} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase tracking-tight text-lg lg:text-xl">Calculadora 1RM</h3>
                                <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mt-1">RPE & Velocidad</p>
                            </div>
                        </div>
                        <ChevronRight size={24} className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>

                    <div onClick={() => setIsWarmUpCalcOpen(true)} className="bg-[#252525] border border-white/5 p-8 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-blue-500/30 transition-all active:scale-[0.98] h-full">
                        <div className="flex items-center gap-5">
                            <div className="p-4 lg:p-5 bg-blue-500/10 rounded-xl text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all"><List size={32} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase tracking-tight text-lg lg:text-xl">Aproximaciones</h3>
                                <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mt-1">Escalera de Calentamiento</p>
                            </div>
                        </div>
                        <ChevronRight size={24} className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>

                    <div onClick={() => setIsPlateCalcOpen(true)} className="bg-[#252525] border border-white/5 p-8 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98] h-full">
                        <div className="flex items-center gap-5">
                            <div className="p-4 lg:p-5 bg-green-500/10 rounded-xl text-green-500 group-hover:bg-green-600 group-hover:text-white transition-all"><Weight size={32} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase tracking-tight text-lg lg:text-xl">Carga de Barra</h3>
                                <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mt-1">Calculadora de Discos</p>
                            </div>
                        </div>
                        <ChevronRight size={24} className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>

                    <div onClick={() => setIsSushiCounterOpen(true)} className="bg-[#252525] border border-white/5 p-8 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-cyan-500/30 transition-all active:scale-[0.98] h-full">
                        <div className="flex items-center gap-5">
                            <div className="p-4 lg:p-5 bg-cyan-500/10 rounded-xl text-cyan-500 group-hover:bg-cyan-600 group-hover:text-white transition-all"><Fish size={32} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase tracking-tight text-lg lg:text-xl">Sushi Counter</h3>
                                <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mt-1">Calculadora de Macros</p>
                            </div>
                        </div>
                        <ChevronRight size={24} className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>
                </div>
            </div>

        </div>
    );
}