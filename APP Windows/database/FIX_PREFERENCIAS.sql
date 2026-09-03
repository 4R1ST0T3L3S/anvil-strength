-- =====================================================================
-- FIX: GUARDADO DE PREFERENCIAS — "no se pudieron guardar las preferencias"
-- =====================================================================
-- CAUSA CONFIRMADA (2026-08-12): database/SECURITY_HARDENING.sql revoca
-- TODO el UPDATE sobre `profiles` y lo devuelve solo columna a columna,
-- por una lista fija (`editable[]`). `coach_prefs` y `athlete_prefs` se
-- añadieron después, en REESTRUCTURACION_2026-08.sql, y nunca se metieron
-- en esa lista — así que `prefsService.saveCoachPrefs()` /
-- `saveAthletePrefs()` (src/services/prefsService.ts) chocaban siempre
-- con un permiso denegado POR COLUMNA, que PostgREST no distingue de
-- cualquier otro fallo de guardado.
--
-- Este archivo aplica el GRANT que falta sin tener que volver a correr
-- SECURITY_HARDENING.sql entero (que ya se ha corregido para no volver a
-- perder estas dos columnas si se re-ejecuta desde cero).
--
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- =====================================================================

DO $$
DECLARE
    present TEXT[];
BEGIN
    SELECT array_agg(quote_ident(column_name))
      INTO present
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND column_name  IN ('coach_prefs', 'athlete_prefs');

    IF present IS NOT NULL THEN
        EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', array_to_string(present, ', '));
        RAISE NOTICE 'profiles: UPDATE concedido sobre %', array_to_string(present, ', ');
    ELSE
        RAISE NOTICE 'profiles.coach_prefs / athlete_prefs no existen todavía: ejecuta primero REESTRUCTURACION_2026-08.sql';
    END IF;
END $$;

-- =====================================================================
-- VERIFICACIÓN
-- =====================================================================
-- Deben aparecer coach_prefs y athlete_prefs con privilege_type = UPDATE.
SELECT column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND grantee = 'authenticated' AND column_name IN ('coach_prefs', 'athlete_prefs')
ORDER BY column_name;
