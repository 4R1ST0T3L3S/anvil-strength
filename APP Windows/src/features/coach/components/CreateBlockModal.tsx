import { useState } from 'react';
import { Calendar as CalendarIcon, Save, Loader } from 'lucide-react';
import { CalendarWeekPicker } from './CalendarWeekPicker';
import { Modal } from '../../../components/ui/Modal';
import { toast } from 'sonner';
import { trainingService } from '../../../services/trainingService';
import { useAuth } from '../../../context/AuthContext';
import { getWeekNumber, getDateRangeFromWeek } from '../../../utils/dateUtils';

interface CreateBlockModalProps {
    isOpen: boolean;
    onClose: () => void;
    athleteId: string;
    onBlockCreated: () => void;
}

const BLOCK_COLORS = [
    { hex: '#ef4444', label: 'Rojo' },
    { hex: '#3b82f6', label: 'Azul' },
    { hex: '#22c55e', label: 'Verde' },
    { hex: '#f59e0b', label: 'Ámbar' },
    { hex: '#a855f7', label: 'Morado' },
    { hex: '#6b7280', label: 'Gris' },
];

export function CreateBlockModal({ isOpen, onClose, athleteId, onBlockCreated }: CreateBlockModalProps) {
    const { session } = useAuth();
    const [name, setName] = useState('');
    const [startWeek, setStartWeek] = useState<number>(getWeekNumber());
    const [endWeek, setEndWeek] = useState<number>(getWeekNumber() + 4);
    const [color, setColor] = useState('#ef4444');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            toast.error('El nombre del bloque es obligatorio');
            return;
        }

        if (!session?.user.id) return;

        const currentWeek = getWeekNumber();
        if (startWeek < currentWeek) {
            toast.error(`No puedes crear un bloque en el pasado. La semana actual es ${currentWeek}.`);
            return;
        }

        if (endWeek < startWeek) {
            toast.error('La semana de fin debe ser posterior a la de inicio.');
            return;
        }

        setLoading(true);
        try {
            const existingBlocks = await trainingService.getBlocksByAthlete(athleteId);
            const activeBlocks = existingBlocks.filter(b => b.is_active);

            const hasOverlap = activeBlocks.some(block => {
                if (!block.start_week || !block.end_week) return false;
                return (startWeek <= block.end_week) && (endWeek >= block.start_week);
            });

            if (hasOverlap) {
                toast.error('Ya existe un bloque activo en ese rango de semanas.');
                setLoading(false);
                return;
            }

            const currentYear = new Date().getFullYear();
            const { start: startDateObj } = getDateRangeFromWeek(startWeek, currentYear);

            await trainingService.createBlock({
                coach_id: session.user.id,
                athlete_id: athleteId,
                name: name.trim(),
                start_week: startWeek,
                end_week: endWeek,
                start_date: startDateObj.toISOString(),
                color: color,
                description: description.trim() || null,
                is_active: true
            });

            toast.success('Bloque creado correctamente');
            setName('');
            setDescription('');
            setStartWeek(getWeekNumber());
            setEndWeek(getWeekNumber() + 4);
            setColor('#ef4444');
            onBlockCreated();
            onClose();
        } catch (error) {
            console.error('Error creating block:', error);
            toast.error(`Error: ${(error as Error).message || 'Error al crear el bloque'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={isOpen} onClose={onClose} title="Nuevo bloque" size="xl" dismissible={!loading}>
            <form onSubmit={handleSubmit} className="flex gap-8 flex-row">
                {/* Columna izquierda: datos */}
                <div className="flex-1 space-y-6">
                    <label className="block space-y-1.5">
                        <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            Nombre del bloque <span className="text-brand-text">*</span>
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

                    <label className="block space-y-1.5">
                        <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            Descripción y objetivos <span className="font-medium normal-case tracking-normal text-ink-subtle">· el atleta la verá</span>
                        </span>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="Objetivos del bloque, enfoque de las semanas, por qué se hacen ciertas cosas…"
                            className="w-full resize-none rounded-field border border-subtle bg-surface-sunken px-4 py-3 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
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
                            {loading ? <Loader size={17} className="animate-spin" /> : <><Save size={17} aria-hidden="true" /> Crear bloque</>}
                        </button>
                    </div>
                </div>

                {/* Columna derecha: calendario */}
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
