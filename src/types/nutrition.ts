/**
 * ANVIL STRENGTH - NUTRITION TYPES
 */

export interface NutritionPlan {
    id: string;
    athlete_id: string;
    nutritionist_id: string;
    calories_target: number;
    protein_target: number;
    carbs_target: number;
    fats_target: number;
    notes?: string;
    status: 'active' | 'archived';
    created_at: string;
    updated_at: string;
}

export interface Meal {
    id: string;
    plan_id: string;
    name: string; // "Desayuno", "Almuerzo", etc.
    time?: string;
    description: string;
    order_index: number;
}
