import { supabase } from '../lib/supabase';
import { countsForVolume, type TrainingSet } from '../types/training';
import type { LoggedExercise, LoggedSession, LoggedSet } from './trainingService';

/**
 * ANVIL STRENGTH — REVISIÓN DE ENTRENAMIENTOS (LA BANDEJA DEL ENTRENADOR)
 * =====================================================================
 *
 * El modelo vive en la base (database/BANDEJA_REVISION_2026-09-11.sql):
 *
 *   · un entrenamiento está PENDIENTE cuando el atleta lo ha cerrado y no se
 *     ha revisado desde su último cambio (`review_pending`, columna generada);
 *   · solo el check del entrenador lo saca de ahí (`review_session`); abrirlo
 *     no escribe nada;
 *   · si el atleta cambia algo después, vuelve solo, con
 *     `modified_after_review` y una foto de lo que se revisó para comparar.
 *
 * Aquí solo se lee y se llama a esas funciones. Ninguna regla de negocio se
 * decide en el navegador.
 */

export interface InboxAthleteSummary {
    athleteId: string;
    fullName: string;
    avatarUrl: string | null;
    pendingCount: number;
    /** De los pendientes, cuántos vuelven porque el atleta los cambió tras revisarlos. */
    modifiedCount: number;
    lastCompletedAt: string | null;
    oldestPendingAt: string | null;
}

/** Un entrenamiento de la bandeja: el registro completo más su estado de revisión. */
export interface ReviewedSession extends LoggedSession {
    reviewedAt: string | null;
    reviewedBy: string | null;
    athleteUpdatedAt: string | null;
    reviewPending: boolean;
    modifiedAfterReview: boolean;
    athleteId: string;
    blockStartDate: string | null;
    blockStartWeek: number | null;
    /** RPE y velocidad pautados por ejercicio (lo que el coach pidió). */
    exerciseTargets: Record<string, { rpe: string | null; velocity: string | null }>;
}

export interface SnapshotSet {
    id: string;
    exercise_id: string;
    exercise: string;
    order: number;
    load: number | null;
    reps: number | null;
    rpe: number | null;
    done: boolean;
    notes: string | null;
}

export interface ReviewSnapshot {
    legacy?: boolean;
    completed_at?: string | null;
    athlete_notes?: string | null;
    sets?: SnapshotSet[];
}

export interface SessionReview {
    id: string;
    sessionId: string;
    reviewedBy: string | null;
    reviewedAt: string;
    athleteVersion: string | null;
    wasModified: boolean;
    undoneAt: string | null;
    snapshot: ReviewSnapshot;
}

export interface SessionFeedback {
    id: string;
    sessionId: string | null;
    senderId: string | null;
    kind: string;
    title: string;
    body: string | null;
    createdAt: string;
    readAt: string | null;
    reviewId: string | null;
}

const SELECT_SESION = `
    id, block_id, week_number, day_number, name, date, day_of_week,
    completed_at, athlete_notes, warmup, extras,
    reviewed_at, reviewed_by, athlete_updated_at, review_pending, modified_after_review,
    block:training_blocks!inner (id, name, athlete_id, coach_id, start_date, start_week),
    session_exercises (
        id, exercise_id, order_index, notes, variant_name, rest_seconds, section, rpe, velocity_avg,
        exercise:exercise_library (name),
        training_sets (*)
    )
`;

type FilaSesion = {
    id: string; block_id: string; week_number: number; day_number: number;
    name: string | null; date: string | null; day_of_week: string | null;
    completed_at: string | null; athlete_notes: string | null;
    warmup: string | null; extras: string | null;
    reviewed_at: string | null; reviewed_by: string | null; athlete_updated_at: string | null;
    review_pending: boolean | null; modified_after_review: boolean | null;
    block: { id: string; name: string; athlete_id: string; coach_id: string; start_date: string | null; start_week: number | null } | null;
    session_exercises: {
        id: string; exercise_id: string; order_index: number;
        notes: string | null; variant_name: string | null; rest_seconds: number | null;
        section: string | null; rpe: string | null; velocity_avg: string | null;
        exercise: { name: string } | null;
        training_sets: TrainingSet[];
    }[];
};

/** Lo mismo que `getExecutionLog` hace por serie, para que las dos pantallas digan lo mismo. */
function aSerie(set: TrainingSet): LoggedSet {
    return {
        id: set.id,
        orderIndex: set.order_index,
        targetReps: set.target_reps ?? null,
        targetLoad: set.target_load ?? null,
        targetMetric: set.target_metric ?? null,
        targetRpe: set.target_rpe ?? null,
        restSeconds: set.rest_seconds ?? null,
        setType: set.set_type ?? null,
        setDetail: set.set_detail ?? null,
        groupTag: set.group_tag ?? null,
        actualReps: set.actual_reps ?? null,
        actualLoad: set.actual_load ?? null,
        actualRpe: set.actual_rpe ?? null,
        isCompleted: set.is_completed ?? Boolean(set.actual_reps || set.actual_load),
        notes: set.notes ?? null,
        videoUrl: set.video_url ?? null,
        vbtFileUrl: set.vbt_file_url ?? null,
        vbtMeanVelocity: set.vbt_mean_velocity ?? null,
        vbtPeakVelocity: set.vbt_peak_velocity ?? null,
        vbtVelocityLoss: set.vbt_velocity_loss ?? null,
        vbtEst1RM: set.vbt_est_1rm ?? null,
    };
}

function aSesion(fila: FilaSesion): ReviewedSession {
    const objetivos: ReviewedSession['exerciseTargets'] = {};
    const ejercicios: LoggedExercise[] = [...(fila.session_exercises ?? [])]
        // Fuera el calentamiento: de aquí salen el cumplimiento y el tonelaje,
        // y las aproximaciones no son series que revisar.
        .filter(ex => countsForVolume(ex.section))
        .sort((a, b) => a.order_index - b.order_index)
        .map(ex => {
            objetivos[ex.id] = { rpe: ex.rpe ?? null, velocity: ex.velocity_avg ?? null };
            return {
                id: ex.id,
                exerciseId: ex.exercise_id,
                name: ex.exercise?.name ?? 'Ejercicio',
                variantName: ex.variant_name,
                coachNotes: ex.notes,
                restSeconds: ex.rest_seconds,
                orderIndex: ex.order_index,
                sets: [...(ex.training_sets ?? [])]
                    .sort((a, b) => a.order_index - b.order_index)
                    .map(aSerie),
            };
        });

    return {
        id: fila.id,
        blockId: fila.block_id,
        blockName: fila.block?.name ?? 'Bloque',
        weekNumber: fila.week_number,
        dayNumber: fila.day_number,
        name: fila.name,
        dayOfWeek: fila.day_of_week,
        date: fila.date,
        completedAt: fila.completed_at,
        athleteNotes: fila.athlete_notes,
        warmup: fila.warmup,
        extras: fila.extras,
        exercises: ejercicios,
        reviewedAt: fila.reviewed_at,
        reviewedBy: fila.reviewed_by,
        athleteUpdatedAt: fila.athlete_updated_at,
        reviewPending: Boolean(fila.review_pending),
        modifiedAfterReview: Boolean(fila.modified_after_review),
        athleteId: fila.block?.athlete_id ?? '',
        blockStartDate: fila.block?.start_date ?? null,
        blockStartWeek: fila.block?.start_week ?? null,
        exerciseTargets: objetivos,
    };
}

/**
 * Los mensajes de las funciones de la base ya están en castellano y dicen qué
 * pasa ("El atleta todavía no ha terminado este entrenamiento"). Se enseñan
 * tal cual; lo que no venga de ahí se resume en algo que se pueda reintentar.
 */
function errorLegible(error: { message?: string; code?: string } | null): Error {
    const msg = error?.message ?? '';
    if (/Failed to fetch|NetworkError/i.test(msg)) return new Error('Sin conexión. Inténtalo de nuevo.');
    if (msg && !/^(PGRST|[0-9A-Z]{5}:)/.test(msg) && msg.length < 200) return new Error(msg);
    return new Error('No se ha podido completar. Inténtalo de nuevo.');
}

export const reviewService = {
    /** Una fila por atleta con entrenamientos por revisar. */
    async coachSummary(): Promise<InboxAthleteSummary[]> {
        const { data, error } = await supabase.rpc('coach_inbox_summary');
        if (error) throw errorLegible(error);
        return ((data ?? []) as {
            athlete_id: string; full_name: string | null; avatar_url: string | null;
            pending_count: number; modified_count: number;
            last_completed_at: string | null; oldest_pending_at: string | null;
        }[]).map(r => ({
            athleteId: r.athlete_id,
            fullName: r.full_name?.trim() || 'Atleta',
            avatarUrl: r.avatar_url,
            pendingCount: r.pending_count,
            modifiedCount: r.modified_count,
            lastCompletedAt: r.last_completed_at,
            oldestPendingAt: r.oldest_pending_at,
        }));
    },

    /** Los entrenamientos pendientes de un atleta, del más antiguo al más reciente. */
    async pendingSessions(athleteId: string): Promise<ReviewedSession[]> {
        const { data, error } = await supabase
            .from('training_sessions')
            .select(SELECT_SESION)
            .eq('review_pending', true)
            .eq('block.athlete_id', athleteId)
            .order('completed_at', { ascending: true });

        if (error) throw errorLegible(error);
        return ((data as unknown as FilaSesion[]) ?? []).map(aSesion);
    },

    /** Historial de revisiones de varias sesiones, de la más reciente a la más antigua. */
    async history(sessionIds: string[]): Promise<Record<string, SessionReview[]>> {
        if (sessionIds.length === 0) return {};
        const { data, error } = await supabase
            .from('training_session_reviews')
            .select('id, session_id, reviewed_by, reviewed_at, athlete_version, was_modified, undone_at, snapshot')
            .in('session_id', sessionIds)
            .order('reviewed_at', { ascending: false });

        if (error) throw errorLegible(error);

        const porSesion: Record<string, SessionReview[]> = {};
        for (const r of (data ?? []) as {
            id: string; session_id: string; reviewed_by: string | null; reviewed_at: string;
            athlete_version: string | null; was_modified: boolean; undone_at: string | null; snapshot: ReviewSnapshot;
        }[]) {
            (porSesion[r.session_id] ??= []).push({
                id: r.id,
                sessionId: r.session_id,
                reviewedBy: r.reviewed_by,
                reviewedAt: r.reviewed_at,
                athleteVersion: r.athlete_version,
                wasModified: r.was_modified,
                undoneAt: r.undone_at,
                snapshot: r.snapshot ?? {},
            });
        }
        return porSesion;
    },

    /** Los comentarios del entrenador sobre varias sesiones, en orden de envío. */
    async feedbackFor(sessionIds: string[]): Promise<Record<string, SessionFeedback[]>> {
        if (sessionIds.length === 0) return {};
        const { data, error } = await supabase
            .from('inbox_items')
            .select('id, session_id, sender_id, kind, title, body, created_at, read_at, review_id')
            .in('session_id', sessionIds)
            .eq('kind', 'training_feedback')
            .order('created_at', { ascending: true });

        if (error) throw errorLegible(error);

        const porSesion: Record<string, SessionFeedback[]> = {};
        for (const r of (data ?? []) as {
            id: string; session_id: string | null; sender_id: string | null; kind: string;
            title: string; body: string | null; created_at: string; read_at: string | null; review_id: string | null;
        }[]) {
            if (!r.session_id) continue;
            (porSesion[r.session_id] ??= []).push({
                id: r.id,
                sessionId: r.session_id,
                senderId: r.sender_id,
                kind: r.kind,
                title: r.title,
                body: r.body,
                createdAt: r.created_at,
                readAt: r.read_at,
                reviewId: r.review_id,
            });
        }
        return porSesion;
    },

    /** EL CHECK. Con comentario opcional, que le llega al atleta como feedback. */
    async review(sessionId: string, feedback?: string | null): Promise<{ reviewId: string; reviewedAt: string }> {
        const { data, error } = await supabase.rpc('review_session', {
            p_session_id: sessionId,
            p_feedback: feedback?.trim() ? feedback.trim() : null,
        });
        if (error) throw errorLegible(error);
        const r = data as { review_id: string; reviewed_at: string };
        return { reviewId: r.review_id, reviewedAt: r.reviewed_at };
    },

    /** Deshacer el último check (el "Deshacer" del aviso). */
    async unreview(sessionId: string): Promise<void> {
        const { error } = await supabase.rpc('unreview_session', { p_session_id: sessionId });
        if (error) throw errorLegible(error);
    },

    /** Un comentario sobre la sesión, sin marcarla como revisada. */
    async sendFeedback(sessionId: string, body: string): Promise<string> {
        const { data, error } = await supabase.rpc('send_session_feedback', {
            p_session_id: sessionId,
            p_body: body,
        });
        if (error) throw errorLegible(error);
        return data as string;
    },

    async deleteFeedback(itemId: string): Promise<void> {
        const { error } = await supabase.rpc('delete_session_feedback', { p_item_id: itemId });
        if (error) throw errorLegible(error);
    },
};

// =====================================================================
// QUÉ HA CAMBIADO DESDE LA ÚLTIMA REVISIÓN
// =====================================================================

export interface CambioDeSerie {
    exerciseName: string;
    /** Número de serie dentro del ejercicio, empezando en 1. */
    serie: number;
    campo: 'kg' | 'reps' | 'RPE' | 'hecha' | 'nota';
    antes: string;
    ahora: string;
}

const fmt = (v: number | null | undefined) => (v == null ? '—' : String(v).replace('.', ','));

/**
 * Compara el registro actual con la foto de la última revisión y dice qué
 * cambió, serie a serie. Función pura: se prueba sin red.
 */
export function cambiosDesdeRevision(sesion: LoggedSession, foto: ReviewSnapshot | null | undefined): {
    cambios: CambioDeSerie[];
    notasCambiadas: boolean;
} {
    if (!foto || foto.legacy || !foto.sets) return { cambios: [], notasCambiadas: false };

    const antes = new Map(foto.sets.map(s => [s.id, s]));
    const cambios: CambioDeSerie[] = [];

    for (const ex of sesion.exercises) {
        ex.sets.forEach((s, i) => {
            const previa = antes.get(s.id);
            if (!previa) return;
            const base = { exerciseName: ex.name, serie: i + 1 };
            if ((previa.load ?? null) !== (s.actualLoad ?? null)) {
                cambios.push({ ...base, campo: 'kg', antes: fmt(previa.load), ahora: fmt(s.actualLoad) });
            }
            if ((previa.reps ?? null) !== (s.actualReps ?? null)) {
                cambios.push({ ...base, campo: 'reps', antes: fmt(previa.reps), ahora: fmt(s.actualReps) });
            }
            if ((previa.rpe ?? null) !== (s.actualRpe ?? null)) {
                cambios.push({ ...base, campo: 'RPE', antes: fmt(previa.rpe), ahora: fmt(s.actualRpe) });
            }
            if (Boolean(previa.done) !== Boolean(s.isCompleted)) {
                cambios.push({ ...base, campo: 'hecha', antes: previa.done ? 'sí' : 'no', ahora: s.isCompleted ? 'sí' : 'no' });
            }
            if ((previa.notes ?? '') !== (s.notes ?? '')) {
                cambios.push({ ...base, campo: 'nota', antes: previa.notes || '—', ahora: s.notes || '—' });
            }
        });
    }

    return {
        cambios,
        notasCambiadas: (foto.athlete_notes ?? '') !== (sesion.athleteNotes ?? ''),
    };
}
