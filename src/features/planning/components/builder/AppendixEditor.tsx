import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * APÉNDICE DEL DÍA: consideraciones o calentamiento.
 *
 * Texto libre a propósito. Un calentamiento son aproximaciones, movilidad y
 * activación, y forzarlo a la rejilla de series/reps/kg obligaba al coach a
 * inventarse ejercicios falsos que además CONTAMINABAN las métricas: sumaban
 * series al reparto por patrón y kilos al tonelaje de un día que todavía no
 * había empezado.
 *
 * Arranca plegado cuando está vacío: la mayoría de días no lo llevan y no
 * puede robarle sitio a la lista de ejercicios en una pantalla de móvil.
 */
export function AppendixEditor({
    label,
    icon: Icon,
    placeholder,
    value,
    onCommit,
}: {
    label: string;
    icon: LucideIcon;
    placeholder: string;
    value: string | null | undefined;
    onCommit: (value: string) => void;
}) {
    const [draft, setDraft] = useState(value ?? '');
    const [open, setOpen] = useState(Boolean(value));

    // El día cambia bajo el MISMO componente al saltar de una sesión a otra, y
    // sin esto el borrador del día anterior se quedaba en pantalla —listo para
    // guardarse encima del nuevo en cuanto el campo perdiera el foco—.
    //
    // El ajuste va durante el render y no en un efecto: así React descarta el
    // resultado y vuelve a pintar antes de tocar el DOM, en vez de enseñar un
    // fotograma con el texto equivocado y corregirlo después.
    const [syncedValue, setSyncedValue] = useState(value);
    if (syncedValue !== value) {
        setSyncedValue(value);
        setDraft(value ?? '');
        setOpen(Boolean(value));
    }

    const filled = Boolean((value ?? '').trim());

    return (
        <div className="shrink-0 rounded-card border border-[var(--border-default)] bg-surface-raised">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
                <Icon size={13} className={filled ? 'text-brand-text' : 'text-ink-faint'} aria-hidden="true" />
                <span className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                    {label}
                </span>
                {filled && !open && (
                    <span className="ml-1 min-w-0 flex-1 truncate text-t-xs text-ink-faint">
                        {(value ?? '').replace(/\s+/g, ' ')}
                    </span>
                )}
                <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={`ml-auto shrink-0 text-ink-faint transition-transform duration-fast ease-snap ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <div className="px-3 pb-3">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => onCommit(draft)}
                        rows={3}
                        maxLength={2000}
                        placeholder={placeholder}
                        className="w-full resize-y rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm leading-relaxed text-ink transition-colors duration-fast ease-snap placeholder:text-ink-faint focus:border-brand"
                    />
                    <p className="mt-1 text-t-2xs text-ink-faint">
                        Se guarda al salir del campo. Lo ve el atleta y sale en el PDF.
                    </p>
                </div>
            )}
        </div>
    );
}
