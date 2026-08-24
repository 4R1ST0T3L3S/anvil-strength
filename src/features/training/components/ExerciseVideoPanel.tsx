import { useState } from 'react';
import { Video, AlertTriangle, CheckCircle2, User, PlayCircle, Settings2 } from 'lucide-react';
import { VideoModal } from '../../../components/ui/VideoModal';
import {
    exerciseVideoService,
    type ResolvedVideo,
} from '../../../services/exerciseVideoService';
import { classifyExercise } from '../../../lib/volume/muscles';
import { cn } from '../../../lib/utils';
import { useQuery } from '@tanstack/react-query';

/**
 * Ficha de un ejercicio para el atleta.
 *
 * ORDEN DE LECTURA, QUE ES LO QUE MANDA AQUÍ
 *
 *   1. Qué ejercicio es y qué toca hacer hoy.
 *   2. Lo que te ha dicho tu entrenador para HOY, si ha dicho algo.
 *   3. El vídeo.
 *   4. CÓMO SE HACE, justo debajo del vídeo.
 *   5. Lo accesorio: músculos implicados y tus últimas cargas.
 *
 * Las indicaciones van DEBAJO del vídeo y no en una columna al lado porque
 * se leen DESPUÉS de verlo y describen lo que se acaba de ver. En una
 * columna lateral competían con él por la mirada, y en el móvil —que es
 * donde se abre esta ficha, de pie y con el móvil en la mano— acababan
 * empujadas por debajo del pliegue sin que nada indicase que estaban ahí.
 *
 * DE DÓNDE SALE CADA COSA
 *
 * El vídeo puede venir de tres sitios y la procedencia SE DICE. Si un coach
 * ha grabado su propia versión, el atleta tiene que saber que está viendo la
 * de su entrenador y no la genérica — si no, un cue contradictorio parecería
 * un error de la app.
 *
 * Las indicaciones tienen dos orígenes y el mismo criterio: las del VÍDEO
 * (`exercise_videos.cues`) describen esa versión concreta y mandan; las del
 * EJERCICIO (`exercise_library.cues`) son el respaldo. Sin ese respaldo, la
 * ficha de un ejercicio sin vídeo subido —hoy, todas— no dice nada sobre
 * cómo se ejecuta, que es justo para lo que se abre.
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
    /**
     * Indicaciones generales del EJERCICIO (`exercise_library`), que existen
     * haya vídeo o no. Ver database/exercise_indications.sql.
     */
    setup?: string | null;
    generalCues?: string[] | null;
    generalErrors?: string[] | null;
    className?: string;
}

const SCOPE_LABEL: Record<ResolvedVideo['scope'], { text: string; className: string }> = {
    athlete: {
        text: 'Versión personalizada para ti',
        className: 'bg-[var(--brand-quiet)] text-brand-text',
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
    setup,
    generalCues,
    generalErrors,
    className,
}: ExerciseVideoPanelProps) {
    const [externalOpen, setExternalOpen] = useState(false);

    const externalUrl = externalVideoUrl?.trim() || null;

    /*
     * El video del ejercicio, por consulta.
     *
     * Este panel se monta una vez POR EJERCICIO del registro de la sesion, y
     * el atleta sube y baja por la lista durante todo el entrenamiento. Con el
     * efecto, cada vez que un ejercicio volvia a entrar en pantalla se
     * resolvia otra vez su video; ahora se resuelve una vez por sesion.
     */
    const { data: video = null, isPending: loading } = useQuery({
        queryKey: ['video-ejercicio', exerciseId, athleteId],
        queryFn: () => exerciseVideoService.resolve(exerciseId, athleteId),
        // El video de un ejercicio no cambia a mitad de un entrenamiento.
        staleTime: 1000 * 60 * 30,
    });

    const classification = classifyExercise(exerciseName);

    /**
     * Lo del vídeo PISA a lo del ejercicio, no se suma.
     *
     * Sumarlos daría listas de diez puntos con dos formas distintas de hacer
     * lo mismo. Si un entrenador se ha molestado en escribir los cues de SU
     * versión, es porque quiere que se haga así y no de la otra.
     */
    const cues = video?.cues?.length ? video.cues : generalCues ?? [];
    const errors = video?.common_errors?.length ? video.common_errors : generalErrors ?? [];
    const hasIndications = Boolean(setup) || cues.length > 0 || errors.length > 0 || Boolean(video?.notes);

    return (
        <div className={cn('space-y-6', className)}>
            {/* ---------------- Qué ejercicio y qué toca ---------------- */}
            <header>
                <h3 className="text-xl font-semibold tracking-display text-ink">{exerciseName}</h3>
                {prescription && <p className="mt-0.5 text-sm text-ink-muted">{prescription}</p>}
            </header>

            {/* La nota del coach para HOY va antes que el vídeo y a ancho
                completo: es específica, puede contradecir a propósito
                cualquier indicación general de más abajo, y es lo único de
                esta ficha que se ha escrito pensando en esta sesión. */}
            {coachNotes && (
                <div className="rounded-field bg-[var(--brand-quiet)] px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-text">
                        Nota de tu entrenador
                    </p>
                    <p className="mt-1 text-sm text-ink">{coachNotes}</p>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                {/* ------- IZQUIERDA: vídeo y, debajo, cómo se hace ------- */}
                <div className="space-y-5">
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
                                    <PlayCircle className="h-9 w-9 text-brand-text" />
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
                                    video
                                        ? SCOPE_LABEL[video.scope].className
                                        : 'bg-surface-overlay text-ink-muted'
                                )}
                            >
                                <User className="h-3 w-3" />
                                {video ? SCOPE_LABEL[video.scope].text : 'Enlace de tu entrenador'}
                            </span>
                        )}
                    </div>

                    {/* ---------------- CÓMO SE HACE ----------------
                        Justo debajo del vídeo, que es el sitio donde se busca
                        después de verlo. */}
                    {hasIndications && (
                        <div className="space-y-5 rounded-card border border-subtle bg-surface-raised p-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                                Cómo se hace
                            </h4>

                            {setup && (
                                <div className="flex gap-2">
                                    <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                                    <p className="text-sm leading-relaxed text-ink-muted">{setup}</p>
                                </div>
                            )}

                            {cues.length > 0 && (
                                <Section title="Claves de ejecución">
                                    <ul className="space-y-1.5">
                                        {cues.map((cue) => (
                                            <li key={cue} className="flex gap-2 text-sm text-ink-muted">
                                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                                                {cue}
                                            </li>
                                        ))}
                                    </ul>
                                </Section>
                            )}

                            {errors.length > 0 && (
                                <Section title="Errores frecuentes">
                                    <ul className="space-y-1.5">
                                        {errors.map((err) => (
                                            <li key={err} className="flex gap-2 text-sm text-ink-muted">
                                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                                                {err}
                                            </li>
                                        ))}
                                    </ul>
                                </Section>
                            )}

                            {/* Lo que el coach escribió AL SUBIR ESTE VÍDEO.
                                Va al final porque es un comentario sobre la
                                grabación, no una instrucción de ejecución. */}
                            {video?.notes && (
                                <Section title="Sobre este vídeo">
                                    <p className="text-sm leading-relaxed text-ink-muted">{video.notes}</p>
                                </Section>
                            )}
                        </div>
                    )}
                </div>

                {/* ---------------- DERECHA: lo accesorio ---------------- */}
                <div className="space-y-5">
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

            <VideoModal
                open={externalOpen}
                onClose={() => setExternalOpen(false)}
                url={externalUrl ?? null}
                title={exerciseName}
            />
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
                    ? 'bg-[var(--brand-quiet)] text-brand-text'
                    : 'bg-surface-overlay text-ink-subtle'
            )}
        >
            {children}
        </span>
    );
}
