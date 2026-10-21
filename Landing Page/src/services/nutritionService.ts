import { supabase } from '../lib/supabase';
import { normalizarNombre } from '../lib/atletas';
import { FoodItem, Meal, MealFood, MealFoodDayAmount, NutritionDayType, NutritionPlan } from '../types/nutrition';

/**
 * NUTRICIÓN — ACCESO A DATOS
 * =====================================================================
 *
 * COMPATIBLE CON LA BASE DE ANTES Y DE DESPUÉS DE LA MIGRACIÓN
 *
 * database/NUTRICION_2026-10-21.sql añade los tipos de día, los gramos por
 * día, el bloqueo de alimentos y los genéricos. El código se despliega
 * antes de que alguien ejecute ese SQL, así que cada consulta que dependa de
 * algo nuevo prueba primero la forma nueva y, si la base todavía no la
 * tiene, cae a la de siempre. El resultado se recuerda (`esquema`) para no
 * repetir el intento fallido en cada petición.
 */

type Esquema = 'desconocido' | 'nuevo' | 'antiguo';
let esquema: Esquema = 'desconocido';

/** ¿La base ya tiene los tipos de día? Lo saben las pantallas para enseñarlos o no. */
export const tieneTiposDeDia = () => esquema === 'nuevo';

/** Solo para /dev/nutricion: simula una base con o sin la migración. */
export function fijarEsquemaParaVistaPrevia(nuevo: boolean) {
    if (import.meta.env.DEV) esquema = nuevo ? 'nuevo' : 'antiguo';
}

const SELECT_NUEVO =
    '*, day_types:nutrition_day_types(*), meals(*, foods:meal_foods(*, food:food_items(*), day_amounts:meal_food_day_amounts(*)))';
const SELECT_ANTIGUO = '*, meals(*, foods:meal_foods(*, food:food_items(*)))';

/** Errores que significan "esa tabla o relación todavía no existe". */
function esFaltaDeEsquema(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return (
        error.code === 'PGRST200' || // relación no encontrada en la caché de esquema
        error.code === 'PGRST204' || // columna no encontrada
        error.code === '42P01' || // tabla no existe
        error.code === '42703' || // columna no existe
        /does not exist|could not find/i.test(error.message ?? '')
    );
}

/** Ordena lo que PostgREST no garantiza: comidas, alimentos y tipos de día. */
function ordenarPlan(plan: NutritionPlan): NutritionPlan {
    const meals = [...(plan.meals ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((m) => ({
            ...m,
            foods: [...(m.foods ?? [])].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id)),
        }));
    const day_types = [...(plan.day_types ?? [])].sort((a, b) => a.order_index - b.order_index || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    return { ...plan, meals, day_types };
}

// =====================================================================
// GENÉRICOS — se cargan una vez y se buscan en el navegador
// =====================================================================

/**
 * Los alimentos genéricos (BEDCA) son ~950 filas pequeñas: se traen una vez
 * y se buscan aquí, sin tildes y por palabras sueltas. "platano" encuentra
 * "Plátano", y "pollo pechuga" encuentra "Pollo, pechuga, cruda". Con ILIKE
 * en el servidor ninguna de las dos cosas funciona.
 */
let genericos: Promise<FoodItem[]> | null = null;

function cargarGenericos(): Promise<FoodItem[]> {
    if (!genericos) {
        genericos = (async () => {
            const { data, error } = await supabase.from('food_items').select('*').eq('is_generic', true).limit(3000);
            if (error) {
                if (esFaltaDeEsquema(error)) return [];
                genericos = null; // un fallo de red no se cachea
                throw error;
            }
            return (data ?? []) as FoodItem[];
        })();
    }
    return genericos;
}

function buscarEnGenericos(lista: FoodItem[], consulta: string): FoodItem[] {
    const palabras = normalizarNombre(consulta).split(' ').filter((p) => p.length > 1);
    if (palabras.length === 0) return [];
    const puntuados: { f: FoodItem; p: number }[] = [];
    for (const f of lista) {
        const nombre = normalizarNombre(f.product_name ?? '');
        if (!palabras.every((p) => nombre.includes(p))) continue;
        // Mejor si empieza por la primera palabra y si es corto (más genérico).
        const p = (nombre.startsWith(palabras[0]) ? 0 : 10) + nombre.length / 100;
        puntuados.push({ f, p });
    }
    return puntuados.sort((a, b) => a.p - b.p).map((x) => x.f);
}

export const nutritionService = {
    // ==========================================
    // ALIMENTOS
    // ==========================================

    async searchFoodItems(query: string, favoriteBrands: string[] = [], referenceFood?: FoodItem): Promise<FoodItem[]> {
        const palabras = query.trim().split(/\s+/).filter((p) => p.length > 1);
        if (palabras.length === 0) return [];

        // Marcas: cada palabra tiene que estar en el nombre (antes era la
        // frase entera, y "pechuga pollo" no encontraba "pollo pechuga").
        let consulta = supabase.from('food_items').select('*');
        for (const p of palabras) consulta = consulta.ilike('product_name', `%${p.replace(/[%_]/g, '')}%`);
        const [marcas, gen] = await Promise.all([
            consulta.limit(150),
            cargarGenericos().catch(() => [] as FoodItem[]),
        ]);
        if (marcas.error) throw marcas.error;

        const deMarca = ((marcas.data ?? []) as FoodItem[]).filter((f) => !f.is_generic);
        const genericosHallados = buscarEnGenericos(gen, query).slice(0, 25);

        let ordenados: FoodItem[];
        if (referenceFood) {
            // Buscando una alternativa: lo más parecido en macros, primero.
            const dist = (f: FoodItem) =>
                Math.abs((f['energy-kcal_100g'] || 0) - (referenceFood['energy-kcal_100g'] || 0)) / 100 +
                Math.abs((f.proteins_100g || 0) - (referenceFood.proteins_100g || 0)) +
                Math.abs((f.carbohydrates_100g || 0) - (referenceFood.carbohydrates_100g || 0)) +
                Math.abs((f.fat_100g || 0) - (referenceFood.fat_100g || 0));
            ordenados = [...genericosHallados, ...deMarca].sort((a, b) => dist(a) - dist(b));
        } else {
            const q = normalizarNombre(query);
            const favs = favoriteBrands.map((b) => b.toLowerCase().trim()).filter(Boolean);
            const esFav = (f: FoodItem) => !!f.brands && favs.some((fb) => f.brands!.toLowerCase().includes(fb));
            deMarca.sort((a, b) => {
                const fa = esFav(a), fb = esFav(b);
                if (fa !== fb) return fa ? -1 : 1;
                const sa = normalizarNombre(a.product_name ?? '').startsWith(q);
                const sb = normalizarNombre(b.product_name ?? '').startsWith(q);
                if (sa !== sb) return sa ? -1 : 1;
                return (a.product_name ?? '').localeCompare(b.product_name ?? '');
            });
            // Los genéricos verificados van siempre delante.
            ordenados = [...genericosHallados, ...deMarca];
        }
        // Fuera duplicados exactos (mismo nombre y marca), que en Open Food
        // Facts abundan.
        const vistos = new Set<string>();
        return ordenados.filter((f) => {
            const k = `${normalizarNombre(f.product_name ?? '')}|${(f.brands ?? '').toLowerCase()}`;
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
        }).slice(0, 60);
    },

    async getFoodItemByCode(code: string): Promise<FoodItem> {
        const { data, error } = await supabase.from('food_items').select('*').eq('code', code).single();
        if (error) throw error;
        return data as FoodItem;
    },

    // ==========================================
    // PLANES
    // ==========================================

    /**
     * El plan activo de un atleta. Si por error hay dos activos, el más
     * reciente: antes `maybeSingle()` fallaba con dos filas y el atleta veía
     * "no tienes plan" teniendo dos.
     */
    async getAthleteNutritionPlan(athleteId: string): Promise<NutritionPlan | null> {
        const pedir = (select: string) =>
            supabase
                .from('nutrition_plans')
                .select(select)
                .eq('athlete_id', athleteId)
                .eq('status', 'active')
                .order('updated_at', { ascending: false })
                .limit(1);

        if (esquema !== 'antiguo') {
            const { data, error } = await pedir(SELECT_NUEVO);
            if (!error) {
                esquema = 'nuevo';
                const plan = (data?.[0] ?? null) as unknown as NutritionPlan | null;
                return plan ? ordenarPlan(plan) : null;
            }
            if (!esFaltaDeEsquema(error)) throw error;
            esquema = 'antiguo';
        }
        const { data, error } = await pedir(SELECT_ANTIGUO);
        if (error) throw error;
        const plan = (data?.[0] ?? null) as unknown as NutritionPlan | null;
        return plan ? ordenarPlan(plan) : null;
    },

    async createNutritionPlan(planData: Partial<NutritionPlan>): Promise<NutritionPlan> {
        const { data, error } = await supabase.from('nutrition_plans').insert(planData).select().single();
        if (error) throw error;
        return data as NutritionPlan;
    },

    async updateNutritionPlan(planId: string, updates: Partial<NutritionPlan>): Promise<NutritionPlan> {
        const { data, error } = await supabase
            .from('nutrition_plans')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', planId)
            .select()
            .single();
        if (error) throw error;
        return data as NutritionPlan;
    },

    // ==========================================
    // TIPOS DE DÍA
    // ==========================================

    async createDayType(dayType: Omit<NutritionDayType, 'id' | 'created_at'>): Promise<NutritionDayType> {
        const { data, error } = await supabase.from('nutrition_day_types').insert(dayType).select().single();
        if (error) throw error;
        return data as NutritionDayType;
    },

    async updateDayType(id: string, updates: Partial<NutritionDayType>): Promise<void> {
        const { error } = await supabase.from('nutrition_day_types').update(updates).eq('id', id);
        if (error) throw error;
    },

    async deleteDayType(id: string): Promise<void> {
        const { error } = await supabase.from('nutrition_day_types').delete().eq('id', id);
        if (error) throw error;
    },

    /** Gramos de varios alimentos en un tipo de día, de una vez. */
    async upsertDayAmounts(rows: MealFoodDayAmount[]): Promise<void> {
        if (rows.length === 0) return;
        const { error } = await supabase.from('meal_food_day_amounts').upsert(rows, { onConflict: 'meal_food_id,day_type_id' });
        if (error) throw error;
    },

    // ==========================================
    // COMIDAS
    // ==========================================

    async createMeal(mealData: Partial<Meal>): Promise<Meal> {
        const { data, error } = await supabase.from('meals').insert(mealData).select().single();
        if (error) throw error;
        return data as Meal;
    },

    async updateMeal(mealId: string, updates: Partial<Meal>): Promise<Meal> {
        const { data, error } = await supabase.from('meals').update(updates).eq('id', mealId).select().single();
        if (error) throw error;
        return data as Meal;
    },

    async deleteMeal(mealId: string): Promise<void> {
        const { error } = await supabase.from('meals').delete().eq('id', mealId);
        if (error) throw error;
    },

    /** Reordena comidas: cada una con su nuevo `order_index`. */
    async reorderMeals(orden: { id: string; order_index: number }[]): Promise<void> {
        const resultados = await Promise.all(
            orden.map((o) => supabase.from('meals').update({ order_index: o.order_index }).eq('id', o.id))
        );
        const fallo = resultados.find((r) => r.error)?.error;
        if (fallo) throw fallo;
    },

    /**
     * Duplica una comida con sus alimentos y alternativas. Los grupos de
     * alternativas se rehacen con identificadores nuevos (si se copiara el
     * mismo, las dos comidas compartirían grupo). Los gramos por tipo de día
     * no se copian: la comida nueva se ajusta luego.
     */
    async duplicateMeal(meal: Meal, orderIndex: number): Promise<void> {
        const { data: nueva, error } = await supabase
            .from('meals')
            .insert({
                plan_id: meal.plan_id,
                name: `${meal.name} (copia)`,
                time: meal.time ?? null,
                description: meal.description ?? null,
                order_index: orderIndex,
                meal_supplements: meal.meal_supplements ?? [],
            })
            .select()
            .single();
        if (error) throw error;
        const grupos = new Map<string, string>();
        const filas = (meal.foods ?? []).map((f) => {
            const g = f.alternative_group_id || f.id;
            if (!grupos.has(g)) grupos.set(g, crypto.randomUUID());
            return {
                meal_id: (nueva as Meal).id,
                food_id: f.food_id,
                amount_g: f.amount_g,
                category: f.category ?? 'Otros',
                notes: f.notes ?? null,
                alternative_group_id: grupos.get(g),
            };
        });
        // Uno a uno y en orden: `created_at` decide cuál es el principal.
        for (const fila of filas) {
            const { error: e } = await supabase.from('meal_foods').insert(fila);
            if (e) throw e;
        }
    },

    // ==========================================
    // ALIMENTOS DE UNA COMIDA
    // ==========================================

    async addFoodToMeal(mealFoodData: Partial<MealFood>): Promise<MealFood> {
        const { data, error } = await supabase.from('meal_foods').insert(mealFoodData).select('*, food:food_items(*)').single();
        if (error) throw error;
        return data as unknown as MealFood;
    },

    async updateMealFood(mealFoodId: string, updates: Partial<MealFood>): Promise<MealFood> {
        const { data, error } = await supabase
            .from('meal_foods')
            .update(updates)
            .eq('id', mealFoodId)
            .select('*, food:food_items(*)')
            .single();
        if (error) throw error;
        return data as unknown as MealFood;
    },

    async removeFoodFromMeal(mealFoodId: string): Promise<void> {
        const { error } = await supabase.from('meal_foods').delete().eq('id', mealFoodId);
        if (error) throw error;
    },

    async updateBulkMealFoods(updates: { id: string; amount_g: number }[]): Promise<void> {
        // Una por una en paralelo: con RLS por fila y sin upsert parcial,
        // es lo que funciona.
        const resultados = await Promise.all(
            updates.map((u) => supabase.from('meal_foods').update({ amount_g: u.amount_g }).eq('id', u.id))
        );
        const fallo = resultados.find((r) => r.error)?.error;
        if (fallo) throw fallo;
    },
};
