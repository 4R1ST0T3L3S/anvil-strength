import { useCallback, useState } from 'react';
import { Activity, ArrowLeft, Save } from 'lucide-react';
import { VideoTracker } from './VideoTracker';
import { MetricsDashboard, type PwrResult } from './MetricsDashboard';
import { TrackingPoint } from '../../../../lib/cv/tracker';
import { SavePwrResultModal } from '../../../vbt/components/SavePwrResultModal';
import { useAuth } from '../../../../context/AuthContext';

/** Nombre por defecto del ejercicio según lo elegido en el panel de métricas. */
const EXERCISE_NAME: Record<PwrResult['exerciseType'], string> = {
  squat: 'Sentadilla',
  bench: 'Press banca',
  deadlift: 'Peso muerto',
};

/**
 * PWR ANÁLISIS
 *
 * Extrae velocidad, potencia, ROM y 1RM estimado de un vídeo normal, con
 * visión artificial y dentro del navegador.
 *
 * LO QUE SE AÑADE AQUÍ: el resultado se puede GUARDAR en un atleta y, si se
 * quiere, en una serie concreta de su programación. Antes el análisis moría
 * al cerrar la pestaña: era una calculadora, no una herramienta de
 * seguimiento, y no había forma de comparar el vídeo de hoy con el de hace un
 * mes ni de que apareciera en la ficha de nadie.
 *
 * `fixedAthleteId` existe para cuando esta misma pantalla la usa un atleta
 * desde su panel: ahí no hay a quién elegir, es él.
 */
export function PwrAnalysisTab({
  onBack,
  fixedAthleteId,
}: {
  onBack?: () => void;
  fixedAthleteId?: string | null;
}) {
  const { session } = useAuth();
  const [trackingData, setTrackingData] = useState<{ path: TrackingPoint[], ratio: number } | null>(null);
  const [seekTime, setSeekTime] = useState<number | undefined>();
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [trackerVersion, setTrackerVersion] = useState(0);
  const [result, setResult] = useState<PwrResult | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  const handleTrackingComplete = (path: TrackingPoint[], ratio: number) => {
     setTrackingData({ path, ratio });
  };

  const handleReset = () => {
     setTrackingData(null);
     setSeekTime(undefined);
     setResult(null);
     setTrackerVersion(v => v + 1);
  };

  // Estable entre renders: el panel de métricas la tiene como dependencia de
  // un efecto, y recrearla en cada render lo dispararía en bucle.
  const handleResult = useCallback((value: PwrResult | null) => setResult(value), []);

  return (
    <div className={`mx-auto px-2 sm:px-4 py-4 animate-in fade-in duration-300 w-full ${trackingData ? 'max-w-[1800px] h-[calc(100vh-32px)] min-h-[600px] flex flex-col' : 'max-w-5xl space-y-6'}`}>
      <div className="flex items-center justify-between shrink-0 mb-6">
          <div className="flex items-center gap-3">
              {onBack && (
                  <button
                      onClick={onBack}
                      className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white uppercase tracking-wider bg-white/5 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                      <ArrowLeft size={16} /> Dashboard
                  </button>
              )}
              <h3 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <Activity className="text-orange-500" />
                  PWR Análisis
                  <span className="text-xs font-bold bg-orange-500/10 text-orange-500 px-2 py-1 rounded ml-2">BETA</span>
              </h3>
          </div>

          {trackingData && (
              <div className="flex items-center gap-2">
                  {/* GUARDAR va antes que "analizar otro vídeo" y con el color
                      de marca: es la acción que cierra la tarea. Descartar el
                      análisis para empezar otro es secundario, y ponerlo
                      primero invitaba a perder lo que se acababa de medir. */}
                  <button
                    onClick={() => setSaveOpen(true)}
                    disabled={!result}
                    title={result ? 'Guardar en la ficha de un atleta' : 'Todavía no hay métricas que guardar'}
                    className="flex items-center gap-2 rounded-lg bg-anvil-red px-4 py-2 text-xs font-black uppercase tracking-wider text-black transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                     <Save size={16} /> Guardar en atleta
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white uppercase tracking-wider bg-white/5 px-4 py-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                     <ArrowLeft size={16} /> Analizar otro vídeo
                  </button>
              </div>
          )}
      </div>

      {!trackingData && (
          <div className="text-sm font-bold text-gray-400 bg-[#0a0a0a] border border-white/5 p-4 rounded-xl mb-6">
              PWR Análisis utiliza algoritmos de visión artificial para extraer métricas de VBT (Velocidad Basada en el Entrenamiento) y el Bar Path desde un vídeo normal, directamente en tu navegador.
              Al terminar podrás guardar el resultado en la ficha de un atleta y, si quieres, en la serie concreta que le pautaste.
          </div>
      )}

      {/* Contenedor dinámico: se convierte en 2 columnas cuando hay resultados, pero mantiene el Video Tracker en el mismo nivel del DOM para no perder el estado. */}
      <div className={`flex flex-1 ${trackingData ? 'flex-col lg:flex-row gap-6 min-h-0 overflow-hidden' : 'flex-col'}`}>

          {/* Lado izquierdo (o Full width) */}
          <div className={`${trackingData ? 'w-full lg:w-5/12 xl:w-4/12 h-[40vh] lg:h-full flex flex-col shrink-0' : 'w-full'}`}>
              <VideoTracker
                  key={trackerVersion}
                  onTrackingComplete={handleTrackingComplete}
                  seekTime={seekTime}
                  isResultMode={!!trackingData}
                  onTimeUpdate={setCurrentVideoTime}
              />
          </div>

          {/* Lado derecho (Solo visible en resultados) */}
          {trackingData && (
              <div className="w-full lg:w-7/12 xl:w-8/12 h-full pr-2">
                  <div className="animate-in slide-in-from-right-8 duration-500 h-full">
                      <MetricsDashboard
                          path={trackingData.path}
                          pixelToMeterRatio={trackingData.ratio}
                          onTimeHover={setSeekTime}
                          currentVideoTime={currentVideoTime}
                          onResult={handleResult}
                      />
                  </div>
              </div>
          )}
      </div>

      {result && (
        <SavePwrResultModal
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          coachId={session?.user.id ?? null}
          fixedAthleteId={fixedAthleteId}
          metrics={result.metrics}
          loadKg={result.loadKg}
          reps={result.reps}
          defaultExerciseName={EXERCISE_NAME[result.exerciseType]}
        />
      )}
    </div>
  );
}
