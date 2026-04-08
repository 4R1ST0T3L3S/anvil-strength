-- 1. Ensure level and end_date columns exist in case they were never added
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS level TEXT;

-- 2. Permitir que coach_id sea opcional (NULL)
ALTER TABLE competitions ALTER COLUMN coach_id DROP NOT NULL;

-- 3. Eliminar la posible política antigua de atletas para evitar conflictos
DROP POLICY IF EXISTS "Athlete Manage Own Competitions" ON competitions;
DROP POLICY IF EXISTS "Athlete Read Competitions" ON competitions;

-- 4. Crear nueva política explicita (Con WITH CHECK para asegurar los INSERTS)
CREATE POLICY "Athlete Manage Own Competitions" ON competitions
FOR ALL USING (
    auth.uid() = athlete_id
) WITH CHECK (
    auth.uid() = athlete_id
);

NOTIFY "Full foolproof self-assignment SQL executed!";
