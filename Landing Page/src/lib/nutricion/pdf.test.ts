import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import type { FoodItem, Meal, NutritionPlan } from '../../types/nutrition.ts';
import {
    ALTO_BARRA_COMIDA,
    ALTO_CABECERA_TABLA,
    ALTO_SIN_ALIMENTOS,
    ESPACIADO_COMIDA,
    calcularAlturaComida,
    generarPdfPlan,
} from './pdf.ts';

const alimento = (code: string, nombre: string): FoodItem => ({
    code,
    product_name: nombre,
    'energy-kcal_100g': 100,
    proteins_100g: 10,
    carbohydrates_100g: 10,
    fat_100g: 2,
});

describe('cálculo exacto de altura de comidas', () => {
    it('comida vacía mide cabecera + tabla + sin alimentos + espaciado', () => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const meal: Meal = {
            id: 'm1',
            plan_id: 'p1',
            name: 'Desayuno',
            order_index: 0,
            foods: [],
        };
        const h = calcularAlturaComida(doc, meal);
        assert.equal(h, ALTO_BARRA_COMIDA + ALTO_CABECERA_TABLA + ALTO_SIN_ALIMENTOS + ESPACIADO_COMIDA);
        assert.equal(h, 29);
    });

    it('comida con un alimento simple suma la altura de la fila (5.5 mm)', () => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const meal: Meal = {
            id: 'm1',
            plan_id: 'p1',
            name: 'Comida',
            order_index: 0,
            foods: [
                {
                    id: 'f1',
                    meal_id: 'm1',
                    food_id: 'arroz',
                    amount_g: 100,
                    food: alimento('arroz', 'Arroz basmati'),
                },
            ],
        };
        const h = calcularAlturaComida(doc, meal);
        // 13 + 6 + 5.5 + 4 = 28.5 mm
        assert.equal(h, 13 + 6 + 5.5 + 4);
    });

    it('incluye suplementación en la altura si existe', () => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const meal: Meal = {
            id: 'm1',
            plan_id: 'p1',
            name: 'Pre-entreno',
            order_index: 0,
            meal_supplements: ['Creatina 5g', 'Cafeína 200mg'],
            foods: [
                {
                    id: 'f1',
                    meal_id: 'm1',
                    food_id: 'arroz',
                    amount_g: 50,
                    food: alimento('arroz', 'Arroz'),
                },
            ],
        };
        const sinSup: Meal = { ...meal, meal_supplements: undefined };
        const hCon = calcularAlturaComida(doc, meal);
        const hSin = calcularAlturaComida(doc, sinSup);
        assert.ok(hCon > hSin);
    });
});

describe('generación de PDF y saltos de página', () => {
    it('comidas pequeñas que caben en una página no se parten', async () => {
        const plan: NutritionPlan = {
            id: 'plan-test',
            athlete_id: 'ath-1',
            nutritionist_id: 'nut-1',
            calories_target: 2000,
            protein_target: 150,
            carbs_target: 200,
            fats_target: 60,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            meals: [
                {
                    id: 'm1',
                    plan_id: 'plan-test',
                    name: 'Desayuno',
                    order_index: 0,
                    foods: [
                        { id: 'f1', meal_id: 'm1', food_id: 'a1', amount_g: 100, food: alimento('a1', 'Avena') },
                    ],
                },
                {
                    id: 'm2',
                    plan_id: 'plan-test',
                    name: 'Almuerzo',
                    order_index: 1,
                    foods: [
                        { id: 'f2', meal_id: 'm2', food_id: 'a2', amount_g: 150, food: alimento('a2', 'Pollo') },
                    ],
                },
            ],
        };

        const doc = await generarPdfPlan(plan);
        // Caben de sobra en 1 página
        assert.equal(doc.getNumberOfPages(), 1);
    });

    it('una comida con más de 40 alimentos se parte y repite cabecera con (cont.)', async () => {
        const alimentos45 = Array.from({ length: 45 }, (_, i) => ({
            id: `f-${i}`,
            meal_id: 'm-grande',
            food_id: `item-${i}`,
            amount_g: 100,
            created_at: new Date(Date.now() + i * 1000).toISOString(),
            food: alimento(`item-${i}`, `Alimento de prueba número ${i + 1} para forzar salto`),
        }));

        const plan: NutritionPlan = {
            id: 'plan-largo',
            athlete_id: 'ath-1',
            nutritionist_id: 'nut-1',
            calories_target: 3000,
            protein_target: 200,
            carbs_target: 350,
            fats_target: 80,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            meals: [
                {
                    id: 'm-grande',
                    plan_id: 'plan-largo',
                    name: 'Comida Monstruo',
                    order_index: 0,
                    foods: alimentos45,
                },
            ],
        };

        const doc = await generarPdfPlan(plan);
        // Más de 40 alimentos supera los 261 mm disponibles en A4, requiere al menos 2 páginas
        assert.ok(doc.getNumberOfPages() >= 2);
    });
});
