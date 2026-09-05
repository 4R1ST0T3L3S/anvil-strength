import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Fish, RotateCcw, Plus, Minus, Trophy, Save, Loader2 } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { useUser } from '../../../hooks/useUser';
import { supabase } from '../../../lib/supabase';
import { lockBodyScroll } from '../../../lib/scrollLock';

interface SushiCounterProps {
    isOpen: boolean;
    onClose: () => void;
}

interface SushiType {
    id: string;
    name: string;
    color: string;
    bgStyle: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
}

const SUSHI_TYPES: SushiType[] = [
    { id: 'nigiri', name: 'Nigiri', color: '#f97316', bgStyle: 'from-orange-500/20 to-orange-600/5 border-orange-500/30', kcal: 50, protein: 2, carbs: 8, fat: 1 },
    { id: 'maki', name: 'Maki / Roll', color: '#22c55e', bgStyle: 'from-green-500/20 to-green-600/5 border-green-500/30', kcal: 45, protein: 1, carbs: 9, fat: 0.5 },
    { id: 'sashimi', name: 'Sashimi', color: '#ef4444', bgStyle: 'from-red-500/20 to-red-600/5 border-red-500/30', kcal: 35, protein: 7, carbs: 0, fat: 1 },
    { id: 'frito', name: 'Tempura Frito', color: '#eab308', bgStyle: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/30', kcal: 65, protein: 2, carbs: 7, fat: 3 },
];

export function SushiCounter({ isOpen, onClose }: SushiCounterProps) {
    const { data: user, refetch } = useUser();
    const [isSaving, setIsSaving] = useState(false);
    const [celebration, setCelebration] = useState(false);

    // State to keep track of counts per type
    const [counts, setCounts] = useState<Record<string, number>>({
        nigiri: 0,
        maki: 0,
        sashimi: 0,
        frito: 0
    });

    const handleAdd = (id: string) => {
        setCounts(prev => ({ ...prev, [id]: prev[id] + 1 }));
    };

    const handleSubtract = (id: string) => {
        setCounts(prev => ({ ...prev, [id]: Math.max(0, prev[id] - 1) }));
    };

    const resetCounts = () => {
        setCounts({ nigiri: 0, maki: 0, sashimi: 0, frito: 0 });
    };

    // Calculate totals
    const totals = useMemo(() => {
        let piezas = 0;
        let kcal = 0;
        let protein = 0;
        let carbs = 0;
        let fat = 0;

        SUSHI_TYPES.forEach(type => {
            const count = counts[type.id];
            piezas += count;
            kcal += count * type.kcal;
            protein += count * type.protein;
            carbs += count * type.carbs;
            fat += count * type.fat;
        });

        return { piezas, kcal, protein, carbs, fat };
    }, [counts]);

    const handleSaveRecord = async () => {
        if (!user || totals.piezas <= (user.max_sushi_pieces || 0)) return;
        
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ max_sushi_pieces: totals.piezas })
                .eq('id', user.id);
            
            if (!error) {
                setCelebration(true);
                await refetch();
                setTimeout(() => setCelebration(false), 3000);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
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
            <div className="bg-surface-sunken border-line shadow-[0_0_100px_rgba(255,255,255,0.05)] overflow-hidden flex flex-col scale-in-center mt-0 relative border-2 border-t h-[90vh] w-[95vw] max-w-[1200px] rounded-[2rem]">

                {/* Ambient Background Gradient based on totals */}
                <div 
                    className="absolute inset-0 opacity-20 pointer-events-none transition-colors duration-slow"
                    style={{
                        background: `radial-gradient(circle at center, ${totals.piezas > 20 ? '#ef4444' : totals.piezas > 10 ? '#f97316' : '#22c55e'}, transparent 60%)`,
                        filter: 'blur(100px)'
                    }}
                />

                {/* Header */}
                <div className="relative z-10 p-4 border-b border-subtle flex justify-between items-center bg-surface-sunken/80 backdrop-blur-sm shrink-0 px-6 py-4 h-24">
                    <div className="flex items-center gap-5">
                        <div className="text-cyan-400 origin-left">
                            <Fish size={40} strokeWidth={1.5} className="w-12 h-12" />
                        </div>
                        <div>
                            <h2 className="font-black uppercase tracking-tighter text-ink italic text-4xl">Sushi Counter</h2>
                            <p className="font-black text-cyan-400 uppercase tracking-[0.3em] block text-t-xs">Anvil Lab Tools</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={resetCounts}
                            className="bg-white/5 hover:bg-white/10 flex items-center justify-center text-ink-muted hover:text-ink transition-colors shadow-inner w-14 h-14 rounded-2xl"
                            title="Resetear contador"
                        >
                            <RotateCcw size={18} />
                        </button>
                        <button
                            onClick={onClose}
                            className="bg-white/5 hover:bg-brand hover:text-ink flex items-center justify-center text-ink-muted transition-colors font-black text-xl shadow-inner w-14 h-14 rounded-2xl"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Centered Total Pieces Viewer */}
                <div className="relative z-10 bg-surface-sunken/50 border-b border-subtle w-full shrink-0 flex items-center justify-center py-10">
                    <div className="flex flex-col items-center justify-center text-center">
                        <p className="text-ink-subtle font-black uppercase tracking-[0.3em] text-sm mb-2">Piezas Consumidas</p>
                        <m.div 
                            key={totals.piezas}
                            initial={{ scale: 1.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center gap-2"
                        >
                            <span className="font-black text-ink italic tracking-tighter drop-shadow-lg text-9xl">
                                {totals.piezas}
                            </span>

                            {user && (
                                <div className="flex flex-col items-center gap-2 mt-2 h-[80px]">
                                    <div className="flex items-center text-warning bg-warning-quiet rounded-full border border-warning/20 gap-2 px-4 py-1.5">
                                        <Trophy size={12} className="w-3.5 h-3.5" />
                                        <span className="font-black uppercase tracking-widest text-t-xs">Récord: {user.max_sushi_pieces || 0}</span>
                                    </div>
                                    
                                    <AnimatePresence>
                                        {totals.piezas > (user.max_sushi_pieces || 0) && (
                                            <m.button
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                onClick={handleSaveRecord}
                                                disabled={isSaving}
                                                className={`flex items-center rounded-xl font-black uppercase tracking-widest transition-[background-color,box-shadow,color,transform] gap-2 px-6 py-2 text-xs ${
 celebration 
 ? 'bg-green-500 text-black shadow-[0_0_30px_rgba(34,197,94,0.6)] scale-110' 
 : 'bg-white text-black hover:bg-gray-200 shadow-xl'
 }`}
                                            >
                                                {isSaving ? <Loader2 size={14} className="animate-spin" /> : celebration ? <Trophy size={14} /> : <Save size={14} />}
                                                {celebration ? '¡Nuevo Récord!' : 'Guardar'}
                                            </m.button>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </m.div>
                    </div>
                </div>

                {/* Content Body: Buttons for types */}
                <div className="relative z-10 flex-1 overflow-y-auto flex flex-col items-center p-8 justify-center">
                    <div className="grid w-full max-w-4xl grid-cols-2 gap-6">
                        {SUSHI_TYPES.map(type => (
                            <div key={type.id} className={`bg-gradient-to-br ${type.bgStyle} border-2 flex items-center justify-between shadow-inner backdrop-blur-md rounded-[2rem] p-6`}>
                                <div className="flex-1 pr-2">
                                    <h3 className="font-black uppercase italic text-ink mb-1 text-2xl">{type.name}</h3>
                                    <p className="font-bold text-ink-muted uppercase tracking-widest text-t-xs">
                                        ~{type.kcal} kcal • {type.protein}g P / {type.carbs}g C / {type.fat}g G
                                    </p>
                                </div>
                                <div className="flex items-center bg-black/40 border border-subtle gap-4 p-3 rounded-2xl">
                                    <button
                                        onClick={() => handleSubtract(type.id)}
                                        className="bg-white/5 hover:bg-white/10 text-ink flex items-center justify-center active:scale-95 transition-[background-color,transform] w-12 h-12 rounded-xl"
                                    >
                                        <Minus size={16} className="w-5 h-5" />
                                    </button>
                                    <div className="text-center w-16">
                                        <AnimatePresence mode="popLayout">
                                            <m.span 
                                                key={counts[type.id]}
                                                initial={{ y: -20, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                className="font-black text-ink italic block text-4xl"
                                                style={{ color: type.color }}
                                            >
                                                {counts[type.id]}
                                            </m.span>
                                        </AnimatePresence>
                                    </div>
                                    <button
                                        onClick={() => handleAdd(type.id)}
                                        className="text-black flex items-center justify-center active:scale-95 transition-transform shadow-lg w-12 h-12 rounded-xl"
                                        style={{ backgroundColor: type.color }}
                                    >
                                        <Plus size={16} className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Macros Panel */}
        <div className="relative z-10 bg-surface-sunken/90 backdrop-blur-md border-t border-subtle shrink-0 p-6">
                    <div className="max-w-4xl mx-auto">
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-white/5 border border-line text-center flex flex-col justify-center shadow-inner rounded-xl p-4">
                                <span className="font-black text-ink-subtle uppercase text-t-2xs tracking-widest mb-1">Cals</span>
                                <span className="font-black text-ink italic text-3xl">{totals.kcal}</span>
                            </div>
                            <div className="bg-info-quiet border border-info/20 text-center flex flex-col justify-center shadow-inner rounded-xl p-4">
                                <span className="font-black text-info uppercase text-t-2xs tracking-widest mb-1">Protes</span>
                                <span className="font-black text-ink italic text-3xl">{totals.protein.toFixed(1)}<span className="text-base">g</span></span>
                            </div>
                            <div className="bg-success-quiet border border-success/20 text-center flex flex-col justify-center shadow-inner rounded-xl p-4">
                                <span className="font-black text-success uppercase text-t-2xs tracking-widest mb-1">Carbos</span>
                                <span className="font-black text-ink italic text-3xl">{totals.carbs.toFixed(1)}<span className="text-base">g</span></span>
                            </div>
                            <div className="bg-warning-quiet border border-warning/20 text-center flex flex-col justify-center shadow-inner rounded-xl p-4">
                                <span className="font-black text-warning uppercase text-t-2xs tracking-widest mb-1">Grasas</span>
                                <span className="font-black text-ink italic text-3xl">{totals.fat.toFixed(1)}<span className="text-base">g</span></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
