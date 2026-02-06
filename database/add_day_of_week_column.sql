-- Add day_of_week column to training_sessions
ALTER TABLE training_sessions 
ADD COLUMN day_of_week TEXT CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'));

COMMENT ON COLUMN training_sessions.day_of_week IS 'Day of the week valid for this session (monday, tuesday, etc.)';
