import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { ArrowRight, MapPin, Trophy } from 'lucide-react';
import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { SafeImage } from '../../../components/ui/SafeImage';
import { UserProfile } from '../../../hooks/useUser';
import { useSeo } from '../../../hooks/useSeo';
import { useIdioma } from '../../../hooks/useIdioma';
import { useClubWeb } from '../../../services/clubWebService';
import { partirNombre } from '../../../lib/atletas';
import { Humo } from '../components/Humo';
import { PressButton, Reveal, StaggerItem, StaggerList } from '../components/landingKit';
import { Convocatoria } from '../components/convocatoria/Convocatoria';
import { useCompeticionesPublicas } from '../hooks/useCompeticionesPublicas';
import {
    cuentaAtras,
    formatearFechas,
    nombreDeCartel,
    type Competicion,
} from '../lib/competiciones';
import { logroEn, rellenar, useTextosWeb } from '../textos';

/**
 * COMPETICIONES — dónde compite el equipo y quién va
 * =====================================================================
 *
 * La página tiene tres piezas, en este orden de importancia:
 *
 *   1. LA SIGUIENTE. A pantalla casi completa: los atletas convocados
 *      recortados sobre el escenario, el nombre de la competición, la
 *      cuenta atrás y la puerta a la convocatoria. Es lo que se viene a ver.
 *   2. DESPUÉS. El resto del calendario como una lista de jornadas — fecha,
 *      competición, lugar, quién va—, no como tarjetas apiladas: es un
 *      calendario y se lee como un calendario.
 *   3. RESULTADOS. Lo último que ha ganado el club, con foto.
 *
 * La convocatoria se abre con `?convocatoria=<slug>` y el atleta en pantalla
 * va en `&atleta=<slug>`: el enlace se puede compartir y abre justo ahí.
 */

interface CompetitionsPageProps {
    onLoginClick: () => void;
    onSignupClick?: () => void;
    user?: UserProfile | null;
}

export function CompetitionsPage({ onLoginClick, onSignupClick }: CompetitionsPageProps) {
    const textos = useTextosWeb();
    const c = textos.competiciones;
    const { idioma } = useIdioma();

    useSeo({
        title: c.seoTitulo,
        description: c.seoDescripcion,
        canonical: 'https://anvilstrength.es/competiciones',
    });

    const consulta = useCompeticionesPublicas();
    const competiciones = consulta.data ?? [];
    const [siguiente, ...despues] = competiciones;

    const [params, setParams] = useSearchParams();
    const slugAbierta = params.get('convocatoria');
    const abierta = slugAbierta ? competiciones.find((x) => x.slug === slugAbierta) ?? null : null;

    const abrir = (slug: string) => {
        setParams((p) => {
            const n = new URLSearchParams(p);
            n.set('convocatoria', slug);
            n.delete('atleta');
            return n;
        });
    };
    const cerrar = useCallback(() => {
        setParams((p) => {
            const n = new URLSearchParams(p);
            n.delete('convocatoria');
            n.delete('atleta');
            return n;
        }, { replace: true });
    }, [setParams]);
    const alCambiarAtleta = useCallback((slug: string | null) => {
        setParams((p) => {
            if ((p.get('atleta') ?? null) === slug) return p;
            const n = new URLSearchParams(p);
            if (slug) n.set('atleta', slug); else n.delete('atleta');
            return n;
        }, { replace: true });
    }, [setParams]);

    const { achievements } = useClubWeb();
    const resultados = achievements.map((a) => logroEn(a, idioma)).slice(0, 6);

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-sunken font-sans text-ink">
            <PublicHeader onLoginClick={onLoginClick} onSignupClick={onSignupClick} />

            <main>
                {consulta.isPending ? (
                    <CabeceraVacia titulo={c.titulo} texto={c.cargando} cargando />
                ) : consulta.isError ? (
                    <CabeceraVacia
                        titulo={c.titulo}
                        texto={c.error}
                        accion={<PressButton onClick={() => consulta.refetch()} size="md">{c.reintentar}</PressButton>}
                    />
                ) : !siguiente ? (
                    <CabeceraVacia titulo={c.vacioTitulo} texto={c.vacioTexto} />
                ) : (
                    <LaSiguiente competicion={siguiente} onAbrir={() => abrir(siguiente.slug)} />
                )}

                {despues.length > 0 && (
                    <section aria-labelledby="calendario" className="mx-auto w-full max-w-[1180px] px-6 py-20 md:px-10 md:py-28">
                        <Reveal>
                            <h2 id="calendario" className="font-display text-[clamp(2.5rem,5vw,4rem)] uppercase leading-none text-ink">
                                {c.calendario}
                            </h2>
                        </Reveal>
                        <StaggerList className="mt-10 border-t border-[var(--border-default)]">
                            {despues.map((comp) => (
                                <StaggerItem key={comp.slug}>
                                    <FilaJornada competicion={comp} idioma={idioma} onAbrir={() => abrir(comp.slug)} />
                                </StaggerItem>
                            ))}
                        </StaggerList>
                    </section>
                )}

                <section aria-labelledby="resultados" className="border-t border-[var(--border-subtle)] bg-surface-canvas">
                    <div className="mx-auto w-full max-w-[1180px] px-6 py-20 md:px-10 md:py-28">
                        <Reveal className="flex flex-wrap items-end justify-between gap-6">
                            <h2 id="resultados" className="max-w-[16ch] font-display text-[clamp(2.5rem,5vw,4rem)] uppercase leading-[0.95] text-ink text-balance">
                                {c.resultados}
                            </h2>
                            <a
                                href="/#logros"
                                className="inline-flex min-h-[44px] items-center gap-1.5 text-t-sm font-bold uppercase tracking-wide text-ink-muted underline-offset-8 transition-colors duration-fast ease-snap hover:text-ink hover:underline"
                            >
                                {c.verHistorial}
                                <ArrowRight size={16} aria-hidden="true" />
                            </a>
                        </Reveal>
                        <StaggerList className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {resultados.map((r) => (
                                <StaggerItem key={r.id}>
                                    <article className="group relative aspect-[4/5] overflow-hidden rounded-sheet bg-surface-raised">
                                        <SafeImage
                                            src={r.images[0]}
                                            alt={`${r.title} — ${r.result}`}
                                            loading="lazy"
                                            className="h-full w-full object-cover transition-transform duration-slow ease-snap group-hover:scale-[1.03]"
                                            fallback={
                                                <div className="flex h-full w-full items-center justify-center bg-surface-raised">
                                                    <Trophy className="h-10 w-10 text-ink-faint" aria-hidden="true" />
                                                </div>
                                            }
                                        />
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-sunken via-surface-sunken/70 to-transparent p-6 pt-20">
                                            <p className="font-display text-t-2xl uppercase leading-none text-brand-text">{r.result}</p>
                                            <h3 className="mt-2 text-t-base font-bold leading-snug text-ink">{r.title}</h3>
                                        </div>
                                    </article>
                                </StaggerItem>
                            ))}
                        </StaggerList>
                    </div>
                </section>
            </main>

            <PublicFooter />

            <AnimatePresence>
                {abierta && (
                    <Convocatoria
                        key={abierta.slug}
                        competicion={abierta}
                        atletaInicial={params.get('atleta')}
                        onClose={cerrar}
                        onCambio={alCambiarAtleta}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// =====================================================================
// LA SIGUIENTE
// =====================================================================

function LaSiguiente({ competicion, onAbrir }: { competicion: Competicion; onAbrir: () => void }) {
    const textos = useTextosWeb();
    const c = textos.competiciones;
    const { idioma } = useIdioma();
    const reduce = useReducedMotion() ?? false;
    const n = competicion.convocados.length;
    const conRecorte = competicion.convocados.filter((x) => x.ficha?.recorte);
    const { cartel, oficial } = nombreDeCartel(competicion, idioma);

    const entra = (retraso: number) =>
        reduce
            ? {}
            : {
                initial: { opacity: 0, y: 22 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.85, delay: retraso, ease: [0.16, 1, 0.3, 1] as const },
            };

    return (
        <section className="relative isolate flex min-h-[100svh] items-start overflow-hidden pb-14 pt-[46svh] md:items-center md:pb-0 md:pt-24">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                    background:
                        'radial-gradient(48% 62% at 70% -6%, var(--cine-foco), transparent 72%),' +
                        'radial-gradient(70% 40% at 68% 108%, var(--cine-brasa-suave), transparent 70%)',
                }}
            />
            <Humo densidad={0.6} altura={0.45} className="absolute inset-0 -z-10 h-full w-full" />

            {/* Los convocados, de pie en el escenario: arriba en el móvil (el
                texto va debajo), a la derecha en escritorio. La altura sale de
                dos variables por atleta (`--escala`, `--bajar`, de su ficha)
                para que todos tengan la cabeza a un tamaño parecido aunque
                unas fotos sean de cuerpo entero y otras de medio cuerpo. */}
            {conRecorte.length > 0 && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex h-[60svh] items-end justify-center md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[52%] md:pr-[2vw]"
                >
                    {conRecorte.slice(0, 4).map((x, i) => {
                        const r = x.ficha!.recorte!;
                        return (
                            <m.img
                                key={x.clave}
                                src={r.src800}
                                srcSet={`${r.src800} 800w, ${r.src} 1600w`}
                                sizes="(max-width: 767px) 50vw, 30vw"
                                alt=""
                                draggable={false}
                                {...(reduce
                                    ? {}
                                    : {
                                        initial: { opacity: 0, y: 40, filter: 'blur(10px) brightness(1.6)' },
                                        animate: { opacity: 1, y: 0, filter: 'blur(0px) brightness(1)' },
                                        transition: { duration: 1.1, delay: 0.35 + i * 0.15, ease: [0.16, 1, 0.3, 1] },
                                    })}
                                className="relative -mx-[4%] h-[calc(46svh*var(--escala))] w-auto max-w-none object-contain object-bottom mb-[calc(-46svh*var(--escala)*var(--bajar))] md:h-[calc(62svh*var(--escala))] md:mb-[calc(-62svh*var(--escala)*var(--bajar))]"
                                style={{
                                    ['--escala' as string]: r.encuadre?.escala ?? 1,
                                    ['--bajar' as string]: r.encuadre?.bajar ?? 0,
                                    maskImage: 'linear-gradient(to top, transparent 0%, black 30%)',
                                    WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 30%)',
                                    zIndex: conRecorte.length - i,
                                }}
                            />
                        );
                    })}
                </div>
            )}
            {/* Velo para que el texto se lea siempre, pase lo que pase detrás. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 md:hidden"
                style={{ background: 'linear-gradient(to top, var(--surface-sunken) 52%, transparent 66%)' }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 hidden md:block"
                style={{ background: 'linear-gradient(90deg, var(--surface-sunken) 34%, transparent 60%)' }}
            />

            <div className="mx-auto w-full max-w-[1180px] px-6 md:px-10">
                <div className="max-w-[40rem]">
                    <m.h1 {...entra(0)} className="font-display text-t-2xl uppercase leading-none text-ink-muted md:text-t-3xl">
                        {c.titulo}
                    </m.h1>
                    <m.p {...entra(0.1)} className="mt-8 text-t-xs font-bold uppercase tracking-[0.28em] text-brand-text">
                        {c.laSiguiente}
                    </m.p>
                    <m.h2 {...entra(0.18)} className="mt-3 max-w-[14ch] font-display text-[clamp(3rem,6.6vw,5.75rem)] uppercase leading-[0.9] text-ink text-balance">
                        {cartel}
                    </m.h2>
                    {oficial && (
                        <m.p {...entra(0.24)} className="mt-3 max-w-[46ch] text-t-sm font-medium text-ink-subtle">
                            {oficial}
                        </m.p>
                    )}
                    <m.p {...entra(0.3)} className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-t-base font-bold uppercase tracking-[0.1em] text-ink-muted">
                        <span className="inline-flex items-center gap-1.5">
                            <MapPin size={16} className="text-brand-text" aria-hidden="true" />
                            {competicion.lugar ?? c.lugarPendiente}
                        </span>
                        <span>{formatearFechas(competicion.fecha, competicion.fin, idioma)}</span>
                    </m.p>

                    <m.div {...entra(0.42)} className="mt-8">
                        <Marcador fecha={competicion.fecha} fin={competicion.fin} />
                    </m.div>

                    <m.div {...entra(0.55)} className="mt-10 flex flex-col gap-5 sm:flex-row sm:items-center">
                        {n > 0 && <PressButton onClick={onAbrir}>{c.verConvocatoria}</PressButton>}
                        {n > 0 && (
                            <p className="text-t-sm font-bold uppercase tracking-wide text-ink-muted">
                                {n === 1 ? c.convocado : rellenar(c.convocados, { n })}
                                <span className="mt-1 block font-sans text-t-sm normal-case tracking-normal text-ink-subtle">
                                    {competicion.convocados.map((x) => x.ficha?.name ?? x.nombre).join(' · ')}
                                </span>
                            </p>
                        )}
                    </m.div>
                </div>
            </div>
        </section>
    );
}

/**
 * La cuenta atrás como un marcador: cifras grandes, sin cajas alrededor de
 * cada una. Los segundos cambian, así que el contenedor NO es una región
 * viva: leerle a alguien la hora cada segundo sería insoportable.
 */
function Marcador({ fecha, fin }: { fecha: string; fin: string | null }) {
    const c = useTextosWeb().competiciones;
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setAhora(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);
    const r = cuentaAtras(fecha, ahora);
    if (r.total === 0) {
        const hoy = new Date(ahora).toISOString().slice(0, 10);
        const enCurso = !fin || hoy <= fin;
        return enCurso ? <p className="font-display text-t-3xl uppercase text-brand-text">{c.hoy}</p> : null;
    }
    const celdas: [number, string][] = [
        [r.dias, r.dias === 1 ? c.dia : c.dias],
        [r.horas, c.horas],
        [r.minutos, c.minutos],
        [r.segundos, c.segundos],
    ];
    return (
        <div>
            <p className="text-t-xs font-bold uppercase tracking-[0.24em] text-ink-subtle">{c.faltan}</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-2 md:gap-x-7">
                {celdas.map(([v, etiqueta], i) => (
                    <div key={i} className="flex items-baseline gap-1.5">
                        <span className={`font-display leading-none tabular-nums ${i === 0 ? 'text-[clamp(3rem,6vw,4.5rem)] text-ink' : 'text-[clamp(1.75rem,3.4vw,2.6rem)] text-ink-muted'}`}>
                            {i === 0 ? v : String(v).padStart(2, '0')}
                        </span>
                        <span className="text-t-xs font-bold uppercase tracking-wide text-ink-subtle">{etiqueta}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// =====================================================================
// UNA JORNADA DEL CALENDARIO
// =====================================================================

function FilaJornada({ competicion, idioma, onAbrir }: { competicion: Competicion; idioma: 'es' | 'en'; onAbrir: () => void }) {
    const c = useTextosWeb().competiciones;
    const d = new Date(`${competicion.fecha}T12:00:00`);
    const loc = idioma === 'en' ? 'en-GB' : 'es-ES';
    const mes = new Intl.DateTimeFormat(loc, { month: 'short' }).format(d).replace('.', '');
    const [dias] = useState(() => cuentaAtras(competicion.fecha).dias);
    const n = competicion.convocados.length;
    const { cartel } = nombreDeCartel(competicion, idioma);

    return (
        <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-5 gap-y-3 border-b border-[var(--border-default)] py-6 md:grid-cols-[6rem_1fr_auto] md:gap-x-8">
            <div className="text-center">
                <span className="block font-display text-[2.75rem] leading-none text-ink md:text-[3.5rem]">{d.getDate()}</span>
                <span className="block text-t-xs font-bold uppercase tracking-[0.2em] text-brand-text">{mes}</span>
            </div>
            <div className="min-w-0">
                <h3 className="font-display text-t-2xl uppercase leading-tight text-ink text-balance md:text-t-3xl">{cartel}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-t-sm text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                        <MapPin size={14} aria-hidden="true" />
                        {competicion.lugar ?? c.lugarPendiente}
                    </span>
                    <span>{formatearFechas(competicion.fecha, competicion.fin, idioma)}</span>
                    {dias > 0 && <span className="text-ink-subtle">· {dias} {dias === 1 ? c.dia : c.dias}</span>}
                </p>
                {n > 0 && (
                    <p className="mt-2 text-t-sm text-ink-subtle">
                        {competicion.convocados.map((x) => {
                            const { nombre, apellidos } = partirNombre(x.ficha?.name ?? x.nombre);
                            return nombre ? `${nombre} ${apellidos}` : apellidos;
                        }).join(' · ')}
                    </p>
                )}
            </div>
            {n > 0 && (
                <div className="col-span-2 md:col-span-1">
                    <button
                        type="button"
                        onClick={onAbrir}
                        className="group inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-[var(--border-default)] px-5 text-t-sm font-bold uppercase tracking-wide text-ink transition-colors duration-fast ease-snap hover:border-brand hover:bg-brand hover:text-brand-ink"
                    >
                        {c.verConvocatoria}
                        <ArrowRight size={16} className="transition-transform duration-fast ease-snap group-hover:translate-x-0.5" aria-hidden="true" />
                    </button>
                </div>
            )}
        </div>
    );
}

// =====================================================================
// SIN COMPETICIONES, CARGANDO O CON ERROR
// =====================================================================

function CabeceraVacia({ titulo, texto, accion, cargando }: { titulo: string; texto: string; accion?: ReactNode; cargando?: boolean }) {
    return (
        <section className="relative isolate flex min-h-[70svh] items-end overflow-hidden pb-16 pt-36">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10"
                style={{ background: 'radial-gradient(50% 60% at 50% -10%, var(--cine-foco), transparent 72%)' }}
            />
            <div className="mx-auto w-full max-w-[1180px] px-6 md:px-10">
                <h1 className="max-w-[18ch] font-display text-[clamp(2.75rem,6vw,5.5rem)] uppercase leading-[0.92] text-ink text-balance">
                    {titulo}
                </h1>
                <p className="mt-5 max-w-[52ch] text-t-lg leading-relaxed text-ink-muted" aria-live={cargando ? 'polite' : undefined}>
                    {texto}
                </p>
                {accion && <div className="mt-8">{accion}</div>}
            </div>
        </section>
    );
}
