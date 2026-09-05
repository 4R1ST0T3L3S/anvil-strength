import { jsPDF } from 'jspdf';
import { buildXlsx, type Cell, type Sheet } from './xlsxWriter';
import { REP_COLUMNS, reportFilename, type PwrReport } from './pwrReport';
import { PWR_ENGINE_LABEL } from '../cv/engineVersion';

/**
 * ANVIL STRENGTH — EXPORTAR EL INFORME DE PWR
 * =====================================================================
 *
 * Tres formatos, y cada uno para algo distinto. No son tres copias del mismo
 * fichero con otra extensión:
 *
 *   · CSV   — para MÁQUINAS. Separador de coma y punto decimal (RFC 4180), que
 *             es lo que esperan pandas, R y cualquier script. Una sola tabla.
 *   · XLSX  — para EXCEL. Tres hojas, números como números, cabeceras en
 *             negrita. Es el que se abre haciendo doble clic.
 *   · PDF   — para LEER y para mandar. Con las gráficas y las salvedades.
 *
 *
 * POR QUÉ EL CSV NO USA PUNTO Y COMA
 *
 * Un Excel en español espera `;` como separador y `,` como decimal; uno en
 * inglés, al revés. No hay una elección que funcione en los dos, así que se
 * elige por USO: el CSV es el formato de intercambio y va en el estándar, y
 * quien quiera abrirlo en Excel tiene el `.xlsx`, que no tiene este problema
 * porque los números van tipados y no como texto.
 *
 * Aun así lleva marca de orden de bytes (BOM), que es lo que hace que Excel
 * reconozca los acentos en vez de enseñar «Repeticiรณn».
 */

// =====================================================================
// DESCARGA
// =====================================================================

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Se libera en el siguiente turno del bucle de eventos: revocarla en la
    // misma vuelta cancela la descarga en algunos navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

// =====================================================================
// CSV
// =====================================================================

/** Un campo de CSV según RFC 4180: se entrecomilla solo si hace falta. */
function csvField(value: string | number | null): string {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function pwrToCsv(report: PwrReport): string {
    const lines: string[] = [];
    const row = (cells: (string | number | null)[]) => lines.push(cells.map(csvField).join(','));

    lines.push(`# ${report.title}`);
    for (const fact of report.facts) lines.push(`# ${fact.label}: ${fact.value}`);
    lines.push('#');
    for (const warning of report.warnings) lines.push(`# AVISO: ${warning}`);
    lines.push('');

    lines.push('# RESUMEN DE LA SERIE');
    row(['metrica', 'valor', 'unidad']);
    for (const { column, value } of report.seriesRows) row([column.label, value, column.unit]);
    lines.push('');

    lines.push('# REPETICIONES');
    row(REP_COLUMNS.map(c => (c.unit ? `${c.label} (${c.unit})` : c.label)));
    for (const rep of report.repRows) row(REP_COLUMNS.map(c => rep[c.key] ?? null));

    return lines.join('\r\n');
}

export function downloadPwrCsv(report: PwrReport) {
    // El BOM va delante del contenido: sin él Excel lee el fichero como ANSI y
    // destroza todos los acentos.
    const blob = new Blob(['﻿' + pwrToCsv(report)], { type: 'text/csv;charset=utf-8' });
    download(blob, `${reportFilename(report)}.csv`);
}

// =====================================================================
// EXCEL
// =====================================================================

export function pwrToXlsx(report: PwrReport): Blob {
    const info: Sheet = {
        name: 'Informe',
        headerRow: true,
        rows: [
            ['Dato', 'Valor'],
            ...report.facts.map(f => [f.label, f.value] as Cell[]),
            [],
            ['Advertencias', ''],
            ...report.warnings.map(w => ['', w] as Cell[]),
        ],
    };

    const summary: Sheet = {
        name: 'Resumen de serie',
        headerRow: true,
        rows: [
            ['Métrica', 'Valor', 'Unidad'],
            ...report.seriesRows.map(({ column, value }) => [column.label, value, column.unit] as Cell[]),
        ],
    };

    const reps: Sheet = {
        name: 'Repeticiones',
        headerRow: true,
        rows: [
            REP_COLUMNS.map(c => (c.unit ? `${c.label} (${c.unit})` : c.label)),
            ...report.repRows.map(rep => REP_COLUMNS.map(c => rep[c.key] ?? null) as Cell[]),
        ],
    };

    return buildXlsx([info, summary, reps]);
}

export function downloadPwrXlsx(report: PwrReport) {
    download(pwrToXlsx(report), `${reportFilename(report)}.xlsx`);
}

// =====================================================================
// GRÁFICAS PARA EL PDF
// =====================================================================

export interface ChartImage {
    title: string;
    /** PNG como data URI. */
    dataUrl: string;
    width: number;
    height: number;
}

/**
 * Rasteriza un SVG de Recharts a PNG.
 *
 * Se serializa el SVG ya pintado y se dibuja en un lienzo: el navegador sabe
 * hacerlo y no hace falta `html2canvas`, que reconstruye el DOM entero.
 *
 * El fondo se pinta BLANCO, no oscuro como en pantalla. Un PDF se imprime, y
 * gastar un cartucho en fondos negros para leer peor no tiene defensa. Por eso
 * los ejes y las rejillas de las gráficas se repintan en gris oscuro antes de
 * rasterizar: sobre blanco, el gris claro de pantalla no se ve.
 */
export async function chartToPng(svg: SVGElement, scale = 2): Promise<ChartImage | null> {
    const box = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));

    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Para papel: lo que en pantalla es gris sobre negro tiene que ser gris
    // oscuro sobre blanco, o la gráfica sale en blanco.
    clone.querySelectorAll('.recharts-cartesian-axis-line, .recharts-cartesian-axis-tick-line')
        .forEach(el => el.setAttribute('stroke', '#333333'));
    clone.querySelectorAll('.recharts-cartesian-grid line')
        .forEach(el => el.setAttribute('stroke', '#d8d8d8'));
    clone.querySelectorAll('text')
        .forEach(el => el.setAttribute('fill', '#333333'));

    const source = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));

    try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('SVG no rasterizable'));
            image.src = url;
        });

        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        return { title: '', dataUrl: canvas.toDataURL('image/png'), width, height };
    } catch {
        // Una gráfica que no se puede rasterizar no debe impedir el PDF: se
        // devuelve `null` y el informe sale sin ella.
        return null;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * El SVG de la gráfica dentro de una tarjeta: **el más grande**.
 *
 * DOS FORMAS DE EQUIVOCARSE, Y LAS DOS PASARON:
 *
 *   1. `querySelector('svg')` devuelve el ICONO de descarga de la cabecera —los
 *      iconos de lucide son SVG—. El PDF salía con siete iconos de 13×13 px en
 *      vez de las gráficas. Y como el número de páginas y el de figuras
 *      cuadraban, por fuera parecía correcto: solo cantaba el tamaño del
 *      fichero, 28 KB en vez de 420.
 *   2. `querySelector('svg.recharts-surface')` tampoco vale: una gráfica CON
 *      LEYENDA tiene varias superficies de Recharts, y la primera del documento
 *      es el cuadradito de color de la leyenda, de 14×14.
 *
 * Quedarse con la mayor no depende del orden del documento ni de qué
 * decoraciones lleve la gráfica, que es lo que hace que siga funcionando cuando
 * alguien añada la siguiente.
 */
function findChartSvg(container: Element): SVGElement | null {
    const candidates = [...container.querySelectorAll<SVGElement>('svg.recharts-surface')];
    let best: SVGElement | null = null;
    let bestArea = 0;

    for (const svg of candidates) {
        const box = svg.getBoundingClientRect();
        const area = box.width * box.height;
        if (area > bestArea) { bestArea = area; best = svg; }
    }

    return best;
}

/** Rasteriza todas las gráficas de un contenedor, en orden. */
export async function collectCharts(root: HTMLElement): Promise<ChartImage[]> {
    const cards = [...root.querySelectorAll<HTMLElement>('[data-chart-card]')];
    const images: ChartImage[] = [];

    for (const card of cards) {
        const svg = findChartSvg(card);
        if (!svg) continue;
        const image = await chartToPng(svg);
        // Una figura diminuta es un icono o una leyenda colada, no una gráfica.
        // Se descarta en vez de incrustarla: en un PDF de varias páginas nadie
        // va a comprobar si la figura tercera es la que tenía que ser.
        if (image && image.width > 60 && image.height > 40) {
            images.push({ ...image, title: card.dataset.chartCard ?? '' });
        }
    }

    return images;
}

/** El mismo criterio, para descargar una gráfica suelta. */
export function chartSvgOf(container: Element | null): SVGElement | null {
    return container ? findChartSvg(container) : null;
}

// =====================================================================
// PDF
// =====================================================================

const A4 = { w: 210, h: 297 };
const MARGIN = 16;
const CONTENT_W = A4.w - MARGIN * 2;

interface PdfCursor {
    doc: jsPDF;
    y: number;
    page: number;
}

function newPage(ctx: PdfCursor) {
    ctx.doc.addPage();
    ctx.page++;
    ctx.y = MARGIN;
}

/** Reserva `height` mm; si no caben, pasa de página. */
function ensure(ctx: PdfCursor, height: number) {
    if (ctx.y + height > A4.h - MARGIN - 8) newPage(ctx);
}

function sectionTitle(ctx: PdfCursor, text: string) {
    ensure(ctx, 14);
    ctx.doc.setFont('helvetica', 'bold');
    ctx.doc.setFontSize(11);
    ctx.doc.setTextColor(0, 0, 0);
    ctx.doc.text(text.toUpperCase(), MARGIN, ctx.y);
    ctx.y += 2;
    ctx.doc.setDrawColor(0, 0, 0);
    ctx.doc.setLineWidth(0.4);
    ctx.doc.line(MARGIN, ctx.y, A4.w - MARGIN, ctx.y);
    ctx.y += 6;
}

/**
 * Una tabla con cabecera repetida en cada página.
 *
 * Repetir la cabecera no es un adorno: una tabla de dieciséis columnas de
 * números que continúa en la página siguiente sin cabecera es ilegible.
 */
function table(ctx: PdfCursor, headers: string[], rows: (string | number | null)[][], widths: number[]) {
    const ROW_H = 5.2;

    const drawHeader = () => {
        ctx.doc.setFont('helvetica', 'bold');
        ctx.doc.setFontSize(6.4);
        ctx.doc.setTextColor(0, 0, 0);
        ctx.doc.setFillColor(238, 238, 238);
        ctx.doc.rect(MARGIN, ctx.y - 3.6, CONTENT_W, ROW_H, 'F');
        let x = MARGIN + 1;
        headers.forEach((h, i) => { ctx.doc.text(h, x, ctx.y); x += widths[i]; });
        ctx.y += ROW_H;
    };

    ensure(ctx, ROW_H * 3);
    drawHeader();

    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.setFontSize(6.6);

    for (const row of rows) {
        if (ctx.y + ROW_H > A4.h - MARGIN - 8) {
            newPage(ctx);
            drawHeader();
            ctx.doc.setFont('helvetica', 'normal');
            ctx.doc.setFontSize(6.6);
        }
        let x = MARGIN + 1;
        row.forEach((cell, i) => {
            // Un hueco se pinta como «—» y no como «0»: en una tabla de
            // números un cero es un dato y un guion es la ausencia de dato.
            const text = cell === null || cell === undefined || cell === '' ? '—' : String(cell);
            ctx.doc.text(text, x, ctx.y);
            x += widths[i];
        });
        ctx.y += ROW_H;
        ctx.doc.setDrawColor(226, 226, 226);
        ctx.doc.setLineWidth(0.1);
        ctx.doc.line(MARGIN, ctx.y - 3.4, A4.w - MARGIN, ctx.y - 3.4);
    }

    ctx.y += 4;
}

/**
 * Genera el PDF del informe.
 *
 * En blanco y negro a propósito: es lo que pidió el encargo, se imprime bien y
 * sobrevive a una fotocopia. Las gráficas conservan el color de cada
 * repetición, que es lo único que las hace legibles cuando hay cinco líneas.
 */
export function pwrToPdf(report: PwrReport, charts: ChartImage[] = []): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const ctx: PdfCursor = { doc, y: MARGIN, page: 1 };

    // ---------------------------------------------------------------
    // Cabecera
    // ---------------------------------------------------------------
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('ANVIL STRENGTH', MARGIN, ctx.y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(report.prettyDate, A4.w - MARGIN, ctx.y, { align: 'right' });
    ctx.y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(0, 0, 0);
    doc.text(report.title, MARGIN, ctx.y);
    ctx.y += 4;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, ctx.y, MARGIN + 26, ctx.y);
    ctx.y += 10;

    // ---------------------------------------------------------------
    // Datos generales, en dos columnas
    // ---------------------------------------------------------------
    sectionTitle(ctx, 'Datos generales');
    {
        const half = Math.ceil(report.facts.length / 2);
        const columns = [report.facts.slice(0, half), report.facts.slice(half)];
        const startY = ctx.y;
        let lowest = ctx.y;

        columns.forEach((column, ci) => {
            let y = startY;
            const x = MARGIN + ci * (CONTENT_W / 2);
            for (const fact of column) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(120, 120, 120);
                doc.text(fact.label.toUpperCase(), x, y);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(0, 0, 0);
                doc.text(fact.value, x + 38, y);
                y += 5.6;
            }
            if (y > lowest) lowest = y;
        });

        ctx.y = lowest + 4;
    }

    // ---------------------------------------------------------------
    // Resumen de la serie
    // ---------------------------------------------------------------
    sectionTitle(ctx, 'Resumen de la serie');
    table(
        ctx,
        ['Métrica', 'Valor', 'Unidad'],
        report.seriesRows.map(({ column, value }) => [
            column.label,
            value === null ? null : value.toFixed(column.decimals),
            column.unit,
        ]),
        [96, 40, 30]
    );

    // ---------------------------------------------------------------
    // Repetición a repetición
    // ---------------------------------------------------------------
    sectionTitle(ctx, 'Repetición a repetición');
    {
        // Se reparte el ancho a ojo pero con criterio: la primera columna es un
        // número de una cifra y la última una etiqueta larga.
        const widths = REP_COLUMNS.map((_, i) => (i === 0 ? 9 : (CONTENT_W - 9) / (REP_COLUMNS.length - 1)));
        table(
            ctx,
            REP_COLUMNS.map(c => (c.unit ? `${c.label} (${c.unit})` : c.label)),
            report.repRows.map(rep =>
                REP_COLUMNS.map(c => {
                    const value = rep[c.key];
                    return value === null || value === undefined ? null : value.toFixed(c.decimals);
                })
            ),
            widths
        );
    }

    // ---------------------------------------------------------------
    // Gráficas
    // ---------------------------------------------------------------
    if (charts.length > 0) {
        newPage(ctx);
        sectionTitle(ctx, 'Gráficas');

        for (const chart of charts) {
            const w = CONTENT_W;
            const h = (chart.height / chart.width) * w;

            ensure(ctx, h + 10);

            if (chart.title) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(0, 0, 0);
                doc.text(chart.title, MARGIN, ctx.y);
                ctx.y += 3.5;
            }

            try {
                doc.addImage(chart.dataUrl, 'PNG', MARGIN, ctx.y, w, h, undefined, 'FAST');
            } catch {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7);
                doc.setTextColor(150, 150, 150);
                doc.text('(no se ha podido incrustar esta gráfica)', MARGIN, ctx.y + 4);
            }
            ctx.y += h + 7;
        }
    }

    // ---------------------------------------------------------------
    // Advertencias — al final y enteras
    // ---------------------------------------------------------------
    if (report.warnings.length > 0) {
        ensure(ctx, 24);
        sectionTitle(ctx, 'Salvedades de la medición');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 60);

        for (const warning of report.warnings) {
            const lines = doc.splitTextToSize(`·  ${warning}`, CONTENT_W) as string[];
            ensure(ctx, lines.length * 3.8 + 2);
            doc.text(lines, MARGIN, ctx.y);
            ctx.y += lines.length * 3.8 + 2;
        }
    }

    // ---------------------------------------------------------------
    // Pie, en todas las páginas
    // ---------------------------------------------------------------
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.line(MARGIN, A4.h - MARGIN - 4, A4.w - MARGIN, A4.h - MARGIN - 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(140, 140, 140);
        // La versión del motor va en CADA página: una hoja suelta fotocopiada
        // tiene que seguir diciendo con qué se midió.
        doc.text(`${PWR_ENGINE_LABEL} · medido por vídeo, no por encoder`, MARGIN, A4.h - MARGIN);
        doc.text(`${p} / ${pages}`, A4.w - MARGIN, A4.h - MARGIN, { align: 'right' });
    }

    return doc;
}

export function downloadPwrPdf(report: PwrReport, charts: ChartImage[] = []) {
    pwrToPdf(report, charts).save(`${reportFilename(report)}.pdf`);
}
