import { useCallback, useState } from 'react';
import { Activity, ArrowLeft, Link2, Ruler, Save } from 'lucide-react';
import { VideoTracker } from './VideoTracker';
import { MetricsDashboard, type PwrResult } from './MetricsDashboard';
import { AnalysisSetup, SetupSummary } from './AnalysisSetup';
import { CalibrationModal } from './CalibrationModal';
import { EXERCISE_LABEL, type PwrSetup } from '../../../../lib/cv/pwrSetup';
import { TrackingPoint } from '../../../../lib/cv/tracker';
import type { Calibration } from '../../../../lib/cv/plateGeometry';
import type { TrackingStats } from '../../../../lib/cv/quality';
import { SavePwrResultModal } from '../../../vbt/components/SavePwrResultModal';
import { useAuth } from '../../../../context/AuthContext';

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
  const [trackingData, setTrackingData] = useState<{
    path: TrackingPoint[];
    calibration: Calibration;
    stats: TrackingStats;
  } | null>(null);
  const [seekTime, setSeekTime] = useState<number | undefined>();
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [trackerVersion, setTrackerVersion] = useState(0);
  const [result, setResult] = useState<PwrResult | null>(null);
  /**
   * Qué diálogo está abierto, y con qué intención.
   *
   *   'assign' — "Asociar serie": cascada por el plan, serie obligatoria.
   *   'quick'  — "Guardar suelto": lista rápida, enlazar es opcional.
   *
   * Un solo estado y no dos booleanos: los dos diálogos son el mismo
   * componente y no pueden estar abiertos a la vez.
   */
  const [saveMode, setSaveMode] = useState<'assign' | 'quick' | null>(null);

  /**
   * CON QUÉ SE ANALIZA. Sin esto no se llega ni al vídeo (Fase 3).
   *
   * `null` significa «todavía no se ha contestado», y mientras lo sea el
   * analizador no se monta. No es un tecnicismo: la carga que se declare aquí
   * multiplica la fuerza, la potencia y el 1RM, y antes se preguntaba DESPUÉS
   * con un 100 kg ya escrito en el campo.
   */
  const [setup, setSetup] = useState<PwrSetup | null>(null);
  /** El formulario abierto otra vez para corregir algo ya contestado. */
  const [editingSetup, setEditingSetup] = useState(false);
  /** El diálogo de contraste contra un encoder (Fases 9 y 10). */
  const [calibrating, setCalibrating] = useState(false);

  const handleTrackingComplete = (path: TrackingPoint[], calibration: Calibration, stats: TrackingStats) => {
     setTrackingData({ path, calibration, stats });
  };

  /**
   * Con la medición bloqueada no se guarda, ni en una serie ni suelto.
   *
   * Guardar "suelto" no es una vía de escape: acaba en el historial del
   * atleta y de ahí en el perfil carga-velocidad igual que lo demás.
   */
  const blocked = result?.quality.verdict === 'blocked';

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
    /* EL ALTO DE PANTALLA ES UNA DECISION DE ESCRITORIO, NO DE MOVIL.
       =================================================================
       Con el analisis terminado, esta pantalla se convertia en una caja
       de `100vh` con `overflow-hidden` en TODAS las anchuras. Medido a
       375x812: la caja daba 604 px y dentro habia 3.665 px de contenido.
       Tres mil pixeles recortados y sin barra que los alcanzara — el
       informe de serie entero, con sus graficas y sus botones de
       exportar, no se veia NUNCA. A 1440x900 tampoco: 780 contra 2.061.

       Debajo de `lg` no hay dos columnas que encajar, asi que no hay
       nada que ganar atando el alto: la pantalla vuelve a ser un
       documento y lo desplaza el `<main>` del armazon, que ya es
       `overflow-y-auto`. De `lg` en adelante se mantiene el reparto
       video-izquierda / metricas-derecha, y quien desplaza es la columna
       de metricas.

       `dvh` y no `vh`: en un movil con la barra del navegador a la
       vista, `100vh` mide mas de lo que se ve (ver 9d764cb9, donde este
       sitio se quedo fuera del barrido). */
    <div className={`mx-auto py-4 animate-fade w-full px-4 ${trackingData ? 'max-w-[1800px] flex flex-col h-[calc(100dvh-32px)] min-h-[600px]' : 'max-w-5xl space-y-6'}`}>
      <div className="flex gap-4 shrink-0 mb-6 flex-row items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
              {onBack && (
                  <button
                      onClick={onBack}
                      className="flex items-center gap-2 text-xs font-bold text-ink-muted hover:text-ink uppercase tracking-wider bg-white/5 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                      <ArrowLeft size={16} /> Dashboard
                  </button>
              )}
              <h3 className="text-2xl font-black uppercase tracking-tight text-ink flex items-center gap-2">
                  <Activity className="text-orange-500" />
                  PWR Análisis
                  <span className="text-xs font-bold bg-orange-500/10 text-orange-500 px-2 py-1 rounded ml-2">BETA</span>
              </h3>
          </div>

          {trackingData && (
              <div className="flex flex-wrap items-center gap-2">
                  {/* ASOCIAR SERIE es la acción principal, y va primero.
                      Un análisis que acaba dentro de la serie que lo generó
                      es lo que convierte esto en seguimiento; guardarlo
                      suelto en el historial es el caso de rescate, no el
                      normal. Descartar para analizar otro vídeo queda el
                      último: ponerlo primero invitaba a perder lo medido. */}
                  <button
                    onClick={() => setSaveMode('assign')}
                    disabled={!result || blocked}
                    title={
                      !result ? 'Todavía no hay métricas que guardar'
                        : blocked ? 'La medición no alcanza la fiabilidad mínima'
                          : 'Guardar las métricas dentro de una serie del plan'
                    }
                    className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-black uppercase tracking-wider text-black transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                     <Link2 size={16} /> Asociar serie
                  </button>
                  <button
                    onClick={() => setSaveMode('quick')}
                    disabled={!result || blocked}
                    title={
                      !result ? 'Todavía no hay métricas que guardar'
                        : blocked ? 'La medición no alcanza la fiabilidad mínima'
                          : 'Guardar en el historial del atleta, sin enlazar con ninguna serie'
                    }
                    className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-muted transition-colors hover:bg-white/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                     <Save size={16} /> Guardar suelto
                  </button>
                  {/* CALIBRAR va aquí y no en un menú aparte porque solo se
                      puede hacer con el análisis recién terminado delante: hay
                      que contrastar ESTA serie con el fichero del encoder de
                      esa misma serie. Sin bloqueo por calidad, y a propósito —
                      una medición mala es justamente la que más interesa
                      contrastar para saber si la nota acierta al descartarla. */}
                  <button
                    onClick={() => setCalibrating(true)}
                    disabled={!result}
                    title={!result ? 'Todavía no hay métricas que contrastar' : 'Contrastar esta serie con un encoder'}
                    className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-muted transition-colors hover:bg-white/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                     <Ruler size={16} /> Calibrar
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 text-xs font-bold text-ink-muted hover:text-ink uppercase tracking-wider bg-white/5 px-4 py-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                     <ArrowLeft size={16} /> Analizar otro vídeo
                  </button>
              </div>
          )}
      </div>

      {!trackingData && (
          <div className="text-sm font-bold text-ink-muted bg-surface-sunken border border-subtle p-4 rounded-xl mb-6">
              PWR Análisis utiliza algoritmos de visión artificial para extraer métricas de VBT (Velocidad Basada en el Entrenamiento) y el Bar Path desde un vídeo normal, directamente en tu navegador.
              Al terminar podrás guardar el resultado en la ficha de un atleta y, si quieres, en la serie concreta que le pautaste.
          </div>
      )}

      {/* LA PUERTA. Sin ajuste no hay analizador.
          Va antes del vídeo y no al lado porque unos campos junto al botón de
          subir son unos campos que se saltan, y saltárselos es volver a los
          100 kg por defecto que esta fase existe para quitar. */}
      {!setup && (
          <AnalysisSetup onReady={value => { setSetup(value); setEditingSetup(false); }} />
      )}

      {setup && editingSetup && (
          <div className="mb-6">
              <AnalysisSetup
                  initial={setup}
                  submitLabel="Guardar el cambio"
                  onCancel={() => setEditingSetup(false)}
                  onReady={value => { setSetup(value); setEditingSetup(false); }}
              />
          </div>
      )}

      {/* Se recuerda con qué se está midiendo, porque el ajuste deja de estar a
          la vista justo cuando una carga equivocada hace más daño. Editarlo NO
          obliga a repetir el análisis: la cinemática no depende de la carga. */}
      {setup && !editingSetup && (
          <div className="mb-4 shrink-0">
              <SetupSummary setup={setup} onEdit={() => setEditingSetup(true)} />
          </div>
      )}

      {/* Contenedor dinámico: se convierte en 2 columnas cuando hay resultados, pero mantiene el Video Tracker en el mismo nivel del DOM para no perder el estado. */}
      {setup && (
      <div className={`flex flex-1 ${trackingData ? 'gap-6 min-h-0 flex-row overflow-hidden' : 'flex-col'}`}>

          {/* Lado izquierdo (o Full width) */}
          <div className={`${trackingData ? 'flex flex-col shrink-0 h-full w-4/12' : 'w-full'}`}>
              <VideoTracker
                  key={trackerVersion}
                  onTrackingComplete={handleTrackingComplete}
                  seekTime={seekTime}
                  isResultMode={!!trackingData}
                  onTimeUpdate={setCurrentVideoTime}
              />
          </div>

          {/* Lado derecho (Solo visible en resultados).

              De `lg` en adelante esta columna ES el puerto de desplazamiento
              del informe: sin `overflow-y-auto` aqui, el panel se recorta
              contra el alto de la ventana y el informe de serie no se
              alcanza. Debajo de `lg` no lleva alto ni desbordamiento
              propios — se desplaza la pantalla entera. `pr-2` sube a `lg`
              con ellos: es el hueco de la barra de desplazamiento, y en
              movil no hay barra que separar. */}
          {trackingData && (
              <div className="h-full overflow-y-auto pr-2 w-8/12">
                  <div className="animate-slide">
                      <MetricsDashboard
                          path={trackingData.path}
                          calibration={trackingData.calibration}
                          trackingStats={trackingData.stats}
                          onTimeHover={setSeekTime}
                          currentVideoTime={currentVideoTime}
                          onResult={handleResult}
                          setup={setup}
                          athleteId={fixedAthleteId}
                      />
                  </div>
              </div>
          )}
      </div>
      )}

      {result && calibrating && (
        <CalibrationModal
          open
          onClose={() => setCalibrating(false)}
          result={result}
          athleteId={fixedAthleteId}
          coachId={session?.user.id ?? null}
        />
      )}

      {result && saveMode && (
        <SavePwrResultModal
          open
          mode={saveMode}
          onClose={() => setSaveMode(null)}
          coachId={session?.user.id ?? null}
          fixedAthleteId={fixedAthleteId}
          metrics={result.metrics}
          extraMetrics={result.extraMetrics}
          loadKg={result.loadKg}
          reps={result.reps}
          defaultExerciseName={EXERCISE_LABEL[result.exerciseType]}
        />
      )}
    </div>
  );
}
