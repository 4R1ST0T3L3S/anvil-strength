import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins, TrendingUp, AlertTriangle } from 'lucide-react';
import { ArenaBet, ArenaOption } from '../../../types/database';

interface ArenaBettingModalProps {
    isOpen: boolean;
    onClose: () => void;
    bet: ArenaBet | null;
    option: ArenaOption | null;
    balance: number;
    onConfirm: (amount: number, predictionValue?: number) => Promise<void>;
    onAddToSlip?: (bet: ArenaBet, option: ArenaOption | null) => void;
}

export const ArenaBettingModal: React.FC<ArenaBettingModalProps> = ({ 
    isOpen, 
    onClose, 
    bet, 
    option, 
    balance,
    onConfirm,
    onAddToSlip
}) => {
    const [amount, setAmount] = useState<number>(100);
    const [predictionValue, setPredictionValue] = useState<string>('');
    const [loading, setLoading] = useState(false);

    if (!bet || (!option && bet.type !== 'prediction')) return null;

    const handleConfirm = async () => {
        if (amount <= 0 || amount > balance) return;
        if (bet.type === 'prediction' && (predictionValue === '' || isNaN(parseFloat(predictionValue)))) return;
        
        setLoading(true);
        try {
            await onConfirm(amount, bet.type === 'prediction' ? parseFloat(predictionValue) : undefined);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        {/* Header */}
                        <div className="p-8 border-b border-white/5 relative">
                            <button 
                                onClick={onClose}
                                className="absolute top-8 right-8 text-gray-500 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                            <h2 className="text-2xl font-black uppercase italic text-yellow-500 tracking-tighter">
                                Tu Apuesta
                            </h2>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                                LA ARENA - ANVIL STRENGTH
                            </p>
                        </div>

                        {/* Content */}
                        <div className="p-8 space-y-6">
                            <div className="bg-black/40 border border-white/5 rounded-2xl p-6">
                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block mb-2 text-center">
                                    {bet.type === 'prediction' ? 'ESTÁS PREDICIENDO UN VALOR' : 'ESTÁS APOSTANDO POR'}
                                </span>
                                {bet.type === 'prediction' ? (
                                    <div className="relative">
                                        <input 
                                            type="number"
                                            step="any"
                                            placeholder="TU VALOR (EJ: 102.5)"
                                            className="w-full bg-black border border-white/10 p-4 rounded-xl font-black text-xl text-white text-center outline-none focus:border-yellow-500/50 transition-colors"
                                            value={predictionValue}
                                            onChange={(e) => setPredictionValue(e.target.value)}
                                        />
                                    </div>
                                ) : (
                                    <h3 className="text-xl font-black text-white uppercase italic text-center">
                                        {option?.name}
                                    </h3>
                                )}
                                <p className="text-[10px] font-bold text-anvil-red uppercase tracking-[0.2em] text-center mt-2">
                                    {bet.title}
                                </p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-end px-2">
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">CANTIDAD A APOSTAR</span>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SALDO: {balance.toLocaleString()} AC</span>
                                </div>
                                <div className="relative">
                                    <Coins size={24} className="absolute left-5 top-1/2 -translate-y-1/2 text-yellow-500" />
                                    <input 
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-full bg-black border border-white/10 p-5 pl-14 rounded-2xl font-black text-2xl text-white outline-none focus:border-yellow-500/50 transition-colors"
                                    />
                                    <span className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-yellow-500 italic">AC</span>
                                </div>
                            </div>

                            {amount > balance && (
                                <div className="flex items-center gap-2 text-anvil-red bg-anvil-red/10 p-3 rounded-xl border border-anvil-red/20">
                                    <AlertTriangle size={16} />
                                    <span className="text-[10px] font-bold uppercase">Saldo insuficiente para esta apuesta</span>
                                </div>
                            )}

                            <div className="flex gap-4 p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-2xl">
                                <TrendingUp size={20} className="text-yellow-500 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-black text-white uppercase italic mb-1">Reparto Proporcional</p>
                                    <p className="text-[9px] font-bold text-gray-500 uppercase leading-tight tracking-wider">
                                        Si ganas, recibirás una parte del bote total proporcional a tu apuesta.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-8 pt-0 space-y-3">
                            <button
                                onClick={handleConfirm}
                                disabled={loading || amount <= 0 || amount > balance}
                                className="w-full py-5 bg-yellow-500 text-black font-black uppercase italic rounded-2xl hover:bg-yellow-400 transition-all shadow-xl shadow-yellow-900/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
                            >
                                {loading ? 'PROCESANDO...' : 'CONFIRMAR APUESTA'}
                            </button>
                            
                            {onAddToSlip && (
                                <button
                                    onClick={() => onAddToSlip(bet, option)}
                                    className="w-full py-4 bg-white/5 text-gray-400 hover:text-white font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all border border-white/5 hover:border-white/10"
                                >
                                    O AÑADIR AL BOLETO (COMBINADA)
                                </button>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
