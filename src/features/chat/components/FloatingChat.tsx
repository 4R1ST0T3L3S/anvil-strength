import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { AthleteChatView } from '../pages/AthleteChatView';
import { UserProfile } from '../../../hooks/useUser';

interface FloatingChatProps {
    isOpen: boolean;
    onClose: () => void;
    athlete: {
        id: string;
        full_name: string;
        avatar_url?: string;
    } | null;
    coach: UserProfile;
}

export function FloatingChat({ isOpen, onClose, athlete, coach }: FloatingChatProps) {
    const [width, setWidth] = useState(400);
    const [isResizing, setIsResizing] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 320 && newWidth < 800) {
                setWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    if (!isOpen || !athlete) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: isMinimized ? 'calc(100% - 60px)' : 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                style={{ width: isMinimized ? 60 : width }}
                className="fixed top-0 right-0 h-full bg-[#111111] border-l border-white/10 z-[1000] shadow-2xl flex flex-col overflow-hidden"
            >
                {/* Resize Handle */}
                {!isMinimized && (
                    <div
                        onMouseDown={() => setIsResizing(true)}
                        className="absolute left-0 top-0 w-1 h-full cursor-ew-resize hover:bg-anvil-red transition-colors z-50"
                    />
                )}

                {/* Header */}
                <div className="p-4 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="relative">
                            {athlete.avatar_url ? (
                                <img src={athlete.avatar_url} alt={athlete.full_name} className="w-10 h-10 rounded-full object-cover border border-white/10" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-anvil-red flex items-center justify-center text-white font-black">
                                    {athlete.full_name[0]}
                                </div>
                            )}
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0a0a0a]"></div>
                        </div>
                        {!isMinimized && (
                            <div className="flex flex-col truncate">
                                <h3 className="text-white font-black text-sm uppercase italic truncate">{athlete.full_name}</h3>
                                <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">En línea</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setIsMinimized(!isMinimized)}
                            className="p-2 text-zinc-500 hover:text-white transition-colors"
                        >
                            {isMinimized ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
                        </button>
                        <button 
                            onClick={onClose}
                            className="p-2 text-zinc-500 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Chat Body */}
                {!isMinimized && (
                    <div className="flex-1 overflow-hidden relative">
                        <AthleteChatView 
                            user={{
                                ...coach,
                                coach_id: athlete.id,
                                coach_name: athlete.full_name
                            }} 
                        />
                    </div>
                )}

                {/* Minimized Vertical Label */}
                {isMinimized && (
                    <div className="flex-1 flex items-center justify-center">
                        <span 
                            className="whitespace-nowrap font-black uppercase text-xs tracking-[0.3em] text-zinc-600 -rotate-90"
                            style={{ width: 'max-content' }}
                        >
                            CHAT CON {athlete.full_name.split(' ')[0]}
                        </span>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}
