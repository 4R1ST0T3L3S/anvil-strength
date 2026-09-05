-- Add week-based definition to training blocks
ALTER TABLE training_blocks 
ADD COLUMN IF NOT EXISTS start_week INTEGER,
ADD COLUMN IF NOT EXISTS end_week INTEGER;

-- Optional: You might want to keep start_date as a derived field or just nullable if you strictly switch to weeks.
-- ALTER TABLE training_blocks ALTER COLUMN start_date DROP NOT NULL;
