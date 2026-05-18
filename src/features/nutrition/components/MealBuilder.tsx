import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Copy, Wand2, Calculator, Check, X as XIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Meal, MealFood, FoodItem, FoodCategory } from '../../../types/nutrition';
import { useCreateMeal, useDeleteMeal, useAddFoodToMeal, useRemoveFoodFromMeal, useUpdateBulkMealFoods } from '../../../hooks/useNutrition';
import { FoodSearch } from './FoodSearch';
import { optimizeMealQuantities } from '../../../lib/nutritionOptimizer';

const FOOD_CATEGORIES: FoodCategory[] = ['Carbohidratos', 'Proteínas', 'Grasas', 'Verduras', 'Frutas', 'Otros'];
const CATEGORY_COLORS: Record<string, string> = {
    'Carbohidratos': 'border-yellow-500/40 bg-yellow-500/5',
    'Proteínas': 'border-blue-500/40 bg-blue-500/5',
    'Grasas': 'border-orange-500/40 bg-orange-500/5',
    'Verduras': 'border-green-500/40 bg-green-500/5',
    'Frutas': 'border-pink-500/40 bg-pink-500/5',
    'Otros': 'border-zinc-600/40 bg-zinc-500/5',
};
const CATEGORY_TEXT: Record<string, string> = {
    'Carbohidratos': 'text-yellow-400',
    'Proteínas': 'text-blue-400',
    'Grasas': 'text-orange-400',
    'Verduras': 'text-green-400',
    'Frutas': 'text-pink-400',
    'Otros': 'text-zinc-400',
};

interface MealBuilderProps {
    planId: string;
    athleteId: string;
    meals: Meal[];
}

export function MealBuilder({ planId, athleteId, meals }: MealBuilderProps) {
    const [newMealName, setNewMealName] = useState('');
    const [isAddingMeal, setIsAddingMeal] = useState(false);
    const [activeSearchMealId, setActiveSearchMealId] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<FoodCategory>('Otros');
    const [alternativeRefFood, setAlternativeRefFood] = useState<FoodItem | undefined>(undefined);
    const [alternativeGroupId, setAlternativeGroupId] = useState<string | undefined>(undefined);

    const createMealMutation = useCreateMeal();
    const deleteMealMutation = useDeleteMeal();
    const addFoodMutation = useAddFoodToMeal();
    const removeFoodMutation = useRemoveFoodFromMeal();
    const updateBulkMutation = useUpdateBulkMealFoods();

    const handleCreateMeal = () => {
        if (!newMealName.trim()) return;
        createMealMutation.mutate({
            athleteId,
            mealData: {
                plan_id: planId,
                name: newMealName,
                order_index: meals.length
            }
        }, {
            onSuccess: () => {
                setNewMealName('');
                setIsAddingMeal(false);
            }
        });
    };

    const handleAddFood = (mealId: string, food: FoodItem, grams: number) => {
        addFoodMutation.mutate({
            athleteId,
            tempFood: food,
            foodData: {
                meal_id: mealId,
                food_id: food.code,
                amount_g: grams,
                category: activeCategory,
                alternative_group_id: alternativeGroupId || undefined,
            }
        }, {
            onSuccess: () => {
                setActiveSearchMealId(null);
                setAlternativeRefFood(undefined);
                setAlternativeGroupId(undefined);
                setActiveCategory('Otros');
            }
        });
    };

    const openCategorySearch = (mealId: string, category: FoodCategory) => {
        setActiveCategory(category);
        setAlternativeRefFood(undefined);
        setAlternativeGroupId(undefined);
        setActiveSearchMealId(mealId);
    };

    const openAlternativeSearch = (mealId: string, refFood: FoodItem, groupId: string) => {
        setActiveCategory((refFood as any).category || 'Otros');
        setAlternativeRefFood(refFood);
        setAlternativeGroupId(groupId);
        setActiveSearchMealId(mealId);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white uppercase tracking-tight">Comidas</h3>
                {!isAddingMeal && (
                    <button
                        onClick={() => setIsAddingMeal(true)}
                        className="flex items-center gap-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg transition-colors"
                    >
                        <Plus size={16} /> Nueva Comida
                    </button>
                )}
            </div>

            {isAddingMeal && (
                <div className="bg-[#1c1c1c] border border-anvil-red/50 p-4 rounded-xl space-y-4">
                    <p className="text-sm text-zinc-400">Selecciona el tipo de comida:</p>
                    <div className="flex flex-wrap gap-2">
                        {['Desayuno', 'Comida', 'Cena', 'Almuerzo', 'Merienda', 'Pre-entreno', 'Post-entreno', 'Pre-cama'].map(mealName => (
                            <button
                                key={mealName}
                                onClick={() => setNewMealName(mealName)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border ${newMealName === mealName ? 'bg-anvil-red text-black border-anvil-red' : 'bg-zinc-800 text-white border-zinc-700 hover:border-anvil-red'}`}
                            >
                                {mealName}
                            </button>
                        ))}
                        <button
                            onClick={() => setNewMealName('Otros')}
                            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border ${newMealName === 'Otros' || (newMealName && !['Desayuno', 'Comida', 'Cena', 'Almuerzo', 'Merienda', 'Pre-entreno', 'Post-entreno', 'Pre-cama'].includes(newMealName)) ? 'bg-zinc-700 text-white border-zinc-500' : 'bg-zinc-800 text-white border-zinc-700'}`}
                        >
                            Otros...
                        </button>
                    </div>

                    {(newMealName === 'Otros' || (newMealName && !['Desayuno', 'Comida', 'Cena', 'Almuerzo', 'Merienda', 'Pre-entreno', 'Post-entreno', 'Pre-cama'].includes(newMealName))) && (
                        <input
                            type="text"
                            placeholder="Escribe el nombre de la comida..."
                            value={newMealName === 'Otros' ? '' : newMealName}
                            onChange={(e) => setNewMealName(e.target.value)}
                            className="w-full bg-[#111111] text-white px-4 py-2 rounded-lg border border-zinc-800 focus:border-anvil-red outline-none mt-2"
                            autoFocus
                        />
                    )}

                    <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
                        <button
                            onClick={() => {
                                setIsAddingMeal(false);
                                setNewMealName('');
                            }}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleCreateMeal}
                            disabled={!newMealName.trim() || newMealName === 'Otros' || createMealMutation.isPending}
                            className="bg-anvil-red hover:bg-red-600 text-black font-black px-6 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm uppercase"
                        >
                            Crear
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {meals.sort((a, b) => a.order_index - b.order_index).map(meal => (
                    <MealCard 
                        key={meal.id} 
                        meal={meal} 
                        athleteId={athleteId}
                        onDelete={() => deleteMealMutation.mutate({ mealId: meal.id, athleteId })}
                        onCategorySearch={(cat) => openCategorySearch(meal.id, cat)}
                        onRemoveFood={(mealFoodId) => removeFoodMutation.mutate({ mealFoodId, athleteId })}
                        onAlternativeSearch={(refFood, groupId) => openAlternativeSearch(meal.id, refFood, groupId)}
                        isSearching={activeSearchMealId === meal.id}
                        onSearchClose={() => {
                            setActiveSearchMealId(null);
                            setAlternativeRefFood(undefined);
                            setAlternativeGroupId(undefined);
                        }}
                        onFoodSelected={(food, grams) => handleAddFood(meal.id, food, grams)}
                        referenceFood={alternativeRefFood}
                        onBulkUpdate={(updates) => updateBulkMutation.mutate({ updates, athleteId })}
                    />
                ))}
                
                {meals.length === 0 && !isAddingMeal && (
                    <div className="text-center py-8 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                        Aún no hay comidas en este plan.
                    </div>
                )}
            </div>
        </div>
    );
}

// -------------------------------------------------------------
// Subcomponent: MealCard
// -------------------------------------------------------------

interface MealCardProps {
    meal: Meal;
    athleteId: string;
    onDelete: () => void;
    onCategorySearch: (cat: FoodCategory) => void;
    onRemoveFood: (id: string) => void;
    onAlternativeSearch: (refFood: FoodItem, groupId: string) => void;
    isSearching: boolean;
    onSearchClose: () => void;
    onFoodSelected: (food: FoodItem, grams: number) => void;
    referenceFood?: FoodItem;
    onBulkUpdate: (updates: { id: string, amount_g: number }[]) => void;
}

function MealCard({ meal, onDelete, onCategorySearch, onRemoveFood, onAlternativeSearch, isSearching, onSearchClose, onFoodSelected, referenceFood, onBulkUpdate }: MealCardProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isAdjusting, setIsAdjusting] = useState(false);
    const [adjustTargets, setAdjustTargets] = useState({ protein: 0, carbs: 0, fats: 0 });
    const [optimizedProposals, setOptimizedProposals] = useState<any[] | null>(null);
    const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
    const [adjustError, setAdjustError] = useState<string | null>(null);

    const foods = meal.foods || [];

    const foodGroups: { groupId: string; category: string; items: MealFood[], catIndex: number }[] = [];
    const seenGroups = new Set<string>();
    const catCounts: Record<string, number> = {};
    
    foods.forEach(mf => {
        const gid = mf.alternative_group_id || mf.id;
        if (!seenGroups.has(gid)) {
            seenGroups.add(gid);
            const cat = mf.category || 'Otros';
            catCounts[cat] = (catCounts[cat] || 0) + 1;
            foodGroups.push({
                groupId: gid,
                category: cat,
                items: foods.filter(f => (f.alternative_group_id || f.id) === gid),
                catIndex: catCounts[cat]
            });
        }
    });

    const totalCatCounts = { ...catCounts };

    // Calculate totals for this meal (only primary options, not alternatives)
    const totals = foods.reduce((acc, mf) => {
        if (!mf.food) return acc;
        const multiplier = mf.amount_g / 100;
        return {
            kcal: acc.kcal + (mf.food['energy-kcal_100g'] * multiplier),
            prot: acc.prot + (mf.food.proteins_100g * multiplier),
            carbs: acc.carbs + (mf.food.carbohydrates_100g * multiplier),
            fats: acc.fats + (mf.food.fat_100g * multiplier),
        };
    }, { kcal: 0, prot: 0, carbs: 0, fats: 0 });

    const totalMacroKcal = (totals.prot * 4) + (totals.carbs * 4) + (totals.fats * 9);
    const protPct = totalMacroKcal > 0 ? ((totals.prot * 4) / totalMacroKcal) * 100 : 0;
    const carbsPct = totalMacroKcal > 0 ? ((totals.carbs * 4) / totalMacroKcal) * 100 : 0;
    const fatsPct = totalMacroKcal > 0 ? ((totals.fats * 9) / totalMacroKcal) * 100 : 0;

    return (
        <div className="bg-[#1c1c1c] border border-zinc-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="bg-[#252525] p-4 flex justify-between items-center cursor-pointer select-none border-b border-zinc-800" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center gap-4">
                    {isExpanded ? <ChevronUp size={20} className="text-zinc-400" /> : <ChevronDown size={20} className="text-zinc-400" />}
                    <h4 className="text-lg font-black text-white">{meal.name}</h4>
                    {meal.meal_supplements && meal.meal_supplements.length > 0 && (
                        <span className="bg-blue-500/10 text-blue-400 text-xs px-2 py-0.5 rounded-full border border-blue-500/20">
                            💊 {meal.meal_supplements.length}
                        </span>
                    )}
                </div>
                
                <div className="flex items-center gap-6">
                    <div className="hidden md:flex gap-4 text-sm">
                        <span className="font-bold text-white">{Math.round(totals.kcal)} <span className="text-zinc-500 font-normal">kcal</span></span>
                        <span className="text-blue-400">{Math.round(totals.prot)}g P</span>
                        <span className="text-yellow-400">{Math.round(totals.carbs)}g HC</span>
                        <span className="text-orange-400">{Math.round(totals.fats)}g G</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsAdjusting(!isAdjusting); }}
                            className={`p-2 rounded-lg transition-all ${isAdjusting ? 'bg-anvil-red text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                            title="Ajuste Inteligente"
                        >
                            <Wand2 size={18} />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="text-zinc-500 hover:text-red-500 transition-colors p-1"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="p-4 bg-[#161616]">
                    {/* Smart Adjuster Panel */}
                    <AnimatePresence>
                        {isAdjusting && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="mb-4 overflow-hidden"
                            >
                                <div className="bg-[#1a1a1a] border border-anvil-red/30 rounded-xl p-4 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-anvil-red flex items-center gap-2">
                                            <Calculator size={14} /> Smart Adjuster
                                        </h5>
                                        <button onClick={() => { setIsAdjusting(false); setOptimizedProposals(null); setSelectedProposalId(null); }} className="text-zinc-600 hover:text-white"><XIcon size={16} /></button>
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Proteína Obj.</label>
                                            <input 
                                                type="number" 
                                                value={adjustTargets.protein || ''} 
                                                onChange={e => setAdjustTargets({...adjustTargets, protein: Number(e.target.value)})}
                                                className="w-full bg-black border border-zinc-800 rounded px-2 py-1.5 text-blue-400 font-bold text-sm outline-none focus:border-blue-500/50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Carbos Obj.</label>
                                            <input 
                                                type="number" 
                                                value={adjustTargets.carbs || ''} 
                                                onChange={e => setAdjustTargets({...adjustTargets, carbs: Number(e.target.value)})}
                                                className="w-full bg-black border border-zinc-800 rounded px-2 py-1.5 text-yellow-400 font-bold text-sm outline-none focus:border-yellow-500/50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Grasas Obj.</label>
                                            <input 
                                                type="number" 
                                                value={adjustTargets.fats || ''} 
                                                onChange={e => setAdjustTargets({...adjustTargets, fats: Number(e.target.value)})}
                                                className="w-full bg-black border border-zinc-800 rounded px-2 py-1.5 text-orange-400 font-bold text-sm outline-none focus:border-orange-500/50"
                                            />
                                        </div>
                                    </div>

                                    {adjustError && (
                                        <p className="text-[10px] font-bold text-anvil-red uppercase animate-pulse">{adjustError}</p>
                                    )}

                                    {!optimizedProposals ? (
                                        <button 
                                            onClick={() => {
                                                const currentMap = Object.fromEntries(foods.map(mf => [mf.food_id, mf.amount_g]));
                                                const result = optimizeMealQuantities(foods.map(mf => mf.food!), adjustTargets, currentMap);
                                                if (result.error) {
                                                    setAdjustError(result.error);
                                                    setTimeout(() => setAdjustError(null), 3000);
                                                } else {
                                                    setOptimizedProposals(result.options);
                                                    if (result.options.length > 0) setSelectedProposalId(result.options[0].id);
                                                }
                                            }}
                                            className="w-full bg-white text-black font-black py-2 rounded-lg text-xs uppercase tracking-widest hover:bg-zinc-200 transition-colors"
                                        >
                                            Calcular Cantidades
                                        </button>
                                    ) : (
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-bold text-zinc-400 uppercase italic">Revisa las opciones y aplica la que prefieras:</p>
                                            
                                            <div className="flex gap-2">
                                                {optimizedProposals.map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => setSelectedProposalId(opt.id)}
                                                        className={`flex-1 py-2 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${selectedProposalId === opt.id ? 'bg-anvil-red/20 border-anvil-red text-white' : 'bg-[#111111] border-white/5 text-zinc-500 hover:bg-white/5'}`}
                                                    >
                                                        {opt.name}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="flex gap-2 pt-2">
                                                <button 
                                                    onClick={() => {
                                                        const selectedOpt = optimizedProposals.find(o => o.id === selectedProposalId);
                                                        if (!selectedOpt) return;
                                                        const bulkUpdates = foods.map(mf => ({
                                                            id: mf.id,
                                                            amount_g: selectedOpt.amounts[mf.food_id]
                                                        }));
                                                        onBulkUpdate(bulkUpdates);
                                                        setIsAdjusting(false);
                                                        setOptimizedProposals(null);
                                                        setSelectedProposalId(null);
                                                    }}
                                                    className="flex-1 bg-green-500 text-white font-black py-2 rounded-lg text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-green-600 transition-colors disabled:opacity-50"
                                                    disabled={!selectedProposalId}
                                                >
                                                    <Check size={14} /> Aplicar Ajuste
                                                </button>
                                                <button 
                                                    onClick={() => { setOptimizedProposals(null); setSelectedProposalId(null); }}
                                                    className="flex-1 bg-zinc-800 text-white font-black py-2 rounded-lg text-xs uppercase tracking-widest hover:bg-zinc-700 transition-colors"
                                                >
                                                    Descartar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Macro Progress Bar */}
                    {totals.kcal > 0 && (
                        <div className="mb-4 bg-[#111111] p-3 rounded-lg border border-zinc-800/50">
                            <div className="flex justify-between text-xs mb-2">
                                <span className="text-blue-400">{Math.round(protPct)}% Prot</span>
                                <span className="text-yellow-400">{Math.round(carbsPct)}% Carb</span>
                                <span className="text-orange-400">{Math.round(fatsPct)}% Grasa</span>
                            </div>
                            <div className="w-full h-2 rounded-full overflow-hidden flex">
                                <div style={{ width: `${protPct}%` }} className="bg-blue-500 h-full"></div>
                                <div style={{ width: `${carbsPct}%` }} className="bg-yellow-500 h-full"></div>
                                <div style={{ width: `${fatsPct}%` }} className="bg-orange-500 h-full"></div>
                            </div>
                        </div>
                    )}

                    {/* Food Groups by Category */}
                    <AnimatePresence>
                        {foodGroups.length > 0 ? (
                            <motion.div layout className="space-y-3 mb-4">
                                <AnimatePresence>
                                    {foodGroups.map(group => (
                                        <motion.div 
                                            key={group.groupId}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                                            transition={{ duration: 0.2 }}
                                            className={`rounded-lg border ${CATEGORY_COLORS[group.category] || CATEGORY_COLORS['Otros']} overflow-hidden`}
                                        >
                                            {/* Category label */}
                                            <div className="px-3 py-1.5 flex justify-between items-center border-b border-zinc-800/30">
                                                <span className={`text-xs font-bold uppercase ${CATEGORY_TEXT[group.category] || CATEGORY_TEXT['Otros']}`}>
                                                    {group.category} {totalCatCounts[group.category] > 1 ? `(OPCIÓN ${group.catIndex})` : ''}
                                                </span>
                                                {group.items.length > 1 && (
                                                    <span className="text-xs font-black text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                                                        ELIGE 1 OPCIÓN
                                                    </span>
                                                )}
                                            </div>

                                            {/* Food items in group */}
                                            {group.items.map((mf, idx) => {
                                                const f = mf.food;
                                                if (!f) return null;
                                                const mult = mf.amount_g / 100;
                                                return (
                                                    <div key={mf.id} className={`flex justify-between items-center p-3 ${idx > 0 ? 'border-t border-zinc-800/20 bg-green-500/5' : ''}`}>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                {idx > 0 && <span className="text-green-500 text-xs font-bold">ó</span>}
                                                                <p className="text-white font-medium">{f.product_name}</p>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <p className={`text-xs ${selectedProposalId ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                                                    {mf.amount_g}g
                                                                </p>
                                                                {selectedProposalId && optimizedProposals && optimizedProposals.find(o => o.id === selectedProposalId)?.amounts[f.code] !== mf.amount_g && (
                                                                    <>
                                                                        <ChevronUp size={12} className="text-green-500 rotate-90" />
                                                                        <p className="text-xs font-black text-green-400">
                                                                            {optimizedProposals.find(o => o.id === selectedProposalId)?.amounts[f.code]}g
                                                                        </p>
                                                                    </>
                                                                )}
                                                                <span className="text-zinc-700">·</span>
                                                                <p className="text-xs text-zinc-500">{f.brands || ''}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-right text-sm flex gap-3">
                                                                <span className="text-zinc-400 w-14">{Math.round(f['energy-kcal_100g'] * mult)} kcal</span>
                                                                <span className="text-blue-400/80 w-10">{Math.round(f.proteins_100g * mult)}g</span>
                                                                <span className="text-yellow-400/80 w-10">{Math.round(f.carbohydrates_100g * mult)}g</span>
                                                                <span className="text-orange-400/80 w-10">{Math.round(f.fat_100g * mult)}g</span>
                                                            </div>
                                                            {idx === 0 && (
                                                                <button 
                                                                    onClick={() => onAlternativeSearch(f, group.groupId)}
                                                                    title="Añadir alternativa"
                                                                    className="text-zinc-600 hover:text-green-500 transition-colors"
                                                                >
                                                                    <Copy size={14} />
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => onRemoveFood(mf.id)}
                                                                className="text-zinc-600 hover:text-red-500 transition-colors"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </motion.div>
                        ) : (
                            <motion.div 
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-sm text-zinc-500 text-center py-2 mb-2"
                            >
                                No hay alimentos en esta comida.
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Supplements for this meal */}
                    {meal.meal_supplements && meal.meal_supplements.length > 0 && (
                        <div className="mb-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                            <p className="text-xs text-blue-400 font-bold uppercase mb-1">💊 Suplementación</p>
                            <div className="flex flex-wrap gap-2">
                                {meal.meal_supplements.map((s, i) => (
                                    <span key={i} className="text-xs text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded">{s}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mobile Totals (visible only on small screens) */}
                    <div className="md:hidden flex justify-between bg-zinc-900 p-3 rounded-lg mb-4 text-xs">
                        <span className="font-bold text-white">{Math.round(totals.kcal)} kcal</span>
                        <span className="text-blue-400">{Math.round(totals.prot)}g P</span>
                        <span className="text-yellow-400">{Math.round(totals.carbs)}g HC</span>
                        <span className="text-orange-400">{Math.round(totals.fats)}g G</span>
                    </div>

                    {isSearching ? (
                        <div className="mt-4">
                            <FoodSearch onAddFood={onFoodSelected} onClose={onSearchClose} referenceFood={referenceFood} />
                        </div>
                    ) : (
                        <div>
                            {/* Category quick-add buttons */}
                            <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Añadir por categoría:</p>
                            <div className="flex flex-wrap gap-2">
                                {FOOD_CATEGORIES.map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => onCategorySearch(cat)}
                                        className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all hover:scale-105 ${CATEGORY_COLORS[cat]} ${CATEGORY_TEXT[cat]} hover:brightness-125`}
                                    >
                                        <Plus size={12} className="inline mr-1" />{cat}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
