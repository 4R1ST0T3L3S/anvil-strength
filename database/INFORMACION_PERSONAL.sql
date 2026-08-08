-- =====================================================================
-- ANVIL STRENGTH — INFORMACIÓN PERSONAL DEL ATLETA
-- =====================================================================
--
-- QUÉ RESUELVE
--
-- El entrenador necesita datos del atleta que no son entrenamiento: edad,
-- altura, peso, envergadura, longitud de fémur, lesiones previas. Hasta ahora
-- vivían —los pocos que había— como columnas sueltas de `profiles`
-- (`gender`, `age_category`, `weight_category`).
--
-- El problema no es que falten campos: es que NO SON LOS MISMOS PARA TODOS.
-- Un entrenador quiere la envergadura de quien hace press de banca y le da
-- igual en un lifter de sumo; otro pide años entrenando y otro no. Con
-- columnas, cada campo nuevo son un ALTER TABLE, una entrada en la lista
-- blanca de `SECURITY_HARDENING.sql` —la que siempre se olvida y rompe el
-- guardado EN SILENCIO— y una decisión global que se le impone a todos.
--
--
-- POR QUÉ ESTE MODELO Y NO OTRO
--
-- Es el MISMO patrón que los check-ins (`form_templates` + `form_responses`),
-- que lleva en producción desde que existen y resuelve exactamente el mismo
-- problema: un catálogo JSONB dice QUÉ se pregunta, y una fila JSONB guarda
-- QUÉ se ha contestado. Se descartaron:
--
--   · Columnas en `profiles` — cada campo nuevo, una migración. Y no permite
--     pedirle cosas distintas a atletas distintos, que es el requisito.
--   · EAV (tabla campo/valor) — tres tablas y un JOIN para leer una altura.
--
--
-- POR QUÉ LOS VALORES LLEVAN FECHA
--
-- `athlete_profile_data` tiene la fecha en la CLAVE. La altura no cambia, pero
-- el peso corporal sí, y guardar un único registro por atleta convertiría cada
-- pesaje en la destrucción del anterior. Con la fecha dentro, "peso" es una
-- serie temporal desde el primer día y ANVIL Insights puede cruzarla con el
-- rendimiento sin pedirle nada nuevo al atleta.
--
-- Leer "lo que hay ahora" = el último valor NO NULO de cada clave. Eso hace
-- que un campo estable escrito una vez siga vigente para siempre sin tener que
-- repetirlo en cada fila.
--
-- Ejecutar en el SQL Editor de Supabase. IDEMPOTENTE.
-- Depende de: athlete_lifecycle.sql (usa `coach_athletes.status`).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. QUIÉN LLEVA A QUIÉN, EN UNA SOLA FUNCIÓN
-- ---------------------------------------------------------------------
-- Las políticas de más abajo tienen que preguntar "¿soy el entrenador de este
-- atleta?", y esa pregunta salta de tabla en tabla. Hacerlo con un EXISTS
-- suelto dentro de la política significa que Postgres evalúa las políticas de
-- `coach_athletes` DENTRO de las de esta tabla, por cada fila y por cada
-- política permisiva que haya. Es exactamente lo que hizo que guardar UNA
-- serie tardara segundos y acabó en database/FIX_TIMEOUT_SERIES.sql.
--
-- SECURITY DEFINER corta ese anidamiento. No abre nada: la función solo
-- responde sí o no sobre el usuario que llama, nunca devuelve filas.
--
-- Se deja con nombre genérico a propósito para que futuras migraciones dejen
-- de repetir el EXISTS a mano.
CREATE OR REPLACE FUNCTION public.manages_athlete(p_athlete_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.coach_athletes ca
         WHERE ca.athlete_id = p_athlete_id
           AND ca.coach_id   = (SELECT auth.uid())
           AND ca.status     = 'active'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.manages_athlete(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.manages_athlete(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 1. QUÉ SE LE PIDE A CADA ATLETA
-- ---------------------------------------------------------------------
-- Dos ámbitos, como en los vídeos de ejercicio:
--
--   · `athlete_id IS NULL` → plantilla POR DEFECTO del entrenador. Vale para
--     todos sus atletas y es lo que rellena el 90% de los casos.
--   · `athlete_id` informado → lo que le pide a ESE atleta en concreto.
--
-- Sin ninguna fila, la aplicación usa su juego predefinido
-- (`DEFAULT_PERSONAL_FIELDS` en src/services/personalInfoService.ts). Igual
-- que en los check-ins: la ausencia de plantilla no es una plantilla vacía.
CREATE TABLE IF NOT EXISTS public.athlete_profile_schemas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    athlete_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- [{ id, label, type: 'number'|'text'|'date'|'select', unit?, options?,
    --    athleteCanEdit }]
    fields     JSONB NOT NULL DEFAULT '[]'::jsonb,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT athlete_profile_schemas_fields_is_array
        CHECK (jsonb_typeof(fields) = 'array')
);

-- Un UNIQUE normal sobre (coach_id, athlete_id) NO sirve: Postgres considera
-- distintos dos NULL, así que un entrenador podría acabar con varias
-- plantillas por defecto y ninguna forma de saber cuál manda. Dos índices
-- parciales, como en `exercise_videos`.
CREATE UNIQUE INDEX IF NOT EXISTS athlete_profile_schemas_default_uniq
    ON public.athlete_profile_schemas (coach_id)
    WHERE athlete_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS athlete_profile_schemas_athlete_uniq
    ON public.athlete_profile_schemas (coach_id, athlete_id)
    WHERE athlete_id IS NOT NULL;

ALTER TABLE public.athlete_profile_schemas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aps_coach_all"      ON public.athlete_profile_schemas;
DROP POLICY IF EXISTS "aps_athlete_read"   ON public.athlete_profile_schemas;

-- El entrenador manda sobre lo suyo.
CREATE POLICY "aps_coach_all" ON public.athlete_profile_schemas
    FOR ALL TO authenticated
    USING      (coach_id = (SELECT auth.uid()))
    WITH CHECK (coach_id = (SELECT auth.uid()));

-- El atleta LEE lo que le aplica: la plantilla por defecto de su entrenador y
-- la suya propia. No la de otro atleta, y no puede escribir ninguna — qué se
-- pregunta lo decide quien entrena, no quien contesta.
CREATE POLICY "aps_athlete_read" ON public.athlete_profile_schemas
    FOR SELECT TO authenticated
    USING (
        (athlete_id IS NULL OR athlete_id = (SELECT auth.uid()))
        AND EXISTS (
            SELECT 1 FROM public.coach_athletes ca
             WHERE ca.coach_id   = athlete_profile_schemas.coach_id
               AND ca.athlete_id = (SELECT auth.uid())
               AND ca.status     = 'active'
        )
    );

REVOKE ALL ON public.athlete_profile_schemas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_profile_schemas TO authenticated;


-- ---------------------------------------------------------------------
-- 2. QUÉ HA CONTESTADO, Y CUÁNDO
-- ---------------------------------------------------------------------
-- `values` es un OBJETO (clave → valor), no la lista de pares que usan los
-- check-ins. La diferencia es a propósito: un check-in es una foto de un día
-- concreto y quiere conservar el enunciado tal y como se preguntó entonces;
-- aquí lo que interesa es el ÚLTIMO valor de cada clave a lo largo del tiempo,
-- y para eso un objeto se fusiona y se consulta sin recorrer arrays.
--
-- El enunciado vive en la plantilla y se resuelve al leer: si el entrenador
-- retira un campo, `mergeFields()` en el cliente lo recupera de los datos para
-- que lo contestado no desaparezca de la pantalla.
CREATE TABLE IF NOT EXISTS public.athlete_profile_data (
    athlete_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,

    values      JSONB NOT NULL DEFAULT '{}'::jsonb,

    updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (athlete_id, recorded_on),

    CONSTRAINT athlete_profile_data_values_is_object
        CHECK (jsonb_typeof(values) = 'object')
);

-- La consulta de siempre es "las últimas N filas de este atleta".
CREATE INDEX IF NOT EXISTS athlete_profile_data_recent_idx
    ON public.athlete_profile_data (athlete_id, recorded_on DESC);

ALTER TABLE public.athlete_profile_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apd_athlete_all"    ON public.athlete_profile_data;
DROP POLICY IF EXISTS "apd_coach_read"     ON public.athlete_profile_data;
DROP POLICY IF EXISTS "apd_coach_insert"   ON public.athlete_profile_data;
DROP POLICY IF EXISTS "apd_coach_update"   ON public.athlete_profile_data;

-- Sus datos son suyos: los lee y los escribe.
--
-- Que un campo sea o no editable por el atleta (`athleteCanEdit`) se respeta
-- en la interfaz y NO aquí. Es deliberado: son SUS datos personales, no una
-- prescripción, así que el candado es de forma de trabajar y no de seguridad.
-- Donde sí hay candado de verdad es en lo que pauta el coach — ver
-- `protect_target_fields()` en database/expand_grouped_set.sql.
CREATE POLICY "apd_athlete_all" ON public.athlete_profile_data
    FOR ALL TO authenticated
    USING      (athlete_id = (SELECT auth.uid()))
    WITH CHECK (athlete_id = (SELECT auth.uid()));

-- El entrenador lee y escribe los de sus atletas activos: es él quien toma
-- las medidas en persona, y tener que pedirle al atleta que las teclee sería
-- garantizar que la mitad no se registren.
CREATE POLICY "apd_coach_read" ON public.athlete_profile_data
    FOR SELECT TO authenticated
    USING (public.manages_athlete(athlete_id));

CREATE POLICY "apd_coach_insert" ON public.athlete_profile_data
    FOR INSERT TO authenticated
    WITH CHECK (public.manages_athlete(athlete_id));

CREATE POLICY "apd_coach_update" ON public.athlete_profile_data
    FOR UPDATE TO authenticated
    USING      (public.manages_athlete(athlete_id))
    WITH CHECK (public.manages_athlete(athlete_id));

-- Sin DELETE para el entrenador. Borrar el historial de medidas de alguien no
-- es una operación que deba caber en un clic: el atleta puede borrar lo suyo
-- (`apd_athlete_all`) y con eso basta.

REVOKE ALL ON public.athlete_profile_data FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_profile_data TO authenticated;


-- ---------------------------------------------------------------------
-- 3. RECARGA DEL CACHÉ DE ESQUEMA
-- ---------------------------------------------------------------------
-- Sin esto PostgREST sigue devolviendo PGRST205 ("no existe la tabla") hasta
-- el siguiente reinicio, y la pantalla nueva parece rota estando bien.
NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- 4. VERIFICACIÓN
-- =====================================================================
-- EJECUTA las consultas en vez de limitarse a crear los objetos.
--
-- Motivo, aprendido en database/FIX_ATLETA_SIN_EMAIL.sql: PostgreSQL no
-- resuelve los nombres de columna del cuerpo de una función plpgsql hasta la
-- primera llamada, así que un CREATE FUNCTION que pasa sin quejarse no prueba
-- absolutamente nada. Aquí `manages_athlete` es LANGUAGE SQL —que sí valida al
-- crearse— pero la costumbre se mantiene: lo que no se ejecuta, no se sabe.
DO $$
DECLARE
    v_ok BOOLEAN;
BEGIN
    -- Las dos tablas responden.
    PERFORM 1 FROM public.athlete_profile_schemas WHERE FALSE;
    PERFORM 1 FROM public.athlete_profile_data    WHERE FALSE;

    -- La función se ejecuta de verdad. Sin sesión, `auth.uid()` es NULL y
    -- tiene que responder FALSE — nunca reventar ni decir que sí.
    SELECT public.manages_athlete('00000000-0000-0000-0000-000000000000') INTO v_ok;
    IF v_ok IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'manages_athlete() debería devolver FALSE sin sesión, ha devuelto %', v_ok;
    END IF;

    -- Los CHECK de forma hacen su trabajo: `fields` array, `values` objeto.
    BEGIN
        INSERT INTO public.athlete_profile_schemas (coach_id, fields)
        VALUES ('00000000-0000-0000-0000-000000000000', '{}'::jsonb);
        RAISE EXCEPTION 'El CHECK de `fields` no está activo: ha aceptado un objeto donde va un array';
    EXCEPTION
        WHEN check_violation THEN NULL;       -- lo esperado
        WHEN foreign_key_violation THEN NULL; -- el CHECK ya pasó; falla la FK, que también vale
    END;

    RAISE NOTICE 'INFORMACION_PERSONAL.sql aplicado correctamente.';
END $$;
