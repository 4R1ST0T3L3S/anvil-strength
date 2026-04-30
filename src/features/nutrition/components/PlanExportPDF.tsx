import { NutritionPlan } from '../../../types/nutrition';

interface PlanExportPDFProps {
    plan: NutritionPlan;
    user: any;
    currentMacros: { kcal: number; prot: number; carbs: number; fats: number };
}

export function PlanExportPDF({ plan, user, currentMacros }: PlanExportPDFProps) {
    const meals = plan.meals || [];

    // Group foods by alternative_group_id within each meal
    const groupFoodsByAlternative = (foods: any[]) => {
        const groups: Record<string, any[]> = {};
        foods.forEach(mf => {
            const gid = mf.alternative_group_id || mf.id;
            if (!groups[gid]) groups[gid] = [];
            groups[gid].push(mf);
        });
        return Object.values(groups);
    };

    return (
        <div className="print-plan p-8 bg-white text-black min-h-screen font-sans" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* ===== PORTADA ===== */}
            <div className="text-center mb-8 border-b-4 border-black pb-6">
                <h1 className="text-4xl font-black uppercase tracking-widest mb-1">ANVIL POWER CLUB</h1>
                <p className="text-lg text-gray-500 uppercase tracking-wider">Plan Nutricional Personalizado</p>

                {plan.tags && plan.tags.length > 0 && (
                    <div className="flex justify-center gap-2 mt-4">
                        {plan.tags.map((tag, i) => (
                            <span key={i} className="bg-black text-white text-xs font-bold px-3 py-1 rounded-full uppercase">{tag}</span>
                        ))}
                    </div>
                )}

                {plan.training_block_id && (
                    <p className="mt-3 text-sm text-gray-600">
                        <strong>Bloque:</strong> {plan.training_block_id}
                    </p>
                )}
            </div>

            {/* Objetivos */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="border border-gray-300 rounded p-3 text-center">
                    <p className="text-xs text-gray-500 uppercase font-bold">Calorías</p>
                    <p className="text-2xl font-black">{plan.calories_target}</p>
                    <p className="text-xs text-gray-400">kcal/día</p>
                </div>
                <div className="border border-gray-300 rounded p-3 text-center">
                    <p className="text-xs text-blue-600 uppercase font-bold">Proteína</p>
                    <p className="text-2xl font-black text-blue-600">{plan.protein_target}g</p>
                </div>
                <div className="border border-gray-300 rounded p-3 text-center">
                    <p className="text-xs text-yellow-600 uppercase font-bold">Carbohidratos</p>
                    <p className="text-2xl font-black text-yellow-600">{plan.carbs_target}g</p>
                </div>
                <div className="border border-gray-300 rounded p-3 text-center">
                    <p className="text-xs text-orange-600 uppercase font-bold">Grasas</p>
                    <p className="text-2xl font-black text-orange-600">{plan.fats_target}g</p>
                </div>
            </div>

            {/* Pautas Generales */}
            {plan.general_guidelines && plan.general_guidelines.length > 0 && (
                <div className="mb-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h2 className="text-sm font-black uppercase tracking-wider mb-3 border-b border-gray-300 pb-2">📋 Pautas Generales</h2>
                    <ul className="space-y-1">
                        {plan.general_guidelines.map((g, i) => (
                            <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-gray-400 mt-0.5">•</span> {g}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Suplementación Global */}
            {plan.global_supplements && plan.global_supplements.length > 0 && (
                <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h2 className="text-sm font-black uppercase tracking-wider mb-3 border-b border-blue-200 pb-2">💊 Suplementación</h2>
                    <ul className="space-y-1">
                        {plan.global_supplements.map((s, i) => (
                            <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                                <span className="text-blue-400 mt-0.5">•</span> {s}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* ===== COMIDAS ===== */}
            <h2 className="text-lg font-black uppercase tracking-wider mb-4 border-b-2 border-black pb-2">Distribución de Comidas</h2>

            {meals.sort((a, b) => a.order_index - b.order_index).map(meal => {
                const foods = meal.foods || [];
                const groups = groupFoodsByAlternative(foods);
                const totals = foods.reduce((acc, mf) => {
                    if (!mf.food) return acc;
                    const mult = mf.amount_g / 100;
                    return {
                        kcal: acc.kcal + (mf.food['energy-kcal_100g'] * mult),
                        prot: acc.prot + (mf.food.proteins_100g * mult),
                        carbs: acc.carbs + (mf.food.carbohydrates_100g * mult),
                        fats: acc.fats + (mf.food.fat_100g * mult),
                    };
                }, { kcal: 0, prot: 0, carbs: 0, fats: 0 });

                return (
                    <div key={meal.id} className="mb-6 break-inside-avoid">
                        <div className="flex justify-between items-center bg-gray-100 px-4 py-2 rounded-t border border-gray-300 border-b-0">
                            <h3 className="font-black uppercase text-sm">{meal.name}</h3>
                            <div className="flex gap-4 text-xs">
                                <span className="font-bold">{Math.round(totals.kcal)} kcal</span>
                                <span className="text-blue-600">{Math.round(totals.prot)}g P</span>
                                <span className="text-yellow-600">{Math.round(totals.carbs)}g HC</span>
                                <span className="text-orange-600">{Math.round(totals.fats)}g G</span>
                            </div>
                        </div>

                        <table className="w-full text-sm border border-gray-300 border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                                    <th className="text-left px-3 py-1 border-b border-gray-200">Categoría</th>
                                    <th className="text-left px-3 py-1 border-b border-gray-200">Alimento</th>
                                    <th className="text-right px-3 py-1 border-b border-gray-200">Cantidad</th>
                                    <th className="text-right px-3 py-1 border-b border-gray-200">Kcal</th>
                                    <th className="text-right px-3 py-1 border-b border-gray-200">P</th>
                                    <th className="text-right px-3 py-1 border-b border-gray-200">HC</th>
                                    <th className="text-right px-3 py-1 border-b border-gray-200">G</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((group, gIdx) => (
                                    group.map((mf: any, idx: number) => {
                                        if (!mf.food) return null;
                                        const mult = mf.amount_g / 100;
                                        return (
                                            <tr key={mf.id} className={`${idx > 0 ? 'bg-green-50 text-green-800' : ''} border-b border-gray-100`}>
                                                <td className="px-3 py-1.5 text-xs text-gray-500">
                                                    {idx === 0 ? (mf.category || 'Otros') : '↳ Alternativa'}
                                                </td>
                                                <td className="px-3 py-1.5 font-medium">
                                                    {idx > 0 && <span className="text-green-600 mr-1">ó</span>}
                                                    {mf.food.product_name}
                                                    {mf.food.brands && <span className="text-gray-400 text-xs ml-1">({mf.food.brands})</span>}
                                                </td>
                                                <td className="text-right px-3 py-1.5">{mf.amount_g}g</td>
                                                <td className="text-right px-3 py-1.5">{Math.round(mf.food['energy-kcal_100g'] * mult)}</td>
                                                <td className="text-right px-3 py-1.5 text-blue-600">{Math.round(mf.food.proteins_100g * mult)}</td>
                                                <td className="text-right px-3 py-1.5 text-yellow-600">{Math.round(mf.food.carbohydrates_100g * mult)}</td>
                                                <td className="text-right px-3 py-1.5 text-orange-600">{Math.round(mf.food.fat_100g * mult)}</td>
                                            </tr>
                                        );
                                    })
                                ))}
                            </tbody>
                        </table>

                        {/* Suplementación por comida */}
                        {meal.meal_supplements && meal.meal_supplements.length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 border-t-0 px-4 py-2 rounded-b text-xs text-blue-800">
                                <strong>Suplementación:</strong> {meal.meal_supplements.join(' · ')}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Footer */}
            <div className="mt-12 pt-4 border-t border-gray-300 text-center text-xs text-gray-400">
                <p>Generado por <strong>Anvil Power Club</strong> — {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                {plan.notes && <p className="mt-1 text-gray-500 italic">{plan.notes}</p>}
            </div>
        </div>
    );
}
