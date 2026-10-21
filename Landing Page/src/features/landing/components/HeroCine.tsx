import { useNavigate } from 'react-router-dom';
import { m, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useClubWeb } from '../../../services/clubWebService';
import { SmartAuthButton } from '../../../components/ui/SmartAuthButton';
import type { UserProfile } from '../../../hooks/useUser';
import { useIdioma } from '../../../hooks/useIdioma';
import { Humo } from './Humo';
import { PressButton } from './landingKit';
import { useCompeticionesPublicas } from '../hooks/useCompeticionesPublicas';
import { cuentaAtras, formatearFechas, nombreDeCartel } from '../lib/competiciones';
import { rellenar, useTextosWeb } from '../textos';

/**
 * LA PORTADA — EL ESCENARIO
 * =====================================================================
 *
 * Antes: un collage de fotos de competición en gris, con un velo encima y
 * el nombre en el centro. Se entendía, pero no se recordaba.
 *
 * Ahora la primera pantalla es una presentación de equipo: los atletas del
 * club recortados, de pie en un escenario negro con el foco cayendo desde
 * arriba, humo en el suelo y el nombre del club, gigante y hueco, detrás de
 * ellos. Debajo, el nombre de verdad, el lema y las dos puertas.
 *
 * Y en la esquina, la PRÓXIMA CITA: la competición que viene, con la cuenta
 * de días y un enlace directo a su convocatoria. Es la forma de que lo
 * primero que vea alguien que no nos conoce sea que este club compite, y
 * con quién.
 *
 * Los atletas salen de `data/athletes.ts`: los que tienen `recorte`, en el
 * orden de `ALINEACION`. Para cambiar quién sale, se cambia esa lista.
 */

/**
 * Quién sale en la portada, de izquierda a derecha. El centro va delante.
 *
 * Octubre de 2026: solo los dos con foto buena y reciente. Los recortes de
 * Pau Camacho y Alejandro salían de fotos pequeñas y se veían pixelados al
 * lado de los otros; vuelven cuando haya fotos de calidad (siguen en la
 * convocatoria, donde salen de uno en uno).
 */
const ALINEACION = ['pau-rodriguez', 'marc-alonso'];

const SALIDA_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface HeroCineProps {
    user?: UserProfile | null;
    onLoginClick: () => void;
    onSignupClick?: () => void;
    onYaTengoCuenta: () => void;
}

export function HeroCine({ user, onLoginClick, onSignupClick, onYaTengoCuenta }: HeroCineProps) {
    const t = useTextosWeb().portada;
    const reduce = useReducedMotion() ?? false;
    const { athletes } = useClubWeb();

    const plantilla = ALINEACION
        .map((slug) => athletes.find((a) => a.slug === slug))
        .filter((a): a is (typeof athletes)[number] => !!a?.recorte);
    const centro = (plantilla.length - 1) / 2;

    return (
        <section className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden bg-surface-sunken">
            {/* Foco desde arriba y brasa en el suelo. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                    background:
                        'radial-gradient(42% 70% at 50% -12%, var(--cine-foco), transparent 74%),' +
                        'radial-gradient(75% 38% at 50% 106%, var(--cine-brasa-suave), transparent 72%)',
                }}
            />

            {/* El nombre del club, gigante y hueco, detrás de todo. */}
            <m.span
                aria-hidden="true"
                {...(reduce
                    ? {}
                    : {
                        initial: { opacity: 0, scale: 1.12 },
                        animate: { opacity: 1, scale: 1 },
                        transition: { duration: 1.6, ease: SALIDA_EXPO },
                    })}
                className="pointer-events-none absolute inset-x-0 top-[9svh] -z-10 select-none text-center font-display uppercase leading-[0.8] text-transparent md:top-[7svh]"
                style={{ fontSize: 'min(40vw, 62svh)', WebkitTextStroke: '2px oklch(1 0 0 / 0.085)' }}
            >
                Anvil
            </m.span>

            <Humo densidad={0.6} altura={0.42} className="absolute inset-0 -z-10 h-full w-full" />

            {/* LA ALINEACIÓN. El del centro, delante y más grande; los de los
                lados, un paso atrás. En el móvil sobran los extremos. */}
            {plantilla.length > 0 && (
                <div
                    role="img"
                    aria-label={t.equipoAlt}
                    className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex h-[64svh] items-end justify-center md:h-[100svh]"
                    // En el móvil, con dos (que no se esconden como los
                    // extremos de cuatro), a 46svh no caben de ancho.
                    style={{ ['--alto-movil' as string]: plantilla.length <= 2 ? '38svh' : '46svh' }}
                >
                    {plantilla.map((a, i) => {
                        const r = a.recorte!;
                        const distancia = Math.abs(i - centro);
                        const lateral = distancia >= 1.5;
                        const paso = 1 - Math.min(distancia, 2) * 0.07;
                        // Los de los lados, un punto más oscuros: están fuera del foco.
                        const brillo = distancia >= 1 ? 0.78 : 1;
                        return (
                            <m.img
                                key={a.id}
                                src={r.src800}
                                srcSet={`${r.src800} 800w, ${r.src} 1600w`}
                                sizes="(max-width: 767px) 45vw, 26vw"
                                alt=""
                                draggable={false}
                                fetchPriority={distancia < 1 ? 'high' : 'auto'}
                                {...(reduce
                                    ? {}
                                    : {
                                        initial: { opacity: 0, y: 50, filter: 'blur(12px) brightness(1.8)' },
                                        animate: { opacity: 1, y: 0, filter: `blur(0px) brightness(${brillo})` },
                                        transition: { duration: 1.2, delay: 0.25 + distancia * 0.18, ease: SALIDA_EXPO },
                                    })}
                                className={`relative -mx-[3.5vw] h-[calc(var(--alto-movil)*var(--escala))] w-auto max-w-none object-contain object-bottom mb-[calc(-1*var(--alto-movil)*var(--escala)*var(--bajar))] md:-mx-[0.6vw] md:h-[calc(64svh*var(--escala))] md:mb-[calc(-64svh*var(--escala)*var(--bajar))] ${lateral ? 'hidden sm:block' : ''}`}
                                style={{
                                    ['--escala' as string]: (r.encuadre?.escala ?? 1) * paso,
                                    ['--bajar' as string]: r.encuadre?.bajar ?? 0,
                                    zIndex: 10 - Math.round(distancia * 2),
                                    filter: reduce ? `brightness(${brillo})` : undefined,
                                    maskImage: 'linear-gradient(to top, transparent 0%, black 30%)',
                                    WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 30%)',
                                }}
                            />
                        );
                    })}
                </div>
            )}

            {/* Velo de abajo: funde las piernas con el suelo y da al rótulo el
                contraste que necesita. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10"
                style={{ background: 'linear-gradient(to top, var(--surface-sunken) 24%, oklch(0.1 0.004 25 / 0.55) 42%, transparent 62%)' }}
            />

            <div className="mx-auto w-full max-w-[1180px] px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[60svh] text-center md:px-10 md:pb-14 md:pt-0">
                <m.h1
                    {...(reduce
                        ? {}
                        : {
                            initial: { opacity: 0, y: 28, clipPath: 'inset(0 0 100% 0)' },
                            animate: { opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' },
                            transition: { duration: 0.9, delay: 0.7, ease: SALIDA_EXPO },
                        })}
                    className="font-display text-[clamp(3.25rem,9vw,6rem)] uppercase leading-[0.88] text-ink"
                >
                    Anvil Strength
                </m.h1>
                <m.p
                    {...(reduce
                        ? {}
                        : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay: 0.95, ease: SALIDA_EXPO } })}
                    className="mt-3 font-display text-[clamp(1.25rem,3vw,1.9rem)] uppercase leading-none tracking-[0.04em] text-brand-text"
                >
                    {t.lema}
                </m.p>
                <m.p
                    {...(reduce
                        ? {}
                        : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.7, delay: 1.1 } })}
                    className="mt-4 text-t-sm font-bold uppercase tracking-[0.14em] text-ink-muted"
                >
                    {t.subtitulo}
                </m.p>

                <m.div
                    {...(reduce
                        ? {}
                        : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay: 1.2, ease: SALIDA_EXPO } })}
                    className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
                >
                    {!user ? (
                        <PressButton onClick={onSignupClick ?? onLoginClick} className="w-full sm:w-auto">
                            {t.crearCuenta}
                        </PressButton>
                    ) : (
                        <SmartAuthButton variant="primary" onLoginClick={onLoginClick} className="w-full sm:w-auto" />
                    )}
                    <button
                        type="button"
                        onClick={onYaTengoCuenta}
                        className="min-h-[44px] text-t-sm font-bold uppercase tracking-wide text-ink-muted underline-offset-8 transition-colors duration-fast ease-snap hover:text-ink hover:underline"
                    >
                        {t.yaTengoCuenta}
                    </button>
                </m.div>

                <ProximaCita />
            </div>
        </section>
    );
}

/**
 * La próxima competición, en una línea: nombre, fechas, cuenta de días y la
 * puerta a la convocatoria. Si no hay ninguna anunciada, no se pinta nada.
 */
function ProximaCita() {
    const t = useTextosWeb().portada;
    const { idioma } = useIdioma();
    const navigate = useNavigate();
    const reduce = useReducedMotion() ?? false;
    const { data } = useCompeticionesPublicas();
    const siguiente = data?.[0];
    if (!siguiente) return null;

    const { cartel } = nombreDeCartel(siguiente, idioma);
    const dias = cuentaAtras(siguiente.fecha).dias;
    const cuando = dias <= 0 ? t.hoy : dias === 1 ? t.enUnDia : rellenar(t.enDias, { n: dias });
    const destino = `/competiciones?convocatoria=${encodeURIComponent(siguiente.slug)}`;

    return (
        <m.a
            href={destino}
            onClick={(e) => { e.preventDefault(); navigate(destino); }}
            {...(reduce
                ? {}
                : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay: 1.45, ease: SALIDA_EXPO } })}
            className="group mx-auto mt-10 flex max-w-[44rem] items-center gap-4 rounded-pill border border-[var(--border-default)] bg-surface-sunken/60 py-2 pl-5 pr-2 text-left backdrop-blur-md transition-colors duration-fast ease-snap hover:border-brand md:absolute md:bottom-14 md:left-10 md:mt-0 md:max-w-[24rem] lg:left-[max(2.5rem,calc((100vw-1180px)/2))]"
        >
            <span className="min-w-0 flex-1">
                <span className="block text-t-2xs font-bold uppercase tracking-[0.2em] text-brand-text">
                    {t.proxima} · {cuando}
                </span>
                <span className="block truncate font-display text-t-lg uppercase leading-tight text-ink">{cartel}</span>
                <span className="block truncate text-t-xs text-ink-muted">
                    {siguiente.lugar ? `${siguiente.lugar} · ` : ''}
                    {formatearFechas(siguiente.fecha, siguiente.fin, idioma)}
                </span>
            </span>
            <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-brand text-brand-ink transition-transform duration-fast ease-snap group-hover:translate-x-0.5"
                aria-hidden="true"
            >
                <ArrowRight size={18} />
            </span>
            <span className="sr-only">{t.verConvocatoria}</span>
        </m.a>
    );
}
