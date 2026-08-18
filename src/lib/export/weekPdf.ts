/**
 * EXPORTAR LA SEMANA DE ENTRENAMIENTO A PDF
 * =====================================================================
 *
 * DOS MAQUETAS, UN SOLO GENERADOR
 *
 * 1. `table` — LA HOJA. Es la de por defecto y es, literalmente, la
 *    plantilla que el club ya reparte en papel: el yunque centrado arriba,
 *    los campos DÍA / NOMBRE / INFORMACIÓN BLOQUE con su línea, una rejilla
 *    cerrada con una fila por ejercicio, la caja de indicaciones debajo y el
 *    pie enmarcado. Se eligió porque el atleta la RECONOCE: es la hoja que
 *    lleva un año viendo en la nevera, no un diseño nuevo que explicar.
 *
 *    Las filas son altas —dos centímetros y pico— aunque lleguen rellenas,
 *    porque encima de esos datos se apunta a mano lo que salió de verdad.
 *
 * 2. `blocks` — un bloque por ejercicio, el nombre a ancho completo y las
 *    cifras debajo con su rótulo. Pensada para leer en el móvil entre
 *    series, en formato 9:16: se lee de arriba abajo, que es como se lee un
 *    teléfono, sin las cinco columnas de dos centímetros que salen al meter
 *    una tabla en una pantalla estrecha. Vive en el preset «Móvil».
 *
 * TODO SALE DE UN TEMA. Ni un color, ni un tamaño, ni un margen, ni el
 * rótulo de una columna están escritos aquí: vienen de `PdfTheme`, que vive
 * en el perfil del entrenador y puede haberse deducido de un PDF suyo (ver
 * `pdfTemplateScan.ts`). Cambiar el diseño no es tocar este archivo.
 *
 * LA CUADRÍCULA
 *
 * Una sola unidad —`u`, 4 mm por defecto— y TODAS las distancias verticales
 * son múltiplos suyos. Es lo que hace que las piezas se alineen entre sí sin
 * que nadie tenga que cuadrar números a mano, y lo que permite que la
 * densidad sea un ajuste: se cambia `u` y el documento entero respira más o
 * menos manteniendo las proporciones.
 *
 * En la maqueta de bloques hay además 4 columnas iguales con su medianil, y
 * las cifras de un ejercicio ocupan una cada una: caen siempre en el mismo
 * sitio de un bloque al siguiente, así que el ojo aprende dónde está el
 * descanso y deja de buscarlo. En la de tabla ese papel lo hace la rejilla.
 */

import { jsPDF } from 'jspdf';
import type { TrainingSet, TargetMetric } from '../../types/training';
import { TARGET_METRICS, weekdayLabel } from '../../types/training';
import {
    DEFAULT_THEME,
    hexToRgb,
    pageDimensions,
    resolveTheme,
    type PdfSheetColumn,
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
    const size = pageDimensions(theme);
    const u = UNIT[theme.layout.density] ?? UNIT.normal;

    // Los márgenes también salen de la unidad: así la densidad no solo
    // aprieta las filas, también acerca o aleja el texto del canto.
    //
    // La hoja de tabla los quiere MÁS ESTRECHOS que la de bloques (2,5u
    // frente a 3,5u, unos 10 mm en densidad normal). No es capricho: en la
    // maqueta de bloques el margen es aire de lectura, mientras que en una
    // rejilla de cinco columnas cada milímetro de margen se lo quita a la
    // celda del descanso, que es la que primero se queda sin sitio. Es
    // además lo que mide la plantilla que el club ya reparte.
    const table = theme.layout.sheet === 'table';
    const side = table ? u * 2.5 : u * 3.5;
    const margin = {
        top: table ? u * 2.5 : u * 3,
        right: side,
        bottom: table ? u * 2.5 : u * 4,
        left: side,
    };
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

/**
 * EL YUNQUE, DIBUJADO.
 *
 * Es el mismo contorno que `public/logo.svg`, trazado a mano en vez de
 * incrustado como imagen, y eso resuelve tres cosas de golpe:
 *
 *   · SE TIÑE. Una imagen va con sus píxeles: el yunque blanco de la marca
 *     desaparece sobre el preset de papel. Un trazo se pinta con
 *     `palette.ink`, así que funciona en negro y en blanco sin dos ficheros.
 *
 *   · NO PESA. Cero bytes en cada PDF, frente a los 20-30 KB de un PNG
 *     decente incrustado en las cuatro o cinco hojas de cada semana.
 *
 *   · NO SE PIXELA. Se imprime a la resolución que dé la impresora.
 *
 * Solo sale cuando el entrenador NO ha subido logotipo. El suyo manda
 * siempre: este es el sello de la casa para quien todavía no tiene el suyo.
 *
 * Las coordenadas son las del SVG (lienzo de 100 x 100, tinta entre y=25 e
 * y=85) y se escalan para que el alto pedido sea el de la tinta, no el del
 * lienzo: si no, el logotipo saldría un 40 % más pequeño de lo pedido con un
 * margen fantasma alrededor.
 */
function drawAnvilMark(ctx: Ctx, centerX: number, top: number, height: number) {
    const { doc } = ctx;
    const s = height / 60;
    const x = centerX - (80 * s) / 2 - 10 * s;
    const y = top - 25 * s;

    fill(ctx, ctx.theme.palette.ink);

    // Yunque, parte de arriba: el tablero.
    doc.lines([[80, 0], [-10, 20], [-60, 0]], x + 10 * s, y + 25 * s, [s, s], 'F', true);

    // Y el cuerpo, con su cintura. Los tramos de seis números son curvas.
    doc.lines(
        [
            [44, 0],
            [-7, 15, -7, 15, 10, 35],
            [-20, 0],
            [0, 0, -12, -10, -24, 0],
            [-20, 0],
            [17, -20, 17, -20, 10, -35],
        ],
        x + 28 * s,
        y + 50 * s,
        [s, s],
        'F',
        true
    );
}

/** Ancho que ocupa el yunque para un alto dado. */
const anvilWidth = (height: number) => (height / 60) * 80;

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
// LA HOJA: LA MAQUETA DE TABLA
// =====================================================================
//
// Es la plantilla que el club ya reparte en papel, generada: el yunque
// centrado arriba, DÍA / NOMBRE / INFORMACIÓN BLOQUE en campos con su
// línea, una rejilla cerrada con una fila por ejercicio, la caja de
// indicaciones debajo y el pie enmarcado al fondo.
//
// POR QUÉ ESTA Y NO LA DE BLOQUES
//
// Porque es la que el atleta reconoce. Un documento generado que se parece
// a la hoja que lleva un año viendo en la nevera no hay que explicarlo; uno
// que estrena diseño, sí. La maqueta de bloques sigue disponible
// (`layout.sheet: 'blocks'`) para quien nunca imprime.
//
// LO QUE NO SE COPIA DE LA PLANTILLA DE PAPEL
//
// Las filas vacías. En papel están vacías porque se rellenan a mano; aquí
// llegan con los datos. Lo que SÍ se conserva es su ALTURA —siguen siendo
// filas de dos centímetros y pico— porque encima de esos datos el atleta
// va a apuntar lo que le salió de verdad.

/** Geometría de una columna ya resuelta sobre el ancho útil de la página. */
interface SheetCol {
    col: PdfSheetColumn;
    /** X del canto izquierdo. */
    x: number;
    /** Ancho en mm. */
    w: number;
}

/**
 * Reparte el ancho útil entre las columnas.
 *
 * Los anchos del tema son PESOS, no milímetros: así una plantilla copiada de
 * un A4 sigue cuadrando si el entrenador cambia luego el papel a 9:16, y una
 * columna añadida a mano no obliga a recalcular las otras cuatro.
 */
function sheetGeometry(ctx: Ctx): SheetCol[] {
    const { grid, theme } = ctx;
    const columns = theme.sheet.columns;
    const total = columns.reduce((sum, c) => sum + (c.width > 0 ? c.width : 1), 0) || 1;

    let x = grid.margin.left;
    return columns.map(col => {
        const w = (grid.content * (col.width > 0 ? col.width : 1)) / total;
        const out = { col, x, w };
        x += w;
        return out;
    });
}

/** Qué texto va en una celda. `blank` se queda a propósito sin nada. */
function cellValue(ex: PrintExerciseRow, key: PdfSheetColumn['key']): string {
    switch (key) {
        case 'name': return ex.name;
        case 'series': return ex.series;
        case 'reps': return ex.reps;
        case 'rest': return ex.rest;
        case 'intensity': return ex.intensity;
        default: return '';
    }
}

/**
 * El cuerpo mayor que cabe en un ancho, buscando hacia abajo.
 *
 * Los rótulos de la tabla vienen del entrenador —"KG/INTENSIDAD" cabe,
 * "PESO OBJETIVO DE LA SERIE" no— y en una celda de dos centímetros la
 * diferencia entre recortar con puntos suspensivos y encoger medio punto es
 * la diferencia entre poder leer la cabecera y no.
 */
function fitSize(ctx: Ctx, text: string, weight: 'normal' | 'bold', base: number, maxW: number, min = 5.5): number {
    let pt = base;
    while (pt > min) {
        ctx.doc.setFont(ctx.theme.typography.family, weight);
        ctx.doc.setFontSize(ctx.size(pt));
        if (widthOf(ctx.doc, text, ctx.size(pt)) <= maxW) return pt;
        pt -= 0.25;
    }
    return min;
}

/** Relleno interior de una celda. */
const cellPad = (ctx: Ctx) => ctx.grid.u * 0.55;

interface SheetRow {
    ex: PrintExerciseRow;
    index: number;
    /** Alto natural: lo que pide su contenido, nunca menos que el mínimo. */
    height: number;
    nameLines: string[];
    noteLines: string[];
}

function measureSheetRow(ctx: Ctx, ex: PrintExerciseRow, index: number, geom: SheetCol[]): SheetRow {
    const { doc, grid, theme } = ctx;
    const pad = cellPad(ctx);
    const nameCol = geom.find(g => g.col.key === 'name') ?? geom[0];
    const textW = Math.max(grid.u * 4, nameCol.w - pad * 2);

    font(ctx, 'bold', 10.5);
    const nameLines = doc.splitTextToSize(ex.name, textW) as string[];

    font(ctx, 'normal', 7.5);
    const noteLines = theme.layout.showNotes && ex.notes?.trim()
        ? (doc.splitTextToSize(ex.notes.trim(), textW) as string[])
        : [];

    let h = pad * 2 + nameLines.length * grid.u * 1.15;
    if (ex.variant?.trim()) h += grid.u * 1;
    if (noteLines.length > 0) h += grid.u * 0.3 + noteLines.length * grid.u * 0.9;

    return {
        ex,
        index,
        height: Math.max(theme.sheet.rowUnits * grid.u, h),
        nameLines,
        noteLines,
    };
}

/** La banda de rótulos de la tabla. Devuelve su alto. */
function drawTableHead(ctx: Ctx, y: number, geom: SheetCol[]): number {
    const { doc, grid, theme } = ctx;
    const h = grid.u * 2.2;
    const pad = cellPad(ctx);

    geom.forEach(({ col, x, w }) => {
        const label = headingCase(ctx, col.label?.trim() || '');
        if (!label) return;
        const maxW = Math.max(grid.u, w - pad * 2);
        const pt = fitSize(ctx, label, 'bold', 10, maxW);
        font(ctx, 'bold', pt);
        ink(ctx, theme.palette.ink);
        doc.text(
            ellipsize(doc, label, ctx.size(pt), maxW),
            x + w / 2,
            y + h / 2 + grid.u * 0.35,
            { align: 'center' }
        );
    });

    return h;
}

/**
 * Una fila.
 *
 * `height` no es el alto medido sino el ASIGNADO: cuando el día cabe en una
 * hoja, todas las filas reciben el mismo y la tabla llena la página, que es
 * como se ve la plantilla de papel. Ver `drawSheetDay`.
 */
function drawSheetRow(ctx: Ctx, row: SheetRow, y: number, height: number, geom: SheetCol[]) {
    const { doc, grid, theme } = ctx;
    const { palette } = theme;
    const pad = cellPad(ctx);

    if (theme.layout.zebra && row.index % 2 === 1) {
        fill(ctx, palette.panel);
        doc.rect(grid.margin.left, y, grid.content, height, 'F');
    }

    // La primera línea base de la fila. Todas las celdas comparten esta
    // altura —el nombre y las cuatro cifras— para que la fila se lea como
    // una sola línea y no como cinco textos sueltos que casualmente coinciden.
    const baseline = y + pad + grid.u * 0.95;

    geom.forEach(({ col, x, w }) => {
        const maxW = Math.max(grid.u, w - pad * 2);

        if (col.key === 'name') {
            let ty = baseline;

            font(ctx, 'bold', 10.5);
            ink(ctx, palette.ink);
            row.nameLines.forEach((line, i) => {
                doc.text(line, x + pad, ty + i * grid.u * 1.15);
            });
            ty += row.nameLines.length * grid.u * 1.15;

            // LA VARIANTE, en el acento. No es decoración: una banca con
            // pausa de cuatro segundos NO es una banca, y confundirlas
            // invalida la sesión.
            if (row.ex.variant?.trim()) {
                font(ctx, 'bold', 7.5);
                ink(ctx, palette.accent);
                doc.text(ellipsize(doc, row.ex.variant.trim(), ctx.size(7.5), maxW), x + pad, ty);
                ty += grid.u * 1;
            }

            if (row.noteLines.length > 0) {
                ty += grid.u * 0.3;
                font(ctx, 'normal', 7.5);
                ink(ctx, palette.muted);
                row.noteLines.forEach((line, i) => {
                    doc.text(line, x + pad, ty + i * grid.u * 0.9);
                });
            }
            return;
        }

        const value = cellValue(row.ex, col.key);
        if (!value) return;

        const pt = fitSize(ctx, value, 'bold', 11, maxW);
        font(ctx, 'bold', pt);
        ink(ctx, palette.ink);
        doc.text(ellipsize(doc, value, ctx.size(pt), maxW), x + w / 2, baseline, { align: 'center' });
    });
}

/**
 * Cierra la rejilla de la página: el marco y las líneas verticales.
 *
 * Se pinta AL FINAL y de un tirón, no celda a celda, porque una vertical
 * dibujada por trozos —uno por fila— sale con costuras en pantalla: cada
 * segmento redondea sus extremos a su manera y la línea tiembla. De paso,
 * las horizontales interiores llegan aquí con su Y ya conocida.
 */
function closeTableFrame(
    ctx: Ctx,
    top: number,
    bottom: number,
    rules: number[],
    geom: SheetCol[],
    /** Hasta dónde llegan las verticales. Por defecto, hasta el fondo. */
    verticalsTo = bottom,
) {
    const { doc, grid, theme } = ctx;
    stroke(ctx, theme.palette.line, theme.sheet.rule);

    doc.rect(grid.margin.left, top, grid.content, bottom - top, 'S');
    rules.forEach(y => doc.line(grid.margin.left, y, grid.margin.left + grid.content, y));
    geom.slice(1).forEach(({ x }) => doc.line(x, top, x, verticalsTo));
}

// ---------------------------------------------------------------------
// LAS CAJAS DE ABAJO
// ---------------------------------------------------------------------

/**
 * El texto libre del día, en el orden en que sirve.
 *
 * Consideraciones primero y calentamiento después: lo primero se lee antes
 * de decidir nada, lo segundo se hace con el cronómetro ya en marcha.
 */
function notesBoxText(day: PrintDay): string {
    return [day.extras?.trim(), day.warmup?.trim()].filter(Boolean).join('\n\n');
}

/** Alto que pide la caja de indicaciones para su contenido. */
function measureNotesBox(ctx: Ctx, text: string): { lines: string[]; height: number } {
    const { grid } = ctx;
    const pad = grid.u * 0.8;
    font(ctx, 'normal', 9);
    const lines = text ? (ctx.doc.splitTextToSize(text, grid.content - pad * 2) as string[]) : [];
    // El mínimo no es un capricho de maquetación: la caja se imprime y encima
    // se escribe a mano. Una caja ajustada al texto no deja sitio para eso.
    return { lines, height: Math.max(grid.u * 7, pad * 2 + lines.length * grid.u * 1.05) };
}

function drawNotesBox(ctx: Ctx, text: string, y: number, height: number): number {
    const { doc, grid, theme } = ctx;
    const pad = grid.u * 0.8;
    const label = theme.sheet.notesBox.label?.trim();

    let top = y;
    if (label) {
        font(ctx, 'bold', 8);
        ink(ctx, theme.palette.ink);
        doc.text(headingCase(ctx, label), grid.margin.left, top + grid.u * 0.8);
        top += grid.u * 1.5;
    }

    stroke(ctx, theme.palette.line, theme.sheet.rule);
    doc.rect(grid.margin.left, top, grid.content, height, 'S');

    if (text) {
        const { lines } = measureNotesBox(ctx, text);
        font(ctx, 'normal', 9);
        ink(ctx, theme.palette.ink);
        lines.forEach((line, i) => {
            doc.text(line, grid.margin.left + pad, top + pad + grid.u * 0.75 + i * grid.u * 1.05);
        });
    }

    return top + height;
}

/** Alto del rótulo de la caja de indicaciones, si lo lleva. */
const notesLabelHeight = (ctx: Ctx) =>
    ctx.theme.sheet.notesBox.label?.trim() ? ctx.grid.u * 1.5 : 0;

const footerBoxHeight = (ctx: Ctx) => ctx.grid.u * 3.6;

/**
 * El pie, enmarcado, al fondo de cada hoja.
 *
 * Va en TODAS las páginas, también en la segunda de un día largo: una hoja
 * suelta encima del banco tiene que decir de quién es y de qué semana sin
 * depender de ninguna otra.
 */
function drawSheetFooterBox(ctx: Ctx, page: number, total: number) {
    const { doc, grid, theme, week } = ctx;
    if (!theme.sheet.footerBox.show) return;

    const h = footerBoxHeight(ctx);
    const y = grid.page.h - grid.margin.bottom - h;
    const pad = grid.u * 0.7;

    stroke(ctx, theme.palette.line, theme.sheet.rule);
    doc.rect(grid.margin.left, y, grid.content, h, 'S');

    let textY = y + h / 2 + grid.u * 0.3;
    const label = theme.sheet.footerBox.label?.trim();
    if (label) {
        font(ctx, 'bold', 7);
        ink(ctx, theme.palette.muted);
        doc.text(headingCase(ctx, label), grid.margin.left + pad, y + grid.u * 1);
        textY = y + h - pad - grid.u * 0.2;
    }

    const sign = theme.footer.text?.trim() || theme.header.title?.trim() || 'ANVIL STRENGTH';
    font(ctx, 'bold', 7.5);
    ink(ctx, theme.palette.muted);
    doc.text(headingCase(ctx, sign), grid.margin.left + pad, textY);

    font(ctx, 'normal', 7.5);
    if (week.dateRange) {
        doc.text(week.dateRange, grid.page.w / 2, textY, { align: 'center' });
    }
    if (theme.footer.showPageNumbers) {
        doc.text(
            `${page} / ${total}`,
            grid.margin.left + grid.content - pad,
            textY,
            { align: 'right' }
        );
    }
}

// ---------------------------------------------------------------------
// CABECERA DE LA HOJA
// ---------------------------------------------------------------------

/**
 * Un campo con su línea: "NOMBRE: ____________".
 *
 * La línea se dibuja SIEMPRE, aunque el valor ya venga escrito. Es lo que
 * hace que el documento generado y el impreso en blanco sean el mismo
 * documento, y deja sitio para tachar y corregir a boli, que es lo que
 * termina pasando con el nombre de un bloque.
 */
function drawSheetField(ctx: Ctx, label: string, value: string, x: number, w: number, y: number) {
    const { doc, grid, theme } = ctx;
    const text = label?.trim() ? `${headingCase(ctx, label.trim())}:` : '';

    font(ctx, 'bold', 9.5);
    ink(ctx, theme.palette.ink);
    let offset = 0;
    if (text) {
        doc.text(text, x, y + grid.u * 0.9);
        offset = widthOf(doc, text, ctx.size(9.5)) + grid.u * 0.5;
    }

    if (value) {
        // Encoger antes que recortar: "Bloque de fuerza · Semana 3 ·
        // Acumulación" no cabe a 9,5 pt en media línea, y cortarlo en
        // "Acumu…" deja al atleta sin saber en qué fase está. A 7 pt entra.
        const pt = fitSize(ctx, value, 'normal', 9.5, w - offset, 7);
        font(ctx, 'normal', pt);
        doc.text(ellipsize(doc, value, ctx.size(pt), w - offset), x + offset, y + grid.u * 0.9);
    }

    stroke(ctx, theme.palette.line, ctx.theme.sheet.rule * 0.8);
    doc.line(x + offset, y + grid.u * 1.3, x + w, y + grid.u * 1.3);
}

/** La marca arriba, y debajo los campos del día. Devuelve la Y de la tabla. */
function drawSheetHeader(ctx: Ctx, day: PrintDay, continued: boolean): number {
    const { doc, grid, theme, week } = ctx;
    const { palette, header, sheet } = theme;
    const title = header.title?.trim() || 'ANVIL STRENGTH';
    const logo = header.showLogo ? header.logoDataUrl : null;
    let y = grid.margin.top;

    if (header.style === 'bar') {
        const barH = grid.u * 3.5;
        fill(ctx, palette.accent);
        doc.rect(0, 0, grid.page.w, barH, 'F');

        let x = grid.margin.left;
        if (logo) {
            const s = barH - grid.u * 1.4;
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
            doc.text(header.subtitle.trim(), grid.page.w - grid.margin.right, barH / 2 + grid.u * 0.35, { align: 'right' });
        }
        y = barH + grid.u * 1.8;
    } else if (header.style === 'stacked') {
        // El logotipo presidiendo la página, centrado. El ancho sale de la
        // proporción REAL de la imagen: forzar un cuadrado deforma cualquier
        // logotipo que no lo sea, y casi ninguno lo es.
        const h = header.logoHeight && header.logoHeight > 0 ? header.logoHeight : grid.u * 4.6;
        let drawn = false;
        if (logo) {
            try {
                const props = doc.getImageProperties(logo);
                const ratio = props.width && props.height ? props.width / props.height : 1;
                const w = Math.min(grid.content * 0.6, h * ratio);
                doc.addImage(logo, x0(grid.page.w, w), y, w, h, undefined, 'FAST');
                y += h + grid.u * 0.9;
                drawn = true;
            } catch { /* ídem */ }
        } else if (header.showLogo && anvilWidth(h) <= grid.content * 0.6) {
            drawAnvilMark(ctx, grid.page.w / 2, y, h);
            y += h + grid.u * 0.9;
            drawn = true;
        }
        if (!drawn) {
            font(ctx, 'bold', 13);
            ink(ctx, palette.ink);
            doc.text(headingCase(ctx, title), grid.page.w / 2, y + grid.u * 1.1, { align: 'center' });
            y += grid.u * 2.2;
        }
        if (header.subtitle?.trim()) {
            font(ctx, 'normal', 8);
            ink(ctx, palette.muted);
            doc.text(header.subtitle.trim(), grid.page.w / 2, y + grid.u * 0.5, { align: 'center' });
            y += grid.u * 1.3;
        }
    } else {
        font(ctx, 'bold', 8);
        ink(ctx, palette.muted);
        doc.text(headingCase(ctx, title), grid.margin.left, y + grid.u * 0.6);
        if (header.subtitle?.trim()) {
            font(ctx, 'normal', 7.5);
            doc.text(header.subtitle.trim(), grid.page.w - grid.margin.right, y + grid.u * 0.6, { align: 'right' });
        }
        y += grid.u * 1.8;
    }

    // DÍA: LUNES
    const dayName = continued ? `${day.title} (cont.)` : day.title;
    const dayText = sheet.dayLabel?.trim()
        ? `${headingCase(ctx, sheet.dayLabel.trim())}: ${headingCase(ctx, dayName)}`
        : headingCase(ctx, dayName);

    font(ctx, 'bold', 13);
    ink(ctx, palette.ink);
    doc.text(ellipsize(doc, dayText, ctx.size(13), grid.content * 0.7), grid.margin.left, y + grid.u * 1.1);

    if (day.date) {
        font(ctx, 'normal', 8.5);
        ink(ctx, palette.muted);
        doc.text(day.date, grid.margin.left + grid.content, y + grid.u * 1.1, { align: 'right' });
    }
    y += grid.u * 2.3;

    // NOMBRE / INFORMACIÓN BLOQUE
    const hasAthlete = !!sheet.athleteLabel?.trim() || !!week.athleteName;
    const hasBlock = !!sheet.blockLabel?.trim() || !!week.blockName;
    if (hasAthlete || hasBlock) {
        const gap = grid.u * 2;
        const blockInfo = [week.blockName, week.weekLabel].filter(Boolean).join(' · ');

        if (hasAthlete && hasBlock) {
            // El nombre se lleva algo menos de la mitad: "INFORMACIÓN BLOQUE"
            // es un rótulo largo y, a partes iguales, su línea se quedaba en
            // dos centímetros escasos.
            const nameW = grid.content * 0.42;
            drawSheetField(ctx, sheet.athleteLabel, week.athleteName, grid.margin.left, nameW, y);
            drawSheetField(ctx, sheet.blockLabel, blockInfo, grid.margin.left + nameW + gap, grid.content - nameW - gap, y);
        } else if (hasAthlete) {
            drawSheetField(ctx, sheet.athleteLabel, week.athleteName, grid.margin.left, grid.content, y);
        } else {
            drawSheetField(ctx, sheet.blockLabel, blockInfo, grid.margin.left, grid.content, y);
        }
        y += grid.u * 2.4;
    }

    return y;
}

/** X para centrar algo de ancho `w` en una página de ancho `pageW`. */
const x0 = (pageW: number, w: number) => (pageW - w) / 2;

/**
 * Holgura al decidir un salto de página, en milímetros.
 *
 * Cuando las filas se estiran, el alto que se les reparte es EXACTAMENTE el
 * hueco que queda, así que la última pieza termina justo en el límite. En
 * decimales binarios "justo" sale a veces un 10⁻¹³ por encima, y sin esta
 * holgura la caja de indicaciones se iba sola a una segunda hoja vacía por
 * una diezmilmillonésima de milímetro.
 */
const FIT_EPSILON = 0.01;

/** Y por debajo de la cual ya no cabe nada: ahí empieza el recuadro del pie. */
function sheetLimit(ctx: Ctx): number {
    const reserved = ctx.theme.sheet.footerBox.show
        ? footerBoxHeight(ctx) + ctx.grid.u * 1.2
        : 0;
    return ctx.grid.page.h - ctx.grid.margin.bottom - reserved;
}

/**
 * UN DÍA, EN UNA HOJA.
 *
 * EL REPARTO DEL ALTO es lo único delicado de aquí. Una tabla que termina a
 * media página deja la hoja con pinta de recortada, y una plantilla de papel
 * no se ve nunca así: sus filas llegan hasta abajo. Así que cuando el día
 * entero cabe en una página, las filas NO se quedan con su alto natural sino
 * que se reparten el sitio disponible a partes iguales —con un tope, para
 * que un día de un solo ejercicio no imprima una fila de veinte
 * centímetros— y la caja de indicaciones se queda con TODO lo que sobre.
 *
 * Cuando no cabe, se acabaron los estiramientos: cada fila mide lo suyo y la
 * tabla salta de página cerrando el marco donde toca.
 */
function drawSheetDay(ctx: Ctx, day: PrintDay) {
    const { doc, grid, theme } = ctx;
    const geom = sheetGeometry(ctx);
    const limit = sheetLimit(ctx);

    let y = drawSheetHeader(ctx, day, false);
    let tableTop = y;
    let rules: number[] = [];

    const headH = drawTableHead(ctx, y, geom);
    y += headH;
    rules.push(y);

    const rows = day.exercises.map((ex, i) => measureSheetRow(ctx, ex, i, geom));
    const text = notesBoxText(day);
    const showNotesBox = theme.sheet.notesBox.show;
    const notesMin = showNotesBox ? measureNotesBox(ctx, text).height + notesLabelHeight(ctx) + grid.u * 1.4 : 0;

    // ¿Cabe todo el día en esta hoja?
    const natural = rows.reduce((sum, r) => sum + r.height, 0);
    const capacity = limit - y;
    const fits = natural + notesMin <= capacity;

    /** El alto que se le asigna a cada fila. Ver el comentario de arriba. */
    const heights = rows.map(r => r.height);
    if (fits && theme.sheet.stretchRows && rows.length > 0) {
        const target = (capacity - notesMin) / rows.length;
        const cap = grid.u * 11;
        for (let i = 0; i < heights.length; i++) {
            heights[i] = Math.max(heights[i], Math.min(target, cap));
        }
    }

    const nextPage = () => {
        closeTableFrame(ctx, tableTop, y, rules.slice(0, -1), geom);
        doc.addPage([grid.page.w, grid.page.h], 'portrait');
        paintSurface(ctx);
        y = drawSheetHeader(ctx, day, true);
        tableTop = y;
        rules = [];
        y += drawTableHead(ctx, y, geom);
        rules.push(y);
    };

    // Hasta dónde bajan las verticales. En un día de descanso se quedan en
    // la cabecera: el aviso va CENTRADO en la tabla, y con las columnas
    // dibujadas le caería un filete por encima justo a mitad de palabra.
    let verticalsTo = 0;

    if (rows.length === 0) {
        // Día de descanso: la tabla existe igual, con una sola fila que lo
        // dice. Quitarla dejaría la hoja sin su pieza principal y el atleta
        // se preguntaría si falta algo.
        verticalsTo = y;
        const h = Math.max(theme.sheet.rowUnits * grid.u, grid.u * 6);
        font(ctx, 'italic', 11);
        ink(ctx, theme.palette.muted);
        doc.text('Día de descanso', grid.page.w / 2, y + h / 2 + grid.u * 0.3, { align: 'center' });
        y += h;
        rules.push(y);
    } else {
        rows.forEach((row, i) => {
            if (y + heights[i] > limit + FIT_EPSILON) nextPage();
            drawSheetRow(ctx, row, y, heights[i], geom);
            y += heights[i];
            rules.push(y);
        });
    }

    // La última horizontal es el canto inferior del marco: la dibuja
    // `closeTableFrame` con el rectángulo, así que aquí sobra.
    closeTableFrame(ctx, tableTop, y, rules.slice(0, -1), geom, verticalsTo || y);
    y += grid.u * 1.4;

    if (!showNotesBox) return;

    const measured = measureNotesBox(ctx, text);
    const labelH = notesLabelHeight(ctx);
    if (y + labelH + measured.height > limit + FIT_EPSILON) {
        doc.addPage([grid.page.w, grid.page.h], 'portrait');
        paintSurface(ctx);
        y = drawSheetHeader(ctx, day, true);
    }

    // La caja se queda con TODO el hueco que sobra hasta el pie. No es solo
    // estética de página llena: es la caja que se rellena a mano, y en la
    // última hoja de un día largo —donde suelen quedar dos filas y media
    // página en blanco— es justo donde hay sitio para escribir.
    const height = theme.sheet.stretchRows
        ? Math.max(measured.height, limit - y - labelH)
        : measured.height;

    drawNotesBox(ctx, text, y, height);
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

    // LA HOJA DE TABLA. Un día por hoja, igual que la plantilla de papel.
    if (theme.layout.sheet === 'table') {
        days.forEach((day, dayIndex) => {
            if (dayIndex > 0) doc.addPage([grid.page.w, grid.page.h], 'portrait');
            paintSurface(ctx);
            drawSheetDay(ctx, day);
        });

        const pages = doc.getNumberOfPages();
        for (let page = 1; page <= pages; page++) {
            doc.setPage(page);
            drawSheetFooterBox(ctx, page, pages);
        }
        return doc;
    }

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
