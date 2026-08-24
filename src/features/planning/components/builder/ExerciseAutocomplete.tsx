import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';

// ==========================================
// SUB-COMPONENT: EXERCISE AUTOCOMPLETE INPUT
// ==========================================
export function ExerciseAutocomplete({
    libraryNames,
    onSelect,
    onCancel
}: {
    libraryNames: string[];
    onSelect: (name: string) => void;
    onCancel: () => void;
}) {
    const [query, setQuery] = useState('');
    const [highlighted, setHighlighted] = useState(0);

    const suggestions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length < 2) return [];
        return libraryNames
            .filter(n => n.toLowerCase().includes(q))
            .slice(0, 8);
    }, [query, libraryNames]);

    /**
     * ¿Ofrecer crear el ejercicio? Solo si lo escrito no coincide EXACTAMENTE
     * con algo que ya existe. Comparando contra las sugerencias visibles se
     * ofrecería crear "Sentadilla" mientras "Sentadilla Frontal" está en la
     * lista, que es lo que multiplica los duplicados en la biblioteca.
     */
    const canCreate = useMemo(() => {
        const q = query.trim();
        if (q.length < 2) return false;
        return !libraryNames.some(n => n.toLowerCase() === q.toLowerCase());
    }, [query, libraryNames]);

    const optionCount = suggestions.length + (canCreate ? 1 : 0);

    const submit = (name: string) => {
        const val = name.trim();
        if (val) onSelect(val);
    };

    return (
        <div className="relative">
            <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlighted(0); }}
                placeholder="Escribe el ejercicio... (ej: ba → Banca)"
                className="w-full bg-black/40 text-ink font-bold p-3 rounded-xl border border-subtle focus:border-brand placeholder-gray-600"
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlighted(h => Math.min(h + 1, optionCount - 1));
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlighted(h => Math.max(h - 1, 0));
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        // El índice que cae más allá de las sugerencias es la
                        // opción de crear, que también se recorre con flechas.
                        submit(highlighted < suggestions.length ? suggestions[highlighted] : query);
                    } else if (e.key === 'Escape') {
                        onCancel();
                    }
                }}
            />
            {(suggestions.length > 0 || canCreate) && (
                <div className="absolute left-0 right-0 top-full z-dropdown mt-1 overflow-hidden rounded-card bg-surface-overlay shadow-overlay">
                    {suggestions.map((s, i) => (
                        <button
                            key={s}
                            onMouseDown={(e) => { e.preventDefault(); submit(s); }}
                            onMouseEnter={() => setHighlighted(i)}
                            className={`w-full px-4 py-2.5 text-left text-t-sm font-medium transition-colors duration-fast ease-snap ${i === highlighted ? 'bg-brand text-brand-ink' : 'text-ink-muted'
 }`}
                        >
                            {s}
                        </button>
                    ))}

                    {/* Crear el ejercicio que no está en la biblioteca.
                        Antes esto funcionaba —pulsar Enter sin sugerencias lo
                        daba de alta— pero la única pista era una nota en gris
                        que decía "(nuevo)". Una acción que existe y no se ve
                        es una acción que nadie usa. */}
                    {canCreate && (
                        <button
                            onMouseDown={(e) => { e.preventDefault(); submit(query); }}
                            onMouseEnter={() => setHighlighted(suggestions.length)}
                            className={`flex w-full items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5 text-left text-t-sm transition-colors duration-fast ease-snap ${highlighted === suggestions.length ? 'bg-brand text-brand-ink' : 'text-ink-muted'
 }`}
                        >
                            <Plus size={14} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">
                                Crear <span className="font-semibold">«{query.trim()}»</span>
                            </span>
                        </button>
                    )}
                </div>
            )}
            <div className="mt-2 flex justify-between text-t-2xs text-ink-faint">
                <span>Enter para añadir</span>
                <span>Esc para cancelar</span>
            </div>
        </div>
    );
}
