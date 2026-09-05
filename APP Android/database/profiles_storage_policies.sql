-- =====================================================================
-- ANVIL STRENGTH — POLÍTICAS DEL BUCKET 'profiles'
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- POR QUÉ EXISTE
--
-- El bucket 'profiles' se creó a mano desde el Dashboard (ver el comentario
-- en database/database_schema_complete.sql, sección 6) para las fotos de
-- perfil (`avatars/`). Nunca tuvo políticas de `storage.objects` en SQL —
-- vivían, si acaso, solo en el Dashboard.
--
-- Cuando `PdfThemeSettings` empezó a subir logotipos a `logos/{id}-*`, ese
-- prefijo nuevo se topó con lo que hubiera configurado (o no) en el
-- Dashboard para `avatars/`, y la subida falla en silencio: el cliente la
-- captura y solo enseña "No se pudo subir el logotipo" (ver
-- src/features/profile/components/PdfThemeSettings.tsx, handleLogoUpload).
--
-- Esta migración deja las políticas escritas como dato, igual que el resto
-- de buckets del proyecto (ver database/chat_media.sql), y cubre los dos
-- prefijos que usa el cliente hoy: `avatars/` y `logos/`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El bucket, por si no existiera ya (público: las fotos y logos se
--    sirven con URL directa, sin firmar).
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profiles',
    'profiles',
    TRUE,
    5242880,                      -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
    SET public = TRUE,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 2. Políticas
-- ---------------------------------------------------------------------
-- Convenio de nombres del cliente: `{carpeta}/{user.id}-{timestamp}.{ext}`
-- (ver `uploadImage` en ProfileSection.tsx y `handleLogoUpload` en
-- PdfThemeSettings.tsx). El id de quien sube va SIEMPRE al principio del
-- nombre de archivo, así que comprobarlo ahí —y no solo `owner`— es lo que
-- impide que alguien escriba en el hueco de otro conociendo su ruta.

DROP POLICY IF EXISTS "profiles_bucket_read"   ON storage.objects;
DROP POLICY IF EXISTS "profiles_bucket_write"  ON storage.objects;
DROP POLICY IF EXISTS "profiles_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "profiles_bucket_delete" ON storage.objects;

CREATE POLICY "profiles_bucket_read" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'profiles');

CREATE POLICY "profiles_bucket_write" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'profiles'
        AND owner = auth.uid()
        AND split_part(name, '/', 2) LIKE (auth.uid()::text || '-%')
    );

CREATE POLICY "profiles_bucket_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'profiles' AND owner = auth.uid())
    WITH CHECK (bucket_id = 'profiles' AND owner = auth.uid());

CREATE POLICY "profiles_bucket_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'profiles' AND owner = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Comprobación
-- ---------------------------------------------------------------------
SELECT 'bucket' AS check, id, public, file_size_limit
  FROM storage.buckets WHERE id = 'profiles';

SELECT 'políticas' AS check, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'profiles_bucket_%';
