/* eslint-disable no-restricted-globals */

/**
 * ANVIL STRENGTH — EL HILO DE VISIÓN ARTIFICIAL
 * =====================================================================
 *
 * Corre OpenCV fuera del hilo de la interfaz. Hace dos cosas:
 *
 *   DETECT_PLATE  — encontrar el disco para fijar la escala del vídeo
 *   INIT / TRACK  — seguir un punto de la barra fotograma a fotograma
 *
 *
 * POR QUÉ LA DETECCIÓN BUSCA ELIPSES Y NO CÍRCULOS
 *
 * La versión anterior usaba `HoughCircles` y se retiró por no funcionar
 * (commit c98564dc, "remove broken auto-detection"). El motivo no era el
 * ajuste de parámetros:
 *
 *   1. Un disco solo sale redondo si la cámara está exactamente perpendicular
 *      a la barra. En cuanto se graba desde un lado —siempre— es una elipse, y
 *      `HOUGH_GRADIENT` no puede encontrarla por definición.
 *   2. Se elegía el candidato por su RADIO (`score = inBounds ? r : r*0.5`), o
 *      sea, el círculo más grande del encuadre. En un gimnasio eso es
 *      cualquier cosa: una rueda, un foco, una cabeza.
 *   3. No se comprobaba si el candidato era de verdad una elipse. Se aceptaba
 *      lo que el acumulador votase.
 *
 * Lo de aquí abajo hace lo contrario: saca los bordes, ajusta una elipse a
 * cada contorno y luego **mide si el contorno se parece a la elipse ajustada**
 * (residuo) y **cuánta vuelta le da** (cobertura angular). Un arco de pared o
 * el borde de una colchoneta ajustan fatal y se caen solos. Ese par de números
 * es lo que sustituye al "el más grande gana".
 *
 * `HoughCircles` se conserva SOLO como último recurso, y cuando entra se dice
 * (`method: 'hough'`) para que la puntuación de calidad lo tenga en cuenta.
 */

self.importScripts('/opencv.js');

let cvReady = false;

/**
 * ESTADO DEL SEGUIMIENTO
 *
 * `points` es una nube, no un punto. Ver la cabecera de la sección
 * "SEGUIMIENTO" más abajo para el porqué.
 */
let oldGray = null;
/** Coordenadas actuales de la nube: [x0,y0, x1,y1, …]. */
let points = null;
/** Cuántos puntos se sembraron al empezar. Referencia para saber si quedan pocos. */
let seededCount = 0;
/** Centro que se reporta hacia fuera. Se mueve con la traslación de la nube. */
let centre = { x: 0, y: 0 };
/** Radio de la zona donde se siembran features, para poder re-sembrar. */
let seedRadius = 0;
/** Fotogramas perdidos seguidos. Ver el manejador de TRACK. */
let consecutiveLost = 0;

let winSize = null;
let maxLevel = null;
let criteria = null;

function initCV() {
    if (self.cv && self.cv.Mat) {
        setupVariables();
    } else if (self.cv && self.cv.onRuntimeInitialized) {
        self.cv.onRuntimeInitialized = () => {
            setupVariables();
        };
    } else {
        let check = setInterval(() => {
            if (self.cv && self.cv.Mat) {
                clearInterval(check);
                setupVariables();
            }
        }, 100);
    }
}

function setupVariables() {
    cvReady = true;
    winSize = new self.cv.Size(21, 21);
    maxLevel = 4;
    criteria = new self.cv.TermCriteria(self.cv.TERM_CRITERIA_EPS | self.cv.TERM_CRITERIA_COUNT, 30, 0.01);
    self.postMessage({ type: 'READY' });
}

// =====================================================================
// DETECCIÓN DEL DISCO
// =====================================================================

/**
 * Ancho al que se trabaja. 720 y no 480 como antes: el borde de un disco a
 * contraluz es un gradiente suave, y reducir de más lo borra justo cuando
 * hace falta. El coste sigue siendo de décimas de segundo y ocurre UNA vez
 * por vídeo, no por fotograma.
 */
const WORK_WIDTH = 720;

/**
 * Tamaño admisible del disco, en fracción del LADO MENOR del fotograma.
 *
 * Del lado menor y no del ancho: un móvil graba en vertical tanto como en
 * horizontal, y medir contra el ancho hacía que el límite superior fuese
 * 960 px en un fotograma de 720 de alto — es decir, se aceptaba como disco
 * algo más grande que la imagen entera. Un disco no puede ser más alto que el
 * encuadre, y con esta referencia el límite significa lo mismo en las dos
 * orientaciones.
 */
const MIN_AXIS_FRAC = 0.06;
const MAX_AXIS_FRAC = 0.75;

/**
 * Achatamiento máximo admisible (eje menor / eje mayor).
 *
 * 0,35 equivale a unos 70° fuera de la perpendicular. Más que eso ya no es un
 * encuadre del que se pueda sacar nada, y aceptarlo abre la puerta a que
 * cualquier borde alargado —el marco de una puerta, una barra— pase por disco.
 */
const MIN_AXIS_RATIO = 0.35;

/** Mediana de una imagen de 1 canal. Para fijar los umbrales de Canny solos. */
function medianOfGray(mat) {
    const hist = new Uint32Array(256);
    const d = mat.data;
    // Muestrear 1 de cada 4 píxeles: la mediana no se mueve y va cuatro veces
    // más rápido en un vídeo de móvil.
    for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
    const total = Math.ceil(d.length / 4);
    let acc = 0;
    for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= total / 2) return v;
    }
    return 128;
}

/**
 * Cómo de bien se parece el contorno a la elipse que se le ha ajustado.
 *
 * Devuelve dos números, y los dos hacen falta:
 *
 *   residual — distancia media de los puntos a la elipse, normalizada (0 es
 *              perfecto). Contesta "¿esto es una elipse?".
 *   coverage — qué fracción de la vuelta completa recorre el contorno.
 *              Contesta "¿es el disco entero o un trocito de borde?".
 *
 * Un disco medio tapado por la pierna del atleta da residuo bajo y cobertura
 * de 0,6: se acepta. Un listón recto da cobertura alta —el contorno da la
 * vuelta al listón— pero residuo malísimo: se rechaza. Hacen falta los dos.
 */
function ellipseFitQuality(contour, rr) {
    const n = contour.rows;
    if (n < 5) return null;

    const a = rr.size.width / 2;
    const b = rr.size.height / 2;
    if (a <= 0 || b <= 0) return null;

    const t = (rr.angle * Math.PI) / 180;
    const ct = Math.cos(t);
    const stn = Math.sin(t);

    const BINS = 24;
    const bins = new Uint8Array(BINS);
    const step = Math.max(1, Math.floor(n / 220));

    let sum = 0;
    let count = 0;

    for (let i = 0; i < n; i += step) {
        const dx = contour.data32S[i * 2] - rr.center.x;
        const dy = contour.data32S[i * 2 + 1] - rr.center.y;
        // Al marco propio de la elipse, donde vale 1 justo sobre ella.
        const u = (dx * ct + dy * stn) / a;
        const v = (-dx * stn + dy * ct) / b;
        const r = Math.sqrt(u * u + v * v);
        sum += Math.abs(r - 1);
        count++;

        let ang = Math.atan2(v, u);
        if (ang < 0) ang += 2 * Math.PI;
        bins[Math.min(BINS - 1, Math.floor((ang / (2 * Math.PI)) * BINS))] = 1;
    }

    if (count === 0) return null;

    let filled = 0;
    for (let i = 0; i < BINS; i++) filled += bins[i];

    return { residual: sum / count, coverage: filled / BINS };
}

/**
 * Puntúa un candidato de 0 a 1.
 *
 * El producto de factores es deliberado: basta que UNO esté mal para que el
 * candidato muera. Una media dejaría pasar un ajuste pésimo con un tamaño
 * bonito, que es la forma exacta en que fallaba la versión de Hough.
 */
function scoreCandidate(rr, fit, W, H, hint) {
    const ref = Math.min(W, H);
    const major = Math.max(rr.size.width, rr.size.height);
    const minor = Math.min(rr.size.width, rr.size.height);

    if (major < ref * MIN_AXIS_FRAC || major > ref * MAX_AXIS_FRAC) return 0;
    if (minor / major < MIN_AXIS_RATIO) return 0;
    if (rr.center.x < 0 || rr.center.y < 0 || rr.center.x > W || rr.center.y > H) return 0;

    // Residuo: 0 es perfecto, 0,15 es basura.
    const fitScore = Math.max(0, 1 - fit.residual / 0.15);
    if (fitScore <= 0) return 0;

    // Cobertura: por debajo de media vuelta no hay elipse que valga.
    const covScore = Math.max(0, Math.min(1, (fit.coverage - 0.45) / 0.45));
    if (covScore <= 0) return 0;

    // Tamaño: en un encuadre de levantamiento el disco ocupa entre el 12% y el
    // 45% del lado menor. Fuera de ahí no se descarta, solo se prefiere menos.
    const frac = major / ref;
    const sizeScore = frac >= 0.12 && frac <= 0.45 ? 1 : 0.55;

    // Si el usuario ha señalado dónde está, se exige que el candidato lo
    // contenga o quede muy cerca.
    let hintScore = 1;
    if (hint) {
        const d = Math.hypot(rr.center.x - hint.x, rr.center.y - hint.y);
        hintScore = d <= major / 2 ? 1 : Math.max(0, 1 - (d - major / 2) / (major * 0.6));
        if (hintScore <= 0) return 0;
    }

    // El residuo pesa al cuadrado: es el único factor que distingue un disco
    // de una mancha del tamaño adecuado.
    return fitScore * fitScore * covScore * sizeScore * hintScore;
}

/** Detección por contornos + ajuste de elipse. La vía buena. */
function detectByContours(gray, hint) {
    if (!self.cv.fitEllipse || !self.cv.findContours || !self.cv.Canny) return null;

    const W = gray.cols;
    const H = gray.rows;
    const candidates = [];

    // Dos preprocesados. El segundo, con ecualización local, es para gimnasios
    // oscuros y con luz desigual, que son casi todos.
    for (let pass = 0; pass < 2; pass++) {
        const work = gray.clone();
        try {
            if (pass === 1) {
                const clahe = new self.cv.CLAHE(2.5, new self.cv.Size(8, 8));
                clahe.apply(work, work);
                clahe.delete();
            }
            self.cv.GaussianBlur(work, work, new self.cv.Size(5, 5), 1.2, 1.2);

            const med = medianOfGray(work);
            const lo = Math.max(12, Math.round(0.66 * med));
            const hi = Math.max(lo + 10, Math.min(255, Math.round(1.33 * med)));

            const edges = new self.cv.Mat();
            self.cv.Canny(work, edges, lo, hi, 3, false);

            // Cerrar los huecos del borde del disco: un reflejo o una sombra lo
            // parten en arcos y sin esto cada trozo se juzga por separado.
            const kernel = self.cv.getStructuringElement(self.cv.MORPH_ELLIPSE, new self.cv.Size(3, 3));
            self.cv.morphologyEx(edges, edges, self.cv.MORPH_CLOSE, kernel);
            kernel.delete();

            const contours = new self.cv.MatVector();
            const hierarchy = new self.cv.Mat();
            self.cv.findContours(edges, contours, hierarchy, self.cv.RETR_LIST, self.cv.CHAIN_APPROX_SIMPLE);

            for (let i = 0; i < contours.size(); i++) {
                const c = contours.get(i);
                if (c.rows >= 25) {
                    try {
                        const rr = self.cv.fitEllipse(c);
                        const fit = ellipseFitQuality(c, rr);
                        if (fit) {
                            const score = scoreCandidate(rr, fit, W, H, hint);
                            if (score > 0.15) {
                                candidates.push({
                                    cx: rr.center.x,
                                    cy: rr.center.y,
                                    width: rr.size.width,
                                    height: rr.size.height,
                                    angleDeg: rr.angle,
                                    score,
                                    /**
                                     * Qué fracción del contorno de la elipse se
                                     * ve de verdad, de 0 a 1.
                                     *
                                     * Viaja hasta la pantalla porque es lo ÚNICO
                                     * que distingue un disco tapado a medias de
                                     * uno entero, y un disco tapado se mide mal
                                     * por construcción: `fitEllipse` sobre un
                                     * arco parcial está mal condicionado y
                                     * sobrestima los ejes. Medido en el banco:
                                     * con una pierna delante tapando el 25% del
                                     * disco, la altura sale un +18%.
                                     *
                                     * La PUNTUACIÓN no sirve para detectarlo: en
                                     * el barrido, casos tapados puntúan 0,49 y
                                     * casos perfectos de disco grande y girado
                                     * puntúan 0,51. Se solapan. La cobertura no.
                                     */
                                    coverage: fit.coverage,
                                });
                            }
                        }
                    } catch {
                        // fitEllipse protesta con contornos degenerados. Siguiente.
                    }
                }
                c.delete();
            }

            contours.delete();
            hierarchy.delete();
            edges.delete();
        } finally {
            work.delete();
        }

        // Si el primer pase ya ha encontrado algo convincente, no hace falta el
        // segundo: es la mitad del tiempo de detección.
        if (candidates.some(c => c.score > 0.6)) break;
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    return pickOutermost(candidates);
}

/**
 * Cuántas veces más grande puede ser el hermano mayor que se acepta.
 *
 * ESTE NÚMERO VALÍA 3 Y ERA EL FALLO MÁS GRAVE DEL DETECTOR.
 *
 * El buje metálico de un disco mide en torno a 0,28 del diámetro exterior, así
 * que del buje al borde hay **1 / 0,28 = 3,57 veces**. Con el tope en 3, un
 * buje que ganara la puntuación no podía ascender nunca al borde: se quedaba
 * como disco. Consecuencia medida, no supuesta:
 *
 *     altura del disco: −71,5%, con una confianza de 0,85
 *
 * O sea, la escala del vídeo salía casi cuatro veces más pequeña de lo real y
 * todas las velocidades cuatro veces más grandes, y el detector lo daba por
 * bueno. Es exactamente el fallo silencioso que produce un resultado creíble.
 *
 * Solo pasaba con discos GRANDES en el encuadre (cámara cerca): con el disco
 * pequeño, el buje no llega ni a `MIN_AXIS_FRAC` ni a las 25 filas de contorno
 * y nunca entra como candidato. Y solo con discos rojos, azules o negros, donde
 * el buje gris contrasta de verdad en escala de grises; en un disco amarillo no
 * contrasta y el fallo no aparecía. Por eso no lo cazó nadie leyendo el código:
 * hacía falta barrer tamaños Y colores.
 *
 * 5,0 deja margen sobre el 3,57 del buje sin abrir la puerta a cualquier cosa:
 * el hermano mayor tiene que compartir centro con una tolerancia del 25% del
 * candidato pequeño, que para un buje son unos doce píxeles. Que una elipse del
 * fondo caiga concéntrica con el disco dentro de doce píxeles es mucho pedir.
 */
const MAX_SIBLING_GROWTH = 5.0;

/**
 * De entre los candidatos concéntricos, quedarse con el de fuera.
 *
 * Un disco genera varias elipses casi iguales: los dos lados del trazo del
 * borde, el aro de color interior de un bumper, el buje, el logotipo. Los 45 cm
 * son el DIÁMETRO EXTERIOR, así que quedarse con uno de dentro es creer que 30
 * cm son 45 —o que 13 lo son, si el que gana es el buje—.
 *
 * Se acepta un hermano mayor solo si comparte centro, si su ajuste no es mucho
 * peor y si no es desproporcionadamente grande. Ver `MAX_SIBLING_GROWTH` para
 * por qué ese tope tenía que subir.
 */
function pickOutermost(sorted) {
    const best = sorted[0];
    const bestMajor = Math.max(best.width, best.height);
    let chosen = best;
    let chosenMajor = bestMajor;

    for (const c of sorted) {
        const major = Math.max(c.width, c.height);
        const sameCentre = Math.hypot(c.cx - best.cx, c.cy - best.cy) < bestMajor * 0.25;
        const notAbsurd = major <= bestMajor * MAX_SIBLING_GROWTH;
        const decentFit = c.score >= best.score * 0.55;
        if (sameCentre && notAbsurd && decentFit && major > chosenMajor) {
            chosen = c;
            chosenMajor = major;
        }
    }

    return chosen;
}

/**
 * Respaldo por `HoughCircles`. SOLO cuando el usuario ha señalado el disco.
 *
 * Sin pista no se usa, y esa restricción es deliberada. `HoughCircles` no
 * valida nada: no sabe si el candidato se parece a una elipse ni si el
 * contorno da la vuelta, así que en una escena SIN disco devuelve
 * tranquilamente el círculo que más votos saque. En una prueba con un fondo de
 * gimnasio sin ningún disco inventó uno de 787 px en un fotograma de 720 de
 * alto — y con la interfaz pidiendo confirmación, eso es justo lo que un
 * usuario con prisa acepta.
 *
 * Con pista el problema es otro y sí es tratable: el usuario ya ha afirmado
 * dónde está el disco y a Hough solo le queda encontrar el radio. Si tampoco
 * ahí encuentra nada, se pasa al aro manual, que al menos va marcado como tal.
 */
function detectByHough(gray, hint) {
    if (!self.cv.HoughCircles || !hint) return null;

    const W = gray.cols;
    const ref = Math.min(gray.cols, gray.rows);
    const work = gray.clone();
    self.cv.GaussianBlur(work, work, new self.cv.Size(7, 7), 1.5, 1.5);

    const minRad = Math.round((ref * MIN_AXIS_FRAC) / 2);
    const maxRad = Math.round((ref * MAX_AXIS_FRAC) / 2);
    const minDist = Math.round(W * 0.10);

    const paramSets = [
        { dp: 1, p1: 80, p2: 45 },
        { dp: 1, p1: 60, p2: 32 },
        { dp: 1.4, p1: 50, p2: 26 },
    ];

    let best = null;

    for (const params of paramSets) {
        const circles = new self.cv.Mat();
        self.cv.HoughCircles(work, circles, self.cv.HOUGH_GRADIENT, params.dp, minDist, params.p1, params.p2, minRad, maxRad);

        for (let i = 0; i < Math.min(25, circles.cols); i++) {
            const cx = circles.data32F[i * 3];
            const cy = circles.data32F[i * 3 + 1];
            const r = circles.data32F[i * 3 + 2];

            // Sin ajuste que medir, lo único que queda es lo cerca que cae de
            // donde el usuario ha señalado. Se puntúa bajo a propósito: este
            // camino es intrínsecamente menos fiable que el de la elipse, y la
            // puntuación acaba en la nota de calidad de la medición.
            const d = Math.hypot(cx - hint.x, cy - hint.y);
            if (d > r * 1.5) continue;
            const s = 0.55 * Math.max(0.3, 1 - d / (r * 1.5));

            if (!best || s > best.score) {
                best = { cx, cy, width: r * 2, height: r * 2, angleDeg: 0, score: s };
            }
        }
        circles.delete();
        if (best) break;
    }

    work.delete();
    return best;
}

// =====================================================================
// SEGUIMIENTO
// =====================================================================

/**
 * POR QUÉ UNA NUBE DE PUNTOS Y NO UN PUNTO
 *
 * La versión anterior seguía UN punto: `goodFeaturesToTrack` con `maxCorners:1`
 * dentro de un cuadrado de 60 px, y luego flujo óptico de ese único punto. Eso
 * falla de una forma que no se ve:
 *
 *   · Si la esquina elegida cae en el fondo —el marco de un espejo detrás del
 *     disco, la camiseta del atleta que pasa por delante— el análisis entero
 *     mide otra cosa, y `status` sigue valiendo 1 todo el rato. El flujo óptico
 *     no sabe que está siguiendo lo que no es.
 *   · Un solo punto no tiene forma de detectar que se ha equivocado. No hay
 *     nada con qué compararlo.
 *
 * Con veinte puntos repartidos por la cara del disco hay redundancia, y con
 * redundancia se puede votar. La traslación del conjunto se toma como la
 * MEDIANA de los desplazamientos individuales: para que la mediana se mueva
 * harían falta más de diez puntos yéndose a la vez y en la misma dirección, que
 * es justo lo que no pasa cuando un par de features se enganchan a otra cosa.
 *
 * La mediana tiene además una propiedad que viene regalada: si el disco GIRA
 * —los de un peso muerto giran— los desplazamientos son tangenciales y
 * simétricos respecto del centro, así que su mediana es cero. El centro sale
 * bien sin tener que estimar la rotación.
 *
 *
 * VALIDACIÓN ADELANTE-ATRÁS
 *
 * Cada fotograma se sigue dos veces: del anterior al actual, y del actual de
 * vuelta al anterior. Un punto seguido correctamente vuelve a donde estaba; uno
 * que ha derivado, no. La distancia entre el punto original y el que vuelve es
 * el error adelante-atrás, y descarta los puntos malos ANTES de que voten.
 *
 * Cuesta el doble de flujo óptico. Es el mejor dinero que se gasta en todo el
 * módulo: es lo único que distingue "seguido" de "seguido bien".
 */

/** Cuántos features se intentan sembrar sobre el disco. */
const SEED_TARGET = 24;
/** Por debajo de esto se intenta re-sembrar sobre la marcha. */
const RESEED_BELOW = 10;
/** Menos supervivientes que esto y el fotograma se declara perdido. */
const MIN_SURVIVORS = 4;
/**
 * Fotogramas perdidos seguidos tras los cuales se renuncia a recuperar el hilo
 * y se vuelve a sembrar. Medio segundo a 30 Hz: una oclusión más larga que eso
 * ya no se recupera saltando desde la referencia vieja.
 */
const RESEED_AFTER_LOST = 15;
/** Error adelante-atrás tolerado, en píxeles. */
const FB_ERROR_PX = 1.5;

/** Libera una lista de Mats sin protestar si alguno ya no está. */
function freeAll(mats) {
    for (const m of mats) {
        try { if (m && !m.isDeleted?.()) m.delete(); } catch { /* ya liberado */ }
    }
}

/** Mediana de un array de números. Modifica el array (lo ordena). */
function median(values) {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const mid = values.length >> 1;
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/**
 * Máscara con la zona donde tiene sentido buscar features: la cara del disco.
 *
 * Se encoge al 85% del eje porque el borde exterior del disco es justo donde el
 * fondo se cuela dentro de la ventana de 21×21 del flujo óptico, y un feature
 * mitad disco mitad pared se va con el que se mueva.
 */
function plateMask(rows, cols, cx, cy, radius, ellipse) {
    const mask = self.cv.Mat.zeros(rows, cols, self.cv.CV_8UC1);
    const white = new self.cv.Scalar(255);
    try {
        if (ellipse && self.cv.ellipse) {
            self.cv.ellipse(
                mask,
                new self.cv.Point(Math.round(cx), Math.round(cy)),
                new self.cv.Size(
                    Math.max(3, Math.round((ellipse.width / 2) * 0.85)),
                    Math.max(3, Math.round((ellipse.height / 2) * 0.85))
                ),
                ellipse.angleDeg || 0,
                0, 360, white, -1
            );
        } else {
            self.cv.circle(mask, new self.cv.Point(Math.round(cx), Math.round(cy)), Math.max(3, Math.round(radius)), white, -1);
        }
    } catch {
        // Si la máscara no se puede pintar, se busca en todo el fotograma: es
        // peor, pero mejor que quedarse sin ningún punto.
        freeAll([mask]);
        return null;
    }
    return mask;
}

/**
 * Siembra features dentro de la máscara y devuelve un array plano [x,y,…].
 *
 * `minDistance` escala con el tamaño del disco: repartir veinte puntos por un
 * disco de 300 px pide más separación que por uno de 80, y sin eso se apelotonan
 * todos en la esquina más contrastada —el logotipo— con lo que la redundancia
 * es aparente: veinte puntos que ven el mismo trozo de imagen fallan juntos.
 */
function seedFeatures(gray, cx, cy, radius, ellipse) {
    // `plateMask` devuelve null si no ha podido pintarse. Un Mat vacío significa
    // "sin máscara" para OpenCV, y se crea aquí para poder liberarlo: creado en
    // la lista de argumentos se quedaba sin dueño y se filtraba en cada
    // re-siembra, que ocurre varias veces por análisis.
    const mask = plateMask(gray.rows, gray.cols, cx, cy, radius, ellipse) ?? new self.cv.Mat();
    const corners = new self.cv.Mat();
    const found = [];

    try {
        const minDistance = Math.max(4, radius * 0.18);
        self.cv.goodFeaturesToTrack(
            gray, corners, SEED_TARGET, 0.01, minDistance,
            mask, 3, false, 0.04
        );
        for (let i = 0; i < corners.rows; i++) {
            found.push(corners.data32F[i * 2], corners.data32F[i * 2 + 1]);
        }
    } catch {
        // Sin features no se puede seguir; quien llame lo verá en la longitud.
    } finally {
        freeAll([corners, mask]);
    }

    return found;
}

/**
 * Un paso de seguimiento. Devuelve el desplazamiento del conjunto o `null` si
 * el fotograma se considera perdido.
 */
function trackStep(prevGray, nextGray, flat) {
    const n = flat.length / 2;
    if (n === 0) return null;

    const p0 = self.cv.matFromArray(n, 1, self.cv.CV_32FC2, flat);
    const p1 = new self.cv.Mat();
    const pBack = new self.cv.Mat();
    const stFwd = new self.cv.Mat();
    const stBack = new self.cv.Mat();
    const errFwd = new self.cv.Mat();
    const errBack = new self.cv.Mat();

    try {
        self.cv.calcOpticalFlowPyrLK(prevGray, nextGray, p0, p1, stFwd, errFwd, winSize, maxLevel, criteria);
        self.cv.calcOpticalFlowPyrLK(nextGray, prevGray, p1, pBack, stBack, errBack, winSize, maxLevel, criteria);

        const dxs = [];
        const dys = [];
        const survivors = [];

        for (let i = 0; i < n; i++) {
            if (stFwd.data[i] !== 1 || stBack.data[i] !== 1) continue;

            const x0 = p0.data32F[i * 2];
            const y0 = p0.data32F[i * 2 + 1];
            const x1 = p1.data32F[i * 2];
            const y1 = p1.data32F[i * 2 + 1];
            const xb = pBack.data32F[i * 2];
            const yb = pBack.data32F[i * 2 + 1];

            // Fuera del fotograma: el flujo óptico extrapola sin quejarse.
            if (x1 < 0 || y1 < 0 || x1 >= nextGray.cols || y1 >= nextGray.rows) continue;

            const fbError = Math.hypot(xb - x0, yb - y0);
            if (fbError > FB_ERROR_PX) continue;

            survivors.push({ x: x1, y: y1 });
            dxs.push(x1 - x0);
            dys.push(y1 - y0);
        }

        if (survivors.length < MIN_SURVIVORS) return null;

        const dx = median(dxs.slice());
        const dy = median(dys.slice());

        // Segundo filtro: un punto puede pasar el adelante-atrás y aun así
        // moverse distinto del conjunto —el atleta cruzando por delante da
        // exactamente eso—. Se descartan los que se separan más de 2,5 px de la
        // traslación consensuada para que no contaminen la re-siembra.
        const kept = [];
        for (let i = 0; i < survivors.length; i++) {
            if (Math.hypot(dxs[i] - dx, dys[i] - dy) <= 2.5) {
                kept.push(survivors[i].x, survivors[i].y);
            }
        }

        if (kept.length / 2 < MIN_SURVIVORS) return null;

        return { dx, dy, points: kept, tracked: kept.length / 2 };
    } catch {
        return null;
    } finally {
        freeAll([p0, p1, pBack, stFwd, stBack, errFwd, errBack]);
    }
}

// =====================================================================
// MENSAJES
// =====================================================================

self.onmessage = function (e) {
    const data = e.data;

    if (data.type === 'PING') {
        if (cvReady) self.postMessage({ type: 'READY' });
        return;
    }

    if (!cvReady) {
        self.postMessage({ type: 'ERROR', id: data.id, message: 'OpenCV no está listo en el worker' });
        return;
    }

    /**
     * Sembrar la nube sobre el disco y dejarla lista para el primer paso.
     *
     * `radiusPx` y `ellipse` los manda quien ya ha calibrado: sembrar dentro
     * del disco DETECTADO en vez de en un cuadrado de 60 px alrededor del dedo
     * del usuario es lo que hace que los features estén sobre el objeto que se
     * quiere medir y no sobre lo que hubiera detrás.
     */
    if (data.type === 'INIT') {
        try {
            freeAll([oldGray]);
            consecutiveLost = 0;

            const imgData = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
            const frame = self.cv.matFromImageData(imgData);
            oldGray = new self.cv.Mat();
            self.cv.cvtColor(frame, oldGray, self.cv.COLOR_RGBA2GRAY);
            frame.delete();

            seedRadius = data.radiusPx > 4 ? data.radiusPx : 30;
            centre = { x: data.x, y: data.y };

            points = seedFeatures(oldGray, data.x, data.y, seedRadius, data.ellipse ?? null);
            seededCount = points.length / 2;

            // Sin features no hay nada que seguir. Se dice, en vez de dejar que
            // el primer TRACK devuelva "perdido" y parezca un problema del
            // vídeo: aquí el problema es que el disco no tiene textura (bumper
            // negro liso a contraluz) y la solución es señalar otro punto.
            if (seededCount < MIN_SURVIVORS) {
                self.postMessage({
                    type: 'INIT_DONE',
                    id: data.id,
                    x: data.x,
                    y: data.y,
                    features: seededCount,
                    ok: false,
                });
                return;
            }

            self.postMessage({
                type: 'INIT_DONE',
                id: data.id,
                x: centre.x,
                y: centre.y,
                features: seededCount,
                ok: true,
            });
        } catch (error) {
            self.postMessage({ type: 'ERROR', id: data.id, message: error.message });
        }
    }
    else if (data.type === 'TRACK') {
        let frame = null;
        let frameGray = null;
        try {
            if (!oldGray || !points) {
                self.postMessage({ type: 'TRACK_DONE', id: data.id, status: 0, x: centre.x, y: centre.y, tracked: 0 });
                return;
            }

            const imgData = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
            frame = self.cv.matFromImageData(imgData);
            frameGray = new self.cv.Mat();
            self.cv.cvtColor(frame, frameGray, self.cv.COLOR_RGBA2GRAY);

            const step = trackStep(oldGray, frameGray, points);

            if (!step) {
                /**
                 * FOTOGRAMA PERDIDO: SE CONSERVA LA REFERENCIA ANTERIOR.
                 *
                 * La primera versión hacía lo contrario —adoptaba el fotograma
                 * fallido como nueva referencia— y eso convertía cada pérdida en
                 * un error PERMANENTE de posición: los puntos de la nube seguían
                 * teniendo las coordenadas de donde estaba el disco antes, pero
                 * la imagen de referencia ya era otra en la que el disco se
                 * había movido. El desplazamiento de esos fotogramas no se
                 * recuperaba nunca. Se midió con una oclusión de seis
                 * fotogramas: dos perdidos dejaban 12 px de desfase que
                 * arrastraba hasta el final, un 6% del recorrido.
                 *
                 * Conservando la referencia buena, el siguiente intento salta
                 * directamente desde ella y recupera TODO el desplazamiento del
                 * hueco. El salto es mayor, pero el flujo óptico con cuatro
                 * niveles de pirámide y ventana de 21 px cubre bastante más de
                 * lo que se mueve una barra en unos pocos fotogramas.
                 */
                consecutiveLost++;

                // Con una oclusión larga la referencia deja de parecerse a lo
                // que hay en pantalla y ya no se recupera nunca. Antes que
                // seguir devolviendo "perdido" para siempre, se vuelve a sembrar
                // donde se dejó de ver el disco.
                if (consecutiveLost > RESEED_AFTER_LOST) {
                    const fresh = seedFeatures(frameGray, centre.x, centre.y, seedRadius, data.ellipse ?? null);
                    if (fresh.length / 2 >= MIN_SURVIVORS) {
                        points = fresh;
                        freeAll([oldGray]);
                        oldGray = frameGray;
                        frameGray = null;
                        consecutiveLost = 0;
                    }
                }

                self.postMessage({ type: 'TRACK_DONE', id: data.id, status: 0, x: centre.x, y: centre.y, tracked: 0 });
                return;
            }

            consecutiveLost = 0;

            centre = { x: centre.x + step.dx, y: centre.y + step.dy };
            points = step.points;

            // La nube se desgasta: cada fotograma pierde algún punto por
            // oclusión o desenfoque de movimiento. Re-sembrar sobre el disco en
            // su posición ACTUAL la repone sin arrastrar el error, porque el
            // centro que se usa para la máscara ya viene de la mediana.
            if (step.tracked < RESEED_BELOW) {
                const fresh = seedFeatures(frameGray, centre.x, centre.y, seedRadius, data.ellipse ?? null);
                if (fresh.length / 2 > step.tracked) points = fresh;
            }

            freeAll([oldGray]);
            oldGray = frameGray;
            frameGray = null;

            self.postMessage({
                type: 'TRACK_DONE',
                id: data.id,
                status: 1,
                x: centre.x,
                y: centre.y,
                tracked: step.tracked,
            });
        } catch (error) {
            self.postMessage({ type: 'ERROR', id: data.id, message: error.message });
        } finally {
            freeAll([frame, frameGray]);
        }
    }
    /**
     * Encontrar el disco en un fotograma.
     *
     * `hintX`/`hintY` son opcionales: sin ellos busca en toda la imagen; con
     * ellos exige que el candidato caiga donde el usuario ha tocado, lo que
     * convierte un problema difícil en uno fácil.
     */
    else if (data.type === 'DETECT_PLATE') {
        let gray = null;
        try {
            const imgData = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
            const frame = self.cv.matFromImageData(imgData);
            gray = new self.cv.Mat();
            self.cv.cvtColor(frame, gray, self.cv.COLOR_RGBA2GRAY);
            frame.delete();

            let scale = 1.0;
            if (gray.cols > WORK_WIDTH) {
                scale = WORK_WIDTH / gray.cols;
                const dsize = new self.cv.Size(WORK_WIDTH, Math.round(gray.rows * scale));
                self.cv.resize(gray, gray, dsize, 0, 0, self.cv.INTER_AREA);
            }

            const hint = typeof data.hintX === 'number' && typeof data.hintY === 'number'
                ? { x: data.hintX * scale, y: data.hintY * scale }
                : null;

            let found = detectByContours(gray, hint);
            let method = 'ellipse';

            if (!found) {
                found = detectByHough(gray, hint);
                method = found ? 'hough' : null;
            }

            gray.delete();
            gray = null;

            // De vuelta a píxeles del vídeo original: el resto de la aplicación
            // trabaja en esas coordenadas y no sabe nada de la reducción.
            const ellipse = found
                ? {
                    cx: found.cx / scale,
                    cy: found.cy / scale,
                    width: found.width / scale,
                    height: found.height / scale,
                    angleDeg: found.angleDeg,
                }
                : null;

            self.postMessage({
                type: 'DETECT_PLATE_DONE',
                id: data.id,
                ellipse,
                score: found ? found.score : 0,
                method,
                // `null` con Hough: ahí no hay contorno del que medir cobertura.
                coverage: found && typeof found.coverage === 'number' ? found.coverage : null,
            });
        } catch (error) {
            if (gray) gray.delete();
            self.postMessage({ type: 'DETECT_PLATE_DONE', id: data.id, ellipse: null, score: 0, method: null, error: error.message });
        }
    }
    else if (data.type === 'CLEANUP') {
        freeAll([oldGray]);
        oldGray = null;
        points = null;
        seededCount = 0;
        seedRadius = 0;
        consecutiveLost = 0;
        centre = { x: 0, y: 0 };
    }
};

initCV();
