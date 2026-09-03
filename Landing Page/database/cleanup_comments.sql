-- =====================================================
-- CLEANUP: Remove Blog Comments (ADMIN METHOD)
-- =====================================================
-- The blog section was replaced with Reviews system
-- This script uses admin privileges to delete comments

-- =====================================================
-- METHOD 1: Delete ALL comments (simplest approach)
-- =====================================================
-- This bypasses RLS by using a transaction with admin role
-- Execute this in Supabase SQL Editor (it runs as postgres/admin user)

-- First, let's see what comments exist:
SELECT 
    id,
    user_id,
    author,
    content,
    created_at
FROM comments
ORDER BY created_at DESC;

-- To delete ALL comments from the table:
-- TRUNCATE TABLE comments CASCADE;

-- Or delete all row by row:
-- DELETE FROM comments;

-- =====================================================
-- METHOD 2: Delete specific user's last 3 comments
-- =====================================================
-- First find the user_id with duplicates:
SELECT 
    user_id,
    author,
    COUNT(*) as comment_count
FROM comments
GROUP BY user_id, author
HAVING COUNT(*) > 1
ORDER BY comment_count DESC;

-- Once you have the user_id, delete their last 3 comments:
-- Replace 'USER_ID_HERE' with the actual UUID from the query above

WITH user_recent_comments AS (
    SELECT id, user_id, author, created_at
    FROM comments
    WHERE user_id = 'REPLACE_WITH_USER_ID'  -- ⚠️ PASTE USER UUID HERE
    ORDER BY created_at DESC
    LIMIT 3
)
SELECT * FROM user_recent_comments;  -- Preview before deleting

-- After verifying the preview, execute the DELETE:
/*
WITH user_recent_comments AS (
    SELECT id
    FROM comments
    WHERE user_id = 'REPLACE_WITH_USER_ID'  -- ⚠️ SAME USER ID
    ORDER BY created_at DESC
    LIMIT 3
)
DELETE FROM comments
WHERE id IN (SELECT id FROM user_recent_comments);
*/

-- =====================================================
-- METHOD 3: Temporarily disable RLS to delete
-- =====================================================
-- If the above doesn't work due to RLS policies:

-- Disable RLS temporarily (ADMIN ONLY):
-- ALTER TABLE comments DISABLE ROW LEVEL SECURITY;

-- Delete the comments:
-- DELETE FROM comments WHERE user_id = 'REPLACE_WITH_USER_ID';

-- Re-enable RLS:
-- ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- METHOD 4: Drop the entire table (if blog is deprecated)
-- =====================================================
-- Since blog section is no longer used, you can remove it entirely:

-- DROP TABLE IF EXISTS comments CASCADE;

-- =====================================================
-- RECOMMENDED APPROACH
-- =====================================================
-- 1. Execute Method 1 to see all comments
-- 2. Use Method 2 to identify and delete specific duplicates
-- 3. If all else fails, use Method 3 (disable RLS temporarily)
-- 4. If blog is completely unused, use Method 4 to drop the table

-- =====================================================
-- VERIFICATION
-- =====================================================
-- After deletion, verify:
-- SELECT COUNT(*) FROM comments;
