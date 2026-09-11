import { useMemo, useRef, useState } from 'react';
import { Dumbbell, Target } from 'lucide-react';
import type { VolumeSessionInput } from '../../../../lib/volume/engine';
import {
    weeklyLiftSummary,
    weeklyExerciseSummary,
    type LiftWeekSummary,
} from '../../../../lib/planning/liftSummary';
import {
    objetivosVigentes,
    progresoDeTodos,
    METRICA_INFO,
    type ObjetivoDeVolumen,
    type ProgresoDeObjetivo,
} from '../../../../lib/volume/objetivos';
import { AnchoredMenu } from '../../../../components/ui/AnchoredMenu';
import { ContextSection, ContextEmpty } from './ContextSection';
import { cn } from '../../../../lib/utils';

/**
 * SERIES SEMANALES DE LOS TRES BÁSICOS — LO PROGRAMADO, CONTRA EL OBJETIVO
 * =====================================================================
 *
 * Va ARRIBA DEL TODO del panel y abierta por defecto, porque es la cifra que
 * decide lo que el coach está a punto de escribir: si la sentadilla lleva ya
 * 16 series esta semana, el día que se está editando no lleva otras seis.
 *
 * Se recalcula con cada tecla. No hace ninguna consulta: recibe el estado
 * LOCAL del constructor (el mismo array que alimenta al panel de volumen), así
 * que refleja también lo que todavía no se ha guardado — que es precisamente
 * lo que se necesita mientras se decide si guardarlo.
 *
 *
 * EL OBJETIVO SE DESCUENTA, NO SE JUZGA
 *
 * Cuando hay un presupuesto para el movimiento, debajo de la fila aparece
 * una barra por métrica con lo que queda: "faltan 4 series", "te has pasado
 * de 12 reps". No dice si la semana está bien o mal programada —eso es del
 * coach— ni impide pasarse: solo enseña la cuenta que hasta ahora había que
 * llevar de cabeza.
 *
 * Los objetivos llegan YA RESUELTOS por ámbito desde `objetivosVigentes`
 * (semana > bloque > atleta). Ver src/lib/volume/objetivos.ts.
 *
 *
 * EL DESGLOSE VA EN UN MENÚ ANCLADO, NO EN UN `title`
 *
 * Un `title` nativo tarda un segundo largo en aparecer, no se puede tocar en
 * móvil y no admite formato — y aquí lo que hay que enseñar son tres o cuatro
 * líneas con día, series y porcentaje. `AnchoredMenu` ya resuelve el portal,
 * el cierre al pulsar fuera y el foco, y sobre todo resuelve el recorte: este
 * panel tiene `overflow-y-auto`, así que un desplegable en `absolute` se
 * cortaría contra su borde.
 *
 * Se abre al PULSAR y no al pasar por encima: en móvil no hay hover, y un
 * panel donde la mitad de la información solo existe con ratón es medio panel.
 */

interface CurrentWeekLiftsProps {
    sessions: VolumeSessionInput[];
    week: number;
    /** 1RM declarados del atleta, para poder escribir el % en el desglose. */
    declaredMaxes?: Record<string, number>;
    /** TODOS los del atleta, sin filtrar: aquí se resuelven por ámbito. */
    objetivos?: readonly ObjetivoDeVolumen[];
    /** Bloque que se está editando, para resolver el ámbito. */
    blockId?: string | null;
    /** Abre el editor de objetivos. Sin él, el botón no se pinta. */
    onEditarObjetivos?: () => void;
}

export function CurrentWeekLifts({
    sessions,
    week,
    declaredMaxes = {},
    objetivos = [],
    blockId = null,
    onEditarObjetivos,
}: CurrentWeekLiftsProps) {
    const summary = useMemo(
        () => weeklyLiftSummary(sessions, week, declaredMaxes),
        [sessions, week, declaredMaxes]
    );

    /**
     * Lo programado por EJERCICIO, para los objetivos que no son de un
     * básico.
     *
     * Una llamada por objetivo y no una pasada que devuelva todos los
     * ejercicios de la semana: `weeklyExerciseSummary` está hecha para
     * contestar por UN nombre —así lo usa ya la comparación semanal— y
     * generalizarla obligaría a tocar una función con pruebas y en uso.
     * Objetivos de ejercicio suelto hay dos o tres, no cincuenta.
     *
     * Se indexa por `scope_key`, que es lo que trae el objetivo, y la
     * función normaliza el nombre por dentro con el mismo `exerciseKey()`,
     * así que "Remo con barra" y "remo con barra" caen en la misma cuenta.
     */
    const porEjercicio = useMemo(() => {
        const mapa = new Map<string, { sets: number; reps: number; tonnage: number }>();
        for (const o of objetivos) {
            if (o.scope !== 'exercise' || mapa.has(o.scope_key)) continue;
            const r = weeklyExerciseSummary(sessions, week, o.label, declaredMaxes);
            mapa.set(o.scope_key, { sets: r.sets, reps: r.reps, tonnage: r.tonnage });
        }
        return mapa;
    }, [objetivos, sessions, week, declaredMaxes]);

    const progreso = useMemo(() => {
        const vigentes = objetivosVigentes(objetivos, blockId, week);
        return progresoDeTodos(vigentes, summary, porEjercicio);
    }, [objetivos, blockId, week, summary, porEjercicio]);

    /** Los del movimiento X, para colgarlos bajo su fila. */
    const progresoPorMovimiento = useMemo(() => {
        const mapa = new Map<string, ProgresoDeObjetivo[]>();
        for (const p of progreso) {
            const clave = p.objetivo.scope_key;
            mapa.set(clave, [...(mapa.get(clave) ?? []), p]);
        }
        return mapa;
    }, [progreso]);

    const total = summary.reduce((n, s) => n + s.sets, 0);

    /** Objetivos que no son de un básico: van en su propia lista, al final. */
    const sueltos = progreso.filter(p => p.objetivo.scope === 'exercise');

    return (
        <ContextSection
            icon={Dumbbell}
            title="Semana actual"
            defaultOpen
            badge={`${total} series`}
            hint={summary.filter(s => s.sets > 0).map(s => `${s.label} ${s.sets}`).join(' · ') || 'Sin básicos'}
        >
            {total === 0 && progreso.length === 0 ? (
                <ContextEmpty>
                    Esta semana no hay ninguna serie de sentadilla, banca ni peso muerto
                    programada todavía.
                </ContextEmpty>
            ) : (
                <ul className="space-y-1.5">
                    {summary.map(lift => (
                        <LiftRow
                            key={lift.lift}
                            lift={lift}
                            progreso={progresoPorMovimiento.get(lift.lift) ?? []}
                        />
                    ))}
                </ul>
            )}

            {sueltos.length > 0 && (
                <ul className="mt-1.5 space-y-1.5 border-t border-[var(--border-subtle)] pt-1.5">
                    {agruparPorClave(sueltos).map(([clave, filas]) => (
                        <li key={clave} className="rounded-field bg-surface-sunken px-2.5 py-2">
                            <p className="truncate text-t-xs font-bold text-ink">{filas[0].objetivo.label}</p>
                            <Barras progreso={filas} />
                        </li>
                    ))}
                </ul>
            )}

            {onEditarObjetivos && (
                <button
                    onClick={onEditarObjetivos}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-field border border-[var(--border-default)] py-1.5 text-t-2xs font-bold text-ink-subtle transition-colors duration-fast ease-snap hover:border-brand/40 hover:text-brand-text"
                >
                    <Target size={11} aria-hidden="true" />
                    {progreso.length > 0 ? 'Editar objetivos' : 'Poner objetivo de volumen'}
                </button>
            )}
        </ContextSection>
    );
}

/** Agrupa por `scope_key` conservando el orden de llegada. */
function agruparPorClave(filas: ProgresoDeObjetivo[]): [string, ProgresoDeObjetivo[]][] {
    const mapa = new Map<string, ProgresoDeObjetivo[]>();
    for (const f of filas) {
        const k = f.objetivo.scope_key;
        mapa.set(k, [...(mapa.get(k) ?? []), f]);
    }
    return [...mapa.entries()];
}

// =====================================================================

function LiftRow({ lift, progreso }: { lift: LiftWeekSummary; progreso: ProgresoDeObjetivo[] }) {
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLButtonElement>(null);

    const hasDetail = lift.days.length > 0;

    return (
        <li className={cn(progreso.length > 0 && 'rounded-field bg-surface-sunken')}>
            <button
                ref={anchor}
                onClick={() => hasDetail && setOpen(v => !v)}
                aria-expanded={hasDetail ? open : undefined}
                aria-haspopup={hasDetail ? 'dialog' : undefined}
                disabled={!hasDetail}
                className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-field px-2.5 py-2 text-left transition-colors duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    // Con objetivo, el fondo lo pone el <li> para que la barra
                    // de abajo quede dentro de la misma pieza.
                    progreso.length > 0
                        ? hasDetail ? 'hover:bg-surface-overlay' : ''
                        : hasDetail ? 'bg-surface-sunken hover:bg-surface-overlay' : 'bg-surface-sunken/50'
                )}
            >
                <span className="min-w-0">
                    <span className="block truncate text-t-xs font-bold text-ink">{lift.label}</span>
                    {/* La frecuencia al lado de las series: 12 series en un día
                        y 12 en tres no son el mismo estímulo, y el número solo
                        no lo distingue. */}
                    <span className="block text-t-2xs text-ink-subtle">
                        {lift.sets === 0
                            ? 'Sin programar'
                            : `${lift.frequency} ${lift.frequency === 1 ? 'día' : 'días'}${lift.reps > 0 ? ` · ${lift.reps} reps` : ''}`}
                    </span>
                </span>

                <span className="shrink-0 text-right">
                    <span className={`block text-t-lg font-semibold leading-none tabular-nums ${lift.sets > 0 ? 'text-brand-text' : 'text-ink-faint'}`}>
                        {lift.sets}
                    </span>
                    <span className="block text-t-2xs text-ink-subtle">
                        series
                    </span>
                </span>
            </button>

            {progreso.length > 0 && (
                <div className="px-2.5 pb-2">
                    <Barras progreso={progreso} />
                </div>
            )}

            <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={anchor}>
                <div className="min-w-[200px] max-w-[260px] p-1">
                    <p className="px-2 pb-1.5 pt-0.5 text-t-2xs font-semibold text-ink-subtle">
                        {lift.label} — {lift.sets} series
                    </p>

                    <ul className="space-y-1.5 px-2 pb-1">
                        {lift.days.map(day => (
                            <li key={day.sessionId}>
                                <p className="text-t-2xs font-bold text-ink">{day.dayLabel}</p>
                                <p className="text-t-2xs tabular-nums text-ink-muted">{day.detail}</p>
                            </li>
                        ))}
                    </ul>

                    {lift.tonnage > 0 && (
                        <p className="border-t border-[var(--border-subtle)] px-2 pb-0.5 pt-1.5 text-t-2xs tabular-nums text-ink-subtle">
                            {lift.reps} reps · {(lift.tonnage / 1000).toFixed(1)} t
                        </p>
                    )}
                </div>
            </AnchoredMenu>
        </li>
    );
}

// =====================================================================

/**
 * Una barra por métrica con lo que queda del presupuesto.
 *
 * El ancho se anima con `width` y no con `transform: scaleX`, igual que la
 * barra de progreso del registro: una barra escalada deforma sus propios
 * bordes redondeados, y a 4px de alto el coste de recalcular la disposición
 * es nulo.
 *
 * El color solo tiene tres estados y ninguno es un juicio: gris mientras
 * queda trabajo, verde cuando se ha llegado, ámbar cuando se ha pasado.
 * Pasarse no es un error —una semana de acumulación puede querer pasarse—,
 * así que no es rojo.
 */
function Barras({ progreso }: { progreso: ProgresoDeObjetivo[] }) {
    return (
        <ul className="space-y-1">
            {progreso.map(p => {
                const info = METRICA_INFO[p.objetivo.metric];
                const cumplido = p.restante === 0;
                return (
                    <li key={p.objetivo.id}>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-t-2xs text-ink-subtle">
                                {info.corto}
                            </span>
                            <span className="shrink-0 text-t-2xs tabular-nums text-ink-muted">
                                <span className={cn('font-bold', cumplido ? 'text-success' : 'text-ink')}>
                                    {redondear(p.programado)}
                                </span>
                                {' / '}
                                {redondear(p.objetivo.target)}
                                {p.exceso > 0 && (
                                    <span className="ml-1 font-bold text-warning">+{redondear(p.exceso)}</span>
                                )}
                                {p.restante > 0 && (
                                    <span className="ml-1 text-ink-subtle">faltan {redondear(p.restante)}</span>
                                )}
                            </span>
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-pill bg-surface-overlay">
                            <div
                                className={cn(
                                    'h-full rounded-pill transition-[width] duration-base ease-snap',
                                    p.exceso > 0 ? 'bg-warning' : cumplido ? 'bg-success' : 'bg-brand'
                                )}
                                style={{ width: `${Math.round(p.fraccion * 100)}%` }}
                            />
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

/** Sin decimales cuando son enteros: "12", no "12,00". */
function redondear(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
