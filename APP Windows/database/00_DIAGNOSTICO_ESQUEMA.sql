-- =====================================================================
-- DIAGNÓSTICO DEL ESQUEMA REAL
-- =====================================================================
-- Ejecutar ENTERO en el SQL Editor de Supabase y pegar el resultado.
--
-- No modifica nada: solo lee el catálogo. Sirve para dejar de suponer qué
-- tablas y columnas existen de verdad y adaptar SECURITY_HARDENING.sql a la
-- base real en vez de a lo que dicen los SQL antiguos del repo, que se
-- contradicen entre sí.
-- =====================================================================

WITH esperadas(tabla, columna) AS (
    VALUES
        -- Vínculo coach <-> atleta (lo usa shares_coaching_link)
        ('coach_athletes',  'coach_id'),
        ('coach_athletes',  'athlete_id'),

        -- Biblioteca de ejercicios (políticas exlib_*)
        ('exercise_library', 'coach_id'),
        ('exercise_library', 'is_public'),
        ('exercise_library', 'name'),
        ('exercise_library', 'primary_muscles'),
        ('exercise_library', 'secondary_muscles'),

        -- Perfiles: columnas sensibles que hay que blindar con GRANT/REVOKE
        ('profiles', 'id'),
        ('profiles', 'role'),
        ('profiles', 'email'),
        ('profiles', 'has_access'),
        ('profiles', 'anvil_coins'),
        ('profiles', 'is_developer'),
        ('profiles', 'coach_id'),
        ('profiles', 'nutritionist_id'),
        ('profiles', 'brand_color'),
        ('profiles', 'logo_url'),
        ('profiles', 'max_sushi_pieces'),
        ('profiles', 'full_name'),
        ('profiles', 'avatar_url'),

        -- Mensajería y avisos
        ('messages', 'sender_id'),
        ('messages', 'recipient_id'),
        ('messages', 'attachments'),
        ('notifications', 'user_id'),

        -- Arena (RPC arena_place_bet / resolve / cancel)
        ('arena_fights', 'id'),
        ('arena_fights', 'status'),
        ('arena_fights', 'athlete_a_id'),
        ('arena_fights', 'athlete_b_id'),
        ('arena_fight_bets', 'fight_id'),
        ('arena_fight_bets', 'user_id'),

        -- Reseñas
        ('athlete_reviews', 'athlete_id')
)
SELECT
    e.tabla,
    e.columna,
    CASE
        WHEN t.table_name IS NULL THEN '❌ NO EXISTE LA TABLA'
        WHEN c.column_name IS NULL THEN '⚠️  falta la columna'
        ELSE '✅ ' || c.data_type
    END AS estado
FROM esperadas e
LEFT JOIN information_schema.tables t
       ON t.table_schema = 'public'
      AND t.table_name   = e.tabla
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public'
      AND c.table_name   = e.tabla
      AND c.column_name  = e.columna
ORDER BY
    -- Primero lo que falta, que es lo único que hay que decidir
    CASE WHEN t.table_name IS NULL THEN 0
         WHEN c.column_name IS NULL THEN 1
         ELSE 2 END,
    e.tabla,
    e.columna;
