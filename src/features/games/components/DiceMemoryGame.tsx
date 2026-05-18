import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from '../../../hooks/useUser';
import { Trophy, RefreshCcw, Dices } from 'lucide-react';

interface DiceMemoryGameProps {
    user: UserProfile;
    onSaveScore: (score: number) => void;
    onClose: () => void;
}

export function DiceMemoryGame({ user: _user, onSaveScore, onClose }: DiceMemoryGameProps) {
    const [sequence, setSequence] = useState<number[]>([]);
    const [playerSequence, setPlayerSequence] = useState<number[]>([]);
    const [status, setStatus] = useState<'idle' | 'showing' | 'playing' | 'gameover'>('idle');
    const [score, setScore] = useState(0);
    const [activeDieIndex, setActiveDieIndex] = useState(-1);

    const startGame = () => {
        setScore(0);
        setPlayerSequence([]);
        nextRound([Math.floor(Math.random() * 6) + 1]);
    };

    const nextRound = (newSeq: number[]) => {
        setSequence(newSeq);
        setPlayerSequence([]);
        setStatus('showing');
        playSequence(newSeq);
    };

    const playSequence = async (seq: number[]) => {
        for (let i = 0; i < seq.length; i++) {
            await new Promise(r => setTimeout(r, 400));
            setActiveDieIndex(i);
            await new Promise(r => setTimeout(r, 800)); // Show die for 800ms
            setActiveDieIndex(-1);
        }
        setStatus('playing');
    };

    const handleNumberClick = (num: number) => {
        if (status !== 'playing') return;

        const newPlayerSeq = [...playerSequence, num];
        setPlayerSequence(newPlayerSeq);

        const currentIndex = newPlayerSeq.length - 1;
        
        if (newPlayerSeq[currentIndex] !== sequence[currentIndex]) {
            // Wrong number
            setStatus('gameover');
            onSaveScore(score);
        } else if (newPlayerSeq.length === sequence.length) {
            // Round completed
            setScore(score + sequence.length); // Score based on total dice remembered
            setTimeout(() => {
                nextRound([...sequence, Math.floor(Math.random() * 6) + 1]);
            }, 1000);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#111111] rounded-3xl overflow-hidden border border-white/10 relative">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#0a0a0a]">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                        <Dices size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-black uppercase italic tracking-wider leading-none">Dice Memory</h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Nivel: {sequence.length}</p>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="text-right">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest block">Puntos</span>
                        <span className="text-anvil-red font-black text-xl leading-none">{score}</span>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white bg-black/20 rounded-xl">X</button>
                </div>
            </div>

            {/* Game Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                {status === 'idle' && (
                    <div className="text-center">
                        <Trophy size={48} className="text-purple-500 mb-6 mx-auto opacity-20" />
                        <h2 className="text-2xl font-black text-white uppercase italic tracking-widest mb-2">Memoria de Dados</h2>
                        <p className="text-sm text-zinc-400 mb-8 max-w-xs mx-auto">Memoriza la secuencia de dados. Cada ronda se añade un dado más. ¡Un solo error y se acabó!</p>
                        <button 
                            onClick={startGame}
                            className="bg-purple-600 text-white font-black uppercase tracking-[0.2em] px-8 py-4 rounded-xl hover:bg-purple-500 transition-colors active:scale-95 shadow-[0_0_30px_rgba(147,51,234,0.3)]"
                        >
                            Jugar Ahora
                        </button>
                    </div>
                )}

                {status === 'gameover' && (
                    <div className="text-center z-10">
                        <h2 className="text-4xl font-black text-anvil-red uppercase italic tracking-widest mb-2">Game Over</h2>
                        <p className="text-lg text-white mb-8">Puntuación Final: <span className="font-black text-purple-400">{score}</span></p>
                        <button 
                            onClick={startGame}
                            className="bg-white text-black font-black uppercase tracking-[0.2em] px-8 py-4 rounded-xl hover:bg-zinc-200 transition-colors active:scale-95 flex items-center gap-2 mx-auto"
                        >
                            <RefreshCcw size={18} /> Reintentar
                        </button>
                    </div>
                )}

                {(status === 'showing' || status === 'playing') && (
                    <div className="w-full flex-1 flex flex-col items-center justify-center relative">
                        {/* Display Area for Current Die */}
                        <div className="h-40 flex items-center justify-center w-full">
                            <AnimatePresence mode="wait">
                                {status === 'showing' && activeDieIndex >= 0 && (
                                    <motion.div
                                        key={`die-${activeDieIndex}`}
                                        initial={{ scale: 0.5, opacity: 0, rotateY: 90 }}
                                        animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                                        exit={{ scale: 1.5, opacity: 0, filter: 'blur(10px)' }}
                                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                        className="w-32 h-32 bg-white rounded-3xl shadow-[0_0_50px_rgba(255,255,255,0.2)] border-4 border-zinc-200 flex items-center justify-center relative overflow-hidden"
                                    >
                                        {/* Simple Die Face rendering based on number */}
                                        <DieFace number={sequence[activeDieIndex]} />
                                    </motion.div>
                                )}
                                {status === 'playing' && (
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="text-zinc-500 font-bold uppercase tracking-widest text-sm text-center"
                                    >
                                        Tu turno. Faltan {sequence.length - playerSequence.length} dados.
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Player Input Grid */}
                        <div className={`mt-8 grid grid-cols-3 gap-3 w-full max-w-[300px] transition-opacity duration-300 ${status === 'playing' ? 'opacity-100 pointer-events-auto' : 'opacity-30 pointer-events-none grayscale'}`}>
                            {[1, 2, 3, 4, 5, 6].map(num => (
                                <button
                                    key={`btn-${num}`}
                                    onClick={() => handleNumberClick(num)}
                                    className="aspect-square bg-[#0a0a0a] border border-white/5 rounded-2xl flex items-center justify-center active:bg-purple-600 active:scale-95 transition-all"
                                >
                                    <DieFace number={num} size="small" />
                                </button>
                            ))}
                        </div>
                        
                        {/* Progress Indicator */}
                        {status === 'playing' && (
                            <div className="flex gap-2 mt-8">
                                {sequence.map((_, i) => (
                                    <div key={`dot-${i}`} className={`w-3 h-3 rounded-full ${i < playerSequence.length ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-white/10'}`} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper to draw die dots
function DieFace({ number, size = 'large' }: { number: number, size?: 'small' | 'large' }) {
    const dotSize = size === 'large' ? 'w-6 h-6' : 'w-3 h-3';
    const dotClass = `${dotSize} bg-zinc-900 rounded-full`;

    const getDots = () => {
        switch (number) {
            case 1: return <div className={dotClass} />;
            case 2: return (
                <>
                    <div className={`${dotClass} absolute top-[20%] left-[20%]`} />
                    <div className={`${dotClass} absolute bottom-[20%] right-[20%]`} />
                </>
            );
            case 3: return (
                <>
                    <div className={`${dotClass} absolute top-[20%] left-[20%]`} />
                    <div className={dotClass} />
                    <div className={`${dotClass} absolute bottom-[20%] right-[20%]`} />
                </>
            );
            case 4: return (
                <>
                    <div className={`${dotClass} absolute top-[20%] left-[20%]`} />
                    <div className={`${dotClass} absolute top-[20%] right-[20%]`} />
                    <div className={`${dotClass} absolute bottom-[20%] left-[20%]`} />
                    <div className={`${dotClass} absolute bottom-[20%] right-[20%]`} />
                </>
            );
            case 5: return (
                <>
                    <div className={`${dotClass} absolute top-[20%] left-[20%]`} />
                    <div className={`${dotClass} absolute top-[20%] right-[20%]`} />
                    <div className={dotClass} />
                    <div className={`${dotClass} absolute bottom-[20%] left-[20%]`} />
                    <div className={`${dotClass} absolute bottom-[20%] right-[20%]`} />
                </>
            );
            case 6: return (
                <>
                    <div className={`${dotClass} absolute top-[20%] left-[20%]`} />
                    <div className={`${dotClass} absolute top-[50%] left-[20%] -translate-y-1/2`} />
                    <div className={`${dotClass} absolute bottom-[20%] left-[20%]`} />
                    <div className={`${dotClass} absolute top-[20%] right-[20%]`} />
                    <div className={`${dotClass} absolute top-[50%] right-[20%] -translate-y-1/2`} />
                    <div className={`${dotClass} absolute bottom-[20%] right-[20%]`} />
                </>
            );
            default: return null;
        }
    };


    return (
        <div className="w-full h-full relative flex items-center justify-center pointer-events-none">
            {getDots()}
        </div>
    );
}
