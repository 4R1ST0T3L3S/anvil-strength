import React from 'react';
import { motion } from 'framer-motion';
import { ChatMessage } from '../../../types/database';

export const ChatBubble: React.FC<{ message: ChatMessage; isOwn: boolean }> = ({ message, isOwn }) => {
    return (
        <motion.div
            initial={{ opacity: 0, x: isOwn ? 20 : -20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4`}
        >
            <div className={`max-w-[80%] md:max-w-[70%] p-4 rounded-[1.5rem] relative ${
                isOwn 
                ? 'bg-anvil-red text-white rounded-br-none shadow-[0_4px_20px_rgba(220,38,38,0.2)]' 
                : 'bg-[#0a0a0a] text-gray-200 border border-white/5 rounded-bl-none shadow-xl'
            }`}>
                <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">
                    {message.content}
                </p>
                <div className={`text-[8px] font-black uppercase tracking-widest mt-2 opacity-50 ${isOwn ? 'text-right' : 'text-left'}`}>
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isOwn && message.is_read && <span className="ml-2">✓✓</span>}
                </div>
            </div>
        </motion.div>
    );
};

// ChatInput.tsx
import { Send, Image as ImageIcon } from 'lucide-react';

export const ChatInput: React.FC<{ onSend: (val: string) => void }> = ({ onSend }) => {
    const [text, setText] = React.useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (text.trim()) {
            onSend(text);
            setText('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 bg-black/40 backdrop-blur-xl border-t border-white/5 flex items-center gap-3">
            <button type="button" className="p-3 text-gray-500 hover:text-white transition-colors">
                <ImageIcon size={20} />
            </button>
            <input 
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold text-white outline-none focus:border-anvil-red/50 transition-all placeholder:text-gray-600"
            />
            <button 
                type="submit"
                disabled={!text.trim()}
                className="p-4 bg-anvil-red text-white rounded-2xl hover:bg-red-500 transition-all shadow-lg shadow-red-900/20 disabled:opacity-50 disabled:grayscale"
            >
                <Send size={20} />
            </button>
        </form>
    );
};
