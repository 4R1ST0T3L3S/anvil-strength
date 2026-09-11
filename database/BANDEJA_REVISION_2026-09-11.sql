-- =====================================================================
-- ANVIL STRENGTH — BANDEJA DE ENTRADA Y REVISIÓN DE ENTRENAMIENTOS
-- 2026-09-11 · Idempotente · Aditiva: no borra ni reescribe datos de nadie
-- =====================================================================
--
-- QUÉ RESUELVE
--
-- El entrenador podía LEER lo que hizo el atleta (pestaña Registro), pero no
-- había forma de saber qué le quedaba por mirar, ni de dejarle constancia al
-- atleta de que lo había mirado, ni de mandarle un comentario sobre ESE día.
--
-- EL MODELO, EN LA BASE Y NO EN LA PANTALLA
--
--   · Un entrenamiento entra en la bandeja cuando el atleta lo CIERRA
--     (`completed_at`). Lo programado sin cerrar no entra.
--   · Sale cuando el entrenador pulsa el check (`review_session`). Abrirlo no
--     marca nada: no hay ninguna escritura al leer.
--   · Si DESPUÉS el ATLETA cambia algo (cierre, notas del día o cualquier dato
--     registrado de sus series), vuelve a estar pendiente, marcado como
--     modificado tras la revisión. Un cambio del ENTRENADOR no lo reabre.
--   · Cada revisión guarda una FOTO de lo registrado, así que la interfaz puede
--     decir exactamente qué cambió. La sesión no se duplica nunca.
--   · El feedback es una fila de `inbox_items`: la misma que ve el atleta en su
--     bandeja y la que ve el entrenador en la sesión. Una sola verdad.
--
-- Todo lo que escribe va por funciones SECURITY DEFINER. Nadie puede poner
-- "revisado" a mano con un UPDATE: el disparador lo deshace.
-- =====================================================================


-- =====================================================================
-- 0. REQUISITOS COMPARTIDOS CON NOTIFICACIONES_2026-09-11.sql
-- =====================================================================
-- Las funciones de este fichero dejan avisos con categoría. Se declaran
-- aquí también (IF NOT EXISTS) para que el orden de ejecución no importe.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS ref_id   UUID;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_category_check') THEN
        ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check CHECK (
            category IN ('message','feedback','review','inbox','training','competition','checkin','club','system')
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS notifications_ref_idx ON public.notifications (ref_id) WHERE ref_id IS NOT NULL;


-- =====================================================================
-- 1. EL ESTADO DE REVISIÓN, EN LA PROPIA SESIÓN
-- =====================================================================

ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS athlete_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.training_sessions.athlete_updated_at IS
    'Último cambio HECHO POR EL ATLETA en el registro de este día (cierre, notas o series). Lo mantienen los disparadores; no se escribe a mano.';
COMMENT ON COLUMN public.training_sessions.reviewed_at IS
    'Última revisión del entrenador. Solo la escriben review_session()/unreview_session().';
COMMENT ON COLUMN public.training_sessions.reviewed_by IS
    'Quién revisó. NULL con reviewed_at puesto = archivado al activar la bandeja (anterior a ella).';

-- Migración de lo existente, ANTES de que existan los disparadores.
--
-- Lo cerrado en los últimos 14 días entra en la bandeja como pendiente. Lo
-- anterior se archiva sin inventarse un revisor: `reviewed_by` queda nulo y
-- la interfaz lo presenta como "anterior a la bandeja", no como "revisado".
UPDATE public.training_sessions
   SET athlete_updated_at = completed_at
 WHERE completed_at IS NOT NULL
   AND athlete_updated_at IS NULL;

UPDATE public.training_sessions
   SET reviewed_at = completed_at
 WHERE completed_at IS NOT NULL
   AND reviewed_at IS NULL
   AND completed_at < now() - INTERVAL '14 days';

-- Columnas GENERADAS: el "pendiente" no lo decide ninguna pantalla, lo decide
-- la fila. Y así PostgREST puede filtrar por él (`review_pending=eq.true`),
-- cosa que no puede hacer comparando dos columnas entre sí.
ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS review_pending BOOLEAN GENERATED ALWAYS AS (
        completed_at IS NOT NULL
        AND (reviewed_at IS NULL OR COALESCE(athlete_updated_at, completed_at) > reviewed_at)
    ) STORED;

ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS modified_after_review BOOLEAN GENERATED ALWAYS AS (
        completed_at IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND COALESCE(athlete_updated_at, completed_at) > reviewed_at
    ) STORED;

CREATE INDEX IF NOT EXISTS training_sessions_pendientes_idx
    ON public.training_sessions (block_id, completed_at DESC)
    WHERE review_pending;

-- Defensa en profundidad: hoy la RLS ya frena a `anon`, pero tenía todos los
-- privilegios de tabla sobre el registro de entrenamiento.
REVOKE ALL ON public.training_sessions FROM anon;
REVOKE ALL ON public.training_sets     FROM anon;


-- =====================================================================
-- 2. ETIQUETA LEGIBLE DE UN DÍA ("Lunes · Pierna pesada")
-- =====================================================================

CREATE OR REPLACE FUNCTION public.session_label(p_name TEXT, p_day_of_week TEXT, p_day_number INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        NULLIF(concat_ws(' · ',
            CASE p_day_of_week
                WHEN 'monday'    THEN 'Lunes'
                WHEN 'tuesday'   THEN 'Martes'
                WHEN 'wednesday' THEN 'Miércoles'
                WHEN 'thursday'  THEN 'Jueves'
                WHEN 'friday'    THEN 'Viernes'
                WHEN 'saturday'  THEN 'Sábado'
                WHEN 'sunday'    THEN 'Domingo'
            END,
            NULLIF(btrim(COALESCE(p_name, '')), '')
        ), ''),
        'Día ' || COALESCE(p_day_number, 1)
    );
$$;


-- =====================================================================
-- 3. QUIÉN PUEDE TOCAR QUÉ (disparador de la sesión)
-- =====================================================================
--
-- Tres puertas, en este orden:
--   · `anvil.review_service` — la abren las funciones de revisión, dentro de
--     su transacción. Pasa todo.
--   · `anvil.athlete_touch` — la abre el disparador de series para subir
--     `athlete_updated_at`. Los campos de revisión siguen blindados.
--   · Sin puerta: los campos de revisión no se mueven, y `athlete_updated_at`
--     solo sube si quien escribe ES el atleta del bloque y ha cambiado de
--     verdad el cierre o las notas del día.
--
-- `clock_timestamp()` y no `now()`: `now()` es la hora a la que EMPEZÓ la
-- transacción. Si el atleta guarda justo mientras el entrenador revisa, su
-- escritura espera al cerrojo de la fila y termina DESPUÉS; con `now()` la
-- marca quedaría antes de la revisión y el cambio se perdería de la bandeja.

CREATE OR REPLACE FUNCTION public.training_sessions_review_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_athlete UUID;
BEGIN
    IF coalesce(current_setting('anvil.review_service', true), '') = 'on' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Una sesión nace sin revisar, venga de donde venga (copias de
        -- semanas y de bloques incluidas).
        NEW.reviewed_at        := NULL;
        NEW.reviewed_by        := NULL;
        NEW.athlete_updated_at := NEW.completed_at;
        RETURN NEW;
    END IF;

    NEW.reviewed_at := OLD.reviewed_at;
    NEW.reviewed_by := OLD.reviewed_by;

    IF coalesce(current_setting('anvil.athlete_touch', true), '') = 'on' THEN
        RETURN NEW;
    END IF;

    NEW.athlete_updated_at := OLD.athlete_updated_at;

    IF v_uid IS NOT NULL
       AND (NEW.completed_at  IS DISTINCT FROM OLD.completed_at
            OR NEW.athlete_notes IS DISTINCT FROM OLD.athlete_notes) THEN
        SELECT tb.athlete_id INTO v_athlete
          FROM public.training_blocks tb
         WHERE tb.id = NEW.block_id;

        IF v_athlete = v_uid THEN
            NEW.athlete_updated_at := clock_timestamp();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_sessions_review_guard_trg ON public.training_sessions;
CREATE TRIGGER training_sessions_review_guard_trg
    BEFORE INSERT OR UPDATE ON public.training_sessions
    FOR EACH ROW EXECUTE FUNCTION public.training_sessions_review_guard();


-- =====================================================================
-- 4. UN CAMBIO DEL ATLETA EN SUS SERIES REABRE LA REVISIÓN
-- =====================================================================
--
-- Solo cuenta lo que es EJECUCIÓN (lo que registra el atleta), y solo si ha
-- cambiado de verdad: volver a guardar el mismo peso no reabre nada. Separar
-- un "4x8" (`expand_grouped_set`) no es un cambio de ejecución: inserta filas
-- vacías y renumera, y aquí no pasa nada.

CREATE OR REPLACE FUNCTION public.training_sets_athlete_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_session UUID;
    v_athlete UUID;
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF  NEW.actual_load       IS NOT DISTINCT FROM OLD.actual_load
        AND NEW.actual_reps       IS NOT DISTINCT FROM OLD.actual_reps
        AND NEW.actual_rpe        IS NOT DISTINCT FROM OLD.actual_rpe
        AND NEW.is_completed      IS NOT DISTINCT FROM OLD.is_completed
        AND NEW.notes             IS NOT DISTINCT FROM OLD.notes
        AND NEW.video_url         IS NOT DISTINCT FROM OLD.video_url
        AND NEW.vbt_file_url      IS NOT DISTINCT FROM OLD.vbt_file_url
        AND NEW.vbt_mean_velocity IS NOT DISTINCT FROM OLD.vbt_mean_velocity
        AND NEW.vbt_peak_velocity IS NOT DISTINCT FROM OLD.vbt_peak_velocity
        AND NEW.vbt_velocity_loss IS NOT DISTINCT FROM OLD.vbt_velocity_loss
        AND NEW.vbt_metrics       IS NOT DISTINCT FROM OLD.vbt_metrics THEN
            RETURN NULL;
        END IF;
    ELSIF NEW.actual_load IS NULL
      AND NEW.actual_reps IS NULL
      AND NEW.actual_rpe  IS NULL
      AND NOT COALESCE(NEW.is_completed, FALSE) THEN
        RETURN NULL;
    END IF;

    SELECT se.session_id, tb.athlete_id
      INTO v_session, v_athlete
      FROM public.session_exercises se
      JOIN public.training_sessions ts ON ts.id = se.session_id
      JOIN public.training_blocks   tb ON tb.id = ts.block_id
     WHERE se.id = NEW.session_exercise_id;

    IF v_session IS NULL OR v_athlete IS DISTINCT FROM v_uid THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('anvil.athlete_touch', 'on', true);
    UPDATE public.training_sessions
       SET athlete_updated_at = clock_timestamp()
     WHERE id = v_session;
    PERFORM set_config('anvil.athlete_touch', 'off', true);

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS training_sets_athlete_touch_trg ON public.training_sets;
CREATE TRIGGER training_sets_athlete_touch_trg
    AFTER INSERT OR UPDATE ON public.training_sets
    FOR EACH ROW EXECUTE FUNCTION public.training_sets_athlete_touch();


-- =====================================================================
-- 5. HISTORIAL DE REVISIONES, CON FOTO
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.training_session_reviews (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID        NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
    athlete_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reviewed_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    -- La versión del atleta que se revisó (su `athlete_updated_at` de entonces).
    athlete_version TIMESTAMPTZ,
    -- ¿Era una segunda revisión tras una modificación del atleta?
    was_modified    BOOLEAN     NOT NULL DEFAULT FALSE,
    snapshot        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    undone_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_session_reviews_session_idx
    ON public.training_session_reviews (session_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS training_session_reviews_athlete_idx
    ON public.training_session_reviews (athlete_id, reviewed_at DESC);

ALTER TABLE public.training_session_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revisiones leer" ON public.training_session_reviews;
CREATE POLICY "revisiones leer" ON public.training_session_reviews
    FOR SELECT TO authenticated
    USING (
        athlete_id  = (SELECT auth.uid())
        OR reviewed_by = (SELECT auth.uid())
        OR public.manages_athlete(athlete_id)
    );
-- Sin políticas de escritura: solo escriben las funciones de abajo.

REVOKE ALL ON public.training_session_reviews FROM anon, authenticated;
GRANT SELECT ON public.training_session_reviews TO authenticated;

-- Las sesiones archivadas al activar la bandeja dejan su rastro en el
-- historial, marcadas como tales.
INSERT INTO public.training_session_reviews
    (session_id, athlete_id, reviewed_by, reviewed_at, athlete_version, was_modified, snapshot)
SELECT ts.id, tb.athlete_id, NULL, ts.reviewed_at, ts.athlete_updated_at, FALSE,
       jsonb_build_object('legacy', true)
  FROM public.training_sessions ts
  JOIN public.training_blocks   tb ON tb.id = ts.block_id
 WHERE ts.reviewed_at IS NOT NULL
   AND ts.reviewed_by IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.training_session_reviews r WHERE r.session_id = ts.id);


-- Foto de lo registrado en un día. Interna: la llaman las funciones de
-- revisión, no el navegador.
CREATE OR REPLACE FUNCTION public.session_execution_snapshot(p_session_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'completed_at',  ts.completed_at,
        'athlete_notes', ts.athlete_notes,
        'sets', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id',          s.id,
                       'exercise_id', se.id,
                       'exercise',    COALESCE(el.name, 'Ejercicio'),
                       'order',       s.order_index,
                       'load',        s.actual_load,
                       'reps',        s.actual_reps,
                       'rpe',         s.actual_rpe,
                       'done',        COALESCE(s.is_completed, FALSE),
                       'notes',       s.notes
                   ) ORDER BY se.order_index, s.order_index)
              FROM public.session_exercises se
              JOIN public.training_sets s ON s.session_exercise_id = se.id
              LEFT JOIN public.exercise_library el ON el.id = se.exercise_id
             WHERE se.session_id = ts.id
        ), '[]'::jsonb)
    )
    FROM public.training_sessions ts
    WHERE ts.id = p_session_id;
$$;

REVOKE ALL ON FUNCTION public.session_execution_snapshot(UUID) FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- 6. LA BANDEJA DEL ATLETA
-- =====================================================================
--
-- Pensada para crecer: `kind` dice qué es y `payload` lleva lo que cada tipo
-- necesite. Hoy: feedback de un entrenamiento, aviso de "revisado", nota
-- libre del entrenador (reservado) y avisos del sistema.

CREATE TABLE IF NOT EXISTS public.inbox_items (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    kind         TEXT        NOT NULL CHECK (kind IN ('training_feedback','training_reviewed','coach_note','system')),
    session_id   UUID        REFERENCES public.training_sessions(id) ON DELETE SET NULL,
    review_id    UUID        REFERENCES public.training_session_reviews(id) ON DELETE SET NULL,
    title        TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    body         TEXT        CHECK (body IS NULL OR char_length(body) <= 4000),
    payload      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at      TIMESTAMPTZ,
    archived_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS inbox_items_recipient_idx ON public.inbox_items (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbox_items_unread_idx    ON public.inbox_items (recipient_id) WHERE read_at IS NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS inbox_items_session_idx   ON public.inbox_items (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbox_items_sender_idx    ON public.inbox_items (sender_id, created_at DESC);

ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bandeja leer" ON public.inbox_items;
CREATE POLICY "bandeja leer" ON public.inbox_items
    FOR SELECT TO authenticated
    USING (recipient_id = (SELECT auth.uid()) OR sender_id = (SELECT auth.uid()));
-- Sin políticas de escritura: todo pasa por las funciones de abajo, que son
-- las que validan la relación y dejan el aviso.

REVOKE ALL ON public.inbox_items FROM anon, authenticated;
GRANT SELECT ON public.inbox_items TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inbox_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_items;
    END IF;
END $$;


-- =====================================================================
-- 7. FUNCIONES DE LA BANDEJA
-- =====================================================================

-- ¿Puede quien llama revisar/comentar esta sesión? Devuelve la fila o lanza.
CREATE OR REPLACE FUNCTION public.inbox_session_for_coach(p_session_id UUID)
RETURNS TABLE (
    session_id UUID, athlete_id UUID, coach_id UUID, block_name TEXT,
    week_number INTEGER, label TEXT, completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Hace falta iniciar sesión.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT ts.id, tb.athlete_id, tb.coach_id, tb.name, ts.week_number,
               public.session_label(ts.name, ts.day_of_week, ts.day_number),
               ts.completed_at
          FROM public.training_sessions ts
          JOIN public.training_blocks   tb ON tb.id = ts.block_id
         WHERE ts.id = p_session_id
           AND (tb.coach_id = v_uid OR public.manages_athlete(tb.athlete_id));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ese entrenamiento no es de ninguno de tus atletas.' USING ERRCODE = '42501';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.inbox_session_for_coach(UUID) FROM PUBLIC, anon, authenticated;


-- Resumen de la bandeja del entrenador: una fila por atleta con pendientes.
CREATE OR REPLACE FUNCTION public.coach_inbox_summary()
RETURNS TABLE (
    athlete_id        UUID,
    full_name         TEXT,
    avatar_url        TEXT,
    pending_count     INTEGER,
    modified_count    INTEGER,
    last_completed_at TIMESTAMPTZ,
    oldest_pending_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT tb.athlete_id,
           p.full_name,
           p.avatar_url,
           COUNT(*)::INTEGER,
           COUNT(*) FILTER (WHERE ts.modified_after_review)::INTEGER,
           MAX(ts.completed_at),
           MIN(ts.completed_at)
      FROM public.training_sessions ts
      JOIN public.training_blocks   tb ON tb.id = ts.block_id
      JOIN public.profiles          p  ON p.id  = tb.athlete_id
     WHERE ts.review_pending
       AND tb.coach_id = auth.uid()
       AND EXISTS (
            SELECT 1 FROM public.coach_athletes ca
             WHERE ca.coach_id   = auth.uid()
               AND ca.athlete_id = tb.athlete_id
               AND ca.status     = 'active'
       )
     GROUP BY tb.athlete_id, p.full_name, p.avatar_url
     ORDER BY MAX(ts.completed_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.coach_inbox_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_inbox_summary() TO authenticated;


-- Marcar como revisado (con feedback opcional). Lo ÚNICO que saca un
-- entrenamiento de la bandeja.
CREATE OR REPLACE FUNCTION public.review_session(p_session_id UUID, p_feedback TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_s        RECORD;
    v_sesion   RECORD;
    v_feedback TEXT := NULLIF(btrim(COALESCE(p_feedback, '')), '');
    v_review   UUID;
    v_item     UUID;
    v_at       TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_s FROM public.inbox_session_for_coach(p_session_id);

    -- Cerrojo de la fila ANTES de hacer la foto: si el atleta está guardando
    -- en este mismo instante, se espera a que termine y la foto lo incluye.
    SELECT ts.completed_at, ts.athlete_updated_at, ts.modified_after_review
      INTO v_sesion
      FROM public.training_sessions ts
     WHERE ts.id = p_session_id
       FOR UPDATE;

    IF v_sesion.completed_at IS NULL THEN
        RAISE EXCEPTION 'El atleta todavía no ha terminado este entrenamiento.' USING ERRCODE = '22023';
    END IF;
    IF char_length(COALESCE(v_feedback, '')) > 4000 THEN
        RAISE EXCEPTION 'El comentario es demasiado largo (máximo 4000 caracteres).' USING ERRCODE = '22001';
    END IF;

    v_at := clock_timestamp();

    PERFORM set_config('anvil.review_service', 'on', true);
    UPDATE public.training_sessions
       SET reviewed_at = v_at,
           reviewed_by = v_uid
     WHERE id = p_session_id;
    PERFORM set_config('anvil.review_service', 'off', true);

    INSERT INTO public.training_session_reviews
        (session_id, athlete_id, reviewed_by, reviewed_at, athlete_version, was_modified, snapshot)
    VALUES
        (p_session_id, v_s.athlete_id, v_uid, v_at,
         COALESCE(v_sesion.athlete_updated_at, v_sesion.completed_at),
         COALESCE(v_sesion.modified_after_review, FALSE),
         public.session_execution_snapshot(p_session_id))
    RETURNING id INTO v_review;

    INSERT INTO public.inbox_items
        (recipient_id, sender_id, kind, session_id, review_id, title, body, payload)
    VALUES
        (v_s.athlete_id, v_uid,
         CASE WHEN v_feedback IS NULL THEN 'training_reviewed' ELSE 'training_feedback' END,
         p_session_id, v_review,
         CASE WHEN v_feedback IS NULL THEN 'Entrenamiento revisado' ELSE 'Feedback de tu entrenador' END,
         v_feedback,
         jsonb_build_object(
             'session_label', v_s.label,
             'block_name',    v_s.block_name,
             'week_number',   v_s.week_number,
             'completed_at',  v_sesion.completed_at,
             'was_modified',  COALESCE(v_sesion.modified_after_review, FALSE)
         ))
    RETURNING id INTO v_item;

    INSERT INTO public.notifications (user_id, title, message, link, category, ref_id)
    VALUES (
        v_s.athlete_id,
        CASE WHEN v_feedback IS NULL
             THEN 'Tu entrenador ha revisado tu entrenamiento'
             ELSE 'Nuevo feedback de tu entrenador' END,
        CASE WHEN v_feedback IS NULL THEN v_s.label ELSE left(v_feedback, 140) END,
        '/dashboard/bandeja',
        CASE WHEN v_feedback IS NULL THEN 'review' ELSE 'feedback' END,
        v_item
    );

    RETURN jsonb_build_object('review_id', v_review, 'inbox_item_id', v_item, 'reviewed_at', v_at);
END;
$$;

REVOKE ALL ON FUNCTION public.review_session(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_session(UUID, TEXT) TO authenticated;


-- Deshacer la última revisión (para el "Deshacer" del aviso tras un check
-- accidental). El comentario escrito, si lo había, se queda: ya es un mensaje.
CREATE OR REPLACE FUNCTION public.unreview_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_s    RECORD;
    v_last RECORD;
    v_prev RECORD;
BEGIN
    SELECT * INTO v_s FROM public.inbox_session_for_coach(p_session_id);

    PERFORM 1 FROM public.training_sessions WHERE id = p_session_id FOR UPDATE;

    SELECT * INTO v_last
      FROM public.training_session_reviews
     WHERE session_id = p_session_id AND undone_at IS NULL
     ORDER BY reviewed_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No hay ninguna revisión que deshacer.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.training_session_reviews SET undone_at = clock_timestamp() WHERE id = v_last.id;

    SELECT * INTO v_prev
      FROM public.training_session_reviews
     WHERE session_id = p_session_id AND undone_at IS NULL
     ORDER BY reviewed_at DESC
     LIMIT 1;

    PERFORM set_config('anvil.review_service', 'on', true);
    UPDATE public.training_sessions
       SET reviewed_at = v_prev.reviewed_at,
           reviewed_by = v_prev.reviewed_by
     WHERE id = p_session_id;
    PERFORM set_config('anvil.review_service', 'off', true);

    DELETE FROM public.notifications
     WHERE ref_id IN (SELECT id FROM public.inbox_items
                       WHERE review_id = v_last.id AND kind = 'training_reviewed');
    DELETE FROM public.inbox_items
     WHERE review_id = v_last.id AND kind = 'training_reviewed';

    RETURN jsonb_build_object('reviewed_at', v_prev.reviewed_at);
END;
$$;

REVOKE ALL ON FUNCTION public.unreview_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unreview_session(UUID) TO authenticated;


-- Feedback sin revisar (o comentarios adicionales sobre un día).
CREATE OR REPLACE FUNCTION public.send_session_feedback(p_session_id UUID, p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_s    RECORD;
    v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
    v_item UUID;
BEGIN
    SELECT * INTO v_s FROM public.inbox_session_for_coach(p_session_id);

    IF v_body IS NULL THEN
        RAISE EXCEPTION 'El comentario está vacío.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_body) > 4000 THEN
        RAISE EXCEPTION 'El comentario es demasiado largo (máximo 4000 caracteres).' USING ERRCODE = '22001';
    END IF;

    INSERT INTO public.inbox_items
        (recipient_id, sender_id, kind, session_id, title, body, payload)
    VALUES
        (v_s.athlete_id, v_uid, 'training_feedback', p_session_id,
         'Feedback de tu entrenador', v_body,
         jsonb_build_object(
             'session_label', v_s.label,
             'block_name',    v_s.block_name,
             'week_number',   v_s.week_number,
             'completed_at',  v_s.completed_at
         ))
    RETURNING id INTO v_item;

    INSERT INTO public.notifications (user_id, title, message, link, category, ref_id)
    VALUES (v_s.athlete_id, 'Nuevo feedback de tu entrenador', left(v_body, 140),
            '/dashboard/bandeja', 'feedback', v_item);

    RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.send_session_feedback(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_session_feedback(UUID, TEXT) TO authenticated;


-- El entrenador retira un comentario suyo (y su aviso).
CREATE OR REPLACE FUNCTION public.delete_session_feedback(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    -- El aviso solo se toca si el comentario es de quien llama.
    DELETE FROM public.notifications WHERE ref_id = p_item_id
       AND EXISTS (SELECT 1 FROM public.inbox_items i WHERE i.id = p_item_id AND i.sender_id = auth.uid());
    DELETE FROM public.inbox_items
     WHERE id = p_item_id
       AND sender_id = auth.uid()
       AND kind = 'training_feedback';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_session_feedback(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_session_feedback(UUID) TO authenticated;


-- El atleta gestiona su bandeja: leído / no leído / archivado. Leer un
-- elemento marca también su aviso de la campana, para que las dos cuentas
-- no se contradigan.
CREATE OR REPLACE FUNCTION public.inbox_set_state(
    p_ids      UUID[],
    p_read     BOOLEAN DEFAULT NULL,
    p_archived BOOLEAN DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_n   INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Hace falta iniciar sesión.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.inbox_items
       SET read_at = CASE
                        WHEN p_read IS TRUE  THEN COALESCE(read_at, now())
                        WHEN p_read IS FALSE THEN NULL
                        ELSE read_at
                     END,
           archived_at = CASE
                        WHEN p_archived IS TRUE  THEN COALESCE(archived_at, now())
                        WHEN p_archived IS FALSE THEN NULL
                        ELSE archived_at
                     END,
           updated_at = now()
     WHERE recipient_id = v_uid
       AND id = ANY(p_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;

    IF p_read IS TRUE THEN
        UPDATE public.notifications
           SET is_read = TRUE
         WHERE user_id = v_uid
           AND ref_id = ANY(p_ids)
           AND is_read = FALSE;
    END IF;

    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.inbox_set_state(UUID[], BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_set_state(UUID[], BOOLEAN, BOOLEAN) TO authenticated;


CREATE OR REPLACE FUNCTION public.inbox_mark_all_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_ids UUID[];
BEGIN
    SELECT array_agg(id) INTO v_ids
      FROM public.inbox_items
     WHERE recipient_id = v_uid AND read_at IS NULL;

    IF v_ids IS NULL THEN
        RETURN 0;
    END IF;
    RETURN public.inbox_set_state(v_ids, TRUE, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.inbox_mark_all_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_mark_all_read() TO authenticated;


-- =====================================================================
-- 8. AVISO AL ENTRENADOR CUANDO ALGO ENTRA EN SU BANDEJA
-- =====================================================================
--
-- En AFTER porque las columnas generadas ya están calculadas. Solo en el
-- paso de "no pendiente" a "pendiente", y como mucho un aviso por sesión cada
-- diez minutos: abrir y cerrar el día tres veces seguidas no son tres avisos.

CREATE OR REPLACE FUNCTION public.training_sessions_inbox_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_coach   UUID;
    v_athlete UUID;
    v_name    TEXT;
BEGIN
    IF NOT NEW.review_pending THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.review_pending THEN
        RETURN NULL;
    END IF;

    SELECT tb.coach_id, tb.athlete_id INTO v_coach, v_athlete
      FROM public.training_blocks tb
     WHERE tb.id = NEW.block_id;

    IF v_coach IS NULL OR v_coach = v_athlete THEN
        RETURN NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM public.notifications
                WHERE user_id = v_coach
                  AND ref_id  = NEW.id
                  AND created_at > now() - INTERVAL '10 minutes') THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Tu atleta') INTO v_name
      FROM public.profiles WHERE id = v_athlete;

    INSERT INTO public.notifications (user_id, title, message, link, category, ref_id)
    VALUES (
        v_coach,
        CASE WHEN NEW.modified_after_review THEN 'Entrenamiento modificado' ELSE 'Entrenamiento para revisar' END,
        COALESCE(v_name, 'Tu atleta') || ' · ' || public.session_label(NEW.name, NEW.day_of_week, NEW.day_number),
        '/coach-dashboard/bandeja/' || v_athlete,
        'inbox',
        NEW.id
    );

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS training_sessions_inbox_notify_trg ON public.training_sessions;
CREATE TRIGGER training_sessions_inbox_notify_trg
    AFTER INSERT OR UPDATE ON public.training_sessions
    FOR EACH ROW EXECUTE FUNCTION public.training_sessions_inbox_notify();

-- Las funciones de disparador no se llaman por la API.
REVOKE ALL ON FUNCTION public.training_sessions_review_guard()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_sets_athlete_touch()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_sessions_inbox_notify()  FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- 9. COMPROBACIÓN
-- =====================================================================

DO $$
DECLARE
    v_pend  INTEGER;
    v_arch  INTEGER;
    v_trg   INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_pend FROM public.training_sessions WHERE review_pending;
    SELECT COUNT(*) INTO v_arch FROM public.training_sessions WHERE reviewed_at IS NOT NULL AND reviewed_by IS NULL;
    SELECT COUNT(*) INTO v_trg FROM pg_trigger
     WHERE tgname IN ('training_sessions_review_guard_trg','training_sets_athlete_touch_trg','training_sessions_inbox_notify_trg');

    RAISE NOTICE '=== BANDEJA Y REVISIÓN ===';
    RAISE NOTICE 'entrenamientos pendientes de revisar ... %', v_pend;
    RAISE NOTICE 'archivados como anteriores ........... %', v_arch;
    RAISE NOTICE 'disparadores (de 3) ................... %', v_trg;
END $$;
