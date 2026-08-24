import { useState, useMemo, useEffect } from 'react';
import type { TrackingPoint } from '../../../../lib/cv/tracker';
import { computeKinematics } from '../../../../lib/cv/signal';
import { extractLiftingPhases, calculateDynamics, estimate1RM, summariseSeries, type OneRmEstimate, type PhaseMetrics } from '../../../../lib/cv/pwrMath';
import { EXERCISE_LABEL, barMassMetric, setupCaveats, type PwrSetup } from '../../../../lib/cv/pwrSetup';
import { useAthleteVelocityProfile } from './useAthleteVelocityProfile';
import { PWR_ENGINE_LABEL, PWR_ENGINE_VERSION_CODE } from '../../../../lib/cv/engineVersion';
import { SeriesReport } from './SeriesReport';
import { buildPwrReport } from '../../../../lib/export/pwrReport';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from 'recharts';
import { Activity, Gauge, ArrowDownUp, Target, Zap, Flame, TrendingUp, AlertTriangle, MoveHorizontal, Clock, Percent, Award, Dumbbell, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import type { VbtMetrics } from '../../../../types/training';
import type { Calibration } from '../../../../lib/cv/plateGeometry';
import { CALIBRATION_METHOD_LABEL } from '../../../../lib/cv/plateGeometry';
import { assessQuality, qualityToMetricBag, type QualityReport, type TrackingStats } from '../../../../lib/cv/quality';

/**
 * Nombres legibles de las métricas que la calidad marca como poco fiables.
 *
 * En claves del catálogo para que coincidan con lo que se guarda, y con
 * etiqueta propia porque "horizontal_deviation" no le dice nada a nadie.
 */
const UNRELIABLE_LABEL: Record<string, string> = {
  horizontal_deviation: 'la desviación horizontal',
  peak_velocity: 'la velocidad máxima',
  peak_power: 'la potencia máxima',
  rfd: 'la tasa de desarrollo de fuerza',
};

/**
 * Lo que este panel calcula y otro puede querer guardar.
 *
 * Existe porque el análisis se quedaba AQUÍ: eran unas tarjetas bonitas que
 * desaparecían al cerrar la pestaña. Sacar el resultado permite escribirlo en
 * la ficha del atleta y compararlo con el vídeo del mes que viene, que es
 * para lo que sirve medir.
 */
export interface PwrResult {
  metrics: VbtMetrics;
  /**
   * TODO LO DEMÁS QUE ESTE PANEL YA CALCULA.
   *
   * Fuerza media y máxima, RFD, desviación horizontal de la barra, punto de
   * estancamiento, duración de cada fase… Se pintaba en las tarjetas y se
   * TIRABA al guardar, porque `VbtMetrics` solo tiene siete campos y ampliarlo
   * exigía una migración por métrica.
   *
   * Va en una bolsa abierta `{clave: número}` que se guarda tal cual: añadir
   * una métrica nueva es añadir una clave aquí y una fila al catálogo
   * (`database/metrics_catalog.sql`). Ni migración, ni cambio de tipos, ni
   * tocar el servicio. Ver src/lib/vbt/metricRegistry.ts.
   */
  extraMetrics: Record<string, number | null | undefined>;
  loadKg: number;
  reps: number;
  exerciseType: 'squat' | 'bench' | 'deadlift';
  /**
   * De cuánto fiarse, y por qué.
   *
   * Va DENTRO del resultado y no al lado porque quien guarde esto tiene que
   * poder negarse: con `verdict === 'blocked'` la medición no debe llegar al
   * perfil carga-velocidad del atleta. Ver quality.ts.
   */
  quality: QualityReport;
  /** Con qué se declaró que se analizaba. Ver `lib/cv/pwrSetup.ts`. */
  setup: PwrSetup;
  /** Si el 1RM salió de la recta del atleta o de la genérica, y por qué. */
  oneRm: OneRmEstimate;
  /**
   * TODAS las repeticiones concéntricas, no solo la mejor.
   *
   * Lo que se guarda en la bolsa es el resumen, pero contrastar PWR contra un
   * encoder se hace **repetición a repetición** (Fases 9 y 10): una serie
   * donde la primera se mide 5 cm/s de más y la última 5 cm/s de menos tiene
   * un resumen impecable y dos repeticiones mal medidas.
   *
   * `repDetails` y no `reps`: `reps` ya es el RECUENTO, y son dos cosas
   * distintas que en una interfaz plana se pisarían en silencio.
   */
  repDetails: PhaseMetrics[];
}

interface MetricsDashboardProps {
  path: TrackingPoint[];
  /** De dónde sale la escala del vídeo. Contiene `pixelToMeterRatio`. */
  calibration: Calibration;
  /** Cómo fue el seguimiento: fotogramas perdidos, saltos, duración. */
  trackingStats: TrackingStats;
  onTimeHover?: (time: number) => void;
  currentVideoTime?: number;
  /** Se llama cada vez que cambia el resultado (carga o ejercicio incluidos). */
  onResult?: (result: PwrResult | null) => void;
  /**
   * CON QUÉ SE ESTÁ ANALIZANDO. Se pregunta antes, no aquí.
   *
   * Antes este panel era dueño de la carga y del movimiento, con la carga
   * arrancando en 100 kg. La cinemática no depende de ellos, pero la fuerza,
   * la potencia y el 1RM sí, y analizar 60 kg con el campo en 100 los infla un
   * 67% sin que nada lo delate. Ahora se contestan ANTES de ver el vídeo, en
   * `AnalysisSetup`, y aquí solo se usan. Ver `lib/cv/pwrSetup.ts` (Fase 3).
   */
  setup: PwrSetup;
  /**
   * De quién es este levantamiento, si se sabe.
   *
   * Solo para el 1RM: con él se usa la recta carga-velocidad DEL ATLETA en vez
   * de la genérica. Desde el panel del entrenador, sin atleta elegido todavía,
   * llega `null` y se cae al genérico diciéndolo.
   */
  athleteId?: string | null;
}

export function MetricsDashboard({ path, calibration, trackingStats, onTimeHover, currentVideoTime, onResult, setup, athleteId }: MetricsDashboardProps) {
  const pixelToMeterRatio = calibration.pixelToMeterRatio;
  const loadKg = setup.loadKg;
  const exerciseType = setup.exerciseType;
  const [isHovering, setIsHovering] = useState(false);

  /**
   * La recta del atleta, si la tiene.
   *
   * Se pide en cuanto se conoce el atleta y el movimiento, sin bloquear nada:
   * mientras no llega, el 1RM sale del genérico y se recalcula solo cuando
   * llega. Que el panel entero espere por una petición de red para enseñar una
   * velocidad que ya está calculada no tendría ningún sentido.
   */
  const athleteProfile = useAthleteVelocityProfile(athleteId, exerciseType);

  /** Lo que el ajuste obliga a advertir. Ver `setupCaveats`. */
  const caveats = useMemo(() => setupCaveats(setup), [setup]);

  const metricsData = useMemo(() => {
    return computeKinematics(path, pixelToMeterRatio);
  }, [path, pixelToMeterRatio]);

  const advMetrics = useMemo(() => {
      if (metricsData.length === 0) return null;

      const { eccentrics, concentrics } = extractLiftingPhases(metricsData, pixelToMeterRatio, 0.15);

      if (concentrics.length === 0) return null;

      // Calcular todo usando la mejor repetición (basado en Peak Velocity)
      const bestRep = concentrics.reduce((prev, current) => (prev.peakVelocity > current.peakVelocity) ? prev : current);
      // La excéntrica correspondiente es la ÚLTIMA que terminó antes de que
      // empezara esta concéntrica, no la primera que se encuentre: con varias
      // repeticiones, `find` devolvía la de la primera repetición para todas.
      const mainEccentric =
          [...eccentrics].reverse().find(e => e.endTime <= bestRep.startTime) ?? null;

      const dyn = calculateDynamics(bestRep.dataPoints, loadKg);
      const oneRmObj = estimate1RM(loadKg, bestRep.meanVelocity, exerciseType, athleteProfile.profile);

      // La pérdida de velocidad solo significa algo con más de una repetición y
      // con una primera repetición que se moviera de verdad: dividir por una
      // velocidad de casi cero daba porcentajes de miles.
      let velLoss = 0;
      if (concentrics.length > 1) {
          const firstVel = concentrics[0].meanVelocity;
          const lastVel = concentrics[concentrics.length - 1].meanVelocity;
          if (firstVel > 0.05) velLoss = ((firstVel - lastVel) / firstVel) * 100;
      }

      return {
          concentric: bestRep,
          eccentric: mainEccentric,
          fatigue: velLoss,
          dynamics: dyn,
          rm: oneRmObj,
          totalReps: concentrics.length,
          // TODAS las repeticiones, no solo la mejor. Se calculaban ya y se
          // tiraban aquí mismo: es lo que alimenta `SeriesReport`.
          concentrics,
          eccentrics,
      };
  }, [metricsData, pixelToMeterRatio, loadKg, exerciseType, athleteProfile.profile]);

  /**
   * El resumen de la serie.
   *
   * Va aparte del `useMemo` de arriba porque depende de la CARGA —la potencia
   * se calcula con la masa— y no conviene recalcular la segmentación entera
   * cada vez que alguien toca el campo de los kilos.
   */
  const series = useMemo(
    () => (advMetrics ? summariseSeries(advMetrics.concentrics, loadKg) : null),
    [advMetrics, loadKg]
  );

  /**
   * El informe listo para CSV, Excel y PDF.
   *
   * `now` se pasa como argumento y no se lee dentro para que `buildPwrReport`
   * sea pura y se pueda probar. Aquí se ancla al análisis —no al momento de
   * pulsar «exportar»— para que los tres formatos lleven la misma fecha aunque
   * se descarguen con minutos de diferencia.
   */
  const reportBuiltAt = useMemo(() => new Date(), [path]);

  /**
   * ¿Me puedo fiar de esto?
   *
   * Se calcula ANTES de enseñar nada y viaja con el resultado. No depende de
   * la carga ni del ejercicio elegidos —esos no cambian la fiabilidad de la
   * medición, solo su interpretación— así que no se recalcula al toquetear los
   * controles de arriba.
   */
  const quality = useMemo<QualityReport | null>(() => {
    if (!advMetrics) return null;
    return assessQuality({
      calibration,
      tracking: trackingStats,
      concentricSamples: advMetrics.concentric.dataPoints.length,
      concentricDurationS: advMetrics.concentric.duration,
      romM: advMetrics.concentric.rom,
      meanVelocityMs: advMetrics.concentric.meanVelocity,
    });
  }, [advMetrics, calibration, trackingStats]);

  /**
   * El resultado, en el mismo vocabulario que usa el resto de la aplicación.
   *
   * Se publica hacia arriba en un efecto y no durante el render porque quien
   * lo recibe guarda estado, y avisar en pleno render provocaría un bucle.
   */
  useEffect(() => {
    if (!onResult) return;

    if (!advMetrics || !quality) {
      onResult(null);
      return;
    }

    onResult({
      metrics: {
        meanVelocity: advMetrics.concentric.meanVelocity,
        peakVelocity: advMetrics.concentric.peakVelocity,
        // La fatiga puede salir negativa cuando la última repetición es la más
        // rápida —pasa en series cortas y bien descansadas— y una "pérdida
        // negativa" no significa nada: se corta en cero.
        velocityLoss: Math.max(0, advMetrics.fatigue),
        meanPower: advMetrics.dynamics.meanPower,
        peakPower: advMetrics.dynamics.peakPower,
        rom: advMetrics.concentric.rom,
        est1RM: advMetrics.rm.rm,
      },
      // Las claves son las del catálogo de métricas. Lo que no exista en él
      // se sigue guardando y se enseña con la clave por etiqueta, así que
      // añadir una aquí nunca puede romper una pantalla.
      extraMetrics: {
        min_velocity: advMetrics.concentric.minVelocity,
        mean_force: advMetrics.dynamics.meanForce,
        peak_force: advMetrics.dynamics.peakForce,
        rfd: advMetrics.dynamics.rfd,
        horizontal_deviation: advMetrics.concentric.horizontalDeviationCm,
        sticking_height: advMetrics.concentric.stickingHeight,
        concentric_duration: advMetrics.concentric.duration,
        eccentric_duration: advMetrics.eccentric?.duration,
        est_1rm_percent: advMetrics.rm.percent,
        total_reps: advMetrics.totalReps,

        // ---------------------------------------------------------------
        // Nuevas en v2.0 — de la mejor repetición
        // ---------------------------------------------------------------
        propulsive_velocity: advMetrics.concentric.propulsiveVelocity,
        propulsive_ratio: advMetrics.concentric.propulsiveRatio !== null
            ? advMetrics.concentric.propulsiveRatio * 100
            : null,
        peak_acceleration: advMetrics.concentric.peakAcceleration,
        time_to_peak_velocity: advMetrics.concentric.timeToPeakVelocityS,
        sticking_rom_percent: advMetrics.concentric.sticking?.romPercent,
        sticking_duration: advMetrics.concentric.sticking?.durationS,
        sticking_distance: advMetrics.concentric.sticking?.distanceFromStartM,

        // ---------------------------------------------------------------
        // Nuevas en v2.0 — de la serie entera
        // ---------------------------------------------------------------
        series_mean_velocity: series?.meanVelocity,
        series_mean_rom: series?.meanRom,
        series_consistency_cv: series?.consistencyCv,
        time_under_tension: series?.timeUnderTensionS,

        /**
         * QUÉ MOTOR PRODUJO ESTE NÚMERO.
         *
         * Sin esto, dos mediciones separadas seis meses son incomparables y
         * nadie puede decir si mejoró el atleta o mejoró el algoritmo. Con
         * esto se puede expulsar del perfil carga-velocidad lo que salió de un
         * motor que luego se descubrió sesgado, sin tirar lo bueno.
         *
         * Viaja como entero porque la bolsa de métricas es numérica; se
         * formatea al enseñarlo. Ver src/lib/cv/engineVersion.ts.
         */
        engine_version: PWR_ENGINE_VERSION_CODE,
        // CÓMO se midió, junto a lo medido.
        //
        // Sin estas cinco claves, dentro de seis meses no hay forma de saber
        // si aquel 0,71 m/s de marzo se midió con el disco detectado o con un
        // aro puesto a ojo, ni con cuántos fotogramas perdidos. Con ellas, una
        // medición se puede auditar o expulsar del perfil a posteriori.
        //
        // Que quepan sin migración es justamente para lo que se montó la
        // bolsa JSONB: son cinco filas en `metric_definitions` y nada más.
        ...qualityToMetricBag(quality, calibration, trackingStats),

        /**
         * CON QUÉ BARRA se levantó, en kilos.
         *
         * Va como masa y no como código de barra porque un número con unidades
         * sigue significando algo dentro de seis meses. Sirve para lo que hoy
         * no se puede hacer: separar las mediciones hechas con barra de peso
         * muerto —donde el disco arranca después que la barra— al leer un
         * perfil, en vez de mezclarlas sin saberlo.
         */
        bar_mass_kg: barMassMetric(setup),
      },
      loadKg,
      reps: advMetrics.totalReps,
      exerciseType,
      quality,
      setup,
      oneRm: advMetrics.rm,
      repDetails: advMetrics.concentrics,
    });
  }, [advMetrics, series, loadKg, exerciseType, onResult, quality, calibration, trackingStats, setup]);

  // Format data for Scatter Chart (Bar Path)
  const barPathData = useMemo(() => {
      // Invert Y axis for Scatter by using negative values, or configuring YAxis appropriately
      return path.map(p => ({ x: p.x, y: -p.y }));
  }, [path]);

  // Format data for Line Chart (Velocity Time Series)
  const chartData = useMemo(() => {
      // Normalize time to start at 0
      const startTime = metricsData.length > 0 ? metricsData[0].time : 0;
      return metricsData.map((d) => ({
          time: Number(((d.time - startTime) / 1000).toFixed(2)),
          videoTime: d.time / 1000,
          velocity: Number(d.velocity.toFixed(3))
      }));
  }, [metricsData]);

  // Calcular dominios 1:1 para evitar que Recharts estire los ejes y deforme el bar path
  const { xDomain, yDomain } = useMemo(() => {
      if (barPathData.length === 0) return { xDomain: [0, 100], yDomain: [0, 100] };
      
      let minX = barPathData[0].x, maxX = barPathData[0].x;
      let minY = barPathData[0].y, maxY = barPathData[0].y;
      
      barPathData.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
      });

      const xSpan = maxX - minX;
      const ySpan = maxY - minY;
      const maxSpan = Math.max(xSpan, ySpan) * 1.1; // 10% padding
      
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      return {
          xDomain: [Math.floor(midX - maxSpan / 2), Math.ceil(midX + maxSpan / 2)],
          yDomain: [Math.floor(midY - maxSpan / 2), Math.ceil(midY + maxSpan / 2)]
      };
  }, [barPathData]);

  const activePoint = useMemo(() => {
      if (currentVideoTime === undefined || chartData.length === 0) return null;
      let closest = chartData[0];
      let minDiff = Infinity;
      for (const p of chartData) {
          const diff = Math.abs(p.videoTime - currentVideoTime);
          if (diff < minDiff) { 
              minDiff = diff; 
              closest = p; 
          }
      }
      return minDiff < 0.2 ? closest : null; // Si nos salimos del data range por mucho, ocultamos.
  }, [currentVideoTime, chartData]);

  /**
   * NO ENCONTRAR NINGUNA REPETICIÓN TIENE QUE DECIRSE.
   *
   * Antes, este caso era `return null`: el panel derecho aparecía en blanco, los
   * botones de guardar salían desactivados con un "todavía no hay métricas" y no
   * había ni una pista de qué había fallado ni de qué hacer distinto. Y es un
   * caso frecuente —escala mal puesta, recorte que se queda corto, seguimiento
   * perdido—, no una rareza.
   */
  if (path.length === 0 || !advMetrics || !quality) {
    const romPx = path.length > 1
      ? Math.max(...path.map(p => p.y)) - Math.min(...path.map(p => p.y))
      : 0;
    const romCm = romPx * pixelToMeterRatio * 100;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-card border border-warning/25 bg-warning/5 p-6 text-center">
        <AlertTriangle className="text-warning" size={26} aria-hidden="true" />
        <p className="text-t-sm font-bold text-ink">No se ha reconocido ninguna repetición</p>
        <p className="max-w-md text-t-xs leading-relaxed text-ink-subtle">
          Se han seguido {path.length} fotogramas
          {romPx > 0 && <> con un recorrido vertical de {romCm.toFixed(0)} cm</>}, y eso no llega a
          una repetición completa (hacen falta al menos 15 cm de recorrido y 0,15 s de subida
          continua).
        </p>
        <ul className="max-w-md space-y-1 text-left text-t-2xs leading-relaxed text-ink-subtle">
          <li>· Comprueba que el recorte incluye la subida entera, de abajo del todo a arriba del todo.</li>
          <li>· Comprueba la escala: {(pixelToMeterRatio * 1000).toFixed(2)} mm/px. Si el disco marcado
            no era un disco, el recorrido sale en centímetros equivocados.</li>
          <li>· Si la marca se ha ido del disco a mitad de la subida, vuelve a calibrar sobre un
            punto con más contraste.</li>
        </ul>
      </div>
    );
  }

  /**
   * LO PRIMERO QUE SE VE ES SI ESTO VALE.
   *
   * Va arriba del todo, antes que ninguna cifra, porque el orden de lectura es
   * el orden en que se forma la confianza: quien ve "0,58 m/s · 740 W" y
   * DESPUÉS un aviso, ya se ha creído el número.
   *
   * Cuando está bloqueado las métricas siguen viéndose, atenuadas. Ocultarlas
   * dejaría al usuario sin saber qué ha fallado ni cómo repetir la grabación
   * mejor; lo que no puede hacer es guardarlas.
   */
  const tone =
    quality.verdict === 'ok'
      ? { border: 'border-success/25', bg: 'bg-success/10', text: 'text-success', Icon: ShieldCheck, title: 'Medición fiable' }
      : quality.verdict === 'warn'
        ? { border: 'border-warning/25', bg: 'bg-warning/10', text: 'text-warning', Icon: ShieldAlert, title: 'Medición con salvedades' }
        : { border: 'border-danger/30', bg: 'bg-danger/10', text: 'text-danger-text', Icon: ShieldX, title: 'Medición no fiable — no se puede guardar' };

  /** Atenuar es la señal de "esto no te lo creas", sin llegar a esconderlo. */
  const dimmed = quality.verdict === 'blocked' ? 'opacity-50' : '';

  return (
    <div className="flex flex-col h-full gap-3 pb-2 w-full">

      <div className={`shrink-0 rounded-card border ${tone.border} ${tone.bg} p-3`}>
        <div className="flex items-start gap-2.5">
          <tone.Icon size={18} className={`mt-0.5 shrink-0 ${tone.text}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={`text-t-xs font-bold ${tone.text}`}>{tone.title}</span>
              <span className="text-t-2xs text-ink-subtle">
                {quality.score}/100 · {CALIBRATION_METHOD_LABEL[calibration.method]}
              </span>
            </div>

            {quality.reasons.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {quality.reasons.map(r => (
                  <li key={r} className="text-t-2xs leading-relaxed text-ink-subtle">· {r}</li>
                ))}
              </ul>
            )}

            {/* Una medición puede ser buena EN CONJUNTO y aun así tener
                métricas concretas que no aguantan. Decirlo aquí evita que
                alguien compare desviaciones horizontales entre dos vídeos
                grabados desde ángulos distintos. */}
            {quality.unreliableMetrics.length > 0 && quality.verdict !== 'blocked' && (
              <p className="mt-1.5 text-t-2xs leading-relaxed text-ink-subtle">
                Interpretar con cuidado: {quality.unreliableMetrics.map(k => UNRELIABLE_LABEL[k] ?? k).join(', ')}.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* CON QUÉ SE HA ANALIZADO.
          La carga y el movimiento ya no se tocan aquí: se contestan antes de
          ver el vídeo (ver `AnalysisSetup`). Lo que queda es enseñar con qué se
          está midiendo y, sobre todo, de dónde sale el 1RM: la misma cifra
          significa cosas muy distintas si viene de la recta del atleta o de la
          media de todo el mundo. */}
      <div className="shrink-0 rounded-card border border-subtle bg-surface-sunken px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Dumbbell size={14} className="text-ink-faint" aria-hidden="true" />
              <span className="text-t-2xs font-bold text-ink">{EXERCISE_LABEL[exerciseType]}</span>
              <span className="text-t-2xs font-bold tabular-nums text-brand-text">{loadKg} kg</span>
              {advMetrics.totalReps > 1 && (
                  <span className="text-t-2xs font-semibold text-ink-subtle">
                      {advMetrics.totalReps} repeticiones
                  </span>
              )}
              <span className="ml-auto text-t-2xs font-semibold text-ink-subtle">
                  {advMetrics.rm.source === 'athlete'
                      ? `1RM con su perfil (${athleteProfile.measurements} mediciones)`
                      : '1RM con perfil genérico'}
              </span>
          </div>

          {/* Por qué NO se ha usado su perfil. Sin esto, "genérico" es un
              adjetivo sin salida: con esto se sabe qué falta para dejar de
              serlo —tres mediciones más, o cargas más separadas—. */}
          {advMetrics.rm.source === 'generic' && advMetrics.rm.fallbackReason && athleteId && (
              <p className="mt-1 text-t-2xs leading-relaxed text-ink-subtle">
                  Se usa el genérico porque {advMetrics.rm.fallbackReason}.
              </p>
          )}
      </div>

      {/* Las salvedades que trae el AJUSTE, no la medición.
          Se conocen antes de analizar y viajan hasta aquí, porque el sitio
          donde hacen falta es al lado de las cifras que invalidan. */}
      {caveats.length > 0 && (
          <div className="shrink-0 space-y-1.5 rounded-card border border-warning/25 bg-warning/10 p-3">
              {caveats.map(text => (
                  <p key={text} className="flex gap-2 text-t-2xs leading-relaxed text-ink-muted">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                      <span>{text}</span>
                  </p>
              ))}
          </div>
      )}

      {/* Summary Cards */}
      <div className={`grid grid-cols-3 gap-3 shrink-0 ${dimmed}`}>
         <div className="bg-[#241b1b] border border-[#ff3333]/10 p-3 rounded-xl flex items-center gap-2 overflow-hidden shadow-[0_4px_20px_rgba(255,51,51,0.05)]">
             <div className="p-2 bg-brand/10 rounded-lg text-brand-text shrink-0">
                 <Activity size={18} />
             </div>
             <div className="min-w-0">
                 <p className="text-ink-muted text-t-2xs font-bold uppercase tracking-widest mb-0.5 truncate">Velocidad Media</p>
                 <p className="text-lg font-black text-ink truncate">{advMetrics.concentric.meanVelocity.toFixed(2)} <span className="text-xs text-ink-subtle">m/s</span></p>
             </div>
         </div>

         <div className="bg-[#1b2024] border border-[#3399ff]/10 p-3 rounded-xl flex items-center gap-2 overflow-hidden shadow-[0_4px_20px_rgba(51,153,255,0.05)]">
             <div className="p-2 bg-info-quiet rounded-lg text-info shrink-0">
                 <Gauge size={18} />
             </div>
             <div className="min-w-0">
                 <p className="text-ink-muted text-t-2xs font-bold uppercase tracking-widest mb-0.5 truncate">Velocidad Pico</p>
                 <p className="text-lg font-black text-ink truncate">{advMetrics.concentric.peakVelocity.toFixed(2)} <span className="text-xs text-ink-subtle">m/s</span></p>
             </div>
         </div>

         <div className="bg-[#1b241e] border border-[#33ff99]/10 p-3 rounded-xl flex items-center gap-2 overflow-hidden shadow-[0_4px_20px_rgba(51,255,153,0.05)]">
             <div className="p-2 bg-success-quiet rounded-lg text-success shrink-0">
                 <ArrowDownUp size={18} />
             </div>
             <div className="min-w-0">
                 <p className="text-ink-muted text-t-2xs font-bold uppercase tracking-widest mb-0.5 truncate">Recorrido (ROM)</p>
                 <p className="text-lg font-black text-ink truncate">{advMetrics.concentric.rom.toFixed(2)} <span className="text-xs text-ink-subtle">m</span></p>
             </div>
         </div>
      </div>

      <div className={`grid grid-cols-2 gap-3 flex-1 min-h-0 ${dimmed}`}>
          {/* Velocity Line Chart */}
          <div className="bg-surface-sunken border border-subtle p-3 rounded-xl flex flex-col h-full overflow-hidden">
              <h3 className="text-ink text-xs font-bold mb-2 flex items-center gap-1 shrink-0">
                  <Activity className="text-brand-text" size={14} />
                  Topología de Velocidad
              </h3>
              <div className="flex-1 min-h-[100px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                        data={chartData} 
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseMove={(e) => {
                            const payload = (e as Record<string, unknown>)?.activePayload as Array<{payload: {videoTime: number}}> | undefined;
                            if (payload && payload.length > 0) {
                                onTimeHover?.(payload[0].payload.videoTime);
                            }
                        }}
                        onMouseLeave={() => {
                            setIsHovering(false);
                            onTimeHover?.(-1);
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis 
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            dataKey="time" 
                            stroke="#666" 
                            tick={{ fill: '#666', fontSize: 10 }} 
                            tickMargin={5}
                        />
                        <YAxis 
                            stroke="#666" 
                            tick={{ fill: '#666', fontSize: 10 }} 
                            width={30}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1c1c1c', border: '1px solid #333', borderRadius: '6px', fontSize: '10px' }}
                            itemStyle={{ color: '#dc2626', fontWeight: 'bold' }}
                            labelStyle={{ color: '#999' }}
                        />
                        <Line type="monotone" dataKey="velocity" stroke="#dc2626" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        {!isHovering && activePoint && (
                            <ReferenceLine 
                                x={activePoint.time} 
                                stroke="#00ffaa" 
                                strokeWidth={2} 
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
              </div>
          </div>

          {/* Bar Path Scatter Chart */}
          <div className="bg-surface-sunken border border-subtle p-3 rounded-xl flex flex-col items-center h-full overflow-hidden">
              <h3 className="text-ink text-xs font-bold mb-2 flex items-center gap-1 w-full shrink-0">
                  <Target className="text-success" size={14} />
                  Trayectoria (1:1)
              </h3>
              
              <div className="flex-1 min-h-[100px] w-full max-w-[200px] xl:max-w-[300px] aspect-square bg-surface-sunken rounded-xl flex items-center justify-center border border-subtle">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis type="number" dataKey="x" stroke="#666" tick={false} domain={xDomain} />
                        <YAxis type="number" dataKey="y" stroke="#666" tick={false} domain={yDomain} />
                        <Tooltip 
                            cursor={{ strokeDasharray: '3 3' }} 
                            contentStyle={{ backgroundColor: '#1c1c1c', border: '1px solid #333', borderRadius: '6px', fontSize: '10px' }}
                            formatter={(value, name) => [Number(value).toFixed(1), String(name)]}
                        />
                        <Scatter name="Bar Path" data={barPathData} fill="#22c55e" line={{ stroke: '#22c55e', strokeWidth: 2 }} shape="circle" />
                    </ScatterChart>
                </ResponsiveContainer>
              </div>
          </div>
      </div>

      {/* Grid de Métricas Avanzadas (La "Magia Físico-Matemática") */}
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0 ${dimmed}`}>
          {/* Potencia */}
          <div className="bg-surface-sunken border border-warning/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(234,179,8,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <Zap size={12} className="text-warning" />
                 <p className="text-t-2xs font-bold text-ink-muted tracking-widest uppercase truncate">Potencia</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-ink">{Math.round(advMetrics.dynamics.meanPower)}</p>
                 <span className="text-t-2xs xl:text-xs font-bold text-ink-subtle">/ {Math.round(advMetrics.dynamics.peakPower)} W</span>
              </div>
          </div>

          {/* Fuerza N */}
          <div className="bg-surface-sunken border border-orange-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(249,115,22,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <Flame size={12} className="text-orange-500" />
                 {/* "Fuerza en barra" y no "Fuerza suelo", que es lo que ponía.
                     Esto es m·(g+a) con m la CARGA: la fuerza aplicada a la
                     barra. La fuerza contra el suelo incluye además el peso del
                     atleta y la aceleración de su centro de masas, que un vídeo
                     de la barra no puede ver. Con el nombre anterior el número
                     parecía comparable con una plataforma de fuerzas. */}
                 <p className="text-t-2xs font-bold text-ink-muted tracking-widest uppercase truncate" title="m · (g + a) sobre la carga de la barra. No es la fuerza contra el suelo.">Fuerza en barra</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-ink">{Math.round(advMetrics.dynamics.peakForce)}</p>
                 <span className="text-t-2xs xl:text-xs font-bold text-ink-subtle">N</span>
              </div>
          </div>

          {/* RFD */}
          <div className="bg-surface-sunken border border-blue-400/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(96,165,250,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <TrendingUp size={12} className="text-info" />
                 <p className="text-t-2xs font-bold text-ink-muted tracking-widest uppercase truncate">RFD</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-ink">{Math.round(advMetrics.dynamics.rfd)}</p>
                 <span className="text-t-2xs xl:text-xs font-bold text-ink-subtle">N/s</span>
              </div>
          </div>

          {/* Sticking Point */}
          <div className="bg-surface-sunken border border-danger/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(239,68,68,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <AlertTriangle size={12} className="text-danger-text" />
                 <p className="text-t-2xs font-bold text-ink-muted tracking-widest uppercase truncate">Sticking Point</p>
              </div>
              {/* `null` significa que la curva de velocidad tiene un solo
                  máximo: la barra subió sin pararse. Es información, no un
                  fallo — y no es lo mismo que la versión anterior, que en ese
                  caso enseñaba la velocidad MÁXIMA como si fuera el punto malo. */}
              <div className="flex flex-col">
                 {advMetrics.concentric.minVelocity !== null ? (
                   <>
                     <p className="text-lg xl:text-xl font-black text-ink">{advMetrics.concentric.minVelocity.toFixed(2)}<span className="text-t-2xs xl:text-xs font-bold text-ink-muted ml-1">m/s</span></p>
                     <p className="text-t-2xs font-bold text-danger-text mt-0.5 uppercase">
                       A {(advMetrics.concentric.stickingHeight ?? 0).toFixed(2)}m
                     </p>
                   </>
                 ) : (
                   <>
                     <p className="text-lg xl:text-xl font-black text-ink">—</p>
                     <p className="text-t-2xs font-bold text-ink-subtle mt-0.5 uppercase">Sin estancamiento</p>
                   </>
                 )}
              </div>
          </div>

          {/* Desviacion X */}
          <div className="bg-surface-sunken border border-purple-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(168,85,247,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <MoveHorizontal size={12} className="text-purple-500" />
                 <p className="text-t-2xs font-bold text-ink-muted tracking-widest uppercase truncate">Desviación X</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-ink">{advMetrics.concentric.horizontalDeviationCm.toFixed(1)}</p>
                 <span className="text-t-2xs xl:text-xs font-bold text-ink-subtle">cm</span>
              </div>
          </div>

          {/* Tiempos Fase */}
          <div className="bg-surface-sunken border border-teal-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(20,184,166,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <Clock size={12} className="text-teal-500" />
                 <p className="text-t-2xs font-bold text-ink-muted tracking-widest uppercase truncate">Tiempo Exc / Con</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-ink">{advMetrics.eccentric ? advMetrics.eccentric.duration.toFixed(2) : '—'}<span className="text-t-2xs text-ink-subtle ml-0.5">s</span></p>
                 <span className="text-t-2xs xl:text-xs font-bold text-ink-subtle">/ {advMetrics.concentric.duration.toFixed(2)}s</span>
              </div>
          </div>

          {/* Pérdida de Vel */}
          <div className="bg-surface-sunken border border-pink-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(236,72,153,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <Percent size={12} className="text-pink-500" />
                 <p className="text-t-2xs font-bold text-ink-muted tracking-widest uppercase truncate">Fatiga</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-ink">{Math.max(0, advMetrics.fatigue).toFixed(1)}</p>
                 <span className="text-t-2xs xl:text-xs font-bold text-ink-subtle">%</span>
              </div>
          </div>

          {/* 1RM Estimado.
              `reliable === false` significa que la velocidad medida cae fuera
              del tramo donde la relación carga-velocidad es lineal, así que la
              extrapolación no significa nada. Antes se saturaba al 15% y salía
              un 1RM de casi siete veces la carga con la misma tipografía que
              uno bueno. */}
          <div className={`bg-gradient-to-br from-brand/20 to-orange-500/20 border-2 border-brand/40 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_0_30px_rgba(220,38,38,0.1)] ${advMetrics.rm.reliable ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-1 mb-1">
                 <Award size={12} className="text-ink" />
                 <p className="text-t-2xs font-bold text-ink tracking-widest uppercase truncate">1RM Est.</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-xl xl:text-2xl font-black text-ink drop-shadow-md">{Math.round(advMetrics.rm.rm)}</p>
                 <span className="text-t-2xs xl:text-xs font-bold text-ink-muted">Kg ({Math.round(advMetrics.rm.percent)}%)</span>
              </div>
              {!advMetrics.rm.reliable && (
                 <p className="text-t-2xs font-bold text-ink-subtle mt-0.5 uppercase leading-tight">
                    Fuera del tramo lineal
                 </p>
              )}
          </div>
      </div>

      {/* ---------------------------------------------------------------
          LA SERIE ENTERA, REPETICIÓN A REPETICIÓN

          Todo lo de arriba describe UNA repetición: la de mayor velocidad de
          pico. Eso sirve para registrar la serie en el histórico, pero no para
          entrenar: lo que dice si la serie fue buena es cómo se comportaron
          todas, y eso ya estaba calculado y se tiraba.
          --------------------------------------------------------------- */}
      {series && (
        <div className="shrink-0 border-t border-subtle pt-3">
          <SeriesReport
            concentrics={advMetrics.concentrics}
            eccentrics={advMetrics.eccentrics}
            series={series}
            dimmed={quality.verdict === 'blocked'}
            report={buildPwrReport({
              concentrics: advMetrics.concentrics,
              eccentrics: advMetrics.eccentrics,
              series,
              calibration,
              quality,
              loadKg,
              exerciseType,
              now: reportBuiltAt,
            })}
          />

          {/* La versión del motor va con los datos, no en un «acerca de».
              Cuando dentro de un año se compare esta medición con otra, lo
              primero que hay que poder mirar es si las produjo el mismo
              algoritmo. */}
          <p className="mt-2 text-right text-t-2xs text-ink-subtle">
            {PWR_ENGINE_LABEL}
          </p>
        </div>
      )}

    </div>
  );
}
