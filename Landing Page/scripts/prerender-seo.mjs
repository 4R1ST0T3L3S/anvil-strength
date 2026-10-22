/**
 * ANVIL STRENGTH — PRERENDERIZADO ESTÁTICO DE SEO EN POST-BUILD
 * =====================================================================
 *
 * POR QUÉ EXISTE ESTE PASO
 *
 * La aplicación es una SPA construida con Vite y React: el `dist/index.html`
 * que sale de `vite build` contiene únicamente `<div id="root"></div>` vacío
 * y los metadatos de la portada. Sin este paso:
 *
 *   1. Los rastreadores que no ejecutan JavaScript (previsualizadores de
 *      WhatsApp, Telegram, X/Twitter, LinkedIn, o una primera pasada rápida
 *      de indexación) reciben en `/powerlifting-valencia`, `/competiciones` o
 *      `/legal/*` el `<title>`, el `canonical` y la descripción de `/`.
 *   2. El cuerpo HTML inicial de todas las rutas llega vacío hasta que se
 *      descarga y ejecuta el bundle de JavaScript.
 *
 *
 * POR QUÉ SIN NAVEGADOR (SIN PLAYWRIGHT NI PUPPETEER)
 *
 * El entorno de build de Vercel no dispone de Chromium, e instalar un
 * navegador headless solo para emitir texto estático añadiría cientos de
 * megas y fragilidad al despliegue. Además, `src/main.tsx` monta la app con
 * `ReactDOM.createRoot(document.getElementById('root')!).render(...)` (no usa
 * `hydrateRoot`), por lo que React sustituye limpiamente el contenido de
 * `#root` al arrancar en el cliente sin riesgo de errores de hidratación.
 *
 *
 * UNA SOLA FUENTE DE VERDAD (CERO CLOAKING)
 *
 * El HTML estático que se inyecta en `#root` y las etiquetas `<title>`,
 * `description`, `canonical`, `og:*`, `twitter:*` y JSON-LD `FAQPage` salen
 * exactamente de los mismos módulos TypeScript que pintan los componentes de
 * React (`src/features/landing/textos.ts` y `src/data/regionesSeo.ts`):
 *
 *   1. Se compila `scripts/seo-entry.ts` con la API de Vite en modo SSR hacia
 *      una carpeta temporal `dist-seo/`, resolviendo `useIdioma` a español
 *      (`es`) para poder invocar `useTextosWeb()` directamente desde Node.
 *   2. Se toma `dist/index.html` (con sus enlaces reales a `/assets/...`) como
 *      plantilla y se escribe `dist/<ruta>/index.html` para cada ruta pública
 *      (y `dist/index.html` para la raíz `/`).
 *   3. Se elimina `dist-seo/` siempre en el bloque `finally`.
 *
 *
 * CONVIVENCIA CON EL SERVICE WORKER (`vite-plugin-pwa`) Y FALLBACK SPA
 *
 * `vite-plugin-pwa` genera `dist/sw.js` con `navigateFallback: 'index.html'`, y
 * `vercel.json` redirige las rutas privadas (`/dashboard`, `/perfil`, etc.) a
 * `index.html`. Para evitar que quien abra una de esas rutas o navegue con el SW
 * activo vea el HTML estático de la portada durante la descarga del JS:
 *
 *   1. El HTML prerenderizado se envuelve en `[data-prerender="<ruta>"]`.
 *   2. Un script inline síncrono en el `<head>` compara `location.pathname` y,
 *      si no coincide con la ruta del fichero, marca `<html>` con `sin-prerender`.
 *   3. Una regla `.sin-prerender [data-prerender]{display:none}` oculta el texto
 *      antes del primer frame de pintado.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(raiz, 'dist');
const distSeoDir = path.join(raiz, 'dist-seo');

const DOMINIO = 'https://anvilstrength.es';

/** Escapa texto para nodos HTML y atributos entre comillas dobles. */
function escaparHtml(valor) {
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Serializa JSON-LD escapando `<` para impedir cierres prematuros de `<script>`. */
function serializarJsonLd(datos) {
    return JSON.stringify(datos).replace(/</g, '\\u003c');
}

/** Construye el objeto Schema.org FAQPage a partir de una lista `{ q, a }`. */
function crearEsquemaFaq(preguntas) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: preguntas.map((faq) => ({
            '@type': 'Question',
            name: faq.q,
            acceptedAnswer: {
                '@type': 'Answer',
                text: faq.a,
            },
        })),
    };
}

/** Bloque común de navegación interna para el pie del HTML estático. */
function renderPieNavegacion(t, regiones, tituloPieRegiones) {
    const enlacesRegiones = regiones
        .map(
            (r) =>
                `<li><a href="/${escaparHtml(r.slug)}">${escaparHtml(r.etiquetaEnlace)}</a></li>`
        )
        .join('');

    return (
        `<footer>` +
        `<p>${escaparHtml(t.pie.lema)}</p>` +
        `<nav aria-label="${escaparHtml(t.pie.navegacion)}">` +
        `<ul>` +
        `<li><a href="/">Anvil Strength</a></li>` +
        `<li><a href="/competiciones">${escaparHtml(t.pie.enlaces.competiciones)}</a></li>` +
        `<li><a href="/legal/aviso-legal">${escaparHtml(t.pie.avisoLegal)}</a></li>` +
        `<li><a href="/legal/privacidad">${escaparHtml(t.pie.privacidad)}</a></li>` +
        `<li><a href="/legal/cookies">${escaparHtml(t.pie.cookies)}</a></li>` +
        `<li><a href="/legal/terminos">${escaparHtml(t.pie.terminos)}</a></li>` +
        `</ul>` +
        `</nav>` +
        `<nav aria-label="${escaparHtml(tituloPieRegiones)}">` +
        `<p>${escaparHtml(tituloPieRegiones)}</p>` +
        `<ul>${enlacesRegiones}</ul>` +
        `</nav>` +
        `<p>${escaparHtml(t.pie.derechos)} · ${escaparHtml(t.pie.grupo)}</p>` +
        `</footer>`
    );
}

/** HTML semántico estático para `/` a partir de `textos.ts` (ES) y datos del club. */
function renderPortadaHtml(t, regiones, tituloPieRegiones, coaches, nutritionists, achievements) {
    const puntosFilosofia = t.filosofia.puntos
        .map(
            ({ t: titulo, d }) =>
                `<dt>${escaparHtml(titulo)}</dt><dd>${escaparHtml(d)}</dd>`
        )
        .join('');

    const listaPasos = t.pasos.lista
        .map(
            (paso) =>
                `<li><h3>${escaparHtml(paso.t)}</h3><p>${escaparHtml(paso.d)}</p></li>`
        )
        .join('');

    const listaSoftware = t.software.funciones
        .map(
            (fn) =>
                `<li><h3>${escaparHtml(fn.t)}</h3><p>${escaparHtml(fn.d)}</p></li>`
        )
        .join('');

    const listaEquipo = [
        ...coaches.map(
            (c) => `<li><h3>${escaparHtml(c.name)}</h3><p>${escaparHtml(c.role)}</p></li>`
        ),
        ...nutritionists.map(
            (n) => `<li><h3>${escaparHtml(n.name)}</h3><p>${escaparHtml(n.role)}</p></li>`
        ),
    ].join('');

    const listaLogros = achievements
        .slice(0, 3)
        .map(
            (l) =>
                `<li><h3>${escaparHtml(l.title)}</h3><p>${escaparHtml(l.result)} — ${escaparHtml(l.desc)}</p></li>`
        )
        .join('');

    const listaFaqs = t.faq.preguntas
        .map(
            (faq) =>
                `<div><h3>${escaparHtml(faq.q)}</h3><p>${escaparHtml(faq.a)}</p></div>`
        )
        .join('');

    return (
        `<main>` +
        `<header>` +
        `<h1>Anvil Strength</h1>` +
        `<p>${escaparHtml(t.portada.lema)}</p>` +
        `<p>${escaparHtml(t.portada.subtitulo)}</p>` +
        `</header>` +
        `<section id="filosofia">` +
        `<h2>${escaparHtml(t.filosofia.titulo1)} ${escaparHtml(t.filosofia.titulo2)}</h2>` +
        `<p>${escaparHtml(t.filosofia.intro)}</p>` +
        `<dl>${puntosFilosofia}</dl>` +
        `<p>${escaparHtml(t.filosofia.pie)}</p>` +
        `</section>` +
        `<section id="app">` +
        `<p>${escaparHtml(t.acceso.antetitulo)}</p>` +
        `<h2>${escaparHtml(t.acceso.titulo)}</h2>` +
        `<p>${escaparHtml(t.acceso.intro)}</p>` +
        `<h3>${escaparHtml(t.acceso.web)}</h3>` +
        `<p>${escaparHtml(t.acceso.webTexto)}</p>` +
        `</section>` +
        `<section>` +
        `<h2>${escaparHtml(t.pasos.titulo)}</h2>` +
        `<p>${escaparHtml(t.pasos.intro)}</p>` +
        `<ol>${listaPasos}</ol>` +
        `<p>${escaparHtml(t.pasos.nota)}</p>` +
        `</section>` +
        `<section id="software">` +
        `<p>${escaparHtml(t.software.etiqueta)}</p>` +
        `<h2>${escaparHtml(t.software.titulo)}</h2>` +
        `<p>${escaparHtml(t.software.intro)}</p>` +
        `<ul>${listaSoftware}</ul>` +
        `</section>` +
        `<section id="entrenadores">` +
        `<h2>${escaparHtml(t.equipo.titulo)}</h2>` +
        `<p>${escaparHtml(t.equipo.intro)}</p>` +
        `<p>${escaparHtml(t.equipo.nota)}</p>` +
        `<ul>${listaEquipo}</ul>` +
        `</section>` +
        `<section id="logros">` +
        `<h2>${escaparHtml(t.logros.titulo1)} ${escaparHtml(t.logros.titulo2)}</h2>` +
        `<ul>${listaLogros}</ul>` +
        `</section>` +
        `<section id="afiliacion">` +
        `<p>${escaparHtml(t.afiliacion.antetitulo)}</p>` +
        `<h2>${escaparHtml(t.afiliacion.titulo)}</h2>` +
        `<p>${escaparHtml(t.afiliacion.texto)}</p>` +
        `<p>${escaparHtml(t.afiliacion.nota)}</p>` +
        `</section>` +
        `<section id="faq">` +
        `<h2>${escaparHtml(t.faq.titulo)}</h2>` +
        `<p>${escaparHtml(t.faq.intro)}</p>` +
        `${listaFaqs}` +
        `</section>` +
        `<section id="contacto">` +
        `<h2>${escaparHtml(t.contacto.titulo)}</h2>` +
        `<ul>` +
        `<li><a href="https://www.instagram.com/anvilstrength_">Instagram: @anvilstrength_</a></li>` +
        `<li><a href="mailto:anvilstrengthclub@gmail.com">anvilstrengthclub@gmail.com</a></li>` +
        `<li><a href="https://wa.me/34640761674">WhatsApp: +34 640 76 16 74</a></li>` +
        `</ul>` +
        `</section>` +
        `</main>` +
        renderPieNavegacion(t, regiones, tituloPieRegiones)
    );
}

/** HTML semántico estático para `/competiciones`. */
function renderCompeticionesHtml(t, regiones, tituloPieRegiones, achievements) {
    const c = t.competiciones;
    const listaResultados = achievements
        .slice(0, 6)
        .map(
            (r) =>
                `<li><h3>${escaparHtml(r.title)}</h3><p>${escaparHtml(r.result)}</p></li>`
        )
        .join('');

    return (
        `<main>` +
        `<section>` +
        `<h1>${escaparHtml(c.titulo)}</h1>` +
        `<p>${escaparHtml(c.intro)}</p>` +
        `</section>` +
        `<section>` +
        `<h2>${escaparHtml(c.resultados)}</h2>` +
        `<ul>${listaResultados}</ul>` +
        `<p><a href="/#logros">${escaparHtml(c.verHistorial)}</a></p>` +
        `</section>` +
        `</main>` +
        renderPieNavegacion(t, regiones, tituloPieRegiones)
    );
}

/** HTML semántico estático para `/powerlifting-valencia`, `-murcia` y `-baleares`. */
function renderRegionHtml(region, todasLasRegiones, t, tituloPieRegiones) {
    const seccionesHtml = region.secciones
        .map((sec) => {
            const parrafos = sec.parrafos
                .map((p) => `<p>${escaparHtml(p)}</p>`)
                .join('');
            return `<section><h2>${escaparHtml(sec.titulo)}</h2>${parrafos}</section>`;
        })
        .join('');

    const faqsHtml = region.faqs
        .map(
            (faq) =>
                `<div><h3>${escaparHtml(faq.q)}</h3><p>${escaparHtml(faq.a)}</p></div>`
        )
        .join('');

    const otrasRegiones = todasLasRegiones
        .filter((otra) => otra.slug !== region.slug)
        .map(
            (otra) =>
                `<li><a href="/${escaparHtml(otra.slug)}">${escaparHtml(otra.etiquetaEnlace)}</a></li>`
        )
        .join('');

    return (
        `<main>` +
        `<header>` +
        `<p>${escaparHtml(region.antetitulo)}</p>` +
        `<h1>${escaparHtml(region.h1)}</h1>` +
        `<p>${escaparHtml(region.intro)}</p>` +
        `<p><a href="/competiciones">Ver competiciones del club</a></p>` +
        `</header>` +
        `${seccionesHtml}` +
        `<section>` +
        `<h2>Preguntas frecuentes sobre powerlifting en ${escaparHtml(region.nombre)}</h2>` +
        `${faqsHtml}` +
        `</section>` +
        `<section>` +
        `<p>Gratis · Sin cuota de club · Afiliado AEP e IPF</p>` +
        `<h2>¿Entrenas en ${escaparHtml(region.nombre)} y quieres competir?</h2>` +
        `<p>Créate la cuenta gratis para entrar en la aplicación del club o rellena la ficha de inscripción si quieres que revisemos tu caso y te asignemos entrenador.</p>` +
        `<p>` +
        `<a href="https://typebot.co/lead-generation-hhwa24t">Ficha de inscripción</a> · ` +
        `<a href="/competiciones">Ver calendario y convocatorias</a> · ` +
        `<a href="/normativa_equipo.pdf">Normativa del equipo</a>` +
        `</p>` +
        `</section>` +
        `<nav aria-label="Otras páginas territoriales de Anvil Strength">` +
        `<p>Otras páginas territoriales de Anvil Strength</p>` +
        `<ul>${otrasRegiones}</ul>` +
        `</nav>` +
        `</main>` +
        renderPieNavegacion(t, todasLasRegiones, tituloPieRegiones)
    );
}

/** HTML semántico mínimo para las páginas legales. */
function renderLegalHtml(h1, descripcion, t, regiones, tituloPieRegiones) {
    return (
        `<main>` +
        `<h1>${escaparHtml(h1)}</h1>` +
        `<p>${escaparHtml(descripcion)}</p>` +
        `</main>` +
        renderPieNavegacion(t, regiones, tituloPieRegiones)
    );
}

/** Reemplaza un patrón en la plantilla HTML exigiendo que exista. */
function reemplazarObligatorio(html, patron, reemplazo, etiqueta) {
    if (!patron.test(html)) {
        throw new Error(`No se encontró la etiqueta ${etiqueta} en dist/index.html.`);
    }
    const fnReemplazo = typeof reemplazo === 'function' ? reemplazo : () => reemplazo;
    return html.replace(patron, fnReemplazo);
}

/** Genera el HTML final de una ruta a partir de la plantilla `dist/index.html`. */
function aplicarSeoARuta(
    plantillaHtml,
    { ruta, title, description, canonical, bodyHtml, faqJsonLd }
) {
    const tituloEsc = escaparHtml(title);
    const descEsc = escaparHtml(description);
    const canonEsc = escaparHtml(canonical);

    let html = plantillaHtml;

    // Guardia síncrona anti-destello para el fallback de la SPA: si la ruta
    // real del navegador no coincide con la del fichero estático (p. ej. en
    // /dashboard o rutas servidas por el Service Worker con index.html),
    // oculta el HTML prerenderizado antes de que el navegador pinte el DOM.
    const rutaEscJs = JSON.stringify(ruta);
    const bloqueoFallbackPrerender =
        `  <style>.sin-prerender [data-prerender]{display:none}</style>\n` +
        `  <script>\n` +
        `    try {\n` +
        `      var p = location.pathname.replace(/\\/+$/, '') || '/';\n` +
        `      if (p !== ${rutaEscJs}) {\n` +
        `        document.documentElement.classList.add('sin-prerender');\n` +
        `      }\n` +
        `    } catch (e) {}\n` +
        `  </script>\n  `;

    html = reemplazarObligatorio(
        html,
        /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/i,
        (coincidencia) => `${bloqueoFallbackPrerender}${coincidencia}`,
        '<link rel="stylesheet">'
    );

    html = reemplazarObligatorio(
        html,
        /<title>[\s\S]*?<\/title>/,
        `<title>${tituloEsc}</title>`,
        '<title>'
    );
    html = reemplazarObligatorio(
        html,
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
        `<meta name="description" content="${descEsc}" />`,
        'meta[name="description"]'
    );
    html = reemplazarObligatorio(
        html,
        /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
        `<link rel="canonical" href="${canonEsc}" />`,
        'link[rel="canonical"]'
    );
    html = reemplazarObligatorio(
        html,
        /<link\s+rel="alternate"\s+hreflang="es-ES"\s+href="[^"]*"\s*\/?>/,
        `<link rel="alternate" hreflang="es-ES" href="${canonEsc}" />`,
        'link[hreflang="es-ES"]'
    );
    html = reemplazarObligatorio(
        html,
        /<link\s+rel="alternate"\s+hreflang="x-default"\s+href="[^"]*"\s*\/?>/,
        `<link rel="alternate" hreflang="x-default" href="${canonEsc}" />`,
        'link[hreflang="x-default"]'
    );
    html = reemplazarObligatorio(
        html,
        /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
        `<meta property="og:url" content="${canonEsc}" />`,
        'meta[property="og:url"]'
    );
    html = reemplazarObligatorio(
        html,
        /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
        `<meta property="og:title" content="${tituloEsc}" />`,
        'meta[property="og:title"]'
    );
    html = reemplazarObligatorio(
        html,
        /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
        `<meta property="og:description" content="${descEsc}" />`,
        'meta[property="og:description"]'
    );
    html = reemplazarObligatorio(
        html,
        /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
        `<meta name="twitter:title" content="${tituloEsc}" />`,
        'meta[name="twitter:title"]'
    );
    html = reemplazarObligatorio(
        html,
        /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
        `<meta name="twitter:description" content="${descEsc}" />`,
        'meta[name="twitter:description"]'
    );

    if (faqJsonLd) {
        const scriptFaq =
            `  <script id="${escaparHtml(faqJsonLd.id)}" type="application/ld+json">` +
            `${serializarJsonLd(faqJsonLd.data)}</script>\n</head>`;
        html = reemplazarObligatorio(html, /<\/head>/, scriptFaq, '</head>');
    }

    if (bodyHtml) {
        const contenedorPrerender = `<div data-prerender="${escaparHtml(ruta)}">${bodyHtml}</div>`;
        html = reemplazarObligatorio(
            html,
            /<div id="root">[\s\S]*?<\/div>(?=\s*<\/body>)/,
            `<div id="root">${contenedorPrerender}</div>`,
            '<div id="root"></div>'
        );
    }

    return html;
}

async function main() {
    const rutaIndexDist = path.join(distDir, 'index.html');
    // Si el script se ejecuta dos veces seguidas sin pasar por `vite build`,
    // limpiamos cualquier `ld-faq` o guardia `sin-prerender` previa de la plantilla base.
    const plantillaHtml = readFileSync(rutaIndexDist, 'utf8')
        .replace(
            /\s*<script id="ld-faq[^"]*" type="application\/ld\+json">[\s\S]*?<\/script>/g,
            ''
        )
        .replace(
            /\s*<style>\.sin-prerender\s*\[data-prerender\]\{display:none\}<\/style>\s*<script>[\s\S]*?document\.documentElement\.classList\.add\(['"]sin-prerender['"]\);?[\s\S]*?<\/script>/g,
            ''
        );

    try {
        // 1. Compilar `scripts/seo-entry.ts` en modo SSR hacia `dist-seo/`.
        //    Se desactiva `configFile` para no volver a disparar `VitePWA` ni
        //    `manualChunks` sobre `dist/`, y se sustituye `useIdioma` por un
        //    stub fijo en español para poder llamar a `useTextosWeb()` en Node.
        await build({
            configFile: false,
            root: raiz,
            logLevel: 'warn',
            plugins: [
                {
                    name: 'anvil-seo-idioma-es',
                    enforce: 'pre',
                    resolveId(source) {
                        if (source.endsWith('hooks/useIdioma')) {
                            return '\0anvil-use-idioma-es';
                        }
                        return null;
                    },
                    load(id) {
                        if (id === '\0anvil-use-idioma-es') {
                            return 'export function useIdioma() { return { idioma: "es" }; }';
                        }
                        return null;
                    },
                },
            ],
            resolve: {
                alias: {
                    '@': path.resolve(raiz, 'src'),
                },
            },
            build: {
                ssr: path.resolve(raiz, 'scripts/seo-entry.ts'),
                outDir: distSeoDir,
                emptyOutDir: true,
                rollupOptions: {
                    output: {
                        entryFileNames: 'seo-entry.mjs',
                    },
                },
            },
        });

        const moduloSeoUrl = pathToFileURL(path.join(distSeoDir, 'seo-entry.mjs')).href;
        const {
            useTextosWeb,
            REGIONES_SEO,
            TITULO_PIE_REGIONES,
            coaches,
            nutritionists,
            achievements,
        } = await import(moduloSeoUrl);

        const textosEs = useTextosWeb();

        // 2. Definir todas las rutas públicas a prerenderizar con los mismos
        //    datos exactos que usan sus componentes de React.
        const rutas = [
            {
                ruta: '/',
                title: textosEs.seo.titulo,
                description: textosEs.seo.descripcion,
                canonical: `${DOMINIO}/`,
                faqJsonLd: {
                    id: 'ld-faq',
                    data: crearEsquemaFaq(textosEs.faq.preguntas),
                },
                bodyHtml: renderPortadaHtml(
                    textosEs,
                    REGIONES_SEO,
                    TITULO_PIE_REGIONES,
                    coaches,
                    nutritionists,
                    achievements
                ),
            },
            {
                ruta: '/competiciones',
                title: textosEs.competiciones.seoTitulo,
                description: textosEs.competiciones.seoDescripcion,
                canonical: `${DOMINIO}/competiciones`,
                bodyHtml: renderCompeticionesHtml(
                    textosEs,
                    REGIONES_SEO,
                    TITULO_PIE_REGIONES,
                    achievements
                ),
            },
            ...REGIONES_SEO.map((region) => ({
                ruta: `/${region.slug}`,
                title: region.tituloSeo,
                description: region.descripcion,
                canonical: `${DOMINIO}/${region.slug}`,
                faqJsonLd: {
                    id: `ld-faq-${region.slug}`,
                    data: crearEsquemaFaq(region.faqs),
                },
                bodyHtml: renderRegionHtml(
                    region,
                    REGIONES_SEO,
                    textosEs,
                    TITULO_PIE_REGIONES
                ),
            })),
            {
                ruta: '/legal/aviso-legal',
                title: 'Aviso Legal | Anvil Strength',
                description:
                    'Aviso legal del sitio web de Anvil Strength, club de powerlifting federado AEP e IPF.',
                canonical: `${DOMINIO}/legal/aviso-legal`,
                bodyHtml: renderLegalHtml(
                    'Aviso Legal',
                    'Aviso legal del sitio web de Anvil Strength, club de powerlifting federado AEP e IPF.',
                    textosEs,
                    REGIONES_SEO,
                    TITULO_PIE_REGIONES
                ),
            },
            {
                ruta: '/legal/privacidad',
                title: 'Política de Privacidad | Anvil Strength',
                description:
                    'Política de privacidad y protección de datos (RGPD) del club de powerlifting Anvil Strength.',
                canonical: `${DOMINIO}/legal/privacidad`,
                bodyHtml: renderLegalHtml(
                    'Política de Privacidad',
                    'Política de privacidad y protección de datos (RGPD) del club de powerlifting Anvil Strength.',
                    textosEs,
                    REGIONES_SEO,
                    TITULO_PIE_REGIONES
                ),
            },
            {
                ruta: '/legal/cookies',
                title: 'Política de Cookies | Anvil Strength',
                description:
                    'Política de cookies del sitio web del club de powerlifting Anvil Strength.',
                canonical: `${DOMINIO}/legal/cookies`,
                bodyHtml: renderLegalHtml(
                    'Política de Cookies',
                    'Política de cookies del sitio web del club de powerlifting Anvil Strength.',
                    textosEs,
                    REGIONES_SEO,
                    TITULO_PIE_REGIONES
                ),
            },
        ];

        // 3. Escribir `dist/<ruta>/index.html` (y `dist/index.html` para `/`).
        for (const item of rutas) {
            const htmlRuta = aplicarSeoARuta(plantillaHtml, item);
            const destino =
                item.ruta === '/'
                    ? rutaIndexDist
                    : path.join(distDir, item.ruta.replace(/^\/+/, ''), 'index.html');

            mkdirSync(path.dirname(destino), { recursive: true });
            writeFileSync(destino, htmlRuta, 'utf8');
            console.log(`[prerender-seo] ${item.ruta} -> ${path.relative(raiz, destino)}`);
        }
    } finally {
        // 4. Limpiar siempre el directorio temporal `dist-seo/`.
        rmSync(distSeoDir, { recursive: true, force: true });
    }
}

await main();
