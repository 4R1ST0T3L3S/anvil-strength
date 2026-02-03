import { useState, useEffect } from 'react';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock, TrainingSession } from '../../../types/training';
import { Loader, Calendar, ChevronRight } from 'lucide-react';
import { AthleteSessionView } from './AthleteSessionView';

interface AthleteTrainingPlanProps {
    userId: string;
}

interface TrainingBlockWithSessions extends TrainingBlock {
    training_sessions?: TrainingSession[];
}

export function AthleteTrainingPlan({ userId }: AthleteTrainingPlanProps) {
    const [activeBlock, setActiveBlock] = useState<TrainingBlockWithSessions | null>(null);
    const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchActiveBlock = async () => {
            try {
                // Fetch all blocks and find the active one
                // Optimally this should be a specific query but filtering locally works for now
                const blocks = await trainingService.getBlocksByAthlete(userId);
                const active = blocks.find(b => b.is_active);

                if (active) {
                    // Fetch full block details including sessions
                    // The service getBlocksByAthlete mostly returns light objects, 
                    // but for the athlete view we want the sessions immediately if possible.
                    // If not included, we might needed 'getSessionsByBlock'
                    // Let's assume we need to fetch sessions separately if not present
                    const sessions = await trainingService.getSessionsByBlock(active.id);
                    setActiveBlock({ ...active, training_sessions: sessions }); // Manual hydration if needed
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchActiveBlock();
    }, [userId]);

    if (loading) return <div className="flex justify-center p-12"><Loader className="animate-spin text-anvil-red" /></div>;

    // View: Session Detail
    if (selectedSession) {
        return (
            <AthleteSessionView
                session={selectedSession}
                onBack={() => setSelectedSession(null)}
            />
        );
    }

    // View: Block Overview
    if (!activeBlock) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <Calendar size={48} className="text-gray-600 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Sin Planificación Activa</h2>
                <p className="text-gray-400 max-w-sm">
                    Tu entrenador aún no ha activado un mesociclo para ti. ¡Relájate y espera instrucciones!
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            <header>
                <span className="text-anvil-red text-xs font-bold uppercase tracking-wider">Mesociclo Activo</span>
                <h1 className="text-3xl font-black uppercase text-white leading-tight mt-1">
                    {activeBlock.name}
                </h1>
                <p className="text-gray-400 text-sm mt-2">
                    {activeBlock.start_date ? new Date(activeBlock.start_date).toLocaleDateString() : 'Fecha inicio por definir'} - {activeBlock.end_date ? new Date(activeBlock.end_date).toLocaleDateString() : 'Fecha fin por definir'}
                </p>
            </header>

            <div className="grid gap-3">
                {activeBlock.training_sessions?.sort((a, b) => a.day_number - b.day_number).map((session) => (
                    <div
                        key={session.id}
                        onClick={() => setSelectedSession(session)}
                        className="bg-[#252525] p-5 rounded-xl border border-white/5 hover:border-anvil-red/50 hover:bg-[#2a2a2a] transition-all cursor-pointer group flex items-center justify-between"
                    >
                        <div>
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                                Día {session.day_number}
                            </span>
                            <h3 className="text-xl font-bold text-white group-hover:text-anvil-red transition-colors">
                                {session.name || `Entrenamiento ${session.day_number}`}
                            </h3>
                        </div>
                        <ChevronRight className="text-gray-600 group-hover:text-white transition-colors" />
                    </div>
                ))}

                {(!activeBlock.training_sessions || activeBlock.training_sessions.length === 0) && (
                    <div className="p-4 bg-yellow-500/10 text-yellow-500 rounded-lg text-sm border border-yellow-500/20">
                        Este bloque está activo pero no tiene sesiones configuradas.
                    </div>
                )}
            </div>
        </div>
    );
}
