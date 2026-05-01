import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nutritionService } from '../services/nutritionService';
import { NutritionPlan, Meal, MealFood, FoodItem } from '../types/nutrition';
import { toast } from 'sonner';

export const NUTRITION_KEYS = {
    plan: (athleteId: string) => ['nutritionPlan', athleteId] as const,
    foodSearch: (query: string, brands: string[], refCode?: string) => ['foodSearch', query, brands, refCode] as const,
};

// ==========================================
// QUERIES
// ==========================================

export function useAthleteNutritionPlan(athleteId?: string) {
    return useQuery({
        queryKey: NUTRITION_KEYS.plan(athleteId || ''),
        queryFn: () => athleteId ? nutritionService.getAthleteNutritionPlan(athleteId) : null,
        enabled: !!athleteId,
    });
}

export function useSearchFoodItems(searchQuery: string, favoriteBrands: string[] = [], referenceFood?: FoodItem) {
    return useQuery({
        queryKey: NUTRITION_KEYS.foodSearch(searchQuery, favoriteBrands, referenceFood?.code),
        queryFn: () => nutritionService.searchFoodItems(searchQuery, favoriteBrands, referenceFood),
        enabled: searchQuery.length > 2, // Only search if query is > 2 chars
        staleTime: 1000 * 60 * 5, // Cache for 5 mins
    });
}

// ==========================================
// MUTATIONS (PLAN)
// ==========================================

export function useCreateNutritionPlan() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (planData: Partial<NutritionPlan>) => nutritionService.createNutritionPlan(planData),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: NUTRITION_KEYS.plan(data.athlete_id) });
            toast.success('Plan nutricional creado');
        },
        onError: () => toast.error('Error al crear el plan nutricional'),
    });
}

export function useUpdateNutritionPlan() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ planId, updates, athleteId }: { planId: string, updates: Partial<NutritionPlan>, athleteId: string }) => 
            nutritionService.updateNutritionPlan(planId, updates),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: NUTRITION_KEYS.plan(variables.athleteId) });
            toast.success('Plan actualizado');
        },
        onError: () => toast.error('Error al actualizar el plan'),
    });
}

// ==========================================
// MUTATIONS (MEALS)
// ==========================================

export function useCreateMeal() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ mealData, athleteId }: { mealData: Partial<Meal>, athleteId: string }) => 
            nutritionService.createMeal(mealData),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: NUTRITION_KEYS.plan(variables.athleteId) });
            toast.success('Comida añadida');
        },
        onError: () => toast.error('Error al añadir comida'),
    });
}

export function useDeleteMeal() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ mealId, athleteId }: { mealId: string, athleteId: string }) => 
            nutritionService.deleteMeal(mealId),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: NUTRITION_KEYS.plan(variables.athleteId) });
            toast.success('Comida eliminada');
        },
        onError: () => toast.error('Error al eliminar comida'),
    });
}

// ==========================================
// MUTATIONS (FOODS)
// ==========================================

export function useAddFoodToMeal() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ foodData }: { foodData: Partial<MealFood>, athleteId: string, tempFood?: any }) => 
            nutritionService.addFoodToMeal(foodData),
        onMutate: async ({ foodData, athleteId, tempFood }) => {
            await queryClient.cancelQueries({ queryKey: NUTRITION_KEYS.plan(athleteId) });
            const previousPlan = queryClient.getQueryData(NUTRITION_KEYS.plan(athleteId));
            
            if (tempFood) {
                queryClient.setQueryData(NUTRITION_KEYS.plan(athleteId), (old: any) => {
                    if (!old) return old;
                    return {
                        ...old,
                        meals: old.meals.map((m: any) => {
                            if (m.id === foodData.meal_id) {
                                return {
                                    ...m,
                                    foods: [...(m.foods || []), { 
                                        id: `temp-${Date.now()}`, 
                                        meal_id: m.id, 
                                        food_id: foodData.food_id, 
                                        amount_g: foodData.amount_g, 
                                        food: tempFood 
                                    }]
                                };
                            }
                            return m;
                        })
                    };
                });
            }
            return { previousPlan };
        },
        onError: (err, variables, context) => {
            if (context?.previousPlan) {
                queryClient.setQueryData(NUTRITION_KEYS.plan(variables.athleteId), context.previousPlan);
            }
            toast.error('Error al añadir alimento');
        },
        onSettled: (_, __, variables) => {
            queryClient.invalidateQueries({ queryKey: NUTRITION_KEYS.plan(variables.athleteId) });
        },
        onSuccess: () => {
            toast.success('Alimento añadido a la comida');
        },
    });
}

export function useRemoveFoodFromMeal() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ mealFoodId }: { mealFoodId: string, athleteId: string }) => 
            nutritionService.removeFoodFromMeal(mealFoodId),
        onMutate: async ({ mealFoodId, athleteId }) => {
            await queryClient.cancelQueries({ queryKey: NUTRITION_KEYS.plan(athleteId) });
            const previousPlan = queryClient.getQueryData(NUTRITION_KEYS.plan(athleteId));
            
            queryClient.setQueryData(NUTRITION_KEYS.plan(athleteId), (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    meals: old.meals.map((m: any) => ({
                        ...m,
                        foods: (m.foods || []).filter((f: any) => f.id !== mealFoodId)
                    }))
                };
            });
            return { previousPlan };
        },
        onError: (err, variables, context) => {
            if (context?.previousPlan) {
                queryClient.setQueryData(NUTRITION_KEYS.plan(variables.athleteId), context.previousPlan);
            }
            toast.error('Error al eliminar alimento');
        },
        onSettled: (_, __, variables) => {
            queryClient.invalidateQueries({ queryKey: NUTRITION_KEYS.plan(variables.athleteId) });
        },
        onSuccess: () => {
            toast.success('Alimento eliminado');
        },
    });
}

export function useUpdateBulkMealFoods() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ updates }: { updates: { id: string, amount_g: number }[], athleteId: string }) => 
            nutritionService.updateBulkMealFoods(updates),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: NUTRITION_KEYS.plan(variables.athleteId) });
            toast.success('Cantidades ajustadas');
        },
        onError: () => toast.error('Error al ajustar cantidades'),
    });
}
