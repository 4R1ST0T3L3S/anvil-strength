import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCopy, ClipboardPaste, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { transition, DURATION } from '../../../../lib/motion';

export interface DayOption {
    id: string;
    week_number: number;
    day_number: number;
    name: string | null;
    day_of_week: string | null;
}

interface CopyDayMenuProps {
    sessionId: string;
    sessionLabel: string;
    hasExercises: boolean;
    copiedDay: { sessionId: string; label: string } | null;
    dayOptions: DayOption[];
    weekLabelFor: (weekNumber: number) => string;
    onCopy: () => void;
    onPasteHere: () => void;
    onCopyToMany: (targetIds: string[], mode: 'replace' | 'append') => void;
}

/**
 * COPIAR UN DÍA ENTERO.
 * =====================================================================
 *
 * Tres gestos en un solo menú, porque son la misma acción a distinta escala:
 * copiar este día al portapapeles interno, pegarlo sobre otro con un clic, o
 * elegir de golpe varios días de destino con casillas. El portapapeles es
 * ESTADO DEL CONSTRUCTOR (`copiedDay` en `WorkoutBuilder`), no
 * `navigator.clipboard`: así "Pegar aquí" puede aparecer en las demás
 * tarjetas en cuanto se copia, sin pedir permiso al navegador.
 */
export function CopyDayMenu({
    sessionId, sessionLabel, hasExercises, copiedDay, dayOptions, weekLabelFor,
    onCopy, onPasteHere, onCopyToMany,
}: CopyDayMenuProps) {
    const [open, setOpen] = useState(false);
    const [manyOpen, setManyOpen] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [mode, setMode] = useState<'replace' | 'append'>('replace');
    const rootRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => {
        setOpen(false);
        setManyOpen(false);
        setSelected(new Set());
    }, []);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) close();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, close]);

    const canPasteHere = copiedDay && copiedDay.sessionId !== sessionId;
    const otherDays = dayOptions.filter(d => d.id !== sessionId);

    const toggleDay = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    return (
        <div className="relative" ref={rootRef}>
            <button
                onClick={(e) => { e.stopPropagation(); if (open) close(); else setOpen(true); }}
                title="Copiar este día"
                aria-label={`Copiar ${sessionLabel}`}
                className={`rounded-field p-1.5 transition-colors duration-fast ease-snap ${open
                    ? 'bg-brand-quiet text-brand'
                    : 'text-ink-faint opacity-0 hover:text-ink focus-visible:opacity-100 group-hover/day:opacity-100'
                    }`}
            >
                <ClipboardCopy size={14} aria-hidden="true" />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: -4 }}
                        transition={transition(DURATION.fast)}
                        style={{ transformOrigin: 'top right' }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full z-dropdown mt-2 w-72 rounded-card border border-[var(--border-default)] bg-surface-overlay p-1.5 shadow-overlay"
                    >
                        {manyOpen ? (
                            <>
                                <button
                                    onClick={() => setManyOpen(false)}
                                    className="mb-1 flex w-full items-center gap-1.5 rounded-field px-2.5 py-1.5 text-left text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle transition-colors duration-fast ease-snap hover:text-ink"
                                >
                                    ← Elige los días destino
                                </button>

                                <div className="mb-2 flex gap-1 px-1">
                                    <button
                                        onClick={() => setMode('replace')}
                                        className={`flex-1 rounded-field px-2 py-1.5 text-t-2xs font-bold uppercase tracking-wide transition-colors duration-fast ease-snap ${mode === 'replace' ? 'bg-brand text-brand-ink' : 'bg-surface-sunken text-ink-subtle'}`}
                                    >
                                        Sustituir
                                    </button>
                                    <button
                                        onClick={() => setMode('append')}
                                        className={`flex-1 rounded-field px-2 py-1.5 text-t-2xs font-bold uppercase tracking-wide transition-colors duration-fast ease-snap ${mode === 'append' ? 'bg-brand text-brand-ink' : 'bg-surface-sunken text-ink-subtle'}`}
                                    >
                                        Añadir
                                    </button>
                                </div>

                                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                                    {otherDays.length === 0 && (
                                        <p className="px-2.5 py-2 text-t-xs italic text-ink-faint">
                                            No hay otros días en el bloque.
                                        </p>
                                    )}
                                    {otherDays.map(d => {
                                        const checked = selected.has(d.id);
                                        return (
                                            <button
                                                key={d.id}
                                                onClick={() => toggleDay(d.id)}
                                                className="flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-left text-t-sm text-ink-muted transition-colors duration-fast ease-snap hover:bg-surface-raised hover:text-ink"
                                            >
                                                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-brand bg-brand text-brand-ink' : 'border-[var(--border-default)]'}`}>
                                                    {checked && <Check size={11} aria-hidden="true" />}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate">
                                                    {weekLabelFor(d.week_number)} · {d.name || `Día ${d.day_number}`}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => { onCopyToMany([...selected], mode); close(); }}
                                    disabled={selected.size === 0}
                                    className="mt-2 flex w-full items-center justify-center rounded-field bg-brand px-3 py-2 text-t-xs font-black uppercase tracking-wide text-brand-ink transition-colors duration-fast hover:bg-brand-hover disabled:opacity-40"
                                >
                                    Copiar a {selected.size || ''} {selected.size === 1 ? 'día' : 'días'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => { onCopy(); close(); }}
                                    disabled={!hasExercises}
                                    className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-t-sm text-ink-muted transition-colors duration-fast ease-snap hover:bg-surface-raised hover:text-ink disabled:opacity-40"
                                >
                                    <ClipboardCopy size={14} aria-hidden="true" className="shrink-0" />
                                    Copiar este día
                                </button>
                                {canPasteHere && (
                                    <button
                                        onClick={() => { onPasteHere(); close(); }}
                                        className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-t-sm text-ink-muted transition-colors duration-fast ease-snap hover:bg-surface-raised hover:text-ink"
                                    >
                                        <ClipboardPaste size={14} aria-hidden="true" className="shrink-0" />
                                        Pegar «{copiedDay.label}» aquí
                                    </button>
                                )}
                                <button
                                    onClick={() => setManyOpen(true)}
                                    disabled={!hasExercises}
                                    className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-t-sm text-ink-muted transition-colors duration-fast ease-snap hover:bg-surface-raised hover:text-ink disabled:opacity-40"
                                >
                                    <ClipboardCopy size={14} aria-hidden="true" className="shrink-0" />
                                    Copiar a varios días…
                                </button>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
