import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StickyNote, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { athletesService } from '../../../services/athletesService';
import { CLAVES } from '../../../lib/queryKeys';

/**
 * NOTAS PRIVADAS DEL ENTRENADOR.
 * El atleta NO ve esto — a diferencia de las notas por serie y por sesión,
 * que sí son suyas. Guarda solo (con retardo), igual que los apéndices del
 * día en el constructor.
 */
export function CoachNotesPanel({ coachId, athleteId }: { coachId: string; athleteId: string }) {
    const [saving, setSaving] = useState(false);

    const { data: guardadas = '', isPending: loading } = useQuery({
        queryKey: CLAVES.notasDelCoach.deRelacion(coachId, athleteId),
        queryFn: () => athletesService.getCoachNotes(coachId, athleteId).then(n => n ?? ''),
    });

    /**
     * EL BORRADOR ES ESTADO LOCAL, Y TIENE QUE SERLO.
     *
     * Este cuadro se escribe a mano y se guarda con retardo, así que mientras
     * el entrenador teclea el valor de la caché está desfasado a propósito.
     * Si el texto se leyera directamente de `useQuery`, un refresco en
     * segundo plano le borraría la frase a medias.
     *
     * `key` en vez de un efecto que sincronice: al cambiar de atleta o al
     * llegar las notas del servidor, React vuelve a montar el borrador y
     * `useState` lo inicializa solo. Un `useEffect(() => setNotes(...))` haría
     * lo mismo con un render de más y una condición de carrera de regalo.
     */
    const [notes, setNotes] = useState(guardadas);
    const [semilla, setSemilla] = useState(guardadas);
    if (guardadas !== semilla) {
        // Ajuste durante el render: el patrón que React documenta para
        // "reiniciar estado cuando cambia una prop". No es un efecto, así que
        // no encadena un render extra ni pinta un frame con el valor viejo.
        setSemilla(guardadas);
        setNotes(guardadas);
    }

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
                <StickyNote size={16} className="text-brand-text" />
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
                    className="w-full resize-y rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm leading-relaxed text-ink transition-colors duration-fast placeholder:text-ink-faint focus:border-brand"
                />
            )}
        </section>
    );
}
