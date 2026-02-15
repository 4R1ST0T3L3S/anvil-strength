import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, Activity, Zap, Calculator, TrendingUp, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { calcular1RMporVelocidad, Movimiento } from '../../../utils/vbtCalculator';

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
    value: string | number;
    onChange: (val: string | number) => void;
    options: { label: string; value: string | number }[];
    label: string;
    className?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`bg-black/40 border-2 border-white/5 rounded-2xl p-4 transition-all group flex flex-col justify-between overflow-hidden hover:border-white/10 ${className}`}>
            <label className="block text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest group-hover:text-anvil-red transition-colors truncate text-center w-full">
                {label}
            </label>
            <button
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center justify-center focus:outline-none text-center relative"
            >
                <span className="text-4xl font-black text-white italic truncate px-4">
                    {options.find(opt => opt.value === value)?.label || value}
                </span>
                <ChevronDown
                    className="text-gray-600 group-hover:text-white transition-colors shrink-0 w-4 h-4 absolute right-0"
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center p-0 md:p-4">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        />

                        {/* Options List */}
                        <motion.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            className="relative w-full md:max-w-xs bg-[#121212] border-t md:border border-white/10 rounded-t-[2rem] md:rounded-[2rem] shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
                        >
                            <div className="p-5 border-b border-white/5 bg-[#181818] flex items-center justify-between shrink-0">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">{label}</h3>
                                <button onClick={() => setIsOpen(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="p-2 overflow-y-auto custom-scrollbar">
                                {options.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            onChange(option.value);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-5 py-4 rounded-xl text-left transition-all mb-1 last:mb-0 ${value === option.value
                                            ? 'bg-white text-black'
                                            : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                            }`}
                                    >
                                        <span className={`text-lg uppercase tracking-wider ${value === option.value ? 'font-black italic' : 'font-bold'}`}>
                                            {option.label}
                                        </span>
                                        {value === option.value && <Check size={18} />}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Wheel Selector for "Smooth" RPE Selection
function WheelSelector({
    value,
    onChange,
    options,
    label,
    className = ""
}: {
    value: string | number;
    onChange: (val: string | number) => void;
    options: { label: string; value: string | number }[];
    label: string;
    className?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Scroll to initial value when opening
    useEffect(() => {
        if (isOpen && listRef.current) {
            const index = options.findIndex(opt => opt.value === value);
            if (index !== -1 && itemRefs.current[index]) {
                setTimeout(() => {
                    itemRefs.current[index]?.scrollIntoView({ block: 'center', behavior: 'instant' });
                }, 10);
            }
        }
    }, [isOpen, value, options]);

    return (
        <div className={`bg-black/40 border-2 border-white/5 rounded-2xl p-4 transition-all group flex flex-col justify-between overflow-hidden hover:border-white/10 ${className}`}>
            <label className="block text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest group-hover:text-anvil-red transition-colors truncate text-center w-full">
                {label}
            </label>
            <button
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center justify-center focus:outline-none text-center relative"
            >
                <span className="text-4xl font-black text-white italic truncate px-4">
                    {options.find(opt => opt.value === value)?.label || value}
                </span>
                <ChevronDown
                    className="text-gray-600 group-hover:text-white transition-colors shrink-0 w-4 h-4 absolute right-0"
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-xs h-[60vh] flex flex-col items-center justify-center pointer-events-none"
                        >
                            <h3 className="absolute top-10 text-xs font-black text-white uppercase tracking-[0.2em]">{label}</h3>

                            {/* Selection Highlight / Center Line */}
                            <div className="absolute top-1/2 left-0 right-0 h-16 -mt-8 bg-white/5 border-y border-white/10 pointer-events-none z-0"></div>

                            {/* Scrollable Wheel */}
                            <div
                                ref={listRef}
                                className="w-full h-full overflow-y-auto snap-y snap-mandatory py-[calc(30vh-2rem)] pointer-events-auto no-scrollbar [&::-webkit-scrollbar]:hidden"
                                style={{
                                    scrollbarWidth: 'none',  /* Firefox */
                                    msOverflowStyle: 'none',  /* IE and Edge */
                                }}
                                onScroll={(e) => {
                                    const target = e.target as HTMLDivElement;
                                    const center = target.scrollTop + target.clientHeight / 2;

                                    itemRefs.current.forEach((item, index) => {
                                        if (!item) return;
                                        const itemCenter = item.offsetTop + item.offsetHeight / 2;
                                        const distance = Math.abs(center - itemCenter);

                                        // Update scale/opacity based on distance
                                        const scale = Math.max(0.5, 1 - distance / 200);
                                        const opacity = Math.max(0.2, 1 - distance / 150);

                                        item.style.transform = `scale(${scale})`;
                                        item.style.opacity = `${opacity}`;

                                        // Make center item white, others gray
                                        item.style.color = distance < 30 ? 'white' : 'gray';

                                        if (distance < 25) { // Threshold for "selected"
                                            if (value !== options[index].value) {
                                                onChange(options[index].value);
                                            }
                                        }
                                    });
                                }}
                            >
                                {options.map((option, index) => (
                                    <button
                                        key={option.value}
                                        ref={(el) => { if (el) itemRefs.current[index] = el; }}
                                        onClick={() => {
                                            itemRefs.current[index]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                                        }}
                                        className="snap-center w-full h-16 flex items-center justify-center text-4xl font-black italic transition-all duration-100"
                                        style={{ opacity: 0.3, transform: 'scale(0.8)', color: 'gray' }}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setIsOpen(false)}
                                className="absolute bottom-10 px-8 py-3 bg-white text-black font-black uppercase text-xs tracking-widest rounded-full hover:bg-gray-200 pointer-events-auto shadow-xl"
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
    const [currentPct, setCurrentPct] = useState<number | null>(null);

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
            setCurrentPct(percentage);
        } else {
            const v = parseFloat(velocity);
            if (isNaN(v) || v <= 0) return;

            // Map UI exercise name to internal type
            let mov: Movimiento = 'pressBanca';
            if (exercise === 'Sentadilla') mov = 'sentadilla';
            else if (exercise === 'Peso Muerto') mov = 'pesoMuerto';

            // Calculate VBT 1RM using the robust instruction (Mode 1: General for now)
            const result = calcular1RMporVelocidad(mov, w, r, v, null); // Profile is null for now
            let e1rm = result.e1RM || 0;
            let percentage = result.pct1RM;

            // Hybrid Logic if reps > 1: Check against Epley
            if (r > 1) {
                const epley1RM = w * (1 + 0.0333 * r);
                // If Epley predicts a higher 1RM than Velocity, it likely means the user did a failure set
                // where velocity was low (final rep) but load/reps indicate higher strength.
                if (epley1RM > e1rm) {
                    e1rm = epley1RM;
                    percentage = null; // Percentage from VBT is invalid if we used Epley
                }
            }

            setEstimated1RM(Math.round(e1rm * 10) / 10);
            setCurrentPct(percentage);
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
                <div className="flex-1 p-4 md:p-8 flex flex-col justify-center overflow-y-auto md:overflow-hidden">
                    <div className="flex flex-col md:grid md:grid-cols-12 md:gap-8 h-full">

                        {/* LEFT COLUMN: Controls */}
                        <div className="col-span-12 md:col-span-6 space-y-6 md:space-y-8 order-2 md:order-1 flex flex-col justify-center">

                            {/* Method Toggle */}
                            <div className="grid grid-cols-2 p-1.5 bg-black/60 rounded-[1.5rem] border border-white/5 shrink-0 w-full">
                                <button
                                    onClick={() => setMethod('rpe')}
                                    className={`flex items-center justify-center gap-2 h-10 md:h-14 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-all ${method === 'rpe' ? 'bg-white text-black shadow-lg scale-[1.02]' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Activity className="w-4 h-4" /> Por RPE
                                </button>
                                <button
                                    onClick={() => setMethod('velocity')}
                                    className={`flex items-center justify-center gap-2 h-10 md:h-14 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-all ${method === 'velocity' ? 'bg-white text-black shadow-lg scale-[1.02]' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <Zap className="w-4 h-4" /> Velocidad
                                </button>
                            </div>

                            {/* Inputs Grid */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-12 gap-3 md:gap-4">
                                    {/* Peso */}
                                    <div className="col-span-12 md:col-span-6 bg-black/40 border-2 border-white/5 rounded-2xl p-4 transition-all group flex flex-col justify-between text-center hover:border-white/10">
                                        <label className="block text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest group-hover:text-anvil-red transition-colors">Peso (kg)</label>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            step="0.1"
                                            value={weight}
                                            onChange={(e) => setWeight(e.target.value)}
                                            placeholder="0"
                                            className="w-full bg-transparent text-4xl font-black text-white focus:outline-none placeholder:text-gray-800 italic text-center"
                                        />
                                    </div>

                                    {/* Reps */}
                                    <div className="col-span-6 md:col-span-3 bg-black/40 border-2 border-white/5 rounded-2xl p-4 transition-all group flex flex-col justify-between text-center hover:border-white/10">
                                        <label className="block text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest group-hover:text-anvil-red transition-colors">Reps</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={reps}
                                            onChange={(e) => setReps(e.target.value)}
                                            placeholder="0"
                                            className="w-full bg-transparent text-4xl font-black text-white focus:outline-none text-center placeholder:text-gray-800 italic"
                                        />
                                    </div>

                                    {/* RPE or Velocity Input */}
                                    {method === 'rpe' ? (
                                        <WheelSelector
                                            className="col-span-6 md:col-span-3"
                                            label="@ RPE"
                                            value={rpe}
                                            onChange={(val) => setRpe(Number(val))}
                                            options={[10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5].map(v => ({ label: `${v}`, value: v }))}
                                        />
                                    ) : (
                                        <div className="col-span-6 md:col-span-3 bg-black/40 border-2 border-white/5 rounded-2xl p-4 transition-all group flex flex-col justify-between text-center hover:border-white/10">
                                            <label className="block text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest group-hover:text-anvil-red transition-colors">Velocidad (m/s)</label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                step="0.01"
                                                value={velocity}
                                                onChange={(e) => setVelocity(e.target.value)}
                                                placeholder="0.0"
                                                className="w-full bg-transparent text-3xl font-black text-white focus:outline-none placeholder:text-gray-800 italic text-center"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Ejercicio Custom Select */}
                                <CustomSelect
                                    label="Movimiento"
                                    value={exercise}
                                    onChange={(val) => setExercise(String(val))}
                                    options={[
                                        { label: 'Sentadilla', value: 'Sentadilla' },
                                        { label: 'Press de Banca', value: 'Press de Banca' },
                                        { label: 'Peso Muerto', value: 'Peso Muerto' }
                                    ]}
                                />
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Result Display (Reduced Size) */}
                        <div className="col-span-12 md:col-span-6 relative group shrink-0 order-1 md:order-2 flex flex-col items-center justify-center p-6 md:p-8 min-h-[250px] md:min-h-auto bg-[#181818] border-2 border-white/5 rounded-[2rem] shadow-inner mb-8 md:mb-0">
                            <div className="absolute inset-0 bg-gradient-to-br from-anvil-red/5 to-transparent rounded-[2rem]"></div>
                            <div className="relative flex flex-col items-center justify-center text-center z-10">
                                <p className="text-gray-500 text-xs md:text-sm font-black uppercase tracking-[0.3em] mb-2 md:mb-4">1RM Estimado</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-7xl md:text-8xl lg:text-9xl font-black text-white italic tracking-tighter leading-none drop-shadow-lg">
                                        {Math.floor(estimated1RM)}
                                    </span>
                                    <span className="text-2xl md:text-3xl font-black text-anvil-red uppercase italic">kg</span>
                                </div>
                                <div className="mt-4 md:mt-6 opacity-60">
                                    <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest">
                                        {exercise} • {method === 'rpe' ? 'Epley Base' : 'VBT Mixto'}
                                    </p>
                                    {currentPct && (
                                        <p className="text-anvil-red text-[10px] font-bold uppercase tracking-widest mt-1">
                                            Intensidad: ~{currentPct}%
                                        </p>
                                    )}
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
