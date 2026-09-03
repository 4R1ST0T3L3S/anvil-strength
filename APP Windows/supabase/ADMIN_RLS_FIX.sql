-- =====================================================
-- ANVIL STRENGTH - ADMIN RLS FIX
-- Este script otorga permisos a los administradores para ver y editar 
-- a todos los usuarios (atletas, entrenadores, nutricionistas) en el panel.
-- =====================================================

-- Eliminamos la política si ya existiera para evitar errores
DROP POLICY IF EXISTS "Admins have full access to profiles" ON profiles;

-- Creamos la política que permite a los correos de administración hacer SELECT, INSERT, UPDATE y DELETE
CREATE POLICY "Admins have full access to profiles" ON profiles 
FOR ALL TO authenticated 
USING (
  (auth.jwt() ->> 'email') IN ('anvilstrengthclub@gmail.com', 'anvilstrengthdata@gmail.com')
) 
WITH CHECK (
  (auth.jwt() ->> 'email') IN ('anvilstrengthclub@gmail.com', 'anvilstrengthdata@gmail.com')
);

-- NOTA: Al ejecutar esto, el panel de administración podrá hacer loadUsers() 
-- y ver absolutamente a todos, y podrá guardar cambios sin que salte el error de RLS.
