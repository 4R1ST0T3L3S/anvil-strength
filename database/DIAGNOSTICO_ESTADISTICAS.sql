-- =====================================================================
-- DIAGNÓSTICO: "en estadísticas no aparece nada"
-- =====================================================================
-- La pantalla de Estadísticas de la ficha del atleta (Resumen, Registro,
-- Velocidad) lee `training_sessions` -> `session_exercises` ->
-- `training_sets` con el usuario del ENTRENADOR, no con service_role. Si
-- la RLS no le da permiso, Supabase no lanza un error visible: PostgREST
-- devuelve 0 filas, indistinguible a simple vista de "el atleta no ha
-- entrenado". El código ya se ha corregido para mostrar el error real en
-- vez de confundirlo con "sin datos" (AthleteStatsModal.tsx) — este script
-- es para encontrar la causa exacta en la base de datos.
--
-- CÓMO USARLO: ejecuta cada bloque en el SQL Editor de Supabase, EN TU
-- PROPIA SESIÓN (no como service_role) para que se apliquen las mismas
-- políticas RLS que ve la aplicación. Sustituye los UUID de ejemplo por
-- los reales de un entrenador y un atleta vinculados.
-- =====================================================================

-- 1. ¿Existen las políticas de SELECT esperadas sobre las tablas de
--    entrenamiento? Si faltan filas aquí para `training_sessions`,
--    `session_exercises` o `training_sets`, esa es la causa: ejecuta
--    database/FIX_TIMEOUT_SERIES.sql y database/REESTRUCTURACION_2026-08.sql.
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('training_sessions', 'session_exercises', 'training_sets', 'training_blocks')
  AND cmd IN ('SELECT', 'ALL')
ORDER BY tablename, policyname;

-- 2. Funciones auxiliares que esas políticas usan para decidir "¿es mi
--    atleta?". Si no existen o no tienen EXECUTE para `authenticated`,
--    la política se evalúa a FALSE aunque exista.
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'sesion_es_de_mi_bloque_como_coach',
    'set_es_de_mi_bloque_como_coach',
    'shares_coaching_link',
    'is_coach'
  );

SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'sesion_es_de_mi_bloque_como_coach',
    'set_es_de_mi_bloque_como_coach',
    'shares_coaching_link',
    'is_coach'
  )
  AND grantee = 'authenticated';

-- 3. ¿El vínculo coach_athletes existe y está ACTIVO? Las políticas de
--    "es mi atleta" casi siempre exigen status = 'active'.
--    Sustituye los UUID.
-- SELECT * FROM coach_athletes
--  WHERE coach_id = '<uuid del entrenador>' AND athlete_id = '<uuid del atleta>';

-- 4. ¿Tiene el atleta bloques de entrenamiento? Sin esto, la consulta es
--    correcta y el "sin datos" es real, no un fallo de permisos.
-- SELECT id, name, is_active, created_at FROM training_blocks
--  WHERE athlete_id = '<uuid del atleta>' ORDER BY created_at DESC;

-- 5. Con un bloque real de arriba, ¿hay sesiones con series?
-- SELECT s.id, s.week_number, s.day_number, count(ts.id) AS series
--   FROM training_sessions s
--   JOIN session_exercises se ON se.session_id = s.id
--   JOIN training_sets ts ON ts.session_exercise_id = se.id
--  WHERE s.block_id = '<uuid del bloque>'
--  GROUP BY s.id, s.week_number, s.day_number
--  ORDER BY s.week_number, s.day_number;
