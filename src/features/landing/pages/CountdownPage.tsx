import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Instagram, Mail } from 'lucide-react';

export function CountdownPage() {
    const calculateTimeLeft = () => {
        const launchDate = new Date('2026-02-21T20:00:00').getTime();
        const now = new Date().getTime();
        const difference = launchDate - now;

        if (difference > 0) {
            return {
                days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((difference / 1000 / 60) % 60),
                seconds: Math.floor((difference / 1000) % 60),
            };
        }
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const timeUnits = [
        { label: 'DÍAS', value: timeLeft.days },
        { label: 'HORAS', value: timeLeft.hours },
        { label: 'MINS', value: timeLeft.minutes },
        { label: 'SEGS', value: timeLeft.seconds },
    ];

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center relative overflow-hidden font-sans selection:bg-anvil-red selection:text-white">
            {/* Background Texture/Gradient */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900/40 via-[#0a0a0a] to-[#0a0a0a]" />
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            </div>

            <div className="relative z-10 flex flex-col items-center px-4 text-center max-w-5xl mx-auto w-full">

                {/* Logo */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="mb-12 md:mb-16"
                >
                    <img
                        src="/logo-dark-removebg-preview.png"
                        alt="Anvil Strength Logo"
                        className="h-24 md:h-32 lg:h-40 w-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                    />
                </motion.div>

                {/* Main Heading */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.8 }}
                    className="mb-12"
                >
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-black uppercase italic tracking-tighter mb-2">
                        SOMOS <span className="text-anvil-red">ANVIL</span>
                    </h1>
                    <p className="text-lg md:text-2xl text-gray-400 font-bold uppercase tracking-[0.2em]">
                        La forja se abre en:
                    </p>
                </motion.div>

                {/* Counter */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 w-full max-w-4xl mb-16">
                    {timeUnits.map((item, index) => (
                        <motion.div
                            key={item.label}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 + (index * 0.1), duration: 0.6 }}
                            className="flex flex-col items-center p-4 md:p-6 bg-white/5 border border-white/5 rounded-xl backdrop-blur-sm group hover:border-anvil-red/30 transition-all duration-300"
                        >
                            <span className="text-4xl md:text-7xl font-black text-white group-hover:text-anvil-red transition-colors duration-300 tabular-nums leading-none">
                                {item.value.toString().padStart(2, '0')}
                            </span>
                            <span className="text-xs md:text-sm font-bold text-gray-500 mt-2 tracking-widest uppercase">
                                {item.label}
                            </span>
                        </motion.div>
                    ))}
                </div>

                {/* Footer / Socials */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 1 }}
                    className="flex flex-col items-center gap-6"
                >
                    <p className="text-white/30 text-xs font-bold uppercase tracking-widest">
                        Síguenos para no perderte el lanzamiento
                    </p>
                    <div className="flex items-center gap-6">
                        <a
                            href="https://instagram.com/anvilstrength"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 bg-white/5 rounded-full text-white/70 hover:text-white hover:bg-anvil-red/20 hover:scale-110 transition-all duration-300"
                        >
                            <Instagram size={24} />
                        </a>
                        <a
                            href="mailto:info@anvilstrength.com"
                            className="p-3 bg-white/5 rounded-full text-white/70 hover:text-white hover:bg-anvil-red/20 hover:scale-110 transition-all duration-300"
                        >
                            <Mail size={24} />
                        </a>
                    </div>
                </motion.div>
            </div>

            {/* Bottom Gradient Line */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-anvil-red to-transparent opacity-50" />
        </div>
    );
}
