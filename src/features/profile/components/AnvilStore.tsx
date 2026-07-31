import React from 'react';
import { ShoppingBag, Star, Shirt, Zap, Crown, Lock } from 'lucide-react';
import { useAnvilPoints } from '../hooks/useAnvilPoints';

interface AnvilStoreProps {
    userId: string;
}

const STORE_ITEMS = [
    {
        id: 'merch_discount',
        title: 'Descuento 15% Merch',
        description: 'Válido para la próxima colección de Anvil Strength.',
        cost: 2000,
        icon: <Shirt className="text-anvil-red" size={24} />,
        available: true
    },
    {
        id: 'premium_badge',
        title: 'Insignia de Élite',
        description: 'Muestra un borde dorado y fuego en tu perfil del ranking.',
        cost: 5000,
        icon: <Crown className="text-yellow-500" size={24} />,
        available: true
    },
    {
        id: 'early_access',
        title: 'Acceso Anticipado',
        description: 'Mira las nuevas rutinas y videos antes que nadie.',
        cost: 1000,
        icon: <Zap className="text-blue-400" size={24} />,
        available: false
    },
    {
        id: 'custom_banner',
        title: 'Banner Personalizado',
        description: 'Sube tu propia imagen de fondo para tu perfil.',
        cost: 3000,
        icon: <Star className="text-purple-500" size={24} />,
        available: false
    }
];

export const AnvilStore: React.FC<AnvilStoreProps> = ({ userId }) => {
    const { data: points } = useAnvilPoints(userId);
    const balance = points?.balance || 0;

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-2">
                        Anvil <span className="text-anvil-red">Store</span>
                    </h2>
                    <p className="text-gray-400 text-sm font-bold uppercase tracking-widest">
                        Gasta tus monedas en equipamiento y ventajas exclusivas
                    </p>
                </div>
                <div className="bg-black/40 border border-yellow-500/30 px-6 py-3 rounded-2xl flex items-center gap-3">
                    <Star className="text-yellow-500 fill-yellow-500" size={20} />
                    <div className="text-right">
                        <p className="text-[10px] font-black text-yellow-500/60 uppercase tracking-widest leading-none mb-1">Tu Balance</p>
                        <p className="text-xl font-black text-white leading-none">{balance.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {STORE_ITEMS.map((item) => {
                    const canAfford = balance >= item.cost;
                    
                    return (
                        <div 
                            key={item.id}
                            className={`relative group bg-[#0a0a0a] border rounded-3xl p-6 transition-all ${
                                item.available 
                                ? 'border-white/5 hover:border-anvil-red/30 cursor-pointer' 
                                : 'border-white/5 opacity-60 grayscale cursor-not-allowed'
                            }`}
                        >
                            <div className="flex gap-6">
                                <div className="shrink-0 w-16 h-16 bg-black/40 rounded-2xl flex items-center justify-center shadow-xl border border-white/5 group-hover:scale-110 transition-transform">
                                    {item.icon}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-black uppercase italic text-lg">{item.title}</h3>
                                        {!item.available && (
                                            <div className="flex items-center gap-1 text-[10px] font-black text-gray-500 bg-white/5 px-2 py-1 rounded-full">
                                                <Lock size={10} /> PRÓXIMAMENTE
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-gray-400 text-sm leading-snug mb-4">{item.description}</p>
                                    
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center font-black text-black text-[10px]">A</div>
                                            <span className={`font-black ${canAfford ? 'text-white' : 'text-anvil-red'}`}>
                                                {item.cost.toLocaleString()}
                                            </span>
                                        </div>
                                        
                                        {item.available && (
                                            <button 
                                                disabled={!canAfford}
                                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                                    canAfford 
                                                    ? 'bg-anvil-red text-white hover:bg-red-700 shadow-lg shadow-red-900/20' 
                                                    : 'bg-white/5 text-gray-500'
                                                }`}
                                            >
                                                {canAfford ? 'Canjear' : 'Faltan Monedas'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-3xl flex items-center gap-6">
                <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center shrink-0">
                    <ShoppingBag className="text-blue-400" size={24} />
                </div>
                <div>
                    <h4 className="font-black uppercase italic text-white">¿Tienes un código de regalo?</h4>
                    <p className="text-blue-400/80 text-sm font-medium">Canjea tus cupones del club para obtener monedas extra al instante.</p>
                </div>
                <button className="ml-auto px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-xl transition-all">
                    Canjear Código
                </button>
            </div>
        </div>
    );
};
