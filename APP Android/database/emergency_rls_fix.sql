-- =====================================================
-- EMERGENCY RLS FIX FOR PROFILES TABLE
-- =====================================================
-- Run this if profile updates are failing
-- =====================================================

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Escritura: Propio o Coach" ON profiles;

-- Create new UPDATE policy (simple and strict)
CREATE POLICY "Users can update own profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Verify the policy was created
SELECT * FROM pg_policies 
WHERE tablename = 'profiles' 
AND policyname = 'Users can update own profile';

-- Test the policy (should return only your own profile)
SELECT id, email, name, nickname, role 
FROM profiles 
WHERE id = auth.uid();
