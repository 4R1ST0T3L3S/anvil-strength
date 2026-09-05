-- =====================================================================
-- ANVIL STRENGTH — VÍDEOS DE EJERCICIOS (F6)
-- =====================================================================
-- Un mismo ejercicio puede tener varios vídeos y gana el más específico:
--
--   1. Vídeo para UN atleta concreto   (el coach quiere que Marc haga la
--                                        sentadilla de una forma distinta)
--   2. Vídeo del coach para sus atletas (su técnica preferida)
--   3. Vídeo por defecto del sistema    (el tuyo)
--
-- Los archivos NO se guardan aquí. Se suben a Cloudflare R2 y en la BD solo
-- vive la clave del objeto. Motivo: R2 no cobra egress, así que servir el
-- mismo clip mil veces cuesta lo mismo que servirlo una.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS exercise_videos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_id  UUID NOT NULL REFERENCES exercise_library(id) ON DELETE CASCADE,

    -- Ámbito. Ambos NULL = vídeo por defecto del sistema.
    coach_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
    athlete_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,

    -- Ubicación del archivo. `provider` permite cambiar de hosting sin
    -- migrar datos: hoy r2, mañana lo que sea.
    provider     TEXT NOT NULL DEFAULT 'r2' CHECK (provider IN ('r2', 'supabase', 'external')),
    video_key    TEXT NOT NULL,           -- p.ej. 'ejercicios/sentadilla-720.mp4'
    poster_key   TEXT,                    -- miniatura; evita descargar el vídeo para ver algo
    duration_s   NUMERIC,

    -- Notas técnicas que acompañan al vídeo en la ficha del atleta.
    cues         TEXT[],                  -- 'Rodillas fuera', 'Pecho arriba'
    common_errors TEXT[],
    notes        TEXT,

    created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Un vídeo para un atleta concreto tiene que declarar de qué coach viene:
    -- sin esto no se puede comprobar en RLS quién puede crearlo.
    CONSTRAINT exercise_videos_scope_valid CHECK (
        athlete_id IS NULL OR coach_id IS NOT NULL
    )
);

-- Un único vídeo por (ejercicio, ámbito). Postgres trata los NULL como
-- distintos en un UNIQUE normal, así que hacen falta tres índices parciales.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_videos_default_uniq
    ON exercise_videos (exercise_id)
    WHERE coach_id IS NULL AND athlete_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_videos_coach_uniq
    ON exercise_videos (exercise_id, coach_id)
    WHERE coach_id IS NOT NULL AND athlete_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_videos_athlete_uniq
    ON exercise_videos (exercise_id, athlete_id)
    WHERE athlete_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS exercise_videos_lookup
    ON exercise_videos (exercise_id, athlete_id, coach_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE exercise_videos ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve: los del sistema, los de su coach, y el suyo propio.
-- Un atleta NUNCA ve el vídeo personalizado de otro atleta.
DROP POLICY IF EXISTS "exvid_select" ON exercise_videos;
CREATE POLICY "exvid_select" ON exercise_videos
    FOR SELECT TO authenticated
    USING (
        (coach_id IS NULL AND athlete_id IS NULL)                    -- por defecto
        OR coach_id = auth.uid()                                     -- soy el coach
        OR athlete_id = auth.uid()                                   -- es para mí
        OR (
            athlete_id IS NULL
            AND coach_id IN (
                SELECT ca.coach_id FROM coach_athletes ca WHERE ca.athlete_id = auth.uid()
            )
        )
    );

-- Un coach solo crea vídeos a su nombre, y si son para un atleta concreto,
-- ese atleta tiene que ser suyo. Los vídeos por defecto los siembra el admin
-- con service_role, nunca desde el navegador.
DROP POLICY IF EXISTS "exvid_insert" ON exercise_videos;
CREATE POLICY "exvid_insert" ON exercise_videos
    FOR INSERT TO authenticated
    WITH CHECK (
        coach_id = auth.uid()
        AND public.is_coach()
        AND (
            athlete_id IS NULL
            OR EXISTS (
                SELECT 1 FROM coach_athletes ca
                 WHERE ca.coach_id = auth.uid() AND ca.athlete_id = exercise_videos.athlete_id
            )
        )
    );

DROP POLICY IF EXISTS "exvid_update" ON exercise_videos;
CREATE POLICY "exvid_update" ON exercise_videos
    FOR UPDATE TO authenticated
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "exvid_delete" ON exercise_videos;
CREATE POLICY "exvid_delete" ON exercise_videos
    FOR DELETE TO authenticated
    USING (coach_id = auth.uid());

REVOKE ALL ON exercise_videos FROM anon;

-- ---------------------------------------------------------------------
-- Resolución del vídeo aplicable
-- ---------------------------------------------------------------------
-- Devuelve UNA fila: la más específica que exista para ese atleta.
-- Se resuelve en servidor para que el cliente no tenga que traerse los tres
-- candidatos y elegir, y para que la prioridad no pueda divergir entre
-- pantallas.
CREATE OR REPLACE FUNCTION public.resolve_exercise_video(
    p_exercise_id UUID,
    p_athlete_id  UUID DEFAULT NULL
)
RETURNS SETOF exercise_videos
LANGUAGE SQL
STABLE
SECURITY INVOKER          -- respeta la RLS de arriba a propósito
SET search_path = public, pg_temp
AS $$
    SELECT v.*
      FROM exercise_videos v
     WHERE v.exercise_id = p_exercise_id
       AND (
            v.athlete_id = COALESCE(p_athlete_id, auth.uid())
         OR (v.athlete_id IS NULL AND v.coach_id IS NOT NULL)
         OR (v.athlete_id IS NULL AND v.coach_id IS NULL)
       )
     ORDER BY
        -- 0 = para este atleta, 1 = del coach, 2 = por defecto
        CASE
            WHEN v.athlete_id IS NOT NULL THEN 0
            WHEN v.coach_id  IS NOT NULL THEN 1
            ELSE 2
        END
     LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_exercise_video(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_exercise_video(UUID, UUID) FROM anon;

-- ---------------------------------------------------------------------
-- CÓMO SUBIR LOS VÍDEOS (Cloudflare R2)
-- ---------------------------------------------------------------------
-- 1. Crea un bucket R2 llamado `anvil-media` y conéctale un dominio propio
--    (p.ej. media.anvilstrength.es). El egress por ese dominio es GRATIS.
-- 2. Comprime cada clip antes de subirlo. Sin audio y en bucle corto:
--
--      ffmpeg -i original.mov -t 10 -an -vf "scale=-2:720" \
--             -c:v libx264 -crf 26 -preset slow -movflags +faststart \
--             sentadilla-720.mp4
--
--      ffmpeg -i sentadilla-720.mp4 -vframes 1 -q:v 6 sentadilla-poster.jpg
--
--    Resultado típico: 300 KB - 1,5 MB por ejercicio. 70 ejercicios ≈ 70 MB.
-- 3. Sube a R2 bajo `ejercicios/` y registra la fila (service_role):
--
--      INSERT INTO exercise_videos (exercise_id, video_key, poster_key, cues)
--      SELECT id, 'ejercicios/sentadilla-720.mp4', 'ejercicios/sentadilla-poster.jpg',
--             ARRAY['Rodillas hacia fuera', 'Pecho arriba', 'Peso en medio del pie']
--        FROM exercise_library WHERE LOWER(name) = 'sentadilla';
--
-- 4. Pon la URL base del dominio en VITE_MEDIA_BASE_URL (.env.local y Vercel).
