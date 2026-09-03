-- =====================================================
-- SUPABASE RLS POLICY: ADMIN PANEL CAPABILITIES
-- =====================================================
-- Description: Permite a los administradores actualizar perfiles de cualquier usuario (dar de alta/baja, cambiar rol, asignar entrenadores/nutricionistas).
-- Security: Solo aplica a usuarios autenticados cuyo email sea uno de los definidos como admin.
-- =====================================================

-- 1. Política para permitir a los administradores ACTUALIZAR (UPDATE) cualquier perfil
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

CREATE POLICY "Admins can update all profiles"
ON profiles
FOR UPDATE
TO authenticated
USING (
   auth.jwt() ->> 'email' IN ('anvilstrengthclub@gmail.com', 'anvilstrengthdata@gmail.com')
)
WITH CHECK (
   auth.jwt() ->> 'email' IN ('anvilstrengthclub@gmail.com', 'anvilstrengthdata@gmail.com')
);

-- 2. Política para permitir a los administradores VER (SELECT) todos los perfiles
-- (Por precaución, aseguramos que siempre puedan listar todos los usuarios, ignorando las restricciones de solo "ver a ti mismo o a tus atletas")
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Admins can view all profiles"
ON profiles
FOR SELECT
TO authenticated
USING (
   auth.jwt() ->> 'email' IN ('anvilstrengthclub@gmail.com', 'anvilstrengthdata@gmail.com')
);
