-- =====================================================================
-- ANVIL STRENGTH — ALTA ABIERTA
-- =====================================================================
-- Idempotente. Ejecutar en Supabase Dashboard -> SQL Editor.
--
-- QUÉ CAMBIA
-- `profiles.has_access` pasa a TRUE por defecto. Hasta ahora era FALSE
-- (lo fijó SECURITY_HARDENING.sql), así que TODO usuario recién registrado
-- entraba sin acceso y la aplicación lo devolvía a la portada: registrarse
-- terminaba exactamente donde había empezado.
--
-- Esto NO abre nada que estuviera protegido por otra vía. `has_access` solo
-- decide si se ve el panel; los datos de entrenamiento siguen protegidos por
-- las políticas de cada tabla, que miran coach_id / athlete_id.
--
-- PARA VOLVER ATRÁS (si algún día se quiere aprobar las altas a mano):
--   ALTER TABLE public.profiles ALTER COLUMN has_access SET DEFAULT FALSE;
-- =====================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='profiles'
                 AND column_name='has_access') THEN

        ALTER TABLE public.profiles ALTER COLUMN has_access SET DEFAULT TRUE;
        RAISE NOTICE '✅ profiles.has_access pasa a TRUE por defecto';

        -- Las cuentas que ya se crearon durante el periodo en que el valor
        -- por defecto era FALSE están bloqueadas sin que nadie lo decidiera.
        -- Se abren; las que se hayan cerrado a mano se pueden volver a cerrar
        -- desde el panel de administración.
        UPDATE public.profiles SET has_access = TRUE WHERE has_access IS NOT TRUE;
    ELSE
        RAISE NOTICE 'profiles.has_access no existe; nada que hacer';
    END IF;
END $$;

-- Las categorías de powerlifting dejan de ser obligatorias en el alta. Si
-- alguna migración antigua las dejó NOT NULL, se relajan: ahora se rellenan
-- desde el perfil, y solo si el usuario compite.
DO $$
DECLARE
    col TEXT;
BEGIN
    FOREACH col IN ARRAY ARRAY['weight_category', 'age_category', 'gender'] LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='profiles'
                     AND column_name=col AND is_nullable='NO') THEN
            EXECUTE format('ALTER TABLE public.profiles ALTER COLUMN %I DROP NOT NULL', col);
            RAISE NOTICE '✅ profiles.% deja de ser obligatoria', col;
        END IF;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'defaults de profiles' AS check, column_name, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='profiles'
   AND column_name IN ('has_access','role','weight_category','age_category','gender')
 ORDER BY column_name;

SELECT 'usuarios sin acceso (debe ser 0)' AS check, COUNT(*) AS total
  FROM public.profiles WHERE has_access IS NOT TRUE;
