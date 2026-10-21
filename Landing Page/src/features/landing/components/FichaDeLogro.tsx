import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Trophy, X } from 'lucide-react';
import { SafeImage } from '../../../components/ui/SafeImage';
import { useClaseDeRegistro } from '../../../components/layout/RegistroMarca';
import { lockBodyScroll } from '../../../lib/scrollLock';
import type { Achievement } from '../../../data/achievements';
import { rellenar, useTextosWeb } from '../textos';

/**
 * LA FICHA DE UN LOGRO — a pantalla completa
 * =====================================================================
 *
 * Antes era el `Modal` del sistema: una ventana gris de la app con el título
 * en la barra, una foto apaisada que recortaba cabezas y el resultado en una
 * línea de texto. Se leía como un formulario, no como un podio.
 *
 * Ahora usa el mismo registro que la convocatoria: escenario negro, la propia
 * foto desenfocada de fondo (así cada logro tiene su color), la foto entera a
 * un lado y, al otro, el RESULTADO en grande, que es lo que se viene a ver.
 * En el móvil, la foto arriba y el texto debajo.
 *
 * Conserva lo que el `Modal` daba gratis: Escape, trampa de foco, foco
 * devuelto al cerrar y bloqueo del scroll. Las fotos se pasan con flechas,
 * con el teclado o deslizando.
 */

const SALIDA_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface FichaDeLogroProps {
    logro: Achievement | null;
    onClose: () => void;
}

export function FichaDeLogro({ logro, onClose }: FichaDeLogroProps) {
    // Se retiene el último logro para que la salida tenga contenido: al
    // cerrar, el padre pasa a `null` en el mismo instante.
    const [mostrado, setMostrado] = useState<Achievement | null>(logro);
    const [anterior, setAnterior] = useState(logro);
    if (anterior !== logro) {
        setAnterior(logro);
        if (logro) setMostrado(logro);
    }

    return createPortal(
        <AnimatePresence>
            {logro && mostrado && <Escena key={String(mostrado.id)} logro={mostrado} onClose={onClose} />}
        </AnimatePresence>,
        document.body
    );
}

function Escena({ logro, onClose }: { logro: Achievement; onClose: () => void }) {
    const c = useTextosWeb().logros;
    const reduce = useReducedMotion() ?? false;
    const registro = useClaseDeRegistro();
    const raiz = useRef<HTMLDivElement>(null);
    const cerrar = useRef<HTMLButtonElement>(null);
    const [i, setI] = useState(0);

    const fotos = logro.images.filter(Boolean);
    const varias = fotos.length > 1;
    const ir = useCallback(
        (dir: 1 | -1) => setI((x) => (x + dir + fotos.length) % fotos.length),
        [fotos.length]
    );

    useEffect(() => {
        const soltar = lockBodyScroll();
        const previo = document.activeElement as HTMLElement | null;
        cerrar.current?.focus({ preventScroll: true });
        return () => {
            soltar();
            previo?.focus?.({ preventScroll: true });
        };
    }, []);

    useEffect(() => {
        const alPulsar = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
            if (varias && e.key === 'ArrowRight') { e.preventDefault(); ir(1); return; }
            if (varias && e.key === 'ArrowLeft') { e.preventDefault(); ir(-1); return; }
            if (e.key === 'Tab' && raiz.current) {
                const enfocables = raiz.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
                if (enfocables.length === 0) return;
                const primero = enfocables[0];
                const ultimo = enfocables[enfocables.length - 1];
                if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
                else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
            }
        };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, [ir, varias, onClose]);

    const entra = (retraso: number) =>
        reduce
            ? {}
            : {
                initial: { opacity: 0, y: 18 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.7, delay: retraso, ease: SALIDA_EXPO },
            };

    const foto = fotos[i];

    return (
        <m.div
            ref={raiz}
            role="dialog"
            aria-modal="true"
            aria-label={`${logro.title} — ${logro.result}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.01 : 0.3, ease: SALIDA_EXPO }}
            className={`${registro} fixed inset-0 z-modal overflow-y-auto overscroll-contain bg-surface-sunken text-ink md:overflow-hidden`}
        >
            {/* La propia foto, desenfocada, como luz de fondo. */}
            {foto && (
                <div aria-hidden="true" className="pointer-events-none fixed inset-0">
                    <AnimatePresence initial={false}>
                        <m.img
                            key={foto}
                            src={foto}
                            alt=""
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.35 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.6 }}
                            className="absolute inset-0 h-full w-full scale-125 object-cover blur-3xl saturate-150"
                        />
                    </AnimatePresence>
                    <div className="absolute inset-0 bg-gradient-to-b from-surface-sunken/40 via-surface-sunken/70 to-surface-sunken" />
                </div>
            )}

            <button
                ref={cerrar}
                type="button"
                onClick={onClose}
                aria-label={c.cerrar}
                className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-[3] flex h-11 w-11 items-center justify-center rounded-pill bg-surface-sunken/60 text-ink backdrop-blur-md transition-colors duration-fast ease-snap hover:bg-white/20 md:right-8 md:top-8"
            >
                <X size={20} aria-hidden="true" />
            </button>

            <div className="relative mx-auto grid min-h-full w-full max-w-[1240px] grid-cols-1 md:h-full md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-center md:gap-14 md:px-10 md:py-12">
                {/* LA FOTO, entera: `contain` en escritorio para no cortar a
                    nadie del podio; en el móvil llena el ancho. */}
                <m.figure
                    {...(reduce
                        ? {}
                        : {
                            initial: { opacity: 0, scale: 1.04 },
                            animate: { opacity: 1, scale: 1 },
                            transition: { duration: 0.8, ease: SALIDA_EXPO },
                        })}
                    className="group/foto relative h-[58svh] w-full overflow-hidden bg-black/30 md:h-[76svh] md:rounded-sheet"
                >
                    <AnimatePresence initial={false} mode="popLayout">
                        <m.div
                            key={i}
                            className="absolute inset-0"
                            initial={reduce ? false : { opacity: 0, x: 40 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -40 }}
                            transition={{ duration: 0.32, ease: SALIDA_EXPO }}
                            drag={varias ? 'x' : false}
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.12}
                            onDragEnd={(_, info) => {
                                if (info.offset.x < -50) ir(1);
                                if (info.offset.x > 50) ir(-1);
                            }}
                        >
                            <SafeImage
                                src={foto}
                                alt={`${logro.title} — ${logro.result}`}
                                draggable={false}
                                className={`h-full w-full object-cover md:object-contain ${varias ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                fallback={
                                    <div className="flex h-full w-full items-center justify-center">
                                        <Trophy className="h-14 w-14 text-ink-faint" aria-hidden="true" />
                                    </div>
                                }
                            />
                        </m.div>
                    </AnimatePresence>

                    {/* Funde la foto con el texto en el móvil. */}
                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface-sunken to-transparent md:hidden" />

                    {varias && (
                        <>
                            <span className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] rounded-pill bg-surface-sunken/60 px-3 py-1.5 font-mono text-t-2xs font-semibold tracking-[0.12em] text-ink backdrop-blur-md md:top-4">
                                {String(i + 1).padStart(2, '0')} / {String(fotos.length).padStart(2, '0')}
                            </span>
                            <button
                                type="button"
                                onClick={() => ir(-1)}
                                aria-label={c.fotoAnterior}
                                className="absolute left-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-sunken/60 text-ink opacity-0 backdrop-blur-md transition-[opacity,background-color] duration-fast ease-snap hover:bg-brand hover:text-brand-ink focus-visible:opacity-100 group-hover/foto:opacity-100 md:flex"
                            >
                                <ChevronLeft size={22} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => ir(1)}
                                aria-label={c.fotoSiguiente}
                                className="absolute right-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-pill bg-surface-sunken/60 text-ink opacity-0 backdrop-blur-md transition-[opacity,background-color] duration-fast ease-snap hover:bg-brand hover:text-brand-ink focus-visible:opacity-100 group-hover/foto:opacity-100 md:flex"
                            >
                                <ChevronRight size={22} aria-hidden="true" />
                            </button>
                        </>
                    )}
                </m.figure>

                {/* EL RÓTULO */}
                <div className="relative px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-2 md:px-0 md:pb-0 md:pt-0">
                    <m.p {...entra(0.15)} className="font-mono text-t-2xs font-semibold uppercase tracking-[0.24em] text-ink-subtle">
                        {c.resultado}
                    </m.p>
                    <m.p
                        {...(reduce
                            ? {}
                            : {
                                initial: { opacity: 0, y: 24, clipPath: 'inset(0 0 100% 0)' },
                                animate: { opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' },
                                transition: { duration: 0.8, delay: 0.22, ease: SALIDA_EXPO },
                            })}
                        className="mt-3 font-display text-[clamp(2.75rem,6vw,5rem)] uppercase leading-[0.88] text-brand-text text-balance"
                    >
                        {logro.result}
                    </m.p>
                    <m.h2 {...entra(0.35)} className="mt-5 text-t-xl font-extrabold uppercase leading-tight tracking-[0.02em] text-ink md:text-t-2xl">
                        {logro.title}
                    </m.h2>
                    <m.div {...entra(0.42)} aria-hidden="true" className="mt-6 h-px w-16 bg-brand" />
                    {logro.desc && (
                        <m.p {...entra(0.5)} className="mt-6 max-w-[46ch] text-t-base leading-relaxed text-ink-muted md:text-t-lg">
                            {logro.desc}
                        </m.p>
                    )}

                    {varias && (
                        <m.div {...entra(0.6)} className="mt-8">
                            <p className="font-mono text-t-2xs font-semibold uppercase tracking-[0.2em] text-ink-subtle">
                                {rellenar(c.fotos, { n: fotos.length })}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {fotos.map((src, k) => (
                                    <button
                                        key={src}
                                        type="button"
                                        onClick={() => setI(k)}
                                        aria-label={rellenar(c.verFoto, { i: k + 1, n: fotos.length })}
                                        aria-current={k === i}
                                        className={`h-16 w-16 overflow-hidden rounded-card ring-2 ring-offset-2 ring-offset-surface-sunken transition-[opacity,box-shadow] duration-fast ease-snap ${k === i ? 'opacity-100 ring-brand' : 'opacity-50 ring-transparent hover:opacity-90'}`}
                                    >
                                        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
                                    </button>
                                ))}
                            </div>
                        </m.div>
                    )}
                </div>
            </div>
        </m.div>
    );
}
