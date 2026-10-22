import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, m } from 'framer-motion';
import Papa from 'papaparse';
import { ArrowRight, Calendar, ChevronDown, FileText, MapPin } from 'lucide-react';
import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { SmartAuthButton } from '../../../components/ui/SmartAuthButton';
import type { UserProfile } from '../../../hooks/useUser';
import { useSeo } from '../../../hooks/useSeo';
import { useJsonLd } from '../../../hooks/useJsonLd';
import { AEP_2026_FALLBACK_CSV, AEP_2026_FALLBACK_UPDATED } from '../../../data/aepCalendar2026';
import { nombreCorto } from '../../../data/competitions';
import {
    REGIONES_SEO,
    REGIONES_SEO_POR_SLUG,
    type RegionSeo,
    type RegionSlug,
} from '../../../data/regionesSeo';
import { Fold, PressButton, Reveal, StaggerItem, StaggerList } from '../components/landingKit';

/**
 * PÁGINA TERRITORIAL SEO — VALENCIA, MURCIA E ISLAS BALEARES
 * =====================================================================
 *
 * Un único componente genera las tres rutas públicas indexables
 * (`/powerlifting-valencia`, `/powerlifting-murcia` y `/powerlifting-baleares`)
 * a partir de `src/data/regionesSeo.ts` y del calendario oficial de la AEP en
 * `src/data/aepCalendar2026.ts`.
 *
 * POR QUÉ VA SOLO EN ESPAÑOL
 * Las búsquedas objetivo ("powerlifting valencia", "powerlifting murcia",
 * "powerlifting baleares", "club powerlifting ...") son en español y el
 * selector de idioma no tiene ruta propia, de modo que estas páginas se sirven
 * íntegramente en castellano.
 */

interface RegionPageProps {
    slug?: RegionSlug;
    onLoginClick: () => void;
    onSignupClick?: () => void;
    user?: UserProfile | null;
}

interface CompeticionCalendarioAep {
    fecha: string;
    campeonato: string;
    nombreBreve: string | null;
    localidad: string;
    organizador: string;
    nivel: string;
    divisiones: string;
}

const sinTildes = (texto: string): string =>
    texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

/**
 * Extrae directamente de `AEP_2026_FALLBACK_CSV` las competiciones de 2026
 * vinculadas a la región, distinguiendo las que tienen sede física en esa
 * comunidad (`conSede`) de las citas interterritoriales de su demarcación
 * (`deDemarcacion`).
 */
function leerCompeticionesDeRegion(region: RegionSeo): {
    conSede: CompeticionCalendarioAep[];
    deDemarcacion: CompeticionCalendarioAep[];
} {
    const parseado = Papa.parse<string[]>(AEP_2026_FALLBACK_CSV, {
        header: false,
        skipEmptyLines: true,
    });

    const filas = parseado.data;
    const conSede: CompeticionCalendarioAep[] = [];
    const deDemarcacion: CompeticionCalendarioAep[] = [];

    for (let i = 1; i < filas.length; i++) {
        const [rawFecha = '', rawCampeonato = '', rawLocalidad = '', rawOrganizador = '', rawNivel = '', rawDivisiones = ''] = filas[i];
        const fecha = rawFecha.trim();
        const campeonato = rawCampeonato.trim();
        const localidad = rawLocalidad.trim();
        const organizador = rawOrganizador.trim();
        const nivel = rawNivel.trim();
        const divisiones = rawDivisiones.trim();

        // Descarta la leyenda final de colores de la hoja oficial (filas sin sede, ni organizador, ni nivel).
        if (!campeonato || (!localidad && !organizador && !nivel)) continue;

        const locNorm = sinTildes(localidad);
        const campNorm = sinTildes(campeonato);

        const item: CompeticionCalendarioAep = {
            fecha: fecha || 'Pendiente',
            campeonato,
            nombreBreve: nombreCorto(campeonato, 'es'),
            localidad: localidad || 'Por determinar',
            organizador,
            nivel,
            divisiones,
        };

        const tieneSedeEnRegion =
            locNorm.length > 0 && region.terminosSede.some((t) => locNorm.includes(t));

        if (tieneSedeEnRegion) {
            conSede.push(item);
            continue;
        }

        const perteneceADemarcacion = region.terminosZona.some(
            (t) => campNorm.includes(t) || locNorm.includes(t)
        );
        if (perteneceADemarcacion) {
            deDemarcacion.push(item);
        }
    }

    return { conSede, deDemarcacion };
}

export function RegionPage({ slug, onLoginClick, onSignupClick, user }: RegionPageProps) {
    const location = useLocation();
    const slugResuelto = (slug ?? location.pathname.replace(/^\/+/, '')) as RegionSlug;
    const region = REGIONES_SEO_POR_SLUG[slugResuelto];

    const [faqAbierta, setFaqAbierta] = useState<number | null>(0);

    useSeo({
        title: region?.tituloSeo ?? 'Anvil Strength | Club de Powerlifting Online en España',
        description: region?.descripcion,
        canonical: region ? `https://anvilstrength.es/${region.slug}` : 'https://anvilstrength.es/',
    });

    useJsonLd(
        region ? `ld-faq-${region.slug}` : 'ld-faq-region',
        region
            ? {
                  '@context': 'https://schema.org',
                  '@type': 'FAQPage',
                  mainEntity: region.faqs.map((faq) => ({
                      '@type': 'Question',
                      name: faq.q,
                      acceptedAnswer: { '@type': 'Answer', text: faq.a },
                  })),
              }
            : {}
    );

    const { conSede, deDemarcacion } = useMemo(
        () => (region ? leerCompeticionesDeRegion(region) : { conSede: [], deDemarcacion: [] }),
        [region]
    );

    if (!region) {
        return <Navigate to="/" replace />;
    }

    const otrasRegiones = REGIONES_SEO.filter((r) => r.slug !== region.slug);

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-sunken font-sans text-ink">
            <PublicHeader onLoginClick={onLoginClick} onSignupClick={onSignupClick} />

            <main>
                {/* =====================================================
                    1. CABECERA — Único H1 de la página + CTA principal
                    ===================================================== */}
                <section className="relative isolate overflow-hidden bg-surface-sunken pb-20 pt-32 md:pb-28 md:pt-40">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 -z-10"
                        style={{
                            background:
                                'radial-gradient(52% 65% at 50% -10%, var(--cine-foco), transparent 72%),' +
                                'radial-gradient(65% 40% at 50% 108%, var(--cine-brasa-suave), transparent 72%)',
                        }}
                    />

                    <div className="mx-auto w-full max-w-[1180px] px-6 md:px-10">
                        <Reveal>
                            <p className="text-t-xs font-black uppercase tracking-[0.22em] text-brand-text">
                                {region.antetitulo}
                            </p>
                            <h1 className="mt-4 max-w-[18ch] font-display text-[clamp(2.75rem,7.2vw,5.5rem)] uppercase leading-[0.9] tracking-[0.005em] text-ink text-balance">
                                {region.h1}
                            </h1>
                            <p className="mt-6 max-w-[64ch] text-t-lg leading-relaxed text-ink-muted">
                                {region.intro}
                            </p>
                        </Reveal>

                        <Reveal delay={0.08} className="mt-10 flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center">
                            {!user ? (
                                <PressButton
                                    onClick={onSignupClick ?? onLoginClick}
                                    className="w-full sm:w-auto"
                                >
                                    Crear cuenta gratis
                                </PressButton>
                            ) : (
                                <SmartAuthButton
                                    variant="primary"
                                    onLoginClick={onLoginClick}
                                    className="w-full sm:w-auto"
                                />
                            )}
                            <Link
                                to="/competiciones"
                                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-pill border border-[var(--border-default)] px-6 text-t-sm font-bold uppercase tracking-wide text-ink transition-colors duration-fast ease-snap hover:border-ink hover:bg-ink hover:text-surface-sunken"
                            >
                                Ver competiciones del club
                                <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        </Reveal>
                    </div>
                </section>

                {/* =====================================================
                    2. SECCIONES EDITORIALES POR REGIÓN
                    ===================================================== */}
                <Fold tone="dark" className="border-t border-[var(--border-subtle)] py-20 md:py-28">
                    <div className="grid grid-cols-1 gap-14 md:grid-cols-2 md:gap-x-16 md:gap-y-16">
                        {region.secciones.map((seccion, idx) => (
                            <Reveal key={seccion.titulo} delay={idx * 0.04} className="flex flex-col">
                                <span
                                    aria-hidden="true"
                                    className="font-mono text-t-xs font-bold tracking-[0.2em] text-brand-text"
                                >
                                    {String(idx + 1).padStart(2, '0')}
                                </span>
                                <h2 className="mt-2 font-display text-[clamp(1.85rem,3.6vw,2.75rem)] uppercase leading-[0.95] tracking-[0.005em] text-ink text-balance">
                                    {seccion.titulo}
                                </h2>
                                <div className="mt-4 space-y-4">
                                    {seccion.parrafos.map((parrafo, pIdx) => (
                                        <p
                                            key={pIdx}
                                            className="text-t-base leading-relaxed text-ink-muted"
                                        >
                                            {parrafo}
                                        </p>
                                    ))}
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </Fold>

                {/* =====================================================
                    3. CALENDARIO AEP 2026 DE LA ZONA (leído de aepCalendar2026.ts)
                    ===================================================== */}
                <Fold tone="black" className="border-t border-[var(--border-subtle)] py-20 md:py-28">
                    <Reveal className="flex flex-wrap items-end justify-between gap-6">
                        <div>
                            <p className="text-t-xs font-black uppercase tracking-[0.22em] text-brand-text">
                                Calendario oficial AEP 2026
                            </p>
                            <h2 className="mt-3 max-w-[20ch] font-display text-[clamp(2.25rem,5.2vw,4rem)] uppercase leading-[0.92] text-ink text-balance">
                                {conSede.length > 0
                                    ? `Competiciones con sede en ${region.nombre}`
                                    : `Competiciones AEP 2026 para atletas de ${region.nombre}`}
                            </h2>
                        </div>
                        <Link
                            to="/competiciones"
                            className="inline-flex min-h-[44px] items-center gap-1.5 text-t-sm font-bold uppercase tracking-wide text-ink-muted underline-offset-8 transition-colors duration-fast ease-snap hover:text-ink hover:underline"
                        >
                            Ver convocatorias de Anvil Strength
                            <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                    </Reveal>

                    {conSede.length > 0 ? (
                        <StaggerList className="mt-10 border-t border-[var(--border-default)]">
                            {conSede.map((comp, i) => (
                                <StaggerItem key={`${comp.campeonato}-${comp.fecha}-${i}`}>
                                    <FilaCalendarioRegion comp={comp} />
                                </StaggerItem>
                            ))}
                        </StaggerList>
                    ) : (
                        <Reveal className="mt-6 max-w-[68ch]">
                            <p className="text-t-base leading-relaxed text-ink-muted">
                                En la revisión del calendario oficial AEP 2026 ({AEP_2026_FALLBACK_UPDATED}) no figura
                                ninguna competición con sede física dentro de {region.nombre}. Los atletas federados en{' '}
                                {region.nombre} compiten dentro de las siguientes citas interterritoriales asignadas a su
                                demarcación:
                            </p>
                        </Reveal>
                    )}

                    {deDemarcacion.length > 0 && (
                        <div className="mt-12">
                            {conSede.length > 0 && (
                                <Reveal>
                                    <h3 className="font-display text-t-2xl uppercase leading-tight text-ink">
                                        Otras citas de tu demarcación territorial
                                    </h3>
                                </Reveal>
                            )}
                            <StaggerList className="mt-4 border-t border-[var(--border-default)]">
                                {deDemarcacion.map((comp, i) => (
                                    <StaggerItem key={`${comp.campeonato}-${comp.fecha}-${i}`}>
                                        <FilaCalendarioRegion comp={comp} />
                                    </StaggerItem>
                                ))}
                            </StaggerList>
                        </div>
                    )}

                    <p className="mt-6 text-t-xs text-ink-subtle">
                        Datos leídos del calendario oficial de la Asociación Española de Powerlifting (revisión del{' '}
                        {AEP_2026_FALLBACK_UPDATED}).
                    </p>
                </Fold>

                {/* =====================================================
                    4. PREGUNTAS FRECUENTES (con JSON-LD FAQPage)
                    ===================================================== */}
                <Fold tone="dark" className="border-t border-[var(--border-subtle)] py-20 md:py-28">
                    <div className="mx-auto max-w-3xl">
                        <Reveal>
                            <h2 className="font-display text-[clamp(2.25rem,5.8vw,4.25rem)] uppercase leading-[0.9] tracking-[0.005em] text-ink text-balance">
                                Preguntas frecuentes sobre powerlifting en {region.nombre}
                            </h2>
                        </Reveal>

                        <div className="mt-10 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                            {region.faqs.map((faq, i) => {
                                const abierta = faqAbierta === i;
                                return (
                                    <div key={faq.q}>
                                        <h3>
                                            <button
                                                type="button"
                                                onClick={() => setFaqAbierta(abierta ? null : i)}
                                                aria-expanded={abierta}
                                                className="group flex w-full items-center justify-between gap-6 py-5 text-left"
                                            >
                                                <span className="text-t-lg font-bold leading-snug text-ink">
                                                    {faq.q}
                                                </span>
                                                <ChevronDown
                                                    size={20}
                                                    aria-hidden="true"
                                                    className={`shrink-0 text-ink-muted transition-transform duration-base ease-snap ${
                                                        abierta ? 'rotate-180' : ''
                                                    }`}
                                                />
                                            </button>
                                        </h3>

                                        <AnimatePresence initial={false}>
                                            {abierta && (
                                                <m.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                                    className="overflow-hidden"
                                                >
                                                    <p className="max-w-[68ch] pb-6 text-t-base leading-relaxed text-ink-muted">
                                                        {faq.a}
                                                    </p>
                                                </m.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Fold>

                {/* =====================================================
                    5. CONVERSIÓN — Crear cuenta gratis / Ficha de inscripción
                    ===================================================== */}
                <Fold tone="brand" className="py-20 md:py-28">
                    <div className="mx-auto max-w-2xl text-center">
                        <Reveal>
                            <p className="text-t-sm font-black uppercase tracking-widest text-brand-ink/75">
                                Gratis · Sin cuota de club · Afiliado AEP e IPF
                            </p>
                            <h2 className="mt-4 font-display text-[clamp(2.5rem,6.5vw,4.75rem)] uppercase leading-[0.9] tracking-[0.005em] text-brand-ink text-balance">
                                ¿Entrenas en {region.nombre} y quieres competir?
                            </h2>
                            <p className="mx-auto mt-5 max-w-[50ch] text-t-lg leading-relaxed text-brand-ink/85">
                                Créate la cuenta gratis para entrar en la aplicación del club o rellena la ficha de
                                inscripción si quieres que revisemos tu caso y te asignemos entrenador.
                            </p>
                        </Reveal>

                        <Reveal
                            delay={0.08}
                            className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap"
                        >
                            {!user ? (
                                <PressButton
                                    tone="light"
                                    onClick={onSignupClick ?? onLoginClick}
                                    className="w-full sm:w-auto"
                                >
                                    Crear cuenta gratis
                                </PressButton>
                            ) : (
                                <SmartAuthButton
                                    variant="primary"
                                    onLoginClick={onLoginClick}
                                    className="w-full sm:w-auto"
                                />
                            )}
                            <PressButton
                                tone="dark"
                                href="https://typebot.co/lead-generation-hhwa24t"
                                className="w-full sm:w-auto"
                            >
                                Ficha de inscripción
                            </PressButton>
                        </Reveal>

                        <Reveal delay={0.14} className="mt-8 flex flex-wrap items-center justify-center gap-6">
                            <Link
                                to="/competiciones"
                                className="inline-flex items-center gap-2 text-t-sm font-bold uppercase tracking-wide text-brand-ink/85 underline-offset-8 transition-colors duration-fast hover:text-brand-ink hover:underline"
                            >
                                Ver calendario y convocatorias
                                <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                            <a
                                href="/normativa_equipo.pdf"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-t-sm font-bold uppercase tracking-wide text-brand-ink/85 underline-offset-8 transition-colors duration-fast hover:text-brand-ink hover:underline"
                            >
                                <FileText size={16} aria-hidden="true" />
                                Normativa del equipo
                            </a>
                        </Reveal>
                    </div>
                </Fold>

                {/* =====================================================
                    6. ENLACES INTERNOS AL RESTO DE ZONAS
                    ===================================================== */}
                <Fold tone="black" className="border-t border-[var(--border-subtle)] py-14">
                    <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                        <div>
                            <p className="text-t-xs font-black uppercase tracking-[0.2em] text-ink-subtle">
                                También en la zona Este y SudEste AEP
                            </p>
                            <p className="mt-1 text-t-base font-bold text-ink">
                                Otras páginas territoriales de Anvil Strength
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {otrasRegiones.map((otra) => (
                                <Link
                                    key={otra.slug}
                                    to={`/${otra.slug}`}
                                    className="inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-[var(--border-default)] px-5 text-t-sm font-bold uppercase tracking-wide text-ink transition-colors duration-fast ease-snap hover:border-brand hover:bg-brand hover:text-brand-ink"
                                >
                                    {otra.etiquetaEnlace}
                                    <ArrowRight size={15} aria-hidden="true" />
                                </Link>
                            ))}
                        </div>
                    </div>
                </Fold>
            </main>

            <PublicFooter />
        </div>
    );
}

function FilaCalendarioRegion({ comp }: { comp: CompeticionCalendarioAep }) {
    return (
        <div className="grid grid-cols-1 gap-3 border-b border-[var(--border-default)] py-5 md:grid-cols-[11rem_1fr_auto] md:items-center md:gap-8">
            <div className="flex items-center gap-2 text-t-sm font-bold uppercase tracking-[0.12em] text-brand-text">
                <Calendar size={15} aria-hidden="true" className="shrink-0" />
                <span>{comp.fecha}</span>
            </div>

            <div className="min-w-0">
                <h4 className="font-display text-t-xl uppercase leading-tight text-ink text-balance md:text-t-2xl">
                    {comp.nombreBreve ?? comp.campeonato}
                </h4>
                {comp.nombreBreve && (
                    <p className="mt-0.5 text-t-xs text-ink-subtle">{comp.campeonato}</p>
                )}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-t-sm text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                        <MapPin size={14} aria-hidden="true" className="text-brand-text" />
                        Sede: {comp.localidad}
                    </span>
                    {comp.organizador && <span>Organiza: {comp.organizador}</span>}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {comp.nivel && (
                    <span className="inline-flex items-center rounded-pill border border-[var(--border-default)] px-3 py-1 text-t-xs font-bold uppercase tracking-wider text-ink">
                        {comp.nivel}
                    </span>
                )}
                {comp.divisiones && (
                    <span className="inline-flex items-center rounded-pill bg-white/5 px-3 py-1 text-t-xs font-semibold uppercase tracking-wider text-ink-muted">
                        {comp.divisiones}
                    </span>
                )}
            </div>
        </div>
    );
}
