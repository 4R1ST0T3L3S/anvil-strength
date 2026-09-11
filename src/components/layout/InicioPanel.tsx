import type { ReactNode } from 'react';
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
 * SISTEMA DE SEPTIEMBRE DE 2026: título grande en frase, secciones con su
 * rótulo en seminegrita (sin mayúsculas ni tracking), superficies de
 * tarjeta sin bordes gruesos ni marcas de agua, un solo acento —el rojo—
 * en la acción principal y en los contadores.
 */

export const AREA = {
    entreno: { icono: 'text-brand-text', chip: 'bg-[var(--brand-quiet)]' },
    comida: { icono: 'text-success', chip: 'bg-success-quiet' },
    club: { icono: 'text-warning', chip: 'bg-warning-quiet' },
    herramienta: { icono: 'text-ink-muted', chip: 'bg-[var(--fill-muted)]' },
} as const;

export type Area = keyof typeof AREA;

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
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 pb-6 pt-4 sm:px-6 lg:px-8 lg:pt-6 pc:h-full pc:min-h-0 pc:gap-5 pc:overflow-hidden pc:py-6">
            <header className="flex shrink-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    {antetitulo}
                    <h1 className="text-t-2xl font-bold tracking-[-0.02em] text-ink md:text-title">
                        {titulo}
                    </h1>
                    <p className="mt-1 text-t-sm capitalize text-ink-muted">
                        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
                {acciones && <div className="flex shrink-0 items-center gap-1">{acciones}</div>}
            </header>

            {aviso}

            <div className="grid gap-6 pc:min-h-0 pc:flex-1 pc:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] pc:gap-5">
                <div className="flex min-w-0 flex-col gap-6 pc:min-h-0 pc:gap-5">
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[3]">{principal}</div>
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[2]">{contexto}</div>
                </div>
                <div className="flex min-w-0 flex-col gap-6 pc:min-h-0 pc:gap-5">
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
            <div className="mb-2.5 flex shrink-0 items-center justify-between gap-2 px-0.5">
                <h2 className="flex items-center gap-2 text-t-sm font-semibold text-ink-muted">
                    {Icono && <Icono size={15} aria-hidden="true" className="text-ink-subtle" />}
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
        <div className="grid grid-cols-2 gap-2.5 pc:min-h-0 pc:flex-1 pc:auto-rows-fr">
            {children}
        </div>
    );
}

/** Un acceso de la rejilla: icono en su chip, título y pista. Contador si hay pendientes. */
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
        <button
            type="button"
            onClick={onClick}
            disabled={bloqueado}
            data-no-press
            className={cn(
                'group relative flex min-h-[88px] min-w-0 flex-col justify-between gap-2 rounded-card border border-[var(--card-border)] bg-surface-raised p-3.5 text-left shadow-card',
                'transition-[background-color,transform] duration-fast ease-snap hover:bg-surface-overlay active:scale-[0.985]',
                'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-raised',
                'pc:min-h-0 pc:flex-row pc:items-center pc:justify-start pc:gap-3 pc:p-4'
            )}
        >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', a.chip)}>
                {bloqueado
                    ? <Lock size={16} className="text-ink-faint" aria-hidden="true" />
                    : <Icono size={18} className={a.icono} aria-hidden="true" />}
            </span>
            <span className="relative min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-t-sm font-semibold leading-tight text-ink xl:text-t-base">
                    <span className="min-w-0 truncate">{titulo}</span>
                    {insignia != null && insignia > 0 && <Contador n={insignia} aria-label={`${insignia} pendientes`} />}
                    {!bloqueado && (
                        <ChevronRight
                            size={14}
                            aria-hidden="true"
                            className="ml-auto hidden shrink-0 text-ink-faint transition-transform duration-fast ease-snap group-hover:translate-x-0.5 pc:block"
                        />
                    )}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-t-xs leading-snug text-ink-subtle">{pista}</span>
            </span>
        </button>
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
        <button
            type="button"
            onClick={onClick}
            data-no-press
            className={cn(
                'group relative flex min-h-[150px] min-w-0 flex-col justify-between rounded-card p-5 text-left transition-[background-color,transform] duration-fast ease-snap active:scale-[0.99] pc:h-full pc:min-h-0',
                marca
                    ? 'bg-brand text-brand-ink hover:bg-brand-hover'
                    : 'border border-[var(--card-border)] bg-surface-raised shadow-card hover:bg-surface-overlay'
            )}
        >
            <span className="flex items-center justify-between">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]', marca ? 'bg-brand-ink/15' : tono === 'comida' ? 'bg-success-quiet' : 'bg-[var(--fill-muted)]')}>
                    <Icono size={20} className={marca ? 'text-brand-ink' : tono === 'comida' ? 'text-success' : 'text-ink-muted'} aria-hidden="true" />
                </span>
                {insignia != null && insignia > 0 && (
                    <span className={cn('inline-flex h-7 min-w-7 items-center justify-center rounded-pill px-2 text-t-sm font-semibold tabular-nums', marca ? 'bg-brand-ink text-brand' : 'bg-brand text-brand-ink')}>
                        {insignia > 99 ? '99+' : insignia}
                    </span>
                )}
            </span>
            <span className="relative mt-4 min-w-0">
                <span className={cn('block text-t-xl font-semibold leading-tight tracking-[-0.01em]', marca ? 'text-brand-ink' : 'text-ink')}>
                    {titulo}
                </span>
                <span className={cn('mt-1 flex items-center gap-1 text-t-sm', marca ? 'text-brand-ink/80' : 'text-ink-subtle')}>
                    <span className="min-w-0">{pista}</span>
                    <ChevronRight size={14} aria-hidden="true" className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                </span>
                {children}
            </span>
        </button>
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
        <div className="relative flex min-h-[124px] flex-col justify-center rounded-card border border-[var(--card-border)] bg-surface-raised p-5 shadow-card pc:min-h-0 pc:flex-1 pc:p-6">
            <Quote size={18} aria-hidden="true" className="mb-2 text-brand-text" />
            <p className="line-clamp-4 text-t-base font-medium leading-snug text-ink xl:text-t-lg">{frase}</p>
            <p className="mt-2.5 shrink-0 text-t-xs text-ink-subtle">Anvil Strength Club</p>
        </div>
    );
}

/** Frase + competición, lado a lado desde `sm`. */
export function FilaDeContexto({ children }: { children: ReactNode }) {
    return (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] pc:min-h-0 pc:flex-1 pc:gap-3">
            {children}
        </div>
    );
}
