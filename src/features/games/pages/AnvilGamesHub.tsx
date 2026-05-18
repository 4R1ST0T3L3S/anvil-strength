import { useState, useEffect } from 'react';
import { UserProfile } from '../../../hooks/useUser';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Gamepad2, Trophy, Eye, Target, Dices, AlertCircle } from 'lucide-react';
import { DiceMemoryGame } from '../components/DiceMemoryGame';
import { AnvilCounterGame } from '../components/AnvilCounterGame';
import { AnvilHuntGame } from '../components/AnvilHuntGame';
import { gamesService } from '../../../services/gamesService';
import { toast } from 'sonner';

interface AnvilGamesHubProps {
    user: UserProfile;
}

const GAMES = [
    {
        id: 'dice_memory',
        name: 'Dice Memory',
        description: 'Memoriza la secuencia infinita de dados.',
        icon: Dices,
        color: 'text-purple-500',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        component: DiceMemoryGame,
        scoreType: 'points', // higher is better
        scoreUnit: 'pts'
    },
    {
        id: 'anvil_counter',
        name: 'Anvil Flash',
        description: 'Cuenta los yunques en una fracción de segundo.',
        icon: Eye,
        color: 'text-blue-500',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        component: AnvilCounterGame,
        scoreType: 'points',
        scoreUnit: 'rondas'
    },
    {
        id: 'anvil_hunt',
        name: 'Anvil Hunt',
        description: 'Caza los logos de Anvil ocultos en movimiento.',
        icon: Target,
        color: 'text-yellow-500',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/20',
        component: AnvilHuntGame,
        scoreType: 'time', // lower is better
        scoreUnit: 's'
    }
];

export function AnvilGamesHub({ user }: AnvilGamesHubProps) {
    const navigate = useNavigate();
    const [activeGameId, setActiveGameId] = useState<string | null>(null);
    const [bestScores, setBestScores] = useState<Record<string, number>>({});

    // Determinar el Juego del Día
    const today = new Date().toISOString().split('T')[0];
    // Deterministic index based on date (simple hash of YYYY-MM-DD string)
    const dateHash = today.split('-').reduce((acc, part) => acc + parseInt(part), 0);
    const gameOfTheDayIndex = dateHash % GAMES.length;
    const gameOfTheDay = GAMES[gameOfTheDayIndex];

    const isDev = (user.role as string) === 'admin' || (user as any).is_developer === true;

    // Load best scores for the day
    useEffect(() => {
        const loadScores = async () => {
            try {
                const scores: Record<string, number> = {};
                for (const game of GAMES) {
                    const best = await gamesService.getDailyBest(user.id, game.id, today);
                    if (best) scores[game.id] = best.score;
                }
                setBestScores(scores);
            } catch (err) {
                console.error("Error loading scores:", err);
            }
        };
        loadScores();
    }, [user.id, today]);

    const handleSaveScore = async (gameId: string, score: number) => {
        const gameDef = GAMES.find(g => g.id === gameId);
        if (!gameDef) return;

        const isLowerBetter = gameDef.scoreType === 'time';
        
        try {
            await gamesService.saveScore(user.id, gameId, score, today, isLowerBetter);
            
            // Check if it's a new personal best locally to show toast
            const currentBest = bestScores[gameId];
            const isNewBest = currentBest === undefined || (isLowerBetter ? score < currentBest : score > currentBest);
            
            if (isNewBest) {
                toast.success('¡Nuevo récord diario!');
                setBestScores(prev => ({ ...prev, [gameId]: score }));
            }
        } catch (err) {
            console.error("Error saving score:", err);
            toast.error('No se pudo guardar la puntuación');
        }
    };

    const formatScore = (gameId: string, score: number) => {
        const game = GAMES.find(g => g.id === gameId);
        if (!game) return score.toString();
        
        if (game.scoreType === 'time') {
            return `${(score / 1000).toFixed(3)}s`;
        }
        return `${score} ${game.scoreUnit}`;
    };

    if (activeGameId) {
        const activeGame = GAMES.find(g => g.id === activeGameId);
        if (!activeGame) return null;
        const GameComponent = activeGame.component;

        return (
            <div className="fixed inset-0 z-50 bg-black flex flex-col md:p-4">
                <div className="flex-1 w-full max-w-md mx-auto md:max-h-[850px]">
                    <GameComponent 
                        user={user} 
                        onSaveScore={(s) => handleSaveScore(activeGame.id, s)} 
                        onClose={() => setActiveGameId(null)} 
                    />
                </div>
            </div>
        );
    }

    return (
        <main className="pt-28 pb-24 px-4 md:px-8 max-w-7xl mx-auto min-h-screen">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <button 
                    onClick={() => navigate(-1)}
                    className="p-3 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors"
                >
                    <ChevronLeft size={24} />
                </button>
                <div>
                    <h1 className="text-3xl md:text-4xl font-black uppercase italic text-white leading-none">Anvil Games</h1>
                    <p className="text-xs font-bold text-purple-400 uppercase tracking-[0.3em] mt-1 flex items-center gap-2">
                        <Gamepad2 size={12} /> Reto Diario
                    </p>
                </div>
            </div>

            {/* Juego del Día */}
            <section className="mb-12">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Juego del Día</h2>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{today}</span>
                </div>

                <div 
                    onClick={() => setActiveGameId(gameOfTheDay.id)}
                    className="relative overflow-hidden rounded-3xl bg-[#0a0a0a] border border-white/10 cursor-pointer group hover:border-purple-500/50 transition-all active:scale-[0.98]"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-transparent z-0"></div>
                    
                    <div className="relative z-10 p-8 flex flex-col md:flex-row items-center gap-8">
                        <div className={`p-6 rounded-2xl ${gameOfTheDay.bg} ${gameOfTheDay.color} shadow-[0_0_30px_rgba(168,85,247,0.2)] group-hover:scale-110 transition-transform`}>
                            <gameOfTheDay.icon size={48} />
                        </div>
                        
                        <div className="flex-1 text-center md:text-left">
                            <h3 className="text-3xl font-black uppercase italic text-white mb-2">{gameOfTheDay.name}</h3>
                            <p className="text-zinc-400 text-sm mb-6 max-w-md">{gameOfTheDay.description}</p>
                            
                            <div className="flex flex-col md:flex-row items-center gap-4">
                                <button className="bg-white text-black font-black uppercase tracking-[0.2em] px-8 py-3 rounded-xl hover:bg-zinc-200 transition-colors shadow-lg">
                                    Jugar Ahora
                                </button>
                                
                                {bestScores[gameOfTheDay.id] !== undefined && (
                                    <div className="flex items-center gap-2 text-sm bg-black/30 px-4 py-2 rounded-lg border border-white/5">
                                        <Trophy size={14} className="text-yellow-500" />
                                        <span className="text-zinc-400 uppercase font-bold text-[10px] tracking-widest">Tu Mejor Hoy:</span>
                                        <span className="text-white font-black">{formatScore(gameOfTheDay.id, bestScores[gameOfTheDay.id])}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Developer Mode: All Games */}
            {isDev && (
                <section>
                    <div className="flex items-center gap-2 mb-4 p-3 bg-anvil-red/10 border border-anvil-red/20 rounded-xl w-fit">
                        <AlertCircle size={14} className="text-anvil-red" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-anvil-red">Modo Developer: Todos los Juegos</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {GAMES.map(game => (
                            <div 
                                key={game.id}
                                onClick={() => setActiveGameId(game.id)}
                                className={`bg-[#0a0a0a] border ${game.border} rounded-2xl p-6 cursor-pointer hover:bg-[#0a0a0a] transition-colors flex flex-col justify-between`}
                            >
                                <div>
                                    <div className={`p-3 rounded-xl ${game.bg} ${game.color} w-fit mb-4`}>
                                        <game.icon size={24} />
                                    </div>
                                    <h4 className="text-xl font-black uppercase italic text-white mb-1">{game.name}</h4>
                                    <p className="text-xs text-zinc-500 mb-4">{game.description}</p>
                                </div>
                                
                                <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-auto">
                                    <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
                                        {game.id === gameOfTheDay.id ? '★ JUEGO DEL DÍA' : 'PRUEBA DEV'}
                                    </span>
                                    {bestScores[game.id] !== undefined && (
                                        <span className="text-xs font-black text-white">{formatScore(game.id, bestScores[game.id])}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

        </main>
    );
}
