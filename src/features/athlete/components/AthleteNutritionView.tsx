import {
    Utensils,
    Zap,
    Droplets,
    Flame,
    Apple,
    Clock,
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Pill
} from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';
import { useAthleteNutritionPlan } from '../../../hooks/useNutrition';
import { useState } from 'react';
import { motion } from 'framer-motion';

interface AthleteNutritionViewProps {
    user: UserProfile;
}

export function AthleteNutritionView({ user }: AthleteNutritionViewProps) {
    const { data: plan, isLoading } = useAthleteNutritionPlan(user.id);
    const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>({});

    const toggleMeal = (mealId: string) => {
        setExpandedMeals(prev => ({ ...prev, [mealId]: !prev[mealId] }));
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-anvil-red"></div>
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Cargando Plan Nutricional...</p>
            </div>
        );
    }

    if (!plan) {
        return (
            <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 animate-fade-in">
                <header>
                    <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2 text-white">Mi Nutrición</h1>
                    <p className="text-gray-400 text-lg">Tu plan de alimentación personalizado.</p>
                </header>

                <div className="bg-[#252525] border border-white/5 rounded-2xl p-12 text-center space-y-6">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-700">
                        <Apple size={40} />
                    </div>
                    <div className="max-w-md mx-auto">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-3">Sin Plan Nutricional</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Tu nutricionista aún no ha cargado tu plan de alimentación. Esta sección se sincronizará automáticamente cuando el profesional lo publique.
                        </p>
                    </div>
                    <div className="pt-4 flex justify-center gap-4">
                        <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                            <Clock size={14} /> Esperando nutricionista...
                        </div>
                    </div>
                </div>

                {/* Info Cards while waiting */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#252525] border border-white/5 p-6 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2 text-anvil-red">
                            <AlertCircle size={18} />
                            <h4 className="font-bold uppercase tracking-widest text-xs text-white">Importante</h4>
                        </div>
                        <p className="text-gray-400 text-xs leading-relaxed">
                            Asegúrate de haber completado tu perfil con tu peso y objetivos actuales para que el nutricionista pueda diseñar el plan adecuado.
                        </p>
                    </div>
                    <div className="bg-[#252525] border border-white/5 p-6 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2 text-green-500">
                            <CheckCircle2 size={18} />
                            <h4 className="font-bold uppercase tracking-widest text-xs text-white">Sincronización</h4>
                        </div>
                        <p className="text-gray-400 text-xs leading-relaxed">
                            Una vez activo, podrás ver tus macros diarios, comidas recomendadas y suplementación directamente desde aquí.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Compute current macros from meals
    const currentMacros = plan.meals?.reduce((acc, meal) => {
        const mealTotals = (meal.foods || []).reduce((mAcc, mf) => {
            if (!mf.food) return mAcc;
            const mult = mf.amount_g / 100;
            return {
                kcal: mAcc.kcal + (mf.food['energy-kcal_100g'] * mult),
                prot: mAcc.prot + (mf.food.proteins_100g * mult),
                carbs: mAcc.carbs + (mf.food.carbohydrates_100g * mult),
                fats: mAcc.fats + (mf.food.fat_100g * mult)
            };
        }, { kcal: 0, prot: 0, carbs: 0, fats: 0 });

        return {
            kcal: acc.kcal + mealTotals.kcal,
            prot: acc.prot + mealTotals.prot,
            carbs: acc.carbs + mealTotals.carbs,
            fats: acc.fats + mealTotals.fats,
        };
    }, { kcal: 0, prot: 0, carbs: 0, fats: 0 }) || { kcal: 0, prot: 0, carbs: 0, fats: 0 };

    const sortedMeals = [...(plan.meals || [])].sort((a, b) => a.order_index - b.order_index);

    const macroCards = [
        { label: 'Calorías', current: Math.round(currentMacros.kcal), target: plan.calories_target, unit: 'kcal', color: 'bg-white', textColor: 'text-white', icon: <Zap size={16} /> },
        { label: 'Proteína', current: Math.round(currentMacros.prot), target: plan.protein_target, unit: 'g', color: 'bg-blue-500', textColor: 'text-blue-400', icon: <Flame size={16} /> },
        { label: 'Carbohidratos', current: Math.round(currentMacros.carbs), target: plan.carbs_target, unit: 'g', color: 'bg-yellow-500', textColor: 'text-yellow-400', icon: <Zap size={16} /> },
        { label: 'Grasas', current: Math.round(currentMacros.fats), target: plan.fats_target, unit: 'g', color: 'bg-orange-500', textColor: 'text-orange-400', icon: <Droplets size={16} /> },
    ];

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 animate-fade-in">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2 text-white">Mi Nutrición</h1>
                    <p className="text-gray-400 text-lg">Objetivos diarios y planificación.</p>
                </div>
                <div className="hidden md:block text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Total Calorías</p>
                    <p className="text-3xl font-black text-white italic">
                        {Math.round(currentMacros.kcal).toLocaleString()} <span className="text-xs not-italic text-gray-500">/ {plan.calories_target} kcal</span>
                    </p>
                </div>
            </header>

            {/* Tags */}
            {plan.tags && plan.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {plan.tags.map((tag, i) => (
                        <span key={i} className="bg-anvil-red/10 text-anvil-red text-xs font-bold px-3 py-1 rounded-full border border-anvil-red/20 uppercase">
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Macros Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {macroCards.map((macro, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-[#252525] border border-white/5 p-5 rounded-2xl space-y-3 hover:border-white/10 transition-all"
                    >
                        <div className="flex justify-between items-center">
                            <div className={`p-1.5 rounded-lg bg-white/5 ${macro.textColor}`}>
                                {macro.icon}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{macro.label}</span>
                        </div>
                        <div>
                            <div className="flex items-baseline gap-1 mb-2">
                                <span className={`text-2xl font-black ${macro.textColor}`}>{macro.current}</span>
                                <span className="text-xs text-gray-500">/ {macro.target}{macro.unit}</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (macro.current / (macro.target || 1)) * 100)}%` }}
                                    transition={{ duration: 1, delay: i * 0.1, ease: "easeOut" }}
                                    className={`h-full ${macro.color} rounded-full`}
                                />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* General Guidelines */}
            {plan.general_guidelines && plan.general_guidelines.length > 0 && (
                <div className="bg-[#252525] border border-white/5 rounded-2xl p-5 space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">📋 Pautas Generales</h3>
                    <div className="space-y-1.5">
                        {plan.general_guidelines.map((g, i) => (
                            <p key={i} className="text-sm text-gray-300 pl-2">• {g}</p>
                        ))}
                    </div>
                </div>
            )}

            {/* Supplements */}
            {plan.global_supplements && plan.global_supplements.length > 0 && (
                <div className="bg-[#252525] border border-blue-500/10 rounded-2xl p-5 space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400/70 flex items-center gap-2">
                        <Pill size={14} /> Suplementación
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {plan.global_supplements.map((s, i) => (
                            <span key={i} className="bg-blue-500/10 text-blue-300 text-xs px-3 py-1.5 rounded-lg border border-blue-500/20">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Meals */}
            <div className="space-y-4">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Utensils size={16} /> Comidas del día
                </h2>

                {sortedMeals.length === 0 ? (
                    <div className="bg-[#252525] border border-white/5 rounded-2xl p-8 text-center">
                        <p className="text-gray-500 text-sm">Tu nutricionista aún no ha añadido comidas al plan.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sortedMeals.map((meal, i) => {
                            const isExpanded = expandedMeals[meal.id] ?? true;
                            const mealFoods = meal.foods || [];
                            const mealMacros = mealFoods.reduce((acc, mf) => {
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
                                <div key={meal.id} className="bg-[#252525] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all">
                                    {/* Meal Header */}
                                    <button
                                        onClick={() => toggleMeal(meal.id)}
                                        className="w-full p-5 flex items-center justify-between text-left"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="text-gray-600 font-black text-2xl italic">
                                                {String(i + 1).padStart(2, '0')}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white uppercase tracking-tight">{meal.name}</h3>
                                                {meal.time && (
                                                    <p className="text-gray-500 text-xs flex items-center gap-1">
                                                        <Clock size={10} /> {meal.time}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="hidden md:flex gap-3 text-xs text-gray-500">
                                                <span>{Math.round(mealMacros.kcal)} kcal</span>
                                                <span className="text-blue-400/60">{Math.round(mealMacros.prot)}P</span>
                                                <span className="text-yellow-400/60">{Math.round(mealMacros.carbs)}C</span>
                                                <span className="text-orange-400/60">{Math.round(mealMacros.fats)}G</span>
                                            </div>
                                            {isExpanded ? (
                                                <ChevronUp size={18} className="text-gray-500" />
                                            ) : (
                                                <ChevronDown size={18} className="text-gray-500" />
                                            )}
                                        </div>
                                    </button>

                                    {/* Meal Foods */}
                                    {isExpanded && mealFoods.length > 0 && (
                                        <div className="border-t border-white/5 px-5 pb-4">
                                            <div className="divide-y divide-white/5">
                                                {mealFoods.map((mf) => {
                                                    if (!mf.food) return null;
                                                    const mult = mf.amount_g / 100;
                                                    return (
                                                        <div key={mf.id} className="py-3 flex items-center justify-between gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm text-white font-medium truncate">
                                                                    {mf.food.product_name}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-xs text-gray-500 font-bold">{mf.amount_g}g</span>
                                                                    {mf.food.brands && (
                                                                        <span className="text-[10px] text-gray-600">({mf.food.brands})</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-3 text-[10px] font-bold shrink-0">
                                                                <span className="text-gray-400">{Math.round(mf.food['energy-kcal_100g'] * mult)}</span>
                                                                <span className="text-blue-400/80">{Math.round(mf.food.proteins_100g * mult)}P</span>
                                                                <span className="text-yellow-400/80">{Math.round(mf.food.carbohydrates_100g * mult)}C</span>
                                                                <span className="text-orange-400/80">{Math.round(mf.food.fat_100g * mult)}G</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Meal supplements */}
                                            {meal.meal_supplements && meal.meal_supplements.length > 0 && (
                                                <div className="mt-3 pt-3 border-t border-white/5">
                                                    <div className="flex flex-wrap gap-2">
                                                        {meal.meal_supplements.map((s, idx) => (
                                                            <span key={idx} className="bg-blue-500/10 text-blue-300 text-[10px] px-2 py-1 rounded border border-blue-500/20 flex items-center gap-1">
                                                                <Pill size={10} /> {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isExpanded && mealFoods.length === 0 && (
                                        <div className="border-t border-white/5 px-5 py-4">
                                            <p className="text-gray-600 text-xs text-center">Sin alimentos asignados a esta comida.</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
