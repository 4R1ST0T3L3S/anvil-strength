import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NutritionPlanEditor } from '../nutrition/components/NutritionPlanEditor';
import { AthleteNutritionView } from '../athlete/components/AthleteNutritionView';
import { fijarEsquemaParaVistaPrevia } from '../../services/nutritionService';
import type { FoodItem, MealFood, NutritionPlan } from '../../types/nutrition';
import type { UserProfile } from '../../hooks/useUser';

/**
 * BANCO DE PRUEBAS DE NUTRICIÓN — SOLO EN DESARROLLO (`/dev/nutricion`).
 *
 * El editor de planes y la vista del atleta montados con un plan de
 * mentira, sin sesión y sin base de datos: la caché de React Query viene
 * ya rellena. Guardar no hace nada (no hay sesión), pero se puede ver y
 * medir todo, incluidos los tipos de día.
 *
 *   /dev/nutricion              editor, con tipos de día
 *   /dev/nutricion?vista=atleta lo que ve el atleta
 *   /dev/nutricion?dias=0       como si la base aún no tuviera la migración
 */

const NUTRI = { id: 'demo-nutri', full_name: 'Nutri de Prueba', role: 'nutritionist', roles: ['nutritionist'], has_access: true } as unknown as UserProfile;
const ATLETA = { id: 'demo-atleta', full_name: 'Atleta de Prueba', role: 'athlete', roles: ['athlete'], has_access: true } as unknown as UserProfile;

const A = (code: string, nombre: string, kcal: number, p: number, c: number, g: number, extra: Partial<FoodItem> = {}): FoodItem => ({
    code, product_name: nombre, 'energy-kcal_100g': kcal, proteins_100g: p, carbohydrates_100g: c, fat_100g: g, is_generic: true, source: 'bedca', ...extra,
});

const AVENA = A('bedca-avena', 'Avena, cruda', 399, 16.9, 66.3, 6.9);
const CREMA_ARROZ = A('off-crema', 'Crema de arroz', 369, 7.5, 83, 0.8, { is_generic: false, brands: 'HSN' });
const PROTE = A('off-whey', 'Proteína de suero', 363, 78, 5.8, 3.3, { is_generic: false, brands: 'HSN' });
const ARANDANOS = A('bedca-arandano', 'Arándanos', 57, 0.7, 12, 0.3);
const ARROZ = A('bedca-arroz', 'Arroz', 386, 7, 86, 0.9);
const PASTA = A('bedca-pasta', 'Pasta alimenticia, cruda', 359, 12, 72, 1.5);
const POLLO = A('usda-pollo', 'Pollo, pechuga sin piel, cruda', 120, 22.5, 0, 2.6, { source: 'usda' });
const TERNERA = A('usda-ternera', 'Ternera, magra, cruda', 136, 21.4, 0, 5.5, { source: 'usda' });
const ACEITE = A('bedca-aove', 'Aceite de oliva virgen extra', 884, 0, 0, 100);
const BROCOLI = A('bedca-brocoli', 'Brócoli, crudo', 33, 3, 2.8, 0.4);
const PATATA = A('bedca-patata', 'Patata, cruda', 72, 2.2, 15.2, 0.2);
const MERLUZA = A('bedca-merluza', 'Merluza fresca', 64, 11.9, 0, 1.8);
// Un producto con la etiqueta rota, para ver el aviso.
const ATUN_MALO = A('off-atun', 'Atún claro al natural', 0, 16.7, 0, 0.63, { is_generic: false, brands: 'Hacendado' });
const YOGUR = A('off-yogur', 'Yogur proteico natural', 60, 10, 4, 0.2, { is_generic: false, brands: 'Danone' });

let n = 0;
const fila = (meal: string, food: FoodItem, g: number, categoria: string, grupo: string, descanso?: number): MealFood => {
    n += 1;
    const id = `mf-${n}`;
    return {
        id, meal_id: meal, food_id: food.code, amount_g: g, category: categoria, alternative_group_id: grupo,
        created_at: `2026-10-21T10:00:${String(n).padStart(2, '0')}Z`, food,
        day_amounts: descanso === undefined ? [] : [{ meal_food_id: id, day_type_id: 'dia-descanso', amount_g: descanso }],
    };
};

const PLAN: NutritionPlan = {
    id: 'plan-demo',
    athlete_id: 'demo-atleta',
    nutritionist_id: 'demo-nutri',
    calories_target: 2600,
    protein_target: 170,
    carbs_target: 320,
    fats_target: 70,
    base_day_name: 'Día de entreno',
    status: 'active',
    training_block_id: 'Fuerza, bloque 2',
    tags: ['Volumen'],
    general_guidelines: ['Beber 3 litros de agua al día', 'Pesar los alimentos en crudo'],
    global_supplements: ['5 g de creatina al día'],
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-21T10:00:00Z',
    day_types: [{ id: 'dia-descanso', plan_id: 'plan-demo', name: 'Día de descanso', calories_target: 2250, protein_target: 170, carbs_target: 230, fats_target: 75, order_index: 1 }],
    meals: [
        {
            id: 'm1', plan_id: 'plan-demo', name: 'Desayuno', time: '08:00', order_index: 0, meal_supplements: [],
            foods: [
                fila('m1', AVENA, 80, 'Carbohidratos', 'g1', 60),
                fila('m1', CREMA_ARROZ, 85, 'Carbohidratos', 'g1', 65),
                fila('m1', PROTE, 30, 'Proteínas', 'g2', 30),
                fila('m1', ARANDANOS, 100, 'Frutas', 'g3', 100),
                fila('m1', YOGUR, 125, 'Proteínas', 'g4', 125),
            ],
        },
        {
            id: 'm2', plan_id: 'plan-demo', name: 'Comida', time: '14:00', order_index: 1, meal_supplements: [],
            foods: [
                fila('m2', ARROZ, 110, 'Carbohidratos', 'g5', 80),
                fila('m2', PASTA, 120, 'Carbohidratos', 'g5', 85),
                fila('m2', POLLO, 180, 'Proteínas', 'g6', 180),
                fila('m2', TERNERA, 170, 'Proteínas', 'g6', 170),
                fila('m2', ACEITE, 12, 'Grasas', 'g7', 14),
                fila('m2', BROCOLI, 150, 'Verduras', 'g8', 150),
            ],
        },
        {
            id: 'm3', plan_id: 'plan-demo', name: 'Cena', time: '21:30', order_index: 2, meal_supplements: ['Magnesio 300 mg'],
            foods: [
                fila('m3', PATATA, 350, 'Carbohidratos', 'g9', 250),
                fila('m3', MERLUZA, 220, 'Proteínas', 'g10', 220),
                fila('m3', ATUN_MALO, 180, 'Proteínas', 'g10', 180),
                fila('m3', ACEITE, 10, 'Grasas', 'g11', 12),
            ],
        },
    ],
};

export function NutricionPreview() {
    const parametros = new URLSearchParams(window.location.search);
    const vista = parametros.get('vista') === 'atleta' ? 'atleta' : 'editor';
    const conDias = parametros.get('dias') !== '0';
    const [cliente] = useState(() => {
        fijarEsquemaParaVistaPrevia(conDias);
        const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false } } });
        const usuario = vista === 'atleta' ? ATLETA : NUTRI;
        qc.setQueryData(['user'], usuario);
        const plan = conDias ? PLAN : { ...PLAN, day_types: [] };
        qc.setQueryData(['nutritionPlan', 'demo-atleta'], plan);
        return qc;
    });

    return (
        <QueryClientProvider client={cliente}>
            <div className="min-h-[100dvh] bg-surface-canvas">
                {vista === 'atleta' ? (
                    <AthleteNutritionView user={ATLETA} />
                ) : (
                    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
                        <h1 className="mb-5 text-t-2xl font-semibold text-ink">Atleta de Prueba</h1>
                        <NutritionPlanEditor athleteId="demo-atleta" athleteName="Atleta de Prueba" />
                    </div>
                )}
            </div>
        </QueryClientProvider>
    );
}
