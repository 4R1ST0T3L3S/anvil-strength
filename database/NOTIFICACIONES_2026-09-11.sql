-- =====================================================================
-- ANVIL STRENGTH — NOTIFICACIONES: CATEGORÍAS, AJUSTES, PUSH Y RETENCIÓN
-- 2026-09-11 · Idempotente · Aditiva
-- =====================================================================
--
-- ESTADO QUE ENCONTRÉ (producción, 11/09/2026)
--
--   · El push no funcionaba en ningún punto de la cadena: `send-push` no está
--     desplegada, `notify_push()` la llamaba SIN el secreto que la función
--     exige y no hay ni una suscripción guardada.
--   · No había forma de apagar un tipo de aviso: solo el botón de push
--     dentro de la campana.
--
-- LO QUE HACE
--
--   1. `notifications.category` + `notification_preferences`: cada usuario
--      decide qué le avisa. El filtro está EN EL SERVIDOR: lo que se apaga no
--      llega ni a la campana ni al móvil.
--   2. Push reparado sin ningún secreto fuera de la base: el secreto del
--      disparador lo genera Postgres y vive en Vault; las claves VAPID las
--      genera `send-push` la primera vez y también van a Vault; la pública se
--      sirve por RPC, así que no depende de variables de entorno de Vercel.
--   3. Push de mensajes de chat directamente desde `chat_messages`, con un
--      testigo HMAC para que el móvil confirme la ENTREGA aunque la app esté
--      cerrada (función `chat-ack`).
--   4. Retención de 15 días de fotos y vídeos del chat: pg_cron cada hora →
--      `chat-media-cleanup` (API de Storage; el SQL directo sobre
--      storage.objects lo bloquea Supabase).
--
-- REQUIERE: database/CHAT_MENSAJERIA_2026-09-11.sql antes (columnas de
-- adjuntos) y las Edge Functions send-push, chat-ack y chat-media-cleanup.
-- =====================================================================


-- =====================================================================
-- 1. CATEGORÍAS
-- =====================================================================

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

CREATE INDEX IF NOT EXISTS notifications_ref_idx          ON public.notifications (ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx  ON public.notifications (user_id) WHERE is_read = FALSE;

-- Los disparadores de siempre (bloque nuevo, convocatoria, check-in, PR…) no
-- saben de categorías. En vez de reescribir sus cuerpos, se deduce aquí del
-- título: es la única pista que dan y basta para distinguirlos.
CREATE OR REPLACE FUNCTION public.notifications_infer_category(p_title TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_title ILIKE '%nuevo bloque%'                        THEN 'training'
        WHEN p_title ILIKE '%convocad%' OR p_title ILIKE '%competici%' THEN 'competition'
        WHEN p_title ILIKE '%check-in%'                            THEN 'checkin'
        WHEN p_title ILIKE '%nuevo pr%'                            THEN 'club'
        WHEN p_title ILIKE '%mensaje%'                             THEN 'message'
        ELSE 'system'
    END;
$$;

UPDATE public.notifications
   SET category = public.notifications_infer_category(title)
 WHERE category = 'system';

CREATE OR REPLACE FUNCTION public.notifications_set_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.category IS NULL OR NEW.category = 'system' THEN
        NEW.category := public.notifications_infer_category(NEW.title);
    END IF;
    RETURN NEW;
END;
$$;

-- Los BEFORE INSERT se ejecutan por orden alfabético de nombre: primero la
-- categoría (a), luego las preferencias (b), luego el filtro de fichas
-- gestionadas que ya existía (notifications_skip_managed_trg).
DROP TRIGGER IF EXISTS notifications_a_categoria_trg ON public.notifications;
CREATE TRIGGER notifications_a_categoria_trg
    BEFORE INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.notifications_set_category();


-- =====================================================================
-- 2. PREFERENCIAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    prefs      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notification_preferences_objeto CHECK (jsonb_typeof(prefs) = 'object')
);

COMMENT ON TABLE public.notification_preferences IS
    'Qué avisos quiere cada usuario. Claves = categorías de notifications; ausente = sí. Filtra en el servidor.';

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "preferencias propias leer"      ON public.notification_preferences;
DROP POLICY IF EXISTS "preferencias propias crear"     ON public.notification_preferences;
DROP POLICY IF EXISTS "preferencias propias modificar" ON public.notification_preferences;

CREATE POLICY "preferencias propias leer" ON public.notification_preferences
    FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "preferencias propias crear" ON public.notification_preferences
    FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "preferencias propias modificar" ON public.notification_preferences
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

CREATE OR REPLACE FUNCTION public.notif_allowed(p_user UUID, p_category TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT CASE WHEN jsonb_typeof(np.prefs -> p_category) = 'boolean'
                     THEN (np.prefs ->> p_category)::BOOLEAN END
           FROM public.notification_preferences np
          WHERE np.user_id = p_user),
        TRUE
    );
$$;

REVOKE ALL ON FUNCTION public.notif_allowed(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notifications_respect_prefs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.notif_allowed(NEW.user_id, NEW.category) THEN
        RETURN NULL;   -- BEFORE INSERT: se descarta sin error
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_b_preferencias_trg ON public.notifications;
CREATE TRIGGER notifications_b_preferencias_trg
    BEFORE INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.notifications_respect_prefs();


-- =====================================================================
-- 3. SECRETOS, GENERADOS DENTRO DE LA BASE
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'anvil_push_hook_secret') THEN
        PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
                                    'anvil_push_hook_secret',
                                    'Disparadores -> send-push, y firma de los testigos de entrega');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'anvil_cron_secret') THEN
        PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
                                    'anvil_cron_secret',
                                    'pg_cron -> chat-media-cleanup');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.anvil_vault_secret(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
$$;

-- Solo para funciones de este esquema. Ni el navegador ni la API la ven.
REVOKE ALL ON FUNCTION public.anvil_vault_secret(TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- Comprobaciones que usan las Edge Functions (clave de servicio).
CREATE OR REPLACE FUNCTION public.push_hook_secret_ok(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(p_secret, '') <> ''
       AND p_secret = public.anvil_vault_secret('anvil_push_hook_secret');
$$;

CREATE OR REPLACE FUNCTION public.cron_secret_ok(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(p_secret, '') <> ''
       AND p_secret = public.anvil_vault_secret('anvil_cron_secret');
$$;

REVOKE ALL ON FUNCTION public.push_hook_secret_ok(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cron_secret_ok(TEXT)      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_hook_secret_ok(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_secret_ok(TEXT)      TO service_role;


-- =====================================================================
-- 4. CLAVES VAPID
-- =====================================================================

CREATE OR REPLACE FUNCTION public.push_vapid_keys()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'public_key',  public.anvil_vault_secret('anvil_vapid_public_key'),
        'private_key', public.anvil_vault_secret('anvil_vapid_private_key')
    );
$$;

-- Guarda el par SOLO si no había ninguno, y devuelve el que quede guardado:
-- si dos arranques en frío lo generan a la vez, gana el primero y el segundo
-- usa ese.
CREATE OR REPLACE FUNCTION public.push_vapid_save(p_public TEXT, p_private TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(p_public, '') = '' OR COALESCE(p_private, '') = '' THEN
        RAISE EXCEPTION 'Par VAPID incompleto.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'anvil_vapid_public_key') THEN
        BEGIN
            PERFORM vault.create_secret(p_public,  'anvil_vapid_public_key',  'Clave pública VAPID (web push)');
            PERFORM vault.create_secret(p_private, 'anvil_vapid_private_key', 'Clave privada VAPID (web push)');
        EXCEPTION WHEN unique_violation THEN
            NULL;  -- otro arranque se adelantó
        END;
    END IF;
    RETURN public.push_vapid_keys();
END;
$$;

REVOKE ALL ON FUNCTION public.push_vapid_keys()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_vapid_save(TEXT, TEXT)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_vapid_keys()           TO service_role;
GRANT EXECUTE ON FUNCTION public.push_vapid_save(TEXT, TEXT) TO service_role;

-- La pública NO es secreta: la necesita el navegador para suscribirse.
CREATE OR REPLACE FUNCTION public.get_vapid_public_key()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.anvil_vault_secret('anvil_vapid_public_key');
$$;

REVOKE ALL ON FUNCTION public.get_vapid_public_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vapid_public_key() TO anon, authenticated;


-- =====================================================================
-- 5. ENVÍO DE PUSH DESDE LA BASE
-- =====================================================================

CREATE OR REPLACE FUNCTION public.push_send(
    p_user  UUID,
    p_title TEXT,
    p_body  TEXT,
    p_link  TEXT,
    p_data  JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_secret TEXT;
BEGIN
    -- Sin suscripción no hay a quién mandar: ni se llama a la función.
    IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = p_user) THEN
        RETURN;
    END IF;

    v_secret := public.anvil_vault_secret('anvil_push_hook_secret');
    IF v_secret IS NULL THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url     := 'https://ihcyuoczbmjxfinxvzra.supabase.co/functions/v1/send-push',
        body    := jsonb_build_object(
                       'user_id', p_user,
                       'title',   left(COALESCE(p_title, 'Anvil Strength'), 120),
                       'message', left(COALESCE(p_body, ''), 240),
                       'link',    COALESCE(p_link, '/'),
                       'data',    COALESCE(p_data, '{}'::jsonb)
                   ),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 5000
    );
END;
$$;

REVOKE ALL ON FUNCTION public.push_send(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- El disparador de siempre, ahora con secreto y categoría.
CREATE OR REPLACE FUNCTION public.notify_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.push_send(
        NEW.user_id, NEW.title, NEW.message, COALESCE(NEW.link, '/'),
        jsonb_build_object('category', NEW.category, 'tag', 'n-' || NEW.id)
    );
    RETURN NEW;
END;
$$;

-- Push de mensajes de chat: sin pasar por la campana (un chat llenaría la
-- campana de mensajes) y respetando el ajuste "Mensajes".
CREATE OR REPLACE FUNCTION public.chat_messages_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_name     TEXT;
    v_preview  TEXT;
    v_secret   TEXT;
    v_token    TEXT;
    v_es_coach BOOLEAN;
BEGIN
    IF NOT public.notif_allowed(NEW.receiver_id, 'message') THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.receiver_id) THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Anvil Strength') INTO v_name
      FROM public.profiles WHERE id = NEW.sender_id;

    v_preview := CASE NEW.type
        WHEN 'text'  THEN left(NEW.content, 140)
        WHEN 'image' THEN COALESCE(NULLIF(left(btrim(NEW.content), 120), ''), 'Foto')
        WHEN 'video' THEN COALESCE(NULLIF(left(btrim(NEW.content), 120), ''), 'Vídeo')
        WHEN 'audio' THEN 'Nota de voz'
        ELSE COALESCE('Archivo · ' || (NEW.attachment ->> 'name'), 'Archivo')
    END;

    v_secret := public.anvil_vault_secret('anvil_push_hook_secret');
    v_token  := CASE WHEN v_secret IS NULL THEN NULL
                     ELSE encode(extensions.hmac(NEW.id::TEXT, v_secret, 'sha256'), 'hex') END;

    v_es_coach := EXISTS (SELECT 1 FROM public.coach_athletes
                           WHERE coach_id = NEW.receiver_id AND athlete_id = NEW.sender_id);

    PERFORM public.push_send(
        NEW.receiver_id,
        COALESCE(v_name, 'Anvil Strength'),
        v_preview,
        CASE WHEN v_es_coach THEN '/coach-dashboard/mensajes/' || NEW.sender_id ELSE '/dashboard/mensajes' END,
        jsonb_build_object(
            'category', 'message',
            'tag',      'chat-' || NEW.sender_id,
            'ack',      CASE WHEN v_token IS NULL THEN NULL
                             ELSE jsonb_build_object('id', NEW.id, 'token', v_token) END
        )
    );
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_after_insert_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_after_insert_trg
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_messages_after_insert();

-- Entrega confirmada por el service worker del destinatario. El testigo es
-- un HMAC del id con el secreto del disparador: quien no lo tenga no puede
-- marcar como entregado el mensaje de nadie.
CREATE OR REPLACE FUNCTION public.chat_ack_by_token(p_id UUID, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_secret TEXT := public.anvil_vault_secret('anvil_push_hook_secret');
BEGIN
    IF v_secret IS NULL OR p_id IS NULL OR COALESCE(p_token, '') = '' THEN
        RETURN FALSE;
    END IF;
    IF encode(extensions.hmac(p_id::TEXT, v_secret, 'sha256'), 'hex') <> p_token THEN
        RETURN FALSE;
    END IF;
    UPDATE public.chat_messages
       SET delivered_at = COALESCE(delivered_at, now())
     WHERE id = p_id;
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_ack_by_token(UUID, TEXT)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_ack_by_token(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.notify_push()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_messages_after_insert()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notifications_respect_prefs()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notifications_set_category()   FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- 6. RETENCIÓN: FOTOS Y VÍDEOS DEL CHAT, 15 DÍAS
-- =====================================================================

CREATE OR REPLACE FUNCTION public.chat_media_expired(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (id UUID, paths TEXT[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT m.id,
           array_remove(ARRAY[m.attachment ->> 'path', m.attachment ->> 'poster_path'], NULL)
      FROM public.chat_messages m
     WHERE m.attachment IS NOT NULL
       AND m.media_deleted_at IS NULL
       AND m.media_expires_at < now()
     ORDER BY m.media_expires_at
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
$$;

CREATE OR REPLACE FUNCTION public.chat_media_mark_deleted(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    UPDATE public.chat_messages
       SET media_deleted_at = now()
     WHERE id = ANY(p_ids)
       AND media_deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- Subidas que nunca llegaron a un mensaje (se canceló el envío, se cerró la
-- app a mitad): más de 24 h sin nadie que las referencie.
CREATE OR REPLACE FUNCTION public.chat_media_orphans(p_limit INTEGER DEFAULT 500)
RETURNS TABLE (name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT o.name
      FROM storage.objects o
     WHERE o.bucket_id = 'chat-media'
       AND o.created_at < now() - INTERVAL '24 hours'
       AND NOT EXISTS (
            SELECT 1 FROM public.chat_messages m
             WHERE m.attachment IS NOT NULL
               AND m.media_deleted_at IS NULL
               AND (m.attachment ->> 'path' = o.name OR m.attachment ->> 'poster_path' = o.name)
       )
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.chat_media_expired(INTEGER)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_media_mark_deleted(UUID[])  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_media_orphans(INTEGER)      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_media_expired(INTEGER)     TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_media_mark_deleted(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_media_orphans(INTEGER)     TO service_role;

-- Lo que llama pg_cron. Solo despierta a la función si HAY trabajo: una
-- consulta con índice cada hora es gratis; una llamada HTTP sin motivo, no.
CREATE OR REPLACE FUNCTION public.chat_media_cleanup_kick()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_secret TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.chat_media_expired(1))
       AND NOT EXISTS (SELECT 1 FROM public.chat_media_orphans(1)) THEN
        RETURN;
    END IF;

    v_secret := public.anvil_vault_secret('anvil_cron_secret');
    IF v_secret IS NULL THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url     := 'https://ihcyuoczbmjxfinxvzra.supabase.co/functions/v1/chat-media-cleanup',
        body    := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
        timeout_milliseconds := 30000
    );
END;
$$;

REVOKE ALL ON FUNCTION public.chat_media_cleanup_kick() FROM PUBLIC, anon, authenticated;

-- Cada hora, al minuto 17 (lejos de las demás tareas en punto).
SELECT cron.schedule('chat-media-cleanup', '17 * * * *', 'SELECT public.chat_media_cleanup_kick()');


-- =====================================================================
-- 7. COMPROBACIÓN
-- =====================================================================

DO $$
DECLARE
    v_cats   TEXT;
    v_secret INTEGER;
    v_job    INTEGER;
BEGIN
    SELECT string_agg(category || '=' || n, ', ' ORDER BY category)
      INTO v_cats
      FROM (SELECT category, COUNT(*) n FROM public.notifications GROUP BY category) t;
    SELECT COUNT(*) INTO v_secret FROM vault.secrets WHERE name IN ('anvil_push_hook_secret', 'anvil_cron_secret');
    SELECT COUNT(*) INTO v_job FROM cron.job WHERE jobname = 'chat-media-cleanup';

    RAISE NOTICE '=== NOTIFICACIONES ===';
    RAISE NOTICE 'avisos por categoría ........ %', v_cats;
    RAISE NOTICE 'secretos en Vault (de 2) .... %', v_secret;
    RAISE NOTICE 'tarea de limpieza ........... %', v_job;
END $$;
