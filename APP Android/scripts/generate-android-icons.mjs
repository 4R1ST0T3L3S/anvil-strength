#!/usr/bin/env node
/**
 * ICONO Y PANTALLA DE ARRANQUE DEL APK — yunque blanco sobre negro
 *
 *     node scripts/generate-android-icons.mjs
 *
 * EL YUNQUE ES EL DE LA WEB: public/logo-dark-removebg-preview.png, el mismo
 * fichero que pinta la cabecera (PublicHeader), la mascota (AnvilMascot), la
 * cuenta atrás y la tienda. Blanco con transparencia REAL.
 *
 * Descartados, y por qué, para que nadie vuelva a probarlos:
 *   · public/logo.svg y scripts/generate-icons.mjs — el yunque alargado de
 *     los iconos web, no el de la marca actual.
 *   · src/components/ui/AnvilLogoSVG.tsx — un vector antiguo (solo lo usan
 *     los juegos).
 *   · public/logo-dark.png — lleva el damero de transparencia PINTADO dentro
 *     de la imagen; compuesto sobre negro sale el damero.
 *
 * Escribe en android/app/src/main/res/:
 *
 *   mipmap-<densidad>/ic_launcher.png             icono clásico (Android < 8):
 *                                                 yunque blanco sobre negro,
 *                                                 esquinas redondeadas
 *   mipmap-<densidad>/ic_launcher_round.png       el mismo, circular
 *   mipmap-<densidad>/ic_launcher_foreground.png  capa frontal del icono
 *                                                 ADAPTATIVO (Android 8+): solo
 *                                                 el yunque, fondo transparente,
 *                                                 dentro de la zona segura
 *   values/ic_launcher_background.xml             capa de fondo del adaptativo:
 *                                                 negro
 *   drawable-<...>/splash.png                     pantalla de arranque: yunque
 *                                                 blanco sobre negro
 *
 * y en android/play/ el icono de 512 y la imagen destacada de 1024×500 que
 * pide la ficha de Google Play.
 *
 * ICONO ADAPTATIVO: Android recorta la capa frontal con la máscara que elija
 * el fabricante (círculo, cuadrado redondeado, lágrima...). Solo se garantiza
 * visible el círculo central de 66dp de los 108dp del lienzo, así que el
 * yunque va pequeño a propósito (50 % del ancho). Más grande y en un Pixel se
 * come las esquinas.
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(raiz, 'public', 'logo-dark-removebg-preview.png');
const res = path.join(raiz, 'android', 'app', 'src', 'main', 'res');
const play = path.join(raiz, 'android', 'play');

/** Negro del icono y del arranque: el mismo `backgroundColor` de SplashScreen en capacitor.config.ts. */
const NEGRO = '#0d0f11';

// =====================================================================
// EL DIBUJO
// =====================================================================

/**
 * El yunque recortado a su caja (el PNG trae aire alrededor). `trim` recorta
 * por el canal alfa, que aquí es de verdad. Se hace UNA vez.
 */
const yunqueRecortado = await sharp(LOGO).ensureAlpha().trim().png().toBuffer();
const { width: yW, height: yH } = await sharp(yunqueRecortado).metadata();
if (!yW || !yH || yW < 100) {
    throw new Error(`El recorte de ${LOGO} ha salido raro (${yW}x${yH}): ¿ha perdido la transparencia?`);
}

/**
 * El yunque escalado para que su ANCHO sea `proporcion` del lado menor del
 * lienzo. Manda el ancho porque el dibujo es apaisado.
 */
function yunque(ancho, alto, proporcion) {
    const escala = (Math.min(ancho, alto) * proporcion) / yW;
    return sharp(yunqueRecortado)
        .resize(Math.max(1, Math.round(yW * escala)), Math.max(1, Math.round(yH * escala)), { fit: 'fill', kernel: 'lanczos3' })
        .png()
        .toBuffer();
}

/** Fondo (rectángulo redondeado, círculo, lleno o nada) rasterizado desde SVG al tamaño exacto. */
function fondo(ancho, alto, forma) {
    const lado = Math.min(ancho, alto);
    const dibujo = forma === 'redondo'
        ? `<circle cx="${ancho / 2}" cy="${alto / 2}" r="${lado / 2}" fill="${NEGRO}"/>`
        : forma === 'cuadrado'
            ? `<rect width="${ancho}" height="${alto}" rx="${Math.round(lado * 0.2)}" fill="${NEGRO}"/>`
            : forma === 'lleno'
                ? `<rect width="${ancho}" height="${alto}" fill="${NEGRO}"/>`
                : '';
    return sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${dibujo}</svg>`
    ), { density: 384 }).resize(ancho, alto, { fit: 'fill' }).ensureAlpha();
}

async function componer(ancho, alto, { forma, proporcion }) {
    return fondo(ancho, alto, forma)
        .composite([{ input: await yunque(ancho, alto, proporcion), gravity: 'centre' }])
        .png({ compressionLevel: 9 })
        .toBuffer();
}

const iconoCuadrado = (lado) => componer(lado, lado, { forma: 'cuadrado', proporcion: 0.72 });
const iconoRedondo = (lado) => componer(lado, lado, { forma: 'redondo', proporcion: 0.64 });
const capaFrontal = (lado) => componer(lado, lado, { forma: 'ninguno', proporcion: 0.5 });
const splash = (ancho, alto) => componer(ancho, alto, { forma: 'lleno', proporcion: 0.36 });

// =====================================================================
// GENERACIÓN
// =====================================================================
const escribir = (relativo, datos) => {
    const destino = path.join(res, relativo);
    mkdirSync(path.dirname(destino), { recursive: true });
    writeFileSync(destino, datos);
    console.log(`  ${relativo.padEnd(44)} ${String(datos.length).padStart(7)} bytes`);
};

console.log(`\nLogo: ${path.relative(raiz, LOGO)} (${yW}x${yH} tras recortar). Fondo: ${NEGRO}\n`);

// Iconos por densidad. 48dp el clásico, 108dp la capa del adaptativo.
const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [nombre, factor] of Object.entries(DENSIDADES)) {
    const lado = Math.round(48 * factor);
    const ladoAdaptativo = Math.round(108 * factor);
    escribir(`mipmap-${nombre}/ic_launcher.png`, await iconoCuadrado(lado));
    escribir(`mipmap-${nombre}/ic_launcher_round.png`, await iconoRedondo(lado));
    escribir(`mipmap-${nombre}/ic_launcher_foreground.png`, await capaFrontal(ladoAdaptativo));
}

writeFileSync(
    path.join(res, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <!-- Capa de fondo del icono adaptativo. Generado por scripts/generate-android-icons.mjs -->\n    <color name="ic_launcher_background">${NEGRO.toUpperCase()}</color>\n</resources>\n`
);
console.log(`  values/ic_launcher_background.xml              ${NEGRO}`);

// Pantalla de arranque: las mismas medidas que trae la plantilla de Capacitor.
const SPLASH = {
    'drawable': [480, 320],
    'drawable-land-mdpi': [480, 320],
    'drawable-land-hdpi': [800, 480],
    'drawable-land-xhdpi': [1280, 720],
    'drawable-land-xxhdpi': [1600, 960],
    'drawable-land-xxxhdpi': [1920, 1280],
    'drawable-port-mdpi': [320, 480],
    'drawable-port-hdpi': [480, 800],
    'drawable-port-xhdpi': [720, 1280],
    'drawable-port-xxhdpi': [960, 1600],
    'drawable-port-xxxhdpi': [1280, 1920],
};
for (const [carpeta, [ancho, alto]] of Object.entries(SPLASH)) {
    escribir(`${carpeta}/splash.png`, await splash(ancho, alto));
}

// Ficha de Google Play (no van dentro del APK).
mkdirSync(play, { recursive: true });
writeFileSync(path.join(play, 'icono-512.png'), await iconoCuadrado(512));
writeFileSync(path.join(play, 'imagen-destacada-1024x500.png'), await splash(1024, 500));
console.log(`  android/play/icono-512.png y imagen-destacada-1024x500.png`);

console.log('\nListo. Recompila el APK para verlo: cd android && ./gradlew assembleDebug\n');
