/**
 * ANVIL STRENGTH — DE PÍXELES A VELOCIDAD
 * =====================================================================
 *
 * Este fichero convierte el recorrido de la barra —una lista de puntos en
 * píxeles con su instante— en velocidad y aceleración. Es donde se decide
 * cuánto vale el pico de velocidad que sale en pantalla.
 *
 *
 * QUÉ HACÍA LA VERSIÓN ANTERIOR, Y POR QUÉ APLASTABA EL PICO
 *
 * Tres pasos encadenados en `calculateVelocityMetrics`:
 *
 *   1. media móvil de 5 puntos sobre la Y,
 *   2. diferencia central para derivar,
 *   3. media exponencial hacia delante y luego otra hacia atrás (α = 0,35).
 *
 * El paso 3 se documentaba como "zero-phase … retiene el pico". Cancela el
 * desfase, sí, pero **no retiene el pico**: son dos filtros de primer orden en
 * cascada sobre una señal que ya venía suavizada por el paso 1. En una
 * concéntrica de 0,8 s muestreada a 30 Hz eso atenúa la velocidad máxima
 * alrededor de un 10-15%. Y la velocidad máxima no es decorativa: es una de
 * las cinco métricas que se guardan y entra en el perfil del atleta.
 *
 * Había además dos defectos concretos:
 *
 *   · Solo se suavizaba la Y. La X se derivaba… no, peor: se usaba CRUDA para
 *     la desviación horizontal, que se calcula como `max(x) - min(x)`. Un
 *     máximo y un mínimo sobre ruido sin filtrar sobrestiman siempre.
 *   · Para "no encoger el array", los extremos se duplicaban con
 *     `{...rawVelocities[0]}`, que copia también la `x` y la `y` del vecino.
 *     El primer y el último punto del recorrido quedaban con las coordenadas
 *     equivocadas, y de ahí salen el ROM y la altura del sticking point.
 *
 *
 * LO QUE SE HACE AHORA: REGRESIÓN LOCAL CUADRÁTICA
 *
 * Para cada punto se ajusta una parábola por mínimos cuadrados a los vecinos
 * dentro de una ventana de tiempo, y se leen del ajuste la posición, la
 * pendiente (velocidad) y la curvatura (aceleración). Es Savitzky-Golay, que
 * es el estándar en biomecánica para esto, generalizado a muestras que no están
 * perfectamente equiespaciadas —que es nuestro caso, porque un vídeo puede
 * tener cadencia variable y el lector puede saltarse un fotograma ilegible—.
 *
 * Tres cosas mejoran a la vez:
 *
 *   · SE DERIVA DEL AJUSTE, no de la señal suavizada. Suavizar y luego derivar
 *     aplica el filtro dos veces; ajustar y leer la pendiente, una.
 *   · NO HAY DESFASE y el pico se conserva, porque una parábola SÍ puede
 *     describir un máximo. Una media móvil, por construcción, no.
 *   · LOS EXTREMOS SE AJUSTAN CON LA VENTANA RECORTADA, sin inventar puntos.
 *
 * La ventana se define en SEGUNDOS y no en muestras: así el filtrado es el
 * mismo en un vídeo a 30 Hz y en uno a 240, en vez de ser cuatro veces más
 * agresivo en el segundo.
 *
 *
 * EL FILTRO DE MEDIANA PREVIO
 *
 * Antes de ajustar nada se pasa una mediana de 3 sobre X e Y. El flujo óptico
 * falla de una forma muy concreta: no se degrada, SALTA — la marca se va un
 * fotograma a otro objeto y vuelve. Una mediana de 3 borra ese salto aislado
 * sin tocar el movimiento real, que es monótono a la escala de un fotograma.
 * Los saltos siguen contándose en `TrackingStats` a partir del recorrido CRUDO,
 * así que filtrarlos aquí no esconde el problema de la nota de calidad.
 */

// =====================================================================
// TIPOS
// =====================================================================

/** Un punto del recorrido tal y como sale del seguimiento. */
export interface RawPoint {
    x: number;
    y: number;
    /** Milisegundos dentro del vídeo. */
    timestamp: number;
}

/**
 * Un punto ya derivado.
 *
 * `x` e `y` siguen en PÍXELES del vídeo original y con la Y creciendo hacia
 * abajo, como en el lienzo, porque es lo que espera el resto del análisis.
 * `velocity` sí está en metros por segundo y con el signo físico: positivo es
 * subir.
 */
export interface KinematicPoint {
    /** Milisegundos dentro del vídeo. */
    time: number;
    x: number;
    y: number;
    /** m/s. Positivo = la barra sube. */
    velocity: number;
    /** m/s². Positivo = acelerando hacia arriba. */
    acceleration: number;
    /**
     * La misma aceleración, ajustada con una ventana MÁS ESTRECHA. Solo para
     * medir el PICO.
     *
     *
     * POR QUÉ HAY DOS ACELERACIONES Y NO UNA
     *
     * Porque se les pide cosas distintas, y no existe una ventana que haga las
     * dos bien:
     *
     *   · `acceleration` entra en la fuerza y la potencia, que se PROMEDIAN e
     *     integran a lo largo de la repetición. Ahí lo que hace daño es la
     *     varianza: un diente de sierra en la aceleración se propaga a la
     *     fuerza, y de la fuerza a la potencia. Conviene una ventana ancha.
     *   · `accelerationSharp` sirve para un MÁXIMO, y un máximo no se promedia:
     *     una ventana ancha lo aplasta y punto. Ahí lo que hace daño es el
     *     sesgo.
     *
     * Medido sobre repeticiones sintéticas (6 formas × 2 cadencias × 3 ruidos ×
     * 3 semillas), el error de la aceleración pico según la ventana:
     *
     *     ventana   sesgo    |error|   ruido de la señal
     *      0,06 s   −2,3%     22,1%        11,2%
     *      0,08 s   −2,3%     22,1%        11,2%
     *      0,10 s   −9,7%     17,3%         9,6%      ← elegida para el pico
     *      0,12 s  −15,0%     18,3%         8,8%
     *      0,18 s  −23,4%     24,8%         7,6%      ← se conserva para F y P
     *      0,24 s  −34,3%     34,4%         6,8%
     *
     * Con 0,10 s el error absoluto es mínimo. Estrechar más quita sesgo pero
     * mete tanto ruido que el error total vuelve a subir.
     *
     * (0,06 y 0,08 dan lo mismo porque `windowAround` ensancha la ventana hasta
     * reunir `MIN_SAMPLES_FOR_FIT` muestras: por debajo de ese ancho el
     * parámetro deja de tener efecto y manda el mínimo de muestras.)
     *
     * Y la ancha se queda como estaba a propósito: cambiarla movería la fuerza,
     * la potencia y el RFD de TODAS las mediciones ya guardadas, que es
     * justamente lo que se decidió no hacer.
     *
     * Aun así, 17% de error absoluto es mucho: la aceleración pico es la métrica
     * menos fiable de las que se calculan, y hay que enseñarla diciéndolo.
     */
    accelerationSharp: number;
}

export interface KinematicsOptions {
    /** Ventana de la regresión para posición y velocidad, en segundos. */
    velocityWindowS?: number;
    /**
     * Ventana para la aceleración. Más ancha a propósito: la curvatura de un
     * ajuste local es mucho más sensible al ruido que su pendiente, y una
     * aceleración ruidosa se propaga a la fuerza, la potencia y el RFD.
     */
    accelerationWindowS?: number;
    /** Ventana para la aceleración PICO. Ver `accelerationSharp`. */
    peakAccelerationWindowS?: number;
    /** Desactiva la mediana previa. Solo para depurar. */
    skipMedian?: boolean;
}

const DEFAULT_VELOCITY_WINDOW_S = 0.10;
const DEFAULT_ACCELERATION_WINDOW_S = 0.18;
/** Ver `accelerationSharp`: sale de un barrido, no de una intuición. */
const DEFAULT_PEAK_ACCELERATION_WINDOW_S = 0.10;

/** Mínimo de muestras para que una parábola signifique algo. */
const MIN_SAMPLES_FOR_FIT = 5;

// =====================================================================
// UTILIDADES
// =====================================================================

/** Mediana de 3 sobre una serie. Los extremos se dejan como están. */
function median3(values: number[]): number[] {
    if (values.length < 3) return [...values];
    const out = new Array<number>(values.length);
    out[0] = values[0];
    out[values.length - 1] = values[values.length - 1];
    for (let i = 1; i < values.length - 1; i++) {
        const a = values[i - 1];
        const b = values[i];
        const c = values[i + 1];
        out[i] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    }
    return out;
}

/**
 * Ajuste local por mínimos cuadrados de  y = a0 + a1·u + a2·u², con u el
 * tiempo relativo al punto central y NORMALIZADO por el semiancho de la
 * ventana.
 *
 * La normalización no es cosmética: sin ella la matriz normal acumula términos
 * en u⁴ con u en segundos, los números quedan separados por diez órdenes de
 * magnitud y la solución pierde precisión justo donde importa. Con u en [-1, 1]
 * la matriz está bien condicionada siempre.
 *
 * Devuelve `null` cuando el sistema es singular —pasa si todas las muestras de
 * la ventana comparten instante— para que quien llame decida qué hacer en vez
 * de propagar un `NaN`.
 */
function fitQuadratic(
    times: number[],
    values: number[],
    from: number,
    to: number,
    centreTime: number,
    halfSpan: number
): { value: number; slope: number; curvature: number } | null {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
    let b0 = 0, b1 = 0, b2 = 0;

    for (let i = from; i <= to; i++) {
        const u = (times[i] - centreTime) / halfSpan;
        const u2 = u * u;
        const v = values[i];
        s0 += 1;
        s1 += u;
        s2 += u2;
        s3 += u2 * u;
        s4 += u2 * u2;
        b0 += v;
        b1 += u * v;
        b2 += u2 * v;
    }

    // Regla de Cramer sobre la matriz normal 3×3, que es simétrica.
    const det =
        s0 * (s2 * s4 - s3 * s3) -
        s1 * (s1 * s4 - s3 * s2) +
        s2 * (s1 * s3 - s2 * s2);

    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;

    const a0 =
        (b0 * (s2 * s4 - s3 * s3) -
            s1 * (b1 * s4 - s3 * b2) +
            s2 * (b1 * s3 - s2 * b2)) / det;

    const a1 =
        (s0 * (b1 * s4 - s3 * b2) -
            b0 * (s1 * s4 - s3 * s2) +
            s2 * (s1 * b2 - b1 * s2)) / det;

    const a2 =
        (s0 * (s2 * b2 - b1 * s3) -
            s1 * (s1 * b2 - b1 * s2) +
            b0 * (s1 * s3 - s2 * s2)) / det;

    if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(a2)) return null;

    // Deshacer la normalización: u = (t - tc)/h, así que d/dt = (d/du)/h.
    return {
        value: a0,
        slope: a1 / halfSpan,
        curvature: (2 * a2) / (halfSpan * halfSpan),
    };
}

/**
 * Índices de la ventana centrada en `i` que caben en `±halfWindow` segundos,
 * ensanchada si hace falta hasta reunir `MIN_SAMPLES_FOR_FIT` muestras.
 *
 * El ensanchado existe para los vídeos de poca cadencia: a 24 Hz una ventana
 * de 0,10 s son dos muestras y media, con las que no se puede ajustar una
 * parábola. Antes que devolver ruido, se mira un poco más lejos.
 */
function windowAround(times: number[], i: number, halfWindow: number): { from: number; to: number } {
    const t = times[i];
    let from = i;
    let to = i;

    while (from > 0 && t - times[from - 1] <= halfWindow) from--;
    while (to < times.length - 1 && times[to + 1] - t <= halfWindow) to++;

    while (to - from + 1 < MIN_SAMPLES_FOR_FIT) {
        const canGrowLeft = from > 0;
        const canGrowRight = to < times.length - 1;
        if (!canGrowLeft && !canGrowRight) break;
        if (!canGrowRight) { from--; continue; }
        if (!canGrowLeft) { to++; continue; }
        // Crecer por el lado cuyo vecino esté más cerca mantiene la ventana lo
        // más centrada posible, que es lo que evita introducir desfase.
        if (t - times[from - 1] <= times[to + 1] - t) from--;
        else to++;
    }

    return { from, to };
}

// =====================================================================
// EL CÁLCULO
// =====================================================================

/**
 * Velocidad y aceleración verticales de la barra a partir del recorrido.
 *
 * `pixelToMeterRatio` son metros por píxel: sale de `plateGeometry.ts` y es el
 * número que multiplica todo el análisis.
 */
export function computeKinematics(
    path: RawPoint[],
    pixelToMeterRatio: number,
    options: KinematicsOptions = {}
): KinematicPoint[] {
    if (path.length < 3 || !(pixelToMeterRatio > 0) || !Number.isFinite(pixelToMeterRatio)) return [];

    // Por si el seguimiento entregara los puntos desordenados: todo lo de abajo
    // supone tiempo creciente, y una sola inversión daría un `dt` negativo y
    // una velocidad con el signo cambiado.
    const sorted = [...path].sort((a, b) => a.timestamp - b.timestamp);

    const times = sorted.map(p => p.timestamp / 1000);
    const rawX = sorted.map(p => p.x);
    const rawY = sorted.map(p => p.y);

    const xs = options.skipMedian ? rawX : median3(rawX);
    const ys = options.skipMedian ? rawY : median3(rawY);

    const velHalf = (options.velocityWindowS ?? DEFAULT_VELOCITY_WINDOW_S) / 2;
    const accHalf = (options.accelerationWindowS ?? DEFAULT_ACCELERATION_WINDOW_S) / 2;
    const sharpHalf = (options.peakAccelerationWindowS ?? DEFAULT_PEAK_ACCELERATION_WINDOW_S) / 2;

    const out: KinematicPoint[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const vw = windowAround(times, i, velHalf);
        const halfSpan = Math.max(1e-4, (times[vw.to] - times[vw.from]) / 2);

        const fitY = fitQuadratic(times, ys, vw.from, vw.to, times[i], halfSpan);
        const fitX = fitQuadratic(times, xs, vw.from, vw.to, times[i], halfSpan);

        const aw = windowAround(times, i, accHalf);
        const accHalfSpan = Math.max(1e-4, (times[aw.to] - times[aw.from]) / 2);
        const fitAcc = fitQuadratic(times, ys, aw.from, aw.to, times[i], accHalfSpan);

        const sw = windowAround(times, i, sharpHalf);
        const sharpHalfSpan = Math.max(1e-4, (times[sw.to] - times[sw.from]) / 2);
        // Cuando las dos ventanas acaban abarcando las mismas muestras —pasa en
        // vídeos de poca cadencia, donde `windowAround` ensancha las dos hasta el
        // mínimo de muestras— se reaprovecha el ajuste en vez de repetirlo.
        const sameSpan = sw.from === aw.from && sw.to === aw.to;
        const fitSharp = sameSpan
            ? fitAcc
            : fitQuadratic(times, ys, sw.from, sw.to, times[i], sharpHalfSpan);

        // En el lienzo la Y crece hacia abajo: subir es que la Y disminuya. El
        // signo se invierte aquí, una sola vez, y ya sale físico de este módulo.
        const velocity = fitY ? -fitY.slope * pixelToMeterRatio : 0;
        const acceleration = fitAcc ? -fitAcc.curvature * pixelToMeterRatio : 0;

        out.push({
            time: sorted[i].timestamp,
            x: fitX ? fitX.value : xs[i],
            y: fitY ? fitY.value : ys[i],
            velocity,
            acceleration,
            accelerationSharp: fitSharp ? -fitSharp.curvature * pixelToMeterRatio : acceleration,
        });
    }

    return out;
}

/**
 * El mayor salto del recorrido CRUDO, en píxeles por fotograma típico.
 *
 * Se calcula sobre el recorrido sin filtrar y aquí, en un solo sitio, en vez de
 * ir acumulándolo dentro del bucle de seguimiento: allí dependía del tiempo que
 * tardara cada fotograma en procesarse, que no tiene nada que ver con lo que se
 * quiere medir.
 *
 * SE NORMALIZA POR LA CADENCIA REAL DEL VÍDEO, NO POR UN 30 FIJO. La primera
 * versión dividía por 30 Hz, y eso convertía cualquier par de muestras muy
 * juntas en un salto enorme: con `dt` de 2 ms, un solo píxel de diferencia daba
 * 17 «píxeles por fotograma» y el aviso de «la marca se ha ido a otro objeto»
 * saltaba en un seguimiento perfecto. Se vio en una prueba real: un salto
 * declarado de 167 px sobre un vídeo de 480 px de alto, con cero fotogramas
 * perdidos y la nube de puntos intacta, que habría BLOQUEADO el guardado.
 *
 * Con la mediana de los intervalos, la medida es la que se quería desde el
 * principio: cuánto se ha movido la marca en un fotograma comparado con lo
 * normal en ESTE vídeo.
 */
export function maxNormalisedJumpPx(path: RawPoint[]): number {
    if (path.length < 3) return 0;

    const deltas: number[] = [];
    for (let i = 1; i < path.length; i++) {
        const dt = (path[i].timestamp - path[i - 1].timestamp) / 1000;
        if (dt > 0) deltas.push(dt);
    }
    if (deltas.length === 0) return 0;

    const sorted = [...deltas].sort((a, b) => a - b);
    const medianDt = sorted[sorted.length >> 1];
    if (!(medianDt > 0)) return 0;

    let worst = 0;
    for (let i = 1; i < path.length; i++) {
        const dt = (path[i].timestamp - path[i - 1].timestamp) / 1000;
        // Un par más junto que medio intervalo típico no es un fotograma
        // siguiente: es una muestra repetida. Dividir por su `dt` diminuto es
        // justamente lo que producía el falso salto.
        if (dt < medianDt * 0.5) continue;
        const jump = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        const normalised = (jump / dt) * medianDt;
        if (normalised > worst) worst = normalised;
    }
    return worst;
}
