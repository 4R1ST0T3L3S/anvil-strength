/**
 * ANVIL STRENGTH - NUTRITION TYPES
 */

export interface FoodItem {
    code: string; // OpenFoodFacts code as PK
    product_name: string;
    brands?: string | null;
    // Pueden venir a null: Open Food Facts deja huecos.
    'energy-kcal_100g': number;
    proteins_100g: number;
    carbohydrates_100g: number;
    fat_100g: number;
    salt_100g?: number | null;
    sugars_100g?: number | null;
    fiber_100g?: number | null;
    created_at?: string;
    /**
     * Alimento genérico verificado (tablas oficiales, p. ej. BEDCA), no un
     * producto de marca de Open Food Facts. Sale primero en el buscador.
     * Opcional: no existe hasta la migración NUTRICION_2026-10.
     */
    is_generic?: boolean | null;
    /** De dónde sale: 'bedca', 'off' (Open Food Facts), 'manual'. */
    source?: string | null;
    /** Grupo de alimentos de la fuente ("Cereales", "Carnes"…). */
    food_group?: string | null;
}

export type FoodCategory = 'Carbohidratos' | 'Proteínas' | 'Grasas' | 'Verduras' | 'Frutas' | 'Otros';

export interface MealFood {
    id: string;
    meal_id: string;
    food_id: string;
    amount_g: number;
    notes?: string | null;
    category?: FoodCategory | string;
    alternative_group_id?: string;
    created_at?: string;
    /** El ajuste automático no toca este alimento (1 yogur, 1 pieza…). */
    is_locked?: boolean | null;
    food?: FoodItem; // populated relationship
    /** Gramos por tipo de día (relación poblada). Sin fila, vale `amount_g`. */
    day_amounts?: MealFoodDayAmount[];
}

/**
 * TIPOS DE DÍA — entreno, descanso, recarga…
 *
 * El plan tiene UN día base (sus `*_target` de siempre y los `amount_g` de
 * cada alimento) y, además, los tipos de día que quiera el nutricionista,
 * cada uno con sus objetivos. Los alimentos son los mismos; lo que cambia
 * son los gramos, que se guardan en `meal_food_day_amounts`.
 */
export interface NutritionDayType {
    id: string;
    plan_id: string;
    name: string;
    calories_target: number;
    protein_target: number;
    carbs_target: number;
    fats_target: number;
    order_index: number;
    created_at?: string;
}

export interface MealFoodDayAmount {
    meal_food_id: string;
    day_type_id: string;
    amount_g: number;
}

export interface Meal {
    id: string;
    plan_id: string;
    name: string; // e.g. "Desayuno", "Pre-entreno"
    time?: string | null;
    description?: string | null;
    order_index: number;
    meal_supplements?: string[];
    foods?: MealFood[]; // populated relationship
}

export interface NutritionPlan {
    id: string;
    athlete_id: string;
    nutritionist_id: string; // Can be a coach or nutritionist role
    calories_target: number;
    protein_target: number;
    carbs_target: number;
    fats_target: number;
    notes?: string | null;
    status: 'active' | 'archived';
    training_block_id?: string | null;
    tags?: string[];
    general_guidelines?: string[];
    global_supplements?: string[];
    /** Nombre del día base ("Día de entreno"). Opcional hasta la migración. */
    base_day_name?: string | null;
    created_at: string;
    updated_at: string;
    meals?: Meal[]; // populated relationship
    day_types?: NutritionDayType[]; // populated relationship
}
