import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { UserProfile } from '../../../hooks/useUser';
import { Target, RefreshCcw, Timer } from 'lucide-react';
import { AnvilLogoSVG } from '../../../components/ui/AnvilLogoSVG';

interface AnvilHuntGameProps {
    user: UserProfile;
    onSaveScore: (score: number) => void;
    onClose: () => void;
}

interface MovingSquare {
    id: number;
    isAnvil: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    clicked: boolean;
}

const LEVEL_CONFIG = [
    { anvils: 1, dummies: 5, speedMultiplier: 1 },
    { anvils: 3, dummies: 10, speedMultiplier: 1.5 },
    { anvils: 5, dummies: 20, speedMultiplier: 2 }
];

export function AnvilHuntGame({ user: _user, onSaveScore, onClose }: AnvilHuntGameProps) {
    const [status, setStatus] = useState<'idle' | 'playing' | 'gameover'>('idle');
    const [level, setLevel] = useState(0);
    const [squares, setSquares] = useState<MovingSquare[]>([]);
    const [startTime, setStartTime] = useState<number>(0);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    
    const requestRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Timer effect
    useEffect(() => {
        let interval: any;
        if (status === 'playing') {
            interval = setInterval(() => {
                setElapsedTime(Date.now() - startTime);
            }, 10); // Update roughly every frame for ms precision UI
        }
        return () => clearInterval(interval);
    }, [status, startTime]);

    // Animation Loop
    useEffect(() => {
        if (status !== 'playing' || !containerRef.current) return;

        const updatePositions = () => {
            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const sqSize = 40; // approx size of square
            const maxX = rect.width - sqSize;
            const maxY = rect.height - sqSize;

            setSquares(prev => prev.map(sq => {
                if (sq.clicked) return sq;

                let nx = sq.x + sq.vx;
                let ny = sq.y + sq.vy;
                let nvx = sq.vx;
                let nvy = sq.vy;

                // Bounce
                if (nx <= 0 || nx >= maxX) {
                    nvx = -nvx;
                    nx = nx <= 0 ? 0 : maxX;
                }
                if (ny <= 0 || ny >= maxY) {
                    nvy = -nvy;
                    ny = ny <= 0 ? 0 : maxY;
                }

                return { ...sq, x: nx, y: ny, vx: nvx, vy: nvy };
            }));

            requestRef.current = requestAnimationFrame(updatePositions);
        };

        requestRef.current = requestAnimationFrame(updatePositions);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [status]);

    const startGame = () => {
        setLevel(0);
        setElapsedTime(0);
        setStartTime(Date.now());
        initLevel(0);
        setStatus('playing');
    };

    const initLevel = (lvlIndex: number) => {
        if (!containerRef.current) return;
        const config = LEVEL_CONFIG[lvlIndex];
        const rect = containerRef.current.getBoundingClientRect();
        
        const newSquares: MovingSquare[] = [];
        const total = config.anvils + config.dummies;

        for (let i = 0; i < total; i++) {
            const isAnvil = i < config.anvils;
            const speedBase = 1.5 * config.speedMultiplier;
            const angle = Math.random() * Math.PI * 2;
            
            newSquares.push({
                id: i,
                isAnvil,
                x: Math.random() * (rect.width - 40),
                y: Math.random() * (rect.height - 40),
                vx: Math.cos(angle) * speedBase * (Math.random() * 0.5 + 0.8),
                vy: Math.sin(angle) * speedBase * (Math.random() * 0.5 + 0.8),
                clicked: false
            });
        }
        setSquares(newSquares);
    };

    const handleSquareClick = (id: number, isAnvil: boolean) => {
        if (status !== 'playing') return;

        if (isAnvil) {
            setSquares(prev => {
                const next = prev.map(sq => sq.id === id ? { ...sq, clicked: true } : sq);
                
                // Check if all anvils are found
                const anvilsFound = next.filter(s => s.isAnvil && s.clicked).length;
                const config = LEVEL_CONFIG[level];
                
                if (anvilsFound === config.anvils) {
                    if (level + 1 < LEVEL_CONFIG.length) {
                        // Next level
                        setLevel(level + 1);
                        setTimeout(() => initLevel(level + 1), 100);
                    } else {
                        // Game Win
                        setStatus('gameover');
                        const finalTime = Date.now() - startTime;
                        setElapsedTime(finalTime);
                        onSaveScore(finalTime);
                    }
                }
                return next;
            });
        } else {
            // Clicked a dummy square - Penalization!
            // Add 2 seconds penalty
            setStartTime(prev => prev - 2000);
        }
    };

    const formatTime = (ms: number) => {
        const secs = Math.floor(ms / 1000);
        const millis = ms % 1000;
        return `${secs}.${millis.toString().padStart(3, '0')}s`;
    };

    return (
        <div className="flex flex-col h-full bg-[#111111] rounded-3xl overflow-hidden border border-white/10 relative">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#1a1a1a] z-10">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                        <Target size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-black uppercase italic tracking-wider leading-none">Anvil Hunt</h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Nivel {Math.min(level + 1, 3)}/3</p>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="text-right flex items-center gap-2">
                        <Timer size={14} className="text-zinc-500" />
                        <span className={`font-black text-xl leading-none font-mono w-[80px] text-right ${status === 'gameover' ? 'text-green-400' : 'text-white'}`}>
                            {formatTime(elapsedTime)}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white bg-black/20 rounded-xl">X</button>
                </div>
            </div>

            {/* Game Area */}
            <div className="flex-1 relative overflow-hidden" ref={containerRef}>
                {status === 'idle' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20 bg-gradient-to-b from-[#161616] to-[#0a0a0a]">
                        <Target size={48} className="text-yellow-500 mb-6 mx-auto opacity-20" />
                        <h2 className="text-2xl font-black text-white uppercase italic tracking-widest mb-2">Anvil Hunt</h2>
                        <p className="text-sm text-zinc-400 mb-2 max-w-xs mx-auto">Encuentra y toca los logos de Anvil ROJOS ocultos entre los blancos.</p>
                        <p className="text-xs text-anvil-red font-bold uppercase tracking-widest mb-8">Tocar un anvil blanco = +2s penalización</p>
                        <button 
                            onClick={startGame}
                            className="bg-yellow-600 text-black font-black uppercase tracking-[0.2em] px-8 py-4 rounded-xl hover:bg-yellow-500 transition-colors active:scale-95 shadow-[0_0_30px_rgba(202,138,4,0.3)]"
                        >
                            Comenzar (3 Niveles)
                        </button>
                    </div>
                )}

                {status === 'gameover' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20 backdrop-blur-md bg-black/80">
                        <h2 className="text-4xl font-black text-green-500 uppercase italic tracking-widest mb-2">¡Completado!</h2>
                        <p className="text-lg text-white mb-2">Tiempo Total</p>
                        <p className="text-4xl font-mono text-yellow-400 font-black mb-8">{formatTime(elapsedTime)}</p>
                        <button 
                            onClick={startGame}
                            className="bg-white text-black font-black uppercase tracking-[0.2em] px-8 py-4 rounded-xl hover:bg-zinc-200 transition-colors active:scale-95 flex items-center gap-2 mx-auto"
                        >
                            <RefreshCcw size={18} /> Jugar de Nuevo
                        </button>
                    </div>
                )}

                {status === 'playing' && squares.map(sq => !sq.clicked && (
                    <motion.div
                        key={`sq-${sq.id}`}
                        className={`absolute w-[40px] h-[40px] flex items-center justify-center cursor-pointer active:scale-90 transition-transform ${sq.isAnvil ? 'text-anvil-red drop-shadow-[0_0_15px_rgba(220,38,38,0.8)]' : 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]'}`}
                        style={{ left: sq.x, top: sq.y }}
                        onPointerDown={(e) => {
                            e.preventDefault();
                            handleSquareClick(sq.id, sq.isAnvil);
                        }}
                    >
                        <AnvilLogoSVG width={40} height={40} />
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
