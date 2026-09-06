-- =====================================================================
-- ANVIL — ¿POR QUÉ ESTE ATLETA NO VE SU SEMANA?
-- =====================================================================
-- NO ESCRIBE NADA. Son cinco preguntas de solo lectura.
-- Ejecutar en Supabase Dashboard -> SQL Editor y pegar las cinco salidas.
--
-- Cambia el nombre del bloque si haces la prueba con otro:
--     'SEGUNDO BLOQUE HIPERTROFIA'
--
-- QUÉ SE ESTÁ COMPROBANDO. La aplicación del atleta hace, en este orden:
--
--   1. `getBlocksByAthlete()` y se queda con el PRIMER bloque `is_active`,
--      ordenando por `created_at` descendente. Si hay dos bloques activos,
--      coge el más reciente — que puede no ser el que estás rellenando tú.
--   2. Pide las sesiones de `week_number = <semana ISO de hoy>`.
--   3. La RLS filtra esas filas por `week_is_released(bloque, semana)`.
--
-- Cualquiera de los tres pasos deja la pantalla vacía, y por fuera se ven
-- exactamente igual. Estas consultas los separan.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ¿QUÉ SEMANA ES HOY PARA EL SERVIDOR?
-- ---------------------------------------------------------------------
-- Tiene que coincidir con la que la app marca "En curso".
SELECT
    CURRENT_DATE                                  AS hoy,
    EXTRACT(WEEK    FROM CURRENT_DATE)::INT       AS semana_iso_hoy,
    EXTRACT(ISOYEAR FROM CURRENT_DATE)::INT       AS anio_iso_hoy;


-- ---------------------------------------------------------------------
-- 2. TODOS LOS BLOQUES DE ESE ATLETA
-- ---------------------------------------------------------------------
-- Lo importante: cuántos tienen `is_active = true`. Si hay más de uno, la
-- app coge el de `created_at` más alto y ese es el que ve el atleta.
-- La columna `LO_QUE_VE_EL_ATLETA` marca cuál es.
SELECT
    tb.id,
    tb.name,
    tb.is_active,
    tb.start_week,
    tb.end_week,
    tb.start_date,
    EXTRACT(YEAR FROM tb.start_date)::INT AS anio_de_start_date,
    tb.release_offset_days,
    tb.created_at,
    -- Rango real del bloque en el calendario, para ver de un vistazo cual
    -- de los activos es el que TOCA hoy y cual todavia no ha empezado.
    (tb.start_date::date - (EXTRACT(ISODOW FROM tb.start_date)::INT - 1))                       AS primer_lunes,
    CASE WHEN tb.start_week IS NOT NULL AND tb.end_week IS NOT NULL
         THEN (tb.start_date::date - (EXTRACT(ISODOW FROM tb.start_date)::INT - 1))
              + ((tb.end_week - tb.start_week + 1) * 7 - 1)
    END                                                                                          AS ultimo_domingo,
    CASE WHEN tb.start_week IS NOT NULL AND tb.end_week IS NOT NULL
              AND EXTRACT(WEEK FROM CURRENT_DATE)::INT BETWEEN tb.start_week AND tb.end_week
         THEN '<<< LE TOCA ESTE' ELSE '' END                                                     AS en_curso_por_fechas,
    CASE WHEN tb.id = (
        SELECT b2.id FROM public.training_blocks b2
         WHERE b2.athlete_id = tb.athlete_id AND b2.is_active
         ORDER BY b2.created_at DESC LIMIT 1
    ) THEN '<<< ESTE' ELSE '' END AS lo_que_ve_el_atleta
FROM public.training_blocks tb
WHERE tb.athlete_id = (
    SELECT athlete_id FROM public.training_blocks
     WHERE name = 'SEGUNDO BLOQUE HIPERTROFIA'
     ORDER BY created_at DESC LIMIT 1
)
ORDER BY tb.is_active DESC, tb.created_at DESC;


-- ---------------------------------------------------------------------
-- 3. QUÉ SEMANAS TIENEN SESIONES DE VERDAD, Y SI ESTÁN ABIERTAS
-- ---------------------------------------------------------------------
-- `publicada` es la respuesta EXACTA que le da la RLS al atleta. Si sale
-- `false` en la semana de hoy, ahí está el problema, y las dos columnas de
-- al lado dicen por qué: `interruptor_del_coach` (NULL = nunca se tocó) y
-- `se_abre_el`.
SELECT
    ts.week_number,
    count(*)                                            AS dias,
    tw.is_visible                                       AS interruptor_del_coach,
    public.week_is_released(tb.id, ts.week_number)      AS publicada,
    -- `start_date` es TIMESTAMPTZ en esta base, no DATE, y a un timestamptz
    -- no se le puede restar un entero. El `::date` de aquí es el mismo que
    -- hace PL/pgSQL sola dentro de week_is_released() al asignarlo a una
    -- variable declarada DATE, así que la cuenta sale idéntica.
    (
        (tb.start_date::date - (EXTRACT(ISODOW FROM tb.start_date)::INT - 1))
        + ((ts.week_number - EXTRACT(WEEK FROM tb.start_date)::INT
            + CASE WHEN ts.week_number < EXTRACT(WEEK FROM tb.start_date)::INT
                   THEN EXTRACT(WEEK FROM make_date(EXTRACT(ISOYEAR FROM tb.start_date)::INT, 12, 28))::INT
                   ELSE 0 END) * 7)
        - COALESCE(tb.release_offset_days, 1)
    )::DATE                                             AS se_abre_el,
    CASE WHEN ts.week_number = EXTRACT(WEEK FROM CURRENT_DATE)::INT
         THEN '<<< LA DE HOY' ELSE '' END               AS es_hoy
FROM public.training_sessions ts
JOIN public.training_blocks   tb ON tb.id = ts.block_id
LEFT JOIN public.training_weeks tw
       ON tw.block_id = ts.block_id AND tw.week_number = ts.week_number
WHERE tb.name = 'SEGUNDO BLOQUE HIPERTROFIA'
GROUP BY ts.week_number, tw.is_visible, tb.id, tb.start_date, tb.release_offset_days
ORDER BY ts.week_number;


-- ---------------------------------------------------------------------
-- 4. FILAS DE `training_weeks` DE ESE BLOQUE
-- ---------------------------------------------------------------------
-- Solo hay fila para las semanas que el coach ha tocado. `is_visible = false`
-- aquí gana a todo lo demás y es la causa más habitual.
SELECT tw.week_number, tw.name, tw.is_visible
FROM public.training_weeks tw
JOIN public.training_blocks tb ON tb.id = tw.block_id
WHERE tb.name = 'SEGUNDO BLOQUE HIPERTROFIA'
ORDER BY tw.week_number;


-- ---------------------------------------------------------------------
-- 5. ¿ESTÁ APLICADO EL ARREGLO DE `week_is_released`?
-- ---------------------------------------------------------------------
-- `db:check` no lo puede ver porque solo mira que la función exista.
-- Si sale `ANTIGUA`, falta ejecutar FIX_SEMANA_PUBLICADA_2026-09-05.sql.
SELECT CASE
    WHEN pg_get_functiondef(p.oid) LIKE '%v_weeks_in_year%' THEN 'ARREGLADA (06-09-2026)'
    ELSE 'ANTIGUA — el boton "Publicar semana" solo sabe cerrar'
END AS estado_week_is_released
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'week_is_released';
