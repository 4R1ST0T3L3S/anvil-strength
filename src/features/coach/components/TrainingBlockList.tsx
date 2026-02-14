import { useEffect, useState, useCallback } from 'react';
import { Plus, FolderOpen, Calendar, ChevronRight, Loader, Trash2, AlertTriangle, Pencil } from 'lucide-react';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock } from '../../../types/training';
import { CreateBlockModal } from './CreateBlockModal';
import { EditBlockModal } from './EditBlockModal';
import { getDateRangeFromWeek, formatDateRange } from '../../../utils/dateUtils';
import { toast } from 'sonner';

interface TrainingBlockListProps {
    athleteId: string;
    onSelectBlock: (block: TrainingBlock) => void;
}

export function TrainingBlockList({ athleteId, onSelectBlock }: TrainingBlockListProps) {
    const [blocks, setBlocks] = useState<TrainingBlock[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Delete Confirmation State
    const [blockToDelete, setBlockToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Edit Modal State
    const [blockToEdit, setBlockToEdit] = useState<TrainingBlock | null>(null);

    const fetchBlocks = useCallback(async () => {
        try {
            setLoading(true);
            const data = await trainingService.getBlocksByAthlete(athleteId);
            setBlocks(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [athleteId]);

    useEffect(() => {
        fetchBlocks();
    }, [athleteId, fetchBlocks]);

    const handleDeleteClick = (e: React.MouseEvent, blockId: string) => {
        e.stopPropagation(); // Prevent navigating to the block
        setBlockToDelete(blockId);
    };

    const confirmDelete = async () => {
        if (!blockToDelete) return;
        setIsDeleting(true);
        try {
            await trainingService.deleteBlock(blockToDelete);
            toast.success('Bloque eliminado correctamente');
            fetchBlocks();
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar el bloque');
        } finally {
            setIsDeleting(false);
            setBlockToDelete(null);
        }
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
            <div className="px-6 py-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <h2 className="text-5xl md:text-6xl font-black text-white italic tracking-tighter uppercase leading-[0.9]">
                            Bloques
                        </h2>
                        <div className="h-2 w-24 bg-anvil-red mt-4 rounded-full" />
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-lg text-sm font-black uppercase tracking-wider hover:bg-gray-200 transition-all hover:scale-105"
                    >
                        <Plus size={18} />
                        Nuevo Bloque
                    </button>
                </div>
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
                <div className="grid gap-4">
                    {blocks.map((block) => {
                        const isActive = block.is_active;

                        return (
                            <div
                                key={block.id}
                                className={`group relative bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden transition-all duration-300 hover:border-anvil-red/30 cursor-pointer ${isActive ? 'ring-1 ring-anvil-red/30' : ''
                                    }`}
                                onClick={() => onSelectBlock(block)}
                            >
                                <div className="px-6 py-5 flex items-center justify-between transition-all duration-300 group-hover:bg-white/5">
                                    <div className="flex items-center gap-6">
                                        {/* Status Badge */}
                                        <div className={`px-3 py-1 rounded-md text-[10px] font-black tracking-wider border ${isActive
                                            ? "bg-anvil-red/10 text-anvil-red border-anvil-red/20"
                                            : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                                            }`}>
                                            {isActive ? 'ACTIVO' : 'HISTÓRICO'}
                                        </div>

                                        {/* Title & info */}
                                        <div className="flex flex-col gap-1">
                                            <h4 className="text-2xl font-black text-white italic tracking-tighter uppercase group-hover:text-anvil-red transition-colors">
                                                {block.name}
                                            </h4>

                                            <div className="flex items-center gap-4 text-xs text-gray-500 font-medium uppercase tracking-wider">
                                                <span className="flex items-center gap-2">
                                                    <Calendar size={12} />
                                                    Semana {block.start_week || '?'} - {block.end_week || '?'}
                                                </span>
                                                {block.start_week && block.end_week && (
                                                    <>
                                                        <span className="w-1 h-1 rounded-full bg-gray-700" />
                                                        <span className="text-gray-600 normal-case">
                                                            {formatDateRange(getDateRangeFromWeek(block.start_week).start, getDateRangeFromWeek(block.end_week).end)}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setBlockToEdit(block);
                                            }}
                                            className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                            title="Editar bloque"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteClick(e, block.id)}
                                            className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                            title="Eliminar bloque"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                        <div className="text-gray-600 group-hover:text-white transition-colors ml-2">
                                            <ChevronRight size={20} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <CreateBlockModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                athleteId={athleteId}
                onBlockCreated={fetchBlocks}
            />

            <EditBlockModal
                isOpen={blockToEdit !== null}
                onClose={() => setBlockToEdit(null)}
                block={blockToEdit}
                onBlockUpdated={fetchBlocks}
            />

            {/* DELETE CONFIRMATION MODAL */}
            {blockToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#1c1c1c] border border-white/10 rounded-xl max-w-sm w-full p-6 shadow-2xl">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className="text-lg font-black uppercase text-white mb-2">¿Eliminar Bloque?</h3>
                            <p className="text-gray-400 text-sm">
                                Esta acción eliminará permanentemente el bloque y <span className="text-white font-bold">todas sus sesiones y registros</span>. No se puede deshacer.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setBlockToDelete(null)}
                                className="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-bold uppercase text-xs tracking-wider transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"
                            >
                                {isDeleting ? <Loader size={14} className="animate-spin" /> : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
