import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, MoreVertical } from 'lucide-react';
import { trainingService } from '../../../services/trainingService';
import { TrainingSession, SessionExercise } from '../../../types/training';
import { AddExerciseModal } from './AddExerciseModal';
import { ExerciseSetsManager } from './ExerciseSetsManager';
import { Loader } from 'lucide-react';

interface SessionDetailViewProps {
    session: TrainingSession;
    onBack: () => void;
}

export function SessionDetailView({ session, onBack }: SessionDetailViewProps) {
    const [exercises, setExercises] = useState<SessionExercise[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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

    useEffect(() => {
        fetchExercises();
    }, [session.id]);

    return (
        <div className="flex flex-col h-full bg-[#1c1c1c]">
            {/* Header */}
            <div className="border-b border-white/5 bg-[#252525] p-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 -ml-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="bg-white/10 text-white text-xs font-black px-2 py-1 rounded uppercase tracking-wider">
                                Día {session.day_number}
                            </span>
                        </div>
                        <h2 className="text-xl font-black uppercase text-white tracking-tight leading-none mt-1">
                            {session.name || `Entrenamiento Día ${session.day_number}`}
                        </h2>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">

                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">Ejercicios</h3>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-gray-200 transition-colors"
                    >
                        <Plus size={16} />
                        Añadir Ejercicio
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader className="text-anvil-red animate-spin" />
                    </div>
                ) : exercises.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-xl">
                        <p className="text-gray-500 mb-4">No hay ejercicios para este día.</p>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="text-anvil-red font-bold uppercase tracking-wider text-sm hover:underline"
                        >
                            Buscar en librería
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {exercises.map((item, index) => (
                            <div
                                key={item.id}
                                className="bg-[#252525] border border-white/5 rounded-xl overflow-hidden"
                            >
                                {/* Exercise Header */}
                                <div className="p-4 flex items-center justify-between bg-black/20">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-xs font-bold text-gray-400">
                                            {index + 1}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-lg leading-tight">
                                                {item.exercise?.name || 'Ejercicio desconocido'}
                                            </h4>
                                            {item.exercise?.muscle_group && (
                                                <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">
                                                    {item.exercise.muscle_group}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button className="text-gray-600 hover:text-white transition-colors p-2">
                                        <MoreVertical size={18} />
                                    </button>
                                </div>

                                {/* Sets Manager */}
                                <div className="border-t border-white/5">
                                    <ExerciseSetsManager sessionExerciseId={item.id} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <AddExerciseModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                sessionId={session.id}
                currentExerciseCount={exercises.length}
                onExerciseAdded={fetchExercises}
            />
        </div>
    );
}
