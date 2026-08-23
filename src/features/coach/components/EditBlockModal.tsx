import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Save, Loader } from 'lucide-react';
import { CalendarWeekPicker } from './CalendarWeekPicker';
import { Modal } from '../../../components/ui/Modal';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock } from '../../../types/training';

interface EditBlockModalProps {
    isOpen: boolean;
    onClose: () => void;
    block: TrainingBlock | null;
    onBlockUpdated: () => void;
}

const BLOCK_COLORS = [
    { hex: '#ef4444', label: 'Rojo' },
    { hex: '#3b82f6', label: 'Azul' },
    { hex: '#22c55e', label: 'Verde' },
    { hex: '#f59e0b', label: 'Ámbar' },
    { hex: '#a855f7', label: 'Morado' },
    { hex: '#6b7280', label: 'Gris' },
];

export function EditBlockModal({ isOpen, onClose, block, onBlockUpdated }: EditBlockModalProps) {
    const [name, setName] = useState('');
    const [startWeek, setStartWeek] = useState<number>(1);
    const [endWeek, setEndWeek] = useState<number>(4);
    const [isActive, setIsActive] = useState(true);
    const [color, setColor] = useState('#ef4444');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (block) {
            setName(block.name || '');
            setStartWeek(block.start_week ?? 1);
            setEndWeek(block.end_week ?? 4);
            setIsActive(block.is_active);
            setColor(block.color || '#ef4444');
        }
    }, [block]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!block) return;

        if (!name.trim()) {
            toast.error('El nombre del bloque es obligatorio');
            return;
        }

        if (endWeek < startWeek) {
            toast.error('La semana de fin debe ser posterior a la de inicio.');
            return;
        }

        setLoading(true);
        try {
            await trainingService.updateBlock(block.id, {
                name: name.trim(),
                start_week: startWeek,
                end_week: endWeek,
                is_active: isActive,
                color: color
            });

            toast.success('Bloque actualizado correctamente');
            onBlockUpdated();
            onClose();
        } catch (error) {
            console.error('Error updating block:', error);
            toast.error(`Error: ${(error as Error).message || 'Error al actualizar el bloque'}`);
        } finally {
            setLoading(false);
        }
    };

    if (!block) return null;

    return (
        <Modal open={isOpen} onClose={onClose} title="Editar bloque" size="xl" dismissible={!loading}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-8 md:flex-row">
                <div className="flex-1 space-y-6">
                    <label className="block space-y-1.5">
                        <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            Nombre del bloque <span className="text-brand">*</span>
                        </span>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: Bloque fuerza enero"
                            className="h-12 w-full rounded-field border border-subtle bg-surface-sunken px-4 text-t-base font-bold text-ink transition-colors duration-fast placeholder:font-normal placeholder:text-ink-subtle focus:border-brand"
                            autoFocus
                        />
                    </label>

                    <div className="space-y-1.5">
                        <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">Color del bloque</span>
                        <div className="flex items-center gap-2.5">
                            {BLOCK_COLORS.map((c) => (
                                <button
                                    key={c.hex}
                                    type="button"
                                    onClick={() => setColor(c.hex)}
                                    aria-label={c.label}
                                    title={c.label}
                                    className={`h-9 w-9 rounded-pill border-2 transition-[border-color,box-shadow,transform] duration-fast ease-snap ${
 color === c.hex
 ? 'scale-110 border-ink shadow-raise'
 : 'border-transparent hover:scale-105 hover:border-[var(--border-strong)]'
 }`}
                                    style={{ backgroundColor: c.hex }}
                                />
                            ))}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsActive(!isActive)}
                        className="flex w-full items-center justify-between rounded-card border border-subtle bg-surface-sunken px-4 py-3.5 text-left transition-colors duration-fast hover:border-[var(--border-strong)]"
                    >
                        <span>
                            <span className="block text-t-sm font-bold text-ink">Bloque activo</span>
                            <span className="mt-0.5 block text-t-xs text-ink-subtle">Visible en el constructor</span>
                        </span>
                        <span
                            aria-hidden="true"
                            className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-fast ${isActive ? 'bg-success' : 'bg-surface-overlay'}`}
                        >
                            <span
                                className={`absolute top-1 h-5 w-5 rounded-pill bg-white shadow-raise transition-transform duration-fast ${isActive ? 'translate-x-6' : 'translate-x-1'}`}
                            />
                        </span>
                    </button>

                    <div className="flex gap-2.5 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-field px-4 py-3 text-t-sm font-bold text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex flex-1 items-center justify-center gap-2 rounded-field bg-brand px-4 py-3 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                        >
                            {loading ? <Loader size={17} className="animate-spin" /> : <><Save size={17} aria-hidden="true" /> Guardar cambios</>}
                        </button>
                    </div>
                </div>

                <div className="flex-1">
                    <div className="flex h-full flex-col space-y-1.5">
                        <span className="flex items-center gap-2 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            <CalendarIcon size={13} aria-hidden="true" /> Duración del bloque
                        </span>
                        <div className="min-h-[400px] flex-1">
                            <CalendarWeekPicker
                                startWeek={startWeek}
                                endWeek={endWeek}
                                selectedColor={color}
                                onChange={(start, end) => {
                                    setStartWeek(start);
                                    setEndWeek(end);
                                }}
                            />
                        </div>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
