import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Instagram, Link2, Pause, Play, RotateCcw, X } from 'lucide-react';
import { Humo } from '../Humo';
import { PressButton } from '../landingKit';
import { lockBodyScroll } from '../../../../lib/scrollLock';
import { leerCategoria, partirNombre } from '../../../../lib/atletas';
import { useClaseDeRegistro } from '../../../../components/layout/RegistroMarca';
import { useIdioma } from '../../../../hooks/useIdioma';
import { rellenar, useTextosWeb } from '../../textos';
import { formatearFechas, nombreDeCartel, type Competicion, type Convocado } from '../../lib/competiciones';

/**
 * LA CONVOCATORIA — la presentación de los atletas de una competición
 * =====================================================================
 *
 * Lo que se pidió: que quien pulse en una competición vea a los atletas que
 * van como en el anuncio de una alineación de fútbol — humo detrás, el
 * atleta que aparece y se queda quieto, el nombre que entra con fuerza.
 *
 * La pieza es una SECUENCIA, no un carrusel:
 *
 *   intro → atleta 1 → atleta 2 → … → la convocatoria completa
 *
 * y avanza sola, como las historias de Instagram: cada atleta tiene su
 * barra de progreso arriba de los controles, se puede pausar (obligatorio
 * para cualquier cosa que se mueva sola más de cinco segundos) y se puede
 * saltar con flechas, teclado, toques a los lados o deslizando.
 *
 *
 * LA COREOGRAFÍA DE CADA ATLETA (los tiempos, en segundos)
 *
 *   0.00  el humo sale de abajo (ver Humo.tsx: ráfaga y reposo)
 *   0.15  la cifra de su categoría, gigante y hueca, se asienta detrás
 *   0.45  el atleta emerge del humo: de desenfocado y sobreexpuesto a
 *         nítido, subiendo 40px
 *   0.70  un barrido de luz roja le cruza el cuerpo — recortado con la
 *         silueta del propio atleta, así que no ilumina el fondo
 *   0.85  el apellido se destapa de abajo arriba
 *   1.20  categoría y marcas, en escalera
 *   2.0+  quietud: el humo se asienta y deriva despacio
 *
 * Con `prefers-reduced-motion` no hay nada de eso: cada escena aparece con
 * un fundido corto, el humo es un fotograma fijo y la presentación NO
 * avanza sola.
 *
 *
 * VÍDEO
 *
 * Si la ficha del atleta trae `video` (ver data/athletes.ts), se reproduce
 * una vez en lugar del recorte y se queda en el último fotograma: el atleta
 * cruzando los brazos. Si el navegador no puede con el formato, sale el
 * recorte.
 */

interface ConvocatoriaProps {
    competicion: Competicion;
    /** Atleta por el que empezar (desde la URL). Sin él, empieza la intro. */
    atletaInicial?: string | null;
    onClose: () => void;
    /** Avisa del atleta en pantalla, para tenerlo en la URL. */
    onCambio?: (slugAtleta: string | null) => void;
    /**
     * Solo dentro de la app (zona del club): al terminar la presentación, la
     * puerta a las apuestas de la Arena para esta competición.
     */
    onArena?: () => void;
}

type Fase = { tipo: 'intro' } | { tipo: 'atleta'; i: number } | { tipo: 'final' };
type Accion = 'siguiente' | 'anterior' | { ir: Fase };

function siguienteFase(f: Fase, accion: Accion, n: number): Fase {
    if (typeof accion === 'object') return accion.ir;
    if (accion === 'siguiente') {
        if (f.tipo === 'intro') return n > 0 ? { tipo: 'atleta', i: 0 } : { tipo: 'final' };
        if (f.tipo === 'atleta') return f.i + 1 < n ? { tipo: 'atleta', i: f.i + 1 } : { tipo: 'final' };
        return f;
    }
    if (f.tipo === 'final') return n > 0 ? { tipo: 'atleta', i: n - 1 } : { tipo: 'intro' };
    if (f.tipo === 'atleta') return f.i > 0 ? { tipo: 'atleta', i: f.i - 1 } : { tipo: 'intro' };
    return f;
}

const DURACION_INTRO = 3200;
const DURACION_ATLETA = 7000;
const SALIDA_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const claveDeFase = (f: Fase) => (f.tipo === 'atleta' ? `a${f.i}` : f.tipo);

export function Convocatoria({ competicion, atletaInicial, onClose, onCambio, onArena }: ConvocatoriaProps) {
    const t = useTextosWeb().convocatoria;
    const { idioma } = useIdioma();
    const reduce = useReducedMotion() ?? false;
    const claseRegistro = useClaseDeRegistro();
    const convocados = competicion.convocados;
    const n = convocados.length;

    // La escena y la ráfaga de humo van juntas en un reductor: cada cambio de
    // escena es una ráfaga nueva, y así no hay forma de que se desacompasen.
    const [{ fase, rafaga }, mover] = useReducer(
        (estado: { fase: Fase; rafaga: number }, accion: Accion) => {
            const nueva = siguienteFase(estado.fase, accion, n);
            return nueva === estado.fase ? estado : { fase: nueva, rafaga: estado.rafaga + 1 };
        },
        undefined,
        () => {
            const i = atletaInicial ? convocados.findIndex((c) => c.slug === atletaInicial) : -1;
            return { fase: (i >= 0 ? { tipo: 'atleta', i } : { tipo: 'intro' }) as Fase, rafaga: 0 };
        }
    );
    // Sin movimiento, la presentación no avanza sola: se pasa a mano.
    const [pausado, setPausado] = useState(reduce);
    const [copiado, setCopiado] = useState(false);

    const raiz = useRef<HTMLDivElement>(null);
    const botonCerrar = useRef<HTMLButtonElement>(null);

    const irA = useCallback((f: Fase) => mover({ ir: f }), []);
    const siguiente = useCallback(() => mover('siguiente'), []);
    const anterior = useCallback(() => mover('anterior'), []);

    // La URL sigue al atleta en pantalla: un enlace copiado abre justo ese.
    const slugEnPantalla = fase.tipo === 'atleta' ? convocados[fase.i]?.slug ?? null : null;
    useEffect(() => {
        onCambio?.(slugEnPantalla);
    }, [slugEnPantalla, onCambio]);

    // Bloqueo del scroll, foco de entrada y devolución del foco al salir.
    useEffect(() => {
        const soltar = lockBodyScroll();
        const previo = document.activeElement as HTMLElement | null;
        botonCerrar.current?.focus({ preventScroll: true });
        return () => {
            soltar();
            previo?.focus?.({ preventScroll: true });
        };
    }, []);

    // Teclado: flechas, espacio, Inicio/Fin, Escape y la trampa del tabulador.
    useEffect(() => {
        const alPulsar = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); return; }
            if (e.key === 'Home') { e.preventDefault(); irA({ tipo: 'intro' }); return; }
            if (e.key === 'End') { e.preventDefault(); irA({ tipo: 'final' }); return; }
            if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
                e.preventDefault();
                setPausado((p) => !p);
                return;
            }
            if (e.key === 'Tab' && raiz.current) {
                const enfocables = raiz.current.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (enfocables.length === 0) return;
                const primero = enfocables[0];
                const ultimo = enfocables[enfocables.length - 1];
                if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
                else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
            }
        };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, [siguiente, anterior, irA, onClose]);

    // Todas las fotos se piden al abrir: al pasar de atleta, la siguiente ya
    // está en la caché y no se ve cargar a trozos.
    useEffect(() => {
        for (const c of convocados) {
            const r = c.ficha?.recorte;
            if (!r) continue;
            const img = new Image();
            img.decoding = 'async';
            img.src = window.innerWidth < 768 ? r.src800 : r.src;
        }
    }, [convocados]);

    // Gestos: deslizar para cambiar, y en móvil, toque en el tercio izquierdo
    // para volver y en el resto para avanzar (como en las historias).
    const gesto = useRef<{ x: number; y: number; t: number } | null>(null);
    const alBajar = (e: ReactPointerEvent) => {
        if ((e.target as HTMLElement).closest('a, button')) return;
        gesto.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const alSubir = (e: ReactPointerEvent) => {
        const g = gesto.current;
        gesto.current = null;
        if (!g || (e.target as HTMLElement).closest('a, button')) return;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) siguiente(); else anterior();
            return;
        }
        const toque = Math.abs(dx) < 10 && Math.abs(dy) < 10 && performance.now() - g.t < 400;
        if (toque && e.pointerType === 'touch') {
            if (e.clientX < window.innerWidth / 3) anterior(); else siguiente();
        }
    };

    const copiarEnlace = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopiado(true);
            window.setTimeout(() => setCopiado(false), 1800);
        } catch {
            /* sin permiso de portapapeles: el enlace sigue en la barra */
        }
    };

    const actual = fase.tipo === 'atleta' ? convocados[fase.i] : null;
    const escritorio = useEsEscritorio();
    const { cartel } = nombreDeCartel(competicion, idioma);
    const anuncio = actual
        ? `${rellenar(t.posicion, { i: (fase as { i: number }).i + 1, n })}: ${actual.ficha?.name ?? actual.nombre}`
        : fase.tipo === 'intro' ? competicion.nombre : t.alineacion;

    return createPortal(
        <m.div
            ref={raiz}
            role="dialog"
            aria-modal="true"
            aria-label={rellenar(t.dialogo, { comp: competicion.nombre })}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.01 : 0.35, ease: SALIDA_EXPO }}
            className={`${claseRegistro} fixed inset-0 z-modal select-none overflow-hidden bg-surface-sunken text-ink`}
            onPointerDown={alBajar}
            onPointerUp={alSubir}
        >
            {/* LA LUZ. Un cono cálido que cae de arriba, como el foco de la
                plataforma, y una brasa roja en el suelo. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        'radial-gradient(55% 60% at 50% -8%, var(--cine-foco), transparent 72%),' +
                        'radial-gradient(80% 45% at 50% 108%, var(--cine-brasa-suave), transparent 70%)',
                }}
            />
            <Humo
                rafaga={rafaga}
                densidad={0.9}
                altura={0.55}
                centro={fase.tipo === 'atleta' && escritorio ? 0.63 : 0.5}
                className="absolute inset-0 h-full w-full"
            />

            <AnimatePresence initial={false} mode="popLayout">
                <m.div
                    key={claveDeFase(fase)}
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0.15 : 0.3, ease: SALIDA_EXPO }}
                >
                    {fase.tipo === 'intro' && (
                        <EscenaIntro competicion={competicion} idioma={idioma} reduce={reduce} onEmpezar={siguiente} />
                    )}
                    {fase.tipo === 'atleta' && actual && (
                        <EscenaAtleta
                            convocado={actual}
                            competicion={competicion}
                            indice={fase.i}
                            total={n}
                            reduce={reduce}
                        />
                    )}
                    {fase.tipo === 'final' && (
                        <EscenaFinal
                            competicion={competicion}
                            reduce={reduce}
                            onAtleta={(i) => irA({ tipo: 'atleta', i })}
                            onRepetir={() => irA({ tipo: 'intro' })}
                            onArena={onArena}
                        />
                    )}
                </m.div>
            </AnimatePresence>

            {/* Lo que oye un lector de pantalla al cambiar de escena. */}
            <p className="sr-only" aria-live="polite">{anuncio}</p>

            {/* CABECERA */}
            <div className="absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-4 px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-10 md:pt-7">
                <div className="min-w-0">
                    <img src="/logo-dark-removebg-preview.png" alt="Anvil Strength" width={96} height={38} className="h-8 w-auto md:h-10" />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        onClick={copiarEnlace}
                        className="hidden h-11 items-center gap-2 rounded-pill border border-[var(--border-default)] px-4 text-t-xs font-bold uppercase tracking-wide text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink sm:inline-flex"
                    >
                        <Link2 size={15} aria-hidden="true" />
                        {copiado ? t.copiado : t.copiar}
                    </button>
                    <button
                        ref={botonCerrar}
                        type="button"
                        onClick={onClose}
                        aria-label={t.cerrar}
                        className="flex h-11 w-11 items-center justify-center rounded-pill bg-white/10 text-ink transition-colors duration-fast ease-snap hover:bg-white/20"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>
            </div>

            {/* CONTROLES: progreso por atleta, anterior, pausa, siguiente */}
            <div className="absolute inset-x-0 bottom-0 z-[2] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-10 md:pb-7">
                {n > 0 && (
                    <div className="mb-3 flex gap-1.5" role="group" aria-label={t.alineacion}>
                        {convocados.map((c, i) => {
                            const estado =
                                fase.tipo === 'final' || (fase.tipo === 'atleta' && i < fase.i)
                                    ? 'hecho'
                                    : fase.tipo === 'atleta' && i === fase.i
                                        ? 'activo'
                                        : 'pendiente';
                            return (
                                <button
                                    key={c.clave}
                                    type="button"
                                    onClick={() => irA({ tipo: 'atleta', i })}
                                    aria-label={rellenar(t.irAAtleta, { nombre: c.ficha?.name ?? c.nombre })}
                                    aria-current={estado === 'activo' ? 'step' : undefined}
                                    className="group/seg flex h-6 flex-1 items-center"
                                >
                                    <span className="relative h-[3px] w-full overflow-hidden rounded-pill bg-white/20">
                                        {estado === 'hecho' && <span className="absolute inset-0 bg-ink" />}
                                        {estado === 'activo' && (
                                            <span
                                                key={`${rafaga}-${i}`}
                                                className="absolute inset-0 origin-left bg-brand"
                                                style={barraProgreso(DURACION_ATLETA, pausado, reduce)}
                                                onAnimationEnd={siguiente}
                                            />
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <BotonRedondo etiqueta={t.anterior} onClick={anterior} disabled={fase.tipo === 'intro'}>
                            <ChevronLeft size={20} aria-hidden="true" />
                        </BotonRedondo>
                        <BotonRedondo etiqueta={pausado ? t.reanudar : t.pausar} onClick={() => setPausado((p) => !p)} disabled={fase.tipo === 'final'}>
                            {pausado ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
                        </BotonRedondo>
                        <BotonRedondo etiqueta={t.siguiente} onClick={siguiente} disabled={fase.tipo === 'final'}>
                            <ChevronRight size={20} aria-hidden="true" />
                        </BotonRedondo>
                    </div>
                    <p className="min-w-0 truncate text-right text-t-xs font-bold uppercase tracking-wide text-ink-subtle">
                        {cartel}
                    </p>
                </div>

                {/* La intro avanza sola con su propio reloj, invisible. */}
                {fase.tipo === 'intro' && (
                    <span
                        key={`intro-${rafaga}`}
                        aria-hidden="true"
                        className="pointer-events-none absolute h-0 w-0"
                        style={barraProgreso(DURACION_INTRO, pausado, reduce)}
                        onAnimationEnd={siguiente}
                    />
                )}
            </div>
        </m.div>,
        document.body
    );
}

/**
 * La barra de progreso es una animación CSS y no un temporizador: así la
 * barra y el avance son la MISMA cosa (avanza cuando la barra se llena) y
 * pausar es cambiar `animation-play-state`, sin llevar la cuenta del tiempo
 * que quedaba.
 */
function barraProgreso(ms: number, pausado: boolean, reduce: boolean): CSSProperties {
    if (reduce) return { transform: 'scaleX(0.5)' };
    return {
        animation: `llenar-barra ${ms}ms linear forwards`,
        animationPlayState: pausado ? 'paused' : 'running',
    };
}

function BotonRedondo({
    etiqueta,
    onClick,
    disabled,
    children,
}: {
    etiqueta: string;
    onClick: () => void;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={etiqueta}
            className="flex h-11 w-11 items-center justify-center rounded-pill border border-[var(--border-default)] bg-surface-sunken/40 text-ink backdrop-blur-sm transition-[border-color,background-color,opacity] duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30"
        >
            {children}
        </button>
    );
}

// =====================================================================
// INTRO
// =====================================================================

function EscenaIntro({
    competicion,
    idioma,
    reduce,
    onEmpezar,
}: {
    competicion: Competicion;
    idioma: 'es' | 'en';
    reduce: boolean;
    onEmpezar: () => void;
}) {
    const t = useTextosWeb().convocatoria;
    const c = useTextosWeb().competiciones;
    const n = competicion.convocados.length;
    const { cartel, oficial } = nombreDeCartel(competicion, idioma);
    const entra = (retraso: number) =>
        reduce
            ? {}
            : {
                initial: { opacity: 0, y: 18 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.8, delay: retraso, ease: SALIDA_EXPO },
            };

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-24 pt-20 text-center">
            <m.p {...entra(0.1)} className="text-t-xs font-bold uppercase tracking-[0.3em] text-ink-muted">
                {t.presenta}
            </m.p>
            <m.h2
                {...(reduce
                    ? {}
                    : {
                        initial: { opacity: 0, scale: 1.08, filter: 'blur(10px)' },
                        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
                        transition: { duration: 1.1, delay: 0.3, ease: SALIDA_EXPO },
                    })}
                className="mt-6 max-w-[16ch] font-display text-[clamp(2.75rem,7.5vw,6rem)] uppercase leading-[0.9] text-balance text-ink"
            >
                {cartel}
            </m.h2>
            {oficial && (
                <m.p {...entra(0.6)} className="mt-4 max-w-[48ch] text-t-sm font-medium text-ink-subtle">
                    {oficial}
                </m.p>
            )}
            <m.p {...entra(0.75)} className="mt-6 text-t-base font-bold uppercase tracking-[0.12em] text-ink-muted md:text-t-lg">
                {competicion.lugar ?? c.lugarPendiente}
                <span className="mx-3 text-brand-text" aria-hidden="true">/</span>
                {formatearFechas(competicion.fecha, competicion.fin, idioma)}
            </m.p>
            <m.p {...entra(1.0)} className="mt-2 font-display text-t-2xl uppercase text-brand-text md:text-t-3xl">
                {n === 1 ? t.atleta : rellenar(t.atletas, { n })}
            </m.p>
            <m.div {...entra(1.25)} className="mt-10">
                <PressButton onClick={onEmpezar}>{t.empezar}</PressButton>
            </m.div>
        </div>
    );
}

// =====================================================================
// UN ATLETA
// =====================================================================

function EscenaAtleta({
    convocado,
    competicion,
    indice,
    total,
    reduce,
}: {
    convocado: Convocado;
    competicion: Competicion;
    indice: number;
    total: number;
    reduce: boolean;
}) {
    const t = useTextosWeb().convocatoria;
    const ficha = convocado.ficha;
    const { nombre, apellidos } = partirNombre(ficha?.name ?? convocado.nombre);
    const { peso, division } = leerCategoria(ficha?.category ?? '');
    const cifra = peso?.replace('-', '') ?? null;
    const stats = ficha?.stats && ficha.stats.total > 0 ? ficha.stats : null;
    const etiquetaCategoria = [division, peso ? `${peso.replace('-', '−')} kg` : null].filter(Boolean).join(' · ');

    const aparece = (retraso: number, extra: object = {}) =>
        reduce
            ? {}
            : {
                initial: { opacity: 0, y: 16, ...extra },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.7, delay: retraso, ease: SALIDA_EXPO },
            };

    return (
        <div className="absolute inset-0">
            {/* La cifra de la categoría, hueca y enorme, detrás de todo. */}
            {cifra && (
                <m.span
                    aria-hidden="true"
                    {...(reduce
                        ? {}
                        : {
                            initial: { opacity: 0, scale: 1.18 },
                            animate: { opacity: 1, scale: 1 },
                            transition: { duration: 1.2, delay: 0.15, ease: SALIDA_EXPO },
                        })}
                    className="pointer-events-none absolute left-1/2 top-[8svh] -translate-x-1/2 font-display leading-[0.8] text-transparent md:left-auto md:right-[5vw] md:top-[10svh] md:translate-x-0"
                    style={{
                        fontSize: 'min(52svh, 38vw)',
                        WebkitTextStroke: '2px oklch(1 0 0 / 0.1)',
                    }}
                >
                    {cifra}
                </m.span>
            )}

            <FiguraAtleta convocado={convocado} reduce={reduce} />

            {/* Velo inferior: funde las piernas con el suelo y da contraste al
                rótulo. Va encima del atleta y debajo del texto. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[60svh] md:h-[34svh]"
                style={{ background: 'linear-gradient(to top, var(--surface-sunken) 30%, transparent)' }}
            />

            {/* EL RÓTULO */}
            <div className="absolute inset-x-0 bottom-[7.5rem] px-6 md:bottom-[9.5rem] md:left-[6vw] md:right-auto md:max-w-[44rem] md:px-0">
                <m.p {...aparece(0.75)} className="text-t-xs font-bold uppercase tracking-[0.24em] text-brand-text">
                    {rellenar(t.posicion, { i: indice + 1, n: total })}
                </m.p>
                <h2 className="mt-2">
                    {nombre && (
                        <m.span {...aparece(0.8)} className="block text-t-xl font-extrabold uppercase tracking-[0.04em] text-ink md:text-t-3xl">
                            {nombre}
                        </m.span>
                    )}
                    <m.span
                        {...(reduce
                            ? {}
                            : {
                                initial: { clipPath: 'inset(0 0 100% 0)', y: 24 },
                                animate: { clipPath: 'inset(0 0 0% 0)', y: 0 },
                                transition: { duration: 0.75, delay: 0.85, ease: SALIDA_EXPO },
                            })}
                        className="block font-display text-[clamp(3.25rem,9vw,7.5rem)] uppercase leading-[0.86] text-ink text-balance"
                    >
                        {apellidos}
                    </m.span>
                </h2>

                <m.p {...aparece(1.15)} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-t-sm font-bold uppercase tracking-[0.14em] text-ink-muted md:text-t-base">
                    <span>{etiquetaCategoria || t.atletaDeAnvil}</span>
                    {ficha?.instagram && (
                        <a
                            href={ficha.instagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center gap-1.5 normal-case tracking-normal text-ink-muted underline-offset-4 transition-colors duration-fast ease-snap hover:text-ink hover:underline"
                        >
                            <Instagram size={15} aria-hidden="true" />
                            {ficha.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
                        </a>
                    )}
                </m.p>

                {stats && (
                    <m.dl {...aparece(1.3)} className="mt-5 grid max-w-[30rem] grid-cols-4 gap-px overflow-hidden rounded-card bg-white/10">
                        {[
                            [t.sentadilla, stats.squat],
                            [t.banca, stats.bench],
                            [t.pesoMuerto, stats.deadlift],
                            [t.total, stats.total],
                        ].map(([etiqueta, valor], i) => (
                            <div key={i} className={`px-3 py-2.5 ${i === 3 ? 'bg-brand text-brand-ink' : 'bg-surface-sunken/70 backdrop-blur-sm'}`}>
                                <dt className={`text-t-2xs font-bold uppercase tracking-wide ${i === 3 ? 'text-brand-ink/80' : 'text-ink-subtle'}`}>
                                    {etiqueta}
                                </dt>
                                <dd className="font-display text-t-2xl leading-none md:text-t-3xl">
                                    {String(valor).replace('.', ',')}
                                </dd>
                            </div>
                        ))}
                    </m.dl>
                )}
                {stats?.lastCompetition?.trim() && (
                    <m.p {...aparece(1.4)} className="mt-2 text-t-xs text-ink-subtle">
                        {rellenar(t.mejorTotal, { comp: stats.lastCompetition.trim() })}
                    </m.p>
                )}
            </div>
            <span className="sr-only">{competicion.nombre}</span>
        </div>
    );
}

/**
 * El atleta en escena: recorte, vídeo o, si no hay ninguno de los dos, su
 * foto normal fundida en negro por los bordes.
 */
function FiguraAtleta({ convocado, reduce }: { convocado: Convocado; reduce: boolean }) {
    const ficha = convocado.ficha;
    const recorte = ficha?.recorte;
    const [videoFallo, setVideoFallo] = useState(false);
    const video = ficha?.video && (ficha.video.webm || ficha.video.mov) && !videoFallo ? ficha.video : null;

    const escala = recorte?.encuadre?.escala ?? 1;
    const bajar = recorte?.encuadre?.bajar ?? 0;
    const proporcion = recorte ? recorte.ancho / recorte.alto : 0.75;

    // La silueta del propio atleta como máscara del barrido de luz.
    const mascara = useMemo<CSSProperties | undefined>(() => {
        if (!recorte || video) return undefined;
        const url = `url("${recorte.src800}")`;
        return {
            maskImage: url,
            WebkitMaskImage: url,
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
        };
    }, [recorte, video]);

    const emerge = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 40, scale: 1.06, filter: 'blur(14px) brightness(1.9)' },
            animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px) brightness(1)' },
            transition: { duration: 1.05, delay: 0.45, ease: SALIDA_EXPO },
        };

    if (!recorte && !video) {
        const foto = ficha?.image ?? convocado.avatar;
        if (!foto) return null;
        return (
            <m.div
                {...emerge}
                className="absolute bottom-[14svh] left-1/2 aspect-[3/4] h-[58svh] -translate-x-1/2 md:left-[62%]"
                style={{
                    maskImage: 'radial-gradient(ellipse 60% 62% at 50% 45%, black 45%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 60% 62% at 50% 45%, black 45%, transparent 100%)',
                }}
            >
                <img src={foto} alt={convocado.nombre} className="h-full w-full object-cover" draggable={false} />
            </m.div>
        );
    }

    // Alto en escena: el del escenario por la escala de la ficha. El ancho
    // sale de la proporción de la foto para que la máscara del barrido case
    // píxel a píxel con la imagen.
    const alto = `calc(86svh * ${escala})`;

    return (
        <div
            className="pointer-events-none absolute bottom-0 left-1/2 md:left-[63%]"
            style={{ height: alto, aspectRatio: String(proporcion), transform: `translate(-50%, ${bajar * 100}%)` }}
        >
            <m.div {...emerge} className="relative h-full w-full">
                {video ? (
                    <video
                        className="h-full w-full object-contain object-bottom"
                        autoPlay
                        muted
                        playsInline
                        preload="auto"
                        poster={recorte?.src}
                        onError={() => setVideoFallo(true)}
                        aria-label={convocado.ficha?.name ?? convocado.nombre}
                    >
                        {video.mov && <source src={video.mov} type='video/mp4; codecs="hvc1"' />}
                        {video.webm && <source src={video.webm} type="video/webm" />}
                    </video>
                ) : (
                    <picture>
                        <source media="(max-width: 767px)" srcSet={recorte!.src800} />
                        <img
                            src={recorte!.src}
                            alt={convocado.ficha?.name ?? convocado.nombre}
                            className="h-full w-full object-contain object-bottom"
                            draggable={false}
                            decoding="async"
                            fetchPriority="high"
                        />
                    </picture>
                )}

                {/* Barrido de luz, recortado con la silueta. */}
                {mascara && !reduce && (
                    <div aria-hidden="true" className="absolute inset-0 overflow-hidden" style={mascara}>
                        <m.div
                            className="absolute inset-y-0 w-[70%]"
                            style={{
                                background:
                                    'linear-gradient(100deg, transparent 0%, oklch(0.72 0.19 25 / 0.0) 30%, oklch(0.78 0.17 30 / 0.55) 50%, oklch(0.72 0.19 25 / 0.0) 70%, transparent 100%)',
                                mixBlendMode: 'screen',
                            }}
                            initial={{ x: '-120%' }}
                            animate={{ x: '160%' }}
                            transition={{ duration: 1.1, delay: 0.7, ease: [0.45, 0, 0.2, 1] }}
                        />
                    </div>
                )}
            </m.div>
        </div>
    );
}

// =====================================================================
// LA CONVOCATORIA COMPLETA
// =====================================================================

function EscenaFinal({
    competicion,
    reduce,
    onAtleta,
    onRepetir,
    onArena,
}: {
    competicion: Competicion;
    reduce: boolean;
    onAtleta: (i: number) => void;
    onRepetir: () => void;
    onArena?: () => void;
}) {
    const t = useTextosWeb().convocatoria;
    const { idioma } = useIdioma();
    const { cartel } = nombreDeCartel(competicion, idioma);
    const convocados = competicion.convocados;

    // Lo que se ve de cada recorte por encima del suelo: la escala menos lo
    // que su ficha esconde por debajo (`bajar`). El más alto llena el hueco
    // y los demás se miden contra él.
    const visible = (c: (typeof convocados)[number]) => {
        const r = c.ficha?.recorte;
        return r ? (r.encuadre?.escala ?? 1) * (1 - (r.encuadre?.bajar ?? 0)) : 0.8;
    };
    const masAlto = Math.max(0.01, ...convocados.map(visible));

    /*
     * Octubre de 2026: el título iba en posición absoluta y las figuras se
     * apilaban desde abajo con la altura ENTERA del recorte (46svh × escala;
     * Pau Rodríguez, con escala 1,42, pedía 65svh). En cuanto había un recorte
     * alto, la fila crecía hacia arriba y las fotos se montaban encima del
     * título. Ahora el título va en el flujo y las figuras viven en el hueco
     * que queda (`flex-1`), escaladas a ese hueco: no pueden subir más.
     */
    return (
        <div className="absolute inset-0 flex flex-col items-center px-4 pb-36 pt-20 md:pb-40 md:pt-24">
            <m.h2
                {...(reduce
                    ? {}
                    : {
                        initial: { opacity: 0, y: 16 },
                        animate: { opacity: 1, y: 0 },
                        transition: { duration: 0.7, delay: 0.1, ease: SALIDA_EXPO },
                    })}
                className="relative z-[1] max-w-[22ch] shrink-0 px-2 text-center font-display text-[clamp(2.25rem,5.5vw,4.5rem)] uppercase leading-[0.92] text-balance text-ink"
            >
                {t.alineacion}
                <span className="mt-2 block font-sans text-t-sm font-bold uppercase tracking-[0.12em] text-ink-muted md:text-t-base">
                    {cartel}
                </span>
            </m.h2>

            <div className="mt-4 flex min-h-0 w-full max-w-[1200px] flex-1 items-stretch justify-center md:mt-6">
                {convocados.map((c, i) => {
                    const r = c.ficha?.recorte;
                    const escala = r?.encuadre?.escala ?? 1;
                    const { apellidos, nombre } = partirNombre(c.ficha?.name ?? c.nombre);
                    return (
                        <m.button
                            key={c.clave}
                            type="button"
                            onClick={() => onAtleta(i)}
                            aria-label={rellenar(t.irAAtleta, { nombre: c.ficha?.name ?? c.nombre })}
                            {...(reduce
                                ? {}
                                : {
                                    initial: { opacity: 0, y: 30, filter: 'blur(8px)' },
                                    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
                                    transition: { duration: 0.9, delay: 0.25 + i * 0.12, ease: SALIDA_EXPO },
                                })}
                            className="group/fig relative -mx-[2vw] flex min-w-0 flex-1 flex-col items-center"
                            style={{ maxWidth: `${Math.min(34, 100 / Math.max(convocados.length, 1) + 8)}vw` }}
                        >
                            <div
                                className="relative min-h-0 w-full flex-1 transition-transform duration-slow ease-snap group-hover/fig:-translate-y-2"
                                style={{
                                    // Recorta por debajo del suelo, nunca por los lados.
                                    overflowX: 'visible',
                                    overflowY: 'clip',
                                    maskImage: 'linear-gradient(to top, transparent 0%, black 22%)',
                                    WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 22%)',
                                }}
                            >
                                {r ? (
                                    // `top` deja asomar solo la parte visible; lo que
                                    // la ficha esconde bajo el suelo lo corta el clip.
                                    <img
                                        src={r.src800}
                                        alt=""
                                        className="absolute left-1/2 w-auto max-w-none -translate-x-1/2 object-contain object-top"
                                        style={{
                                            top: `${(1 - visible(c) / masAlto) * 100}%`,
                                            height: `${(escala / masAlto) * 100}%`,
                                        }}
                                        draggable={false}
                                    />
                                ) : (
                                    <span className="absolute inset-x-0 bottom-[20%] mx-auto flex aspect-square w-[60%] items-center justify-center rounded-pill bg-surface-raised font-display text-t-4xl text-ink-muted">
                                        {(c.ficha?.name ?? c.nombre).charAt(0)}
                                    </span>
                                )}
                            </div>
                            <span className="relative z-[1] -mt-6 block text-t-xs font-bold uppercase tracking-[0.14em] text-ink-muted">
                                {nombre}
                            </span>
                            <span className="relative z-[1] block max-w-full truncate px-1 font-display text-[clamp(1.5rem,3vw,2.5rem)] uppercase leading-none text-ink transition-colors duration-fast ease-snap group-hover/fig:text-brand-text">
                                {apellidos}
                            </span>
                        </m.button>
                    );
                })}
            </div>

            <m.div
                {...(reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.8 } })}
                className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-6"
            >
                {onArena && <PressButton onClick={onArena} size="md">{t.apostar}</PressButton>}
                <button
                    type="button"
                    onClick={onRepetir}
                    className="inline-flex min-h-[44px] items-center gap-2 text-t-sm font-bold uppercase tracking-wide text-ink-muted underline-offset-8 transition-colors duration-fast ease-snap hover:text-ink hover:underline"
                >
                    <RotateCcw size={15} aria-hidden="true" />
                    {t.repetir}
                </button>
            </m.div>
        </div>
    );
}

/** ¿Pantalla de escritorio (≥ 768px)? Cambia al girar o redimensionar. */
function useEsEscritorio(): boolean {
    const [es, setEs] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)');
        const alCambiar = () => setEs(mq.matches);
        mq.addEventListener('change', alCambiar);
        return () => mq.removeEventListener('change', alCambiar);
    }, []);
    return es;
}
