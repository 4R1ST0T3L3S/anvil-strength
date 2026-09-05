-- =====================================================================
-- ANVIL STRENGTH — ERROR AL COPIAR O CLONAR SEMANAS
-- =====================================================================
--
-- CÓMO SE EJECUTA
-- Supabase → SQL Editor → New query → pegar esto entero → Run.
-- Es IDEMPOTENTE.
--
-- SÍNTOMA
-- "Error copiando semana" al duplicar una semana en el constructor de
-- bloques. También puede fallar al añadir un día a la segunda semana.
--
-- CAUSA
-- training_sessions se creó con esta restricción (database/feature_efort_schema.sql):
--
--     UNIQUE(block_id, day_number)   -- "Evita duplicar Día 1 en el mismo bloque"
--
-- Era correcta cuando un bloque era una lista plana de días. Dejó de serlo en
-- cuanto se añadió `week_number`: un bloque de ocho semanas tiene OCHO días
-- número 1, uno por semana. Con esa restricción solo cabe el primero.
--
-- Por eso falla justo al copiar una semana —lo primero que hace es crear el
-- "Día 1" de la semana nueva, que choca con el de la semana 1— y no al
-- editarla, que solo toca filas que ya existen.
--
-- ARREGLO
-- La restricción correcta incluye la semana: un bloque puede tener muchos
-- "Día 1", pero no dos dentro de la MISMA semana, que es lo que de verdad
-- había que impedir.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ¿HAY DUPLICADOS QUE IMPIDAN CREAR LA RESTRICCIÓN NUEVA?
-- ---------------------------------------------------------------------
-- Si la restricción vieja se perdió en algún despliegue, pueden haberse
-- colado dos días con el mismo número en la misma semana. Hay que verlos
-- ANTES: crear el índice único fallaría y el archivo se quedaría a medias.
--
-- Si esto devuelve filas, revisa esos días en el constructor y renumera o
-- borra el sobrante antes de seguir. Si no devuelve nada, todo en orden.

SELECT block_id,
       week_number,
       day_number,
       count(*)                        AS dias_repetidos,
       string_agg(COALESCE(name, '(sin nombre)'), ' | ') AS nombres
  FROM public.training_sessions
 GROUP BY block_id, week_number, day_number
HAVING count(*) > 1
 ORDER BY block_id, week_number, day_number;


-- ---------------------------------------------------------------------
-- 2. FUERA LA RESTRICCIÓN VIEJA
-- ---------------------------------------------------------------------
-- El nombre lo genera Postgres a partir de la tabla y las columnas, pero
-- cambia según cómo se creara (constraint de tabla, ALTER posterior, índice
-- único suelto). Se buscan las tres formas en el catálogo en lugar de dar por
-- hecho un nombre concreto.

DO $$
DECLARE
    r RECORD;
    n INT := 0;
BEGIN
    -- 2.A Restricciones UNIQUE cuyas columnas sean EXACTAMENTE (block_id, day_number).
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace ns ON ns.oid = t.relnamespace
         WHERE ns.nspname = 'public'
           AND t.relname  = 'training_sessions'
           AND c.contype  = 'u'
           AND (
               -- ::text es obligatorio: attname es de tipo `name` y Postgres no
               -- compara name[] con text[]. Sin el cast, 42883.
               SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                 FROM unnest(c.conkey) AS k(attnum)
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
           ) = ARRAY['block_id', 'day_number']
    LOOP
        EXECUTE format('ALTER TABLE public.training_sessions DROP CONSTRAINT %I', r.conname);
        RAISE NOTICE 'Eliminada la restricción %', r.conname;
        n := n + 1;
    END LOOP;

    -- 2.B Índices únicos sueltos con las mismas dos columnas y sin restricción
    --     detrás (los deja un CREATE UNIQUE INDEX a mano).
    FOR r IN
        SELECT i.indexrelid::regclass::TEXT AS idxname
          FROM pg_index i
          JOIN pg_class t ON t.oid = i.indrelid
          JOIN pg_namespace ns ON ns.oid = t.relnamespace
         WHERE ns.nspname = 'public'
           AND t.relname  = 'training_sessions'
           AND i.indisunique
           AND NOT EXISTS (
               SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid
           )
           AND (
               SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                 FROM unnest(i.indkey) AS k(attnum)
                 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
           ) = ARRAY['block_id', 'day_number']
    LOOP
        EXECUTE format('DROP INDEX public.%I', r.idxname);
        RAISE NOTICE 'Eliminado el índice único %', r.idxname;
        n := n + 1;
    END LOOP;

    IF n = 0 THEN
        RAISE NOTICE 'No había restricción (block_id, day_number). El fallo al copiar es otra cosa.';
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 3. LA RESTRICCIÓN CORRECTA
-- ---------------------------------------------------------------------
-- Un bloque puede tener muchos "Día 1" —uno por semana—, pero no dos en la
-- misma semana.
--
-- Como índice único y no como constraint: así puede crearse con IF NOT
-- EXISTS y el archivo se puede reejecutar sin comprobar si ya está.

CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_bloque_semana_dia_key
    ON public.training_sessions (block_id, week_number, day_number);


-- ---------------------------------------------------------------------
-- 4. VERIFICACIÓN
-- ---------------------------------------------------------------------
-- La primera fila tiene que decir OK y la segunda FUERA.

SELECT 'restricción correcta (bloque+semana+día)' AS comprueba,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FALTA' END AS estado
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname  = 'training_sessions_bloque_semana_dia_key'

UNION ALL

SELECT 'restricción vieja (bloque+día)',
       CASE WHEN COUNT(*) = 0 THEN 'FUERA' ELSE 'SIGUE AHÍ' END
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace ns ON ns.oid = t.relnamespace
 WHERE ns.nspname = 'public'
   AND t.relname  = 'training_sessions'
   AND c.contype  = 'u'
   AND (
       SELECT array_agg(a.attname::text ORDER BY a.attname::text)
         FROM unnest(c.conkey) AS k(attnum)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
   ) = ARRAY['block_id', 'day_number'];
