-- =====================================================================
-- FIX: RESEÑAS PÚBLICAS — "Error al cargar las reseñas"
-- =====================================================================
-- CAUSA CONFIRMADA (2026-08-12): database/SECURITY_HARDENING.sql revocó
-- TODO el acceso de `anon` a athlete_reviews ("las reseñas son públicas,
-- pero solo para autenticados"). El problema es que la portada
-- (ReviewsSection.tsx) las pide SIN sesión — es el comportamiento
-- correcto, un visitante tiene que poder leerlas antes de registrarse—,
-- así que la consulta fallaba siempre con:
--
--   42501 — permission denied for table athlete_reviews
--
-- No es un problema de RLS (las políticas de SELECT ya eran correctas):
-- es un GRANT a nivel de tabla, que en PostgreSQL se comprueba ANTES de
-- evaluar cualquier política.
--
-- Este archivo deja el acceso de `anon` restringido a las columnas que
-- de verdad son públicas — sin `user_id`, que cruzaría reseñas con
-- cuentas de usuario. `authenticated` conserva escritura completa sobre
-- sus propias filas (ya cubierto por las políticas RLS existentes).
--
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- =====================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'athlete_reviews') THEN

        REVOKE ALL ON public.athlete_reviews FROM anon;
        GRANT SELECT (id, athlete_name, rating, review_text, created_at, updated_at)
            ON public.athlete_reviews TO anon;

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_reviews TO authenticated;

        RAISE NOTICE 'athlete_reviews: permisos de anon/authenticated corregidos';
    ELSE
        RAISE NOTICE 'athlete_reviews no existe en este proyecto: nada que hacer';
    END IF;
END $$;

-- =====================================================================
-- VERIFICACIÓN
-- =====================================================================
-- Debe listar exactamente: id, athlete_name, rating, review_text,
-- created_at, updated_at — NUNCA user_id.
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'athlete_reviews' AND grantee = 'anon'
ORDER BY column_name;
