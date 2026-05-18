import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ArrowRight, Sparkles, X } from 'lucide-react';
import { useUser } from '../../../hooks/useUser';
import { AnvilMascot } from '../../../components/ui/AnvilMascot';

interface WelcomeTourModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function WelcomeTourModal({ isOpen, onClose }: WelcomeTourModalProps) {
    const { data: user } = useUser();
    const [pointsAwarded, setPointsAwarded] = useState(false);

    useEffect(() => {
        if (isOpen && !pointsAwarded && user) {
            // En un entorno real, esto se dispararía desde el backend al registrarse,
            // pero para asegurar que los "recién registrados" lo vean, podemos intentar
            // otorgar los puntos aquí si no los tienen, o simplemente mostrar la animación
            // de que los han recibido (asumiendo que el script SQL ya hizo su parte).
            setPointsAwarded(true);
        }
    }, [isOpen, user, pointsAwarded]);

    const handleStartTour = () => {
        // Aquí disparamos el Typebot. 
        // Según el código de LandingPage, se hace con window.Typebot.toggle()
        if ((window as any).Typebot) {
            (window as any).Typebot.open();
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative bg-[#0a0a0a] border border-white/10 w-full max-w-lg rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.2)]"
                >
                    {/* Decorative background */}
                    <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-anvil-red/20 to-transparent pointer-events-none" />
                    
                    <div className="p-8 relative flex flex-col items-center text-center">
                        <button 
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <motion.div
                            initial={{ y: -20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="mb-6"
                        >
                            <AnvilMascot className="w-32 h-32" />
                        </motion.div>

                        <motion.h2 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="text-3xl font-black uppercase tracking-tighter text-white mb-2"
                        >
                            ¡BIENVENIDO A LA <span className="text-anvil-red italic">FORJA</span>!
                        </motion.h2>

                        <motion.p 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-8"
                        >
                            Has sido reclutado para el Anvil Power Club
                        </motion.p>

                        {/* Puntos de Bienvenida */}
                        <motion.div
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ 
                                type: "spring", 
                                stiffness: 260, 
                                damping: 20,
                                delay: 0.6 
                            }}
                            className="relative mb-10 bg-gradient-to-br from-yellow-400 to-yellow-600 p-1 rounded-2xl shadow-[0_0_30px_rgba(234,179,8,0.4)]"
                        >
                            <div className="bg-[#0a0a0a] px-8 py-4 rounded-xl flex items-center gap-4">
                                <div className="p-3 bg-yellow-500/10 rounded-full">
                                    <Sparkles className="text-yellow-500" size={24} />
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.2em]">Bono Inicial</p>
                                    <p className="text-2xl font-black text-white">+100 <span className="text-yellow-500">COINS</span></p>
                                </div>
                            </div>
                            
                            {/* Floating coins animation overlay */}
                            <motion.div 
                                className="absolute -top-4 -right-4"
                                animate={{ y: [0, -10, 0] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                <Trophy className="text-yellow-500" size={32} />
                            </motion.div>
                        </motion.div>

                        <div className="space-y-4 w-full">
                            <button
                                onClick={handleStartTour}
                                className="w-full py-4 bg-anvil-red hover:bg-red-700 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_10px_20px_rgba(220,38,38,0.3)] flex items-center justify-center gap-3 group"
                            >
                                Empezar Tour Guiado
                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                            
                            <button
                                onClick={onClose}
                                className="w-full py-3 text-gray-500 hover:text-white font-bold uppercase tracking-widest text-xs transition-colors"
                            >
                                Ya conozco la app, saltar
                            </button>
                        </div>
                    </div>

                    {/* Progress bar (aesthetic) */}
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5">
                        <motion.div 
                            className="h-full bg-anvil-red shadow-[0_0_10px_rgba(220,38,38,1)]"
                            initial={{ width: "0%" }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.8 }}
                        />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
