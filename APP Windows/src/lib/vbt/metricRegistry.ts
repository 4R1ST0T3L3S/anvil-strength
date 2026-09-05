/**
 * ANVIL STRENGTH — EL REGISTRO DE MÉTRICAS
 * =====================================================================
 *
 * QUÉ ES UNA "BOLSA DE MÉTRICAS"
 *
 * Un objeto plano `{ clave: número }`. Nada más. La velocidad media de una
 * serie es `{ mean_velocity: 0.62 }`; si además se midió la potencia,
 * `{ mean_velocity: 0.62, mean_power: 812 }`.
 *
 * Lo que NO lleva la bolsa es qué significa cada clave. Eso vive en el
 * catálogo (`metric_definitions` en la base de datos), y es lo que permite
 * que una pantalla escrita hoy pinte correctamente una métrica que se
 * inventa dentro de seis meses: la pantalla no conoce las métricas, conoce
 * el catálogo.
 *
 * Ver database/metrics_catalog.sql para el porqué del modelo.
 *
 *
 * POR QUÉ HAY UNA COPIA DE LAS DEFINICIONES AQUÍ DENTRO
 *
 * `FALLBACK_DEFINITIONS` no es una segunda fuente de verdad: es el mínimo
 * para que la interfaz no se quede en blanco mientras el catálogo viaja por
 * la red, y para que siga funcionando si la migración todavía no se ha
 * ejecutado. En cuanto llega el catálogo real, manda el catálogo.
 *
 * La regla es la de siempre en este proyecto: una pantalla puede quedarse
 * sin un dato, pero no puede quedarse rota por no tenerlo.
 */

import { supabase } from '../supabase';

// =====================================================================
// TIPOS
// =====================================================================

/** Hacia dónde es "mejor" una métrica. Solo lo usa el color de la interfaz. */
export type MetricDirection = 'up' | 'down' | 'neutral';

export interface MetricDefinition {
    key: string;
    label: string;
    shortLabel: string;
    /** Se escribe detrás del número. `null` para magnitudes sin unidad. */
    unit: string | null;
    precision: number;
    category: string;
    direction: MetricDirection;
    sortOrder: number;
    /** Rango admisible. Fuera de él, el valor se descarta al guardar. */
    minValue: number | null;
    maxValue: number | null;
    description: string | null;
}

/**
 * Una bolsa de métricas.
 *
 * `Record<string, number>` y no una interfaz con campos: el día que exista
 * una métrica nueva, este tipo NO tiene que cambiar. Ese es todo el punto.
 */
export type MetricBag = Record<string, number>;

/** Etiquetas de los grupos, para las cabeceras de la interfaz. */
export const CATEGORY_LABELS: Record<string, string> = {
    velocity: 'Velocidad',
    power: 'Potencia',
    force: 'Fuerza',
    range: 'Recorrido',
    estimation: 'Estimación',
    tempo: 'Tempo',
    quality: 'Medición',
    cardio: 'Cardio',
    other: 'Otras',
};

// =====================================================================
// CATÁLOGO DE RESPALDO
// =====================================================================

/**
 * Las mismas definiciones que siembra database/metrics_catalog.sql.
 *
 * Si las dos listas divergen, gana la de la base de datos: esta solo se usa
 * hasta que aquella llega. Están aquí las diecisiete de la siembra inicial;
 * las que se añadan después solo vivirán en el catálogo, que es exactamente
 * el comportamiento que se busca.
 */
const FALLBACK_DEFINITIONS: MetricDefinition[] = [
    d('mean_velocity', 'Velocidad media', 'Vm', 'm/s', 3, 'velocity', 'up', 10, 0, 5),
    d('peak_velocity', 'Velocidad máxima', 'Vmax', 'm/s', 3, 'velocity', 'up', 20, 0, 6),
    d('min_velocity', 'Velocidad en el punto malo', 'Vmin', 'm/s', 3, 'velocity', 'up', 30, 0, 5),
    d('velocity_loss', 'Pérdida de velocidad', 'VL', '%', 1, 'velocity', 'down', 40, 0, 100),
    d('mean_power', 'Potencia media', 'Pm', 'W', 0, 'power', 'up', 110, 0, 10000),
    d('peak_power', 'Potencia máxima', 'Pmax', 'W', 0, 'power', 'up', 120, 0, 15000),
    d('mean_force', 'Fuerza media', 'Fm', 'N', 0, 'force', 'up', 210, 0, 20000),
    d('peak_force', 'Fuerza máxima', 'Fmax', 'N', 0, 'force', 'up', 220, 0, 30000),
    d('rfd', 'Tasa de desarrollo de fuerza', 'RFD', 'N/s', 0, 'force', 'up', 230, 0, 100000),
    d('rom', 'Recorrido', 'ROM', 'm', 3, 'range', 'neutral', 310, 0, 3),
    d('horizontal_deviation', 'Desviación horizontal', 'Desv.', 'cm', 1, 'range', 'down', 320, 0, 100),
    d('sticking_height', 'Altura del punto malo', 'H. crít', 'm', 3, 'range', 'neutral', 330, 0, 3),
    d('est_1rm', '1RM estimado', '1RM', 'kg', 1, 'estimation', 'up', 410, 0, 1000),
    d('est_1rm_percent', 'Intensidad relativa', '%1RM', '%', 1, 'estimation', 'neutral', 420, 0, 200),
    d('concentric_duration', 'Duración concéntrica', 'T. con', 's', 2, 'tempo', 'neutral', 510, 0, 60),
    d('eccentric_duration', 'Duración excéntrica', 'T. exc', 's', 2, 'tempo', 'neutral', 520, 0, 60),
    d('total_reps', 'Repeticiones detectadas', 'Reps', null, 0, 'quality', 'neutral', 610, 0, 100),

    // CÓMO se midió, no qué se midió.
    //
    // Están aquí porque una velocidad sin saber cómo se obtuvo no se puede
    // auditar: dentro de seis meses, "0,71 m/s" es indistinguible tanto si
    // salió del disco detectado como de un aro puesto a ojo con un 20% de
    // error. Estas cinco claves son lo que permite volver atrás y decidir si
    // una medición entra o no en el perfil carga-velocidad.
    //
    // Las escribe el analizador de vídeo; una medición de encoder o a mano
    // simplemente no las trae, y la bolsa admite eso sin más. Ver
    // src/lib/cv/quality.ts.
    d('measurement_quality', 'Fiabilidad de la medición', 'Fiab.', '/100', 0, 'quality', 'up', 600, 0, 100),
    d('camera_obliquity', 'Ángulo de cámara', 'Áng.', '°', 0, 'quality', 'down', 620, 0, 90),
    d('tracking_loss', 'Fotogramas perdidos', 'Pérd.', '%', 1, 'quality', 'down', 630, 0, 100),
    d('sample_rate', 'Frecuencia de muestreo', 'Muestreo', 'Hz', 0, 'quality', 'up', 640, 0, 1000),
    d('plate_px', 'Disco medido', 'Disco', 'px', 0, 'quality', 'neutral', 650, 0, 10000),

    // CARDIO — 30 de agosto de 2026. La duración y la distancia PAUTADAS
    // van en target_load/target_metric (no en la bolsa, ver
    // database/CARDIO_2026-08-30.sql); esto es frecuencia cardíaca
    // (objetivo Y realizada) y distancia/ritmo REALIZADOS.
    d('hr_target', 'FC objetivo', 'FC obj.', 'bpm', 0, 'cardio', 'neutral', 710, 30, 230),
    d('hr_target_min', 'FC objetivo mínima', 'FC min', 'bpm', 0, 'cardio', 'neutral', 711, 30, 230),
    d('hr_target_max', 'FC objetivo máxima', 'FC máx', 'bpm', 0, 'cardio', 'neutral', 712, 30, 230),
    d('hr_avg', 'FC media realizada', 'FC', 'bpm', 0, 'cardio', 'neutral', 720, 30, 230),
    // NO es actual_load: esa columna es kilos en todo el resto de la app.
    d('duration_actual_seconds', 'Duración realizada', 'Dur.', 's', 0, 'cardio', 'neutral', 725, 0, 36000),
    d('distance_km', 'Distancia', 'Dist.', 'km', 2, 'cardio', 'neutral', 730, 0, 400),
    d('pace_min_km', 'Ritmo', 'Ritmo', 'min/km', 2, 'cardio', 'neutral', 740, 0, 60),
];

/** Atajo para que la lista de arriba se lea como una tabla y no como ruido. */
function d(
    key: string, label: string, shortLabel: string, unit: string | null,
    precision: number, category: string, direction: MetricDirection,
    sortOrder: number, minValue: number | null, maxValue: number | null
): MetricDefinition {
    return { key, label, shortLabel, unit, precision, category, direction, sortOrder, minValue, maxValue, description: null };
}

// =====================================================================
// CARGA DEL CATÁLOGO
// =====================================================================

let cache: Map<string, MetricDefinition> | null = null;
let inFlight: Promise<Map<string, MetricDefinition>> | null = null;

const toMap = (list: MetricDefinition[]) => new Map(list.map(m => [m.key, m]));

/**
 * El catálogo, cacheado durante toda la sesión.
 *
 * Se cachea porque cambia cuando se añade una métrica —es decir, casi
 * nunca— y en cambio se consulta al pintar cada serie. Volver a pedirlo en
 * cada tarjeta sería una consulta por métrica y por pantalla.
 *
 * Las llamadas concurrentes comparten la MISMA promesa (`inFlight`): al
 * abrir una pantalla con doce tarjetas, las doce piden el catálogo a la vez
 * y sin esto saldrían doce consultas idénticas.
 */
export async function loadMetricCatalog(): Promise<Map<string, MetricDefinition>> {
    if (cache) return cache;
    if (inFlight) return inFlight;

    inFlight = (async () => {
        try {
            const { data, error } = await supabase
                .from('metric_definitions')
                .select('*')
                .eq('is_active', true)
                .order('sort_order');

            if (error || !data?.length) {
                // La tabla puede no existir todavía (migración sin ejecutar).
                // No es motivo para dejar la pantalla sin métricas.
                if (error) {
                    console.warn(
                        'No se pudo leer metric_definitions; se usan las definiciones de respaldo. ' +
                        'Si es la primera vez, ejecuta database/metrics_catalog.sql.',
                        error.message
                    );
                }
                cache = toMap(FALLBACK_DEFINITIONS);
                return cache;
            }

            cache = toMap((data as RawDefinition[]).map(fromRow));
            return cache;
        } finally {
            inFlight = null;
        }
    })();

    return inFlight;
}

/** Fuerza una relectura. Para cuando se añade una métrica sin recargar. */
export function invalidateMetricCatalog(): void {
    cache = null;
}

/**
 * El catálogo que haya AHORA MISMO, sin esperar.
 *
 * Existe para el render: un componente no puede hacer `await` para pintar.
 * Devuelve el respaldo hasta que la carga real termine, y quien lo use
 * volverá a renderizar cuando `loadMetricCatalog` resuelva.
 */
export function metricCatalogSync(): Map<string, MetricDefinition> {
    return cache ?? toMap(FALLBACK_DEFINITIONS);
}

interface RawDefinition {
    key: string; label: string; short_label: string | null; unit: string | null;
    precision: number; category: string; direction: MetricDirection;
    sort_order: number; min_value: number | null; max_value: number | null;
    description: string | null;
}

function fromRow(r: RawDefinition): MetricDefinition {
    return {
        key: r.key,
        label: r.label,
        shortLabel: r.short_label ?? r.label,
        unit: r.unit,
        precision: r.precision ?? 2,
        category: r.category ?? 'other',
        direction: r.direction ?? 'neutral',
        sortOrder: r.sort_order ?? 100,
        minValue: r.min_value,
        maxValue: r.max_value,
        description: r.description,
    };
}

// =====================================================================
// LECTURA Y PRESENTACIÓN
// =====================================================================

/**
 * Descripción de una métrica que NO está en el catálogo.
 *
 * Puede pasar: una versión nueva del analizador escribe una clave que este
 * navegador todavía no conoce. Se enseña con la clave por etiqueta —fea,
 * pero legible— en vez de desaparecer. Un dato medido no se oculta por no
 * saber cómo se llama.
 */
function unknownDefinition(key: string): MetricDefinition {
    return {
        key,
        label: key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()),
        shortLabel: key,
        unit: null,
        precision: 2,
        category: 'other',
        direction: 'neutral',
        sortOrder: 900,
        minValue: null,
        maxValue: null,
        description: null,
    };
}

export function metricDefinition(key: string): MetricDefinition {
    return metricCatalogSync().get(key) ?? unknownDefinition(key);
}

/** El número con sus decimales y su unidad: `0,62 m/s`. */
export function formatMetric(key: string, value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const def = metricDefinition(key);
    const n = value.toFixed(def.precision);
    return def.unit ? `${n} ${def.unit}` : n;
}

/** Solo el número, ya redondeado. Para tablas con la unidad en la cabecera. */
export function formatMetricValue(key: string, value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return value.toFixed(metricDefinition(key).precision);
}

/**
 * Una bolsa convertida en lista ordenada y lista para pintar.
 *
 * Ordena por categoría y dentro de ella por `sortOrder`, así que dos
 * pantallas distintas enseñan las mismas métricas en el mismo orden sin
 * ponerse de acuerdo.
 */
export interface PresentedMetric {
    definition: MetricDefinition;
    value: number;
    formatted: string;
}

export function presentMetrics(bag: MetricBag | null | undefined): PresentedMetric[] {
    if (!bag) return [];

    return Object.entries(bag)
        .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
        .map(([key, value]) => ({
            definition: metricDefinition(key),
            value,
            formatted: formatMetric(key, value),
        }))
        .sort((a, b) => a.definition.sortOrder - b.definition.sortOrder);
}

/** Lo mismo, agrupado por categoría y en el orden del catálogo. */
export function presentMetricsByCategory(
    bag: MetricBag | null | undefined
): { category: string; label: string; metrics: PresentedMetric[] }[] {
    const groups = new Map<string, PresentedMetric[]>();

    for (const m of presentMetrics(bag)) {
        const list = groups.get(m.definition.category) ?? [];
        list.push(m);
        groups.set(m.definition.category, list);
    }

    return [...groups.entries()]
        .map(([category, metrics]) => ({
            category,
            label: CATEGORY_LABELS[category] ?? category,
            metrics,
        }))
        .sort((a, b) => (a.metrics[0]?.definition.sortOrder ?? 999) - (b.metrics[0]?.definition.sortOrder ?? 999));
}

// =====================================================================
// ESCRITURA
// =====================================================================

/**
 * Deja la bolsa lista para guardar.
 *
 * Tres cosas, y las tres importan:
 *
 *   1. Quita lo que no sea un número finito. `NaN` es el resultado normal de
 *      dividir por cero en el analizador cuando el seguimiento del vídeo se
 *      pierde, y `JSON.stringify(NaN)` es `null`: sin este filtro acabarían
 *      en la base claves con valor nulo que ninguna pantalla sabe leer.
 *
 *   2. Descarta lo que se sale del rango declarado en el catálogo. Una
 *      velocidad de 40 m/s no es un levantamiento excepcional, es un fallo
 *      de medición, y guardarla envenena el perfil carga-velocidad del
 *      atleta durante meses.
 *
 *   3. Redondea a los decimales de cada métrica. Sin esto se guardan
 *      cifras como 0.6200000000000001, que además de ocupar espacio hacen
 *      que dos mediciones idénticas no se vean iguales.
 */
export function sanitizeMetricBag(input: Record<string, number | null | undefined>): MetricBag {
    const out: MetricBag = {};

    for (const [key, raw] of Object.entries(input)) {
        if (raw === null || raw === undefined) continue;
        if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;

        const def = metricDefinition(key);
        if (def.minValue !== null && raw < def.minValue) continue;
        if (def.maxValue !== null && raw > def.maxValue) continue;

        const factor = 10 ** def.precision;
        out[key] = Math.round(raw * factor) / factor;
    }

    return out;
}

// =====================================================================
// PUENTE CON EL MODELO ANTIGUO
// =====================================================================

/**
 * Las siete métricas que tienen columna propia en `training_sets`.
 *
 * Este mapa es la ÚNICA cosa de todo el archivo que hay que tocar si algún
 * día una métrica nueva se promociona a columna. Las demás viven solo en la
 * bolsa, que es donde deben vivir.
 */
export const LEGACY_COLUMN_KEYS = [
    'mean_velocity',
    'peak_velocity',
    'velocity_loss',
    'mean_power',
    'peak_power',
    'rom',
    'est_1rm',
] as const;

/** Bolsa → el objeto `VbtMetrics` de toda la vida, para lo ya escrito. */
export function bagToLegacyMetrics(bag: MetricBag | null | undefined) {
    const b = bag ?? {};
    return {
        meanVelocity: b.mean_velocity ?? null,
        peakVelocity: b.peak_velocity ?? null,
        velocityLoss: b.velocity_loss ?? null,
        meanPower: b.mean_power ?? null,
        peakPower: b.peak_power ?? null,
        rom: b.rom ?? null,
        est1RM: b.est_1rm ?? null,
    };
}

/** `VbtMetrics` → bolsa. El camino de vuelta, para lo que aún no migró. */
export function legacyMetricsToBag(m: {
    meanVelocity?: number | null; peakVelocity?: number | null;
    velocityLoss?: number | null; meanPower?: number | null;
    peakPower?: number | null; rom?: number | null; est1RM?: number | null;
}): MetricBag {
    return sanitizeMetricBag({
        mean_velocity: m.meanVelocity,
        peak_velocity: m.peakVelocity,
        velocity_loss: m.velocityLoss,
        mean_power: m.meanPower,
        peak_power: m.peakPower,
        rom: m.rom,
        est_1rm: m.est1RM,
    });
}
