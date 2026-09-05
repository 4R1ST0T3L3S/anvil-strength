import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, TrendingUp, Dumbbell, List } from 'lucide-react';
import { m } from 'framer-motion';
import { lockBodyScroll } from '../../../lib/scrollLock';
import { useUser } from '../../../hooks/useUser';
import { useAthletePrefs } from '../../../hooks/useAthletePrefs';
import { toDisplay, fromInput } from '../../../lib/units';

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
    const { data: user } = useUser();
    const { prefs: athletePrefs } = useAthletePrefs(user?.id);
    const unit = athletePrefs.unit;

    const [oneRM, setOneRM] = useState<string>('');
    const [targetWeight, setTargetWeight] = useState<string>('');
    const [warmUpSets, setWarmUpSets] = useState<WarmUpSet[]>([]);
    const resultsRef = useRef<HTMLDivElement>(null);

    const calculateWarmUp = () => {
        // Lo que se teclea está en la unidad del atleta; TODO el cálculo de
        // aquí en adelante trabaja en kg — la barra vacía (20) y los saltos
        // de 2,5 son constantes FÍSICAS del gimnasio, no de la pantalla.
        const target = fromInput(parseFloat(targetWeight), unit) ?? NaN;
        const maxRM = fromInput(parseFloat(oneRM), unit) || target;

        if (isNaN(target) || target <= 20) {
            setWarmUpSets([]);
            return;
        }

        const intensity = (target / maxRM) * 100;
        const isMutant = target > 200;
        const maxJump = isMutant ? 30 : target; 

        const getReps = (weight: number) => {
            if (weight === 20) return '10-15'; // Barra Vacía (Paso 1)
            const pct = (weight / maxRM) * 100;
            if (pct >= 80) return '1';         // A partir del 80%: todo singles o dobles
            if (pct >= 60) return '3';         // Aprox. 60-70%: bajar a 3 reps (Paso 3)
            return '5';                        // Aprox. 40-50% y resto: bajar a 5 reps (Paso 2)
        };

        const sets: WarmUpSet[] = [
            { weight: 20, reps: '10-15', percentage: Math.round((20 / maxRM) * 100), label: 'Barra Vacía' }
        ];

        const milestones = intensity < 70 
            ? [0.50, 0.70, 0.85] 
            : [0.40, 0.60, 0.75, 0.85, 0.92];

        for (let i = 0; i < milestones.length; i++) {
            const targetMilestoneWeight = target * milestones[i];
            
            while ((targetMilestoneWeight - sets[sets.length - 1].weight) > (maxJump + 2.5)) {
                const intermediateWeight = sets[sets.length - 1].weight + maxJump;
                const rounded = Math.round(intermediateWeight / 2.5) * 2.5;
                if (rounded < target && rounded > sets[sets.length - 1].weight) {
                    sets.push({
                        weight: rounded,
                        reps: getReps(rounded),
                        percentage: Math.round((rounded / maxRM) * 100),
                        label: `Aproximación ${sets.length}`
                    });
                } else {
                    break;
                }
            }

            const roundedMilestone = Math.round(targetMilestoneWeight / 2.5) * 2.5;
            if (roundedMilestone > 20 && roundedMilestone < target && roundedMilestone > sets[sets.length - 1].weight) {
                sets.push({
                    weight: roundedMilestone,
                    reps: getReps(roundedMilestone),
                    percentage: Math.round((roundedMilestone / maxRM) * 100),
                    label: `Aproximación ${sets.length}`
                });
            }
        }

        while ((target - sets[sets.length - 1].weight) > (maxJump + 2.5)) {
            const intermediateWeight = sets[sets.length - 1].weight + maxJump;
            const rounded = Math.round(intermediateWeight / 2.5) * 2.5;
            if (rounded < target && rounded > sets[sets.length - 1].weight) {
                sets.push({
                    weight: rounded,
                    reps: getReps(rounded),
                    percentage: Math.round((rounded / maxRM) * 100),
                    label: `Aproximación ${sets.length}`
                });
            } else {
                break;
            }
        }

        sets.push({
            weight: target,
            reps: 'SET DE TRABAJO',
            percentage: Math.round((target / maxRM) * 100),
            label: 'Objetivo'
        });

        let approxCount = 1;
        const finalSets = sets.filter(s => s.weight >= 20).map((s, index) => {
            if (index === 0) return { ...s, label: 'Barra Vacía' };
            if (index === sets.length - 1) return { ...s, label: 'Objetivo' };
            return { ...s, label: `Aproximación ${approxCount++}` };
        });

        setWarmUpSets(finalSets);
    };

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

                {/* Header */}
                <div className="p-4 border-b border-subtle flex justify-between items-center bg-surface-sunken shrink-0 px-6 py-3 h-20">
                    <div className="flex items-center gap-5">
                        <div className="text-info origin-left">
                            <Dumbbell size={40} strokeWidth={1.5} className="w-12 h-12" />
                        </div>
                        <div>
                            <h2 className="font-black uppercase tracking-tighter text-ink italic text-4xl">Aproximaciones</h2>
                            <p className="font-black text-info uppercase tracking-[0.3em] text-t-xs">Anvil Lab Tools</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-white/5 hover:bg-brand hover:text-ink rounded-2xl flex items-center justify-center text-ink-muted transition-colors w-14 h-14"
                    >
                        <X className="w-7 h-7" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 flex flex-col overflow-hidden p-6">
                    <div className="h-full grid grid-cols-12 gap-12">

                        {/* LEFT: Inputs & Button - Centered & Smaller */}
                        <div className="flex flex-col justify-center h-full shrink-0 col-span-6 pt-0">
                            <div className="flex-col gap-6 w-full grid grid-rows-3 h-[75%]">
                                <div className="bg-black/40 border-2 border-subtle rounded-2xl transition-colors group flex flex-col justify-center p-6 min-h-0">
                                    <label className="block font-black text-gray-600 mb-2 uppercase tracking-widest group-hover:text-info transition-colors text-xs">Tu 1RM Actual (Opcional)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            step="0.1"
                                            value={oneRM}
                                            onChange={(e) => setOneRM(e.target.value)}
                                            placeholder="0"
                                            className="w-full bg-transparent font-black text-ink placeholder:text-gray-800 italic text-5xl"
                                        />
                                        <span className="font-black text-gray-800 uppercase italic text-3xl">{unit}</span>
                                    </div>
                                </div>

                                <div className="bg-black/40 border-2 border-subtle rounded-2xl transition-colors group flex flex-col justify-center p-6 min-h-0">
                                    <label className="block font-black text-gray-600 mb-2 uppercase tracking-widest group-hover:text-info transition-colors text-xs">Peso Objetivo Hoy</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            step="0.1"
                                            value={targetWeight}
                                            onChange={(e) => setTargetWeight(e.target.value)}
                                            placeholder="0"
                                            className="w-full bg-transparent font-black text-ink placeholder:text-gray-800 italic text-5xl"
                                        />
                                        <span className="font-black text-gray-800 uppercase italic text-3xl">{unit}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={calculateWarmUp}
                                    className="group w-full bg-blue-600 text-ink hover:bg-blue-500 rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-[background-color,transform] active:scale-[0.98] shadow-2xl shadow-blue-600/20 min-h-0 text-2xl"
                                >
                                    <TrendingUp className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform w-8 h-8" />
                                    <span>Calcular Aproximación</span>
                                </button>
                            </div>
                        </div>

                        {/* RIGHT: Results Table */}
                        <div ref={resultsRef} className="h-full overflow-hidden flex flex-col col-span-6 mt-0">
                            <div className="flex items-center gap-3 text-ink-subtle mb-6 px-2 border-b border-subtle pb-4">
                                <List size={20} />
                                <span className="text-xs font-black uppercase tracking-widest">Escalera de Aproximación</span>
                            </div>

                            <div className="space-y-3 h-full overflow-y-auto no-scrollbar [&::-webkit-scrollbar]:hidden pr-2">
                                {warmUpSets.length > 0 ? (
                                    warmUpSets.map((set, i) => (
                                        <m.div
                                            key={i}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className={`flex items-center justify-between rounded-[1.5rem] border-2 transition-[background-color,border-color,box-shadow] p-6 ${set.percentage === 100
 ? 'bg-blue-600/20 border-blue-600 shadow-lg shadow-blue-600/10'
 : 'bg-black/40 border-subtle hover:border-line'
 }`}
                                        >
                                            <div className="flex items-center gap-6">
                                                <div className={`rounded-xl flex items-center justify-center font-black italic w-12 h-12 text-xl ${set.percentage === 100 ? 'bg-blue-600 text-ink' : 'bg-white/5 text-ink-subtle'
 }`}>
                                                    {i + 1}
                                                </div>
                                                <div>
                                                    <p className={`text-t-2xs font-black uppercase tracking-widest ${set.percentage === 100 ? 'text-info' : 'text-gray-600'}`}>
                                                        {set.label} {set.percentage > 0 && `(${set.percentage}%)`}
                                                    </p>
                                                    <p className="font-black text-ink italic text-3xl">
                                                        {Math.round((toDisplay(set.weight, unit) ?? 0) * 10) / 10}
                                                        <span className="text-xs ml-1 text-ink-subtle">{unit}</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-t-2xs font-black text-gray-600 uppercase tracking-widest mb-1">Reps</p>
                                                <p className={`font-black italic text-3xl ${set.percentage === 100 ? 'text-info' : 'text-ink'}`}>
                                                    {set.reps}
                                                </p>
                                            </div>
                                        </m.div>
                                    ))
                                ) : (
                                    <div className="text-center py-20 bg-black/20 rounded-[2rem] border-2 border-dashed border-subtle flex flex-col items-center justify-center gap-4">
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-gray-700">
                                            <List size={32} />
                                        </div>
                                        <p className="text-gray-600 font-bold italic max-w-xs">Introduce un peso objetivo para generar tu escalera de calentamiento</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
