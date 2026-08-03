import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, FileSpreadsheet, Loader, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { vbtService } from '../../../services/vbtService';
import { trainingService } from '../../../services/trainingService';
import { parseVbtFile, type ParsedVbtFile } from '../../../lib/vbt/csv';
import { mvtForExercise, velocityLoss } from '../../../lib/vbt/analysis';
import type { VbtSource } from '../../../types/training';
import { transition, DURATION } from '../../../lib/motion';
import { cn } from '../../../lib/utils';

/**
 * AÑADIR MEDICIONES VBT A MANO
 * =====================================================================
 *
 * POR QUÉ HACE FALTA
 *
 * Hasta ahora la única forma de que existiera un dato de velocidad era que el
 * atleta subiera un CSV desde su pantalla de entrenamiento, colgado de una
 * serie ya programada. Eso deja fuera el caso más común de todos: el perfil
 * de cargas. Un perfil son cinco o seis series del mismo ejercicio a cargas
 * crecientes, hechas una tarde, normalmente SIN bloque abierto y con el
 * encoder dando los números en su propia pantalla.
 *
 * DOS FORMAS DE ENTRAR, LA MISMA SALIDA
 *
 *   · Un CSV con varias series dentro → se leen todas y se proponen como
 *     filas editables. Es lo que exporta cualquier encoder tras una sesión.
 *   · Filas escritas a mano → carga y velocidad por serie. Es lo que se hace
 *     cuando el aparato no exporta nada.
 *
 * LA CARGA ES OBLIGATORIA, la velocidad también. Sin las dos, la medición no
 * entra en el perfil carga-velocidad, que es su razón de ser; guardarla sería
 * ocupar sitio con una fila que ninguna gráfica puede usar.
 */

interface DraftRow {
    key: string;
    setNumber: number;
    loadKg: string;
    reps: string;
    meanVelocity: string;
    peakVelocity: string;
    loss: string;
    repVelocities: number[] | null;
}

let rowSeq = 0;
const newRow = (setNumber: number): DraftRow => ({
    key: `row-${rowSeq++}`,
    setNumber,
    loadKg: '',
    reps: '',
    meanVelocity: '',
    peakVelocity: '',
    loss: '',
    repVelocities: null,
});

function num(value: string): number | null {
    if (!value.trim()) return null;
    const n = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

export interface AddMeasurementModalProps {
    open: boolean;
    onClose: () => void;
    athleteId: string;
    createdBy?: string | null;
    /** Ejercicio ya elegido en la pantalla, si lo hay. */
    defaultExercise?: string;
    onSaved: () => void;
}

export function AddMeasurementModal({
    open,
    onClose,
    athleteId,
    createdBy,
    defaultExercise,
    onSaved,
}: AddMeasurementModalProps) {
    const [exerciseName, setExerciseName] = useState(defaultExercise ?? '');
    const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 10));
    const [source, setSource] = useState<VbtSource>('encoder');
    const [notes, setNotes] = useState('');
    const [rows, setRows] = useState<DraftRow[]>([newRow(1)]);
    const [file, setFile] = useState<File | null>(null);
    const [parsing, setParsing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [library, setLibrary] = useState<string[]>([]);

    // La biblioteca sirve de autocompletado: escribir "sentadila" mal una vez
    // parte el historial del ejercicio en dos para siempre.
    useEffect(() => {
        if (!open) return;
        trainingService.getExerciseLibrary()
            .then(list => setLibrary(list.map(e => e.name)))
            .catch(() => setLibrary([]));
    }, [open]);

    // El ejercicio por defecto se toma en el estado inicial, no con un efecto:
    // el diálogo se monta al abrirse, así que ya llega con el valor puesto.
    const mvt = useMemo(() => mvtForExercise(exerciseName), [exerciseName]);

    if (!open) return null;

    const readFile = async (picked: File) => {
        setParsing(true);
        try {
            const parsed: ParsedVbtFile = await parseVbtFile(picked);

            if (parsed.rowCount === 0) {
                toast.error(
                    'No se ha reconocido ninguna columna de velocidad. Revisa que el ' +
                    'archivo tenga cabecera y una columna tipo "Vm", "Avg Vel" o "Velocidad media".'
                );
                return;
            }

            setFile(picked);
            setSource('encoder');
            setRows(parsed.sets.map((s, i) => ({
                key: `parsed-${rowSeq++}`,
                setNumber: s.setNumber || i + 1,
                loadKg: s.loadKg != null && s.loadKg > 0 ? String(s.loadKg) : '',
                reps: String(s.reps),
                meanVelocity: s.metrics.meanVelocity?.toFixed(3) ?? '',
                peakVelocity: s.metrics.peakVelocity?.toFixed(3) ?? '',
                loss: s.metrics.velocityLoss?.toFixed(1) ?? '',
                repVelocities: s.repVelocities,
            })));

            toast.success(
                `Leídas ${parsed.sets.length} ${parsed.sets.length === 1 ? 'serie' : 'series'} ` +
                `(${parsed.rowCount} repeticiones)`
            );
        } catch (err) {
            console.error(err);
            toast.error('No se pudo leer el archivo');
        } finally {
            setParsing(false);
        }
    };

    const updateRow = (key: string, patch: Partial<DraftRow>) => {
        setRows(prev => prev.map(r => {
            if (r.key !== key) return r;
            const next = { ...r, ...patch };
            // Si se editan las velocidades a mano, la pérdida deja de venir
            // del archivo y se recalcula sola cuando se puede.
            if (patch.repVelocities === undefined && next.repVelocities && patch.meanVelocity !== undefined) {
                next.repVelocities = null;
            }
            return next;
        }));
    };

    const usable = rows.filter(r => num(r.loadKg) !== null && num(r.meanVelocity) !== null);

    const save = async () => {
        if (!exerciseName.trim()) {
            toast.error('Escribe de qué ejercicio son estas series');
            return;
        }
        if (usable.length === 0) {
            toast.error('Cada serie necesita al menos carga y velocidad media');
            return;
        }

        setSaving(true);
        try {
            // El archivo se sube UNA vez y se comparte entre las series que
            // salieron de él: son la misma medición partida en filas.
            let fileUrl: string | null = null;
            if (file) {
                try {
                    fileUrl = await vbtService.uploadFile(athleteId, file);
                } catch (err) {
                    console.warn('No se pudo subir el archivo, se guardan los números igual:', err);
                    toast.warning('El archivo no se ha podido subir, pero los datos sí se guardan');
                }
            }

            for (const row of usable) {
                const loss = num(row.loss) ?? velocityLoss(row.repVelocities);
                await vbtService.saveMeasurement({
                    athleteId,
                    createdBy,
                    exerciseName: exerciseName.trim(),
                    performedAt,
                    setNumber: row.setNumber,
                    reps: num(row.reps),
                    loadKg: num(row.loadKg),
                    metrics: {
                        meanVelocity: num(row.meanVelocity),
                        peakVelocity: num(row.peakVelocity),
                        velocityLoss: loss,
                        est1RM: null,
                    },
                    repVelocities: row.repVelocities,
                    fileUrl,
                    source,
                    notes: notes.trim() || null,
                });
            }

            toast.success(
                `${usable.length} ${usable.length === 1 ? 'serie guardada' : 'series guardadas'} en ${exerciseName.trim()}`
            );
            onSaved();
            onClose();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudieron guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition(DURATION.fast)}
                className="fixed inset-0 z-[250] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: 24, scale: 0.98 }}
                    animate={{ y: 0, scale: 1 }}
                    exit={{ y: 24, scale: 0.98 }}
                    transition={transition(DURATION.base)}
                    onClick={e => e.stopPropagation()}
                    className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-card border border-subtle bg-surface-raised shadow-overlay sm:rounded-card"
                >
                    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-subtle px-4 py-3">
                        <div>
                            <h3 className="text-t-sm font-bold text-ink">Añadir series medidas</h3>
                            <p className="mt-0.5 text-t-2xs text-ink-subtle">
                                Sube el archivo del encoder o escribe las series a mano.
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="rounded-field p-1.5 text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                        >
                            <X size={16} />
                        </button>
                    </header>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                        {/* Contexto común a todas las series */}
                        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                            <div>
                                <Label>Ejercicio</Label>
                                <input
                                    value={exerciseName}
                                    onChange={e => setExerciseName(e.target.value)}
                                    list="vbt-exercise-library"
                                    placeholder="Sentadilla"
                                    className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 text-t-sm text-ink outline-none focus:border-brand"
                                />
                                <datalist id="vbt-exercise-library">
                                    {library.map(name => <option key={name} value={name} />)}
                                </datalist>
                            </div>
                            <div>
                                <Label>Fecha</Label>
                                <input
                                    type="date"
                                    value={performedAt}
                                    onChange={e => setPerformedAt(e.target.value)}
                                    className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-2 text-t-sm text-ink outline-none focus:border-brand"
                                />
                            </div>
                            <div>
                                <Label>Origen</Label>
                                <select
                                    value={source}
                                    onChange={e => setSource(e.target.value as VbtSource)}
                                    className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-2 text-t-sm text-ink outline-none focus:border-brand"
                                >
                                    <option value="encoder">Encoder</option>
                                    <option value="video">Vídeo</option>
                                    <option value="manual">Manual</option>
                                </select>
                            </div>
                        </div>

                        <label
                            className={cn(
                                'flex cursor-pointer items-center justify-center gap-2 rounded-field border border-dashed px-3 py-3 text-t-xs font-semibold transition-colors duration-fast',
                                file
                                    ? 'border-[var(--brand-line)] bg-[var(--brand-quiet)] text-brand'
                                    : 'border-[var(--border-default)] text-ink-muted hover:bg-surface-overlay hover:text-ink'
                            )}
                        >
                            {parsing
                                ? <Loader size={14} className="animate-spin" />
                                : file ? <FileSpreadsheet size={14} /> : <UploadCloud size={14} />}
                            {file ? `${file.name} · cambiar` : 'Subir CSV del encoder (rellena las series solo)'}
                            <input
                                type="file"
                                accept=".csv,.txt,.vbt,.xlsx"
                                className="hidden"
                                onChange={e => {
                                    const picked = e.target.files?.[0];
                                    e.target.value = '';
                                    if (picked) void readFile(picked);
                                }}
                            />
                        </label>

                        {/* Las series */}
                        <div className="-mx-1 overflow-x-auto">
                            <table className="w-full min-w-[36rem] border-collapse text-t-xs">
                                <thead>
                                    <tr className="text-ink-subtle">
                                        <th className="px-1 py-1.5 text-left font-medium">Serie</th>
                                        <th className="px-1 py-1.5 text-left font-medium">Carga (kg)</th>
                                        <th className="px-1 py-1.5 text-left font-medium">Reps</th>
                                        <th className="px-1 py-1.5 text-left font-medium">Vel. media</th>
                                        <th className="px-1 py-1.5 text-left font-medium">Vel. pico</th>
                                        <th className="px-1 py-1.5 text-left font-medium">Pérdida %</th>
                                        <th className="w-8" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => {
                                        const v = num(row.meanVelocity);
                                        // Una velocidad por debajo del MVT del ejercicio es
                                        // físicamente posible pero rarísima: casi siempre es
                                        // un dígito de más o una unidad equivocada.
                                        const suspicious = v != null && (v < mvt * 0.6 || v > 2.5);

                                        return (
                                            <tr key={row.key} className="border-t border-[var(--border-subtle)]">
                                                <td className="px-1 py-1 text-ink-muted tabular-nums">{row.setNumber}</td>
                                                <td className="px-1 py-1">
                                                    <Cell value={row.loadKg} onChange={v => updateRow(row.key, { loadKg: v })} placeholder="140" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <Cell value={row.reps} onChange={v => updateRow(row.key, { reps: v })} placeholder="3" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <Cell
                                                        value={row.meanVelocity}
                                                        onChange={v => updateRow(row.key, { meanVelocity: v })}
                                                        placeholder="0.52"
                                                        warn={suspicious}
                                                    />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <Cell value={row.peakVelocity} onChange={v => updateRow(row.key, { peakVelocity: v })} placeholder="0.80" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <Cell value={row.loss} onChange={v => updateRow(row.key, { loss: v })} placeholder="12" />
                                                </td>
                                                <td className="px-1 py-1 text-right">
                                                    {rows.length > 1 && (
                                                        <button
                                                            onClick={() => setRows(prev => prev.filter(r => r.key !== row.key))}
                                                            aria-label={`Quitar la serie ${row.setNumber}`}
                                                            className="p-1 text-ink-faint transition-colors hover:text-danger"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <button
                            onClick={() => setRows(prev => [...prev, newRow(prev.length + 1)])}
                            className="flex w-full items-center justify-center gap-1.5 rounded-field border border-dashed border-[var(--border-default)] py-2 text-t-2xs font-semibold text-ink-subtle transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                        >
                            <Plus size={12} aria-hidden="true" /> Otra serie
                        </button>

                        <div>
                            <Label>Nota <span className="font-normal normal-case opacity-70">(opcional)</span></Label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={2}
                                placeholder="Perfil de cargas antes del bloque de fuerza…"
                                className="w-full resize-none rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-xs text-ink outline-none focus:border-brand"
                            />
                        </div>

                        <p className="rounded-field bg-surface-sunken px-3 py-2 text-t-2xs leading-relaxed text-ink-subtle">
                            Para el perfil carga-velocidad hacen falta al menos <strong className="text-ink">tres cargas
                            distintas</strong>. Con dos, la recta pasa exacta por ambos puntos y el ajuste parece
                            perfecto sin serlo. Cuatro o cinco entre el 45% y el 90% dan una estimación
                            razonable sin tener que probar el máximo.
                        </p>
                    </div>

                    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-subtle px-4 py-3">
                        <span className="text-t-2xs tabular-nums text-ink-subtle">
                            {usable.length} de {rows.length} series completas
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="rounded-field px-3 py-2 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={save}
                                disabled={saving || usable.length === 0}
                                className="flex items-center gap-1.5 rounded-field bg-brand px-4 py-2 text-t-2xs font-bold text-brand-ink transition-colors duration-fast hover:opacity-90 disabled:opacity-50"
                            >
                                {saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                                Guardar
                            </button>
                        </div>
                    </footer>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return (
        <p className="mb-1 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">{children}</p>
    );
}

function Cell({
    value, onChange, placeholder, warn,
}: {
    value: string; onChange: (v: string) => void; placeholder: string; warn?: boolean;
}) {
    return (
        <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            title={warn ? 'Ese valor queda muy fuera del rango habitual. ¿Unidades correctas?' : undefined}
            className={cn(
                'h-8 w-full rounded-field border bg-surface-sunken px-2 text-center text-t-xs tabular-nums text-ink outline-none transition-colors duration-fast [appearance:textfield] focus:border-brand [&::-webkit-inner-spin-button]:appearance-none',
                warn ? 'border-[var(--warning)]' : 'border-[var(--border-default)]'
            )}
        />
    );
}
