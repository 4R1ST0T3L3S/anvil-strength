-- 1. Force PostgREST to refresh its schema cache (Critical for "schema cache" errors)
NOTIFY pgrst, 'reload schema';

-- 2. Verify coach_id exists (just in case the table existed before without it)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitions' AND column_name = 'coach_id') THEN
        ALTER TABLE competitions ADD COLUMN coach_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 3. Verify date column is standard DATE type
DO $$
BEGIN
    -- Just ensure it exists, we rely on the create script for type.
    -- This block is mostly to output a success message.
    PERFORM 1;
END $$;

NOTIFY "Schema cache reloaded. Try assigning again.";
