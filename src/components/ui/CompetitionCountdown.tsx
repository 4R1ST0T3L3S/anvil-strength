import { useState, useEffect } from 'react';
import { Trophy, MapPin, Settings } from 'lucide-react';
import { BannerSettingsModal } from './BannerSettingsModal';

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

export function LiveCountdown({ targetDate, targetTime = '00:00' }: { targetDate: string, targetTime?: string }) {
    const [timeLeft, setTimeLeft] = useState(() => {
        if (!targetDate) return 0;
        const target = new Date(`${targetDate}T${targetTime}:00`);
        if (isNaN(target.getTime())) return 0;
        const difference = +target - +new Date();
        return difference > 0 ? difference : 0;
    });

    useEffect(() => {
        if (!targetDate) return;
        
        const timer = setInterval(() => {
            const target = new Date(`${targetDate}T${targetTime}:00`);
            if (isNaN(target.getTime())) {
                clearInterval(timer);
                return;
            }
            const difference = +target - +new Date();
            if (difference > 0) {
                setTimeLeft(difference);
            } else {
                setTimeLeft(0);
                clearInterval(timer);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [targetDate, targetTime]);

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
    userId,
    name,
    date,
    location,
    level,
    mobile = false,
    fullUserMetadata = {}
}: {
    userId?: string;
    name: string;
    date: string;
    location?: string;
    level?: string;
    mobile?: boolean;
    fullUserMetadata?: any;
}) {
    const settings = fullUserMetadata?.competition_banner_settings || {};
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const themeClasses: Record<string, string> = {
        blue: 'bg-gradient-to-br from-blue-700 to-blue-900',
        gold: 'bg-gradient-to-br from-[#D4AF37] to-[#B3902A]',
        neon: 'bg-gradient-to-br from-purple-700 to-fuchsia-900 shadow-[0_0_50px_rgba(168,85,247,0.3)]',
        red: 'bg-gradient-to-br from-anvil-red to-red-950',
        dark: 'bg-zinc-900 border border-white/10',
        glass: 'bg-white/5 backdrop-blur-xl border border-white/10',
        brutalist: 'bg-white border-[4px] border-black text-black',
        crimson: 'bg-gradient-to-br from-red-900 to-black',
        emerald: 'bg-gradient-to-br from-emerald-600 to-emerald-950',
        ocean: 'bg-gradient-to-br from-cyan-500 to-blue-600',
        sunset: 'bg-gradient-to-br from-orange-500 to-rose-600',
        forest: 'bg-gradient-to-br from-green-600 to-emerald-900',
        midnight: 'bg-gradient-to-br from-indigo-900 to-black',
        lava: 'bg-gradient-to-br from-red-600 to-orange-800',
        minimal: 'bg-zinc-100 border border-zinc-300 text-black',
        pink: 'bg-gradient-to-br from-pink-500 to-rose-600',
        skyblue: 'bg-gradient-to-br from-sky-300 to-blue-500'
    };

    const shapeClasses: Record<string, string> = {
        rounded: mobile ? 'rounded-3xl' : 'rounded-[2rem]',
        square: 'rounded-none',
        pill: 'rounded-full',
        extra: 'rounded-[4rem]'
    };

    const activeTheme = settings?.theme || (level ? level.includes('AEP 2') ? 'gold' : level.includes('AEP 1') ? 'blue' : 'dark' : 'dark');
    const activeShape = settings?.shape || 'rounded';
    const activeFont = settings?.font || 'inter';

    const fontClasses: Record<string, string> = {
        inter: 'font-sans',
        bebas: 'font-["Bebas_Neue",sans-serif] tracking-wider',
        mono: 'font-mono',
        black: 'font-black italic'
    };

    const displayDate = settings?.targetDate || date;
    const displayTime = settings?.targetTime || '00:00';
    const displayName = settings?.customName || formatCompetitionName(name, location, level);

    const containerStyles: React.CSSProperties = settings?.backgroundImage ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.8)), url(${settings.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
    } : {};

    const content = (
        <div 
            onClick={() => userId && setIsSettingsOpen(true)}
            className={`
                ${themeClasses[activeTheme] || themeClasses.dark} 
                ${fontClasses[activeFont] || ''}
                ${shapeClasses[activeShape] || shapeClasses.rounded} 
                text-white flex flex-col items-center text-center justify-center relative overflow-hidden shadow-2xl transition-all cursor-pointer group
            `}
            style={containerStyles}
        >
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 z-50">
                <div className="bg-black/40 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 border border-white/10">
                    <Settings size={14} className="animate-spin-slow" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Personalizar</span>
                </div>
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35rem] h-[35rem] bg-white/5 rounded-full pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col items-center w-full">
                <div className="flex items-center justify-center gap-2 text-white/80 font-bold text-[10px] sm:text-xs uppercase tracking-widest mb-3">
                    <Trophy size={mobile ? 14 : 16} /> TU PRÓXIMO RETO
                </div>
                <h3 className={`
                    ${activeFont === 'bebas' ? 'text-4xl md:text-5xl' : 'text-2xl md:text-3xl'}
                    font-black uppercase italic leading-none max-w-4xl drop-shadow-2xl mb-3
                `}>
                    {displayName}
                </h3>
                {location && !settings?.customName && (
                    <div className="mt-1 flex items-center justify-center gap-2 text-white/90 font-bold text-sm">
                        <MapPin size={mobile ? 12 : 16} /> {location}
                    </div>
                )}
            </div>

            <div className="relative z-10 mt-4 w-full max-w-xl shrink-0 bg-black/30 backdrop-blur-md pb-4 pt-0 px-4 md:px-6 rounded-3xl border border-white/10 flex justify-center shadow-inner">
                <LiveCountdown targetDate={displayDate} targetTime={displayTime} />
            </div>

            {userId && (
                <BannerSettingsModal 
                    userId={userId}
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    fullUserMetadata={fullUserMetadata}
                />
            )}
        </div>
    );

    return content;
}

