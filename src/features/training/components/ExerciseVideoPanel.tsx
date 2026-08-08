import { useEffect, useState } from 'react';
import { Video, AlertTriangle, CheckCircle2, User, PlayCircle } from 'lucide-react';
import { VideoModal } from '../../../components/ui/VideoModal';
import {
    exerciseVideoService,
    type ResolvedVideo,
} from '../../../services/exerciseVideoService';
import { classifyExercise } from '../../../lib/volume/muscles';
import { cn } from '../../../lib/utils';

/**
 * Ficha de un ejercicio para el atleta.
 *
 * En escritorio: vídeo a la IZQUIERDA, información a la DERECHA. El vídeo va
 * a la izquierda porque es lo que se mira mientras se lee lo de al lado; al
 * revés obligaría a cruzar la vista en cada cue.
 * En móvil se apila con el vídeo arriba: es la referencia, no un adorno.
 *
 * El vídeo puede venir de tres sitios y la procedencia SE DICE. Si un coach
 * ha grabado su propia versión, el atleta tiene que saber que está viendo la
 * de su entrenador y no la genérica — si no, un cue contradictorio parecería
 * un error de la app.
 */

export interface ExerciseVideoPanelProps {
    exerciseId: string;
    exerciseName: string;
    athleteId: string;
    /** Prescripción resumida: "3x5 @180kg". */
    prescription?: string;
    /** Notas del coach para ESTA sesión. Mandan sobre los cues genéricos. */
    coachNotes?: string | null;
    /** Últimas cargas top del atleta en este ejercicio, en orden cronológico. */
    history?: number[];
    /**
     * Enlace externo de la ficha del ejercicio (`exercise_library.video_url`).
     *
     * Es el RESPALDO del vídeo interno, no una alternativa: solo se enseña
     * cuando no hay ninguno subido a R2 para este atleta, para su coach ni por
     * defecto. La columna existía desde el esquema original y no la leía nadie.
     */
    externalVideoUrl?: string | null;
    className?: string;
}

const SCOPE_LABEL: Record<ResolvedVideo['scope'], { text: string; className: string }> = {
    athlete: {
        text: 'Versión personalizada para ti',
        className: 'bg-[var(--brand-quiet)] text-brand',
    },
    coach: {
        text: 'Versión de tu entrenador',
        className: 'bg-[var(--info-quiet)] text-info',
    },
    default: { text: 'Técnica de referencia', className: 'bg-surface-overlay text-ink-muted' },
};

export function ExerciseVideoPanel({
    exerciseId,
    exerciseName,
    athleteId,
    prescription,
    coachNotes,
    history = [],
    externalVideoUrl,
    className,
}: ExerciseVideoPanelProps) {
    const [video, setVideo] = useState<ResolvedVideo | null>(null);
    const [loading, setLoading] = useState(true);
    const [externalOpen, setExternalOpen] = useState(false);

    const externalUrl = externalVideoUrl?.trim() || null;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        exerciseVideoService
            .resolve(exerciseId, athleteId)
            .then((v) => {
                if (!cancelled) setVideo(v);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [exerciseId, athleteId]);

    const classification = classifyExercise(exerciseName);

    return (
        <div className={cn('grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]', className)}>
            {/* ---------------- IZQUIERDA: vídeo ---------------- */}
            <div>
                <div className="relative aspect-video w-full overflow-hidden rounded-card bg-surface-sunken">
                    {loading ? (
                        <div className="h-full w-full animate-pulse bg-surface-raised" />
                    ) : video?.videoUrl ? (
                        <video
                            key={video.videoUrl}
                            src={video.videoUrl}
                            poster={video.posterUrl ?? undefined}
                            // Sin audio, en bucle y con controles: es una
                            // referencia técnica que se mira varias veces
                            // seguidas, no un vídeo que se "reproduce".
                            muted
                            loop
                            playsInline
                            controls
                            // `none` es deliberado: el clip no se descarga
                            // hasta que el atleta le da al play. Con 8
                            // ejercicios por sesión, precargar todos sería
                            // varios MB en una conexión de gimnasio.
                            preload="none"
                            className="h-full w-full object-contain"
                        />
                    ) : externalUrl ? (
                        /* RESPALDO: el enlace que el coach guardó en la ficha
                           del ejercicio. Se abre en `VideoModal`, que sabe
                           incrustar YouTube y Vimeo, en vez de sacar al atleta
                           de la aplicación a mitad de sesión.

                           Va DESPUÉS del vídeo interno y nunca antes: el
                           interno lo ha grabado el coach a propósito, está
                           comprimido, no lleva anuncios y no desaparece porque
                           alguien borre un vídeo de YouTube. */
                        <button
                            type="button"
                            onClick={() => setExternalOpen(true)}
                            className="group flex h-full w-full flex-col items-center justify-center gap-2 text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink"
                        >
                            <PlayCircle className="h-9 w-9 text-brand" />
                            <p className="text-xs font-semibold uppercase tracking-wide">
                                Ver vídeo de técnica
                            </p>
                        </button>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-faint">
                            <Video className="h-7 w-7" />
                            <p className="text-xs font-medium uppercase tracking-wide">
                                Sin vídeo todavía
                            </p>
                        </div>
                    )}
                </div>

                {(video || (!loading && externalUrl)) && (
                    <span
                        className={cn(
                            'mt-2 inline-flex items-center gap-1.5 rounded-chip px-2 py-1 text-xs font-medium',
                            video ? SCOPE_LABEL[video.scope].className : 'bg-surface-overlay text-ink-muted'
                        )}
                    >
                        <User className="h-3 w-3" />
                        {video ? SCOPE_LABEL[video.scope].text : 'Enlace de tu entrenador'}
                    </span>
                )}

                <VideoModal
                    open={externalOpen}
                    onClose={() => setExternalOpen(false)}
                    url={externalUrl ?? null}
                    title={exerciseName}
                />
            </div>

            {/* ---------------- DERECHA: información ---------------- */}
            <div className="space-y-5">
                <div>
                    <h3 className="text-xl font-semibold tracking-display text-ink">
                        {exerciseName}
                    </h3>
                    {prescription && (
                        <p className="mt-0.5 text-sm text-ink-muted">{prescription}</p>
                    )}
                </div>

                {/* Las notas del coach para esta sesión van PRIMERO: son
                    específicas y pueden contradecir a propósito los cues
                    genéricos de abajo. */}
                {coachNotes && (
                    <div className="rounded-field bg-[var(--brand-quiet)] px-3 py-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                            Nota de tu entrenador
                        </p>
                        <p className="mt-1 text-sm text-ink">{coachNotes}</p>
                    </div>
                )}

                {classification.primary.length > 0 && (
                    <Section title="Músculos implicados">
                        <div className="flex flex-wrap gap-1.5">
                            {classification.primary.map((m) => (
                                <Tag key={m} tone="strong">
                                    {m}
                                </Tag>
                            ))}
                            {classification.secondary.map((m) => (
                                <Tag key={m} tone="quiet">
                                    {m}
                                </Tag>
                            ))}
                        </div>
                    </Section>
                )}

                {video?.cues && video.cues.length > 0 && (
                    <Section title="Claves de ejecución">
                        <ul className="space-y-1.5">
                            {video.cues.map((cue) => (
                                <li key={cue} className="flex gap-2 text-sm text-ink-muted">
                                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                                    {cue}
                                </li>
                            ))}
                        </ul>
                    </Section>
                )}

                {video?.common_errors && video.common_errors.length > 0 && (
                    <Section title="Errores frecuentes">
                        <ul className="space-y-1.5">
                            {video.common_errors.map((err) => (
                                <li key={err} className="flex gap-2 text-sm text-ink-muted">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                                    {err}
                                </li>
                            ))}
                        </ul>
                    </Section>
                )}

                {history.length > 0 && (
                    <Section title="Tus últimas cargas">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            {history.slice(-6).map((kg, i, arr) => (
                                <span
                                    key={i}
                                    className={cn(
                                        'text-sm',
                                        i === arr.length - 1
                                            ? 'font-semibold text-ink'
                                            : 'text-ink-subtle'
                                    )}
                                >
                                    {kg}
                                    <span className="text-xs text-ink-faint"> kg</span>
                                </span>
                            ))}
                        </div>
                    </Section>
                )}
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                {title}
            </h4>
            {children}
        </section>
    );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: 'strong' | 'quiet' }) {
    return (
        <span
            className={cn(
                'rounded-chip px-2 py-0.5 text-xs',
                tone === 'strong'
                    ? 'bg-[var(--brand-quiet)] text-brand'
                    : 'bg-surface-overlay text-ink-subtle'
            )}
        >
            {children}
        </span>
    );
}
