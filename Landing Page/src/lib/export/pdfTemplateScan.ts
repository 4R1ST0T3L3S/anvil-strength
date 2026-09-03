/**
 * ANVIL STRENGTH — COPIAR LA PLANTILLA DE UN ENTRENADOR
 * =====================================================================
 *
 * QUÉ HACE
 *
 * El entrenador sube el PDF que YA le manda a sus atletas. Esto lo abre, lo
 * mide y devuelve un `PdfThemeInput`: sus colores, su tipografía, su
 * logotipo, su papel y —lo importante— la rejilla de su tabla, con las
 * columnas que tenga, en el orden que las tenga y con sus rótulos literales.
 * A partir de ahí, cada semana que Anvil genere sale con esa hoja.
 *
 * POR QUÉ NO SE CALCA EL PDF ENCIMA
 *
 * Lo evidente sería incrustar su página como fondo e imprimir los datos
 * encima. Es lo que NO se hace, por tres razones que se notan a la primera
 * semana:
 *
 *   · Una hoja de papel tiene cinco filas. Un lunes de siete ejercicios
 *     necesita siete, y un miércoles de tres no puede dejar cuatro huecos.
 *     Con la geometría extraída, la tabla se ESTIRA y se PARTE por páginas
 *     como cualquier tabla generada; con un calco, no.
 *
 *   · El calco pesa. Una página rasterizada a 300 ppp son cientos de KB por
 *     hoja, y aquí se mandan cuatro o cinco cada semana.
 *
 *   · Y sobre todo: el texto de un calco no se puede seleccionar, ni buscar,
 *     ni leer con lector de pantalla. Sería una foto de un entrenamiento.
 *
 * Lo que sale de aquí es un documento de verdad que se PARECE al suyo.
 *
 * CÓMO LO MIDE: PÍXELES, NO OPERADORES
 *
 * Un PDF puede dibujar la misma tabla de cinco maneras: rectángulos
 * rellenos, trazos, una imagen escaneada, o una tabla de Word convertida.
 * Leer la lista de operadores obligaría a entender las cinco y a arrastrar
 * la matriz de transformación de cada una. Rasterizando la página y
 * buscando líneas largas en el mapa de píxeles, las cinco se miden igual —y
 * también funciona con una plantilla que el coach escaneó del papel.
 *
 * La CAPA DE TEXTO sí se lee de pdf.js, porque ahí sí hay dato exacto: qué
 * pone, dónde, con qué fuente y de qué tamaño. Se usa para los rótulos de
 * las columnas y para saber qué manchas de la página son letras y cuáles
 * son el logotipo.
 *
 * QUÉ NO SE COPIA
 *
 * La fuente exacta: jsPDF trae tres familias incrustadas y meter una cuarta
 * son 300 KB en cada PDF (ver pdfTheme.ts). Se clasifica la suya en la más
 * parecida de las tres. Es el único punto donde el resultado se aparta a
 * propósito del original.
 */

import { GlobalWorkerOptions, Util, getDocument, type PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
    DEFAULT_COLUMNS,
    mixHex,
    relativeLuminance,
    rgbToHex,
    type PdfSheetColumn,
    type PdfThemeInput,
} from './pdfTheme';

// =====================================================================
// LO QUE DEVUELVE
// =====================================================================

export interface TemplateScanReport {
    /** "A4 · 210 × 297 mm". */
    pageLabel: string;
    /** "Helvética (detectada: Montserrat)". */
    fontLabel: string;
    /** Los rótulos de las columnas encontradas, en orden. */
    columns: string[];
    /** Alto de fila medido en la plantilla, en mm. */
    rowHeightMm: number | null;
    foundLogo: boolean;
    foundTable: boolean;
    /** Lo que no se ha podido copiar, en cristiano. */
    notes: string[];
}

export interface TemplateScan {
    /** Para fundir sobre el tema actual del entrenador. */
    theme: PdfThemeInput;
    /**
     * El logotipo recortado de su hoja, con el fondo ya transparente.
     * Data URL PNG: quien llame decide si lo sube a almacenamiento.
     */
    logoDataUrl: string | null;
    report: TemplateScanReport;
}

type RGB = [number, number, number];

/** Puntos PostScript a milímetros. Un punto es 1/72 de pulgada. */
const PT_TO_MM = 25.4 / 72;

/**
 * Ancho al que se rasteriza la página para medirla.
 *
 * 1100 px sobre un A4 son unos 133 ppp: suficiente para que un filete de
 * 0,3 mm ocupe un par de píxeles y se detecte, y poco para que el análisis
 * entero —que recorre el mapa de bits varias veces— tarde más de un
 * suspiro. Subirlo no encuentra más líneas, solo tarda más.
 */
const RASTER_WIDTH = 1100;

// =====================================================================
// COLOR
// =====================================================================

/**
 * Distancia entre dos colores con la fórmula de la "media de rojos".
 *
 * No es la diferencia de canales a secas: el ojo distingue mucho peor dos
 * azules que dos verdes, y con distancia euclídea plana un azul marino y un
 * negro salen "muy distintos" mientras que dos grises casi iguales también.
 * Aquí lo que se decide con esto es qué píxel es fondo y cuál es tinta, y
 * ese error convertiría media hoja en tinta.
 */
function colorDistance(a: RGB, b: RGB): number {
    const rMean = (a[0] + b[0]) / 2;
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

/** Saturación aproximada, 0–1. Para encontrar el color de marca. */
function chroma([r, g, b]: RGB): number {
    return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

interface ColorBucket {
    color: RGB;
    count: number;
}

/**
 * Los colores de la página, agrupados.
 *
 * Se cuantiza a 5 bits por canal (32 niveles) y no se guarda el color
 * exacto: el antialias de una sola letra negra produce cuarenta grises
 * distintos, y con cubos exactos el fondo de la página competiría con su
 * propio borde difuminado. Dentro de cada cubo se promedia el color REAL,
 * así que la precisión no se pierde, solo la dispersión.
 */
function colorHistogram(data: Uint8ClampedArray): ColorBucket[] {
    const sums = new Map<number, { r: number; g: number; b: number; n: number }>();

    for (let i = 0; i < data.length; i += 4) {
        // Un píxel transparente no es un color de la plantilla: es papel.
        if (data[i + 3] < 128) continue;
        const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
        const bucket = sums.get(key);
        if (bucket) {
            bucket.r += data[i]; bucket.g += data[i + 1]; bucket.b += data[i + 2]; bucket.n++;
        } else {
            sums.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], n: 1 });
        }
    }

    return [...sums.values()]
        .map(b => ({ color: [b.r / b.n, b.g / b.n, b.b / b.n] as RGB, count: b.n }))
        .sort((a, b) => b.count - a.count);
}

// =====================================================================
// LA PÁGINA, RASTERIZADA
// =====================================================================

interface Raster {
    data: Uint8ClampedArray;
    w: number;
    h: number;
    /** Píxeles por milímetro. */
    ppmm: number;
    at: (x: number, y: number) => RGB;
}

async function rasterize(page: PDFPageProxy): Promise<Raster> {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, Math.max(0.5, RASTER_WIDTH / base.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No se pudo abrir un lienzo para leer el PDF');

    // Fondo blanco EXPLÍCITO. Una página que no pinta su fondo es papel
    // blanco, no papel transparente: sin esto, un PDF normal daría un fondo
    // "negro con alfa 0" y toda la detección de tinta saldría del revés.
    //
    // `intent: 'print'` NO es por imprimir nada. Con la intención normal,
    // pdf.js encadena los trozos del dibujo con `requestAnimationFrame`, y
    // ese reloj SE PARA en una pestaña que no está a la vista. Como el coach
    // sube su plantilla y se va a otra pestaña mientras tanto —que es
    // exactamente lo que hace uno cuando algo tarda—, el escaneo se quedaba
    // colgado para siempre sin un solo error. Con esta intención el dibujo se
    // encadena con temporizadores, que sí corren en segundo plano.
    await page.render({
        canvas,
        canvasContext: context,
        viewport,
        background: '#FFFFFF',
        intent: 'print',
    }).promise;

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width: w, height: h } = image;

    return {
        data,
        w,
        h,
        ppmm: w / (base.width * PT_TO_MM),
        at: (x, y) => {
            const i = (y * w + x) * 4;
            return [data[i], data[i + 1], data[i + 2]];
        },
    };
}

// =====================================================================
// LA CAPA DE TEXTO
// =====================================================================

interface TextBox {
    text: string;
    /** En píxeles del raster. */
    x: number;
    y: number;
    w: number;
    h: number;
    /** Cuerpo en puntos, ya des-escalado del raster. */
    sizePt: number;
    fontName: string;
}

async function readText(page: PDFPageProxy, raster: Raster): Promise<TextBox[]> {
    const viewport = page.getViewport({ scale: raster.w / page.getViewport({ scale: 1 }).width });
    const content = await page.getTextContent();
    const boxes: TextBox[] = [];

    for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;

        // La matriz del elemento está en el espacio del PDF; la del viewport
        // la lleva a píxeles del lienzo. Multiplicarlas es lo que hace pdf.js
        // para colocar su capa de texto, y es lo que alinea lo que dice el
        // PDF con lo que se ve en el mapa de bits.
        const tx = Util.transform(viewport.transform, item.transform);
        const height = Math.hypot(tx[2], tx[3]);
        const width = item.width * viewport.scale;

        let fontName = '';
        try {
            const font = page.commonObjs.get(item.fontName) as { name?: string; fallbackName?: string } | null;
            fontName = font?.name || font?.fallbackName || '';
        } catch { /* la fuente no está resuelta: el nombre no es imprescindible */ }

        boxes.push({
            text: item.str,
            x: tx[4],
            // tx[5] es la línea BASE. La caja empieza por encima: 0,8 del
            // cuerpo es la altura de mayúsculas más el hueco de las
            // ascendentes, que es lo que hay que tapar para que el texto no
            // se confunda con un logotipo.
            y: tx[5] - height * 0.8,
            w: width,
            h: height * 1.05,
            sizePt: height / viewport.scale,
            fontName,
        });
    }

    return boxes;
}

// =====================================================================
// TINTA Y LÍNEAS
// =====================================================================

interface Ink {
    /** 1 = el píxel se aparta del fondo. */
    mask: Uint8Array;
    surface: RGB;
}

function buildInkMask(raster: Raster, surface: RGB): Ink {
    const mask = new Uint8Array(raster.w * raster.h);
    for (let i = 0, p = 0; i < raster.data.length; i += 4, p++) {
        const pixel: RGB = [raster.data[i], raster.data[i + 1], raster.data[i + 2]];
        // 90 sobre una escala que llega a 765. Deja fuera el ruido de un
        // fondo con textura —la hoja de la foto tiene grano— y deja dentro
        // cualquier filete de verdad, por fino que sea.
        mask[p] = colorDistance(pixel, surface) > 90 ? 1 : 0;
    }
    return { mask, surface };
}

interface Line {
    /** Centro, en píxeles. */
    pos: number;
    /** Grosor en píxeles. */
    thickness: number;
    /** Fracción del recorrido que está pintada, 0–1. */
    coverage: number;
}

/** Agrupa filas (o columnas) contiguas pintadas en una sola línea. */
function groupRuns(hits: { index: number; coverage: number }[]): Line[] {
    const lines: Line[] = [];
    let run: { index: number; coverage: number }[] = [];

    const flush = () => {
        if (run.length === 0) return;
        lines.push({
            pos: (run[0].index + run[run.length - 1].index) / 2,
            thickness: run.length,
            coverage: Math.max(...run.map(r => r.coverage)),
        });
        run = [];
    };

    hits.forEach(hit => {
        if (run.length > 0 && hit.index !== run[run.length - 1].index + 1) flush();
        run.push(hit);
    });
    flush();

    return lines;
}

/** Horizontales que cruzan casi toda la página: los filetes de la maqueta. */
function horizontalLines(ink: Ink, raster: Raster, minCoverage = 0.5): Line[] {
    const hits: { index: number; coverage: number }[] = [];
    for (let y = 0; y < raster.h; y++) {
        let count = 0;
        const row = y * raster.w;
        for (let x = 0; x < raster.w; x++) count += ink.mask[row + x];
        const coverage = count / raster.w;
        if (coverage >= minCoverage) hits.push({ index: y, coverage });
    }
    return groupRuns(hits);
}

/** Verticales DENTRO de una banda. Ver `findTable` para el porqué. */
function verticalLinesInBand(ink: Ink, raster: Raster, top: number, bottom: number, minCoverage = 0.8): Line[] {
    const y0 = Math.ceil(top);
    const y1 = Math.floor(bottom);
    const span = y1 - y0;
    if (span < 4) return [];

    const hits: { index: number; coverage: number }[] = [];
    for (let x = 0; x < raster.w; x++) {
        let count = 0;
        for (let y = y0; y < y1; y++) count += ink.mask[y * raster.w + x];
        const coverage = count / span;
        if (coverage >= minCoverage) hits.push({ index: x, coverage });
    }
    return groupRuns(hits);
}

// =====================================================================
// LA TABLA
// =====================================================================

interface Band {
    top: number;
    bottom: number;
    /** X de las verticales que la cruzan de arriba abajo. */
    verticals: number[];
}

interface TableShape {
    /** Bandas de la tabla, en orden. La primera es la de rótulos. */
    bands: Band[];
    /** Cantos verticales comunes, incluidos los dos exteriores. */
    columns: number[];
    top: number;
    bottom: number;
    /** Grosor típico del filete, en píxeles. */
    rule: number;
}

/**
 * Encuentra la rejilla.
 *
 * LA IDEA: las verticales de una tabla NO cruzan la página —solo van del
 * borde de arriba de la tabla al de abajo—, así que buscarlas de un canto a
 * otro de la hoja no encuentra ninguna. Lo que sí se puede es partir la
 * página por sus horizontales largas y preguntar, banda a banda, cuáles
 * están cruzadas de lado a lado por verticales. Las bandas que lo están y
 * comparten los mismos cantos son la tabla; las que no —la caja de
 * indicaciones, el recuadro del pie— son cajas sueltas, y también interesan.
 */
function findTable(ink: Ink, raster: Raster, rules: Line[]): { table: TableShape | null; boxes: Band[] } {
    const minGap = raster.ppmm * 4;   // menos de 4 mm no es una fila, es un doble filete
    const bands: Band[] = [];

    for (let i = 0; i < rules.length - 1; i++) {
        const top = rules[i].pos + rules[i].thickness / 2;
        const bottom = rules[i + 1].pos - rules[i + 1].thickness / 2;
        if (bottom - top < minGap) continue;
        bands.push({
            top,
            bottom,
            verticals: verticalLinesInBand(ink, raster, top, bottom).map(l => l.pos),
        });
    }

    // Dos bandas pertenecen a la misma tabla si sus cantos coinciden. La
    // tolerancia es de 1,5 mm: un PDF exportado desde un procesador de
    // textos no repite el mismo x al píxel de una fila a otra.
    const tol = raster.ppmm * 1.5;
    const sameGrid = (a: number[], b: number[]) =>
        a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tol);

    let best: Band[] = [];
    let run: Band[] = [];
    for (const band of bands) {
        const grid = band.verticals.length >= 3; // 2 exteriores + 1 interior mínimo
        if (grid && (run.length === 0 || sameGrid(run[run.length - 1].verticals, band.verticals))) {
            run.push(band);
        } else {
            if (run.length > best.length) best = run;
            run = grid ? [band] : [];
        }
    }
    if (run.length > best.length) best = run;

    const boxes = bands.filter(b => !best.includes(b) && b.verticals.length <= 2);

    if (best.length < 2) return { table: null, boxes };

    // Los cantos definitivos: la mediana de cada canto entre todas las
    // bandas. Una fila con un borde mal exportado no mueve la columna.
    const columns = best[0].verticals.map((_, i) => {
        const xs = best.map(b => b.verticals[i]).sort((a, b) => a - b);
        return xs[Math.floor(xs.length / 2)];
    });

    const thicknesses = rules.map(r => r.thickness).sort((a, b) => a - b);

    return {
        table: {
            bands: best,
            columns,
            top: best[0].top,
            bottom: best[best.length - 1].bottom,
            rule: thicknesses[Math.floor(thicknesses.length / 2)] || 1,
        },
        boxes,
    };
}

// =====================================================================
// LOS RÓTULOS DE LAS COLUMNAS
// =====================================================================

/**
 * De "KG/INTENSIDAD" a `intensity`.
 *
 * Por palabras y no por posición porque el orden cambia de un entrenador a
 * otro —hay quien pone el descanso antes que la carga— y porque una columna
 * que no reconozcamos NO es un error: es una columna suya, y se conserva
 * vacía (`blank`) para que la siga rellenando a mano.
 */
function classifyColumn(label: string): PdfSheetColumn['key'] {
    const t = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    if (/ejercicio|movimiento|exercise|lift|nombre/.test(t)) return 'name';
    if (/serie|sets?\b|nº ?s|n ?de ?s/.test(t)) return 'series';
    if (/rep/.test(t)) return 'reps';
    if (/descanso|rest|pausa|recuperacion/.test(t)) return 'rest';
    if (/kg|carga|intensidad|peso|load|rpe|rir|%|1rm/.test(t)) return 'intensity';
    return 'blank';
}

/** El texto que cae dentro de un rectángulo, de izquierda a derecha. */
function textInside(boxes: TextBox[], x0: number, x1: number, y0: number, y1: number): string {
    return boxes
        .filter(b => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        })
        .sort((a, b) => a.x - b.x)
        .map(b => b.text.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function readColumns(table: TableShape, text: TextBox[]): PdfSheetColumn[] {
    const head = table.bands[0];
    const columns: PdfSheetColumn[] = [];

    for (let i = 0; i < table.columns.length - 1; i++) {
        const x0 = table.columns[i];
        const x1 = table.columns[i + 1];
        const label = textInside(text, x0, x1, head.top, head.bottom);
        columns.push({
            key: classifyColumn(label),
            label: label.slice(0, 32),
            // El ancho se guarda como PESO en las mismas unidades que traía
            // la plantilla —píxeles—, porque `sheetGeometry` normaliza sobre
            // la suma. Copiar la proporción es lo que importa, no la medida.
            width: Math.round(((x1 - x0) / (table.columns[table.columns.length - 1] - table.columns[0])) * 1000) / 10,
        });
    }

    // Dos columnas con la misma clave imprimirían el mismo dato dos veces:
    // la segunda pasa a ser una columna en blanco, que es lo que de verdad
    // es (un "peso objetivo" y un "peso real", por ejemplo).
    const used = new Set<string>();
    return columns.map(col => {
        if (col.key === 'blank') return col;
        if (used.has(col.key)) return { ...col, key: 'blank' as const };
        used.add(col.key);
        return col;
    });
}

// =====================================================================
// EL LOGOTIPO
// =====================================================================

/**
 * Recorta del encabezado lo que no es texto.
 *
 * EL TRUCO: pdf.js dice exactamente dónde hay letras. Se tapan todas, se
 * tapan los filetes detectados, y lo que quede pintado ahí arriba solo
 * puede ser el logotipo. No hace falta reconocer nada.
 *
 * El fondo se vuelve transparente en el recorte —con el borde degradado,
 * no a cuchillo— para que el mismo PNG sirva luego sobre papel blanco si el
 * entrenador cambia de preset.
 */
function extractLogo(
    raster: Raster,
    ink: Ink,
    text: TextBox[],
    rules: Line[],
    limitY: number,
): { dataUrl: string; heightMm: number } | null {
    const { w } = raster;
    const top = Math.max(0, Math.floor(limitY));
    if (top < 8) return null;

    // 1. Máscara de gráficos: tinta que no es ni letra ni filete.
    const graphics = new Uint8Array(w * top);
    graphics.set(ink.mask.subarray(0, w * top));

    const clear = (x0: number, y0: number, x1: number, y1: number) => {
        for (let y = Math.max(0, Math.floor(y0)); y < Math.min(top, Math.ceil(y1)); y++) {
            for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
                graphics[y * w + x] = 0;
            }
        }
    };

    const pad = raster.ppmm * 0.6;
    text.forEach(b => clear(b.x - pad, b.y - pad, b.x + b.w + pad, b.y + b.h + pad));
    rules.forEach(r => clear(0, r.pos - r.thickness, w, r.pos + r.thickness));

    // 2. La mancha más grande, buscada sobre una malla gruesa. A 4 px por
    //    celda, un logotipo de dos centímetros son 13 celdas de lado: de
    //    sobra para agruparlo, y 16 veces menos trabajo que ir píxel a píxel.
    const cell = 4;
    const cw = Math.ceil(w / cell);
    const ch = Math.ceil(top / cell);
    const grid = new Uint8Array(cw * ch);
    for (let y = 0; y < top; y++) {
        for (let x = 0; x < w; x++) {
            if (graphics[y * w + x]) grid[Math.floor(y / cell) * cw + Math.floor(x / cell)] = 1;
        }
    }

    const seen = new Uint8Array(cw * ch);
    let best: { x0: number; y0: number; x1: number; y1: number; size: number } | null = null;

    for (let i = 0; i < grid.length; i++) {
        if (!grid[i] || seen[i]) continue;
        const stack = [i];
        seen[i] = 1;
        let size = 0;
        let x0 = cw, y0 = ch, x1 = 0, y1 = 0;

        while (stack.length > 0) {
            const cur = stack.pop() as number;
            const cx = cur % cw;
            const cy = (cur - cx) / cw;
            size++;
            if (cx < x0) x0 = cx;
            if (cx > x1) x1 = cx;
            if (cy < y0) y0 = cy;
            if (cy > y1) y1 = cy;

            // Vecindad de 8 y con un salto de una celda: un logotipo con
            // piezas separadas —el yunque tiene dos— es UN logotipo, y con
            // vecindad estricta saldrían dos manchas y se recortaría media.
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
                    const n = ny * cw + nx;
                    if (grid[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
                }
            }
        }

        if (!best || size > best.size) best = { x0, y0, x1, y1, size };
    }

    // Manchas de menos de 25 celdas (400 px) son ruido de compresión. Y algo
    // que ocupa casi toda la banda no es un logotipo: es una foto de fondo,
    // y recortarla dejaría el PDF con un mamotreto en la cabecera.
    if (!best || best.size < 25) return null;
    const px = {
        x0: Math.max(0, best.x0 * cell - 1),
        y0: Math.max(0, best.y0 * cell - 1),
        x1: Math.min(w, (best.x1 + 1) * cell + 1),
        y1: Math.min(top, (best.y1 + 1) * cell + 1),
    };
    const bw = px.x1 - px.x0;
    const bh = px.y1 - px.y0;
    if (bw < 8 || bh < 8) return null;
    if (bw > w * 0.9 && bh > top * 0.8) return null;

    // 3. Recorte con el fondo transparente.
    const out = document.createElement('canvas');
    // Un logotipo de 30 mm impreso a 300 ppp son 354 px. Más no se ve; menos
    // se nota. El tope evita que una cabecera enorme meta un PNG de un mega
    // en el perfil del entrenador.
    const target = Math.min(600, Math.max(bw, 1));
    const ratio = target / bw;
    out.width = Math.round(bw * ratio);
    out.height = Math.round(bh * ratio);
    const octx = out.getContext('2d');
    if (!octx) return null;

    const crop = octx.createImageData(bw, bh);
    for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
            const src = ((y + px.y0) * w + (x + px.x0)) * 4;
            const dst = (y * bw + x) * 4;
            const pixel: RGB = [raster.data[src], raster.data[src + 1], raster.data[src + 2]];
            crop.data[dst] = raster.data[src];
            crop.data[dst + 1] = raster.data[src + 1];
            crop.data[dst + 2] = raster.data[src + 2];
            // Alfa proporcional a lo lejos que está del fondo: el borde
            // difuminado del original se conserva y el recorte no sale con
            // dientes de sierra.
            crop.data[dst + 3] = Math.max(0, Math.min(255, Math.round((colorDistance(pixel, ink.surface) / 120) * 255)));
        }
    }

    const temp = document.createElement('canvas');
    temp.width = bw;
    temp.height = bh;
    temp.getContext('2d')?.putImageData(crop, 0, 0);
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(temp, 0, 0, out.width, out.height);

    return { dataUrl: out.toDataURL('image/png'), heightMm: bh / raster.ppmm };
}

// =====================================================================
// TIPOGRAFÍA
// =====================================================================

/** De "ABCDEF+Montserrat-Bold" a una de las tres familias de jsPDF. */
function classifyFont(names: string[]): { family: 'helvetica' | 'times' | 'courier'; detected: string } {
    const detected = names[0] ?? '';
    const all = names.join(' ').toLowerCase();

    if (/courier|mono|consol/.test(all)) return { family: 'courier', detected };
    if (/times|serif|georgia|garamond|book|minion|cambria|palatino|roman/.test(all) && !/sans/.test(all)) {
        return { family: 'times', detected };
    }
    return { family: 'helvetica', detected };
}

/** El nombre más repetido, para decirle al entrenador qué se ha detectado. */
function commonestFont(text: TextBox[]): string[] {
    const tally = new Map<string, number>();
    text.forEach(b => {
        const name = (b.fontName || '').replace(/^[A-Z]{6}\+/, '');
        if (name) tally.set(name, (tally.get(name) ?? 0) + b.text.length);
    });
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
}

// =====================================================================
// LOS CAMPOS DE LA CABECERA
// =====================================================================

/**
 * "NOMBRE: ______" en la hoja del coach es `sheet.athleteLabel` aquí.
 *
 * Se copia el rótulo LITERAL —con sus mayúsculas y su redacción— porque es
 * parte de cómo se ve su hoja: quien escribió "ALUMNO" no quiere que le
 * salga "NOMBRE".
 */
function readFieldLabels(text: TextBox[], limitY: number): Partial<Record<'dayLabel' | 'athleteLabel' | 'blockLabel', string>> {
    const out: Partial<Record<'dayLabel' | 'athleteLabel' | 'blockLabel', string>> = {};

    text
        .filter(b => b.y < limitY && b.text.includes(':'))
        .forEach(b => {
            const label = b.text.split(':')[0].trim();
            if (!label || label.length > 32) return;
            const t = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

            if (!out.dayLabel && /^(dia|day|jornada|sesion|fecha)/.test(t)) out.dayLabel = label;
            else if (!out.athleteLabel && /(nombre|atleta|alumno|cliente|deportista|name)/.test(t)) out.athleteLabel = label;
            else if (!out.blockLabel && /(bloque|block|mesociclo|programa|informacion|semana)/.test(t)) out.blockLabel = label;
        });

    return out;
}

// =====================================================================
// EL ESCANEO
// =====================================================================

/**
 * Lee un PDF de ejemplo y devuelve el tema que lo reproduce.
 *
 * Solo mira la PRIMERA página: una plantilla semanal repite la misma hoja
 * siete veces, y las diferencias entre el lunes y el martes son los datos,
 * no el diseño. Analizar las siete tardaría siete veces más para llegar a la
 * misma conclusión.
 */
export async function scanPdfTemplate(file: File | ArrayBuffer): Promise<TemplateScan> {
    // Se fija en cada llamada y no una sola vez al importar: `PDFModal` toca
    // la misma variable global (apunta a un CDN), y quién gana depende de qué
    // módulo se cargó antes. Aquí interesa el worker empaquetado, que ni
    // depende de la red ni puede desincronizarse de versión.
    GlobalWorkerOptions.workerSrc = workerUrl;

    const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const doc = await getDocument({ data: new Uint8Array(data) }).promise;
    const notes: string[] = [];

    try {
        const page = await doc.getPage(1);
        const raster = await rasterize(page);
        const text = await readText(page, raster);

        // ------------------------------------------------- papel
        const base = page.getViewport({ scale: 1 });
        const pageW = base.width * PT_TO_MM;
        const pageH = base.height * PT_TO_MM;
        const near = (a: number, b: number, t: number) => Math.abs(a - b) <= t;

        const page_: PdfThemeInput['page'] = near(pageW, 210, 3) && near(pageH, 297, 3)
            ? 'a4'
            : near(pageW, 210, 3) && near(pageH, 373.3, 5)
                ? 'mobile'
                : 'custom';

        // ------------------------------------------------- colores
        const histogram = colorHistogram(raster.data);
        const surface = histogram[0]?.color ?? [255, 255, 255];
        const ink = buildInkMask(raster, surface);

        // La tinta se saca de DENTRO de las letras, no del histograma
        // general: en una plantilla casi vacía el texto ocupa el 2 % de la
        // página y cualquier recuadro grande le gana en número de píxeles.
        const inkColor = sampleTextColor(raster, text, surface) ?? [
            relativeLuminance(surface) > 0.5 ? 22 : 255,
            relativeLuminance(surface) > 0.5 ? 24 : 255,
            relativeLuminance(surface) > 0.5 ? 28 : 255,
        ] as RGB;

        const total = raster.w * raster.h;
        const accent = histogram.find(b =>
            b.count / total > 0.0008 &&
            chroma(b.color) > 0.25 &&
            colorDistance(b.color, surface) > 120 &&
            colorDistance(b.color, inkColor) > 120
        )?.color ?? null;

        // ------------------------------------------------- rejilla
        const rules = horizontalLines(ink, raster);
        const { table, boxes } = findTable(ink, raster, rules);

        const lineColor = table
            ? sampleLineColor(raster, table, surface) ?? inkColor
            : inkColor;

        // ------------------------------------------------- columnas
        let columns: PdfSheetColumn[] = DEFAULT_COLUMNS;
        let rowHeightMm: number | null = null;

        if (table) {
            const read = readColumns(table, text);
            if (read.length >= 2) {
                columns = read;
                if (!read.some(c => c.key === 'name')) {
                    // Sin columna de nombre no hay dónde poner el ejercicio.
                    // La primera de la izquierda es siempre la candidata.
                    columns = read.map((c, i) => (i === 0 ? { ...c, key: 'name' as const } : c));
                    notes.push('No se reconoció la columna del ejercicio: se ha usado la primera.');
                }
            }
            const gaps = table.bands.slice(1).map(b => (b.bottom - b.top) / raster.ppmm);
            if (gaps.length > 0) {
                gaps.sort((a, b) => a - b);
                rowHeightMm = gaps[Math.floor(gaps.length / 2)];
            }
        } else {
            notes.push('No se ha encontrado ninguna tabla: se conservan las columnas actuales.');
        }

        // ------------------------------------------------- logotipo
        const headerLimit = table ? table.top : raster.h * 0.3;
        const logo = extractLogo(raster, ink, text, rules, headerLimit);
        if (!logo) notes.push('No se ha encontrado ningún logotipo en la cabecera.');

        // ------------------------------------------------- tipografía
        const fonts = commonestFont(text);
        const { family, detected } = classifyFont(fonts);

        // La escala se mide contra el cuerpo de la tabla, que es donde va el
        // dato. Pero una plantilla EN BLANCO —que es lo que suele subir el
        // entrenador— no tiene cuerpo: dentro de la tabla solo están los
        // rótulos de la cabecera. Compararlos contra el tamaño de un dato
        // (11 pt) en vez de contra el de un rótulo (10 pt) encogía el
        // documento entero un 10 % por una comparación mal emparejada.
        const head = table?.bands[0];
        const bodySizes = table && head
            ? text.filter(b => b.y > head.bottom && b.y < table.bottom).map(b => b.sizePt)
            : text.map(b => b.sizePt);
        const headSizes = head
            ? text.filter(b => b.y >= head.top - 2 && b.y <= head.bottom).map(b => b.sizePt)
            : [];

        const median = (values: number[]) => {
            const sorted = [...values].sort((a, b) => a - b);
            return sorted[Math.floor(sorted.length / 2)];
        };

        const medianPt = bodySizes.length >= 3
            ? median(bodySizes)
            : headSizes.length > 0
                ? median(headSizes) * 1.1   // de tamaño de rótulo a tamaño de dato
                : text.length > 0 ? median(text.map(b => b.sizePt)) : 11;
        const scale = Math.min(1.25, Math.max(0.85, medianPt / 11));

        const headings = text.filter(b => b.sizePt >= medianPt);
        const upper = headings.length > 0
            ? headings.filter(b => b.text === b.text.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(b.text)).length / headings.length > 0.55
            : true;

        // ------------------------------------------------- cajas de abajo
        //
        // Solo cuentan las bandas CERRADAS: dos verticales, una a cada lado.
        // Entre dos recuadros siempre queda una banda de aire —el hueco que
        // los separa— que también está delimitada por dos horizontales, y
        // tomarla por una caja desplazaba todo un puesto: el rótulo del
        // recuadro de notas se buscaba encima del aire, donde no hay nada.
        const below = boxes.filter(b => b.verticals.length === 2 && (!table || b.top >= table.bottom));
        const notesBoxLabel = below.length > 0
            ? textInside(text, 0, raster.w, below[0].top - raster.ppmm * 8, below[0].top).slice(0, 40)
            : '';
        const labels = readFieldLabels(text, headerLimit);

        if (!logo && !table) {
            notes.push('El PDF no se parece a una hoja de entrenamiento; se han copiado solo los colores y la tipografía.');
        }

        const theme: PdfThemeInput = {
            page: page_,
            pageSize: page_ === 'custom' ? { w: Math.round(pageW * 10) / 10, h: Math.round(pageH * 10) / 10 } : null,
            palette: {
                surface: rgbToHex(...surface),
                ink: rgbToHex(...inkColor),
                line: rgbToHex(...lineColor),
                muted: mixHex(rgbToHex(...inkColor), rgbToHex(...surface), 0.42),
                panel: mixHex(rgbToHex(...surface), rgbToHex(...inkColor), 0.07),
                ...(accent ? { accent: rgbToHex(...accent) } : {}),
            },
            typography: { family, scale, upperHeadings: upper },
            header: {
                style: 'stacked',
                showLogo: !!logo,
                logoHeight: logo ? Math.round(logo.heightMm * 10) / 10 : null,
            },
            layout: { sheet: 'table' },
            sheet: {
                ...labels,
                columns,
                ...(rowHeightMm ? { rowUnits: Math.min(14, Math.max(2.6, rowHeightMm / 4)) } : {}),
                notesBox: { show: below.length > 0 || !table, label: notesBoxLabel },
                footerBox: { show: below.length > 1, label: '' },
                rule: table
                    ? Math.min(1.2, Math.max(0.1, Math.round((table.rule / raster.ppmm) * 100) / 100))
                    : 0.35,
            },
        };

        return {
            theme,
            logoDataUrl: logo?.dataUrl ?? null,
            report: {
                pageLabel: `${page_ === 'a4' ? 'A4' : page_ === 'mobile' ? 'Móvil 9:16' : 'A medida'} · ${Math.round(pageW)} × ${Math.round(pageH)} mm`,
                fontLabel: detected ? `${family === 'times' ? 'Times' : family === 'courier' ? 'Courier' : 'Helvética'} (en tu PDF: ${detected})` : 'Helvética',
                columns: columns.map(c => c.label || '—'),
                rowHeightMm: rowHeightMm ? Math.round(rowHeightMm * 10) / 10 : null,
                foundLogo: !!logo,
                foundTable: !!table,
                notes,
            },
        };
    } finally {
        // Un documento sin destruir se queda con su worker y su memoria
        // ocupados hasta que recargue la pestaña. El entrenador puede probar
        // seis plantillas seguidas antes de quedarse con una.
        await doc.destroy();
    }
}

/**
 * El color de las letras, mirando dentro de sus cajas.
 *
 * Se queda con el cuarto de píxeles MÁS alejado del fondo de cada caja: el
 * resto son antialias, y promediarlos daría un gris a medio camino entre la
 * tinta y el papel que no es el color de nadie.
 */
function sampleTextColor(raster: Raster, text: TextBox[], surface: RGB): RGB | null {
    const sample: { color: RGB; distance: number }[] = [];

    for (const box of text.slice(0, 400)) {
        const x0 = Math.max(0, Math.floor(box.x));
        const y0 = Math.max(0, Math.floor(box.y));
        const x1 = Math.min(raster.w, Math.ceil(box.x + box.w));
        const y1 = Math.min(raster.h, Math.ceil(box.y + box.h));

        for (let y = y0; y < y1; y += 2) {
            for (let x = x0; x < x1; x += 2) {
                const color = raster.at(x, y);
                const distance = colorDistance(color, surface);
                if (distance > 60) sample.push({ color, distance });
            }
        }
    }

    if (sample.length === 0) return null;
    sample.sort((a, b) => b.distance - a.distance);
    const top = sample.slice(0, Math.max(1, Math.floor(sample.length * 0.25)));
    const sum = top.reduce((acc, s) => [acc[0] + s.color[0], acc[1] + s.color[1], acc[2] + s.color[2]] as RGB, [0, 0, 0] as RGB);
    return [sum[0] / top.length, sum[1] / top.length, sum[2] / top.length];
}

/** El color del filete, muestreado sobre las verticales de la tabla. */
function sampleLineColor(raster: Raster, table: TableShape, surface: RGB): RGB | null {
    const sample: RGB[] = [];
    const y0 = Math.ceil(table.top);
    const y1 = Math.floor(table.bottom);

    for (const x of table.columns) {
        for (let y = y0; y < y1; y += 3) {
            const color = raster.at(Math.round(x), y);
            if (colorDistance(color, surface) > 90) sample.push(color);
        }
    }

    if (sample.length < 10) return null;
    const sum = sample.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]] as RGB, [0, 0, 0] as RGB);
    return [sum[0] / sample.length, sum[1] / sample.length, sum[2] / sample.length];
}
