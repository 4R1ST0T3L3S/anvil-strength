import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, AlertCircle, X } from 'lucide-react';

interface FloatingMacroTrackerProps {
    current: { kcal: number; prot: number; carbs: number; fats: number };
    targets: { kcal: number; prot: number; carbs: number; fats: number };
    isVisible: boolean;
}

export function FloatingMacroTracker({ current, targets, isVisible }: FloatingMacroTrackerProps) {
    const [show, setShow] = React.useState(true);

    const isExceeded = 
        current.kcal > targets.kcal || 
        current.prot > targets.prot || 
        current.carbs > targets.carbs || 
        current.fats > targets.fats;

    if (!show) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    drag
                    dragMomentum={false}
                    initial={{ opacity: 0, x: 20, y: 0, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="fixed bottom-6 right-6 z-[9999] pointer-events-none"
                >
                    <div className={`
                        bg-black/90 backdrop-blur-2xl border-2 p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto
                        w-[280px] transition-colors duration-500 cursor-move relative
                        ${isExceeded ? 'border-anvil-red shadow-red-900/20' : 'border-zinc-800 shadow-black/40'}
                    `}>
                        {/* Drag Handle Area */}
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-zinc-800 px-3 py-0.5 rounded-full text-[8px] font-black uppercase text-zinc-500 tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                            Mover
                        </div>

                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Target size={14} className={isExceeded ? 'text-anvil-red' : 'text-zinc-500'} />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isExceeded ? 'text-anvil-red' : 'text-zinc-500'}`}>
                                    Total Planificado
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {isExceeded && <AlertCircle size={14} className="text-anvil-red animate-pulse" />}
                                <button 
                                    onClick={() => setShow(false)}
                                    className="p-1 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-white transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <MacroItem 
                                    label="Calorías" 
                                    current={current.kcal} 
                                    target={targets.kcal} 
                                    color="text-white"
                                    isExceeded={current.kcal > targets.kcal}
                                />
                                <MacroItem 
                                    label="Proteína" 
                                    current={current.prot} 
                                    target={targets.prot} 
                                    color="text-blue-400"
                                    isExceeded={current.prot > targets.prot}
                                />
                            </div>
                            <div className="space-y-3">
                                <MacroItem 
                                    label="Carbos" 
                                    current={current.carbs} 
                                    target={targets.carbs} 
                                    color="text-yellow-400"
                                    isExceeded={current.carbs > targets.carbs}
                                />
                                <MacroItem 
                                    label="Grasas" 
                                    current={current.fats} 
                                    target={targets.fats} 
                                    color="text-orange-400"
                                    isExceeded={current.fats > targets.fats}
                                />
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function MacroItem({ label, current, target, color, isExceeded }: any) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-baseline">
                <span className="text-[9px] font-bold text-zinc-500 uppercase">{label}</span>
                <span className={`text-xs font-black ${isExceeded ? 'text-anvil-red' : color}`}>
                    {Math.round(current)}g
                </span>
            </div>
            <div className="flex justify-between items-center text-[9px]">
                <span className="text-zinc-600">Obj: {target}</span>
                <span className={isExceeded ? 'text-anvil-red font-bold' : 'text-zinc-500'}>
                    {Math.round(current - target) > 0 ? `+${Math.round(current - target)}` : ''}
                </span>
            </div>
            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (current / (target || 1)) * 100)}%` }}
                    className={`h-full ${isExceeded ? 'bg-anvil-red' : color.replace('text-', 'bg-')}`}
                />
            </div>
        </div>
    );
}
