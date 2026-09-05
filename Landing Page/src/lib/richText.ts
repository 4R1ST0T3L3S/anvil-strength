/**
 * TEXTO DEL COACH CON ENLACES — ANÁLISIS
 * =====================================================================
 *
 * El calentamiento y los extras son texto libre, y tienen que poder llevar
 * enlaces: "Movilidad de cadera" que lleva a un vídeo de YouTube, o a uno
 * grabado por el propio entrenador.
 *
 * POR QUÉ NO UN EDITOR DE TEXTO ENRIQUECIDO
 * Un editor WYSIWYG son ~80 KB de dependencia, un modelo de documento
 * propio y un campo que deja de ser legible en la base de datos. Aquí hace
 * falta UNA cosa: enlaces. La sintaxis de Markdown ya la conoce medio
 * mundo, se escribe desde el móvil sin barras de herramientas y el texto
 * sigue leyéndose tal cual si algún día se pinta en crudo.
 *
 * QUÉ SE RECONOCE
 *   [Movilidad de cadera](https://youtu.be/xxxx)   → enlace con texto
 *   https://youtu.be/xxxx                          → enlace sin texto
 *
 * Y NADA MÁS. Ni negritas, ni títulos, ni listas: cada regla que se añade
 * es una forma nueva de que el coach escriba algo que se pinta distinto de
 * lo que esperaba.
 *
 * Este fichero NO exporta componentes a propósito: el pintado vive en
 * RichText.tsx. Mezclarlos rompe el refresco en caliente de Vite.
 */

/** Un trozo de texto ya clasificado. */
export type RichSegment =
    | { kind: 'text'; text: string }
    | { kind: 'link'; text: string; url: string };

/**
 * Protocolos que se aceptan.
 *
 * `javascript:` en un href ejecuta código en la sesión de quien lo pulsa.
 * El texto lo escribe un entrenador del club, no un desconocido, pero una
 * cuenta comprometida no debería poder convertir el calentamiento en un
 * vector de ataque contra sus propios atletas.
 */
const SAFE_PROTOCOL = /^https?:\/\//i;

/** `[texto](url)` o una URL suelta. */
const PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|(\bhttps?:\/\/[^\s<>()]+)/gi;

export function parseRichText(input: string): RichSegment[] {
    const segments: RichSegment[] = [];
    let cursor = 0;

    for (const match of input.matchAll(PATTERN)) {
        const at = match.index ?? 0;
        if (at > cursor) {
            segments.push({ kind: 'text', text: input.slice(cursor, at) });
        }

        const [full, labelled, labelledUrl, bare] = match;
        const url = labelledUrl ?? bare ?? '';

        // Un enlace con protocolo raro se degrada a texto en vez de
        // desaparecer: el coach ve que ha escrito algo que no ha cuajado.
        if (SAFE_PROTOCOL.test(url)) {
            segments.push({ kind: 'link', text: labelled ?? url, url });
        } else {
            segments.push({ kind: 'text', text: full });
        }

        cursor = at + full.length;
    }

    if (cursor < input.length) {
        segments.push({ kind: 'text', text: input.slice(cursor) });
    }

    return segments;
}

/** ¿Hay algún enlace? Sirve para decidir si merece la pena montar nada. */
export const hasLinks = (input?: string | null): boolean =>
    Boolean(input) && parseRichText(input as string).some(s => s.kind === 'link');

// =====================================================================
// VÍDEO
// =====================================================================

/**
 * Identificador de YouTube dentro de una URL, en sus cuatro formas: la
 * larga, la corta, la de `embed` y la de Shorts —esta última es la que más
 * se comparte desde el móvil y la que suele faltar—.
 */
const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** Archivos que el navegador reproduce nativamente con <video>. */
const VIDEO_FILE = /\.(mp4|webm|ogg|mov)(\?|#|$)/i;

export type VideoSource =
    | { kind: 'youtube'; id: string; embedUrl: string }
    | { kind: 'file'; url: string }
    | null;

/**
 * Qué clase de vídeo hay detrás de una URL, si es que hay alguno.
 *
 * Distinguir YouTube de un archivo importa porque se reproducen con
 * elementos distintos: un `<video>` apuntando a una página de YouTube no
 * enseña nada, y un `<iframe>` para un mp4 propio pierde los controles
 * nativos y la posibilidad de descargarlo.
 */
export function detectVideo(url: string): VideoSource {
    if (!SAFE_PROTOCOL.test(url)) return null;

    const youtube = url.match(YOUTUBE_ID);
    if (youtube) {
        return {
            kind: 'youtube',
            id: youtube[1],
            // `rel=0` deja los sugeridos del final dentro del mismo canal.
            // Un atleta que termina el vídeo de movilidad no debería acabar
            // en un vídeo de otro entrenador contradiciendo a su coach.
            embedUrl: `https://www.youtube-nocookie.com/embed/${youtube[1]}?rel=0`,
        };
    }

    if (VIDEO_FILE.test(url)) return { kind: 'file', url };

    return null;
}
