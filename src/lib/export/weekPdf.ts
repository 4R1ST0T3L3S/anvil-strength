/**
 * EXPORTAR LA SEMANA DE ENTRENAMIENTO A PDF
 * =====================================================================
 * Genera y DESCARGA un .pdf. Una página por día, una fila por ejercicio,
 * columnas fijas: ejercicio, series, repeticiones, descanso e intensidad.
 *
 * POR QUÉ YA NO SE IMPRIME
 *
 * Antes esto abría una ventana con la hoja maquetada en HTML y lanzaba el
 * diálogo de impresión, confiando en que el usuario eligiera "Guardar como
 * PDF". Tres problemas, y los tres se daban a diario:
 *
 *   1. En móvil —que es donde el coach revisa la semana— el diálogo de
 *      impresión de Android e iOS no siempre ofrece guardar, y cuando lo
 *      ofrece mete sus propias cabeceras y márgenes.
 *   2. Cualquier bloqueador de ventanas emergentes se lo comía en silencio.
 *   3. El resultado dependía del navegador: el mismo bloque salía con
 *      distinto tamaño de papel y distinto salto de página en cada máquina.
 *
 * `jspdf` ya estaba en las dependencias del proyecto (lo usa la exportación
 * de nutrición), así que el PDF se compone aquí y se descarga con un nombre
 * predecible. Lo que se ve es lo que hay, en cualquier dispositivo.
 */

import { jsPDF } from 'jspdf';
import type { TrainingSet, TargetMetric } from '../../types/training';
import { TARGET_METRICS, weekdayLabel } from '../../types/training';

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
// MAQUETA
// =====================================================================
// Todo en milímetros sobre A4 vertical (210 x 297).

const PAGE = { w: 210, h: 297 };
const MARGIN = { top: 16, right: 14, bottom: 16, left: 14 };
const CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right; // 182

/**
 * Anchos de columna.
 *
 * El nombre del ejercicio se lleva algo menos de la mitad porque es el único
 * que puede necesitar dos renglones; las otras cuatro son cifras cortas y
 * centradas, y darles más ancho solo separa el dato de su cabecera.
 */
const COL = {
    name: 78,
    series: 20,
    reps: 28,
    rest: 26,
    intensity: 30,
};

const X = {
    name: MARGIN.left,
    series: MARGIN.left + COL.name,
    reps: MARGIN.left + COL.name + COL.series,
    rest: MARGIN.left + COL.name + COL.series + COL.reps,
    intensity: MARGIN.left + COL.name + COL.series + COL.reps + COL.rest,
};

const INK = {
    strong: [17, 17, 17] as const,
    muted: [90, 90, 90] as const,
    faint: [140, 140, 140] as const,
    rule: [205, 205, 205] as const,
    zebra: [246, 246, 246] as const,
    brand: [200, 30, 30] as const,
};

/** Ancho de una cadena en la fuente y tamaño actuales, en mm. */
function widthOf(doc: jsPDF, text: string, size: number): number {
    return (doc.getStringUnitWidth(text) * size) / doc.internal.scaleFactor;
}

/** Recorta con puntos suspensivos si no cabe. Para celdas de una línea. */
function ellipsize(doc: jsPDF, text: string, size: number, maxW: number): string {
    if (widthOf(doc, text, size) <= maxW) return text;
    let cut = text;
    while (cut.length > 1 && widthOf(doc, `${cut}...`, size) > maxW) {
        cut = cut.slice(0, -1);
    }
    return `${cut}...`;
}

function setInk(doc: jsPDF, color: readonly [number, number, number]) {
    doc.setTextColor(color[0], color[1], color[2]);
}

/**
 * Cabecera de página.
 *
 * Se repite en cada hoja —también en la segunda de un día muy largo— porque
 * una hoja suelta encima del banco del gimnasio tiene que decir de quién es y
 * de qué día, sin depender de la anterior.
 */
function drawHeader(
    doc: jsPDF,
    week: PrintWeek,
    day: PrintDay,
    continued: boolean
): number {
    let y = MARGIN.top;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    setInk(doc, INK.strong);
    const title = continued ? `${day.title.toUpperCase()} (CONT.)` : day.title.toUpperCase();
    doc.text(ellipsize(doc, title, 17, CONTENT_W - 62), MARGIN.left, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setInk(doc, INK.muted);
    doc.text(week.athleteName, PAGE.w - MARGIN.right, y + 1.5, { align: 'right' });
    const sub = [week.blockName, week.weekLabel].filter(Boolean).join(' - ');
    doc.text(ellipsize(doc, sub, 8.5, 62), PAGE.w - MARGIN.right, y + 5.5, { align: 'right' });

    y += 7;

    if (day.date) {
        doc.setFontSize(9);
        setInk(doc, INK.faint);
        doc.text(day.date, MARGIN.left, y + 3.5);
        y += 4;
    }

    y += 3;
    doc.setDrawColor(INK.strong[0], INK.strong[1], INK.strong[2]);
    doc.setLineWidth(0.6);
    doc.line(MARGIN.left, y, PAGE.w - MARGIN.right, y);

    return y + 7;
}

/** Fila de cabecera de la tabla. Devuelve la Y de la primera fila de datos. */
function drawTableHead(doc: jsPDF, y: number): number {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setInk(doc, INK.muted);

    doc.text('EJERCICIO', X.name, y);
    doc.text('SERIES', X.series + COL.series / 2, y, { align: 'center' });
    doc.text('REPS', X.reps + COL.reps / 2, y, { align: 'center' });
    doc.text('DESCANSO', X.rest + COL.rest / 2, y, { align: 'center' });
    doc.text('INTENSIDAD', X.intensity + COL.intensity / 2, y, { align: 'center' });

    doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2]);
    doc.setLineWidth(0.3);
    doc.line(MARGIN.left, y + 2.2, PAGE.w - MARGIN.right, y + 2.2);

    return y + 7.5;
}

/** Pie con la marca, el rango de fechas y el número de página. */
function drawFooter(doc: jsPDF, week: PrintWeek, page: number, total: number) {
    const y = PAGE.h - MARGIN.bottom + 6;

    doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2]);
    doc.setLineWidth(0.2);
    doc.line(MARGIN.left, y - 4, PAGE.w - MARGIN.right, y - 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setInk(doc, INK.brand);
    doc.text('ANVIL STRENGTH', MARGIN.left, y);

    doc.setFont('helvetica', 'normal');
    setInk(doc, INK.faint);
    if (week.dateRange) {
        doc.text(week.dateRange, PAGE.w / 2, y, { align: 'center' });
    }
    doc.text(`${page} / ${total}`, PAGE.w - MARGIN.right, y, { align: 'right' });
}

/**
 * Apéndice en caja gris: calentamiento antes de la tabla, extras después.
 *
 * Son texto libre del coach, así que se envuelven y pueden ocupar lo que
 * haga falta. Devuelve la Y a la que sigue el documento.
 */
function drawAppendix(
    doc: jsPDF,
    label: string,
    body: string,
    y: number
): number {
    const padding = 3.5;
    const innerW = CONTENT_W - padding * 2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(body.trim(), innerW) as string[];

    const boxH = padding * 2 + 4.5 + lines.length * 4.2;

    doc.setFillColor(INK.zebra[0], INK.zebra[1], INK.zebra[2]);
    doc.roundedRect(MARGIN.left, y, CONTENT_W, boxH, 1.5, 1.5, 'F');

    // Filete de color a la izquierda: distingue el apéndice de la tabla de un
    // vistazo sin necesidad de leer el rótulo.
    doc.setFillColor(INK.brand[0], INK.brand[1], INK.brand[2]);
    doc.rect(MARGIN.left, y, 1.1, boxH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setInk(doc, INK.brand);
    doc.text(label.toUpperCase(), MARGIN.left + padding, y + padding + 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setInk(doc, INK.strong);
    lines.forEach((line, i) => {
        doc.text(line, MARGIN.left + padding, y + padding + 6.8 + i * 4.2);
    });

    return y + boxH + 5;
}

/**
 * Construye el documento.
 *
 * El salto de página se decide midiendo cada fila ANTES de pintarla: una fila
 * con nota de coach puede ocupar el doble, y cortarla a mitad de renglón es el
 * defecto clásico de estas exportaciones.
 */
export function buildWeekPdf(week: PrintWeek): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const days = week.days.length > 0 ? week.days : [{ title: 'Sin días', exercises: [] }];
    const bottomLimit = PAGE.h - MARGIN.bottom - 4;

    days.forEach((day, dayIndex) => {
        if (dayIndex > 0) doc.addPage();

        let continued = false;
        let y = drawHeader(doc, week, day, continued);

        const newPage = () => {
            doc.addPage();
            continued = true;
            y = drawHeader(doc, week, day, continued);
        };

        // ---- Calentamiento (antes de la tabla: es lo primero que se hace) ----
        if (day.warmup?.trim()) {
            y = drawAppendix(doc, 'Calentamiento', day.warmup, y);
        }

        if (day.exercises.length === 0) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(11);
            setInk(doc, INK.faint);
            doc.text('Día de descanso', PAGE.w / 2, y + 14, { align: 'center' });
            y += 24;
        } else {
            y = drawTableHead(doc, y);

            day.exercises.forEach((ex, rowIndex) => {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9.5);
                const nameLines = doc.splitTextToSize(ex.name, COL.name - 4) as string[];

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                const noteLines = ex.notes?.trim()
                    ? (doc.splitTextToSize(ex.notes.trim(), COL.name - 4) as string[])
                    : [];

                const rowH = Math.max(
                    9,
                    nameLines.length * 4.4 + noteLines.length * 3.6 + 4.4
                );

                if (y + rowH > bottomLimit) {
                    newPage();
                    y = drawTableHead(doc, y);
                }

                if (rowIndex % 2 === 1) {
                    doc.setFillColor(INK.zebra[0], INK.zebra[1], INK.zebra[2]);
                    doc.rect(MARGIN.left, y - 4.2, CONTENT_W, rowH, 'F');
                }

                // Nombre (+ nota debajo, en gris y más pequeña)
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9.5);
                setInk(doc, INK.strong);
                nameLines.forEach((line, i) => doc.text(line, X.name, y + i * 4.4));

                if (noteLines.length > 0) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    setInk(doc, INK.muted);
                    noteLines.forEach((line, i) =>
                        doc.text(line, X.name, y + nameLines.length * 4.4 + i * 3.6)
                    );
                }

                // Cifras. Centradas y en la línea del NOMBRE, no del bloque
                // entero: si la nota ocupa tres renglones, el "4" tiene que
                // seguir al lado del ejercicio y no flotando en medio.
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                setInk(doc, INK.strong);
                doc.text(ex.series || '-', X.series + COL.series / 2, y, { align: 'center' });
                doc.text(ex.reps || '-', X.reps + COL.reps / 2, y, { align: 'center' });
                doc.text(ex.rest || '-', X.rest + COL.rest / 2, y, { align: 'center' });
                doc.text(
                    ellipsize(doc, ex.intensity || '-', 9.5, COL.intensity - 2),
                    X.intensity + COL.intensity / 2,
                    y,
                    { align: 'center' }
                );

                y += rowH;

                doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2]);
                doc.setLineWidth(0.15);
                doc.line(MARGIN.left, y - 4.2, PAGE.w - MARGIN.right, y - 4.2);
            });

            y += 4;
        }

        // ---- Extras (al final: es trabajo de después de la sesión) ----
        if (day.extras?.trim()) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const probe = doc.splitTextToSize(day.extras.trim(), CONTENT_W - 7) as string[];
            const needed = 7 + 4.5 + probe.length * 4.2;
            if (y + needed > bottomLimit) newPage();
            y = drawAppendix(doc, 'Extras', day.extras, y);
        }
    });

    // Los pies se pintan al final porque hasta aquí no se sabe el total de
    // páginas: los días largos añaden hojas sobre la marcha.
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page++) {
        doc.setPage(page);
        drawFooter(doc, week, page, total);
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
 * Devuelve el nombre del archivo para poder decirlo en el aviso: en escritorio
 * la descarga es un renglón discreto abajo del navegador y sin el nombre el
 * coach no sabe si ha pasado algo.
 */
export function downloadWeekPdf(week: PrintWeek): string {
    const doc = buildWeekPdf(week);
    const filename = `${slug(week.athleteName)}-${slug(week.weekLabel)}.pdf`;
    doc.save(filename);
    return filename;
}

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
 * UNA fila por ejercicio: las series de un mismo ejercicio se agregan en vez
 * de ocupar una fila cada una. Cuando todas coinciden se escribe el valor una
 * vez ("4" series de "6"); cuando no —una pirámide, por ejemplo— se listan en
 * orden ("6, 5, 4"), que es como lo lee un atleta.
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

            const name = [ex.exercise?.name ?? 'Ejercicio', ex.variant_name]
                .filter(Boolean)
                .join(' - ');

            return {
                name,
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
