import { useState, useEffect } from 'react';
import { X, Timer, Plus, Minus } from 'lucide-react';
import { cn } from '../../../lib/utils'; // Assuming this utility exists, if not I'll just use twMerge

interface RestTimerOverlayProps {
    endTime: number;
    onClose: () => void;
    onAddSeconds: (seconds: number) => void;
}

export function RestTimerOverlay({ endTime, onClose, onAddSeconds }: RestTimerOverlayProps) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 500);

        return () => clearInterval(interval);
    }, []);

    const diff = Math.ceil((endTime - now) / 1000);
    const timeLeft = diff > 0 ? diff : 0;
    const isFinished = timeLeft <= 0;

    // Effect for sound/notification when finished
    useEffect(() => {
        if (isFinished) {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
    }, [isFinished]); // Only run when finished state changes

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };



    return (
        <div className="fixed bottom-24 left-4 right-4 z-[100] animate-rise">
            <div className={cn(
                "bg-surface-sunken border border-[var(--border-default)] rounded-card shadow-2xl p-4 flex items-center justify-between",
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
                        <p className="text-t-2xs uppercase font-bold text-ink-subtle tracking-wider">
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
                                className="w-8 h-8 rounded-full bg-surface-sunken flex items-center justify-center text-ink-muted hover:text-white border border-subtle active:scale-95 transition-all"
                            >
                                <Minus size={14} />
                            </button>
                            <button
                                onClick={() => onAddSeconds(10)}
                                className="w-8 h-8 rounded-full bg-surface-sunken flex items-center justify-center text-ink-muted hover:text-white border border-subtle active:scale-95 transition-all"
                            >
                                <Plus size={14} />
                            </button>
                        </>
                    )}
                    <button
                        onClick={onClose}
                        className="ml-2 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-ink-muted hover:text-white border border-subtle active:scale-95 transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
