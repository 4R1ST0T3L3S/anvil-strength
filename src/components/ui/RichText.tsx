import { ExternalLink, PlayCircle } from 'lucide-react';
import { parseRichText, detectVideo } from '../../lib/richText';

/**
 * El texto del coach, con sus enlaces pulsables y sus saltos de línea.
 *
 * El análisis vive en lib/richText.ts; aquí solo se pinta. Ver allí qué
 * sintaxis se reconoce y por qué es Markdown mínimo y no un editor.
 *
 * Los enlaces se abren en pestaña nueva SIEMPRE: el atleta está a mitad de
 * sesión con datos escritos en la pantalla, y salir de la aplicación para
 * ver un vídeo de movilidad no puede costarle lo que llevaba registrado.
 *
 * `onPlayVideo` es opcional. Cuando se pasa, los enlaces que son vídeo
 * dejan de abrir el navegador y lo abren dentro de la aplicación, que es lo
 * que hace que ver la técnica no sea salir del entrenamiento.
 */
export function RichText({
    body,
    className,
    onPlayVideo,
}: {
    body: string;
    className?: string;
    onPlayVideo?: (url: string, label: string) => void;
}) {
    const segments = parseRichText(body);

    return (
        // `pre-line` respeta los saltos de línea del coach, que es como
        // escribe una escalera de aproximaciones, sin conservar la sangría
        // accidental que `pre-wrap` arrastraría.
        <p className={className} style={{ whiteSpace: 'pre-line' }}>
            {segments.map((segment, i) => {
                if (segment.kind === 'text') return <span key={i}>{segment.text}</span>;

                const video = detectVideo(segment.url);

                if (video && onPlayVideo) {
                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onPlayVideo(segment.url, segment.text)}
                            className="mx-0.5 inline-flex items-baseline gap-1 rounded-field font-semibold text-brand underline decoration-[var(--brand-line)] underline-offset-2 transition-colors duration-fast hover:text-brand-hover hover:decoration-current"
                        >
                            <PlayCircle size={13} className="translate-y-0.5 shrink-0" aria-hidden="true" />
                            {segment.text}
                        </button>
                    );
                }

                return (
                    <a
                        key={i}
                        href={segment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mx-0.5 inline-flex items-baseline gap-1 font-semibold text-brand underline decoration-[var(--brand-line)] underline-offset-2 transition-colors duration-fast hover:text-brand-hover hover:decoration-current"
                    >
                        {segment.text}
                        <ExternalLink size={11} className="translate-y-0.5 shrink-0" aria-hidden="true" />
                    </a>
                );
            })}
        </p>
    );
}
