import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, Activity, Zap, Calculator, TrendingUp, Check, Trophy, Save, Loader2 } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { useUser } from '../../../hooks/useUser';
import { supabase } from '../../../lib/supabase';
import { calcular1RMporVelocidad, Movimiento } from '../../../utils/vbtCalculator';
import { lockBodyScroll } from '../../../lib/scrollLock';
import { useAthletePrefs } from '../../../hooks/useAthletePrefs';
import { toDisplay, fromInput, formatLoad } from '../../../lib/units';
import { estimate1RM } from '../../../lib/training/oneRm';

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
        <div className={`bg-black/40 border-2 border-subtle rounded-2xl p-4 transition-colors group flex flex-col justify-between overflow-hidden hover:border-line ${className}`}>
            <label className="block text-t-2xs font-black text-ink-subtle mb-1 uppercase tracking-widest group-hover:text-brand-text transition-colors truncate text-center w-full">
                {label}
            </label>
            <button
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center justify-center text-center relative"
            >
                <span className="text-4xl font-black text-ink italic truncate px-4">
                    {options.find(opt => opt.value === value)?.label || value}
                </span>
                <ChevronDown
                    className="text-gray-600 group-hover:text-ink transition-colors shrink-0 w-4 h-4 absolute right-0"
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[10000] flex justify-center items-center p-4">
                        {/* Backdrop */}
                        <m.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        />

                        {/* Options List */}
                        <m.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            className="relative w-full bg-[#121212] border-line shadow-2xl overflow-hidden max-h-[80vh] flex flex-col max-w-xs border rounded-[2rem]"
                        >
                            <div className="p-5 border-b border-subtle bg-[#181818] flex items-center justify-between shrink-0">
                                <h3 className="text-xs font-black text-ink-muted uppercase tracking-[0.2em]">{label}</h3>
                                <button onClick={() => setIsOpen(false)} className="p-2 bg-white/5 rounded-full text-ink-muted hover:text-ink">
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
                                        className={`w-full flex items-center justify-between px-5 py-4 rounded-xl text-left transition-colors mb-1 last:mb-0 ${value === option.value
 ? 'bg-white text-black'
 : 'text-ink-muted hover:bg-white/5 hover:text-ink'
 }`}
                                    >
                                        <span className={`text-lg uppercase tracking-wider ${value === option.value ? 'font-black italic' : 'font-bold'}`}>
                                            {option.label}
                                        </span>
                                        {value === option.value && <Check size={18} />}
                                    </button>
                                ))}
                            </div>
                        </m.div>
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
        <div className={`bg-black/40 border-2 border-subtle rounded-2xl p-4 transition-colors group flex flex-col justify-between overflow-hidden hover:border-line ${className}`}>
            <label className="block text-t-2xs font-black text-ink-subtle mb-1 uppercase tracking-widest group-hover:text-brand-text transition-colors truncate text-center w-full">
                {label}
            </label>
            <button
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center justify-center text-center relative"
            >
                <span className="text-4xl font-black text-ink italic truncate px-4">
                    {options.find(opt => opt.value === value)?.label || value}
                </span>
                <ChevronDown
                    className="text-gray-600 group-hover:text-ink transition-colors shrink-0 w-4 h-4 absolute right-0"
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md">
                        <m.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-xs h-[60vh] flex flex-col items-center justify-center pointer-events-none"
                        >
                            <h3 className="absolute top-10 text-xs font-black text-ink uppercase tracking-[0.2em]">{label}</h3>

                            {/* Selection Highlight / Center Line */}
                            <div className="absolute top-1/2 left-0 right-0 h-16 -mt-8 bg-white/5 border-y border-line pointer-events-none z-0"></div>

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
                                        className="snap-center w-full h-16 flex items-center justify-center text-4xl font-black italic transition-colors duration-instant"
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
                        </m.div>
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

    const { data: user, refetch } = useUser();
    const { prefs: athletePrefs } = useAthletePrefs(user?.id);
    const unit = athletePrefs.unit;
    const [isSaving, setIsSaving] = useState(false);
    const [celebration, setCelebration] = useState(false);

    const calculate1RM = () => {
        // Lo que se teclea está en la unidad del atleta; TODO el cálculo de
        // aquí en adelante trabaja en kg — la fórmula de velocidad hace
        // física real (fuerza = masa × aceleración) y mezclar unidades ahí
        // daría una fuerza equivocada, no solo una etiqueta equivocada.
        const w = fromInput(parseFloat(weight), unit) ?? NaN;
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

            // MEZCLA CON EPLEY POR ENCIMA DE UNA REPETICIÓN.
            //
            // Si la fórmula por repeticiones predice MÁS que la de
            // velocidad, casi siempre es una serie llevada al fallo: la
            // última repetición sale lentísima y hunde la estimación por
            // velocidad, mientras que carga y repeticiones siguen diciendo
            // la verdad. En ese caso manda Epley.
            //
            // `estimate1RM` es la copia única de src/lib/training/oneRm.ts.
            // Aquí había una en línea con 0,0333 —que NO es 1/30— y sin
            // techo de repeticiones, así que esta pantalla daba un número
            // distinto al del resto de la aplicación para la misma serie.
            const epley1RM = r > 1 ? estimate1RM(w, r) : null;
            if (epley1RM !== null && epley1RM > e1rm) {
                e1rm = epley1RM;
                percentage = null; // el %1RM de la recta ya no aplica
            }

            setEstimated1RM(Math.round(e1rm * 10) / 10);
            setCurrentPct(percentage);
        }
    };

    const handleSavePR = async () => {
        if (!user || estimated1RM <= 0) return;
        setIsSaving(true);
        try {
            let column = '';
            if (exercise === 'Sentadilla') column = 'squat_pr';
            else if (exercise === 'Press de Banca') column = 'bench_pr';
            else if (exercise === 'Peso Muerto') column = 'deadlift_pr';
            
            if (column) {
                const { error } = await supabase
                    .from('profiles')
                    .update({ [column]: estimated1RM })
                    .eq('id', user.id);
                
                if (!error) {
                    setCelebration(true);
                    await refetch();
                    setTimeout(() => setCelebration(false), 3000);
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const getCurrentPR = () => {
        if (!user) return 0;
        if (exercise === 'Sentadilla') return user.squat_pr || 0;
        if (exercise === 'Press de Banca') return user.bench_pr || 0;
        if (exercise === 'Peso Muerto') return user.deadlift_pr || 0;
        return 0;
    };

    const currentPR = getCurrentPR();

    // Cerradura de scroll compartida y con contador: ver src/lib/scrollLock.ts.
    useEffect(() => {
        if (!isOpen) return;
        return lockBodyScroll();
    }, [isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-x-0 bottom-0 z-[20000] flex bg-black/95 backdrop-blur-xl top-0 items-center justify-center"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-surface-sunken border-line shadow-[0_0_100px_rgba(255,0,0,0.15)] overflow-hidden flex flex-col scale-in-center mt-0 border-2 border-t h-[90vh] w-[95vw] max-w-[1800px] rounded-[2rem]">

                {/* Premium Header */}
                <div className="p-4 border-b border-subtle flex justify-between items-center bg-surface-sunken shrink-0 px-6 py-3 h-20">
                    <div className="flex items-center gap-5">
                        <div className="text-brand-text origin-left">
                            <Calculator size={40} strokeWidth={1.5} className="w-12 h-12" />
                        </div>
                        <div>
                            <h2 className="font-black uppercase tracking-tighter text-ink italic text-4xl">Calculadora</h2>
                            <p className="font-black text-brand-text uppercase tracking-[0.3em] text-t-xs">Anvil Lab Tools</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="bg-white/5 hover:bg-brand hover:text-ink rounded-2xl flex items-center justify-center text-ink-muted transition-colors w-14 h-14"
                        >
                            <X className="w-7 h-7" />
                        </button>
                    </div>
                </div>

                {/* Body - Scrollable */}
                <div className="flex-1 flex flex-col justify-center p-8 overflow-hidden">
                    <div className="flex-col h-full grid grid-cols-12 gap-8">

                        {/* LEFT COLUMN: Controls */}
                        <div className="flex flex-col justify-center col-span-6 space-y-8 order-1">

                            {/* Method Toggle */}
                            <div className="grid grid-cols-2 p-1.5 bg-black/60 rounded-[1.5rem] border border-subtle shrink-0 w-full">
                                <button
                                    onClick={() => setMethod('rpe')}
                                    className={`flex items-center justify-center gap-2 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-[background-color,box-shadow,color,transform] h-14 ${method === 'rpe' ? 'bg-white text-black shadow-lg scale-[1.02]' : 'text-ink-subtle hover:text-ink'}`}
                                >
                                    <Activity className="w-4 h-4" /> Por RPE
                                </button>
                                <button
                                    onClick={() => setMethod('velocity')}
                                    className={`flex items-center justify-center gap-2 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-[background-color,box-shadow,color,transform] h-14 ${method === 'velocity' ? 'bg-white text-black shadow-lg scale-[1.02]' : 'text-ink-subtle hover:text-ink'}`}
                                >
                                    <Zap className="w-4 h-4" /> Velocidad
                                </button>
                            </div>

                            {/* Inputs Grid */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-12 gap-4">
                                    {/* Peso */}
                                    <div className="bg-black/40 border-2 border-subtle rounded-2xl p-4 transition-colors group flex flex-col justify-between text-center hover:border-line col-span-6">
                                        <label className="block text-t-2xs font-black text-ink-subtle mb-1 uppercase tracking-widest group-hover:text-brand-text transition-colors">Peso ({unit})</label>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            step="0.1"
                                            value={weight}
                                            onChange={(e) => setWeight(e.target.value)}
                                            placeholder="0"
                                            className="w-full bg-transparent text-4xl font-black text-ink placeholder:text-gray-800 italic text-center"
                                        />
                                    </div>

                                    {/* Reps */}
                                    <div className="bg-black/40 border-2 border-subtle rounded-2xl p-4 transition-colors group flex flex-col justify-between text-center hover:border-line col-span-3">
                                        <label className="block text-t-2xs font-black text-ink-subtle mb-1 uppercase tracking-widest group-hover:text-brand-text transition-colors">Reps</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={reps}
                                            onChange={(e) => setReps(e.target.value)}
                                            placeholder="0"
                                            className="w-full bg-transparent text-4xl font-black text-ink text-center placeholder:text-gray-800 italic"
                                        />
                                    </div>

                                    {/* RPE or Velocity Input */}
                                    {method === 'rpe' ? (
                                        <WheelSelector
                                            className="col-span-3"
                                            label="@ RPE"
                                            value={rpe}
                                            onChange={(val) => setRpe(Number(val))}
                                            options={[10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5].map(v => ({ label: `${v}`, value: v }))}
                                        />
                                    ) : (
                                        <div className="bg-black/40 border-2 border-subtle rounded-2xl p-4 transition-colors group flex flex-col justify-between text-center hover:border-line col-span-3">
                                            <label className="block text-t-2xs font-black text-ink-subtle mb-1 uppercase tracking-widest group-hover:text-brand-text transition-colors">Velocidad (m/s)</label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                step="0.01"
                                                value={velocity}
                                                onChange={(e) => setVelocity(e.target.value)}
                                                placeholder="0.0"
                                                className="w-full bg-transparent text-3xl font-black text-ink placeholder:text-gray-800 italic text-center"
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
                        <div className="relative group shrink-0 flex flex-col items-center justify-center bg-[#181818] border-2 border-subtle rounded-[2rem] shadow-inner col-span-6 order-2 p-8 min-h-auto mb-0">
                            <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-transparent rounded-[2rem]"></div>
                            <div className="relative flex flex-col items-center justify-center text-center z-10">
                                <p className="text-ink-subtle font-black uppercase tracking-[0.3em] text-sm mb-4">1RM Estimado</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="font-black text-ink italic tracking-tighter drop-shadow-lg text-9xl">
                                        {Math.floor(toDisplay(estimated1RM, unit) ?? 0)}
                                    </span>
                                    <span className="font-black text-brand-text uppercase italic text-3xl">{unit}</span>
                                </div>
                                <div className="opacity-60 mt-6">
                                    <p className="text-gray-600 text-t-2xs font-bold uppercase tracking-widest">
                                        {exercise} • {method === 'rpe' ? 'Epley Base' : 'VBT Mixto'}
                                    </p>
                                    {currentPct && (
                                        <p className="text-brand-text text-t-2xs font-bold uppercase tracking-widest mt-1">
                                            Intensidad: ~{currentPct}%
                                        </p>
                                    )}
                                </div>

                                {user && estimated1RM > 0 && (
                                    <div className="mt-6 flex flex-col items-center gap-3 w-full h-[60px]">
                                        <div className="flex items-center gap-2 text-warning bg-warning-quiet px-4 py-1.5 rounded-full border border-warning/20">
                                            <Trophy size={14} />
                                            <span className="font-black uppercase tracking-widest text-xs">PR Actual: {formatLoad(currentPR, unit)}</span>
                                        </div>
                                        
                                        <AnimatePresence>
                                            {estimated1RM > currentPR && (
                                                <m.button
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                    onClick={handleSavePR}
                                                    disabled={isSaving}
                                                    className={`absolute bottom-0 translate-y-16 flex items-center gap-2 px-6 py-2 rounded-xl font-black uppercase text-xs tracking-widest transition-[background-color,box-shadow,color,transform] ${
 celebration 
 ? 'bg-green-500 text-black shadow-[0_0_30px_rgba(34,197,94,0.6)] scale-110' 
 : 'bg-white text-black hover:bg-gray-200 shadow-xl'
 }`}
                                                >
                                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : celebration ? <Trophy size={16} /> : <Save size={16} />}
                                                    {celebration ? '¡PR Guardado!' : 'Guardar Nuevo PR'}
                                                </m.button>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer CTA */}
                <div className="p-4 bg-surface-sunken border-t border-subtle shrink-0 px-6 py-4">
                    <button
                        onClick={calculate1RM}
                        className="group w-full max-w-4xl mx-auto bg-white text-black hover:bg-brand hover:text-ink rounded-[2rem] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-[background-color,box-shadow,color,transform] active:scale-[0.98] shadow-2xl shadow-white/5 hover:shadow-brand/20 py-6 text-2xl"
                    >
                        <TrendingUp className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform w-8 h-8" />
                        Calcular 1RM
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
