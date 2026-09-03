-- Fix for Training Sessions Schema
-- Adds missing 'week_number' column required by the Workout Builder

ALTER TABLE training_sessions 
ADD COLUMN IF NOT EXISTS week_number INTEGER NOT NULL DEFAULT 1;

-- Optional: Update existing sessions if valid logic exists, defaulting to 1 is safe for now.
