import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar,
    BookOpen,
    ChevronRight,
    Trophy,
    Weight,
    List,
    Calculator,
    FlaskConical,
    Users,
    Swords,
    Lock
} from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { Loader } from 'lucide-react';
import { OneRMCalculator } from './OneRMCalculator';
import { WarmUpCalculator } from './WarmUpCalculator';
import { PlateCalculator } from './PlateCalculator';
import { AnvilRanking } from './AnvilRanking';
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
    const [isRankingOpen, setIsRankingOpen] = useState(false);
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
        setIsRankingOpen,
        nextCompetition
    };

    return (
        <>
            <MobileHome {...commonProps} />
            <DesktopHome {...commonProps} />

            <AnvilRanking isOpen={isRankingOpen} onClose={() => setIsRankingOpen(false)} />
            <OneRMCalculator isOpen={is1RMCalcOpen} onClose={() => setIs1RMCalcOpen(false)} />
            <WarmUpCalculator isOpen={isWarmUpCalcOpen} onClose={() => setIsWarmUpCalcOpen(false)} />
            <PlateCalculator isOpen={isPlateCalcOpen} onClose={() => setIsPlateCalcOpen(false)} />
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
    setIsRankingOpen: (isOpen: boolean) => void;
    nextCompetition: CompetitionAssignment | null;
}

function MobileHome({ user, navigate, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen, setIsRankingOpen, nextCompetition }: HomeViewProps) {
    return (
        <div className="md:hidden space-y-6 pb-20 px-4 py-6">
            <header>
                {user.role === 'athlete' && getTeamName(user.coach_name) && (
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-anvil-red/60 mb-1">
                        {getTeamName(user.coach_name)}
                    </p>
                )}
                <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">
                    {getGreeting()}, <span className="text-anvil-red">{user.full_name?.split(' ')[0] || 'Atleta'}</span>
                </h1>
                <p className="text-gray-500 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                    <Calendar size={14} className="text-anvil-red" />
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </header>

            {/* 1. Mobile Anvil Legend */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <BookOpen size={16} className="text-yellow-500" /> Anvil Lessons
                </h2>
                <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
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
                        name={nextCompetition.name} 
                        date={nextCompetition.date} 
                        location={nextCompetition.location} 
                        level={nextCompetition.level} 
                        mobile={true} 
                    />
                ) : (
                    <div className="bg-[#252525] border border-white/5 rounded-3xl p-8 flex flex-col items-center text-center relative overflow-hidden">
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
                    <>
                        <div className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 rounded-2xl p-6 relative overflow-hidden mb-3 opacity-50 cursor-not-allowed">
                            <div className="relative z-10 flex items-center gap-4">
                                <div className="p-3 bg-gray-500/10 rounded-xl text-gray-500"><Lock size={24} /></div>
                                <div>
                                    <h3 className="text-lg font-black uppercase italic text-gray-400 leading-none mb-1">La Arena</h3>
                                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Premium</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 rounded-2xl p-6 relative overflow-hidden opacity-50 cursor-not-allowed">
                            <div className="relative z-10 flex items-center gap-4">
                                <div className="p-3 bg-gray-500/10 rounded-xl text-gray-500"><Lock size={24} /></div>
                                <div>
                                    <h3 className="text-lg font-black uppercase italic text-gray-400 leading-none mb-1">Ranking</h3>
                                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Premium</p>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div onClick={() => navigate('/dashboard/community')} className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 rounded-2xl p-6 relative overflow-hidden group active:scale-[0.98] transition-all mb-3 cursor-pointer">
                            <div className="relative z-10 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]"><Swords size={24} /></div>
                                    <div>
                                        <h3 className="text-lg font-black uppercase italic text-white leading-none mb-1">La Arena</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Apuesta</p>
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-gray-500 group-hover:text-white transition-colors" />
                            </div>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                        </div>

                        <div onClick={() => setIsRankingOpen(true)} className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 rounded-2xl p-6 relative overflow-hidden group active:scale-[0.98] transition-all">
                            <div className="relative z-10 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-anvil-red/10 rounded-xl text-anvil-red shadow-[0_0_15px_rgba(220,38,38,0.2)]"><Trophy size={24} /></div>
                                    <div>
                                        <h3 className="text-lg font-black uppercase italic text-white leading-none mb-1">Ranking</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Leaderboard</p>
                                    </div>
                                </div>
                                <ChevronRight size={20} className="text-gray-500 group-hover:text-white transition-colors" />
                            </div>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-anvil-red/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                        </div>
                    </>
                )}
            </div>

            {/* 4. Mobile Tools Grid */}
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
                </div>
            </div>

        </div>
    );
}

function DesktopHome({ user, navigate, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen, setIsRankingOpen, nextCompetition }: HomeViewProps) {
    return (
        <div className="hidden md:block px-12 py-8 space-y-12 animate-in fade-in duration-500">
            {/* Header */}
            <header>
                {user.role === 'athlete' && getTeamName(user.coach_name) && (
                    <p className="text-[11px] font-black uppercase tracking-[0.4em] text-anvil-red/60 mb-1">
                        {getTeamName(user.coach_name)}
                    </p>
                )}
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2">
                    {getGreeting()}, <span className="text-anvil-red">{user.full_name?.split(' ')[0] || 'Atleta'}</span>
                </h1>
                <p className="text-gray-500 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                    <Calendar size={14} className="text-anvil-red" />
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </header>

            {/* 1. Desktop Anvil Legend */}
            <div className="space-y-4">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <BookOpen size={16} className="text-yellow-500" /> Anvil Lessons
                </h2>
                <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-8 h-fit relative overflow-hidden group hover:border-yellow-500/30 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-50 group-hover:opacity-80 transition-opacity"></div>
                    <div className="absolute -top-6 -right-6 text-yellow-500/5 rotate-12"><BookOpen size={120} /></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-end mb-8">
                            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{new Date().toLocaleDateString('es-ES', { weekday: 'long' })}</span>
                        </div>
                        <p className="text-3xl font-black uppercase italic text-white leading-tight tracking-tighter mb-8 drop-shadow-lg">"{getAnvilQuote()}"</p>
                        <div className="flex items-center justify-between border-t border-white/5 pt-6">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Anvil Strength Club</span>
                            <div className="w-20 h-1 bg-gradient-to-r from-yellow-500 to-transparent rounded-full"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Desktop Next Competition Banner */}
            <div className="space-y-4">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Trophy size={16} className="text-anvil-red" /> Competición
                </h2>
                {nextCompetition ? (
                    <CompetitionBanner 
                        name={nextCompetition.name} 
                        date={nextCompetition.date} 
                        location={nextCompetition.location} 
                        level={nextCompetition.level} 
                        mobile={false} 
                    />
                ) : (
                    <div className="bg-[#252525] border border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center relative overflow-hidden h-64">
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

            {/* 3. Desktop Community */}
            <div className="space-y-4">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Users size={16} className="text-anvil-red" /> Comunidad
                </h2>
                {user.has_access === false ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 p-6 rounded-2xl flex items-center gap-4 opacity-50 cursor-not-allowed">
                            <div className="p-3 bg-gray-500/10 rounded-xl text-gray-500"><Lock size={24} /></div>
                            <div>
                                <h3 className="text-lg font-black uppercase italic text-gray-400 leading-none mb-1">La Arena</h3>
                                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Premium</p>
                            </div>
                        </div>
                        <div className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 p-6 rounded-2xl flex items-center gap-4 opacity-50 cursor-not-allowed">
                            <div className="p-3 bg-gray-500/10 rounded-xl text-gray-500"><Lock size={24} /></div>
                            <div>
                                <h3 className="text-lg font-black uppercase italic text-gray-400 leading-none mb-1">Ranking</h3>
                                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Premium</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div onClick={() => navigate('/dashboard/community')} className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-yellow-500/30 transition-all active:scale-[0.98] relative overflow-hidden">
                            <div className="relative z-10 flex items-center gap-4">
                                <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500 group-hover:bg-yellow-500 group-hover:text-black transition-all shadow-[0_0_15px_rgba(234,179,8,0.2)]"><Swords size={24} /></div>
                                <div>
                                    <h3 className="text-lg font-black uppercase italic text-white leading-none mb-1">La Arena</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Apuesta</p>
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-yellow-500/10 transition-all"></div>
                        </div>

                        <div onClick={() => setIsRankingOpen(true)} className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98] relative overflow-hidden">
                            <div className="relative z-10 flex items-center gap-4">
                                <div className="p-3 bg-anvil-red/10 rounded-xl text-anvil-red group-hover:bg-anvil-red group-hover:text-white transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)]"><Trophy size={24} /></div>
                                <div>
                                    <h3 className="text-lg font-black uppercase italic text-white leading-none mb-1">Ranking</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Leaderboard</p>
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 w-24 h-24 bg-anvil-red/5 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-anvil-red/10 transition-all"></div>
                        </div>
                    </div>
                )}
            </div>

            {/* 4. Desktop Tools */}
            <div className="space-y-4">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <FlaskConical size={16} className="text-anvil-red" /> Anvil Lab Tools
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div onClick={() => setIs1RMCalcOpen(true)} className="bg-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-anvil-red/10 rounded-xl text-anvil-red group-hover:bg-anvil-red group-hover:text-white transition-all"><Calculator size={24} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase tracking-tight text-sm">Calculadora 1RM</h3>
                                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">RPE & Velocidad</p>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>

                    <div onClick={() => setIsWarmUpCalcOpen(true)} className="bg-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-blue-500/30 transition-all active:scale-[0.98]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all"><List size={24} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase tracking-tight text-sm">Aproximaciones</h3>
                                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Escalera de Calentamiento</p>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>

                    <div onClick={() => setIsPlateCalcOpen(true)} className="bg-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-500/10 rounded-xl text-green-500 group-hover:bg-green-600 group-hover:text-white transition-all"><Weight size={24} /></div>
                            <div>
                                <h3 className="font-bold text-white uppercase tracking-tight text-sm">Carga de Barra</h3>
                                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Calculadora de Discos</p>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>
                </div>
            </div>

        </div>
    );
}