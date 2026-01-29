-- =====================================================
-- SUPABASE RLS POLICY: PROFILE UPDATE
-- =====================================================
-- Description: Allow users to update their own profile
-- Security: Users can only UPDATE their own row (auth.uid() = id)
-- =====================================================

-- Drop existing policy if it exists (idempotent)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create UPDATE policy
CREATE POLICY "Users can update own profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Verify policy exists
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles' AND policyname = 'Users can update own profile';
