/**
 * PUNTO DE ENTRADA SSR PARA EL PRERENDERIZADO SEO DE BUILD
 * =====================================================================
 *
 * POR QUÉ EXISTE ESTE FICHERO
 *
 * `scripts/prerender-seo.mjs` necesita leer en Node los mismos diccionarios
 * y datos tipados que pintan los componentes de React (`textos.ts` y
 * `regionesSeo.ts`), sin duplicar ni una frase. Como esos módulos están en
 * TypeScript, Vite compila temporalmente esta entrada en modo SSR hacia
 * `dist-seo/`, el script de post-build la importa, genera los `index.html`
 * estáticos de cada ruta pública y borra `dist-seo/` al terminar.
 */

export { useTextosWeb, rellenar } from '../src/features/landing/textos';
export {
    REGIONES_SEO,
    REGIONES_SEO_POR_SLUG,
    TITULO_PIE_REGIONES,
    type RegionSeo,
    type RegionSlug,
} from '../src/data/regionesSeo';
export { coaches } from '../src/data/coaches';
export { nutritionists } from '../src/data/nutritionists';
export { achievements } from '../src/data/achievements';
