import type { KinematicPoint } from './signal';
/**
 * La velocidad a la que se termina un máximo, de UNA sola tabla.
 *
 * `lib/vbt/analysis.ts` es cálculo puro —sin React y sin Supabase— así que
 * traerlo aquí no arrastra nada. Ver `estimate1RM` para por qué había dos
 * tablas y por qué ahora hay una.
 *
 * Este fichero se ejecuta también en Node, para medirlo contra repeticiones
 * sintéticas (§13 de la auditoría). Node no resuelve imports sin extensión
 * como lo hace Vite, y de eso se encarga `scripts/ts-resolver.mjs`: los bancos
 * se lanzan con `--import ./scripts/ts-resolver.mjs`.
 */
import { MVT_BY_PATTERN } from '../vbt/analysis';

/**
 * ANVIL STRENGTH — DE LA VELOCIDAD A LAS MÉTRICAS
 * =====================================================================
 *
 * Aquí se decide qué trozo del recorrido es "una repetición" y qué números
 * salen de ella. Es la capa donde un error no se ve: todo lo de aquí produce
 * cifras bien formateadas pase lo que pase.
 *
 *
 * EL FALLO QUE PARTÍA LAS REPETICIONES EN DOS
 *
 * La versión anterior segmentaba con un umbral seco:
 *
 *     if (v > 0.04)  → subiendo
 *     else if (v < -0.04) → bajando
 *     else → finalizePhase()   ← cierra la repetición
 *
 * O sea: **cualquier muestra con la velocidad por debajo de 4 cm/s cerraba la
 * fase**. Y hay un momento en el que eso pasa siempre, justo en la población
 * para la que está hecha esta herramienta: el punto de estancamiento de un
 * levantamiento cerca del máximo. Un peso al 92% se para de verdad a media
 * subida —de eso trata el sticking point— y ahí la velocidad cruza el cero.
 *
 * La consecuencia era doble y silenciosa:
 *
 *   · la concéntrica se partía en dos trozos, cada uno con la mitad del
 *     recorrido, y los dos caían por debajo del mínimo de 15 cm exigido para
 *     contar como repetición: **la repetición desaparecía**;
 *   · o, si los dos trozos pasaban el corte, se contaban DOS repeticiones donde
 *     hubo una, lo que además falsea la pérdida de velocidad de la serie.
 *
 * En otras palabras: cuanto más pesada la serie —cuanto más interesante— más
 * probable era que el análisis no la viese.
 *
 * Lo que cierra una fase ahora no es un umbral ni un tiempo, sino QUÉ PASA
 * DESPUÉS de la parada: si la barra vuelve a avanzar en el mismo sentido, era un
 * estancamiento y la repetición continúa; si se invierte o se queda quieta, la
 * repetición terminó. Ver `findResume`. Se llegó ahí después de comprobar que
 * ningún umbral de duración sirve: a 30 fps un estancamiento real y el final de
 * una repetición duran lo mismo, cuatro o cinco fotogramas.
 *
 *
 * COMPROBADO CONTRA UNA REPETICIÓN SINTÉTICA
 *
 * Con una repetición generada a partir de un perfil de velocidad conocido
 * (0,550 m de recorrido en 1,00 s, con estancamiento), a 30 fps y un píxel de
 * ruido de seguimiento:
 *
 *                        antes        ahora
 *   recorrido            +0,1%        +0,1%
 *   velocidad media     −24,0%        −0,4%
 *   velocidad máxima    −33,0%        −6,9%
 *   estancamiento    (devolvía el pico)   detectado
 *
 * Y con un estancamiento profundo a 60 fps, la versión anterior partía la
 * repetición en dos (dos repeticiones, recorrido −50%); esta no.
 *
 *
 * LOS EXTREMOS SE AFINAN POR ALTURA, NO POR UMBRAL
 *
 * Una vez acotada la fase a grandes rasgos, sus extremos se mueven al punto más
 * bajo y al más alto del tramo. El recorrido es, por definición, la distancia
 * entre esos dos puntos; sacarlo de donde la velocidad cruzó un umbral lo hacía
 * depender del umbral, que es un parámetro nuestro y no una propiedad del
 * levantamiento.
 */

/** Umbral para DECLARAR que hay movimiento, en m/s. */
const V_ENTER = 0.06;
/** Por debajo de esto se considera parado… pero hay que mantenerlo. */
const V_EXIT = 0.02;
/**
 * Cuánto hay que estar por debajo de `V_EXIT` para EMPEZAR a considerar que la
 * fase ha terminado. No basta por sí solo: ver `RESUME_WINDOW_S`.
 */
const REST_DWELL_S = 0.12;

/**
 * Ventana en la que se mira si el movimiento SE REANUDA en el mismo sentido.
 *
 * Aquí está la diferencia entre un punto de estancamiento y el final de una
 * repetición, y no se puede decidir por cuánto dura la parada. Se comprobó
 * midiendo: con un estancamiento de verdad —la barra clavada a media subida— a
 * 30 fps la parada dura cuatro o cinco fotogramas, exactamente lo mismo que el
 * final de una repetición. Cualquier umbral de tiempo acierta a 60 fps y falla a
 * 30, que es la cadencia de casi todos los móviles.
 *
 * Lo que SÍ los distingue es lo que pasa después: tras un estancamiento la barra
 * VUELVE A SUBIR; al final de la repetición se queda quieta o baja. Así que al
 * llegar a una parada se mira hacia delante: si el movimiento se reanuda en el
 * mismo sentido antes de invertirse, la fase continúa. Es la definición física y
 * no depende de la cadencia del vídeo.
 */
const RESUME_WINDOW_S = 0.6;

/**
 * Cuánto tiene que avanzar la barra para que cuente como "se ha reanudado" —o
 * como "se ha invertido"—, en metros.
 *
 * Tres centímetros: por encima del ruido de seguimiento de cualquier vídeo, y
 * muy por debajo de lo que le queda por subir a una barra que se ha quedado
 * clavada a media repetición.
 */
const MIN_RESUME_M = 0.03;
/** Una fase más corta que esto es un temblor del seguimiento, no un movimiento. */
const MIN_PHASE_S = 0.15;

/**
 * Fracción del pico por encima de la cual se considera que la barra se mueve, a
 * efectos de medir la velocidad media. Sale de un barrido: ver `movementBounds`.
 */
const MOVEMENT_THRESHOLD_FRAC = 0.08;

/** Recorrido mínimo para que un tramo cuente como repetición, en metros. */
export const DEFAULT_MIN_ROM_M = 0.15;

/**
 * Aceleración por debajo de la cual la fase deja de ser propulsiva, en m/s².
 *
 * Es −g, y no es un umbral elegido: es la definición de Sánchez-Medina y
 * González-Badillo (2010). Mientras la barra decelera MENOS que en caída libre,
 * el atleta sigue empujándola; en el instante en que decelera exactamente como
 * caería sola, ha dejado de aplicar fuerza neta hacia arriba.
 *
 * Que la definición sea física y no arbitraria es justo lo que hace que la
 * velocidad propulsiva se pueda comparar entre atletas y entre aplicaciones.
 */
const PROPULSIVE_ACC_THRESHOLD = -9.81;

/**
 * A qué profundidad del valle se ponen los bordes de la zona de estancamiento.
 *
 * El mínimo de velocidad es un punto; la ZONA hay que definirla, y cualquier
 * definición es una elección. Se toma la anchura a media profundidad entre el
 * fondo del valle y el MENOR de los dos picos que lo rodean — que es como se
 * mide la anchura de cualquier característica en procesamiento de señal (la
 * FWHM de toda la vida).
 *
 * Por qué el menor de los dos picos y no la media: el segundo pico de una
 * repetición pesada suele ser mucho más bajo que el primero, y promediarlos
 * pondría el umbral por encima de él — la zona se extendería hasta el final del
 * recorrido y dejaría de significar «dónde se atascó».
 *
 * Se interpola el cruce en vez de saltar de muestra en muestra: a 30 Hz un
 * fotograma son 33 ms sobre una zona que dura 200, o sea un 16% de error en la
 * duración solo por redondear al fotograma.
 */
const STICKING_DEPTH_FRAC = 0.5;

/**
 * La zona de estancamiento, no solo su punto más bajo.
 *
 * Todas las alturas están en el mismo marco que `startHeight` / `endHeight` de
 * la fase: metros, creciendo hacia arriba, con el origen donde lo dejó la
 * calibración. Los porcentajes de ROM sí son absolutos y comparables entre
 * repeticiones y entre atletas: 0% es el punto más bajo del recorrido y 100% el
 * más alto.
 */
export interface StickingZone {
    /** ms — la velocidad cae por debajo del umbral de media profundidad. */
    startTime: number;
    /** ms — la velocidad se recupera por encima del umbral. */
    endTime: number;
    /** ms — el fondo del valle. */
    minTime: number;
    /** segundos que dura la zona. */
    durationS: number;
    /** m/s en el fondo del valle. */
    minVelocity: number;
    /** m — altura del fondo del valle. */
    minHeight: number;
    /** m — cuánto había subido la barra al llegar al fondo del valle. */
    distanceFromStartM: number;
    /** % del ROM donde cae el fondo del valle. */
    romPercent: number;
    /** % del ROM donde empieza la zona. */
    startRomPercent: number;
    /** % del ROM donde acaba la zona. */
    endRomPercent: number;
}

export interface PhaseMetrics {
    type: 'eccentric' | 'concentric';
    /**
     * Número de repetición, empezando en 1, dentro de su tipo y en orden
     * cronológico. Es lo que permite decir «la tercera fue la peor» en vez de
     * «una de ellas fue la peor».
     */
    index: number;
    startTime: number;
    endTime: number;
    startHeight: number;
    endHeight: number;
    /** metros */
    rom: number;
    meanVelocity: number;
    peakVelocity: number;
    /**
     * Velocidad media de la parte PROPULSIVA, en m/s.
     *
     * Es la media hasta que la barra empieza a decelerar más rápido de lo que
     * caería sola (ver `PROPULSIVE_ACC_THRESHOLD`). En cargas altas coincide
     * casi con la velocidad media —la fase propulsiva ocupa todo el recorrido—;
     * en cargas ligeras la supera bastante, porque la media se hunde con el
     * frenado final que el atleta no controla.
     *
     * `null` cuando la aceleración de esta fase no es utilizable: sin ella no se
     * puede saber dónde acaba lo propulsivo, y devolver la media disfrazada de
     * propulsiva sería inventarse una métrica.
     */
    propulsiveVelocity: number | null;
    /** Fracción del recorrido que ha sido propulsiva, 0–1. `null` si no se sabe. */
    propulsiveRatio: number | null;
    /** m/s² — la mayor aceleración hacia el sentido del movimiento. */
    peakAcceleration: number;
    /** segundos desde el inicio del movimiento hasta la velocidad máxima. */
    timeToPeakVelocityS: number;
    /**
     * Velocidad en el punto de estancamiento, o `null` si no hay ninguno.
     *
     * `null` NO es un fallo: significa que la curva de velocidad tiene un solo
     * máximo, o sea que el levantamiento subió de un tirón. La versión anterior
     * devolvía en ese caso la velocidad MÁXIMA como si fuese el punto malo, que
     * es exactamente lo contrario de lo que significa.
     *
     * Se conserva junto a `sticking` porque es lo que ya guardan las mediciones
     * antiguas y lo que lee el catálogo de métricas: quitarlo obligaría a migrar
     * datos para no ganar nada.
     */
    minVelocity: number | null;
    /** Altura del punto de estancamiento, en metros. `null` si no lo hay. */
    stickingHeight: number | null;
    /** La zona completa de estancamiento. `null` si la barra subió de un tirón. */
    sticking: StickingZone | null;
    /** segundos */
    duration: number;
    horizontalDeviationCm: number;
    dataPoints: KinematicPoint[];
}

// =====================================================================
// SEGMENTACIÓN
// =====================================================================

interface Span {
    from: number;
    to: number;
    dir: 1 | -1;
}

/**
 * ¿Se reanuda el movimiento en el mismo sentido tras esta parada?
 *
 * Devuelve el índice donde se reanuda, o `-1` si dentro de la ventana la barra
 * se invierte o simplemente no vuelve a moverse.
 *
 * SE MIRA EL DESPLAZAMIENTO, NO LA VELOCIDAD. La primera versión de esto
 * preguntaba si la velocidad volvía a superar el umbral, y se equivocaba en la
 * dirección contraria: con la barra ya arriba y quieta, un solo fotograma de
 * ruido basta para superar 0,06 m/s —a 60 Hz, un píxel de ruido son 0,09 m/s de
 * velocidad instantánea— y la concéntrica se tragaba el medio segundo de
 * después. Un desplazamiento de tres centímetros no lo produce el ruido: hace
 * falta que la barra se mueva de verdad.
 */
function findResume(samples: KinematicPoint[], from: number, dir: 1 | -1, ratio: number): number {
    const deadline = samples[from].time + RESUME_WINDOW_S * 1000;
    const y0 = samples[from].y;

    for (let k = from + 1; k < samples.length && samples[k].time <= deadline; k++) {
        // Avance en el sentido de la fase, en metros. En el lienzo la Y crece
        // hacia abajo, así que subir es que la Y disminuya.
        const advanced = (y0 - samples[k].y) * dir * ratio;
        // Se ha invertido de verdad: la fase terminó en la parada.
        if (advanced <= -MIN_RESUME_M) return -1;
        // Ha seguido avanzando: era un estancamiento.
        if (advanced >= MIN_RESUME_M) return k;
    }
    return -1;
}

/**
 * Dónde empieza y dónde acaba el MOVIMIENTO dentro de una fase, interpolando.
 *
 * POR QUÉ NO BASTA CON RECORTAR MUESTRAS
 *
 * La velocidad media es desplazamiento entre tiempo, y las dos cosas dependen de
 * dónde se diga que empieza la fase. Ahí hay tres formas de equivocarse, y se
 * midieron las tres:
 *
 *   · promediar las muestras de la fase          →  −9% (los extremos que el
 *     filtro emborrona pesan en el divisor sin aportar al numerador)
 *   · recorrido entero partido por la duración
 *     de la fase                                 →  −7%  (misma causa)
 *   · recortar hasta la primera muestra que
 *     supera un umbral                           →  +6%  (el recorte salta de
 *     muestra en muestra: a 30 Hz, un fotograma de más son 33 ms sobre 1000)
 *
 * El tercero es el que había aquí, y su error depende de la FORMA del
 * levantamiento —salía +6% con un arranque suave y −0,4% con uno seco—, así que
 * no se puede corregir con una constante.
 *
 * La solución es no saltar de muestra en muestra: se interpola el instante EXACTO
 * en que la velocidad cruza el umbral, y la altura en ese instante.
 *
 *
 * DE DÓNDE SALE EL 8%
 *
 * De medirlo, no de elegirlo. Se barrió el umbral entre el 2% y el 15% del pico
 * sobre tres formas de levantamiento (arranque suave, con estancamiento y
 * arranque seco) × seis combinaciones de cadencia y ruido × tres semillas:
 *
 *     umbral    sesgo medio    |error| medio
 *      2%         −6,0%           6,1%
 *      5%         −3,1%           3,8%
 *      8%         −0,3%           3,6%      ← elegido
 *     10%         +1,2%           3,6%
 *     15%         +4,4%           4,7%
 *
 * Por debajo del 8% la cola que el filtro emborrona entra en la fase y alarga la
 * duración sin aportar recorrido; por encima, se recorta movimiento real. El
 * 3,6% de error que queda depende de la forma del levantamiento y ya no se
 * arregla moviendo un umbral: haría falta extrapolar el arranque. Para
 * referencia, el método anterior tenía un sesgo del −24%.
 *
 * Se probó también un suelo absoluto en m/s por si el ruido cruzaba el umbral
 * antes de tiempo. No cambia nada —el umbral relativo ya queda por encima del
 * ruido en todos los casos medidos— así que no se pone: una constante que no
 * hace nada es una constante que alguien tendrá que entender algún día.
 */
interface MovementBounds {
    durationS: number;
    displacementPx: number;
    /** Instante y altura interpolados donde arranca el movimiento. */
    start: { time: number; y: number };
    /** Instante y altura interpolados donde termina. */
    end: { time: number; y: number };
    /** Primera y última MUESTRA por encima del umbral, para buscar a partir de ahí. */
    firstIndex: number;
    lastIndex: number;
}

function movementBounds(
    points: KinematicPoint[],
    signed: number[],
    peakVelocity: number
): MovementBounds | null {
    const threshold = peakVelocity * MOVEMENT_THRESHOLD_FRAC;

    let first = -1;
    let last = -1;
    for (let k = 0; k < signed.length; k++) {
        if (signed[k] >= threshold) { if (first < 0) first = k; last = k; }
    }
    if (first < 0 || last <= first) return null;

    /** Instante y altura donde el segmento `a`→`b` cruza el umbral. */
    const crossing = (a: number, b: number) => {
        const va = signed[a];
        const vb = signed[b];
        const span = vb - va;
        // Sin pendiente no hay cruce que interpolar: se usa el extremo.
        const f = Math.abs(span) < 1e-9 ? 0 : (threshold - va) / span;
        const t = Math.min(1, Math.max(0, f));
        return {
            time: points[a].time + (points[b].time - points[a].time) * t,
            y: points[a].y + (points[b].y - points[a].y) * t,
        };
    };

    const start = first > 0 ? crossing(first - 1, first) : { time: points[first].time, y: points[first].y };
    const end = last < signed.length - 1 ? crossing(last + 1, last) : { time: points[last].time, y: points[last].y };

    const durationS = (end.time - start.time) / 1000;
    if (!(durationS > 0)) return null;

    return {
        durationS,
        displacementPx: Math.abs(start.y - end.y),
        start,
        end,
        firstIndex: first,
        lastIndex: last,
    };
}

/**
 * Dónde deja de ser propulsiva la fase.
 *
 * Se busca el primer instante DESPUÉS del pico de velocidad en que la
 * aceleración cae por debajo de −g, y se interpola el cruce. Antes del pico no
 * se mira: al arrancar desde parado la aceleración pasa por valores raros
 * mientras el filtro reparte el arranque, y un cruce ahí no significa que el
 * atleta haya dejado de empujar.
 *
 * Devuelve `null` cuando no hay cruce, que es un resultado legítimo y frecuente:
 * con la barra pesada el atleta empuja hasta el final y **toda** la concéntrica
 * es propulsiva. Quien llame decide que entonces lo propulsivo es todo.
 */
function findPropulsiveEnd(
    points: KinematicPoint[],
    signedAcc: number[],
    fromIndex: number,
    toIndex: number
): { time: number; y: number } | null {
    for (let k = Math.max(1, fromIndex); k <= toIndex; k++) {
        const previous = signedAcc[k - 1];
        const current = signedAcc[k];
        if (!(previous >= PROPULSIVE_ACC_THRESHOLD && current < PROPULSIVE_ACC_THRESHOLD)) continue;

        const span = current - previous;
        const f = Math.abs(span) < 1e-9 ? 0 : (PROPULSIVE_ACC_THRESHOLD - previous) / span;
        const t = Math.min(1, Math.max(0, f));

        return {
            time: points[k - 1].time + (points[k].time - points[k - 1].time) * t,
            y: points[k - 1].y + (points[k].y - points[k - 1].y) * t,
        };
    }
    return null;
}

/**
 * Trocea la serie en tramos de subida y de bajada.
 *
 * Devuelve índices y no copias porque los extremos se afinan después y copiar
 * dos veces el mismo tramo para tirar la primera copia no aporta nada.
 */
function findSpans(samples: KinematicPoint[], ratio: number): Span[] {
    const spans: Span[] = [];
    const n = samples.length;
    let i = 0;

    while (i < n) {
        const v = samples[i].velocity;
        const dir: 1 | -1 | 0 = v > V_ENTER ? 1 : v < -V_ENTER ? -1 : 0;
        if (dir === 0) { i++; continue; }

        // Hacia atrás hasta donde el movimiento ya iba en este sentido. El
        // levantamiento empieza cuando la barra arranca, no cuando cruza el
        // umbral con el que nos hemos decidido a mirarla.
        let from = i;
        while (from > 0 && samples[from - 1].velocity * dir > V_EXIT) from--;

        // Hacia delante hasta que se invierta o se pare de verdad.
        let to = i;
        let restFrom = -1;
        let j = i;

        while (j < n) {
            const projected = samples[j].velocity * dir;

            // Se ha invertido: la fase contraria ya ha empezado.
            if (projected < -V_ENTER) break;

            if (projected < V_EXIT) {
                // Candidato a parada. NO se cierra todavía: puede ser un
                // estancamiento. Se decide mirando si el movimiento se reanuda.
                if (restFrom < 0) restFrom = j;
                const dwellS = (samples[j].time - samples[restFrom].time) / 1000;
                if (dwellS >= REST_DWELL_S) {
                    const resumesAt = findResume(samples, j, dir, ratio);
                    if (resumesAt < 0) break;
                    // Era un estancamiento: la barra vuelve a moverse en el
                    // mismo sentido sin haberse invertido. La fase sigue.
                    restFrom = -1;
                    to = resumesAt;
                    j = resumesAt;
                }
            } else {
                restFrom = -1;
                to = j;
            }
            j++;
        }

        // Si se cerró por parada, el tramo llega hasta donde empezó la parada:
        // esas muestras son la deceleración final y forman parte del recorrido.
        const end = restFrom >= 0 ? Math.min(restFrom, n - 1) : to;

        if (end > from) spans.push({ from, to: end, dir });

        // Continuar DESPUÉS del tramo. `Math.max` evita el bucle infinito si el
        // tramo no ha avanzado.
        i = Math.max(i + 1, end + 1);
    }

    return spans;
}

/**
 * Mueve los extremos del tramo al punto más bajo y al más alto.
 *
 * En el lienzo la Y crece hacia abajo, así que "más alto" es la Y mínima.
 */
function refineByHeight(samples: KinematicPoint[], span: Span): Span {
    let lowest = span.from;   // Y máxima
    let highest = span.from;  // Y mínima
    for (let k = span.from; k <= span.to; k++) {
        if (samples[k].y > samples[lowest].y) lowest = k;
        if (samples[k].y < samples[highest].y) highest = k;
    }
    const from = span.dir === 1 ? lowest : highest;
    const to = span.dir === 1 ? highest : lowest;
    return from < to ? { from, to, dir: span.dir } : span;
}

/**
 * El punto de estancamiento: el valle entre dos picos de velocidad.
 *
 * Se busca así y no como "el mínimo después del pico" porque la velocidad
 * SIEMPRE decae a cero al final de la subida: cualquier búsqueda que llegue
 * hasta el final devuelve el último punto, que no es un estancamiento sino el
 * final del recorrido.
 *
 * Con menos de dos máximos locales relevantes no hay valle, y entonces no hay
 * sticking point que reportar. Que sea `null` es información: la barra subió
 * sin pararse.
 */
function findStickingZone(
    points: KinematicPoint[],
    ratio: number,
    bottomY: number,
    rom: number
): { zone: StickingZone; index: number } | null {
    if (points.length < 7) return null;

    const peak = Math.max(...points.map(p => p.velocity));
    if (peak <= 0) return null;
    const relevant = peak * 0.4;

    const maxima: number[] = [];
    for (let k = 1; k < points.length - 1; k++) {
        const v = points[k].velocity;
        if (v >= relevant && v >= points[k - 1].velocity && v > points[k + 1].velocity) maxima.push(k);
    }

    if (maxima.length < 2) return null;

    const first = maxima[0];
    const last = maxima[maxima.length - 1];
    if (last - first < 2) return null;

    let valley = first;
    for (let k = first; k <= last; k++) {
        if (points[k].velocity < points[valley].velocity) valley = k;
    }

    const minVelocity = points[valley].velocity;
    const flanking = Math.min(points[first].velocity, points[last].velocity);

    // Un valle que apenas baja respecto de los picos que lo rodean es ondulación
    // del filtro, no un estancamiento.
    if (minVelocity > flanking * 0.85) return null;

    // ---------------------------------------------------------------
    // Los bordes de la zona, a media profundidad y con el cruce interpolado
    // ---------------------------------------------------------------
    const threshold = minVelocity + (flanking - minVelocity) * STICKING_DEPTH_FRAC;

    /** Instante y altura donde el segmento `a`→`b` cruza el umbral. */
    const crossing = (a: number, b: number) => {
        const va = points[a].velocity;
        const vb = points[b].velocity;
        const span = vb - va;
        const f = Math.abs(span) < 1e-9 ? 0 : (threshold - va) / span;
        const t = Math.min(1, Math.max(0, f));
        return {
            time: points[a].time + (points[b].time - points[a].time) * t,
            y: points[a].y + (points[b].y - points[a].y) * t,
        };
    };

    // Hacia atrás desde el fondo: la última muestra que aún estaba por encima.
    let backIndex = valley;
    while (backIndex > first && points[backIndex - 1].velocity < threshold) backIndex--;
    const start = backIndex > 0 ? crossing(backIndex - 1, backIndex) : { time: points[0].time, y: points[0].y };

    // Hacia delante: la primera que vuelve a superarlo.
    let forwardIndex = valley;
    while (forwardIndex < last && points[forwardIndex + 1].velocity < threshold) forwardIndex++;
    const endPoint = points[points.length - 1];
    const end = forwardIndex < points.length - 1
        ? crossing(forwardIndex + 1, forwardIndex)
        : { time: endPoint.time, y: endPoint.y };

    // ---------------------------------------------------------------
    // A metros y a porcentaje de recorrido
    // ---------------------------------------------------------------
    const advanced = (y: number) => (bottomY - y) * ratio;
    const asRomPercent = (y: number) =>
        rom > 0 ? Math.min(100, Math.max(0, (advanced(y) / rom) * 100)) : 0;

    const durationS = Math.max(0, (end.time - start.time) / 1000);

    return {
        index: valley,
        zone: {
            startTime: start.time,
            endTime: end.time,
            minTime: points[valley].time,
            durationS,
            minVelocity: Math.abs(minVelocity),
            minHeight: -points[valley].y * ratio,
            distanceFromStartM: Math.max(0, advanced(points[valley].y)),
            romPercent: asRomPercent(points[valley].y),
            startRomPercent: asRomPercent(start.y),
            endRomPercent: asRomPercent(end.y),
        },
    };
}

/**
 * Filtra y segmenta la serie de velocidades en repeticiones limpias.
 *
 * `pixelToMeterRatio` son metros por píxel.
 */
export const extractLiftingPhases = (
    samples: KinematicPoint[],
    pixelToMeterRatio: number,
    minRomThreshold = DEFAULT_MIN_ROM_M
): { eccentrics: PhaseMetrics[]; concentrics: PhaseMetrics[] } => {
    const eccentrics: PhaseMetrics[] = [];
    const concentrics: PhaseMetrics[] = [];

    if (samples.length < 3 || !(pixelToMeterRatio > 0)) return { eccentrics, concentrics };

    for (const coarse of findSpans(samples, pixelToMeterRatio)) {
        const span = refineByHeight(samples, coarse);
        const points = samples.slice(span.from, span.to + 1);
        if (points.length < 3) continue;

        const first = points[0];
        const last = points[points.length - 1];
        const durationS = (last.time - first.time) / 1000;
        if (durationS < MIN_PHASE_S) continue;

        const startHeight = -first.y * pixelToMeterRatio;
        const endHeight = -last.y * pixelToMeterRatio;

        // El recorrido es la distancia entre el punto más bajo y el más alto del
        // tramo, no entre el primero y el último: con un ligero rebote al final
        // los dos coinciden, y sin él esto sigue siendo correcto.
        let minY = points[0].y;
        let maxY = points[0].y;
        for (const p of points) {
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        const rom = (maxY - minY) * pixelToMeterRatio;
        if (rom < minRomThreshold) continue;

        const velocities = points.map(p => p.velocity);
        const signed = span.dir === 1 ? velocities : velocities.map(v => -v);
        const peakVelocity = Math.max(...signed);

        /**
         * LA VELOCIDAD MEDIA ES DESPLAZAMIENTO ENTRE TIEMPO, NO LA MEDIA DE LAS
         * MUESTRAS.
         *
         * Promediar las muestras parece lo mismo y no lo es, porque los
         * extremos de la fase están emborronados: el ajuste local de
         * `signal.ts` reparte el arranque del movimiento sobre media ventana
         * hacia cada lado, así que la fase se lleva dos o tres muestras de más
         * con velocidad casi cero. Cada una de esas muestras no añade nada a la
         * suma pero sí una unidad al divisor, y con 30 muestras eso hundía la
         * media un 9%. Nueve por ciento de velocidad son SIETE PUNTOS de %1RM
         * estimado: no es un detalle.
         *
         * Se mide entre las muestras donde el movimiento existe de verdad
         * —velocidad por encima del 5% del pico de la fase— y se toma el
         * desplazamiento real entre ellas partido por el tiempo real entre
         * ellas. Eso es la definición física, y no depende de dónde el filtro
         * decidió que empezaba la fase.
         */
        const bounds = movementBounds(points, signed, peakVelocity);
        const movingS = bounds ? bounds.durationS : 0;
        const meanVelocity = bounds
            ? (bounds.displacementPx * pixelToMeterRatio) / bounds.durationS
            // Sin un intervalo que medir se cae a la media de las muestras, que
            // es lo que había antes.
            : signed.reduce((a, b) => a + b, 0) / signed.length;

        const xs = points.map(p => p.x);
        const horizontalDeviationCm = (Math.max(...xs) - Math.min(...xs)) * pixelToMeterRatio * 100;

        const sticking = span.dir === 1
            ? findStickingZone(points, pixelToMeterRatio, maxY, rom)
            : null;

        // ---------------------------------------------------------------
        // Aceleración pico y tiempo hasta la velocidad máxima
        // ---------------------------------------------------------------
        // Ambas proyectadas al sentido de la fase, para que «pico» signifique
        // lo mismo subiendo que bajando.
        //
        // El PICO se lee del ajuste estrecho y el cruce propulsivo del ancho:
        // son dos preguntas distintas y se midió cuál va mejor con cuál. Ver
        // `accelerationSharp` en signal.ts.
        const signedAcc = points.map(p => p.acceleration * span.dir);
        const signedAccSharp = points.map(p => p.accelerationSharp * span.dir);
        const peakAcceleration = Math.max(...signedAccSharp);

        let peakIndex = 0;
        for (let k = 1; k < signed.length; k++) if (signed[k] > signed[peakIndex]) peakIndex = k;

        // Se mide desde el ARRANQUE DEL MOVIMIENTO, no desde la primera muestra
        // de la fase: esas primeras muestras son la cola que el filtro emborrona
        // y contarlas alargaría el tiempo hasta el pico sin que el atleta haya
        // hecho nada todavía.
        const movementStartMs = bounds ? bounds.start.time : first.time;
        const timeToPeakVelocityS = Math.max(0, (points[peakIndex].time - movementStartMs) / 1000);

        // ---------------------------------------------------------------
        // Fase propulsiva
        // ---------------------------------------------------------------
        // Solo tiene sentido en la concéntrica: en la excéntrica el atleta está
        // frenando la barra durante todo el recorrido, así que «hasta dónde
        // empuja» no describe nada.
        let propulsiveVelocity: number | null = null;
        let propulsiveRatio: number | null = null;

        if (span.dir === 1 && bounds) {
            // Se busca hasta el FINAL de la fase, no hasta el final del
            // movimiento «con velocidad apreciable». El cruce por −g es un
            // suceso físico que ocurre justo en la deceleración final, que es
            // precisamente el tramo que el umbral del 8% deja fuera: acotar la
            // búsqueda ahí hacía que no se encontrara NUNCA, y toda repetición
            // salía «100% propulsiva» —que es exactamente el número que uno
            // esperaría ver si la métrica estuviera bien, y por eso no cantaba—.
            const propEnd = findPropulsiveEnd(points, signedAcc, peakIndex, points.length - 1);

            if (!propEnd) {
                // Nunca decelera más de lo que caería sola: el atleta ha
                // empujado hasta el final y toda la subida es propulsiva. Es lo
                // normal cerca del máximo.
                propulsiveVelocity = Math.abs(meanVelocity);
                propulsiveRatio = 1;
            } else {
                const durationPropS = (propEnd.time - bounds.start.time) / 1000;
                const displacementPropPx = Math.abs(bounds.start.y - propEnd.y);
                if (durationPropS > 0 && bounds.displacementPx > 0) {
                    propulsiveVelocity = (displacementPropPx * pixelToMeterRatio) / durationPropS;
                    propulsiveRatio = Math.min(1, displacementPropPx / bounds.displacementPx);
                }
            }
        }

        const phase: PhaseMetrics = {
            type: span.dir === 1 ? 'concentric' : 'eccentric',
            // Se numera al insertar, más abajo: aquí todavía no se sabe si este
            // tramo va a sobrevivir a los filtros de recorrido y duración.
            index: 0,
            startTime: first.time,
            endTime: last.time,
            // La duración que se enseña es la del MOVIMIENTO, por el mismo
            // motivo que la media: incluir el emborronado de los extremos
            // alargaba una concéntrica de 1,00 s hasta 1,07 s.
            duration: movingS > 0 ? movingS : durationS,
            startHeight,
            endHeight,
            rom,
            meanVelocity: Math.abs(meanVelocity),
            peakVelocity: Math.abs(peakVelocity),
            propulsiveVelocity,
            propulsiveRatio,
            peakAcceleration,
            timeToPeakVelocityS,
            minVelocity: sticking ? sticking.zone.minVelocity : null,
            stickingHeight: sticking ? sticking.zone.minHeight : null,
            sticking: sticking ? sticking.zone : null,
            horizontalDeviationCm,
            dataPoints: points,
        };

        if (span.dir === 1) concentrics.push(phase);
        else eccentrics.push(phase);
    }

    // Numerar en orden cronológico y dentro de cada tipo. `findSpans` ya
    // devuelve los tramos en orden, así que la posición en el array ES el orden
    // en que ocurrieron.
    concentrics.forEach((phase, i) => { phase.index = i + 1; });
    eccentrics.forEach((phase, i) => { phase.index = i + 1; });

    return { eccentrics, concentrics };
};

// =====================================================================
// LA SERIE
// =====================================================================

export interface SeriesMetrics {
    repCount: number;
    /** metros */
    meanRom: number;
    /** m/s — media de las velocidades medias de cada repetición. */
    meanVelocity: number;
    /** m/s — media de las velocidades propulsivas. `null` si no se pudo en ninguna. */
    meanPropulsiveVelocity: number | null;
    /** Índice (1-based) de la mejor y la peor repetición POR VELOCIDAD MEDIA. */
    bestRepIndex: number;
    worstRepIndex: number;
    bestRepVelocity: number;
    worstRepVelocity: number;
    /** % de pérdida de velocidad. Ver la nota sobre las dos fórmulas. */
    velocityLoss: number;
    /**
     * Coeficiente de variación de las velocidades medias, en %.
     *
     * Es la medida estándar de consistencia y tiene la propiedad que hace falta:
     * es adimensional, así que una serie a 0,80 m/s y otra a 0,30 m/s se pueden
     * comparar. Una desviación típica en m/s no se puede.
     *
     * `null` con una sola repetición: la consistencia de un único dato no existe.
     */
    consistencyCv: number | null;
    /** W — media de las potencias medias por repetición. `null` sin carga. */
    meanPower: number | null;
    /** W — la mayor potencia de pico de toda la serie. `null` sin carga. */
    peakPower: number | null;
    /**
     * segundos — del arranque de la PRIMERA fase al final de la ÚLTIMA.
     *
     * Incluye las pausas entre repeticiones, que es lo correcto: con la barra en
     * la espalda, el bloqueo entre repeticiones sigue estando bajo carga.
     *
     * Se mide entre movimientos y NO desde el recorte del vídeo, que es una
     * elección del usuario y no una propiedad de la serie.
     */
    timeUnderTensionS: number;
    /** segundos — suma de las duraciones de las fases, sin las pausas. */
    activeTimeS: number;
}

/**
 * Resume la serie entera a partir de sus repeticiones.
 *
 * `massKg` es opcional: sin carga no se puede hablar de potencia, y devolver
 * ceros sería peor que devolver `null` —un cero se pinta como un dato y un
 * `null` se pinta como un hueco—.
 *
 *
 * SOBRE LA PÉRDIDA DE VELOCIDAD, QUE SE CALCULA DE DOS FORMAS EN ESTA APLICACIÓN
 *
 * Aquí es **primera contra última**. En `src/lib/vbt/analysis.ts` es **mejor
 * contra última**. Las dos escriben la misma clave `velocity_loss` del catálogo.
 *
 * **Es deliberado, decidido el 18 de agosto de 2026, y no hay que "arreglarlo".**
 * Se dejan las dos porque miden cosas distintas y las dos se usan: la de aquí
 * describe cómo se degradó ESTA serie desde que empezó; la de VBT compara contra
 * lo mejor que dio el atleta ese día, aunque tardara dos repeticiones en
 * llegar. Ver `docs/AUDITORIA_PWR_2.0.md` §11.
 *
 * Lo que sí importa: no mezclar las dos en la misma gráfica sin decir cuál es
 * cuál, porque sobre la misma serie dan números distintos.
 */
export function summariseSeries(concentrics: PhaseMetrics[], massKg?: number): SeriesMetrics | null {
    if (concentrics.length === 0) return null;

    const velocities = concentrics.map(c => c.meanVelocity);
    const n = velocities.length;

    let bestIdx = 0;
    let worstIdx = 0;
    for (let i = 1; i < n; i++) {
        if (velocities[i] > velocities[bestIdx]) bestIdx = i;
        if (velocities[i] < velocities[worstIdx]) worstIdx = i;
    }

    const meanVelocity = velocities.reduce((a, b) => a + b, 0) / n;
    const meanRom = concentrics.reduce((a, c) => a + c.rom, 0) / n;

    const propulsive = concentrics
        .map(c => c.propulsiveVelocity)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    // La pérdida solo significa algo con más de una repetición y con una primera
    // que se moviera de verdad: dividir por una velocidad de casi cero daba
    // porcentajes de miles.
    let velocityLoss = 0;
    if (n > 1 && velocities[0] > 0.05) {
        velocityLoss = ((velocities[0] - velocities[n - 1]) / velocities[0]) * 100;
    }

    let consistencyCv: number | null = null;
    if (n > 1 && meanVelocity > 0) {
        // Desviación típica MUESTRAL (n−1): estas repeticiones son una muestra
        // de lo que el atleta puede hacer, no la población entera.
        const variance = velocities.reduce((a, v) => a + (v - meanVelocity) ** 2, 0) / (n - 1);
        consistencyCv = (Math.sqrt(variance) / meanVelocity) * 100;
    }

    let meanPower: number | null = null;
    let peakPower: number | null = null;
    if (massKg && massKg > 0) {
        const perRep = concentrics.map(c => calculateDynamics(c.dataPoints, massKg));
        meanPower = perRep.reduce((a, d) => a + d.meanPower, 0) / perRep.length;
        peakPower = Math.max(...perRep.map(d => d.peakPower));
    }

    const startedAt = Math.min(...concentrics.map(c => c.startTime));
    const endedAt = Math.max(...concentrics.map(c => c.endTime));

    return {
        repCount: n,
        meanRom,
        meanVelocity,
        meanPropulsiveVelocity: propulsive.length
            ? propulsive.reduce((a, b) => a + b, 0) / propulsive.length
            : null,
        bestRepIndex: concentrics[bestIdx].index,
        worstRepIndex: concentrics[worstIdx].index,
        bestRepVelocity: velocities[bestIdx],
        worstRepVelocity: velocities[worstIdx],
        velocityLoss,
        consistencyCv,
        meanPower,
        peakPower,
        timeUnderTensionS: Math.max(0, (endedAt - startedAt) / 1000),
        activeTimeS: concentrics.reduce((a, c) => a + c.duration, 0),
    };
}

// =====================================================================
// DINÁMICA
// =====================================================================

export interface Dynamics {
    meanForce: number;
    peakForce: number;
    meanPower: number;
    peakPower: number;
    rfd: number;
}

/**
 * Fuerza y potencia SOBRE LA BARRA.
 *
 * Conviene tener claro qué es esto y qué no, porque la tarjeta se llamaba
 * "Fuerza Suelo" y no lo era: F = m·(g + a) con m la carga de la barra da la
 * fuerza que hay que aplicar A LA BARRA. La fuerza contra el suelo en una
 * sentadilla incluye además el peso del atleta y la aceleración de su centro de
 * masas, que un vídeo de la barra no puede ver. Llamarlo fuerza del suelo hacía
 * que el número pareciera comparable con una plataforma de fuerzas, y no lo es.
 *
 * La aceleración viene ya calculada del ajuste local de `signal.ts` en vez de
 * derivarse otra vez aquí a partir de la velocidad. Derivar dos veces una señal
 * que ya venía filtrada amplificaba el ruido justo en la magnitud que más lo
 * nota: la fuerza entra al cuadrado en la potencia.
 */
export const calculateDynamics = (points: KinematicPoint[], massKg: number): Dynamics => {
    const g = 9.81;
    const empty: Dynamics = { meanForce: 0, peakForce: 0, meanPower: 0, peakPower: 0, rfd: 0 };
    if (points.length === 0 || !(massKg > 0)) return empty;

    const forces: { time: number; force: number }[] = [];
    let maxForce = 0;
    let maxPower = 0;
    let forceSum = 0;
    let powerSum = 0;

    for (const p of points) {
        const force = massKg * (g + p.acceleration);
        // Una fuerza negativa significaría que la barra cae más rápido que en
        // caída libre. En un levantamiento no pasa: es ruido de la segunda
        // derivada, y dejarlo entrar hundiría la media.
        if (!Number.isFinite(force) || force < 0) continue;

        const power = Math.max(0, force * p.velocity);
        forces.push({ time: p.time, force });

        if (force > maxForce) maxForce = force;
        if (power > maxPower) maxPower = power;
        forceSum += force;
        powerSum += power;
    }

    if (forces.length === 0) return empty;

    // RFD: la mayor pendiente de la fuerza sostenida durante ~100 ms, que es la
    // ventana con la que se define en la literatura. Se recorre con dos índices
    // en lugar del doble bucle anterior, que era cuadrático y además sólo
    // llegaba a evaluar una ventana por punto de partida.
    let rfd = 0;
    let j = 0;
    for (let i = 0; i < forces.length; i++) {
        if (j < i) j = i;
        while (j + 1 < forces.length && (forces[j + 1].time - forces[i].time) / 1000 <= 0.12) j++;
        const dt = (forces[j].time - forces[i].time) / 1000;
        if (dt >= 0.06) {
            const slope = (forces[j].force - forces[i].force) / dt;
            if (slope > rfd) rfd = slope;
        }
    }

    return {
        meanForce: forceSum / forces.length,
        peakForce: maxForce,
        meanPower: powerSum / forces.length,
        peakPower: maxPower,
        rfd,
    };
};

// =====================================================================
// 1RM
// =====================================================================

/** De dónde ha salido la estimación. Se enseña: cambia cuánto vale. */
export type OneRmSource = 'athlete' | 'generic';

export interface OneRmEstimate {
    percent: number;
    rm: number;
    /**
     * `false` cuando la velocidad medida cae fuera del tramo donde la relación
     * carga-velocidad es lineal y la extrapolación deja de significar nada.
     */
    reliable: boolean;
    /** `'athlete'` si se ha usado su propia recta; `'generic'` si la de todos. */
    source: OneRmSource;
    /** Por qué no se ha podido usar la del atleta, cuando no se ha podido. */
    fallbackReason?: string;
    /** MVT con el que se ha extrapolado. Sin él la cifra no se puede leer. */
    mvt: number;
}

/**
 * La recta carga-velocidad DEL ATLETA, ya ajustada.
 *
 * Se recibe hecha en vez de calcularse aquí porque ajustarla exige leer el
 * histórico de mediciones, y este fichero no toca ni la red ni la base de
 * datos: es el que se ejecuta en Node contra repeticiones sintéticas. Lo
 * ajusta `buildLoadVelocityProfile` en `lib/vbt/analysis.ts`, que es donde ya
 * estaba, y que ahora tiene un segundo consumidor en vez de una copia.
 */
export interface AthleteVelocityProfile {
    /** Pendiente de v = slope·kg + intercept. En m/s por kg, y NEGATIVA. */
    slopePerKg: number;
    /** Cuántas mediciones sostienen la recta. */
    n: number;
    r2: number;
    /** Diferencia entre la carga más pesada y la más ligera del ajuste. */
    loadRangeKg: number;
}

/**
 * Lo que se le exige a la recta del atleta para preferirla a la genérica.
 *
 * Son cortes con nombre y no números sueltos por lo mismo que en `quality.ts`:
 * están puestos por criterio y hay que poder moverlos cuando las Fases 9 y 10
 * digan qué valor tenían de verdad.
 *
 * `loadRangeKg` es el que más se olvida y el que más daño hace. Tres
 * mediciones a 100, 102 y 105 kg dan un R² excelente y una pendiente que es
 * casi todo ruido; extrapolar con ella hasta el máximo multiplica ese ruido
 * por veinte. Un perfil necesita cargas SEPARADAS, no solo muchas.
 */
export const ATHLETE_PROFILE_MIN = {
    n: 4,
    r2: 0.8,
    loadRangeKg: 15,
} as const;

/** Si la recta del atleta se puede usar, y si no, por qué no. */
export const athleteProfileUsable = (
    profile: AthleteVelocityProfile | null | undefined
): { ok: boolean; reason?: string } => {
    if (!profile) return { ok: false, reason: 'todavía no hay mediciones suficientes de este movimiento' };
    if (!(profile.slopePerKg < 0)) return { ok: false, reason: 'sus mediciones no describen una recta (más carga no da menos velocidad)' };
    if (profile.n < ATHLETE_PROFILE_MIN.n) return { ok: false, reason: `hacen falta ${ATHLETE_PROFILE_MIN.n} mediciones y hay ${profile.n}` };
    if (profile.r2 < ATHLETE_PROFILE_MIN.r2) return { ok: false, reason: `sus mediciones están dispersas (R² ${profile.r2.toFixed(2)})` };
    if (profile.loadRangeKg < ATHLETE_PROFILE_MIN.loadRangeKg) {
        return { ok: false, reason: `todas sus mediciones están en ${Math.round(profile.loadRangeKg)} kg de margen` };
    }
    return { ok: true };
};

/**
 * Cuánto baja la velocidad por cada punto porcentual de 1RM, en el genérico.
 *
 * Es el complemento del MVT: con los dos se convierte una velocidad medida en
 * un %1RM. Se mantienen aquí porque describen la PENDIENTE media del perfil, y
 * eso no lo tiene `lib/vbt/analysis.ts`, que trabaja en kilos reales.
 */
const GENERIC_SLOPE_PER_PERCENT: Record<'squat' | 'bench' | 'deadlift', number> = {
    squat: 0.0125,
    bench: 0.0125,
    deadlift: 0.0100,
};

/**
 * 1RM estimado a partir de la velocidad media de la mejor repetición.
 *
 * DOS CAMINOS, Y EL BUENO PRIMERO
 *
 * **Con el perfil del atleta**, la cuenta es directa: desde el punto medido
 * hoy —esta carga, esta velocidad— se avanza por SU pendiente hasta la
 * velocidad a la que se completa un máximo.
 *
 *     1RM = carga + (mvt − v) / pendiente
 *
 * Esto no es lo mismo que el 1RM que ya publica su perfil histórico. Aquel
 * sale de la recta entera y describe el mes; este parte de lo que ha hecho
 * HOY, que es justamente para lo que sirve medir la velocidad: la carga que
 * toca hoy no la decide la media del mes.
 *
 * **Sin perfil**, se cae al genérico por levantamiento: todo el mundo termina
 * su máximo a la misma velocidad y el %1RM baja de forma lineal. Las dos
 * suposiciones son razonables en promedio y falsas en un individuo concreto
 * —la velocidad del máximo varía bastante entre atletas—, así que el resultado
 * viene marcado con `source: 'generic'` y la pantalla lo dice.
 *
 *
 * EL MVT SALE DE UN SOLO SITIO, Y ANTES NO
 *
 * Los valores estaban escritos aquí Y en `lib/vbt/analysis.ts`, y **no
 * coincidían**: banca 0,15 aquí contra 0,17 allí, peso muerto 0,20 aquí contra
 * 0,15 allí. La misma aplicación estimaba dos 1RM distintos del mismo
 * levantamiento según por qué pantalla se entrara, y la diferencia en peso
 * muerto llega al 5%. Es el mismo fallo que `velocity_loss`, con el agravante
 * de que aquel está decidido y documentado y este no lo sabía nadie.
 *
 * Ahora se toman de `MVT_BY_PATTERN`, que es la tabla que sí tiene la
 * procedencia escrita (González-Badillo, Sánchez-Medina). Las cifras ya
 * guardadas no se tocan; cambian las que se calculen a partir de ahora, y solo
 * en banca y peso muerto.
 */
export const estimate1RM = (
    massKg: number,
    currentVelocity: number,
    testType: 'squat' | 'bench' | 'deadlift',
    athleteProfile?: AthleteVelocityProfile | null
): OneRmEstimate => {
    const mvt = MVT_BY_PATTERN[testType];
    const usable = athleteProfileUsable(athleteProfile);

    if (usable.ok && athleteProfile && massKg > 0) {
        // (mvt − v) es negativo —el máximo va más lento que lo que se acaba de
        // levantar— y la pendiente también, así que el cociente suma kilos.
        const rm = massKg + (mvt - currentVelocity) / athleteProfile.slopePerKg;
        const percent = rm > 0 ? (massKg / rm) * 100 : 0;

        return {
            percent: Math.min(100, Math.max(15, percent)),
            rm: Math.max(massKg, rm),
            // Los mismos bordes que en el genérico: por debajo del 30% son
            // velocidades de calentamiento y por encima del 100% se está
            // extrapolando por detrás del máximo.
            reliable: percent >= 30 && percent <= 100,
            source: 'athlete',
            mvt,
        };
    }

    const raw = 100 - (currentVelocity - mvt) / GENERIC_SLOPE_PER_PERCENT[testType];
    const percent = Math.min(100, Math.max(15, raw));

    return {
        percent,
        rm: massKg > 0 ? massKg / (percent / 100) : 0,
        reliable: raw >= 30 && raw <= 100 && massKg > 0,
        source: 'generic',
        fallbackReason: usable.reason,
        mvt,
    };
};
