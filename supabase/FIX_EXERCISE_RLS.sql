-- =====================================================
-- FIX RLS POLICY FOR EXERCISE LIBRARY
-- =====================================================
-- Description: Fixes the "new row violates row-level security policy" error.
-- The previous policy relied on JWT metadata which might be missing or out of sync.
-- This updated policy checks the 'profiles' table directly to verify if the user is a coach.

-- 1. Drop potential existing policies (covering various naming conventions used previously)
DROP POLICY IF EXISTS "Coach Write Exercises" ON exercise_library;
DROP POLICY IF EXISTS "Coaches write exercises" ON exercise_library;
DROP POLICY IF EXISTS "Coaches can create exercises" ON exercise_library;
DROP POLICY IF EXISTS "Coaches can update exercises" ON exercise_library;

-- 2. Create the robust policy
CREATE POLICY "Coach Write Exercises" ON exercise_library
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'coach'
    )
);

-- 3. Verify (Optional checking query)
SELECT * FROM pg_policies WHERE tablename = 'exercise_library';
