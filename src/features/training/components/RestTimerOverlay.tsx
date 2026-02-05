import { useState, useEffect } from 'react';
import { X, Timer, Plus, Minus } from 'lucide-react';
import { cn } from '../../../lib/utils'; // Assuming this utility exists, if not I'll just use twMerge

interface RestTimerOverlayProps {
    endTime: number;
    onClose: () => void;
    onAddSeconds: (seconds: number) => void;
}

export function RestTimerOverlay({ endTime, onClose, onAddSeconds }: RestTimerOverlayProps) {
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        const calculateTimeLeft = () => {
            const now = Date.now();
            const diff = Math.ceil((endTime - now) / 1000);
            return diff > 0 ? diff : 0;
        };

        // Initial calc
        setTimeLeft(calculateTimeLeft());

        const interval = setInterval(() => {
            const remaining = calculateTimeLeft();
            setTimeLeft(remaining);
            if (remaining <= 0) {
                // Determine if we should auto-close or play sound? 
                // For now, let's keep showing "00:00" until user acknowledges, or maybe auto-close?
                // The prompt verification step says "Wait for 0:00 -> Verify it closes or notifies".
                // Let's vibrate if supported
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        }, 500); // Check twice a second to avoid lag

        return () => clearInterval(interval);
    }, [endTime]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const isFinished = timeLeft <= 0;

    return (
        <div className="fixed bottom-24 left-4 right-4 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className={cn(
                "bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center justify-between",
                isFinished ? "border-green-500/50 bg-green-900/10" : "border-anvil-red/30"
            )}>
                {/* Time Display */}
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center border-2",
                        isFinished ? "border-green-500 text-green-500" : "border-anvil-red text-anvil-red"
                    )}>
                        <Timer size={20} className={isFinished ? "animate-bounce" : ""} />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                            {isFinished ? "Tiempo Completado" : "Tiempo de Descanso"}
                        </p>
                        <p className={cn(
                            "text-2xl font-black tabular-nums leading-none",
                            isFinished ? "text-green-500" : "text-white"
                        )}>
                            {formatTime(timeLeft)}
                        </p>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    {!isFinished && (
                        <>
                            <button
                                onClick={() => onAddSeconds(-10)}
                                className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center text-gray-400 hover:text-white border border-white/5 active:scale-95 transition-all"
                            >
                                <Minus size={14} />
                            </button>
                            <button
                                onClick={() => onAddSeconds(10)}
                                className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center text-gray-400 hover:text-white border border-white/5 active:scale-95 transition-all"
                            >
                                <Plus size={14} />
                            </button>
                        </>
                    )}
                    <button
                        onClick={onClose}
                        className="ml-2 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white border border-white/5 active:scale-95 transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
