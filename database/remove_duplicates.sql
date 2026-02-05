-- Identify and remove duplicate exercises, keeping the oldest entry (min ID)

DELETE FROM exercise_library
WHERE id NOT IN (
    SELECT MIN(id)
    FROM exercise_library
    GROUP BY name
);

-- Optional: If you want to strictly enforce unique names in the future
-- ALTER TABLE exercise_library ADD CONSTRAINT unique_exercise_name UNIQUE (name);
