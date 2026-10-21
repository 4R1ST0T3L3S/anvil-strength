import type { FoodItem } from '../../types/nutrition';
import { macrosDe, por100, redondearGramos, type Macros } from './macros';

/**
 * AJUSTE AUTOMÁTICO DE CANTIDADES
 * =====================================================================
 *
 * El nutricionista elige QUÉ come el atleta; esto calcula CUÁNTO para
 * llegar a los objetivos del día (o de una comida).
 *
 *
 * LO QUE HABÍA Y POR QUÉ NO SERVÍA
 *
 * Tres "opciones" que repartían cada macro entre los alimentos que más lo
 * tenían, sin mirar lo que aportaban de los otros dos: el arroz también trae
 * proteína, el pollo también trae grasa. Al aplicarlas, ningún macro
 * cuadraba, y la opción "escalado proporcional" ni siquiera intentaba
 * cuadrar macros, solo calorías.
 *
 *
 * EL MÉTODO
 *
 * Un problema de mínimos cuadrados con límites: se buscan los gramos x que
 * minimizan
 *
 *     Σ  peso_k · ((macros_k(x) − objetivo_k) / objetivo_k)²       k ∈ P, C, G, kcal
 *     + λ · Σ ((x_i − referencia_i) / escala_i)²
 *
 * con cada x_i entre un mínimo y un máximo "con sentido" para su categoría.
 *
 *   · Los errores van en TANTO POR UNO del objetivo: fallar 10 g de grasa
 *     sobre 60 pesa más que fallar 10 g de hidrato sobre 300, como debe.
 *   · El segundo término es lo que hace que el resultado se parezca a lo que
 *     el nutricionista escribió: si hay muchas formas de cuadrar los macros
 *     (casi siempre las hay), gana la que más respeta sus proporciones,
 *     escaladas a las calorías nuevas. Sin él, el ajuste podría quitar todo
 *     el arroz y poner 400 g de patata.
 *   · Los límites son los que haría una persona: la verdura y la fruta se
 *     mueven poco (no son la palanca de los macros), el aceite no pasa de
 *     unas cucharadas, y lo que está BLOQUEADO (un yogur, un huevo) no se
 *     toca.
 *
 * Se resuelve con descenso de gradiente proyectado acelerado (FISTA), que
 * para unas decenas de alimentos converge en milisegundos. Después se
 * redondea (de 5 en 5 g; de 1 en 1 por debajo de 30 g) y se pule el
 * redondeo moviendo de un paso en un paso el alimento que más acerque al
 * objetivo, hasta que ningún paso mejore.
 *
 * El resultado es APROXIMADO por definición —los gramos son redondos y los
 * límites mandan—, y por eso devuelve el error que queda y avisos en
 * lenguaje claro cuando no se puede llegar ("no hay ninguna fuente de grasa
 * que pueda subir").
 */

export interface VariableAjuste {
    id: string;
    alimento: FoodItem;
    /** Gramos actuales. Son la referencia de proporciones. */
    gramos: number;
    categoria?: string;
    bloqueado?: boolean;
}

export interface ObjetivoAjuste {
    kcal: number;
    proteina: number;
    carbos: number;
    grasas: number;
}

export interface ResultadoAjuste {
    gramos: Record<string, number>;
    logrado: Macros;
    /** Error relativo por macro (0.05 = un 5 % por encima). */
    desvio: Macros;
    avisos: string[];
}

const PESOS: Macros = { kcal: 0.8, proteina: 1, carbos: 1, grasas: 1.2 };
const LAMBDA = 0.015;
const MACROS: (keyof Macros)[] = ['kcal', 'proteina', 'carbos', 'grasas'];
const NOMBRE: Record<keyof Macros, string> = { kcal: 'las calorías', proteina: 'la proteína', carbos: 'el hidrato', grasas: 'la grasa' };

/** Mínimo y máximo de gramos que tiene sentido darle a un alimento. */
export function limitesDe(v: VariableAjuste): [number, number] {
    const g = Math.max(0, v.gramos || 0);
    if (v.bloqueado) return [g, g];
    const m = por100(v.alimento);
    const esAceite = m.grasas >= 80;
    const esPolvo = m.proteina >= 60;
    let min: number;
    let max: number;
    switch (v.categoria) {
        case 'Verduras':
            [min, max] = g > 0 ? [g * 0.6, g * 1.6] : [0, 250];
            break;
        case 'Frutas':
            [min, max] = g > 0 ? [g * 0.5, g * 2] : [0, 250];
            break;
        default:
            [min, max] = g > 0 ? [g * 0.25, Math.max(g * 3.5, 60)] : [0, 400];
    }
    if (esAceite) max = Math.min(max, 45);
    if (esPolvo) max = Math.min(max, 80);
    return [min, Math.max(min, max)];
}

export function ajustarCantidades(variables: VariableAjuste[], objetivo: ObjetivoAjuste): ResultadoAjuste {
    const vars = variables.filter((v) => v.alimento);
    const n = vars.length;
    if (n === 0) {
        return { gramos: {}, logrado: { kcal: 0, proteina: 0, carbos: 0, grasas: 0 }, desvio: { kcal: -1, proteina: -1, carbos: -1, grasas: -1 }, avisos: ['Añade alimentos primero.'] };
    }

    // Macros por gramo de cada alimento: a[k][i].
    const por = vars.map((v) => por100(v.alimento));
    const a: Record<keyof Macros, number[]> = {
        kcal: por.map((m) => m.kcal / 100),
        proteina: por.map((m) => m.proteina / 100),
        carbos: por.map((m) => m.carbos / 100),
        grasas: por.map((m) => m.grasas / 100),
    };
    // Normalizador de cada macro: el objetivo, con un suelo para que un
    // objetivo de 0 g no divida por cero (y no se vuelva infinito).
    const norma: Macros = {
        kcal: Math.max(objetivo.kcal, 50),
        proteina: Math.max(objetivo.proteina, 5),
        carbos: Math.max(objetivo.carbos, 5),
        grasas: Math.max(objetivo.grasas, 3),
    };
    // Solo cuentan los macros con objetivo: si el nutricionista no pone
    // calorías (0), no se persiguen.
    const activo = (k: keyof Macros) => objetivo[k] > 0;

    const limites = vars.map(limitesDe);
    const kcalActual = vars.reduce((s, v, i) => s + (v.gramos || 0) * a.kcal[i], 0);
    const escalaRef = kcalActual > 0 && objetivo.kcal > 0 ? objetivo.kcal / kcalActual : 1;
    // La verdura y la fruta no escalan con las calorías: su referencia es
    // lo que ya tienen, y pesan más en el término de proporciones. Un plato
    // con más arroz no lleva por eso más brócoli.
    const fija = vars.map((v) => v.categoria === 'Verduras' || v.categoria === 'Frutas');
    const ref = vars.map((v, i) => (v.gramos || 0) * (fija[i] ? 1 : escalaRef));
    const escala = vars.map((v) => Math.max(v.gramos || 0, 40));
    const lambda = vars.map((_, i) => (fija[i] ? LAMBDA * 6 : LAMBDA));

    // Hessiano (constante: el problema es cuadrático) y término lineal.
    const H: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const b = new Array(n).fill(0);
    for (const k of MACROS) {
        if (!activo(k)) continue;
        const w = PESOS[k] / (norma[k] * norma[k]);
        for (let i = 0; i < n; i++) {
            if (a[k][i] === 0) continue;
            b[i] += 2 * w * a[k][i] * objetivo[k];
            for (let j = 0; j < n; j++) H[i][j] += 2 * w * a[k][i] * a[k][j];
        }
    }
    for (let i = 0; i < n; i++) {
        const w = lambda[i] / (escala[i] * escala[i]);
        H[i][i] += 2 * w;
        b[i] += 2 * w * ref[i];
    }
    // Paso: 1 / L, con L acotada por Gershgorin (la suma de cada fila).
    let L = 0;
    for (let i = 0; i < n; i++) L = Math.max(L, H[i].reduce((s, v) => s + Math.abs(v), 0));
    const paso = L > 0 ? 1 / L : 1;

    const proyectar = (x: number[]) => x.map((v, i) => Math.min(limites[i][1], Math.max(limites[i][0], v)));
    const grad = (x: number[]) => {
        const g = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            let s = -b[i];
            for (let j = 0; j < n; j++) s += H[i][j] * x[j];
            g[i] = s;
        }
        return g;
    };

    // FISTA: gradiente proyectado con aceleración de Nesterov.
    let x = proyectar([...ref]);
    let y = [...x];
    let t = 1;
    for (let it = 0; it < 6000; it++) {
        const g = grad(y);
        const xn = proyectar(y.map((v, i) => v - paso * g[i]));
        const tn = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
        let cambio = 0;
        y = xn.map((v, i) => {
            cambio = Math.max(cambio, Math.abs(v - x[i]));
            return v + ((t - 1) / tn) * (v - x[i]);
        });
        x = xn;
        t = tn;
        if (cambio < 1e-4 && it > 50) break;
    }

    // Coste real (el mismo que se ha minimizado), para pulir el redondeo.
    const coste = (xs: number[]) => {
        let c = 0;
        for (const k of MACROS) {
            if (!activo(k)) continue;
            let s = 0;
            for (let i = 0; i < n; i++) s += a[k][i] * xs[i];
            const r = (s - objetivo[k]) / norma[k];
            c += PESOS[k] * r * r;
        }
        for (let i = 0; i < n; i++) {
            const r = (xs[i] - ref[i]) / escala[i];
            c += lambda[i] * r * r;
        }
        return c;
    };

    const pasoDe = (i: number) => (vars[i].bloqueado ? 0 : x[i] < 30 || por[i].grasas >= 60 ? 1 : 5);
    let xr = x.map((v, i) => (vars[i].bloqueado ? vars[i].gramos : v <= 0 ? 0 : redondearGramos(v, pasoDe(i))));
    xr = xr.map((v, i) => Math.min(Math.ceil(limites[i][1]), Math.max(Math.floor(limites[i][0]), v)));
    let actual = coste(xr);
    for (let vuelta = 0; vuelta < 400; vuelta++) {
        let mejor = actual;
        let mejorI = -1;
        let mejorV = 0;
        for (let i = 0; i < n; i++) {
            const p = pasoDe(i);
            if (!p) continue;
            for (const d of [-p, p]) {
                const v = xr[i] + d;
                if (v < Math.floor(limites[i][0]) || v > Math.ceil(limites[i][1]) || v < 0) continue;
                const prueba = [...xr];
                prueba[i] = v;
                const c = coste(prueba);
                if (c < mejor - 1e-12) { mejor = c; mejorI = i; mejorV = v; }
            }
        }
        if (mejorI < 0) break;
        xr[mejorI] = mejorV;
        actual = mejor;
    }

    const gramos: Record<string, number> = {};
    let logrado: Macros = { kcal: 0, proteina: 0, carbos: 0, grasas: 0 };
    vars.forEach((v, i) => {
        gramos[v.id] = xr[i];
        const m = macrosDe(v.alimento, xr[i]);
        logrado = { kcal: logrado.kcal + m.kcal, proteina: logrado.proteina + m.proteina, carbos: logrado.carbos + m.carbos, grasas: logrado.grasas + m.grasas };
    });
    const desvio: Macros = {
        kcal: objetivo.kcal > 0 ? logrado.kcal / objetivo.kcal - 1 : 0,
        proteina: objetivo.proteina > 0 ? logrado.proteina / objetivo.proteina - 1 : 0,
        carbos: objetivo.carbos > 0 ? logrado.carbos / objetivo.carbos - 1 : 0,
        grasas: objetivo.grasas > 0 ? logrado.grasas / objetivo.grasas - 1 : 0,
    };

    // Avisos: qué no se ha podido cuadrar y por qué, en palabras.
    const avisos: string[] = [];
    for (const k of ['proteina', 'carbos', 'grasas'] as const) {
        if (!activo(k) || Math.abs(desvio[k]) <= 0.08) continue;
        const fuentes = vars.filter((v, i) => !v.bloqueado && a[k][i] >= (k === 'grasas' ? 0.08 : 0.15));
        const faltaOSobra = desvio[k] < 0 ? 'No se llega a' : 'Te pasas de';
        if (fuentes.length === 0) {
            avisos.push(`${faltaOSobra} ${NOMBRE[k]} del objetivo: no hay ningún alimento que la aporte y se pueda mover. Añade una fuente o desbloquea alguna.`);
        } else {
            avisos.push(`${faltaOSobra} ${NOMBRE[k]} del objetivo (${Math.round(Math.abs(desvio[k]) * 100)} %): los límites de cantidad no dan para más con estos alimentos.`);
        }
    }
    return { gramos, logrado, desvio, avisos };
}

/**
 * Reparte el objetivo del día entre las comidas en la misma proporción de
 * calorías que ya tienen. Si una comida está vacía o todas lo están, a
 * partes iguales.
 */
export function repartirObjetivo(objetivo: ObjetivoAjuste, kcalPorComida: number[]): ObjetivoAjuste[] {
    const total = kcalPorComida.reduce((s, v) => s + Math.max(0, v), 0);
    const nComidas = kcalPorComida.length || 1;
    return kcalPorComida.map((k) => {
        const parte = total > 0 ? Math.max(0, k) / total : 1 / nComidas;
        return {
            kcal: objetivo.kcal * parte,
            proteina: objetivo.proteina * parte,
            carbos: objetivo.carbos * parte,
            grasas: objetivo.grasas * parte,
        };
    });
}
