-- =====================================================
-- FORCE DELETE COMMENTS TABLE
-- =====================================================
-- Execute this separately to force delete the comments table

-- Step 1: Disable RLS first (in case it's blocking)
ALTER TABLE IF EXISTS comments DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop all policies
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'comments')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON comments';
    END LOOP;
END $$;

-- Step 3: Drop all triggers
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'comments')
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON comments CASCADE';
    END LOOP;
END $$;

-- Step 4: Force drop the table
DROP TABLE IF EXISTS comments CASCADE;

-- Step 5: Also drop posts table if it exists
DROP TABLE IF EXISTS posts CASCADE;

-- Step 6: Verify tables are gone
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('comments', 'posts');

-- If the query above returns empty, tables are successfully deleted!

-- =====================================================
-- Alternative: If the table still exists, use this
-- =====================================================
-- This will forcefully delete all data then drop the table

-- DELETE FROM comments;
-- DROP TABLE comments CASCADE;
