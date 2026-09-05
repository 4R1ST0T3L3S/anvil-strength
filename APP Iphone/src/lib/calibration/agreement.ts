/**
 * ANVIL STRENGTH — CUÁNTO SE PARECE PWR A UN ENCODER
 * =====================================================================
 *
 * PARA QUÉ EXISTE ESTO (Fases 9 y 10)
 *
 * Todo el módulo de análisis está construido sobre criterio razonado. Los
 * pesos de `quality.ts`, los cortes de bloqueo, el umbral del 8% de
 * `movementBounds`: cada uno tiene su justificación escrita y varios están
 * medidos contra repeticiones sintéticas. Pero hay una frase que hoy no se
 * puede decir:
 *
 *     «una medición con un 82 de calidad tiene ±3% de error»
 *
 * Los sintéticos no la pueden dar. Un sintético comprueba que las MATEMÁTICAS
 * son correctas: se construye una repetición de verdad conocida y se mira si
 * el filtro, la derivación y la segmentación la recuperan. Lo que no puede
 * comprobar es la CADENA ENTERA sobre un levantamiento real —la cámara, el
 * códec, la detección del disco, el flujo óptico sobre un gimnasio con gente
 * moviéndose detrás—. Para eso hace falta medir lo mismo dos veces: con el
 * vídeo y con un aparato en el que se confía.
 *
 * Este módulo es la cuenta que convierte esas dos listas de números en una
 * respuesta.
 *
 *
 * POR QUÉ NO BASTA CON UNA CORRELACIÓN, Y ES EL ERROR QUE TODO EL MUNDO COMETE
 *
 * La tentación es calcular la r de Pearson entre encoder y PWR, ver 0,97 y
 * darlo por bueno. **La correlación no mide acuerdo, mide asociación.** Un
 * método que devuelve siempre exactamente la mitad que el encoder correlaciona
 * 1,00 con él, y es inservible.
 *
 * Lo que hace falta es lo de Bland y Altman: mirar las DIFERENCIAS. El sesgo
 * (¿mide de más o de menos, y cuánto?) y la dispersión de esa diferencia
 * (¿cuánto puede desviarse una medición concreta?). Los límites de acuerdo
 * —sesgo ± 1,96 desviaciones típicas— son el par de números que de verdad
 * contesta la pregunta: *si el encoder dice 0,60 m/s, ¿entre qué valores va a
 * decir PWR el 95% de las veces?*
 *
 * La r se calcula igual y se enseña, porque la va a buscar todo el mundo. Pero
 * va detrás y con la salvedad puesta.
 */

// =====================================================================
// LO QUE SE COMPARA
// =====================================================================

/** Una repetición medida por el aparato de referencia. */
export interface ReferenceRep {
    /** Posición dentro de la serie, empezando en 1. */
    index: number;
    meanVelocity: number | null;
    peakVelocity: number | null;
    /** Recorrido en METROS. La conversión de unidades ya está hecha. */
    romM: number | null;
}

/** Una repetición medida por PWR sobre el vídeo de esa misma serie. */
export interface MeasuredRep {
    index: number;
    meanVelocity: number | null;
    peakVelocity: number | null;
    romM: number | null;
}

/** Las magnitudes que se comparan, y cómo se llaman por escrito. */
export const COMPARED_METRICS = [
    { key: 'meanVelocity', label: 'Velocidad media', unit: 'm/s', decimals: 3 },
    { key: 'peakVelocity', label: 'Velocidad máxima', unit: 'm/s', decimals: 3 },
    { key: 'romM', label: 'Recorrido', unit: 'm', decimals: 3 },
] as const;

export type ComparedMetric = (typeof COMPARED_METRICS)[number]['key'];

// =====================================================================
// EMPAREJADO
// =====================================================================

export interface PairedRep {
    index: number;
    reference: number;
    measured: number;
    /** Medido − referencia. Positivo = PWR mide de más. */
    difference: number;
    /** La diferencia en % de la referencia. `null` si la referencia es ~0. */
    differencePct: number | null;
}

export interface Pairing {
    pairs: PairedRep[];
    referenceCount: number;
    measuredCount: number;
    /**
     * `true` cuando las dos listas no traen el mismo número de repeticiones.
     *
     * NO ES UN DETALLE. Se emparejan por ORDEN, así que si al encoder se le
     * escapó la primera repetición, la 1 de PWR se compara con la 2 del
     * encoder, la 2 con la 3, y así todas: sale un desacuerdo enorme que no
     * viene de medir mal sino de haber alineado mal. Y con una serie de cinco
     * repeticiones parecidas, el resultado tiene toda la pinta de ser real.
     *
     * Cuando pasa se emparejan solo las que hay —suponiendo que lo que falta
     * está al FINAL, que es lo más frecuente— y se marca aquí para que quien
     * lea el informe sepa que esa suposición se ha hecho.
     */
    countsDiffer: boolean;
}

/** Números utilizables: ni nulos, ni infinitos, ni negativos. */
const usable = (v: number | null | undefined): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Empareja repetición a repetición, por orden.
 *
 * Por ORDEN y no por índice declarado: el índice del encoder empieza en 1 en
 * unos ficheros y en 0 en otros, y PWR numera lo que ha detectado. Lo único
 * común a los dos es la secuencia.
 */
export function pairReps(
    reference: ReferenceRep[],
    measured: MeasuredRep[],
    metric: ComparedMetric
): Pairing {
    const ref = reference.filter(r => usable(r[metric]));
    const mea = measured.filter(m => usable(m[metric]));
    const n = Math.min(ref.length, mea.length);

    const pairs: PairedRep[] = [];
    for (let i = 0; i < n; i++) {
        const reference_ = ref[i][metric] as number;
        const measured_ = mea[i][metric] as number;
        const difference = measured_ - reference_;

        pairs.push({
            index: i + 1,
            reference: reference_,
            measured: measured_,
            difference,
            // Un denominador diminuto convierte un error irrelevante en un
            // porcentaje de miles, y ese porcentaje arrastra la media.
            differencePct: reference_ > 1e-6 ? (difference / reference_) * 100 : null,
        });
    }

    return {
        pairs,
        referenceCount: ref.length,
        measuredCount: mea.length,
        countsDiffer: ref.length !== mea.length,
    };
}

// =====================================================================
// ACUERDO
// =====================================================================

export interface Agreement {
    metric: ComparedMetric;
    n: number;
    /**
     * Error sistemático: la media de (PWR − encoder).
     *
     * Es el número que se puede CORREGIR. Un sesgo de −0,03 m/s significa que
     * PWR mide 3 cm/s de menos siempre, y eso se arregla; la dispersión, no.
     */
    bias: number;
    /** El sesgo en % de la referencia media. */
    biasPct: number;
    /** Error absoluto medio. Lo que se equivoca una medición cualquiera. */
    mae: number;
    /** Error absoluto medio en %. */
    mape: number;
    /** Raíz del error cuadrático medio: penaliza los fallos grandes. */
    rmse: number;
    /** Desviación típica de las diferencias (muestral, n−1). */
    sdDifference: number;
    /**
     * Límites de acuerdo de Bland-Altman: sesgo ± 1,96·SD.
     *
     * ES LA CIFRA QUE HAY QUE MIRAR. Entre estos dos valores cae el 95% de las
     * diferencias, así que responde a la única pregunta práctica: cuánto se
     * puede desviar UNA medición, no cuánto se desvían de media.
     */
    loaLower: number;
    loaUpper: number;
    /**
     * Correlación de Pearson.
     *
     * Se calcula porque todo el mundo la busca, y **no mide acuerdo**: un
     * método que devolviera siempre la mitad que el encoder daría 1,00. Se
     * enseña detrás de los límites de acuerdo, nunca en su lugar.
     */
    pearsonR: number | null;
    /** El peor desacuerdo de la serie, para poder ir a mirar esa repetición. */
    worst: PairedRep | null;
}

/** Media aritmética. La lista nunca llega vacía desde `computeAgreement`. */
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Desviación típica MUESTRAL (n−1).
 *
 * Con n−1 y no con n porque estas repeticiones son una muestra de cómo mide el
 * método, no la población entera de mediciones posibles. Con las 5 ó 10
 * repeticiones que tiene una sesión de calibración, la diferencia entre las
 * dos fórmulas llega al 6% en los límites de acuerdo — que es justo la cifra
 * que se va a citar.
 */
function sampleSd(xs: number[]): number {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

function pearson(xs: number[], ys: number[]): number | null {
    if (xs.length < 3) return null;
    const mx = mean(xs);
    const my = mean(ys);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < xs.length; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
    }
    // Sin variación en uno de los dos no hay correlación definida. Pasa cuando
    // todas las repeticiones salen prácticamente iguales, que en una serie
    // corta y ligera no es raro.
    if (sxx <= 0 || syy <= 0) return null;
    return sxy / Math.sqrt(sxx * syy);
}

/** Los límites de acuerdo se calculan a 1,96 desviaciones: el 95% central. */
const LOA_Z = 1.96;

export function computeAgreement(pairing: Pairing, metric: ComparedMetric): Agreement | null {
    const { pairs } = pairing;
    if (pairs.length === 0) return null;

    const differences = pairs.map(p => p.difference);
    const references = pairs.map(p => p.reference);
    const measured = pairs.map(p => p.measured);

    const bias = mean(differences);
    const sd = sampleSd(differences);
    const meanReference = mean(references);

    // Solo de las parejas donde el porcentaje significa algo: ver `differencePct`.
    const pcts = pairs.map(p => p.differencePct).filter((v): v is number => v !== null);

    let worst: PairedRep | null = null;
    for (const p of pairs) {
        if (!worst || Math.abs(p.difference) > Math.abs(worst.difference)) worst = p;
    }

    return {
        metric,
        n: pairs.length,
        bias,
        biasPct: meanReference > 1e-6 ? (bias / meanReference) * 100 : 0,
        mae: mean(differences.map(Math.abs)),
        mape: pcts.length ? mean(pcts.map(Math.abs)) : 0,
        rmse: Math.sqrt(mean(differences.map(d => d * d))),
        sdDifference: sd,
        loaLower: bias - LOA_Z * sd,
        loaUpper: bias + LOA_Z * sd,
        pearsonR: pearson(references, measured),
        worst,
    };
}

// =====================================================================
// EL INFORME
// =====================================================================

export interface AgreementReport {
    /** Una entrada por magnitud comparada, en el orden de `COMPARED_METRICS`. */
    metrics: { metric: ComparedMetric; pairing: Pairing; agreement: Agreement | null }[];
    /** Repeticiones emparejadas de la magnitud mejor cubierta. */
    pairedReps: number;
    /** Avisos que hay que leer ANTES que ninguna cifra. */
    warnings: string[];
}

/**
 * Con menos repeticiones que esto, los límites de acuerdo son tan anchos que
 * no acotan nada.
 *
 * No es un capricho: la desviación típica muestral con n=3 tiene un intervalo
 * de confianza que va de la mitad al doble del valor estimado. Publicar
 * «±0,08 m/s» a partir de tres repeticiones es prometer una precisión que el
 * propio cálculo no tiene. Se enseña igual, pero avisando.
 */
export const MIN_REPS_FOR_LOA = 5;

export function buildAgreementReport(
    reference: ReferenceRep[],
    measured: MeasuredRep[]
): AgreementReport {
    const metrics = COMPARED_METRICS.map(({ key }) => {
        const pairing = pairReps(reference, measured, key);
        return { metric: key, pairing, agreement: computeAgreement(pairing, key) };
    });

    const pairedReps = Math.max(0, ...metrics.map(m => m.pairing.pairs.length));
    const warnings: string[] = [];

    if (pairedReps === 0) {
        warnings.push(
            'No se ha podido emparejar ninguna repetición. Comprueba que el fichero del ' +
            'encoder corresponde a la misma serie que el vídeo.'
        );
    } else {
        const mismatched = metrics.find(m => m.pairing.countsDiffer && m.pairing.pairs.length > 0);
        if (mismatched) {
            warnings.push(
                `El encoder trae ${mismatched.pairing.referenceCount} repeticiones y PWR ha ` +
                `detectado ${mismatched.pairing.measuredCount}. Se han emparejado las ` +
                `${mismatched.pairing.pairs.length} primeras, suponiendo que lo que falta está ` +
                'al final. Si la repetición que falta es otra, TODO lo que sigue está mal alineado.'
            );
        }

        if (pairedReps < MIN_REPS_FOR_LOA) {
            warnings.push(
                `Solo ${pairedReps} repeticiones emparejadas. Los límites de acuerdo se calculan ` +
                `igual, pero con menos de ${MIN_REPS_FOR_LOA} son orientativos: la dispersión ` +
                'estimada con tan pocos datos puede quedarse en la mitad o en el doble de la real.'
            );
        }
    }

    return { metrics, pairedReps, warnings };
}

// =====================================================================
// LEERLO EN UNA FRASE
// =====================================================================

/**
 * El veredicto en una línea, para la magnitud que manda.
 *
 * Los cortes son de criterio, como los de `quality.ts`, y por la misma razón
 * están con nombre: son exactamente lo que estas sesiones de calibración
 * existen para sustituir por datos. Salen de lo que se considera aceptable en
 * la literatura de VBT para un dispositivo de campo (±0,06 m/s frente a un
 * encoder lineal es el orden de magnitud que reportan los estudios de
 * validación de aplicaciones de móvil).
 */
export const AGREEMENT_BANDS = {
    good: 0.06,
    fair: 0.10,
} as const;

export function agreementVerdict(a: Agreement | null): {
    level: 'good' | 'fair' | 'poor' | 'unknown';
    text: string;
} {
    if (!a || a.n === 0) return { level: 'unknown', text: 'Sin datos suficientes.' };

    // El ancho de los límites de acuerdo, no el sesgo: un sesgo se corrige, la
    // dispersión es lo que de verdad limita para qué sirve la medición.
    const halfWidth = (a.loaUpper - a.loaLower) / 2;

    if (a.metric === 'romM') {
        // El recorrido está en metros y sus cifras no son comparables con las
        // de velocidad; se juzga en porcentaje.
        const level = a.mape <= 3 ? 'good' : a.mape <= 6 ? 'fair' : 'poor';
        return { level, text: `${a.mape.toFixed(1)}% de error absoluto medio` };
    }

    const level =
        halfWidth <= AGREEMENT_BANDS.good ? 'good' : halfWidth <= AGREEMENT_BANDS.fair ? 'fair' : 'poor';

    return {
        level,
        text: `${a.bias >= 0 ? '+' : ''}${a.bias.toFixed(3)} m/s de sesgo · ±${halfWidth.toFixed(3)} m/s`,
    };
}
