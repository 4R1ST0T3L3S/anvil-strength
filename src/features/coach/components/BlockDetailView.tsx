import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Calendar, Plus, Dumbbell, MoreVertical } from 'lucide-react';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock, TrainingSession } from '../../../types/training';
import { CreateSessionModal } from './CreateSessionModal';
import { Loader } from 'lucide-react';

interface BlockDetailViewProps {
    block: TrainingBlock;
    onBack: () => void;
    onSelectSession: (session: TrainingSession) => void;
}

export function BlockDetailView({ block, onBack, onSelectSession }: BlockDetailViewProps) {
    const [sessions, setSessions] = useState<TrainingSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateSessionModalOpen, setIsCreateSessionModalOpen] = useState(false);

    const fetchSessions = useCallback(async () => {
        try {
            setLoading(true);
            const data = await trainingService.getSessionsByBlock(block.id);
            setSessions(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [block.id]);

    useEffect(() => {
        fetchSessions();
    }, [block.id, fetchSessions]);

    const formatDate = (dateStr?: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };

    return (
        <div className="flex flex-col h-full bg-[#1c1c1c]">
            {/* Header */}
            <div className="border-b border-white/5 bg-[#252525] p-6">
                <div className="flex items-center gap-4 mb-4">
                    <button
                        onClick={onBack}
                        className="p-2 -ml-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-black uppercase text-white tracking-tight leading-none">
                                {block.name}
                            </h2>
                            {block.is_active && (
                                <span className="bg-anvil-red/20 text-anvil-red text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                    Activo
                                </span>
                            )}
                        </div>
                        <p className="text-gray-400 text-sm mt-1 flex items-center gap-2">
                            <Calendar size={14} />
                            {formatDate(block.start_date)} - {formatDate(block.end_date)}
                        </p>
                    </div>
                </div>

                {/* Microcycle Stats (Placeholder) */}
                <div className="flex gap-8 text-sm">
                    <div>
                        <span className="block text-gray-500 text-xs font-bold uppercase">Días / S</span>
                        <span className="text-white font-bold text-lg">{sessions.length}</span>
                    </div>
                    <div>
                        <span className="block text-gray-500 text-xs font-bold uppercase">Volumen</span>
                        <span className="text-white font-bold text-lg">-</span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">

                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">Estructura semanal</h3>
                    <button
                        onClick={() => setIsCreateSessionModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-gray-200 transition-colors"
                    >
                        <Plus size={16} />
                        Añadir Día
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader className="text-anvil-red animate-spin" />
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-xl">
                        <p className="text-gray-500 mb-4">No hay días de entrenamiento definidos.</p>
                        <button
                            onClick={() => setIsCreateSessionModalOpen(true)}
                            className="text-anvil-red font-bold uppercase tracking-wider text-sm hover:underline"
                        >
                            Crear Día 1
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className="group bg-[#252525] border border-white/5 rounded-xl p-4 hover:border-anvil-red/30 transition-all cursor-pointer"
                                onClick={() => onSelectSession(session)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-black/40 rounded-lg flex flex-col items-center justify-center border border-white/5 text-center">
                                            <span className="text-[10px] text-gray-500 font-bold uppercase">Día</span>
                                            <span className="text-xl font-black text-white leading-none">{session.day_number}</span>
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold uppercase tracking-wider text-lg">
                                                {session.name || `Entrenamiento Día ${session.day_number}`}
                                            </h4>
                                            <p className="text-xs text-gray-500 flex items-center gap-1.5">
                                                <Dumbbell size={12} />
                                                0 Ejercicios
                                            </p>
                                        </div>
                                    </div>

                                    <button className="text-gray-600 hover:text-white transition-colors p-2">
                                        <MoreVertical size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <CreateSessionModal
                isOpen={isCreateSessionModalOpen}
                onClose={() => setIsCreateSessionModalOpen(false)}
                blockId={block.id}
                existingSessions={sessions}
                onSessionCreated={fetchSessions}
            />
        </div>
    );
}
