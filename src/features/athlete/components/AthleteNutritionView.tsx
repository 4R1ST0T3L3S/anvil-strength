import { useState, useEffect } from 'react';
import {
    Utensils,
    Zap,
    Droplets,
    Flame,
    Apple,
    ChevronRight,
    Clock,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';

interface AthleteNutritionViewProps {
    user: UserProfile;
}

interface MacroTarget {
    label: string;
    current: number;
    target: number;
    unit: string;
    color: string;
    icon: React.ReactNode;
}

export function AthleteNutritionView({ user: _user }: AthleteNutritionViewProps) {
    const [loading, setLoading] = useState(true);
    const [planExists, _setPlanExists] = useState(false);

    useEffect(() => {
        // Simulation of fetching nutrition plan
        const timer = setTimeout(() => {
            setLoading(false);
            // setPlanExists(true); // Toggle this to see empty state vs plan
        }, 800);
        return () => clearTimeout(timer);
    }, []);

    const macros: MacroTarget[] = [
        { label: 'Proteína', current: 0, target: 180, unit: 'g', color: 'bg-red-500', icon: <Flame size={16} /> },
        { label: 'Carbohidratos', current: 0, target: 350, unit: 'g', color: 'bg-blue-500', icon: <Zap size={16} /> },
        { label: 'Grasas', current: 0, target: 80, unit: 'g', color: 'bg-yellow-500', icon: <Droplets size={16} /> },
    ];

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-anvil-red"></div>
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Cargando Plan Nutricional...</p>
            </div>
        );
    }

    if (!planExists) {
        return (
            <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
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

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2 text-white">Mi Nutrición</h1>
                    <p className="text-gray-400 text-lg">Objetivos diarios y planificación.</p>
                </div>
                <div className="hidden md:block text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Total Calorías</p>
                    <p className="text-3xl font-black text-white italic">2,850 <span className="text-xs not-italic text-gray-500">kcal</span></p>
                </div>
            </header>

            {/* Macros Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {macros.map((macro, i) => (
                    <div key={i} className="bg-[#252525] border border-white/5 p-6 rounded-2xl space-y-4 group hover:border-white/10 transition-all">
                        <div className="flex justify-between items-center">
                            <div className={`p-2 rounded-lg ${macro.color}/10 text-${macro.color.split('-')[1]}-500`}>
                                {macro.icon}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{macro.label}</span>
                        </div>
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <p className="text-2xl font-black text-white">{macro.target}{macro.unit}</p>
                                <p className="text-[10px] font-bold text-gray-500">Objetivo</p>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${macro.color} transition-all duration-1000`}
                                    style={{ width: '0%' }} // Starting at 0 for animation
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Meals Placeholder */}
            <div className="space-y-4">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <Utensils size={16} /> Comidas del día
                </h2>

                <div className="space-y-4">
                    {['Desayuno', 'Almuerzo', 'Merienda', 'Cena'].map((meal, i) => (
                        <div key={i} className="bg-[#252525] border border-white/5 p-6 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-white/10 transition-all">
                            <div className="flex items-center gap-6">
                                <div className="text-gray-600 font-black text-2xl italic group-hover:text-anvil-red transition-colors">0{i + 1}</div>
                                <div>
                                    <h3 className="font-bold text-white uppercase tracking-tight">{meal}</h3>
                                    <p className="text-gray-500 text-xs">Ver recomendaciones de menú</p>
                                </div>
                            </div>
                            <div className="bg-white/5 p-2 rounded-lg group-hover:bg-white/10 transition-colors">
                                <ChevronRight size={18} className="text-gray-500" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
