import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { supabase } from '../../../lib/supabase';
import { fetchRosterIds } from '../hooks/useCoachRoster';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock } from '../../../types/training';

interface Candidate {
    id: string;
    full_name: string;
    avatar_url?: string | null;
}

/**
 * COPIAR UN BLOQUE A VARIOS ATLETAS
 *
 * Un club programa por grupos: los seis de iniciación hacen el mismo
 * mesociclo con distintas cargas. Sin esto el coach lo construye seis veces,
 * y montar cuatro semanas son unos cuarenta minutos. Es la tarea que más
 * tiempo le come de largo.
 *
 * Dos decisiones que evitan un desastre:
 *
 *  - Los bloques nuevos nacen INACTIVOS. Activar seis de golpe le cambia el
 *    entrenamiento a seis personas sin que nadie haya mirado sus cargas.
 *  - Solo se copia la prescripción, nunca lo que el atleta original ejecutó.
 *    Ver `duplicateBlockToAthletes`.
 */
export function DuplicateBlockModal({
    open,
    onClose,
    block,
    coachId,
    currentAthleteId,
    onDone,
}: {
    open: boolean;
    onClose: () => void;
    block: TrainingBlock | null;
    coachId: string;
    currentAthleteId: string;
    onDone?: () => void;
}) {
    const [candidates, setCandidates] = useState<Candidate[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [working, setWorking] = useState(false);

    // No hace falta limpiar la selección al abrir: el padre monta este
    // componente con `key` del bloque, así que cada apertura es una instancia
    // nueva y el estado nace vacío por definición. Resetear a mano dentro de
    // un efecto encadenaba un render de más por cada apertura.
    useEffect(() => {
        if (!open) return;

        let alive = true;
        (async () => {
            // Por la puerta única y solo vínculos vivos: copiar un bloque a
            // alguien que ya no entrena aquí no tiene destinatario.
            // Ver src/features/coach/hooks/useCoachRoster.ts.
            const ids = (await fetchRosterIds(coachId, 'active'))
                // El atleta del que sale el bloque no puede ser destino: sería
                // duplicárselo a sí mismo, que no es lo que nadie quiere aquí.
                .filter(id => id !== currentAthleteId);

            if (ids.length === 0) { if (alive) setCandidates([]); return; }

            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
                .in('id', ids)
                .order('full_name', { ascending: true });

            if (alive) setCandidates((profiles ?? []) as Candidate[]);
        })();

        return () => { alive = false; };
    }, [open, coachId, currentAthleteId]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (candidates ?? []).filter(c => !term || c.full_name?.toLowerCase().includes(term));
    }, [candidates, search]);

    const toggle = (id: string) =>
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });

    const handleCopy = async () => {
        if (!block || selected.size === 0) return;
        setWorking(true);
        try {
            const { created, failed } = await trainingService.duplicateBlockToAthletes(
                block.id,
                [...selected]
            );

            if (created.length > 0) {
                toast.success(
                    `Copiado a ${created.length} ${created.length === 1 ? 'atleta' : 'atletas'}. ` +
                    'Los bloques nuevos están inactivos: revísalos y actívalos.'
                );
            }
            // Un fallo parcial se dice, no se esconde: si a dos de seis les ha
            // fallado, el coach tiene que saber a quién le falta el bloque.
            if (failed.length > 0) {
                toast.error(`No se pudo copiar a ${failed.length}. Inténtalo otra vez con esos.`);
            }

            onDone?.();
            onClose();
        } catch (err) {
            console.error(err);
            toast.error('No se pudo copiar el bloque');
        } finally {
            setWorking(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Copiar el bloque a otros atletas" size="md">
            <div className="space-y-4">
                <p className="text-t-sm leading-relaxed text-ink-muted">
                    Se copian los días, ejercicios, series y notas de{' '}
                    <strong className="font-bold text-ink">{block?.name}</strong>. No se copia nada
                    de lo que ya se haya entrenado.
                </p>

                {candidates === null ? (
                    <div className="flex justify-center py-10">
                        <Loader className="animate-spin text-brand" size={22} />
                    </div>
                ) : candidates.length === 0 ? (
                    <p className="rounded-card border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-t-sm text-ink-subtle">
                        No tienes más atletas a los que copiárselo.
                    </p>
                ) : (
                    <>
                        <div className="relative">
                            <Search
                                size={15}
                                aria-hidden="true"
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                            />
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar atleta…"
                                className="w-full rounded-field border border-subtle bg-surface-sunken py-2.5 pl-9 pr-3 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                            />
                        </div>

                        <ul className="max-h-72 space-y-1 overflow-y-auto">
                            {visible.map(candidate => {
                                const checked = selected.has(candidate.id);
                                return (
                                    <li key={candidate.id}>
                                        <button
                                            onClick={() => toggle(candidate.id)}
                                            aria-pressed={checked}
                                            className={`flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-left transition-colors duration-fast ease-snap active:scale-[0.99] ${
 checked ? 'bg-[var(--brand-quiet)]' : 'hover:bg-surface-overlay'
 }`}
                                        >
                                            <span
                                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-chip border transition-colors duration-fast ${
 checked
 ? 'border-brand bg-brand text-brand-ink'
 : 'border-[var(--border-strong)]'
 }`}
                                            >
                                                {checked && <Check size={13} strokeWidth={3.5} aria-hidden="true" />}
                                            </span>
                                            <span className={`min-w-0 truncate text-t-sm font-semibold ${checked ? 'text-ink' : 'text-ink-muted'}`}>
                                                {candidate.full_name}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>

                        <button
                            onClick={handleCopy}
                            disabled={selected.size === 0 || working}
                            className="flex w-full items-center justify-center gap-2 rounded-field bg-brand py-3 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {working
                                ? <><Loader size={16} className="animate-spin" aria-hidden="true" /> Copiando…</>
                                : <><Copy size={16} aria-hidden="true" /> Copiar a {selected.size || 'ningún'} {selected.size === 1 ? 'atleta' : 'atletas'}</>}
                        </button>
                    </>
                )}
            </div>
        </Modal>
    );
}
