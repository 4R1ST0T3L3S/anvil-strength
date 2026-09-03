import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader, RefreshCw, StickyNote } from 'lucide-react';
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

    const consulta = useQuery({
        queryKey: CLAVES.notasDelCoach.deRelacion(coachId, athleteId),
        queryFn: () => athletesService.getCoachNotes(coachId, athleteId).then(n => n ?? ''),
    });
    const guardadas = consulta.data ?? '';
    const loading = consulta.isPending;

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
        <section className="space-y-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-6">
            <h3 className="flex items-center gap-2 text-t-base font-semibold text-ink">
                <StickyNote size={16} className="text-brand-text" />
                Notas del entrenador
                {saving && <Loader size={13} className="animate-spin text-ink-faint" />}
            </h3>
            <p className="text-t-xs text-ink-subtle">Solo las ves tú. El atleta no tiene acceso a este texto.</p>

            {/* SI LA CONSULTA FALLA, EL CUADRO NO SE PINTA. Y no es una
                cuestión de pulcritud: es lo único que impide perder las notas.

                Sin esta rama, un fallo de red dejaba `guardadas` en su valor
                por defecto —la cadena vacía— y el cuadro salía EN BLANCO,
                indistinguible de un atleta sin notas. El entrenador escribía
                lo que fuera, el `onBlur` guardaba, y ese guardado PISABA las
                notas de verdad, que seguían intactas en el servidor.

                O sea que el estado vacío silencioso no era feo: borraba
                datos. Por eso aquí no hay un aviso al lado del cuadro, sino
                en LUGAR del cuadro. */}
            {consulta.isError ? (
                <div
                    role="alert"
                    className="flex flex-col items-start gap-3 rounded-field border border-danger/20 bg-[var(--danger-quiet)] p-4"
                >
                    <p className="flex items-start gap-2 text-t-sm text-ink">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger-text" aria-hidden="true" />
                        <span>
                            No se han podido cargar las notas.{' '}
                            <span className="text-ink-muted">
                                No se enseña el cuadro a propósito: si escribieras aquí, se guardaría
                                encima de lo que ya hubiera.
                            </span>
                        </span>
                    </p>
                    <button
                        type="button"
                        onClick={() => consulta.refetch()}
                        className="flex min-h-[44px] items-center gap-2 rounded-field border border-[var(--border-default)] px-4 text-t-xs font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
                    >
                        <RefreshCw size={14} aria-hidden="true" />
                        Reintentar
                    </button>
                </div>
            ) : loading ? (
                <div className="h-24 animate-pulse rounded-field bg-surface-sunken" />
            ) : (
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={commit}
                    rows={4}
                    maxLength={4000}
                    placeholder="Lesiones a vigilar, cómo prefiere que le hables, lo que no debe faltar en cada bloque..."
                    className="w-full resize-y rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm leading-relaxed text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                />
            )}
        </section>
    );
}
