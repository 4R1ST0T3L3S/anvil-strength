import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock, TrainingSession, SessionExercise } from '../../../types/training';
import {
    Calendar,
    MessageSquare,
    Dumbbell,
    ChevronRight,
    Clock,
    Trophy,
    Star,
    Calculator,
    Zap,
    Activity,
    List,
    Weight
} from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { Loader } from 'lucide-react';
import { OneRMCalculator } from './OneRMCalculator';
import { WarmUpCalculator } from './WarmUpCalculator';
import { PlateCalculator } from './PlateCalculator';

interface AthleteHomeProps {
    user: UserProfile;
    onNavigate: (view: 'planning' | 'nutrition' | 'competitions' | 'calendar') => void;
}

interface ExtendedSession extends TrainingSession {
    exercises: (SessionExercise & { exercise: { name: string } })[];
}

export function AthleteHome({ user, onNavigate }: AthleteHomeProps) {
    const [loading, setLoading] = useState(true);
    const [activeBlock, setActiveBlock] = useState<TrainingBlock | null>(null);
    const [todaySession, setTodaySession] = useState<ExtendedSession | null>(null);
    const [coachInfo, setCoachInfo] = useState<{ full_name: string; avatar_url?: string } | null>(null);
    const [coachMessage, setCoachMessage] = useState<string | null>(null);
    const [is1RMCalcOpen, setIs1RMCalcOpen] = useState(false);
    const [isWarmUpCalcOpen, setIsWarmUpCalcOpen] = useState(false);
    const [isPlateCalcOpen, setIsPlateCalcOpen] = useState(false);

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
                        // 2.1 Calculate today's day number relative to block start
                        const startDate = new Date(active.start_date);
                        const today = new Date();

                        // Reset hours to compare dates only
                        startDate.setHours(0, 0, 0, 0);
                        today.setHours(0, 0, 0, 0);

                        const diffTime = today.getTime() - startDate.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

                        // 2.2 Try to find session for this specific day_number
                        const todayStr = today.toISOString().split('T')[0];

                        const sessionForToday = sessData.find(s =>
                            (s as any).date === todayStr || s.day_number === diffDays
                        );

                        if (sessionForToday) {
                            setTodaySession(sessionForToday as ExtendedSession);

                            // 2.3 Extract coach message from first exercise note if available
                            const firstExWithNote = sessionForToday.session_exercises?.find((ex: any) => ex.notes);
                            if (firstExWithNote) {
                                setCoachMessage(firstExWithNote.notes);
                            }
                        }
                    }

                    // 3. Get Coach Info
                    const { data: coachData } = await supabase
                        .from('profiles')
                        .select('full_name, avatar_url')
                        .eq('id', active.coach_id)
                        .single();

                    if (coachData) setCoachInfo(coachData);
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
        coachInfo,
        coachMessage,
        setIs1RMCalcOpen,
        setIsWarmUpCalcOpen,
        setIsPlateCalcOpen
    };

    return (
        <>
            <MobileHome {...commonProps} />
            <DesktopHome {...commonProps} />

            {/* Modal Components */}
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
    coachInfo: { full_name: string; avatar_url?: string } | null;
    coachMessage: string | null;
    setIs1RMCalcOpen: (isOpen: boolean) => void;
    setIsWarmUpCalcOpen: (isOpen: boolean) => void;
    setIsPlateCalcOpen: (isOpen: boolean) => void;
}

function MobileHome({ user, onNavigate, activeBlock, todaySession, coachInfo, coachMessage, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen }: HomeViewProps) {
    return (
        <div className="md:hidden space-y-6 pb-20 p-4">
            {/* Mobile Header */}
            <header>
                <h1 className="text-3xl font-black uppercase tracking-tighter mb-1">
                    Hola, <span className="text-anvil-red">{user.full_name?.split(' ')[0] || 'Atleta'}</span>
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

            {/* Mobile Coach Note - Moved UP */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <MessageSquare size={16} /> Nota Coach
                </h2>
                <div className="bg-[#252525] border border-white/5 rounded-2xl p-5 relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-anvil-red/30 bg-[#1c1c1c]">
                            {coachInfo?.avatar_url ? (
                                <img src={coachInfo.avatar_url} alt="Coach" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-base font-black text-gray-600 flex items-center justify-center h-full">C</span>
                            )}
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-tighter text-white">Coach {coachInfo?.full_name?.split(' ')[0] || 'Anvil'}</p>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Enviado hoy</p>
                        </div>
                    </div>
                    <p className="text-gray-300 italic text-sm leading-relaxed">
                        {coachMessage ? `"${coachMessage}"` : '"¡A por la sesión de hoy! Mantén el foco."'}
                    </p>
                </div>

                {/* Mobile Next Competition */}
                <div className="bg-anvil-red rounded-2xl p-5 text-white flex items-center justify-between relative overflow-hidden active:scale-[0.98] transition-transform">
                    <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Próxima Competición</p>
                        <p className="text-lg font-black uppercase italic">Copa de España</p>
                    </div>
                    <div className="relative z-10 bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                        <Trophy size={20} />
                    </div>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12"></div>
                </div>
            </div>

            {/* Mobile Tools Grid - Moved DOWN & Vertical Stack */}
            <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Anvil Lab Tools</h2>
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
        </div>
    );
}

function DesktopHome({ user, onNavigate, activeBlock, todaySession, coachInfo, coachMessage, setIs1RMCalcOpen, setIsWarmUpCalcOpen, setIsPlateCalcOpen }: HomeViewProps) {
    return (
        <div className="hidden md:block p-8 space-y-8 animate-in fade-in duration-500">
            {/* Welcome Header */}
            <header>
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-1">
                    Hola, <span className="text-anvil-red">{user.full_name?.split(' ')[0] || 'Atleta'}</span>
                </h1>
                <p className="text-gray-400 font-bold tracking-widest text-xs uppercase flex items-center gap-2">
                    <Calendar size={14} className="text-anvil-red" />
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </header>

            {/* Main Grid: Today's Task & Coach Message */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Today's Training Card - Stretches to match height */}
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

                {/* Coach Message Card */}
                <div className="space-y-4">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                        <MessageSquare size={16} /> Nota del Entrenador
                    </h2>

                    <div className="bg-[#252525] border border-white/5 rounded-2xl p-8 h-fit relative overflow-hidden group">
                        {/* Decorative Quote Mark */}
                        <div className="absolute -top-4 -right-4 text-anvil-red/5 font-black text-9xl italic pointer-events-none">"</div>

                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-anvil-red/30 bg-[#1c1c1c] flex items-center justify-center">
                                {coachInfo?.avatar_url ? (
                                    <img src={coachInfo.avatar_url} alt="Coach" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-lg font-black text-gray-600">C</span>
                                )}
                            </div>
                            <div>
                                <p className="text-sm font-black uppercase tracking-tighter text-white">Coach {coachInfo?.full_name?.split(' ')[0] || 'Anvil'}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Enviado hoy</p>
                            </div>
                        </div>

                        <div className="relative z-10">
                            <p className="text-gray-300 leading-relaxed italic">
                                {coachMessage ? `"${coachMessage}"` : '"¡A por la sesión de hoy! Mantén el foco en la técnica y respeta los tiempos de descanso."'}
                            </p>
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                            <div className="flex gap-1 text-anvil-red">
                                <Star size={14} fill="currentColor" />
                                <Star size={14} fill="currentColor" />
                                <Star size={14} fill="currentColor" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">Feedback pendiente</span>
                        </div>
                    </div>

                    {/* Quick Stats or Promo */}
                    <div className="bg-anvil-red rounded-2xl p-6 text-white flex items-center justify-between group cursor-pointer overflow-hidden relative">
                        <div className="relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Próxima Competición</p>
                            <p className="text-xl font-black uppercase italic">Copa de España</p>
                        </div>
                        <div className="relative z-10 bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                            <Trophy size={24} />
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform"></div>
                    </div>
                </div>
            </div>

            {/* Quick Tools Section */}
            <div className="space-y-4 pt-4">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Anvil Lab Tools</h2>
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
                </div>
            </div>

        </div>
    );
}
