import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar,
    BookOpen,
    Trophy,
    Weight,
    List,
    Calculator,
    FlaskConical,
    Users,
    Swords,
    Lock,
    LayoutDashboard,
    FileText,
    Fish,
    Gamepad2,
    Utensils,
    User,
    MessageSquare,
} from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { Loader } from 'lucide-react';
import { OneRMCalculator } from './OneRMCalculator';
import { WarmUpCalculator } from './WarmUpCalculator';
import { PlateCalculator } from './PlateCalculator';
import { SushiCounter } from './SushiCounter';
import { AnvilPointsBadge } from '../../profile/components/AnvilPointsBadge';
import { getAnvilQuote } from '../../../lib/dailyQuotes';
import { competitionsService, CompetitionAssignment } from '../../../services/competitionsService';
import { CompetitionBanner } from '../../../components/ui/CompetitionCountdown';

interface AthleteHomeProps {
    user: UserProfile;
    onNavigate: (view: string) => void;
}

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return 'Buenos días';
    if (hour >= 14 && hour < 21) return 'Buenas tardes';
    return 'Buenas noches';
};

const getTeamName = (coachName?: string | null): string | null => {
    if (!coachName) return null;
    const parts = coachName.trim().split(' ');
    const surname = parts.length >= 2 ? parts[1] : parts[0];
    return `Team ${surname}`;
};

export function AthleteHome({ user, onNavigate }: AthleteHomeProps) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [is1RMCalcOpen, setIs1RMCalcOpen] = useState(false);
    const [isWarmUpCalcOpen, setIsWarmUpCalcOpen] = useState(false);
    const [isPlateCalcOpen, setIsPlateCalcOpen] = useState(false);
    const [isSushiCounterOpen, setIsSushiCounterOpen] = useState(false);
    const [nextCompetition, setNextCompetition] = useState<CompetitionAssignment | null>(null);

    useEffect(() => {
        const fetchHomeData = async () => {
            try {
                setLoading(true);
                const nextComp = await competitionsService.getNextCompetition(user.id);
                setNextCompetition(nextComp);
            } catch (error) {
                console.error('Error fetching home data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchHomeData();
    }, [user.id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader className="animate-spin text-anvil-red" size={32} />
            </div>
        );
    }

    const commonProps = {
        user,
        onNavigate,
        navigate,
        setIs1RMCalcOpen,
        setIsWarmUpCalcOpen,
        setIsPlateCalcOpen,
        setIsSushiCounterOpen,
        nextCompetition
    };

    return (
        <>
            <MobileHome {...commonProps} />
            <DesktopHome {...commonProps} />

            <OneRMCalculator isOpen={is1RMCalcOpen} onClose={() => setIs1RMCalcOpen(false)} />
            <WarmUpCalculator isOpen={isWarmUpCalcOpen} onClose={() => setIsWarmUpCalcOpen(false)} />
            <PlateCalculator isOpen={isPlateCalcOpen} onClose={() => setIsPlateCalcOpen(false)} />
            <SushiCounter isOpen={isSushiCounterOpen} onClose={() => setIsSushiCounterOpen(false)} />
        </>
    );
}

interface HomeViewProps {
    user: UserProfile;
    onNavigate: (view: string) => void;
    navigate: ReturnType<typeof useNavigate>;
    setIs1RMCalcOpen: (isOpen: boolean) => void;
    setIsWarmUpCalcOpen: (isOpen: boolean) => void;
    setIsPlateCalcOpen: (isOpen: boolean) => void;
    setIsSushiCounterOpen: (isOpen: boolean) => void;
    nextCompetition: CompetitionAssignment | null;
}

function MobileHome({ user, onNavigate, navigate, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen, setIsSushiCounterOpen, nextCompetition }: HomeViewProps) {
    return (
        <div className="md:hidden space-y-6 pb-20 px-4 py-6">
            <header className="relative">
                <div className="absolute top-0 right-0">
                    <AnvilPointsBadge userId={user.id} />
                </div>
                {user.role === 'athlete' && getTeamName(user.coach_name) && (
                    <div className="flex items-center gap-3 mb-2">
                        {user.coach_logo_url && (
                            <img src={user.coach_logo_url} alt="Team Logo" className="h-6 w-auto object-contain rounded" />
                        )}
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60" style={{ color: user.coach_brand_color || '#dc2626' }}>
                            {getTeamName(user.coach_name)}
                        </p>
                    </div>
                )}
                <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">
                    {getGreeting()}, <span style={{ color: user.coach_brand_color || '#dc2626' }}>{user.full_name?.split(' ')[0] || 'Atleta'}</span>
                </h1>
                <p className="text-gray-500 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                    <Calendar size={14} style={{ color: user.coach_brand_color || '#dc2626' }} />
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </header>

            {/* 1. Mobile Anvil Legend */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <BookOpen size={16} className="text-yellow-500" /> Anvil Lessons
                </h2>
                <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-50"></div>
                    <div className="absolute top-0 right-0 p-4 opacity-10"><BookOpen size={64} className="text-yellow-500 rotate-12" /></div>
                    <div className="relative z-10">
                        <p className="text-xl font-black uppercase italic text-white leading-tight tracking-tight mb-2">"{getAnvilQuote()}"</p>
                        <div className="w-12 h-1 bg-gradient-to-r from-yellow-500 to-transparent rounded-full mt-4"></div>
                    </div>
                </div>
            </div>

            {/* 2. Mobile Next Competition Banner */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Trophy size={16} className="text-anvil-red" /> Competición
                </h2>
                {nextCompetition ? (
                    <CompetitionBanner
                        userId={user.id}
                        name={nextCompetition.name}
                        date={nextCompetition.date}
                        location={nextCompetition.location}
                        level={nextCompetition.level}
                        mobile={true}
                        fullUserMetadata={user.user_metadata}
                    />
                ) : (
                    <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-8 flex flex-col items-center text-center relative overflow-hidden">
                        <Trophy size={32} className="text-gray-600 mb-3" />
                        <h3 className="text-sm font-bold text-gray-400 italic leading-tight mb-1">
                            No hay competiciones a la vista.
                        </h3>
                        <p className="text-xs text-anvil-red font-bold mt-1 uppercase tracking-wider">
                            ¡Toca seguir sumando kilos! 🚀
                        </p>
                    </div>
                )}
            </div>

            {/* 3. Mobile Community Section */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Users size={16} className="text-anvil-red" /> Comunidad
                </h2>
                {user.has_access === false ? (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-5 relative overflow-hidden opacity-50 cursor-not-allowed h-full min-h-[140px] flex flex-col justify-center">
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="bg-gray-500/10 w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 mb-auto">
                                    <Lock size={20} />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">La Arena</span>
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Premium</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-5 relative overflow-hidden opacity-50 cursor-not-allowed h-full min-h-[140px] flex flex-col justify-center">
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="bg-gray-500/10 w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 mb-auto">
                                    <Lock size={20} />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">Ranking</span>
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Premium</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => navigate('/dashboard/chat')}
                            className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-blue-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[140px]"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-8 -mt-8 blur-xl group-hover:bg-blue-500/10 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="text-blue-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <MessageSquare size={28} strokeWidth={1.5} />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">Coach Chat</span>
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Comunicación</span>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => navigate('/dashboard/community')}
                            className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-yellow-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[140px]"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full -mr-8 -mt-8 blur-xl group-hover:bg-yellow-500/10 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="text-yellow-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Swords size={28} strokeWidth={1.5} />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">La Arena</span>
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Apuestas</span>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => navigate('/dashboard/games')}
                            className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-purple-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[140px]"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-8 -mt-8 blur-xl group-hover:bg-purple-500/10 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="text-purple-400 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Gamepad2 size={28} strokeWidth={1.5} />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">Anvil Games</span>
                                    <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mt-1 block">Reto Diario</span>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => onNavigate('ranking')}
                            className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-anvil-red/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[140px]"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-anvil-red/5 rounded-full -mr-8 -mt-8 blur-xl group-hover:bg-anvil-red/10 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="text-anvil-red mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Trophy size={28} strokeWidth={1.5} />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">Ranking</span>
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Leaderboard</span>
                                </div>
                            </div>
                        </button>
                    </div>
                )}
            </div>

            {/* 4. Mobile Tools Grid */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <FlaskConical size={16} className="text-anvil-red" /> Anvil Lab Tools
                </h2>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => setIsPlateCalcOpen(true)}
                        className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-green-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[140px]"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full -mr-8 -mt-8 blur-xl group-hover:bg-green-500/10 transition-all"></div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="text-green-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Weight size={28} strokeWidth={1.5} />
                                </div>
                            <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">Carga Barra</span>
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Calculadora</span>
                                </div>
                        </div>
                    </button>

                    <button
                        onClick={() => setIsWarmUpCalcOpen(true)}
                        className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-blue-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[140px]"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-8 -mt-8 blur-xl group-hover:bg-blue-500/10 transition-all"></div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="text-blue-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <List size={28} strokeWidth={1.5} />
                                </div>
                            <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">Aproximaciones</span>
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Calentamiento</span>
                                </div>
                        </div>
                    </button>

                    <button
                        onClick={() => setIs1RMCalcOpen(true)}
                        className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-anvil-red/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[140px]"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-anvil-red/5 rounded-full -mr-8 -mt-8 blur-xl group-hover:bg-anvil-red/10 transition-all"></div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="text-anvil-red mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Calculator size={28} strokeWidth={1.5} />
                                </div>
                            <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">Calc 1RM</span>
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">RPE & VBT</span>
                                </div>
                        </div>
                    </button>

                    <button
                        onClick={() => setIsSushiCounterOpen(true)}
                        className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-cyan-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[140px]"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full -mr-8 -mt-8 blur-xl group-hover:bg-cyan-500/10 transition-all"></div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="text-cyan-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Fish size={28} strokeWidth={1.5} />
                                </div>
                            <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">Sushi Counter</span>
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Post-Comp.</span>
                                </div>
                        </div>
                    </button>
                </div>
            </div>

        </div>
    );
}

function DesktopHome({ user, onNavigate, navigate, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen, setIsSushiCounterOpen, nextCompetition }: HomeViewProps) {
    return (
        <div className="hidden md:block px-8 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <header className="flex justify-between items-start">
                <div>
                    {user.role === 'athlete' && getTeamName(user.coach_name) && (
                        <div className="flex items-center gap-3 mb-3">
                            {user.coach_logo_url && (
                                <img src={user.coach_logo_url} alt="Team Logo" className="h-8 w-auto object-contain rounded" />
                            )}
                            <p className="text-[11px] font-black uppercase tracking-[0.4em] opacity-60" style={{ color: user.coach_brand_color || '#dc2626' }}>
                                {getTeamName(user.coach_name)}
                            </p>
                        </div>
                    )}
                    <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2">
                        {getGreeting()}, <span style={{ color: user.coach_brand_color || '#dc2626' }}>{user.full_name?.split(' ')[0] || 'Atleta'}</span>
                    </h1>
                    <p className="text-gray-500 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                        <Calendar size={14} style={{ color: user.coach_brand_color || '#dc2626' }} />
                        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>

                <AnvilPointsBadge userId={user.id} className="mt-2" />
            </header>

            {/* Split Top Row for Desktop */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* 1. Desktop Anvil Legend */}
                <div className="lg:col-span-2 flex flex-col gap-3">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <BookOpen size={20} className="text-yellow-500" /> Anvil Lessons
                    </h2>
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 flex flex-col justify-center relative overflow-hidden group hover:border-yellow-500/30 transition-all min-h-[200px]">
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-50 group-hover:opacity-80 transition-opacity"></div>
                        <div className="absolute -top-6 -right-6 text-yellow-500/5 rotate-12"><BookOpen size={120} /></div>
                        <div className="relative z-10">
                            <div className="flex flex-col h-full justify-between">
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
                </div>

                {/* 2. Desktop Next Competition Banner */}
                <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <Trophy size={20} className="text-anvil-red" /> Competición
                    </h2>
                    {nextCompetition ? (
                        <div>
                            <CompetitionBanner
                                userId={user.id}
                                name={nextCompetition.name}
                                date={nextCompetition.date}
                                location={nextCompetition.location}
                                level={nextCompetition.level}
                                fullUserMetadata={user.user_metadata}
                            />
                        </div>
                    ) : (
                        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[200px]">
                            <div className="w-20 h-20 bg-white/5 rounded-full flex flex-col items-center justify-center text-gray-500 mb-4">
                                <Trophy size={40} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-400 italic leading-tight mb-2">
                                Sin competiciones asignadas
                            </h3>
                            <p className="text-sm text-anvil-red font-bold uppercase tracking-widest">
                                ¡Toca seguir sumando kilos en la cueva! 🚀
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Panel de Control */}
            <div className="space-y-3">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <LayoutDashboard size={20} className="text-anvil-red" /> Panel de Control
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    <button
                        onClick={() => onNavigate('planning')}
                        className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-blue-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98]"
                    >
                        <div className="text-blue-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                            <FileText size={32} strokeWidth={1.5} />
                        </div>
                        <div className="mt-auto pt-4">
                            <span className="font-black text-white block text-xl leading-tight tracking-tight">Mi Planificación</span>
                            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Entrenamientos</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('nutrition')}
                        className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-green-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98]"
                    >
                        <div className="text-green-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                            <Utensils size={32} strokeWidth={1.5} />
                        </div>
                        <div className="mt-auto pt-4">
                            <span className="font-black text-white block text-xl leading-tight tracking-tight">Mi Nutrición</span>
                            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Dieta y macros</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('competitions')}
                        className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-yellow-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98]"
                    >
                        <div className="text-yellow-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                            <Trophy size={32} strokeWidth={1.5} />
                        </div>
                        <div className="mt-auto pt-4">
                            <span className="font-black text-white block text-xl leading-tight tracking-tight">Competiciones</span>
                            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Récords y Eventos</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('calendar')}
                        className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-purple-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98]"
                    >
                        <div className="text-purple-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                            <Calendar size={32} strokeWidth={1.5} />
                        </div>
                        <div className="mt-auto pt-4">
                            <span className="font-black text-white block text-xl leading-tight tracking-tight">Calendario AEP</span>
                            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Eventos oficiales</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('profile')}
                        className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 hover:bg-[#111] hover:border-gray-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98]"
                    >
                        <div className="text-gray-400 mb-auto group-hover:scale-110 transition-transform origin-left">
                            <User size={32} strokeWidth={1.5} />
                        </div>
                        <div className="mt-auto pt-4">
                            <span className="font-black text-white block text-xl leading-tight tracking-tight">Mi Perfil</span>
                            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Ajustes personales</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* 3. Desktop Community */}
            <div className="space-y-3">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Users size={20} className="text-anvil-red" /> Comunidad
                </h2>
                {user.has_access === false ? (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 h-full">
                        <div className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 opacity-50 cursor-not-allowed group text-left flex flex-col justify-center h-full min-h-[160px]">
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="bg-gray-500/10 w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center text-gray-500 mb-auto">
                                    <Lock size={24} className="lg:w-7 lg:h-7" />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">La Arena</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Premium</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 opacity-50 cursor-not-allowed group text-left flex flex-col justify-center h-full min-h-[160px]">
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="bg-gray-500/10 w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center text-gray-500 mb-auto">
                                    <Lock size={24} className="lg:w-7 lg:h-7" />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">Ranking</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Premium</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 h-full">
                        <button
                            onClick={() => navigate('/dashboard/chat')}
                            className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 hover:bg-[#111] hover:border-blue-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[160px]"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-blue-500/10 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="text-blue-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <MessageSquare size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">Coach Chat</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Comunicación</span>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => navigate('/dashboard/community')}
                            className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 hover:bg-[#111] hover:border-yellow-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[160px]"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-yellow-500/10 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="text-yellow-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Swords size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">La Arena</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Apuestas</span>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => navigate('/dashboard/games')}
                            className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 hover:bg-[#111] hover:border-purple-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[160px]"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-purple-500/10 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="text-purple-400 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Gamepad2 size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">Anvil Games</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Reto Diario</span>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => onNavigate('ranking')}
                            className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 hover:bg-[#111] hover:border-anvil-red/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[160px]"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-anvil-red/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-anvil-red/10 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="text-anvil-red mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Trophy size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />
                                </div>
                                <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">Ranking</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Leaderboard</span>
                                </div>
                            </div>
                        </button>
                    </div>
                )}
            </div>

            {/* 4. Desktop Tools */}
            <div className="space-y-3 pb-4">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <FlaskConical size={20} className="text-anvil-red" /> Anvil Lab Tools
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 h-full">
                    <button
                        onClick={() => setIsPlateCalcOpen(true)}
                        className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 hover:bg-[#111] hover:border-green-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[160px]"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-green-500/10 transition-all"></div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="text-green-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Weight size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />
                                </div>
                            <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">Carga Barra</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Calculadora</span>
                                </div>
                        </div>
                    </button>

                    <button
                        onClick={() => setIsWarmUpCalcOpen(true)}
                        className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 hover:bg-[#111] hover:border-blue-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[160px]"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-blue-500/10 transition-all"></div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="text-blue-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <List size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />
                                </div>
                            <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">Aproximaciones</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Calentamiento</span>
                                </div>
                        </div>
                    </button>

                    <button
                        onClick={() => setIs1RMCalcOpen(true)}
                        className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 hover:bg-[#111] hover:border-anvil-red/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[160px]"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-anvil-red/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-anvil-red/10 transition-all"></div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="text-anvil-red mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Calculator size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />
                                </div>
                            <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">Calc 1RM</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">RPE & VBT</span>
                                </div>
                        </div>
                    </button>

                    <button
                        onClick={() => setIsSushiCounterOpen(true)}
                        className="bg-[#0a0a0a] p-6 lg:p-8 rounded-3xl border border-white/5 hover:bg-[#111] hover:border-cyan-500/50 transition-all group text-left flex flex-col justify-center active:scale-[0.98] relative overflow-hidden h-full min-h-[160px]"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-cyan-500/10 transition-all"></div>
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="text-cyan-500 mb-auto group-hover:scale-110 transition-transform origin-left">
                                    <Fish size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />
                                </div>
                            <div className="mt-auto pt-4">
                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">Sushi Counter</span>
                                    <span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Post-Comp.</span>
                                </div>
                        </div>
                    </button>
                </div>
            </div>

        </div>
    );
}
