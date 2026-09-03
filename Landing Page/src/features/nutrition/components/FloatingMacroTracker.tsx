import React from 'react';
import { m, AnimatePresence } from 'framer-motion';
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
                <m.div
                    drag
                    dragMomentum={false}
                    initial={{ opacity: 0, x: 20, y: 0, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="fixed bottom-6 right-6 z-[9999] pointer-events-none"
                >
                    <div className={`
 bg-black/90 backdrop-blur-2xl border-2 p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto
 w-[280px] transition-colors duration-slow cursor-move relative
 ${isExceeded ? 'border-brand shadow-red-900/20' : 'border-line shadow-black/40'}
`}>
                        {/* Drag Handle Area */}
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-surface-raised px-3 py-0.5 rounded-full text-t-2xs font-black uppercase text-ink-subtle tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                            Mover
                        </div>

                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Target size={14} className={isExceeded ? 'text-brand-text' : 'text-ink-subtle'} />
                                <span className={`text-t-2xs font-black uppercase tracking-widest ${isExceeded ? 'text-brand-text' : 'text-ink-subtle'}`}>
                                    Total Planificado
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {isExceeded && <AlertCircle size={14} className="text-brand-text animate-pulse" />}
                                <button 
                                    onClick={() => setShow(false)}
                                    className="p-1 hover:bg-white/10 rounded-lg text-ink-subtle hover:text-ink transition-colors"
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
                                    color="text-ink"
                                    isExceeded={current.kcal > targets.kcal}
                                />
                                <MacroItem 
                                    label="Proteína" 
                                    current={current.prot} 
                                    target={targets.prot} 
                                    color="text-info"
                                    isExceeded={current.prot > targets.prot}
                                />
                            </div>
                            <div className="space-y-3">
                                <MacroItem 
                                    label="Carbos" 
                                    current={current.carbs} 
                                    target={targets.carbs} 
                                    color="text-warning"
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
                </m.div>
            )}
        </AnimatePresence>
    );
}

function MacroItem({ label, current, target, color, isExceeded }: any) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-baseline">
                <span className="text-t-2xs font-bold text-ink-subtle uppercase">{label}</span>
                <span className={`text-xs font-black ${isExceeded ? 'text-brand-text' : color}`}>
                    {Math.round(current)}g
                </span>
            </div>
            <div className="flex justify-between items-center text-t-2xs">
                <span className="text-zinc-600">Obj: {target}</span>
                <span className={isExceeded ? 'text-brand-text font-bold' : 'text-ink-subtle'}>
                    {Math.round(current - target) > 0 ? `+${Math.round(current - target)}` : ''}
                </span>
            </div>
            <div className="w-full h-1 bg-surface-raised rounded-full overflow-hidden">
                <m.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (current / (target || 1)) * 100)}%` }}
                    className={`h-full ${isExceeded ? 'bg-brand' : color.replace('text-', 'bg-')}`}
                />
            </div>
        </div>
    );
}
