import { useEffect, useState } from 'react';
import { StickyNote, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { athletesService } from '../../../services/athletesService';

/**
 * NOTAS PRIVADAS DEL ENTRENADOR.
 * El atleta NO ve esto — a diferencia de las notas por serie y por sesión,
 * que sí son suyas. Guarda solo (con retardo), igual que los apéndices del
 * día en el constructor.
 */
export function CoachNotesPanel({ coachId, athleteId }: { coachId: string; athleteId: string }) {
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let alive = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        athletesService.getCoachNotes(coachId, athleteId)
            .then(n => { if (alive) setNotes(n ?? ''); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [coachId, athleteId]);

    const commit = async () => {
        setSaving(true);
        try {
            await athletesService.saveCoachNotes(coachId, athleteId, notes);
        } catch (err) {
            console.error(err);
            toast.error('No se pudieron guardar las notas');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="space-y-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
            <h3 className="flex items-center gap-2 text-t-base font-semibold text-ink">
                <StickyNote size={16} className="text-brand" />
                Notas del entrenador
                {saving && <Loader size={13} className="animate-spin text-ink-faint" />}
            </h3>
            <p className="text-t-xs text-ink-subtle">Solo las ves tú. El atleta no tiene acceso a este texto.</p>
            {loading ? (
                <div className="h-24 animate-pulse rounded-field bg-surface-sunken" />
            ) : (
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={commit}
                    rows={4}
                    maxLength={4000}
                    placeholder="Lesiones a vigilar, cómo prefiere que le hables, lo que no debe faltar en cada bloque..."
                    className="w-full resize-y rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm leading-relaxed text-ink outline-none transition-colors duration-fast placeholder:text-ink-faint focus:border-brand"
                />
            )}
        </section>
    );
}
