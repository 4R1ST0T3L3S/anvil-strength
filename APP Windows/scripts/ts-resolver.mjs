/**
 * ANVIL STRENGTH — EJECUTAR EL CÓDIGO DE `src/` EN NODE
 * =====================================================================
 *
 * PARA QUÉ
 *
 * El compromiso de método del módulo de análisis (§13 de
 * `docs/AUDITORIA_PWR_2.0.md`) es que **todo cambio en el cálculo se mide
 * contra repeticiones sintéticas antes de darlo por bueno**. El analizador
 * siempre devuelve números bonitos, así que mirarlo por pantalla no prueba
 * nada: hay que construir una repetición de verdad conocida, pasarla por el
 * código real y comparar.
 *
 * Eso se hace con `node --experimental-strip-types`, que ejecuta TypeScript
 * directamente. El proyecto no tiene runner de tests y no hace falta ninguno.
 *
 *
 * EL PROBLEMA QUE RESUELVE ESTE FICHERO
 *
 * Node resuelve módulos como Node, no como un empaquetador. Vite y TypeScript
 * aceptan `import { x } from './cosa'`; Node exige `'./cosa.ts'`. Así que en
 * cuanto un módulo de `src/` importa a otro —que es lo normal— deja de poder
 * ejecutarse en Node y el banco de pruebas no arranca:
 *
 *     ERR_MODULE_NOT_FOUND .../lib/vbt/analysis
 *
 * La salida fácil sería escribir la extensión en el código de la aplicación.
 * Es mala idea: contamina el código de producción con un detalle que solo
 * existe para las pruebas, es incoherente con los otros cientos de imports del
 * proyecto, y el día que alguien lo "limpie" el banco se cae sin que nada lo
 * avise.
 *
 * Este resolvedor lo arregla del lado de las pruebas y para TODO el proyecto:
 * cuando un import relativo no existe tal cual, prueba `.ts`, `.tsx`, `.js` y
 * el `index` del directorio, igual que hace el empaquetador.
 *
 *
 * CÓMO SE USA
 *
 *     node --experimental-strip-types --import ./scripts/ts-resolver.mjs mi-banco.mjs
 *
 * Y dentro del banco se importa el código real por su ruta:
 *
 *     const { estimate1RM } = await import('../src/lib/cv/pwrMath.ts');
 *
 *
 * LO QUE **NO** HACE
 *
 * No resuelve alias (`@/...`) ni paquetes de `node_modules` que no estén
 * instalados, ni sustituye a Vite. No hace falta: lo que se prueba así es
 * cálculo puro —`lib/cv/`, `lib/vbt/`, `lib/calibration/`—, que no toca ni
 * React ni Supabase justamente para poder comprobarse.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

/** Lo que se prueba, en orden, cuando el especificador no existe tal cual. */
const CANDIDATES = ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js'];

export async function resolve(specifier, context, nextResolve) {
    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        // Solo se interviene cuando el fallo es "no lo encuentro" y el import
        // es relativo. Cualquier otro error se deja subir tal cual: tragárselos
        // convertiría un fallo de sintaxis en un críptico "módulo no
        // encontrado", que es peor que el error original.
        const relative = specifier.startsWith('./') || specifier.startsWith('../');
        if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !relative || !context.parentURL) {
            throw error;
        }

        const base = new URL(specifier, context.parentURL);
        for (const suffix of CANDIDATES) {
            const candidate = new URL(base.href + suffix);
            if (existsSync(fileURLToPath(candidate))) {
                return nextResolve(candidate.href, context);
            }
        }

        throw error;
    }
}

// Autorregistro: así basta con `--import ./scripts/ts-resolver.mjs` en vez de
// tener que escribir un fichero de arranque aparte en cada banco de pruebas.
register(pathToFileURL(import.meta.filename));
