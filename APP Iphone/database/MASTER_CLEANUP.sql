-- =====================================================
-- ANVIL STRENGTH - MASTER CLEANUP SCRIPT
-- =====================================================
-- Execute this ENTIRE script in Supabase SQL Editor
-- This will clean up all test data and ensure database is production-ready
-- =====================================================

-- =====================================================
-- STEP 1: Clean up test athlete reviews
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== STEP 1: Cleaning athlete reviews ===';
END $$;

-- Delete all test reviews
DELETE FROM athlete_reviews;

-- Verify deletion
DO $$
DECLARE
    review_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO review_count FROM athlete_reviews;
    RAISE NOTICE 'Athlete reviews remaining: %', review_count;
END $$;

-- =====================================================
-- STEP 2: Remove old blog comments table
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== STEP 2: Removing old blog tables ===';
END $$;

-- Disable RLS on comments if exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'comments') THEN
        ALTER TABLE comments DISABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'Disabled RLS on comments table';
    END IF;
END $$;

-- Drop all policies on comments
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'comments')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON comments CASCADE';
        RAISE NOTICE 'Dropped policy: %', r.policyname;
    END LOOP;
END $$;

-- Drop the comments table
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS posts CASCADE;

-- Verify deletion
DO $$
DECLARE
    table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'comments'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE 'WARNING: comments table still exists!';
    ELSE
        RAISE NOTICE 'SUCCESS: comments table removed';
    END IF;
END $$;

-- =====================================================
-- STEP 3: Verify all tables exist
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== STEP 3: Verifying database tables ===';
END $$;

SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('profiles', 'coach_athletes', 'training_plans', 'workouts', 
                           'exercises', 'competitions', 'athlete_reviews') 
        THEN '✓ REQUIRED'
        ELSE '⚠ EXTRA'
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- =====================================================
-- STEP 4: Verify RLS is enabled
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== STEP 4: Verifying RLS policies ===';
END $$;

SELECT 
    tablename,
    CASE 
        WHEN rowsecurity THEN '✓ ENABLED'
        ELSE '⚠ DISABLED'
    END as rls_status
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- =====================================================
-- STEP 5: Count records in all tables
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== STEP 5: Counting records ===';
END $$;

SELECT 
    'profiles' as table_name, 
    COUNT(*) as record_count 
FROM profiles
UNION ALL
SELECT 'coach_athletes', COUNT(*) FROM coach_athletes
UNION ALL
SELECT 'training_plans', COUNT(*) FROM training_plans
UNION ALL
SELECT 'workouts', COUNT(*) FROM workouts
UNION ALL
SELECT 'exercises', COUNT(*) FROM exercises
UNION ALL
SELECT 'competitions', COUNT(*) FROM competitions
UNION ALL
SELECT 'athlete_reviews', COUNT(*) FROM athlete_reviews
ORDER BY table_name;

-- =====================================================
-- STEP 6: Final verification
-- =====================================================
DO $$
DECLARE
    profiles_count INTEGER;
    reviews_count INTEGER;
    comments_exists BOOLEAN;
BEGIN
    RAISE NOTICE '=== STEP 6: Final verification ===';
    
    -- Count profiles
    SELECT COUNT(*) INTO profiles_count FROM profiles;
    RAISE NOTICE 'Total user profiles: %', profiles_count;
    
    -- Count reviews
    SELECT COUNT(*) INTO reviews_count FROM athlete_reviews;
    RAISE NOTICE 'Total athlete reviews: % (should be 0 after cleanup)', reviews_count;
    
    -- Check if comments table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'comments'
    ) INTO comments_exists;
    
    IF comments_exists THEN
        RAISE WARNING 'Old comments table still exists - manual cleanup may be needed';
    ELSE
        RAISE NOTICE '✓ Old comments table successfully removed';
    END IF;
    
    RAISE NOTICE '=== CLEANUP COMPLETE ===';
END $$;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DATABASE CLEANUP COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Verify the output above shows 0 athlete_reviews';
    RAISE NOTICE '2. Verify comments table is removed';
    RAISE NOTICE '3. Your database is now production-ready!';
    RAISE NOTICE '========================================';
END $$;
