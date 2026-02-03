import { useEffect, useState } from 'react';
import { ArrowLeft, Loader } from 'lucide-react';
import { trainingService } from '../../../services/trainingService';
import { TrainingSession, SessionExercise } from '../../../types/training';
import { AthleteSetLogger } from './AthleteSetLogger';

interface AthleteSessionViewProps {
    session: TrainingSession;
    onBack: () => void;
}

export function AthleteSessionView({ session, onBack }: AthleteSessionViewProps) {
    const [exercises, setExercises] = useState<SessionExercise[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchExercises = async () => {
            try {
                setLoading(true);
                const data = await trainingService.getSessionExercises(session.id);
                setExercises(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchExercises();
    }, [session.id]);

    return (
        <div className="flex flex-col h-full bg-[#1c1c1c]">
            {/* Navbar */}
            <div className="sticky top-0 z-20 bg-[#1c1c1c]/95 backdrop-blur border-b border-white/5 p-4 flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2 -ml-2 hover:bg-white/10 rounded-full text-white transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <span className="text-anvil-red text-xs font-bold uppercase tracking-wider block">
                        Día {session.day_number}
                    </span>
                    <h1 className="text-xl font-black uppercase text-white leading-none">
                        {session.name || 'Entrenamiento'}
                    </h1>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader className="text-anvil-red animate-spin" />
                    </div>
                ) : exercises.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <p>No hay ejercicios programados para hoy.</p>
                        <p className="text-xs mt-2">¡Día de descanso! 🎉</p>
                    </div>
                ) : (
                    exercises.map((item, index) => (
                        <div key={item.id} className="bg-[#252525] border border-white/5 rounded-2xl overflow-hidden shadow-lg">
                            {/* Exercise Header */}
                            <div className="p-5 bg-black/20 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-anvil-red text-black font-bold flex items-center justify-center text-sm shadow-[0_0_10px_rgba(222,50,50,0.4)]">
                                        {index + 1}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white leading-tight">
                                            {item.exercise?.name}
                                        </h2>
                                        {item.exercise?.muscle_group && (
                                            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-0.5">
                                                {item.exercise.muscle_group}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Logger */}
                            <div className="p-2">
                                <AthleteSetLogger sessionExerciseId={item.id} />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
