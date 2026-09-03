-- Add 'level' column to competitions table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitions' AND column_name = 'level') THEN
        ALTER TABLE competitions ADD COLUMN level TEXT;
    END IF;
END $$;

NOTIFY "Added level column to competitions table.";
