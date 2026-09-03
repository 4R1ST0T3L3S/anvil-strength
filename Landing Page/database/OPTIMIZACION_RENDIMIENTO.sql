-- =====================================================================
-- ANVIL STRENGTH — OPTIMIZACIÓN DE RENDIMIENTO
-- =====================================================================
--
-- CÓMO SE EJECUTA
-- Supabase → SQL Editor → New query → pegar esto entero → Run.
-- Es IDEMPOTENTE: se puede ejecutar las veces que haga falta.
--
-- QUÉ ARREGLA
-- El aviso "Your project is currently exhausting multiple resources".
-- Antes de pagar más CPU conviene descartar que el gasto sea artificial,
-- y aquí lo es por dos motivos que se multiplican entre sí:
--
--   1. auth.uid() SIN ENVOLVER EN LAS POLÍTICAS (el grande)
--      Escrito tal cual dentro de una política, Postgres lo trata como una
--      llamada más de la condición y lo EJECUTA UNA VEZ POR FILA EXAMINADA.
--      Leer un bloque de ocho semanas son ~800 filas de training_sets: son
--      800 resoluciones del JWT para responder a una sola pantalla.
--
--      Envuelto en un subselect —`(SELECT auth.uid())`— el planificador lo
--      reconoce como constante de la consulta, lo resuelve UNA vez en un
--      InitPlan y compara ese valor contra todas las filas. La condición es
--      exactamente la misma: auth.uid() es STABLE, así que dentro de una
--      misma sentencia no puede cambiar de valor. No se toca la seguridad,
--      solo cuántas veces se calcula lo mismo.
--
--   2. CLAVES AJENAS SIN ÍNDICE
--      Las políticas de la rama de entrenamiento no miran una columna: hacen
--      un EXISTS que recorre
--          training_sets → session_exercises → training_sessions → training_blocks
--      POR CADA FILA. Sin índice en esas claves, cada salto es un recorrido
--      secuencial de la tabla entera. Con índice es una búsqueda directa.
--
-- El bloque 1 es solo diagnóstico y no modifica nada: ejecútalo antes y
-- después para ver el efecto.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. DIAGNÓSTICO (no cambia nada)
-- ---------------------------------------------------------------------

-- 1.1 Las consultas que más tiempo TOTAL consumen. Es la lista que importa:
--     una consulta de 5 ms lanzada 40.000 veces hace más daño que una de
--     2 s lanzada una vez. Si la extensión no está activa, esta parte se
--     salta sola y el resto del archivo sigue.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        RAISE NOTICE 'pg_stat_statements activa: usa la consulta comentada de 1.1b para el detalle.';
    ELSE
        RAISE NOTICE 'pg_stat_statements NO activa. Actívala en Supabase → Database → Extensions para ver las consultas más caras.';
    END IF;
END $$;

-- 1.1b Descomentar si pg_stat_statements está activa:
-- SELECT calls,
--        round(total_exec_time)::bigint      AS ms_totales,
--        round(mean_exec_time)::numeric(10,2) AS ms_media,
--        rows,
--        left(query, 140)                     AS consulta
--   FROM pg_stat_statements
--  ORDER BY total_exec_time DESC
--  LIMIT 20;

-- 1.2 Tamaño real de las tablas. Si la más grande son megabytes y no
--     gigabytes, el problema NO es el volumen de datos: es cuántas veces se
--     recorre. Que es justo lo que arreglan los bloques 2 y 3.
SELECT relname                                        AS tabla,
       n_live_tup                                     AS filas,
       pg_size_pretty(pg_total_relation_size(relid))   AS tamanyo,
       seq_scan                                        AS recorridos_secuenciales,
       idx_scan                                        AS busquedas_por_indice
  FROM pg_stat_user_tables
 WHERE schemaname = 'public'
 ORDER BY pg_total_relation_size(relid) DESC
 LIMIT 20;

-- 1.3 Políticas que resuelven el JWT por fila. Todo lo que salga aquí es
--     trabajo desperdiciado, y el bloque 3 lo corrige.
SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (COALESCE(qual, '') LIKE '%auth.uid()%' OR COALESCE(with_check, '') LIKE '%auth.uid()%')
   AND COALESCE(qual, '') NOT LIKE '%SELECT auth.uid()%'
   AND COALESCE(with_check, '') NOT LIKE '%SELECT auth.uid()%'
 ORDER BY tablename, policyname;


-- ---------------------------------------------------------------------
-- 2. ÍNDICES PARA TODAS LAS CLAVES AJENAS
-- ---------------------------------------------------------------------
-- Postgres indexa sola la clave PRIMARIA, nunca las AJENAS. Y las ajenas son
-- justo por donde caminan las políticas RLS y los joins de la aplicación.
--
-- Se hace en bucle sobre el catálogo y no a mano para que valga también para
-- las tablas que se añadan después: se vuelve a ejecutar el archivo y ya.
--
-- Criterio: se crea índice si NINGÚN índice existente empieza por la primera
-- columna de la clave ajena. Un índice compuesto que ya la lleve delante sirve
-- igual y no se duplica.
--
-- Los CREATE INDEX de aquí bloquean la ESCRITURA de su tabla mientras se
-- construyen. Con el tamaño que tienen estas tablas son milisegundos; si
-- alguna llegara a millones de filas, habría que lanzarlos de uno en uno con
-- CONCURRENTLY y fuera de transacción.

DO $$
DECLARE
    r      RECORD;
    nombre TEXT;
    stmt   TEXT;
    total  INT := 0;
BEGIN
    FOR r IN
        SELECT n.nspname  AS esquema,
               t.relname  AS tabla,
               a.attname  AS columna
          FROM pg_constraint c
          JOIN pg_class     t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f'
           AND n.nspname = 'public'
           AND NOT EXISTS (
               SELECT 1
                 FROM pg_index i
                WHERE i.indrelid = c.conrelid
                  AND i.indkey[0] = c.conkey[1]
           )
    LOOP
        -- 63 caracteres es el máximo que admite un identificador.
        nombre := left(r.tabla || '_' || r.columna || '_idx', 63);
        stmt   := format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%I)',
                         nombre, r.esquema, r.tabla, r.columna);
        EXECUTE stmt;
        total := total + 1;
        RAISE NOTICE '%', stmt;
    END LOOP;

    RAISE NOTICE 'Índices de clave ajena creados: %', total;
END $$;


-- ---------------------------------------------------------------------
-- 3. RESOLVER EL JWT UNA VEZ POR CONSULTA, NO UNA VEZ POR FILA
-- ---------------------------------------------------------------------
-- Reescribe las políticas envolviendo `auth.uid()`, `auth.jwt()`,
-- `auth.role()` e `is_coach()` en un subselect.
--
-- POR QUÉ ALTER POLICY Y NO DROP + CREATE
-- DROP deja la tabla un instante SIN esa política. En una tabla con RLS
-- activo eso no abre el acceso —sin política no pasa nadie—, pero si el
-- script fallara a mitad la aplicación se quedaría bloqueada hasta arreglarlo
-- a mano. ALTER cambia la expresión en una sola operación atómica y conserva
-- intactos el comando (SELECT/INSERT/...), los roles y el tipo de política.
--
-- LA CONDICIÓN NO CAMBIA. Se lee del catálogo la expresión ya existente y se
-- sustituye la llamada por la misma llamada dentro de un SELECT. No se
-- reescribe ninguna regla de acceso: si una política dejaba entrar a alguien,
-- lo sigue dejando exactamente igual.
--
-- Se salta las que ya están envueltas, así que reejecutarlo no anida nada.

DO $$
DECLARE
    p           RECORD;
    q           TEXT;
    w           TEXT;
    stmt        TEXT;
    total       INT := 0;
BEGIN
    FOR p IN
        SELECT schemaname, tablename, policyname, qual, with_check
          FROM pg_policies
         WHERE schemaname = 'public'
           AND (
                COALESCE(qual, '')       ~ '(auth\.uid\(\)|auth\.jwt\(\)|auth\.role\(\)|is_coach\(\))'
             OR COALESCE(with_check, '') ~ '(auth\.uid\(\)|auth\.jwt\(\)|auth\.role\(\)|is_coach\(\))'
           )
    LOOP
        q := p.qual;
        w := p.with_check;

        -- Un bloque por función y por expresión. La guarda `NOT LIKE` es lo
        -- que hace el archivo reejecutable: lo ya envuelto no se toca.
        IF q IS NOT NULL THEN
            IF q LIKE '%auth.uid()%' AND q NOT LIKE '%SELECT auth.uid()%' THEN
                q := replace(q, 'auth.uid()', '(SELECT auth.uid())');
            END IF;
            IF q LIKE '%auth.jwt()%' AND q NOT LIKE '%SELECT auth.jwt()%' THEN
                q := replace(q, 'auth.jwt()', '(SELECT auth.jwt())');
            END IF;
            IF q LIKE '%auth.role()%' AND q NOT LIKE '%SELECT auth.role()%' THEN
                q := replace(q, 'auth.role()', '(SELECT auth.role())');
            END IF;
            -- Se normaliza primero para no acabar con `public.(SELECT ...)`.
            q := replace(q, 'public.is_coach()', 'is_coach()');
            IF q LIKE '%is_coach()%' AND q NOT LIKE '%SELECT public.is_coach()%' THEN
                q := replace(q, 'is_coach()', '(SELECT public.is_coach())');
            END IF;
        END IF;

        IF w IS NOT NULL THEN
            IF w LIKE '%auth.uid()%' AND w NOT LIKE '%SELECT auth.uid()%' THEN
                w := replace(w, 'auth.uid()', '(SELECT auth.uid())');
            END IF;
            IF w LIKE '%auth.jwt()%' AND w NOT LIKE '%SELECT auth.jwt()%' THEN
                w := replace(w, 'auth.jwt()', '(SELECT auth.jwt())');
            END IF;
            IF w LIKE '%auth.role()%' AND w NOT LIKE '%SELECT auth.role()%' THEN
                w := replace(w, 'auth.role()', '(SELECT auth.role())');
            END IF;
            w := replace(w, 'public.is_coach()', 'is_coach()');
            IF w LIKE '%is_coach()%' AND w NOT LIKE '%SELECT public.is_coach()%' THEN
                w := replace(w, 'is_coach()', '(SELECT public.is_coach())');
            END IF;
        END IF;

        -- Nada que cambiar: ya estaba envuelta.
        CONTINUE WHEN q IS NOT DISTINCT FROM p.qual
                  AND w IS NOT DISTINCT FROM p.with_check;

        stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
        IF q IS NOT NULL THEN stmt := stmt || format(' USING (%s)', q); END IF;
        -- Una política de SELECT o DELETE no admite WITH CHECK: solo se añade
        -- si la política ya tenía uno.
        IF w IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', w); END IF;

        EXECUTE stmt;
        total := total + 1;
        RAISE NOTICE 'Reescrita %.%', p.tablename, p.policyname;
    END LOOP;

    RAISE NOTICE 'Políticas optimizadas: %', total;
END $$;


-- ---------------------------------------------------------------------
-- 4. POLÍTICAS PERMISIVAS DUPLICADAS (solo informa)
-- ---------------------------------------------------------------------
-- Cuando una tabla tiene DOS políticas permisivas para el mismo comando,
-- Postgres evalúa LAS DOS en cada fila y une los resultados con OR. No es un
-- fallo —a veces es justo lo que se quiere, como en exercise_library, que
-- tiene una vía normal y una red de seguridad— pero cuesta el doble.
--
-- Lo que salga aquí se puede fusionar a mano en una sola política con un OR,
-- si esa tabla aparece además entre las caras del diagnóstico 1.1. No se
-- fusiona automáticamente: unir dos condiciones SÍ cambia la seguridad si se
-- hace mal, y eso no se automatiza a ciegas.

SELECT tablename,
       cmd,
       count(*)                         AS politicas,
       string_agg(policyname, ', ')     AS cuales
  FROM pg_policies
 WHERE schemaname = 'public'
   AND permissive = 'PERMISSIVE'
 GROUP BY tablename, cmd
HAVING count(*) > 1
 ORDER BY count(*) DESC, tablename;


-- ---------------------------------------------------------------------
-- 5. ESTADÍSTICAS AL DÍA
-- ---------------------------------------------------------------------
-- El planificador elige plan con las estadísticas que tiene. Recién creados
-- los índices sigue con las viejas y puede no usarlos.

ANALYZE;


-- ---------------------------------------------------------------------
-- 6. VERIFICACIÓN
-- ---------------------------------------------------------------------
-- Las dos filas tienen que decir OK.

SELECT 'políticas con JWT por fila (debe ser 0)' AS comprueba,
       count(*)                                  AS pendientes,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVISAR' END AS estado
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (COALESCE(qual, '') LIKE '%auth.uid()%' OR COALESCE(with_check, '') LIKE '%auth.uid()%')
   AND COALESCE(qual, '')       NOT LIKE '%SELECT auth.uid()%'
   AND COALESCE(with_check, '') NOT LIKE '%SELECT auth.uid()%'

UNION ALL

SELECT 'claves ajenas sin índice (debe ser 0)',
       count(*),
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVISAR' END
  FROM pg_constraint c
  JOIN pg_class     t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
 WHERE c.contype = 'f'
   AND n.nspname = 'public'
   AND NOT EXISTS (
       SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
   );
