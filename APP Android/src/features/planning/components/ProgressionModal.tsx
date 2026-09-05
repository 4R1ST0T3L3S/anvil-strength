import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import {
    defaultProgression,
    fitToWeeks,
    formatStep,
    stepsToText,
    parseProgressionText,
    resolveStep,
    daysOfProgression,
    type ProgressionStep,
} from '../../../lib/planning/progression';
import { progressionService, type ProgressionWithAuthor } from '../../../services/progressionService';
import { WEEKDAYS, type Weekday } from '../../../types/training';

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
 * el 1RM del atleta, para no tener que aplicar y deshacer para comprobarlo —
 * B8: texto para escribir rápido, rejilla para juzgar de un vistazo.
 *
 * V2 (30 ago 2026): FRECUENCIA. Con más de un día por semana, cada uno tiene
 * su propia progresión (texto con marcas "S<sem> D<día>:") y su propio día
 * de la semana — elegido AQUÍ, al aplicar, nunca guardado en la plantilla
 * (B7). Con frecuencia 1 no cambia nada de lo que ya había: el formato
 * simple, una línea por semana, se sigue leyendo igual.
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
    /**
     * Aplica la progresión. `frequency` y `dayToWeekday` solo importan
     * cuando `frequency > 1` — con 1 se aplica como siempre (sustituye lo
     * que ya hay, sin crear días).
     */
    onApply: (steps: ProgressionStep[], frequency: number, dayToWeekday: Record<number, Weekday>) => void;
}

const PLACEHOLDER_SIMPLE = `4x6 70%
4x6 75%
4x6 80%
3x5 60%`;

const PLACEHOLDER_MULTI = `S1 D1: 4x6 70%
S1 D2: 3x3 @8
S2 D1: 1x1 90% + 3x3 @7
S2 D2: 3x3 @8`;

function explainStorageError(err: unknown): string {
    const raw = (err as { message?: string })?.message ?? '';

    if (raw.includes('does not exist') || raw.includes('PGRST205') || raw.includes('schema cache')) {
        return 'falta la tabla de plantillas. Ejecuta database/MIGRACION_PENDIENTE.sql en Supabase.';
    }
    if (raw.includes('row-level security') || raw.includes('violates row-level')) {
        return 'el servidor ha rechazado la escritura por permisos.';
    }
    return raw || 'error desconocido';
}

export function ProgressionModal({
    isOpen, onClose, exerciseName, weekCount, referenceMax, coachId, onApply,
}: ProgressionModalProps) {
    const [frequency, setFrequency] = useState(1);
    const [text, setText] = useState(() => defaultProgression(weekCount).map(formatStep).join('\n'));
    const [dayToWeekday, setDayToWeekday] = useState<Record<number, Weekday>>({ 1: 'monday' });

    const [saved, setSaved] = useState<ProgressionWithAuthor[]>([]);
    const [templateName, setTemplateName] = useState('');
    const [storageError, setStorageError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        progressionService.list()
            .then((rows) => { setSaved(rows); setStorageError(null); })
            // Las plantillas guardadas son un atajo, no un requisito: si la
            // tabla aún no está migrada se puede escribir y aplicar la
            // progresión igual, así que esto avisa pero no bloquea nada.
            .catch((err) => setStorageError(explainStorageError(err)));
    }, [isOpen]);

    // Al cambiar la frecuencia, se completan los días que falten en el mapa
    // día→weekday con una propuesta razonable (lunes, miércoles, viernes…),
    // sin pisar lo que el coach ya haya elegido.
    const changeFrequency = (n: number) => {
        setFrequency(n);
        setDayToWeekday(prev => {
            const next = { ...prev };
            for (let d = 1; d <= n; d++) if (!next[d]) next[d] = SUGGESTED_WEEKDAYS[d - 1];
            return next;
        });
    };

    const { steps, errors } = useMemo(() => parseProgressionText(text), [text]);
    const fitted = useMemo(() => fitToWeeks(steps, weekCount, frequency), [steps, weekCount, frequency]);

    const preview = useMemo(
        () => fitted.map((step) => ({ step, resolved: resolveStep(step, referenceMax) })),
        [fitted, referenceMax]
    );

    const unresolvedCount = preview.filter((p) => p.resolved.unresolved).length;
    const daysInText = frequency > 1 ? daysOfProgression(steps).length : 1;

    const handleSaveTemplate = async () => {
        if (!coachId || !templateName.trim() || steps.length === 0) return;
        try {
            const created = await progressionService.save(coachId, templateName, steps, {
                movementName: exerciseName,
                frequency,
            });
            setSaved((prev) => [{ ...created, authorName: null }, ...prev.filter((p) => p.id !== created.id)]);
            setTemplateName('');
            setStorageError(null);
            toast.success('Progresión guardada — visible para todos los entrenadores');
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
            toast.error('No se pudo eliminar. Solo quien la creó puede borrarla.');
        }
    };

    const loadTemplate = (p: ProgressionWithAuthor) => {
        const freq = p.frequency ?? 1;
        setFrequency(freq);
        setText(stepsToText(p.steps, freq));
        setDayToWeekday(prev => {
            const next = { ...prev };
            for (let d = 1; d <= freq; d++) if (!next[d]) next[d] = SUGGESTED_WEEKDAYS[d - 1];
            return next;
        });
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            size="lg"
            title={`Progresión · ${exerciseName}`}
            description={
                frequency > 1
                    ? `Crea o sustituye ${exerciseName} en los días elegidos, todas las semanas del bloque.`
                    : `Sustituye las series de ${exerciseName} en todas las semanas donde aparezca.`
            }
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button
                        variant="primary"
                        disabled={steps.length === 0}
                        onClick={() => { onApply(fitted, frequency, dayToWeekday); onClose(); }}
                    >
                        Aplicar a {weekCount} {weekCount === 1 ? 'semana' : 'semanas'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                {/* FRECUENCIA — cuántos días por semana */}
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                        Días por semana
                    </span>
                    <div role="group" aria-label="Días por semana" className="flex rounded-field bg-surface-sunken p-0.5">
                        {[1, 2, 3, 4, 5].map(n => (
                            <button
                                key={n}
                                onClick={() => changeFrequency(n)}
                                aria-pressed={frequency === n}
                                className={`h-7 w-7 rounded-chip text-t-xs font-bold transition-colors duration-fast ease-snap ${frequency === n ? 'bg-brand text-brand-ink' : 'text-ink-subtle hover:text-ink'}`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* DÍAS DE LA SEMANA — B7, se elige aquí, no se guarda en la plantilla */}
                {frequency > 1 && (
                    <div className="flex flex-wrap items-center gap-2">
                        {Array.from({ length: frequency }, (_, i) => i + 1).map(d => (
                            <label key={d} className="flex items-center gap-1.5 text-t-2xs text-ink-subtle">
                                Día {d}
                                <select
                                    value={dayToWeekday[d] ?? ''}
                                    onChange={(e) => setDayToWeekday(prev => ({ ...prev, [d]: e.target.value as Weekday }))}
                                    aria-label={`Día de la semana del día ${d} de la progresión`}
                                    className="h-8 appearance-none rounded-chip border border-[var(--border-default)] bg-surface-sunken px-2 text-t-xs font-semibold text-ink focus:border-brand"
                                >
                                    {WEEKDAYS.map(w => (
                                        <option key={w.key} value={w.key} className="bg-surface-sunken text-ink">{w.label}</option>
                                    ))}
                                </select>
                            </label>
                        ))}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {/* Escritura */}
                    <div className="space-y-3">
                        <label className="block">
                            <span className="text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                {frequency > 1 ? 'Una línea por semana y día' : 'Una línea por semana'}
                            </span>
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                rows={Math.max(6, weekCount * (frequency > 1 ? daysInText || 1 : 1) + 1)}
                                spellCheck={false}
                                placeholder={frequency > 1 ? PLACEHOLDER_MULTI : PLACEHOLDER_SIMPLE}
                                className="mt-1.5 w-full resize-y rounded-field border border-[var(--border-default)] bg-surface-sunken p-3 font-mono text-t-sm text-ink transition-colors duration-fast ease-snap placeholder:text-ink-subtle focus:border-brand"
                            />
                        </label>

                        <p className="text-t-2xs leading-relaxed text-ink-subtle">
                            Formato: <span className="text-ink-subtle">4x6 70%</span> (porcentaje del 1RM),{' '}
                            <span className="text-ink-subtle">5x5 100kg</span>,{' '}
                            <span className="text-ink-subtle">3x5 @8</span> (RPE) o{' '}
                            <span className="text-ink-subtle">5x5</span> sin carga.
                            {frequency > 1 && <> Con "S1 D2:" delante y "+" para varios escalones el mismo día.</>}
                            {' '}Si escribes menos líneas que semanas, la última se repite.
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

                        {/* Plantillas guardadas — visibles para TODOS los entrenadores (B9) */}
                        {coachId && (
                            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
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
                                                    onClick={() => loadTemplate(p)}
                                                    className="min-w-0 flex-1 truncate rounded-field px-2.5 py-1.5 text-left text-t-sm text-ink-muted transition-colors duration-fast ease-snap hover:bg-surface-raised hover:text-ink"
                                                >
                                                    {p.name}
                                                    <span className="ml-2 text-t-2xs text-ink-subtle">
                                                        {(p.frequency ?? 1) > 1 ? `${p.frequency}d/sem` : `${p.steps.length} sem.`}
                                                        {p.authorName && ` · ${p.authorName}`}
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

                    {/* Vista previa resuelta — B8: la rejilla, para juzgar de un vistazo */}
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
                                    <span className="shrink-0 text-ink-subtle">
                                        S{step.week}{frequency > 1 && ` D${step.day ?? 1}`}
                                    </span>
                                    <span className="flex-1 text-right tabular-nums text-ink">
                                        {resolved.target_reps}
                                        {resolved.target_load != null && (
                                            <span className="ml-2 font-semibold">{resolved.target_load} kg</span>
                                        )}
                                        {/* El % USADO, junto a los kilos — B1. No se recalcula
                                            solo si el 1RM cambia después: es una foto de lo
                                            aplicado, no una fórmula viva. */}
                                        {resolved.appliedPercent != null && (
                                            <span className="ml-1.5 text-t-2xs text-ink-subtle">· {resolved.appliedPercent}%</span>
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

                        {unresolvedCount > 0 && (
                            <p className="flex items-start gap-2 rounded-field bg-[var(--warning-quiet)] px-2.5 py-2 text-t-xs text-warning">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>
                                    {unresolvedCount === 1 ? 'Un escalón usa' : `${unresolvedCount} escalones usan`}{' '}
                                    porcentaje y no hay 1RM de {exerciseName}. Se escribirán las series y
                                    las repeticiones, pero sin kilos. Fija el 1RM y vuelve a aplicar.
                                </span>
                            </p>
                        )}

                        {frequency > 1 && (
                            <p className="text-t-2xs leading-relaxed text-ink-faint">
                                Si el día elegido no existe todavía en alguna semana, se crea. Si ya
                                tiene {exerciseName} programado, se pregunta antes de sustituirlo.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

const SUGGESTED_WEEKDAYS: Weekday[] = ['monday', 'wednesday', 'friday', 'tuesday', 'thursday', 'saturday', 'sunday'];
