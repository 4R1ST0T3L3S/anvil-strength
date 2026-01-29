-- =====================================================
-- CLEANUP: Remove Blog Comments (No Longer Used)
-- =====================================================
-- The blog section was replaced with Reviews system
-- This script cleans up the old comments table

-- Option 1: Delete all comments (if you want to remove everything)
-- DELETE FROM comments;

-- Option 2: Delete duplicate comments from a specific user
-- Find and delete the last 3 comments from a user
-- Replace 'USER_ID_HERE' with the actual user_id

-- To find user IDs and their recent comments:
SELECT 
    user_id,
    author,
    content,
    created_at,
    id
FROM comments
ORDER BY created_at DESC
LIMIT 20;

-- Once you identify the user_id, delete their last 3 comments:
/*
WITH user_comments AS (
    SELECT id
    FROM comments
    WHERE user_id = 'USER_ID_HERE'  -- Replace with actual UUID
    ORDER BY created_at DESC
    LIMIT 3
)
DELETE FROM comments
WHERE id IN (SELECT id FROM user_comments);
*/

-- =====================================================
-- Option 3: Drop the comments table entirely (if not needed)
-- =====================================================
-- WARNING: This will delete ALL comments permanently
-- Uncomment only if you're sure you want to remove the blog feature

-- DROP TABLE IF EXISTS comments CASCADE;

-- =====================================================
-- NOTES
-- =====================================================
-- 1. The blog section is no longer displayed (replaced by reviews)
-- 2. If you want to keep comments for future use, just delete the duplicates
-- 3. If blog is completely deprecated, drop the table to clean up the database
