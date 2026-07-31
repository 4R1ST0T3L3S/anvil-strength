import React from 'react';
import { useAnvilPoints } from '../hooks/useAnvilPoints';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins } from 'lucide-react';

interface AnvilPointsBadgeProps {
    userId: string | undefined;
    className?: string;
}

export const AnvilPointsBadge: React.FC<AnvilPointsBadgeProps> = ({ userId, className = "" }) => {
    const { data: points, isLoading } = useAnvilPoints(userId);

    if (isLoading) {
        return (
            <div className={`h-10 w-24 bg-white/5 animate-pulse rounded-full border border-white/10 ${className}`}></div>
        );
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={points?.balance ?? 0}
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className={`group relative flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)] hover:border-yellow-500/50 transition-all duration-300 ${className}`}
            >
                {/* Glow effect on hover */}
                <div className="absolute inset-0 bg-yellow-500/5 rounded-full opacity-0 group-hover:opacity-100 blur-md transition-opacity"></div>
                
                <div className="relative flex items-center justify-center w-6 h-6 bg-yellow-500/10 rounded-full text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                    <Coins size={14} className="group-hover:rotate-12 transition-transform" />
                </div>
                
                <div className="relative flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 leading-none mb-0.5">Anvil Points</span>
                    <span className="text-sm font-black text-white leading-none tracking-tight">
                        {points?.balance?.toLocaleString() ?? 0}
                    </span>
                </div>

                {/* Particle effect on value change could be added here in the future */}
            </motion.div>
        </AnimatePresence>
    );
};
