-- =====================================================================
-- ANVIL STRENGTH — UNA PERSONA, VARIOS ROLES, ELEGIDOS POR ELLA
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Sin dependencias de orden: solo añade una columna y redefine funciones.
--
--
-- EL CASO QUE VIENE A RESOLVER
-- ---------------------------------------------------------------------
--
-- Alguien que ENTRENA a gente, PAUTA nutrición y ADEMÁS tiene su propio
-- entrenador. Con `profiles.role` como una sola casilla eso no se puede
-- escribir: o es entrenador, o es atleta. Hoy se resuelve pidiéndole a un
-- desarrollador que cambie la casilla a mano, y cada cambio le quita lo
-- anterior.
--
-- A partir de aquí los roles son un CONJUNTO y se los pone cada uno.
--
--
-- POR QUÉ `role` NO DESAPARECE
-- ---------------------------------------------------------------------
--
-- Hay 39 sitios entre políticas RLS y disparadores que comparan
-- `profiles.role` con un texto. Migrarlos todos a la vez es cambiar el
-- control de acceso de la aplicación entera en una sola operación, y un
-- fallo ahí no se ve: se ve como "a este usuario le falta una pantalla" o,
-- peor, como "este usuario ve datos que no son suyos".
--
-- Así que `roles` pasa a ser la VERDAD y `role` pasa a ser un REFLEJO que
-- mantiene un disparador: el rol de mayor alcance del conjunto. Con eso las
-- 39 comprobaciones siguen valiendo sin tocar ni una, y las nuevas se
-- escriben contra el conjunto. Es el mismo patrón que ya usa esta base con
-- `profiles.coach_id`, que dejó de ser verdad y pasó a ser caché de
-- `coach_athletes` (ver database/athlete_lifecycle.sql, sección 3).
--
--
-- QUÉ PUEDE PONERSE UNO MISMO, Y QUÉ NO
-- ---------------------------------------------------------------------
--
--   athlete      — recibe entrenamiento y nutrición.
--   coach        — planifica bloques a otros.
--   nutritionist — pauta nutrición a otros.
--   member       — miembro del club. Hoy hace lo mismo que `athlete`;
--                  existe desde ya para que las ventajas de socio se
--                  puedan colgar de algo sin volver a migrar a nadie.
--
-- Esos cuatro, y solo esos, se los pone cada uno. Los otros dos NO:
--
--   developer    — lo ve todo, incluida la trastienda (Arena, banderas de
--                  funciones en pruebas).
--   admin        — administra usuarios.
--
-- Y esa distinción no es una preferencia, es LA razón de seguridad de todo
-- el archivo. database/SECURITY_HARDENING.sql revocó el permiso de columna
-- sobre `profiles.role` justamente porque cualquiera podía hacer
--
--     supabase.from('profiles').update({ role: 'coach' })
--
-- desde la consola del navegador. Lo que cambia aquí es QUÉ se puede
-- autoasignar, no QUIÉN lo comprueba: sigue comprobándolo el servidor. La
-- columna `roles` queda igual de revocada que `role`, y el único camino
-- para cambiarla es la función `set_my_roles()` del final, que filtra
-- contra la lista blanca. Escribir la columna directamente desde el
-- navegador sigue siendo imposible.
--
-- Que un usuario pueda declararse entrenador no le da acceso a los datos de
-- nadie: para ver a un atleta hace falta una fila en `coach_athletes`, y
-- esa la crea una invitación que el atleta acepta. El rol abre PANTALLAS,
-- el vínculo abre DATOS. Son dos cosas distintas y esta migración solo
-- toca la primera.
-- =====================================================================


-- =====================================================================
-- 1. LA COLUMNA
-- =====================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['athlete'];

-- Un conjunto de verdad: sin repetidos, sin vacío y sin inventos. El CHECK
-- es lo que impide que un rol mal escrito ('coache') se guarde y luego no
-- coincida con nada en ninguna política, que es un fallo silencioso.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_roles_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_roles_check CHECK (
        array_length(roles, 1) >= 1
        AND roles <@ ARRAY['athlete','coach','nutritionist','member','developer','admin']::TEXT[]
    );

-- Buscar "todos los entrenadores" recorrería la tabla entera sin esto. GIN
-- es el índice que sabe responder al operador de contención (`@>`).
CREATE INDEX IF NOT EXISTS profiles_roles_idx ON public.profiles USING GIN (roles);


-- ---------------------------------------------------------------------
-- 1b. TRASVASE DE LO QUE YA HABÍA
-- ---------------------------------------------------------------------
-- Cada perfil arranca con el rol que tenía. Nadie gana ni pierde nada al
-- ejecutar esto: es exactamente el mismo permiso, escrito de otra forma.
--
-- `is_developer` se convierte en un rol más para que "qué es esta persona"
-- se responda mirando UN sitio. La columna se conserva —la leen ArenaView,
-- AnvilGamesHub y CoachChatManager— y a partir de ahora la mantiene el
-- disparador de la sección 2.
--
-- El WHERE evita reescribir en cada reejecución: sin él, cada pasada
-- despertaría los disparadores de las 200 filas para dejarlas igual.

UPDATE public.profiles
   SET roles = ARRAY(
       SELECT DISTINCT r FROM unnest(
           ARRAY[CASE WHEN role IN ('athlete','coach','nutritionist','admin') THEN role
                      ELSE 'athlete' END]
           || CASE WHEN COALESCE(is_developer, FALSE) THEN ARRAY['developer'] ELSE ARRAY[]::TEXT[] END
       ) AS r
   )
 WHERE roles = ARRAY['athlete']::TEXT[]
   AND (role IS DISTINCT FROM 'athlete' OR COALESCE(is_developer, FALSE));


-- =====================================================================
-- 2. `role` E `is_developer` PASAN A SER REFLEJO
-- =====================================================================
-- El orden de la lista es el orden de ALCANCE, de más a menos. Quien es
-- entrenador y atleta a la vez se refleja como 'coach' porque es el rol que
-- abre más puertas, y las políticas que preguntan "¿es entrenador?" tienen
-- que decir que sí.
--
-- CONSECUENCIA CONOCIDA Y ACEPTADA: las tres comprobaciones que preguntan
-- `role = 'athlete'` (los avisos de récord de supabase/pr_notification_trigger.sql)
-- dejan de saltar para quien sea atleta Y entrenador. Se pierde un aviso, no
-- un permiso. Cuando esas se reescriban contra `roles`, esta nota sobra.

CREATE OR REPLACE FUNCTION public.sync_role_from_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.role := CASE
        WHEN 'admin'        = ANY(NEW.roles) THEN 'admin'
        WHEN 'coach'        = ANY(NEW.roles) THEN 'coach'
        WHEN 'nutritionist' = ANY(NEW.roles) THEN 'nutritionist'
        ELSE 'athlete'
    END;

    NEW.is_developer := ('developer' = ANY(NEW.roles));

    RETURN NEW;
END;
$$;

-- BEFORE y no AFTER: así el valor se corrige ANTES de escribirse, en la
-- misma operación. Con un AFTER haría falta un segundo UPDATE, que a su vez
-- volvería a disparar todo esto.
DROP TRIGGER IF EXISTS profiles_sync_role_trg ON public.profiles;
CREATE TRIGGER profiles_sync_role_trg
    BEFORE INSERT OR UPDATE OF roles ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_role_from_roles();

-- Cuadra las filas ya existentes con la regla de arriba.
UPDATE public.profiles SET roles = roles;


-- =====================================================================
-- 3. LOS AYUDANTES MIRAN EL CONJUNTO
-- =====================================================================
-- Aquí está la ganancia real de la migración. `is_coach()` comparaba
-- `role = 'coach'`, así que un entrenador que ADEMÁS fuera nutricionista se
-- reflejaría como 'coach' y dejaría de ser nutricionista para la mitad de
-- las políticas. Leyendo el array, las dos cosas son ciertas a la vez.

CREATE OR REPLACE FUNCTION public.tiene_rol(p_rol TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND p_rol = ANY(roles)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND 'coach' = ANY(roles)
    );
$$;

-- `auth_role()` devuelve el reflejo y no el conjunto: lo consumen políticas
-- que esperan UN texto y compararlas contra un array las rompería.
CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.tiene_rol(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tiene_rol(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_coach()  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_coach()  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.auth_role() TO authenticated;


-- =====================================================================
-- 4. LA COLUMNA SIGUE CERRADA A CAL Y CANTO
-- =====================================================================
-- `roles` NO se añade a la lista de columnas editables de
-- database/SECURITY_HARDENING.sql (sección 1.3). Si se pudiera escribir
-- directamente, un `update({ roles: ['admin'] })` desde la consola del
-- navegador daría administración a cualquiera, que es exactamente el
-- agujero que aquel archivo cerró.
--
-- La única puerta es `set_my_roles()`, y esa filtra.

REVOKE UPDATE (roles) ON public.profiles FROM authenticated, anon;

-- Y el cerrojo de identidad la vigila igual que a `role`: un entrenador no
-- puede cambiar los roles en la ficha de un atleta gestionado suyo.
-- (Reescribe la versión de database/FIX_ATLETA_SIN_EMAIL.sql.)
CREATE OR REPLACE FUNCTION public.protect_identity_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    me     UUID := auth.uid();
    mi_rol TEXT;
BEGIN
    -- Sin sesión = disparadores internos y `service_role` (las Edge
    -- Functions). Ahí no hay nada que proteger: es código nuestro.
    IF me IS NULL OR me = NEW.id THEN
        RETURN NEW;
    END IF;

    SELECT role INTO mi_rol FROM public.profiles WHERE id = me;
    IF mi_rol = 'admin' THEN
        RETURN NEW;
    END IF;

    IF (NEW.role           IS DISTINCT FROM OLD.role)
    OR (NEW.roles          IS DISTINCT FROM OLD.roles)
    OR (NEW.has_access     IS DISTINCT FROM OLD.has_access)
    OR (NEW.account_status IS DISTINCT FROM OLD.account_status)
    OR (NEW.is_developer   IS DISTINCT FROM OLD.is_developer) THEN
        RAISE EXCEPTION 'Acceso Denegado: no puedes cambiar el rol, el acceso ni el estado de cuenta de otro usuario.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_identity_trg ON public.profiles;
CREATE TRIGGER profiles_protect_identity_trg
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_identity_fields();


-- =====================================================================
-- 5. PONERSE LOS ROLES UNO MISMO
-- =====================================================================
-- La única forma de escribir `roles`. Recibe lo que el usuario quiere ser y
-- devuelve lo que ha acabado siendo, que no tiene por qué coincidir: lo que
-- no está en la lista blanca se DESCARTA en silencio en vez de dar error.
--
-- Se descarta y no se rechaza a propósito. Si un cliente antiguo manda
-- 'developer' por lo que sea, la respuesta correcta es guardar el resto y
-- seguir, no dejar al usuario sin poder tocar sus roles. Y como la función
-- devuelve el conjunto final, la interfaz pinta la verdad sin tener que
-- adivinarla.
--
-- Lo que YA tuviera de developer o admin se conserva: esta función sirve
-- para que la gente se gestione los suyos, no para que se quite —ni se
-- ponga— los que concede otro.

CREATE OR REPLACE FUNCTION public.set_my_roles(p_roles TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    me            UUID := auth.uid();
    autogestion   TEXT[] := ARRAY['athlete','coach','nutritionist','member'];
    pedidos       TEXT[];
    concedidos    TEXT[];
    finales       TEXT[];
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'Sin sesión.';
    END IF;

    -- De lo pedido, solo lo que es de libre elección. Sin repetidos.
    SELECT COALESCE(array_agg(DISTINCT r), ARRAY[]::TEXT[])
      INTO pedidos
      FROM unnest(COALESCE(p_roles, ARRAY[]::TEXT[])) AS r
     WHERE r = ANY(autogestion);

    -- Nadie se queda sin nada. Un perfil sin roles no tendría panel al que
    -- entrar, así que desmarcarlo todo equivale a ser atleta.
    IF array_length(pedidos, 1) IS NULL THEN
        pedidos := ARRAY['athlete'];
    END IF;

    -- Lo que le concedió otro sigue donde estaba.
    SELECT COALESCE(array_agg(DISTINCT r), ARRAY[]::TEXT[])
      INTO concedidos
      FROM public.profiles p, unnest(p.roles) AS r
     WHERE p.id = me AND r <> ALL(autogestion);

    SELECT array_agg(DISTINCT r ORDER BY r)
      INTO finales
      FROM unnest(pedidos || concedidos) AS r;

    UPDATE public.profiles SET roles = finales WHERE id = me;

    RETURN finales;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_my_roles(TEXT[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_my_roles(TEXT[]) TO authenticated;


-- =====================================================================
-- 6. COMPROBACIÓN
-- =====================================================================
-- Comprueba lo que de verdad importa: que el reflejo cuadra con el
-- conjunto, y que la lista blanca filtra. Un CREATE FUNCTION que termina
-- sin quejarse no prueba ninguna de las dos cosas.

DO $$
DECLARE
    descuadrados INT;
    prueba       TEXT[];
    sin_sesion   BOOLEAN := FALSE;
BEGIN
    SELECT count(*) INTO descuadrados
      FROM public.profiles
     WHERE role IS DISTINCT FROM CASE
               WHEN 'admin'        = ANY(roles) THEN 'admin'
               WHEN 'coach'        = ANY(roles) THEN 'coach'
               WHEN 'nutritionist' = ANY(roles) THEN 'nutritionist'
               ELSE 'athlete' END
        OR COALESCE(is_developer, FALSE) IS DISTINCT FROM ('developer' = ANY(roles));

    IF descuadrados > 0 THEN
        RAISE EXCEPTION 'Hay % perfiles cuyo `role`/`is_developer` no cuadra con `roles`. El disparador no se ha aplicado.', descuadrados;
    END IF;

    -- La lista blanca, probada de verdad.
    --
    -- En el editor SQL no hay sesión, así que `auth.uid()` es NULL y la
    -- función tiene que negarse. El resultado se anota en una VARIABLE y se
    -- comprueba FUERA del bloque: lanzar la excepción dentro no serviría de
    -- nada, porque `RAISE EXCEPTION` usa el mismo SQLSTATE (P0001) que la
    -- excepción que estamos capturando y se la tragaría el propio EXCEPTION.
    BEGIN
        prueba := public.set_my_roles(ARRAY['admin','developer']);
    EXCEPTION
        WHEN sqlstate 'P0001' THEN sin_sesion := TRUE; -- 'Sin sesión.' — lo esperado.
    END;

    IF NOT sin_sesion THEN
        RAISE EXCEPTION 'set_my_roles ha respondido % SIN sesión. Tenía que haberse negado.', prueba;
    END IF;

    RAISE NOTICE 'Roles múltiples listos. Reparto actual:';
END $$;

SELECT unnest(roles) AS rol, count(*) AS personas
  FROM public.profiles
 GROUP BY 1
 ORDER BY 2 DESC;

NOTIFY pgrst, 'reload schema';
