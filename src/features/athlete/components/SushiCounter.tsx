import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Fish, RotateCcw, Plus, Minus, Trophy, Save, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '../../../hooks/useUser';
import { supabase } from '../../../lib/supabase';

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
            <div className="bg-[#1c1c1c] border-x-0 md:border-2 border-t-0 md:border-t border-white/10 w-full h-full md:h-[90vh] md:w-[95vw] md:max-w-[1200px] md:rounded-[2rem] shadow-[0_0_100px_rgba(255,255,255,0.05)] overflow-hidden flex flex-col scale-in-center mt-0 relative">

                {/* Ambient Background Gradient based on totals */}
                <div 
                    className="absolute inset-0 opacity-20 pointer-events-none transition-all duration-1000"
                    style={{
                        background: `radial-gradient(circle at center, ${totals.piezas > 20 ? '#ef4444' : totals.piezas > 10 ? '#f97316' : '#22c55e'}, transparent 60%)`,
                        filter: 'blur(100px)'
                    }}
                />

                {/* Header */}
                <div className="relative z-10 p-4 md:px-6 md:py-4 border-b border-white/5 flex justify-between items-center bg-[#252525]/80 backdrop-blur-sm shrink-0 h-20 md:h-24">
                    <div className="flex items-center gap-4 md:gap-5">
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-[1rem] md:rounded-[1.4rem] flex items-center justify-center text-white shadow-2xl shadow-blue-500/40 -rotate-3 border-2 border-white/10">
                            <Fish className="w-6 h-6 md:w-8 md:h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter text-white italic">Sushi Counter</h2>
                            <p className="text-[10px] md:text-[12px] font-black text-cyan-400 uppercase tracking-[0.3em]">Anvil Lab Tools</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={resetCounts}
                            className="w-12 h-12 md:w-14 md:h-14 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center text-gray-400 hover:text-white transition-all shadow-inner"
                            title="Resetear contador"
                        >
                            <RotateCcw size={20} />
                        </button>
                        <button
                            onClick={onClose}
                            className="w-12 h-12 md:w-14 md:h-14 bg-white/5 hover:bg-anvil-red hover:text-white rounded-2xl flex items-center justify-center text-gray-400 transition-all font-black text-xl shadow-inner"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Centered Total Pieces Viewer */}
                <div className="relative z-10 bg-[#252525]/50 border-b border-white/5 w-full shrink-0 flex items-center justify-center py-6 md:py-10">
                    <div className="flex flex-col items-center justify-center text-center">
                        <p className="text-gray-500 text-xs md:text-sm font-black uppercase tracking-[0.3em] mb-2">Piezas Consumidas</p>
                        <motion.div 
                            key={totals.piezas}
                            initial={{ scale: 1.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center gap-2"
                        >
                            <span className="text-7xl md:text-9xl font-black text-white italic tracking-tighter leading-none drop-shadow-lg">
                                {totals.piezas}
                            </span>

                            {user && (
                                <div className="mt-2 flex flex-col items-center gap-3 h-[80px]">
                                    <div className="flex items-center gap-2 text-yellow-500 bg-yellow-500/10 px-4 py-1.5 rounded-full border border-yellow-500/20">
                                        <Trophy size={14} />
                                        <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Récord Personal: {user.max_sushi_pieces || 0}</span>
                                    </div>
                                    
                                    <AnimatePresence>
                                        {totals.piezas > (user.max_sushi_pieces || 0) && (
                                            <motion.button
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                onClick={handleSaveRecord}
                                                disabled={isSaving}
                                                className={`flex items-center gap-2 px-6 py-2 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${
                                                    celebration 
                                                        ? 'bg-green-500 text-black shadow-[0_0_30px_rgba(34,197,94,0.6)] scale-110' 
                                                        : 'bg-white text-black hover:bg-gray-200 shadow-xl'
                                                }`}
                                            >
                                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : celebration ? <Trophy size={16} /> : <Save size={16} />}
                                                {celebration ? '¡Nuevo Récord!' : 'Guardar Récord'}
                                            </motion.button>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </div>

                {/* Content Body: Buttons for types */}
                <div className="relative z-10 flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-center">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full max-w-4xl">
                        {SUSHI_TYPES.map(type => (
                            <div key={type.id} className={`bg-gradient-to-br ${type.bgStyle} border-2 rounded-[2rem] p-4 md:p-6 flex items-center justify-between shadow-inner backdrop-blur-md`}>
                                <div className="flex-1">
                                    <h3 className="text-xl md:text-2xl font-black uppercase italic text-white leading-none mb-1">{type.name}</h3>
                                    <p className="text-[10px] md:text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                        ~{type.kcal} kcal • {type.protein}g P / {type.carbs}g C / {type.fat}g G
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 md:gap-4 bg-black/40 p-2 md:p-3 rounded-2xl border border-white/5">
                                    <button 
                                        onClick={() => handleSubtract(type.id)}
                                        className="w-10 h-10 md:w-12 md:h-12 bg-white/5 hover:bg-white/10 text-white rounded-xl flex items-center justify-center active:scale-95 transition-all"
                                    >
                                        <Minus size={20} />
                                    </button>
                                    <div className="w-12 md:w-16 text-center">
                                        <AnimatePresence mode="popLayout">
                                            <motion.span 
                                                key={counts[type.id]}
                                                initial={{ y: -20, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                className="text-3xl md:text-4xl font-black text-white italic block"
                                                style={{ color: type.color }}
                                            >
                                                {counts[type.id]}
                                            </motion.span>
                                        </AnimatePresence>
                                    </div>
                                    <button 
                                        onClick={() => handleAdd(type.id)}
                                        className="w-10 h-10 md:w-12 md:h-12 text-black rounded-xl flex items-center justify-center active:scale-95 transition-all shadow-lg"
                                        style={{ backgroundColor: type.color }}
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Macros Panel */}
                <div className="relative z-10 p-4 md:p-6 bg-[#252525]/90 backdrop-blur-md border-t border-white/5 shrink-0">
                    <div className="max-w-4xl mx-auto">
                        <div className="grid grid-cols-4 gap-2 md:gap-4">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 text-center flex flex-col justify-center shadow-inner">
                                <span className="text-[9px] md:text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1">Calorías</span>
                                <span className="text-xl md:text-3xl font-black text-white italic">{totals.kcal}</span>
                            </div>
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 md:p-4 text-center flex flex-col justify-center shadow-inner">
                                <span className="text-[9px] md:text-[11px] font-black text-blue-500 uppercase tracking-widest mb-1">Proteína</span>
                                <span className="text-xl md:text-3xl font-black text-white italic">{totals.protein.toFixed(1)}g</span>
                            </div>
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 md:p-4 text-center flex flex-col justify-center shadow-inner">
                                <span className="text-[9px] md:text-[11px] font-black text-green-500 uppercase tracking-widest mb-1">Carbohidratos</span>
                                <span className="text-xl md:text-3xl font-black text-white italic">{totals.carbs.toFixed(1)}g</span>
                            </div>
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 md:p-4 text-center flex flex-col justify-center shadow-inner">
                                <span className="text-[9px] md:text-[11px] font-black text-yellow-500 uppercase tracking-widest mb-1">Grasas</span>
                                <span className="text-xl md:text-3xl font-black text-white italic">{totals.fat.toFixed(1)}g</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
