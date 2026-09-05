-- =====================================================================
-- ANVIL STRENGTH — EL ATLETA FICTICIO NO NECESITA CORREO
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente. Sin dependencias de
-- orden: solo REDEFINE dos funciones que ya existen.
--
--
-- QUÉ ESTABA ROTO
-- ---------------------------------------------------------------------
--
-- `public.profiles` NO tiene columna `email`. La tienen los borradores del
-- esquema (database_schema_complete.sql, supabase/MASTER_SCHEMA_V3.sql) pero
-- no la base real, y database/SECURITY_HARDENING.sql ya lo daba por hecho.
--
-- database/athlete_lifecycle.sql sí la usa, en dos sitios. PostgreSQL no
-- valida el cuerpo de una función plpgsql al crearla —resuelve los nombres de
-- columna en la PRIMERA EJECUCIÓN—, así que las dos se crearon sin una sola
-- queja y fallan al usarlas:
--
--   1. `find_athlete_by_email(TEXT)` filtra por `lower(p.email)`.
--      Efecto: buscar a un atleta por correo revienta con 42703.
--
--   2. `protect_identity_fields()` compara `NEW.email IS DISTINCT FROM
--      OLD.email`. Es un disparador BEFORE UPDATE sobre `profiles`, así que
--      el efecto es peor: CUALQUIER edición que un entrenador haga sobre la
--      ficha de un atleta gestionado falla con «record "new" has no field
--      "email"». La ficha existe, se puede leer, y no se puede tocar.
--
-- El tercer punto —la Edge Function `athletes` insertando `email` en
-- `profiles`, que es lo que daba «Could not find the 'email' column of
-- 'profiles' in the schema cache» al pulsar "Nuevo atleta"— está arreglado en
-- supabase/functions/athletes/index.ts y necesita despliegue aparte:
--
--     npx supabase functions deploy athletes
--
--
-- LA DECISIÓN: NO SE CREA LA COLUMNA, SE QUITA SU USO
-- ---------------------------------------------------------------------
--
-- Añadir `profiles.email` habría arreglado el error en una línea. No se hace
-- porque sería la TERCERA copia del mismo dato:
--
--   auth.users.email       — con qué correo inicia sesión. Lo exige Supabase,
--                            así que un atleta sin correo lleva ahí uno de
--                            marcador (@gestionado.anvil.invalid) que no
--                            sirve para escribirle.
--   profiles.contact_email — el correo REAL, el que se puede usar. NULL
--                            mientras no lo haya. Es la columna que responde
--                            a "¿puedo invitar a este atleta?".
--
-- Una tercera copia solo añade una forma más de que se desincronicen, y la
-- pregunta "¿cuál de las tres es la buena?" no tiene respuesta escrita en
-- ningún sitio. Las dos que quedan sí: una es identidad, la otra es contacto.
--
-- Efecto secundario deseado: al no crear la columna, este arreglo NO cambia
-- el esquema. Nada que migrar, nada que revertir.
-- =====================================================================


-- =====================================================================
-- 1. BUSCAR POR CORREO, MIRANDO DONDE EL CORREO ESTÁ DE VERDAD
-- =====================================================================
-- Sustituye a la versión de athlete_lifecycle.sql (sección 7).
--
-- Se consultan los DOS sitios porque responden a preguntas distintas y
-- mirar solo uno deja fuera la mitad de los duplicados:
--
--   auth.users.email  — "esta persona ya se registró por su cuenta".
--   contact_email     — "otro entrenador ya le dio de alta y anotó su correo,
--                        pero todavía no ha entrado nunca".
--
-- Leer `auth.users` desde aquí es legítimo y no abre nada: la función es
-- SECURITY DEFINER, comprueba el rol de quien llama antes de mirar, responde
-- sobre UN correo exacto que ya hay que conocer, y nunca lista.

CREATE OR REPLACE FUNCTION public.find_athlete_by_email(p_email TEXT)
RETURNS TABLE (
    profile_id     UUID,
    full_name      TEXT,
    account_status TEXT,
    already_linked BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    me     UUID := auth.uid();
    mi_rol TEXT;
    correo TEXT := lower(trim(p_email));
BEGIN
    IF me IS NULL OR correo = '' THEN
        RETURN;
    END IF;

    SELECT role INTO mi_rol FROM public.profiles WHERE id = me;
    IF mi_rol NOT IN ('coach', 'nutritionist', 'admin') THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id,
           p.full_name,
           p.account_status,
           EXISTS (
               SELECT 1 FROM public.coach_athletes ca
                WHERE ca.athlete_id = p.id AND ca.coach_id = me AND ca.status = 'active'
           )
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
     WHERE lower(p.contact_email) = correo
        OR lower(u.email) = correo
     LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_athlete_by_email(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.find_athlete_by_email(TEXT) TO authenticated;


-- =====================================================================
-- 2. EL CERROJO DE IDENTIDAD, SIN LA COLUMNA QUE NO EXISTE
-- =====================================================================
-- Sustituye a la versión de athlete_lifecycle.sql (sección 5b).
--
-- Sigue haciendo exactamente lo mismo: impedir que un entrenador cambie el
-- rol, el acceso o el estado de cuenta en la ficha de OTRO. Sin esto podría
-- poner `role = 'admin'` en el perfil de un atleta gestionado y esperar a que
-- lo reclamara: el día que esa persona entrase, entraría como administrador.
--
-- Lo único que cambia es que ya no compara `NEW.email`. No se pierde
-- protección: el correo de inicio de sesión vive en `auth.users`, que este
-- disparador nunca ha podido tocar, y `contact_email` es un dato de contacto
-- que el entrenador rellena a propósito.
--
-- `NEW.is_developer` se comprueba solo si la columna existe: no está en todas
-- las bases, y una referencia a una columna ausente vuelve a poner aquí la
-- misma bomba que este archivo viene a desactivar.

DO $$
DECLARE
    tiene_is_developer BOOLEAN := EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'profiles'
           AND column_name = 'is_developer'
    );
    check_dev TEXT := CASE
        WHEN tiene_is_developer THEN 'OR (NEW.is_developer IS DISTINCT FROM OLD.is_developer)'
        ELSE ''
    END;
BEGIN
    EXECUTE format($fn$
        CREATE OR REPLACE FUNCTION public.protect_identity_fields()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $body$
        DECLARE
            me     UUID := auth.uid();
            mi_rol TEXT;
        BEGIN
            -- Sin sesión = disparadores internos y `service_role` (la Edge
            -- Function). Ahí no hay nada que proteger: es código nuestro.
            IF me IS NULL OR me = NEW.id THEN
                RETURN NEW;
            END IF;

            SELECT role INTO mi_rol FROM public.profiles WHERE id = me;
            IF mi_rol = 'admin' THEN
                RETURN NEW;
            END IF;

            IF (NEW.role           IS DISTINCT FROM OLD.role)
            OR (NEW.has_access     IS DISTINCT FROM OLD.has_access)
            OR (NEW.account_status IS DISTINCT FROM OLD.account_status)
            %s THEN
                RAISE EXCEPTION 'Acceso Denegado: no puedes cambiar el rol, el acceso ni el estado de cuenta de otro usuario.';
            END IF;

            RETURN NEW;
        END;
        $body$;
    $fn$, check_dev);
END $$;

DROP TRIGGER IF EXISTS profiles_protect_identity_trg ON public.profiles;
CREATE TRIGGER profiles_protect_identity_trg
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_identity_fields();


-- =====================================================================
-- 3. COMPROBACIÓN
-- =====================================================================
-- Ejecuta de verdad las dos funciones arregladas. Que un CREATE FUNCTION
-- termine sin error no prueba nada aquí —es exactamente por eso que el fallo
-- llegó a producción—, así que la comprobación las USA.

DO $$
DECLARE
    n INT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'profiles'
                  AND column_name = 'email') THEN
        RAISE WARNING 'profiles.email SÍ existe en esta base. Este arreglo sigue siendo válido (no la usa), pero revisa de dónde salió esa columna.';
    END IF;

    -- Sin sesión `auth.uid()` es NULL y la función devuelve 0 filas por su
    -- propia guarda. Lo que se comprueba es que RESUELVE los nombres de
    -- columna, que es donde estaba el fallo.
    SELECT count(*) INTO n FROM public.find_athlete_by_email('comprobacion@anvil.invalid');
    RAISE NOTICE 'find_athlete_by_email: OK (% filas, se esperaban 0 sin sesión).', n;

    RAISE NOTICE 'Listo. Ahora despliega la función: npx supabase functions deploy athletes';
END $$;

NOTIFY pgrst, 'reload schema';
