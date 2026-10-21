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
                "bg-surface-sunken border border-[var(--border-default)] rounded-card shadow-overlay p-4 flex items-center justify-between",
                isFinished ? "border-green-500/50 bg-green-900/10" : "border-brand/30"
            )}>
                {/* Time Display */}
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center border-2",
                        isFinished ? "border-green-500 text-success" : "border-brand text-brand-text"
                    )}>
                        <Timer size={20} className={isFinished ? "animate-bounce" : ""} />
                    </div>
                    <div>
                        <p className="text-t-2xs font-bold text-ink-subtle">
                            {isFinished ? "Tiempo Completado" : "Tiempo de Descanso"}
                        </p>
                        <p className={cn(
                            "text-2xl font-semibold tabular-nums leading-none",
                            isFinished ? "text-success" : "text-ink"
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
                                type="button"
                                onClick={() => onAddSeconds(-10)}
                                aria-label="Restar 10 segundos"
                                className="relative flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-full border border-subtle bg-surface-sunken text-ink-muted transition-[color,transform] hover:text-ink active:scale-95 before:absolute before:-inset-1 before:content-[''] md:before:hidden"
                            >
                                <Minus size={16} className="md:h-3.5 md:w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onAddSeconds(10)}
                                aria-label="Añadir 10 segundos"
                                className="relative flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-full border border-subtle bg-surface-sunken text-ink-muted transition-[color,transform] hover:text-ink active:scale-95 before:absolute before:-inset-1 before:content-[''] md:before:hidden"
                            >
                                <Plus size={16} className="md:h-3.5 md:w-3.5" />
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar temporizador de descanso"
                        className="relative ml-2 flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-full border border-subtle bg-[var(--fill-muted)] text-ink-muted transition-[color,transform] hover:text-ink active:scale-95 before:absolute before:-inset-1 before:content-[''] md:before:hidden"
                    >
                        <X size={16} className="md:h-4 md:w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
