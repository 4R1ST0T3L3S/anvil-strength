-- =====================================================================
-- ANVIL STRENGTH — INCONSISTENCIAS DETECTADAS TRAS EL HARDENING
-- =====================================================================
-- Idempotente. Ejecutar en Supabase Dashboard -> SQL Editor.
--
-- LA PÁGINA PÚBLICA DE COMPETICIONES ESTÁ ROTA PARA QUIEN NO TIENE SESIÓN
--
-- Reproducido contra la base real:
--
--   GET /rest/v1/competitions?select=*,athlete:profiles!athlete_id(...)
--   -> 401  {"code":"42501","message":"permission denied for table profiles"}
--
-- La consulta de /competiciones (competitionsService.getPublicCompetitions)
-- incrusta el perfil del atleta para poder poner su nombre junto a cada
-- competición. SECURITY_HARDENING.sql hizo `REVOKE ALL ON profiles FROM anon`
-- —correcto: los perfiles no son públicos— pero eso tumba la consulta ENTERA,
-- no solo el nombre: PostgREST devuelve 401 y la página se queda sin ninguna
-- competición. Es una página que está en el sitemap y a la que se llega desde
-- el menú principal sin haber entrado.
--
-- ARREGLO, con la menor exposición posible:
--
--   · Permiso de columna: `anon` solo puede leer id, full_name y avatar_url.
--     Ni email, ni marcas, ni has_access, ni anvil_coins. Aunque alguien
--     construya otra consulta a mano, esas columnas no existen para él.
--
--   · Política de fila: solo los perfiles que TIENEN una competición
--     asignada, que son exactamente los que la página ya iba a enseñar.
--     El resto de atletas siguen siendo invisibles sin sesión.
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='competitions') THEN
        RAISE NOTICE 'competitions no existe; se omite';
        RETURN;
    END IF;

    -- Las competiciones sí son públicas por diseño.
    EXECUTE 'GRANT SELECT ON public.competitions TO anon, authenticated';

    -- Perfiles: SOLO estas tres columnas, y solo para anon.
    EXECUTE 'GRANT SELECT (id, full_name, avatar_url) ON public.profiles TO anon';

    EXECUTE 'DROP POLICY IF EXISTS "profiles_select_public_competitors" ON public.profiles';
    EXECUTE $p$
        CREATE POLICY "profiles_select_public_competitors" ON public.profiles
            FOR SELECT TO anon
            USING (
                EXISTS (
                    SELECT 1 FROM public.competitions c
                     WHERE c.athlete_id = profiles.id
                )
            )
    $p$;

    RAISE NOTICE '✅ La página pública de competiciones vuelve a cargar';
END $$;

-- Sin este índice la política de arriba hace un recorrido completo de
-- competitions por cada perfil evaluado.
CREATE INDEX IF NOT EXISTS competitions_athlete_id_idx
    ON public.competitions (athlete_id);


-- =====================================================================
-- COMPROBADO Y CORRECTO — no hace falta tocarlo
-- =====================================================================
-- Se verificó también, con peticiones reales usando la clave anónima:
--
--   athlete_reviews  -> 200. Las reseñas se leen bien sin sesión.
--   competitions     -> 200 al consultarla sola (el 401 lo provocaba
--                       únicamente el `embed` a profiles).
--   exercise_library -> 200 y vacío para `anon`, que es lo correcto: la
--                       biblioteca es para usuarios con sesión.
--
-- Queda anotado para que nadie "arregle" lo que ya funciona.


-- =====================================================================
-- VERIFICACIÓN
-- =====================================================================

-- 1. Columnas de profiles que puede leer `anon`.
--    Deben salir EXACTAMENTE tres: id, full_name, avatar_url.
SELECT 'columnas de profiles legibles por anon' AS check,
       string_agg(column_name, ', ' ORDER BY column_name) AS columnas
  FROM information_schema.column_privileges
 WHERE table_schema='public' AND table_name='profiles'
   AND grantee='anon' AND privilege_type='SELECT';

-- 2. Políticas de lectura sobre profiles.
SELECT 'políticas de profiles' AS check, policyname, roles::text, cmd
  FROM pg_policies
 WHERE schemaname='public' AND tablename='profiles'
 ORDER BY policyname;

-- 3. Cuántos atletas quedan visibles sin sesión (los que compiten).
SELECT 'perfiles visibles sin sesión' AS check, COUNT(DISTINCT athlete_id) AS total
  FROM public.competitions;
