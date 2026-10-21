import { jsPDF } from 'jspdf';
import type { FoodItem, Meal, NutritionPlan } from '../../types/nutrition';
import { diasDelPlan, gramosEnDia, totalesDeComida, totalesDelDia } from './dias';
import { agruparAlimentos, macrosDe, type Macros } from './macros';

/**
 * EL PLAN NUTRICIONAL EN PDF
 * =====================================================================
 *
 * ANTES: una captura (html2canvas) de una vista previa pegada como imagen
 * en el PDF. El texto no se podía seleccionar ni buscar, pesaba megas, se
 * veía borroso al ampliar y las páginas se cortaban por donde caía —a veces
 * por la mitad de una fila—. Y salían emojis que la mitad de los visores no
 * pintan.
 *
 * AHORA: un PDF de verdad, escrito con texto vectorial. Tablas que, si no
 * caben, siguen en la página siguiente repitiendo la cabecera; ninguna
 * comida empieza a dos líneas del final; pie con número de página; y un
 * bloque por cada tipo de día del plan (entreno, descanso…), con su
 * objetivo frente a lo planificado.
 *
 * Las fuentes estándar de PDF (Helvetica) solo cubren el juego WinAnsi: las
 * tildes y la ñ sí; el signo menos (−) o los emojis no. Por eso todo lo que
 * se escribe pasa por `limpiar()`.
 */

export interface OpcionesPdf {
    /** Días a incluir (`null` = día base). Por defecto, todos. */
    dias?: (string | null)[];
    alternativas?: boolean;
    atleta?: string | null;
    nutricionista?: string | null;
    club?: string;
    /** Color de acento, RGB 0-255. */
    acento?: [number, number, number];
}

type RGB = [number, number, number];

const TINTA: RGB = [29, 29, 31];
const TENUE: RGB = [110, 110, 115];
const LINEA: RGB = [226, 226, 230];
const FONDO: RGB = [246, 246, 248];
const ROJO: RGB = [207, 38, 46];
const COLOR: Record<keyof Macros, RGB> = {
    kcal: TINTA,
    proteina: [16, 104, 186],
    carbos: [168, 112, 0],
    grasas: [196, 86, 20],
};

const A4 = { ancho: 210, alto: 297 };
const MARGEN = 14;
const ANCHO = A4.ancho - MARGEN * 2;
// Columnas de la tabla de alimentos (mm). Suman ANCHO.
const COL = { alimento: 94, cantidad: 20, kcal: 18, p: 16, hc: 16, g: 18 };

const formatear = (v: number, d = 0) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d }).format(v);

/** Lo que Helvetica no sabe pintar, fuera. */
function limpiar(t: string): string {
    return t
        .replace(/\u2212/g, '-')
        .replace(/[\u2060\u200b]/g, '')
        .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, '');
}

// =====================================================================
// GEOMETRÍA Y ALTURAS DE LAS COMIDAS
// =====================================================================
// La medida previa y el dibujo comparten exactamente las mismas constantes
// y funciones de corte y cálculo de alturas, para que nunca se desincronicen
// si alguien cambia fuentes, márgenes o espaciados.
export const ALTO_BARRA_COMIDA = 13;
export const ALTO_CABECERA_TABLA = 6;
export const ALTO_SIN_ALIMENTOS = 6;
export const ESPACIADO_COMIDA = 4;

/** Líneas partidas del nombre del alimento según la tipografía y columna. */
export function lineasAlimento(doc: jsPDF, food: FoodItem, esAlt: boolean): string[] {
    const sangria = esAlt ? 6 : 2;
    doc.setFont('helvetica', esAlt ? 'normal' : 'bold');
    doc.setFontSize(9);
    const nombre = `${food.product_name}${food.brands ? ` (${food.brands})` : ''}`;
    return doc.splitTextToSize(limpiar(nombre), COL.alimento - sangria - 3) as string[];
}

/** Altura de una fila de alimento en mm. */
export function altoFilaAlimento(lineas: string[]): number {
    return Math.max(5.5, lineas.length * 4 + 1.5);
}

/** Líneas del bloque de suplementación de una comida. */
export function lineasSuplementacion(doc: jsPDF, suplementos: string[]): string[] {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    return doc.splitTextToSize(limpiar(`Suplementación: ${suplementos.join(' · ')}`), ANCHO - 4) as string[];
}

/** Altura del bloque de suplementación en mm. */
export function altoSuplementacion(lineas: string[]): number {
    return lineas.length * 4 + 1;
}

/**
 * Calcula la altura total EXACTA de una comida en mm:
 * barra superior + cabecera de tabla + todas sus filas (con idéntico corte de
 * texto que el dibujo) + suplementos + espaciado inferior.
 */
export function calcularAlturaComida(doc: jsPDF, meal: Meal, conAlternativas = true): number {
    const grupos = agruparAlimentos(meal.foods ?? []).filter((g) => g.principal.food);
    let h = ALTO_BARRA_COMIDA + ALTO_CABECERA_TABLA;

    if (grupos.length === 0) {
        h += ALTO_SIN_ALIMENTOS;
    } else {
        for (const g of grupos) {
            const filas = conAlternativas ? [g.principal, ...g.alternativas] : [g.principal];
            for (let i = 0; i < filas.length; i++) {
                const f = filas[i];
                if (!f.food) continue;
                const esAlt = i > 0;
                const lineas = lineasAlimento(doc, f.food, esAlt);
                h += altoFilaAlimento(lineas);
            }
        }
    }

    if (meal.meal_supplements?.length) {
        const lineasSup = lineasSuplementacion(doc, meal.meal_supplements);
        h += altoSuplementacion(lineasSup);
    }

    h += ESPACIADO_COMIDA;
    return h;
}

async function imagenComoDataUrl(url: string): Promise<string | null> {
    try {
        const r = await fetch(url);
        if (!r.ok) return null;
        const blob = await r.blob();
        return await new Promise((ok) => {
            const lector = new FileReader();
            lector.onload = () => ok(lector.result as string);
            lector.onerror = () => ok(null);
            lector.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

export async function generarPdfPlan(plan: NutritionPlan, opciones: OpcionesPdf = {}): Promise<jsPDF> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const acento = opciones.acento ?? ROJO;
    const club = opciones.club ?? 'Anvil Strength';
    const conAlternativas = opciones.alternativas ?? true;
    const todos = diasDelPlan(plan);
    const dias = opciones.dias ? todos.filter((d) => opciones.dias!.includes(d.id)) : todos;
    // El yunque de la marca en negro (public/logo-pdf.png, sacado del logo
    // blanco de la web): el PDF es blanco y se imprime.
    const logo = await imagenComoDataUrl('/logo-pdf.png');
    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    let y = MARGEN;
    const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const relleno = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
    const trazo = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
    const texto = (t: string, x: number, yy: number, o?: Parameters<jsPDF['text']>[3]) => doc.text(limpiar(t), x, yy, o);
    // El pie (línea + texto) ocupa los últimos 6 mm sobre el margen: el
    // contenido puede bajar hasta justo encima.
    const pie = 8;
    const limite = () => A4.alto - MARGEN - pie;

    /** Si no caben `alto` mm, página nueva. Devuelve si ha saltado. */
    const asegurar = (alto: number) => {
        if (y + alto <= limite()) return false;
        doc.addPage();
        y = MARGEN;
        return true;
    };

    // =================================================================
    // CABECERA
    // =================================================================
    relleno(acento);
    doc.rect(0, 0, A4.ancho, 4, 'F');
    y = 14;
    if (logo) {
        try { doc.addImage(logo, 'PNG', MARGEN, y - 3, 18, 11.1); } catch { /* formato raro: sin logo */ }
    }
    const xTitulo = logo ? MARGEN + 23 : MARGEN;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    color(acento);
    texto(club.toUpperCase(), xTitulo, y);
    doc.setFontSize(20);
    color(TINTA);
    texto('Plan nutricional', xTitulo, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    color(TENUE);
    const quien = [opciones.atleta ? `Para ${opciones.atleta}` : null, opciones.nutricionista ? `Pautado por ${opciones.nutricionista}` : null, fecha]
        .filter(Boolean)
        .join('  ·  ');
    texto(quien, xTitulo, y + 14);
    y += 22;

    // Bloque y etiquetas
    const etiquetas = [plan.training_block_id ? `Bloque: ${plan.training_block_id}` : null, ...(plan.tags ?? [])].filter(Boolean) as string[];
    if (etiquetas.length) {
        doc.setFontSize(8.5);
        let x = MARGEN;
        for (const e of etiquetas) {
            const w = doc.getTextWidth(limpiar(e)) + 6;
            if (x + w > MARGEN + ANCHO) { x = MARGEN; y += 7; }
            relleno(FONDO);
            doc.roundedRect(x, y - 4.2, w, 6, 3, 3, 'F');
            color(TINTA);
            texto(e, x + 3, y);
            x += w + 2;
        }
        y += 8;
    }

    // Pautas y suplementación
    const bloqueLista = (titulo: string, items: string[]) => {
        if (!items.length) return;
        asegurar(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        color(acento);
        texto(titulo.toUpperCase(), MARGEN, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        color(TINTA);
        for (const it of items) {
            const lineas = doc.splitTextToSize(limpiar(it), ANCHO - 5) as string[];
            asegurar(lineas.length * 4.6 + 1);
            texto('•', MARGEN, y);
            doc.text(lineas, MARGEN + 4, y);
            y += lineas.length * 4.6 + 0.8;
        }
        y += 3;
    };
    bloqueLista('Pautas generales', plan.general_guidelines ?? []);
    bloqueLista('Suplementación diaria', plan.global_supplements ?? []);

    // Cómo leer las alternativas: una vez, arriba, y no al final de cada día.
    const hayAlternativas = conAlternativas && (plan.meals ?? []).some((m) => agruparAlimentos(m.foods ?? []).some((g) => g.alternativas.length));
    if (hayAlternativas) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        color(TENUE);
        const nota = doc.splitTextToSize(limpiar('Las líneas con «ó» son alternativas al alimento de encima, ya en su cantidad equivalente: se come una de las dos. Los totales cuentan solo el principal.'), ANCHO) as string[];
        doc.text(nota, MARGEN, y);
        y += nota.length * 4 + 3;
    }

    // =================================================================
    // UN BLOQUE POR DÍA
    // =================================================================
    const comidas = plan.meals ?? [];
    dias.forEach((dia, iDia) => {
        if (iDia > 0) { doc.addPage(); y = MARGEN; }
        asegurar(40);

        // Título del día y objetivo frente a planificado
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        color(TINTA);
        texto(dia.nombre, MARGEN, y + 5);
        y += 10;
        const plan_ = totalesDelDia(plan, dia.id);
        const celdas: [keyof Macros, string][] = [['kcal', 'Calorías'], ['proteina', 'Proteína'], ['carbos', 'Hidratos'], ['grasas', 'Grasas']];
        const anchoCelda = (ANCHO - 6) / 4;
        celdas.forEach(([k, nombre], i) => {
            const x = MARGEN + i * (anchoCelda + 2);
            relleno(FONDO);
            doc.roundedRect(x, y, anchoCelda, 16, 2, 2, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            color(TENUE);
            texto(nombre.toUpperCase(), x + 3, y + 4.5);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            color(COLOR[k]);
            const unidad = k === 'kcal' ? ' kcal' : ' g';
            texto(`${formatear(dia.objetivo[k])}${unidad}`, x + 3, y + 11);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            color(TENUE);
            texto(`Planificado: ${formatear(plan_[k])}${unidad}`, x + 3, y + 14.5);
        });
        y += 22;

        // Comidas
        comidas.forEach((meal) => {
            const grupos = agruparAlimentos(meal.foods ?? []).filter((g) => g.principal.food);
            const tot = totalesDeComida(meal, dia.id);
            const alturaTotal = calcularAlturaComida(doc, meal, conAlternativas);
            const alturaDisponiblePagina = limite() - MARGEN;

            // Barra de cabecera de la comida (principal o repetida con "(cont.)")
            const dibujarBarraComida = (esContinuacion = false) => {
                relleno(acento);
                doc.roundedRect(MARGEN, y, ANCHO, 8, 1.5, 1.5, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                const nombre = esContinuacion ? `${meal.name} (cont.)` : meal.name;
                texto(`${nombre}${meal.time ? `  ·  ${meal.time.slice(0, 5)}` : ''}`, MARGEN + 3, y + 5.4);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                texto(
                    `${formatear(tot.kcal)} kcal  ·  ${formatear(tot.proteina)} P  ·  ${formatear(tot.carbos)} HC  ·  ${formatear(tot.grasas)} G`,
                    MARGEN + ANCHO - 3, y + 5.4, { align: 'right' }
                );
                y += ALTO_BARRA_COMIDA;
            };

            const cabeceraTabla = () => {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                color(TENUE);
                let x = MARGEN + 2;
                texto('ALIMENTO', x, y);
                x = MARGEN + COL.alimento;
                texto('CANTIDAD', x + COL.cantidad, y, { align: 'right' });
                x += COL.cantidad;
                texto('KCAL', x + COL.kcal, y, { align: 'right' }); x += COL.kcal;
                texto('P', x + COL.p, y, { align: 'right' }); x += COL.p;
                texto('HC', x + COL.hc, y, { align: 'right' }); x += COL.hc;
                texto('G', x + COL.g - 2, y, { align: 'right' });
                y += 2;
                trazo(LINEA);
                doc.setLineWidth(0.2);
                doc.line(MARGEN, y, MARGEN + ANCHO, y);
                y += 4;
            };

            // Regla de saltos:
            // 1. Si la comida cabe entera en una página limpia (alturaTotal <= alturaDisponiblePagina),
            //    NUNCA se parte: si no cabe en lo que queda de la página actual, salta a página nueva.
            // 2. Si la comida sola es más alta que una página entera, se parte fila a fila como
            //    antes, pero asegurando antes de empezar que quepan cabecera + 2 filas para no
            //    dejar una cabecera huérfana al pie de la página.
            if (alturaTotal <= alturaDisponiblePagina) {
                if (y + alturaTotal > limite()) {
                    doc.addPage();
                    y = MARGEN;
                }
            } else {
                asegurar(ALTO_BARRA_COMIDA + ALTO_CABECERA_TABLA + 2 * 6);
            }

            dibujarBarraComida(false);
            cabeceraTabla();

            if (grupos.length === 0) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                color(TENUE);
                texto('Sin alimentos', MARGEN + 2, y);
                y += ALTO_SIN_ALIMENTOS;
            }

            grupos.forEach((g) => {
                const filas = conAlternativas ? [g.principal, ...g.alternativas] : [g.principal];
                filas.forEach((f, i) => {
                    const food = f.food;
                    if (!food) return;
                    const esAlt = i > 0;
                    const gramos = gramosEnDia(f, dia.id);
                    const m = macrosDe(food, gramos);
                    const sangria = esAlt ? 6 : 2;
                    const lineas = lineasAlimento(doc, food, esAlt);
                    const alto = altoFilaAlimento(lineas);

                    // Si la fila no cabe, saltamos de página y repetimos la barra
                    // con el nombre de la comida seguido de " (cont.)" y la cabecera.
                    if (asegurar(alto)) {
                        dibujarBarraComida(true);
                        cabeceraTabla();
                    }

                    if (esAlt) {
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(9);
                        color([30, 140, 70]);
                        texto('ó', MARGEN + 2, y);
                    }
                    doc.setFont('helvetica', esAlt ? 'normal' : 'bold');
                    doc.setFontSize(9);
                    color(esAlt ? TENUE : TINTA);
                    doc.text(lineas, MARGEN + sangria, y);

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(9);
                    color(esAlt ? TENUE : TINTA);
                    let x = MARGEN + COL.alimento;
                    texto(`${formatear(gramos)} g`, x + COL.cantidad, y, { align: 'right' });
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9);
                    x += COL.cantidad;
                    color(esAlt ? TENUE : TINTA);
                    texto(formatear(m.kcal), x + COL.kcal, y, { align: 'right' }); x += COL.kcal;
                    color(esAlt ? TENUE : COLOR.proteina);
                    texto(formatear(m.proteina), x + COL.p, y, { align: 'right' }); x += COL.p;
                    color(esAlt ? TENUE : COLOR.carbos);
                    texto(formatear(m.carbos), x + COL.hc, y, { align: 'right' }); x += COL.hc;
                    color(esAlt ? TENUE : COLOR.grasas);
                    texto(formatear(m.grasas), x + COL.g - 2, y, { align: 'right' });

                    y += alto - 1.5;
                    // Línea fina entre huecos (no entre un principal y su alternativa).
                    const ultimaDelGrupo = i === filas.length - 1;
                    if (ultimaDelGrupo) {
                        trazo(LINEA);
                        doc.setLineWidth(0.15);
                        doc.line(MARGEN, y - 2.4, MARGEN + ANCHO, y - 2.4);
                    }
                    y += 1.5;
                });
            });

            if (meal.meal_supplements?.length) {
                const lineasSup = lineasSuplementacion(doc, meal.meal_supplements);
                const altoSup = altoSuplementacion(lineasSup);
                if (asegurar(altoSup)) {
                    dibujarBarraComida(true);
                }
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                color(COLOR.proteina);
                doc.text(lineasSup, MARGEN + 2, y);
                y += altoSup;
            }
            y += ESPACIADO_COMIDA;
        });

        // Sin caja de total al final: el planificado del día ya está arriba,
        // en las cuatro casillas del objetivo. Repetirlo abajo solo servía para
        // estrenar una página con una línea.

    });

    // =================================================================
    // PIE EN TODAS LAS PÁGINAS
    // =================================================================
    const paginas = doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
        doc.setPage(p);
        trazo(LINEA);
        doc.setLineWidth(0.2);
        doc.line(MARGEN, A4.alto - MARGEN - 4, MARGEN + ANCHO, A4.alto - MARGEN - 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        color(TENUE);
        texto(`${club} · Plan nutricional${opciones.atleta ? ` de ${opciones.atleta}` : ''}`, MARGEN, A4.alto - MARGEN);
        texto(`Página ${p} de ${paginas}`, MARGEN + ANCHO, A4.alto - MARGEN, { align: 'right' });
    }
    return doc;
}

export async function descargarPdfPlan(plan: NutritionPlan, opciones: OpcionesPdf = {}) {
    const doc = await generarPdfPlan(plan, opciones);
    const nombre = (opciones.atleta ?? 'atleta').trim().replace(/\s+/g, '_');
    doc.save(`Plan_nutricional_${nombre}.pdf`);
}
