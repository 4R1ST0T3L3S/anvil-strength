import { useState, useEffect } from 'react';
import { X, Calculator, TrendingUp, ChevronRight, Weight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PlateCalculatorProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Plate {
    weight: number;
    color: string;
    height: string; // CSS height class
    label: string;
}

const PLATES_CONFIG: Plate[] = [
    { weight: 25, color: '#ef4444', height: 'h-48 md:h-64', label: '25' }, // Rojo
    { weight: 20, color: '#3b82f6', height: 'h-40 md:h-56', label: '20' }, // Azul
    { weight: 15, color: '#eab308', height: 'h-32 md:h-44', label: '15' }, // Amarillo
    { weight: 10, color: '#22c55e', height: 'h-28 md:h-36', label: '10' }, // Verde
    { weight: 5, color: '#ffffff', height: 'h-20 md:h-28', label: '5' },  // Blanco
    { weight: 2.5, color: '#000000', height: 'h-16 md:h-22', label: '2.5' }, // Negro
    { weight: 1.25, color: '#9ca3af', height: 'h-12 md:h-18', label: '1.25' }, // Plata
    { weight: 0.5, color: '#ffffff', height: 'h-10 md:h-14', label: '0.5' }, // Blanco
    { weight: 0.25, color: '#ef4444', height: 'h-8 md:h-12', label: '0.25' }, // Rojo
];

export function PlateCalculator({ isOpen, onClose }: PlateCalculatorProps) {
    const [targetWeight, setTargetWeight] = useState<string>('');
    const [hasCollars, setHasCollars] = useState<boolean>(false);
    const [platesNeeded, setPlatesNeeded] = useState<Plate[]>([]);

    const calculatePlates = () => {
        const barWeight = 20;
        const collarsWeight = hasCollars ? 5 : 0;
        const weightPerSide = (parseFloat(targetWeight) - (barWeight + collarsWeight)) / 2;
        
        if (isNaN(weightPerSide) || weightPerSide <= 0) {
            setPlatesNeeded([]);
            return;
        }

        const result: Plate[] = [];
        let remaining = weightPerSide;

        // Use a small epsilon to handle floating point precision issues
        const EPSILON = 0.001;

        PLATES_CONFIG.forEach(plate => {
            while (remaining >= plate.weight - EPSILON) {
                result.push(plate);
                remaining -= plate.weight;
            }
        });

        setPlatesNeeded(result);
    };

    useEffect(() => {
        calculatePlates();
    }, [targetWeight, hasCollars]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-x-0 bottom-0 top-[48px] md:top-0 z-[9999] flex md:items-center md:justify-center bg-black/95 backdrop-blur-xl"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-[#1c1c1c] border-x-0 md:border-2 border-t-0 md:border-t border-white/10 w-full h-full md:h-[95vh] md:w-[95vw] md:max-w-4xl md:rounded-[3rem] shadow-[0_0_100px_rgba(255,0,0,0.15)] overflow-hidden flex flex-col scale-in-center mt-0">
                
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-white/5 flex justify-between items-center bg-[#252525] shrink-0">
                    <div className="flex items-center gap-4 md:gap-5">
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-anvil-red rounded-[1rem] md:rounded-[1.4rem] flex items-center justify-center text-white shadow-2xl shadow-anvil-red/40 -rotate-3 border-2 border-white/10">
                            <Weight className="w-6 h-6 md:w-8 md:h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter text-white italic">Carga de Barra</h2>
                            <p className="text-[10px] md:text-[12px] font-black text-anvil-red uppercase tracking-[0.3em]">Anvil Lab Tools</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-12 h-12 md:w-14 md:h-14 bg-white/5 hover:bg-anvil-red hover:text-white rounded-2xl flex items-center justify-center text-gray-400 transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-12 md:space-y-16 custom-scrollbar overflow-x-hidden flex flex-col items-center">
                    
                    {/* Visual Bar Display - Clean Screenshot Style */}
                    <div className="w-full relative py-10 md:py-20 flex items-center justify-start overflow-hidden shrink-0">
                        <div className="relative flex items-center scale-90 md:scale-110 origin-left">
                            {/* Main Bar (The part you hold) - Grey/Silver */}
                            <div className="w-32 md:w-48 h-3 md:h-4 bg-[#999999] shrink-0"></div>
                            
                            {/* The Collar Stopper (Thin grey part) */}
                            <div className="w-2 h-8 bg-[#888888] shrink-0"></div>

                            {/* The Main Collar (The thick grey part) */}
                            <div className="w-6 h-12 bg-[#cccccc] rounded-sm shadow-xl relative z-30 shrink-0"></div>
                            
                            {/* The Sleeve (Where plates go) */}
                            <div className="relative flex items-center z-10 shrink-0">
                                {/* Sleeve metal rod - Fixed length, doesn't reach the end */}
                                <div className="w-60 md:w-80 h-8 bg-[#aaaaaa] rounded-r-sm z-0 shadow-sm border-y border-white/5"></div>
                                
                                {/* Plates stacked on the sleeve */}
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-0.5 pl-1">
                                        <AnimatePresence mode="popLayout">
                                            {platesNeeded.map((plate, i) => (
                                                <motion.div
                                                    key={`${plate.weight}-${i}`}
                                                    initial={{ x: 100, opacity: 0 }}
                                                    animate={{ x: 0, opacity: 1 }}
                                                    exit={{ x: -20, opacity: 0 }}
                                                    className={`${plate.height} w-3 md:w-5 rounded-sm flex items-center justify-center text-[6px] md:text-[10px] font-black border-x border-black/30 shadow-2xl shrink-0`}
                                                    style={{ 
                                                        backgroundColor: plate.color,
                                                        color: plate.weight === 2.5 || plate.weight === 20 || plate.weight === 0.25 ? 'white' : 'black'
                                                    }}
                                                >
                                                    <span className="rotate-90 leading-none tracking-tighter">{plate.label}</span>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>

                                        {/* Competition Collar (Silver) - Now INSIDE the flex container to stick to plates */}
                                        {hasCollars && (
                                            <motion.div 
                                                initial={{ x: 30, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                className="w-4 md:w-6 h-14 md:h-24 bg-[#dddddd] rounded-sm shadow-2xl z-20 border-x border-black/40 flex items-center justify-center shrink-0 relative"
                                            >
                                                <span className="text-[6px] md:text-[8px] font-black text-black rotate-90 relative z-10 leading-none">2.5</span>
                                                
                                                {/* Competition Lever (Palanca) */}
                                                <div className="absolute -top-6 md:-top-10 left-1/2 -translate-x-1/2 w-1 md:w-1.5 h-8 md:h-12 bg-[#bbbbbb] rounded-full border border-black/10 shadow-lg origin-bottom -rotate-12">
                                                    <div className="absolute top-0 left-0 w-full h-1/3 bg-white/20 rounded-full"></div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Controls */}
                    <div className="w-full max-w-xl space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Target Weight Input */}
                            <div className="bg-black/40 border-2 border-white/5 rounded-[2rem] p-8 transition-all group focus-within:border-anvil-red">
                                <label className="block text-[10px] font-black text-gray-600 mb-2 uppercase tracking-widest group-focus-within:text-anvil-red">Peso Total (kg)</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="number"
                                        value={targetWeight}
                                        onChange={(e) => setTargetWeight(e.target.value)}
                                        placeholder="20"
                                        className="w-full bg-transparent text-5xl font-black text-white focus:outline-none placeholder:text-gray-800 italic"
                                    />
                                    <span className="text-2xl font-black text-gray-800 uppercase italic">kg</span>
                                </div>
                            </div>

                            {/* Competition Collars Selector */}
                            <div className="bg-black/40 border-2 border-white/5 rounded-[2rem] p-8 flex flex-col justify-between">
                                <label className="block text-[10px] font-black text-gray-600 mb-2 uppercase tracking-widest">Cierres de Competición</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setHasCollars(true)}
                                        className={`py-3 rounded-xl font-black italic transition-all ${hasCollars ? 'bg-anvil-red text-white shadow-lg shadow-anvil-red/20' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                                    >
                                        SÍ
                                    </button>
                                    <button 
                                        onClick={() => setHasCollars(false)}
                                        className={`py-3 rounded-xl font-black italic transition-all ${!hasCollars ? 'bg-white text-black' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                                    >
                                        NO
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Inventory Info */}
                        <div className="bg-[#252525] rounded-[2rem] p-8 border border-white/5">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xs font-black text-white uppercase tracking-widest italic">Discos por lado</h3>
                                <div className="px-3 py-1 bg-anvil-red/10 rounded-full">
                                    <span className="text-[10px] font-black text-anvil-red uppercase italic">IPF Standard</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {Object.entries(
                                    platesNeeded.reduce((acc, plate) => {
                                        acc[plate.weight] = (acc[plate.weight] || 0) + 1;
                                        return acc;
                                    }, {} as Record<number, number>)
                                )
                                .sort(([weightA], [weightB]) => parseFloat(weightB) - parseFloat(weightA))
                                .map(([weight, count]) => {
                                    const plate = PLATES_CONFIG.find(p => p.weight === parseFloat(weight));
                                    return (
                                        <div key={weight} className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-xl border border-white/5">
                                            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: plate?.color }}></div>
                                            <span className="text-sm font-black text-white italic">
                                                x{count} de {weight}kg
                                            </span>
                                        </div>
                                    );
                                })}
                                {hasCollars && (
                                    <div className="flex items-center gap-2 bg-gray-400/20 px-4 py-2 rounded-xl border border-gray-400/30">
                                        <div className="w-3 h-3 rounded-full bg-gray-400 shadow-[0_0_5px_rgba(255,255,255,0.5)]"></div>
                                        <span className="text-sm font-black text-white italic">x1 Cierre (2.5kg)</span>
                                    </div>
                                )}
                                {!platesNeeded.length && !hasCollars && (
                                    <p className="text-gray-600 italic text-sm font-bold">Introduce un peso superior a la barra...</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 md:p-12 pb-12 md:pb-16 bg-[#252525] border-t border-white/5 shrink-0 text-center">
                    <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] italic mb-4">
                        Peso total cargado: {platesNeeded.reduce((acc, p) => acc + p.weight * 2, 20 + (hasCollars ? 5 : 0))} kg
                    </p>
                </div>
            </div>
        </div>
    );
}
