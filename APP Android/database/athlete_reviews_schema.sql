-- ================================================
-- ATHLETE REVIEWS SYSTEM - Database Schema
-- ================================================
-- Created: 2026-01-29
-- Purpose: Allow authenticated athletes to leave reviews with ratings

-- Create athlete_reviews table
CREATE TABLE IF NOT EXISTS athlete_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NOT NULL CHECK (length(review_text) >= 10 AND length(review_text) <= 1000),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_athlete_reviews_user_id ON athlete_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_athlete_reviews_created_at ON athlete_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athlete_reviews_rating ON athlete_reviews(rating);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_athlete_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER athlete_reviews_updated_at
  BEFORE UPDATE ON athlete_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_athlete_reviews_updated_at();

-- ================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================

-- Enable RLS
ALTER TABLE athlete_reviews ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can VIEW reviews (public read)
CREATE POLICY "Anyone can view reviews"
  ON athlete_reviews
  FOR SELECT
  USING (TRUE);

-- Policy 2: Only authenticated users can INSERT reviews
CREATE POLICY "Authenticated users can create reviews"
  ON athlete_reviews
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can UPDATE their own reviews only
CREATE POLICY "Users can update own reviews"
  ON athlete_reviews
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 4: Users can DELETE their own reviews only
CREATE POLICY "Users can delete own reviews"
  ON athlete_reviews
  FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================
-- VERIFICATION QUERIES
-- ================================================

-- View all reviews (should work for everyone)
-- SELECT * FROM athlete_reviews ORDER BY created_at DESC;

-- Count reviews by rating
-- SELECT rating, COUNT(*) as count FROM athlete_reviews GROUP BY rating ORDER BY rating DESC;

-- Average rating
-- SELECT AVG(rating)::NUMERIC(10,1) as average_rating FROM athlete_reviews;

-- ================================================
-- NOTES
-- ================================================
-- 1. user_id references auth.users - ensures only valid users can review
-- 2. rating is constrained between 1-5 stars
-- 3. review_text must be 10-1000 characters
-- 4. RLS ensures public can read, but only auth users can write
-- 5. Cascade delete: if user is deleted, their reviews are too
