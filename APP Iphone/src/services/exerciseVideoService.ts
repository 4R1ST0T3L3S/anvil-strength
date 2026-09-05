import { supabase } from '../lib/supabase';

/**
 * ANVIL STRENGTH — VÍDEOS DE EJERCICIOS
 *
 * Los archivos viven en Cloudflare R2 detrás de un dominio propio; la BD solo
 * guarda la clave del objeto. R2 no cobra egress, así que servir el mismo clip
 * mil veces cuesta lo mismo que servirlo una — que es exactamente el patrón de
 * uso de un vídeo de técnica.
 *
 * Ver database/exercise_videos.sql para el esquema y las instrucciones de subida.
 */

export type VideoProvider = 'r2' | 'supabase' | 'external';

export interface ExerciseVideo {
    id: string;
    exercise_id: string;
    coach_id: string | null;
    athlete_id: string | null;
    provider: VideoProvider;
    video_key: string;
    poster_key: string | null;
    duration_s: number | null;
    cues: string[] | null;
    common_errors: string[] | null;
    notes: string | null;
    created_at: string;
}

/** De dónde sale el vídeo que se está viendo. La interfaz lo dice al usuario. */
export type VideoScope = 'athlete' | 'coach' | 'default';

export interface ResolvedVideo extends ExerciseVideo {
    scope: VideoScope;
    videoUrl: string;
    posterUrl: string | null;
}

const MEDIA_BASE = (import.meta.env.VITE_MEDIA_BASE_URL || '').replace(/\/$/, '');

/**
 * Clave de objeto -> URL pública.
 *
 * `external` guarda la URL completa (por si algún día se enlaza un vídeo de
 * fuera), así que se devuelve tal cual.
 */
export function mediaUrl(key: string, provider: VideoProvider = 'r2'): string {
    if (!key) return '';
    if (provider === 'external' || /^https?:\/\//i.test(key)) return key;

    if (provider === 'supabase') {
        return supabase.storage.from('exercise-videos').getPublicUrl(key).data.publicUrl;
    }

    if (!MEDIA_BASE) {
        // Sin dominio configurado no se puede construir la URL. Se avisa una
        // vez en consola en vez de devolver una ruta rota silenciosamente.
        console.warn(
            '[exerciseVideoService] Falta VITE_MEDIA_BASE_URL: los vídeos de ejercicios no se mostrarán.'
        );
        return '';
    }

    return `${MEDIA_BASE}/${key.replace(/^\//, '')}`;
}

function scopeOf(v: ExerciseVideo): VideoScope {
    if (v.athlete_id) return 'athlete';
    if (v.coach_id) return 'coach';
    return 'default';
}

function decorate(v: ExerciseVideo): ResolvedVideo {
    return {
        ...v,
        scope: scopeOf(v),
        videoUrl: mediaUrl(v.video_key, v.provider),
        posterUrl: v.poster_key ? mediaUrl(v.poster_key, v.provider) : null,
    };
}

export const exerciseVideoService = {
    /**
     * Vídeo aplicable a un ejercicio para un atleta.
     *
     * La prioridad (atleta > coach > por defecto) se resuelve en la BD, no
     * aquí: si el orden viviera en el cliente, dos pantallas podrían acabar
     * mostrando vídeos distintos para el mismo ejercicio.
     */
    async resolve(exerciseId: string, athleteId?: string): Promise<ResolvedVideo | null> {
        const { data, error } = await supabase
            .rpc('resolve_exercise_video', {
                p_exercise_id: exerciseId,
                p_athlete_id: athleteId ?? null,
            })
            .maybeSingle();

        if (error) {
            console.error('resolve_exercise_video:', error);
            return null;
        }
        return data ? decorate(data as ExerciseVideo) : null;
    },

    /**
     * Resuelve varios ejercicios de golpe.
     *
     * Una sesión tiene 6-10 ejercicios; hacer una llamada por cada uno al
     * abrir la sesión son 10 idas y vueltas. Aquí se traen todos los
     * candidatos en una consulta y se elige en memoria aplicando la MISMA
     * prioridad que la función de BD.
     */
    async resolveMany(
        exerciseIds: string[],
        athleteId: string
    ): Promise<Record<string, ResolvedVideo>> {
        if (exerciseIds.length === 0) return {};

        const { data, error } = await supabase
            .from('exercise_videos')
            .select('*')
            .in('exercise_id', exerciseIds);

        if (error) {
            console.error('resolveMany:', error);
            return {};
        }

        const rank = (v: ExerciseVideo) =>
            v.athlete_id === athleteId ? 0 : v.coach_id ? 1 : 2;

        const best: Record<string, ExerciseVideo> = {};
        for (const row of (data || []) as ExerciseVideo[]) {
            // Un vídeo dirigido a OTRO atleta no aplica. La RLS ya no debería
            // devolverlo, pero el cliente no da por hecho lo que hace el servidor.
            if (row.athlete_id && row.athlete_id !== athleteId) continue;

            const current = best[row.exercise_id];
            if (!current || rank(row) < rank(current)) best[row.exercise_id] = row;
        }

        return Object.fromEntries(
            Object.entries(best).map(([id, v]) => [id, decorate(v)])
        );
    },

    /** Vídeos que ha subido un coach, para su pantalla de gestión. */
    async listByCoach(coachId: string): Promise<ExerciseVideo[]> {
        const { data, error } = await supabase
            .from('exercise_videos')
            .select('*')
            .eq('coach_id', coachId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []) as ExerciseVideo[];
    },

    /**
     * Crea o reemplaza el vídeo de un ámbito.
     *
     * `athleteId` presente = anulación para ese atleta concreto; el caso de
     * "quiero que Marc haga la sentadilla de otra forma".
     */
    async upsert(input: {
        exerciseId: string;
        coachId: string;
        athleteId?: string | null;
        videoKey: string;
        posterKey?: string | null;
        provider?: VideoProvider;
        cues?: string[];
        commonErrors?: string[];
        notes?: string;
    }): Promise<ExerciseVideo> {
        const row = {
            exercise_id: input.exerciseId,
            coach_id: input.coachId,
            athlete_id: input.athleteId ?? null,
            provider: input.provider ?? 'r2',
            video_key: input.videoKey,
            poster_key: input.posterKey ?? null,
            cues: input.cues ?? null,
            common_errors: input.commonErrors ?? null,
            notes: input.notes ?? null,
            created_by: input.coachId,
        };

        const { data, error } = await supabase
            .from('exercise_videos')
            .upsert(row, {
                onConflict: input.athleteId
                    ? 'exercise_id,athlete_id'
                    : 'exercise_id,coach_id',
            })
            .select()
            .single();

        if (error) throw error;
        return data as ExerciseVideo;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('exercise_videos').delete().eq('id', id);
        if (error) throw error;
    },
};
