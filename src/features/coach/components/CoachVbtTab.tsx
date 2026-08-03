import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine,
    ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Activity, Download, Loader, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { vbtService } from '../../../services/vbtService';
import { trainingService } from '../../../services/trainingService';
import type { SessionExercise, TrainingBlock, TrainingSession, VbtMeasurement } from '../../../types/training';
import {
    buildLoadVelocityProfile, rirFromVelocityLoss, summarizeByExercise,
    velocityTrend, VELOCITY_ZONES, velocityZone,
} from '../../../lib/vbt/analysis';
import { AddMeasurementModal } from '../../vbt/components/AddMeasurementModal';
import { VbtChartModal } from './VbtChartModal';
import { useUser } from '../../../hooks/useUser';
import { cn } from '../../../lib/utils';

/**
 * VBT — ESPACIO DE ANÁLISIS
 * =====================================================================
 *
 * DE DÓNDE VIENE
 *
 * Esta pestaña era una LISTA DE ARCHIVOS: las series del plan que tenían un
 * CSV adjunto, con un botón para abrir su gráfica. No se podía añadir nada a
 * mano, no había ninguna estadística, y la fecha que enseñaba era inventada
 * —la de creación del bloque más el número de día—.
 *
 * QUÉ ES AHORA
 *
 * El sitio donde vive el perfil carga-velocidad de cada ejercicio del atleta,
 * que es lo que de verdad se usa en VBT:
 *
 *   · Perfil     — la recta carga-velocidad y el 1RM que se deduce de ella,
 *                  sin tener que probar el máximo.
 *   · Tendencia  — velocidad corregida por carga a lo largo del tiempo. Sin
 *                  la corrección, la gráfica solo dibujaría el calendario de
 *                  intensidades del bloque.
 *   · Fatiga     — pérdida de velocidad dentro de las series.
 *   · Mediciones — la tabla, con su origen y su archivo.
 *
 * TODA CIFRA LLEVA SU CONTEXTO. Un 1RM estimado con R²=0,42 no es un 1RM: es
 * una nube de puntos, y la pantalla lo dice en vez de enseñar el número a
 * secas.
 */

type VbtView = 'perfil' | 'tendencia' | 'fatiga' | 'mediciones';

const VIEWS: [VbtView, string][] = [
    ['perfil', 'Perfil carga-velocidad'],
    ['tendencia', 'Tendencia'],
    ['fatiga', 'Fatiga'],
    ['mediciones', 'Mediciones'],
];

const AXIS = { fill: 'var(--ink-subtle)', fontSize: 11 };
const GRID = 'var(--border-subtle)';
const TOOLTIP = {
    background: 'var(--surface-overlay)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    fontSize: 12,
    color: 'var(--ink)',
};

type LegacyVbtExercise = SessionExercise & {
    session: TrainingSession; block: TrainingBlock; exercise?: { name: string };
};

export default function CoachVbtTab({ athleteId }: { athleteId: string }) {
    const { data: currentUser } = useUser();
    const [measurements, setMeasurements] = useState<VbtMeasurement[]>([]);
    const [legacy, setLegacy] = useState<LegacyVbtExercise[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<VbtView>('perfil');
    const [exercise, setExercise] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [chartUrl, setChartUrl] = useState<{ url: string; name: string } | null>(null);

    const load = useCallback(async () => {
        try {
            // Las dos fuentes en paralelo. La lista antigua —archivos colgados
            // de series del plan— sigue siendo válida y no se tira: son
            // ficheros reales que el atleta subió.
            const [rows, exercises] = await Promise.all([
                vbtService.getMeasurements(athleteId),
                trainingService.getVbtExercisesByAthlete(athleteId).catch(() => []),
            ]);
            setMeasurements(rows);
            setLegacy(exercises as LegacyVbtExercise[]);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo cargar el VBT');
        } finally {
            setLoading(false);
        }
    }, [athleteId]);

    useEffect(() => { void load(); }, [load]);

    const byExercise = useMemo(() => summarizeByExercise(measurements), [measurements]);

    /**
     * El ejercicio elegido por defecto es el MÁS MEDIDO, no el primero por
     * orden alfabético: es el que tiene perfil que enseñar.
     *
     * Se resuelve al leer y no con un efecto que escriba estado: `exercise`
     * solo guarda una elección EXPLÍCITA del usuario, y lo demás se deriva.
     */
    const selectedExercise = exercise ?? byExercise[0]?.exerciseName ?? null;

    const profile = useMemo(
        () => (selectedExercise ? buildLoadVelocityProfile(measurements, selectedExercise) : null),
        [measurements, selectedExercise]
    );

    const trend = useMemo(
        () => (selectedExercise ? velocityTrend(measurements, selectedExercise) : []),
        [measurements, selectedExercise]
    );

    const exerciseMeasurements = useMemo(
        () => measurements.filter(
            m => !selectedExercise || m.exercise_name.trim().toLowerCase() === selectedExercise.trim().toLowerCase()
        ),
        [measurements, selectedExercise]
    );

    /**
     * La recta ajustada, como dos puntos.
     *
     * Se dibuja algo más allá de la carga máxima medida para que se vea hacia
     * dónde apunta, pero NO hasta el 1RM estimado: pintar la recta cruzando el
     * MVT daría a entender que el máximo está medido cuando es una
     * extrapolación.
     */
    const profileLine = useMemo(() => {
        if (!profile) return [];
        const kgs = profile.points.map(p => p.kg);
        const min = Math.min(...kgs);
        const max = Math.max(...kgs);
        const span = max - min;
        return [
            { kg: Math.max(0, min - span * 0.1), ajuste: profile.velocityAt(Math.max(0, min - span * 0.1)) },
            { kg: max + span * 0.15, ajuste: profile.velocityAt(max + span * 0.15) },
        ];
    }, [profile]);

    /**
     * Cargas a las que se movería cada velocidad objetivo.
     *
     * Es la tabla que convierte el perfil en prescripción: "para trabajar a
     * 0,60 m/s en este ejercicio, ponle 132 kg". Sin esto, el perfil es una
     * curiosidad; con esto, es la razón por la que se mide.
     */
    const prescriptionTable = useMemo(() => {
        if (!profile || profile.estimated1RM === null) return [];
        return [0.90, 0.75, 0.60, 0.45, 0.35]
            .map(v => {
                const kg = profile.loadAt(v);
                if (kg === null || kg <= 0) return null;
                return {
                    velocity: v,
                    kg: Math.round(kg),
                    pct: Math.round((kg / profile.estimated1RM!) * 100),
                    zone: velocityZone(v),
                };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null && r.pct > 20 && r.pct <= 105);
    }, [profile]);

    const remove = async (id: string) => {
        if (!confirm('¿Borrar esta medición?')) return;
        try {
            await vbtService.deleteMeasurement(id);
            setMeasurements(prev => prev.filter(m => m.id !== id));
            toast.success('Medición borrada');
        } catch (err) {
            console.error(err);
            toast.error('No se pudo borrar');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader className="animate-spin text-brand" size={28} />
            </div>
        );
    }

    const hasData = measurements.length > 0;

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-t-lg font-black uppercase tracking-tight text-ink">
                    <Activity className="text-brand" size={20} aria-hidden="true" />
                    Velocidad
                </h3>

                <button
                    onClick={() => setAddOpen(true)}
                    className="flex items-center gap-1.5 rounded-field bg-brand px-3.5 py-2 text-t-xs font-bold text-brand-ink transition-colors duration-fast hover:opacity-90"
                >
                    <Plus size={14} aria-hidden="true" /> Añadir series
                </button>
            </header>

            {!hasData ? (
                <div className="rounded-card border border-[var(--border-default)] bg-surface-raised px-6 py-12 text-center">
                    <Activity size={40} className="mx-auto mb-4 text-ink-faint" aria-hidden="true" />
                    <h4 className="text-t-base font-bold text-ink">Sin mediciones todavía</h4>
                    <p className="mx-auto mt-2 max-w-md text-t-sm leading-relaxed text-ink-subtle">
                        Añade las series medidas a mano o sube el CSV del encoder. Con tres cargas
                        distintas del mismo ejercicio ya se puede ajustar su perfil carga-velocidad y
                        estimar el 1RM sin tener que probarlo.
                    </p>
                    <button
                        onClick={() => setAddOpen(true)}
                        className="mt-5 inline-flex items-center gap-1.5 rounded-field bg-brand px-4 py-2.5 text-t-xs font-bold text-brand-ink transition-colors duration-fast hover:opacity-90"
                    >
                        <Plus size={14} aria-hidden="true" /> Añadir la primera serie
                    </button>

                    {legacy.length > 0 && (
                        <p className="mt-6 text-t-2xs text-ink-faint">
                            Hay {legacy.length} archivos adjuntos a series del plan. Aparecen abajo,
                            en Mediciones.
                        </p>
                    )}
                </div>
            ) : (
                <>
                    {/* Ejercicio + vista */}
                    <div className="flex flex-wrap items-center gap-3">
                        <select
                            value={selectedExercise ?? ''}
                            onChange={e => setExercise(e.target.value)}
                            aria-label="Ejercicio"
                            className="rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-t-sm text-ink"
                        >
                            {byExercise.map(e => (
                                <option key={e.exerciseName} value={e.exerciseName}>
                                    {e.exerciseName} ({e.measurements})
                                </option>
                            ))}
                        </select>

                        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-field bg-surface-sunken p-0.5">
                            {VIEWS.map(([value, label]) => (
                                <button
                                    key={value}
                                    role="tab"
                                    aria-selected={view === value}
                                    onClick={() => setView(value)}
                                    className={cn(
                                        'shrink-0 rounded-chip px-3 py-1.5 text-t-xs font-semibold transition-colors duration-fast ease-snap',
                                        view === value ? 'bg-brand text-brand-ink' : 'text-ink-subtle hover:text-ink'
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Cifras del ejercicio elegido */}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Metric
                            label="1RM estimado"
                            value={profile?.estimated1RM != null ? `${profile.estimated1RM} kg` : '—'}
                            hint={
                                profile
                                    ? `Extrapolado a ${profile.mvt} m/s, la velocidad de un máximo en este movimiento`
                                    : 'Hacen falta tres cargas distintas'
                            }
                        />
                        <Metric
                            label="Ajuste (R²)"
                            value={profile ? String(profile.r2) : '—'}
                            hint={
                                !profile ? 'Sin perfil'
                                    : profile.r2 >= 0.9 ? 'Los puntos describen una recta clara'
                                        : profile.r2 >= 0.7 ? 'Aceptable. Añade cargas para afinarlo'
                                            : 'Demasiado disperso: el 1RM de al lado no es fiable'
                            }
                            tone={!profile ? 'neutral' : profile.r2 >= 0.7 ? 'good' : 'warn'}
                        />
                        <Metric
                            label="Carga más alta"
                            value={
                                byExercise.find(e => e.exerciseName === selectedExercise)?.bestLoad != null
                                    ? `${byExercise.find(e => e.exerciseName === selectedExercise)!.bestLoad} kg`
                                    : '—'
                            }
                            hint={`${exerciseMeasurements.length} series medidas`}
                        />
                        <Metric
                            label="Última medición"
                            value={
                                exerciseMeasurements[0]
                                    ? format(new Date(exerciseMeasurements[0].performed_at), 'd MMM', { locale: es })
                                    : '—'
                            }
                            hint={exerciseMeasurements[0]?.source ?? ''}
                        />
                    </div>

                    {view === 'perfil' && (
                        <Card
                            title={`Perfil carga-velocidad · ${selectedExercise ?? ''}`}
                            subtitle="Cada punto es una serie medida. La recta cruza la velocidad a la que se completa un máximo, así que da un 1RM sin tener que probarlo."
                        >
                            {!profile ? (
                                <Empty>
                                    Hacen falta al menos tres cargas distintas de este ejercicio. Con dos,
                                    la recta pasa exacta por ambos puntos y el ajuste parece perfecto sin
                                    serlo.
                                </Empty>
                            ) : (
                                <>
                                    <div className="h-80">
                                        <ResponsiveContainer>
                                            <ComposedChart margin={{ top: 8, right: 12, left: -8, bottom: 12 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                <XAxis
                                                    type="number"
                                                    dataKey="kg"
                                                    name="Carga"
                                                    unit=" kg"
                                                    tick={AXIS}
                                                    domain={['dataMin - 5', 'dataMax + 5']}
                                                    allowDuplicatedCategory={false}
                                                />
                                                <YAxis
                                                    type="number"
                                                    name="Velocidad"
                                                    unit=" m/s"
                                                    tick={AXIS}
                                                    domain={[0, 'dataMax + 0.1']}
                                                />
                                                <Tooltip contentStyle={TOOLTIP} cursor={{ strokeDasharray: '3 3' }} />
                                                {/* El MVT es la referencia que da sentido a la
                                                    extrapolación: sin él, el 1RM estimado sale de
                                                    la nada. */}
                                                <ReferenceLine
                                                    y={profile.mvt}
                                                    stroke="var(--warning)"
                                                    strokeDasharray="4 4"
                                                    label={{
                                                        value: `1RM ≈ ${profile.mvt} m/s`,
                                                        fill: 'var(--ink-subtle)',
                                                        fontSize: 11,
                                                        position: 'insideTopRight',
                                                    }}
                                                />
                                                <Line
                                                    data={profileLine}
                                                    dataKey="ajuste"
                                                    name="Ajuste"
                                                    stroke="var(--info)"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    isAnimationActive={false}
                                                />
                                                <Scatter
                                                    data={profile.points}
                                                    dataKey="velocity"
                                                    name="Series medidas"
                                                    fill="var(--brand)"
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {profile.r2 < 0.7 && (
                                        <p className="mt-3 rounded-field bg-[var(--warning-quiet)] px-3 py-2 text-t-2xs leading-relaxed text-warning">
                                            El ajuste es de {profile.r2}: los puntos no describen una recta
                                            clara. Suele significar que las mediciones vienen de días muy
                                            distintos, o que hay velocidades de series con repeticiones muy
                                            distintas mezcladas. Trata el 1RM estimado como orientativo.
                                        </p>
                                    )}

                                    {prescriptionTable.length > 0 && (
                                        <div className="mt-5">
                                            <h4 className="text-t-xs font-bold text-ink">
                                                Qué carga poner para cada velocidad
                                            </h4>
                                            <p className="mt-0.5 text-t-2xs text-ink-subtle">
                                                Salida directa de la recta. Es lo que convierte el perfil en
                                                prescripción.
                                            </p>
                                            <div className="mt-2 -mx-1 overflow-x-auto">
                                                <table className="w-full min-w-[24rem] border-collapse text-t-xs">
                                                    <thead>
                                                        <tr className="text-ink-subtle">
                                                            <th className="px-2 py-1.5 text-left font-medium">Velocidad</th>
                                                            <th className="px-2 py-1.5 text-right font-medium">Carga</th>
                                                            <th className="px-2 py-1.5 text-right font-medium">% 1RM</th>
                                                            <th className="px-2 py-1.5 text-left font-medium">Cualidad</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {prescriptionTable.map(row => (
                                                            <tr key={row.velocity} className="border-t border-[var(--border-subtle)]">
                                                                <td className="px-2 py-1.5 tabular-nums text-ink">{row.velocity.toFixed(2)} m/s</td>
                                                                <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-ink">{row.kg} kg</td>
                                                                <td className="px-2 py-1.5 text-right tabular-nums text-ink-muted">{row.pct}%</td>
                                                                <td className="px-2 py-1.5" style={{ color: row.zone.color }}>{row.zone.label}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </Card>
                    )}

                    {view === 'tendencia' && (
                        <Card
                            title="Velocidad en el tiempo, corregida por carga"
                            subtitle="El residuo es la diferencia entre la velocidad real y la que predice el perfil para esa carga. Positivo = más rápido de lo esperado. La velocidad bruta, sola, solo dibujaría el calendario de intensidades del bloque."
                        >
                            {trend.length < 2 ? (
                                <Empty>Hacen falta mediciones de al menos dos días distintos.</Empty>
                            ) : (
                                <div className="h-72">
                                    <ResponsiveContainer>
                                        <LineChart data={trend} margin={{ top: 5, right: 8, left: -12, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                            <XAxis dataKey="label" tick={AXIS} />
                                            <YAxis yAxisId="v" tick={AXIS} unit=" m/s" />
                                            <YAxis yAxisId="kg" orientation="right" tick={AXIS} unit=" kg" />
                                            <Tooltip contentStyle={TOOLTIP} />
                                            <Legend wrapperStyle={{ fontSize: 12 }} />
                                            <ReferenceLine yAxisId="v" y={0} stroke={GRID} />
                                            <Line yAxisId="v" type="monotone" dataKey="velocity" name="Velocidad (m/s)" stroke="var(--brand)" strokeWidth={2.5} dot={{ r: 3 }} />
                                            <Line yAxisId="v" type="monotone" dataKey="residual" name="Residuo vs perfil" stroke="var(--success)" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5 }} connectNulls />
                                            <Line yAxisId="kg" type="monotone" dataKey="load" name="Carga (kg)" stroke="var(--ink-faint)" strokeWidth={1.5} dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Card>
                    )}

                    {view === 'fatiga' && (
                        <Card
                            title="Pérdida de velocidad dentro de la serie"
                            subtitle="De la mejor repetición a la última. Es el indicador con el que se decide cortar una serie: por encima del 30% el trabajo pasa a ser de resistencia más que de fuerza."
                        >
                            {exerciseMeasurements.filter(m => m.velocity_loss != null).length === 0 ? (
                                <Empty>
                                    Ninguna serie de este ejercicio tiene pérdida registrada. Se calcula sola
                                    al subir un archivo con la velocidad de cada repetición.
                                </Empty>
                            ) : (
                                <>
                                    <div className="h-64">
                                        <ResponsiveContainer>
                                            <LineChart
                                                data={[...exerciseMeasurements]
                                                    .filter(m => m.velocity_loss != null)
                                                    .reverse()
                                                    .map(m => ({
                                                        label: `${m.performed_at.slice(5).split('-').reverse().join('/')} S${m.set_number ?? ''}`,
                                                        perdida: Number(m.velocity_loss),
                                                        carga: m.load_kg != null ? Number(m.load_kg) : null,
                                                    }))}
                                                margin={{ top: 5, right: 8, left: -12, bottom: 5 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                                                <XAxis dataKey="label" tick={AXIS} />
                                                <YAxis tick={AXIS} unit="%" />
                                                <Tooltip contentStyle={TOOLTIP} />
                                                <ReferenceLine y={20} stroke="var(--info)" strokeDasharray="4 4" label={{ value: '20%', fill: 'var(--ink-subtle)', fontSize: 10, position: 'right' }} />
                                                <ReferenceLine y={30} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: '30%', fill: 'var(--ink-subtle)', fontSize: 10, position: 'right' }} />
                                                <Line type="monotone" dataKey="perdida" name="Pérdida (%)" stroke="var(--brand)" strokeWidth={2.5} dot={{ r: 3 }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>

                                    <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                                        {[
                                            ['< 10%', 'Trabajo de potencia, muy lejos del fallo. 4 o más repeticiones en recámara.'],
                                            ['10–20%', 'Fuerza sin acumular fatiga. 3-4 en recámara.'],
                                            ['20–30%', 'Zona habitual de hipertrofia y fuerza. 2-3 en recámara.'],
                                            ['> 30%', 'Fatiga alta. Coste de recuperación desproporcionado en fuerza máxima.'],
                                        ].map(([range, hint]) => (
                                            <li key={range} className="flex gap-2 rounded-field bg-surface-sunken px-3 py-2 text-t-2xs">
                                                <span className="w-14 shrink-0 font-bold tabular-nums text-ink">{range}</span>
                                                <span className="text-ink-subtle">{hint}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </Card>
                    )}

                    {view === 'mediciones' && (
                        <Card
                            title="Todas las mediciones"
                            subtitle="El origen importa al leerlas: un encoder mide, un vídeo estima y lo manual es lo que alguien copió de otra pantalla."
                        >
                            <div className="-mx-1 overflow-x-auto">
                                <table className="w-full min-w-[42rem] border-collapse text-t-xs">
                                    <thead>
                                        <tr className="text-ink-subtle">
                                            <th className="px-2 py-2 text-left font-medium">Fecha</th>
                                            <th className="px-2 py-2 text-left font-medium">Ejercicio</th>
                                            <th className="px-2 py-2 text-right font-medium">Serie</th>
                                            <th className="px-2 py-2 text-right font-medium">Carga</th>
                                            <th className="px-2 py-2 text-right font-medium">Reps</th>
                                            <th className="px-2 py-2 text-right font-medium">Vm</th>
                                            <th className="px-2 py-2 text-right font-medium">Pérdida</th>
                                            <th className="px-2 py-2 text-right font-medium">RIR est.</th>
                                            <th className="px-2 py-2 text-left font-medium">Origen</th>
                                            <th className="w-16" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {measurements.map(m => {
                                            const rir = rirFromVelocityLoss(
                                                m.velocity_loss != null ? Number(m.velocity_loss) : null
                                            );
                                            return (
                                                <tr key={m.id} className="border-t border-[var(--border-subtle)]">
                                                    <td className="px-2 py-2 tabular-nums text-ink-muted">
                                                        {format(new Date(m.performed_at), 'd MMM yy', { locale: es })}
                                                    </td>
                                                    <td className="px-2 py-2 text-ink">{m.exercise_name}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{m.set_number ?? '—'}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-ink">{m.load_kg != null ? `${m.load_kg}` : '—'}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{m.reps ?? '—'}</td>
                                                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-ink">
                                                        {m.mean_velocity != null ? Number(m.mean_velocity).toFixed(2) : '—'}
                                                    </td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-ink-muted">
                                                        {m.velocity_loss != null ? `${Number(m.velocity_loss).toFixed(0)}%` : '—'}
                                                    </td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{rir ?? '—'}</td>
                                                    <td className="px-2 py-2">
                                                        <span className="rounded-chip bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-subtle">
                                                            {m.source}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <span className="flex justify-end gap-1">
                                                            {m.file_url && (
                                                                <button
                                                                    onClick={() => setChartUrl({ url: m.file_url!, name: m.exercise_name })}
                                                                    title="Ver la gráfica del archivo"
                                                                    className="p-1 text-ink-faint transition-colors hover:text-brand"
                                                                >
                                                                    <Activity size={12} />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => remove(m.id)}
                                                                title="Borrar medición"
                                                                className="p-1 text-ink-faint transition-colors hover:text-danger"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {/* Referencia de zonas. Va al pie y siempre visible: es lo
                        que hace que un "0,52 m/s" signifique algo. */}
                    <div className="flex flex-wrap gap-1.5">
                        {VELOCITY_ZONES.map(z => (
                            <span
                                key={z.label}
                                className="rounded-chip bg-surface-sunken px-2 py-1 text-t-2xs"
                                style={{ color: z.color }}
                            >
                                {z.label}
                                <span className="ml-1 text-ink-faint">
                                    {z.max === Infinity ? '> 1.00' : `< ${z.max.toFixed(2)}`} m/s · {z.hint}
                                </span>
                            </span>
                        ))}
                    </div>
                </>
            )}

            {/* Archivos colgados de series del plan. Se conservan porque son
                ficheros reales; no tienen métricas resumidas hasta que alguien
                los abra desde la serie. */}
            {legacy.length > 0 && (
                <Card
                    title="Archivos adjuntos a series del plan"
                    subtitle="Subidos desde la pantalla de entrenamiento. Ábrelos para ver la gráfica completa del encoder."
                >
                    <ul className="divide-y divide-[var(--border-subtle)]">
                        {legacy.map(ex => (
                            <li key={ex.id} className="flex flex-wrap items-center gap-3 py-2 text-t-xs">
                                <span className="min-w-0 flex-1 font-semibold text-ink">
                                    {ex.exercise?.name ?? 'Ejercicio'}
                                    <span className="ml-2 font-normal text-ink-subtle">
                                        {ex.block.name} · S{ex.session.week_number} D{ex.session.day_number}
                                    </span>
                                </span>
                                <span className="flex shrink-0 gap-1">
                                    <a
                                        href={ex.vbt_file_url ?? '#'}
                                        download
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Descargar"
                                        className="rounded-field p-1.5 text-ink-faint transition-colors hover:bg-surface-overlay hover:text-ink"
                                    >
                                        <Download size={13} />
                                    </a>
                                    <button
                                        onClick={() => setChartUrl({ url: ex.vbt_file_url!, name: ex.exercise?.name ?? 'Ejercicio' })}
                                        className="rounded-field px-2.5 py-1.5 text-t-2xs font-semibold text-brand transition-colors hover:bg-[var(--brand-quiet)]"
                                    >
                                        Ver gráfica
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* Se monta al abrirse, no siempre: así arranca con el ejercicio
                elegido y con las filas en blanco cada vez, sin necesidad de un
                efecto que reinicie el formulario. */}
            {addOpen && (
                <AddMeasurementModal
                    open
                    onClose={() => setAddOpen(false)}
                    athleteId={athleteId}
                    createdBy={currentUser?.id ?? null}
                    defaultExercise={selectedExercise ?? undefined}
                    onSaved={() => void load()}
                />
            )}

            {chartUrl && (
                <VbtChartModal
                    isOpen
                    vbtFileUrl={chartUrl.url}
                    exerciseName={chartUrl.name}
                    onClose={() => setChartUrl(null)}
                />
            )}
        </div>
    );
}

// =====================================================================
// PIEZAS
// =====================================================================

function Metric({
    label, value, hint, tone = 'neutral',
}: {
    label: string; value: string; hint?: string; tone?: 'good' | 'neutral' | 'warn';
}) {
    return (
        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
            <p className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">{label}</p>
            <p className={cn(
                'mt-1.5 text-2xl font-black leading-none tabular-nums',
                tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-ink'
            )}>
                {value}
            </p>
            {hint && <p className="mt-1.5 text-t-2xs leading-relaxed text-ink-subtle">{hint}</p>}
        </div>
    );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4 md:p-5">
            <h3 className="text-t-sm font-bold text-ink">{title}</h3>
            {subtitle && <p className="mt-1 text-t-2xs leading-relaxed text-ink-subtle">{subtitle}</p>}
            <div className="mt-4">{children}</div>
        </section>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return (
        <p className="mx-auto max-w-md py-10 text-center text-t-sm leading-relaxed text-ink-subtle">
            {children}
        </p>
    );
}
