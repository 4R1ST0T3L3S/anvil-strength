import { useState, useRef, useEffect } from 'react';
import { cn } from '../../../lib/utils';

interface DurationPickerProps {
    value: number | null;
    onChange: (seconds: number | null) => void;
    onBlur?: () => void;
}

export function DurationPicker({ value, onChange, onBlur }: DurationPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial defaults if null
    const currentSeconds = value || 0;
    const minutes = Math.floor(currentSeconds / 60);
    const seconds = currentSeconds % 60;

    // Options
    const minuteOptions = Array.from({ length: 16 }, (_, i) => i); // 0-15 mins
    const fineSecondOptions = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5, 10... 55

    const handleSelect = (m: number, s: number) => {
        const total = m * 60 + s;
        onChange(total > 0 ? total : null);
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                if (onBlur) onBlur();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onBlur]);

    return (
        <div className="relative w-full" ref={containerRef}>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full bg-[#0a0a0a] border rounded px-2 py-1 text-center text-xs transition-colors flex items-center justify-center gap-1",
                    isOpen ? "border-anvil-red text-white" : "border-white/10 text-gray-300 hover:border-white/30",
                    !value && "text-gray-600"
                )}
            >
                {value ? (
                    <span className="font-mono font-bold">
                        {minutes}′ {seconds.toString().padStart(2, '0')}″
                    </span>
                ) : (
                    <span className="opacity-50">-</span>
                )}
            </button>

            {/* Dropdown Popover */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-[#1c1c1c] border border-white/10 rounded-xl shadow-2xl z-50 p-2 flex gap-2 animate-in fade-in zoom-in-95 duration-100">

                    {/* Minutes Col */}
                    <div className="flex-1 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 pr-1">
                        <div className="text-[10px] uppercase text-gray-500 font-bold mb-1 text-center sticky top-0 bg-[#1c1c1c]">Min</div>
                        <div className="space-y-1">
                            {minuteOptions.map(m => (
                                <button
                                    key={m}
                                    onClick={() => handleSelect(m, seconds)}
                                    className={cn(
                                        "w-full text-center py-1 rounded text-xs font-bold transition-colors",
                                        m === minutes ? "bg-anvil-red text-white" : "text-gray-400 hover:bg-white/5"
                                    )}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Separator */}
                    <div className="w-px bg-white/10 my-2"></div>

                    {/* Seconds Col */}
                    <div className="flex-1 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 pl-1">
                        <div className="text-[10px] uppercase text-gray-500 font-bold mb-1 text-center sticky top-0 bg-[#1c1c1c]">Seg</div>
                        <div className="space-y-1">
                            {fineSecondOptions.map(s => (
                                <button
                                    key={s}
                                    onClick={() => handleSelect(minutes, s)}
                                    className={cn(
                                        "w-full text-center py-1 rounded text-xs font-bold transition-colors",
                                        s === seconds ? "bg-anvil-red text-white" : "text-gray-400 hover:bg-white/5"
                                    )}
                                >
                                    :{s.toString().padStart(2, '0')}
                                </button>
                            ))}
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
