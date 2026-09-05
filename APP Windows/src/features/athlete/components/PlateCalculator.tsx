import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Calculator, Weight } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';

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
    { weight: 25, color: '#ef4444', height: 'h-64', label: '25' }, // Rojo
    { weight: 20, color: '#3b82f6', height: 'h-56', label: '20' }, // Azul
    { weight: 15, color: '#eab308', height: 'h-44', label: '15' }, // Amarillo
    { weight: 10, color: '#22c55e', height: 'h-36', label: '10' }, // Verde
    { weight: 5, color: '#ffffff', height: 'h-28', label: '5' },  // Blanco
    { weight: 2.5, color: '#000000', height: 'h-22', label: '2.5' }, // Negro
    { weight: 1.25, color: '#9ca3af', height: 'h-18', label: '1.25' }, // Plata
    { weight: 0.5, color: '#ffffff', height: 'h-14', label: '0.5' }, // Blanco
    { weight: 0.25, color: '#ef4444', height: 'h-12', label: '0.25' }, // Rojo
];

export function PlateCalculator({ isOpen, onClose }: PlateCalculatorProps) {
    const [targetWeight, setTargetWeight] = useState<string>('');
    const [hasCollars, setHasCollars] = useState<boolean>(false);
    const platesNeeded = useMemo(() => {
        const barWeight = 20;
        const collarsWeight = hasCollars ? 5 : 0;
        const weightPerSide = (parseFloat(targetWeight) - (barWeight + collarsWeight)) / 2;

        if (isNaN(weightPerSide) || weightPerSide <= 0) {
            return [];
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

        return result;
    }, [targetWeight, hasCollars]);

    if (!isOpen) return null;

    // PORTAL FIX: Render directly to body to avoid z-index/transform stacking issues with Header
    return createPortal(
        <div
            className="fixed inset-x-0 bottom-0 z-[20000] flex bg-black/95 backdrop-blur-xl top-0 items-center justify-center"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-surface-sunken border-line shadow-[0_0_100px_rgba(255,0,0,0.15)] overflow-hidden flex flex-col scale-in-center mt-0 border-2 border-t h-[90vh] w-[95vw] max-w-[1800px] rounded-[2rem]">

                {/* Header */}
                <div className="p-4 border-b border-subtle flex justify-between items-center bg-surface-sunken shrink-0 px-6 py-3 h-20">
                    <div className="flex items-center gap-5">
                        <div className="text-success origin-left">
                            <Weight size={40} strokeWidth={1.5} className="w-12 h-12" />
                        </div>
                        <div>
                            <h2 className="font-black uppercase tracking-tighter text-ink italic text-4xl">Carga de Barra</h2>
                            <p className="font-black text-brand-text uppercase tracking-[0.3em] text-t-xs">Anvil Lab Tools</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-white/5 hover:bg-brand hover:text-ink rounded-2xl flex items-center justify-center text-ink-muted transition-colors w-14 h-14"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Visual Bar - Mobile: Fixed Height, Desktop: Flexible */}
                <div className="bg-surface-sunken border-b border-subtle w-full shrink-0 flex items-center justify-center relative overflow-hidden h-[35%]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)]"></div>

                    {/* The Barbell Visualization */}
                    <div className="relative z-10 origin-center w-full max-w-[90%] flex items-center justify-center scale-75">
                        {/* The Bar Itself */}
                        <div className="flex items-center">
                            {/* Bar End Cap */}
                            <div className="w-4 h-4 bg-[#555555] rounded-full shadow-lg shrink-0"></div>

                            {/* Main Bar (The part you hold) - Grey/Silver */}
                            <div className="h-6 shadow-inner shrink-0 bg-gradient-to-b from-[#aaaaaa] to-[#888888] w-48"></div>

                            {/* The Collar Stopper (Thin grey part) */}
                            <div className="w-2 h-8 bg-[#888888] shrink-0"></div>

                            {/* The Main Collar (The thick grey part) */}
                            <div className="w-6 h-12 bg-[#cccccc] rounded-sm shadow-xl relative z-30 shrink-0"></div>

                            {/* The Sleeve (Where plates go) */}
                            <div className="relative flex items-center z-10 shrink-0">
                                {/* Sleeve metal rod - Fixed length, doesn't reach the end */}
                                <div className="h-8 bg-[#aaaaaa] rounded-r-sm z-0 shadow-sm border-y border-subtle w-96"></div>

                                {/* Plates stacked on the sleeve */}
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-0.5 pl-1">
                                    <AnimatePresence mode="popLayout">
                                        {platesNeeded.map((plate, i) => (
                                            <m.div
                                                key={`${plate.weight}-${i}`}
                                                initial={{ x: 100, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                exit={{ x: -20, opacity: 0 }}
                                                className={`${plate.height} rounded-sm flex items-center justify-center font-black border-x border-black/30 shadow-2xl shrink-0 w-6 text-[12px]`}
                                                style={{
                                                    backgroundColor: plate.color,
                                                    color: plate.weight === 2.5 || plate.weight === 20 || plate.weight === 0.25 ? 'white' : 'black'
                                                }}
                                            >
                                                <span className="rotate-90 leading-none tracking-tighter">{plate.label}</span>
                                            </m.div>
                                        ))}
                                    </AnimatePresence>

                                    {/* Competition Collar (Silver) - Now INSIDE the flex container to stick to plates */}
                                    {hasCollars && (
                                        <m.div
                                            initial={{ x: 30, opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            className="bg-[#dddddd] rounded-sm shadow-2xl z-20 border-x border-black/40 flex items-center justify-center shrink-0 relative w-8 h-28"
                                        >
                                            <span className="font-black text-black rotate-90 relative z-10 text-[10px]">2.5</span>

                                            {/* Competition Lever (Palanca) */}
                                            <div className="absolute left-1/2 -translate-x-1/2 bg-[#bbbbbb] rounded-full border border-black/10 shadow-lg origin-bottom -rotate-12 -top-10 w-2 h-12">
                                                <div className="absolute top-0 left-0 w-full h-1/3 bg-white/20 rounded-full"></div>
                                            </div>
                                        </m.div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Body: Flexible height, scrollable on mobile */}
                <div className="flex-1 w-full max-w-6xl mx-auto overflow-hidden p-6">
                    <div className="flex-col h-full grid grid-cols-2 gap-8">

                        {/* LEFT: Controls */}
                        <div className="flex flex-col gap-4 pt-2 shrink-0 h-full">
                            {/* Input Section */}
                            <div className="bg-black/40 border-2 border-subtle rounded-2xl p-4 flex flex-col justify-center flex-1 min-h-0">
                                <label className="block font-black text-gray-600 mb-1 uppercase tracking-widest text-center text-xs">Peso Total Objetivo</label>
                                <div className="flex items-center justify-center gap-2">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.5"
                                        min="20"
                                        max="510"
                                        value={targetWeight}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            // Allow empty string or valid float input up to 510
                                            if (val === '' || (parseFloat(val) <= 510)) {
                                                setTargetWeight(val);
                                            } else {
                                                // Clamp to 510 if user tries to paste or type higher
                                                setTargetWeight('510');
                                            }
                                        }}
                                        onBlur={() => {
                                            if (targetWeight) {
                                                const val = parseFloat(targetWeight);
                                                // Round to nearest 0.5
                                                const rounded = Math.round(val * 2) / 2;
                                                setTargetWeight(rounded.toString());
                                            }
                                        }}
                                        placeholder="20"
                                        className="w-full bg-transparent text-center font-black text-ink placeholder:text-gray-800 italic tracking-tighter text-5xl"
                                    />
                                    <span className="font-black text-gray-800 uppercase italic text-2xl">kg</span>
                                </div>
                            </div>

                            {/* Competition Collars Selector */}
                            <div className="bg-black/40 border-2 border-subtle rounded-2xl p-3 flex flex-row items-center justify-between gap-4 shrink-0 h-24">
                                <label className="block text-t-2xs font-black text-gray-600 uppercase tracking-widest leading-tight">Cierres de<br />Competición</label>
                                <div className="flex bg-black/60 p-1 rounded-lg border border-subtle shrink-0">
                                    <button
                                        onClick={() => setHasCollars(true)}
                                        className={`px-3 py-2 rounded-md font-black italic transition-[background-color,box-shadow,color] text-xs ${hasCollars ? 'bg-brand text-ink shadow-lg' : 'text-ink-subtle hover:text-ink'}`}
                                    >
                                        SÍ
                                    </button>
                                    <button
                                        onClick={() => setHasCollars(false)}
                                        className={`px-3 py-2 rounded-md font-black italic transition-[background-color,box-shadow,color] text-xs ${!hasCollars ? 'bg-white text-black shadow-lg' : 'text-ink-subtle hover:text-ink'}`}
                                    >
                                        NO
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: Inventory Info */}
                        <div className="flex flex-col overflow-hidden h-full pt-2">
                            <div className="bg-surface-sunken rounded-2xl border border-subtle flex-1 flex flex-col min-h-[200px] p-4 overflow-hidden">
                                <div className="flex items-center justify-between shrink-0 mb-8">
                                    <h3 className="font-black text-ink uppercase tracking-widest italic text-base">Discos (Por lado)</h3>
                                    <div className="px-3 py-1 bg-brand/10 rounded-full border border-brand/20">
                                        <span className="font-black text-brand-text uppercase italic text-xs">IPF Standard</span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap content-start gap-3 flex-1 overflow-y-auto custom-scrollbar pr-2">
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
                                                    <m.div
                                                        key={weight}
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ delay: idx * 0.05 }}
                                                        className="flex items-center gap-3 bg-black/40 pr-5 pl-2 py-3 rounded-2xl border border-subtle hover:border-strong transition-colors"
                                                    >
                                                        <div className="rounded-full shadow-lg border-2 border-subtle flex items-center justify-center text-t-2xs font-black text-black/50 w-10 h-10" style={{ backgroundColor: plate?.color }}>
                                                            {weight}
                                                        </div>
                                                        <div className="flex flex-col leading-none">
                                                            <span className="font-black text-ink italic text-2xl">x{count}</span>
                                                            <span className="text-t-2xs font-bold text-ink-subtle uppercase tracking-wider">{weight} kg</span>
                                                        </div>
                                                    </m.div>
                                                );
                                            })}
                                        {hasCollars && (
                                            <m.div
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="flex items-center gap-3 bg-gray-400/10 pr-5 pl-2 py-3 rounded-2xl border border-gray-400/20"
                                            >
                                                <div className="rounded-full bg-gray-400 shadow-lg border-2 border-line flex items-center justify-center w-10 h-10">
                                                    <div className="w-1.5 h-4 bg-black/20 rounded-full rotate-45"></div>
                                                </div>
                                                <div className="flex flex-col leading-none">
                                                    <span className="font-black text-ink italic text-2xl">x1</span>
                                                    <span className="text-t-2xs font-bold text-ink-muted uppercase tracking-wider">Cierre</span>
                                                </div>
                                            </m.div>
                                        )}
                                    </AnimatePresence>

                                    {!platesNeeded.length && !hasCollars && (
                                        <div className="w-full h-32 flex flex-col items-center justify-center text-gray-700 space-y-2 border-2 border-dashed border-subtle rounded-2xl">
                                            <Calculator size={24} className="opacity-50" />
                                            <p className="italic text-sm font-bold">Introduce un peso válido...</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-surface-sunken border-t border-subtle shrink-0 text-center flex items-center justify-center gap-3 px-6 py-4 h-20">
                    <p className="font-black text-ink-subtle uppercase tracking-[0.3em] italic text-xs">
                        TOTAL EN BARRA:
                    </p>
                    <span className="font-black text-ink italic tracking-tighter text-5xl">
                        {platesNeeded.reduce((acc, p) => acc + p.weight * 2, 20 + (hasCollars ? 5 : 0))} <span className="text-brand-text text-2xl">kg</span>
                    </span>
                </div>
            </div>
        </div >,
        document.body
    );
}
