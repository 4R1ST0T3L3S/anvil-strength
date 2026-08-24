import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import {
    defaultProgression,
    fitToWeeks,
    formatStep,
    parseProgressionText,
    resolveStep,
    type Progression,
    type ProgressionStep,
} from '../../../lib/planning/progression';
import { progressionService } from '../../../services/progressionService';

/**
 * Editor de la progresión de un ejercicio a lo largo del bloque.
 *
 * POR QUÉ SE ESCRIBE EN TEXTO Y NO EN UN FORMULARIO
 * Una progresión de 8 semanas son 32 campos. Rellenarlos uno a uno es más
 * lento que teclear ocho líneas, y sobre todo impide ver la progresión
 * ENTERA de un vistazo, que es justo lo que hay que juzgar: si sube
 * demasiado rápido, si falta una descarga, si la última semana tiene sentido.
 *
 * La tabla de la derecha es la vista previa con los kilos ya resueltos sobre
 * el 1RM del atleta, para no tener que aplicar y deshacer para comprobarlo.
 */

export interface ProgressionModalProps {
    isOpen: boolean;
    onClose: () => void;
    exerciseName: string;
    /** Semanas del bloque, para ajustar la progresión a su longitud. */
    weekCount: number;
    /** 1RM del atleta en este ejercicio; resuelve los porcentajes. */
    referenceMax: number | null;
    coachId: string | null;
    /** Aplica la progresión resuelta a todas las semanas del bloque. */
    onApply: (steps: ProgressionStep[]) => void;
}

const PLACEHOLDER = `4x6 70%
4x6 75%
4x6 80%
3x5 60%`;

/**
 * Traduce el fallo de la tabla de plantillas a algo que se pueda arreglar.
 *
 * El caso real y repetido es que `progression_templates` no existe todavía:
 * PostgREST responde 404 con "relation does not exist" o el código PGRST205,
 * y sin traducir eso el coach solo ve "no se pudo guardar".
 */
function explainStorageError(err: unknown): string {
    const raw = (err as { message?: string })?.message ?? '';

    if (
        raw.includes('does not exist') ||
        raw.includes('PGRST205') ||
        raw.includes('schema cache')
    ) {
        return 'falta la tabla de plantillas. Ejecuta database/MIGRACION_PENDIENTE.sql en Supabase.';
    }
    if (raw.includes('row-level security') || raw.includes('violates row-level')) {
        return 'el servidor ha rechazado la escritura por permisos.';
    }
    return raw || 'error desconocido';
}

export function ProgressionModal({
    isOpen,
    onClose,
    exerciseName,
    weekCount,
    referenceMax,
    coachId,
    onApply,
}: ProgressionModalProps) {
    // Al abrir se propone una progresión lineal del largo del bloque. Empezar
    // con la caja vacía obligaría a recordar el formato antes de escribir nada.
    //
    // Se inicializa en el useState y no en un efecto porque el padre monta
    // este componente al abrirlo y lo desmonta al cerrarlo: el estado ya nace
    // fresco cada vez, y sincronizarlo con un efecto sería pintar dos veces.
    const [text, setText] = useState(() =>
        defaultProgression(weekCount).map(formatStep).join('\n')
    );
    const [saved, setSaved] = useState<Progression[]>([]);
    const [templateName, setTemplateName] = useState('');
    /**
     * Por qué no se pueden guardar plantillas, si es que no se puede.
     *
     * Antes esto se tragaba en un `catch` vacío: la lista salía vacía, el
     * botón de guardar decía "No se pudo guardar la progresión" sin más, y no
     * había forma de saber desde la interfaz que lo que faltaba era una
     * migración. Se pierde media tarde buscando un fallo en el código que
     * está en la base de datos.
     */
    const [storageError, setStorageError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !coachId) return;
        progressionService.list(coachId)
            .then((rows) => { setSaved(rows); setStorageError(null); })
            // Las plantillas guardadas son un atajo, no un requisito: si la
            // tabla aún no está migrada se puede escribir y aplicar la
            // progresión igual, así que esto avisa pero no bloquea nada.
            .catch((err) => setStorageError(explainStorageError(err)));
    }, [isOpen, coachId]);

    const { steps, errors } = useMemo(() => parseProgressionText(text), [text]);
    const fitted = useMemo(() => fitToWeeks(steps, weekCount), [steps, weekCount]);

    const preview = useMemo(
        () => fitted.map((step) => ({ step, resolved: resolveStep(step, referenceMax) })),
        [fitted, referenceMax]
    );

    const unresolvedCount = preview.filter((p) => p.resolved.unresolved).length;

    const handleSaveTemplate = async () => {
        if (!coachId || !templateName.trim() || steps.length === 0) return;
        try {
            const created = await progressionService.save(coachId, templateName, steps);
            setSaved((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
            setTemplateName('');
            setStorageError(null);
            toast.success('Progresión guardada');
        } catch (err) {
            const reason = explainStorageError(err);
            setStorageError(reason);
            toast.error(`No se pudo guardar la progresión: ${reason}`, { duration: 8000 });
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        try {
            await progressionService.remove(id);
            setSaved((prev) => prev.filter((p) => p.id !== id));
        } catch {
            toast.error('No se pudo eliminar');
        }
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            size="lg"
            title={`Progresión · ${exerciseName}`}
            description={`Sustituye las series de ${exerciseName} en todas las semanas donde aparezca.`}
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button
                        variant="primary"
                        disabled={steps.length === 0}
                        onClick={() => { onApply(fitted); onClose(); }}
                    >
                        Aplicar a {weekCount} {weekCount === 1 ? 'semana' : 'semanas'}
                    </Button>
                </div>
            }
        >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Escritura */}
                <div className="space-y-3">
                    <label className="block">
                        <span className="text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                            Una línea por semana
                        </span>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={Math.max(6, weekCount + 1)}
                            spellCheck={false}
                            placeholder={PLACEHOLDER}
                            className="mt-1.5 w-full resize-y rounded-field border border-[var(--border-default)] bg-surface-sunken p-3 font-mono text-t-sm text-ink transition-colors duration-fast ease-snap placeholder:text-ink-subtle focus:border-brand"
                        />
                    </label>

                    <p className="text-t-2xs leading-relaxed text-ink-subtle">
                        Formato: <span className="text-ink-subtle">4x6 70%</span> (porcentaje del 1RM),{' '}
                        <span className="text-ink-subtle">5x5 100kg</span>,{' '}
                        <span className="text-ink-subtle">3x5 @8</span> (RPE) o{' '}
                        <span className="text-ink-subtle">5x5</span> sin carga.
                        Si escribes menos líneas que semanas, la última se repite.
                    </p>

                    {errors.length > 0 && (
                        <p className="flex items-start gap-2 rounded-field bg-[var(--warning-quiet)] px-2.5 py-2 text-t-xs text-warning">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>
                                No se entienden {errors.length === 1 ? 'la línea' : 'las líneas'}{' '}
                                {errors.map((e) => e.line).join(', ')}. El resto sí se aplicará.
                            </span>
                        </p>
                    )}

                    {/* Plantillas guardadas */}
                    {coachId && (
                        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                            {/* Se dice ARRIBA y antes de intentarlo: descubrir
                                que no se puede guardar después de escribir el
                                nombre y pulsar el botón es la peor versión de
                                este aviso. La progresión se puede aplicar
                                igual, y eso también se dice. */}
                            {storageError && (
                                <p className="flex items-start gap-2 rounded-field bg-[var(--warning-quiet)] px-2.5 py-2 text-t-xs text-warning">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    <span>
                                        No se pueden guardar plantillas: {storageError}
                                        <br />
                                        La progresión de arriba sí se puede aplicar al bloque.
                                    </span>
                                </p>
                            )}

                            <div className="flex gap-2">
                                <input
                                    value={templateName}
                                    onChange={(e) => setTemplateName(e.target.value)}
                                    placeholder="Guardar como…"
                                    className="min-w-0 flex-1 rounded-field border border-[var(--border-default)] bg-surface-sunken px-2.5 py-1.5 text-t-sm text-ink transition-colors duration-fast ease-snap placeholder:text-ink-subtle focus:border-brand"
                                />
                                <Button
                                    size="sm"
                                    onClick={handleSaveTemplate}
                                    disabled={!templateName.trim() || steps.length === 0}
                                >
                                    Guardar
                                </Button>
                            </div>

                            {saved.length > 0 && (
                                <ul className="space-y-1">
                                    {saved.map((p) => (
                                        <li key={p.id} className="flex items-center gap-1">
                                            <button
                                                onClick={() => setText(p.steps.map(formatStep).join('\n'))}
                                                className="min-w-0 flex-1 truncate rounded-field px-2.5 py-1.5 text-left text-t-sm text-ink-muted transition-colors duration-fast ease-snap hover:bg-surface-raised hover:text-ink"
                                            >
                                                {p.name}
                                                <span className="ml-2 text-t-2xs text-ink-subtle">
                                                    {p.steps.length} sem.
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTemplate(p.id)}
                                                aria-label={`Eliminar ${p.name}`}
                                                className="shrink-0 rounded-field p-1.5 text-ink-faint transition-colors duration-fast ease-snap hover:text-danger-text"
                                            >
                                                <Trash2 size={14} aria-hidden="true" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* Vista previa resuelta */}
                <div className="space-y-3">
                    <p className="text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                        Cómo queda
                        {referenceMax && (
                            <span className="ml-2 font-normal normal-case tracking-normal text-ink-subtle">
                                sobre 1RM {referenceMax} kg
                            </span>
                        )}
                    </p>

                    <ul className="space-y-1">
                        {preview.map(({ step, resolved }, i) => (
                            <li
                                key={i}
                                className="flex items-baseline justify-between gap-3 rounded-field bg-surface-sunken px-3 py-2 text-t-sm"
                            >
                                <span className="shrink-0 text-ink-subtle">S{step.week}</span>
                                <span className="flex-1 text-right tabular-nums text-ink">
                                    {resolved.target_reps}
                                    {resolved.target_load != null && (
                                        <span className="ml-2 font-semibold">{resolved.target_load} kg</span>
                                    )}
                                    {resolved.target_rpe && (
                                        <span className="ml-2 font-semibold">{resolved.target_rpe}</span>
                                    )}
                                    {resolved.unresolved && (
                                        <span className="ml-2 text-t-2xs text-warning">sin 1RM</span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>

                    {/* Se avisa ANTES de aplicar, no después: aplicar y descubrir
                        que faltan las cargas obligaría a deshacerlo a mano. */}
                    {unresolvedCount > 0 && (
                        <p className="flex items-start gap-2 rounded-field bg-[var(--warning-quiet)] px-2.5 py-2 text-t-xs text-warning">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>
                                {unresolvedCount === 1 ? 'Una semana usa' : `${unresolvedCount} semanas usan`}{' '}
                                porcentaje y no hay 1RM de {exerciseName}. Se escribirán las series y
                                las repeticiones, pero sin kilos. Fija el 1RM y vuelve a aplicar.
                            </span>
                        </p>
                    )}
                </div>
            </div>

        </Modal>
    );
}
