/**
 * ANVIL STRENGTH — ANALÍTICA DE BLOQUE
 *
 * El motor de volumen (lib/volume/engine.ts) responde "cuánto trabajo hay y
 * para qué músculo". Este responde la otra mitad de la pregunta que se hace
 * un coach al programar: "¿a qué intensidad, cómo progresa, y hay algo mal
 * escrito?".
 *
 * Los dos motores comparten el parser de prescripción para que las cifras no
 * puedan discrepar entre paneles.
 *
 * PRINCIPIO: ningún número inventado. Si falta el dato de partida, la métrica
 * no sale (null) y se dice por qué. Un coach que decide sobre un %1RM
 * fabricado toma peores decisiones que uno que ve un hueco.
 */

import { parsePrescription, type VolumeSessionInput } from '../volume/engine';
import { classifyExercise, type MovementPattern } from '../volume/muscles';
import type { TrainingSet } from '../../types/training';
import { estimate1RM } from '../training/oneRm';

// =====================================================================
// 1. PARSEO DE CAMPOS DE TEXTO LIBRE
// =====================================================================

/**
 * `target_rpe` es texto libre: "@8", "8", "RPE 8.5", "7-8".
 * En rangos se toma el extremo ALTO — al contrario que en las repeticiones.
 *
 * Por qué al revés: en repeticiones el rango bajo es el compromiso mínimo, y
 * estimar por lo bajo evita creer que se hizo más de lo que se hizo. En RPE el
 * riesgo está arriba: si el coach escribe "7-8" y el atleta llega a 8, la
 * fatiga real del bloque es la de 8. Estimar por lo bajo escondería carga.
 */
export function parseRpe(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const matches = raw.match(/\d+(?:[.,]\d+)?/g);
    if (!matches) return null;

    const values = matches
        .map((m) => parseFloat(m.replace(',', '.')))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 10);

    if (values.length === 0) return null;
    return Math.max(...values);
}

/**
 * ¿La prescripción es AMRAP / al fallo? Entonces las repeticiones son
 * desconocidas y todo lo que dependa de ellas (tonelaje, INOL) queda fuera
 * del cálculo en vez de contarse como 0.
 */
export function isOpenEnded(targetReps: string | null | undefined): boolean {
    if (!targetReps) return false;
    return /amrap|max|fallo|failure|rir\s*0/i.test(targetReps);
}

// =====================================================================
// 2. ESTIMACIÓN DE 1RM
// =====================================================================

/**
 * La fórmula vive en `src/lib/training/oneRm.ts` y esto solo la reexpone,
 * para no romper a quien ya importa `estimate1RM` desde este módulo.
 *
 * Se sacó de aquí porque había TRES copias distintas —esta, la de
 * `stats/athleteStats.ts` y una en línea dentro de la calculadora del
 * atleta— y no coincidían: la de estadísticas inflaba un 3,3% cualquier
 * levantamiento a una repetición. La cabecera de `oneRm.ts` lo cuenta
 * entero.
 */
export { estimate1RM, loadForReps, MAX_REPS_FOR_1RM } from '../training/oneRm';

// =====================================================================
// 3. REFERENCIAS DE 1RM
// =====================================================================

/**
 * De dónde sale el 1RM con el que se calcula el %.
 *
 *   'declared' — el coach o el atleta lo tiene registrado. Es el bueno.
 *   'block'    — el mayor e1RM que aparece prescrito en el propio bloque.
 *                Sirve para leer la intensidad RELATIVA dentro del bloque,
 *                pero no es el 1RM real del atleta y se etiqueta como tal.
 *
 * La distinción se propaga hasta la interfaz a propósito: un %1RM calculado
 * sobre una referencia del propio bloque no se puede comparar con el de otro
 * bloque, y el coach tiene que saberlo antes de sacar conclusiones.
 */
export type MaxSource = 'declared' | 'block';

export interface ExerciseMax {
    exercise: string;
    oneRm: number;
    source: MaxSource;
}

/** Marcas diacríticas combinantes, para que "búlgara" y "bulgara" sean el mismo ejercicio. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Clave de agrupación: el nombre normalizado, sin la variante.
 *
 * La variante se deja fuera a propósito. "Sentadilla" y "Sentadilla (pausada)"
 * comparten 1RM de referencia: si cada variante tuviera el suyo, el %1RM de una
 * pausada saldría sobre su propia carga y siempre daría ~100%.
 */
export function exerciseKey(name: string | null | undefined): string {
    return (name ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(COMBINING_MARKS, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Deriva un 1RM de referencia por ejercicio a partir de lo prescrito en el
 * bloque, salvo que venga uno declarado, que siempre manda.
 */
export function buildReferenceMaxes(
    sessions: VolumeSessionInput[],
    declared: Record<string, number> = {}
): Map<string, ExerciseMax> {
    const out = new Map<string, ExerciseMax>();

    for (const [name, value] of Object.entries(declared)) {
        if (Number.isFinite(value) && value > 0) {
            out.set(exerciseKey(name), {
                exercise: name,
                oneRm: value,
                source: 'declared',
            });
        }
    }

    for (const session of sessions) {
        for (const ex of session.exercises) {
            const name = ex.exercise?.name ?? '';
            const key = exerciseKey(name);
            if (!key) continue;
            if (out.get(key)?.source === 'declared') continue;

            for (const set of ex.sets ?? []) {
                if (isOpenEnded(set.target_reps)) continue;
                // Solo las series pautadas EN KILOS pueden dar un 1RM. Una
                // serie a 0,45 m/s produciría una referencia de 0,5 kg y
                // arrastraría todos los porcentajes del bloque.
                if ((set.target_metric ?? 'kg') !== 'kg') continue;
                const { reps } = parsePrescription(set.target_reps);
                const load = set.target_load ?? 0;
                const e1rm = estimate1RM(load, reps);
                if (e1rm == null) continue;

                const current = out.get(key);
                if (!current || e1rm > current.oneRm) {
                    out.set(key, { exercise: name, oneRm: e1rm, source: 'block' });
                }
            }
        }
    }

    return out;
}

// =====================================================================
// 4. MÉTRICAS POR SERIE
// =====================================================================

export interface SetMetrics {
    /** Nº de series que representa la fila ("3x5" son 3). */
    series: number;
    /** Repeticiones por serie. 0 si es AMRAP o no se pudo leer. */
    reps: number;
    load: number | null;
    rpe: number | null;
    /** Carga relativa al 1RM de referencia, 0-100. null si no hay referencia. */
    intensity: number | null;
    /** Kg movidos por toda la fila. null si falta carga o repeticiones. */
    tonnage: number | null;
    /**
     * INOL = repeticiones / (100 - %1RM). Métrica de Hristov: cuantifica la
     * dificultad acumulada ponderando por lo cerca del máximo que se trabaja.
     * Diez repeticiones al 90% castigan mucho más que diez al 60%, y el
     * tonelaje solo no lo refleja.
     */
    inol: number | null;
    openEnded: boolean;
}

/**
 * Kilos de la serie, o null si la prescripción no está en kilos.
 *
 * `target_load` guarda el número de la prescripción sea cual sea su unidad
 * (ver database/set_target_metric.sql). Sin esta comprobación, un objetivo de
 * 0,45 m/s entraría en el tonelaje como 0,45 kg y un 20% de pérdida de
 * velocidad como 20 kg, y además falsearía el %1RM y el INOL.
 *
 * Las filas sin `target_metric` son anteriores a la migración: kilos.
 */
function kgOf(set: TrainingSet): number | null {
    const metric = set.target_metric ?? 'kg';
    if (metric !== 'kg') return null;
    return set.target_load ?? null;
}

export function computeSetMetrics(
    set: TrainingSet,
    referenceMax: number | null
): SetMetrics {
    const openEnded = isOpenEnded(set.target_reps);
    const { series, reps } = parsePrescription(set.target_reps);
    const load = kgOf(set);
    // El RPE puede venir de su columna de texto o, si es la métrica elegida
    // de la serie, ser justo lo que hay prescrito.
    const rpe = parseRpe(set.target_rpe);

    const intensity =
        load != null && referenceMax != null && referenceMax > 0
            ? round1((load / referenceMax) * 100)
            : null;

    const usableReps = openEnded ? 0 : reps;
    const tonnage =
        load != null && usableReps > 0 ? Math.round(series * usableReps * load) : null;

    // El denominador se corta a 1: al 99% o más, INOL explota hacia infinito y
    // deja de ordenar nada. Un tope hace la cifra comparable entre semanas.
    const inol =
        intensity != null && usableReps > 0
            ? round2((series * usableReps) / Math.max(100 - intensity, 1))
            : null;

    return { series, reps, load, rpe, intensity, tonnage, inol, openEnded };
}

// =====================================================================
// 5. ZONAS DE INTENSIDAD
// =====================================================================

/**
 * Las cuatro zonas con las que se habla de programación de fuerza. No son un
 * invento nuestro: es el reparto con el que se describen los bloques en la
 * literatura de powerlifting (acumulación / transmutación / realización).
 */
export const INTENSITY_ZONES = [
    { key: 'z1', label: '<70%', min: 0, max: 70, hint: 'Técnica y volumen' },
    { key: 'z2', label: '70-80%', min: 70, max: 80, hint: 'Hipertrofia y base' },
    { key: 'z3', label: '80-90%', min: 80, max: 90, hint: 'Fuerza' },
    { key: 'z4', label: '≥90%', min: 90, max: Infinity, hint: 'Pico y máximos' },
] as const;

export type IntensityZoneKey = (typeof INTENSITY_ZONES)[number]['key'];

export function zoneOf(intensity: number): IntensityZoneKey {
    for (const z of INTENSITY_ZONES) {
        if (intensity >= z.min && intensity < z.max) return z.key;
    }
    return 'z4';
}

const emptyZones = (): Record<IntensityZoneKey, number> => ({
    z1: 0,
    z2: 0,
    z3: 0,
    z4: 0,
});

// =====================================================================
// 6. AGREGADO POR SEMANA
// =====================================================================

export interface WeekAnalytics {
    week: number;
    /** Índice 1..n dentro del bloque (lo que el coach llama "Semana 3"). */
    ordinal: number;
    sessionCount: number;
    /** Sesiones con al menos un ejercicio. Las vacías no son entrenamiento. */
    plannedSessionCount: number;
    totalSets: number;
    totalReps: number;
    tonnage: number;
    /** Kg por repetición. Intensidad media honesta: no necesita 1RM. */
    avgLoad: number | null;
    /** Media de %1RM ponderada por series. null si no hay referencias. */
    avgIntensity: number | null;
    avgRpe: number | null;
    inol: number | null;
    setsByPattern: Record<MovementPattern, number>;
    setsByZone: Record<IntensityZoneKey, number>;
    /** Carga top prescrita de la semana, por ejercicio principal. */
    topLoads: { exercise: string; load: number; intensity: number | null }[];
    /** Series cuya prescripción no permitió calcular tonelaje. */
    setsWithoutLoad: number;
}

const emptyPatterns = (): Record<MovementPattern, number> => ({
    squat: 0,
    bench: 0,
    deadlift: 0,
    press: 0,
    pull: 0,
    hinge: 0,
    accessory: 0,
    core: 0,
});

// =====================================================================
// 7. INFORME COMPLETO
// =====================================================================

export type IssueLevel = 'error' | 'warning' | 'info';

export interface BlockIssue {
    level: IssueLevel;
    /** Categoría estable, para agrupar y para no repetir el mismo aviso. */
    code: string;
    message: string;
    /** Dónde mirar. Permite que la interfaz lleve al coach al sitio. */
    week?: number;
    sessionId?: string;
}

export interface BlockAnalytics {
    weeks: WeekAnalytics[];
    totals: {
        sets: number;
        reps: number;
        tonnage: number;
        sessions: number;
        exercises: number;
    };
    /** Frecuencia media semanal de cada patrón (veces que se toca por semana). */
    frequencyPerWeek: Record<MovementPattern, number>;
    setsByZone: Record<IntensityZoneKey, number>;
    referenceMaxes: ExerciseMax[];
    /** true si algún %1RM se calculó sobre una referencia derivada del bloque. */
    usesBlockDerivedMaxes: boolean;
    issues: BlockIssue[];
    /** Semanas detectadas como descarga. Ver `detectDeloads`. */
    deloadWeeks: number[];
}

export function analyzeBlock(
    sessions: VolumeSessionInput[],
    options: { declaredMaxes?: Record<string, number> } = {}
): BlockAnalytics {
    const maxes = buildReferenceMaxes(sessions, options.declaredMaxes);

    // Agrupar por semana conservando el orden natural.
    const byWeek = new Map<number, VolumeSessionInput[]>();
    for (const s of sessions) {
        const list = byWeek.get(s.week_number);
        if (list) list.push(s);
        else byWeek.set(s.week_number, [s]);
    }
    const orderedWeeks = [...byWeek.keys()].sort((a, b) => a - b);

    const issues: BlockIssue[] = [];
    const totalZones = emptyZones();
    // Semanas distintas en las que aparece cada patrón — es lo que hace
    // "frecuencia": entrenar banca 3 días de una semana y ninguno de otra no
    // son 1,5 días/semana de estímulo, así que se cuenta por sesión.
    const patternSessionCount = emptyPatterns();

    let totalSets = 0;
    let totalReps = 0;
    let totalTonnage = 0;
    let totalExercises = 0;

    const weeks: WeekAnalytics[] = orderedWeeks.map((week, i) => {
        const weekSessions = byWeek.get(week) ?? [];

        const setsByPattern = emptyPatterns();
        const setsByZone = emptyZones();
        const topByExercise = new Map<
            string,
            { exercise: string; load: number; intensity: number | null }
        >();

        let wSets = 0;
        let wReps = 0;
        let wTonnage = 0;
        let wLoadedReps = 0; // repeticiones que sí tenían carga, para la media
        let wIntensityWeight = 0;
        let wIntensityAcc = 0;
        let wRpeWeight = 0;
        let wRpeAcc = 0;
        let wInol = 0;
        let wInolSeen = false;
        let wSetsWithoutLoad = 0;
        let plannedSessionCount = 0;

        for (const session of weekSessions) {
            if (session.exercises.length === 0) {
                issues.push({
                    level: 'warning',
                    code: 'empty-session',
                    message: `Día ${session.day_number} de la semana ${i + 1} no tiene ejercicios.`,
                    week,
                    sessionId: session.id,
                });
                continue;
            }
            plannedSessionCount += 1;

            const patternsInSession = new Set<MovementPattern>();

            for (const ex of session.exercises) {
                totalExercises += 1;
                const name = ex.exercise?.name ?? '';
                const pattern = classifyExercise(name).pattern;
                patternsInSession.add(pattern);

                const reference = maxes.get(exerciseKey(name))?.oneRm ?? null;
                const sets = ex.sets ?? [];

                if (sets.length === 0) {
                    issues.push({
                        level: 'warning',
                        code: 'exercise-without-sets',
                        message: `"${displayName(name, ex.variant_name)}" (semana ${i + 1}) no tiene ninguna serie prescrita.`,
                        week,
                        sessionId: session.id,
                    });
                    continue;
                }

                for (const set of sets) {
                    const m = computeSetMetrics(set, reference);

                    wSets += m.series;
                    setsByPattern[pattern] += m.series;

                    if (!m.openEnded) wReps += m.series * m.reps;

                    if (m.tonnage != null) {
                        wTonnage += m.tonnage;
                        wLoadedReps += m.series * m.reps;
                    } else {
                        wSetsWithoutLoad += m.series;
                    }

                    if (m.intensity != null) {
                        setsByZone[zoneOf(m.intensity)] += m.series;
                        totalZones[zoneOf(m.intensity)] += m.series;
                        wIntensityAcc += m.intensity * m.series;
                        wIntensityWeight += m.series;
                    }

                    if (m.rpe != null) {
                        wRpeAcc += m.rpe * m.series;
                        wRpeWeight += m.series;
                    }

                    if (m.inol != null) {
                        wInol += m.inol;
                        wInolSeen = true;
                    }

                    // Una serie sin nada pautado deja al atleta sin saber qué
                    // hacer. Es el fallo de prescripción más caro y el más
                    // fácil de cometer al copiar semanas.
                    //
                    // Se mira `target_load` en crudo, no `m.load`: una serie
                    // pautada en RIR o en velocidad tiene su valor ahí aunque
                    // no sean kilos, y darla por vacía sería un falso aviso.
                    const hasSomething =
                        set.target_load != null || m.rpe != null || Boolean(set.target_reps);
                    if (!hasSomething) {
                        issues.push({
                            level: 'error',
                            code: 'set-without-prescription',
                            message: `Una serie de "${displayName(name, ex.variant_name)}" (semana ${i + 1}) no tiene repeticiones, ni carga, ni RPE.`,
                            week,
                            sessionId: session.id,
                        });
                    }

                    if (m.load != null && m.load > 0) {
                        const key = exerciseKey(name);
                        const current = topByExercise.get(key);
                        if (!current || m.load > current.load) {
                            topByExercise.set(key, {
                                exercise: displayName(name, ex.variant_name),
                                load: m.load,
                                intensity: m.intensity,
                            });
                        }
                    }
                }
            }

            for (const p of patternsInSession) patternSessionCount[p] += 1;
        }

        totalSets += wSets;
        totalReps += wReps;
        totalTonnage += wTonnage;

        if (plannedSessionCount === 0 && weekSessions.length === 0) {
            issues.push({
                level: 'warning',
                code: 'empty-week',
                message: `La semana ${i + 1} no tiene ningún día planificado.`,
                week,
            });
        }

        return {
            week,
            ordinal: i + 1,
            sessionCount: weekSessions.length,
            plannedSessionCount,
            totalSets: round1(wSets),
            totalReps: wReps,
            tonnage: Math.round(wTonnage),
            avgLoad: wLoadedReps > 0 ? round1(wTonnage / wLoadedReps) : null,
            avgIntensity: wIntensityWeight > 0 ? round1(wIntensityAcc / wIntensityWeight) : null,
            avgRpe: wRpeWeight > 0 ? round1(wRpeAcc / wRpeWeight) : null,
            inol: wInolSeen ? round2(wInol) : null,
            setsByPattern,
            setsByZone,
            topLoads: [...topByExercise.values()].sort((a, b) => b.load - a.load).slice(0, 4),
            setsWithoutLoad: round1(wSetsWithoutLoad),
        };
    });

    const weekCount = weeks.length || 1;
    const frequencyPerWeek = emptyPatterns();
    for (const p of Object.keys(patternSessionCount) as MovementPattern[]) {
        frequencyPerWeek[p] = round1(patternSessionCount[p] / weekCount);
    }

    const deloadWeeks = detectDeloads(weeks);
    issues.push(...progressionIssues(weeks, deloadWeeks));

    const referenceMaxes = [...maxes.values()].sort((a, b) => b.oneRm - a.oneRm);

    return {
        weeks,
        totals: {
            sets: round1(totalSets),
            reps: totalReps,
            tonnage: Math.round(totalTonnage),
            sessions: sessions.length,
            exercises: totalExercises,
        },
        frequencyPerWeek,
        setsByZone: totalZones,
        referenceMaxes,
        usesBlockDerivedMaxes: referenceMaxes.some((m) => m.source === 'block'),
        issues: dedupeIssues(issues),
        deloadWeeks,
    };
}

// =====================================================================
// 8. DESCARGAS Y PROGRESIÓN
// =====================================================================

/**
 * Una semana es descarga cuando su carga cae claramente respecto al PICO de
 * las semanas anteriores, no respecto a la inmediatamente anterior.
 *
 * Por qué contra el pico: una fase de intensificación baja el volumen un poco
 * antes de la descarga (menos repeticiones, más kilos). Comparando solo con la
 * semana previa, la descarga real se mide contra una semana ya reducida y el
 * salto se queda corto — que es exactamente lo que pasaba con un bloque
 * 4x5 → 4x3 → 2x5, donde la descarga caía un 36% desde el pico pero solo un
 * 25% desde la semana anterior.
 *
 * Umbral 25%: por debajo, la variación entra en el ruido normal de un bloque
 * ondulante y marcarla daría falsos positivos en cada semana ligera.
 */
const DELOAD_DROP = 0.25;

export function detectDeloads(weeks: WeekAnalytics[]): number[] {
    const out: number[] = [];

    // El tonelaje manda cuando existe; si el bloque va en RPE sin kg, las
    // series son el único indicador disponible. La elección se hace una vez
    // para todo el bloque: mezclar unidades entre semanas no compara nada.
    const useTonnage = weeks.some((w) => w.tonnage > 0);
    const load = (w: WeekAnalytics) => (useTonnage ? w.tonnage : w.totalSets);

    // La bajada de carga por sí sola NO distingue una descarga de una semana
    // de intensificación: las dos bajan el tonelaje. Lo que las separa es la
    // intensidad — en la intensificación sube (menos repeticiones, más kilos)
    // y en la descarga baja. Sin este segundo eje, un 4x5 → 4x3 con más peso
    // se marcaba como descarga, que es justo lo contrario de lo que es.
    const intensityOf = (w: WeekAnalytics) => w.avgIntensity ?? w.avgLoad;

    let peakLoad = 0;
    let peakWeek: WeekAnalytics | null = null;

    for (const week of weeks) {
        if (week.plannedSessionCount === 0) continue;

        const current = load(week);
        const dropped = peakLoad > 0 && (peakLoad - current) / peakLoad >= DELOAD_DROP;

        if (dropped) {
            const before = peakWeek ? intensityOf(peakWeek) : null;
            const now = intensityOf(week);
            const intensified = before != null && now != null && now > before;

            // En cualquiera de los dos casos el pico se mantiene: la semana
            // siguiente se sigue midiendo contra el trabajo real que la
            // precedió, no contra la semana ligera.
            if (!intensified) out.push(week.week);
        } else if (current > peakLoad) {
            peakLoad = current;
            peakWeek = week;
        }
    }

    return out;
}

/**
 * Avisos que solo se ven mirando el bloque entero, no una semana suelta.
 */
function progressionIssues(weeks: WeekAnalytics[], deloads: number[]): BlockIssue[] {
    const issues: BlockIssue[] = [];
    const active = weeks.filter((w) => w.plannedSessionCount > 0);
    if (active.length < 2) return issues;

    // Misma unidad para todo el bloque que en detectDeloads: comparar el
    // tonelaje de una semana con las series de otra no mide nada.
    const useTonnage = weeks.some((w) => w.tonnage > 0);
    const load = (w: WeekAnalytics) => (useTonnage ? w.tonnage : w.totalSets);

    for (let i = 1; i < active.length; i++) {
        const prev = active[i - 1];
        const cur = active[i];
        if (deloads.includes(cur.week)) continue;

        const prevLoad = load(prev);
        const curLoad = load(cur);
        if (prevLoad <= 0) continue;

        const change = (curLoad - prevLoad) / prevLoad;

        // Un salto por encima del 30% en una semana es el escenario clásico de
        // lesión por progresión demasiado rápida. No siempre es un error —una
        // semana de choque puede ser deliberada— así que es aviso, no error.
        if (change > 0.3) {
            issues.push({
                level: 'warning',
                code: 'volume-spike',
                message: `La semana ${cur.ordinal} sube un ${Math.round(change * 100)}% de carga respecto a la anterior. Comprueba que el salto es intencionado.`,
                week: cur.week,
            });
        }
    }

    // Un bloque en el que nada cambia entre semanas no es una progresión: o
    // falta escribirla, o se copió una semana y se olvidó ajustarla.
    const loads = active.map(load);
    const allEqual = loads.every((v) => Math.abs(v - loads[0]) < 0.001);
    if (allEqual && active.length >= 3) {
        issues.push({
            level: 'info',
            code: 'no-progression',
            message: `Las ${active.length} semanas tienen exactamente la misma carga. Si copiaste una semana, recuerda ajustar la progresión.`,
        });
    }

    // Un bloque de 4 semanas o más sin ninguna bajada de carga no da margen de
    // recuperación. Es información, no una regla: hay bloques cortos de choque.
    if (deloads.length === 0 && active.length >= 4) {
        issues.push({
            level: 'info',
            code: 'no-deload',
            message: `${active.length} semanas seguidas sin ninguna bajada de carga. Valora si el bloque necesita una descarga.`,
        });
    }

    return issues;
}

/**
 * Un mismo fallo repetido en veinte series llenaría el panel y taparía los
 * demás. Se conserva el primero de cada (código, semana) y se cuenta el resto.
 */
function dedupeIssues(issues: BlockIssue[]): BlockIssue[] {
    const seen = new Map<string, { issue: BlockIssue; count: number }>();

    for (const issue of issues) {
        const key = `${issue.code}|${issue.week ?? '-'}`;
        const entry = seen.get(key);
        if (entry) entry.count += 1;
        else seen.set(key, { issue, count: 1 });
    }

    const order: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };

    return [...seen.values()]
        .map(({ issue, count }) =>
            count > 1
                ? { ...issue, message: `${issue.message} (+${count - 1} más igual)` }
                : issue
        )
        .sort((a, b) => order[a.level] - order[b.level]);
}

// =====================================================================
// Utilidades
// =====================================================================

function displayName(name: string, variant?: string | null): string {
    const base = name || 'Sin nombre';
    return variant ? `${base} (${variant})` : base;
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
