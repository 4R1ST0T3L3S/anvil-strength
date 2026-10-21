import type { FoodItem, MealFood } from '../../types/nutrition';

/**
 * LOS NÚMEROS DE UN ALIMENTO, SIN FIARSE A CIEGAS DE LA ETIQUETA
 * =====================================================================
 *
 * La base de alimentos viene de Open Food Facts: etiquetas escritas a mano
 * por voluntarios. En los planes reales del club había, por ejemplo, un atún
 * al natural con 0 kcal y 16,7 g de proteína, un brócoli con 118 kcal o un
 * aguacate con 58 g de grasa y 140 kcal. Con esos datos, el total del día
 * mentía y el ajuste automático se volvía loco.
 *
 * Regla: las calorías de un alimento se CALCULAN a partir de sus macros
 * (Atwater: 4 / 4 / 9) siempre que la etiqueta no sea creíble — cuando falta,
 * cuando es cero teniendo macros, o cuando se separa de lo calculado más de
 * un 25 % y 20 kcal. Si la etiqueta es creíble, se respeta: incluye cosas
 * que los macros no (alcohol, polialcoholes, fibra).
 *
 * `dudoso` marca los alimentos cuya etiqueta no casa con sus macros, para
 * avisar en el buscador y en el editor.
 */

export interface Macros {
    kcal: number;
    proteina: number;
    carbos: number;
    grasas: number;
}

export const MACROS_CERO: Macros = { kcal: 0, proteina: 0, carbos: 0, grasas: 0 };

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Calorías por Atwater a partir de los macros por 100 g. */
export function kcalAtwater(f: Pick<FoodItem, 'proteins_100g' | 'carbohydrates_100g' | 'fat_100g'>): number {
    return 4 * n(f.proteins_100g) + 4 * n(f.carbohydrates_100g) + 9 * n(f.fat_100g);
}

/** ¿La etiqueta de calorías no casa con los macros? */
export function etiquetaDudosa(f: FoodItem): boolean {
    // Los genéricos verificados (tablas oficiales) traen la energía medida,
    // que incluye lo que los macros no cuentan: el alcohol de un vino, por
    // ejemplo. Su etiqueta manda.
    if (f.is_generic && n(f['energy-kcal_100g']) > 0) return false;
    const etiqueta = n(f['energy-kcal_100g']);
    const calculada = kcalAtwater(f);
    if (calculada === 0) return false;
    if (etiqueta === 0) return true;
    const dif = Math.abs(etiqueta - calculada);
    return dif > 20 && dif / Math.max(etiqueta, calculada) > 0.25;
}

/** Macros por 100 g, con las calorías ya saneadas. */
export function por100(f: FoodItem): Macros {
    const etiqueta = n(f['energy-kcal_100g']);
    return {
        kcal: etiquetaDudosa(f) || etiqueta === 0 ? kcalAtwater(f) : etiqueta,
        proteina: n(f.proteins_100g),
        carbos: n(f.carbohydrates_100g),
        grasas: n(f.fat_100g),
    };
}

/** Macros de una cantidad concreta. */
export function macrosDe(f: FoodItem | undefined | null, gramos: number): Macros {
    if (!f || !(gramos > 0)) return { ...MACROS_CERO };
    const m = por100(f);
    const k = gramos / 100;
    return { kcal: m.kcal * k, proteina: m.proteina * k, carbos: m.carbos * k, grasas: m.grasas * k };
}

export function sumar(a: Macros, b: Macros): Macros {
    return { kcal: a.kcal + b.kcal, proteina: a.proteina + b.proteina, carbos: a.carbos + b.carbos, grasas: a.grasas + b.grasas };
}

export function redondearMacros(m: Macros): Macros {
    return { kcal: Math.round(m.kcal), proteina: Math.round(m.proteina), carbos: Math.round(m.carbos), grasas: Math.round(m.grasas) };
}

/** Calorías que salen de unos macros objetivo (para avisar si no cuadran con las pedidas). */
export function kcalDeMacros(m: Pick<Macros, 'proteina' | 'carbos' | 'grasas'>): number {
    return 4 * m.proteina + 4 * m.carbos + 9 * m.grasas;
}

// =====================================================================
// GRUPOS: un alimento y sus alternativas
// =====================================================================

/**
 * Un hueco de una comida: el alimento principal y sus alternativas ("100 g
 * de arroz ó 120 g de pasta"). Solo el principal cuenta para los totales:
 * las alternativas son intercambiables, no se suman.
 *
 * ESTE ERA EL FALLO MÁS GRAVE DEL EDITOR: los totales sumaban TODAS las filas,
 * alternativas incluidas. Un desayuno con "copos de maíz ó crema de arroz"
 * contaba los dos, y el plan entero salía con cientos de kcal de más.
 */
export interface Grupo {
    id: string;
    categoria: string;
    principal: MealFood;
    alternativas: MealFood[];
}

/**
 * Agrupa las filas de una comida por `alternative_group_id`, en el orden en
 * que se crearon: la primera de cada grupo es la principal. La consulta no
 * garantiza el orden, por eso se ordena aquí por `created_at` (y por id para
 * desempatar).
 */
export function agruparAlimentos(filas: MealFood[]): Grupo[] {
    const ordenadas = [...filas].sort((a, b) => {
        const fa = a.created_at ?? '';
        const fb = b.created_at ?? '';
        return fa === fb ? a.id.localeCompare(b.id) : fa.localeCompare(fb);
    });
    const grupos: Grupo[] = [];
    const porId = new Map<string, Grupo>();
    for (const f of ordenadas) {
        const gid = f.alternative_group_id || f.id;
        const g = porId.get(gid);
        if (g) {
            g.alternativas.push(f);
        } else {
            const nuevo: Grupo = { id: gid, categoria: f.category || 'Otros', principal: f, alternativas: [] };
            porId.set(gid, nuevo);
            grupos.push(nuevo);
        }
    }
    return grupos;
}

/** Totales de una comida contando SOLO los principales. */
export function totalesDeGrupos(grupos: Grupo[], gramos?: (f: MealFood) => number): Macros {
    return grupos.reduce(
        (acc, g) => sumar(acc, macrosDe(g.principal.food, gramos ? gramos(g.principal) : Number(g.principal.amount_g))),
        { ...MACROS_CERO }
    );
}

// =====================================================================
// EQUIVALENCIAS: cuántos gramos de la alternativa
// =====================================================================

/**
 * El macro que manda en un hueco según su categoría: en "Carbohidratos" se
 * cambian gramos de hidrato por gramos de hidrato, en "Proteínas" proteína
 * por proteína… y en el resto, calorías por calorías.
 */
export function macroDeReferencia(categoria: string | undefined): keyof Macros {
    switch (categoria) {
        case 'Carbohidratos': return 'carbos';
        case 'Proteínas': return 'proteina';
        case 'Grasas': return 'grasas';
        default: return 'kcal';
    }
}

/**
 * Gramos de `alternativa` que equivalen a `gramosPrincipal` de `principal`.
 *
 * Si la alternativa casi no tiene el macro de referencia (pasar de pollo a
 * algo sin proteína), se cae a calorías, que siempre tiene sentido.
 * Redondeo a 5 g, o a 1 g por debajo de 30 g (aceites, frutos secos).
 */
export function gramosEquivalentes(
    principal: FoodItem,
    gramosPrincipal: number,
    alternativa: FoodItem,
    categoria?: string
): number {
    let clave = macroDeReferencia(categoria);
    const a = por100(principal);
    const b = por100(alternativa);
    if (clave !== 'kcal' && (b[clave] < 3 || a[clave] < 3)) clave = 'kcal';
    if (!(b[clave] > 0)) return Math.round(gramosPrincipal);
    const g = (a[clave] * gramosPrincipal) / b[clave];
    return redondearGramos(g);
}

export function redondearGramos(g: number, paso?: number): number {
    if (!(g > 0)) return 0;
    const p = paso ?? (g < 30 ? 1 : 5);
    return Math.max(p, Math.round(g / p) * p);
}
