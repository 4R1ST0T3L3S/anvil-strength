import { useMemo, useState } from 'react';
import { AlertTriangle, Check, FileUp, Loader, Ruler, X } from 'lucide-react';
import { toast } from 'sonner';
import { parseVbtFile, type ParsedVbtFile } from '../../../../lib/vbt/csv';
import {
    COMPARED_METRICS,
    agreementVerdict,
    buildAgreementReport,
    type MeasuredRep,
    type ReferenceRep,
} from '../../../../lib/calibration/agreement';
import { calibrationService } from '../../../../services/calibrationService';
import { PWR_ENGINE_VERSION_CODE } from '../../../../lib/cv/engineVersion';
import { EXERCISE_LABEL, barMassMetric } from '../../../../lib/cv/pwrSetup';
import type { PwrResult } from './MetricsDashboard';

/**
 * ANVIL STRENGTH — CALIBRAR PWR CONTRA UN ENCODER (Fases 9 y 10)
 * =====================================================================
 *
 * QUÉ CONTESTA, Y POR QUÉ NO SE PODÍA CONTESTAR ANTES
 *
 * Todo el analizador está medido contra repeticiones SINTÉTICAS, y eso
 * demuestra que las matemáticas son correctas: se construye una repetición de
 * verdad conocida y se comprueba que el filtrado, la derivación y la
 * segmentación la recuperan. Lo que un sintético no puede tocar es la cadena
 * entera en un gimnasio real — la cámara, el códec, la detección del disco, el
 * flujo óptico con gente moviéndose al fondo.
 *
 * Por eso hay una frase que hasta ahora no se podía decir:
 *
 *     «una medición con 82 de calidad tiene ±3% de error»
 *
 * Aquí se graba la MISMA serie con vídeo y con encoder, se contrastan
 * repetición a repetición, y el resultado se guarda. Con suficientes sesiones,
 * los pesos de `quality.ts` dejan de ser criterio razonado y pasan a ser una
 * cifra medida — que es lo único que puede cerrar la última salvedad abierta
 * del módulo.
 *
 *
 * LO QUE ESTA PANTALLA **NO** HACE
 *
 * No cambia ni un peso de `quality.ts`, ni corrige ninguna medición por el
 * sesgo que encuentre. Con dos o tres sesiones eso sería ajustar el algoritmo a
 * un puñado de repeticiones de un atleta con una cámara: se cambiaría un sesgo
 * conocido por otro desconocido. Aquí se RECOGE la evidencia; corregir con ella
 * es una decisión posterior y con datos suficientes delante.
 */

// =====================================================================
// PIEZAS
// =====================================================================

const TONE = {
    good: { text: 'text-success', label: 'Buen acuerdo' },
    fair: { text: 'text-warning', label: 'Acuerdo aceptable' },
    poor: { text: 'text-danger-text', label: 'Desacuerdo alto' },
    unknown: { text: 'text-ink-faint', label: 'Sin datos' },
} as const;

function fmt(value: number | null | undefined, decimals: number): string {
    return value == null || !Number.isFinite(value) ? '—' : value.toFixed(decimals);
}

// =====================================================================
// EL DIÁLOGO
// =====================================================================

export interface CalibrationModalProps {
    open: boolean;
    onClose: () => void;
    /** El análisis de PWR que se va a contrastar. */
    result: PwrResult;
    athleteId: string | null | undefined;
    coachId?: string | null;
}

export function CalibrationModal({ open, onClose, result, athleteId, coachId }: CalibrationModalProps) {
    const [device, setDevice] = useState('');
    const [parsed, setParsed] = useState<ParsedVbtFile | null>(null);
    const [setIndex, setSetIndex] = useState(0);
    const [fileName, setFileName] = useState<string | null>(null);
    const [reading, setReading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [notes, setNotes] = useState('');

    /** Lo que midió PWR, en el formato que entiende la comparación. */
    const measured: MeasuredRep[] = useMemo(
        () => result.repDetails.map(r => ({
            index: r.index,
            meanVelocity: r.meanVelocity,
            peakVelocity: r.peakVelocity,
            romM: r.rom,
        })),
        [result.repDetails]
    );

    /** Lo que midió el encoder, de la serie elegida del fichero. */
    const reference: ReferenceRep[] = useMemo(() => {
        const chosen = parsed?.sets[setIndex];
        if (!chosen) return [];
        return chosen.repDetails.map(r => ({
            index: r.index,
            meanVelocity: r.meanVelocity,
            peakVelocity: r.peakVelocity,
            romM: r.romM,
        }));
    }, [parsed, setIndex]);

    const report = useMemo(
        () => (reference.length ? buildAgreementReport(reference, measured) : null),
        [reference, measured]
    );

    const readFile = async (file: File) => {
        setReading(true);
        setFileName(file.name);
        try {
            const data = await parseVbtFile(file);
            if (data.rowCount === 0) {
                // Decir «0 filas» y nada más deja a quien lo lee sin salida: el
                // fichero se abrió bien, así que el problema son las columnas.
                toast.error('No se ha reconocido ninguna repetición en el fichero. Comprueba que la primera fila son los nombres de las columnas.');
                setParsed(null);
                return;
            }
            setParsed(data);
            setSetIndex(0);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se ha podido leer el fichero.');
            setParsed(null);
        } finally {
            setReading(false);
        }
    };

    const save = async () => {
        if (!report || !athleteId || !device.trim()) return;
        setSaving(true);
        try {
            await calibrationService.saveSession({
                athleteId,
                createdBy: coachId,
                exerciseName: EXERCISE_LABEL[result.exerciseType],
                loadKg: result.loadKg,
                barMassKg: barMassMetric(result.setup),
                referenceDevice: device.trim(),
                engineVersion: PWR_ENGINE_VERSION_CODE,
                qualityScore: result.quality.score,
                notes: notes.trim() || null,
                reference,
                measured,
                report,
            });
            toast.success('Sesión de calibración guardada.');
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se ha podido guardar.');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const canSave = Boolean(report && report.pairedReps > 0 && athleteId && device.trim() && !saving);

    return (
        <div
            className="fixed inset-0 z-[250] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-card border border-subtle bg-surface-raised shadow-overlay sm:rounded-card"
            >
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-subtle px-4 py-3">
                    <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-t-sm font-bold text-ink">
                            <Ruler size={15} className="shrink-0 text-brand-text" aria-hidden="true" />
                            Calibrar contra un encoder
                        </h3>
                        <p className="mt-0.5 text-t-2xs text-ink-subtle">
                            {EXERCISE_LABEL[result.exerciseType]} · {result.loadKg} kg ·{' '}
                            {result.repDetails.length} repeticiones medidas por PWR
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
                    <p className="rounded-field bg-surface-sunken px-3 py-2.5 text-t-2xs leading-relaxed text-ink-subtle">
                        Sube el fichero del encoder de <strong className="font-semibold text-ink-muted">esta
                        misma serie</strong>. Se contrastan repetición a repetición y se guarda el
                        resultado. No cambia nada del analizador: sirve para saber cuánto se equivoca
                        de verdad, que hoy no se puede afirmar con datos.
                    </p>

                    {!athleteId && (
                        <p className="flex gap-2 rounded-field border border-warning/25 bg-warning/10 p-3 text-t-2xs leading-relaxed text-ink-muted">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                            Una sesión de calibración va asociada a un atleta, y aquí no hay ninguno
                            elegido. Se puede ver la comparación, pero no guardarla.
                        </p>
                    )}

                    {/* ------------------------------------------------- */}
                    {/* APARATO                                            */}
                    {/* ------------------------------------------------- */}
                    <div>
                        <label className="block text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                            Aparato de referencia
                        </label>
                        <p className="mt-0.5 text-t-2xs text-ink-faint">
                            Dos encoders distintos no son la misma vara de medir: el informe agrupa por aparato.
                        </p>
                        <input
                            type="text"
                            value={device}
                            onChange={e => setDevice(e.target.value)}
                            placeholder="ADR Encoder, Vitruve, Speed4Lifts…"
                            className="mt-1.5 w-full rounded-field border border-subtle bg-surface-sunken px-3 py-2 text-base text-ink transition-colors duration-fast focus:border-brand-line sm:text-t-xs"
                        />
                    </div>

                    {/* ------------------------------------------------- */}
                    {/* FICHERO                                            */}
                    {/* ------------------------------------------------- */}
                    <div>
                        <label className="block text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                            Fichero del encoder
                        </label>
                        <label className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-field border border-dashed border-subtle bg-surface-sunken px-3 py-3 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:border-brand-line hover:text-ink">
                            {reading ? <Loader size={14} className="animate-spin" /> : <FileUp size={14} />}
                            {fileName ?? 'Elegir un CSV…'}
                            <input
                                type="file"
                                accept=".csv,text/csv"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) void readFile(file);
                                }}
                            />
                        </label>

                        {/* Un fichero de encoder suele traer la sesión entera.
                            Hay que decir CUÁL de las series es la del vídeo: la
                            comparación no tiene forma de deducirlo. */}
                        {parsed && parsed.sets.length > 1 && (
                            <select
                                value={setIndex}
                                onChange={e => setSetIndex(Number(e.target.value))}
                                className="mt-2 w-full rounded-field border border-subtle bg-surface-sunken px-3 py-2 text-base font-semibold text-ink sm:text-t-xs"
                            >
                                {parsed.sets.map((s, i) => (
                                    <option key={s.setNumber} value={i}>
                                        Serie {s.setNumber} — {s.reps} repeticiones
                                        {s.loadKg ? ` · ${s.loadKg} kg` : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* ------------------------------------------------- */}
                    {/* EL INFORME                                         */}
                    {/* ------------------------------------------------- */}
                    {report && (
                        <div className="space-y-3">
                            {/* Los avisos van ANTES de las cifras: quien lee
                                primero un sesgo de 0,01 m/s ya se lo ha creído
                                cuando llega al «puede estar mal alineado». */}
                            {report.warnings.map(w => (
                                <p key={w} className="flex gap-2 rounded-field border border-warning/25 bg-warning/10 p-3 text-t-2xs leading-relaxed text-ink-muted">
                                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                                    <span>{w}</span>
                                </p>
                            ))}

                            {report.metrics.map(({ metric, agreement }) => {
                                const meta = COMPARED_METRICS.find(m => m.key === metric)!;
                                const verdict = agreementVerdict(agreement);
                                const tone = TONE[verdict.level];

                                return (
                                    <div key={metric} className="rounded-card border border-subtle bg-surface-sunken p-3">
                                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                            <span className="text-t-2xs font-bold text-ink">{meta.label}</span>
                                            <span className={`text-t-2xs font-semibold ${tone.text}`}>
                                                {tone.label}
                                            </span>
                                        </div>

                                        {agreement ? (
                                            <>
                                                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                                                    <Stat label="Sesgo" value={`${agreement.bias >= 0 ? '+' : ''}${fmt(agreement.bias, meta.decimals)}`} unit={meta.unit} />
                                                    <Stat label="Error abs." value={fmt(agreement.mae, meta.decimals)} unit={meta.unit} />
                                                    <Stat label="RMSE" value={fmt(agreement.rmse, meta.decimals)} unit={meta.unit} />
                                                    <Stat label="Error %" value={fmt(agreement.mape, 1)} unit="%" />
                                                </dl>

                                                <p className="mt-2 text-t-2xs leading-relaxed text-ink-subtle">
                                                    <strong className="font-semibold text-ink-muted">
                                                        Límites de acuerdo:
                                                    </strong>{' '}
                                                    de {fmt(agreement.loaLower, meta.decimals)} a{' '}
                                                    {fmt(agreement.loaUpper, meta.decimals)} {meta.unit}. El 95% de las
                                                    diferencias con el encoder cae ahí.
                                                </p>

                                                {/* La r va detrás y con la salvedad: un método que
                                                    devolviera siempre la mitad correlacionaría 1,00. */}
                                                <p className="mt-1 text-t-2xs leading-relaxed text-ink-faint">
                                                    r de Pearson {fmt(agreement.pearsonR, 3)} sobre {agreement.n}{' '}
                                                    repeticiones — mide asociación, no acuerdo: no sustituye a los
                                                    límites de arriba.
                                                    {agreement.worst && (
                                                        <> Peor repetición: la {agreement.worst.index}
                                                        {' '}({fmt(agreement.worst.difference, meta.decimals)} {meta.unit}).</>
                                                    )}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="mt-1.5 text-t-2xs text-ink-faint">
                                                El fichero del encoder no trae esta magnitud.
                                            </p>
                                        )}
                                    </div>
                                );
                            })}

                            <div>
                                <label className="block text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                    Notas
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Cámara, distancia, iluminación… lo que haga falta para repetir esta sesión."
                                    className="mt-1.5 w-full resize-y rounded-field border border-subtle bg-surface-sunken px-3 py-2 text-base text-ink transition-colors duration-fast focus:border-brand-line sm:text-t-xs"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-subtle px-4 py-3">
                    <button
                        onClick={onClose}
                        className="rounded-field px-3 py-2 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => void save()}
                        disabled={!canSave}
                        title={
                            !athleteId ? 'Hace falta un atleta para guardar la sesión'
                                : !device.trim() ? 'Falta decir con qué aparato se ha medido'
                                    : !report?.pairedReps ? 'Todavía no hay repeticiones emparejadas'
                                        : undefined
                        }
                        className="flex items-center gap-1.5 rounded-field bg-brand px-4 py-2 text-t-2xs font-bold text-brand-ink transition-opacity duration-fast hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                        Guardar la calibración
                    </button>
                </footer>
            </div>
        </div>
    );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
    return (
        <div className="min-w-0">
            <dt className="text-t-2xs text-ink-faint">{label}</dt>
            <dd className="text-t-2xs font-bold tabular-nums text-ink">
                {value} <span className="font-normal text-ink-faint">{unit}</span>
            </dd>
        </div>
    );
}
