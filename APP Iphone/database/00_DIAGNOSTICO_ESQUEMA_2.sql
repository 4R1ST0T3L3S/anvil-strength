-- =====================================================================
-- DIAGNÓSTICO 2 — COLUMNAS QUE USAN LOS RPC DE ARENA
-- =====================================================================
-- Solo lectura. Ejecutar y pegar el resultado.
--
-- POR QUÉ HACE FALTA UNA SEGUNDA RONDA
-- Los RPC de Arena están escritos en plpgsql, y PostgreSQL NO valida el
-- cuerpo de una función plpgsql al crearla. Eso significa que
-- SECURITY_HARDENING.sql los va a crear sin protestar aunque referencien
-- columnas inexistentes, y el fallo no aparecería hasta que alguien
-- intentara apostar en Arena. Este diagnóstico se adelanta a eso.
--
-- La primera ronda ya confirmó que existen: arena_fights (id, status,
-- athlete_a_id, athlete_b_id), arena_fight_bets (fight_id, user_id) y
-- profiles.anvil_coins. Aquí van las que quedan por comprobar.
-- =====================================================================

WITH esperadas(tabla, columna, para_que) AS (
    VALUES
        -- Marcador de la pelea: sin estas, arena_place_bet no puede acumular
        -- el bote ni arena_resolve_fight repartirlo.
        ('arena_fights',     'pool_a',        'bote del lado A'),
        ('arena_fights',     'pool_b',        'bote del lado B'),
        ('arena_fights',     'winner_side',   'lado ganador al resolver'),

        -- Apuesta individual
        ('arena_fight_bets', 'amount',        'monedas apostadas'),
        ('arena_fight_bets', 'selected_side', 'lado elegido'),

        -- Columnas que la vista public_profiles publica si existen.
        -- Que falte alguna NO rompe nada: la vista se construye con las que
        -- haya. Sirve para saber qué verá el ranking.
        ('profiles', 'nickname',        'ranking'),
        ('profiles', 'gender',          'ranking (categorías)'),
        ('profiles', 'weight_category', 'ranking (obligatoria para puntuar)'),
        ('profiles', 'age_category',    'ranking'),
        ('profiles', 'squat_pr',        'ranking'),
        ('profiles', 'bench_pr',        'ranking'),
        ('profiles', 'deadlift_pr',     'ranking'),
        ('profiles', 'total_pr',        'ranking')
)
SELECT
    e.tabla,
    e.columna,
    e.para_que,
    CASE
        WHEN t.table_name  IS NULL THEN '❌ NO EXISTE LA TABLA'
        WHEN c.column_name IS NULL THEN '⚠️  falta la columna'
        ELSE '✅ ' || c.data_type
    END AS estado
FROM esperadas e
LEFT JOIN information_schema.tables t
       ON t.table_schema = 'public' AND t.table_name = e.tabla
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public' AND c.table_name = e.tabla
      AND c.column_name = e.columna
ORDER BY
    CASE WHEN t.table_name IS NULL THEN 0
         WHEN c.column_name IS NULL THEN 1
         ELSE 2 END,
    e.tabla, e.columna;
