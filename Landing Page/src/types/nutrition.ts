/**
 * ANVIL STRENGTH - NUTRITION TYPES
 */

export interface FoodItem {
    code: string; // OpenFoodFacts code as PK
    product_name: string;
    brands?: string | null;
    'energy-kcal_100g': number;
    proteins_100g: number;
    carbohydrates_100g: number;
    fat_100g: number;
    salt_100g?: number | null;
    sugars_100g?: number | null;
    created_at?: string;
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
    food?: FoodItem; // populated relationship
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
    created_at: string;
    updated_at: string;
    meals?: Meal[]; // populated relationship
}
