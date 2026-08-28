import { useEffect } from 'react';

/**
 * Inserta un bloque de datos estructurados (JSON-LD) mientras el componente
 * está montado, y lo retira al desmontarse.
 *
 * POR QUÉ NO VIVE EN index.html
 * Es una SPA: un `<script type="application/ld+json">` en el HTML se declara
 * en TODAS las rutas. El esquema de FAQ estaba así, de modo que /competiciones
 * y las páginas legales afirmaban ante Google contener unas preguntas
 * frecuentes que no están en ellas. La documentación de Google es explícita en
 * que los datos estructurados deben describir el contenido visible de esa
 * página concreta, y un desajuste es motivo de acción manual.
 *
 * Los rastreadores de redes sociales (WhatsApp, Twitter) no ejecutan
 * JavaScript, así que esto solo sirve para buscadores que sí renderizan —
 * Google entre ellos. Para las tarjetas de compartir hacen falta las etiquetas
 * de index.html o prerenderizado, no este hook.
 *
 * `id` evita duplicar el bloque si dos componentes piden el mismo esquema.
 */
export function useJsonLd(id: string, data: unknown) {
    const serializedData = JSON.stringify(data);

    useEffect(() => {
        const existing = document.getElementById(id);
        if (existing) return;

        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = id;
        script.textContent = serializedData;
        document.head.appendChild(script);

        return () => {
            script.remove();
        };
    }, [id, serializedData]);
}
