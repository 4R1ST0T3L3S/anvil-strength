import ReactDOM from 'react-dom/client';
import { computeKinematics, type RawPoint } from '../lib/cv/signal';
import { extractLiftingPhases, summariseSeries } from '../lib/cv/pwrMath';
import { SeriesReport } from '../features/coach/components/pwr/SeriesReport';
import { PWR_ENGINE_LABEL } from '../lib/cv/engineVersion';
import { assessQuality } from '../lib/cv/quality';
import { buildPwrReport } from '../lib/export/pwrReport';
import { collectCharts, pwrToCsv, pwrToPdf, pwrToXlsx } from '../lib/export/pwrExport';
import type { Calibration } from '../lib/cv/plateGeometry';
import '../index.css';

/**
 * BANCO DE PRUEBAS DEL INFORME DE SERIE — solo desarrollo.
 *
 * Ver pwr-preview.html. Se sirve en /pwr-preview.html y no entra en el bundle.
 *
 * Genera una serie de cuatro repeticiones con fatiga creciente y estancamiento,
 * pasándolas por el MISMO motor que usa la aplicación: perfil de velocidad
 * conocido → integración a posición → píxeles con ruido de seguimiento →
 * `computeKinematics` → `extractLiftingPhases` → `summariseSeries`.
 *
 * Es decir: lo que se ve aquí no es una maqueta con números inventados, son las
 * métricas de verdad calculadas sobre un levantamiento cuya verdad se conoce.
 */

const FINE_DT = 1e-4;
const RAMP_S = 0.08;
/** Disco de 45 cm midiendo 300 px de alto. */
const RATIO = 0.45 / 300;

const bell = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2));

const windowRamp = (t: number, T: number) => {
    if (t <= 0 || t >= T) return 0;
    if (t < RAMP_S) return 0.5 * (1 - Math.cos((Math.PI * t) / RAMP_S));
    if (t > T - RAMP_S) return 0.5 * (1 - Math.cos((Math.PI * (T - t)) / RAMP_S));
    return 1;
};

/** Una concéntrica con estancamiento, escalada por `factor` para simular fatiga. */
const profile = (factor: number) => {
    const T = 1.15;
    return {
        T,
        v: (t: number) =>
            windowRamp(t, T) * factor * (0.88 * bell(t, 0.26, 0.15) + 0.72 * bell(t, 0.82, 0.20)),
    };
};

function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** El recorrido en píxeles que vería el seguimiento sobre la serie entera. */
function buildSeriesPath(factors: number[], fps: number, noisePx: number): RawPoint[] {
    const rand = rng(2026);
    const dt = 1 / fps;
    const path: RawPoint[] = [];

    let clockS = 0;
    let heightM = 0;

    for (const factor of factors) {
        const { T, v } = profile(factor);
        /** La bajada dura un 25% más que la subida, como en un levantamiento real. */
        const SLOWDOWN = 1.25;
        const restS = 0.45;
        const eccentricS = T * SLOWDOWN;
        const totalS = restS + T + eccentricS + restS;

        let nextSample = 0;

        for (let i = 0; i * FINE_DT <= totalS; i++) {
            const t = i * FINE_DT;

            if (t > restS && t <= restS + T) {
                heightM += v(t - restS) * FINE_DT;
            } else if (t > restS + T && t <= restS + T + eccentricS) {
                // El MISMO perfil, estirado en el tiempo y escalado en amplitud
                // por el mismo factor. Así la integral de la bajada es idéntica
                // a la de la subida y la barra vuelve EXACTAMENTE al inicio, sin
                // deriva que se acumule de una repetición a la siguiente.
                heightM -= (v((t - restS - T) / SLOWDOWN) / SLOWDOWN) * FINE_DT;
            }

            if (t >= nextSample) {
                const gauss = (rand() + rand() + rand() + rand() - 2) * 1.2;
                path.push({
                    x: 400 + gauss * noisePx * 0.5,
                    // En el lienzo la Y crece hacia abajo: subir es que la Y baje.
                    y: 600 - heightM / RATIO + gauss * noisePx,
                    timestamp: (clockS + t) * 1000,
                });
                nextSample += dt;
            }
        }

        clockS += totalS;
    }

    return path;
}

/** Una calibración plausible, para que el informe tenga metadatos de verdad. */
const CALIBRATION: Calibration = {
    method: 'auto',
    pixelToMeterRatio: RATIO,
    plateDiameterM: 0.45,
    verticalExtentPx: 300,
    obliquityDeg: 12,
    detectionScore: 0.93,
    ellipse: { cx: 400, cy: 360, width: 306, height: 300, angleDeg: 0 },
};

/**
 * La serie de demostración, calculada UNA vez al cargar el módulo.
 *
 * Fuera del componente para que el gancho de pruebas de abajo use exactamente
 * los mismos datos que se están viendo en pantalla, y no otra tirada del
 * generador.
 */
function buildDemo() {
    const path = buildSeriesPath([1.0, 0.92, 0.82, 0.70], 60, 1.0);
    const kinematics = computeKinematics(path, RATIO);
    const { concentrics, eccentrics } = extractLiftingPhases(kinematics, RATIO);
    const series = summariseSeries(concentrics, 140);

    const quality = concentrics.length
        ? assessQuality({
            calibration: CALIBRATION,
            tracking: {
                framesProcessed: path.length,
                framesLost: 3,
                maxJumpPx: 4,
                frameHeightPx: 720,
                durationS: path[path.length - 1].timestamp / 1000,
                exactTimestamps: true,
                medianTrackedPoints: 20,
            },
            concentricSamples: concentrics[0].dataPoints.length,
            concentricDurationS: concentrics[0].duration,
            romM: concentrics[0].rom,
            meanVelocityMs: concentrics[0].meanVelocity,
        })
        : null;

    const report = series && quality
        ? buildPwrReport({
            concentrics,
            eccentrics,
            series,
            calibration: CALIBRATION,
            quality,
            loadKg: 140,
            exerciseType: 'squat',
            fps: 60,
            athleteName: 'Atleta de prueba',
            now: new Date(2026, 7, 18, 12, 0, 0),
        })
        : null;

    return { concentrics, eccentrics, series, report };
}

const DEMO = buildDemo();

function Preview() {
    const { concentrics, eccentrics, series, report } = DEMO;

    return (
        <div className="min-h-[100dvh] bg-surface-canvas p-4 text-ink">
            <header className="mx-auto mb-4 max-w-6xl">
                <h1 className="text-t-lg font-black text-ink">Informe de serie · banco de pruebas</h1>
                <p className="mt-1 text-t-2xs text-ink-subtle">
                    Cuatro repeticiones sintéticas con fatiga creciente y estancamiento, a 60 fps con
                    1 px de ruido de seguimiento, pasadas por el motor real. {PWR_ENGINE_LABEL}.
                </p>
                <p className="mt-1 text-t-2xs text-ink-faint">
                    Detectadas: {concentrics.length} concéntricas · {eccentrics.length} excéntricas.
                </p>
            </header>

            <main className="mx-auto max-w-6xl">
                {series ? (
                    <SeriesReport
                        concentrics={concentrics}
                        eccentrics={eccentrics}
                        series={series}
                        report={report}
                    />
                ) : (
                    <p className="rounded-card border border-danger/30 bg-danger/10 p-4 text-t-sm font-bold text-danger-text">
                        No se ha segmentado ninguna repetición: el generador o el motor están rotos.
                    </p>
                )}
            </main>
        </div>
    );
}

/**
 * La raíz se guarda entre recargas en caliente.
 *
 * `createRoot` sobre un contenedor que ya tiene raíz avisa por consola en cada
 * recarga, y en un banco que se toca mucho eso llena la consola de errores que
 * no son del código que se está probando.
 */
const container = document.getElementById('root')! as HTMLElement & { _root?: ReactDOM.Root };
container._root ??= ReactDOM.createRoot(container);
container._root.render(<Preview />);

/**
 * Gancho para comprobar la exportación desde la consola. SOLO en desarrollo.
 *
 * Existe porque generar el PDF de verdad descarga un fichero, y para saber si
 * funciona basta con medir lo que produce. Con esto se puede pedir el tamaño y
 * el número de páginas sin llenarle a nadie la carpeta de descargas.
 */
declare global {
    interface Window {
        __pwrExportTest?: () => Promise<unknown>;
    }
}

window.__pwrExportTest = async () => {
    const report = DEMO.report;
    if (!report) return { error: 'sin informe' };

    const root = document.querySelector('main');
    const charts = root ? await collectCharts(root as HTMLElement) : [];
    const doc = pwrToPdf(report, charts);
    const blob = doc.output('blob') as Blob;
    const xlsx = pwrToXlsx(report);
    const csv = pwrToCsv(report);

    return {
        graficas: charts.length,
        pdfPaginas: doc.getNumberOfPages(),
        pdfBytes: blob.size,
        xlsxBytes: xlsx.size,
        csvLineas: csv.split('\r\n').length,
    };
};
