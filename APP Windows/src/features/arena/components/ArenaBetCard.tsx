import React from 'react';
import { m } from 'framer-motion';
import { Swords, Users, HelpCircle, Trophy, TrendingUp, Plus } from 'lucide-react';
import { ArenaBet, ArenaOption } from '../../../types/database';

interface ArenaBetCardProps {
    bet: ArenaBet & { options: ArenaOption[] };
    onBetClick: (bet: ArenaBet, option: ArenaOption | null) => void;
    onAddToSlip?: (bet: ArenaBet, option: ArenaOption | null) => void;
}

export const ArenaBetCard: React.FC<ArenaBetCardProps> = ({ bet, onBetClick, onAddToSlip }) => {
    const totalPool = bet.options?.reduce((acc, opt) => acc + (opt.total_pool || 0), 0) || 0;

    const getIcon = () => {
        switch (bet.type) {
            case '1vs1': return <Swords size={20} />;
            case 'pool': return <Users size={20} />;
            case 'event': return <HelpCircle size={20} />;
            default: return <TrendingUp size={20} />;
        }
    };

    const getTypeLabel = () => {
        switch (bet.type) {
            case '1vs1': return 'Combate 1VS1';
            case 'pool': return 'Apuesta de Grupo';
            case 'event': return 'Evento Especial';
            default: return 'Apuesta';
        }
    };

    return (
        <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative bg-surface-sunken border border-subtle rounded-[2rem] overflow-hidden hover:border-brand/30 transition-colors duration-slow shadow-2xl"
        >
            {/* Header / Type Badge */}
            <div className="absolute z-10 flex items-center gap-2 top-6 left-6">
                <div className="bg-brand/10 rounded-lg text-brand-text border border-brand/20 shadow-[0_0_15px_rgba(220,38,38,0.2)] p-2">
                    {getIcon()}
                </div>
                <span className="text-t-2xs font-black uppercase tracking-[0.2em] text-ink-subtle bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-subtle">
                    {getTypeLabel()}
                </span>
            </div>

            {/* Main Content Area */}
            <div className="p-8 pt-28">
                <h3 className="font-black uppercase italic text-ink tracking-tighter mb-2 group-hover:text-brand-text transition-colors text-2xl">
                    {bet.title}
                </h3>
                {bet.description && (
                    <p className="text-ink-subtle font-bold uppercase tracking-widest mb-6 text-t-xs">
                        {bet.description}
                    </p>
                )}

                {/* Pool Display */}
                <div className="flex items-center gap-2 mb-8 bg-black/40 rounded-xl px-4 py-3 border border-subtle w-fit">
                    <TrendingUp size={14} className="text-warning" />
                    <span className="text-t-2xs font-black text-ink-subtle uppercase tracking-widest">Bote Total:</span>
                    <span className="text-sm font-black text-warning">{totalPool.toLocaleString()} AC</span>
                </div>

                {/* Options Grid or Prediction Button */}
                {bet.type === 'prediction' ? (
                    <button
                        onClick={() => bet.status === 'open' && onBetClick(bet, null)}
                        disabled={bet.status !== 'open'}
                        className={`w-full py-6 rounded-[2rem] border-2 border-dashed transition-[background-color,border-color,color,opacity] duration-slow flex flex-col items-center gap-2 ${
 bet.status === 'open'
 ? 'border-yellow-500/30 bg-yellow-500/5 hover:bg-warning-quiet hover:border-yellow-500/50 text-warning'
 : 'border-subtle bg-black/40 text-ink-subtle opacity-50 cursor-not-allowed'
 }`}
                    >
                        <TrendingUp size={24} />
                        <span className="text-sm font-black uppercase italic tracking-tighter">
                            {bet.status === 'open' ? 'REALIZAR PREDICCIÓN' : 'PREDICCIONES CERRADAS'}
                        </span>
                        
                        {bet.status === 'open' && onAddToSlip && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAddToSlip(bet, null);
                                }}
                                className="mt-4 p-2 bg-white/5 hover:bg-white/10 text-ink-muted hover:text-ink rounded-xl transition-colors border border-subtle flex items-center gap-2 text-t-2xs font-black uppercase tracking-widest"
                            >
                                <Plus size={14} /> Añadir al boleto
                            </button>
                        )}

                        {bet.status === 'resolved' && bet.target_value !== undefined && (
                            <div className="mt-2 bg-yellow-500 text-black px-4 py-1 rounded-full text-xs font-black">
                                RESULTADO: {bet.target_value}
                            </div>
                        )}
                    </button>
                ) : (
                    <div className={`grid gap-4 ${bet.type === '1vs1' ? 'grid-cols-2' : 'grid-cols-2'}`}>
                        {bet.options?.map((option, index) => {
                            const pct = totalPool > 0 ? (option.total_pool / totalPool) * 100 : 50;
                            const isWinner = bet.winner_option_id === option.id;

                            return (
                                <div
                                    key={option.id}
                                    className={`relative group/option p-5 rounded-2xl border transition-[background-color,border-color,opacity,transform] duration-slow overflow-hidden ${
 bet.status === 'open' 
 ? 'bg-white/5 border-line hover:bg-white/10 hover:scale-[1.02] active:scale-95' 
 : isWinner 
 ? 'bg-green-500/20 border-green-500/50 grayscale-0' 
 : 'bg-black/40 border-subtle opacity-50 grayscale'
 }`}
                                >
                                    {/* Percentage bar background */}
                                    <div 
                                        className={`absolute bottom-0 left-0 h-1 transition-colors duration-slow ${index === 0 ? 'bg-brand' : 'bg-blue-600'}`} 
                                        style={{ width: `${pct}%` }}
                                    />

                                    <div className="relative z-10 flex flex-col items-center text-center gap-2">
                                        {isWinner && <Trophy size={16} className="text-warning mb-1" />}
                                        <span className="text-xs font-black uppercase italic tracking-tight text-ink group-hover/option:text-brand-text transition-colors">
                                            {option.name}
                                        </span>
                                        <span className="text-lg font-black text-white/40 group-hover/option:text-ink transition-colors mb-2">
                                            {option.total_pool} <span className="text-t-2xs italic">AC</span>
                                        </span>
                                        
                                        <div className="flex gap-2 w-full">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onBetClick(bet, option);
                                                }}
                                                className="flex-1 py-3 px-4 bg-white/5 hover:bg-brand text-ink font-black text-t-2xs uppercase tracking-widest rounded-xl transition-colors border border-subtle hover:border-brand shadow-lg"
                                            >
                                                Apostar
                                            </button>
                                            {onAddToSlip && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onAddToSlip(bet, option);
                                                    }}
                                                    className="p-3 bg-white/5 hover:bg-white/10 text-ink-muted hover:text-ink rounded-xl transition-colors border border-subtle"
                                                    title="Añadir al boleto"
                                                >
                                                    <Plus size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {bet.status === 'open' && (
                                        <div className="absolute inset-0 bg-gradient-to-t from-brand/10 to-transparent opacity-0 group-hover/option:opacity-100 transition-opacity"></div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Status Footer */}
            <div className={`px-8 py-3 border-t border-subtle flex items-center justify-between ${
 bet.status === 'open' ? 'bg-brand/5' : 'bg-black/20'
 }`}>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
 bet.status === 'open' ? 'bg-brand animate-pulse' : 'bg-gray-600'
 }`} />
                    <span className="text-t-2xs font-black uppercase tracking-[0.3em] text-ink-subtle">
                        {bet.status === 'open' ? 'En Vivo / Abierta' : bet.status === 'resolved' ? 'Resuelta' : 'Cerrada'}
                    </span>
                </div>
                {bet.resolved_at && (
                    <span className="text-t-2xs font-black uppercase tracking-[0.3em] text-ink-muted">
                        {new Date(bet.resolved_at).toLocaleDateString()}
                    </span>
                )}
            </div>
        </m.div>
    );
};
