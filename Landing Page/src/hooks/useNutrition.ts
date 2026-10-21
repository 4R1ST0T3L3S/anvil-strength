import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nutritionService } from '../services/nutritionService';
import { NutritionPlan, Meal, MealFood, FoodItem, MealFoodDayAmount, NutritionDayType } from '../types/nutrition';
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
        enabled: searchQuery.trim().length > 1,
        staleTime: 1000 * 60 * 5,
        placeholderData: (previo) => previo,
    });
}

/**
 * Una mutación que, al terminar, vuelve a pedir el plan del atleta. Es la
 * forma de casi todas las de este fichero; antes estaba copiada nueve
 * veces con nueve variantes del mismo `invalidateQueries`.
 *
 * `exito` es opcional a propósito: un cambio de gramos que se guarda solo
 * no necesita un aviso cada vez (el número ya ha cambiado en pantalla), y
 * una lluvia de toasts al teclear es ruido.
 */
function useMutacionDelPlan<V extends { athleteId: string }, R = unknown>(
    fn: (v: V) => Promise<R>,
    mensajes: { exito?: string; error: string },
    optimista?: (plan: NutritionPlan, v: V) => NutritionPlan
) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onMutate: async (v: V) => {
            if (!optimista) return {};
            const clave = NUTRITION_KEYS.plan(v.athleteId);
            await queryClient.cancelQueries({ queryKey: clave });
            const previo = queryClient.getQueryData<NutritionPlan | null>(clave);
            if (previo) queryClient.setQueryData(clave, optimista(previo, v));
            return { previo };
        },
        onError: (_e, v, ctx) => {
            const previo = (ctx as { previo?: NutritionPlan | null } | undefined)?.previo;
            if (previo) queryClient.setQueryData(NUTRITION_KEYS.plan(v.athleteId), previo);
            toast.error(mensajes.error);
        },
        onSuccess: () => {
            if (mensajes.exito) toast.success(mensajes.exito);
        },
        onSettled: (_r, _e, v) => {
            queryClient.invalidateQueries({ queryKey: NUTRITION_KEYS.plan(v.athleteId) });
        },
    });
}

/** Cambia un alimento dentro del plan cacheado (para las mutaciones optimistas). */
function conAlimento(plan: NutritionPlan, id: string, cambio: (f: MealFood) => MealFood): NutritionPlan {
    return {
        ...plan,
        meals: (plan.meals ?? []).map((m) => ({ ...m, foods: (m.foods ?? []).map((f) => (f.id === id ? cambio(f) : f)) })),
    };
}

// ==========================================
// PLAN
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
    return useMutacionDelPlan(
        ({ planId, updates }: { planId: string; updates: Partial<NutritionPlan>; athleteId: string }) =>
            nutritionService.updateNutritionPlan(planId, updates),
        { exito: 'Plan actualizado', error: 'Error al actualizar el plan' },
        (plan, { updates }) => ({ ...plan, ...updates })
    );
}

// ==========================================
// TIPOS DE DÍA
// ==========================================

export function useCreateDayType() {
    return useMutacionDelPlan(
        async ({ dayType, cantidades }: { dayType: Omit<NutritionDayType, 'id' | 'created_at'>; cantidades?: (id: string) => MealFoodDayAmount[]; athleteId: string }) => {
            const creado = await nutritionService.createDayType(dayType);
            if (cantidades) await nutritionService.upsertDayAmounts(cantidades(creado.id));
            return creado;
        },
        { exito: 'Tipo de día creado', error: 'No se pudo crear el tipo de día' }
    );
}

export function useUpdateDayType() {
    return useMutacionDelPlan(
        ({ id, updates }: { id: string; updates: Partial<NutritionDayType>; athleteId: string }) =>
            nutritionService.updateDayType(id, updates),
        { error: 'No se pudo guardar el tipo de día' },
        (plan, { id, updates }) => ({ ...plan, day_types: (plan.day_types ?? []).map((d) => (d.id === id ? { ...d, ...updates } : d)) })
    );
}

export function useDeleteDayType() {
    return useMutacionDelPlan(
        ({ id }: { id: string; athleteId: string }) => nutritionService.deleteDayType(id),
        { exito: 'Tipo de día eliminado', error: 'No se pudo eliminar el tipo de día' },
        (plan, { id }) => ({ ...plan, day_types: (plan.day_types ?? []).filter((d) => d.id !== id) })
    );
}

// ==========================================
// CANTIDADES (día base o tipo de día)
// ==========================================

/**
 * Guarda gramos de varios alimentos a la vez en el día que toque: en el
 * base van a `meal_foods.amount_g`; en un tipo de día, a
 * `meal_food_day_amounts`. Es lo que usan el ajuste automático, la edición
 * a mano y el recálculo de alternativas.
 */
export function useGuardarCantidades() {
    return useMutacionDelPlan(
        async ({ dia, cambios }: { dia: string | null; cambios: { id: string; amount_g: number }[]; athleteId: string; mensaje?: string }) => {
            if (dia) {
                await nutritionService.upsertDayAmounts(cambios.map((c) => ({ meal_food_id: c.id, day_type_id: dia, amount_g: c.amount_g })));
            } else {
                await nutritionService.updateBulkMealFoods(cambios);
            }
        },
        { error: 'No se pudieron guardar las cantidades' },
        (plan, { dia, cambios }) => {
            const porId = new Map(cambios.map((c) => [c.id, c.amount_g]));
            return {
                ...plan,
                meals: (plan.meals ?? []).map((m) => ({
                    ...m,
                    foods: (m.foods ?? []).map((f) => {
                        const g = porId.get(f.id);
                        if (g === undefined) return f;
                        if (!dia) return { ...f, amount_g: g };
                        const otros = (f.day_amounts ?? []).filter((d) => d.day_type_id !== dia);
                        return { ...f, day_amounts: [...otros, { meal_food_id: f.id, day_type_id: dia, amount_g: g }] };
                    }),
                })),
            };
        }
    );
}

// ==========================================
// COMIDAS
// ==========================================

export function useCreateMeal() {
    return useMutacionDelPlan(
        ({ mealData }: { mealData: Partial<Meal>; athleteId: string }) => nutritionService.createMeal(mealData),
        { exito: 'Comida añadida', error: 'Error al añadir comida' }
    );
}

export function useUpdateMeal() {
    return useMutacionDelPlan(
        ({ mealId, updates }: { mealId: string; updates: Partial<Meal>; athleteId: string }) => nutritionService.updateMeal(mealId, updates),
        { error: 'No se pudo guardar la comida' },
        (plan, { mealId, updates }) => ({ ...plan, meals: (plan.meals ?? []).map((m) => (m.id === mealId ? { ...m, ...updates } : m)) })
    );
}

export function useReorderMeals() {
    return useMutacionDelPlan(
        ({ orden }: { orden: { id: string; order_index: number }[]; athleteId: string }) => nutritionService.reorderMeals(orden),
        { error: 'No se pudo reordenar' },
        (plan, { orden }) => {
            const idx = new Map(orden.map((o) => [o.id, o.order_index]));
            return {
                ...plan,
                meals: [...(plan.meals ?? [])]
                    .map((m) => ({ ...m, order_index: idx.get(m.id) ?? m.order_index }))
                    .sort((a, b) => a.order_index - b.order_index),
            };
        }
    );
}

export function useDuplicateMeal() {
    return useMutacionDelPlan(
        ({ meal, orderIndex }: { meal: Meal; orderIndex: number; athleteId: string }) => nutritionService.duplicateMeal(meal, orderIndex),
        { exito: 'Comida duplicada', error: 'No se pudo duplicar la comida' }
    );
}

export function useDeleteMeal() {
    return useMutacionDelPlan(
        ({ mealId }: { mealId: string; athleteId: string }) => nutritionService.deleteMeal(mealId),
        { exito: 'Comida eliminada', error: 'Error al eliminar comida' },
        (plan, { mealId }) => ({ ...plan, meals: (plan.meals ?? []).filter((m) => m.id !== mealId) })
    );
}

// ==========================================
// ALIMENTOS
// ==========================================

export function useAddFoodToMeal() {
    return useMutacionDelPlan(
        ({ foodData }: { foodData: Partial<MealFood>; athleteId: string; tempFood?: FoodItem }) => nutritionService.addFoodToMeal(foodData),
        { error: 'Error al añadir alimento' },
        (plan, { foodData, tempFood }) =>
            tempFood
                ? {
                    ...plan,
                    meals: (plan.meals ?? []).map((m) =>
                        m.id === foodData.meal_id
                            ? {
                                ...m,
                                foods: [
                                    ...(m.foods ?? []),
                                    {
                                        id: `temp-${Date.now()}`,
                                        meal_id: m.id,
                                        food_id: foodData.food_id ?? tempFood.code,
                                        amount_g: Number(foodData.amount_g ?? 0),
                                        category: foodData.category,
                                        alternative_group_id: foodData.alternative_group_id,
                                        created_at: new Date().toISOString(),
                                        food: tempFood,
                                    },
                                ],
                            }
                            : m
                    ),
                }
                : plan
    );
}

export function useUpdateMealFood() {
    return useMutacionDelPlan(
        ({ mealFoodId, updates }: { mealFoodId: string; updates: Partial<MealFood>; athleteId: string }) =>
            nutritionService.updateMealFood(mealFoodId, updates),
        { error: 'No se pudo guardar el alimento' },
        (plan, { mealFoodId, updates }) => conAlimento(plan, mealFoodId, (f) => ({ ...f, ...updates }))
    );
}

export function useRemoveFoodFromMeal() {
    return useMutacionDelPlan(
        ({ mealFoodId }: { mealFoodId: string; athleteId: string }) => nutritionService.removeFoodFromMeal(mealFoodId),
        { error: 'Error al eliminar alimento' },
        (plan, { mealFoodId }) => ({
            ...plan,
            meals: (plan.meals ?? []).map((m) => ({ ...m, foods: (m.foods ?? []).filter((f) => f.id !== mealFoodId) })),
        })
    );
}

/** @deprecated Usa `useGuardarCantidades`, que sabe de tipos de día. */
export function useUpdateBulkMealFoods() {
    return useMutacionDelPlan(
        ({ updates }: { updates: { id: string; amount_g: number }[]; athleteId: string }) => nutritionService.updateBulkMealFoods(updates),
        { exito: 'Cantidades ajustadas', error: 'Error al ajustar cantidades' }
    );
}
