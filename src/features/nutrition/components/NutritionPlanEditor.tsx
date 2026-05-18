import { useState } from 'react';
import { useAthleteNutritionPlan, useCreateNutritionPlan, useUpdateNutritionPlan } from '../../../hooks/useNutrition';
import { useUser } from '../../../hooks/useUser';
import { MealBuilder } from './MealBuilder';
import { Apple, Target, Settings, Download, Plus, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { PDFEditorModal } from './PDFEditorModal';
import { FloatingMacroTracker } from './FloatingMacroTracker';

interface NutritionPlanEditorProps {
    athleteId: string;
}

export function NutritionPlanEditor({ athleteId }: NutritionPlanEditorProps) {
    const { data: plan, isLoading } = useAthleteNutritionPlan(athleteId);
    const { data: user } = useUser();
    const createPlanMutation = useCreateNutritionPlan();
    const updatePlanMutation = useUpdateNutritionPlan();

    const [isEditingMacros, setIsEditingMacros] = useState(false);
    const [macrosForm, setMacrosForm] = useState({
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0
    });
    
    // Configuración adicional (Portada)
    const [isEditingConfig, setIsEditingConfig] = useState(false);
    const [configForm, setConfigForm] = useState({
        training_block_id: '',
        tags: [] as string[],
        general_guidelines: [] as string[],
        global_supplements: [] as string[]
    });
    const [newTag, setNewTag] = useState('');
    const [newGuideline, setNewGuideline] = useState('');
    const [newSupplement, setNewSupplement] = useState('');
    const [isPrinting, setIsPrinting] = useState(false);

    // When clicking "Create Plan", show macro form directly or create with 0s
    const handleCreatePlan = () => {
        setMacrosForm({ calories: 2500, protein: 150, carbs: 300, fats: 80 }); // Default values
        setIsEditingMacros(true);
    };

    const handleSaveMacros = () => {
        if (!plan) {
            // Create
            if (!user?.id) return; // Wait for user to load

            createPlanMutation.mutate({
                athlete_id: athleteId,
                nutritionist_id: user.id,
                calories_target: macrosForm.calories,
                protein_target: macrosForm.protein,
                carbs_target: macrosForm.carbs,
                fats_target: macrosForm.fats,
                status: 'active'
            });
        } else {
            // Update
            updatePlanMutation.mutate({
                athleteId,
                planId: plan.id,
                updates: {
                    calories_target: macrosForm.calories,
                    protein_target: macrosForm.protein,
                    carbs_target: macrosForm.carbs,
                    fats_target: macrosForm.fats,
                }
            });
        }
        setIsEditingMacros(false);
    };

    const handleEditClick = () => {
        if (plan) {
            setMacrosForm({
                calories: plan.calories_target,
                protein: plan.protein_target,
                carbs: plan.carbs_target,
                fats: plan.fats_target
            });
            setIsEditingMacros(true);
        }
    };

    const handleConfigClick = () => {
        if (plan) {
            setConfigForm({
                training_block_id: plan.training_block_id || '',
                tags: plan.tags || [],
                general_guidelines: plan.general_guidelines || [],
                global_supplements: plan.global_supplements || []
            });
            setIsEditingConfig(true);
        }
    };

    const handleSaveConfig = () => {
        if (plan) {
            updatePlanMutation.mutate({
                athleteId,
                planId: plan.id,
                updates: {
                    training_block_id: configForm.training_block_id,
                    tags: configForm.tags,
                    general_guidelines: configForm.general_guidelines,
                    global_supplements: configForm.global_supplements
                }
            });
            setIsEditingConfig(false);
        }
    };

    const handlePrint = () => {
        setIsPrinting(true);
    };

    if (isLoading) {
        return (
            <div className="flex justify-center p-12">
                <div className="w-10 h-10 border-4 border-anvil-red border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    // Calcular macros actuales basados en las comidas
    const currentMacros = plan?.meals?.reduce((acc, meal) => {
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


    return (
        <div className="space-y-8 animate-fade-in">
            {/* Cabecera / Resumen de Macros */}
            <div className="bg-[#1c1c1c] border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Apple size={120} />
                </div>
                
                <div className="flex justify-between items-start mb-6 relative z-10">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase italic tracking-wider flex items-center gap-2">
                            <Target className="text-anvil-red" />
                            Objetivos Diarios
                        </h2>
                        {plan && (
                            <p className="text-zinc-400 text-sm mt-1">Comparativa entre lo planificado y el objetivo.</p>
                        )}
                    </div>
                    {plan && !isEditingMacros && (
                        <div className="flex gap-4">
                            <button 
                                onClick={handlePrint}
                                className="text-sm font-bold text-zinc-400 hover:text-white transition-colors uppercase flex items-center gap-1"
                            >
                                <Download size={16} /> PDF
                            </button>
                            <button 
                                onClick={handleConfigClick}
                                className="text-sm font-bold text-zinc-400 hover:text-white transition-colors uppercase flex items-center gap-1"
                            >
                                <Settings size={16} /> Config
                            </button>
                            <button 
                                onClick={handleEditClick}
                                className="text-sm font-bold text-anvil-red hover:text-white transition-colors uppercase tracking-wide"
                            >
                                Editar Macros
                            </button>
                        </div>
                    )}
                </div>

                {!plan && !isEditingMacros ? (
                    <div className="text-center py-8">
                        <p className="text-zinc-400 mb-4">Este atleta aún no tiene un plan nutricional activo.</p>
                        <button 
                            onClick={handleCreatePlan}
                            className="bg-anvil-red hover:bg-red-600 text-black font-black px-6 py-3 rounded-lg transition-colors uppercase tracking-widest text-sm"
                        >
                            Crear Plan Nutricional
                        </button>
                    </div>
                ) : isEditingMacros ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                        <div>
                            <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Calorías</label>
                            <input 
                                type="number" 
                                value={macrosForm.calories || ''} 
                                onChange={(e) => setMacrosForm({...macrosForm, calories: Number(e.target.value)})}
                                className="w-full bg-[#111111] text-white px-3 py-2 rounded border border-zinc-800 focus:border-anvil-red outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Proteína (g)</label>
                            <input 
                                type="number" 
                                value={macrosForm.protein || ''} 
                                onChange={(e) => setMacrosForm({...macrosForm, protein: Number(e.target.value)})}
                                className="w-full bg-[#111111] text-blue-400 font-bold px-3 py-2 rounded border border-zinc-800 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Carbos (g)</label>
                            <input 
                                type="number" 
                                value={macrosForm.carbs || ''} 
                                onChange={(e) => setMacrosForm({...macrosForm, carbs: Number(e.target.value)})}
                                className="w-full bg-[#111111] text-yellow-400 font-bold px-3 py-2 rounded border border-zinc-800 focus:border-yellow-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Grasas (g)</label>
                            <input 
                                type="number" 
                                value={macrosForm.fats || ''} 
                                onChange={(e) => setMacrosForm({...macrosForm, fats: Number(e.target.value)})}
                                className="w-full bg-[#111111] text-orange-400 font-bold px-3 py-2 rounded border border-zinc-800 focus:border-orange-500 outline-none"
                            />
                        </div>
                        <div className="col-span-2 md:col-span-4 flex justify-end gap-2 mt-2">
                            {plan && (
                                <button 
                                    onClick={() => setIsEditingMacros(false)}
                                    className="bg-zinc-800 text-white px-4 py-2 rounded font-bold text-sm"
                                >
                                    Cancelar
                                </button>
                            )}
                            <button 
                                onClick={handleSaveMacros}
                                disabled={createPlanMutation.isPending || updatePlanMutation.isPending}
                                className="bg-anvil-red text-black px-6 py-2 rounded font-black text-sm uppercase tracking-wide"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                        {/* Kcal */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#111111] p-4 rounded-xl border border-zinc-800/50 flex flex-col">
                            <span className="text-zinc-500 text-xs font-bold uppercase mb-1">Calorías</span>
                            <div className="flex items-baseline gap-1 mt-auto">
                                <span className="text-2xl font-black text-white">{Math.round(currentMacros.kcal)}</span>
                                <span className="text-sm text-zinc-500">/ {plan?.calories_target} kcal</span>
                            </div>
                            <div className="w-full bg-zinc-800 h-1 mt-2 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (currentMacros.kcal / (plan?.calories_target || 1)) * 100)}%` }}
                                    transition={{ duration: 1, ease: "easeOut" }}
                                    className="h-full bg-white" 
                                />
                            </div>
                        </motion.div>

                        {/* Prot */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-[#111111] p-4 rounded-xl border border-zinc-800/50 flex flex-col">
                            <span className="text-blue-400/70 text-xs font-bold uppercase mb-1">Proteína</span>
                            <div className="flex items-baseline gap-1 mt-auto">
                                <span className="text-2xl font-black text-blue-400">{Math.round(currentMacros.prot)}g</span>
                                <span className="text-sm text-zinc-500">/ {plan?.protein_target}g</span>
                            </div>
                            <div className="w-full bg-zinc-800 h-1 mt-2 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (currentMacros.prot / (plan?.protein_target || 1)) * 100)}%` }}
                                    transition={{ duration: 1, delay: 0.1, ease: "easeOut" }}
                                    className="h-full bg-blue-500" 
                                />
                            </div>
                        </motion.div>

                        {/* Carbs */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-[#111111] p-4 rounded-xl border border-zinc-800/50 flex flex-col">
                            <span className="text-yellow-400/70 text-xs font-bold uppercase mb-1">Carbohidratos</span>
                            <div className="flex items-baseline gap-1 mt-auto">
                                <span className="text-2xl font-black text-yellow-400">{Math.round(currentMacros.carbs)}g</span>
                                <span className="text-sm text-zinc-500">/ {plan?.carbs_target}g</span>
                            </div>
                            <div className="w-full bg-zinc-800 h-1 mt-2 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (currentMacros.carbs / (plan?.carbs_target || 1)) * 100)}%` }}
                                    transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                                    className="h-full bg-yellow-500" 
                                />
                            </div>
                        </motion.div>

                        {/* Fats */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-[#111111] p-4 rounded-xl border border-zinc-800/50 flex flex-col">
                            <span className="text-orange-400/70 text-xs font-bold uppercase mb-1">Grasas</span>
                            <div className="flex items-baseline gap-1 mt-auto">
                                <span className="text-2xl font-black text-orange-400">{Math.round(currentMacros.fats)}g</span>
                                <span className="text-sm text-zinc-500">/ {plan?.fats_target}g</span>
                            </div>
                            <div className="w-full bg-zinc-800 h-1 mt-2 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (currentMacros.fats / (plan?.fats_target || 1)) * 100)}%` }}
                                    transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                                    className="h-full bg-orange-500" 
                                />
                            </div>
                        </motion.div>
                    </div>
                )}
            </div>

            {/* Configuración de Portada */}
            {plan && isEditingConfig && (
                <div className="bg-[#111111] border border-zinc-800 rounded-xl p-6 animate-fade-in space-y-6">
                    <h3 className="text-lg font-bold text-white uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2">Configuración del Plan (Portada)</h3>
                    
                    <div>
                        <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Bloque de Entrenamiento Asociado</label>
                        <input 
                            type="text" 
                            placeholder="Ej. Hipertrofia Bloque 1, Fuerza Máxima..."
                            value={configForm.training_block_id} 
                            onChange={(e) => setConfigForm({...configForm, training_block_id: e.target.value})}
                            className="w-full bg-[#1c1c1c] text-white px-4 py-3 rounded border border-zinc-800 focus:border-anvil-red outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Etiquetas (Tags)</label>
                        <div className="flex gap-2 mb-2">
                            <input 
                                type="text" 
                                placeholder="Ej. Volumen, Definición..."
                                value={newTag} 
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newTag.trim()) {
                                        setConfigForm({...configForm, tags: [...configForm.tags, newTag.trim()]});
                                        setNewTag('');
                                    }
                                }}
                                className="flex-1 bg-[#1c1c1c] text-white px-4 py-2 rounded border border-zinc-800 focus:border-anvil-red outline-none"
                            />
                            <button 
                                onClick={() => {
                                    if (newTag.trim()) {
                                        setConfigForm({...configForm, tags: [...configForm.tags, newTag.trim()]});
                                        setNewTag('');
                                    }
                                }}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 rounded transition-colors"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {configForm.tags.map((tag, i) => (
                                <span key={i} className="bg-zinc-800 text-white text-xs px-3 py-1 rounded-full flex items-center gap-2">
                                    {tag}
                                    <button onClick={() => setConfigForm({...configForm, tags: configForm.tags.filter((_, idx) => idx !== i)})} className="hover:text-red-500"><X size={12} /></button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Pautas Generales</label>
                        <div className="flex gap-2 mb-2">
                            <input 
                                type="text" 
                                placeholder="Ej. Dar 8000 pasos al día..."
                                value={newGuideline} 
                                onChange={(e) => setNewGuideline(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newGuideline.trim()) {
                                        setConfigForm({...configForm, general_guidelines: [...configForm.general_guidelines, newGuideline.trim()]});
                                        setNewGuideline('');
                                    }
                                }}
                                className="flex-1 bg-[#1c1c1c] text-white px-4 py-2 rounded border border-zinc-800 focus:border-anvil-red outline-none"
                            />
                            <button 
                                onClick={() => {
                                    if (newGuideline.trim()) {
                                        setConfigForm({...configForm, general_guidelines: [...configForm.general_guidelines, newGuideline.trim()]});
                                        setNewGuideline('');
                                    }
                                }}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 rounded transition-colors"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                        <div className="space-y-1">
                            {configForm.general_guidelines.map((g, i) => (
                                <div key={i} className="bg-zinc-800 text-white text-sm px-4 py-2 rounded flex justify-between items-center">
                                    <span>• {g}</span>
                                    <button onClick={() => setConfigForm({...configForm, general_guidelines: configForm.general_guidelines.filter((_, idx) => idx !== i)})} className="hover:text-red-500"><X size={14} /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Suplementación</label>
                        <div className="flex gap-2 mb-2">
                            <input 
                                type="text" 
                                placeholder="Ej. 5g Creatina Post-entreno..."
                                value={newSupplement} 
                                onChange={(e) => setNewSupplement(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newSupplement.trim()) {
                                        setConfigForm({...configForm, global_supplements: [...configForm.global_supplements, newSupplement.trim()]});
                                        setNewSupplement('');
                                    }
                                }}
                                className="flex-1 bg-[#1c1c1c] text-white px-4 py-2 rounded border border-zinc-800 focus:border-anvil-red outline-none"
                            />
                            <button 
                                onClick={() => {
                                    if (newSupplement.trim()) {
                                        setConfigForm({...configForm, global_supplements: [...configForm.global_supplements, newSupplement.trim()]});
                                        setNewSupplement('');
                                    }
                                }}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 rounded transition-colors"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                        <div className="space-y-1">
                            {configForm.global_supplements.map((s, i) => (
                                <div key={i} className="bg-zinc-800/50 border border-blue-500/30 text-blue-100 text-sm px-4 py-2 rounded flex justify-between items-center">
                                    <span>💊 {s}</span>
                                    <button onClick={() => setConfigForm({...configForm, global_supplements: configForm.global_supplements.filter((_, idx) => idx !== i)})} className="hover:text-red-500"><X size={14} /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
                        <button onClick={() => setIsEditingConfig(false)} className="bg-zinc-800 text-white px-4 py-2 rounded font-bold text-sm">Cancelar</button>
                        <button onClick={handleSaveConfig} className="bg-anvil-red text-black px-6 py-2 rounded font-black text-sm uppercase">Guardar Configuración</button>
                    </div>
                </div>
            )}

            {/* Portada Resumen (visible cuando hay datos configurados) */}
            {plan && !isEditingConfig && !isEditingMacros && (
                (plan.tags?.length || plan.general_guidelines?.length || plan.global_supplements?.length || plan.training_block_id) ? (
                    <div className="bg-[#111111] border border-zinc-800 rounded-xl p-5 space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-black text-zinc-400 uppercase tracking-wider">Portada del Plan</h3>
                        </div>
                        
                        {plan.training_block_id && (
                            <p className="text-sm text-zinc-300">
                                <span className="text-zinc-500">Bloque:</span> <span className="font-bold">{plan.training_block_id}</span>
                            </p>
                        )}

                        {plan.tags && plan.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {plan.tags.map((tag, i) => (
                                    <span key={i} className="bg-anvil-red/10 text-anvil-red text-xs font-bold px-3 py-1 rounded-full border border-anvil-red/20 uppercase">{tag}</span>
                                ))}
                            </div>
                        )}

                        {plan.general_guidelines && plan.general_guidelines.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs text-zinc-500 uppercase font-bold">📋 Pautas</p>
                                {plan.general_guidelines.map((g, i) => (
                                    <p key={i} className="text-sm text-zinc-300 pl-2">• {g}</p>
                                ))}
                            </div>
                        )}

                        {plan.global_supplements && plan.global_supplements.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs text-zinc-500 uppercase font-bold">💊 Suplementación</p>
                                <div className="flex flex-wrap gap-2">
                                    {plan.global_supplements.map((s, i) => (
                                        <span key={i} className="bg-blue-500/10 text-blue-300 text-xs px-2 py-1 rounded border border-blue-500/20">{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : null
            )}
            {/* Constructor de Comidas */}
            {plan && !isEditingMacros && (
                <MealBuilder 
                    planId={plan.id}
                    athleteId={athleteId}
                    meals={plan.meals || []}
                />
            )}

            {/* Modal de Exportación PDF */}
            {plan && isPrinting && (
                <PDFEditorModal 
                    plan={plan} 
                    onClose={() => setIsPrinting(false)} 
                />
            )}

            {/* Tracker Flotante */}
            {plan && (
                <FloatingMacroTracker 
                    current={currentMacros}
                    targets={{
                        kcal: plan.calories_target,
                        prot: plan.protein_target,
                        carbs: plan.carbs_target,
                        fats: plan.fats_target
                    }}
                    isVisible={!isPrinting}
                />
            )}
        </div>
    );
}
