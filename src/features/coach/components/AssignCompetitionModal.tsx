import { useState, useEffect, useCallback } from 'react';
import { Search, User, Check, Save, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { useAuth } from '../../../context/AuthContext';
import { fetchRosterIds } from '../hooks/useCoachRoster';
import { competitionsService } from '../../../services/competitionsService';
import { Competition } from '../../../services/aepService';
import { Modal } from '../../../components/ui/Modal';

interface AssignCompetitionModalProps {
    isOpen: boolean;
    onClose: () => void;
    competition: Competition | null;
}

export function AssignCompetitionModal({ isOpen, onClose, competition }: AssignCompetitionModalProps) {
    const { session } = useAuth();
    // El identificador suelto y no `session` entero: es de lo ÚNICO que
    // depende la consulta, y con el objeto en las dependencias el callback se
    // rehacía en cada refresco del token.
    const coachId = session?.user.id ?? null;
    const [athletes, setAthletes] = useState<UserProfile[]>([]);
    const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [description, setDescription] = useState('');

    const fetchAthletes = useCallback(async () => {
        if (!coachId) return;
        try {
            setLoading(true);
            // Por la puerta única, y solo los vínculos vivos: asignar una
            // competición a alguien que ya no está en el equipo no significa
            // nada. Ver src/features/coach/hooks/useCoachRoster.ts.
            const athleteIds = await fetchRosterIds(coachId, 'active');

            if (athleteIds.length === 0) {
                setAthletes([]);
                return;
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .in('id', athleteIds)
                .order('full_name', { ascending: true });

            if (error) throw error;
            setAthletes(data || []);
        } catch (err) {
            console.error('Error fetching athletes:', err);
            toast.error('Error al cargar atletas');
        } finally {
            setLoading(false);
        }
    }, [coachId]);

    useEffect(() => {
        if (isOpen && coachId) {
            fetchAthletes();
        }
    }, [isOpen, coachId, fetchAthletes]);

    const toggleAthlete = (id: string) => {
        const newSelected = new Set(selectedAthletes);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedAthletes(newSelected);
    };

    const handleAssign = async () => {
        if (!competition || selectedAthletes.size === 0 || !session?.user.id) return;

        setSubmitting(true);
        try {
            let finalDate = competition.dateIso;
            if (!finalDate) {
                console.warn('Missing dateIso, falling back to today');
                finalDate = new Date().toISOString().split('T')[0];
            }

            const creadas = await competitionsService.assignCompetition(
                {
                    name: competition.campeonato,
                    date: finalDate,
                    end_date: competition.endDateIso,
                    location: competition.sede,
                    level: competition.level,
                    description: description.trim() || undefined
                },
                Array.from(selectedAthletes),
                session.user.id
            );

            // Se dice cuántas se han creado DE VERDAD. Los atletas que ya la
            // tenían —porque se la auto-asignaron o porque ya se la habías
            // puesto— no generan una segunda fila, y anunciar "asignada a 6"
            // cuando solo entraron 2 haría dudar de si funcionó.
            const nuevas = creadas?.length ?? 0;
            const repetidas = selectedAthletes.size - nuevas;

            if (nuevas === 0) {
                toast.info('Todos los atletas seleccionados ya tenían esta competición');
            } else {
                toast.success(
                    `Competición asignada a ${nuevas} ${nuevas === 1 ? 'atleta' : 'atletas'}` +
                    (repetidas > 0 ? ` · ${repetidas} ya la ${repetidas === 1 ? 'tenía' : 'tenían'}` : '')
                );
            }
            onClose();
            setSelectedAthletes(new Set());
            setDescription('');
        } catch (error) {
            console.error('Error assigning competition:', error);
            const msg = (error as Error).message || 'Error desconocido';
            toast.error(`Error: ${msg}`);
        } finally {
            setSubmitting(false);
        }
    };

    const filteredAthletes = athletes.filter(a =>
        (a.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Asignar competición"
            description={competition?.campeonato}
            size="lg"
            dismissible={!submitting}
            footer={
                <div className="flex items-center justify-between gap-4">
                    <p className="text-t-sm text-ink-muted">
                        <span className="font-bold text-ink">{selectedAthletes.size}</span> atletas seleccionados
                    </p>
                    <div className="flex gap-2.5">
                        <button
                            onClick={onClose}
                            className="rounded-field px-4 py-2.5 text-t-xs font-bold uppercase tracking-wide text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleAssign}
                            disabled={submitting || selectedAthletes.size === 0}
                            className="flex items-center gap-2 rounded-field bg-brand px-5 py-2.5 text-t-xs font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                        >
                            {submitting ? <Loader size={14} className="animate-spin" /> : <Save size={14} aria-hidden="true" />}
                            Asignar
                        </button>
                    </div>
                </div>
            }
        >
            <div className="space-y-6">
                <div className="relative">
                    <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                    <input
                        type="text"
                        placeholder="Buscar atleta…"
                        className="h-11 w-full rounded-field border border-subtle bg-surface-sunken pl-9 pr-3 text-t-sm text-ink outline-none transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader size={24} className="animate-spin text-ink-faint" />
                    </div>
                ) : filteredAthletes.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {filteredAthletes.map(athlete => {
                            const isSelected = selectedAthletes.has(athlete.id);
                            return (
                                <button
                                    type="button"
                                    key={athlete.id}
                                    onClick={() => toggleAthlete(athlete.id)}
                                    className={`flex items-center gap-3 rounded-field border p-3 text-left transition-colors duration-fast ease-snap active:scale-[0.98] ${
                                        isSelected
                                            ? 'border-[var(--brand-line)] bg-brand-quiet text-ink'
                                            : 'border-subtle bg-surface-sunken text-ink-muted hover:border-[var(--border-strong)] hover:text-ink'
                                    }`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border transition-colors duration-fast ${
                                            isSelected ? 'border-brand bg-brand' : 'border-[var(--border-strong)]'
                                        }`}
                                    >
                                        {isSelected && <Check size={12} className="text-brand-ink" aria-hidden="true" />}
                                    </span>

                                    <span className="flex min-w-0 items-center gap-2.5">
                                        {athlete.avatar_url ? (
                                            <img src={athlete.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-pill object-cover" />
                                        ) : (
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-overlay">
                                                <User size={14} aria-hidden="true" />
                                            </span>
                                        )}
                                        <span className="truncate text-t-sm font-bold">{athlete.full_name}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="py-10 text-center text-t-sm text-ink-subtle">No se encontraron atletas.</p>
                )}

                <label className="block space-y-1.5">
                    <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                        Descripción pública <span className="font-medium normal-case tracking-normal text-ink-faint">· se muestra en la web al pinchar en el atleta</span>
                    </span>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        maxLength={400}
                        placeholder="Ej: Fernando busca revalidar su título en -74kg tras su victoria en Chiva…"
                        className="w-full resize-none rounded-field border border-subtle bg-surface-sunken px-3.5 py-3 text-t-sm text-ink outline-none transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                    />
                </label>
            </div>
        </Modal>
    );
}
