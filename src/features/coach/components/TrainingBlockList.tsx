import { useEffect, useState, useCallback } from 'react';
import { Plus, FolderOpen, Calendar, ChevronRight, Loader, Trash2, AlertTriangle, Pencil, TrendingUp, Layers, Trophy, Folder, Copy } from 'lucide-react';
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
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';

/** Un botón de icono de 36px, en las cuatro variantes que usa la tarjeta. */
function IconAction({
    icon: Icon, label, onClick, active, danger,
}: {
    icon: typeof Folder;
    label: string;
    onClick: (e: React.MouseEvent) => void;
    active?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            title={label}
            className={`rounded-field p-2 transition-colors duration-fast ease-snap ${
                active
                    ? 'bg-brand-quiet text-brand'
                    : danger
                        ? 'text-ink-subtle hover:bg-[var(--danger-quiet)] hover:text-danger'
                        : 'text-ink-subtle hover:bg-surface-sunken hover:text-ink'
            }`}
        >
            <Icon size={16} aria-hidden="true" />
        </button>
    );
}

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



    /**
     * LA TARJETA DE UN BLOQUE.
     * ==================================================================
     * Antes era italic uppercase tracking-tighter en rojo neón, con un
     * halo (`ring`) alrededor de los bloques activos, botones en cinco
     * grises distintos (`bg-white/10`, `bg-white/5`, `text-white`…) y un
     * popover con su propia paleta. Nada de eso viene del sistema de
     * diseño que usan ya el resto de pantallas del panel.
     *
     * Ahora: sin cursiva, jerarquía por PESO y TAMAÑO en vez de por color
     * —el nombre del bloque es lo único en `t-lg/font-bold`—, un único
     * estado "activo" que se lee por el borde y la insignia, y los cinco
     * botones de acción con el mismo tratamiento que usa toda la app
     * (`rounded-field`, `text-ink-subtle` → `text-ink` al pasar por
     * encima). El rojo queda para la insignia ACTIVO y nada más: es lo
     * que hace que de verdad destaque entre los históricos.
     */
    const renderBlockCard = (block: TrainingBlock) => {
        const isActive = block.is_active;
        return (
            <div
                key={block.id}
                className="group relative cursor-pointer rounded-card border border-[var(--border-default)] bg-surface-raised transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay"
                onClick={() => onSelectBlock(block)}
            >
                {/* En móvil la tarjeta es de DOS filas y no de una: con una
                    sola, el título, el estado y los cinco controles competían
                    por 375px y los botones se salían de la pantalla. */}
                <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-4 md:px-5 md:py-4">
                    <div className="flex min-w-0 items-center gap-3 md:gap-4">
                        {isActive && (
                            <span className="shrink-0 rounded-chip bg-brand-quiet px-2 py-1 text-[10px] font-black uppercase tracking-wider text-brand">
                                Activo
                            </span>
                        )}

                        <div className="flex min-w-0 flex-col gap-0.5">
                            <h4 className="truncate text-t-base font-bold text-ink transition-colors duration-fast group-hover:text-brand md:text-t-lg">
                                {block.name}
                            </h4>

                            <div className="flex items-center gap-2 truncate text-t-xs text-ink-subtle md:gap-3">
                                <span className="flex shrink-0 items-center gap-1.5">
                                    <Calendar size={12} aria-hidden="true" />
                                    Semana {block.start_week || '?'}–{block.end_week || '?'}
                                </span>
                                {block.start_week && block.end_week && (
                                    <>
                                        <span className="hidden h-1 w-1 shrink-0 rounded-pill bg-[var(--border-strong)] sm:block" aria-hidden="true" />
                                        <span className="hidden truncate sm:block">
                                            {formatDateRange(getDateRangeFromWeek(block.start_week).start, getDateRangeFromWeek(block.end_week).end)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="relative flex shrink-0 items-center justify-end gap-0.5 md:gap-1">
                        <IconAction
                            icon={Folder}
                            label="Asignar a un macro"
                            active={macroPickerBlockId === block.id}
                            onClick={(e) => { e.stopPropagation(); setMacroPickerBlockId(macroPickerBlockId === block.id ? null : block.id); }}
                        />
                        {/* Copiar a otros atletas. Es la acción que más tiempo
                            ahorra de toda la pantalla: un club programa por
                            grupos y sin esto el mismo bloque se construye a
                            mano una vez por atleta. */}
                        <IconAction
                            icon={Copy}
                            label="Copiar este bloque a otros atletas"
                            onClick={(e) => { e.stopPropagation(); setBlockToDuplicate(block); }}
                        />
                        <IconAction
                            icon={Pencil}
                            label="Editar bloque"
                            onClick={(e) => { e.stopPropagation(); setBlockToEdit(block); }}
                        />
                        <IconAction
                            icon={Trash2}
                            label="Eliminar bloque"
                            danger
                            onClick={(e) => handleDeleteClick(e, block.id)}
                        />
                        {/* La flecha sobra en móvil: la tarjeta entera ya es
                            pulsable y ahí cada píxel de ancho cuenta. */}
                        <ChevronRight size={18} aria-hidden="true" className="ml-1 hidden shrink-0 text-ink-faint transition-colors duration-fast group-hover:text-ink-muted md:block" />

                        {macroPickerBlockId === block.id && (
                            <div
                                className="absolute right-0 top-full z-dropdown mt-2 w-60 rounded-card border border-[var(--border-default)] bg-surface-overlay p-1.5 shadow-overlay"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <p className="px-2.5 py-1.5 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">Mover a macro</p>
                                <div className="max-h-48 space-y-0.5 overflow-y-auto">
                                    {macros.length === 0 && (
                                        <p className="px-2.5 py-2 text-t-xs text-ink-subtle">Sin macros. Crea uno con "Nuevo macro".</p>
                                    )}
                                    {macros.map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => handleAssignMacro(block.id, m.id)}
                                            className={`w-full rounded-field px-2.5 py-2 text-left text-t-sm font-semibold transition-colors duration-fast ${
                                                block.macro_id === m.id ? 'bg-brand-quiet text-brand' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                                            }`}
                                        >
                                            {m.name}
                                        </button>
                                    ))}
                                    {block.macro_id && (
                                        <button
                                            onClick={() => handleAssignMacro(block.id, null)}
                                            className="w-full rounded-field px-2.5 py-2 text-left text-t-xs font-semibold text-ink-subtle transition-colors duration-fast hover:bg-surface-raised hover:text-ink"
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
                <Loader className="animate-spin text-ink-faint" size={22} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <h2 className="text-t-2xl font-black uppercase tracking-display text-ink">Bloques</h2>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setIsStatsOpen(true)}
                        className="flex items-center gap-2 rounded-field border border-[var(--border-default)] px-3.5 py-2.5 text-t-xs font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
                    >
                        <TrendingUp size={15} aria-hidden="true" />
                        Estadísticas
                    </button>
                    <button
                        onClick={() => setIsCreateMacroOpen(true)}
                        className="flex items-center gap-2 rounded-field border border-[var(--border-default)] px-3.5 py-2.5 text-t-xs font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
                    >
                        <Layers size={15} aria-hidden="true" />
                        Nuevo macro
                    </button>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-2 rounded-field bg-brand px-4 py-2.5 text-t-xs font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover"
                    >
                        <Plus size={16} aria-hidden="true" />
                        Nuevo bloque
                    </button>
                </div>
            </div>

            {/* El estado vacío exige que NO haya ni bloques ni macros.
                Antes bastaba con `blocks.length === 0`, así que un macrociclo
                recién creado desaparecía de la pantalla hasta que se le metía
                dentro un bloque: existía en la base, pero la rama del estado
                vacío se comía todo el listado. */}
            {blocks.length === 0 && macros.length === 0 ? (
                <div className="rounded-card border border-[var(--border-default)] bg-surface-raised">
                    <EmptyState
                        icon={<FolderOpen size={20} aria-hidden="true" />}
                        title="No hay planificaciones todavía"
                        body="Crea el primer bloque de entrenamiento para este atleta."
                        action={
                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="rounded-field bg-brand px-4 py-2.5 text-t-xs font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover"
                            >
                                Crear bloque
                            </button>
                        }
                    />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Macros con sus bloques */}
                    {macros.map(macro => {
                        const macroBlocks = blocks.filter(b => b.macro_id === macro.id);
                        return (
                            <div key={macro.id} className="rounded-card border border-[var(--border-default)] bg-surface-sunken p-3.5 md:p-4">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-brand-quiet text-brand">
                                            <Layers size={16} aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="truncate text-t-base font-bold text-ink">{macro.name}</h3>
                                            {macro.competition_name && (
                                                <p className="flex items-center gap-1.5 text-t-xs font-semibold text-warning">
                                                    <Trophy size={11} aria-hidden="true" />
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
                                    <IconAction
                                        icon={Trash2}
                                        label="Eliminar macro (los bloques se conservan)"
                                        danger
                                        onClick={() => handleDeleteMacro(macro.id)}
                                    />
                                </div>
                                {macroBlocks.length === 0 ? (
                                    <p className="px-1 pb-1 text-t-xs text-ink-subtle">
                                        Sin bloques. Usa el icono de carpeta de un bloque para añadirlo aquí.
                                    </p>
                                ) : (
                                    <div className="grid gap-2.5">
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
                                    <p className="mb-2.5 px-1 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">Sin macro</p>
                                )}
                                <div className="grid gap-2.5">
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

            <Modal
                open={blockToDelete !== null}
                onClose={() => setBlockToDelete(null)}
                title="¿Eliminar bloque?"
                size="sm"
                dismissible={!isDeleting}
            >
                <div className="space-y-5">
                    <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-[var(--danger-quiet)] text-danger">
                            <AlertTriangle size={17} aria-hidden="true" />
                        </span>
                        <p className="text-t-sm leading-relaxed text-ink-muted">
                            Esta acción eliminará el bloque y <strong className="font-bold text-ink">todas sus sesiones y registros</strong>. No se puede deshacer.
                        </p>
                    </div>
                    <div className="flex gap-2.5">
                        <button
                            onClick={() => setBlockToDelete(null)}
                            className="flex-1 rounded-field px-4 py-2.5 text-t-sm font-bold text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={confirmDelete}
                            disabled={isDeleting}
                            className="flex flex-1 items-center justify-center gap-2 rounded-field bg-brand px-4 py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                        >
                            {isDeleting ? <Loader size={15} className="animate-spin" /> : 'Eliminar'}
                        </button>
                    </div>
                </div>
            </Modal>
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
        <Modal open onClose={onClose} title="Nuevo macro" size="md">
            <div className="space-y-5">
                <label className="block space-y-1.5">
                    <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">Nombre</span>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={120}
                        autoFocus
                        placeholder="Ej: Preparación Nacional 2027"
                        className="h-11 w-full rounded-field border border-subtle bg-surface-sunken px-3 text-t-sm font-semibold text-ink outline-none transition-colors duration-fast placeholder:font-normal placeholder:text-ink-subtle focus:border-brand"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    />
                </label>

                <label className="block space-y-1.5">
                    <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                        Competición objetivo <span className="font-medium normal-case tracking-normal text-ink-faint">· opcional</span>
                    </span>
                    <select
                        value={selectedCompId}
                        onChange={(e) => setSelectedCompId(e.target.value)}
                        className="h-11 w-full rounded-field border border-subtle bg-surface-sunken px-3 text-t-sm text-ink outline-none transition-colors duration-fast focus:border-brand"
                    >
                        <option value="">Sin competición</option>
                        {competitions.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name} ({new Date(c.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })})
                            </option>
                        ))}
                    </select>
                </label>

                <div className="flex justify-end gap-2.5 pt-1">
                    <button
                        onClick={onClose}
                        className="rounded-field px-4 py-2.5 text-t-sm font-bold text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim() || saving}
                        className="flex items-center gap-2 rounded-field bg-brand px-5 py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                    >
                        {saving ? <Loader size={15} className="animate-spin" /> : <Plus size={15} />}
                        Crear macro
                    </button>
                </div>
            </div>
        </Modal>
    );
}
