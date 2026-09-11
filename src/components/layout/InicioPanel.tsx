import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Calendar, ChevronRight, Lock, Quote } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * EL INICIO DEL PANEL — UNO SOLO PARA ATLETA Y ENTRENADOR
 * =====================================================================
 *
 * Hasta ahora eran dos pantallas que se parecían en el nombre y en poco más:
 * la del entrenador iba a alto fijo, con un color distinto por tarjeta y letra
 * de 10px cortada con puntos suspensivos en el móvil; la del atleta hacía
 * scroll, iba centrada a 1152px y usaba tres acentos por área. Cada arreglo
 * había que hacerlo dos veces, y aun así divergían.
 *
 * Aquí vive la FORMA; cada inicio solo decide el CONTENIDO.
 *
 *   ORDENADOR (`pc`: ≥1024 de ancho Y ≥640 de alto): la pantalla entera y ni
 *   un píxel más. Sin scroll vertical ni horizontal: dos columnas que se
 *   reparten el alto con `flex`, y rejillas de accesos cuyas filas se estiran
 *   (`auto-rows-fr`) para llenar lo que haya. El alto lo pone el armazón
 *   (`DashboardLayout` con `ajustarAPantalla`), no un `calc(100vh - …)` con la
 *   altura de una cabecera que en el inicio ni siquiera se pinta.
 *
 *   MÓVIL (y ventanas muy bajas): una columna, tarjetas compactas y texto que
 *   ENVUELVE en vez de cortarse. La pista de un acceso puede ocupar dos
 *   líneas; lo que no puede es quedarse en «Clasificación de atl…».
 *
 * COLOR: tres acentos por ÁREA, no uno por botón (ver DESIGN.md — «si algo es
 * rojo y no se puede pulsar ni indica un estado, sobra»): rojo es entrenar,
 * verde es comer, ámbar es el club. Las herramientas van en neutro.
 */

export const AREA = {
    entreno: { icono: 'text-brand-text', chip: 'bg-brand-quiet', borde: 'hover:border-[var(--brand-line)]' },
    comida: { icono: 'text-success', chip: 'bg-success-quiet', borde: 'hover:border-[var(--border-strong)]' },
    club: { icono: 'text-warning', chip: 'bg-warning-quiet', borde: 'hover:border-[var(--border-strong)]' },
    herramienta: { icono: 'text-ink-muted', chip: 'bg-surface-overlay', borde: 'hover:border-[var(--border-strong)]' },
} as const;

export type Area = keyof typeof AREA;

interface ArmazonProps {
    /** Línea pequeña encima del saludo (el equipo del atleta, por ejemplo). */
    antetitulo?: ReactNode;
    titulo: ReactNode;
    /** Avisos, conmutador de panel y menú de cuenta. */
    acciones?: ReactNode;
    /** Franja a todo lo ancho bajo la cabecera (cuota vencida…). */
    aviso?: ReactNode;
    /** Izquierda, arriba: lo que se viene a hacer. */
    principal: ReactNode;
    /** Izquierda, abajo: la frase del día y la próxima competición. */
    contexto: ReactNode;
    /** Derecha, arriba: el resto de la aplicación. */
    accesos: ReactNode;
    /** Derecha, abajo: las calculadoras. */
    herramientas: ReactNode;
}

export function InicioArmazon({
    antetitulo,
    titulo,
    acciones,
    aviso,
    principal,
    contexto,
    accesos,
    herramientas,
}: ArmazonProps) {
    return (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-6 pt-5 md:px-6 lg:px-8 pc:h-full pc:min-h-0 pc:gap-4 pc:overflow-hidden pc:py-5">
            <header className="flex shrink-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    {antetitulo}
                    <h1 className="text-t-2xl font-black uppercase leading-tight tracking-display text-ink md:text-t-3xl">
                        {titulo}
                    </h1>
                    <p className="mt-1 flex items-center gap-2 text-t-sm capitalize text-ink-muted">
                        <Calendar size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
                        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
                {acciones && <div className="flex shrink-0 items-center gap-1">{acciones}</div>}
            </header>

            {aviso}

            <div className="grid gap-5 pc:min-h-0 pc:flex-1 pc:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] pc:gap-4">
                <div className="flex min-w-0 flex-col gap-5 pc:min-h-0 pc:gap-4">
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[3]">{principal}</div>
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[2]">{contexto}</div>
                </div>
                <div className="flex min-w-0 flex-col gap-5 pc:min-h-0 pc:gap-4">
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[3]">{accesos}</div>
                    <div className="flex min-w-0 flex-col pc:min-h-0 pc:flex-[2]">{herramientas}</div>
                </div>
            </div>
        </div>
    );
}

/** Un bloque con su etiqueta. En el ordenador se estira para llenar su hueco. */
export function Seccion({
    icono: Icono,
    titulo,
    children,
    className,
}: {
    icono: LucideIcon;
    titulo: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn('flex min-w-0 flex-col pc:min-h-0 pc:flex-1', className)}>
            <h2 className="mb-2.5 flex shrink-0 items-center gap-2 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                <Icono size={14} aria-hidden="true" className="text-ink-faint" />
                {titulo}
            </h2>
            <div className="flex min-w-0 flex-col gap-3 pc:min-h-0 pc:flex-1">{children}</div>
        </section>
    );
}

/** Rejilla de accesos: dos columnas siempre; en el ordenador las filas llenan el alto. */
export function RejillaAccesos({ children }: { children: ReactNode }) {
    return (
        <div className="grid grid-cols-2 gap-2.5 pc:min-h-0 pc:flex-1 pc:auto-rows-fr">
            {children}
        </div>
    );
}

/**
 * Un acceso de la rejilla.
 *
 * El título NO se trunca y la pista ocupa hasta dos líneas: en el móvil, con
 * dos columnas de ~165px, «Clasificación de atletas» no cabe en una, y
 * cortarla dejaba el acceso sin decir adónde lleva.
 */
export function Acceso({
    icono: Icono,
    titulo,
    pista,
    onClick,
    area = 'herramienta',
    bloqueado = false,
}: {
    icono: LucideIcon;
    titulo: string;
    pista: string;
    onClick: () => void;
    area?: Area;
    bloqueado?: boolean;
}) {
    const a = AREA[area];
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={bloqueado}
            className={cn(
                'group relative flex min-h-[92px] min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-3.5 text-left',
                'transition-colors duration-fast ease-snap hover:bg-surface-overlay active:bg-surface-raised',
                'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-raised',
                // En el ordenador, icono a la izquierda y texto a la derecha.
                // Apilados necesitaban ~125px de alto y en un portátil de
                // 1366×768 las filas miden menos: la pista se quedaba cortada.
                // En fila bastan ~64px, a cualquier alto de pantalla.
                'pc:min-h-0 pc:flex-row pc:items-center pc:justify-start pc:gap-3 pc:p-4',
                a.borde
            )}
        >
            {/* Marca de agua: da cuerpo a la tarjeta sin competir con el texto. */}
            <Icono
                size={72}
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -top-3 text-ink opacity-[0.04] transition-transform duration-base ease-snap group-hover:scale-110"
            />
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-field', a.chip)}>
                {bloqueado
                    ? <Lock size={15} className="text-ink-faint" aria-hidden="true" />
                    : <Icono size={16} className={a.icono} aria-hidden="true" />}
            </span>
            <span className="relative min-w-0">
                <span className="flex items-center gap-1 text-t-sm font-bold leading-tight text-ink xl:text-t-base">
                    <span className="min-w-0">{titulo}</span>
                    {!bloqueado && (
                        <ChevronRight
                            size={14}
                            aria-hidden="true"
                            className="shrink-0 text-ink-faint transition-transform duration-fast ease-snap group-hover:translate-x-0.5"
                        />
                    )}
                </span>
                <span className="mt-0.5 line-clamp-2 text-t-xs leading-snug text-ink-subtle">{pista}</span>
            </span>
        </button>
    );
}

/**
 * La tarjeta grande de la izquierda. Es la misma forma que las del «Hoy» del
 * atleta (entrenamiento en rojo, dieta en neutro con acento verde), para que
 * los dos inicios se lean igual aunque lleven cosas distintas.
 */
export function TarjetaPrincipal({
    icono: Icono,
    titulo,
    pista,
    onClick,
    tono = 'marca',
}: {
    icono: LucideIcon;
    titulo: string;
    pista: string;
    onClick: () => void;
    tono?: 'marca' | 'comida';
}) {
    const marca = tono === 'marca';
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group relative flex min-h-[148px] min-w-0 flex-col justify-between overflow-hidden rounded-card p-5 text-left transition-colors duration-fast ease-snap pc:h-full pc:min-h-0',
                marca
                    ? 'bg-brand hover:bg-brand-hover active:bg-brand-active'
                    : 'border border-[var(--border-default)] bg-surface-raised hover:bg-surface-overlay'
            )}
        >
            <Icono
                size={128}
                aria-hidden="true"
                className={cn(
                    'pointer-events-none absolute -right-6 -top-4 transition-transform duration-base ease-snap group-hover:scale-105',
                    marca ? 'text-brand-ink opacity-[0.12]' : 'text-success opacity-[0.06]'
                )}
            />
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-field', marca ? 'bg-brand-ink/15' : 'bg-success-quiet')}>
                <Icono size={20} className={marca ? 'text-brand-ink' : 'text-success'} aria-hidden="true" />
            </span>
            <span className="relative mt-4">
                <span className={cn('block text-t-2xl font-black uppercase leading-none tracking-display', marca ? 'text-brand-ink' : 'text-ink')}>
                    {titulo}
                </span>
                <span className={cn('mt-1.5 flex items-center gap-1 text-t-sm', marca ? 'text-brand-ink/80' : 'text-ink-subtle')}>
                    <span className="min-w-0">{pista}</span>
                    <ChevronRight size={14} aria-hidden="true" className="shrink-0 transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                </span>
            </span>
        </button>
    );
}

/** Dos tarjetas principales lado a lado desde `md`; en el ordenador llenan el alto. */
export function ParDePrincipales({ children }: { children: ReactNode }) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pc:min-h-0 pc:flex-1">
            {children}
        </div>
    );
}

/** La frase del día. Se recorta por líneas, no por caracteres, si no cabe. */
export function FraseDelDia({ frase }: { frase: string }) {
    return (
        <div className="relative flex min-h-[132px] flex-col justify-center overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-5 pc:min-h-0 pc:flex-1 pc:p-6">
            <Quote
                size={112}
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -top-2 text-ink opacity-[0.04]"
            />
            <p className="relative line-clamp-5 text-t-lg font-black uppercase leading-snug tracking-display text-ink xl:text-t-xl">
                {frase}
            </p>
            <p className="relative mt-3 shrink-0 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                Anvil Strength Club
            </p>
        </div>
    );
}

/** Frase + competición, lado a lado desde `sm`. Igual en los dos inicios. */
export function FilaDeContexto({ children }: { children: ReactNode }) {
    return (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] pc:min-h-0 pc:flex-1 pc:gap-3">
            {children}
        </div>
    );
}
