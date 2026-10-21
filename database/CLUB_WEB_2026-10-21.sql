-- =====================================================================
-- ATLETAS Y LOGROS DE LA WEB, EDITABLES DESDE EL PANEL DE ADMINISTRACIÓN
-- 21 de octubre de 2026
-- =====================================================================
--
-- Hasta ahora los atletas de la portada (foto, categoría, marcas,
-- Instagram, recorte de la convocatoria) y los logros del club vivían en
-- src/data/athletes.ts y src/data/achievements.ts: cambiar un total era
-- editar código y desplegar. Ahora viven aquí y se editan en /admin/web.
--
-- La web los lee SIN sesión (son públicos por definición). Escribir, solo
-- administración y desarrollo. Las fotos van al bucket público `club-web`.
--
-- Si estas tablas no existen o vienen vacías, la web sigue usando los
-- ficheros de src/data, así que el orden despliegue/migración no importa.
--
-- Solo añade. La carga inicial es CLUB_WEB_2026-10-21_datos.sql.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.club_athletes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             TEXT NOT NULL UNIQUE,
    name             TEXT NOT NULL,
    category         TEXT NOT NULL DEFAULT '',
    image            TEXT,
    description      TEXT,
    instagram        TEXT,
    last_competition TEXT,
    gl_points        NUMERIC NOT NULL DEFAULT 0,
    squat            NUMERIC NOT NULL DEFAULT 0,
    bench            NUMERIC NOT NULL DEFAULT 0,
    deadlift         NUMERIC NOT NULL DEFAULT 0,
    total            NUMERIC NOT NULL DEFAULT 0,
    -- Recorte sin fondo para la portada y la convocatoria.
    cutout_src       TEXT,
    cutout_src800    TEXT,
    cutout_width     INTEGER,
    cutout_height    INTEGER,
    cutout_scale     NUMERIC NOT NULL DEFAULT 1,
    cutout_drop      NUMERIC NOT NULL DEFAULT 0,
    video_webm       TEXT,
    video_mov        TEXT,
    order_index      INTEGER NOT NULL DEFAULT 0,
    visible          BOOLEAN NOT NULL DEFAULT true,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_achievements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id    INTEGER UNIQUE,
    title        TEXT NOT NULL,
    result       TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    images       TEXT[] NOT NULL DEFAULT '{}',
    achieved_on  DATE,
    order_index  INTEGER NOT NULL DEFAULT 0,
    visible      BOOLEAN NOT NULL DEFAULT true,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.club_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Atletas del club: lectura pública" ON public.club_athletes;
CREATE POLICY "Atletas del club: lectura pública" ON public.club_athletes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Atletas del club: escribe administración" ON public.club_athletes;
CREATE POLICY "Atletas del club: escribe administración" ON public.club_athletes FOR ALL
    USING (public.tiene_rol('admin') OR public.tiene_rol('developer'))
    WITH CHECK (public.tiene_rol('admin') OR public.tiene_rol('developer'));

DROP POLICY IF EXISTS "Logros del club: lectura pública" ON public.club_achievements;
CREATE POLICY "Logros del club: lectura pública" ON public.club_achievements FOR SELECT USING (true);
DROP POLICY IF EXISTS "Logros del club: escribe administración" ON public.club_achievements;
CREATE POLICY "Logros del club: escribe administración" ON public.club_achievements FOR ALL
    USING (public.tiene_rol('admin') OR public.tiene_rol('developer'))
    WITH CHECK (public.tiene_rol('admin') OR public.tiene_rol('developer'));

GRANT SELECT ON public.club_athletes, public.club_achievements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.club_athletes, public.club_achievements TO authenticated;

-- Fotos ------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-web', 'club-web', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket público: las URL se sirven sin política de lectura (y así nadie
-- puede listar el contenido del bucket).
DROP POLICY IF EXISTS "club-web: lectura pública" ON storage.objects;
DROP POLICY IF EXISTS "club-web: sube administración" ON storage.objects;
CREATE POLICY "club-web: sube administración" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'club-web' AND (public.tiene_rol('admin') OR public.tiene_rol('developer')));
DROP POLICY IF EXISTS "club-web: cambia administración" ON storage.objects;
CREATE POLICY "club-web: cambia administración" ON storage.objects FOR UPDATE
    USING (bucket_id = 'club-web' AND (public.tiene_rol('admin') OR public.tiene_rol('developer')));
DROP POLICY IF EXISTS "club-web: borra administración" ON storage.objects;
CREATE POLICY "club-web: borra administración" ON storage.objects FOR DELETE
    USING (bucket_id = 'club-web' AND (public.tiene_rol('admin') OR public.tiene_rol('developer')));

COMMIT;

NOTIFY pgrst, 'reload schema';
