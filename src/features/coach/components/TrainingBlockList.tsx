import { useEffect, useState } from 'react';
import { Plus, FolderOpen, Calendar, ChevronRight, Loader } from 'lucide-react';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock } from '../../../types/training';
import { CreateBlockModal } from './CreateBlockModal';

interface TrainingBlockListProps {
    athleteId: string;
    onSelectBlock: (block: TrainingBlock) => void;
}

export function TrainingBlockList({ athleteId, onSelectBlock }: TrainingBlockListProps) {
    const [blocks, setBlocks] = useState<TrainingBlock[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const fetchBlocks = async () => {
        try {
            setLoading(true);
            const data = await trainingService.getBlocksByAthlete(athleteId);
            setBlocks(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBlocks();
    }, [athleteId]);

    const formatDate = (dateStr?: string | null) => {
        if (!dateStr) return 'Sin fecha';
        return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader className="text-anvil-red animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white uppercase tracking-tight">Mesociclos</h3>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-gray-200 transition-colors"
                >
                    <Plus size={16} />
                    Nuevo Bloque
                </button>
            </div>

            {blocks.length === 0 ? (
                <div className="bg-[#252525] border border-white/5 rounded-xl p-12 text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FolderOpen className="text-gray-500" size={32} />
                    </div>
                    <h4 className="text-white font-bold mb-2">No hay planificaciones</h4>
                    <p className="text-gray-400 text-sm mb-6">
                        Comienza creando el primer bloque de entrenamiento para este atleta.
                    </p>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="text-anvil-red text-sm font-bold uppercase tracking-widest hover:text-red-400 transition-colors"
                    >
                        Crear ahora &rarr;
                    </button>
                </div>
            ) : (
                <div className="grid gap-3">
                    {blocks.map((block) => (
                        <div
                            key={block.id}
                            className={`group relative bg-[#1c1c1c] border p-5 rounded-xl transition-all duration-300 hover:border-anvil-red/50 cursor-pointer ${block.is_active ? 'border-l-4 border-l-anvil-red border-y-white/5 border-r-white/5' : 'border-white/5'
                                }`}
                            onClick={() => onSelectBlock(block)}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h4 className="text-lg font-bold text-white group-hover:text-anvil-red transition-colors">
                                            {block.name}
                                        </h4>
                                        {block.is_active && (
                                            <span className="bg-anvil-red/20 text-anvil-red text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                                Activo
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-gray-500 font-medium uppercase tracking-wider">
                                        <span className="flex items-center gap-1">
                                            <Calendar size={12} />
                                            {formatDate(block.start_date)} - {formatDate(block.end_date)}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-gray-600 group-hover:text-white transition-colors">
                                    <ChevronRight size={20} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <CreateBlockModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                athleteId={athleteId}
                onBlockCreated={fetchBlocks}
            />
        </div>
    );
}
