import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { transition, DURATION } from '../../../../lib/motion';

/**
 * UNA SECCIÓN PLEGABLE DEL PANEL DE CONTEXTO
 * =====================================================================
 *
 * POR QUÉ SECCIONES APILADAS Y NO PESTAÑAS. Es la decisión de diseño más
 * importante de todo el panel, y no es estética.
 *
 * El panel vive dentro de `DayEditorModal`, que en MÓVIL no es un panel: es
 * el tercer carril de un carrusel que se arrastra de lado con el dedo
 * (`drag="x"` con `dragDirectionLock`). Unas pestañas horizontales dentro de
 * ese carril competirían con ese gesto — el dedo que va a cambiar de pestaña
 * arrastra el carrusel entero, o al revés, y ninguna de las dos cosas
 * funciona de forma fiable.
 *
 * Apilar y plegar no toca el gesto: el scroll vertical del panel ya convive
 * con el arrastre horizontal, porque `dragDirectionLock` bloquea el eje en el
 * primer movimiento.
 *
 * Y hay una segunda razón, de uso: el coach programando quiere VER a la vez
 * las series de esta semana y las de la anterior. Con pestañas tendría que ir
 * y volver, que es justo lo que este panel viene a eliminar.
 *
 *
 * EL ESTADO ABIERTO/CERRADO NO SE RECUERDA ENTRE DÍAS
 *
 * A propósito. Cada sección arranca con su valor por defecto porque lo que
 * importa al abrir un día es lo de arriba —las series de la semana—, y una
 * preferencia guardada de hace tres semanas haría que el panel se abriera
 * distinto según qué se tocó la última vez, sin que se vea por qué.
 */

export function ContextSection({
    icon: Icon,
    title,
    hint,
    defaultOpen = false,
    badge,
    children,
}: {
    icon: LucideIcon;
    title: string;
    /** Resumen de una línea, visible con la sección PLEGADA. */
    hint?: ReactNode;
    defaultOpen?: boolean;
    /** Cifra a la derecha del título. */
    badge?: ReactNode;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <section className="overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised">
            <button
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
                <Icon size={13} className="shrink-0 text-brand-text" aria-hidden="true" />

                <span className="min-w-0 flex-1">
                    <span className="block truncate text-t-2xs font-black uppercase tracking-[0.18em] text-ink-subtle">
                        {title}
                    </span>
                    {/* La pista se lee CON LA SECCIÓN CERRADA: es lo que hace
                        que plegar no cueste información. Sin ella, cerrar una
                        sección la convierte en un título mudo. */}
                    {hint && !open && (
                        <span className="mt-0.5 block truncate text-t-2xs text-ink-faint">
                            {hint}
                        </span>
                    )}
                </span>

                {badge !== undefined && badge !== null && (
                    <span className="shrink-0 text-t-2xs font-bold tabular-nums text-ink-muted">
                        {badge}
                    </span>
                )}

                <ChevronDown
                    size={13}
                    aria-hidden="true"
                    className={`shrink-0 text-ink-faint transition-transform duration-base ease-snap ${open ? 'rotate-180' : ''}`}
                />
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <m.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={transition(DURATION.base)}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-[var(--border-subtle)] p-3">
                            {children}
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </section>
    );
}

/** Fila de cifra con etiqueta, el patrón que repiten todas las secciones. */
export function ContextStat({
    label,
    value,
    tone = 'default',
}: {
    label: string;
    value: ReactNode;
    tone?: 'default' | 'muted' | 'brand';
}) {
    return (
        <div className="min-w-0">
            <p className="truncate text-t-2xs uppercase tracking-wide text-ink-subtle">{label}</p>
            <p
                className={`mt-0.5 truncate text-t-sm font-bold tabular-nums ${tone === 'brand' ? 'text-brand-text' : tone === 'muted' ? 'text-ink-muted' : 'text-ink'
                    }`}
            >
                {value}
            </p>
        </div>
    );
}

/** El estado vacío de una sección. Dice POR QUÉ está vacía, no solo que lo está. */
export function ContextEmpty({ children }: { children: ReactNode }) {
    return (
        <p className="py-3 text-center text-t-xs leading-relaxed text-ink-subtle">
            {children}
        </p>
    );
}
