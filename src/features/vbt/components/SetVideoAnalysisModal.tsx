import { Suspense, lazy, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { vbtService } from '../../../services/vbtService';
import type { TrackingPoint } from '../../../lib/cv/tracker';
import type { Calibration } from '../../../lib/cv/plateGeometry';
import type { TrackingStats } from '../../../lib/cv/quality';
import type { PwrResult } from '../../../features/coach/components/pwr/MetricsDashboard';
import type { TrainingSet, VbtMetrics, VbtSource } from '../../../types/training';
import type { PwrSetup } from '../../../lib/cv/pwrSetup';
import { transition, DURATION } from '../../../lib/motion';
import { MetricBagView } from './MetricBagView';
import { sanitizeMetricBag, legacyMetricsToBag } from '../../../lib/vbt/metricRegistry';

/**
 * ANALIZAR EL VÍDEO DE UNA SERIE, DENTRO DE ESA SERIE
 * =====================================================================
 *
 * EL HUECO QUE CIERRA
 *
 * PWR Análisis vivía en su propia pantalla, en el panel del entrenador.
 * `SetVbtModal` dejaba marcar el origen "Vídeo (PWR)"… pero no había forma de
 * EJECUTAR el análisis desde ahí: había que irse a la otra pantalla, analizar,
 * apuntar los números y volver a teclearlos a mano. Cinco cifras copiadas a
 * ojo, y las otras diez que el analizador calcula, perdidas.
 *
 * Aquí el análisis ocurre DENTRO de la serie. La serie ya se conoce, así que
 * no hay que elegir atleta, ni bloque, ni día: se analiza y se guarda.
 *
 *
 * EL VÍDEO NO SE SUBE A NINGUNA PARTE
 *
 * Y esto no es una limitación: es la decisión de diseño.
 *
 * Todo el procesado ocurre en el navegador, sobre el fichero local. El vídeo
 * no llega a salir del móvil. Lo que se guarda son las métricas —unos
 * doscientos bytes— y no el vídeo —diez o treinta megas—, que es lo único que
 * tiene valor permanente.
 *
 * Consecuencias, todas buenas:
 *   · Coste de almacenamiento CERO. Ni bucket, ni retención, ni limpieza.
 *   · Sin problema de privacidad: no hay vídeos de gente entrenando en ningún
 *     servidor porque no se sube ninguno.
 *   · Sin cola, sin trabajador, sin infraestructura que mantener.
 *
 * Ver docs/ARQUITECTURA_VIDEO_PWR.md.
 *
 *
 * LO QUE ESTO **NO** HACE: seguir entrenando mientras procesa
 *
 * El análisis tarda entre diez y treinta segundos con la pantalla encendida.
 * No se puede dejar corriendo de fondo: iOS suspende el JavaScript de una
 * pestaña en segundo plano a los ~30 segundos y los Web Workers se estrangulan
 * igual, así que bloquear el móvil mataría el análisis a medias. Es una
 * política del sistema operativo, no algo que se pueda rodear con más código.
 *
 * Para que fuera de verdad en segundo plano habría que subir el vídeo y
 * procesarlo en un servidor — con su bucket, su cola y su factura. Media
 * página de espera contra toda esa infraestructura: por eso se espera.
 */

// El paquete de visión artificial pesa ~670 KB. Cargarlo con el resto de la
// aplicación penalizaría a TODO atleta que abra su entrenamiento, incluidos
// los que no graban vídeo nunca. Se trae solo al abrir este diálogo.
const VideoTracker = lazy(() =>
    import('../../coach/components/pwr/VideoTracker').then(m => ({ default: m.VideoTracker }))
);
const MetricsDashboard = lazy(() =>
    import('../../coach/components/pwr/MetricsDashboard').then(m => ({ default: m.MetricsDashboard }))
);
const AnalysisSetup = lazy(() =>
    import('../../coach/components/pwr/AnalysisSetup').then(m => ({ default: m.AnalysisSetup }))
);
const SetupSummary = lazy(() =>
    import('../../coach/components/pwr/AnalysisSetup').then(m => ({ default: m.SetupSummary }))
);

/**
 * Qué movimiento es, a partir de cómo lo llamó el coach.
 *
 * Importa porque la estimación de 1RM usa una ecuación distinta por
 * levantamiento. Ante la duda, sentadilla: es el más frecuente y el que menos
 * se desvía si se acierta a medias.
 */
function guessExerciseType(name: string): 'squat' | 'bench' | 'deadlift' {
    const n = name.toLowerCase();
    if (n.includes('banca') || n.includes('press') || n.includes('bench')) return 'bench';
    if (n.includes('muerto') || n.includes('deadlift') || n.includes('peso muerto')) return 'deadlift';
    return 'squat';
}

export interface SetVideoAnalysisModalProps {
    open: boolean;
    onClose: () => void;
    athleteId: string;
    createdBy?: string | null;
    exerciseName: string;
    exerciseId?: string | null;
    sessionExerciseId?: string | null;
    set: TrainingSet;
    setNumber: number;
    /** Se avisa con lo guardado para refrescar la pantalla de detrás. */
    onSaved?: (metrics: VbtMetrics, source: VbtSource) => void;
}

export function SetVideoAnalysisModal({
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
}: SetVideoAnalysisModalProps) {
    const [tracking, setTracking] = useState<{
        path: TrackingPoint[];
        calibration: Calibration;
        stats: TrackingStats;
    } | null>(null);
    const [result, setResult] = useState<PwrResult | null>(null);
    const [saving, setSaving] = useState(false);
    /**
     * El ajuste previo (Fase 3).
     *
     * Aquí llega casi todo hecho —la serie ya sabe el movimiento y los kilos—,
     * así que el paso se reduce a confirmar y a elegir barra. Aun así **se
     * pasa por él**: la carga registrada puede ser la pautada y no la que de
     * verdad había en la barra, y es el único momento en que alguien mira el
     * vídeo y los kilos a la vez.
     */
    const [setup, setSetup] = useState<PwrSetup | null>(null);
    const [editingSetup, setEditingSetup] = useState(false);

    /**
     * Una medición mala no se guarda, aunque el usuario insista.
     *
     * No es paternalismo: el destino de estos números es el perfil
     * carga-velocidad del atleta, que se lee durante meses y del que sale la
     * prescripción. Un dato malo no molesta hoy, contamina la serie. El motivo
     * concreto se enseña arriba, en el panel de métricas, para que se pueda
     * volver a grabar sabiendo qué corregir.
     */
    const blocked = result?.quality.verdict === 'blocked';

    // Estable entre renders: el panel de métricas la tiene como dependencia de
    // un efecto y recrearla en cada render lo dispararía en bucle.
    const handleResult = useCallback((value: PwrResult | null) => setResult(value), []);

    /**
     * La carga con la que se asocia la medición.
     *
     * Manda la MOVIDA sobre la pautada, y la pautada solo si iba en kilos: una
     * serie prescrita a 0,45 m/s tiene un `target_load` de 0,45 que no son
     * kilos, y meterlo aquí falsearía la potencia y la fuerza, que se calculan
     * multiplicando por la masa.
     */
    const loadKg =
        set.actual_load ??
        ((set.target_metric ?? 'kg') === 'kg' ? set.target_load ?? null : null);

    if (!open) return null;

    const save = async () => {
        if (!result || blocked) return;

        setSaving(true);
        try {
            await vbtService.saveMeasurement({
                athleteId,
                createdBy,
                exerciseName,
                exerciseId,
                trainingSetId: set.id,
                sessionExerciseId,
                setNumber,
                // Las repeticiones que CONTÓ el analizador, y si no las
                // registradas. El analizador ve el vídeo entero; lo anotado a
                // mano puede haberse quedado a medias.
                reps: result.reps ?? set.actual_reps ?? null,
                loadKg: result.loadKg ?? loadKg,
                metrics: result.metrics,
                extraMetrics: result.extraMetrics,
                // El vídeo NO se sube: no hay URL que guardar.
                fileUrl: null,
                // 'video' y nunca 'encoder': una estimación por visión
                // artificial sobre un vídeo de móvil no merece la misma
                // confianza que una medición de encoder, y al leer el perfil
                // carga-velocidad hay que poder distinguirlas.
                source: 'video',
            });

            toast.success(`Métricas guardadas en la serie ${setNumber}`);
            onSaved?.(result.metrics, 'video');
            onClose();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudieron guardar las métricas');
        } finally {
            setSaving(false);
        }
    };

    // Vista previa de TODO lo que se va a guardar, no solo de las cinco de
    // siempre. Es lo que hace evidente que el análisis aporta quince métricas
    // y no un puñado.
    const previewBag = result
        ? { ...legacyMetricsToBag(result.metrics), ...sanitizeMetricBag(result.extraMetrics) }
        : null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition(DURATION.fast)}
                className="fixed inset-0 z-[245] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: 24, scale: 0.98 }}
                    animate={{ y: 0, scale: 1 }}
                    exit={{ y: 24, scale: 0.98 }}
                    transition={transition(DURATION.base)}
                    onClick={e => e.stopPropagation()}
                    className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-card border border-subtle bg-surface-raised shadow-overlay sm:rounded-card"
                >
                    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-subtle px-4 py-3">
                        <div className="min-w-0">
                            <h3 className="flex items-center gap-2 text-t-sm font-bold text-ink">
                                <Video size={15} className="shrink-0 text-brand" aria-hidden="true" />
                                Analizar vídeo · Serie {setNumber}
                            </h3>
                            <p className="mt-0.5 truncate text-t-2xs text-ink-subtle">
                                {exerciseName}{loadKg ? ` · ${loadKg} kg` : ''}
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
                        {/* Se dice ANTES de empezar que el vídeo no sale del
                            móvil. Es lo primero que se pregunta cualquiera al
                            ver "sube un vídeo", y contestarlo después de haberlo
                            subido no vale de nada. */}
                        {!tracking && (
                            <p className="rounded-field bg-surface-sunken px-3 py-2.5 text-t-2xs leading-relaxed text-ink-subtle">
                                El análisis se hace <strong className="font-semibold text-ink-muted">en este
                                dispositivo</strong>: el vídeo no se sube a ningún servidor y no se guarda.
                                Solo se guardan las métricas. Tarda unos segundos, así que mantén la
                                pantalla encendida hasta que termine.
                            </p>
                        )}

                        <Suspense
                            fallback={
                                <div className="flex items-center justify-center gap-2 py-10 text-t-xs text-ink-subtle">
                                    <Loader size={16} className="animate-spin" />
                                    Cargando el analizador…
                                </div>
                            }
                        >
                            {/* Sin ajuste no se monta el analizador. Ver Fase 3. */}
                            {(!setup || editingSetup) && (
                                <AnalysisSetup
                                    initial={{
                                        exerciseType: guessExerciseType(exerciseName),
                                        loadKg: loadKg ?? 0,
                                        ...(setup ?? {}),
                                    }}
                                    prefillNote={
                                        loadKg != null
                                            ? `El movimiento y la carga vienen de la serie pautada (${exerciseName}, ${loadKg} kg). Corrígelos si en la barra había otra cosa.`
                                            : `El movimiento viene de la serie pautada (${exerciseName}). La carga no está registrada, así que hay que ponerla.`
                                    }
                                    submitLabel={setup ? 'Guardar el cambio' : 'Continuar al vídeo'}
                                    onCancel={setup ? () => setEditingSetup(false) : undefined}
                                    onReady={value => { setSetup(value); setEditingSetup(false); }}
                                />
                            )}

                            {setup && !editingSetup && (
                                <>
                                    <SetupSummary setup={setup} onEdit={() => setEditingSetup(true)} />

                                    <VideoTracker
                                        onTrackingComplete={(path, calibration, stats) => setTracking({ path, calibration, stats })}
                                        isResultMode={Boolean(tracking)}
                                    />

                                    {tracking && (
                                        <MetricsDashboard
                                            path={tracking.path}
                                            calibration={tracking.calibration}
                                            trackingStats={tracking.stats}
                                            onResult={handleResult}
                                            setup={setup}
                                            athleteId={athleteId}
                                        />
                                    )}
                                </>
                            )}
                        </Suspense>

                        {previewBag && (
                            <div>
                                <p className="mb-2 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                    {blocked ? 'No se guardará nada de esto' : 'Se guardará en la serie'}
                                </p>
                                <div className={blocked ? 'opacity-50' : undefined}>
                                    <MetricBagView bag={previewBag} />
                                </div>
                            </div>
                        )}
                    </div>

                    <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-subtle px-4 py-3">
                        {blocked && (
                            <p className="mr-auto max-w-[22rem] text-t-2xs leading-relaxed text-danger">
                                Vuelve a grabar corrigiendo lo que indica el aviso de arriba. Un número
                                mal medido hace más daño que ninguno.
                            </p>
                        )}
                        <button
                            onClick={onClose}
                            className="rounded-field px-3 py-2 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={save}
                            disabled={saving || !result || blocked}
                            title={
                                !result ? 'Analiza primero el vídeo'
                                    : blocked ? 'La medición no alcanza la fiabilidad mínima'
                                        : undefined
                            }
                            className="flex items-center gap-1.5 rounded-field bg-brand px-4 py-2 text-t-2xs font-bold text-brand-ink transition-colors duration-fast hover:opacity-90 disabled:opacity-50"
                        >
                            {saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                            Guardar en la serie
                        </button>
                    </footer>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
