import React, { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X, Coins, TrendingUp, AlertTriangle } from 'lucide-react';
import { ArenaBet, ArenaOption } from '../../../types/database';

interface ArenaBettingModalProps {
    isOpen: boolean;
    onClose: () => void;
    bet: ArenaBet | null;
    option: ArenaOption | null;
    balance: number;
    onConfirm: (amount: number, predictionValue?: number) => Promise<void>;
    onAddToSlip?: (bet: ArenaBet, option: ArenaOption | null, predictionValue?: number) => void;
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
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
                    />

                    <m.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md bg-surface-sunken border border-line rounded-3xl sm:rounded-[2.5rem] overflow-hidden shadow-overlay max-h-[90dvh] flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-5 sm:p-8 border-b border-subtle relative shrink-0">
                            <button 
                                onClick={onClose}
                                className="absolute top-5 right-5 sm:top-8 sm:right-8 h-11 w-11 sm:h-auto sm:w-auto flex items-center justify-center text-ink-subtle hover:text-ink transition-colors"
                                aria-label="Cerrar"
                            >
                                <X size={24} />
                            </button>
                            <h2 className="text-2xl font-semibold text-warning tracking-tight">
                                Tu Apuesta
                            </h2>
                            <p className="text-t-2xs font-bold text-ink-subtle mt-1">
                                LA ARENA - ANVIL STRENGTH
                            </p>
                        </div>

                        {/* Content */}
                        <div className="p-5 sm:p-8 space-y-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                            <div className="bg-surface-sunken border border-subtle rounded-2xl p-6">
                                <span className="text-t-2xs font-semibold text-ink-subtle block mb-2 text-center">
                                    {bet.type === 'prediction' ? 'ESTÁS PREDICIENDO UN VALOR' : 'ESTÁS APOSTANDO POR'}
                                </span>
                                {bet.type === 'prediction' ? (
                                    <div className="relative">
                                        <input 
                                            type="number"
                            inputMode="decimal"
                                            step="any"
                                            placeholder="TU VALOR (EJ: 102.5)"
                                            className="w-full bg-black border border-line p-4 rounded-xl font-semibold text-xl text-ink text-center focus:border-yellow-500/50 transition-colors"
                                            value={predictionValue}
                                            onChange={(e) => setPredictionValue(e.target.value)}
                                        />
                                    </div>
                                ) : (
                                    <h3 className="text-xl font-semibold text-ink text-center">
                                        {option?.name}
                                    </h3>
                                )}
                                <p className="text-t-2xs font-bold text-brand-text text-center mt-2">
                                    {bet.title}
                                </p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-end px-2">
                                    <span className="text-t-2xs font-semibold text-ink-subtle">CANTIDAD A APOSTAR</span>
                                    <span className="text-t-2xs font-semibold text-ink-muted">SALDO: {balance.toLocaleString()} AC</span>
                                </div>
                                <div className="relative">
                                    <Coins size={24} className="absolute left-5 top-1/2 -translate-y-1/2 text-warning" />
                                    <input 
                                        type="number"
                            inputMode="decimal"
                                        value={amount}
                                        onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-full bg-black border border-line p-5 pl-14 rounded-2xl font-semibold text-2xl text-ink focus:border-yellow-500/50 transition-colors"
                                    />
                                    <span className="absolute right-5 top-1/2 -translate-y-1/2 font-semibold text-warning">AC</span>
                                </div>
                            </div>

                            {amount > balance && (
                                <div className="flex items-center gap-2 text-brand-text bg-brand/10 p-3 rounded-xl border border-brand/20">
                                    <AlertTriangle size={16} />
                                    <span className="text-t-2xs font-bold">Saldo insuficiente para esta apuesta</span>
                                </div>
                            )}

                            <div className="flex gap-4 p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-2xl">
                                <TrendingUp size={20} className="text-warning shrink-0" />
                                <div>
                                    <p className="text-t-2xs font-semibold text-ink mb-1">Reparto Proporcional</p>
                                    <p className="text-t-2xs font-bold text-ink-subtle leading-tight">
                                        Si ganas, recibirás una parte del bote total proporcional a tu apuesta.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-5 sm:p-8 pt-4 sm:pt-0 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(2rem+env(safe-area-inset-bottom,0px))] border-t border-subtle sm:border-t-0 bg-surface-sunken shrink-0 space-y-3">
                            <button
                                onClick={handleConfirm}
                                disabled={loading || amount <= 0 || amount > balance}
                                className="w-full py-5 bg-yellow-500 text-black font-semibold rounded-2xl hover:bg-yellow-400 transition-[background-color,opacity] shadow-xl shadow-yellow-900/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
                            >
                                {loading ? 'PROCESANDO...' : 'CONFIRMAR APUESTA'}
                            </button>
                            
                            {onAddToSlip && (
                                <button
                                    onClick={() => {
                                        const parsedPrediction = bet.type === 'prediction' && predictionValue.trim() !== '' ? Number(predictionValue) : undefined;
                                        if (bet.type === 'prediction' && (predictionValue.trim() === '' || Number.isNaN(parsedPrediction))) return;
                                        onAddToSlip(bet, option, parsedPrediction);
                                    }}
                                    disabled={bet.type === 'prediction' && (predictionValue.trim() === '' || Number.isNaN(Number(predictionValue)))}
                                    className="w-full py-4 bg-[var(--fill-muted)] text-ink-muted hover:text-ink font-semibold text-t-2xs rounded-2xl transition-colors border border-subtle hover:border-line disabled:opacity-50 disabled:cursor-not-allowed"

                                >
                                    O AÑADIR AL BOLETO (COMBINADA)
                                </button>
                            )}
                        </div>
                    </m.div>
                </div>
            )}
        </AnimatePresence>
    );
};
