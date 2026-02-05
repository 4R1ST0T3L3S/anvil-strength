import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, Activity, Zap, Calculator, TrendingUp, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OneRMCalculatorProps {
    isOpen: boolean;
    onClose: () => void;
}

// Custom Select Component for App Aesthetic
function CustomSelect({
    value,
    onChange,
    options,
    label,
    className = ""
}: {
    value: any;
    onChange: (val: any) => void;
    options: { label: string; value: any }[];
    label: string;
    className?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`bg-black/40 border-2 border-white/5 rounded-2xl p-3 md:p-4 transition-all group flex flex-col justify-between overflow-hidden ${className}`}>
            <label className="block text-[8px] md:text-[10px] font-black text-gray-600 mb-1 md:mb-2 uppercase tracking-widest group-hover:text-anvil-red transition-colors truncate">
                {label}
            </label>
            <button
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center justify-center focus:outline-none text-center relative"
            >
                <span className="text-2xl md:text-4xl font-black text-white italic leading-none truncate px-4">
                    {options.find(opt => opt.value === value)?.label || value}
                </span>
                <ChevronDown
                    className="text-anvil-red shrink-0 w-4 h-4 md:w-6 md:h-6 absolute right-0"
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />

                        {/* Options List */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-[280px] bg-[#1c1c1c] border-2 border-white/10 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden"
                        >
                            <div className="p-6 border-b border-white/5 bg-[#252525]">
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] text-center">{label}</h3>
                            </div>
                            <div className="p-3 max-h-[40vh] overflow-y-auto custom-scrollbar">
                                {options.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            onChange(option.value);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl text-left transition-all mb-1 last:mb-0 ${value === option.value
                                            ? 'bg-anvil-red text-white shadow-lg shadow-anvil-red/20 scale-[1.02]'
                                            : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                            }`}
                                    >
                                        <span className="font-black italic uppercase tracking-wider text-lg">
                                            {option.label}
                                        </span>
                                        {value === option.value && <Check size={20} />}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-full py-5 bg-white/5 text-gray-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors border-t border-white/5"
                            >
                                Cerrar
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Tuchscherer RPE Chart Approximation (% of 1RM)
const RPE_CHART: Record<number, Record<number, number>> = {
    10: { 1: 100, 2: 96, 3: 92, 4: 89, 5: 86, 6: 84, 7: 81, 8: 79, 9: 76, 10: 74 },
    9.5: { 1: 98, 2: 94, 3: 91, 4: 88, 5: 85, 6: 82, 7: 80, 8: 77, 9: 75, 10: 72 },
    9: { 1: 96, 2: 92, 3: 89, 4: 86, 5: 84, 6: 81, 7: 79, 8: 76, 9: 74, 10: 71 },
    8.5: { 1: 94, 2: 91, 3: 88, 4: 85, 5: 82, 6: 80, 7: 77, 8: 75, 9: 72, 10: 69 },
    8: { 1: 92, 2: 89, 3: 86, 4: 84, 5: 81, 6: 79, 7: 76, 8: 74, 9: 71, 10: 68 },
    7.5: { 1: 91, 2: 88, 3: 85, 4: 82, 5: 80, 7: 77, 8: 75, 9: 72, 10: 69, 6: 78 },
    7: { 1: 89, 2: 86, 3: 84, 4: 81, 5: 79, 6: 76, 7: 74, 8: 71, 9: 68, 10: 65 },
};

export function OneRMCalculator({ isOpen, onClose }: OneRMCalculatorProps) {
    const [method, setMethod] = useState<'rpe' | 'velocity'>('rpe');
    const [weight, setWeight] = useState<string>('');
    const [reps, setReps] = useState<string>('');
    const [rpe, setRpe] = useState<number>(10);
    const [velocity, setVelocity] = useState<string>('');
    const [exercise, setExercise] = useState<string>('Press de Banca');
    const [estimated1RM, setEstimated1RM] = useState<number>(0);

    const calculate1RM = () => {
        const w = parseFloat(weight);
        const r = parseInt(reps);

        if (isNaN(w) || isNaN(r) || w <= 0 || r <= 0) {
            setEstimated1RM(0);
            return;
        }

        if (method === 'rpe') {
            const rpeKey = Math.round(rpe * 2) / 2;
            const percentage = RPE_CHART[rpeKey]?.[r] || (100 - (10 - rpe) * 3 - (r - 1) * 3);
            const e1rm = (w * 100) / percentage;
            setEstimated1RM(Math.round(e1rm * 10) / 10);
        } else {
            const v = parseFloat(velocity);
            if (isNaN(v) || v <= 0) return;
            const e1rm = w / (1.21 - 0.91 * v);
            setEstimated1RM(Math.round(e1rm * 10) / 10);
        }
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

    return createPortal(
        <div
            className="fixed inset-x-0 bottom-0 top-0 md:top-0 z-[20000] flex md:items-center md:justify-center bg-black/95 backdrop-blur-xl"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-[#1c1c1c] border-x-0 md:border-2 border-t-0 md:border-t border-white/10 w-full h-full md:h-[90vh] md:w-[95vw] md:max-w-[1800px] md:rounded-[2rem] shadow-[0_0_100px_rgba(255,0,0,0.15)] overflow-hidden flex flex-col scale-in-center mt-0">

                {/* Premium Header */}
                <div className="p-4 md:px-6 md:py-3 border-b border-white/5 flex justify-between items-center bg-[#252525] shrink-0 h-16 md:h-20">
                    <div className="flex items-center gap-4 md:gap-5">
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-anvil-red rounded-[1rem] md:rounded-[1.4rem] flex items-center justify-center text-white shadow-2xl shadow-anvil-red/40 -rotate-3 border-2 border-white/10">
                            <Calculator className="w-6 h-6 md:w-8 md:h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter text-white italic">Calculadora</h2>
                            <p className="text-[10px] md:text-[12px] font-black text-anvil-red uppercase tracking-[0.3em]">Anvil Lab Tools</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="w-12 h-12 md:w-14 md:h-14 bg-white/5 hover:bg-anvil-red hover:text-white rounded-2xl flex items-center justify-center text-gray-400 transition-all"
                        >
                            <X className="w-6 h-6 md:w-7 md:h-7" />
                        </button>
                    </div>
                </div>

                {/* Body - Scrollable */}
                <div className="flex-1 p-4 md:p-8 flex flex-col justify-center overflow-hidden">
                    <div className="flex flex-col md:grid md:grid-cols-12 md:gap-8 h-full">

                        {/* LEFT COLUMN: Controls */}
                        <div className="col-span-12 md:col-span-5 space-y-8 md:space-y-10 order-2 md:order-1 flex flex-col justify-center">

                            {/* Method Toggle */}
                            <div className="grid grid-cols-2 p-2 bg-black/60 rounded-[2rem] border border-white/5 shrink-0 w-full">
                                <button
                                    onClick={() => setMethod('rpe')}
                                    className={`flex items-center justify-center gap-3 py-4 md:py-5 rounded-[1.6rem] text-xs md:text-sm font-black uppercase tracking-widest transition-all ${method === 'rpe' ? 'bg-white text-black shadow-2xl scale-[1.02]' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Activity className="w-5 h-5 md:w-5 md:h-5" /> Por RPE
                                </button>
                                <button
                                    onClick={() => setMethod('velocity')}
                                    className={`flex items-center justify-center gap-3 py-4 md:py-5 rounded-[1.6rem] text-xs md:text-sm font-black uppercase tracking-widest transition-all ${method === 'velocity' ? 'bg-white text-black shadow-2xl scale-[1.02]' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Zap className="w-5 h-5 md:w-5 md:h-5" /> Por Velocidad
                                </button>
                            </div>

                            {/* Inputs Grid */}
                            <div className="space-y-6">
                                <div className="grid grid-cols-12 gap-3 md:gap-4">
                                    {/* Peso */}
                                    <div className="col-span-12 md:col-span-6 bg-black/40 border-2 border-white/5 rounded-2xl p-3 md:p-4 transition-all group flex flex-col justify-between min-h-[80px] md:min-h-[100px] text-center">
                                        <label className="block text-[10px] md:text-xs font-black text-gray-600 mb-2 uppercase tracking-widest group-hover:text-anvil-red transition-colors">Peso </label>
                                        <div className="flex items-center justify-center gap-2">
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                step="0.1"
                                                value={weight}
                                                onChange={(e) => setWeight(e.target.value)}
                                                placeholder="0"
                                                className="w-full bg-transparent text-4xl md:text-5xl font-black text-white focus:outline-none placeholder:text-gray-800 italic text-center"
                                            />
                                            <span className="text-xl md:text-2xl font-black text-gray-800 uppercase italic">kg</span>
                                        </div>
                                    </div>

                                    {/* Reps */}
                                    <div className="col-span-6 md:col-span-3 bg-black/40 border-2 border-white/5 rounded-2xl p-3 md:p-4 transition-all group flex flex-col justify-between min-h-[80px] md:min-h-[100px] text-center">
                                        <label className="block text-[10px] md:text-xs font-black text-gray-600 mb-2 uppercase tracking-widest group-hover:text-anvil-red transition-colors">Reps</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={reps}
                                            onChange={(e) => setReps(e.target.value)}
                                            placeholder="0"
                                            className="w-full bg-transparent text-4xl md:text-5xl font-black text-white focus:outline-none text-center placeholder:text-gray-800 italic"
                                        />
                                    </div>

                                    {/* RPE or Velocity Input */}
                                    {method === 'rpe' ? (
                                        <CustomSelect
                                            className="col-span-6 md:col-span-3 min-h-[80px] md:min-h-[100px]"
                                            label="RPE"
                                            value={rpe}
                                            onChange={setRpe}
                                            options={[10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5].map(v => ({ label: `@${v}`, value: v }))}
                                        />
                                    ) : (
                                        <div className="col-span-6 md:col-span-3 bg-black/40 border-2 border-white/5 rounded-2xl p-3 md:p-4 transition-all group flex flex-col justify-between min-h-[80px] md:min-h-[100px] relative">
                                            <label className="block text-[10px] md:text-xs font-black text-gray-600 mb-2 uppercase tracking-widest group-hover:text-anvil-red transition-colors">V (m/s)</label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                step="0.01"
                                                value={velocity}
                                                onChange={(e) => setVelocity(e.target.value)}
                                                placeholder="0.3"
                                                className="w-full bg-transparent text-3xl md:text-4xl font-black text-white focus:outline-none placeholder:text-gray-800 italic text-center"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Ejercicio Custom Select */}
                                <CustomSelect
                                    label="Ejercicio / Movimiento"
                                    value={exercise}
                                    onChange={setExercise}
                                    options={[
                                        { label: 'Sentadilla', value: 'Sentadilla' },
                                        { label: 'Press de Banca', value: 'Press de Banca' },
                                        { label: 'Peso Muerto', value: 'Peso Muerto' }
                                    ]}
                                />
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Result Display (7 columns) */}
                        <div className="col-span-12 md:col-span-7 relative group shrink-0 order-1 md:order-2 flex flex-col items-center justify-center p-8 md:p-0 min-h-[300px] md:min-h-auto border-b md:border-b-0 md:border-l border-white/5 bg-gradient-to-b from-anvil-red/5 to-transparent md:bg-none rounded-[3rem] md:rounded-none mb-8 md:mb-0">
                            <div className="absolute inset-0 bg-anvil-red/10 blur-[100px] rounded-full opacity-50 md:opacity-30"></div>
                            <div className="relative flex flex-col items-center justify-center text-center">
                                <p className="text-gray-500 text-sm md:text-xl font-black uppercase tracking-[0.4em] mb-4 md:mb-8">Tu 1RM Estimado</p>
                                <div className="flex items-baseline gap-2 md:gap-4">
                                    <span className="text-8xl md:text-[10rem] lg:text-[14rem] font-black text-white italic tracking-tighter leading-none drop-shadow-2xl">
                                        {Math.floor(estimated1RM)}
                                    </span>
                                    <span className="text-3xl md:text-5xl lg:text-7xl font-black text-anvil-red uppercase italic">kg</span>
                                </div>
                                <div className="mt-8 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block">
                                    <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">Basado en fórmula Epley/RPE Chart</p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer CTA */}
                <div className="p-4 md:px-6 md:py-4 bg-[#252525] border-t border-white/5 shrink-0">
                    <button
                        onClick={calculate1RM}
                        className="group w-full max-w-4xl mx-auto bg-white text-black hover:bg-anvil-red hover:text-white py-6 md:py-6 rounded-[2rem] font-black text-lg md:text-2xl uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-all active:scale-[0.98] shadow-2xl shadow-white/5 hover:shadow-anvil-red/20"
                    >
                        <TrendingUp className="w-6 h-6 md:w-8 md:h-8 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        Calcular 1RM
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
