-- =====================================================
-- DELETE ALL TEST REVIEWS - SIMPLE VERSION
-- =====================================================
-- This script ONLY deletes the test reviews
-- The reviews section will remain, but will be empty
-- =====================================================

-- View all reviews before deleting (optional - you can skip this)
SELECT 
    id,
    athlete_name as "Name",
    rating as "Stars",
    LEFT(review_text, 50) as "Review Preview",
    created_at::date as "Date"
FROM athlete_reviews
ORDER BY created_at DESC;

-- PAUSE HERE and verify these are the reviews you want to delete
-- If yes, continue to the next command

-- =====================================================
-- DELETE ALL REVIEWS
-- =====================================================
DELETE FROM athlete_reviews;

-- =====================================================
-- VERIFY DELETION
-- =====================================================
SELECT 
    COUNT(*) as "Total Reviews Remaining",
    CASE 
        WHEN COUNT(*) = 0 THEN '✓ SUCCESS - All reviews deleted'
        ELSE '⚠ WARNING - Some reviews still exist'
    END as "Status"
FROM athlete_reviews;

-- =====================================================
-- DONE!
-- =====================================================
-- The reviews section is now empty and ready for real reviews
-- Users can still submit new reviews
