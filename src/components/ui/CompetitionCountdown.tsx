import { useState, useEffect } from 'react';
/* eslint-disable react-refresh/only-export-components */
import { Trophy, MapPin } from 'lucide-react';

export const formatCompetitionName = (name: string, location?: string, level?: string) => {
    const cleanName = name.replace(/Campeonato\s+/i, '').trim();
    let lvl = level ? level.toUpperCase() : '';

    if (lvl.includes('AEP 1') || lvl.includes('AEP1')) {
        return `AEP 1 ${name}`;
    }

    let city = '';
    if (location) {
        city = location.split(',')[0].trim().toUpperCase();
    }

    if (lvl && city) {
        lvl = lvl.replace(/\s+/g, '');
        return `${lvl} ${city}`;
    }

    if (city) {
        return `${cleanName} ${city}`;
    }

    return cleanName;
};

export const getCompetitionColorClass = (level?: string) => {
    if (!level) return 'bg-gradient-to-br from-blue-700 to-blue-900';
    if (level.includes('AEP 1')) return 'bg-gradient-to-br from-blue-500 to-blue-700';
    if (level.includes('AEP 2')) return 'bg-gradient-to-br from-[#D4AF37] to-[#B3902A]'; // Golden yellow
    if (level.includes('AEP 3')) return 'bg-gradient-to-br from-[#FF6B35] to-[#CC552A]'; // Energetic orange
    return 'bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10';
};

const TimeBlock = ({ value, label }: { value: number, label: string }) => (
    <div className="flex flex-col items-center justify-center bg-black/25 backdrop-blur-sm rounded-lg py-2 px-1 w-full border border-white/10 aspect-square max-h-[80px]">
        <span className="text-2xl sm:text-3xl lg:text-4xl font-black font-mono tracking-tighter" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {value.toString().padStart(2, '0')}
        </span>
        <span className="text-[8px] sm:text-[9px] lg:text-[10px] uppercase font-bold tracking-widest text-white/70 mt-1">{label}</span>
    </div>
);

export function LiveCountdown({ targetDate }: { targetDate: string }) {
    const [timeLeft, setTimeLeft] = useState(() => {
        const difference = +new Date(targetDate + 'T00:00:00') - +new Date();
        return difference > 0 ? difference : 0;
    });

    useEffect(() => {
        const timer = setInterval(() => {
            const difference = +new Date(targetDate + 'T00:00:00') - +new Date();
            if (difference > 0) {
                setTimeLeft(difference);
            } else {
                setTimeLeft(0);
                clearInterval(timer);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [targetDate]);

    if (timeLeft === 0) {
        return (
            <div className="bg-white/10 backdrop-blur text-white px-6 py-4 rounded-xl font-black uppercase tracking-widest animate-pulse border border-white/20 mt-6 inline-flex items-center">
                ¡DÍA DE COMPETICIÓN!
            </div>
        );
    }

    const d = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const h = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
    const m = Math.floor((timeLeft / 1000 / 60) % 60);
    const s = Math.floor((timeLeft / 1000) % 60);

    return (
        <div className="grid grid-cols-4 gap-1.5 md:gap-2 mt-4 w-full max-w-[400px] mx-auto">
            <TimeBlock value={d} label="Días" />
            <TimeBlock value={h} label="Horas" />
            <TimeBlock value={m} label="Mins" />
            <TimeBlock value={s} label="Segs" />
        </div>
    );
}

export function CompetitionBanner({
    name,
    date,
    location,
    level,
    mobile = false
}: {
    name: string;
    date: string;
    location?: string;
    level?: string;
    mobile?: boolean;
}) {
    // If mobile is true, render a slightly smaller version fit for mobile
    if (mobile) {
        return (
            <div className={`${getCompetitionColorClass(level)} rounded-3xl p-6 text-white flex flex-col items-center text-center relative overflow-hidden shadow-xl`}>
                <div className="absolute top-0 right-0 w-56 h-56 bg-white/10 rounded-full -mr-24 -mt-24 pointer-events-none"></div>
                <div className="relative z-10 flex flex-col items-center w-full">
                    <div className="flex items-center justify-center gap-2 text-white/80 font-bold text-[10px] uppercase tracking-widest mb-2">
                        <Trophy size={14} /> PRÓXIMA COMPETICIÓN
                    </div>
                    <h3 className="text-3xl font-black uppercase italic leading-tight mb-2">
                        {formatCompetitionName(name, location, level)}
                    </h3>
                    {location && (
                        <div className="mt-1 flex items-center justify-center gap-2 text-white/90 font-bold text-xs">
                            <MapPin size={12} /> {location}
                        </div>
                    )}
                    <div className="mt-4 w-full bg-black/10 rounded-2xl pb-2 px-2 border border-white/5 flex justify-center">
                        <LiveCountdown targetDate={date} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`${getCompetitionColorClass(level)} rounded-[2rem] p-6 text-white flex flex-col items-center text-center justify-center relative overflow-hidden shadow-xl h-full`}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35rem] h-[35rem] bg-white/5 rounded-full pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col items-center">
                <div className="flex items-center justify-center gap-2 text-white/80 font-bold text-xs uppercase tracking-widest mb-3">
                    <Trophy size={16} /> TU PRÓXIMO RETO
                </div>
                <h3 className="text-2xl md:text-3xl font-black uppercase italic leading-none max-w-4xl drop-shadow-lg mb-3">
                    {formatCompetitionName(name, location, level)}
                </h3>
                {location && (
                    <div className="mt-1 flex items-center justify-center gap-2 text-white/90 font-bold text-sm">
                        <MapPin size={16} /> {location}
                    </div>
                )}
            </div>

            <div className="relative z-10 mt-4 w-full max-w-xl shrink-0 bg-black/20 backdrop-blur pb-4 pt-0 px-4 md:px-6 rounded-3xl border border-white/10 flex justify-center">
                <LiveCountdown targetDate={date} />
            </div>
        </div>
    );
}
