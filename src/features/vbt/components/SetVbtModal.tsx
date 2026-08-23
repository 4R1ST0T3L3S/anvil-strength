import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Activity, Check, Loader, Trash2, UploadCloud, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { vbtService } from '../../../services/vbtService';
import { SetVideoAnalysisModal } from './SetVideoAnalysisModal';
import { parseVbtFile } from '../../../lib/vbt/csv';
import { mvtForExercise, rirFromVelocityLoss, velocityZone } from '../../../lib/vbt/analysis';
import type { TrainingSet, VbtMetrics, VbtSource } from '../../../types/training';
import { transition, DURATION } from '../../../lib/motion';
import { cn } from '../../../lib/utils';

/**
 * DATOS DE VELOCIDAD DE UNA SERIE
 * =====================================================================
 *
 * Lo mismo lo usa el entrenador desde el planificador y el atleta desde el
 * registro, porque la operación es idéntica: esta serie se movió a tanto.
 * Quién lo mide cambia según el gimnasio —el encoder puede estar en la barra
 * del atleta o en el móvil del coach— y hacer dos pantallas distintas solo
 * garantizaría que una de las dos se quedara atrás.
 *
 * DOS CAMINOS, UN RESULTADO
 *
 *   · Subir el CSV del encoder. Se lee en el navegador y rellena las
 *     casillas; el fichero queda guardado para poder volver a la gráfica
 *     completa, que es lo que ninguna cifra resumida sustituye.
 *   · Escribir la velocidad a mano. Es lo que se hace cuando el dato se lee
 *     en la pantalla del aparato y no hay exportación.
 *
 * En los dos casos acaba en las mismas columnas de la serie y en una fila de
 * `vbt_measurements`, así que el perfil carga-velocidad los mezcla sin
 * distinguirlos —salvo por `source`, que sí se conserva: un dato de encoder
 * y uno estimado de un vídeo no merecen la misma confianza.
 */

export interface SetVbtModalProps {
    open: boolean;
    onClose: () => void;
    athleteId: string;
    /** Quién está registrando. Va a `created_by`. */
    createdBy?: string | null;
    exerciseName: string;
    exerciseId?: string | null;
    sessionExerciseId?: string | null;
    set: TrainingSet;
    /** Número visible de la serie dentro del ejercicio, empezando en 1. */
    setNumber: number;
    /** Se llama con las métricas guardadas para refrescar la pantalla. */
    onSaved?: (metrics: VbtMetrics, source: VbtSource, fileUrl: string | null) => void;
}

/** Texto a número admitiendo coma decimal, que es como se teclea en español. */
function num(value: string): number | null {
    if (!value.trim()) return null;
    const n = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

export function SetVbtModal({
    open,
    onClose,
    athleteId,
    createdBy,
    exerciseName,
    exerciseId,
    sessionExerciseId,
    set,
    setNumber,
    onSaved,
}: SetVbtModalProps) {
    const [meanVelocity, setMeanVelocity] = useState(set.vbt_mean_velocity?.toString() ?? '');
    const [peakVelocity, setPeakVelocity] = useState(set.vbt_peak_velocity?.toString() ?? '');
    const [loss, setLoss] = useState(set.vbt_velocity_loss?.toString() ?? '');
    const [rom, setRom] = useState(set.vbt_rom?.toString() ?? '');
    const [power, setPower] = useState(set.vbt_mean_power?.toString() ?? '');
    const [source, setSource] = useState<VbtSource>(set.vbt_source ?? 'manual');
    const [fileUrl, setFileUrl] = useState<string | null>(set.vbt_file_url ?? null);
    const [repVelocities, setRepVelocities] = useState<number[] | null>(null);
    const [busy, setBusy] = useState(false);
    /** El analizador de vídeo, abierto sobre ESTA serie. */
    const [videoOpen, setVideoOpen] = useState(false);

    /**
     * La carga con la que se asocia la medición.
     *
     * Manda la MOVIDA sobre la pautada, y la pautada solo si iba en kilos:
     * una serie prescrita a 0,45 m/s tiene un `target_load` de 0,45 que no
     * son kilos, y meterlo en un perfil carga-velocidad lo destrozaría.
     */
    const loadKg =
        set.actual_load ??
        ((set.target_metric ?? 'kg') === 'kg' ? set.target_load ?? null : null);

    if (!open) return null;

    const handleFile = async (file: File) => {
        setBusy(true);
        try {
            const parsed = await parseVbtFile(file);

            if (parsed.rowCount === 0) {
                toast.error('No se ha reconocido ninguna columna de velocidad en el archivo');
                return;
            }

            // Un fichero puede traer varias series. Se toma la que coincide con
            // el número de esta serie y, si no existe, el resumen del fichero
            // entero: es preferible rellenar con algo verificable a dejar las
            // casillas vacías y que el coach tenga que abrir el CSV aparte.
            const match = parsed.sets.find(s => s.setNumber === setNumber) ?? parsed.sets[0];
            const metrics = match?.metrics ?? parsed.overall;

            setMeanVelocity(metrics.meanVelocity?.toFixed(3) ?? '');
            setPeakVelocity(metrics.peakVelocity?.toFixed(3) ?? '');
            setLoss(metrics.velocityLoss?.toFixed(1) ?? '');
            setRom(metrics.rom?.toFixed(3) ?? '');
            setPower(metrics.meanPower?.toFixed(0) ?? '');
            setRepVelocities(match?.repVelocities ?? null);
            setSource('encoder');

            const url = await vbtService.uploadFile(athleteId, file);
            setFileUrl(url);

            toast.success(
                parsed.sets.length > 1
                    ? `Archivo leído · ${parsed.sets.length} series, se ha usado la ${match?.setNumber ?? 1}`
                    : `Archivo leído · ${match?.reps ?? parsed.rowCount} repeticiones`
            );
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo leer el archivo');
        } finally {
            setBusy(false);
        }
    };

    const metrics: VbtMetrics = {
        meanVelocity: num(meanVelocity),
        peakVelocity: num(peakVelocity),
        velocityLoss: num(loss),
        meanPower: num(power),
        peakPower: null,
        rom: num(rom),
        est1RM: null,
    };

    /**
     * 1RM estimado con la ecuación general a partir de la velocidad de ESTA
     * serie. Es una estimación de una sola medición: sirve para contextualizar
     * el número mientras se escribe, no sustituye al perfil de varias cargas
     * que se calcula en la pestaña VBT.
     */
    const estimated1RM = (() => {
        const v = metrics.meanVelocity;
        if (!v || v <= 0 || !loadKg || loadKg <= 0) return null;
        const mvt = mvtForExercise(exerciseName);
        // Ecuación cuadrática de González-Badillo acotada al rango en el que
        // predice algo: fuera de él devuelve porcentajes imposibles.
        const clamped = Math.max(mvt, Math.min(v, 1.5));
        const pct = Math.min(100, Math.max(40, 8.4326 * clamped ** 2 - 73.501 * clamped + 112.33));
        return Math.round((loadKg / (pct / 100)) * 10) / 10;
    })();

    const save = async () => {
        if (metrics.meanVelocity === null && !fileUrl) {
            toast.error('Escribe al menos la velocidad media, o sube el archivo del encoder');
            return;
        }

        setBusy(true);
        try {
            await vbtService.saveMeasurement({
                athleteId,
                createdBy,
                exerciseName,
                exerciseId,
                trainingSetId: set.id,
                sessionExerciseId,
                setNumber,
                reps: set.actual_reps ?? null,
                loadKg,
                metrics: { ...metrics, est1RM: estimated1RM },
                repVelocities,
                fileUrl,
                source,
            });

            toast.success('Datos VBT guardados en la serie');
            onSaved?.({ ...metrics, est1RM: estimated1RM }, source, fileUrl);
            onClose();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudieron guardar los datos');
        } finally {
            setBusy(false);
        }
    };

    const clear = async () => {
        setBusy(true);
        try {
            await vbtService.clearSetMetrics(set.id);
            toast.success('Datos VBT borrados de la serie');
            onSaved?.({}, 'manual', null);
            onClose();
        } catch (err) {
            console.error(err);
            toast.error('No se pudieron borrar');
        } finally {
            setBusy(false);
        }
    };

    const zone = metrics.meanVelocity ? velocityZone(metrics.meanVelocity) : null;
    const rir = rirFromVelocityLoss(metrics.velocityLoss ?? null);

    return (
        <AnimatePresence>
            <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition(DURATION.fast)}
                className="fixed inset-0 z-[240] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
                onClick={onClose}
            >
                <m.div
                    initial={{ y: 24, scale: 0.98 }}
                    animate={{ y: 0, scale: 1 }}
                    exit={{ y: 24, scale: 0.98 }}
                    transition={transition(DURATION.base)}
                    onClick={e => e.stopPropagation()}
                    className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-card border border-subtle bg-surface-raised shadow-overlay sm:rounded-card"
                >
                    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-subtle px-4 py-3">
                        <div className="min-w-0">
                            <h3 className="flex items-center gap-2 text-t-sm font-bold text-ink">
                                <Activity size={15} className="shrink-0 text-brand" aria-hidden="true" />
                                Velocidad · Serie {setNumber}
                            </h3>
                            <p className="mt-0.5 truncate text-t-2xs text-ink-subtle">
                                {exerciseName}
                                {loadKg ? ` · ${loadKg} kg` : ''}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="shrink-0 rounded-field p-1.5 text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                        >
                            <X size={16} />
                        </button>
                    </header>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                        {/* ANALIZAR UN VÍDEO va el primero de todo.
                            Es el camino que más da por menos trabajo: de un
                            vídeo salen quince métricas, frente a las cinco que
                            se teclean a mano aquí abajo — y sin margen de error
                            al copiarlas. El CSV del encoder es mejor dato, pero
                            hay que tener encoder; un móvil lo tiene cualquiera. */}
                        <button
                            type="button"
                            onClick={() => setVideoOpen(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-field bg-brand px-3 py-3 text-t-xs font-bold text-brand-ink transition-colors duration-fast ease-snap hover:opacity-90"
                        >
                            <Video size={14} aria-hidden="true" />
                            Analizar un vídeo de esta serie
                        </button>

                        {/* Subir el archivo va PRIMERO: cuando existe, es la vía
                            buena, y rellenar a mano lo que un fichero ya trae es
                            trabajo repetido con margen de error. */}
                        <label
                            className={cn(
                                'flex cursor-pointer items-center justify-center gap-2 rounded-field border border-dashed px-3 py-3 text-t-xs font-semibold transition-colors duration-fast',
                                fileUrl
                                    ? 'border-[var(--success-line,var(--border-default))] bg-[var(--success-quiet)] text-success'
                                    : 'border-[var(--border-default)] text-ink-muted hover:bg-surface-overlay hover:text-ink'
                            )}
                        >
                            {busy ? <Loader size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                            {fileUrl ? 'Archivo adjunto · cambiar' : 'Subir archivo del encoder (.csv)'}
                            <input
                                type="file"
                                accept=".csv,.txt,.vbt,.xlsx"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (file) void handleFile(file);
                                }}
                            />
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                            <Field
                                label="Vel. media"
                                unit="m/s"
                                value={meanVelocity}
                                onChange={setMeanVelocity}
                                placeholder="0.45"
                                emphasis
                            />
                            <Field
                                label="Vel. pico"
                                unit="m/s"
                                value={peakVelocity}
                                onChange={setPeakVelocity}
                                placeholder="0.72"
                            />
                            <Field
                                label="Pérdida"
                                unit="%"
                                value={loss}
                                onChange={setLoss}
                                placeholder="18"
                            />
                            <Field
                                label="Potencia media"
                                unit="W"
                                value={power}
                                onChange={setPower}
                                placeholder="620"
                            />
                            <Field
                                label="Recorrido"
                                unit="m"
                                value={rom}
                                onChange={setRom}
                                placeholder="0.52"
                            />
                            <div>
                                <p className="mb-1 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                    Origen
                                </p>
                                <select
                                    value={source}
                                    onChange={e => setSource(e.target.value as VbtSource)}
                                    className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-2 text-t-xs text-ink focus:border-brand"
                                >
                                    <option value="encoder">Encoder</option>
                                    <option value="video">Vídeo (PWR)</option>
                                    <option value="manual">Manual</option>
                                </select>
                            </div>
                        </div>

                        {/* Lectura del número, no solo el número.
                            "0,42 m/s" no dice nada por sí solo; "zona de fuerza
                            máxima, ~92% del máximo" sí, y es lo que decide si la
                            serie siguiente sube o baja. */}
                        {(zone || rir || estimated1RM) && (
                            <div className="space-y-1.5 rounded-field bg-surface-sunken px-3 py-2.5">
                                {zone && (
                                    <p className="flex items-center justify-between gap-3 text-t-2xs">
                                        <span className="text-ink-subtle">Zona</span>
                                        <span className="font-semibold" style={{ color: zone.color }}>
                                            {zone.label} <span className="opacity-70">· {zone.hint}</span>
                                        </span>
                                    </p>
                                )}
                                {rir && (
                                    <p className="flex items-center justify-between gap-3 text-t-2xs">
                                        <span className="text-ink-subtle">RIR estimado por la pérdida</span>
                                        <span className="font-semibold text-ink">{rir}</span>
                                    </p>
                                )}
                                {estimated1RM && (
                                    <p className="flex items-center justify-between gap-3 text-t-2xs">
                                        <span className="text-ink-subtle">1RM estimado (esta serie)</span>
                                        <span className="font-semibold text-ink tabular-nums">{estimated1RM} kg</span>
                                    </p>
                                )}
                            </div>
                        )}

                        {repVelocities && repVelocities.length > 1 && (
                            <div>
                                <p className="mb-1.5 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                    Repeticiones leídas del archivo
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    {repVelocities.map((v, i) => (
                                        <span
                                            key={i}
                                            className="rounded-chip bg-surface-sunken px-1.5 py-0.5 text-[10px] tabular-nums text-ink-muted"
                                        >
                                            {v.toFixed(2)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-subtle px-4 py-3">
                        {set.vbt_mean_velocity != null ? (
                            <button
                                onClick={clear}
                                disabled={busy}
                                className="flex items-center gap-1.5 rounded-field px-2.5 py-2 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:bg-[var(--danger-quiet)] hover:text-danger disabled:opacity-50"
                            >
                                <Trash2 size={13} aria-hidden="true" /> Borrar
                            </button>
                        ) : <span />}

                        <button
                            onClick={save}
                            disabled={busy}
                            className="flex items-center gap-1.5 rounded-field bg-brand px-4 py-2 text-t-2xs font-bold text-brand-ink transition-colors duration-fast hover:opacity-90 disabled:opacity-50"
                        >
                            {busy ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                            Guardar
                        </button>
                    </footer>
                </m.div>
            </m.div>

            {/* El analizador guarda por su cuenta directamente en la serie, así
                que al volver ya no hay nada que teclear aquí: se cierran los
                dos. Dejar este diálogo abierto con las casillas vacías haría
                pensar que el análisis no se ha guardado. */}
            <SetVideoAnalysisModal
                open={videoOpen}
                onClose={() => setVideoOpen(false)}
                athleteId={athleteId}
                createdBy={createdBy}
                exerciseName={exerciseName}
                exerciseId={exerciseId}
                sessionExerciseId={sessionExerciseId}
                set={set}
                setNumber={setNumber}
                onSaved={(saved, savedSource) => {
                    onSaved?.(saved, savedSource, null);
                    onClose();
                }}
            />
        </AnimatePresence>
    );
}

function Field({
    label,
    unit,
    value,
    onChange,
    placeholder,
    emphasis,
}: {
    label: string;
    unit: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    emphasis?: boolean;
}) {
    return (
        <div>
            <p className="mb-1 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                {label} <span className="font-normal normal-case opacity-70">{unit}</span>
            </p>
            <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn(
                    'h-9 w-full rounded-field border bg-surface-sunken px-2 text-center text-t-sm font-semibold tabular-nums text-ink transition-colors duration-fast [appearance:textfield] focus:border-brand [&::-webkit-inner-spin-button]:appearance-none',
                    emphasis ? 'border-[var(--brand-line)]' : 'border-[var(--border-default)]'
                )}
            />
        </div>
    );
}
