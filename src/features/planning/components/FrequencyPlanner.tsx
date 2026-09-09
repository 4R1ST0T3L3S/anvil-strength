import { useMemo, useRef, useState } from 'react';
import { Moon } from 'lucide-react';
import type { VolumeSessionInput } from '../../../lib/volume/engine';
import {
    semanaVisual,
    type DiaDeLaSemana,
    type Banda,
} from '../../../lib/planning/semanaVisual';
import type { MainLift } from '../../../lib/planning/liftSummary';
import { AnchoredMenu } from '../../../components/ui/AnchoredMenu';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { cn } from '../../../lib/utils';

/**
 * PLANIFICADOR DE FRECUENCIA — LA SEMANA DE UN VISTAZO
 * =====================================================================
 *
 * Siete columnas, una por día, con lo que se entrena en cada una. Contesta
 * de un golpe lo que hasta ahora había que reconstruir abriendo día por
 * día: cuántas veces a la semana toca cada básico, dónde caen los
 * descansos, y si el trabajo duro está repartido o amontonado.
 *
 *
 * NO ES UNA TABLA
 *
 * Una tabla de siete columnas con celdas de texto obliga a leerla renglón a
 * renglón. Aquí cada día es una columna con FRANJAS DE COLOR por
 * movimiento, así que el patrón —"lunes y viernes son iguales", "el jueves
 * lleva los tres"— se ve sin leer nada. El color es el mismo que ya usa la
 * tarjeta de día del constructor (rojo sentadilla, azul banca, morado peso
 * muerto), para que las dos pantallas hablen el mismo idioma.
 *
 *
 * EL DETALLE: HOVER EN ESCRITORIO, TOQUE EN MÓVIL
 *
 * El encargo pide las dos cosas y son dos gestos distintos, no el mismo con
 * dos nombres. `useMediaQuery` decide cuál: donde hay ratón, el detalle se
 * abre al pasar por encima —consultar cinco días no puede costar cinco
 * clics—; donde no lo hay, al tocar. Un `title` nativo no vale: tarda un
 * segundo en salir, no admite formato y en el móvil no existe.
 *
 *
 * LOS DÍAS DE DESCANSO OCUPAN SITIO
 *
 * Y tienen que ocuparlo. Una semana de tres días pintada como tres columnas
 * seguidas parece tres días seguidos; el hueco es justo lo que dice que hay
 * recuperación entre medias.
 */

/** Mismo tema de color que `DayCard`, para que las dos pantallas coincidan. */
const COLOR: Record<MainLift, { barra: string; texto: string; chip: string }> = {
    SQ: { barra: 'bg-red-500', texto: 'text-danger-text', chip: 'bg-[var(--danger-quiet)]' },
    BP: { barra: 'bg-sky-500', texto: 'text-info', chip: 'bg-info-quiet' },
    DL: { barra: 'bg-purple-500', texto: 'text-purple-400', chip: 'bg-purple-500/10' },
};

/** Abreviatura de dos letras para la franja estrecha. */
const SIGLA: Record<MainLift, string> = { SQ: 'SQ', BP: 'BP', DL: 'DL' };

const ETIQUETA_BANDA: Record<Banda, string> = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' };

interface Props {
    /** Todas las sesiones del bloque, con el estado local sin guardar. */
    sessions: VolumeSessionInput[];
    week: number;
    declaredMaxes?: Record<string, number>;
    /** Preferencia del entrenador. Misma que el menú "Agendar en". */
    primerDia?: 'monday' | 'sunday';
    /** Abre el editor de ese día. Sin él, las columnas no son pulsables. */
    onAbrirDia?: (sessionId: string) => void;
}

export function FrequencyPlanner({
    sessions,
    week,
    declaredMaxes = {},
    primerDia = 'monday',
    onAbrirDia,
}: Props) {
    const vista = useMemo(
        () => semanaVisual(sessions, week, declaredMaxes, primerDia),
        [sessions, week, declaredMaxes, primerDia]
    );

    if (vista.totalSeries === 0) {
        return (
            <div className="rounded-card border border-dashed border-[var(--border-strong)] p-6 text-center">
                <p className="text-t-sm font-bold text-ink">Esta semana está vacía</p>
                <p className="mt-1.5 text-t-xs text-ink-muted">
                    En cuanto programes el primer día, aquí verás cómo queda repartida.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* FRECUENCIA: la lectura de una línea. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {vista.frecuencia.map(f => (
                    <span key={f.lift} className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 shrink-0 rounded-pill', COLOR[f.lift].barra)} aria-hidden="true" />
                        <span className="text-t-xs text-ink-muted">
                            <span className="font-bold text-ink">{f.label}</span>{' '}
                            {f.dias === 0
                                ? 'sin programar'
                                : `${f.dias}× semana · ${f.sets} series`}
                        </span>
                    </span>
                ))}
                <span className="ml-auto text-t-2xs uppercase tracking-wide text-ink-subtle">
                    {vista.diasEntrenados} {vista.diasEntrenados === 1 ? 'día' : 'días'} · {vista.totalSeries} series
                </span>
            </div>

            {/* LA REJILLA.
                `overflow-x-auto` con columnas de ancho mínimo: en un móvil de
                375px siete columnas legibles no caben, y encogerlas hasta que
                quepan las deja ilegibles. Se desplaza en horizontal DENTRO de
                su caja, sin arrastrar la página. */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-hide">
                <ul className="flex min-w-max gap-1.5 md:grid md:min-w-0 md:grid-cols-7 md:gap-2">
                    {vista.dias.map(dia => (
                        <ColumnaDeDia
                            key={dia.weekday ?? 'sin-agendar'}
                            dia={dia}
                            onAbrir={onAbrirDia}
                        />
                    ))}
                </ul>
            </div>
        </div>
    );
}

// =====================================================================

function ColumnaDeDia({
    dia,
    onAbrir,
}: {
    dia: DiaDeLaSemana;
    onAbrir?: (sessionId: string) => void;
}) {
    const [abierto, setAbierto] = useState(false);
    const ancla = useRef<HTMLButtonElement>(null);

    // `(hover: hover)` y no un ancho de pantalla: lo que decide el gesto es
    // si hay puntero, no si la pantalla es grande. Una tableta con lápiz y un
    // portátil táctil rompen la equivalencia "ancho = ratón".
    const hayRaton = useMediaQuery('(hover: hover) and (pointer: fine)');

    const hayDetalle = !dia.esDescanso;

    const abrir = () => hayDetalle && setAbierto(true);
    const cerrar = () => setAbierto(false);

    return (
        <li className="w-[5.5rem] shrink-0 md:w-auto">
            <button
                ref={ancla}
                type="button"
                // `data-no-press`: la columna es un contenedor, y el CSS global
                // encoge todo pulsable un 3% al pulsarlo. Ver src/index.css §3.
                data-no-press
                disabled={!hayDetalle}
                aria-expanded={hayDetalle ? abierto : undefined}
                aria-haspopup={hayDetalle ? 'dialog' : undefined}
                onClick={() => {
                    if (!hayDetalle) return;
                    // Con ratón el detalle ya está abierto por el hover, así
                    // que el clic hace lo útil: entrar a editar el día.
                    if (hayRaton && onAbrir && dia.sessionIds[0]) onAbrir(dia.sessionIds[0]);
                    else setAbierto(v => !v);
                }}
                onMouseEnter={hayRaton ? abrir : undefined}
                onMouseLeave={hayRaton ? cerrar : undefined}
                onFocus={hayRaton ? abrir : undefined}
                onBlur={hayRaton ? cerrar : undefined}
                className={cn(
                    'flex h-full w-full flex-col rounded-card border p-2 text-left transition-colors duration-fast ease-snap',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                    dia.esDescanso
                        ? 'cursor-default border-[var(--border-subtle)] bg-surface-sunken/40'
                        : 'border-[var(--border-default)] bg-surface-sunken hover:border-[var(--border-strong)]'
                )}
            >
                <span className="flex items-baseline justify-between gap-1">
                    <span className="text-t-2xs font-black uppercase tracking-widest text-ink-subtle">
                        {dia.corta}
                    </span>
                    {!dia.esDescanso && (
                        <span className="text-t-2xs tabular-nums text-ink-faint">{dia.seriesTotales}</span>
                    )}
                </span>

                {dia.esDescanso ? (
                    <span className="mt-3 flex flex-1 flex-col items-center justify-center gap-1 py-2 text-ink-faint">
                        <Moon size={14} aria-hidden="true" />
                        <span className="text-t-2xs uppercase tracking-wide">Descanso</span>
                    </span>
                ) : (
                    <>
                        {/* Las franjas por movimiento. Es lo que se lee sin leer. */}
                        <span className="mt-2 flex flex-col gap-1">
                            {dia.basicos.map(b => (
                                <span
                                    key={b.lift}
                                    className={cn(
                                        'flex items-center justify-between gap-1 rounded-field px-1.5 py-1',
                                        COLOR[b.lift].chip
                                    )}
                                >
                                    <span className={cn('text-t-2xs font-black tracking-wide', COLOR[b.lift].texto)}>
                                        {SIGLA[b.lift]}
                                    </span>
                                    <span className="text-t-2xs tabular-nums text-ink-muted">{b.sets}</span>
                                </span>
                            ))}
                            {dia.seriesAccesorias > 0 && (
                                <span className="flex items-center justify-between gap-1 rounded-field bg-surface-overlay px-1.5 py-1">
                                    <span className="text-t-2xs font-bold tracking-wide text-ink-subtle">ACC</span>
                                    <span className="text-t-2xs tabular-nums text-ink-faint">{dia.seriesAccesorias}</span>
                                </span>
                            )}
                        </span>

                        {/* Bandas de volumen e intensidad. Descriptivas: dicen
                            cómo es este día RESPECTO A LOS OTROS de la semana,
                            no si está bien. Ver semanaVisual.ts. */}
                        <span className="mt-auto flex flex-col gap-0.5 pt-2">
                            {dia.bandaVolumen && (
                                <Marca titulo="Vol" banda={dia.bandaVolumen} />
                            )}
                            {dia.bandaIntensidad && (
                                <Marca titulo="Int" banda={dia.bandaIntensidad} />
                            )}
                        </span>
                    </>
                )}
            </button>

            {/* EL DETALLE DEL DÍA (#15).
                En portal, no en `absolute`: esta rejilla se desplaza en
                horizontal dentro de su caja, y un desplegable absoluto se
                recortaría contra ese borde justo en los días de la derecha,
                que son los que más cuesta consultar. */}
            <AnchoredMenu open={abierto} onClose={cerrar} anchorRef={ancla}>
                <div className="min-w-[210px] max-w-[280px] p-2">
                    <p className="pb-1.5 text-t-2xs font-black uppercase tracking-widest text-ink-subtle">
                        {dia.etiqueta}
                    </p>

                    <ul className="space-y-2">
                        {dia.basicos.map(b => (
                            <li key={b.lift}>
                                <p className={cn('text-t-xs font-black uppercase tracking-wide', COLOR[b.lift].texto)}>
                                    {b.label}
                                </p>
                                <p className="text-t-xs tabular-nums text-ink">{b.detail}</p>
                                <p className="text-t-2xs text-ink-subtle">
                                    {b.sets} series
                                    {b.reps > 0 && ` · ${b.reps} reps`}
                                    {b.topIntensity != null && ` · hasta ${b.topIntensity}% 1RM`}
                                </p>
                            </li>
                        ))}
                        {dia.seriesAccesorias > 0 && (
                            <li className="border-t border-[var(--border-subtle)] pt-1.5">
                                <p className="text-t-2xs text-ink-subtle">
                                    {dia.seriesAccesorias} series de accesorios
                                </p>
                            </li>
                        )}
                    </ul>

                    {(dia.bandaVolumen || dia.bandaIntensidad) && (
                        <p className="mt-2 border-t border-[var(--border-subtle)] pt-1.5 text-t-2xs text-ink-faint">
                            {dia.bandaVolumen && `Volumen ${ETIQUETA_BANDA[dia.bandaVolumen].toLowerCase()}`}
                            {dia.bandaVolumen && dia.bandaIntensidad && ' · '}
                            {dia.bandaIntensidad && `intensidad ${ETIQUETA_BANDA[dia.bandaIntensidad].toLowerCase()}`}
                            {' '}respecto al resto de la semana.
                        </p>
                    )}

                    {onAbrir && dia.sessionIds[0] && (
                        <button
                            onClick={() => { cerrar(); onAbrir(dia.sessionIds[0]); }}
                            className="mt-2 w-full rounded-field bg-brand-quiet py-1.5 text-t-2xs font-bold uppercase tracking-wide text-brand-text transition-colors hover:bg-brand hover:text-brand-ink"
                        >
                            Editar este día
                        </button>
                    )}
                </div>
            </AnchoredMenu>
        </li>
    );
}

/**
 * Marca de banda: tres puntos, con los que corresponden encendidos.
 *
 * Tres puntos y no la palabra "alto": la palabra ocupa el ancho de la
 * columna y obliga a leer siete veces lo mismo, mientras que la altura de
 * los puntos se compara de un vistazo entre columnas — que es exactamente
 * lo que se viene a hacer aquí.
 */
function Marca({ titulo, banda }: { titulo: string; banda: Banda }) {
    const nivel = banda === 'alto' ? 3 : banda === 'medio' ? 2 : 1;
    return (
        <span className="flex items-center gap-1" title={`${titulo}: ${ETIQUETA_BANDA[banda].toLowerCase()}`}>
            <span className="w-5 text-t-2xs uppercase text-ink-faint">{titulo}</span>
            <span className="flex gap-0.5" aria-hidden="true">
                {[1, 2, 3].map(i => (
                    <span
                        key={i}
                        className={cn(
                            'h-1 w-1.5 rounded-pill',
                            i <= nivel ? 'bg-ink-subtle' : 'bg-surface-overlay'
                        )}
                    />
                ))}
            </span>
            <span className="sr-only">{ETIQUETA_BANDA[banda]}</span>
        </span>
    );
}
