/**
 * EXPORTAR LA SEMANA DE ENTRENAMIENTO A PDF
 * =====================================================================
 *
 * QUÉ CAMBIA RESPECTO A LA VERSIÓN ANTERIOR
 *
 * 1. FORMATO 9:16. El documento se lee en un móvil, entre series, con una
 *    mano. Una página con la proporción de la pantalla entra ENTERA sin
 *    pellizcar ni girar; un A4 obliga a hacer zoom para leer una cifra, que
 *    es justo el gesto que no se puede pedir ahí. El A4 sigue disponible
 *    para quien imprime (`theme.page`).
 *
 * 2. SE ACABÓ LA TABLA. Antes era una rejilla de cinco columnas: el nombre
 *    del ejercicio en una celda de 78 mm que casi siempre partía en dos
 *    renglones, y cuatro cifras apretadas a su derecha. En un móvil eso son
 *    cinco columnas de dos centímetros. Ahora cada ejercicio es un BLOQUE:
 *    el nombre a ancho completo y sus cuatro cifras debajo, cada una con su
 *    rótulo. Se lee de arriba abajo, que es como se lee un teléfono.
 *
 * 3. TODO SALE DE UN TEMA. Ni un color, ni un tamaño, ni un margen están
 *    escritos aquí: vienen de `PdfTheme`, que vive en el perfil del
 *    entrenador. Cambiar el diseño no es tocar este archivo.
 *
 * LA CUADRÍCULA
 *
 * Una sola unidad —`u`, 4 mm por defecto— y TODAS las distancias verticales
 * son múltiplos suyos. Es lo que hace que los bloques se alineen entre sí
 * sin que nadie tenga que cuadrar números a mano, y lo que permite que la
 * densidad sea un ajuste: se cambia `u` y el documento entero respira más o
 * menos manteniendo las proporciones.
 *
 * Horizontalmente hay 4 columnas iguales con su medianil. Las cifras de un
 * ejercicio ocupan una cada una, así que caen siempre en el mismo sitio de
 * un bloque al siguiente: el ojo aprende dónde está el descanso y deja de
 * buscarlo.
 */

import { jsPDF } from 'jspdf';
import type { TrainingSet, TargetMetric } from '../../types/training';
import { TARGET_METRICS, weekdayLabel } from '../../types/training';
import {
    DEFAULT_THEME,
    PAGE_SIZES,
    hexToRgb,
    resolveTheme,
    type PdfTheme,
    type PdfThemeInput,
} from './pdfTheme';

export interface PrintExerciseRow {
    name: string;
    /** Número de series. Vacío si no se puede deducir. */
    series: string;
    /** Repeticiones por serie. Puede ser un rango ("5-6") o varias ("6, 5, 4"). */
    reps: string;
    /** Descanso ya formateado ("2'30\""). */
    rest: string;
    /** Intensidad con su unidad ("140 kg", "RPE 8", "RIR 2", "0,45 m/s"). */
    intensity: string;
    /** Notas del coach para ese ejercicio. */
    notes?: string | null;
    /** La variante prescrita ("Tempo 2\"", "Con pausa"). Cambia el ejercicio. */
    variant?: string | null;
}

export interface PrintDay {
    /** "Lunes" o "Día 1". */
    title: string;
    /** "4 de agosto" — opcional, solo si el día está agendado. */
    date?: string | null;
    exercises: PrintExerciseRow[];
    /** Apéndice: qué hacer ANTES de la sesión. */
    warmup?: string | null;
    /** Apéndice: trabajo opcional al terminar. */
    extras?: string | null;
}

export interface PrintWeek {
    blockName: string;
    athleteName: string;
    weekLabel: string;
    /** Rango de fechas de la semana, si se conoce. */
    dateRange?: string | null;
    days: PrintDay[];
    /** Aspecto del documento. Sin él, el tema por defecto. */
    theme?: PdfThemeInput | null;
}

/** Segundos a "2'30\"". Vacío si no hay descanso pautado. */
export function formatRest(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}"`;
    if (s === 0) return `${m}'`;
    return `${m}'${String(s).padStart(2, '0')}"`;
}

// =====================================================================
// LA CUADRÍCULA
// =====================================================================

/** Unidad base en mm según la densidad elegida. Todo lo vertical es múltiplo. */
const UNIT: Record<PdfTheme['layout']['density'], number> = {
    compact: 3.2,
    normal: 4,
    relaxed: 4.8,
};

interface Grid {
    page: { w: number; h: number };
    margin: { top: number; right: number; bottom: number; left: number };
    /** Ancho útil. */
    content: number;
    /** Unidad vertical. */
    u: number;
    /** Ancho de una de las 4 columnas. */
    col: number;
    /** Medianil entre columnas. */
    gutter: number;
    /** X donde empieza la columna `i` (0-3). */
    colX: (i: number) => number;
    /** Y por debajo de la cual hay que cambiar de página. */
    bottom: number;
}

function buildGrid(theme: PdfTheme): Grid {
    const size = PAGE_SIZES[theme.page] ?? PAGE_SIZES.mobile;
    const u = UNIT[theme.layout.density] ?? UNIT.normal;

    // Los márgenes también salen de la unidad: así la densidad no solo
    // aprieta las filas, también acerca o aleja el texto del canto.
    const side = u * 3.5;
    const margin = { top: u * 3, right: side, bottom: u * 4, left: side };
    const content = size.w - margin.left - margin.right;

    const gutter = u * 1.5;
    const col = (content - gutter * 3) / 4;

    return {
        page: size,
        margin,
        content,
        u,
        col,
        gutter,
        colX: (i: number) => margin.left + i * (col + gutter),
        bottom: size.h - margin.bottom,
    };
}

// =====================================================================
// PINTAR
// =====================================================================

/**
 * Todo lo que el documento necesita saber, en un solo sitio.
 *
 * Se pasa por parámetro en vez de vivir en variables de módulo porque dos
 * pestañas pueden estar generando dos PDF distintos a la vez, y un estado
 * compartido mezclaría el tema de un entrenador con el de otro.
 */
interface Ctx {
    doc: jsPDF;
    theme: PdfTheme;
    grid: Grid;
    week: PrintWeek;
    /** Tamaños ya multiplicados por la escala del tema. */
    size: (base: number) => number;
}

const rgb = (hex: string): [number, number, number] => hexToRgb(hex) ?? [0, 0, 0];

function ink(ctx: Ctx, hex: string) {
    const [r, g, b] = rgb(hex);
    ctx.doc.setTextColor(r, g, b);
}

function fill(ctx: Ctx, hex: string) {
    const [r, g, b] = rgb(hex);
    ctx.doc.setFillColor(r, g, b);
}

function stroke(ctx: Ctx, hex: string, width: number) {
    const [r, g, b] = rgb(hex);
    ctx.doc.setDrawColor(r, g, b);
    ctx.doc.setLineWidth(width);
}

function font(ctx: Ctx, weight: 'normal' | 'bold' | 'italic', points: number) {
    ctx.doc.setFont(ctx.theme.typography.family, weight);
    ctx.doc.setFontSize(ctx.size(points));
}

const headingCase = (ctx: Ctx, text: string) =>
    ctx.theme.typography.upperHeadings ? text.toUpperCase() : text;

/** Ancho de una cadena con la fuente y el tamaño actuales, en mm. */
function widthOf(doc: jsPDF, text: string, size: number): number {
    return (doc.getStringUnitWidth(text) * size) / doc.internal.scaleFactor;
}

/** Recorta con puntos suspensivos. Para celdas de una sola línea. */
function ellipsize(doc: jsPDF, text: string, size: number, maxW: number): string {
    if (widthOf(doc, text, size) <= maxW) return text;
    let cut = text;
    while (cut.length > 1 && widthOf(doc, `${cut}…`, size) > maxW) cut = cut.slice(0, -1);
    return `${cut}…`;
}

/** El fondo de la página. Se pinta ANTES que nada, en cada hoja. */
function paintSurface(ctx: Ctx) {
    if (ctx.theme.palette.surface.toUpperCase() === '#FFFFFF') return; // El papel ya es blanco.
    fill(ctx, ctx.theme.palette.surface);
    ctx.doc.rect(0, 0, ctx.grid.page.w, ctx.grid.page.h, 'F');
}

// ---------------------------------------------------------------------
// CABECERA
// ---------------------------------------------------------------------

/**
 * La cabecera de marca: quién manda este entrenamiento.
 *
 * Se repite en TODAS las hojas, también en la segunda de un día largo. Una
 * página suelta encima del banco —o abierta en el móvil sin las anteriores—
 * tiene que decir de quién es sin depender de ninguna otra.
 *
 * Devuelve la Y a la que continúa el documento.
 */
function drawBrandHeader(ctx: Ctx): number {
    const { doc, theme, grid } = ctx;
    const { palette, header } = theme;
    const title = header.title?.trim() || 'ANVIL STRENGTH';
    const logo = header.showLogo ? header.logoDataUrl : null;

    if (header.style === 'bar') {
        const barH = grid.u * 4;
        fill(ctx, palette.accent);
        doc.rect(0, 0, grid.page.w, barH, 'F');

        let x = grid.margin.left;
        if (logo) {
            const s = barH - grid.u * 1.6;
            try {
                doc.addImage(logo, 'PNG', x, (barH - s) / 2, s, s, undefined, 'FAST');
                x += s + grid.u;
            } catch { /* formato que jsPDF no traga: se sigue sin logotipo */ }
        }

        font(ctx, 'bold', 10);
        ink(ctx, palette.onAccent ?? '#FFFFFF');
        doc.text(headingCase(ctx, title), x, barH / 2 + grid.u * 0.35);

        if (header.subtitle?.trim()) {
            font(ctx, 'normal', 7.5);
            doc.text(
                header.subtitle.trim(),
                grid.page.w - grid.margin.right,
                barH / 2 + grid.u * 0.35,
                { align: 'right' }
            );
        }

        return barH + grid.u * 2.5;
    }

    if (header.style === 'stacked') {
        let y = grid.margin.top;

        if (logo) {
            const s = grid.u * 4;
            try {
                doc.addImage(logo, 'PNG', (grid.page.w - s) / 2, y, s, s, undefined, 'FAST');
                y += s + grid.u;
            } catch { /* ídem */ }
        }

        font(ctx, 'bold', 11);
        ink(ctx, palette.ink);
        doc.text(headingCase(ctx, title), grid.page.w / 2, y + grid.u, { align: 'center' });
        y += grid.u * 1.75;

        if (header.subtitle?.trim()) {
            font(ctx, 'normal', 7.5);
            ink(ctx, palette.muted);
            doc.text(header.subtitle.trim(), grid.page.w / 2, y + grid.u * 0.5, { align: 'center' });
            y += grid.u * 1.25;
        }

        y += grid.u * 0.5;
        stroke(ctx, palette.line, 0.3);
        doc.line(grid.margin.left, y, grid.page.w - grid.margin.right, y);
        return y + grid.u * 2;
    }

    // minimal
    let y = grid.margin.top;
    font(ctx, 'bold', 8);
    ink(ctx, palette.muted);
    doc.text(headingCase(ctx, title), grid.margin.left, y + grid.u * 0.5);

    if (header.subtitle?.trim()) {
        font(ctx, 'normal', 7.5);
        doc.text(
            header.subtitle.trim(),
            grid.page.w - grid.margin.right,
            y + grid.u * 0.5,
            { align: 'right' }
        );
    }

    y += grid.u * 1.5;
    stroke(ctx, palette.line, 0.3);
    doc.line(grid.margin.left, y, grid.page.w - grid.margin.right, y);
    return y + grid.u * 2;
}

/**
 * El titular del día.
 *
 * Es lo más grande del documento y ocupa su propia banda porque responde a
 * la única pregunta que se hace al abrirlo: "¿qué toca hoy?". Debajo, en
 * gris y pequeño, el contexto que solo se consulta si hace falta.
 */
function drawDayTitle(ctx: Ctx, day: PrintDay, y: number, continued: boolean): number {
    const { doc, theme, grid, week } = ctx;
    const { palette } = theme;

    font(ctx, 'bold', 22);
    ink(ctx, palette.ink);
    const title = headingCase(ctx, continued ? `${day.title} (cont.)` : day.title);
    doc.text(ellipsize(doc, title, ctx.size(22), grid.content), grid.margin.left, y + grid.u * 1.4);
    // 3u y no 2,4u. A 2,4 el renglón de contexto quedaba a 17 pt de la línea
    // base de un titular de 22: los descendentes del título rozaban la
    // primera línea del texto de abajo.
    y += grid.u * 3;

    const meta = [day.date, week.athleteName, [week.blockName, week.weekLabel].filter(Boolean).join(' · ')]
        .filter(Boolean)
        .join('   ·   ');

    font(ctx, 'normal', 8);
    ink(ctx, palette.muted);
    doc.text(ellipsize(doc, meta, ctx.size(8), grid.content), grid.margin.left, y + grid.u * 0.5);
    y += grid.u * 1.5;

    stroke(ctx, palette.ink, 0.8);
    doc.line(grid.margin.left, y, grid.margin.left + grid.col * 1.2, y);

    return y + grid.u * 2;
}

/** Rótulo de sección: CALENTAMIENTO, EJERCICIOS, EXTRAS. */
function drawSectionLabel(ctx: Ctx, label: string, y: number): number {
    const { doc, grid, theme } = ctx;
    font(ctx, 'bold', 7);
    ink(ctx, theme.palette.accent);
    doc.text(label.toUpperCase(), grid.margin.left, y);
    return y + grid.u * 1.5;
}

// ---------------------------------------------------------------------
// EL BLOQUE DE UN EJERCICIO
// ---------------------------------------------------------------------

/** Las cuatro cifras, en el orden en que se necesitan al entrenar. */
const METRICS: { key: keyof PrintExerciseRow; label: string }[] = [
    { key: 'series', label: 'Series' },
    { key: 'reps', label: 'Reps' },
    { key: 'intensity', label: 'Carga' },
    { key: 'rest', label: 'Descanso' },
];

/**
 * Mide un ejercicio SIN pintarlo.
 *
 * El salto de página se decide antes de dibujar: cortar un bloque por la
 * mitad —el nombre en una hoja y sus kilos en la siguiente— es el defecto
 * clásico de estas exportaciones y aquí sería especialmente grave, porque
 * lo que se parte es exactamente el dato que hay que leer.
 */
function measureExercise(ctx: Ctx, ex: PrintExerciseRow): {
    height: number;
    nameLines: string[];
    noteLines: string[];
} {
    const { doc, grid, theme } = ctx;
    const indent = theme.layout.accentBar ? grid.u * 1.5 : 0;
    const textW = grid.content - indent;

    font(ctx, 'bold', 12);
    const nameLines = doc.splitTextToSize(ex.name, textW) as string[];

    font(ctx, 'normal', 8);
    const noteLines = theme.layout.showNotes && ex.notes?.trim()
        ? (doc.splitTextToSize(ex.notes.trim(), textW) as string[])
        : [];

    let h = nameLines.length * grid.u * 1.35;
    if (ex.variant?.trim()) h += grid.u * 1.1;
    h += grid.u * 0.6;          // aire antes de las cifras
    h += grid.u * 2.4;          // la fila de cifras (rótulo + valor)
    if (noteLines.length > 0) h += grid.u * 0.5 + noteLines.length * grid.u * 0.95;
    h += grid.u * 1.6;          // aire hasta el siguiente bloque

    return { height: h, nameLines, noteLines };
}

function drawExercise(
    ctx: Ctx,
    ex: PrintExerciseRow,
    index: number,
    y: number,
    measured: ReturnType<typeof measureExercise>
): number {
    const { doc, grid, theme } = ctx;
    const { palette } = theme;
    const indent = theme.layout.accentBar ? grid.u * 1.5 : 0;
    const x = grid.margin.left + indent;
    const top = y;

    if (theme.layout.zebra && index % 2 === 1) {
        fill(ctx, palette.panel);
        doc.rect(grid.margin.left - grid.u * 0.5, y - grid.u, grid.content + grid.u, measured.height - grid.u * 0.4, 'F');
    }

    // Número del ejercicio. Va en el margen, fuera de la columna de texto:
    // ordena la lista sin robarle ancho al nombre.
    font(ctx, 'bold', 8);
    ink(ctx, palette.muted);
    doc.text(String(index + 1).padStart(2, '0'), grid.margin.left, y + grid.u * 0.35);

    // Nombre
    font(ctx, 'bold', 12);
    ink(ctx, palette.ink);
    measured.nameLines.forEach((line, i) => {
        doc.text(line, x + grid.u * 2.2, y + grid.u * 0.4 + i * grid.u * 1.35);
    });
    y += measured.nameLines.length * grid.u * 1.35;

    // LA VARIANTE, en el acento. No es decoración: una banca con pausa de
    // cuatro segundos NO es una banca, y confundirlas invalida la sesión.
    if (ex.variant?.trim()) {
        font(ctx, 'bold', 8);
        ink(ctx, palette.accent);
        doc.text(
            ellipsize(doc, ex.variant.trim(), ctx.size(8), grid.content - indent - grid.u * 2.2),
            x + grid.u * 2.2,
            y + grid.u * 0.4
        );
        y += grid.u * 1.1;
    }

    y += grid.u * 0.6;

    // LAS CIFRAS, una por columna de la cuadrícula.
    // Siempre las cuatro, aunque alguna esté vacía: el hueco dice "aquí no
    // hay descanso pautado", y mover las columnas según lo que haya
    // obligaría a releer los rótulos en cada ejercicio.
    //
    // `grid.colX` arranca en `grid.margin.left`, que es justo donde se pinta
    // el filete de acento (más abajo, `doc.rect(grid.margin.left, …)`). Con
    // él activado, la columna "Series" caía encima del filete y el número
    // salía tapado. El resto del bloque —nombre, variante, nota— ya vive
    // desplazado por `indent`; las cifras usaban `grid.colX` a secas y se
    // quedaban las únicas sin desplazar. La cuadrícula se recalcula sobre el
    // ancho que queda tras el desplazamiento, igual que `textW` más arriba.
    const metricGutter = grid.gutter;
    const metricCol = (grid.content - indent - metricGutter * 3) / 4;
    const metricColX = (i: number) => x + i * (metricCol + metricGutter);

    METRICS.forEach((metric, i) => {
        const cx = metricColX(i);

        font(ctx, 'normal', 6.5);
        ink(ctx, palette.muted);
        doc.text(metric.label.toUpperCase(), cx, y);

        font(ctx, 'bold', 12);
        ink(ctx, palette.ink);
        const value = (ex[metric.key] as string) || '–';
        doc.text(ellipsize(doc, value, ctx.size(12), metricCol), cx, y + grid.u * 1.5);
    });
    y += grid.u * 2.4;

    // Nota del entrenador
    if (measured.noteLines.length > 0) {
        y += grid.u * 0.5;
        font(ctx, 'normal', 8);
        ink(ctx, palette.muted);
        measured.noteLines.forEach((line, i) => {
            doc.text(line, x + grid.u * 2.2, y + i * grid.u * 0.95);
        });
        y += measured.noteLines.length * grid.u * 0.95;
    }

    // Filete de acento a la altura EXACTA del bloque. Es lo que agrupa
    // visualmente nombre, cifras y nota en una sola pieza.
    if (theme.layout.accentBar) {
        fill(ctx, palette.accent);
        doc.rect(grid.margin.left, top - grid.u * 0.6, 0.8, y - top + grid.u * 0.6, 'F');
    }

    y += grid.u * 1.6;

    stroke(ctx, palette.line, 0.2);
    doc.line(grid.margin.left, y - grid.u * 0.8, grid.page.w - grid.margin.right, y - grid.u * 0.8);

    return y;
}

// ---------------------------------------------------------------------
// APÉNDICES
// ---------------------------------------------------------------------

function measureAppendix(ctx: Ctx, body: string): { lines: string[]; height: number } {
    const pad = ctx.grid.u;
    font(ctx, 'normal', 9);
    const lines = ctx.doc.splitTextToSize(body.trim(), ctx.grid.content - pad * 2) as string[];
    return { lines, height: pad * 2 + lines.length * ctx.grid.u * 1.1 };
}

/**
 * Calentamiento y extras: texto libre del coach, en su propia caja.
 *
 * SIN rótulo dentro. Lo llevaba, y encima de la caja ya está el de sección:
 * el documento decía "CALENTAMIENTO" y justo debajo "ANTES DE EMPEZAR", dos
 * etiquetas para la misma cosa. La caja gris ya se lee como una unidad.
 */
function drawAppendix(ctx: Ctx, body: string, y: number): number {
    const { doc, grid, theme } = ctx;
    const pad = grid.u;
    const { lines, height } = measureAppendix(ctx, body);

    fill(ctx, theme.palette.panel);
    doc.roundedRect(grid.margin.left, y, grid.content, height, 1.5, 1.5, 'F');

    font(ctx, 'normal', 9);
    ink(ctx, theme.palette.ink);
    lines.forEach((line, i) => {
        doc.text(line, grid.margin.left + pad, y + pad + grid.u * 0.8 + i * grid.u * 1.1);
    });

    return y + height + grid.u * 2;
}

// ---------------------------------------------------------------------
// PIE
// ---------------------------------------------------------------------

function drawFooter(ctx: Ctx, page: number, total: number) {
    const { doc, grid, theme, week } = ctx;
    const y = grid.page.h - grid.margin.bottom + grid.u * 2;

    stroke(ctx, theme.palette.line, 0.2);
    doc.line(grid.margin.left, y - grid.u * 1.2, grid.page.w - grid.margin.right, y - grid.u * 1.2);

    font(ctx, 'bold', 6.5);
    ink(ctx, theme.palette.muted);
    const sign = theme.footer.text?.trim() || theme.header.title?.trim() || 'ANVIL STRENGTH';
    doc.text(headingCase(ctx, sign), grid.margin.left, y);

    font(ctx, 'normal', 6.5);
    if (week.dateRange) {
        doc.text(week.dateRange, grid.page.w / 2, y, { align: 'center' });
    }
    if (theme.footer.showPageNumbers) {
        doc.text(`${page} / ${total}`, grid.page.w - grid.margin.right, y, { align: 'right' });
    }
}

// =====================================================================
// DOCUMENTO
// =====================================================================

export function buildWeekPdf(week: PrintWeek): jsPDF {
    const theme = resolveTheme(week.theme);
    const grid = buildGrid(theme);

    const doc = new jsPDF({
        unit: 'mm',
        format: [grid.page.w, grid.page.h],
        orientation: 'portrait',
    });

    const ctx: Ctx = {
        doc,
        theme,
        grid,
        week,
        size: (base: number) => base * theme.typography.scale,
    };

    const days = week.days.length > 0 ? week.days : [{ title: 'Sin días', exercises: [] }];

    days.forEach((day, dayIndex) => {
        if (dayIndex > 0) doc.addPage([grid.page.w, grid.page.h], 'portrait');

        paintSurface(ctx);
        let continued = false;
        let y = drawDayTitle(ctx, day, drawBrandHeader(ctx), continued);

        /** Cambia de hoja conservando la identidad: marca y día. */
        const nextPage = () => {
            doc.addPage([grid.page.w, grid.page.h], 'portrait');
            paintSurface(ctx);
            continued = true;
            y = drawDayTitle(ctx, day, drawBrandHeader(ctx), continued);
        };

        // CONSIDERACIONES lo primero de la hoja. Son las indicaciones del día
        // y solo sirven leídas antes de empezar; como apéndice final quedaban
        // detrás de la tabla de ejercicios, donde nadie vuelve. La columna
        // sigue llamándose `extras`: ver src/types/training.ts.
        if (day.extras?.trim()) {
            const { height } = measureAppendix(ctx, day.extras);
            if (y + height > grid.bottom) nextPage();
            y = drawSectionLabel(ctx, 'Consideraciones', y);
            y = drawAppendix(ctx, day.extras, y);
        }

        // Calentamiento ANTES de los ejercicios: es lo primero que se hace, y
        // al final de la hoja no lo lee nadie.
        if (day.warmup?.trim()) {
            const { height } = measureAppendix(ctx, day.warmup);
            if (y + height > grid.bottom) nextPage();
            y = drawSectionLabel(ctx, 'Calentamiento', y);
            y = drawAppendix(ctx, day.warmup, y);
        }

        if (day.exercises.length === 0) {
            font(ctx, 'italic', 11);
            ink(ctx, theme.palette.muted);
            doc.text('Día de descanso', grid.page.w / 2, y + grid.u * 4, { align: 'center' });
            y += grid.u * 8;
        } else {
            y = drawSectionLabel(ctx, 'Entrenamiento', y);

            day.exercises.forEach((ex, i) => {
                const measured = measureExercise(ctx, ex);
                if (y + measured.height > grid.bottom) nextPage();
                y = drawExercise(ctx, ex, i, y, measured);
            });

            y += grid.u;
        }

    });

    // Los pies van al final: hasta aquí no se sabe cuántas hojas hay, porque
    // los días largos añaden páginas sobre la marcha.
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page++) {
        doc.setPage(page);
        drawFooter(ctx, page, total);
    }

    return doc;
}

/** Quita acentos y todo lo que no sea seguro en un nombre de archivo. */
function slug(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'semana';
}

/**
 * Genera el PDF y lo descarga.
 *
 * Devuelve el nombre del archivo para poder decirlo en el aviso: en
 * escritorio la descarga es un renglón discreto abajo del navegador, y sin
 * el nombre el coach no sabe si ha pasado algo.
 */
export function downloadWeekPdf(week: PrintWeek): string {
    const doc = buildWeekPdf(week);
    const filename = `${slug(week.athleteName)}-${slug(week.weekLabel)}.pdf`;
    doc.save(filename);
    return filename;
}

/** El documento como URL de datos. Para la vista previa de los ajustes. */
export function weekPdfDataUrl(week: PrintWeek): string {
    return buildWeekPdf(week).output('datauristring');
}

export { DEFAULT_THEME };

// =====================================================================
// DE LOS DATOS DE LA APP A LAS FILAS DE LA HOJA
// =====================================================================

/** Forma mínima que necesita el exportador. La cumplen las dos pantallas. */
export interface PrintableExercise {
    exercise?: { name: string } | null;
    variant_name?: string | null;
    notes?: string | null;
    rest_seconds?: number | null;
    rpe?: string | null;
    sets: TrainingSet[];
}

export interface PrintableSession {
    name?: string | null;
    day_number: number;
    day_of_week?: string | null;
    warmup?: string | null;
    extras?: string | null;
    exercises: PrintableExercise[];
}

/** "4x6" -> 4 series. Sin la "x", es una serie suelta. */
function seriesCount(targetReps: string | null | undefined): number {
    if (!targetReps) return 1;
    const parts = targetReps.toLowerCase().split('x');
    if (parts.length < 2) return 1;
    const n = parseInt(parts[0].trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

/** "4x6" -> "6". Sin la "x", el valor entero ("5-6", "AMRAP"). */
function repsPart(targetReps: string | null | undefined): string {
    if (!targetReps) return '';
    const parts = targetReps.toLowerCase().split('x');
    return (parts.length >= 2 ? parts.slice(1).join('x') : parts[0]).trim();
}

/** Junta valores repetidos en uno: ["6","6","5"] -> "6, 6, 5"; ["6","6"] -> "6". */
function collapse(values: string[]): string {
    const clean = values.filter(Boolean);
    if (clean.length === 0) return '';
    const unique = [...new Set(clean)];
    return unique.length === 1 ? unique[0] : clean.join(', ');
}

/** Intensidad de una serie, con su unidad. Ver database/set_target_metric.sql. */
function intensityOf(set: TrainingSet): string {
    const metric: TargetMetric = set.target_metric ?? 'kg';

    if (metric === 'rpe') return set.target_rpe ? `RPE ${set.target_rpe}` : '';
    if (set.target_load === null || set.target_load === undefined) return '';

    const spec = TARGET_METRICS.find(m => m.key === metric);
    const unit = spec?.unit ? ` ${spec.unit}` : '';
    const prefix = metric === 'rir' ? 'RIR ' : '';
    return `${prefix}${set.target_load}${unit}`;
}

/**
 * Convierte una sesión en una página de la hoja.
 *
 * UN bloque por ejercicio: las series de un mismo ejercicio se agregan en vez
 * de ocupar una fila cada una. Cuando todas coinciden se escribe el valor una
 * vez ("4" series de "6"); cuando no —una pirámide— se listan en orden
 * ("6, 5, 4"), que es como lo lee un atleta.
 */
export function sessionToPrintDay(session: PrintableSession): PrintDay {
    const weekday = weekdayLabel(session.day_of_week);

    return {
        title: session.name || weekday || `Día ${session.day_number}`,
        date: session.name && weekday ? weekday : null,
        warmup: session.warmup ?? null,
        extras: session.extras ?? null,
        exercises: session.exercises.map((ex) => {
            const sets = ex.sets ?? [];

            const totalSeries = sets.reduce((sum, s) => sum + seriesCount(s.target_reps), 0);
            const reps = collapse(sets.map(s => repsPart(s.target_reps)));
            const intensity = collapse(sets.map(intensityOf));

            // El descanso puede estar en el ejercicio o en cada serie.
            const rest = ex.rest_seconds ?? sets.find(s => s.rest_seconds)?.rest_seconds ?? null;

            return {
                // La variante deja de ir pegada al nombre con un guion y pasa a
                // su propio renglón en color: se veía como parte del ejercicio
                // y es lo que lo CAMBIA.
                name: ex.exercise?.name ?? 'Ejercicio',
                variant: ex.variant_name ?? null,
                series: totalSeries > 0 ? String(totalSeries) : '',
                reps,
                rest: formatRest(rest),
                // El RPE global del ejercicio vale cuando ninguna serie trae
                // intensidad propia: si no, la columna saldría vacía en los
                // días pautados solo por esfuerzo.
                intensity: intensity || (ex.rpe ? `RPE ${ex.rpe}` : ''),
                notes: ex.notes,
            };
        }),
    };
}
