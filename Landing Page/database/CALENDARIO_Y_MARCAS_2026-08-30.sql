-- =====================================================================
-- ANVIL STRENGTH — CALENDARIO DE PROGRAMACIÓN Y MEJORES MARCAS
-- 30 de agosto de 2026
-- =====================================================================
--
-- Idempotente. Ejecutar en el editor SQL de Supabase.
--
-- DEPENDE DE: SECURITY_HARDENING.sql, por `public.shares_coaching_link()`.
-- El bloque 2 lo comprueba y aborta con un mensaje claro si falta; el bloque 1
-- es independiente y se puede ejecutar igual.
--
-- OJO CON ESA FUNCIÓN: su firma es de UN argumento
-- —`shares_coaching_link(other_id UUID)`— y saca `auth.uid()` por dentro.
-- Llamarla con dos da `42883: function ... does not exist`, que despista
-- porque la función sí existe: lo que no existe es esa firma.
-- Comprobación rápida:  npm run db:check
--
--
-- QUÉ AÑADE, Y POR QUÉ NO SE PODÍA DERIVAR DE LO QUE YA HAY
-- ---------------------------------------------------------------------
--
-- Son solo DOS cosas. Todo lo demás del calendario y de las estadísticas
-- nuevas se calcula con lo que ya está en la base: los bloques ya tienen
-- `start_week`/`end_week`/`start_date`, las sesiones ya tienen
-- `week_number`/`day_of_week`, y las series ya distinguen `target_*` de
-- `actual_*`.
--
--   1. `session_exercises.accessory_class`
--      Para qué sirve un accesorio: si apoya a la sentadilla, a la banca, al
--      peso muerto, si es trabajo compensatorio o de competición.
--      NO se puede adivinar por el nombre. La misma prensa es apoyo de
--      sentadilla en un bloque de pierna y trabajo compensatorio en uno de
--      press, y ningún regex puede saber cuál de las dos quiso el coach. Va
--      en la PRESCRIPCIÓN y no en `exercise_library` por el mismo motivo que
--      `primary_muscles`: la biblioteca es global y no puede decir dos cosas
--      a la vez.
--
--   2. `athlete_rep_maxes`
--      La mejor marca del atleta PARA CADA NÚMERO DE REPETICIONES: mejor
--      single, mejor doble, mejor triple, mejor 5RM.
--      `athlete_exercise_maxes` NO sirve: tiene `UNIQUE (athlete_id,
--      exercise_key)`, o sea que estructuralmente solo cabe UN máximo por
--      ejercicio. Guardar ahí el mejor 3RM machacaría el 1RM, que es la
--      referencia con la que se resuelven todos los porcentajes del bloque.
--      Son dos cosas distintas y necesitan dos sitios.
--
--
-- DEGRADACIÓN SI NO SE EJECUTA
-- ---------------------------------------------------------------------
-- El cliente NO se rompe sin esto:
--   · `accessory_class` se omite del payload cuando vale NULL, y el
--     `updateSessionExercise` traduce el PGRST204. Los accesorios salen
--     todos como "sin clasificar", que es exactamente lo que son.
--   · `repMaxesService` traduce el 42P01 ("la tabla no existe") a un aviso
--     accionable y devuelve lista vacía. La pestaña Histórico se pinta con
--     el mensaje de que falta la migración, y todo lo demás sigue igual.
--
--
-- LO QUE NO HACE, A PROPÓSITO
-- ---------------------------------------------------------------------
-- NO rellena `training_blocks.end_date`. Está casi siempre vacía porque
-- `CreateBlockModal` nunca la escribió, y el aviso "su bloque acaba en N
-- días" de `AttentionPanel` no salta por eso. El calendario nuevo NO la usa
-- —deriva el final de `end_week`, que sí está siempre—, así que rellenarla
-- es una mejora aparte que TOCA DATOS EXISTENTES y necesita su propia
-- decisión. Queda como el bloque 4 de este archivo, comentado.
-- =====================================================================


-- =====================================================================
-- 1. CLASIFICACIÓN DE ACCESORIOS
-- =====================================================================

ALTER TABLE public.session_exercises
    ADD COLUMN IF NOT EXISTS accessory_class TEXT;

COMMENT ON COLUMN public.session_exercises.accessory_class IS
    'A qué levantamiento apoya este accesorio, para ESTA prescripción. '
    'NULL = sin clasificar (no se reparte a ojo: se cuenta aparte). '
    'Ver src/lib/planning/accessoryStats.ts.';

-- Los cinco valores admitidos. Coinciden EXACTAMENTE con `AccessoryClass` de
-- src/types/training.ts: una falta de ortografía aquí se traduce en series
-- que desaparecen del reparto sin avisar.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'session_exercises_accessory_class_valid'
    ) THEN
        ALTER TABLE public.session_exercises
            ADD CONSTRAINT session_exercises_accessory_class_valid CHECK (
                accessory_class IS NULL OR accessory_class IN (
                    'acc_sq', 'acc_bp', 'acc_dl', 'compensatorio', 'comp'
                )
            );
    END IF;
END $$;

-- Índice parcial: solo las filas clasificadas. El reparto de accesorios
-- filtra por esta columna y la inmensa mayoría de filas serán NULL durante
-- mucho tiempo; un índice completo ocuparía sitio para nada.
CREATE INDEX IF NOT EXISTS session_exercises_accessory_class_idx
    ON public.session_exercises (accessory_class)
    WHERE accessory_class IS NOT NULL;


-- =====================================================================
-- 2. MEJORES MARCAS POR NÚMERO DE REPETICIONES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.athlete_rep_maxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Mismo criterio de normalización que `athlete_exercise_maxes`: lo calcula
    -- el cliente con `exerciseKey()`, para que las dos tablas y la analítica
    -- agrupen igual y "Sentadilla " encuentre lo de "sentadilla".
    exercise_key TEXT NOT NULL,
    exercise_name TEXT NOT NULL,

    -- LO QUE DEFINE LA MARCA. Un 220x1 y un 200x5 son marcas distintas de
    -- cosas distintas, y por eso `reps` entra en la clave única: cada número
    -- de repeticiones tiene su propio registro.
    reps SMALLINT NOT NULL CHECK (reps BETWEEN 1 AND 12),
    load_kg NUMERIC(6,2) NOT NULL CHECK (load_kg > 0 AND load_kg < 1000),

    -- El desempate a igualdad de peso, en orden: RPE más bajo, velocidad más
    -- alta, fecha más reciente. Ver src/lib/stats/repMaxes.ts.
    rpe NUMERIC(3,1) CHECK (rpe IS NULL OR (rpe > 0 AND rpe <= 10)),
    mean_velocity NUMERIC(4,3) CHECK (mean_velocity IS NULL OR mean_velocity > 0),

    achieved_on DATE,

    -- De dónde sale. 'detected' significa que salió de una serie registrada y
    -- que un humano la confirmó — la detección PROPONE, nunca escribe sola:
    -- una serie mal tecleada por el atleta no puede convertirse en la
    -- referencia sobre la que se programa el bloque siguiente.
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'detected')),

    -- La serie de la que salió, cuando viene del registro. ON DELETE SET NULL
    -- y no CASCADE: si se borra la serie, la marca SIGUE siendo cierta —
    -- ocurrió— y perderla reescribiría el pasado del atleta.
    training_set_id UUID REFERENCES public.training_sets(id) ON DELETE SET NULL,

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- UNA marca vigente por atleta, ejercicio y número de repeticiones. El
    -- histórico de series ya vive en `training_sets`; acumular aquí filas
    -- antiguas daría dos fuentes de verdad que acabarían discrepando.
    UNIQUE (athlete_id, exercise_key, reps)
);

CREATE INDEX IF NOT EXISTS athlete_rep_maxes_athlete_idx
    ON public.athlete_rep_maxes (athlete_id);

CREATE INDEX IF NOT EXISTS athlete_rep_maxes_lookup_idx
    ON public.athlete_rep_maxes (athlete_id, exercise_key, reps);

ALTER TABLE public.athlete_rep_maxes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS. Mismas cuatro políticas que `athlete_exercise_maxes`, y por el mismo
-- motivo: la marca de un atleta la ven él y quien lo entrena, nadie más.
--
--
-- LA FIRMA DE `shares_coaching_link` ES DE **UN** ARGUMENTO
--
-- `public.shares_coaching_link(other_id UUID)`. Recibe SOLO al otro y saca
-- `auth.uid()` por dentro (ver database/SECURITY_HARDENING.sql:90). Llamarla
-- con dos falla con `42883: function ... does not exist`, que es un error
-- confuso porque la función sí existe — lo que no existe es esa firma.
--
--
-- `auth.uid()` VA ENVUELTO EN `(SELECT ...)`
--
-- Sin envolver se evalúa POR FILA en vez de por consulta, que es lo que causó
-- el timeout de `training_sets` (ver FIX_TIMEOUT_SERIES.sql y
-- OPTIMIZACION_RENDIMIENTO.sql, donde se reescribieron 203 llamadas). No es un
-- detalle de estilo.
--
-- Dentro de la llamada a la función NO hace falta: la función es STABLE y
-- SECURITY DEFINER, así que el planificador ya la evalúa una vez por consulta
-- y además es lo que corta el anidamiento de RLS entre tablas.
--
--
-- `TO authenticated` EN LAS CUATRO
--
-- Sin él la política también se evalúa para `anon`, y aunque la condición
-- diera falso, el trabajo de evaluarla se hace igual en cada petición
-- anónima. Es el mismo criterio de la tabla hermana.
-- ---------------------------------------------------------------------

-- Si falta SECURITY_HARDENING.sql, el error de PostgreSQL sería un 42883
-- sobre una función que "no existe" — sin decir cuál es el archivo que la
-- crea. Esto lo dice antes y con la instrucción concreta.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'shares_coaching_link'
          AND p.pronargs = 1
    ) THEN
        RAISE EXCEPTION
            'Falta public.shares_coaching_link(uuid). Ejecuta antes database/SECURITY_HARDENING.sql.';
    END IF;
END $$;

DROP POLICY IF EXISTS arm_select ON public.athlete_rep_maxes;
DROP POLICY IF EXISTS arm_insert ON public.athlete_rep_maxes;
DROP POLICY IF EXISTS arm_update ON public.athlete_rep_maxes;
DROP POLICY IF EXISTS arm_delete ON public.athlete_rep_maxes;

-- Ver: el propio atleta y el coach que lo lleva. Nadie más.
CREATE POLICY arm_select ON public.athlete_rep_maxes
    FOR SELECT TO authenticated
    USING (
        athlete_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
    );

-- Escribir: el atleta sobre lo suyo, y su coach. En UPDATE se comprueba
-- también en USING además de en WITH CHECK, para que nadie mueva una fila
-- ajena a su propio athlete_id.
CREATE POLICY arm_insert ON public.athlete_rep_maxes
    FOR INSERT TO authenticated
    WITH CHECK (
        athlete_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
    );

CREATE POLICY arm_update ON public.athlete_rep_maxes
    FOR UPDATE TO authenticated
    USING (
        athlete_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
    )
    WITH CHECK (
        athlete_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
    );

CREATE POLICY arm_delete ON public.athlete_rep_maxes
    FOR DELETE TO authenticated
    USING (
        athlete_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
    );

-- LOS PERMISOS DE TABLA, QUE SON OTRA COSA QUE LA RLS.
--
-- La RLS filtra FILAS; el GRANT decide si el rol puede tocar la tabla
-- siquiera. Sin esto, `authenticated` hereda lo que haya por defecto en el
-- esquema: o no puede leer nada (la pestaña sale vacía sin explicación) o
-- puede más de lo que debería. Mismo par que `athlete_exercise_maxes`.
REVOKE ALL ON public.athlete_rep_maxes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_rep_maxes TO authenticated;


-- =====================================================================
-- 3. VERIFICACIÓN — EJECUTAR Y LEER LA SALIDA
-- =====================================================================
--
-- No basta con que el script termine sin error: `ADD COLUMN IF NOT EXISTS`
-- calla si ya estaba y `CREATE POLICY` no prueba que la política haga lo que
-- se cree. Estas tres consultas dicen el estado REAL.
-- =====================================================================

-- 3.1 ¿Existe la columna de clasificación y con su restricción?
SELECT
    'session_exercises.accessory_class' AS que,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'session_exercises'
          AND column_name = 'accessory_class'
    ) AS columna_existe,
    EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'session_exercises_accessory_class_valid'
    ) AS restriccion_existe;

-- 3.2 ¿Existe la tabla de marcas, con su clave única y su RLS activa?
SELECT
    'athlete_rep_maxes' AS que,
    EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'athlete_rep_maxes'
    ) AS tabla_existe,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.athlete_rep_maxes'::regclass) AS rls_activa,
    (SELECT COUNT(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'athlete_rep_maxes') AS politicas;

-- 3.3 La clave única es lo que hace que un single y un triple convivan.
--     Si esto devuelve 0, la tabla está mal creada y la detección de marcas
--     machacará unas con otras.
SELECT
    'unicidad por repeticiones' AS que,
    COUNT(*) AS indices_unicos
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'athlete_rep_maxes'
  AND indexdef ILIKE '%UNIQUE%'
  AND indexdef ILIKE '%reps%';

-- 3.4 LOS PERMISOS DE TABLA, que son distintos de la RLS y se olvidan.
--     `authenticated` tiene que poder las cuatro operaciones y `anon`
--     ninguna. Si `authenticated` sale con 0 privilegios, la pestaña
--     Histórico se verá vacía sin ningún error que lo explique.
SELECT
    grantee,
    string_agg(privilege_type, ', ' ORDER BY privilege_type) AS permisos
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'athlete_rep_maxes'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee;

-- 3.5 Prueba de fuego: una consulta real contra la tabla.
--     Si las políticas estuvieran mal escritas, `CREATE POLICY` habría pasado
--     igual —PostgreSQL no valida la expresión hasta que se usa— y el fallo
--     aparecería en producción. Esto la ejecuta ahora.
SELECT 'la tabla se puede consultar' AS que, COUNT(*) AS filas
FROM public.athlete_rep_maxes;


-- =====================================================================
-- 4. OPCIONAL — RELLENAR `training_blocks.end_date`
-- =====================================================================
--
-- ESTÁ COMENTADO A PROPÓSITO. Es el único trozo de este archivo que TOCA
-- DATOS EXISTENTES, y por eso no se ejecuta sin decidirlo.
--
-- QUÉ ARREGLA: `CreateBlockModal` nunca escribió `end_date`, así que está
-- vacía en casi todos los bloques. `AttentionPanel` la lee para avisar de
-- "su bloque acaba en N días", y por eso ese aviso NO SALTA NUNCA hoy.
--
-- QUÉ NO ARREGLA: el calendario nuevo no la necesita. Deriva el final de
-- `end_week` + el año de `start_date`, que es el dato que sí está siempre.
--
-- RIESGO: si algún bloque tuviera `end_date` puesta a mano con un valor
-- distinto del que sale de `end_week`, esto la pisaría. El `WHERE end_date IS
-- NULL` lo evita — solo rellena huecos, nunca corrige lo escrito.
--
-- Antes de descomentarlo, mirar cuántas filas afecta:
--
--     SELECT COUNT(*) FROM public.training_blocks
--      WHERE end_date IS NULL AND end_week IS NOT NULL AND start_date IS NOT NULL;
--
-- ---------------------------------------------------------------------
-- UPDATE public.training_blocks b
--    SET end_date = (
--            -- Lunes de la semana ISO `end_week` del año de `start_date`,
--            -- más 6 días = su domingo.
--            date_trunc('week',
--                make_date(EXTRACT(YEAR FROM b.start_date)::INT, 1, 4)
--                + ((b.end_week - 1) * INTERVAL '1 week')
--            ) + INTERVAL '6 days'
--        )::DATE
--  WHERE b.end_date IS NULL
--    AND b.end_week IS NOT NULL
--    AND b.start_date IS NOT NULL
--    -- Los bloques que cruzan el fin de año se dejan fuera: su `end_week`
--    -- pertenece al año SIGUIENTE y esta fórmula lo situaría once meses
--    -- antes de su inicio. Son pocos y merecen mirarse a mano.
--    AND b.end_week >= b.start_week;
-- ---------------------------------------------------------------------
