import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock, TrainingSession, SessionExercise } from '../../../types/training';
import {
    Calendar,
    BookOpen,
    ChevronRight,
    Dumbbell,
    Trophy,
    Weight,
    List,
    Calculator,
    Clock,
    FlaskConical,
    Users
} from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { Loader } from 'lucide-react';
import { OneRMCalculator } from './OneRMCalculator';
import { WarmUpCalculator } from './WarmUpCalculator';
import { PlateCalculator } from './PlateCalculator';
import { AnvilRanking } from './AnvilRanking';
import { getAnvilQuote } from '../../../lib/dailyQuotes';
import { competitionsService, CompetitionAssignment } from '../../../services/competitionsService';
import { getDaysRemaining } from '../../../utils/dateUtils';

interface AthleteHomeProps {
    user: UserProfile;
    onNavigate: (view: 'planning' | 'nutrition' | 'competitions' | 'calendar') => void;
}

interface ExtendedSession extends TrainingSession {
    exercises: (SessionExercise & { exercise: { name: string } })[];
}

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return 'Buenos días'; // 6 AM - 2 PM
    if (hour >= 14 && hour < 21) return 'Buenas tardes'; // 2 PM - 9 PM
    return 'Buenas noches'; // 9 PM - 6 AM
};



const formatCompetitionName = (name: string, location?: string, level?: string) => {
    // Priority: "LEVEL PLACE" (e.g. "AEP2 CHIVA")

    // 1. Extract Place (City)
    let city = '';
    if (location) {
        city = location.split(',')[0].trim().toUpperCase();
        // Remove known prefixes if redundant? Usually just "Valencia", "Madrid", etc.
    }

    // 2. Use Level if available
    let lvl = level ? level.toUpperCase() : '';

    // If we have both Level and City, return formatted string
    if (lvl && city) {
        // Clean level nuances if needed (e.g., "AEP 2" -> "AEP2")
        lvl = lvl.replace(/\s+/g, '');
        return `${lvl} ${city}`;
    }

    // Fallback: If no level, try to guess from name or regular format
    let cleanName = name.replace(/Campeonato\s+/i, '').trim();
    if (city) {
        return `${cleanName} ${city}`;
    }

    return cleanName;
};

const getCompetitionColorClass = (level?: string) => {
    const l = level?.toUpperCase() || '';
    if (l.includes('AEP 3')) return 'bg-orange-500';
    if (l.includes('AEP 2')) return 'bg-yellow-500'; // Consider changing text color for contrast if needed
    if (l.includes('AEP 1')) return 'bg-blue-600';
    if (l.includes('NACIONAL')) return 'bg-purple-600';
    if (l.includes('EPF')) return 'bg-green-600';
    if (l.includes('IPF')) return 'bg-[#D4AF37]';
    return 'bg-anvil-red';
};



export function AthleteHome({ user, onNavigate }: AthleteHomeProps) {
    const [loading, setLoading] = useState(true);
    const [activeBlock, setActiveBlock] = useState<TrainingBlock | null>(null);
    const [todaySession, setTodaySession] = useState<ExtendedSession | null>(null);
    const [is1RMCalcOpen, setIs1RMCalcOpen] = useState(false);
    const [isWarmUpCalcOpen, setIsWarmUpCalcOpen] = useState(false);
    const [isPlateCalcOpen, setIsPlateCalcOpen] = useState(false);
    const [isRankingOpen, setIsRankingOpen] = useState(false);
    const [nextCompetition, setNextCompetition] = useState<CompetitionAssignment | null>(null);

    useEffect(() => {
        const fetchHomeData = async () => {
            try {
                setLoading(true);

                // 1. Get Active Block
                const blocks = await trainingService.getBlocksByAthlete(user.id);
                const active = blocks.find(b => b.is_active);

                if (active) {
                    setActiveBlock(active);

                    // 2. Get Sessions for this block
                    const { data: sessData } = await supabase
                        .from('training_sessions')
                        .select(`
                            *,
                            session_exercises (
                                *,
                                exercise:exercise_library (name)
                            )
                        `)
                        .eq('block_id', active.id)
                        .order('day_number', { ascending: true });

                    if (sessData && sessData.length > 0) {
                        // 2.1 Calculate today's workout
                        const today = new Date();
                        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                        const currentDayKey = days[today.getDay()]; // e.g., 'monday'

                        // Priority 1: Match by explicit day_of_week (New Logic)
                        let sessionForToday = sessData.find(s => s.day_of_week === currentDayKey);

                        // Priority 2: Fallback to Date diff if no explicit day set (Legacy Logic)
                        if (!sessionForToday && active.start_date) {
                            const startDate = new Date(active.start_date);
                            // Reset hours
                            startDate.setHours(0, 0, 0, 0);
                            today.setHours(0, 0, 0, 0);

                            const diffTime = today.getTime() - startDate.getTime();
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

                            const todayStr = today.toISOString().split('T')[0];

                            sessionForToday = sessData.find(s =>
                                (s as any).date === todayStr || s.day_number === diffDays
                            );
                        }

                        // 2.2 Fetch next competition
                        const nextComp = await competitionsService.getNextCompetition(user.id);
                        setNextCompetition(nextComp);

                        if (sessionForToday) {
                            setTodaySession(sessionForToday as ExtendedSession);
                        }
                    }
                }
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
        activeBlock,
        todaySession,
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

            {/* Modal Components */}
            <AnvilRanking isOpen={isRankingOpen} onClose={() => setIsRankingOpen(false)} />
            <OneRMCalculator
                isOpen={is1RMCalcOpen}
                onClose={() => setIs1RMCalcOpen(false)}
            />
            <WarmUpCalculator
                isOpen={isWarmUpCalcOpen}
                onClose={() => setIsWarmUpCalcOpen(false)}
            />
            <PlateCalculator
                isOpen={isPlateCalcOpen}
                onClose={() => setIsPlateCalcOpen(false)}
            />
        </>
    );
}

interface HomeViewProps {
    user: UserProfile;
    onNavigate: (view: 'planning' | 'nutrition' | 'competitions' | 'calendar') => void;
    activeBlock: TrainingBlock | null;
    todaySession: ExtendedSession | null;
    setIs1RMCalcOpen: (isOpen: boolean) => void;
    setIsWarmUpCalcOpen: (isOpen: boolean) => void;
    setIsPlateCalcOpen: (isOpen: boolean) => void;
    setIsRankingOpen: (isOpen: boolean) => void;
    nextCompetition: CompetitionAssignment | null;
}

function MobileHome({ user, onNavigate, activeBlock, todaySession, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen, setIsRankingOpen, nextCompetition }: HomeViewProps) {
    return (
        <div className="md:hidden space-y-6 pb-20 p-4">
            {/* Mobile Header */}
            <header>
                <h1 className="text-3xl font-black uppercase tracking-tighter mb-1">
                    {getGreeting()}, <span className="text-anvil-red">{user.full_name?.split(' ')[0] || 'Atleta'}</span>
                </h1>
                <p className="text-gray-400 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                    <Calendar size={14} className="text-anvil-red" />
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </header>

            {/* Mobile Today's Training */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Dumbbell size={16} /> Entrenamiento de hoy
                </h2>
                {todaySession ? (
                    <div
                        onClick={() => onNavigate('planning')}
                        className="bg-[#252525] border border-white/5 rounded-2xl overflow-hidden active:scale-[0.98] transition-transform"
                    >
                        <div className="p-5 flex justify-between items-center bg-gradient-to-r from-anvil-red/10 to-transparent">
                            <div>
                                <h3 className="text-xl font-black uppercase italic mb-1 text-white">
                                    {todaySession.name || `Día ${todaySession.day_number}`}
                                </h3>
                                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">{activeBlock?.name}</p>
                            </div>
                            <div className="bg-white/10 p-2 rounded-full text-white">
                                <ChevronRight size={20} />
                            </div>
                        </div>
                        <div className="p-5 border-t border-white/5">
                            <ul className="space-y-3">
                                {todaySession.exercises?.slice(0, 3).map((ex, i) => (
                                    <li key={i} className="flex items-center gap-3 text-sm">
                                        <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                                            {i + 1}
                                        </span>
                                        <span className="font-bold text-gray-200 truncate">{ex.exercise.name}</span>
                                    </li>
                                ))}
                                {todaySession.exercises && todaySession.exercises.length > 3 && (
                                    <li className="text-gray-500 text-[10px] font-bold uppercase tracking-widest pl-8">
                                        + {todaySession.exercises.length - 3} ejercicios más
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                ) : (
                    <div className="bg-[#252525] border border-white/5 rounded-2xl p-8 text-center space-y-3">
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-600">
                            <Clock size={24} />
                        </div>
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Hoy toca descanso</p>
                        <button
                            onClick={() => onNavigate('calendar')}
                            className="text-anvil-red text-[10px] font-black uppercase tracking-widest"
                        >
                            Ver calendario
                        </button>
                    </div>
                )}
            </div>

            {/* Mobile Anvil Legend (Replaces Coach Note) */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <BookOpen size={16} className="text-yellow-500" /> Anvil Lessons
                </h2>
                <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                    {/* Background Effects */}
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-50"></div>
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

            {/* Mobile Next Competition */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Trophy size={16} className="text-anvil-red" /> Próxima Competición
                </h2>
                {nextCompetition ? (
                    <div className={`${getCompetitionColorClass(nextCompetition.level)} rounded-2xl p-5 text-white flex items-center justify-between relative overflow-hidden active:scale-[0.98] transition-transform shadow-lg`}>
                        <div className="relative z-10">
                            <h3 className="text-lg font-black uppercase italic leading-tight mb-0.5">
                                {formatCompetitionName(nextCompetition.name, nextCompetition.location, nextCompetition.level)}
                            </h3>
                            <div className="flex items-center gap-2 text-xs font-bold opacity-90">
                                <Calendar size={12} />
                                <span>{getDaysRemaining(nextCompetition.date)} días</span>
                            </div>
                        </div>
                        <div className="relative z-10 bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                            <Trophy size={20} />
                        </div>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12"></div>
                    </div>
                ) : (
                    <div className="bg-[#252525] border border-white/5 rounded-2xl p-5 flex items-center justify-between relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-sm font-bold text-gray-400 italic leading-tight">
                                No hay competiciones a la vista.
                            </h3>
                            <p className="text-xs text-anvil-red font-bold mt-1 uppercase tracking-wider">
                                ¡Toca seguir sumando kilos! 🚀
                            </p>
                        </div>
                        <div className="relative z-10 bg-white/5 p-2 rounded-lg grayscale opacity-50">
                            <Trophy size={20} className="text-gray-500" />
                        </div>
                    </div>
                )}
            </div>

            {/* Mobile Tools Grid - Moved DOWN & Vertical Stack */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <FlaskConical size={16} className="text-anvil-red" /> Anvil Lab Tools
                </h2>
                <div className="space-y-4">
                    {/* 1. Plate Calculator */}
                    <div
                        onClick={() => setIsPlateCalcOpen(true)}
                        className="bg-[#252525] border border-white/5 p-4 rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-transform"
                    >
                        <div className="p-3 bg-green-500/10 rounded-xl text-green-500">
                            <Weight size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white uppercase text-sm">Carga de Barra</h3>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Calculadora de Discos</p>
                        </div>
                        <ChevronRight size={18} className="ml-auto text-gray-600" />
                    </div>

                    {/* 2. Warm Up Calculator */}
                    <div
                        onClick={() => setIsWarmUpCalcOpen(true)}
                        className="bg-[#252525] border border-white/5 p-4 rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-transform"
                    >
                        <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                            <List size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white uppercase text-sm">Aproximaciones</h3>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Escalera de Calentamiento</p>
                        </div>
                        <ChevronRight size={18} className="ml-auto text-gray-600" />
                    </div>

                    {/* 3. 1RM Calculator */}
                    <div
                        onClick={() => setIs1RMCalcOpen(true)}
                        className="bg-[#252525] border border-white/5 p-4 rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-transform"
                    >
                        <div className="p-3 bg-anvil-red/10 rounded-xl text-anvil-red">
                            <Calculator size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white uppercase text-sm">Calculadora 1RM</h3>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">RPE & Velocidad</p>
                        </div>
                        <ChevronRight size={18} className="ml-auto text-gray-600" />
                    </div>
                </div>
            </div>

            {/* Mobile Anvil Ranking Club */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Users size={16} className="text-anvil-red" /> Comunidad
                </h2>
                <div
                    onClick={() => setIsRankingOpen(true)}
                    className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 rounded-2xl p-6 relative overflow-hidden group active:scale-[0.98] transition-all"
                >
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                                <Trophy size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black uppercase italic text-white leading-none mb-1">Anvil Ranking</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Club Leaderboard</p>
                            </div>
                        </div>
                        <ChevronRight size={20} className="text-gray-500 group-hover:text-white transition-colors" />
                    </div>
                    {/* Background Pattern */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                </div>
            </div>
        </div>
    );
}

function DesktopHome({ user, onNavigate, activeBlock, todaySession, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen, setIsRankingOpen, nextCompetition }: HomeViewProps) {
    return (
        <div className="hidden md:block p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <header>
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-1">
                    {getGreeting()}, <span className="text-anvil-red">{user.full_name?.split(' ')[0] || 'Atleta'}</span>
                </h1>
                <p className="text-gray-400 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                    <Calendar size={14} className="text-anvil-red" />
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </header>

            {/* Main Grid: Today's Task & Coach Message */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Today's Training Card */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <Dumbbell size={16} /> Entrenamiento de hoy
                    </h2>

                    {todaySession ? (
                        <div
                            onClick={() => onNavigate('planning')}
                            className="bg-[#252525] border border-white/5 rounded-2xl overflow-hidden hover:border-anvil-red/30 transition-all group cursor-pointer active:scale-[0.99] flex-1 flex flex-col h-full"
                        >
                            <div className="p-6 md:p-8 flex justify-between items-center bg-gradient-to-r from-anvil-red/10 to-transparent">
                                <div>
                                    <h3 className="text-2xl md:text-3xl font-black uppercase italic mb-1 group-hover:text-anvil-red transition-colors">
                                        {todaySession.name || `Día ${todaySession.day_number}`}
                                    </h3>
                                    <p className="text-gray-400 text-sm font-bold uppercase tracking-widest">{activeBlock?.name}</p>
                                </div>
                                <div className="bg-white/10 p-3 rounded-full group-hover:bg-anvil-red group-hover:text-white transition-all">
                                    <ChevronRight size={24} />
                                </div>
                            </div>

                            <div className="p-6 md:p-8 border-t border-white/5">
                                <ul className="space-y-4">
                                    {todaySession.exercises?.slice(0, 4).map((ex, i) => (
                                        <li key={i} className="flex items-center gap-4 text-sm md:text-base">
                                            <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                                {i + 1}
                                            </span>
                                            <span className="font-bold text-gray-200">{ex.exercise.name}</span>
                                        </li>
                                    ))}
                                    {todaySession.exercises && todaySession.exercises.length > 4 && (
                                        <li className="text-gray-500 text-xs font-bold uppercase tracking-widest pl-10">
                                            + {todaySession.exercises.length - 4} ejercicios más
                                        </li>
                                    )}
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-[#252525] border border-white/5 rounded-2xl p-12 text-center space-y-4 flex-1 flex flex-col items-center justify-center h-full">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-600">
                                <Clock size={32} />
                            </div>
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Hoy toca descanso</p>
                            <button
                                onClick={() => onNavigate('calendar')}
                                className="text-anvil-red text-xs font-black uppercase tracking-widest hover:underline"
                            >
                                Ver calendario completo
                            </button>
                        </div>
                    )}
                </div>

                {/* Desktop Anvil Legend (Replaces Coach Message) */}
                <div className="space-y-4">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <BookOpen size={16} className="text-yellow-500" /> Anvil Lessons
                    </h2>

                    <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-8 h-fit relative overflow-hidden group hover:border-yellow-500/30 transition-all">
                        {/* Background Effects */}
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-50 group-hover:opacity-80 transition-opacity"></div>
                        <div className="absolute -top-6 -right-6 text-yellow-500/5 rotate-12">
                            <BookOpen size={120} />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center justify-end mb-8">
                                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{new Date().toLocaleDateString('es-ES', { weekday: 'long' })}</span>
                            </div>

                            <p className="text-3xl md:text-4xl font-black uppercase italic text-white leading-none tracking-tighter mb-8 drop-shadow-lg">
                                "{getAnvilQuote()}"
                            </p>

                            <div className="flex items-center justify-between border-t border-white/5 pt-6">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Anvil Strength Club</span>
                                <div className="w-20 h-1 bg-gradient-to-r from-yellow-500 to-transparent rounded-full"></div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats or Promo - NEXT COMPETITION */}
                    <div className="space-y-4">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                            <Trophy size={16} className="text-anvil-red" /> Próxima Competición
                        </h2>
                        {nextCompetition ? (
                            <div className={`${getCompetitionColorClass(nextCompetition.level)} rounded-2xl p-6 text-white flex items-center justify-between group cursor-pointer overflow-hidden relative shadow-lg`}>
                                <div className="relative z-10">
                                    <h3 className="text-xl font-black uppercase italic mb-1">
                                        {formatCompetitionName(nextCompetition.name, nextCompetition.location, nextCompetition.level)}
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs font-bold opacity-90">
                                        <Calendar size={14} />
                                        <span>{getDaysRemaining(nextCompetition.date)} días</span>
                                    </div>
                                </div>
                                <div className="relative z-10 bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                                    <Trophy size={24} />
                                </div>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform"></div>
                            </div>
                        ) : (
                            <div className="bg-[#252525] border border-white/5 rounded-2xl p-6 flex items-center justify-between relative overflow-hidden group">
                                <div className="relative z-10">
                                    <h3 className="text-base font-bold text-gray-400 italic leading-tight mb-1">
                                        Sin competiciones asignadas
                                    </h3>
                                    <p className="text-sm text-anvil-red font-bold uppercase tracking-wider">
                                        ¡Toca seguir sumando kilos! 🚀
                                    </p>
                                </div>
                                <div className="relative z-10 bg-white/5 p-2 rounded-lg grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500">
                                    <Trophy size={24} className="text-gray-500 group-hover:text-anvil-red" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Tools Section */}
            <div className="space-y-4 pt-4">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <FlaskConical size={16} className="text-anvil-red" /> Anvil Lab Tools
                </h2>
                <div className="grid grid-cols-3 gap-6">
                    {/* 1RM Calculator Card */}
                    <div
                        onClick={() => setIs1RMCalcOpen(true)}
                        className="bg-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98]"
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

                    {/* Warm-up Calculator Card */}
                    <div
                        onClick={() => setIsWarmUpCalcOpen(true)}
                        className="bg-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-blue-500/30 transition-all active:scale-[0.98]"
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

                    {/* Plate Calculator Card */}
                    <div
                        onClick={() => setIsPlateCalcOpen(true)}
                        className="bg-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-anvil-red/30 transition-all active:scale-[0.98]"
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

                    {/* Ranking Card - Desktop */}
                    <div
                        onClick={() => setIsRankingOpen(true)}
                        className="bg-gradient-to-r from-[#1c1c1c] to-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-yellow-500/30 transition-all active:scale-[0.98]"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500 group-hover:bg-yellow-500 group-hover:text-black transition-all shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                                <Trophy size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white uppercase tracking-tight text-sm">Anvil Ranking</h3>
                                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Club Leaderboard</p>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>
                </div>
            </div>

        </div>
    );
}
