#!/usr/bin/env node
/**
 * PROPAGAR UN ARREGLO DE LA RAÍZ A LAS COPIAS POR PRODUCTO.
 * =====================================================================
 *
 * El 3 de septiembre de 2026 el repositorio se partió en copias completas
 * por producto ("Landing Page", "APP Iphone", "APP Android", "APP
 * Windows"), cada una con su propio `src/`. No hay paquete compartido ni
 * enlaces simbólicos: son copias literales. Un arreglo del código de
 * aplicación hay que aplicarlo hasta cinco veces, y hacerlo a mano con
 * `cp` ha destruido trabajo antes —`APP Android/src/lib/plataforma.ts` no
 * existe en las demás y su `authRedirect.ts` está reescrito para el
 * esquema propio de OAuth—.
 *
 * ESTE GUION NO COPIA A CIEGAS.
 *
 * Antes de escribir nada comprueba que la copia de destino sigue siendo
 * IGUAL a la versión de la que partió (`HEAD`, o la referencia que se le
 * pase). Si la copia ha divergido por su cuenta, se niega y lo dice: ese
 * fichero hay que mirarlo a mano.
 *
 * FINES DE LÍNEA
 *
 * Las copias se guardaron con CRLF y la raíz usa LF. Eso hacía que
 * `diff -rq` marcara como "distintos" 63, 77, 80 y 165 ficheros que en
 * realidad son idénticos, y escondía la divergencia de verdad entre el
 * ruido. Aquí la comparación ignora el fin de línea y la escritura
 * RESPETA el que ya usaba el fichero de destino, para no volver a
 * ensuciar el diff.
 *
 * LIMITACIÓN CONOCIDA: LA REFERENCIA ES `HEAD`, NO "LO QUE HABÍA ANTES"
 *
 * La comprobación de divergencia compara la copia con la versión del ÚLTIMO
 * COMMIT. Si en la misma sesión, sin haber hecho commit, se propaga dos
 * veces, la segunda vuelta marca como "divergidos" los ficheros que la
 * primera acaba de escribir: ya no coinciden con `HEAD` porque los cambió
 * este mismo guion.
 *
 * No es un fallo que convenga "arreglar" relajando la comprobación —eso
 * quitaría la única red que impide pisar el trabajo propio de una copia—.
 * Lo correcto es mirar el diff antes de forzar:
 *
 *     diff --strip-trailing-cr src/x.tsx "APP Iphone/src/x.tsx"
 *
 * Si TODAS las líneas distintas son `<` (solo existen en la raíz), la copia
 * está simplemente por detrás y `--forzar` es seguro. Si aparece alguna `>`
 * que no sea la versión vieja de una línea modificada, esa copia tiene algo
 * propio y hay que fusionarlo a mano.
 *
 * USO
 *
 *   node scripts/propagar.mjs --check                    (solo informa)
 *   node scripts/propagar.mjs src/App.tsx src/lib/sesion.ts
 *   node scripts/propagar.mjs --destinos="Landing Page,APP Iphone" src/App.tsx
 *
 * Sin `--destinos` va a las dos copias que sirven tráfico hoy
 * (anvilstrength.es y la webapp). Android y Windows se compilan a mano, así
 * que se piden explícitamente.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Las que sirven tráfico. Android y Windows se piden con `--destinos`. */
const DESTINOS_POR_DEFECTO = ['Landing Page', 'APP Iphone'];
const TODOS_LOS_DESTINOS = ['Landing Page', 'APP Iphone', 'APP Android', 'APP Windows'];

const args = process.argv.slice(2);
const soloComprobar = args.includes('--check');
const forzar = args.includes('--forzar');
const refArg = args.find((a) => a.startsWith('--ref='));
const REF = refArg ? refArg.slice('--ref='.length) : 'HEAD';
const destArg = args.find((a) => a.startsWith('--destinos='));
const destinos = destArg
    ? destArg.slice('--destinos='.length).split(',').map((s) => s.trim()).filter(Boolean)
    : DESTINOS_POR_DEFECTO;

const ficheros = args.filter((a) => !a.startsWith('--'));

/** Contenido de un fichero en una referencia de git, o `null` si no estaba. */
function enGit(ruta, ref) {
    try {
        return execFileSync('git', ['show', `${ref}:${ruta}`], {
            cwd: RAIZ,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch {
        return null;
    }
}

const normalizar = (t) => t.replace(/\r\n/g, '\n');
const usaCrlf = (t) => t.includes('\r\n');
const aCrlf = (t) => t.replace(/\r?\n/g, '\r\n');

/**
 * Los ficheros que la rama ha cambiado respecto a `REF` y que viven bajo
 * `src/`. Es lo que se propaga cuando no se nombra ninguno.
 */
function ficherosCambiados() {
    const salida = execFileSync('git', ['diff', '--name-only', REF, '--', 'src'], {
        cwd: RAIZ,
        encoding: 'utf8',
    });
    const seguimiento = salida.split('\n').map((s) => s.trim()).filter(Boolean);
    // Los sin seguir (ficheros nuevos) no salen en `git diff`.
    const nuevos = execFileSync('git', ['ls-files', '--others', '--exclude-standard', 'src'], {
        cwd: RAIZ,
        encoding: 'utf8',
    })
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    return [...new Set([...seguimiento, ...nuevos])];
}

const lista = ficheros.length > 0 ? ficheros : ficherosCambiados();

if (lista.length === 0) {
    console.log('No hay nada que propagar: `src/` no tiene cambios respecto a ' + REF + '.');
    process.exit(0);
}

console.log(`\nPropagando ${lista.length} fichero(s) desde la raíz (ref de partida: ${REF})`);
console.log(`Destinos: ${destinos.join(' · ')}${soloComprobar ? '   [SOLO COMPROBACIÓN]' : ''}\n`);

let escritos = 0;
let bloqueados = 0;
let nuevos = 0;

for (const rutaRel of lista) {
    const origen = join(RAIZ, rutaRel);
    if (!existsSync(origen)) {
        console.log(`  ?  ${rutaRel} — no existe en la raíz, se omite`);
        continue;
    }
    const contenidoNuevo = readFileSync(origen, 'utf8');
    const contenidoBase = enGit(rutaRel, REF);

    for (const destino of destinos) {
        const rutaDestino = join(RAIZ, destino, rutaRel);
        const etiqueta = `${destino}/${rutaRel}`;

        if (!existsSync(rutaDestino)) {
            if (soloComprobar) {
                console.log(`  +  ${etiqueta} — NUEVO (se crearía)`);
            } else {
                writeFileSync(rutaDestino, contenidoNuevo, 'utf8');
                console.log(`  +  ${etiqueta} — creado`);
            }
            nuevos++;
            continue;
        }

        const actual = readFileSync(rutaDestino, 'utf8');

        // Ya está al día: nada que hacer.
        if (normalizar(actual) === normalizar(contenidoNuevo)) {
            continue;
        }

        // ¿La copia sigue siendo la de partida, o ha ido por su cuenta?
        const intacta = contenidoBase !== null && normalizar(actual) === normalizar(contenidoBase);

        if (!intacta && !forzar) {
            console.log(`  !  ${etiqueta} — HA DIVERGIDO por su cuenta. NO se toca; revísalo a mano.`);
            bloqueados++;
            continue;
        }

        if (soloComprobar) {
            console.log(`  →  ${etiqueta} — se actualizaría${intacta ? '' : ' (FORZADO sobre una copia divergente)'}`);
            escritos++;
            continue;
        }

        // Respeta el fin de línea que ya usaba el destino.
        const salida = usaCrlf(actual) ? aCrlf(contenidoNuevo) : contenidoNuevo;
        writeFileSync(rutaDestino, salida, 'utf8');
        console.log(`  ✓  ${etiqueta}${intacta ? '' : '  (FORZADO)'}`);
        escritos++;
    }
}

console.log(
    `\n${soloComprobar ? 'Se actualizarían' : 'Actualizados'}: ${escritos}` +
    `${nuevos ? ` · nuevos: ${nuevos}` : ''}` +
    `${bloqueados ? ` · BLOQUEADOS por divergencia: ${bloqueados}` : ''}\n`
);

if (bloqueados > 0) {
    console.log('Los bloqueados hay que mirarlos uno a uno: la copia tiene cambios propios que');
    console.log('sobrescribir destruiría. Con `--forzar` se sobrescriben igualmente.\n');
}

// Recordatorio de lo que este guion NO hace.
if (!soloComprobar && escritos > 0) {
    const faltan = TODOS_LOS_DESTINOS.filter((d) => !destinos.includes(d));
    if (faltan.length > 0) {
        console.log(`Sin tocar: ${faltan.join(' · ')}. Se compilan a mano; pásalos con --destinos cuando toque.\n`);
    }
}
