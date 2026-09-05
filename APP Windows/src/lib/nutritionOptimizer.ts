import { FoodItem } from '../types/nutrition';

interface MacroTargets {
    carbs: number;
    protein: number;
    fats: number;
}

export interface OptimizerOption {
    id: string;
    name: string;
    amounts: Record<string, number>;
}

/**
 * Optimizador de Nutrición ANVIL v2
 * Proporciona 3 opciones matemáticas precisas.
 */
export function optimizeMealQuantities(
    foods: FoodItem[],
    targets: MacroTargets,
    currentAmounts: Record<string, number> = {}
): { options: OptimizerOption[]; error?: string } {
    if (foods.length === 0) return { options: [], error: 'Añade alimentos primero' };

    // Validar si hay fuentes para los macros solicitados
    const hasCarbSource = foods.some(f => (f.carbohydrates_100g || 0) > 2);
    const hasProtSource = foods.some(f => (f.proteins_100g || 0) > 2);
    const hasFatSource = foods.some(f => (f.fat_100g || 0) > 2);

    if (targets.carbs > 0 && !hasCarbSource) return { options: [], error: 'Añade una fuente de Carbohidratos' };
    if (targets.protein > 0 && !hasProtSource) return { options: [], error: 'Añade una fuente de Proteína' };
    if (targets.fats > 0 && !hasFatSource) return { options: [], error: 'Añade una fuente de Grasas' };

    const roundAmount = (amount: number, isFat: boolean) => {
        if (amount < 0) return 0;
        if (isFat) return Math.round(amount);
        return Math.round(amount / 5) * 5;
    };

    const isFatty = (f: FoodItem) => f.fat_100g > 30 || (f.fat_100g > f.proteins_100g && f.fat_100g > f.carbohydrates_100g);

    // Identificar fuentes primarias (donde el macro es predominante o significativo)
    const pSources = foods.filter(f => f.proteins_100g >= f.carbohydrates_100g && f.proteins_100g >= f.fat_100g);
    const cSources = foods.filter(f => f.carbohydrates_100g > f.proteins_100g && f.carbohydrates_100g >= f.fat_100g);
    const fSources = foods.filter(f => f.fat_100g > f.proteins_100g && f.fat_100g > f.carbohydrates_100g);

    // Fallbacks si las listas filtradas están vacías
    const finalPSources = pSources.length > 0 ? pSources : [foods.sort((a, b) => b.proteins_100g - a.proteins_100g)[0]];
    const finalCSources = cSources.length > 0 ? cSources : [foods.sort((a, b) => b.carbohydrates_100g - a.carbohydrates_100g)[0]];
    const finalFSources = fSources.length > 0 ? fSources : [foods.sort((a, b) => b.fat_100g - a.fat_100g)[0]];

    // --- OPCIÓN A: MANTENIMIENTO DE PROPORCIONES ---
    // Escala los gramos actuales basándose en el ratio de calorías total necesario.
    const optA: Record<string, number> = {};
    const currentKcal = foods.reduce((acc, f) => acc + ((currentAmounts[f.code] || 0) * f['energy-kcal_100g'] / 100), 0);
    const targetKcal = (targets.protein * 4) + (targets.carbs * 4) + (targets.fats * 9);
    
    if (currentKcal > 0) {
        const ratio = targetKcal / currentKcal;
        foods.forEach(f => {
            optA[f.code] = roundAmount((currentAmounts[f.code] || 0) * ratio, isFatty(f));
        });
    } else {
        // Si no hay cantidades previas, Option A es igual a B
        foods.forEach(f => optA[f.code] = 0);
    }

    // --- OPCIÓN B: DIVISIÓN EQUITATIVA P/C/G ---
    // Divide los objetivos macro entre las fuentes correspondientes ignorando trazas para precisión.
    const optB: Record<string, number> = {};
    foods.forEach(f => optB[f.code] = 0);

    const calcEquit = (sources: FoodItem[], target: number, field: keyof FoodItem) => {
        if (target <= 0) return;
        const perSource = target / sources.length;
        sources.forEach(f => {
            const val = f[field] as number;
            if (val > 0) {
                optB[f.code] += (perSource / val) * 100;
            }
        });
    };

    calcEquit(finalPSources, targets.protein, 'proteins_100g');
    calcEquit(finalCSources, targets.carbs, 'carbohydrates_100g');
    calcEquit(finalFSources, targets.fats, 'fat_100g');
    
    foods.forEach(f => optB[f.code] = roundAmount(optB[f.code], isFatty(f)));

    // --- OPCIÓN C: PRIORIZADO (EL MEJOR DE CADA) ---
    // Selecciona solo la mejor fuente de cada macro y ajusta a esa.
    const optC: Record<string, number> = {};
    foods.forEach(f => optC[f.code] = 0);

    const bestP = finalPSources[0];
    const bestC = finalCSources[0];
    const bestF = finalFSources[0];

    if (bestP) optC[bestP.code] += (targets.protein / bestP.proteins_100g) * 100;
    if (bestC) optC[bestC.code] += (targets.carbs / bestC.carbohydrates_100g) * 100;
    if (bestF) optC[bestF.code] += (targets.fats / bestF.fat_100g) * 100;

    foods.forEach(f => optC[f.code] = roundAmount(optC[f.code], isFatty(f)));

    return {
        options: [
            { id: 'opt_proportional', name: 'Escalado Proporcional', amounts: optA },
            { id: 'opt_equitable', name: 'División Equitativa', amounts: optB },
            { id: 'opt_unified', name: 'Fuentes Principales', amounts: optC }
        ]
    };
}
