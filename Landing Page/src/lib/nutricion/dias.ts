import type { Meal, MealFood, NutritionPlan } from '../../types/nutrition';
import { ajustarCantidades, repartirObjetivo, type ObjetivoAjuste, type ResultadoAjuste } from './ajuste';
import { agruparAlimentos, gramosEquivalentes, MACROS_CERO, macrosDe, sumar, type Grupo, type Macros } from './macros';

/**
 * LOS DÍAS DE UN PLAN
 * =====================================================================
 *
 * Un plan tiene un DÍA BASE —sus objetivos de siempre y los gramos de
 * `meal_foods.amount_g`— y, si el nutricionista quiere, más TIPOS DE DÍA
 * (descanso, recarga…), cada uno con sus objetivos. Los alimentos son los
 * mismos en todos; lo que cambia son los gramos, que en un tipo de día se
 * leen de `day_amounts` y, si un alimento no tiene fila para ese día, valen
 * los del base.
 *
 * `dia === null` es siempre el día base.
 */

export interface DiaDelPlan {
    id: string | null;
    nombre: string;
    objetivo: ObjetivoAjuste;
}

export function diasDelPlan(plan: NutritionPlan): DiaDelPlan[] {
    const base: DiaDelPlan = {
        id: null,
        nombre: plan.base_day_name?.trim() || 'Día de entreno',
        objetivo: {
            kcal: Number(plan.calories_target) || 0,
            proteina: Number(plan.protein_target) || 0,
            carbos: Number(plan.carbs_target) || 0,
            grasas: Number(plan.fats_target) || 0,
        },
    };
    const otros = (plan.day_types ?? []).map((d) => ({
        id: d.id,
        nombre: d.name,
        objetivo: {
            kcal: Number(d.calories_target) || 0,
            proteina: Number(d.protein_target) || 0,
            carbos: Number(d.carbs_target) || 0,
            grasas: Number(d.fats_target) || 0,
        },
    }));
    return [base, ...otros];
}

/** Los gramos de un alimento en un día. */
export function gramosEnDia(f: MealFood, dia: string | null): number {
    if (dia) {
        const fila = f.day_amounts?.find((d) => d.day_type_id === dia);
        if (fila) return Number(fila.amount_g) || 0;
    }
    return Number(f.amount_g) || 0;
}

/** Totales de una comida en un día, contando solo los principales. */
export function totalesDeComida(meal: Meal, dia: string | null): Macros {
    return agruparAlimentos(meal.foods ?? []).reduce(
        (acc, g) => sumar(acc, macrosDe(g.principal.food, gramosEnDia(g.principal, dia))),
        { ...MACROS_CERO }
    );
}

export function totalesDelDia(plan: NutritionPlan, dia: string | null): Macros {
    return (plan.meals ?? []).reduce((acc, m) => sumar(acc, totalesDeComida(m, dia)), { ...MACROS_CERO });
}

export interface PropuestaDeAjuste {
    /** Gramos nuevos de cada fila (principales y alternativas). */
    cambios: { id: string; amount_g: number }[];
    /** Para enseñar el antes y el después. */
    detalle: { id: string; nombre: string; antes: number; despues: number; alternativa: boolean }[];
    resultado: ResultadoAjuste;
}

/**
 * Las alternativas siguen a su principal: si el arroz pasa de 80 a 100 g,
 * la pasta que lo puede sustituir pasa a su equivalente de 100 g de arroz.
 */
function cambiosDeAlternativas(grupos: Grupo[], gramosPrincipal: (g: Grupo) => number, dia: string | null) {
    const filas: PropuestaDeAjuste['detalle'] = [];
    for (const g of grupos) {
        if (!g.principal.food) continue;
        for (const alt of g.alternativas) {
            if (!alt.food) continue;
            const despues = gramosEquivalentes(g.principal.food, gramosPrincipal(g), alt.food, g.categoria);
            filas.push({ id: alt.id, nombre: alt.food.product_name, antes: gramosEnDia(alt, dia), despues, alternativa: true });
        }
    }
    return filas;
}

function proponer(grupos: Grupo[], objetivo: ObjetivoAjuste, dia: string | null): PropuestaDeAjuste {
    const conAlimento = grupos.filter((g) => g.principal.food);
    const resultado = ajustarCantidades(
        conAlimento.map((g) => ({
            id: g.principal.id,
            alimento: g.principal.food!,
            gramos: gramosEnDia(g.principal, dia),
            categoria: g.categoria,
            bloqueado: !!g.principal.is_locked,
        })),
        objetivo
    );
    const detalle: PropuestaDeAjuste['detalle'] = conAlimento.map((g) => ({
        id: g.principal.id,
        nombre: g.principal.food!.product_name,
        antes: gramosEnDia(g.principal, dia),
        despues: resultado.gramos[g.principal.id] ?? gramosEnDia(g.principal, dia),
        alternativa: false,
    }));
    detalle.push(...cambiosDeAlternativas(conAlimento, (g) => resultado.gramos[g.principal.id] ?? gramosEnDia(g.principal, dia), dia));
    return { cambios: detalle.map((d) => ({ id: d.id, amount_g: d.despues })), detalle, resultado };
}

/** Ajuste del día entero: todas las comidas a la vez. */
export function ajustarDia(plan: NutritionPlan, dia: string | null, objetivo: ObjetivoAjuste): PropuestaDeAjuste {
    const grupos = (plan.meals ?? []).flatMap((m) => agruparAlimentos(m.foods ?? []));
    return proponer(grupos, objetivo, dia);
}

/** Ajuste de una comida a su propio objetivo. */
export function ajustarComida(meal: Meal, dia: string | null, objetivo: ObjetivoAjuste): PropuestaDeAjuste {
    return proponer(agruparAlimentos(meal.foods ?? []), objetivo, dia);
}

/**
 * El objetivo de cada comida dentro del día: la parte del día que ya
 * pesa esa comida en calorías (ver `repartirObjetivo`).
 */
export function objetivoDeComida(plan: NutritionPlan, mealId: string, dia: string | null, objetivoDia: ObjetivoAjuste): ObjetivoAjuste {
    const comidas = plan.meals ?? [];
    const reparto = repartirObjetivo(objetivoDia, comidas.map((m) => totalesDeComida(m, dia).kcal));
    const i = comidas.findIndex((m) => m.id === mealId);
    return reparto[Math.max(0, i)];
}

/** Redondeo para enseñar macros objetivo con decimales razonables. */
export const redondear1 = (v: number) => Math.round(v * 10) / 10;
