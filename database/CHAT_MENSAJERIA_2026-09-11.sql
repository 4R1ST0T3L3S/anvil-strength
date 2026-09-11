-- =====================================================================
-- ANVIL STRENGTH — CHAT: SEGURIDAD, ENTREGAS Y MULTIMEDIA
-- 2026-09-11 · Idempotente · Aditiva (los 19 mensajes existentes se quedan)
-- =====================================================================
--
-- Sustituye y completa a database/migrations/0002_chat_messages.sql (que no
-- llegó a aplicarse) y a database/chat_media.sql (que se escribió contra la
-- tabla MUERTA `messages` y tampoco se aplicó).
--
-- LO QUE ARREGLA (verificado contra producción el 11/09/2026)
--
--   · La política de INSERT solo comprobaba el remitente: cualquier usuario
--     podía escribir a cualquier otro — atleta a atleta incluido.
--   · La de UPDATE dejaba al receptor cambiar CUALQUIER columna de un mensaje
--     recibido, texto y remitente incluidos.
--   · `anon` tenía todos los privilegios de tabla.
--
-- LO QUE AÑADE
--
--   · Relación obligatoria: se escribe solo a quien tienes vinculado ahora
--     mismo (entrenador ↔ su atleta). El historial se sigue pudiendo leer.
--   · Estados de entrega: Enviado (existe la fila) y Entregado
--     (`delivered_at`). No hay "leído" visible para el remitente: `is_read`
--     queda solo para el contador de no leídos del propio destinatario.
--   · Idempotencia (`client_id`): reintentar un envío no duplica el mensaje.
--   · Adjuntos (`attachment`) en un bucket PRIVADO con URLs firmadas, y
--     caducidad a 15 días para fotos y vídeos (`media_expires_at`).
-- =====================================================================


-- =====================================================================
-- 1. COLUMNAS
-- =====================================================================

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS client_id        UUID,
    ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attachment       JSONB,
    ADD COLUMN IF NOT EXISTS media_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS media_deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_messages.attachment IS
    '{path, kind, mime, size, name?, duration_s?, width?, height?, poster_path?}. `path` es la clave en el bucket chat-media, NUNCA una URL.';
COMMENT ON COLUMN public.chat_messages.delivered_at IS
    'Cuándo llegó a un dispositivo del destinatario. Es el "Entregado" del remitente.';
COMMENT ON COLUMN public.chat_messages.is_read IS
    'Solo para el contador de no leídos del destinatario. NUNCA se enseña al remitente.';

-- Lo que ya consta como leído, llegó: se marca entregado con su propia fecha.
-- Lo no leído se queda sin marca hasta que el destinatario abra la app.
UPDATE public.chat_messages
   SET delivered_at = created_at
 WHERE delivered_at IS NULL
   AND is_read = TRUE;


-- =====================================================================
-- 2. RESTRICCIONES
-- =====================================================================

-- Fuera cualquier CHECK anterior (se crearon a mano en el panel y no se sabe
-- con qué nombre), y dentro las canónicas.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'public.chat_messages'::regclass
           AND contype  = 'c'
           AND conname NOT IN ('chat_messages_type_check', 'chat_messages_contenido_check', 'chat_messages_adjunto_check')
    LOOP
        EXECUTE format('ALTER TABLE public.chat_messages DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_type_check;
ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_type_check
    CHECK (type IN ('text', 'image', 'video', 'audio', 'file'));

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_contenido_check;
ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_contenido_check CHECK (
        char_length(content) <= 4000
        AND (
            (type = 'text' AND attachment IS NULL AND char_length(btrim(content)) > 0)
            OR (type <> 'text' AND attachment IS NOT NULL)
        )
    ) NOT VALID;

-- Se valida lo antiguo si se puede. Si alguna fila vieja no cumple, la
-- restricción sigue vigilando todo lo NUEVO y se avisa en vez de fallar.
DO $$
BEGIN
    ALTER TABLE public.chat_messages VALIDATE CONSTRAINT chat_messages_contenido_check;
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Hay mensajes antiguos que no cumplen chat_messages_contenido_check. La regla aplica igual a los nuevos.';
END $$;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_adjunto_check;
ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_adjunto_check CHECK (
        attachment IS NULL OR (
            jsonb_typeof(attachment) = 'object'
            AND jsonb_typeof(attachment -> 'path') = 'string'
            AND jsonb_typeof(attachment -> 'mime') = 'string'
            AND jsonb_typeof(attachment -> 'size') = 'number'
            AND (attachment ->> 'size')::NUMERIC BETWEEN 0 AND 52428800
        )
    );


-- =====================================================================
-- 3. ÍNDICES
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_client_id_key
    ON public.chat_messages (sender_id, client_id)
    WHERE client_id IS NOT NULL;

-- Las dos ramas del OR de una conversación, con el orden dentro.
CREATE INDEX IF NOT EXISTS chat_messages_conversacion_idx
    ON public.chat_messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_conversacion_inv_idx
    ON public.chat_messages (receiver_id, sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_sin_leer_idx
    ON public.chat_messages (receiver_id, sender_id)
    WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS chat_messages_sin_entregar_idx
    ON public.chat_messages (receiver_id)
    WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS chat_messages_media_expira_idx
    ON public.chat_messages (media_expires_at)
    WHERE attachment IS NOT NULL AND media_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS chat_messages_adjunto_path_idx
    ON public.chat_messages ((attachment ->> 'path'))
    WHERE attachment IS NOT NULL;

-- Los dos índices creados a mano en el panel son prefijos exactos de los de
-- arriba: solo cuestan escrituras.
DROP INDEX IF EXISTS public.idx_chat_messages_sender_receiver;
DROP INDEX IF EXISTS public.chat_messages_receiver_id_idx;


-- =====================================================================
-- 4. FUNCIONES DE PERMISO
-- =====================================================================

-- Carpeta de una conversación: los dos UUID ORDENADOS. (A,B) y (B,A) dan la
-- misma, así que Storage autoriza mirando solo la ruta.
CREATE OR REPLACE FUNCTION public.chat_folder(a UUID, b UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN a < b THEN a::TEXT || '__' || b::TEXT
                ELSE b::TEXT || '__' || a::TEXT END;
$$;

-- ¿Puedo escribir AHORA a esta persona? Solo con una relación activa, en
-- cualquiera de los dos sentidos. Atleta a atleta: nunca.
CREATE OR REPLACE FUNCTION public.chat_can_message(p_other UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_other IS NOT NULL
       AND p_other <> auth.uid()
       AND EXISTS (
            SELECT 1 FROM public.coach_athletes ca
             WHERE ca.status = 'active'
               AND ((ca.coach_id = auth.uid() AND ca.athlete_id = p_other)
                 OR (ca.athlete_id = auth.uid() AND ca.coach_id = p_other))
       );
$$;

REVOKE ALL ON FUNCTION public.chat_can_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_can_message(UUID) TO authenticated;

-- ¿Participo en la conversación de esta carpeta? (para LEER adjuntos: el
-- historial se lee aunque la relación haya terminado)
CREATE OR REPLACE FUNCTION public.chat_folder_member(p_folder TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_parts TEXT[];
    v_a     UUID;
    v_b     UUID;
BEGIN
    v_parts := string_to_array(COALESCE(p_folder, ''), '__');
    IF array_length(v_parts, 1) IS DISTINCT FROM 2 THEN
        RETURN FALSE;
    END IF;
    BEGIN
        v_a := v_parts[1]::UUID;
        v_b := v_parts[2]::UUID;
    EXCEPTION WHEN others THEN
        RETURN FALSE;
    END;
    RETURN auth.uid() IS NOT NULL AND (auth.uid() = v_a OR auth.uid() = v_b)
       AND public.chat_folder(v_a, v_b) = p_folder;
END;
$$;

-- ¿Puedo SUBIR a esta carpeta? Participo y tengo relación activa con el otro.
CREATE OR REPLACE FUNCTION public.chat_folder_can_write(p_folder TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_parts TEXT[];
    v_other UUID;
BEGIN
    IF NOT public.chat_folder_member(p_folder) THEN
        RETURN FALSE;
    END IF;
    v_parts := string_to_array(p_folder, '__');
    v_other := CASE WHEN v_parts[1]::UUID = auth.uid() THEN v_parts[2]::UUID ELSE v_parts[1]::UUID END;
    RETURN public.chat_can_message(v_other);
END;
$$;

REVOKE ALL ON FUNCTION public.chat_folder_member(TEXT)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_folder_can_write(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_folder_member(TEXT)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_folder_can_write(TEXT) TO authenticated;


-- =====================================================================
-- 5. DISPARADORES DE LA TABLA
-- =====================================================================

-- Al insertar, el servidor pone lo que no puede decidir el cliente: la hora
-- (nadie antedata un mensaje), el estado de entrega y la caducidad.
CREATE OR REPLACE FUNCTION public.chat_messages_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_folder TEXT;
BEGIN
    NEW.created_at       := now();
    NEW.is_read          := FALSE;
    NEW.delivered_at     := NULL;
    NEW.media_deleted_at := NULL;
    NEW.media_expires_at := CASE WHEN NEW.type IN ('image', 'video')
                                 THEN now() + INTERVAL '15 days' END;

    IF NEW.attachment IS NOT NULL THEN
        v_folder := public.chat_folder(NEW.sender_id, NEW.receiver_id);
        IF split_part(NEW.attachment ->> 'path', '/', 1) IS DISTINCT FROM v_folder THEN
            RAISE EXCEPTION 'El adjunto no pertenece a esta conversación.' USING ERRCODE = '42501';
        END IF;
        IF NEW.attachment ->> 'poster_path' IS NOT NULL
           AND split_part(NEW.attachment ->> 'poster_path', '/', 1) IS DISTINCT FROM v_folder THEN
            RAISE EXCEPTION 'El póster no pertenece a esta conversación.' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_before_insert_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_before_insert_trg
    BEFORE INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_messages_before_insert();

-- Entregado y visto solo avanzan: no se "desentrega" un mensaje.
CREATE OR REPLACE FUNCTION public.chat_messages_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.delivered_at IS NOT NULL THEN
        NEW.delivered_at := OLD.delivered_at;
    END IF;
    IF OLD.is_read THEN
        NEW.is_read := TRUE;
    END IF;
    IF NEW.is_read AND NEW.delivered_at IS NULL THEN
        NEW.delivered_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_before_update_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_before_update_trg
    BEFORE UPDATE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_messages_before_update();


-- =====================================================================
-- 6. RLS Y PRIVILEGIOS
-- =====================================================================

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can send messages"                            ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update read status of received messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can view their own conversations"            ON public.chat_messages;
DROP POLICY IF EXISTS "chat leer las mias"                                ON public.chat_messages;
DROP POLICY IF EXISTS "chat escribir como yo"                             ON public.chat_messages;
DROP POLICY IF EXISTS "chat marcar leido lo mio"                          ON public.chat_messages;
DROP POLICY IF EXISTS chat_select_participant ON public.chat_messages;
DROP POLICY IF EXISTS chat_insert_linked      ON public.chat_messages;
DROP POLICY IF EXISTS chat_update_receiver    ON public.chat_messages;

CREATE POLICY chat_select_participant ON public.chat_messages
    FOR SELECT TO authenticated
    USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));

CREATE POLICY chat_insert_linked ON public.chat_messages
    FOR INSERT TO authenticated
    WITH CHECK (sender_id = (SELECT auth.uid()) AND public.chat_can_message(receiver_id));

CREATE POLICY chat_update_receiver ON public.chat_messages
    FOR UPDATE TO authenticated
    USING (receiver_id = (SELECT auth.uid()))
    WITH CHECK (receiver_id = (SELECT auth.uid()));

-- Sin DELETE: nadie borra mensajes (tampoco los suyos). La caducidad de los
-- adjuntos la hace el servidor con la clave de servicio.
REVOKE ALL ON public.chat_messages FROM anon;
REVOKE ALL ON public.chat_messages FROM authenticated;
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT UPDATE (is_read, delivered_at) ON public.chat_messages TO authenticated;


-- =====================================================================
-- 7. FUNCIONES QUE LLAMA LA APP
-- =====================================================================

-- "Entregado": todo lo recibido y aún sin marca llega a este dispositivo.
CREATE OR REPLACE FUNCTION public.chat_ack_delivered()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    UPDATE public.chat_messages
       SET delivered_at = now()
     WHERE receiver_id = auth.uid()
       AND delivered_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- Contador de no leídos del propio destinatario (no se enseña a nadie más).
CREATE OR REPLACE FUNCTION public.chat_mark_read(p_other UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    UPDATE public.chat_messages
       SET is_read = TRUE,
           delivered_at = COALESCE(delivered_at, now())
     WHERE receiver_id = auth.uid()
       AND sender_id   = p_other
       AND is_read     = FALSE;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- La lista de conversaciones en UNA consulta: contactos activos más quien
-- tenga historial conmigo, con el último mensaje y los no leídos.
CREATE OR REPLACE FUNCTION public.chat_conversations()
RETURNS TABLE (
    other_id             UUID,
    full_name            TEXT,
    avatar_url           TEXT,
    other_role           TEXT,
    can_message          BOOLEAN,
    last_id              UUID,
    last_content         TEXT,
    last_type            TEXT,
    last_attachment_name TEXT,
    last_created_at      TIMESTAMPTZ,
    last_sender_id       UUID,
    last_delivered_at    TIMESTAMPTZ,
    unread_count         INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH yo AS (SELECT auth.uid() AS id),
    enlaces AS (
        SELECT CASE WHEN ca.coach_id = yo.id THEN ca.athlete_id ELSE ca.coach_id END AS otro,
               CASE WHEN ca.coach_id = yo.id THEN 'athlete' ELSE 'coach' END      AS papel
          FROM public.coach_athletes ca, yo
         WHERE ca.status = 'active'
           AND (ca.coach_id = yo.id OR ca.athlete_id = yo.id)
           AND ca.coach_id <> ca.athlete_id
    ),
    mios AS (
        SELECT m.id, m.sender_id, m.receiver_id, m.content, m.type, m.attachment,
               m.created_at, m.delivered_at, m.is_read,
               CASE WHEN m.sender_id = yo.id THEN m.receiver_id ELSE m.sender_id END AS otro
          FROM public.chat_messages m, yo
         WHERE m.sender_id = yo.id OR m.receiver_id = yo.id
    ),
    contactos AS (
        SELECT t.otro, max(t.papel) AS papel, bool_or(t.activo) AS activo
          FROM (
                SELECT otro, papel, TRUE AS activo FROM enlaces
                UNION ALL
                SELECT DISTINCT otro, NULL::TEXT, FALSE FROM mios
          ) t
         WHERE t.otro IS NOT NULL
           AND t.otro <> (SELECT id FROM yo)
         GROUP BY t.otro
    ),
    ultimo AS (
        SELECT DISTINCT ON (otro)
               otro, id, content, type, attachment ->> 'name' AS nombre,
               created_at, sender_id, delivered_at
          FROM mios
         ORDER BY otro, created_at DESC, id DESC
    ),
    sin_leer AS (
        SELECT otro, COUNT(*)::INTEGER AS n
          FROM mios
         WHERE receiver_id = (SELECT id FROM yo) AND is_read = FALSE
         GROUP BY otro
    )
    SELECT c.otro, p.full_name, p.avatar_url, c.papel, c.activo,
           u.id, u.content, u.type, u.nombre, u.created_at, u.sender_id, u.delivered_at,
           COALESCE(s.n, 0)
      FROM contactos c
      JOIN public.profiles p ON p.id = c.otro
      LEFT JOIN ultimo   u ON u.otro = c.otro
      LEFT JOIN sin_leer s ON s.otro = c.otro
     ORDER BY u.created_at DESC NULLS LAST, p.full_name;
$$;

REVOKE ALL ON FUNCTION public.chat_ack_delivered()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_mark_read(UUID)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_conversations()  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_ack_delivered() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_mark_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_conversations() TO authenticated;

REVOKE ALL ON FUNCTION public.chat_messages_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_messages_before_update() FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- 8. STORAGE: BUCKET PRIVADO DEL CHAT
-- =====================================================================
--
-- 50 MB por fichero: es el techo del plan gratuito y el cliente comprime muy
-- por debajo (un vídeo de 2 min a 720p sale en ~28 MB).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'chat-media', 'chat-media', FALSE, 52428800,
    ARRAY[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/webm', 'video/quicktime',
        'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a',
        'application/pdf', 'text/plain', 'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET public             = FALSE,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "chat_media_read"   ON storage.objects;
DROP POLICY IF EXISTS "chat_media_write"  ON storage.objects;
DROP POLICY IF EXISTS "chat_media_delete" ON storage.objects;

CREATE POLICY "chat_media_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'chat-media' AND public.chat_folder_member((storage.foldername(name))[1]));

CREATE POLICY "chat_media_write" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'chat-media' AND public.chat_folder_can_write((storage.foldername(name))[1]));

-- Solo lo propio (cancelar una subida). Nadie borra lo que envió el otro.
CREATE POLICY "chat_media_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'chat-media' AND owner = (SELECT auth.uid()));

-- Endurecimiento de paso: el bucket `avatars` admitía subidas SIN sesión.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname ILIKE 'Anyone can upload an avatar%'
    LOOP
        BEGIN
            EXECUTE format('ALTER POLICY %I ON storage.objects TO authenticated', r.policyname);
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'No se pudo restringir la política %: %', r.policyname, SQLERRM;
        END;
    END LOOP;
END $$;


-- =====================================================================
-- 9. COMPROBACIÓN
-- =====================================================================

DO $$
DECLARE
    v_pol    INTEGER;
    v_bucket BOOLEAN;
    v_ins    TEXT;
BEGIN
    SELECT COUNT(*) INTO v_pol FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages';
    SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-media' AND public = FALSE) INTO v_bucket;
    SELECT with_check INTO v_ins FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'chat_insert_linked';

    RAISE NOTICE '=== CHAT ===';
    RAISE NOTICE 'políticas en chat_messages (3) ..... %', v_pol;
    RAISE NOTICE 'bucket chat-media privado .......... %', v_bucket;
    RAISE NOTICE 'INSERT exige relación .............. %', v_ins;
END $$;
