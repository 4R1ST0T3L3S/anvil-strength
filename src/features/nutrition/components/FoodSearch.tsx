import { useState } from 'react';
import { Search, Check, Star, X } from 'lucide-react';
import { useSearchFoodItems } from '../../../hooks/useNutrition';
import { FoodItem } from '../../../types/nutrition';

interface FoodSearchProps {
    onAddFood: (food: FoodItem, grams: number) => void;
    onClose: () => void;
    referenceFood?: FoodItem;
}

export function FoodSearch({ onAddFood, onClose, referenceFood }: FoodSearchProps) {
    const [query, setQuery] = useState('');
    const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
    const [grams, setGrams] = useState<number>(100);
    
    /**
     * Las marcas favoritas se leen AL INICIALIZAR el estado, no en un efecto.
     *
     * Con el efecto: primer render con la lista vacía, efecto, segundo render
     * con la lista. Se veía el hueco de las marcas parpadear en cada apertura.
     * Con el inicializador perezoso —la función que se le pasa a useState— la
     * lectura ocurre UNA vez, antes del primer pintado.
     *
     * El `try` se queda y ahora explica por qué: si alguien manoseó el
     * almacenamiento del navegador, la aplicación arranca sin marcas en vez
     * de romperse.
     */
    const [favoriteBrands, setFavoriteBrands] = useState<string[]>(() => {
        try {
            const guardadas = localStorage.getItem('anvil_favorite_brands');
            return guardadas ? JSON.parse(guardadas) : [];
        } catch {
            return [];
        }
    });
    const [isEditingBrands, setIsEditingBrands] = useState(false);
    const [newBrand, setNewBrand] = useState('');

    const saveBrands = (brands: string[]) => {
        setFavoriteBrands(brands);
        localStorage.setItem('anvil_favorite_brands', JSON.stringify(brands));
    };

    const addBrand = () => {
        if (newBrand.trim() && !favoriteBrands.includes(newBrand.trim())) {
            saveBrands([...favoriteBrands, newBrand.trim()]);
            setNewBrand('');
        }
    };

    const removeBrand = (b: string) => {
        saveBrands(favoriteBrands.filter(brand => brand !== b));
    };

    const { data: results, isLoading } = useSearchFoodItems(query, favoriteBrands, referenceFood);

    const handleAdd = () => {
        if (selectedFood && grams > 0) {
            onAddFood(selectedFood, grams);
            setSelectedFood(null);
            setQuery('');
            onClose();
        }
    };

    return (
        <div className="bg-surface-sunken border border-line rounded-xl p-4 w-full flex flex-col gap-4 max-h-[500px]">
            {/* Smart Search Indicator */}
            {referenceFood && (
                <div className="bg-success-quiet border border-green-500/30 rounded-lg p-3 flex items-center gap-3">
                    <span className="text-success text-xs font-bold uppercase">🔍 Buscando alternativas a:</span>
                    <span className="text-ink text-sm font-medium">{referenceFood.product_name}</span>
                    <span className="text-xs text-ink-muted ml-auto">{referenceFood['energy-kcal_100g']} kcal/100g</span>
                </div>
            )}
            {/* Header / Search Input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={18} />
                <input
                    type="text"
                    placeholder="Buscar alimento (ej. Pollo, Arroz...)"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSelectedFood(null);
                    }}
                    autoFocus
                    className="w-full bg-[#111111] text-ink pl-10 pr-12 py-3 rounded-lg border border-line focus:border-brand focus:ring-1 focus:ring-brand transition-[border-color,box-shadow]"
                />
                <button 
                    onClick={() => setIsEditingBrands(!isEditingBrands)}
                    title="Marcas Favoritas"
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors ${isEditingBrands || favoriteBrands.length > 0 ? 'text-warning bg-warning-quiet' : 'text-ink-subtle hover:text-ink'}`}
                >
                    <Star size={18} fill={favoriteBrands.length > 0 ? "currentColor" : "none"} />
                </button>
            </div>

            {/* Favorite Brands Manager */}
            {isEditingBrands && (
                <div className="bg-[#111111] border border-line rounded-lg p-3 animate-fade">
                    <p className="text-xs text-ink-muted mb-2 font-bold uppercase flex items-center gap-1">
                        <Star size={12} /> Marcas Prioritarias
                    </p>
                    <div className="flex gap-2 mb-2">
                        <input
                            type="text"
                            value={newBrand}
                            onChange={(e) => setNewBrand(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addBrand()}
                            placeholder="Ej. Hacendado, Prozis..."
                            className="flex-1 bg-surface-canvas text-sm text-ink px-3 py-1.5 rounded border border-line focus:border-brand"
                        />
                        <button onClick={addBrand} className="bg-surface-raised hover:bg-surface-overlay text-ink px-3 rounded text-sm transition-colors">
                            Añadir
                        </button>
                    </div>
                    {favoriteBrands.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {favoriteBrands.map((brand, idx) => (
                                <span key={idx} className="bg-warning-quiet text-warning border border-warning/20 text-xs px-2 py-1 rounded flex items-center gap-1">
                                    {brand}
                                    <button onClick={() => removeBrand(brand)} className="hover:text-ink"><X size={12} /></button>
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-zinc-600 italic">No hay marcas fijadas. Las marcas que añadas saldrán primero en la búsqueda.</p>
                    )}
                </div>
            )}

            {/* Results List */}
            {!selectedFood && (
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {isLoading && query.length > 2 && (
                        <div className="text-center py-4 text-ink-subtle flex justify-center">
                            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                    
                    {!isLoading && query.length > 2 && results?.length === 0 && (
                        <div className="text-center py-4 text-ink-subtle">
                            No se encontraron alimentos
                        </div>
                    )}

                    {results?.map((food) => (
                        <button
                            key={food.code}
                            onClick={() => setSelectedFood(food)}
                            className="w-full text-left bg-[#111111] hover:bg-surface-raised border border-line hover:border-brand/50 rounded-lg p-3 transition-colors flex justify-between items-center group"
                        >
                            <div>
                                <h4 className="text-ink font-medium group-hover:text-brand-text transition-colors">{food.product_name}</h4>
                                {food.brands && <p className="text-xs text-ink-subtle">{food.brands}</p>}
                            </div>
                            <div className="text-right text-xs text-ink-muted">
                                <span className="block">{food['energy-kcal_100g']} kcal</span>
                                <span className="flex gap-2">
                                    <span className="text-info">{food.proteins_100g}g P</span>
                                    <span className="text-warning">{food.carbohydrates_100g}g HC</span>
                                    <span className="text-orange-400">{food.fat_100g}g G</span>
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Add Grams Form */}
            {selectedFood && (
                <div className="animate-fade bg-[#111111] p-4 rounded-lg border border-brand/30">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-lg font-bold text-ink">{selectedFood.product_name}</h3>
                            {selectedFood.brands && <p className="text-sm text-ink-subtle">{selectedFood.brands}</p>}
                        </div>
                        <button 
                            onClick={() => setSelectedFood(null)}
                            className="text-xs text-ink-subtle hover:text-ink underline"
                        >
                            Cambiar
                        </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                        <div className="bg-surface-canvas p-2 rounded">
                            <span className="block text-xs text-ink-subtle uppercase">Kcal</span>
                            <span className="font-bold text-ink">{Math.round(selectedFood['energy-kcal_100g'] * (grams / 100))}</span>
                        </div>
                        <div className="bg-surface-canvas p-2 rounded border-b-2 border-blue-500">
                            <span className="block text-xs text-ink-subtle uppercase">Prot</span>
                            <span className="font-bold text-ink">{Math.round(selectedFood.proteins_100g * (grams / 100))}g</span>
                        </div>
                        <div className="bg-surface-canvas p-2 rounded border-b-2 border-yellow-500">
                            <span className="block text-xs text-ink-subtle uppercase">Carb</span>
                            <span className="font-bold text-ink">{Math.round(selectedFood.carbohydrates_100g * (grams / 100))}g</span>
                        </div>
                        <div className="bg-surface-canvas p-2 rounded border-b-2 border-orange-500">
                            <span className="block text-xs text-ink-subtle uppercase">Grasa</span>
                            <span className="font-bold text-ink">{Math.round(selectedFood.fat_100g * (grams / 100))}g</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                        <span className="text-xs text-ink-subtle self-center">Rápido:</span>
                        {[50, 100, 150, 200].map(g => (
                            <button key={g} onClick={() => setGrams(g)}
                                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${grams === g ? 'bg-brand text-black' : 'bg-surface-raised text-ink hover:bg-surface-overlay'}`}>
                                {g}g
                            </button>
                        ))}
                        <button onClick={() => setGrams(150)}
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors border ${grams === 150 ? 'bg-pink-500/20 text-pink-400 border-pink-500/40' : 'bg-surface-raised text-ink border-strong hover:border-pink-500/40'}`}>
                            🍎 1 pieza
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <input
                                type="number"
                            inputMode="decimal"
                                min="1"
                                value={grams || ''}
                                onChange={(e) => setGrams(parseInt(e.target.value) || 0)}
                                className="w-full bg-surface-canvas text-ink font-bold text-lg px-4 py-3 rounded-lg border border-strong focus:border-brand text-center"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-subtle">gramos</span>
                        </div>
                        <button
                            onClick={handleAdd}
                            disabled={grams <= 0}
                            className="bg-brand hover:bg-red-600 text-black font-black px-6 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Check size={20} />
                            AÑADIR
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
