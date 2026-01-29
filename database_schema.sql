-- =============================================
-- ESQUEMA DE BASE DE DATOS - ANVIL STRENGTH
-- =============================================
-- Solución al error 42703: Definición explícita de columnas fuera de bloques dinámicos.

-- 1. Limpieza de políticas antiguas (para evitar conflictos)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Lectura: Ver propio perfil o si eres Coach" ON public.profiles;
DROP POLICY IF EXISTS "Escritura: Editar propio o si eres Coach" ON public.profiles;
DROP POLICY IF EXISTS "Insertar: Registro libre" ON public.profiles;
DROP POLICY IF EXISTS "Lectura: Propio o Coach" ON public.profiles;
DROP POLICY IF EXISTS "Escritura: Propio o Coach" ON public.profiles;
DROP POLICY IF EXISTS "Creación: Registro" ON public.profiles;

-- 2. Asegurar existencia de la tabla
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

-- 3. AÑADIR COLUMNAS DIRECTAMENTE (SOLUCIÓN AL ERROR)
-- Usamos IF NOT EXISTS para que no falle si ya existen, pero fuera de un bloque DO
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'athlete' CHECK (role IN ('athlete', 'coach', 'admin'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Asegurarse de activar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Función Helper para evitar Recursión en RLS
-- (Ahora funcionará porque las columnas ya están "parseadas" arriba)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 5. Nuevas Políticas de Seguridad (RBAC)

-- LECTURA (SELECT)
CREATE POLICY "Lectura: Propio o Coach" ON public.profiles
FOR SELECT USING (
  auth.uid() = id 
  OR 
  (public.get_my_role() IN ('coach', 'admin'))
);

-- ESCRITURA (UPDATE)
CREATE POLICY "Escritura: Propio o Coach" ON public.profiles
FOR UPDATE USING (
  auth.uid() = id 
  OR 
  (public.get_my_role() IN ('coach', 'admin'))
);

-- CREACIÓN (INSERT)
CREATE POLICY "Creación: Registro" ON public.profiles
FOR INSERT WITH CHECK (
  auth.uid() = id
);

-- 6. Trigger para updated_at (Mantenimiento)
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
