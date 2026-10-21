import { useCallback, useState } from 'react';
import type { ComponentType } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowUpRight, ChevronLeft, Fish, Medal, Swords, Trophy } from 'lucide-react';
import type { UserProfile } from '../../../hooks/useUser';
import { isAthlete } from '../../../lib/roles';
import { useSeo } from '../../../hooks/useSeo';
import { AnvilRanking } from '../../athlete/components/AnvilRanking';
import { SushiCounter } from '../../athlete/components/SushiCounter';
import { Convocatoria } from '../../landing/components/convocatoria/Convocatoria';
import { Reveal, StaggerItem, StaggerList } from '../../landing/components/landingKit';
import { useCompeticionesPublicas } from '../../landing/hooks/useCompeticionesPublicas';
import { CabeceraVacia, FilaJornada, LaSiguiente } from '../../landing/pages/CompetitionsPage';

/**
 * EL CLUB — la zona común de la app
 * =====================================================================
 *
 * Lo que es de todos y no del entrenamiento de cada uno, junto en un sitio:
 * las COMPETICIONES (las mismas de la web pública, con su convocatoria), LA
 * ARENA, el RANKING y el SUSHI. Antes estaban sueltos entre los accesos del
 * inicio y las competiciones del club solo se veían desde fuera de la app.
 *
 * Va en el registro de la web ("negro cine", ver RegistroPorRuta): la parte
 * de competiciones es la de la portada, y así se ve igual dentro que fuera.
 *
 * La diferencia con /competiciones: aquí cada competición lleva a la Arena,
 * filtrada por ese campeonato (`/dashboard/community?competicion=<slug>`),
 * y es la llamada principal. La convocatoria queda al lado y, al terminar,
 * también ofrece apostar.
 */

interface ClubPageProps {
    user: UserProfile;
}

export function ClubPage({ user }: ClubPageProps) {
    const navigate = useNavigate();
    useSeo({ title: 'El club · Anvil Strength', noindex: true });

    const [rankingAbierto, setRankingAbierto] = useState(false);
    const [sushiAbierto, setSushiAbierto] = useState(false);

    const consulta = useCompeticionesPublicas();
    const competiciones = consulta.data ?? [];
    const [siguiente, ...despues] = competiciones;

    const [params, setParams] = useSearchParams();
    const slugAbierta = params.get('convocatoria');
    const abierta = slugAbierta ? competiciones.find((x) => x.slug === slugAbierta) ?? null : null;

    const abrir = (slug: string) =>
        setParams((p) => {
            const n = new URLSearchParams(p);
            n.set('convocatoria', slug);
            n.delete('atleta');
            return n;
        });
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

    const aLaArena = (slug?: string) =>
        navigate(slug ? `/dashboard/community?competicion=${encodeURIComponent(slug)}` : '/dashboard/community');

    const panel = isAthlete(user) ? '/dashboard' : '/coach-dashboard';

    const zonas: { icono: ComponentType<{ size?: number; className?: string }>; titulo: string; pista: string; onClick: () => void }[] = [
        {
            icono: Trophy,
            titulo: 'Competiciones',
            pista: 'Quién compite, dónde y cuándo',
            onClick: () => document.getElementById('competiciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        },
        { icono: Swords, titulo: 'La Arena', pista: 'Apuestas con Anvil Coins', onClick: () => aLaArena() },
        { icono: Medal, titulo: 'Ranking', pista: 'Clasificación del club', onClick: () => setRankingAbierto(true) },
        { icono: Fish, titulo: 'Sushi', pista: 'El recuento de después', onClick: () => setSushiAbierto(true) },
    ];

    return (
        <div className="min-h-[100dvh] overflow-x-hidden bg-surface-sunken font-sans text-ink">
            {/* CABECERA: volver al panel y el nombre de la zona. */}
            <header className="sticky top-0 z-sticky border-b border-[var(--border-subtle)] bg-surface-sunken/80 backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between gap-4 px-4 md:px-10">
                    <Link
                        to={panel}
                        className="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-pill px-2 text-t-sm font-bold uppercase tracking-wide text-ink-muted transition-colors duration-fast ease-snap hover:text-ink"
                    >
                        <ChevronLeft size={18} aria-hidden="true" />
                        Panel
                    </Link>
                    <img src="/logo-dark-removebg-preview.png" alt="Anvil Strength" width={96} height={38} className="h-8 w-auto" />
                    <span className="w-[72px]" aria-hidden="true" />
                </div>
            </header>

            <main>
                {/* LA ZONA COMÚN */}
                <section className="mx-auto w-full max-w-[1180px] px-4 pb-6 pt-10 md:px-10 md:pt-14">
                    <Reveal>
                        <p className="font-mono text-t-2xs font-semibold uppercase tracking-[0.24em] text-brand-text">Zona común</p>
                        <h1 className="mt-2 font-display text-[clamp(2.75rem,7vw,5rem)] uppercase leading-[0.9] text-ink">El club</h1>
                    </Reveal>

                    <StaggerList className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                        {zonas.map(({ icono: Icono, titulo, pista, onClick }) => (
                            <StaggerItem key={titulo}>
                                <button
                                    type="button"
                                    onClick={onClick}
                                    className="group flex h-full min-h-[9.5rem] w-full flex-col justify-between rounded-sheet border border-[var(--border-subtle)] bg-surface-raised p-5 text-left transition-[border-color,transform] duration-base ease-snap hover:-translate-y-0.5 hover:border-brand md:min-h-[11rem] md:p-6"
                                >
                                    <span className="flex items-start justify-between">
                                        <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-white/10 text-ink transition-colors duration-fast ease-snap group-hover:bg-brand group-hover:text-brand-ink">
                                            <Icono size={20} aria-hidden="true" />
                                        </span>
                                        <ArrowUpRight size={18} aria-hidden="true" className="text-ink-subtle transition-[color,transform] duration-fast ease-snap group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                                    </span>
                                    <span>
                                        <span className="block font-display text-t-xl uppercase leading-none text-ink min-[400px]:text-t-2xl md:text-t-3xl">{titulo}</span>
                                        <span className="mt-1.5 block text-t-xs text-ink-muted md:text-t-sm">{pista}</span>
                                    </span>
                                </button>
                            </StaggerItem>
                        ))}
                    </StaggerList>
                </section>

                {/* LAS COMPETICIONES — las de la web, con la Arena delante. */}
                <div id="competiciones" className="scroll-mt-16">
                    {consulta.isPending ? (
                        <CabeceraVacia titulo="Competiciones" texto="Cargando competiciones…" cargando />
                    ) : consulta.isError ? (
                        <CabeceraVacia titulo="Competiciones" texto="No se han podido cargar las competiciones." />
                    ) : !siguiente ? (
                        <CabeceraVacia
                            titulo="Ahora mismo no hay competiciones anunciadas"
                            texto="La siguiente aparecerá aquí en cuanto haya convocatoria. Mientras, la Arena sigue abierta."
                        />
                    ) : (
                        <LaSiguiente
                            competicion={siguiente}
                            titulo="Competiciones"
                            onAbrir={() => abrir(siguiente.slug)}
                            onArena={() => aLaArena(siguiente.slug)}
                        />
                    )}

                    {despues.length > 0 && (
                        <section aria-labelledby="calendario-club" className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-8 md:px-10 md:pb-28">
                            <Reveal>
                                <h2 id="calendario-club" className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] uppercase leading-none text-ink">
                                    Después
                                </h2>
                            </Reveal>
                            <StaggerList className="mt-8 border-t border-[var(--border-default)]">
                                {despues.map((comp) => (
                                    <StaggerItem key={comp.slug}>
                                        <FilaJornada
                                            competicion={comp}
                                            idioma="es"
                                            onAbrir={() => abrir(comp.slug)}
                                            onArena={() => aLaArena(comp.slug)}
                                        />
                                    </StaggerItem>
                                ))}
                            </StaggerList>
                        </section>
                    )}
                </div>
            </main>

            <AnvilRanking isOpen={rankingAbierto} onClose={() => setRankingAbierto(false)} />
            <SushiCounter isOpen={sushiAbierto} onClose={() => setSushiAbierto(false)} />

            <AnimatePresence>
                {abierta && (
                    <Convocatoria
                        key={abierta.slug}
                        competicion={abierta}
                        atletaInicial={params.get('atleta')}
                        onClose={cerrar}
                        onCambio={alCambiarAtleta}
                        onArena={() => aLaArena(abierta.slug)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
