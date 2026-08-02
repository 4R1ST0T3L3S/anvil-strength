-- =====================================================================
-- ANVIL STRENGTH — UN SOLO VÍNCULO ENTRE COACH Y ATLETA
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- EL PROBLEMA
--
-- La relación entrenador-atleta vive en DOS SITIOS:
--
--   · `profiles.coach_id` / `profiles.nutritionist_id`
--       Lo ÚNICO que escribe el panel de administración
--       (adminService.updateUserCoach) y lo único que se toca al asignar a
--       mano desde Supabase. De aquí salen el nombre, el color y el logo
--       del entrenador que ve el atleta en su panel.
--
--   · `coach_athletes`
--       De aquí leen SIETE pantallas: la lista de atletas del coach, el
--       panel de atención, el inicio, el chat, la asignación de
--       competiciones y el duplicado de bloques.
--
-- Y NADIE ESCRIBÍA LA SEGUNDA. Ni una línea en toda la aplicación.
--
-- Resultado: asignar un atleta rellenaba `profiles.coach_id`, así que el
-- ATLETA veía a su entrenador... y el ENTRENADOR no veía al atleta por
-- ninguna parte. Ni en su lista, ni en el chat, ni para programarle.
--
-- LA SOLUCIÓN
--
-- 1. Rellenar `coach_athletes` con todos los vínculos que ya existen.
-- 2. Un disparador que lo mantenga sincronizado a partir de ahora.
--
-- El disparador va en la BASE DE DATOS y no en el código del front a
-- propósito: así el vínculo también se crea cuando alguien asigna un atleta
-- a mano desde el panel de Supabase, que es exactamente como se ha venido
-- haciendo hasta hoy. Arreglarlo solo en el front dejaría el mismo agujero
-- abierto para el camino por el que llegó el problema.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0a. Columnas que el resto del fichero da por hechas
-- ---------------------------------------------------------------------
-- `profiles.nutritionist_id` la lee y la escribe la aplicación
-- (adminService.updateUserNutritionist, useUser), pero NO consta que se
-- creara nunca en un script: database/SECURITY_HARDENING.sql avisa de que
-- "solo aparece en un comentario". Si ya existe, esto no hace nada; si no,
-- evita que el disparador de más abajo falle con "column does not exist".
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS nutritionist_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;


-- ---------------------------------------------------------------------
-- 0b. La restricción de unicidad, que el resto da por hecha
-- ---------------------------------------------------------------------
-- `ON CONFLICT (coach_id, athlete_id)` necesita un índice único. Si el
-- despliegue perdió el UNIQUE original, esto lo repone. Antes hay que
-- limpiar los duplicados o la creación del índice falla.
DELETE FROM public.coach_athletes a
USING public.coach_athletes b
WHERE a.ctid < b.ctid
  AND a.coach_id = b.coach_id
  AND a.athlete_id = b.athlete_id;

CREATE UNIQUE INDEX IF NOT EXISTS coach_athletes_pair_idx
    ON public.coach_athletes (coach_id, athlete_id);


-- ---------------------------------------------------------------------
-- 1. RELLENAR LO QUE YA EXISTE
-- ---------------------------------------------------------------------
-- Todo atleta que tenga un entrenador asignado en su perfil pero al que le
-- falte la fila de vínculo. Es el arreglo retroactivo: sin esto, los
-- atletas dados de alta hasta hoy seguirían siendo invisibles para su coach.
INSERT INTO public.coach_athletes (coach_id, athlete_id)
SELECT p.coach_id, p.id
FROM public.profiles p
WHERE p.coach_id IS NOT NULL
  AND p.coach_id <> p.id
ON CONFLICT (coach_id, athlete_id) DO NOTHING;

-- Lo mismo para los nutricionistas: su lista de atletas sale de la misma
-- tabla, así que tenían el mismo problema.
INSERT INTO public.coach_athletes (coach_id, athlete_id)
SELECT p.nutritionist_id, p.id
FROM public.profiles p
WHERE p.nutritionist_id IS NOT NULL
  AND p.nutritionist_id <> p.id
ON CONFLICT (coach_id, athlete_id) DO NOTHING;

DO $$
DECLARE
    total INT;
BEGIN
    SELECT count(*) INTO total FROM public.coach_athletes;
    RAISE NOTICE 'Vínculos coach-atleta tras el relleno: %', total;
END $$;


-- ---------------------------------------------------------------------
-- 2. QUE NO SE VUELVA A DESCUADRAR
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_coach_athlete_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- En un INSERT, `OLD` no está asignado y leer `OLD.coach_id` aborta con
    -- "record old is not assigned yet". Se vuelca a variables una sola vez,
    -- protegido por TG_OP, y el resto del cuerpo ya no toca `OLD`.
    coach_anterior UUID := NULL;
    nutri_anterior UUID := NULL;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        coach_anterior := OLD.coach_id;
        nutri_anterior := OLD.nutritionist_id;
    END IF;

    -- --- ENTRENADOR ---------------------------------------------------
    IF NEW.coach_id IS DISTINCT FROM coach_anterior THEN
        -- Al cambiar de entrenador se retira el vínculo del anterior. Si no,
        -- el coach viejo seguiría viendo al atleta en su lista, en su chat y
        -- en su panel de atención después de habérselo pasado a otro.
        IF coach_anterior IS NOT NULL THEN
            DELETE FROM public.coach_athletes
            WHERE coach_id = coach_anterior AND athlete_id = NEW.id;
        END IF;

        IF NEW.coach_id IS NOT NULL AND NEW.coach_id <> NEW.id THEN
            INSERT INTO public.coach_athletes (coach_id, athlete_id)
            VALUES (NEW.coach_id, NEW.id)
            ON CONFLICT (coach_id, athlete_id) DO NOTHING;
        END IF;
    END IF;

    -- --- NUTRICIONISTA ------------------------------------------------
    IF NEW.nutritionist_id IS DISTINCT FROM nutri_anterior THEN
        IF nutri_anterior IS NOT NULL THEN
            DELETE FROM public.coach_athletes
            WHERE coach_id = nutri_anterior AND athlete_id = NEW.id;
        END IF;

        IF NEW.nutritionist_id IS NOT NULL AND NEW.nutritionist_id <> NEW.id THEN
            INSERT INTO public.coach_athletes (coach_id, athlete_id)
            VALUES (NEW.nutritionist_id, NEW.id)
            ON CONFLICT (coach_id, athlete_id) DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_coach_athlete_trg ON public.profiles;
CREATE TRIGGER profiles_sync_coach_athlete_trg
    AFTER INSERT OR UPDATE OF coach_id, nutritionist_id ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_coach_athlete_link();


-- ---------------------------------------------------------------------
-- 3. EL CAMINO INVERSO
-- ---------------------------------------------------------------------
-- El canje de una invitación escribe en `coach_athletes` directamente (ver
-- database/coach_invites.sql). Este disparador cierra el círculo: rellena
-- también el perfil, que es de donde el atleta saca el nombre y la marca de
-- su entrenador. Sin él, quien entrara por invitación aparecería en la lista
-- del coach pero vería "sin entrenador" en su propio panel.
CREATE OR REPLACE FUNCTION public.sync_profile_from_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rol TEXT;
BEGIN
    SELECT role INTO rol FROM public.profiles WHERE id = NEW.coach_id;

    IF rol = 'nutritionist' THEN
        UPDATE public.profiles
        SET nutritionist_id = NEW.coach_id
        WHERE id = NEW.athlete_id AND nutritionist_id IS DISTINCT FROM NEW.coach_id;
    ELSE
        UPDATE public.profiles
        SET coach_id = NEW.coach_id
        WHERE id = NEW.athlete_id AND coach_id IS DISTINCT FROM NEW.coach_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_athletes_sync_profile_trg ON public.coach_athletes;
CREATE TRIGGER coach_athletes_sync_profile_trg
    AFTER INSERT ON public.coach_athletes
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_from_link();


-- ---------------------------------------------------------------------
-- 3b. SACAR A UN ATLETA DEL EQUIPO
-- ---------------------------------------------------------------------
-- Cuando el coach elimina el vínculo, hay que limpiar también el perfil del
-- atleta. Y NO PUEDE HACERLO ÉL:
--
--   · `coach_athletes` tiene política de DELETE para el coach
--     (`coach_id = auth.uid()`), así que borrar el vínculo sí puede.
--   · `profiles` solo tiene `profiles_update_self` (`id = auth.uid()`), así
--     que escribir en el perfil de OTRO no. Y PostgREST no devuelve un error
--     cuando la RLS filtra un UPDATE: devuelve cero filas. El coach vería
--     "sacado del equipo" y el atleta seguiría viéndolo como su entrenador.
--
-- La alternativa sería dar al coach permiso de UPDATE sobre los perfiles de
-- sus atletas, pero eso le abriría el perfil ENTERO —marcas, categoría,
-- biografía, acceso— para arreglar un solo campo. El disparador hace
-- exactamente lo que hace falta y nada más.
CREATE OR REPLACE FUNCTION public.clear_profile_on_unlink()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Solo si el perfil apuntaba a ESTE coach. Si entretanto lo hubiera
    -- cogido otro, limpiarlo dejaría al atleta sin entrenador por una acción
    -- que no iba con él.
    UPDATE public.profiles
    SET coach_id = NULL
    WHERE id = OLD.athlete_id AND coach_id = OLD.coach_id;

    UPDATE public.profiles
    SET nutritionist_id = NULL
    WHERE id = OLD.athlete_id AND nutritionist_id = OLD.coach_id;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS coach_athletes_clear_profile_trg ON public.coach_athletes;
CREATE TRIGGER coach_athletes_clear_profile_trg
    AFTER DELETE ON public.coach_athletes
    FOR EACH ROW
    EXECUTE FUNCTION public.clear_profile_on_unlink();

-- NOTA SOBRE LA RECURSIÓN ENTRE LOS DOS DISPARADORES
--
-- El de arriba escribe en `profiles`, lo que dispara el primero, que escribe
-- en `coach_athletes`, que dispararía el segundo otra vez. El bucle se corta
-- solo porque los dos comprueban `IS DISTINCT FROM` antes de escribir: en la
-- segunda vuelta el valor ya coincide, el UPDATE no afecta a ninguna fila y
-- el INSERT cae en `DO NOTHING`. Es decir, dos vueltas como mucho.


-- ---------------------------------------------------------------------
-- 4. COMPROBACIÓN
-- ---------------------------------------------------------------------
-- Si esto devuelve filas, quedan vínculos descuadrados y hay que mirarlo.
DO $$
DECLARE
    huerfanos INT;
BEGIN
    SELECT count(*) INTO huerfanos
    FROM public.profiles p
    WHERE p.coach_id IS NOT NULL
      AND p.coach_id <> p.id
      AND NOT EXISTS (
          SELECT 1 FROM public.coach_athletes ca
          WHERE ca.coach_id = p.coach_id AND ca.athlete_id = p.id
      );

    IF huerfanos > 0 THEN
        RAISE WARNING 'Todavía hay % perfiles con entrenador pero sin vínculo.', huerfanos;
    ELSE
        RAISE NOTICE 'Todos los vínculos cuadran en los dos sentidos.';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
