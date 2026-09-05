-- =====================================================================
-- APÉNDICES DE LA SESIÓN: CALENTAMIENTO Y EXTRAS
-- =====================================================================
--
-- Un día de entrenamiento no son solo las series pautadas. Antes y después
-- hay trabajo que el coach venía metiendo como "ejercicios" de mentira
-- ("Movilidad cadera", "Core 3x15") para que apareciese en algún sitio, y eso
-- ensuciaba TODAS las métricas: contaba como series de accesorio, entraba en
-- el tonelaje y desviaba el reparto por patrón del panel de análisis.
--
-- Con dos columnas de texto libre, el calentamiento y los extras se pautan y
-- se leen sin fingir que son levantamientos.
--
-- Es idempotente: se puede ejecutar las veces que haga falta.

ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS warmup TEXT,
    ADD COLUMN IF NOT EXISTS extras TEXT;

COMMENT ON COLUMN public.training_sessions.warmup IS
    'Calentamiento y aproximaciones del día, en texto libre. Se enseña al atleta antes de la tabla de ejercicios y sale como apéndice en el PDF.';

COMMENT ON COLUMN public.training_sessions.extras IS
    'Trabajo opcional al terminar (core, movilidad, cardio). Texto libre. No cuenta para el volumen ni el tonelaje.';

-- No hacen falta políticas nuevas: las de training_sessions son por fila
-- (el coach dueño del bloque escribe, el atleta del bloque lee) y aplican a
-- todas las columnas de la tabla.

-- Refresca el caché de esquema de PostgREST. Sin esto, la API sigue
-- rechazando las columnas nuevas con PGRST204 hasta el siguiente reinicio.
NOTIFY pgrst, 'reload schema';
