-- =============================================
-- PR UPDATE NOTIFICATION TRIGGER
-- Automatically notifies all athletes when someone updates their PR
-- =============================================

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_pr_update()
RETURNS TRIGGER AS $$
DECLARE
    athlete RECORD;
    pr_type TEXT;
    pr_value NUMERIC;
    athlete_name TEXT;
BEGIN
    -- Only proceed if the profile is an athlete and PRs actually changed
    IF NEW.role = 'athlete' THEN
        
        -- Get the athlete's display name
        athlete_name := COALESCE(NEW.full_name, 'Un atleta');
        
        -- Check Squat PR change
        IF COALESCE(NEW.squat_pr, 0) > COALESCE(OLD.squat_pr, 0) THEN
            pr_type := 'Sentadilla';
            pr_value := NEW.squat_pr;
            
            -- Insert notification for all OTHER athletes
            INSERT INTO public.notifications (user_id, title, message, is_read, created_at)
            SELECT 
                p.id,
                '🏋️ Nuevo PR en el Club!',
                athlete_name || ' ha registrado ' || pr_value || 'kg en ' || pr_type,
                false,
                NOW()
            FROM public.profiles p
            WHERE p.role = 'athlete' 
              AND p.id != NEW.id;
        END IF;
        
        -- Check Bench PR change
        IF COALESCE(NEW.bench_pr, 0) > COALESCE(OLD.bench_pr, 0) THEN
            pr_type := 'Press Banca';
            pr_value := NEW.bench_pr;
            
            INSERT INTO public.notifications (user_id, title, message, is_read, created_at)
            SELECT 
                p.id,
                '🏋️ Nuevo PR en el Club!',
                athlete_name || ' ha registrado ' || pr_value || 'kg en ' || pr_type,
                false,
                NOW()
            FROM public.profiles p
            WHERE p.role = 'athlete' 
              AND p.id != NEW.id;
        END IF;
        
        -- Check Deadlift PR change
        IF COALESCE(NEW.deadlift_pr, 0) > COALESCE(OLD.deadlift_pr, 0) THEN
            pr_type := 'Peso Muerto';
            pr_value := NEW.deadlift_pr;
            
            INSERT INTO public.notifications (user_id, title, message, is_read, created_at)
            SELECT 
                p.id,
                '🏋️ Nuevo PR en el Club!',
                athlete_name || ' ha registrado ' || pr_value || 'kg en ' || pr_type,
                false,
                NOW()
            FROM public.profiles p
            WHERE p.role = 'athlete' 
              AND p.id != NEW.id;
        END IF;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop existing trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS on_pr_update ON public.profiles;

-- 3. Create the trigger
CREATE TRIGGER on_pr_update
    AFTER UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_pr_update();

-- =============================================
-- USAGE NOTES:
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)
-- The trigger will automatically fire when any athlete updates their PR
-- =============================================
