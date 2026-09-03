/**
 * OPTIMIZAR LAS IMÁGENES DE public/
 * =====================================================================
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * `public/` pesa 54 MB repartidos en 20 fotos, y ninguna se muestra al
 * tamaño al que se sirve. La peor: `athletes/pauca.jpg`, 5,85 MB a
 * 2668x4000 px, que el carrusel de la portada pinta en una tarjeta de
 * 280x350 CSS px. Aun contando una pantalla a 2x, se descargan unas
 * cincuenta veces más píxeles de los que llegan a verse.
 *
 * Vite copia `public/` tal cual: no la toca, no la comprime y no la
 * redimensiona. Así que esto no lo arregla ningún ajuste del empaquetador.
 * En un móvil con datos es la diferencia entre una portada que aparece y
 * una que se queda cargando.
 *
 *
 * POR QUÉ SE REESCRIBE EL MISMO FICHERO
 *
 * Podrían generarse `.webp` al lado y cambiar las rutas, pero esas rutas
 * están repartidas por la aplicación, por el HTML y por los datos, y cada
 * una que se escape queda como imagen rota. Reescribiendo el fichero en su
 * sitio, con su nombre y su extensión, NO hay que tocar ni una línea de
 * código: lo que cambia es lo que pesa.
 *
 * El original nunca se pierde. Se copia antes a `assets-originales/`, que
 * está FUERA de `public/` a propósito —lo que hay dentro de `public/` se
 * publica— y desde ahí se puede deshacer todo:
 *
 *     node scripts/optimizar-imagenes.mjs --restaurar
 *
 *
 * USO
 *
 *     node scripts/optimizar-imagenes.mjs              # simulacro, no toca nada
 *     node scripts/optimizar-imagenes.mjs --aplicar
 *     node scripts/optimizar-imagenes.mjs --restaurar
 */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC = 'public';
const RESPALDO = 'assets-originales';

/**
 * Techo de ancho. 1600px cubre la foto más grande que la aplicación llega a
 * enseñar —la portada, a ancho completo en un monitor— con margen para
 * pantallas de 2x. Las fotos de atleta se ven en tarjetas de 280px, así que
 * para ellas ya sobra mucho; el techo se aplica igual para no tener que
 * mantener una lista de excepciones que se quedaría desfasada al primer
 * rediseño.
 */
const ANCHO_MAX = 1600;
const CALIDAD = 82;

/** Por debajo de esto no compensa: el ahorro es ruido y se pierde nitidez. */
const MINIMO_BYTES = 150 * 1024;

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const restaurar = args.includes('--restaurar');

const mb = (n) => (n / 1048576).toFixed(2);

function recorrer(dir, salida = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(p, salida);
        else if (/\.(jpe?g|png)$/i.test(e.name)) salida.push(p);
    }
    return salida;
}

// =====================================================================

if (restaurar) {
    if (!fs.existsSync(RESPALDO)) {
        console.error(`No hay nada que restaurar: falta ${RESPALDO}/`);
        process.exit(1);
    }
    let n = 0;
    for (const origen of recorrer(RESPALDO)) {
        const destino = path.join(PUBLIC, path.relative(RESPALDO, origen));
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(origen, destino);
        n++;
    }
    console.log(`Restauradas ${n} imágenes desde ${RESPALDO}/`);
    process.exit(0);
}

const ficheros = recorrer(PUBLIC).filter(f => fs.statSync(f).size >= MINIMO_BYTES);

console.log(
    aplicar
        ? `Optimizando ${ficheros.length} imágenes (original a ${RESPALDO}/)…\n`
        : `SIMULACRO — no se toca nada. ${ficheros.length} imágenes candidatas.\n` +
          `Para aplicarlo: node scripts/optimizar-imagenes.mjs --aplicar\n`,
);

let antes = 0;
let despues = 0;
const filas = [];

for (const f of ficheros) {
    // El fichero se lee ENTERO a memoria y sharp trabaja sobre el búfer, no
    // sobre la ruta. Con `sharp(ruta)` la lectura es perezosa y en Windows el
    // descriptor sigue abierto cuando toca reescribir ese mismo fichero, así
    // que el `writeFileSync` moría con EBUSY/UNKNOWN a la segunda imagen.
    const datos = fs.readFileSync(f);
    const original = datos.length;
    const meta = await sharp(datos).metadata();
    const esPng = /\.png$/i.test(f);

    let pipeline = sharp(datos).rotate(); // `rotate()` aplica el EXIF y lo quita
    if (meta.width > ANCHO_MAX) {
        pipeline = pipeline.resize({ width: ANCHO_MAX, withoutEnlargement: true });
    }

    // Se conserva el FORMATO de origen, no se pasa todo a WebP: el nombre del
    // fichero no cambia, y un .png cuyo contenido es WebP funciona en el
    // navegador pero rompe cualquier herramienta que mire la extensión.
    //
    // El PNG mantiene la transparencia (los logos y los recortes de atleta la
    // necesitan); `palette: true` es lo que de verdad lo encoge, porque estas
    // son ilustraciones y recortes, no fotografías con degradados.
    const buffer = esPng
        ? await pipeline.png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer()
        : await pipeline.jpeg({ quality: CALIDAD, mozjpeg: true, progressive: true }).toBuffer();

    antes += original;

    // Si la optimización no gana nada, se deja el original en paz.
    if (buffer.length >= original) {
        despues += original;
        continue;
    }

    despues += buffer.length;
    filas.push({
        f: f.replace(/\\/g, '/'),
        de: original,
        a: buffer.length,
        px: `${meta.width}x${meta.height}`,
    });

    if (aplicar) {
        const respaldo = path.join(RESPALDO, path.relative(PUBLIC, f));
        fs.mkdirSync(path.dirname(respaldo), { recursive: true });
        if (!fs.existsSync(respaldo)) fs.copyFileSync(f, respaldo);
        fs.writeFileSync(f, buffer);
    }
}

filas.sort((a, b) => (b.de - b.a) - (a.de - a.a));
for (const r of filas) {
    console.log(
        `${mb(r.de).padStart(7)} MB -> ${mb(r.a).padStart(6)} MB  ` +
        `(${String(Math.round((1 - r.a / r.de) * 100)).padStart(3)}%)  ` +
        `${r.px.padStart(11)}  ${r.f}`,
    );
}

console.log(
    `\nTotal: ${mb(antes)} MB -> ${mb(despues)} MB  ` +
    `(${Math.round((1 - despues / antes) * 100)}% menos, ${mb(antes - despues)} MB ahorrados)`,
);
if (!aplicar) console.log('\nNo se ha modificado ningún fichero.');
