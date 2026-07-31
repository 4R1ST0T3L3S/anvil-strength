import React, { useState } from 'react';
import { Plus, X, Trash2, Swords, Users, HelpCircle, TrendingUp } from 'lucide-react';
import { ArenaBet, ArenaOption, BetType } from '../../../types/database';

interface ArenaAdminPanelProps {
    onCreateBet: (bet: Partial<ArenaBet>, options: string[]) => Promise<void>;
    onResolveBet: (betId: string, winningOptionId?: string, targetValue?: number) => Promise<void>;
    onDeleteBet: (betId: string) => Promise<void>;
    bets: (ArenaBet & { options: ArenaOption[] })[];
}

export const ArenaAdminPanel: React.FC<ArenaAdminPanelProps> = ({ 
    onCreateBet, 
    onResolveBet, 
    onDeleteBet,
    bets
}) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newBet, setNewBet] = useState({
        title: '',
        description: '',
        type: '1vs1' as BetType,
        options: ['', '']
    });

    const handleAddOption = () => {
        setNewBet({ ...newBet, options: [...newBet.options, ''] });
    };

    const handleRemoveOption = (index: number) => {
        const newOptions = newBet.options.filter((_, i) => i !== index);
        setNewBet({ ...newBet, options: newOptions });
    };

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...newBet.options];
        newOptions[index] = value;
        setNewBet({ ...newBet, options: newOptions });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onCreateBet(
            { title: newBet.title, description: newBet.description, type: newBet.type },
            newBet.type === 'prediction' ? [] : newBet.options.filter(o => o.trim() !== '')
        );
        setIsCreateModalOpen(false);
        setNewBet({ title: '', description: '', type: '1vs1', options: ['', ''] });
    };

    const handleResolve = (betId: string, optionId?: string) => {
        const bet = bets.find(b => b.id === betId);
        if (bet?.type === 'prediction') {
            const val = prompt('Indica el valor real del evento (ej: 102.5):');
            if (val !== null) {
                onResolveBet(betId, undefined, parseFloat(val));
            }
        } else if (optionId) {
            onResolveBet(betId, optionId);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-anvil-red/10 border border-anvil-red/20 p-6 rounded-3xl">
                <div>
                    <h3 className="text-xl font-black uppercase italic text-white leading-none mb-2">Panel de Control Arena</h3>
                    <p className="text-[10px] font-bold text-anvil-red uppercase tracking-widest">Solo visible para Marc (Developer)</p>
                </div>
                <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="p-4 bg-anvil-red text-white rounded-2xl hover:bg-red-500 transition-colors shadow-lg shadow-red-900/40"
                >
                    <Plus size={24} />
                </button>
            </div>

            {/* Create Bet Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/98 backdrop-blur-xl">
                    <div className="bg-[#0a0a0a] border border-white/10 p-10 rounded-[3rem] w-full max-w-lg relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <button onClick={() => setIsCreateModalOpen(false)} className="absolute top-10 right-10 text-gray-500 hover:text-white"><X /></button>
                        
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <h2 className="text-3xl font-black uppercase italic text-anvil-red mb-8">Nueva Apuesta</h2>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {(['1vs1', 'pool', 'event', 'prediction'] as BetType[]).map(type => (
                                    <button 
                                        key={type}
                                        type="button"
                                        onClick={() => setNewBet({ ...newBet, type })}
                                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                                            newBet.type === type ? 'border-anvil-red bg-anvil-red/10 text-white' : 'border-white/5 bg-black/40 text-gray-500'
                                        }`}
                                    >
                                        {type === '1vs1' ? <Swords size={18} /> : type === 'pool' ? <Users size={18} /> : type === 'event' ? <HelpCircle size={18} /> : <TrendingUp size={18} />}
                                        <span className="text-[8px] font-black uppercase tracking-widest">{type}</span>
                                    </button>
                                ))}
                            </div>

                            <input 
                                required
                                placeholder="TÍTULO (EJ: ¿QUIÉN HARÁ MÁS TOTAL?)"
                                className="w-full bg-black border border-white/10 p-4 rounded-xl outline-none font-bold uppercase text-xs focus:border-anvil-red/50"
                                value={newBet.title}
                                onChange={e => setNewBet({ ...newBet, title: e.target.value })}
                            />

                            <textarea 
                                placeholder="DESCRIPCIÓN (OPCIONAL)"
                                className="w-full bg-black border border-white/10 p-4 rounded-xl outline-none font-bold uppercase text-xs focus:border-anvil-red/50 min-h-[100px]"
                                value={newBet.description}
                                onChange={e => setNewBet({ ...newBet, description: e.target.value })}
                            />

                            {newBet.type !== 'prediction' && (
                                <div className="space-y-3">
                                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">OPCIONES</span>
                                    {newBet.options.map((opt, i) => (
                                        <div key={i} className="relative flex items-center gap-2">
                                            <input 
                                                required
                                                placeholder={`OPCIÓN ${i + 1}`}
                                                className="flex-1 bg-black border border-white/10 p-4 rounded-xl outline-none font-bold uppercase text-xs focus:border-anvil-red/50"
                                                value={opt}
                                                onChange={e => handleOptionChange(i, e.target.value)}
                                            />
                                            {newBet.options.length > 2 && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => handleRemoveOption(i)}
                                                    className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button 
                                        type="button"
                                        onClick={handleAddOption}
                                        className="w-full py-3 border border-dashed border-white/10 rounded-xl text-gray-500 hover:text-white hover:border-white/20 transition-all font-black text-[10px] uppercase tracking-widest"
                                    >
                                        + AÑADIR OPCIÓN
                                    </button>
                                </div>
                            )}

                            {newBet.type === 'prediction' && (
                                <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl">
                                    <p className="text-[10px] font-black text-yellow-500 uppercase italic mb-2 flex items-center gap-2">
                                        <TrendingUp size={14} /> Modo Predicción Numérica
                                    </p>
                                    <p className="text-[9px] font-bold text-gray-500 uppercase leading-tight tracking-wider">
                                        Los usuarios podrán indicar cualquier número. El bote se repartirá proporcionalmente a la cercanía con el resultado final.
                                    </p>
                                </div>
                            )}

                            <button type="submit" className="w-full py-5 bg-anvil-red text-white font-black uppercase italic rounded-2xl hover:bg-red-500 shadow-xl shadow-red-900/20">
                                LANZAR APUESTA
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* List of active bets for resolution */}
            <div className="space-y-4">
                {bets.filter(b => b.status === 'open' || b.status === 'locked').map(bet => (
                    <div key={bet.id} className="bg-black/40 border border-white/5 p-6 rounded-2xl flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <h4 className="font-black text-white uppercase italic truncate text-sm">{bet.title}</h4>
                            <div className="flex gap-2 mt-2 overflow-x-auto pb-2 scrollbar-hide">
                                {bet.type === 'prediction' ? (
                                    <button 
                                        onClick={() => handleResolve(bet.id)}
                                        className="px-4 py-2 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-full text-[8px] font-black uppercase hover:bg-yellow-500 hover:text-black transition-all"
                                    >
                                        Resolver con Valor Real
                                    </button>
                                ) : (
                                    bet.options?.map(opt => (
                                        <button 
                                            key={opt.id}
                                            onClick={() => handleResolve(bet.id, opt.id)}
                                            className="px-3 py-1 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full text-[8px] font-black uppercase hover:bg-green-500 hover:text-black transition-all whitespace-nowrap"
                                        >
                                            Resolver: {opt.name}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => onDeleteBet(bet.id)}
                                className="p-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
