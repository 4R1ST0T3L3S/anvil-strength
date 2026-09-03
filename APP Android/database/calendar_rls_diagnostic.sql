-- =====================================================
-- CALENDAR/EVENTS TABLE - RLS DIAGNOSTIC & FIX
-- =====================================================
-- Execute this in Supabase SQL Editor to diagnose and fix calendar access issues
-- =====================================================

-- STEP 1: Check if competitions table exists
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'competitions';

-- STEP 2: Check current RLS policies on competitions table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'competitions';

-- STEP 3: Check if RLS is enabled
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'competitions';

-- =====================================================
-- FIX: Drop all existing policies and recreate clean ones
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "View all competitions" ON competitions;
DROP POLICY IF EXISTS "View competitions" ON competitions;
DROP POLICY IF EXISTS "Athletes can create competitions" ON competitions;
DROP POLICY IF EXISTS "Athletes can update competitions" ON competitions;
DROP POLICY IF EXISTS "Athletes can delete competitions" ON competitions;
DROP POLICY IF EXISTS "Coaches can create competitions" ON competitions;
DROP POLICY IF EXISTS "Coaches can update competitions" ON competitions;
DROP POLICY IF EXISTS "Coaches can delete competitions" ON competitions;

-- Enable RLS (if not already enabled)
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- NEW POLICIES (Following requested requirements)
-- =====================================================

-- SELECT: ALL authenticated users can read ALL competitions
CREATE POLICY "All users can view competitions"
ON competitions FOR SELECT
TO authenticated
USING (TRUE);  -- No restrictions - everyone can see all events

-- INSERT: ONLY coaches can create competitions
CREATE POLICY "Only coaches can create competitions"
ON competitions FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'coach'
    )
);

-- UPDATE: ONLY coaches can update competitions
CREATE POLICY "Only coaches can update competitions"
ON competitions FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'coach'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'coach'
    )
);

-- DELETE: ONLY coaches can delete competitions
CREATE POLICY "Only coaches can delete competitions"
ON competitions FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'coach'
    )
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify new policies were created
SELECT 
    policyname,
    cmd as operation,
    CASE 
        WHEN cmd = 'SELECT' THEN 'All authenticated users'
        WHEN cmd IN ('INSERT', 'UPDATE', 'DELETE') THEN 'Coaches only'
    END as allowed_users
FROM pg_policies 
WHERE tablename = 'competitions'
ORDER BY cmd;

-- Test SELECT permission (should return all competitions for any authenticated user)
SELECT id, name, date, location, status 
FROM competitions 
ORDER BY date DESC
LIMIT 5;

-- =====================================================
-- OPTIONAL: Create sample competition event
-- =====================================================
-- Uncomment the following to create a test event:

/*
INSERT INTO competitions (
    name,
    date,
    location,
    federation,
    status
) VALUES (
    'Test Event - Campeonato Regional',
    CURRENT_DATE + INTERVAL '30 days',
    'Madrid',
    'AEP',
    'upcoming'
);
*/

-- =====================================================
-- SUCCESS INDICATORS
-- =====================================================

-- You should see:
-- ✅ Table exists: 1 row returned from STEP 1
-- ✅ RLS enabled: rls_enabled = TRUE in STEP 3
-- ✅ 4 policies created: 1 SELECT (all users), 3 INSERT/UPDATE/DELETE (coaches only)
-- ✅ Verification query shows all 4 policies

-- =====================================================
-- TROUBLESHOOTING
-- =====================================================

-- If athletes still can't see competitions, check:

-- 1. User is authenticated
SELECT auth.uid() as current_user_id;

-- 2. User exists in profiles table
SELECT id, email, role FROM profiles WHERE id = auth.uid();

-- 3. Try direct query (should work for athletes)
SELECT COUNT(*) as total_competitions FROM competitions;

-- If this returns 0 rows but you should have data, the issue is data, not RLS.
-- If this returns ERROR, check if user is authenticated properly.

-- =====================================================
-- END OF DIAGNOSTIC SCRIPT
-- =====================================================
