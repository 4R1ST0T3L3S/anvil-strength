import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from '../../../hooks/useUser';
import { RefreshCcw, Eye } from 'lucide-react';
import { AnvilLogoSVG } from '../../../components/ui/AnvilLogoSVG';

interface AnvilCounterGameProps {
    user: UserProfile;
    onSaveScore: (score: number) => void;
    onClose: () => void;
}

interface FlashAnvil {
    id: number;
    x: number;
    y: number;
    size: number;
    rotation: number;
}

export function AnvilCounterGame({ user, onSaveScore, onClose }: AnvilCounterGameProps) {
    const [status, setStatus] = useState<'idle' | 'flashing' | 'guessing' | 'gameover'>('idle');
    const [score, setScore] = useState(0); // Rondas superadas
    const [anvils, setAnvils] = useState<FlashAnvil[]>([]);
    const [inputValue, setInputValue] = useState<string>('');
    const containerRef = useRef<HTMLDivElement>(null);

    const startGame = () => {
        setScore(0);
        nextRound(0);
    };

    const nextRound = (currentScore: number) => {
        setInputValue('');
        setStatus('flashing');
        
        // Determinar cantidad. Sube la dificultad
        const maxAnvils = Math.min(15, 3 + Math.floor(currentScore / 2)); 
        const count = Math.floor(Math.random() * maxAnvils) + 1; // 1 to maxAnvils
        
        generateAnvils(count);

        // Determinar tiempo. Más rápido cuanto más score
        const flashTime = Math.max(400, 1000 - (currentScore * 50));

        setTimeout(() => {
            setStatus('guessing');
        }, flashTime);
    };

    const generateAnvils = (count: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        
        const newAnvils: FlashAnvil[] = [];
        for (let i = 0; i < count; i++) {
            newAnvils.push({
                id: i,
                x: 10 + Math.random() * 80, // % width (keep away from extreme edges)
                y: 10 + Math.random() * 80, // % height
                size: 20 + Math.random() * 30, // 20px to 50px
                rotation: -45 + Math.random() * 90 // -45deg to 45deg
            });
        }
        setAnvils(newAnvils);
    };

    const handleNumberClick = (num: string) => {
        if (status !== 'guessing') return;
        if (inputValue.length >= 2) return; // max 99
        setInputValue(prev => prev + num);
    };

    const handleBackspace = () => {
        setInputValue(prev => prev.slice(0, -1));
    };

    const handleSubmit = () => {
        if (!inputValue || status !== 'guessing') return;

        const guess = parseInt(inputValue, 10);
        if (guess === anvils.length) {
            setScore(score + 1);
            setTimeout(() => nextRound(score + 1), 500); // Pequeña pausa antes de la siguiente
        } else {
            setStatus('gameover');
            onSaveScore(score);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#111111] rounded-3xl overflow-hidden border border-white/10 relative">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#1a1a1a] z-10">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                        <Eye size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-black uppercase italic tracking-wider leading-none">Anvil Flash</h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Ojo de Águila</p>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="text-right">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest block">Rondas</span>
                        <span className="text-blue-400 font-black text-xl leading-none">{score}</span>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white bg-black/20 rounded-xl">X</button>
                </div>
            </div>

            {/* Game Area */}
            <div className="flex-1 flex flex-col relative">
                
                {/* Flashing Area */}
                <div 
                    ref={containerRef}
                    className="flex-1 relative overflow-hidden bg-gradient-to-b from-[#161616] to-[#0a0a0a]"
                >
                    {status === 'idle' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20">
                            <Eye size={48} className="text-blue-500 mb-6 mx-auto opacity-20" />
                            <h2 className="text-2xl font-black text-white uppercase italic tracking-widest mb-2">Anvil Flash</h2>
                            <p className="text-sm text-zinc-400 mb-8 max-w-xs mx-auto">Varios yunques aparecerán durante un instante. Acierta cuántos había. Cada ronda será más rápida.</p>
                            <button 
                                onClick={startGame}
                                className="bg-blue-600 text-white font-black uppercase tracking-[0.2em] px-8 py-4 rounded-xl hover:bg-blue-500 transition-colors active:scale-95 shadow-[0_0_30px_rgba(59,130,246,0.3)]"
                            >
                                Jugar Ahora
                            </button>
                        </div>
                    )}

                    {status === 'gameover' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20 backdrop-blur-md bg-black/50">
                            <h2 className="text-4xl font-black text-anvil-red uppercase italic tracking-widest mb-2">Game Over</h2>
                            <p className="text-sm text-zinc-400 mb-2">Había exactamente <span className="text-white font-bold">{anvils.length}</span> yunques.</p>
                            <p className="text-lg text-white mb-8">Rondas Superadas: <span className="font-black text-blue-400">{score}</span></p>
                            <button 
                                onClick={startGame}
                                className="bg-white text-black font-black uppercase tracking-[0.2em] px-8 py-4 rounded-xl hover:bg-zinc-200 transition-colors active:scale-95 flex items-center gap-2 mx-auto"
                            >
                                <RefreshCcw size={18} /> Reintentar
                            </button>
                        </div>
                    )}

                    <AnimatePresence>
                        {status === 'flashing' && anvils.map(anvil => (
                            <motion.div
                                key={anvil.id}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, filter: 'blur(10px)' }}
                                transition={{ duration: 0.1 }}
                                className="absolute pointer-events-none"
                                style={{
                                    left: `${anvil.x}%`,
                                    top: `${anvil.y}%`,
                                    transform: `translate(-50%, -50%) rotate(${anvil.rotation}deg)`
                                }}
                            >
                                <AnvilLogoSVG width={anvil.size} height={anvil.size} className="text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Input Area (Keypad) */}
                <div className={`p-6 bg-[#1a1a1a] border-t border-white/10 transition-all duration-300 ${status === 'guessing' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 absolute bottom-0 w-full'}`}>
                    <div className="flex items-center justify-between mb-4 bg-black p-4 rounded-xl border border-white/5">
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Respuesta:</span>
                        <span className="text-2xl font-black text-white">{inputValue || '_'}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                            <button
                                key={`kp-${num}`}
                                onClick={() => handleNumberClick(num.toString())}
                                className="bg-[#222222] border border-white/5 p-4 rounded-xl text-xl font-bold text-white active:bg-blue-600 active:scale-95 transition-all"
                            >
                                {num}
                            </button>
                        ))}
                        <button
                            onClick={handleBackspace}
                            className="bg-anvil-red/10 text-anvil-red border border-anvil-red/20 p-4 rounded-xl text-xl font-bold active:bg-anvil-red active:text-white active:scale-95 transition-all"
                        >
                            ←
                        </button>
                        <button
                            onClick={() => handleNumberClick('0')}
                            className="bg-[#222222] border border-white/5 p-4 rounded-xl text-xl font-bold text-white active:bg-blue-600 active:scale-95 transition-all"
                        >
                            0
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!inputValue}
                            className={`p-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${inputValue ? 'bg-blue-600 text-white active:scale-95 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
                        >
                            OK
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
