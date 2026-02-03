import { useState, useEffect } from 'react';
import { X, ChevronDown, Calculator, TrendingUp, Dumbbell, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface WarmUpCalculatorProps {
    isOpen: boolean;
    onClose: () => void;
}

interface WarmUpSet {
    weight: number;
    reps: string;
    percentage: number;
    label: string;
}

export function WarmUpCalculator({ isOpen, onClose }: WarmUpCalculatorProps) {
    const [oneRM, setOneRM] = useState<string>('');
    const [targetWeight, setTargetWeight] = useState<string>('');
    const [warmUpSets, setWarmUpSets] = useState<WarmUpSet[]>([]);

    const calculateWarmUp = () => {
        const target = parseFloat(targetWeight);
        if (isNaN(target) || target <= 20) {
            setWarmUpSets([]);
            return;
        }

        const sets: WarmUpSet[] = [
            { weight: 20, reps: '10-15', percentage: 0, label: 'Barra Vacía' }
        ];

        // Standard Warm-up Protocol
        const protocols = [
            { pct: 0.40, reps: '8', label: 'Aproximación 1' },
            { pct: 0.60, reps: '5', label: 'Aproximación 2' },
            { pct: 0.75, reps: '3', label: 'Aproximación 3' },
            { pct: 0.85, reps: '1', label: 'Aproximación 4' },
            { pct: 0.92, reps: '1', label: 'Singular de contacto' },
        ];

        protocols.forEach(p => {
            const w = Math.round((target * p.pct) / 2.5) * 2.5;
            if (w > 20 && w < target) {
                sets.push({ weight: w, reps: p.reps, percentage: Math.round(p.pct * 100), label: p.label });
            }
        });

        // Add Target Set
        sets.push({ weight: target, reps: 'SET DE TRABAJO', percentage: 100, label: 'Objetivo' });

        setWarmUpSets(sets);
    };

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-x-0 bottom-0 top-0 md:top-0 z-[9999] flex md:items-center md:justify-center bg-black/95 backdrop-blur-xl"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-[#1c1c1c] border-x-0 md:border-2 border-t-0 md:border-t border-white/10 w-full h-full md:h-[95vh] md:w-[95vw] md:max-w-2xl md:rounded-[3rem] shadow-[0_0_100px_rgba(255,0,0,0.15)] overflow-hidden flex flex-col scale-in-center mt-0">

                {/* Header */}
                <div className="p-6 md:p-8 border-b border-white/5 flex justify-between items-center bg-[#252525] shrink-0">
                    <div className="flex items-center gap-4 md:gap-5">
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-600 rounded-[1rem] md:rounded-[1.4rem] flex items-center justify-center text-white shadow-2xl shadow-blue-600/40 -rotate-3 border-2 border-white/10">
                            <Dumbbell className="w-6 h-6 md:w-8 md:h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter text-white italic">Aproximaciones</h2>
                            <p className="text-[10px] md:text-[12px] font-black text-blue-500 uppercase tracking-[0.3em]">Anvil Lab Tools</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-12 h-12 md:w-14 md:h-14 bg-white/5 hover:bg-anvil-red hover:text-white rounded-2xl flex items-center justify-center text-gray-400 transition-all"
                    >
                        <X className="w-6 h-6 md:w-7 md:h-7" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-8 md:space-y-10 custom-scrollbar overflow-x-hidden flex flex-col items-center">

                    {/* Inputs Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl mx-auto">
                        <div className="bg-black/40 border-2 border-white/5 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 transition-all group flex flex-col justify-between min-h-[110px] md:min-h-[140px]">
                            <label className="block text-[10px] md:text-xs font-black text-gray-600 mb-2 uppercase tracking-widest group-hover:text-blue-500 transition-colors">Tu 1RM Actual</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.1"
                                    value={oneRM}
                                    onChange={(e) => setOneRM(e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-transparent text-4xl md:text-5xl font-black text-white focus:outline-none placeholder:text-gray-800 italic"
                                />
                                <span className="text-xl md:text-2xl font-black text-gray-800 uppercase italic">kg</span>
                            </div>
                        </div>

                        <div className="bg-black/40 border-2 border-white/5 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 transition-all group flex flex-col justify-between min-h-[110px] md:min-h-[140px]">
                            <label className="block text-[10px] md:text-xs font-black text-gray-600 mb-2 uppercase tracking-widest group-hover:text-blue-500 transition-colors">Peso Objetivo Hoy</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.1"
                                    value={targetWeight}
                                    onChange={(e) => setTargetWeight(e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-transparent text-4xl md:text-5xl font-black text-white focus:outline-none placeholder:text-gray-800 italic"
                                />
                                <span className="text-xl md:text-2xl font-black text-gray-800 uppercase italic">kg</span>
                            </div>
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="w-full max-w-2xl mx-auto space-y-4">
                        <div className="flex items-center gap-2 text-gray-500 mb-4 px-2">
                            <List size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Escalera de Aproximación</span>
                        </div>

                        <div className="space-y-3">
                            {warmUpSets.length > 0 ? (
                                warmUpSets.map((set, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className={`flex items-center justify-between p-5 md:p-6 rounded-[1.5rem] border-2 transition-all ${set.percentage === 100
                                            ? 'bg-blue-600/20 border-blue-600 shadow-lg shadow-blue-600/10'
                                            : 'bg-black/40 border-white/5 hover:border-white/10'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4 md:gap-6">
                                            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center font-black italic text-lg md:text-xl ${set.percentage === 100 ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500'
                                                }`}>
                                                {i + 1}
                                            </div>
                                            <div>
                                                <p className={`text-[10px] font-black uppercase tracking-widest ${set.percentage === 100 ? 'text-blue-400' : 'text-gray-600'}`}>
                                                    {set.label} {set.percentage > 0 && `(${set.percentage}%)`}
                                                </p>
                                                <p className="text-xl md:text-2xl font-black text-white italic">
                                                    {set.weight}<span className="text-xs ml-1 text-gray-500">kg</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Reps</p>
                                            <p className={`text-xl md:text-2xl font-black italic ${set.percentage === 100 ? 'text-blue-400' : 'text-white'}`}>
                                                {set.reps}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))
                            ) : (
                                <div className="text-center py-12 bg-black/20 rounded-[2rem] border-2 border-dashed border-white/5">
                                    <p className="text-gray-600 font-bold italic">Introduce un peso objetivo para ver las aproximaciones</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 md:p-12 pb-12 md:pb-16 bg-[#252525] border-t border-white/5 shrink-0">
                    <button
                        onClick={calculateWarmUp}
                        className="group w-full bg-blue-600 text-white hover:bg-blue-500 py-6 md:py-8 rounded-[2rem] font-black text-lg md:text-2xl uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-all active:scale-[0.98] shadow-2xl shadow-blue-600/20"
                    >
                        <TrendingUp className="w-6 h-6 md:w-8 md:h-8 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        Calcular Aproximaciones
                    </button>
                </div>
            </div>
        </div>
    );
}
