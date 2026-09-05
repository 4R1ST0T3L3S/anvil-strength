-- =====================================================================
-- ANVIL STRENGTH — LA AGENDA DE UN ATLETA NO ES PÚBLICA
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
--
-- QUÉ SE ESTABA FILTRANDO
-- ---------------------------------------------------------------------
--
-- `competitions` tenía esta política, de database/MASTER_DEPLOY_V2.sql:
--
--     CREATE POLICY "Competitions Public" ON competitions
--         FOR SELECT USING (TRUE);
--
-- `USING (TRUE)` para SELECT sin indicar rol se aplica también a `anon`, y
-- la clave anónima va dentro del bundle del navegador: es pública por
-- diseño. Comprobado contra la base real, sin ninguna sesión abierta:
--
--     GET /rest/v1/competitions?select=*   ->  200, 19 filas
--
-- Entre ellas, filas con `athlete_id` relleno. Cruzando esa tabla se
-- obtiene, de cualquiera que use la plataforma, en qué competición está
-- inscrito, en qué fecha y en qué localidad. Es un dato de localización de
-- una persona identificable, con hora y sitio, servido sin autenticar.
--
--
-- POR QUÉ ESTABA ASÍ, Y POR QUÉ SE PUEDE QUITAR SIN ROMPER NADA
-- ---------------------------------------------------------------------
--
-- La política daba servicio a `competitionsService.getPublicCompetitions()`,
-- una página pública que listaría las competiciones del club con el nombre
-- de cada atleta. Esa función NO TIENE NINGÚN LLAMADOR en toda la
-- aplicación —comprobado— así que hoy la política no habilita ninguna
-- pantalla: solo expone la tabla.
--
-- Si algún día se quiere esa página, la forma de hacerla NO es reabrir la
-- tabla entera: es una vista o una función `SECURITY DEFINER` que devuelva
-- exactamente las columnas que se quieren enseñar, de los atletas que hayan
-- dado su consentimiento. "Publicar" tiene que ser una decisión de cada
-- atleta, no el estado por defecto de una tabla.
--
--
-- LO QUE SÍ SIGUE SIENDO PÚBLICO
-- ---------------------------------------------------------------------
--
-- El calendario oficial: las filas con `athlete_id IS NULL`. Son las fechas
-- de la federación —las mismas que están publicadas en su web— y no dicen
-- nada de nadie. La página del calendario tiene que poder pintarlas sin
-- sesión, así que esas se dejan abiertas a propósito y de forma explícita.
-- =====================================================================


-- =====================================================================
-- 1. FUERA LAS POLÍTICAS PERMISIVAS ANTERIORES
-- =====================================================================
-- En RLS las políticas de un mismo comando se SUMAN (OR): basta con que
-- quede una permisiva para que las nuevas no sirvan de nada. Por eso se
-- borran por nombre todas las que ha ido dejando cada archivo del histórico.

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Competitions Public"              ON public.competitions;
DROP POLICY IF EXISTS "View competitions"                ON public.competitions;
DROP POLICY IF EXISTS "View all competitions"            ON public.competitions;
DROP POLICY IF EXISTS "All users can view competitions"  ON public.competitions;
DROP POLICY IF EXISTS "Athlete Read Competitions"        ON public.competitions;
DROP POLICY IF EXISTS "Athlete Manage Competitions"      ON public.competitions;
DROP POLICY IF EXISTS "Athlete Manage Own Competitions"  ON public.competitions;
DROP POLICY IF EXISTS "Coach Manage Competitions"        ON public.competitions;
DROP POLICY IF EXISTS "Coach Insert Competitions"        ON public.competitions;
DROP POLICY IF EXISTS "Coach Update Competitions"        ON public.competitions;
DROP POLICY IF EXISTS "Coach Delete Competitions"        ON public.competitions;
DROP POLICY IF EXISTS "Athletes can create competitions" ON public.competitions;
DROP POLICY IF EXISTS "Athletes can update competitions" ON public.competitions;
DROP POLICY IF EXISTS "Athletes can delete competitions" ON public.competitions;
DROP POLICY IF EXISTS "Only coaches can create competitions" ON public.competitions;
DROP POLICY IF EXISTS "Only coaches can update competitions" ON public.competitions;
DROP POLICY IF EXISTS "Only coaches can delete competitions" ON public.competitions;

-- Y las de este mismo archivo, para poder volver a ejecutarlo.
DROP POLICY IF EXISTS "comp_select_calendario_oficial" ON public.competitions;
DROP POLICY IF EXISTS "comp_select_propias"            ON public.competitions;
DROP POLICY IF EXISTS "comp_insert"                    ON public.competitions;
DROP POLICY IF EXISTS "comp_update"                    ON public.competitions;
DROP POLICY IF EXISTS "comp_delete"                    ON public.competitions;


-- =====================================================================
-- 2. LECTURA
-- =====================================================================

-- 2a. El calendario oficial de la federación. Sin atleta detrás, sin sesión
--     por delante. Es lo único que esta tabla enseña al mundo.
CREATE POLICY "comp_select_calendario_oficial"
    ON public.competitions FOR SELECT
    TO anon, authenticated
    USING (athlete_id IS NULL);

-- 2b. Las inscripciones de alguien concreto. Las ve ese alguien, quien le
--     entrena, quien creó la inscripción y el administrador. Nadie más.
--
--     `shares_coaching_link` (database/SECURITY_HARDENING.sql) es
--     SECURITY DEFINER a propósito: mira `coach_athletes`, y consultarla
--     directamente desde la política obligaría a que el lector tuviera
--     permiso sobre esa tabla, que es otra puerta que no queremos abrir.
CREATE POLICY "comp_select_propias"
    ON public.competitions FOR SELECT
    TO authenticated
    USING (
        athlete_id = (SELECT auth.uid())
        OR coach_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
        OR public.is_admin()
    );


-- =====================================================================
-- 3. ESCRITURA
-- =====================================================================
-- Un atleta se inscribe a sí mismo; un entrenador inscribe a los suyos.
--
-- `WITH CHECK` y no solo `USING` en el UPDATE: sin él se puede leer una fila
-- que sí es tuya y guardarla con `athlete_id` apuntando a otra persona, que
-- es exactamente cómo se cuelan datos en la agenda de un tercero.

CREATE POLICY "comp_insert"
    ON public.competitions FOR INSERT
    TO authenticated
    WITH CHECK (
        athlete_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
        OR public.is_admin()
        -- Calendario oficial: solo administración.
        OR (athlete_id IS NULL AND public.is_admin())
    );

CREATE POLICY "comp_update"
    ON public.competitions FOR UPDATE
    TO authenticated
    USING (
        athlete_id = (SELECT auth.uid())
        OR coach_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
        OR public.is_admin()
    )
    WITH CHECK (
        athlete_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
        OR public.is_admin()
    );

CREATE POLICY "comp_delete"
    ON public.competitions FOR DELETE
    TO authenticated
    USING (
        athlete_id = (SELECT auth.uid())
        OR coach_id = (SELECT auth.uid())
        OR public.shares_coaching_link(athlete_id)
        OR public.is_admin()
    );


-- =====================================================================
-- 4. ÍNDICES QUE LAS POLÍTICAS NECESITAN
-- =====================================================================
-- Una política es un WHERE que se añade a TODAS las consultas de la tabla.
-- Sin índice sobre las columnas que filtra, endurecer la RLS se paga en
-- latencia en cada lectura.

CREATE INDEX IF NOT EXISTS competitions_athlete_idx  ON public.competitions (athlete_id);
CREATE INDEX IF NOT EXISTS competitions_coach_idx    ON public.competitions (coach_id);
CREATE INDEX IF NOT EXISTS competitions_oficial_idx  ON public.competitions (date)
    WHERE athlete_id IS NULL;


-- =====================================================================
-- 5. COMPROBACIÓN
-- =====================================================================
DO $$
DECLARE
    n_publicas INT;
    n_privadas INT;
BEGIN
    SELECT count(*) INTO n_publicas FROM public.competitions WHERE athlete_id IS NULL;
    SELECT count(*) INTO n_privadas FROM public.competitions WHERE athlete_id IS NOT NULL;
    RAISE NOTICE 'Calendario oficial (seguirá siendo público): % filas.', n_publicas;
    RAISE NOTICE 'Inscripciones de atletas (dejan de serlo): % filas.', n_privadas;
    RAISE NOTICE 'Para verificarlo desde fuera, sin sesión:';
    RAISE NOTICE '  curl -H "apikey: <ANON>" "<URL>/rest/v1/competitions?select=id&athlete_id=not.is.null"';
    RAISE NOTICE '  Tiene que devolver [].';
END $$;

NOTIFY pgrst, 'reload schema';
