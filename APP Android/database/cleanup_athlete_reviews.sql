-- =====================================================
-- DELETE ALL ATHLETE REVIEWS (Test Data Cleanup)
-- =====================================================
-- Use this to delete all test reviews from athlete_reviews table

-- =====================================================
-- METHOD 1: Delete ALL reviews (recommended for cleanup)
-- =====================================================

-- View all reviews before deleting
SELECT 
    id,
    athlete_name,
    rating,
    review_text,
    created_at
FROM athlete_reviews
ORDER BY created_at DESC;

-- Delete ALL reviews from the table
DELETE FROM athlete_reviews;

-- Verify deletion (should return 0)
SELECT COUNT(*) as remaining_reviews FROM athlete_reviews;

-- =====================================================
-- METHOD 2: Delete specific user's reviews
-- =====================================================
-- If you only want to delete reviews from specific users

-- First, find the user_id of reviews to delete
SELECT 
    user_id,
    athlete_name,
    COUNT(*) as review_count
FROM athlete_reviews
GROUP BY user_id, athlete_name
ORDER BY created_at DESC;

-- Then delete reviews from a specific user
-- DELETE FROM athlete_reviews WHERE user_id = 'USER_UUID_HERE';

-- =====================================================
-- METHOD 3: Delete reviews by name (if you know the names)
-- =====================================================
-- Delete specific reviews by athlete_name

-- DELETE FROM athlete_reviews WHERE athlete_name IN ('Pau', 'Ruben Castro', 'Marc Alonso Pascual');

-- =====================================================
-- METHOD 4: Keep only recent reviews (delete old ones)
-- =====================================================
-- If you want to keep some and delete others based on date

-- Delete reviews older than a specific date
-- DELETE FROM athlete_reviews WHERE created_at < '2026-01-30';

-- =====================================================
-- VERIFICATION
-- =====================================================
-- After deletion, verify the table is clean:

SELECT COUNT(*) as total_reviews FROM athlete_reviews;
SELECT * FROM athlete_reviews ORDER BY created_at DESC;

-- =====================================================
-- RESET AUTO-INCREMENT (Optional)
-- =====================================================
-- If you want to reset the sequence for IDs (PostgreSQL uses sequences)
-- This is optional and only needed if you want IDs to start from 1 again

-- Note: athlete_reviews uses UUID, not auto-increment, so this is not needed

-- =====================================================
-- NOTES
-- =====================================================
-- This script targets the athlete_reviews table (the new reviews system)
-- NOT the old comments table from the deprecated blog
-- Execute in Supabase SQL Editor with admin privileges
