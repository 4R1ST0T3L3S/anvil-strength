import type { ReactNode } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * KIT DE LAS PANTALLAS DE INICIO
 * =====================================================================
 *
 * Una sola definición de tarjeta y de etiqueta de sección para TODOS los
 * paneles: atleta, entrenador y nutricionista. Antes cada Home traía su
 * copia, y el panel de "Hoy" y el check-in una tercera y una cuarta: cuatro
 * versiones del mismo dibujo que divergían en relleno, tamaño del chip y
 * tipografía según qué rol tuvieras.
 *
 * El estilo es el de la app Android: chip de icono con un color propio por
 * acceso (icono `color-500`, fondo al 10 %, borde al 50 % en hover), marca
 * de agua del icono al 4 %, título en negrita y pista con flecha, todo a una
 * línea. La tarjeta ocupa la celda entera que le da la rejilla (`h-full`):
 * el alto lo decide la pantalla, no el contenido.
 */

export interface TileColor {
    icon: string;
    chip: string;
    ring: string;
}

const color = (name: string): TileColor => ({
    icon: `text-${name}-500`,
    chip: `bg-${name}-500/10`,
    ring: `group-hover:border-${name}-500/50`,
});

/**
 * Paleta de accesos. Se escriben COMPLETAS (no con plantilla) para que
 * Tailwind vea las clases y las genere; `color()` solo evita erratas.
 */
export const TILE = {
    /** Rojo de marca: la acción principal (entrenar, mis atletas). */
    brand: { icon: 'text-brand-text', chip: 'bg-brand/10', ring: 'group-hover:border-brand/50' },
    /** Verde: hecho, completado. */
    success: { icon: 'text-success', chip: 'bg-success/10', ring: 'group-hover:border-success/50' },
    lime: color('lime'),
    cyan: color('cyan'),
    amber: color('amber'),
    purple: color('purple'),
    teal: color('teal'),
    orange: color('orange'),
    indigo: color('indigo'),
    pink: color('pink'),
    emerald: color('emerald'),
    rose: color('rose'),
} satisfies Record<string, TileColor>;

// Para el escáner de Tailwind: las clases que `color()` compone tienen que
// aparecer literales en algún fichero. Esta lista es esa aparición.
// text-lime-500 bg-lime-500/10 group-hover:border-lime-500/50
// text-cyan-500 bg-cyan-500/10 group-hover:border-cyan-500/50
// text-amber-500 bg-amber-500/10 group-hover:border-amber-500/50
// text-purple-500 bg-purple-500/10 group-hover:border-purple-500/50
// text-teal-500 bg-teal-500/10 group-hover:border-teal-500/50
// text-orange-500 bg-orange-500/10 group-hover:border-orange-500/50
// text-indigo-500 bg-indigo-500/10 group-hover:border-indigo-500/50
// text-pink-500 bg-pink-500/10 group-hover:border-pink-500/50
// text-emerald-500 bg-emerald-500/10 group-hover:border-emerald-500/50
// text-rose-500 bg-rose-500/10 group-hover:border-rose-500/50

/** Color del icono de cada etiqueta de sección. Uno por tipo de sección, no por rol. */
export const SECTION = {
    primary: 'text-brand',
    lessons: 'text-[#eab308]',
    competition: 'text-[#f59e0b]',
    hub: 'text-[#3b82f6]',
    lab: 'text-[#10b981]',
    checkin: 'text-brand-text',
} as const;

export function SectionLabel({ icon: Icon, children, colorClass }: { icon: LucideIcon; children: ReactNode; colorClass?: string }) {
    return (
        <h2 className="my-4 flex items-center gap-2 text-t-sm font-bold uppercase tracking-widest text-ink-subtle">
            <Icon size={18} aria-hidden="true" className={colorClass || 'text-ink-faint'} />
            {children}
        </h2>
    );
}

export function NavTile({
    icon: Icon,
    title,
    hint,
    onClick,
    customColor,
    disabled = false,
    decoration,
}: {
    icon: LucideIcon;
    title: string;
    hint: string;
    onClick: () => void;
    customColor: TileColor;
    disabled?: boolean;
    /** Adorno extra encima de la tarjeta (la luna del día de descanso). */
    decoration?: ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`group relative flex h-full min-h-0 w-full flex-col justify-between overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-3 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay active:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-raised ${customColor.ring}`}
        >
            <Icon
                size={72}
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -top-3 text-ink opacity-[0.04] transition-transform duration-base ease-snap group-hover:scale-110"
            />
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-field ${customColor.chip}`}>
                {disabled
                    ? <Lock size={16} className="text-ink-faint" aria-hidden="true" />
                    : <Icon size={16} className={customColor.icon} aria-hidden="true" />}
            </span>
            <span className="relative mt-1 flex min-h-0 flex-col overflow-hidden">
                <span className="block truncate text-t-base font-bold leading-tight text-ink">{title}</span>
                <span className="mt-0.5 flex items-center gap-1 truncate text-t-xs text-ink-subtle">
                    <span className="truncate">{hint}</span>
                    {!disabled && (
                        <ChevronRight size={12} aria-hidden="true" className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                    )}
                </span>
            </span>
            {decoration}
        </button>
    );
}
