-- Add end_date column to competitions table
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS end_date DATE;
en 