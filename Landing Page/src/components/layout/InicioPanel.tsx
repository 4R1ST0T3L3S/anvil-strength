import type { ReactNode } from 'react';
import { m } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Lock, Quote } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Contador } from '../ui/Badge';

/**
 * EL INICIO DEL PANEL — UNO SOLO PARA ATLETA Y ENTRENADOR
 * =====================================================================
 *
 * Aquí vive la FORMA; cada inicio solo decide el CONTENIDO.
 *
 *   ORDENADOR (`pc`: ≥1024 de ancho Y ≥640 de alto): la pantalla entera sin
 *   scroll, dos columnas que se reparten el alto con `flex`.
 *   MÓVIL: una columna, tarjetas compactas, texto que envuelve.
 *
 * EL LENGUAJE (septiembre 2026): el de los Ajustes de iOS y de Duolingo.
 * Superficies planas sin borde ni sombra, esquinas generosas, un chip de
 * color por área con su icono, y respuesta física al ratón y al dedo: la
 * tarjeta se levanta dos píxeles al pasar por encima y se hunde al pulsar,
 * con un muelle corto. El rojo de marca solo en la acción del día.
 */

/** La paleta de los chips: un color por área, todos a la misma luz. */
export const AREA = {
    entreno: { chip: 'bg-[var(--tint-red)]', icono: 'text-[var(--tint-red-ink)]' },
    comida: { chip: 'bg-[var(--tint-green)]', icono: 'text-[var(--tint-green-ink)]' },
    club: { chip: 'bg-[var(--tint-orange)]', icono: 'text-[var(--tint-orange-ink)]' },
    datos: { chip: 'bg-[var(--tint-blue)]', icono: 'text-[var(--tint-blue-ink)]' },
    ajustes: { chip: 'bg-[var(--tint-purple)]', icono: 'text-[var(--tint-purple-ink)]' },
    herramienta: { chip: 'bg-[var(--tint-gray)]', icono: 'text-[var(--tint-gray-ink)]' },
} as const;

export type Area = keyof typeof AREA;

/** El muelle de las tarjetas: corto y sin rebote visible. */
const MUELLE = { type: 'spring', stiffness: 520, damping: 34, mass: 0.6 } as const;
export const LEVANTAR = { y: -2 };
export const HUNDIR = { scale: 0.975, y: 0 };

interface ArmazonProps {
    antetitulo?: ReactNode;
    titulo: ReactNode;
    /** Avisos, conmutador de panel y menú de cuenta. */
    acciones?: ReactNode;
    /** Franja a todo lo ancho bajo la cabecera (cuota vencida…). */
    aviso?: ReactNode;
    principal: ReactNode;
    contexto: ReactNode;
    accesos: ReactNode;
    herramientas: ReactNode;
}

export function InicioArmazon({ antetitulo, titulo, acciones, aviso, principal, contexto, accesos, herramientas }: ArmazonProps) {
    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-7 px-4 pb-6 pt-5 sm:px-6 lg:px-8 lg:pt-8 pc:h-full pc:min-h-0 pc:gap-6 pc:overflow-hidden pc:py-7">
            <header className="flex shrink-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    {antetitulo}
                    <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em] text-ink md:text-[34px]">
                        {titulo}
                    </h1>
                    <p className="mt-1 text-t-base capitalize text-ink-subtle">
                        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
                {acciones && <div className="flex shrink-0 items-center gap-1">{acciones}</div>}
            </header>

            {aviso}

            <div className="grid gap-7 pc:min-h-0 pc:flex-1 pc:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] pc:gap-6">
                <div className="flex min-w-0 flex-col gap-7 pc:min-h-0 pc:gap-6">
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[3]">{principal}</div>
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[2]">{contexto}</div>
                </div>
                <div className="flex min-w-0 flex-col gap-7 pc:min-h-0 pc:gap-6">
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[3]">{accesos}</div>
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[2]">{herramientas}</div>
                </div>
            </div>
        </div>
    );
}

/** Un bloque con su rótulo. En el ordenador se estira para llenar su hueco. */
export function Seccion({
    icono: Icono,
    titulo,
    children,
    className,
    accion,
}: {
    icono?: LucideIcon;
    titulo: ReactNode;
    children: ReactNode;
    className?: string;
    accion?: ReactNode;
}) {
    return (
        <section className={cn('flex min-w-0 flex-col pc:min-h-0 pc:flex-1', className)}>
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2 px-1">
                <h2 className="flex items-center gap-2 text-t-lg font-semibold tracking-[-0.01em] text-ink">
                    {Icono && <Icono size={17} aria-hidden="true" className="text-ink-subtle" />}
                    {titulo}
                </h2>
                {accion}
            </div>
            <div className="flex min-w-0 flex-col gap-3 pc:min-h-0 pc:flex-1">{children}</div>
        </section>
    );
}

/** Rejilla de accesos: dos columnas; en el ordenador las filas llenan el alto. */
export function RejillaAccesos({ children }: { children: ReactNode }) {
    return (
        <div className="grid grid-cols-2 gap-3 pc:min-h-0 pc:flex-1 pc:auto-rows-fr">
            {children}
        </div>
    );
}

/** Un acceso de la rejilla: chip de color con el icono, título y pista. Contador si hay pendientes. */
export function Acceso({
    icono: Icono,
    titulo,
    pista,
    onClick,
    area = 'herramienta',
    bloqueado = false,
    insignia,
}: {
    icono: LucideIcon;
    titulo: string;
    pista: string;
    onClick: () => void;
    area?: Area;
    bloqueado?: boolean;
    insignia?: number;
}) {
    const a = AREA[area];
    return (
        <m.button
            type="button"
            onClick={onClick}
            disabled={bloqueado}
            data-no-press
            whileHover={bloqueado ? undefined : LEVANTAR}
            whileTap={bloqueado ? undefined : HUNDIR}
            transition={MUELLE}
            className={cn(
                'group relative flex min-h-[96px] min-w-0 flex-col justify-between gap-3 rounded-[20px] bg-surface-raised p-4 text-left',
                'transition-[background-color] duration-fast ease-snap hover:bg-surface-overlay',
                'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-raised',
                'pc:min-h-0 pc:flex-row pc:items-center pc:justify-start pc:gap-3.5 pc:p-4'
            )}
        >
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]', bloqueado ? 'bg-[var(--tint-gray)]' : a.chip)}>
                {bloqueado
                    ? <Lock size={18} className="text-ink-faint" aria-hidden="true" />
                    : <Icono size={21} strokeWidth={2.1} className={a.icono} aria-hidden="true" />}
            </span>
            <span className="relative min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-t-base font-semibold leading-tight tracking-[-0.01em] text-ink">
                    <span className="min-w-0 truncate">{titulo}</span>
                    {insignia != null && insignia > 0 && <Contador n={insignia} aria-label={`${insignia} pendientes`} />}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-t-xs leading-snug text-ink-subtle">{pista}</span>
            </span>
            {!bloqueado && (
                <ChevronRight
                    size={16}
                    aria-hidden="true"
                    className="hidden shrink-0 text-ink-faint transition-transform duration-fast ease-snap group-hover:translate-x-0.5 pc:block"
                />
            )}
        </m.button>
    );
}

/**
 * La tarjeta grande de la izquierda. En rojo cuando ES la acción del día
 * (entrenar, revisar); neutra para lo secundario.
 */
export function TarjetaPrincipal({
    icono: Icono,
    titulo,
    pista,
    onClick,
    tono = 'marca',
    insignia,
    children,
}: {
    icono: LucideIcon;
    titulo: string;
    pista: string;
    onClick: () => void;
    tono?: 'marca' | 'comida' | 'neutro';
    insignia?: number;
    /** Contenido extra bajo la pista (una lista corta). */
    children?: ReactNode;
}) {
    const marca = tono === 'marca';
    return (
        <m.button
            type="button"
            onClick={onClick}
            data-no-press
            whileHover={LEVANTAR}
            whileTap={HUNDIR}
            transition={MUELLE}
            className={cn(
                'group relative flex min-h-[160px] min-w-0 flex-col justify-between rounded-[24px] p-5 text-left transition-[background-color] duration-fast ease-snap pc:h-full pc:min-h-0',
                marca
                    ? 'bg-brand text-brand-ink hover:bg-brand-hover'
                    : 'bg-surface-raised hover:bg-surface-overlay'
            )}
        >
            <span className="flex items-center justify-between">
                <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]', marca ? 'bg-brand-ink/18' : tono === 'comida' ? AREA.comida.chip : AREA.herramienta.chip)}>
                    <Icono size={21} strokeWidth={2.1} className={marca ? 'text-brand-ink' : tono === 'comida' ? AREA.comida.icono : AREA.herramienta.icono} aria-hidden="true" />
                </span>
                {insignia != null && insignia > 0 && (
                    <span className={cn('inline-flex h-7 min-w-7 items-center justify-center rounded-pill px-2.5 text-t-sm font-semibold tabular-nums', marca ? 'bg-brand-ink text-brand' : 'bg-brand text-brand-ink')}>
                        {insignia > 99 ? '99+' : insignia}
                    </span>
                )}
            </span>
            <span className="relative mt-4 min-w-0">
                <span className={cn('block text-[22px] font-semibold leading-tight tracking-[-0.015em]', marca ? 'text-brand-ink' : 'text-ink')}>
                    {titulo}
                </span>
                <span className={cn('mt-1 flex items-center gap-1 text-t-sm', marca ? 'text-brand-ink/80' : 'text-ink-subtle')}>
                    <span className="min-w-0">{pista}</span>
                    <ChevronRight size={15} aria-hidden="true" className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                </span>
                {children}
            </span>
        </m.button>
    );
}

/** Dos tarjetas principales lado a lado desde `sm`; en el ordenador llenan el alto. */
export function ParDePrincipales({ children }: { children: ReactNode }) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pc:min-h-0 pc:flex-1">
            {children}
        </div>
    );
}

/** La frase del día. Serena, no gritada. */
export function FraseDelDia({ frase }: { frase: string }) {
    return (
        <div className="relative flex min-h-[124px] flex-col justify-center rounded-[20px] bg-surface-raised p-5 pc:min-h-0 pc:flex-1 pc:p-6">
            <span className={cn('mb-3 flex h-8 w-8 items-center justify-center rounded-[10px]', AREA.entreno.chip)}>
                <Quote size={15} aria-hidden="true" className={AREA.entreno.icono} />
            </span>
            <p className="line-clamp-4 text-t-base font-medium leading-snug text-ink xl:text-t-lg">{frase}</p>
            <p className="mt-2.5 shrink-0 text-t-xs text-ink-subtle">Anvil Strength Club</p>
        </div>
    );
}

/** Frase + competición, lado a lado desde `sm`. */
export function FilaDeContexto({ children }: { children: ReactNode }) {
    return (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] pc:min-h-0 pc:flex-1">
            {children}
        </div>
    );
}
