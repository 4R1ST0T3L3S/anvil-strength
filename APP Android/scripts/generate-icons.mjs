/**
 * ANVIL STRENGTH — GENERADOR DE ICONOS
 * =====================================================================
 *
 * QUÉ ARREGLA
 *
 * Los cuatro PNG de iconos del proyecto eran EL MISMO FICHERO: mismo hash,
 * mismos 3.604 bytes, mismos 180×180 píxeles. El manifiesto declaraba
 * 192×192 y 512×512, así que Android escalaba una imagen de 180 a 512 para
 * el icono de la app instalada. Y `favicon.ico`, declarado en
 * `includeAssets` de vite.config.ts, sencillamente no existía.
 *
 *
 * DE DÓNDE SALE EL DIBUJO
 *
 * De `public/logo.svg`, que es el yunque de la marca y ya se usa como icono
 * del navegador. No se inventa un icono nuevo: se usa el que ya hay.
 *
 *
 * POR QUÉ FONDO ROJO Y NO TRANSPARENTE
 *
 * El par `logo.svg` / `logo-black.svg` con `prefers-color-scheme` resuelve
 * bien el favicon vectorial: el yunque se pinta blanco sobre pestaña oscura
 * y negro sobre pestaña clara. Pero un `.ico` no admite consulta de medios,
 * y un yunque blanco sobre fondo transparente en una pestaña clara es un
 * icono INVISIBLE. Con el rojo de marca detrás se ve sobre cualquier fondo,
 * y a 16px un cuadrado rojo se distingue en una fila de veinte pestañas
 * mucho mejor que uno negro.
 *
 * El rojo no está escrito a mano: se DERIVA de `--brand` de tokens.css
 * (OKLCH) con la conversión de más abajo. Si mañana cambia el token, se
 * vuelve a lanzar este script y los iconos siguen a la marca.
 *
 *
 * POR QUÉ HAY UNA MASCARABLE DISTINTA
 *
 * Android recorta el icono con la forma que elija el fabricante — círculo,
 * cuadrado redondeado, gota. La zona segura es el círculo central del 80%:
 * lo que caiga fuera se puede perder. El icono normal lleva el yunque al
 * 68% del lienzo; el mascarable lo baja al 52% y sangra el rojo hasta el
 * borde, para que el recorte, caiga donde caiga, solo se coma fondo.
 *
 * Antes los dos eran el mismo fichero, declarado como `purpose: "any
 * maskable"` — es decir, se prometían las dos cosas y no se cumplía
 * ninguna: sin margen para el recorte, y con el yunque tocando el borde.
 *
 *
 *     node scripts/generate-icons.mjs
 *
 * No corre en el build. Se lanza a mano cuando cambia el logo o el rojo de
 * marca, y el resultado se sube al repositorio: son ficheros de `public/`.
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publico = path.join(raiz, 'public');

// =====================================================================
// OKLCH → sRGB
// =====================================================================
/**
 * El color de marca vive en `src/styles/tokens.css` como
 * `--brand: oklch(0.62 0.21 25)`. Aquí hace falta en hexadecimal porque
 * sharp compone píxeles, no CSS, así que se convierte en vez de copiarlo:
 * copiarlo sería crear un segundo sitio donde vive el rojo de Anvil.
 *
 * Matrices estándar de Björn Ottosson (OKLab → LMS → sRGB lineal).
 */
function oklchAHex(L, C, hGrados) {
    const h = (hGrados * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);

    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;

    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;

    const lineal = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];

    const canal = (v) => {
        // Codificación gamma de sRGB.
        const g = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, g)) * 255);
    };

    return '#' + lineal.map(canal).map((n) => n.toString(16).padStart(2, '0')).join('');
}

const ROJO = oklchAHex(0.62, 0.21, 25); // --brand
const NEGRO = oklchAHex(0.145, 0, 0); // --surface-sunken

// =====================================================================
// EL DIBUJO
// =====================================================================
/**
 * Se lee el `d` de los dos trazados de `public/logo.svg` en vez de
 * duplicarlos aquí. Mismo motivo que el color: una sola fuente de verdad.
 */
function trazadosDelLogo() {
    const svg = readFileSync(path.join(publico, 'logo.svg'), 'utf8');
    const d = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
    if (d.length < 2) {
        throw new Error(
            `public/logo.svg deberia tener 2 trazados y tiene ${d.length}. ` +
            `Si el logo ha cambiado, revisa este script antes de seguir.`
        );
    }
    return d;
}

const TRAZADOS = trazadosDelLogo();

/**
 * Compone el icono a un tamaño dado.
 *
 * `proporcion` es cuánto del lienzo ocupa el yunque. El SVG original tiene
 * un `viewBox` de 100×100 pero el dibujo real vive entre y=25 e y=85, así
 * que se recentra a mano: sin eso el yunque queda bajo dentro del cuadro.
 */
function iconoSvg(lado, { fondo, proporcion, radio }) {
    const dibujo = lado * proporcion;
    const escala = dibujo / 100;
    // El dibujo ocupa 10..90 en X y 25..85 en Y dentro del viewBox.
    const desplX = (lado - dibujo) / 2;
    const desplY = (lado - 60 * escala) / 2 - 25 * escala;

    const fondoForma = radio
        ? `<rect width="${lado}" height="${lado}" rx="${radio}" fill="${fondo}"/>`
        : `<rect width="${lado}" height="${lado}" fill="${fondo}"/>`;

    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">` +
        fondoForma +
        `<g transform="translate(${desplX} ${desplY}) scale(${escala})" fill="#ffffff">` +
        TRAZADOS.map((d) => `<path d="${d}"/>`).join('') +
        `</g></svg>`
    );
}

/**
 * `density` NO es calidad: es el multiplicador con el que sharp rasteriza un
 * SVG que trae `width`/`height` propios. A 384 (contra los 72 de por defecto)
 * un icono de 16px salía de 85, y el de 512 de 2731 — con la cabecera del ICO
 * jurando que dentro había un 16×16.
 *
 * Se mantiene alto A PROPÓSITO y se reduce después: rasterizar grande y
 * encoger con Lanczos da un borde mucho más limpio en el yunque a 16px que
 * rasterizar directamente a 16, donde el trazo diagonal se rompe.
 */
const png = (lado, opciones) =>
    sharp(iconoSvg(lado, opciones), { density: 384 })
        .resize(lado, lado, { fit: 'fill' })
        .png({ compressionLevel: 9 })
        .toBuffer();

// =====================================================================
// EMPAQUETADO .ICO
// =====================================================================
/**
 * sharp no sabe escribir `.ico`, y no hace falta una dependencia para esto:
 * el formato es una cabecera de 6 bytes, una entrada de 16 por imagen, y
 * los PNG pegados detrás. Windows admite PNG dentro de ICO desde Vista.
 */
function empaquetarIco(imagenes) {
    const cabecera = Buffer.alloc(6);
    cabecera.writeUInt16LE(0, 0); // reservado
    cabecera.writeUInt16LE(1, 2); // 1 = icono
    cabecera.writeUInt16LE(imagenes.length, 4);

    let desplazamiento = 6 + imagenes.length * 16;
    const entradas = imagenes.map(({ lado, datos }) => {
        const e = Buffer.alloc(16);
        e.writeUInt8(lado >= 256 ? 0 : lado, 0); // 0 significa 256
        e.writeUInt8(lado >= 256 ? 0 : lado, 1);
        e.writeUInt8(0, 2); // paleta: ninguna
        e.writeUInt8(0, 3); // reservado
        e.writeUInt16LE(1, 4); // planos
        e.writeUInt16LE(32, 6); // bits por pixel
        e.writeUInt32LE(datos.length, 8);
        e.writeUInt32LE(desplazamiento, 12);
        desplazamiento += datos.length;
        return e;
    });

    return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.datos)]);
}

// =====================================================================
// GENERACIÓN
// =====================================================================

const escribir = (nombre, datos) => {
    writeFileSync(path.join(publico, nombre), datos);
    console.log(`  ${nombre.padEnd(30)} ${String(datos.length).padStart(7)} bytes`);
};

console.log(`\nRojo de marca derivado de --brand: ${ROJO}`);
console.log(`Fondo oscuro derivado de --surface-sunken: ${NEGRO}\n`);

// Favicon: sin esquinas redondeadas, que el navegador ya lo pinta pequeño.
const ico = [16, 32, 48];
const imagenesIco = [];
for (const lado of ico) {
    imagenesIco.push({ lado, datos: await png(lado, { fondo: ROJO, proporcion: 0.72 }) });
}
escribir('favicon.ico', empaquetarIco(imagenesIco));

// iOS no aplica máscara: recorta él las esquinas. Sin redondeo propio.
escribir('apple-touch-icon.png', await png(180, { fondo: ROJO, proporcion: 0.66 }));

// PWA "any": se muestra tal cual, así que lleva su propio redondeo.
escribir('pwa-192x192.png', await png(192, { fondo: ROJO, proporcion: 0.66, radio: 38 }));
escribir('pwa-512x512.png', await png(512, { fondo: ROJO, proporcion: 0.66, radio: 102 }));

// Mascarable: rojo a sangre y yunque pequeño, dentro del círculo seguro.
escribir('pwa-maskable-512x512.png', await png(512, { fondo: ROJO, proporcion: 0.52 }));

console.log('\nListo. Recuerda: estos ficheros van al repositorio.\n');
