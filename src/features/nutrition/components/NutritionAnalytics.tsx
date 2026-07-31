import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Activity, Target, Users, Zap } from 'lucide-react';

export function NutritionAnalytics() {
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState({
        totalPlans: 0,
        avgCalories: 0,
        avgProtein: 0,
        avgCarbs: 0,
        avgFats: 0
    });

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                // Fetch active plans to calculate basic metrics
                const { data: plans, error } = await supabase
                    .from('nutrition_plans')
                    .select('calories_target, protein_target, carbs_target, fats_target')
                    .eq('status', 'active');

                if (error) throw error;

                if (plans && plans.length > 0) {
                    const totalPlans = plans.length;
                    const sums = plans.reduce((acc, plan) => ({
                        calories: acc.calories + Number(plan.calories_target),
                        protein: acc.protein + Number(plan.protein_target),
                        carbs: acc.carbs + Number(plan.carbs_target),
                        fats: acc.fats + Number(plan.fats_target),
                    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

                    setMetrics({
                        totalPlans,
                        avgCalories: Math.round(sums.calories / totalPlans),
                        avgProtein: Math.round(sums.protein / totalPlans),
                        avgCarbs: Math.round(sums.carbs / totalPlans),
                        avgFats: Math.round(sums.fats / totalPlans)
                    });
                }
            } catch (err) {
                console.error("Error fetching analytics:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center p-20">
                <div className="w-10 h-10 border-4 border-anvil-red border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const macroData = [
        { name: 'Proteína', value: metrics.avgProtein * 4, color: '#3b82f6' }, // blue-500
        { name: 'Carbohidratos', value: metrics.avgCarbs * 4, color: '#eab308' }, // yellow-500
        { name: 'Grasas', value: metrics.avgFats * 9, color: '#f97316' }, // orange-500
    ];

    const kpiCards = [
        { title: 'Planes Activos', value: metrics.totalPlans, icon: <Users className="text-anvil-red" /> },
        { title: 'Kcal Promedio', value: metrics.avgCalories, icon: <Zap className="text-yellow-400" /> },
        { title: 'Prot. Promedio', value: `${metrics.avgProtein}g`, icon: <Activity className="text-blue-400" /> },
        { title: 'Objetivo Global', value: 'Mantenimiento', icon: <Target className="text-green-400" /> },
    ];

    return (
        <div className="p-6 md:p-10 space-y-8 animate-fade-in pb-24">
            <div>
                <h1 className="text-3xl font-black text-white uppercase italic tracking-wider mb-2">
                    Métricas del Club
                </h1>
                <p className="text-zinc-400">
                    Resumen global de los planes nutricionales asignados a los atletas.
                </p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiCards.map((card, idx) => (
                    <div key={idx} className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-2xl flex items-center gap-4 hover:border-anvil-red/50 transition-colors">
                        <div className="bg-[#0a0a0a] p-4 rounded-xl">
                            {card.icon}
                        </div>
                        <div>
                            <p className="text-zinc-400 text-sm font-bold uppercase">{card.title}</p>
                            <p className="text-2xl font-black text-white">{card.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {metrics.totalPlans > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Gráfico Circular de Macros */}
                    <div className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-2xl">
                        <h3 className="text-lg font-black text-white uppercase mb-6">Distribución Calórica Promedio</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={macroData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {macroData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        formatter={(value: any) => [`${Math.round(Number(value))} kcal`, '']}
                                        contentStyle={{ backgroundColor: '#111111', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ paddingTop: '20px' }}/>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Gráfico de Barras - Gramos */}
                    <div className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-2xl">
                        <h3 className="text-lg font-black text-white uppercase mb-6">Gramos Promedio por Macro</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={macroData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="name" stroke="#888" tick={{fill: '#888'}} />
                                    <YAxis stroke="#888" tick={{fill: '#888'}} />
                                    <Tooltip 
                                        formatter={(_value: any, _name: any, props: any) => [`${Math.round(props.payload.value / (props.payload.name === 'Grasas' ? 9 : 4))}g`, props.payload.name]}
                                        cursor={{fill: '#222'}}
                                        contentStyle={{ backgroundColor: '#111111', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {macroData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-20 bg-[#0a0a0a] rounded-2xl border border-dashed border-zinc-800">
                    <p className="text-zinc-500 font-medium">No hay suficientes datos. Crea algunos planes nutricionales para ver las métricas.</p>
                </div>
            )}
        </div>
    );
}
