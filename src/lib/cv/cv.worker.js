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
let oldGray = null;
let p0 = null;
let p1 = null;
let st = null;
let err = null;
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
    p1 = new self.cv.Mat();
    st = new self.cv.Mat();
    err = new self.cv.Mat();
    winSize = new self.cv.Size(31, 31);
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
 * De entre los candidatos concéntricos, quedarse con el de fuera.
 *
 * Un disco genera varias elipses casi iguales: los dos lados del trazo del
 * borde, el aro de color interior de un bumper, el logotipo. Los 45 cm son el
 * DIÁMETRO EXTERIOR, así que quedarse con el aro interior significaría creer
 * que 30 cm son 45 y sobrestimar la velocidad un 50%.
 *
 * Se acepta un hermano mayor solo si comparte centro, si su ajuste no es mucho
 * peor y si no es desproporcionadamente grande: sin ese tope, un candidato
 * bueno arrastraría a cualquier elipse enorme que pase cerca.
 */
function pickOutermost(sorted) {
    const best = sorted[0];
    const bestMajor = Math.max(best.width, best.height);
    let chosen = best;
    let chosenMajor = bestMajor;

    for (const c of sorted) {
        const major = Math.max(c.width, c.height);
        const sameCentre = Math.hypot(c.cx - best.cx, c.cy - best.cy) < bestMajor * 0.25;
        const notAbsurd = major <= bestMajor * 3;
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
// MENSAJES
// =====================================================================

self.onmessage = function (e) {
    const data = e.data;

    if (data.type === 'PING') {
        if (cvReady) self.postMessage({ type: 'READY' });
        return;
    }

    if (!cvReady) {
        self.postMessage({ type: 'ERROR', message: 'OpenCV no está listo en el worker' });
        return;
    }

    if (data.type === 'INIT') {
        try {
            if (oldGray) oldGray.delete();
            if (p0) p0.delete();

            const imgData = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
            const frame = self.cv.matFromImageData(imgData);

            oldGray = new self.cv.Mat();
            self.cv.cvtColor(frame, oldGray, self.cv.COLOR_RGBA2GRAY);
            frame.delete();

            const roiSize = 60;
            let startX = Math.max(0, Math.round(data.x - roiSize / 2));
            let startY = Math.max(0, Math.round(data.y - roiSize / 2));
            let width = Math.min(oldGray.cols - startX, roiSize);
            let height = Math.min(oldGray.rows - startY, roiSize);

            const rect = new self.cv.Rect(startX, startY, width, height);
            const roiGray = oldGray.roi(rect);

            const corners = new self.cv.Mat();
            const mask = new self.cv.Mat();

            self.cv.goodFeaturesToTrack(roiGray, corners, 1, 0.01, 10, mask, 3, false, 0.04);

            if (corners.rows > 0) {
                data.x = corners.data32F[0] + startX;
                data.y = corners.data32F[1] + startY;
            }

            roiGray.delete();
            corners.delete();
            mask.delete();

            p0 = new self.cv.Mat(1, 1, self.cv.CV_32FC2);
            p0.data32F[0] = data.x;
            p0.data32F[1] = data.y;

            self.postMessage({ type: 'INIT_DONE', x: data.x, y: data.y });
        } catch (error) {
            self.postMessage({ type: 'ERROR', message: error.message });
        }
    }
    else if (data.type === 'TRACK') {
        try {
            const imgData = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
            const frame = self.cv.matFromImageData(imgData);
            const frameGray = new self.cv.Mat();
            self.cv.cvtColor(frame, frameGray, self.cv.COLOR_RGBA2GRAY);

            self.cv.calcOpticalFlowPyrLK(
                oldGray, frameGray, p0, p1, st, err, winSize, maxLevel, criteria
            );

            let status = st.data[0];
            let newX = data.lastX;
            let newY = data.lastY;

            if (status === 1) {
                newX = p1.data32F[0];
                newY = p1.data32F[1];
                p0.data32F[0] = newX;
                p0.data32F[1] = newY;
            }

            oldGray.delete();
            oldGray = frameGray;
            frame.delete();

            self.postMessage({ type: 'TRACK_DONE', status: status, x: newX, y: newY });
        } catch (error) {
            self.postMessage({ type: 'ERROR', message: error.message });
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
                ellipse,
                score: found ? found.score : 0,
                method,
            });
        } catch (error) {
            if (gray) gray.delete();
            self.postMessage({ type: 'DETECT_PLATE_DONE', ellipse: null, score: 0, method: null, error: error.message });
        }
    }
    else if (data.type === 'CLEANUP') {
        if (oldGray) oldGray.delete();
        if (p0) p0.delete();
        oldGray = null;
        p0 = null;
    }
};

initCV();
