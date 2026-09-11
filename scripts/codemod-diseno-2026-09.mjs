/**
 * Codemod del sistema de diseño (septiembre 2026). POR LÍNEAS.
 *
 * Reescribe SOLO listas de clases de Tailwind dentro de literales de cadena
 * que empiezan y acaban en la misma línea (más las líneas que son solo una
 * lista de clases, dentro de plantillas multilínea):
 *   · tipografía gritada  → font-black/extrabold ⇒ font-semibold; fuera
 *     uppercase, tracking-wide(r|st), italic; tracking-tighter ⇒ tight.
 *   · tamaños de píxel     → text-[9-11px] ⇒ text-t-2xs.
 *   · colores sin tema     → white/black/gray/zinc/red ⇒ tokens.
 *   · radios y sombras     → rounded-3xl ⇒ rounded-card; shadow-2xl ⇒ overlay.
 *
 * No toca: landing, legal, pie/cabecera públicos, AuthModal/CookieNotice
 * (registro de marca), los editores de PDF (simulan papel blanco) ni los
 * juegos (fondos negros a propósito).
 *
 * Uso: node codemod-tipografia.mjs [--dry] [--root <dir>]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXCLUIR = [
    'src/features/landing/',
    'src/features/legal/',
    'src/features/reviews/',
    'src/components/layout/Public',
    'src/features/auth/components/AuthModal.tsx',
    'src/components/ui/CookieNotice.tsx',
    'src/components/layout/RegistroMarca.tsx',
    'src/features/games/',
    'src/features/nutrition/components/PDFEditorModal.tsx',
    'src/features/nutrition/components/PlanExportPDF.tsx',
    'src/features/training/components/TrainingPDFEditorModal.tsx',
    'src/features/profile/components/PdfThemeSettings.tsx',
    'src/lib/pdf/',
];

export const excluido = (rel) => EXCLUIR.some((e) => rel.startsWith(e) || rel === e);

export function* archivos(dir) {
    for (const nombre of readdirSync(dir)) {
        const p = join(dir, nombre);
        const st = statSync(p);
        if (st.isDirectory()) yield* archivos(p);
        else if (/\.tsx$/.test(nombre)) yield p;
    }
}

const PREFIJOS = /(^|\s)(flex|grid|text-|bg-|font-|rounded|p-\d|px-|py-|pt-|pb-|pl-|pr-|m-\d|mx-|my-|mt-|mb-|ml-|mr-|w-|h-|gap-|items-|justify-|border|uppercase|tracking-|italic|shadow|absolute|relative|fixed|inline|block|hidden|overflow|transition|hover:|focus:|group|space-|min-|max-|z-|opacity-|ring|animate|leading-|truncate|shrink|grow|self-|top-|left-|right-|bottom-|inset-|cursor-|select-|pointer-|whitespace-|object-|aspect-|sm:|md:|lg:|xl:|pc:|dark:)/;
// Se prueba sin los prefijos de variante: `placeholder:font-black` o
// `md:uppercase` son clases igual que `font-black` o `uppercase`.
const esClase = (s) => PREFIJOS.test(s.replace(/(^|\s)(?:[a-z-]+:)+/g, '$1'));

const TOKEN = new Map(Object.entries({
    'font-black': 'font-semibold',
    'font-extrabold': 'font-semibold',
    'uppercase': null,
    'tracking-widest': null,
    'tracking-wider': null,
    'tracking-wide': null,
    'tracking-[0.1em]': null,
    'tracking-[0.15em]': null,
    'tracking-[0.2em]': null,
    'tracking-[0.25em]': null,
    'tracking-[0.3em]': null,
    'tracking-[0.35em]': null,
    'tracking-[0.4em]': null,
    'tracking-tighter': 'tracking-tight',
    'italic': null,
    'text-[8px]': 'text-t-2xs',
    'text-[9px]': 'text-t-2xs',
    'text-[10px]': 'text-t-2xs',
    'text-[11px]': 'text-t-2xs',
    'rounded-3xl': 'rounded-card',
    'rounded-[2rem]': 'rounded-card',
    'rounded-[28px]': 'rounded-card',
    'rounded-[32px]': 'rounded-card',
    'shadow-2xl': 'shadow-overlay',
    'bg-white/5': 'bg-[var(--fill-muted)]',
    'bg-white/[0.03]': 'bg-[var(--fill-muted)]',
    'bg-white/[0.04]': 'bg-[var(--fill-muted)]',
    'bg-white/[0.05]': 'bg-[var(--fill-muted)]',
    'bg-white/10': 'bg-[var(--fill-hover)]',
    'bg-white/[0.08]': 'bg-[var(--fill-hover)]',
    'bg-white/15': 'bg-[var(--fill-pressed)]',
    'bg-white/20': 'bg-[var(--fill-strong)]',
    'border-white/5': 'border-[var(--separator)]',
    'border-white/10': 'border-[var(--separator)]',
    'border-white/20': 'border-[var(--border-strong)]',
    'text-white/60': 'text-ink-muted',
    'text-white/70': 'text-ink-muted',
    'text-white/80': 'text-ink',
    'text-white/50': 'text-ink-subtle',
    'text-white/40': 'text-ink-subtle',
    'text-gray-50': 'text-ink',
    'text-gray-100': 'text-ink',
    'text-gray-200': 'text-ink',
    'text-gray-300': 'text-ink-muted',
    'text-gray-400': 'text-ink-muted',
    'text-gray-500': 'text-ink-subtle',
    'text-gray-600': 'text-ink-subtle',
    'text-gray-700': 'text-ink-faint',
    'text-gray-800': 'text-ink-faint',
    'text-gray-900': 'text-ink-faint',
    'text-zinc-300': 'text-ink-muted',
    'text-zinc-400': 'text-ink-muted',
    'text-zinc-500': 'text-ink-subtle',
    'text-zinc-600': 'text-ink-subtle',
    'text-zinc-700': 'text-ink-faint',
    'text-zinc-800': 'text-ink-faint',
    'bg-gray-700': 'bg-[var(--fill-muted)]',
    'bg-gray-800': 'bg-surface-raised',
    'bg-gray-900': 'bg-surface-sunken',
    'bg-gray-950': 'bg-surface-sunken',
    'bg-zinc-700': 'bg-[var(--fill-muted)]',
    'bg-zinc-800': 'bg-surface-raised',
    'bg-zinc-900': 'bg-surface-sunken',
    'bg-zinc-950': 'bg-surface-sunken',
    'border-gray-600': 'border-[var(--border-strong)]',
    'border-gray-700': 'border-[var(--separator)]',
    'border-gray-800': 'border-[var(--separator)]',
    'border-gray-900': 'border-[var(--separator)]',
    'border-zinc-700': 'border-[var(--separator)]',
    'border-zinc-800': 'border-[var(--separator)]',
    'border-zinc-900': 'border-[var(--separator)]',
    'bg-red-500': 'bg-brand',
    'bg-red-600': 'bg-brand',
    'bg-red-700': 'bg-brand-hover',
    'bg-red-500/10': 'bg-danger-quiet',
    'bg-red-500/20': 'bg-danger-quiet',
    'bg-red-900/20': 'bg-danger-quiet',
    'bg-red-900/30': 'bg-danger-quiet',
    'bg-red-500/5': 'bg-danger-quiet',
    'text-red-400': 'text-danger-text',
    'text-red-500': 'text-danger-text',
    'text-red-600': 'text-danger-text',
    'border-red-500': 'border-danger',
    'border-red-500/20': 'border-danger/30',
    'border-red-500/30': 'border-danger/30',
    'border-red-500/50': 'border-danger',
    'border-red-900/50': 'border-danger/30',
    'bg-green-500/10': 'bg-success-quiet',
    'bg-green-500/20': 'bg-success-quiet',
    'text-green-400': 'text-success',
    'text-green-500': 'text-success',
    'bg-yellow-500/10': 'bg-warning-quiet',
    'bg-yellow-500/20': 'bg-warning-quiet',
    'text-yellow-400': 'text-warning',
    'text-yellow-500': 'text-warning',
    'bg-amber-500/10': 'bg-warning-quiet',
    'text-amber-400': 'text-warning',
    'text-amber-500': 'text-warning',
}));

const VARIANTE = new Map(Object.entries({
    'hover:bg-white/5': 'hover:bg-[var(--fill-hover)]',
    'hover:bg-white/10': 'hover:bg-[var(--fill-pressed)]',
    'hover:bg-white/15': 'hover:bg-[var(--fill-pressed)]',
    'hover:bg-white/20': 'hover:bg-[var(--fill-strong)]',
    'hover:bg-gray-700': 'hover:bg-[var(--fill-hover)]',
    'hover:bg-gray-800': 'hover:bg-[var(--fill-hover)]',
    'hover:bg-zinc-700': 'hover:bg-[var(--fill-hover)]',
    'hover:bg-zinc-800': 'hover:bg-[var(--fill-hover)]',
    'hover:text-white': 'hover:text-ink',
    'hover:bg-red-600': 'hover:bg-brand-hover',
    'hover:bg-red-700': 'hover:bg-brand-hover',
    'hover:bg-red-500': 'hover:bg-brand-hover',
    'hover:border-white/20': 'hover:border-[var(--border-strong)]',
    'hover:border-gray-600': 'hover:border-[var(--border-strong)]',
    'focus:border-white': 'focus:border-[var(--border-strong)]',
    'focus:border-white/50': 'focus:border-[var(--border-strong)]',
    'placeholder-gray-500': 'placeholder:text-ink-subtle',
    'placeholder-gray-600': 'placeholder:text-ink-subtle',
    'placeholder-zinc-500': 'placeholder:text-ink-subtle',
    'placeholder:text-gray-500': 'placeholder:text-ink-subtle',
    'placeholder:text-gray-600': 'placeholder:text-ink-subtle',
    'placeholder:text-gray-800': 'placeholder:text-ink-faint',
    'divide-white/10': 'divide-[var(--separator)]',
    'divide-white/5': 'divide-[var(--separator)]',
    'divide-gray-800': 'divide-[var(--separator)]',
    'ring-white/10': 'ring-[var(--separator)]',
}));

export const conteo = new Map();
const cuenta = (k) => conteo.set(k, (conteo.get(k) ?? 0) + 1);

/** Reescribe una lista de clases (sin saltos de línea). Conserva los espacios de los extremos. */
export function reescribirClases(lista) {
    const tieneBrand = /\bbg-brand\b|\bbg-danger\b/.test(lista);
    const tieneBgWhite = /(^|\s)bg-white(\s|$)/.test(lista);
    const tieneTextBlack = /(^|\s)text-black(\s|$)/.test(lista);
    const esScrim = /\binset-0\b/.test(lista) || /\bfixed\b/.test(lista);

    const tokens = lista.split(/(\s+)/);
    let borrados = 0;
    const salida = tokens.map((t) => {
        if (/^\s*$/.test(t)) return t;
        if (VARIANTE.has(t)) { cuenta(t); return VARIANTE.get(t); }

        const m = t.match(/^((?:[a-z-]+:)*)(.+)$/);
        const prefijo = m ? m[1] : '';
        const base = m ? m[2] : t;

        if (base === 'text-black') {
            if (tieneBrand) { cuenta('text-black→brand-ink'); return `${prefijo}text-brand-ink`; }
            if (tieneBgWhite) { cuenta('text-black→surface-canvas'); return `${prefijo}text-surface-canvas`; }
            return t;
        }
        if (base === 'bg-white' && tieneTextBlack) { cuenta('bg-white→ink'); return `${prefijo}bg-ink`; }
        if (base === 'text-white' && tieneBrand) { cuenta('text-white→brand-ink'); return `${prefijo}text-brand-ink`; }
        if (/^bg-black\/(30|40|50|60|70|80|90)$/.test(base)) {
            if (esScrim) { cuenta('bg-black/x→scrim'); return `${prefijo}bg-[var(--scrim)]`; }
            cuenta('bg-black/x→sunken'); return `${prefijo}bg-surface-sunken`;
        }
        if ((t === 'hover:bg-gray-200' || t === 'hover:bg-gray-100' || t === 'hover:bg-white/90') && tieneTextBlack) {
            cuenta('hover:bg-gray-200→opacity'); return 'hover:opacity-90';
        }
        if (TOKEN.has(base)) {
            cuenta(base);
            const nuevo = TOKEN.get(base);
            if (nuevo === null) { borrados++; return ''; }
            return `${prefijo}${nuevo}`;
        }
        return t;
    });

    let res = salida.join('');
    if (borrados > 0) {
        // Los huecos que dejan los tokens borrados, sin tocar los extremos
        // que ya estaban (una plantilla suele empezar o acabar en espacio).
        const abre = /^\s/.test(lista) ? lista.match(/^\s+/)[0] : '';
        const cierra = /\s$/.test(lista) ? lista.match(/\s+$/)[0] : '';
        res = abre + res.trim().replace(/[ \t]{2,}/g, ' ') + cierra;
    }
    return res;
}

/** Literales que empiezan y acaban en la misma línea. */
const LITERAL = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

function reescribirLiteral(cuerpo) {
    if (!/\$\{/.test(cuerpo)) return esClase(cuerpo) ? reescribirClases(cuerpo) : cuerpo;
    // Plantilla: los trozos fijos como clases; dentro de `${…}`, los
    // literales entrecomillados que haya (el ternario típico).
    return cuerpo.split(/(\$\{[^}]*\})/).map((parte, idx) => {
        if (idx % 2 === 1) return parte.replace(LITERAL, (todo, q, c) => q + reescribirLiteral(c) + q);
        return esClase(parte) ? reescribirClases(parte) : parte;
    }).join('');
}

/** Con un número impar de acentos graves, la plantilla sigue en otra línea. */
function cuentaAcentos(linea) {
    return (linea.match(/(^|[^\\])`/g) ?? []).length;
}

/** Una línea que es SOLO clases (dentro de una plantilla multilínea). */
const SOLO_CLASES = /^[\w\-[\]/.:%()#,'"$]+(?:\s+[\w\-[\]/.:%()#,'"$]+)*\s*$/;

export function transformarLinea(linea) {
    const recortada = linea.trim();
    if (recortada.startsWith('//') || recortada.startsWith('*') || recortada.startsWith('/*') || recortada.startsWith('{/*')) return linea;

    let salida = linea.replace(LITERAL, (todo, q, cuerpo) => q + reescribirLiteral(cuerpo) + q);

    // Plantilla que se abre (o se cierra) en esta línea y sigue en otra:
    // las clases que van tras el último acento grave hasta `${`, y las que
    // van antes del primero si la línea empieza cerrando una expresión.
    if (cuentaAcentos(salida) % 2 === 1) {
        const ultimo = salida.lastIndexOf('`');
        const cola = salida.slice(ultimo + 1);
        const corte = cola.indexOf('${');
        const clases = corte >= 0 ? cola.slice(0, corte) : cola;
        if (esClase(clases)) {
            salida = salida.slice(0, ultimo + 1) + reescribirClases(clases) + (corte >= 0 ? cola.slice(corte) : '');
        }
        const primero = salida.indexOf('`');
        const cabeza = salida.slice(0, primero);
        const llave = cabeza.lastIndexOf('}');
        if (llave >= 0 && primero > llave + 1) {
            const clasesCabeza = cabeza.slice(llave + 1);
            if (esClase(clasesCabeza)) {
                salida = cabeza.slice(0, llave + 1) + reescribirClases(clasesCabeza) + salida.slice(primero);
            }
        }
    }

    // Línea entera de clases dentro de una plantilla `…` multilínea.
    if (salida === linea && !/["'`=<>;(){}]/.test(recortada) && SOLO_CLASES.test(recortada) && esClase(recortada) && recortada.split(/\s+/).length >= 2) {
        const sangria = linea.match(/^\s*/)[0];
        salida = sangria + reescribirClases(recortada) + linea.slice(sangria.length + recortada.length);
    }
    return salida;
}

export function transformar(texto) {
    return texto.split('\n').map(transformarLinea).join('\n');
}

export function main() {
    const args = process.argv.slice(2);
    const dry = args.includes('--dry');
    const rootIdx = args.indexOf('--root');
    const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
    let cambiados = 0;
    for (const f of archivos(join(ROOT, 'src'))) {
        const rel = relative(ROOT, f).split(sep).join('/');
        if (excluido(rel)) continue;
        const antes = readFileSync(f, 'utf8');
        const despues = transformar(antes);
        if (antes !== despues) {
            cambiados++;
            if (!dry) writeFileSync(f, despues);
            else console.log('~', rel);
        }
    }
    console.log(`${dry ? '[dry] ' : ''}Archivos cambiados: ${cambiados}`);
    for (const [k, v] of [...conteo.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
