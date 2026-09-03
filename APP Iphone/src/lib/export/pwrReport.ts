import type { PhaseMetrics, SeriesMetrics } from '../cv/pwrMath';
import type { Calibration } from '../cv/plateGeometry';
import { CALIBRATION_METHOD_LABEL } from '../cv/plateGeometry';
import type { QualityReport } from '../cv/quality';
import { PWR_ENGINE_LABEL } from '../cv/engineVersion';

/**
 * ANVIL STRENGTH — EL INFORME DE PWR, EN UN SOLO SITIO
 * =====================================================================
 *
 * POR QUÉ ESTE FICHERO EXISTE
 *
 * Hay tres exportaciones —CSV, Excel y PDF— y las tres tienen que decir lo
 * mismo. Si cada una construye sus columnas por su cuenta, al añadir una
 * métrica se actualizan dos y se olvida la tercera; y el que recibe el PDF y el
 * que recibe el Excel discuten sobre cuál está bien.
 *
 * Aquí se define **una sola vez** qué columnas hay, cómo se llaman, en qué
 * unidad van y con cuántos decimales. Los tres exportadores consumen esto y no
 * saben nada de biomecánica.
 *
 *
 * POR QUÉ LOS VALORES VIAJAN COMO NÚMERO Y NO COMO TEXTO YA FORMATEADO
 *
 * Porque en una hoja de cálculo un número tiene que ser un número: si se exporta
 * «0,58 m/s» como texto, no se puede promediar, ni ordenar, ni graficar — que es
 * exactamente para lo que alguien pide un Excel. El formateo se aplica al
 * pintar (PDF) o al escribir la celda (CSV), no antes.
 */

// =====================================================================
// COLUMNAS
// =====================================================================

export interface ReportColumn {
    key: string;
    label: string;
    /** Unidad, sin paréntesis. Cadena vacía si no tiene. */
    unit: string;
    decimals: number;
}

/**
 * Las columnas de la tabla por repetición, en orden de lectura.
 *
 * El orden no es alfabético ni casual: primero lo que identifica la repetición,
 * luego lo que se mide del movimiento, luego lo que se mide del problema
 * (el estancamiento). Es el orden en que un entrenador lee una serie.
 */
export const REP_COLUMNS: ReportColumn[] = [
    { key: 'index', label: 'Repetición', unit: '', decimals: 0 },
    { key: 'rom', label: 'ROM', unit: 'm', decimals: 3 },
    { key: 'meanVelocity', label: 'Velocidad media', unit: 'm/s', decimals: 3 },
    { key: 'propulsiveVelocity', label: 'Velocidad propulsiva', unit: 'm/s', decimals: 3 },
    { key: 'propulsivePercent', label: 'Recorrido propulsivo', unit: '%', decimals: 0 },
    { key: 'peakVelocity', label: 'Velocidad pico', unit: 'm/s', decimals: 3 },
    { key: 'peakAcceleration', label: 'Aceleración pico', unit: 'm/s²', decimals: 1 },
    { key: 'timeToPeakVelocityS', label: 'Tiempo hasta velocidad pico', unit: 's', decimals: 2 },
    { key: 'concentricDuration', label: 'Duración concéntrica', unit: 's', decimals: 2 },
    { key: 'eccentricDuration', label: 'Duración excéntrica', unit: 's', decimals: 2 },
    { key: 'totalDuration', label: 'Duración total', unit: 's', decimals: 2 },
    // Las etiquetas no llevan la unidad dentro: los exportadores la añaden entre
    // paréntesis, y ponerla en las dos partes daba cabeceras como
    // «Estancamiento (% ROM) (%)».
    { key: 'stickingRomPercent', label: 'Estancamiento en el ROM', unit: '%', decimals: 0 },
    { key: 'stickingDistance', label: 'Distancia al estancamiento', unit: 'm', decimals: 3 },
    { key: 'stickingMinVelocity', label: 'Velocidad mínima', unit: 'm/s', decimals: 3 },
    { key: 'stickingDuration', label: 'Duración del estancamiento', unit: 's', decimals: 2 },
    { key: 'horizontalDeviationCm', label: 'Desviación horizontal', unit: 'cm', decimals: 1 },
];

/** Las filas del resumen de serie. Van en vertical, que es como se leen. */
export const SERIES_ROWS: ReportColumn[] = [
    { key: 'repCount', label: 'Repeticiones', unit: '', decimals: 0 },
    { key: 'meanVelocity', label: 'Velocidad media de la serie', unit: 'm/s', decimals: 3 },
    { key: 'meanPropulsiveVelocity', label: 'Velocidad propulsiva media', unit: 'm/s', decimals: 3 },
    { key: 'meanRom', label: 'ROM medio', unit: 'm', decimals: 3 },
    { key: 'bestRepIndex', label: 'Mejor repetición', unit: '', decimals: 0 },
    { key: 'bestRepVelocity', label: 'Velocidad de la mejor', unit: 'm/s', decimals: 3 },
    { key: 'worstRepIndex', label: 'Peor repetición', unit: '', decimals: 0 },
    { key: 'worstRepVelocity', label: 'Velocidad de la peor', unit: 'm/s', decimals: 3 },
    { key: 'velocityLoss', label: 'Pérdida de velocidad', unit: '%', decimals: 1 },
    { key: 'consistencyCv', label: 'Consistencia (CV)', unit: '%', decimals: 1 },
    { key: 'meanPower', label: 'Potencia media', unit: 'W', decimals: 0 },
    { key: 'peakPower', label: 'Potencia máxima', unit: 'W', decimals: 0 },
    { key: 'timeUnderTensionS', label: 'Tiempo bajo tensión', unit: 's', decimals: 2 },
    { key: 'activeTimeS', label: 'Tiempo en movimiento', unit: 's', decimals: 2 },
];

// =====================================================================
// EL INFORME
// =====================================================================

/** Una fila de metadatos: cómo y cuándo se midió esto. */
export interface ReportFact {
    label: string;
    value: string;
}

export interface PwrReport {
    title: string;
    /** Fecha en formato ISO, para nombres de fichero. */
    isoDate: string;
    /** Fecha legible, para cabeceras. */
    prettyDate: string;
    facts: ReportFact[];
    seriesRows: { column: ReportColumn; value: number | null }[];
    repRows: Record<string, number | null>[];
    /**
     * Advertencias que TIENEN que viajar con los datos.
     *
     * Un CSV sin contexto acaba pegado en una hoja junto a mediciones de
     * encoder, y a esas alturas nadie recuerda que aquella serie salió con la
     * cámara a 40° y la nota en 58. Ver `quality.ts`.
     */
    warnings: string[];
}

const EXERCISE_LABEL: Record<string, string> = {
    squat: 'Sentadilla',
    bench: 'Press banca',
    deadlift: 'Peso muerto',
};

const VERDICT_LABEL: Record<QualityReport['verdict'], string> = {
    ok: 'Fiable',
    warn: 'Con salvedades',
    blocked: 'No fiable',
};

export interface BuildReportInput {
    concentrics: PhaseMetrics[];
    eccentrics: PhaseMetrics[];
    series: SeriesMetrics;
    calibration: Calibration;
    quality: QualityReport;
    loadKg: number;
    exerciseType: 'squat' | 'bench' | 'deadlift';
    /** Cadencia real del vídeo, si se conoce. */
    fps?: number | null;
    athleteName?: string | null;
    /** El instante en que se genera. Se pasa para que la función sea pura. */
    now: Date;
}

/** Redondea, o devuelve `null` para lo que no sea un número utilizable. */
function round(value: number | null | undefined, decimals: number): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

export function buildPwrReport(input: BuildReportInput): PwrReport {
    const { concentrics, eccentrics, series, calibration, quality, loadKg, exerciseType, now } = input;

    /** La excéntrica que precede a cada concéntrica. */
    const eccentricBefore = new Map<number, PhaseMetrics>();
    for (const c of concentrics) {
        const previous = [...eccentrics].reverse().find(e => e.endTime <= c.startTime);
        if (previous) eccentricBefore.set(c.index, previous);
    }

    const repRows = concentrics.map(rep => {
        const ecc = eccentricBefore.get(rep.index);
        const raw: Record<string, number | null | undefined> = {
            index: rep.index,
            rom: rep.rom,
            meanVelocity: rep.meanVelocity,
            propulsiveVelocity: rep.propulsiveVelocity,
            propulsivePercent: rep.propulsiveRatio !== null ? rep.propulsiveRatio * 100 : null,
            peakVelocity: rep.peakVelocity,
            peakAcceleration: rep.peakAcceleration,
            timeToPeakVelocityS: rep.timeToPeakVelocityS,
            concentricDuration: rep.duration,
            eccentricDuration: ecc?.duration ?? null,
            totalDuration: (ecc?.duration ?? 0) + rep.duration,
            stickingRomPercent: rep.sticking?.romPercent ?? null,
            stickingDistance: rep.sticking?.distanceFromStartM ?? null,
            stickingMinVelocity: rep.sticking?.minVelocity ?? null,
            stickingDuration: rep.sticking?.durationS ?? null,
            horizontalDeviationCm: rep.horizontalDeviationCm,
        };

        const row: Record<string, number | null> = {};
        for (const column of REP_COLUMNS) row[column.key] = round(raw[column.key], column.decimals);
        return row;
    });

    const seriesValues: Record<string, number | null | undefined> = {
        repCount: series.repCount,
        meanVelocity: series.meanVelocity,
        meanPropulsiveVelocity: series.meanPropulsiveVelocity,
        meanRom: series.meanRom,
        bestRepIndex: series.bestRepIndex,
        bestRepVelocity: series.bestRepVelocity,
        worstRepIndex: series.worstRepIndex,
        worstRepVelocity: series.worstRepVelocity,
        velocityLoss: series.velocityLoss,
        consistencyCv: series.consistencyCv,
        meanPower: series.meanPower,
        peakPower: series.peakPower,
        timeUnderTensionS: series.timeUnderTensionS,
        activeTimeS: series.activeTimeS,
    };

    const facts: ReportFact[] = [
        { label: 'Ejercicio', value: EXERCISE_LABEL[exerciseType] ?? exerciseType },
        { label: 'Carga', value: `${loadKg} kg` },
        { label: 'Fecha', value: now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) },
        { label: 'Fiabilidad', value: `${quality.score}/100 · ${VERDICT_LABEL[quality.verdict]}` },
        { label: 'Calibración', value: CALIBRATION_METHOD_LABEL[calibration.method] },
        { label: 'Disco de referencia', value: `${(calibration.plateDiameterM * 100).toFixed(0)} cm · ${Math.round(calibration.verticalExtentPx)} px` },
        {
            label: 'Ángulo de cámara',
            value: calibration.obliquityDeg === null ? 'no estimado' : `${Math.round(calibration.obliquityDeg)}°`,
        },
        { label: 'Motor', value: PWR_ENGINE_LABEL },
    ];
    if (input.fps) facts.splice(3, 0, { label: 'Cadencia del vídeo', value: `${input.fps.toFixed(0)} fps` });
    if (input.athleteName) facts.unshift({ label: 'Atleta', value: input.athleteName });

    /**
     * Las advertencias van SIEMPRE, no solo cuando la medición está bloqueada.
     *
     * La aceleración pico se declara aquí y no en `quality.ts` porque no es un
     * problema de ESTA medición: es un límite del método. Un encoder la mide
     * bien y un vídeo no, y quien reciba este fichero tiene que saberlo antes de
     * comparar las dos cosas.
     */
    const warnings = [...quality.reasons];
    warnings.push(
        'La aceleración pico y las magnitudes derivadas de ella tienen ~17% de error absoluto ' +
        'medido sobre repeticiones sintéticas: sirven para ordenar repeticiones de una misma ' +
        'serie, no para compararlas con un encoder.'
    );
    if (quality.verdict === 'blocked') {
        warnings.unshift('MEDICIÓN NO FIABLE: estos números no deben usarse para tomar decisiones de entrenamiento.');
    }

    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    return {
        title: `PWR · ${EXERCISE_LABEL[exerciseType] ?? exerciseType} · ${loadKg} kg`,
        isoDate: iso,
        prettyDate: now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
        facts,
        seriesRows: SERIES_ROWS.map(column => ({ column, value: round(seriesValues[column.key], column.decimals) })),
        repRows,
        warnings,
    };
}

/** Nombre de fichero sin extensión, sin caracteres que molesten en Windows. */
export function reportFilename(report: PwrReport): string {
    return `pwr-${report.isoDate}-${report.title}`
        .toLowerCase()
        .normalize('NFD')
        // Los diacríticos, por punto de código y no pegados literalmente en la
        // expresión: un rango de caracteres combinantes escrito tal cual es
        // invisible en el editor y cualquiera lo rompe al tocar la línea.
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
