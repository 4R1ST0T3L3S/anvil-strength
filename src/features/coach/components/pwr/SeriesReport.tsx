import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    LineChart,
    ReferenceArea,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Download, FileSpreadsheet, FileText, Table2 } from 'lucide-react';
import type { PhaseMetrics, SeriesMetrics } from '../../../../lib/cv/pwrMath';
import type { PwrReport } from '../../../../lib/export/pwrReport';
import {
    chartSvgOf,
    chartToPng,
    collectCharts,
    downloadPwrCsv,
    downloadPwrPdf,
    downloadPwrXlsx,
} from '../../../../lib/export/pwrExport';

/**
 * ANVIL STRENGTH — EL INFORME DE LA SERIE
 * =====================================================================
 *
 * QUÉ ARREGLA ESTE COMPONENTE
 *
 * El motor calculaba TODAS las repeticiones y el panel enseñaba UNA. El resto
 * se tiraba en el mismo `useMemo` que las calculaba:
 *
 *     const bestRep = concentrics.reduce((prev, cur) =>
 *         prev.peakVelocity > cur.peakVelocity ? prev : cur);
 *
 * Con eso, una serie de cinco repeticiones se resumía en la mejor y en un
 * número de pérdida de velocidad. No había forma de ver que la tercera fue rara,
 * ni de comparar el recorrido entre ellas, ni de saber dónde se atascó cada una.
 * Todo eso ya estaba calculado.
 *
 *
 * POR QUÉ LAS GRÁFICAS VAN CONTRA EL % DE RECORRIDO Y NO SOLO CONTRA EL TIEMPO
 *
 * Dos repeticiones de la misma serie duran distinto. Superpuestas contra el
 * tiempo, la más lenta se sale por la derecha y la comparación no dice nada.
 * Contra el porcentaje de recorrido, las dos van de 0 a 100 y **se ve dónde**
 * —a qué altura del levantamiento— se perdió la velocidad. Que es la pregunta.
 */

// =====================================================================
// EXPORTAR UNA GRÁFICA
// =====================================================================

/**
 * Descarga una gráfica suelta como PNG.
 *
 * El rasterizado vive en `lib/export/pwrExport.ts` y se usa el mismo aquí y
 * para el PDF: si fueran dos implementaciones, la gráfica del PDF y la que se
 * descarga con el botón acabarían siendo distintas sin que nadie lo notara.
 */
async function downloadChartPng(container: HTMLElement | null, filename: string) {
    // El mismo criterio que usa el PDF —la superficie más grande— y no el
    // primer `svg`: ver la nota de `findChartSvg`. Compartir el criterio es lo
    // que evita que el botón descargue una cosa y el PDF lleve otra.
    const svg = chartSvgOf(container);
    if (!svg) return;

    const image = await chartToPng(svg);
    if (!image) return;

    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = image.dataUrl;
    link.click();
}

// =====================================================================
// PALETA POR REPETICIÓN
// =====================================================================

/**
 * Un color por repetición, estable entre gráficas.
 *
 * Estable importa: si la repetición 3 es azul en una gráfica y verde en otra,
 * las dos gráficas juntas cuentan cosas distintas.
 */
const REP_COLOURS = ['#ff3333', '#3399ff', '#33cc66', '#ffaa33', '#aa66ff', '#00cccc', '#ff66aa', '#99cc00'];
const repColour = (index: number) => REP_COLOURS[(index - 1) % REP_COLOURS.length];

// =====================================================================
// PIEZAS
// =====================================================================

/**
 * `true` en cuanto el elemento tiene tamaño de verdad.
 *
 * POR QUÉ NO BASTA CON `ResponsiveContainer`
 *
 * Su primer render ocurre con 0×0, porque hasta que no está en el DOM no puede
 * medirse. En esa pasada las escalas no existen y los componentes de área
 * generan `d="undefined"`, que el navegador rechaza con
 *
 *     <path> attribute d: Expected moveto path command ('M' or 'm'), "undefined"
 *
 * Cinco de esos por cada informe —dos por cada `Area`, uno de la
 * `ReferenceArea`—. No rompe nada: la segunda pasada, ya con tamaño, pinta bien.
 * Pero llena la consola de errores rojos, y una consola con ruido de fondo es
 * una consola donde el error de verdad no se ve. Que es exactamente el tipo de
 * fallo que este proyecto se ha comido ya varias veces.
 *
 * Esperar a tener tamaño ahorra además la pasada inútil de las ocho gráficas.
 *
 * LO QUE ESTO NO ARREGLA: `ResponsiveContainer` arranca su estado interno en
 * −1 y avisa por consola una vez por gráfica antes de que su propio observador
 * mida. Es comportamiento suyo y no se puede evitar desde fuera sin pasarle
 * dimensiones en píxeles, que es peor negocio: habría que reimplementar el
 * redimensionado responsivo entero para quitar un aviso. Son AVISOS, no
 * errores; los errores sí desaparecen.
 */
function useHasSize(ref: React.RefObject<HTMLElement | null>) {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;

        // Puede que ya tenga tamaño en el primer efecto: entonces no hace falta
        // esperar a que el observador dispare.
        if (node.clientWidth > 0 && node.clientHeight > 0) {
            setReady(true);
            return;
        }

        const observer = new ResizeObserver(entries => {
            const box = entries[0]?.contentRect;
            if (box && box.width > 0 && box.height > 0) {
                setReady(true);
                observer.disconnect();
            }
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [ref]);

    return ready;
}

function ChartCard({
    title,
    subtitle,
    filename,
    children,
}: {
    title: string;
    subtitle?: string;
    filename: string;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const hasSize = useHasSize(ref);

    return (
        // `data-chart-card` es cómo el exportador de PDF encuentra las gráficas
        // y con qué título ponerlas. Va en el marcado y no en una lista aparte
        // para que añadir una gráfica la incluya en el PDF sin tocar nada más.
        <div data-chart-card={title} className="flex flex-col rounded-card border border-subtle bg-surface-sunken p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h4 className="truncate text-t-xs font-bold text-ink">{title}</h4>
                    {subtitle && <p className="mt-0.5 text-t-2xs text-ink-faint">{subtitle}</p>}
                </div>
                <button
                    type="button"
                    onClick={() => void downloadChartPng(ref.current, filename)}
                    title="Descargar esta gráfica como PNG"
                    aria-label={`Descargar «${title}» como PNG`}
                    className="shrink-0 rounded-md p-1 text-ink-faint transition hover:bg-white/5 hover:text-ink"
                >
                    <Download size={13} aria-hidden="true" />
                </button>
            </div>
            <div ref={ref} className="h-52 w-full sm:h-56">
                {hasSize && children}
            </div>
        </div>
    );
}

const AXIS = { stroke: '#666', tick: { fill: '#888', fontSize: 10 } } as const;

const TOOLTIP_STYLE = {
    contentStyle: {
        background: '#141414',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        fontSize: 11,
    },
    labelStyle: { color: '#aaa', fontSize: 10 },
} as const;

// =====================================================================
// EL INFORME
// =====================================================================

interface SeriesReportProps {
    concentrics: PhaseMetrics[];
    eccentrics: PhaseMetrics[];
    series: SeriesMetrics;
    /** Atenúa todo cuando la medición está bloqueada por calidad. */
    dimmed?: boolean;
    /**
     * El informe listo para exportar. Sin él no se enseñan los botones.
     *
     * Se recibe hecho en vez de construirlo aquí porque hacen falta la
     * calibración, la nota de calidad, la carga y el ejercicio — cosas que este
     * componente no tiene por qué conocer para pintar unas gráficas.
     */
    report?: PwrReport | null;
}

export function SeriesReport({ concentrics, eccentrics, series, dimmed, report }: SeriesReportProps) {
    /** Contenedor de todo, para que el PDF encuentre las gráficas. */
    const rootRef = useRef<HTMLDivElement>(null);
    const [exporting, setExporting] = useState<null | 'pdf'>(null);

    /**
     * El PDF es el único que tarda: hay que rasterizar ocho gráficas.
     *
     * Se hace bajo demanda y no al montar porque la inmensa mayoría de los
     * análisis no se exportan nunca, y rasterizar ocho PNG a doble resolución
     * por si acaso es medio segundo de móvil tirado en cada análisis.
     */
    const exportPdf = async () => {
        if (!report || exporting) return;
        setExporting('pdf');
        try {
            const charts = rootRef.current ? await collectCharts(rootRef.current) : [];
            downloadPwrPdf(report, charts);
        } finally {
            setExporting(null);
        }
    };
    /**
     * Qué repetición está resaltada. `null` = todas por igual.
     *
     * Resaltar en vez de filtrar: con una sola repetición en pantalla se pierde
     * justo lo que se venía a ver, que es cómo se compara con las demás.
     */
    const [focused, setFocused] = useState<number | null>(null);

    /** La excéntrica que precede a cada concéntrica, para la tabla. */
    const eccentricBefore = useMemo(() => {
        const map = new Map<number, PhaseMetrics>();
        for (const c of concentrics) {
            const previous = [...eccentrics].reverse().find(e => e.endTime <= c.startTime);
            if (previous) map.set(c.index, previous);
        }
        return map;
    }, [concentrics, eccentrics]);

    /**
     * Series remuestreadas contra el % de recorrido.
     *
     * Se construye una rejilla común de 0 a 100 y se interpola cada repetición
     * sobre ella. Sin rejilla común, Recharts recibiría puntos con `romPct`
     * distintos por repetición y uniría los que no van juntos.
     */
    const byRomPercent = useMemo(() => {
        const STEPS = 51;
        const grid = Array.from({ length: STEPS }, (_, i) => (i / (STEPS - 1)) * 100);

        return grid.map(pct => {
            const row: Record<string, number> = { romPct: Number(pct.toFixed(1)) };

            for (const rep of concentrics) {
                const points = rep.dataPoints;
                if (points.length < 2) continue;

                let bottomY = points[0].y;
                let topY = points[0].y;
                for (const p of points) {
                    if (p.y > bottomY) bottomY = p.y;
                    if (p.y < topY) topY = p.y;
                }
                const spanPx = bottomY - topY;
                if (spanPx <= 0) continue;

                const targetY = bottomY - (pct / 100) * spanPx;

                // La barra sube, así que la Y baja de forma monótona: se busca el
                // primer par que encierra la altura buscada y se interpola.
                let value: number | null = null;
                for (let k = 1; k < points.length; k++) {
                    const a = points[k - 1];
                    const b = points[k];
                    const low = Math.min(a.y, b.y);
                    const high = Math.max(a.y, b.y);
                    if (targetY >= low && targetY <= high) {
                        const denominator = b.y - a.y;
                        const t = Math.abs(denominator) < 1e-9 ? 0 : (targetY - a.y) / denominator;
                        value = a.velocity + (b.velocity - a.velocity) * t;
                        break;
                    }
                }
                if (value !== null) row[`rep${rep.index}`] = Number(value.toFixed(3));
            }

            return row;
        });
    }, [concentrics]);

    /**
     * Todas las repeticiones contra el tiempo, con el reloj puesto a cero en
     * cada una.
     *
     * Los límites verticales de cada repetición se calculan UNA vez, fuera de
     * los dos bucles. Estaban dentro, y eso recorría el recorrido entero por
     * cada instante y por cada repetición: cuadrático sobre datos que caben en
     * un vistazo, y encima con `Math.min(...array)`, que además de recorrerlo
     * revienta la pila si el array crece.
     */
    const byTime = useMemo(() => {
        const prepared = concentrics.map(rep => {
            const points = rep.dataPoints;
            let bottomY = points[0].y;
            let topY = points[0].y;
            for (const p of points) {
                if (p.y > bottomY) bottomY = p.y;
                if (p.y < topY) topY = p.y;
            }
            return { rep, points, bottomY, spanPx: bottomY - topY, t0: points[0].time };
        });

        const stamps = new Set<number>();
        for (const { points, t0 } of prepared) {
            for (const p of points) stamps.add(Number(((p.time - t0) / 1000).toFixed(3)));
        }

        // Un cursor por repetición: los instantes van en orden, así que la
        // búsqueda no tiene que volver a empezar desde el principio cada vez.
        const cursors = new Array(prepared.length).fill(1);

        return [...stamps].sort((a, b) => a - b).map(t => {
            const row: Record<string, number> = { t };

            prepared.forEach(({ rep, points, bottomY, spanPx, t0 }, i) => {
                if (points.length < 2 || spanPx <= 0) return;
                const target = t0 + t * 1000;
                if (target < points[0].time || target > points[points.length - 1].time) return;

                let k = cursors[i];
                while (k < points.length - 1 && points[k].time < target) k++;
                cursors[i] = k;

                const a = points[k - 1];
                const b = points[k];
                const span = b.time - a.time;
                const f = span <= 0 ? 0 : (target - a.time) / span;

                row[`vel${rep.index}`] = Number((a.velocity + (b.velocity - a.velocity) * f).toFixed(3));
                row[`acc${rep.index}`] = Number(
                    (a.accelerationSharp + (b.accelerationSharp - a.accelerationSharp) * f).toFixed(2)
                );
                // Posición relativa al punto más bajo de SU repetición, para que
                // todas arranquen en cero y se puedan superponer.
                const y = a.y + (b.y - a.y) * f;
                row[`pos${rep.index}`] = Number((((bottomY - y) / spanPx) * rep.rom).toFixed(3));
            });

            return row;
        });
    }, [concentrics]);

    /** Pérdida de velocidad acumulada respecto de la primera repetición. */
    const lossData = useMemo(() => {
        const first = concentrics[0]?.meanVelocity ?? 0;
        return concentrics.map(c => ({
            rep: `#${c.index}`,
            index: c.index,
            velocidad: Number(c.meanVelocity.toFixed(3)),
            propulsiva: c.propulsiveVelocity !== null ? Number(c.propulsiveVelocity.toFixed(3)) : null,
            perdida: first > 0.05 ? Number((((first - c.meanVelocity) / first) * 100).toFixed(1)) : 0,
        }));
    }, [concentrics]);

    /** La repetición resaltada, o la mejor de la serie si no hay ninguna. */
    const detail = useMemo(
        () => concentrics.find(c => c.index === focused) ?? concentrics.find(c => c.index === series.bestRepIndex) ?? concentrics[0],
        [concentrics, focused, series.bestRepIndex]
    );

    /** La repetición del detalle, contra el tiempo, para la gráfica de sticking. */
    const detailSeries = useMemo(() => {
        if (!detail) return [];
        const t0 = detail.dataPoints[0].time;
        return detail.dataPoints.map(p => ({
            t: Number(((p.time - t0) / 1000).toFixed(3)),
            velocidad: Number(p.velocity.toFixed(3)),
        }));
    }, [detail]);

    const opacityFor = (index: number) => (focused === null || focused === index ? 1 : 0.18);
    const widthFor = (index: number) => (focused === index ? 2.6 : 1.6);

    const fmt = (v: number | null | undefined, digits: number, dash = '—') =>
        typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : dash;

    return (
        <div ref={rootRef} className={`flex flex-col gap-3 ${dimmed ? 'opacity-50' : ''}`}>

            {/* ---------------------------------------------------------
                EXPORTAR

                Tres formatos y cada uno para algo: el CSV para meterlo en un
                script, el Excel para abrirlo, el PDF para mandarlo.
                --------------------------------------------------------- */}
            {report && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-t-2xs font-bold uppercase tracking-wide text-ink-faint">
                        Exportar
                    </span>
                    <button
                        type="button"
                        onClick={() => downloadPwrCsv(report)}
                        className="inline-flex items-center gap-1.5 rounded-card border border-subtle bg-surface-sunken px-2.5 py-1.5 text-t-2xs font-bold text-ink transition hover:bg-white/5"
                    >
                        <Table2 size={12} aria-hidden="true" /> CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => downloadPwrXlsx(report)}
                        className="inline-flex items-center gap-1.5 rounded-card border border-subtle bg-surface-sunken px-2.5 py-1.5 text-t-2xs font-bold text-ink transition hover:bg-white/5"
                    >
                        <FileSpreadsheet size={12} aria-hidden="true" /> Excel
                    </button>
                    <button
                        type="button"
                        onClick={() => void exportPdf()}
                        disabled={exporting === 'pdf'}
                        className="inline-flex items-center gap-1.5 rounded-card border border-subtle bg-surface-sunken px-2.5 py-1.5 text-t-2xs font-bold text-ink transition hover:bg-white/5 disabled:opacity-50"
                    >
                        <FileText size={12} aria-hidden="true" />
                        {exporting === 'pdf' ? 'Generando…' : 'PDF con gráficas'}
                    </button>
                </div>
            )}

            {/* ---------------------------------------------------------
                RESUMEN DE LA SERIE
                --------------------------------------------------------- */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {[
                    { label: 'Repeticiones', value: String(series.repCount), unit: '' },
                    { label: 'Velocidad media', value: fmt(series.meanVelocity, 3), unit: 'm/s' },
                    { label: 'Propulsiva media', value: fmt(series.meanPropulsiveVelocity, 3), unit: 'm/s' },
                    { label: 'ROM medio', value: fmt(series.meanRom, 3), unit: 'm' },
                    { label: 'Pérdida de velocidad', value: fmt(series.velocityLoss, 1), unit: '%' },
                    { label: 'Consistencia (CV)', value: fmt(series.consistencyCv, 1), unit: '%' },
                    { label: 'Mejor / peor', value: `#${series.bestRepIndex} / #${series.worstRepIndex}`, unit: '' },
                    { label: 'Potencia media', value: fmt(series.meanPower, 0), unit: 'W' },
                    { label: 'Potencia máxima', value: fmt(series.peakPower, 0), unit: 'W' },
                    { label: 'Tiempo bajo tensión', value: fmt(series.timeUnderTensionS, 2), unit: 's' },
                ].map(card => (
                    <div key={card.label} className="rounded-card border border-subtle bg-surface-sunken px-2.5 py-2">
                        <p className="truncate text-t-2xs font-bold uppercase tracking-wide text-ink-faint">{card.label}</p>
                        <p className="mt-0.5 text-t-sm font-black text-ink">
                            {card.value}
                            {card.unit && <span className="ml-1 text-t-2xs font-bold text-ink-faint">{card.unit}</span>}
                        </p>
                    </div>
                ))}
            </div>

            {/* ---------------------------------------------------------
                TABLA POR REPETICIÓN
                --------------------------------------------------------- */}
            <div className="rounded-card border border-subtle bg-surface-sunken">
                <div className="flex items-center gap-1.5 border-b border-subtle px-3 py-2">
                    <Table2 size={13} className="text-ink-faint" aria-hidden="true" />
                    <h4 className="text-t-xs font-bold text-ink">Repetición a repetición</h4>
                    <span className="ml-auto text-t-2xs text-ink-faint">Toca una fila para resaltarla</span>
                </div>

                {/* El desbordamiento va en su propio contenedor: en un móvil la
                    tabla no cabe y el que tiene que desplazarse es ella, no la
                    página entera. */}
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[52rem] text-left text-t-2xs">
                        <thead className="text-ink-faint">
                            <tr className="border-b border-subtle">
                                <th className="px-2 py-1.5 font-bold">#</th>
                                <th className="px-2 py-1.5 font-bold">ROM<span className="font-normal"> (m)</span></th>
                                <th className="px-2 py-1.5 font-bold">V media<span className="font-normal"> (m/s)</span></th>
                                <th className="px-2 py-1.5 font-bold">V propuls.<span className="font-normal"> (m/s)</span></th>
                                <th className="px-2 py-1.5 font-bold">V pico<span className="font-normal"> (m/s)</span></th>
                                <th className="px-2 py-1.5 font-bold">A pico<span className="font-normal"> (m/s²)</span></th>
                                <th className="px-2 py-1.5 font-bold">t→V pico<span className="font-normal"> (s)</span></th>
                                <th className="px-2 py-1.5 font-bold">Concén.<span className="font-normal"> (s)</span></th>
                                <th className="px-2 py-1.5 font-bold">Excén.<span className="font-normal"> (s)</span></th>
                                <th className="px-2 py-1.5 font-bold">Total<span className="font-normal"> (s)</span></th>
                                <th className="px-2 py-1.5 font-bold">Sticking<span className="font-normal"> (% ROM)</span></th>
                                <th className="px-2 py-1.5 font-bold">V mín<span className="font-normal"> (m/s)</span></th>
                                <th className="px-2 py-1.5 font-bold">Sticking<span className="font-normal"> (s)</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {concentrics.map(rep => {
                                const ecc = eccentricBefore.get(rep.index);
                                const isBest = rep.index === series.bestRepIndex;
                                const isWorst = rep.index === series.worstRepIndex;
                                return (
                                    <tr
                                        key={rep.index}
                                        onClick={() => setFocused(f => (f === rep.index ? null : rep.index))}
                                        className={`cursor-pointer border-b border-subtle/50 transition last:border-0 hover:bg-white/5 ${
                                            focused === rep.index ? 'bg-white/[0.07]' : ''
                                        }`}
                                    >
                                        <td className="px-2 py-1.5">
                                            <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                                                <span
                                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                                    style={{ background: repColour(rep.index) }}
                                                    aria-hidden="true"
                                                />
                                                {rep.index}
                                                {isBest && <span className="text-success" title="Mejor repetición">▲</span>}
                                                {isWorst && series.repCount > 1 && <span className="text-danger" title="Peor repetición">▼</span>}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-ink-muted">{fmt(rep.rom, 3)}</td>
                                        <td className="px-2 py-1.5 font-bold text-ink">{fmt(rep.meanVelocity, 3)}</td>
                                        <td className="px-2 py-1.5 text-ink-muted">{fmt(rep.propulsiveVelocity, 3)}</td>
                                        <td className="px-2 py-1.5 text-ink-muted">{fmt(rep.peakVelocity, 3)}</td>
                                        <td className="px-2 py-1.5 text-ink-muted">{fmt(rep.peakAcceleration, 1)}</td>
                                        <td className="px-2 py-1.5 text-ink-muted">{fmt(rep.timeToPeakVelocityS, 2)}</td>
                                        <td className="px-2 py-1.5 text-ink-muted">{fmt(rep.duration, 2)}</td>
                                        <td className="px-2 py-1.5 text-ink-muted">{fmt(ecc?.duration, 2)}</td>
                                        <td className="px-2 py-1.5 text-ink-muted">
                                            {fmt(ecc ? ecc.duration + rep.duration : rep.duration, 2)}
                                        </td>
                                        <td className="px-2 py-1.5 text-ink-muted">
                                            {rep.sticking ? `${rep.sticking.romPercent.toFixed(0)}%` : 'no'}
                                        </td>
                                        <td className="px-2 py-1.5 text-ink-muted">{fmt(rep.sticking?.minVelocity, 3)}</td>
                                        <td className="px-2 py-1.5 text-ink-muted">{fmt(rep.sticking?.durationS, 2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <p className="border-t border-subtle px-3 py-1.5 text-t-2xs leading-relaxed text-ink-faint">
                    «Sticking» vacío significa que la barra subió de un tirón, no que no se haya podido medir.
                    La aceleración pico es la métrica menos fiable de la tabla (~17% de error sobre vídeo).
                </p>
            </div>

            {/* ---------------------------------------------------------
                LAS SEIS GRÁFICAS
                --------------------------------------------------------- */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">

                {/* 1 · Velocidad vs tiempo */}
                <ChartCard title="Velocidad vs tiempo" subtitle="Cada repetición con su reloj a cero" filename="pwr-velocidad-tiempo">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={byTime}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                            <XAxis type="number" dataKey="t" domain={['dataMin', 'dataMax']} {...AXIS} unit=" s" />
                            <YAxis {...AXIS} unit=" m/s" width={52} />
                            <Tooltip {...TOOLTIP_STYLE} />
                            <ReferenceLine y={0} stroke="#444" />
                            {concentrics.map(rep => (
                                <Line
                                    key={rep.index}
                                    type="monotone"
                                    dataKey={`vel${rep.index}`}
                                    name={`Rep ${rep.index}`}
                                    stroke={repColour(rep.index)}
                                    strokeWidth={widthFor(rep.index)}
                                    strokeOpacity={opacityFor(rep.index)}
                                    dot={false}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* 2 · Posición vs tiempo */}
                <ChartCard title="Posición vs tiempo" subtitle="Altura recorrida desde el punto más bajo" filename="pwr-posicion-tiempo">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={byTime}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                            <XAxis type="number" dataKey="t" domain={['dataMin', 'dataMax']} {...AXIS} unit=" s" />
                            <YAxis {...AXIS} unit=" m" width={52} />
                            <Tooltip {...TOOLTIP_STYLE} />
                            {concentrics.map(rep => (
                                <Line
                                    key={rep.index}
                                    type="monotone"
                                    dataKey={`pos${rep.index}`}
                                    name={`Rep ${rep.index}`}
                                    stroke={repColour(rep.index)}
                                    strokeWidth={widthFor(rep.index)}
                                    strokeOpacity={opacityFor(rep.index)}
                                    dot={false}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* 3 · Velocidad vs recorrido */}
                <ChartCard
                    title="Velocidad vs recorrido"
                    subtitle="Dónde, en el levantamiento, se pierde la velocidad"
                    filename="pwr-velocidad-recorrido"
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={byRomPercent}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                            <XAxis type="number" dataKey="romPct" domain={[0, 100]} {...AXIS} unit=" %" />
                            <YAxis {...AXIS} unit=" m/s" width={52} />
                            <Tooltip {...TOOLTIP_STYLE} />
                            {concentrics.map(rep => (
                                <Line
                                    key={rep.index}
                                    type="monotone"
                                    dataKey={`rep${rep.index}`}
                                    name={`Rep ${rep.index}`}
                                    stroke={repColour(rep.index)}
                                    strokeWidth={widthFor(rep.index)}
                                    strokeOpacity={opacityFor(rep.index)}
                                    dot={false}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* 4 · Aceleración vs tiempo */}
                <ChartCard
                    title="Aceleración vs tiempo"
                    subtitle="La línea de −9,81 marca el fin de la fase propulsiva"
                    filename="pwr-aceleracion-tiempo"
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={byTime}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                            <XAxis type="number" dataKey="t" domain={['dataMin', 'dataMax']} {...AXIS} unit=" s" />
                            <YAxis {...AXIS} unit=" m/s²" width={56} />
                            <Tooltip {...TOOLTIP_STYLE} />
                            <ReferenceLine y={0} stroke="#444" />
                            {/* El umbral físico que define lo propulsivo. Es la
                                única constante de todo el análisis que no la hemos
                                elegido nosotros: es la gravedad. */}
                            <ReferenceLine
                                y={-9.81}
                                stroke="#ffaa33"
                                strokeDasharray="4 4"
                                label={{ value: '−g', fill: '#ffaa33', fontSize: 10, position: 'insideBottomLeft' }}
                            />
                            {concentrics.map(rep => (
                                <Line
                                    key={rep.index}
                                    type="monotone"
                                    dataKey={`acc${rep.index}`}
                                    name={`Rep ${rep.index}`}
                                    stroke={repColour(rep.index)}
                                    strokeWidth={widthFor(rep.index)}
                                    strokeOpacity={opacityFor(rep.index)}
                                    dot={false}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* 5 · Comparación entre repeticiones */}
                <ChartCard
                    title="Comparación entre repeticiones"
                    subtitle="Velocidad media y propulsiva de cada una"
                    filename="pwr-comparacion-repeticiones"
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={lossData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                            <XAxis dataKey="rep" {...AXIS} />
                            <YAxis {...AXIS} unit=" m/s" width={52} />
                            <Tooltip {...TOOLTIP_STYLE} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Area
                                type="monotone"
                                dataKey="propulsiva"
                                name="Propulsiva"
                                stroke="#3399ff"
                                fill="#3399ff"
                                fillOpacity={0.12}
                                strokeWidth={1.6}
                                connectNulls
                                isAnimationActive={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="velocidad"
                                name="Media"
                                stroke="#ff3333"
                                strokeWidth={2.4}
                                dot={{ r: 3 }}
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* 6 · Pérdida de velocidad */}
                <ChartCard
                    title="Pérdida de velocidad de la serie"
                    subtitle="Respecto de la primera repetición"
                    filename="pwr-perdida-velocidad"
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={lossData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                            <XAxis dataKey="rep" {...AXIS} />
                            <YAxis {...AXIS} unit=" %" width={48} />
                            <Tooltip {...TOOLTIP_STYLE} />
                            {/* Los cortes con los que se suele prescribir una
                                serie por pérdida de velocidad. Están para leer la
                                gráfica, no como recomendación. */}
                            <ReferenceLine y={10} stroke="#33cc66" strokeDasharray="3 3" label={{ value: '10%', fill: '#33cc66', fontSize: 9, position: 'right' }} />
                            <ReferenceLine y={20} stroke="#ffaa33" strokeDasharray="3 3" label={{ value: '20%', fill: '#ffaa33', fontSize: 9, position: 'right' }} />
                            <ReferenceLine y={30} stroke="#ff3333" strokeDasharray="3 3" label={{ value: '30%', fill: '#ff3333', fontSize: 9, position: 'right' }} />
                            <Area
                                type="monotone"
                                dataKey="perdida"
                                name="Pérdida"
                                stroke="#ff3333"
                                fill="#ff3333"
                                fillOpacity={0.15}
                                strokeWidth={2.2}
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* ---------------------------------------------------------
                EL PUNTO DE ESTANCAMIENTO, EN DETALLE
                --------------------------------------------------------- */}
            {detail && (
                <ChartCard
                    title={`Punto de estancamiento · repetición ${detail.index}`}
                    subtitle={
                        detail.sticking
                            ? `Del ${detail.sticking.startRomPercent.toFixed(0)}% al ${detail.sticking.endRomPercent.toFixed(0)}% del recorrido · ` +
                              `mínimo de ${detail.sticking.minVelocity.toFixed(3)} m/s a ${detail.sticking.distanceFromStartM.toFixed(2)} m del inicio · ` +
                              `${detail.sticking.durationS.toFixed(2)} s`
                            : 'Esta repetición subió de un tirón: no hay zona de estancamiento'
                    }
                    filename={`pwr-sticking-rep${detail.index}`}
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={detailSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                            <XAxis type="number" dataKey="t" domain={['dataMin', 'dataMax']} {...AXIS} unit=" s" />
                            <YAxis {...AXIS} unit=" m/s" width={52} />
                            <Tooltip {...TOOLTIP_STYLE} />

                            {detail.sticking && (
                                <ReferenceArea
                                    x1={(detail.sticking.startTime - detail.dataPoints[0].time) / 1000}
                                    x2={(detail.sticking.endTime - detail.dataPoints[0].time) / 1000}
                                    fill="#ffaa33"
                                    fillOpacity={0.16}
                                    stroke="#ffaa33"
                                    strokeOpacity={0.45}
                                />
                            )}
                            {detail.sticking && (
                                <ReferenceLine
                                    x={(detail.sticking.minTime - detail.dataPoints[0].time) / 1000}
                                    stroke="#ffaa33"
                                    strokeDasharray="4 3"
                                    label={{
                                        value: `${detail.sticking.romPercent.toFixed(0)}% ROM`,
                                        fill: '#ffaa33',
                                        fontSize: 10,
                                        position: 'top',
                                    }}
                                />
                            )}

                            <Line
                                type="monotone"
                                dataKey="velocidad"
                                name="Velocidad"
                                stroke={repColour(detail.index)}
                                strokeWidth={2.4}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>
            )}
        </div>
    );
}
