-- =====================================================================
-- ANVIL STRENGTH — CALIBRACIÓN DE PWR CONTRA UN ENCODER
-- =====================================================================
--
-- Fases 9 y 10 de docs/AUDITORIA_PWR_2.0.md.
--
--
-- QUÉ PROBLEMA RESUELVE
--
-- Todo el analizador está construido sobre criterio razonado y medido contra
-- repeticiones SINTÉTICAS. Los sintéticos demuestran que las matemáticas son
-- correctas: se construye una repetición de verdad conocida y se comprueba que
-- el filtrado, la derivación y la segmentación la recuperan. Lo que no pueden
-- demostrar es nada sobre la cadena completa en un gimnasio de verdad — la
-- cámara, el códec, la detección del disco, el flujo óptico con gente
-- moviéndose al fondo.
--
-- Por eso hay una frase que hoy NO se puede decir:
--
--     «una medición con 82 de calidad tiene ±3% de error»
--
-- Los pesos y los cortes de src/lib/cv/quality.ts ordenan bien las mediciones
-- —eso sí está comprobado— pero nadie ha verificado qué error real corresponde
-- a cada nota. Estas tablas son la infraestructura para averiguarlo: se graba
-- una serie con vídeo Y con encoder a la vez, se contrastan repetición a
-- repetición, y con suficientes sesiones la nota deja de ser criterio y pasa a
-- ser una cifra medida.
--
--
-- POR QUÉ SE GUARDAN LAS PAREJAS Y NO SOLO EL RESUMEN
--
-- Porque la forma de resumir va a cambiar. Hoy se calculan sesgo, error
-- absoluto medio, RMSE y límites de acuerdo de Bland-Altman; mañana puede
-- hacer falta un ICC, o separar por nota de calidad, o por versión del motor.
-- Con las parejas guardadas, todo eso se recalcula sobre lo que ya hay. Con
-- solo el resumen, habría que repetir las sesiones — y una sesión de
-- calibración cuesta un atleta, un encoder y una tarde.
--
-- El resumen se guarda IGUAL, en la tabla de sesiones, porque consultarlo es
-- constante y recalcularlo desde las parejas no lo es.
--
--
-- ⚠️ ESTE FICHERO NO SE EJECUTA SOLO. Un `git push` despliega el código del
-- navegador y nada más. Hay que pegarlo en el editor SQL de Supabase.
--
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA SESIÓN DE CALIBRACIÓN
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pwr_calibration_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    performed_at DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Por nombre y no solo por id, por lo mismo que en vbt_measurements: una
    -- sesión de calibración tiene que seguir siendo legible aunque el
    -- ejercicio se borre de la biblioteca.
    exercise_name TEXT NOT NULL CHECK (length(trim(exercise_name)) > 0),
    exercise_id   UUID REFERENCES public.exercise_library(id) ON DELETE SET NULL,

    load_kg      NUMERIC(6,2) CHECK (load_kg IS NULL OR load_kg > 0),
    -- La masa de la barra: una barra de peso muerto flexa y el disco arranca
    -- después que la barra, así que sus sesiones no son comparables con las
    -- demás y hay que poder separarlas al agregar.
    bar_mass_kg  NUMERIC(5,2) CHECK (bar_mass_kg IS NULL OR bar_mass_kg > 0),

    -- CON QUÉ SE MIDIÓ LA REFERENCIA.
    --
    -- Texto libre y no una lista cerrada: aquí entra cualquier encoder que el
    -- entrenador tenga, y una lista cerrada obligaría a una migración cada vez
    -- que aparezca un aparato. Lo que importa es poder AGRUPAR por él, porque
    -- dos encoders distintos no son la misma referencia.
    reference_device TEXT NOT NULL CHECK (length(trim(reference_device)) > 0),

    -- QUÉ MOTOR produjo las cifras de PWR. Sin esto, agregar sesiones de
    -- versiones distintas mezcla el error de dos algoritmos y el resultado no
    -- describe ninguno. Mismo entero que en la bolsa de métricas
    -- (mayor × 10.000 + menor × 100 + parche): v2.0.0 es 20000.
    engine_version INTEGER,

    -- La nota de calidad que PWR se dio a sí mismo en esta medición.
    -- ES LA COLUMNA POR LA QUE EXISTE TODO ESTO: cruzarla con el error real es
    -- lo único que puede convertir «82 sobre 100» en «±3%».
    quality_score INTEGER CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),

    paired_reps INTEGER NOT NULL DEFAULT 0 CHECK (paired_reps >= 0),

    -- Resumen del acuerdo, en las unidades de cada magnitud (m/s y metros).
    -- Se recalcula desde pwr_calibration_reps cuando haga falta; está aquí
    -- para poder listar y ordenar sesiones sin recorrer las parejas.
    mv_bias  NUMERIC(6,4),  mv_mae  NUMERIC(6,4),  mv_rmse NUMERIC(6,4),
    mv_loa_lower NUMERIC(6,4), mv_loa_upper NUMERIC(6,4),
    pv_bias  NUMERIC(6,4),  pv_mae  NUMERIC(6,4),  pv_rmse NUMERIC(6,4),
    rom_bias NUMERIC(6,4),  rom_mae NUMERIC(6,4),  rom_mape NUMERIC(6,2),

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pwr_calibration_atleta_fecha
    ON public.pwr_calibration_sessions (athlete_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS pwr_calibration_motor
    ON public.pwr_calibration_sessions (engine_version, performed_at DESC);


-- ---------------------------------------------------------------------
-- 2. LAS PAREJAS, REPETICIÓN A REPETICIÓN
-- ---------------------------------------------------------------------
--
-- Una fila por repetición emparejada. El error NO se guarda: es una resta, y
-- guardarlo permitiría que quedara desincronizado de los valores de los que
-- sale. Se calcula al leer, o con la vista de más abajo.

CREATE TABLE IF NOT EXISTS public.pwr_calibration_reps (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL
               REFERENCES public.pwr_calibration_sessions(id) ON DELETE CASCADE,

    rep_index  INTEGER NOT NULL CHECK (rep_index > 0),

    -- Lo que dijo el aparato de referencia.
    ref_mean_velocity NUMERIC(5,3),
    ref_peak_velocity NUMERIC(5,3),
    ref_rom           NUMERIC(6,3),

    -- Lo que dijo PWR sobre el vídeo de esa misma repetición.
    pwr_mean_velocity NUMERIC(5,3),
    pwr_peak_velocity NUMERIC(5,3),
    pwr_rom           NUMERIC(6,3),

    -- Dos filas con la misma repetición de la misma sesión serían un
    -- emparejado duplicado, y ese duplicado pesaría doble en todas las medias.
    UNIQUE (session_id, rep_index)
);

CREATE INDEX IF NOT EXISTS pwr_calibration_reps_sesion
    ON public.pwr_calibration_reps (session_id, rep_index);


-- ---------------------------------------------------------------------
-- 3. PERMISOS
-- ---------------------------------------------------------------------
-- La misma puerta que el resto de tablas de entrenamiento: el atleta ve lo
-- suyo, y su entrenador también a través de coach_athletes.

ALTER TABLE public.pwr_calibration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pwr_calibration_reps     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pwr_calibration_sessions_athlete ON public.pwr_calibration_sessions;
CREATE POLICY pwr_calibration_sessions_athlete ON public.pwr_calibration_sessions
    FOR ALL
    USING (auth.uid() = athlete_id)
    WITH CHECK (auth.uid() = athlete_id);

DROP POLICY IF EXISTS pwr_calibration_sessions_coach ON public.pwr_calibration_sessions;
CREATE POLICY pwr_calibration_sessions_coach ON public.pwr_calibration_sessions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.coach_athletes ca
            WHERE ca.coach_id = auth.uid()
              AND ca.athlete_id = public.pwr_calibration_sessions.athlete_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.coach_athletes ca
            WHERE ca.coach_id = auth.uid()
              AND ca.athlete_id = public.pwr_calibration_sessions.athlete_id
        )
    );

-- Las parejas heredan el permiso de su sesión. Sin esta política, con RLS
-- activada la tabla queda cerrada a todo el mundo y las inserciones fallan sin
-- decir por qué — que es el fallo silencioso clásico de este esquema.
DROP POLICY IF EXISTS pwr_calibration_reps_por_sesion ON public.pwr_calibration_reps;
CREATE POLICY pwr_calibration_reps_por_sesion ON public.pwr_calibration_reps
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.pwr_calibration_sessions s
            WHERE s.id = public.pwr_calibration_reps.session_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.pwr_calibration_sessions s
            WHERE s.id = public.pwr_calibration_reps.session_id
        )
    );


-- ---------------------------------------------------------------------
-- 4. EL INFORME DE PRECISIÓN
-- ---------------------------------------------------------------------
--
-- Agrega TODAS las parejas visibles para quien consulta, por versión del motor
-- y por aparato de referencia. Es la consulta que contesta la pregunta que
-- motivó las fases 9 y 10.
--
-- Se agrupa por engine_version porque mezclar versiones describe una media de
-- dos algoritmos y no el error de ninguno; y por reference_device porque dos
-- encoders distintos no son la misma vara de medir.
--
-- OJO CON LEERLA DEMASIADO PRONTO: con dos o tres sesiones, `stddev_samp` no
-- acota nada. La columna `sesiones` está para poder exigir un mínimo antes de
-- citar cualquier cifra de aquí.

CREATE OR REPLACE VIEW public.pwr_calibration_report AS
SELECT
    s.engine_version,
    s.reference_device,
    COUNT(DISTINCT s.id)                          AS sesiones,
    COUNT(r.id)                                   AS repeticiones,

    -- Sesgo: positivo significa que PWR mide DE MÁS que el encoder.
    AVG(r.pwr_mean_velocity - r.ref_mean_velocity)                    AS mv_sesgo,
    AVG(ABS(r.pwr_mean_velocity - r.ref_mean_velocity))               AS mv_error_abs,
    SQRT(AVG(POWER(r.pwr_mean_velocity - r.ref_mean_velocity, 2)))    AS mv_rmse,
    STDDEV_SAMP(r.pwr_mean_velocity - r.ref_mean_velocity)            AS mv_sd,
    -- Límites de acuerdo de Bland-Altman: entre estos dos valores cae el 95%
    -- de las diferencias. Es la cifra que de verdad acota una medición suelta,
    -- y no el sesgo, que solo dice cuánto se desvía la MEDIA.
    AVG(r.pwr_mean_velocity - r.ref_mean_velocity)
        - 1.96 * STDDEV_SAMP(r.pwr_mean_velocity - r.ref_mean_velocity) AS mv_loa_inferior,
    AVG(r.pwr_mean_velocity - r.ref_mean_velocity)
        + 1.96 * STDDEV_SAMP(r.pwr_mean_velocity - r.ref_mean_velocity) AS mv_loa_superior,

    AVG(r.pwr_peak_velocity - r.ref_peak_velocity)                    AS pv_sesgo,
    AVG(ABS(r.pwr_peak_velocity - r.ref_peak_velocity))               AS pv_error_abs,

    AVG(r.pwr_rom - r.ref_rom)                                        AS rom_sesgo,
    AVG(ABS(r.pwr_rom - r.ref_rom))                                   AS rom_error_abs,

    -- La correlación entre la nota que PWR se pone y lo que se equivoca de
    -- verdad. DEBERÍA SER NEGATIVA: más nota, menos error. Si sale cerca de
    -- cero, la nota de calidad no está midiendo lo que dice medir, y eso es
    -- exactamente lo que estas sesiones existen para descubrir.
    CORR(s.quality_score::NUMERIC, ABS(r.pwr_mean_velocity - r.ref_mean_velocity))
                                                                      AS corr_calidad_error
FROM public.pwr_calibration_sessions s
JOIN public.pwr_calibration_reps r ON r.session_id = s.id
WHERE r.ref_mean_velocity IS NOT NULL
  AND r.pwr_mean_velocity IS NOT NULL
GROUP BY s.engine_version, s.reference_device;


-- ---------------------------------------------------------------------
-- 5. LAS MÉTRICAS NUEVAS DEL CATÁLOGO
-- ---------------------------------------------------------------------
-- Una métrica nueva es un INSERT, nunca un ALTER TABLE. Ver
-- database/metrics_catalog.sql y src/lib/vbt/metricRegistry.ts.

INSERT INTO public.metric_definitions
    (key, label, short_label, unit, precision, category, direction, sort_order, min_value, max_value, description)
VALUES
    ('bar_mass_kg', 'Barra', 'Barra', 'kg', 1, 'quality', 'neutral', 90, 5, 40,
     'Masa de la barra vacía declarada antes de analizar. NO se suma a la carga: la carga que se registra ya es la total. Sirve para separar al agregar las mediciones hechas con barra de peso muerto, donde la barra flexa y el disco —que es lo que se sigue en el vídeo— arranca después que ella, con un perfil de arranque que no es el de la barra.')
ON CONFLICT (key) DO UPDATE
    SET label       = EXCLUDED.label,
        short_label = EXCLUDED.short_label,
        unit        = EXCLUDED.unit,
        precision   = EXCLUDED.precision,
        category    = EXCLUDED.category,
        direction   = EXCLUDED.direction,
        sort_order  = EXCLUDED.sort_order,
        min_value   = EXCLUDED.min_value,
        max_value   = EXCLUDED.max_value,
        description = EXCLUDED.description;


-- ---------------------------------------------------------------------
-- VERIFICACIÓN. Las cuatro filas tienen que decir OK.
-- ---------------------------------------------------------------------

SELECT 'pwr_calibration_sessions' AS comprobacion,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public'
                           AND table_name = 'pwr_calibration_sessions')
            THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'pwr_calibration_reps',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public'
                           AND table_name = 'pwr_calibration_reps')
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'pwr_calibration_report (vista)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.views
                         WHERE table_schema = 'public'
                           AND table_name = 'pwr_calibration_report')
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'metrica bar_mass_kg',
       CASE WHEN EXISTS (SELECT 1 FROM public.metric_definitions WHERE key = 'bar_mass_kg')
            THEN 'OK' ELSE 'FALTA' END;
