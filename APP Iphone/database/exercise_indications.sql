-- =====================================================================
-- ANVIL STRENGTH — INDICACIONES GENERALES DEL EJERCICIO
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- QUÉ RESUELVE
--
-- Hasta ahora las claves de ejecución vivían en `exercise_videos.cues`, es
-- decir, COLGANDO DE UN VÍDEO. Consecuencia: mientras no hubiera un vídeo
-- subido —que es el estado de hoy, porque no hay ninguno— el atleta abría la
-- ficha de un ejercicio y no leía absolutamente nada sobre cómo se hace.
--
-- Las indicaciones no son una propiedad del vídeo. Son una propiedad del
-- EJERCICIO: el press militar se ejecuta igual lo grabe quien lo grabe. Por
-- eso viven aquí, en `exercise_library`, y se ven aunque no haya vídeo.
--
-- Las de `exercise_videos` siguen existiendo y siguen MANDANDO cuando están:
-- son la letra pequeña de la versión concreta que ese atleta está viendo
-- ("aquí lo hacemos con pausa"). Sin ellas se cae a estas.
--
-- Ver src/features/training/components/ExerciseVideoPanel.tsx.
-- =====================================================================

ALTER TABLE public.exercise_library
    ADD COLUMN IF NOT EXISTS setup         TEXT,
    ADD COLUMN IF NOT EXISTS cues          TEXT[],
    ADD COLUMN IF NOT EXISTS common_errors TEXT[];

COMMENT ON COLUMN public.exercise_library.setup IS
    'Montaje y colocación, en una o dos frases. Lo que se hace ANTES de la primera repetición.';
COMMENT ON COLUMN public.exercise_library.cues IS
    'Claves de ejecución, en imperativo y cortas. Se leen entre serie y serie, no se estudian.';
COMMENT ON COLUMN public.exercise_library.common_errors IS
    'Fallos frecuentes. Van aparte de los cues a propósito: se pintan en otro color porque son la advertencia, no la instrucción.';

-- Topes de tamaño. Esto se lee en la ficha del ejercicio, entre serie y
-- serie: son notas de gimnasio, no un artículo. Sin límite, un día alguien
-- pega un tratado y la ficha deja de caber en el móvil.
--
--
-- POR QUÉ SE MIDE EL TOTAL Y NO LA CLAVE MÁS LARGA
-- ---------------------------------------------------------------------
--
-- La primera versión de esta restricción medía la clave más larga con
--     (SELECT COALESCE(MAX(char_length(c)), 0) FROM unnest(cues) AS c)
-- y Postgres la rechaza de plano:
--
--     ERROR: 0A000: cannot use subquery in check constraint
--
-- No es un capricho del motor. Un CHECK tiene que poder evaluarse mirando
-- SOLO la fila que se está escribiendo, y una subconsulta abre la puerta a
-- mirar otras filas —u otras tablas—, con lo que la restricción dejaría de
-- valer en cuanto esas otras filas cambiaran. `unnest()` sobre la propia
-- columna sería inocuo, pero el planificador no distingue un caso del otro
-- y prohíbe la construcción entera.
--
-- El arreglo NO es rodearlo con una función `IMMUTABLE` que envuelva la
-- misma subconsulta. Se puede —Postgres lo acepta— pero deja la restricción
-- dependiendo de un objeto que alguien puede reemplazar sin enterarse de que
-- hay un CHECK colgando de él.
--
-- Se mide el TOTAL con `array_to_string`, que es inmutable y no necesita
-- subconsulta. Y de paso mide mejor lo que de verdad importa: el tope existe
-- para que la tarjeta quepa en un móvil, y ocho claves de 139 caracteres
-- pasarían un límite por elemento y seguirían siendo un tratado. 1.120 =
-- 8 × 140, el mismo presupuesto de antes, contado donde se nota.
ALTER TABLE public.exercise_library
    DROP CONSTRAINT IF EXISTS exercise_library_indications_sane;
ALTER TABLE public.exercise_library
    ADD CONSTRAINT exercise_library_indications_sane CHECK (
        (setup IS NULL OR char_length(setup) <= 500)
        AND (cues IS NULL OR (array_length(cues, 1) <= 8
             AND char_length(array_to_string(cues, '')) <= 1120))
        AND (common_errors IS NULL OR (array_length(common_errors, 1) <= 8
             AND char_length(array_to_string(common_errors, '')) <= 1120))
    );

-- ---------------------------------------------------------------------
-- SEMILLA DE LOS MOVIMIENTOS BÁSICOS
-- ---------------------------------------------------------------------
-- Solo los ejercicios del sistema (`coach_id IS NULL`) y solo si están
-- vacíos: si un entrenador ya ha escrito lo suyo, esto no lo pisa.
--
-- El emparejamiento es por nombre normalizado y con LIKE porque el catálogo
-- tiene variantes ("Sentadilla trasera", "Press banca con agarre cerrado")
-- que comparten técnica de base.

DO $$
DECLARE
    v RECORD;
BEGIN
    FOR v IN
        SELECT * FROM (VALUES
            ('sentadilla',
             'Barra apoyada en la espalda, no en el cuello. Pies a la anchura de los hombros, puntas ligeramente hacia fuera. Coge aire y aprieta el abdomen antes de descender.',
             ARRAY['Empuja las rodillas hacia fuera durante todo el recorrido',
                   'Mantén el pecho alto y la mirada al frente',
                   'Reparte el peso en el medio del pie, ni en punta ni en talón',
                   'Baja hasta que la cadera pase por debajo de la rodilla'],
             ARRAY['Que las rodillas se metan hacia dentro al subir',
                   'Levantar la cadera antes que el pecho',
                   'Soltar el aire abajo y perder la presión abdominal']),

            ('press banca',
             'Cinco puntos de apoyo: cabeza, hombros y glúteo en el banco, y los dos pies en el suelo. Omóplatos juntos y hacia abajo antes de descolgar la barra.',
             ARRAY['Junta los omóplatos y mantenlos así toda la serie',
                   'Baja la barra a la línea del pecho, no al cuello',
                   'Antebrazos verticales en el punto más bajo',
                   'Empuja el suelo con los pies'],
             ARRAY['Despegar el glúteo del banco',
                   'Rebotar la barra en el pecho',
                   'Abrir los codos a 90° respecto al tronco']),

            ('peso muerto',
             'Barra pegada a la espinilla, pies bajo la cadera. Coge aire, cierra las costillas y tensa la barra antes de despegarla del suelo.',
             ARRAY['Saca la tensión de la barra antes de tirar',
                   'Espalda en su curva natural, ni redondeada ni hiperextendida',
                   'Empuja el suelo con las piernas en el primer tramo',
                   'Termina apretando el glúteo, sin echar el tronco atrás'],
             ARRAY['Que la cadera suba antes que los hombros',
                   'Separar la barra del cuerpo en el ascenso',
                   'Redondear la zona lumbar al iniciar el tirón']),

            ('press militar',
             'De pie, barra apoyada en la clavícula y codos ligeramente por delante. Glúteo y abdomen apretados: el tronco es la base del empuje.',
             ARRAY['Aprieta glúteo y abdomen antes de empujar',
                   'Aparta la cara del camino de la barra en vez de rodearla',
                   'Termina con la barra sobre la mitad del pie, no por delante',
                   'Bloquea arriba metiendo la cabeza entre los brazos'],
             ARRAY['Arquear la zona lumbar para compensar la falta de hombro',
                   'Empujar la barra hacia delante en vez de hacia arriba',
                   'Ayudarse con las piernas cuando la serie es estricta']),

            ('remo',
             'Cadera atrás, tronco inclinado y estable. La espalda no se mueve durante la serie: lo único que viaja son los brazos.',
             ARRAY['Lleva los codos hacia la cadera, no hacia fuera',
                   'Junta los omóplatos al final del tirón',
                   'Mantén el mismo ángulo de tronco de la primera a la última repetición'],
             ARRAY['Incorporarse con el tronco para mover más peso',
                   'Tirar con los brazos sin llegar a juntar la escápula']),

            ('dominada',
             'Agarre algo más ancho que los hombros. Cuelga con los hombros activos, sin quedarte muerto abajo.',
             ARRAY['Empieza bajando las escápulas antes de doblar los codos',
                   'Lleva el pecho hacia la barra, no la barbilla',
                   'Controla la bajada hasta extender del todo'],
             ARRAY['Balancearse para coger impulso',
                   'Recortar el recorrido por abajo'])
        ) AS t(patron, setup, cues, errores)
    LOOP
        UPDATE public.exercise_library e
           SET setup         = COALESCE(e.setup, v.setup),
               cues          = COALESCE(e.cues, v.cues),
               common_errors = COALESCE(e.common_errors, v.errores)
         WHERE e.coach_id IS NULL
           AND LOWER(TRIM(e.name)) LIKE v.patron || '%'
           AND (e.setup IS NULL OR e.cues IS NULL OR e.common_errors IS NULL);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- COMPROBACIÓN
-- ---------------------------------------------------------------------
SELECT name,
       cues IS NOT NULL          AS tiene_cues,
       common_errors IS NOT NULL AS tiene_errores
  FROM public.exercise_library
 WHERE coach_id IS NULL
 ORDER BY tiene_cues DESC, name
 LIMIT 30;

NOTIFY pgrst, 'reload schema';
