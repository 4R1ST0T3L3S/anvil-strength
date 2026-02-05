import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calculator, Weight } from 'lucide-react';
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

    // PORTAL FIX: Render directly to body to avoid z-index/transform stacking issues with Header
    return createPortal(
        <div
            className="fixed inset-x-0 bottom-0 top-0 md:top-0 z-[20000] flex md:items-center md:justify-center bg-black/95 backdrop-blur-xl"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-[#1c1c1c] border-x-0 md:border-2 border-t-0 md:border-t border-white/10 w-full h-full md:h-[90vh] md:w-[95vw] md:max-w-[1800px] md:rounded-[2rem] shadow-[0_0_100px_rgba(255,0,0,0.15)] overflow-hidden flex flex-col scale-in-center mt-0">

                {/* Header */}
                <div className="p-4 md:px-6 md:py-3 border-b border-white/5 flex justify-between items-center bg-[#252525] shrink-0 h-16 md:h-20">
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

                {/* Visual Bar - Restricted Height (35%) */}
                <div className="bg-[#252525] border-b border-white/5 w-full shrink-0 h-[35%] flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)]"></div>

                    {/* The Barbell Visualization */}
                    <div className="relative z-10 scale-[0.6] md:scale-75 origin-center w-full max-w-[90%] flex items-center justify-center">
                        {/* The Bar Itself */}
                        <div className="flex items-center">
                            {/* Bar End Cap */}
                            <div className="w-4 h-4 bg-[#555555] rounded-full shadow-lg shrink-0"></div>

                            {/* Main Bar (The part you hold) - Grey/Silver */}
                            <div className="w-24 md:w-48 h-6 bg-[#999999] shadow-inner shrink-0 bg-gradient-to-b from-[#aaaaaa] to-[#888888]"></div>

                            {/* The Collar Stopper (Thin grey part) */}
                            <div className="w-2 h-8 bg-[#888888] shrink-0"></div>

                            {/* The Main Collar (The thick grey part) */}
                            <div className="w-6 h-12 bg-[#cccccc] rounded-sm shadow-xl relative z-30 shrink-0"></div>

                            {/* The Sleeve (Where plates go) */}
                            <div className="relative flex items-center z-10 shrink-0">
                                {/* Sleeve metal rod - Fixed length, doesn't reach the end */}
                                <div className="w-56 md:w-96 h-8 bg-[#aaaaaa] rounded-r-sm z-0 shadow-sm border-y border-white/5"></div>

                                {/* Plates stacked on the sleeve */}
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-0.5 pl-1">
                                    <AnimatePresence mode="popLayout">
                                        {platesNeeded.map((plate, i) => (
                                            <motion.div
                                                key={`${plate.weight}-${i}`}
                                                initial={{ x: 100, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                exit={{ x: -20, opacity: 0 }}
                                                className={`${plate.height} w-3 md:w-6 rounded-sm flex items-center justify-center text-[6px] md:text-[12px] font-black border-x border-black/30 shadow-2xl shrink-0`}
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
                                            className="w-4 md:w-8 h-14 md:h-28 bg-[#dddddd] rounded-sm shadow-2xl z-20 border-x border-black/40 flex items-center justify-center shrink-0 relative"
                                        >
                                            <span className="text-[6px] md:text-[10px] font-black text-black rotate-90 relative z-10 leading-none">2.5</span>

                                            {/* Competition Lever (Palanca) */}
                                            <div className="absolute -top-6 md:-top-10 left-1/2 -translate-x-1/2 w-1 md:w-2 h-8 md:h-12 bg-[#bbbbbb] rounded-full border border-black/10 shadow-lg origin-bottom -rotate-12">
                                                <div className="absolute top-0 left-0 w-full h-1/3 bg-white/20 rounded-full"></div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop Split View: Controls Left, List Right - Takes remaining space */}
                <div className="md:grid md:grid-cols-2 md:gap-8 w-full max-w-6xl mx-auto p-4 md:p-6 flex-1 h-[65%] overflow-hidden">

                    {/* LEFT: Controls - Flex Column with specific heights */}
                    <div className="flex flex-col gap-4 h-full pt-2">
                        {/* Input Section - Takes more space */}
                        <div className="bg-black/40 border-2 border-white/5 rounded-2xl p-4 flex flex-col justify-center flex-1 min-h-0">
                            <label className="block text-[10px] md:text-xs font-black text-gray-600 mb-1 uppercase tracking-widest text-center">Peso Total Objetivo</label>
                            <div className="flex items-center justify-center gap-2">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.1"
                                    value={targetWeight}
                                    onChange={(e) => setTargetWeight(e.target.value)}
                                    placeholder="20"
                                    className="w-full bg-transparent text-center text-4xl md:text-5xl font-black text-white focus:outline-none placeholder:text-gray-800 italic tracking-tighter"
                                />
                                <span className="text-xl md:text-2xl font-black text-gray-800 uppercase italic">kg</span>
                            </div>
                        </div>

                        {/* Competition Collars Selector - Takes less space */}
                        <div className="bg-black/40 border-2 border-white/5 rounded-2xl p-3 flex flex-row items-center justify-between gap-4 shrink-0 h-20 md:h-24">
                            <label className="block text-[9px] md:text-[10px] font-black text-gray-600 uppercase tracking-widest leading-tight">Cierres de<br />Competición</label>
                            <div className="flex bg-black/60 p-1 rounded-lg border border-white/5 shrink-0">
                                <button
                                    onClick={() => setHasCollars(true)}
                                    className={`px-3 py-2 rounded-md font-black italic text-[10px] md:text-xs transition-all ${hasCollars ? 'bg-anvil-red text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    SÍ
                                </button>
                                <button
                                    onClick={() => setHasCollars(false)}
                                    className={`px-3 py-2 rounded-md font-black italic text-[10px] md:text-xs transition-all ${!hasCollars ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    NO
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Inventory Info - Ultra Compacted */}
                    <div className="flex flex-col overflow-hidden h-full pt-2">
                        <div className="bg-[#252525] rounded-2xl p-3 md:p-4 border border-white/5 flex-1 flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-sm md:text-base font-black text-white uppercase tracking-widest italic">Discos (Por lado)</h3>
                                <div className="px-3 py-1 bg-anvil-red/10 rounded-full border border-anvil-red/20">
                                    <span className="text-[10px] md:text-xs font-black text-anvil-red uppercase italic">IPF Standard Calibrated</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap content-start gap-3 flex-1">
                                <AnimatePresence>
                                    {Object.entries(
                                        platesNeeded.reduce((acc, plate) => {
                                            acc[plate.weight] = (acc[plate.weight] || 0) + 1;
                                            return acc;
                                        }, {} as Record<number, number>)
                                    )
                                        .sort(([weightA], [weightB]) => parseFloat(weightB) - parseFloat(weightA))
                                        .map(([weight, count], idx) => {
                                            const plate = PLATES_CONFIG.find(p => p.weight === parseFloat(weight));
                                            return (
                                                <motion.div
                                                    key={weight}
                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    className="flex items-center gap-3 bg-black/40 pr-5 pl-2 py-3 rounded-2xl border border-white/5 hover:border-white/20 transition-colors"
                                                >
                                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full shadow-lg border-2 border-white/5 flex items-center justify-center text-[8px] md:text-[10px] font-black text-black/50" style={{ backgroundColor: plate?.color }}>
                                                        {weight}
                                                    </div>
                                                    <div className="flex flex-col leading-none">
                                                        <span className="text-lg md:text-2xl font-black text-white italic">x{count}</span>
                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{weight} kg</span>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    {hasCollars && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="flex items-center gap-3 bg-gray-400/10 pr-5 pl-2 py-3 rounded-2xl border border-gray-400/20"
                                        >
                                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-400 shadow-lg border-2 border-white/10 flex items-center justify-center">
                                                <div className="w-1.5 h-4 bg-black/20 rounded-full rotate-45"></div>
                                            </div>
                                            <div className="flex flex-col leading-none">
                                                <span className="text-lg md:text-2xl font-black text-white italic">x1</span>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cierre</span>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {!platesNeeded.length && !hasCollars && (
                                    <div className="w-full h-32 flex flex-col items-center justify-center text-gray-700 space-y-2 border-2 border-dashed border-white/5 rounded-2xl">
                                        <Calculator size={24} className="opacity-50" />
                                        <p className="italic text-sm font-bold">Introduce un peso válido...</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 md:px-6 md:py-4 bg-[#252525] border-t border-white/5 shrink-0 text-center flex items-center justify-center gap-3 h-16 md:h-20">
                    <p className="text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-[0.3em] italic">
                        TOTAL EN BARRA:
                    </p>
                    <span className="text-3xl md:text-5xl font-black text-white italic tracking-tighter">
                        {platesNeeded.reduce((acc, p) => acc + p.weight * 2, 20 + (hasCollars ? 5 : 0))} <span className="text-anvil-red text-lg md:text-2xl">kg</span>
                    </span>
                </div>
            </div>
        </div >,
        document.body
    );
}
