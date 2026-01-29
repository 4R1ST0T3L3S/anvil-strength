-- =============================================
-- ESQUEMA DE BASE DE DATOS - ANVIL STRENGTH (ACTUALIZADO - COACH CENTER)
-- =============================================

-- ... (Keep previous sections but I will provide the FULL content including the new table)

-- 1. Limpieza de políticas
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Lectura: Ver propio perfil o si eres Coach" ON public.profiles;
DROP POLICY IF EXISTS "Escritura: Editar propio o si eres Coach" ON public.profiles;
DROP POLICY IF EXISTS "Insertar: Registro libre" ON public.profiles;
DROP POLICY IF EXISTS "Lectura: Propio o Coach" ON public.profiles;
DROP POLICY IF EXISTS "Escritura: Propio o Coach" ON public.profiles;
DROP POLICY IF EXISTS "Creación: Registro" ON public.profiles;

-- 2. Asegurar Tabla Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  username TEXT,
  full_name TEXT,
  nickname TEXT DEFAULT 'Atleta',
  avatar_url TEXT,
  website TEXT,
  biography TEXT,
  age_category TEXT,
  weight_category TEXT,
  squat_pr NUMERIC DEFAULT 0,
  bench_pr NUMERIC DEFAULT 0,
  deadlift_pr NUMERIC DEFAULT 0,
  total_pr NUMERIC GENERATED ALWAYS AS (squat_pr + bench_pr + deadlift_pr) STORED,
  CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- 3. Añadir Columnas Roles (Si no existen)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'athlete' CHECK (role IN ('athlete', 'coach', 'admin'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Nueva Tabla: Competition Entries (Para 'Agenda Equipo')
CREATE TABLE IF NOT EXISTS public.competition_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  competition_name TEXT NOT NULL,
  target_date DATE,
  category TEXT, -- ej: "-93kg"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.competition_entries ENABLE ROW LEVEL SECURITY;

-- 5. Función Helper
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 6. Políticas de Seguridad Profiles (RBAC)

-- LECTURA
CREATE POLICY "Lectura: Propio o Coach" ON public.profiles
FOR SELECT USING (
  auth.uid() = id 
  OR 
  (public.get_my_role() IN ('coach', 'admin'))
);

-- ESCRITURA
CREATE POLICY "Escritura: Propio o Coach" ON public.profiles
FOR UPDATE USING (
  auth.uid() = id 
  OR 
  (public.get_my_role() IN ('coach', 'admin'))
);

-- CREACIÓN
CREATE POLICY "Creación: Registro" ON public.profiles
FOR INSERT WITH CHECK (
  auth.uid() = id
);

-- 7. Políticas de Seguridad Competition Entries

-- Los coaches pueden gestionar todo en esta tabla (leer, crear, editar, borrar)
-- Nota: Simplificamos para que el coach pueda gestionar todo, idealmente se filtraría por coach_id del atleta
CREATE POLICY "Coaches manage entries" ON public.competition_entries
FOR ALL USING (
  public.get_my_role() IN ('coach', 'admin')
);

-- Los atletas pueden ver sus propias entradas
CREATE POLICY "Athletes view own entries" ON public.competition_entries
FOR SELECT USING (
  auth.uid() = athlete_id
);

-- 8. Trigger updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
