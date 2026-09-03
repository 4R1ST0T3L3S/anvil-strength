/**
 * ANVIL STRENGTH — LOS ACCESORIOS, POR LO QUE APOYAN
 * =====================================================================
 *
 * QUÉ CONTESTA
 *
 * "¿Cuánto trabajo de apoyo a la banca lleva esta semana, y a qué RPE?".
 * Hasta ahora todo lo que no era uno de los tres básicos caía en un único
 * cajón llamado "ACC": treinta series a la semana de las que no se puede
 * decir nada, ni comparar con las de la semana anterior, ni repartir.
 *
 *
 * VOLUMEN AQUÍ SIGNIFICA SERIES × REPETICIONES. NO TONELAJE.
 *
 * Y es deliberado, así que que no lo "arregle" nadie después. El tonelaje de
 * un accesorio no dice casi nada: 4×12 de face pull con 15 kg son 720 kg y
 * 4×12 de remo con 100 son 4.800, y el estímulo de tejido conectivo y el
 * gasto de recuperación son comparables. Lo que sí ordena el trabajo de
 * apoyo es cuántas repeticiones de calidad se acumulan.
 *
 * El tonelaje se sigue calculando y se devuelve aparte (`tonnage`), para
 * quien lo quiera; simplemente no es lo que aquí se llama volumen.
 *
 *
 * DE DÓNDE SALE LA CLASIFICACIÓN
 *
 * De `session_exercises.accessory_class`, que la escribe el coach en la
 * ficha del ejercicio. NO se adivina por el nombre: la misma prensa es apoyo
 * de sentadilla en un bloque de pierna y trabajo compensatorio en uno de
 * press, y ningún regex puede saber cuál de las dos cosas quiso el coach.
 *
 * Lo que no está clasificado se cuenta aparte, en `unclassified`, y la
 * interfaz lo dice. Repartirlo a ojo daría cifras falsas sobre las que se
 * decidiría la semana siguiente.
 */

import type { VolumeSessionInput } from '../volume/engine';
import { computeSetMetrics } from './blockAnalytics';
import { classifyMainLift } from './mainLift';
import { ACCESSORY_CLASSES, type AccessoryClass } from '../../types/training';

// =====================================================================

/** Lo que se sabe de una categoría de accesorio en un ámbito temporal. */
export interface AccessoryBucket {
    key: AccessoryClass;
    label: string;
    short: string;
    /** Series programadas. Un "4x10" son cuatro. */
    sets: number;
    /**
     * VOLUMEN = series × repeticiones. Ver la cabecera: no es tonelaje.
     * Las series AMRAP no suman aquí, porque sus repeticiones no se saben.
     */
    volume: number;
    /** Kg movidos, para quien lo quiera. Solo de lo pautado en kilos. */
    tonnage: number;
    /**
     * RPE al que está pautado el trabajo de esta categoría, medio y ponderado
     * por series. null cuando ninguna serie lleva RPE prescrito.
     */
    rpe: number | null;
    /** Ejercicios distintos que la componen, para el detalle. */
    exercises: string[];
}

export interface AccessoryReport {
    buckets: AccessoryBucket[];
    /**
     * Series de accesorio SIN clasificar. Se dicen, no se reparten.
     * `exercises` permite que la interfaz ofrezca clasificarlas.
     */
    unclassified: { sets: number; volume: number; exercises: string[] };
    /** Series totales de accesorio del ámbito, clasificadas o no. */
    totalSets: number;
}

// =====================================================================

const emptyBucket = (key: AccessoryClass): AccessoryBucket => {
    const meta = ACCESSORY_CLASSES.find(a => a.key === key)!;
    return {
        key,
        label: meta.label,
        short: meta.short,
        sets: 0,
        volume: 0,
        tonnage: 0,
        rpe: null,
        exercises: [],
    };
};

/**
 * ¿Este ejercicio cuenta como accesorio?
 *
 * Todo lo que NO es uno de los tres de competición. Se apoya en el mismo
 * clasificador que las series de básicos (`mainLift.ts`) para que las dos
 * cuentas sean complementarias de verdad: ninguna serie puede quedarse fuera
 * de las dos ni contarse en las dos.
 *
 * Con una excepción: un ejercicio marcado explícitamente por el coach manda
 * sobre el nombre. Si alguien clasifica su "Sentadilla Pin" como `acc_sq`,
 * es porque para él es trabajo de apoyo, y el criterio del coach gana al
 * regex.
 */
function isAccessory(name: string, declared: AccessoryClass | null | undefined): boolean {
    if (declared) return true;
    return classifyMainLift(name) === 'ACC';
}

/**
 * Reparto del trabajo de accesorio en un conjunto de sesiones.
 *
 * `weeks` acota el ámbito: una semana, varias o todas. Se pasa una LISTA y no
 * un número porque el mismo cálculo sirve para el panel semanal, para el
 * bloque entero y para el macro sin escribirlo tres veces.
 */
export function accessoryReport(
    sessions: VolumeSessionInput[],
    weeks?: number[] | null
): AccessoryReport {
    const scoped = weeks && weeks.length > 0
        ? sessions.filter(s => weeks.includes(s.week_number))
        : sessions;

    const buckets = new Map<AccessoryClass, AccessoryBucket>();
    // RPE ponderado por series: un 4x10 a RPE 8 pesa cuatro veces más que una
    // serie suelta a RPE 6. Una media simple diría que se entrena a 7.
    const rpeAcc = new Map<AccessoryClass, { sum: number; weight: number }>();
    const unclassified = { sets: 0, volume: 0, exercises: [] as string[] };
    let totalSets = 0;

    for (const session of scoped) {
        for (const ex of session.exercises) {
            const name = ex.exercise?.name ?? '';
            const declared = (ex as { accessory_class?: AccessoryClass | null }).accessory_class ?? null;

            if (!isAccessory(name, declared)) continue;

            for (const set of ex.sets ?? []) {
                const m = computeSetMetrics(set, null);
                if (m.series <= 0) continue;

                const volume = m.openEnded ? 0 : m.series * m.reps;
                totalSets += m.series;

                if (!declared) {
                    unclassified.sets += m.series;
                    unclassified.volume += volume;
                    if (name && !unclassified.exercises.includes(name)) {
                        unclassified.exercises.push(name);
                    }
                    continue;
                }

                const bucket = buckets.get(declared) ?? emptyBucket(declared);
                bucket.sets += m.series;
                bucket.volume += volume;
                if (m.tonnage != null) bucket.tonnage += m.tonnage;
                if (name && !bucket.exercises.includes(name)) bucket.exercises.push(name);
                buckets.set(declared, bucket);

                if (m.rpe != null) {
                    const acc = rpeAcc.get(declared) ?? { sum: 0, weight: 0 };
                    acc.sum += m.rpe * m.series;
                    acc.weight += m.series;
                    rpeAcc.set(declared, acc);
                }
            }
        }
    }

    for (const [key, acc] of rpeAcc) {
        const bucket = buckets.get(key);
        if (bucket && acc.weight > 0) {
            bucket.rpe = Math.round((acc.sum / acc.weight) * 10) / 10;
        }
    }

    // Orden fijo, el de ACCESSORY_CLASSES, y no por volumen: una lista que se
    // reordena sola entre semanas obliga a volver a buscar dónde está cada
    // categoría cada vez que se mira.
    const ordered = ACCESSORY_CLASSES
        .map(meta => buckets.get(meta.key))
        .filter((b): b is AccessoryBucket => b !== undefined)
        .map(b => ({ ...b, tonnage: Math.round(b.tonnage) }));

    return { buckets: ordered, unclassified, totalSets };
}

// =====================================================================
// COMPARACIÓN ENTRE DOS SEMANAS
// =====================================================================

/** Una categoría, con lo de esta semana al lado de lo de la anterior. */
export interface AccessoryComparison {
    key: AccessoryClass;
    label: string;
    short: string;
    /** Programado esta semana. */
    currentSets: number;
    /** Programado la semana anterior. */
    previousSets: number;
    /** Volumen (series × reps) de la semana anterior. */
    previousVolume: number;
    /** RPE pautado esta semana. */
    rpe: number | null;
    /** Diferencia de series. Positivo = más que la semana pasada. */
    delta: number;
}

/**
 * Lo de esta semana frente a lo de la anterior, categoría a categoría.
 *
 * Devuelve TODAS las categorías que aparecen en cualquiera de las dos, no
 * solo las de esta semana: que una categoría haya desaparecido respecto de la
 * semana pasada es exactamente lo que hay que ver, y filtrarla la escondería.
 *
 * OJO CON LA LECTURA: `previousSets` es lo PROGRAMADO la semana anterior, no
 * lo ejecutado. Para lo ejecutado está `stats/weekExecutionSummary.ts`. Se
 * separan a propósito; ver la cabecera de aquel módulo.
 */
export function compareAccessoryWeeks(
    sessions: VolumeSessionInput[],
    currentWeek: number,
    previousWeek: number
): AccessoryComparison[] {
    const current = accessoryReport(sessions, [currentWeek]);
    const previous = accessoryReport(sessions, [previousWeek]);

    const byKey = new Map<AccessoryClass, AccessoryComparison>();

    for (const b of current.buckets) {
        byKey.set(b.key, {
            key: b.key,
            label: b.label,
            short: b.short,
            currentSets: b.sets,
            previousSets: 0,
            previousVolume: 0,
            rpe: b.rpe,
            delta: b.sets,
        });
    }

    for (const b of previous.buckets) {
        const hit = byKey.get(b.key);
        if (hit) {
            hit.previousSets = b.sets;
            hit.previousVolume = b.volume;
            hit.delta = hit.currentSets - b.sets;
        } else {
            byKey.set(b.key, {
                key: b.key,
                label: b.label,
                short: b.short,
                currentSets: 0,
                previousSets: b.sets,
                previousVolume: b.volume,
                rpe: null,
                delta: -b.sets,
            });
        }
    }

    return ACCESSORY_CLASSES
        .map(meta => byKey.get(meta.key))
        .filter((c): c is AccessoryComparison => c !== undefined);
}
