import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Trophy, CalendarRange, Loader, BarChart3 } from 'lucide-react';
import type { UserProfile } from '../../../hooks/useUser';
import { trainingService } from '../../../services/trainingService';
import { competitionsService, type CompetitionAssignment } from '../../../services/competitionsService';
import { seasonPhasesService } from '../../../services/seasonPhasesService';
import { faseActual, type FaseResuelta } from '../../../lib/period/fases';
import { resumenDeMovimiento, type ResumenDeMovimiento } from '../../../lib/stats/e1rmProgress';
import { MAIN_LIFTS, MAIN_LIFT_LABEL, type MainLift } from '../../../lib/planning/liftSummary';
import { weeklySeries } from '../../../lib/stats/athleteStats';
import { cn } from '../../../lib/utils';

/**
 * ESTADÍSTICAS DEL ATLETA
 * =====================================================================
 *
 * Cuatro preguntas, en el orden en que se hacen:
 *
 *   1. ¿Dónde estoy?      La fase de la temporada y la semana.
 *   2. ¿Cuándo compito?   La cuenta atrás.
 *   3. ¿Estoy subiendo?   El e1RM de los tres básicos, con su gráfica.
 *   4. ¿Y en detalle?     El mismo movimiento, con volumen e intensidad.
 *
 * Es una herramienta de MOTIVACIÓN, no un cuadro de mando. Por eso no hay
 * ni una sola cifra que el atleta no pueda usar: nada de "adherencia del
 * 87%" ni de tonelaje acumulado del año, que son preguntas del entrenador.
 *
 *
 * TODO SE CALCULA, NADA SE DUPLICA
 *
 * Las cifras salen de `getExerciseHistoryByAthlete()` —el mismo historial
 * que ya usa el análisis del coach— pasado por módulos puros:
 *
 *   lib/stats/e1rmProgress.ts   la evolución del 1RM estimado
 *   lib/stats/athleteStats.ts   volumen e intensidad por semana
 *   lib/period/fases.ts         en qué fase y semana estamos
 *
 * No hay ninguna tabla de estadísticas precalculadas. Si la hubiera, la
 * pantalla del atleta y la del entrenador se desincronizarían el día que
 * alguien corrigiera una serie.
 *
 *
 * EL e1RM SALE DE LO REGISTRADO, NO DE LO PAUTADO
 *
 * Ver la cabecera de `e1rmProgress.ts`: es la decisión que más cambia lo
 * que se ve. Un atleta que no registra sus series ve la gráfica vacía y el
 * motivo, en vez de la programación de su coach disfrazada de progreso.
 */

interface Props {
    user: UserProfile;
}

export function AthleteStatsView({ user }: Props) {
    /** El movimiento que se está mirando en detalle. `null` = la portada. */
    const [movimiento, setMovimiento] = useState<MainLift | null>(null);

    const historial = useQuery({
        queryKey: ['historial-ejercicios', user.id],
        staleTime: 5 * 60 * 1000,
        queryFn: () => trainingService.getExerciseHistoryByAthlete(user.id),
    });

    const fases = useQuery({
        queryKey: ['fases-temporada', user.id],
        staleTime: 5 * 60 * 1000,
        queryFn: () => seasonPhasesService.listForAthlete(user.id),
    });

    // Reutiliza la consulta que ya existía para el widget del inicio: la
    // competición asignada NO se duplica aquí.
    const competicion = useQuery({
        queryKey: ['proxima-competicion', user.id],
        staleTime: 5 * 60 * 1000,
        queryFn: () => competitionsService.getNextCompetition(user.id),
    });

    const filas = useMemo(() => historial.data ?? [], [historial.data]);

    const resumenes = useMemo(
        () => MAIN_LIFTS.map(l => resumenDeMovimiento(filas, l, MAIN_LIFT_LABEL[l])),
        [filas]
    );

    const fase = useMemo(
        () => faseActual(fases.data ?? [], movimiento),
        [fases.data, movimiento]
    );

    if (historial.isPending) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <Loader className="h-7 w-7 animate-spin text-brand-text" aria-hidden="true" />
            </div>
        );
    }

    /**
     * UN FALLO DE CARGA NO SE PARECE A "NO HAS ENTRENADO".
     *
     * Sin esta rama, un error de red caía en el estado vacío de abajo y le
     * decía a un atleta con dos años de registro que todavía no había
     * registrado nada. Es la peor mentira que puede contar una pantalla de
     * progreso, y además esconde el problema real.
     */
    if (historial.isError) {
        return (
            <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
                <p className="text-t-lg font-semibold text-ink">No se ha podido cargar tu historial</p>
                <p className="mt-2 text-t-sm leading-relaxed text-ink-muted">
                    Tus datos están a salvo: es esta pantalla la que no ha podido leerlos.
                    Comprueba la conexión y vuelve a intentarlo.
                </p>
                <button
                    onClick={() => historial.refetch()}
                    className="mt-6 rounded-pill bg-brand px-6 py-2.5 text-t-sm font-semibold text-brand-ink transition-opacity hover:opacity-90"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    const hayAlgo = resumenes.some(r => r.puntos.length > 0);

    return (
        <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 pb-24 md:px-8 md:py-6">
            {/* 1 + 2: DÓNDE ESTOY Y CUÁNDO COMPITO.
                Van juntos en una franja porque son la misma pregunta partida
                en dos: en qué punto de la preparación estoy. */}
            <div className="grid gap-3 sm:grid-cols-2">
                <TarjetaDeFase
                    fase={fase}
                    movimiento={movimiento}
                    cargando={fases.isPending}
                />
                <TarjetaDeCompeticion
                    competicion={competicion.data ?? null}
                    cargando={competicion.isPending}
                />
            </div>

            {/* 3: LOS TRES BÁSICOS */}
            <section>
                <h2 className="mb-2.5 flex items-center gap-2 text-t-2xs font-semibold tracking-[0.18em] text-ink-subtle">
                    <BarChart3 size={13} className="text-brand-text" aria-hidden="true" />
                    Tu fuerza
                </h2>

                {!hayAlgo ? (
                    <div className="rounded-card border border-dashed border-[var(--border-strong)] p-6 text-center">
                        <p className="text-t-sm font-bold text-ink">Todavía no hay nada que enseñar</p>
                        <p className="mx-auto mt-2 max-w-md text-t-xs leading-relaxed text-ink-muted">
                            Esta pantalla se construye con las series que REGISTRAS, no con las
                            que te programan. En cuanto marques kilos y repeticiones en tus
                            entrenamientos, aquí aparecerá tu evolución.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-3 md:grid-cols-3">
                        {resumenes.map((r, i) => (
                            <TarjetaDeMovimiento
                                key={r.lift}
                                resumen={r}
                                medalla={['🥇', '🥈', '🥉'][i]}
                                activo={movimiento === r.lift}
                                onSeleccionar={() =>
                                    setMovimiento(m => (m === r.lift ? null : (r.lift as MainLift)))
                                }
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* 4: EL DETALLE DEL MOVIMIENTO ELEGIDO */}
            {movimiento && (
                <DetalleDeMovimiento
                    resumen={resumenes.find(r => r.lift === movimiento)!}
                    filas={filas}
                    movimiento={movimiento}
                />
            )}
        </div>
    );
}

// =====================================================================
// 1. FASE DE LA TEMPORADA
// =====================================================================
//
// Las cuatro piezas de abajo se EXPORTAN, aunque solo las use este fichero.
// Son presentacionales puras —reciben datos y pintan— y esta pantalla vive
// detrás de un inicio de sesión Y de tener historial registrado, así que sin
// exportarlas no habría forma de mirarlas mientras se construyen. El banco
// de piezas las monta con datos inventados (src/features/devtools). Es el
// mismo motivo por el que `CoachAthletes` exporta `ArchivedList`.

export function TarjetaDeFase({
    fase,
    movimiento,
    cargando,
}: {
    fase: FaseResuelta | null;
    movimiento: MainLift | null;
    cargando: boolean;
}) {
    return (
        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
            <p className="flex items-center gap-1.5 text-t-2xs font-semibold tracking-[0.18em] text-ink-subtle">
                <CalendarRange size={12} className="text-brand-text" aria-hidden="true" />
                {movimiento ? `Fase · ${MAIN_LIFT_LABEL[movimiento]}` : 'Fase de la temporada'}
            </p>

            {cargando ? (
                <p className="mt-3 text-t-sm text-ink-subtle">Cargando…</p>
            ) : !fase ? (
                <>
                    <p className="mt-3 text-t-lg font-semibold text-ink-faint">Sin definir</p>
                    <p className="mt-1.5 text-t-xs leading-relaxed text-ink-subtle">
                        Tu entrenador todavía no ha marcado en qué fase estás. No afecta a tu
                        entrenamiento: es solo la etiqueta de este tramo de la temporada.
                    </p>
                </>
            ) : (
                <>
                    <p className="mt-2.5 text-t-2xl font-semibold leading-none tracking-display text-ink">
                        {fase.fase.name}
                    </p>
                    {fase.semanaActual != null && (
                        <>
                            <p className="mt-2 text-t-sm font-bold text-brand-text">
                                Semana {fase.semanaActual} de {fase.fase.weeks}
                            </p>
                            {/* Una barra por semana, no un porcentaje: "3 de 4"
                                se lee de un golpe y un 75% hay que traducirlo. */}
                            <div className="mt-2 flex gap-1" aria-hidden="true">
                                {Array.from({ length: fase.fase.weeks }, (_, i) => (
                                    <span
                                        key={i}
                                        className={cn(
                                            'h-1.5 flex-1 rounded-pill',
                                            i < fase.semanaActual! ? 'bg-brand' : 'bg-surface-overlay'
                                        )}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                    {fase.fase.notes && (
                        <p className="mt-2.5 text-t-xs leading-relaxed text-ink-muted">{fase.fase.notes}</p>
                    )}
                </>
            )}
        </div>
    );
}

// =====================================================================
// 2. PRÓXIMA COMPETICIÓN
// =====================================================================

export function TarjetaDeCompeticion({
    competicion,
    cargando,
}: {
    competicion: CompetitionAssignment | null;
    cargando: boolean;
}) {
    /**
     * Días que faltan, contando por DÍAS de calendario y no por
     * milisegundos entre dos instantes.
     *
     * `(fecha - ahora) / 86400000` da 0 días para una competición que es
     * mañana por la mañana si ahora es esta tarde. Lo que hay que contar es
     * cuántas veces sale el sol.
     */
    const dias = useMemo(() => {
        if (!competicion?.date) return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(competicion.date);
        if (!m) return null;
        const objetivo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const hoy = new Date();
        const hoyCero = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        return Math.round((objetivo.getTime() - hoyCero.getTime()) / 86400000);
    }, [competicion]);

    return (
        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
            <p className="flex items-center gap-1.5 text-t-2xs font-semibold tracking-[0.18em] text-ink-subtle">
                <Trophy size={12} className="text-brand-text" aria-hidden="true" />
                Próxima competición
            </p>

            {cargando ? (
                <p className="mt-3 text-t-sm text-ink-subtle">Cargando…</p>
            ) : !competicion ? (
                <>
                    <p className="mt-3 text-t-lg font-semibold text-ink-faint">Sin fecha</p>
                    <p className="mt-1.5 text-t-xs leading-relaxed text-ink-subtle">
                        Cuando tengas una competición asignada aparecerá aquí con su cuenta atrás.
                    </p>
                </>
            ) : (
                <>
                    <p className="mt-2.5 truncate text-t-xl font-semibold leading-tight tracking-display text-ink">
                        {competicion.name}
                    </p>
                    <p className="mt-1 text-t-xs text-ink-muted">
                        {formatearFecha(competicion.date)}
                        {competicion.location ? ` · ${competicion.location}` : ''}
                    </p>
                    {dias != null && (
                        <p className="mt-2.5 text-t-sm font-bold">
                            {dias > 0 ? (
                                <>
                                    <span className="text-t-2xl font-semibold tabular-nums text-brand-text">{dias}</span>
                                    <span className="ml-1.5 text-ink-muted">
                                        {dias === 1 ? 'día' : 'días'}
                                    </span>
                                </>
                            ) : dias === 0 ? (
                                <span className="text-brand-text">Es HOY</span>
                            ) : (
                                <span className="text-ink-subtle">Ya pasó</span>
                            )}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

function formatearFecha(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
        'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${Number(m[3])} de ${meses[Number(m[2]) - 1]} de ${m[1]}`;
}

// =====================================================================
// 3. TARJETA DE UN BÁSICO
// =====================================================================

export function TarjetaDeMovimiento({
    resumen,
    medalla,
    activo,
    onSeleccionar,
}: {
    resumen: ResumenDeMovimiento;
    medalla: string;
    activo: boolean;
    onSeleccionar: () => void;
}) {
    const sinDatos = resumen.puntos.length === 0;

    return (
        <button
            onClick={onSeleccionar}
            disabled={sinDatos}
            aria-pressed={activo}
            // `data-no-press`: la tarjeta ES el contenedor, y el CSS global
            // encoge todo pulsable un 3% al pulsarlo. En una tarjeta ancha eso
            // mueve la gráfica bajo el dedo. Ver src/index.css §3.
            data-no-press
            className={cn(
                'flex w-full flex-col rounded-card border bg-surface-raised p-4 text-left transition-colors duration-fast ease-snap',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                sinDatos
                    ? 'cursor-default border-[var(--border-subtle)] opacity-60'
                    : activo
                        ? 'border-[var(--brand-line)]'
                        : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
            )}
        >
            <span className="flex items-center gap-2">
                <span aria-hidden="true">{medalla}</span>
                <span className="truncate text-t-xs font-semibold text-ink-subtle">
                    {resumen.label}
                </span>
            </span>

            {sinDatos ? (
                <span className="mt-3 text-t-sm text-ink-subtle">Sin series registradas</span>
            ) : (
                <>
                    <span className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-t-3xl font-semibold leading-none tabular-nums text-ink">
                            {formatearKg(resumen.actual!)}
                        </span>
                        <span className="text-t-sm font-bold text-ink-subtle">kg</span>
                    </span>
                    <span className="mt-0.5 text-t-2xs text-ink-subtle">
                        1RM estimado
                    </span>

                    {resumen.delta != null && <Delta valor={resumen.delta} />}

                    {/* Miniatura. Sin ejes ni rejilla: a este tamaño lo único
                        que se lee es la FORMA, y los ejes solo quitan sitio.
                        Los números están arriba. */}
                    {resumen.puntos.length >= 2 && (
                        <span className="mt-3 block h-12">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={resumen.puntos} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                                    <Line
                                        type="monotone"
                                        dataKey="e1rm"
                                        stroke="var(--brand)"
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </span>
                    )}

                    <span className="mt-2 text-t-2xs text-ink-faint">
                        {resumen.puntos.length} {resumen.puntos.length === 1 ? 'sesión' : 'sesiones'}
                        {activo ? ' · tocado' : ' · toca para ver más'}
                    </span>
                </>
            )}
        </button>
    );
}

function Delta({ valor }: { valor: number }) {
    if (valor === 0) {
        return (
            <span className="mt-1.5 flex items-center gap-1 text-t-xs font-bold text-ink-subtle">
                <Minus size={13} aria-hidden="true" /> Igual que al empezar
            </span>
        );
    }
    const sube = valor > 0;
    const Icono = sube ? TrendingUp : TrendingDown;
    return (
        <span className={cn('mt-1.5 flex items-center gap-1 text-t-xs font-bold', sube ? 'text-success' : 'text-warning')}>
            <Icono size={13} aria-hidden="true" />
            {sube ? '+' : ''}{formatearKg(valor)} kg desde que empezaste
        </span>
    );
}

function formatearKg(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

// =====================================================================
// 4. DETALLE DE UN MOVIMIENTO
// =====================================================================

export function DetalleDeMovimiento({
    resumen,
    filas,
    movimiento,
}: {
    resumen: ResumenDeMovimiento;
    filas: Parameters<typeof weeklySeries>[0];
    movimiento: MainLift;
}) {
    /**
     * Volumen e intensidad semana a semana, del historial COMPLETO.
     *
     * No se filtra por movimiento: `weeklySeries` agrega todo el
     * entrenamiento, y eso es lo correcto para "cuánto trabajo llevo esta
     * semana". El detalle POR movimiento que sí tiene sentido —cuánto
     * levanto— ya está en la gráfica de arriba.
     */
    const semanas = useMemo(() => weeklySeries(filas), [filas]);

    return (
        <section className="rounded-card border border-[var(--brand-line)] bg-surface-raised p-4">
            <h3 className="text-t-lg font-semibold tracking-display text-ink">
                {MAIN_LIFT_LABEL[movimiento]}
            </h3>

            {/* EVOLUCIÓN DEL e1RM, a tamaño grande */}
            <p className="mt-4 text-t-2xs font-semibold tracking-[0.18em] text-ink-subtle">
                Evolución del 1RM estimado
            </p>
            {resumen.puntos.length < 2 ? (
                <p className="mt-2 text-t-xs text-ink-subtle">
                    Hace falta al menos dos sesiones registradas para dibujar una evolución.
                </p>
            ) : (
                <div className="mt-2 h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={resumen.puntos} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                            <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 10, fill: 'var(--ink-subtle)' }}
                                stroke="var(--border-default)"
                                // Con veinte sesiones las etiquetas se pisan. Recharts
                                // decide solo cuántas caben.
                                interval="preserveStartEnd"
                                minTickGap={20}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: 'var(--ink-subtle)' }}
                                stroke="var(--border-default)"
                                // El eje NO empieza en cero: entre 200 y 235 kg
                                // una escala desde 0 aplana la curva hasta que no
                                // se ve la progresión, que es justo lo que se
                                // viene a mirar.
                                domain={['dataMin - 10', 'dataMax + 10']}
                                width={46}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--surface-overlay)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    fontSize: 12,
                                }}
                                labelStyle={{ color: 'var(--ink-subtle)' }}
                                // Los tipos de Recharts dan `ValueType | undefined`,
                                // no `number`: el punto puede no tener valor. Se
                                // comprueba en vez de forzar el tipo.
                                formatter={(v, _n, item) => {
                                    const punto = (item as { payload?: { load?: number; reps?: number } })?.payload;
                                    const kg = typeof v === 'number' ? formatearKg(v) : '—';
                                    const detalle = punto?.load != null && punto?.reps != null
                                        ? `  (${punto.load} × ${punto.reps})`
                                        : '';
                                    return [`${kg} kg${detalle}`, '1RM estimado'];
                                }}
                            />
                            {resumen.mejor != null && (
                                <ReferenceLine
                                    y={resumen.mejor}
                                    stroke="var(--success)"
                                    strokeDasharray="4 4"
                                    label={{
                                        value: `Mejor ${formatearKg(resumen.mejor)}`,
                                        position: 'insideTopRight',
                                        fill: 'var(--success)',
                                        fontSize: 10,
                                    }}
                                />
                            )}
                            <Line
                                type="monotone"
                                dataKey="e1rm"
                                stroke="var(--brand)"
                                strokeWidth={2.5}
                                dot={{ r: 2.5, fill: 'var(--brand)' }}
                                activeDot={{ r: 4 }}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* VOLUMEN E INTENSIDAD por semana */}
            {semanas.length >= 2 && (
                <>
                    <p className="mt-6 text-t-2xs font-semibold tracking-[0.18em] text-ink-subtle">
                        Tu semana, en volumen e intensidad
                    </p>
                    <div className="mt-2 h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={semanas} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                                <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 10, fill: 'var(--ink-subtle)' }}
                                    stroke="var(--border-default)"
                                    interval="preserveStartEnd"
                                    minTickGap={20}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: 'var(--ink-subtle)' }}
                                    stroke="var(--border-default)"
                                    width={46}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--surface-overlay)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        fontSize: 12,
                                    }}
                                    labelStyle={{ color: 'var(--ink-subtle)' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="sets"
                                    name="Series"
                                    stroke="var(--brand)"
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="avgIntensityPct"
                                    name="Intensidad media (%1RM)"
                                    stroke="var(--info)"
                                    strokeWidth={2}
                                    dot={false}
                                    // Sin esto, una semana sin intensidad medible
                                    // parte la línea en dos trozos sueltos.
                                    connectNulls
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="mt-1.5 text-t-2xs leading-relaxed text-ink-faint">
                        Series de TODO tu entrenamiento por semana, y la intensidad media
                        relativa a tu mejor marca estimada.
                    </p>
                </>
            )}
        </section>
    );
}
