import { useState } from 'react';
import { AlertTriangle, BadgeCheck, Search, Star, X } from 'lucide-react';
import { useSearchFoodItems } from '../../../hooks/useNutrition';
import { FoodItem } from '../../../types/nutrition';
import { Button } from '../../../components/ui/Button';
import { etiquetaDudosa, gramosEquivalentes, macrosDe, por100 } from '../../../lib/nutricion/macros';
import { COLOR_MACRO, LineaMacros, formatear } from './editor/comun';

/**
 * BUSCADOR DE ALIMENTOS
 * =====================================================================
 *
 * Dos fuentes, en este orden:
 *
 *   1. GENÉRICOS VERIFICADOS (BEDCA): "Arroz blanco, crudo", "Pollo,
 *      pechuga". Valores de tabla oficial. Llevan el sello de verificado.
 *   2. PRODUCTOS DE MARCA (Open Food Facts): etiquetas reales, pero escritas
 *      por voluntarios. Los que tienen unas calorías que no casan con sus
 *      macros llevan un aviso, y en los totales se usan las calculadas (ver
 *      lib/nutricion/macros.ts).
 *
 * Buscando una ALTERNATIVA, los resultados se ordenan por parecido en
 * macros y la cantidad sale ya calculada para que sea equivalente al
 * alimento que sustituye.
 */

interface FoodSearchProps {
    onAddFood: (food: FoodItem, grams: number) => void;
    onClose: () => void;
    /** Alimento al que se busca alternativa, con sus gramos y su hueco. */
    referenceFood?: FoodItem;
    referenceGrams?: number;
    category?: string;
}

const CLAVE_MARCAS = 'anvil_favorite_brands';

export function FoodSearch({ onAddFood, onClose, referenceFood, referenceGrams, category }: FoodSearchProps) {
    const [query, setQuery] = useState('');
    const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
    const [grams, setGrams] = useState<number>(100);

    /**
     * Las marcas favoritas se leen AL INICIALIZAR el estado, no en un efecto:
     * con el efecto se veía el hueco de las marcas parpadear en cada apertura.
     * El `try` está porque el almacenamiento del navegador puede venir roto o
     * bloqueado, y entonces se arranca sin marcas en vez de romperse.
     */
    const [favoriteBrands, setFavoriteBrands] = useState<string[]>(() => {
        try {
            const guardadas = localStorage.getItem(CLAVE_MARCAS);
            return guardadas ? JSON.parse(guardadas) : [];
        } catch {
            return [];
        }
    });
    const [isEditingBrands, setIsEditingBrands] = useState(false);
    const [newBrand, setNewBrand] = useState('');

    const saveBrands = (brands: string[]) => {
        setFavoriteBrands(brands);
        try { localStorage.setItem(CLAVE_MARCAS, JSON.stringify(brands)); } catch { /* modo privado */ }
    };
    const addBrand = () => {
        const b = newBrand.trim();
        if (b && !favoriteBrands.includes(b)) saveBrands([...favoriteBrands, b]);
        setNewBrand('');
    };

    const { data: results, isFetching } = useSearchFoodItems(query, favoriteBrands, referenceFood);

    const elegir = (food: FoodItem) => {
        setSelectedFood(food);
        // Alternativa: la cantidad equivalente; si no, 100 g.
        setGrams(referenceFood && referenceGrams ? gramosEquivalentes(referenceFood, referenceGrams, food, category) : 100);
    };

    const handleAdd = () => {
        if (selectedFood && grams > 0) {
            onAddFood(selectedFood, grams);
            setSelectedFood(null);
            setQuery('');
            onClose();
        }
    };

    const buscando = query.trim().length > 1;

    return (
        <div className="flex max-h-[min(70vh,560px)] w-full flex-col gap-3 rounded-card border border-[var(--border-default)] bg-surface-overlay p-3 md:p-4">
            {referenceFood && (
                <p className="rounded-field bg-[var(--success-quiet)] px-3 py-2 text-t-sm text-ink">
                    <span className="font-semibold text-success">Alternativa a </span>
                    {referenceFood.product_name}
                    {referenceGrams ? <span className="text-ink-subtle"> · {formatear(referenceGrams)} g</span> : null}
                    <span className="block text-t-xs text-ink-subtle">Salen primero los más parecidos en macros, y la cantidad ya viene calculada para que sea equivalente.</span>
                </p>
            )}

            {!selectedFood && (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={18} aria-hidden="true" />
                    <input
                        type="search"
                        placeholder="Buscar alimento: arroz, pechuga de pollo, avena…"
                        aria-label="Buscar alimento"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                        className="h-11 w-full rounded-field bg-[var(--fill-input)] pl-10 pr-24 text-t-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setIsEditingBrands((v) => !v)}
                            aria-label="Marcas favoritas"
                            aria-pressed={isEditingBrands}
                            className={`flex h-8 w-8 items-center justify-center rounded-field transition-colors duration-fast ease-snap ${favoriteBrands.length > 0 || isEditingBrands ? 'text-warning' : 'text-ink-subtle hover:text-ink'}`}
                        >
                            <Star size={16} fill={favoriteBrands.length > 0 ? 'currentColor' : 'none'} />
                        </button>
                        <button type="button" onClick={onClose} aria-label="Cerrar el buscador" className="flex h-8 w-8 items-center justify-center rounded-field text-ink-subtle hover:text-ink">
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {isEditingBrands && !selectedFood && (
                <div className="rounded-field bg-[var(--fill-muted)] p-3">
                    <p className="mb-2 text-t-xs font-semibold text-ink-muted">Marcas que salen primero</p>
                    <div className="mb-2 flex gap-2">
                        <input
                            type="text"
                            value={newBrand}
                            onChange={(e) => setNewBrand(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addBrand()}
                            placeholder="Hacendado, Prozis…"
                            className="h-9 flex-1 rounded-field bg-[var(--fill-input)] px-3 text-t-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        />
                        <Button size="sm" variant="secondary" onClick={addBrand}>Añadir</Button>
                    </div>
                    {favoriteBrands.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {favoriteBrands.map((brand) => (
                                <span key={brand} className="flex items-center gap-1 rounded-pill bg-[var(--warning-quiet)] px-2.5 py-1 text-t-xs text-warning">
                                    {brand}
                                    <button type="button" onClick={() => saveBrands(favoriteBrands.filter((b) => b !== brand))} aria-label={`Quitar ${brand}`} className="hover:text-ink">
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-t-xs text-ink-subtle">Sin marcas fijadas.</p>
                    )}
                </div>
            )}

            {/* RESULTADOS */}
            {!selectedFood && (
                <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
                    {!buscando && (
                        <p className="py-6 text-center text-t-sm text-ink-subtle">
                            Escribe al menos dos letras. Los alimentos con <BadgeCheck size={14} className="inline align-[-2px] text-success" aria-hidden="true" /> son genéricos verificados (BEDCA).
                        </p>
                    )}
                    {buscando && isFetching && !results && (
                        <p className="py-6 text-center text-t-sm text-ink-subtle">Buscando…</p>
                    )}
                    {buscando && results?.length === 0 && !isFetching && (
                        <p className="py-6 text-center text-t-sm text-ink-subtle">Nada con «{query.trim()}». Prueba con menos palabras.</p>
                    )}
                    <ul className="space-y-1">
                        {results?.map((food) => {
                            const m = por100(food);
                            const dudoso = etiquetaDudosa(food);
                            return (
                                <li key={food.code}>
                                    <button
                                        type="button"
                                        onClick={() => elegir(food)}
                                        className="flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-left transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)]"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                {food.is_generic && <BadgeCheck size={15} className="shrink-0 text-success" aria-label="Genérico verificado" />}
                                                <span className="truncate text-t-sm font-medium text-ink">{food.product_name}</span>
                                            </span>
                                            <span className="flex items-center gap-1.5 text-t-xs text-ink-subtle">
                                                {food.brands || food.food_group || (food.is_generic ? 'BEDCA' : '')}
                                                {dudoso && (
                                                    <span className="inline-flex items-center gap-0.5 text-warning">
                                                        <AlertTriangle size={11} aria-hidden="true" /> etiqueta dudosa
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right text-t-xs tabular-nums">
                                            <span className="block font-semibold text-ink">{formatear(m.kcal)} kcal</span>
                                            <span className="flex gap-2">
                                                <span className={COLOR_MACRO.proteina}>{formatear(m.proteina, 1)} P</span>
                                                <span className={COLOR_MACRO.carbos}>{formatear(m.carbos, 1)} HC</span>
                                                <span className={COLOR_MACRO.grasas}>{formatear(m.grasas, 1)} G</span>
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    {buscando && results && results.length > 0 && (
                        <p className="px-3 pb-1 pt-2 text-t-xs text-ink-subtle">Valores por 100 g.</p>
                    )}
                </div>
            )}

            {/* CANTIDAD */}
            {selectedFood && (
                <div className="rounded-card bg-[var(--fill-muted)] p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="flex items-center gap-1.5 text-t-base font-semibold text-ink">
                                {selectedFood.is_generic && <BadgeCheck size={16} className="shrink-0 text-success" aria-label="Genérico verificado" />}
                                <span className="truncate">{selectedFood.product_name}</span>
                            </h3>
                            {selectedFood.brands && <p className="text-t-xs text-ink-subtle">{selectedFood.brands}</p>}
                            {etiquetaDudosa(selectedFood) && (
                                <p className="mt-1 flex items-start gap-1 text-t-xs text-warning">
                                    <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden="true" />
                                    Las calorías de la etiqueta no casan con sus macros: se usan las calculadas.
                                </p>
                            )}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedFood(null)}>Cambiar</Button>
                    </div>

                    <LineaMacros m={macrosDe(selectedFood, grams)} className="text-t-sm" />

                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {[30, 50, 100, 150, 200].map((g) => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setGrams(g)}
                                aria-pressed={grams === g}
                                className={`h-8 rounded-pill px-3 text-t-xs font-semibold transition-colors duration-fast ease-snap ${grams === g ? 'bg-brand text-brand-ink' : 'bg-[var(--fill-input)] text-ink hover:bg-[var(--fill-strong)]'}`}
                            >
                                {g} g
                            </button>
                        ))}
                    </div>

                    <div className="mt-3 flex gap-2">
                        <label className="flex h-11 flex-1 items-center rounded-field bg-[var(--fill-input)] px-3 focus-within:ring-2 focus-within:ring-brand">
                            <span className="sr-only">Gramos</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                min={1}
                                value={grams || ''}
                                onChange={(e) => setGrams(Math.max(0, Number(e.target.value) || 0))}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                autoFocus
                                className="w-full bg-transparent text-t-lg font-semibold tabular-nums text-ink focus-visible:outline-none"
                            />
                            <span className="text-t-sm text-ink-subtle">gramos</span>
                        </label>
                        <Button variant="primary" size="lg" disabled={grams <= 0} onClick={handleAdd}>
                            Añadir
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
