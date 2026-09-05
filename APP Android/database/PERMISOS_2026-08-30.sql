-- =====================================================================
-- ANVIL STRENGTH — PERMISOS CONFIGURABLES POR ROL
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere database/ROLES_MULTIPLES.sql ejecutado antes (usa tiene_rol()).
--
-- QUÉ RESUELVE
-- Hoy `src/lib/roles.ts` tiene el mapa rol -> capacidades ESCRITO EN EL
-- CÓDIGO (`CAPACIDADES`). Cambiarlo exige un despliegue. Esta migración
-- mueve ese mapa a una tabla, para que un desarrollador lo edite desde
-- Ajustes sin tocar código.
--
-- SOLO CUATRO ROLES SON CONFIGURABLES
-- `athlete`, `coach`, `nutritionist`, `member`. `developer` y `admin`
-- SIGUEN FUERA de esta tabla a propósito: son los roles de "acceso a todo,
-- no es un rol que se elija" (ver ROL_INFO en lib/roles.ts), y dejarlos
-- editables abriría la posibilidad de que un desarrollador se quitara a sí
-- mismo el acceso a esta misma pantalla. El cliente los sigue resolviendo
-- con la lista completa fija, sin consultar esta tabla.
--
-- QUIÉN PUEDE ESCRIBIR
-- Solo quien tiene el rol `developer` — es la decisión K/permisos cerrada
-- el 30 de agosto de 2026: ni `admin` ni nadie más gestiona esta pantalla.
-- Cualquier autenticado puede LEER: `puede()` se evalúa en el cliente de
-- CUALQUIER usuario para decidir qué pintar, así que todos necesitan poder
-- consultar la configuración vigente aunque solo developer pueda cambiarla.
--
-- DEGRADA CON ELEGANCIA
-- Sin ejecutar esto, `role_capabilities` no existe: el cliente detecta el
-- 404/PGRST205 y sigue con el mapa fijo de siempre (ver
-- `useCapabilityConfig.ts`), así que ningún panel se rompe. Lo único que
-- falta es la pantalla de Ajustes, que avisa de que hace falta la migración.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.role_capabilities (
    role TEXT NOT NULL CHECK (role IN ('athlete', 'coach', 'nutritionist', 'member')),
    capability TEXT NOT NULL CHECK (capability IN (
        'planificar_entrenamiento', 'pautar_nutricion', 'recibir_entrenamiento',
        'recibir_nutricion', 'gestionar_atletas', 'ver_trastienda', 'administrar',
        -- Las tres nuevas, pedidas el 30 de agosto de 2026.
        'ver_entrenamientos', 'designar_miembros', 'designar_entrenadores'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role, capability)
);

-- Semilla: EXACTAMENTE lo que hoy decide `CAPACIDADES` en lib/roles.ts.
-- Ejecutar esta migración no cambia el comportamiento de nadie hasta que un
-- desarrollador toque algo en Ajustes.
INSERT INTO public.role_capabilities (role, capability) VALUES
    ('athlete', 'recibir_entrenamiento'),
    ('athlete', 'recibir_nutricion'),
    ('coach', 'planificar_entrenamiento'),
    ('coach', 'gestionar_atletas'),
    ('coach', 'ver_entrenamientos'),
    ('nutritionist', 'pautar_nutricion'),
    ('nutritionist', 'gestionar_atletas'),
    ('member', 'recibir_entrenamiento'),
    ('member', 'recibir_nutricion')
ON CONFLICT (role, capability) DO NOTHING;

ALTER TABLE public.role_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_capabilities_select ON public.role_capabilities;
DROP POLICY IF EXISTS role_capabilities_write ON public.role_capabilities;

-- Lectura abierta a cualquier sesión: es lo que necesita `puede()` para
-- decidir qué pintarle a CUALQUIER usuario, no solo a developer.
CREATE POLICY role_capabilities_select ON public.role_capabilities
    FOR SELECT TO authenticated
    USING (TRUE);

-- Escritura solo developer. Una sola política PERMISSIVE para las tres
-- operaciones: no hace falta separarlas, el criterio es idéntico.
CREATE POLICY role_capabilities_write ON public.role_capabilities
    FOR ALL TO authenticated
    USING (public.tiene_rol('developer'))
    WITH CHECK (public.tiene_rol('developer'));

REVOKE ALL ON public.role_capabilities FROM anon;
GRANT SELECT ON public.role_capabilities TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.role_capabilities TO authenticated;


-- =====================================================================
-- REEMPLAZAR EL CONJUNTO DE UN ROL, ATÓMICAMENTE
-- =====================================================================
-- Un DELETE + INSERT sueltos desde el cliente son DOS viajes: entre uno y
-- otro, cualquiera que consulte ese rol vería "sin capacidades" un
-- instante. Poco probable con lo poco que se toca esta pantalla, pero
-- gratis de evitar metiéndolo en una función.
--
-- Comprueba el rol de desarrollador POR DENTRO, además de la RLS de la
-- tabla: es el mismo criterio de "cinturón y tirantes" que ya usa
-- set_my_roles() en ROLES_MULTIPLES.sql.
CREATE OR REPLACE FUNCTION public.replace_role_capabilities(
    p_role TEXT,
    p_capabilities TEXT[]
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    finales TEXT[];
BEGIN
    IF NOT public.tiene_rol('developer') THEN
        RAISE EXCEPTION 'Solo un desarrollador puede cambiar los permisos de un rol.';
    END IF;

    IF p_role NOT IN ('athlete', 'coach', 'nutritionist', 'member') THEN
        RAISE EXCEPTION '"%" no es un rol configurable. developer y admin no se editan aquí.', p_role;
    END IF;

    DELETE FROM public.role_capabilities WHERE role = p_role;

    INSERT INTO public.role_capabilities (role, capability)
    SELECT p_role, c FROM unnest(COALESCE(p_capabilities, ARRAY[]::TEXT[])) AS c
    ON CONFLICT (role, capability) DO NOTHING;

    SELECT COALESCE(array_agg(capability ORDER BY capability), ARRAY[]::TEXT[])
      INTO finales
      FROM public.role_capabilities WHERE role = p_role;

    RETURN finales;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_role_capabilities(TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_role_capabilities(TEXT, TEXT[]) TO authenticated;


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'permisos configurables' AS check, count(*) AS total
  FROM public.role_capabilities;
