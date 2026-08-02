import { useEffect, useState, useCallback } from 'react';
import { Plus, FolderOpen, Calendar, ChevronRight, Loader, Trash2, AlertTriangle, Pencil, TrendingUp, Layers, Trophy, X, Folder, Copy } from 'lucide-react';
import { DuplicateBlockModal } from './DuplicateBlockModal';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock, Macrocycle } from '../../../types/training';
import { CreateBlockModal } from './CreateBlockModal';
import { EditBlockModal } from './EditBlockModal';
import { AthleteStatsModal } from './AthleteStatsModal';
import { getDateRangeFromWeek, formatDateRange } from '../../../utils/dateUtils';
import { competitionsService, CompetitionAssignment } from '../../../services/competitionsService';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'sonner';

interface TrainingBlockListProps {
    athleteId: string;
    athleteName?: string;
    onSelectBlock: (block: TrainingBlock) => void;
}

export function TrainingBlockList({ athleteId, athleteName, onSelectBlock }: TrainingBlockListProps) {
    const { session } = useAuth();
    const [blocks, setBlocks] = useState<TrainingBlock[]>([]);
    const [macros, setMacros] = useState<Macrocycle[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isStatsOpen, setIsStatsOpen] = useState(false);
    const [isCreateMacroOpen, setIsCreateMacroOpen] = useState(false);
    // Bloque cuyo selector de macro está abierto
    const [macroPickerBlockId, setMacroPickerBlockId] = useState<string | null>(null);

    // Delete Confirmation State
    const [blockToDelete, setBlockToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Edit Modal State
    const [blockToEdit, setBlockToEdit] = useState<TrainingBlock | null>(null);
    // Bloque que se está copiando a otros atletas
    const [blockToDuplicate, setBlockToDuplicate] = useState<TrainingBlock | null>(null);

    const fetchBlocks = useCallback(async () => {
        try {
            setLoading(true);
            const [blocksData, macrosData] = await Promise.all([
                trainingService.getBlocksByAthlete(athleteId),
                trainingService.getMacrosByAthlete(athleteId).catch(() => [] as Macrocycle[])
            ]);
            setBlocks(blocksData);
            setMacros(macrosData);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [athleteId]);

    useEffect(() => {
        fetchBlocks();
    }, [athleteId, fetchBlocks]);

    const handleAssignMacro = async (blockId: string, macroId: string | null) => {
        setMacroPickerBlockId(null);
        try {
            await trainingService.assignBlockToMacro(blockId, macroId);
            setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, macro_id: macroId } : b));
            toast.success(macroId ? 'Bloque añadido al macro' : 'Bloque sacado del macro');
        } catch (e) {
            console.error(e);
            toast.error('Error asignando el macro');
        }
    };

    const handleDeleteMacro = async (macroId: string) => {
        try {
            await trainingService.deleteMacro(macroId);
            setMacros(prev => prev.filter(m => m.id !== macroId));
            setBlocks(prev => prev.map(b => b.macro_id === macroId ? { ...b, macro_id: null } : b));
            toast.success('Macro eliminado (los bloques se conservan)');
        } catch (e) {
            console.error(e);
            toast.error('Error eliminando el macro');
        }
    };

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



    const renderBlockCard = (block: TrainingBlock) => {
        const isActive = block.is_active;
        return (
            <div
                key={block.id}
                className={`group relative bg-surface-canvas border border-subtle rounded-card transition-all duration-base hover:border-anvil-red/30 cursor-pointer ${isActive ? 'ring-1 ring-anvil-red/30' : ''}`}
                onClick={() => onSelectBlock(block)}
            >
                {/* En movil la tarjeta es de DOS filas y no de una.
                    Con una sola, el titulo, el estado y los cinco controles
                    competian por 375px: los botones se salian de la pantalla y
                    el nombre del bloque se quedaba en tres letras. */}
                <div className="flex flex-col gap-3 rounded-card px-4 py-4 transition-all duration-base group-hover:bg-white/5 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:py-5">
                    <div className="flex min-w-0 items-center gap-3 md:gap-6">
                        {/* Status Badge */}
                        <div className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider border shrink-0 ${isActive
                            ? "bg-anvil-red/10 text-anvil-red border-anvil-red/20"
                            : "bg-gray-500/10 text-ink-subtle border-gray-500/20"
                            }`}>
                            {isActive ? 'ACTIVO' : 'HISTÓRICO'}
                        </div>

                        {/* Title & info */}
                        <div className="flex min-w-0 flex-col gap-1">
                            <h4 className="truncate text-lg font-black uppercase italic tracking-tighter text-white transition-colors group-hover:text-anvil-red md:text-2xl">
                                {block.name}
                            </h4>

                            <div className="flex items-center gap-2 truncate text-xs font-medium uppercase tracking-wider text-ink-subtle md:gap-4">
                                <span className="flex shrink-0 items-center gap-2">
                                    <Calendar size={12} />
                                    Semana {block.start_week || '?'} - {block.end_week || '?'}
                                </span>
                                {block.start_week && block.end_week && (
                                    <>
                                        <span className="hidden h-1 w-1 shrink-0 rounded-full bg-gray-700 sm:block" />
                                        <span className="hidden truncate normal-case text-ink-subtle sm:block">
                                            {formatDateRange(getDateRangeFromWeek(block.start_week).start, getDateRangeFromWeek(block.end_week).end)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="relative flex shrink-0 items-center justify-end gap-1 md:gap-2">
                        {/* Asignar a macro */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setMacroPickerBlockId(macroPickerBlockId === block.id ? null : block.id);
                            }}
                            className={`p-2 rounded-lg transition-colors ${macroPickerBlockId === block.id ? 'text-anvil-red bg-anvil-red/10' : 'text-ink-subtle hover:text-white hover:bg-white/10'}`}
                            title="Asignar a un macro"
                        >
                            <Folder size={18} />
                        </button>
                        {/* Copiar a otros atletas. Es la acción que más
                            tiempo ahorra de toda la pantalla: un club
                            programa por grupos y sin esto el mismo bloque se
                            construye a mano una vez por atleta. */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setBlockToDuplicate(block);
                            }}
                            className="rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-surface-overlay hover:text-ink active:scale-95"
                            title="Copiar este bloque a otros atletas"
                        >
                            <Copy size={18} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setBlockToEdit(block);
                            }}
                            className="p-2 text-ink-subtle hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            title="Editar bloque"
                        >
                            <Pencil size={18} />
                        </button>
                        <button
                            onClick={(e) => handleDeleteClick(e, block.id)}
                            className="p-2 text-ink-subtle hover:text-danger hover:bg-[var(--danger-quiet)] rounded-lg transition-colors"
                            title="Eliminar bloque"
                        >
                            <Trash2 size={18} />
                        </button>
                        {/* La flecha sobra en movil: la tarjeta entera ya es
                            pulsable y ahi cada pixel de ancho cuenta. */}
                        <div className="ml-1 hidden text-ink-subtle transition-colors group-hover:text-white md:block">
                            <ChevronRight size={20} />
                        </div>

                        {/* Popover: elegir macro */}
                        {macroPickerBlockId === block.id && (
                            <div
                                className="absolute right-0 top-full mt-2 z-30 bg-surface-raised border border-[var(--border-default)] rounded-xl shadow-2xl p-3 w-60"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <p className="text-[10px] font-black uppercase tracking-wider text-ink-subtle mb-2">Mover a macro...</p>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {macros.length === 0 && (
                                        <p className="text-xs text-ink-subtle italic px-2 py-1">No hay macros. Crea uno con "Nuevo Macro".</p>
                                    )}
                                    {macros.map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => handleAssignMacro(block.id, m.id)}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${block.macro_id === m.id ? 'bg-anvil-red/20 text-anvil-red' : 'text-ink-muted hover:bg-anvil-red hover:text-white'}`}
                                        >
                                            {m.name}
                                        </button>
                                    ))}
                                    {block.macro_id && (
                                        <button
                                            onClick={() => handleAssignMacro(block.id, null)}
                                            className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-ink-subtle hover:bg-white/5 hover:text-white transition-colors"
                                        >
                                            Quitar del macro
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
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
            <div className="px-1 py-6 md:px-6 md:py-8">
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end md:gap-6">
                    <div>
                        <h2 className="text-4xl font-black uppercase italic leading-[0.9] tracking-tighter text-white md:text-6xl">
                            Bloques
                        </h2>
                        <div className="mt-3 h-1.5 w-20 rounded-full bg-anvil-red md:mt-4 md:h-2 md:w-24" />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => setIsStatsOpen(true)}
                            className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-[var(--border-default)] text-ink-muted hover:text-white hover:border-anvil-red/40 rounded-lg text-sm font-black uppercase tracking-wider transition-all"
                        >
                            <TrendingUp size={16} className="text-anvil-red" />
                            Estadísticas
                        </button>
                        <button
                            onClick={() => setIsCreateMacroOpen(true)}
                            className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-[var(--border-default)] text-ink-muted hover:text-white hover:border-anvil-red/40 rounded-lg text-sm font-black uppercase tracking-wider transition-all"
                        >
                            <Layers size={16} className="text-anvil-red" />
                            Nuevo Macro
                        </button>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-lg text-sm font-black uppercase tracking-wider hover:bg-gray-200 transition-all hover:scale-105"
                        >
                            <Plus size={18} />
                            Nuevo Bloque
                        </button>
                    </div>
                </div>
            </div>

            {/* El estado vacío exige que NO haya ni bloques ni macros.
                Antes bastaba con `blocks.length === 0`, así que un macrociclo
                recién creado desaparecía de la pantalla hasta que se le metía
                dentro un bloque: existía en la base, pero la rama del estado
                vacío se comía todo el listado. */}
            {blocks.length === 0 && macros.length === 0 ? (
                <div className="bg-surface-raised border border-subtle rounded-xl p-12 text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FolderOpen className="text-ink-subtle" size={32} />
                    </div>
                    <h4 className="text-white font-bold mb-2">No hay planificaciones</h4>
                    <p className="text-ink-muted text-sm mb-6">
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
                <div className="space-y-8">
                    {/* Macros con sus bloques */}
                    {macros.map(macro => {
                        const macroBlocks = blocks.filter(b => b.macro_id === macro.id);
                        return (
                            <div key={macro.id} className="border border-[var(--border-default)] rounded-3xl p-4 md:p-5 bg-white/[0.02]">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-1">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="p-2 bg-anvil-red/10 border border-anvil-red/30 rounded-xl text-anvil-red shrink-0">
                                            <Layers size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-black text-white uppercase italic tracking-tight truncate">{macro.name}</h3>
                                            {macro.competition_name && (
                                                <p className="text-[11px] font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Trophy size={11} />
                                                    {macro.competition_name}
                                                    {macro.competition_date && (
                                                        <span className="text-ink-subtle">
                                                            · {new Date(macro.competition_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteMacro(macro.id)}
                                        className="p-2 text-ink-subtle hover:text-danger hover:bg-[var(--danger-quiet)] rounded-lg transition-colors"
                                        title="Eliminar macro (los bloques se conservan)"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                                {macroBlocks.length === 0 ? (
                                    <p className="text-xs text-ink-subtle italic px-1 pb-2">Sin bloques. Usa el icono de carpeta de un bloque para añadirlo aquí.</p>
                                ) : (
                                    <div className="grid gap-3">
                                        {macroBlocks.map(block => renderBlockCard(block))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Bloques sin macro */}
                    {(() => {
                        const ungrouped = blocks.filter(b => !b.macro_id || !macros.some(m => m.id === b.macro_id));
                        if (ungrouped.length === 0) return null;
                        return (
                            <div>
                                {macros.length > 0 && (
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-subtle mb-3 px-1">Sin macro</p>
                                )}
                                <div className="grid gap-4">
                                    {ungrouped.map(block => renderBlockCard(block))}
                                </div>
                            </div>
                        );
                    })()}
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

            <DuplicateBlockModal
                key={blockToDuplicate?.id ?? 'sin-bloque'}
                open={blockToDuplicate !== null}
                onClose={() => setBlockToDuplicate(null)}
                block={blockToDuplicate}
                coachId={session?.user?.id ?? ''}
                currentAthleteId={athleteId}
            />

            <AthleteStatsModal
                isOpen={isStatsOpen}
                onClose={() => setIsStatsOpen(false)}
                athleteId={athleteId}
                athleteName={athleteName || 'Atleta'}
            />

            {isCreateMacroOpen && session?.user.id && (
                <CreateMacroModal
                    athleteId={athleteId}
                    coachId={session.user.id}
                    onClose={() => setIsCreateMacroOpen(false)}
                    onCreated={(macro) => {
                        setMacros(prev => [macro, ...prev]);
                        setIsCreateMacroOpen(false);
                    }}
                />
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {blockToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-surface-canvas border border-[var(--border-default)] rounded-xl max-w-sm w-full p-6 shadow-2xl">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-12 h-12 bg-[var(--danger-quiet)] text-danger rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className="text-lg font-black uppercase text-white mb-2">¿Eliminar Bloque?</h3>
                            <p className="text-ink-muted text-sm">
                                Esta acción eliminará permanentemente el bloque y <span className="text-white font-bold">todas sus sesiones y registros</span>. No se puede deshacer.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setBlockToDelete(null)}
                                className="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-ink-muted font-bold uppercase text-xs tracking-wider transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"
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

// ==========================================
// SUB-COMPONENT: CREATE MACRO MODAL
// ==========================================
function CreateMacroModal({
    athleteId,
    coachId,
    onClose,
    onCreated
}: {
    athleteId: string;
    coachId: string;
    onClose: () => void;
    onCreated: (macro: Macrocycle) => void;
}) {
    const [name, setName] = useState('');
    const [competitions, setCompetitions] = useState<CompetitionAssignment[]>([]);
    const [selectedCompId, setSelectedCompId] = useState<string>('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        competitionsService.getAthleteCompetitions(athleteId)
            .then(comps => setCompetitions(comps || []))
            .catch(() => setCompetitions([]));
    }, [athleteId]);

    const handleCreate = async () => {
        if (!name.trim() || saving) return;
        setSaving(true);
        try {
            const comp = competitions.find(c => c.id === selectedCompId);
            const macro = await trainingService.createMacro({
                coach_id: coachId,
                athlete_id: athleteId,
                name: name.trim(),
                competition_name: comp?.name || null,
                competition_date: comp?.date || null
            });
            toast.success('Macro creado');
            onCreated(macro);
        } catch (e) {
            console.error(e);
            toast.error('Error creando el macro (¿ejecutaste la migración SQL?)');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface-canvas w-full max-w-md rounded-card border border-[var(--border-default)] shadow-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black uppercase text-white flex items-center gap-2">
                        <Layers className="text-anvil-red" size={20} /> Nuevo Macro
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-ink-muted hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-subtle block">Nombre</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={120}
                        autoFocus
                        placeholder="Ej: Preparación Nacional 2027"
                        className="w-full bg-surface-sunken border border-[var(--border-default)] rounded-xl py-3 px-4 text-white text-sm font-bold focus:outline-none focus:border-anvil-red/50 transition-colors"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-subtle block">
                        Competición objetivo <span className="text-ink-subtle normal-case font-medium">(opcional, de las asignadas al atleta)</span>
                    </label>
                    <select
                        value={selectedCompId}
                        onChange={(e) => setSelectedCompId(e.target.value)}
                        className="w-full bg-surface-sunken border border-[var(--border-default)] rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-anvil-red/50 transition-colors"
                    >
                        <option value="">Sin competición</option>
                        {competitions.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name} ({new Date(c.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-ink-muted font-bold uppercase tracking-wider text-xs transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim() || saving}
                        className="px-6 py-2.5 rounded-lg bg-brand hover:bg-brand-hover text-white font-black uppercase tracking-wider text-xs transition-colors disabled:opacity-40 flex items-center gap-2"
                    >
                        {saving ? <Loader className="animate-spin" size={14} /> : <Plus size={14} />}
                        Crear Macro
                    </button>
                </div>
            </div>
        </div>
    );
}
