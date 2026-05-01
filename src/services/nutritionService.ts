import { supabase } from '../lib/supabase';
import { FoodItem, Meal, MealFood, NutritionPlan } from '../types/nutrition';

export const nutritionService = {
    // ==========================================
    // FOOD ITEMS (Base de datos de alimentos)
    // ==========================================
    
    async searchFoodItems(query: string, favoriteBrands: string[] = [], referenceFood?: FoodItem): Promise<FoodItem[]> {
        const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .ilike('product_name', `%${query}%`)
            .limit(150);
            
        if (error) throw error;
        
        let sortedData = data as FoodItem[];
        
        if (referenceFood) {
            // Smart Search: sort by macro similarity (Euclidean-like distance on main macros per 100g)
            sortedData = sortedData.sort((a, b) => {
                const getDistance = (f: FoodItem) => {
                    const dKcal = Math.abs((f['energy-kcal_100g'] || 0) - (referenceFood['energy-kcal_100g'] || 0)) / 100;
                    const dProt = Math.abs((f.proteins_100g || 0) - (referenceFood.proteins_100g || 0));
                    const dCarbs = Math.abs((f.carbohydrates_100g || 0) - (referenceFood.carbohydrates_100g || 0));
                    const dFats = Math.abs((f.fat_100g || 0) - (referenceFood.fat_100g || 0));
                    return dKcal + dProt + dCarbs + dFats;
                };
                return getDistance(a) - getDistance(b);
            });
        } else {
            // Normal Search
            const qLower = query.toLowerCase();
            const favBrandsLower = favoriteBrands.map(b => b.toLowerCase().trim()).filter(b => b);
            
            sortedData = sortedData.sort((a, b) => {
                const aNameLower = a.product_name.toLowerCase();
                const bNameLower = b.product_name.toLowerCase();
                
                // 1. Favorite Brands priority
                const aIsFavBrand = a.brands && favBrandsLower.some(fb => a.brands!.toLowerCase().includes(fb));
                const bIsFavBrand = b.brands && favBrandsLower.some(fb => b.brands!.toLowerCase().includes(fb));
                
                if (aIsFavBrand && !bIsFavBrand) return -1;
                if (!aIsFavBrand && bIsFavBrand) return 1;
                
                // 2. Exact start priority (Starts with query)
                const aStarts = aNameLower.startsWith(qLower);
                const bStarts = bNameLower.startsWith(qLower);
                
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                
                // 3. Alphabetical
                return aNameLower.localeCompare(bNameLower);
            });
        }
        
        return sortedData.slice(0, 50);
    },
    
    async getFoodItemByCode(code: string): Promise<FoodItem> {
        const { data, error } = await supabase
            .from('food_items')
            .select('*')
            .eq('code', code)
            .single();
            
        if (error) throw error;
        return data as FoodItem;
    },
    
    // ==========================================
    // NUTRITION PLANS
    // ==========================================
    
    async getAthleteNutritionPlan(athleteId: string): Promise<NutritionPlan | null> {
        const { data, error } = await supabase
            .from('nutrition_plans')
            .select('*, meals(*, foods:meal_foods(*, food:food_items(*)))')
            .eq('athlete_id', athleteId)
            .eq('status', 'active')
            .maybeSingle();
            
        if (error && error.code !== 'PGRST116') throw error;
        return data as unknown as NutritionPlan | null;
    },
    
    async createNutritionPlan(planData: Partial<NutritionPlan>): Promise<NutritionPlan> {
        const { data, error } = await supabase
            .from('nutrition_plans')
            .insert(planData)
            .select()
            .single();
            
        if (error) throw error;
        return data as NutritionPlan;
    },
    
    async updateNutritionPlan(planId: string, updates: Partial<NutritionPlan>): Promise<NutritionPlan> {
        const { data, error } = await supabase
            .from('nutrition_plans')
            .update(updates)
            .eq('id', planId)
            .select()
            .single();
            
        if (error) throw error;
        return data as NutritionPlan;
    },
    
    // ==========================================
    // MEALS
    // ==========================================
    
    async createMeal(mealData: Partial<Meal>): Promise<Meal> {
        const { data, error } = await supabase
            .from('meals')
            .insert(mealData)
            .select()
            .single();
            
        if (error) throw error;
        return data as Meal;
    },
    
    async updateMeal(mealId: string, updates: Partial<Meal>): Promise<Meal> {
        const { data, error } = await supabase
            .from('meals')
            .update(updates)
            .eq('id', mealId)
            .select()
            .single();
            
        if (error) throw error;
        return data as Meal;
    },
    
    async deleteMeal(mealId: string): Promise<void> {
        const { error } = await supabase
            .from('meals')
            .delete()
            .eq('id', mealId);
            
        if (error) throw error;
    },
    
    // ==========================================
    // MEAL FOODS
    // ==========================================
    
    async addFoodToMeal(mealFoodData: Partial<MealFood>): Promise<MealFood> {
        const { data, error } = await supabase
            .from('meal_foods')
            .insert(mealFoodData)
            .select('*, food:food_items(*)')
            .single();
            
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
        const { error } = await supabase
            .from('meal_foods')
            .delete()
            .eq('id', mealFoodId);
            
        if (error) throw error;
    },

    async updateBulkMealFoods(updates: { id: string, amount_g: number }[]): Promise<void> {
        // Individual updates in parallel for better compatibility with RLS and schema constraints
        const promises = updates.map(update => 
            supabase
                .from('meal_foods')
                .update({ amount_g: update.amount_g })
                .eq('id', update.id)
        );
        
        const results = await Promise.all(promises);
        const firstError = results.find(r => r.error)?.error;
        
        if (firstError) throw firstError;
    }
};
