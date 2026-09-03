import { useEffect } from 'react';

interface SeoOptions {
    title: string;
    description?: string;
    canonical?: string;
    /** Para rutas que no deben indexarse (paneles, áreas privadas). */
    noindex?: boolean;
}

const DEFAULT_TITLE = 'Anvil Strength | Club de Powerlifting Online en España — Gratis';
const DEFAULT_DESCRIPTION = 'Anvil Strength es el club de powerlifting digital de España. Gratis, sin sede física, afiliado AEP e IPF. Entrenadores de élite, app exclusiva y comunidad real. ¿Empezamos?';
const DEFAULT_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

/**
 * Título, descripción, canónica y Open Graph por ruta.
 *
 * Restaura los valores por defecto al desmontar, para que la metainformación
 * no se filtre de una ruta a otra al navegar dentro de la SPA.
 *
 * LÍMITE QUE CONVIENE CONOCER
 * Esto solo llega a los rastreadores que ejecutan JavaScript. Googlebot lo
 * hace; los previsualizadores de WhatsApp, Telegram o Twitter NO. Compartir
 * https://anvilstrength.es/competiciones seguirá mostrando la tarjeta de la
 * portada hasta que esas rutas se prerendericen o se sirvan desde servidor.
 * Se actualizan igualmente las etiquetas og: porque el coste es cero y hay
 * rastreadores intermedios que sí las leen tras renderizar.
 */
export function useSeo({ title, description, canonical, noindex }: SeoOptions) {
    useEffect(() => {
        const previous: (() => void)[] = [];

        const prevTitle = document.title;
        document.title = title;
        previous.push(() => { document.title = prevTitle || DEFAULT_TITLE; });

        const setMeta = (selector: string, value: string | undefined, fallback: string) => {
            if (!value) return;
            const el = document.querySelector<HTMLMetaElement>(selector);
            if (!el) return;
            const prev = el.content;
            el.content = value;
            previous.push(() => { el.content = prev || fallback; });
        };

        setMeta('meta[name="description"]', description, DEFAULT_DESCRIPTION);
        setMeta('meta[property="og:title"]', title, DEFAULT_TITLE);
        setMeta('meta[name="twitter:title"]', title, DEFAULT_TITLE);
        setMeta('meta[property="og:description"]', description, DEFAULT_DESCRIPTION);
        setMeta('meta[name="twitter:description"]', description, DEFAULT_DESCRIPTION);
        setMeta('meta[property="og:url"]', canonical, 'https://anvilstrength.es/');
        setMeta(
            'meta[name="robots"]',
            noindex ? 'noindex, nofollow' : undefined,
            DEFAULT_ROBOTS
        );

        if (canonical) {
            const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
            if (link) {
                const prev = link.href;
                link.href = canonical;
                previous.push(() => { link.href = prev; });
            }
        }

        return () => {
            // En orden inverso: si dos rutas se solapan durante una transición,
            // deshacer al revés deja el estado que había antes de ambas.
            for (let i = previous.length - 1; i >= 0; i--) previous[i]();
        };
    }, [title, description, canonical, noindex]);
}
