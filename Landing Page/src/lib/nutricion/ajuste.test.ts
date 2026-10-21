import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FoodItem, MealFood } from '../../types/nutrition.ts';
import { ajustarCantidades, limitesDe, repartirObjetivo } from './ajuste.ts';
import { agruparAlimentos, etiquetaDudosa, gramosEquivalentes, macrosDe, por100, totalesDeGrupos } from './macros.ts';

const alimento = (code: string, kcal: number, p: number, c: number, g: number): FoodItem => ({
    code,
    product_name: code,
    'energy-kcal_100g': kcal,
    proteins_100g: p,
    carbohydrates_100g: c,
    fat_100g: g,
});

// Valores de tabla (BEDCA/USDA, redondeados), crudos.
const ARROZ = alimento('arroz', 354, 7, 77, 0.6);
const POLLO = alimento('pollo', 112, 23, 0, 1.6);
const ACEITE = alimento('aceite', 899, 0, 0, 99.9);
const BROCOLI = alimento('brocoli', 34, 2.8, 4.4, 0.4);
const AVENA = alimento('avena', 372, 13, 60, 7);
const CLARAS = alimento('claras', 48, 11, 0.7, 0.2);
const PLATANO = alimento('platano', 94, 1.2, 20, 0.3);
const YOGUR = alimento('yogur', 60, 10, 4, 0.2);

describe('calorías de la etiqueta', () => {
    it('una etiqueta coherente se respeta', () => {
        assert.equal(por100(ARROZ).kcal, 354);
        assert.equal(etiquetaDudosa(ARROZ), false);
    });
    it('0 kcal con macros es un error de etiqueta: se calcula', () => {
        const atun = alimento('atun', 0, 16.7, 0, 0.63);
        assert.equal(etiquetaDudosa(atun), true);
        assert.ok(Math.abs(por100(atun).kcal - (16.7 * 4 + 0.63 * 9)) < 0.01);
    });
    it('un brócoli de 118 kcal se corrige', () => {
        const malo = alimento('brocoli-malo', 118, 2.4, 3.1, 0);
        assert.equal(etiquetaDudosa(malo), true);
        assert.ok(por100(malo).kcal < 25);
    });
    it('macros de una cantidad', () => {
        const m = macrosDe(POLLO, 150);
        assert.ok(Math.abs(m.proteina - 34.5) < 1e-9);
    });
});

describe('grupos y alternativas', () => {
    const fila = (id: string, food: FoodItem, g: number, grupo: string, creado: string, categoria = 'Carbohidratos'): MealFood => ({
        id, meal_id: 'm', food_id: food.code, amount_g: g, alternative_group_id: grupo, created_at: creado, category: categoria, food,
    });

    it('la primera fila creada de cada grupo es la principal, aunque llegue desordenada', () => {
        const grupos = agruparAlimentos([
            fila('b', AVENA, 80, 'g1', '2026-10-21T10:00:01Z'),
            fila('a', ARROZ, 60, 'g1', '2026-10-21T10:00:00Z'),
            fila('c', POLLO, 120, 'g2', '2026-10-21T10:00:02Z', 'Proteínas'),
        ]);
        assert.equal(grupos.length, 2);
        assert.equal(grupos[0].principal.id, 'a');
        assert.deepEqual(grupos[0].alternativas.map((x) => x.id), ['b']);
    });

    it('las alternativas NO suman en el total', () => {
        const grupos = agruparAlimentos([
            fila('a', ARROZ, 100, 'g1', '1'),
            fila('b', AVENA, 100, 'g1', '2'),
        ]);
        assert.equal(Math.round(totalesDeGrupos(grupos).kcal), 354);
    });

    it('equivalencia por hidrato en el hueco de carbohidratos', () => {
        // 100 g de arroz (77 g HC) ≈ 128 g de avena (60 g HC/100) → 130.
        assert.equal(gramosEquivalentes(ARROZ, 100, AVENA, 'Carbohidratos'), 130);
    });

    it('equivalencia por proteína en el hueco de proteínas', () => {
        // 150 g de pollo (34,5 g P) ≈ 314 g de claras → 315.
        assert.equal(gramosEquivalentes(POLLO, 150, CLARAS, 'Proteínas'), 315);
    });

    it('si la alternativa no tiene el macro, se iguala por calorías', () => {
        // Pollo por plátano en "Proteínas": no tiene sentido por proteína.
        const g = gramosEquivalentes(POLLO, 100, PLATANO, 'Proteínas');
        assert.equal(g, 120);
    });
});

describe('ajuste automático', () => {
    const comida = () => [
        { id: 'arroz', alimento: ARROZ, gramos: 80, categoria: 'Carbohidratos' },
        { id: 'pollo', alimento: POLLO, gramos: 150, categoria: 'Proteínas' },
        { id: 'aceite', alimento: ACEITE, gramos: 10, categoria: 'Grasas' },
        { id: 'brocoli', alimento: BROCOLI, gramos: 150, categoria: 'Verduras' },
    ];

    it('cuadra una comida típica a menos de un 5 % en cada macro', () => {
        const objetivo = { kcal: 900, proteina: 55, carbos: 105, grasas: 25 };
        const r = ajustarCantidades(comida(), objetivo);
        for (const k of ['proteina', 'carbos', 'grasas'] as const) {
            assert.ok(Math.abs(r.desvio[k]) < 0.05, `${k}: ${r.desvio[k]}`);
        }
        assert.deepEqual(r.avisos, []);
    });

    it('redondea a 5 g, y a 1 g lo pequeño y el aceite', () => {
        const r = ajustarCantidades(comida(), { kcal: 900, proteina: 55, carbos: 105, grasas: 25 });
        assert.equal(r.gramos.arroz % 5, 0);
        assert.equal(r.gramos.pollo % 5, 0);
        assert.ok(Number.isInteger(r.gramos.aceite));
    });

    it('la verdura apenas se mueve: no es la palanca', () => {
        const r = ajustarCantidades(comida(), { kcal: 1400, proteina: 80, carbos: 170, grasas: 40 });
        const [min, max] = limitesDe(comida()[3]);
        assert.ok(r.gramos.brocoli >= min && r.gramos.brocoli <= max);
    });

    it('lo bloqueado no se toca', () => {
        const vars = [
            { id: 'avena', alimento: AVENA, gramos: 60, categoria: 'Carbohidratos' },
            { id: 'yogur', alimento: YOGUR, gramos: 125, categoria: 'Proteínas', bloqueado: true },
            { id: 'claras', alimento: CLARAS, gramos: 150, categoria: 'Proteínas' },
        ];
        const r = ajustarCantidades(vars, { kcal: 600, proteina: 45, carbos: 70, grasas: 8 });
        assert.equal(r.gramos.yogur, 125);
    });

    it('sin fuente de grasa lo dice en vez de inventar', () => {
        const vars = [
            { id: 'arroz', alimento: ARROZ, gramos: 80, categoria: 'Carbohidratos' },
            { id: 'claras', alimento: CLARAS, gramos: 150, categoria: 'Proteínas' },
        ];
        const r = ajustarCantidades(vars, { kcal: 900, proteina: 40, carbos: 100, grasas: 30 });
        assert.ok(r.avisos.some((a) => a.includes('grasa')));
    });

    it('respeta las proporciones del nutricionista cuando hay margen', () => {
        // Dos carbohidratos casi iguales: el ajuste no debe quitar uno entero.
        const vars = [
            { id: 'arroz', alimento: ARROZ, gramos: 60, categoria: 'Carbohidratos' },
            { id: 'avena', alimento: AVENA, gramos: 60, categoria: 'Carbohidratos' },
            { id: 'pollo', alimento: POLLO, gramos: 120, categoria: 'Proteínas' },
        ];
        const r = ajustarCantidades(vars, { kcal: 0, proteina: 45, carbos: 140, grasas: 0 });
        assert.ok(r.gramos.arroz > 40 && r.gramos.avena > 40, JSON.stringify(r.gramos));
    });

    it('sin alimentos, avisa', () => {
        const r = ajustarCantidades([], { kcal: 500, proteina: 30, carbos: 50, grasas: 15 });
        assert.equal(r.avisos.length, 1);
    });
});

describe('reparto del día entre comidas', () => {
    it('en la proporción de calorías que ya tienen', () => {
        const r = repartirObjetivo({ kcal: 2000, proteina: 150, carbos: 200, grasas: 60 }, [500, 1500]);
        assert.equal(r[0].kcal, 500);
        assert.equal(r[1].proteina, 112.5);
    });
    it('a partes iguales si están vacías', () => {
        const r = repartirObjetivo({ kcal: 2000, proteina: 150, carbos: 200, grasas: 60 }, [0, 0, 0, 0]);
        assert.equal(r[2].kcal, 500);
    });
});
