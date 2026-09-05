-- =====================================================================
-- ANVIL STRENGTH — ANULACIÓN DE CLASIFICACIÓN MUSCULAR (F3)
-- =====================================================================
-- El motor de volumen (src/lib/volume/muscles.ts) clasifica los ejercicios
-- por patrones sobre su nombre. Funciona para texto libre, que es lo que
-- escribe el coach, pero a veces se equivoca o el coach discrepa.
--
-- Estas columnas permiten fijar la clasificación de un ejercicio concreto.
-- Si `primary_muscles` viene informada, MANDA sobre las reglas por patrón.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- =====================================================================

ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS primary_muscles   TEXT[];
ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS secondary_muscles TEXT[];

COMMENT ON COLUMN exercise_library.primary_muscles IS
    'Músculos motores. Cada serie cuenta 1.0 para estos. NULL = usar las reglas por patrón del cliente.';
COMMENT ON COLUMN exercise_library.secondary_muscles IS
    'Sinergistas. Cada serie cuenta 0.5 (INDIRECT_FACTOR).';

-- Valores admitidos. Deben coincidir EXACTAMENTE con MUSCLE_GROUPS de
-- src/lib/volume/muscles.ts; el cliente descarta en silencio lo que no
-- reconozca, así que una falta de ortografía aquí se traduce en volumen
-- que desaparece del reparto sin avisar.
--
--   Cuádriceps · Isquiosurales · Glúteo · Aductores · Gemelo · Erectores
--   Dorsal · Espalda alta · Trapecio · Pecho · Hombro anterior
--   Hombro lateral · Hombro posterior · Tríceps · Bíceps · Antebrazo · Core
--
-- Restricción que impide guardar un grupo inexistente.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercise_library_muscles_valid') THEN
        ALTER TABLE exercise_library ADD CONSTRAINT exercise_library_muscles_valid CHECK (
            (primary_muscles IS NULL OR primary_muscles <@ ARRAY[
                'Cuádriceps','Isquiosurales','Glúteo','Aductores','Gemelo','Erectores',
                'Dorsal','Espalda alta','Trapecio','Pecho','Hombro anterior',
                'Hombro lateral','Hombro posterior','Tríceps','Bíceps','Antebrazo','Core'
            ]::TEXT[])
            AND
            (secondary_muscles IS NULL OR secondary_muscles <@ ARRAY[
                'Cuádriceps','Isquiosurales','Glúteo','Aductores','Gemelo','Erectores',
                'Dorsal','Espalda alta','Trapecio','Pecho','Hombro anterior',
                'Hombro lateral','Hombro posterior','Tríceps','Bíceps','Antebrazo','Core'
            ]::TEXT[])
        );
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- Ejemplo de uso (comentado). Descomenta y adapta si quieres fijar alguno.
-- ---------------------------------------------------------------------
-- UPDATE exercise_library
--    SET primary_muscles   = ARRAY['Glúteo','Cuádriceps','Aductores'],
--        secondary_muscles = ARRAY['Erectores','Dorsal','Trapecio','Antebrazo']
--  WHERE LOWER(name) = 'peso muerto sumo';

-- ---------------------------------------------------------------------
-- Comprobación: qué ejercicios de la biblioteca tienen anulación.
-- ---------------------------------------------------------------------
SELECT name, primary_muscles, secondary_muscles
  FROM exercise_library
 WHERE primary_muscles IS NOT NULL
 ORDER BY name;
