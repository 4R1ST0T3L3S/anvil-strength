-- =====================================================================
-- ANVIL STRENGTH — AUDIOS, FOTOS Y VÍDEOS EN EL CHAT (F7)
-- =====================================================================
-- A diferencia de los vídeos de ejercicios (que son públicos y van en R2),
-- esto es contenido PRIVADO entre un coach y un atleta: vídeos de series,
-- notas de voz, fotos de una lesión. Va en Supabase Storage con bucket
-- privado y URLs firmadas de vida corta. Nunca una URL pública.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Adjuntos del mensaje
-- ---------------------------------------------------------------------
-- Se guarda como JSONB en el propio mensaje en vez de en una tabla aparte:
-- un adjunto no tiene vida propia fuera de su mensaje, y así se lee todo con
-- la consulta que ya existe, sin un join extra por cada burbuja del chat.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB;

COMMENT ON COLUMN messages.attachments IS
    'Array de {path, kind, mime, size, duration_s?, width?, height?, poster_path?}. `path` es la clave dentro del bucket chat-media, NUNCA una URL: las URLs se firman en el momento de mostrarlas.';

-- El contenido puede ir vacío si el mensaje es solo una foto o un audio.
-- La restricción de longitud de SECURITY_HARDENING.sql exigía >= 1 carácter.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_content_len') THEN
        ALTER TABLE messages DROP CONSTRAINT messages_content_len;
    END IF;

    ALTER TABLE messages ADD CONSTRAINT messages_content_len CHECK (
        char_length(content) <= 5000
        AND (char_length(content) >= 1 OR attachments IS NOT NULL)
    );
END $$;

-- Tope de adjuntos por mensaje: evita que un cliente manipulado meta cientos
-- de rutas en una sola fila.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_attachments_sane') THEN
        ALTER TABLE messages ADD CONSTRAINT messages_attachments_sane CHECK (
            attachments IS NULL
            OR (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) BETWEEN 1 AND 10)
        );
    END IF;
END $$;

-- `attachments` solo se escribe al insertar. Un mensaje enviado no se edita.
REVOKE UPDATE ON public.messages FROM authenticated;
GRANT  UPDATE (is_read) ON public.messages TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Bucket privado
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'chat-media',
    'chat-media',
    FALSE,                       -- privado: solo se accede con URL firmada
    52428800,                    -- 50 MB por archivo (el cliente comprime muy por debajo)
    ARRAY[
        'image/jpeg','image/png','image/webp',
        'audio/webm','audio/ogg','audio/mp4','audio/mpeg',
        'video/mp4','video/webm','video/quicktime'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 3. Políticas del bucket
-- ---------------------------------------------------------------------
-- Convenio de rutas:  {id_menor}__{id_mayor}/{uuid}.{ext}
--
-- Los dos UUID de la conversación, ORDENADOS, forman la carpeta. Ordenarlos
-- hace que la pareja (A,B) y (B,A) den la misma carpeta, así que la política
-- se puede comprobar mirando solo el nombre del archivo — sin consultar la
-- tabla de mensajes en cada descarga.

CREATE OR REPLACE FUNCTION public.chat_folder(a UUID, b UUID)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE WHEN a < b THEN a::text || '__' || b::text
                ELSE b::text || '__' || a::text END;
$$;

-- ¿La carpeta pertenece a una conversación en la que participa el usuario,
-- y con alguien con quien tiene relación de entrenamiento?
CREATE OR REPLACE FUNCTION public.can_access_chat_folder(folder TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    parts TEXT[];
    a UUID;
    b UUID;
    other UUID;
BEGIN
    parts := string_to_array(folder, '__');
    IF array_length(parts, 1) <> 2 THEN RETURN FALSE; END IF;

    BEGIN
        a := parts[1]::UUID;
        b := parts[2]::UUID;
    EXCEPTION WHEN others THEN
        RETURN FALSE;   -- carpeta con formato inventado
    END;

    IF auth.uid() = a THEN other := b;
    ELSIF auth.uid() = b THEN other := a;
    ELSE RETURN FALSE;   -- no participo en esta conversación
    END IF;

    RETURN public.shares_coaching_link(other);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_chat_folder(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_chat_folder(TEXT) FROM anon, PUBLIC;

DROP POLICY IF EXISTS "chat_media_read"   ON storage.objects;
DROP POLICY IF EXISTS "chat_media_write"  ON storage.objects;
DROP POLICY IF EXISTS "chat_media_delete" ON storage.objects;

CREATE POLICY "chat_media_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-media'
        AND public.can_access_chat_folder((storage.foldername(name))[1])
    );

CREATE POLICY "chat_media_write" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'chat-media'
        AND owner = auth.uid()
        AND public.can_access_chat_folder((storage.foldername(name))[1])
    );

-- Solo se borra lo propio. Nadie puede borrar la prueba que envió el otro.
CREATE POLICY "chat_media_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'chat-media' AND owner = auth.uid());

-- ---------------------------------------------------------------------
-- 4. Comprobación
-- ---------------------------------------------------------------------
SELECT 'bucket' AS check, id, public, file_size_limit
  FROM storage.buckets WHERE id = 'chat-media';

SELECT 'políticas' AS check, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'chat_media%';
