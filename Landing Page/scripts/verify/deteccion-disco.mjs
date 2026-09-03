/**
 * BANCO DE DETECCIÓN DEL DISCO
 * =====================================================================
 *
 * Hasta ahora el detector era la única pieza del módulo que NO se podía medir.
 * El resto se comprueba contra repeticiones sintéticas en Node; esto necesitaba
 * OpenCV, y OpenCV parecía cosa de navegador.
 *
 * No lo es: `@techstark/opencv-js` arranca en Node en ~900 ms. Con eso se puede
 * ejecutar `cv.worker.js` tal cual —el fichero de producción, sin tocarlo— sobre
 * fotogramas sintéticos en los que **el tamaño real del disco se conoce**, y
 * medir lo único que importa de la detección:
 *
 *     el error en la ALTURA de la elipse
 *
 * Y es la altura y no el centro ni la anchura porque de la altura sale la
 * escala del vídeo: un 10% de error ahí es un 10% en todas las velocidades,
 * todas las potencias y el 1RM estimado. Ver `plateGeometry.ts`.
 *
 *
 * QUÉ NO PRUEBA ESTO
 *
 * Un disco sintético dibujado con OpenCV tiene bordes más limpios que un disco
 * real con reflejos, polvo y desenfoque de movimiento. Los números de aquí son
 * un TECHO: si el detector falla en un caso sintético, en vídeo real falla
 * seguro. Al revés no: acertar aquí no garantiza acertar en un gimnasio.
 *
 * Sirve para lo que hace falta ahora — comparar ANTES y DESPUÉS de un cambio
 * sobre los mismos casos, que es la única forma de saber si una mejora mejora.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const cv = require('@techstark/opencv-js');

await new Promise(resolve => {
    if (cv.Mat) return resolve();
    cv.onRuntimeInitialized = resolve;
});

// =====================================================================
// CARGAR EL WORKER DE PRODUCCIÓN, SIN MODIFICARLO
// =====================================================================

/** `ImageData` no existe en Node y el worker lo construye. Basta la forma. */
class FakeImageData {
    constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
    }
}

const workerSource = readFileSync(
    new URL('../../src/lib/cv/cv.worker.js', import.meta.url), 'utf8'
);

let pending = null;
const sandbox = {
    cv,
    ImageData: FakeImageData,
    postMessage: msg => { if (pending) pending(msg); },
    setInterval, clearInterval, setTimeout, clearTimeout,
    console,
    onmessage: null,
    // El worker se trae OpenCV con `importScripts('/opencv.js')`, que es la
    // forma de cargar un script en un Worker del navegador. Aquí ya está
    // cargado desde `node_modules`, así que la llamada sobra — pero tiene que
    // existir, porque el worker de producción se ejecuta TAL CUAL. Modificarlo
    // para que se deje probar convertiría el banco en una prueba de otro
    // fichero, que es exactamente lo que no sirve de nada.
    importScripts: () => {},
};
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(workerSource, sandbox);

/** Manda un mensaje al worker y espera su respuesta. */
function ask(message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('el worker no ha contestado')), 20000);
        pending = msg => {
            if (msg.type === 'READY') return;          // el aviso de arranque
            clearTimeout(timer);
            pending = null;
            resolve(msg);
        };
        sandbox.onmessage({ data: message });
    });
}

// =====================================================================
// FABRICAR FOTOGRAMAS CON UN DISCO DE TAMAÑO CONOCIDO
// =====================================================================

const W = 1280;
const H = 720;

/** Colores de discos de competición, en RGBA. */
const PLATE_COLOURS = {
    rojo: [190, 40, 35],
    azul: [30, 70, 165],
    amarillo: [215, 185, 40],
    verde: [30, 130, 70],
    negro: [28, 28, 30],
};

/**
 * Dibuja un fotograma de gimnasio con un disco.
 *
 * Devuelve la imagen y la VERDAD: centro, semiejes y altura del disco. Se
 * dibuja con OpenCV en vez de a mano porque `cv.ellipse` pone exactamente la
 * elipse que se le pide, así que la verdad es exacta por construcción.
 */
function makeFrame({
    colour = 'rojo',
    // Altura del disco en píxeles. Es la magnitud que fija la escala.
    plateHeight = 200,
    // Anchura / altura. 1 es cámara perpendicular; 0,5 son ~60° de giro.
    squash = 1.0,
    brightness = 90,
    // Tapa la parte de abajo del disco, como una pierna o el rack.
    occlusion = 0,
    // Otras cosas redondas en el fondo, para que tenga con qué confundirse.
    clutter = false,
    angleDeg = 0,
    cx = W / 2,
    cy = H / 2,
} = {}) {
    const img = new cv.Mat(H, W, cv.CV_8UC4, new cv.Scalar(brightness, brightness, brightness + 4, 255));

    // Pared con estructura: si el detector se agarra a esto, se nota.
    for (let x = 0; x < W; x += 90) {
        cv.line(img, new cv.Point(x, 0), new cv.Point(x, H),
            new cv.Scalar(brightness + 18, brightness + 18, brightness + 20, 255), 2);
    }
    // Suelo
    cv.rectangle(img, new cv.Point(0, H - 120), new cv.Point(W, H),
        new cv.Scalar(brightness - 25, brightness - 22, brightness - 20, 255), -1);

    if (clutter) {
        // Un reloj de pared y otro disco al fondo, ambos redondos y del orden
        // de tamaño equivocado. Es lo que hay en cualquier gimnasio.
        cv.circle(img, new cv.Point(180, 140), Math.round(plateHeight * 0.32),
            new cv.Scalar(240, 240, 235, 255), -1);
        cv.circle(img, new cv.Point(180, 140), Math.round(plateHeight * 0.32),
            new cv.Scalar(40, 40, 40, 255), 3);
        cv.circle(img, new cv.Point(1120, 560), Math.round(plateHeight * 0.75),
            new cv.Scalar(60, 60, 65, 255), -1);
    }

    const b = plateHeight / 2;              // semieje vertical: LA VERDAD
    const a = b * squash;                   // semieje horizontal
    const rgb = PLATE_COLOURS[colour];
    const centre = new cv.Point(Math.round(cx), Math.round(cy));
    const axes = new cv.Size(Math.round(a), Math.round(b));

    cv.ellipse(img, centre, axes, angleDeg, 0, 360, new cv.Scalar(...rgb, 255), -1);
    // Aro exterior algo más oscuro, como el borde de goma de un bumper.
    cv.ellipse(img, centre, axes, angleDeg, 0, 360,
        new cv.Scalar(rgb[0] * 0.55, rgb[1] * 0.55, rgb[2] * 0.55, 255), 4);
    // Buje metálico
    cv.ellipse(img, centre, new cv.Size(Math.round(a * 0.28), Math.round(b * 0.28)),
        angleDeg, 0, 360, new cv.Scalar(150, 150, 155, 255), -1);

    // Radios y tornillos: textura para que el flujo óptico tenga de qué
    // agarrarse, y para que el disco no sea un blob liso.
    for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        cv.line(img,
            new cv.Point(Math.round(cx + Math.cos(t) * a * 0.40), Math.round(cy + Math.sin(t) * b * 0.40)),
            new cv.Point(Math.round(cx + Math.cos(t) * a * 0.86), Math.round(cy + Math.sin(t) * b * 0.86)),
            new cv.Scalar(235, 235, 230, 255), 3);
    }
    for (let i = 0; i < 10; i++) {
        const t = (i / 10) * Math.PI * 2 + 0.25;
        cv.circle(img,
            new cv.Point(Math.round(cx + Math.cos(t) * a * 0.62), Math.round(cy + Math.sin(t) * b * 0.62)),
            4, new cv.Scalar(250, 250, 245, 255), -1);
    }

    if (occlusion > 0) {
        // Una pierna por delante de la parte baja del disco.
        const top = Math.round(cy + b - plateHeight * occlusion);
        cv.rectangle(img, new cv.Point(Math.round(cx - a * 0.55), top),
            new cv.Point(Math.round(cx + a * 0.55), Math.round(cy + b + 30)),
            new cv.Scalar(70, 62, 58, 255), -1);
    }

    const data = new Uint8ClampedArray(img.data);
    img.delete();

    return { data, truth: { cx, cy, plateHeight, a, b } };
}

// =====================================================================
// EL BARRIDO
// =====================================================================

const CASES = [];
for (const colour of Object.keys(PLATE_COLOURS)) {
    for (const plateHeight of [110, 200, 320]) {
        for (const squash of [1.0, 0.75, 0.5]) {
            CASES.push({ colour, plateHeight, squash, name: `${colour} h=${plateHeight} sq=${squash}` });
        }
    }
}
// Casos difíciles a propósito, encima del barrido regular.
CASES.push({ colour: 'negro', plateHeight: 200, squash: 1, brightness: 38, name: 'negro en gimnasio oscuro' });
CASES.push({ colour: 'rojo', plateHeight: 200, squash: 1, brightness: 38, name: 'rojo en gimnasio oscuro' });
CASES.push({ colour: 'azul', plateHeight: 200, squash: 0.8, occlusion: 0.25, name: 'azul con pierna delante (25%)' });
CASES.push({ colour: 'rojo', plateHeight: 200, squash: 0.8, occlusion: 0.4, name: 'rojo con pierna delante (40%)' });
CASES.push({ colour: 'amarillo', plateHeight: 180, squash: 1, clutter: true, name: 'amarillo con reloj y otro disco' });
CASES.push({ colour: 'negro', plateHeight: 150, squash: 0.7, clutter: true, brightness: 50, name: 'negro difícil: oscuro + estorbos' });
CASES.push({ colour: 'verde', plateHeight: 200, squash: 1, angleDeg: 18, name: 'verde con la cámara inclinada' });

const CON_PISTA = process.argv.includes('--con-pista');

console.log(`\nDETECCIÓN DEL DISCO — ${CASES.length} casos` +
    `${CON_PISTA ? ', CON pista del usuario' : ', sin pista (detección automática)'}\n`);

let detectados = 0;
const errores = [];
const fallos = [];

for (const c of CASES) {
    const { data, truth } = makeFrame(c);

    const hint = CON_PISTA ? { hintX: truth.cx, hintY: truth.cy } : {};
    const res = await ask({
        type: 'DETECT_PLATE', id: 1,
        buffer: data.buffer, width: W, height: H,
        ...hint,
    });

    if (!res.ellipse) {
        fallos.push(c.name);
        console.log(` NO LO VE  ${c.name}`);
        continue;
    }

    // La altura de la elipse en vertical. Con la elipse girada, el semieje
    // vertical no es `height/2`: es la proyección. Misma cuenta que hace
    // `plateGeometry.ts`, para medir lo que de verdad se usa.
    const t = (res.ellipse.angleDeg * Math.PI) / 180;
    const halfV = Math.sqrt(
        (res.ellipse.width / 2) ** 2 * Math.sin(t) ** 2 +
        (res.ellipse.height / 2) ** 2 * Math.cos(t) ** 2
    );
    const medida = halfV * 2;

    // La verdad, proyectada igual: con el disco girado, su extensión vertical
    // tampoco es `plateHeight`.
    const tv = ((c.angleDeg ?? 0) * Math.PI) / 180;
    const verdadV = 2 * Math.sqrt(truth.a ** 2 * Math.sin(tv) ** 2 + truth.b ** 2 * Math.cos(tv) ** 2);

    const err = ((medida - verdadV) / verdadV) * 100;
    const dCentro = Math.hypot(res.ellipse.cx - truth.cx, res.ellipse.cy - truth.cy);

    detectados++;
    errores.push({ name: c.name, err, dCentro, score: res.score, method: res.method });

    const marca = Math.abs(err) <= 5 ? '  ok  ' : Math.abs(err) <= 12 ? ' flojo' : ' MAL  ';
    console.log(`${marca} ${c.name.padEnd(38)} altura ${err >= 0 ? '+' : ''}${err.toFixed(1)}% ` +
        `· centro ${dCentro.toFixed(0)} px · ${res.method} ${res.score.toFixed(2)}`);
}

// =====================================================================
// RESUMEN
// =====================================================================

const abs = errores.map(e => Math.abs(e.err));
const media = abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : 0;
const sesgo = errores.length ? errores.reduce((a, e) => a + e.err, 0) / errores.length : 0;
const buenos = abs.filter(v => v <= 5).length;
const utiles = abs.filter(v => v <= 12).length;

console.log('\n' + '='.repeat(64));
console.log(`Detectados          ${detectados}/${CASES.length}  (${((detectados / CASES.length) * 100).toFixed(0)}%)`);
console.log(`Altura dentro de ±5%   ${buenos}/${CASES.length}  ← escala utilizable`);
console.log(`Altura dentro de ±12%  ${utiles}/${CASES.length}`);
console.log(`Error absoluto medio   ${media.toFixed(1)}%`);
console.log(`Sesgo                  ${sesgo >= 0 ? '+' : ''}${sesgo.toFixed(1)}%`);
if (fallos.length) console.log(`\nNo detectados:\n  · ${fallos.join('\n  · ')}`);
const peores = [...errores].sort((a, b) => Math.abs(b.err) - Math.abs(a.err)).slice(0, 5);
if (peores.length) {
    console.log('\nPeores medidas:');
    for (const p of peores) console.log(`  · ${p.name}: ${p.err >= 0 ? '+' : ''}${p.err.toFixed(1)}%`);
}
console.log('='.repeat(64) + '\n');
