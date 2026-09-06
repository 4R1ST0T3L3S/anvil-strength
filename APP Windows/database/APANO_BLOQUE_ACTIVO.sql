-- =====================================================================
-- APAÑO TEMPORAL — QUE EL ATLETA VEA SU BLOQUE SIN ESPERAR AL APK NUEVO
-- =====================================================================
--
-- POR QUÉ HACE FALTA ESTO
--
-- Qué bloque se le enseña al atleta NO lo decide la base de datos: lo decide
-- el JavaScript que va dentro del APK. El APK instalado en su móvil es del
-- 3 de septiembre y trae, literalmente, esto:
--
--     (await re.getBlocksByAthlete(t)).find(Q => Q.is_active)
--
-- o sea, el primer bloque activo de una lista ordenada por `created_at`
-- descendente: el ÚLTIMO CREADO. Ninguna migración puede cambiar eso, por
-- eso el atleta sigue viendo el segundo bloque aunque el SQL diga que todo
-- está bien.
--
-- El arreglo de verdad (`elegirBloqueActual`, que elige por calendario) ya
-- está en el código, pero solo llega cuando se recompile el APK y él lo
-- instale.
--
-- Mientras tanto: si solo hay UN bloque activo, hasta el código viejo acierta.
-- Este archivo desactiva el bloque que todavía no ha empezado.
--
-- ES REVERSIBLE. Cuando el segundo bloque le toque de verdad —o cuando esté
-- el APK nuevo— se vuelve a poner `is_active = true` con el apartado 4.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ANTES DE TOCAR NADA: MIRAR
-- ---------------------------------------------------------------------
-- Comprueba que son los dos bloques que crees. `en_curso` marca el que le
-- toca hoy por calendario.
SELECT
    tb.id,
    tb.name,
    tb.is_active,
    tb.start_week,
    tb.end_week,
    tb.created_at,
    CASE WHEN EXTRACT(WEEK FROM CURRENT_DATE)::INT BETWEEN tb.start_week AND tb.end_week
         THEN '<<< LE TOCA ESTE' ELSE '' END AS en_curso
FROM public.training_blocks tb
WHERE tb.athlete_id = (
    SELECT athlete_id FROM public.training_blocks
     WHERE name = 'SEGUNDO BLOQUE HIPERTROFIA'
     ORDER BY created_at DESC LIMIT 1
)
ORDER BY tb.is_active DESC, tb.created_at DESC;


-- ---------------------------------------------------------------------
-- 2. DESACTIVAR LOS BLOQUES QUE AÚN NO HAN EMPEZADO
-- ---------------------------------------------------------------------
-- ESTE ES EL ÚNICO APARTADO QUE ESCRIBE. Toca solo los bloques de ESE
-- atleta cuya primera semana es POSTERIOR a la de hoy: los que todavía no
-- han empezado. El que está en curso no se toca.
UPDATE public.training_blocks
   SET is_active = FALSE
 WHERE athlete_id = (
        SELECT athlete_id FROM public.training_blocks
         WHERE name = 'SEGUNDO BLOQUE HIPERTROFIA'
         ORDER BY created_at DESC LIMIT 1
       )
   AND is_active
   AND start_week IS NOT NULL
   AND start_week > EXTRACT(WEEK FROM CURRENT_DATE)::INT;


-- ---------------------------------------------------------------------
-- 3. Y AHORA, ¿QUÉ VE?
-- ---------------------------------------------------------------------
-- Tiene que quedar UN solo bloque activo, y sus semanas con `publicada` en
-- true. Si la semana de hoy sale en false, el problema es otro y es el que
-- ya estábamos mirando: el interruptor del coach o la puerta por fecha.
SELECT
    tb.name                                        AS bloque,
    ts.week_number,
    count(*)                                       AS dias,
    tw.is_visible                                  AS interruptor_del_coach,
    public.week_is_released(tb.id, ts.week_number) AS publicada,
    CASE WHEN ts.week_number = EXTRACT(WEEK FROM CURRENT_DATE)::INT
         THEN '<<< LA DE HOY' ELSE '' END          AS es_hoy
FROM public.training_sessions ts
JOIN public.training_blocks   tb ON tb.id = ts.block_id
LEFT JOIN public.training_weeks tw
       ON tw.block_id = ts.block_id AND tw.week_number = ts.week_number
WHERE tb.is_active
  AND tb.athlete_id = (
        SELECT athlete_id FROM public.training_blocks
         WHERE name = 'SEGUNDO BLOQUE HIPERTROFIA'
         ORDER BY created_at DESC LIMIT 1
      )
GROUP BY tb.name, ts.week_number, tw.is_visible, tb.id
ORDER BY ts.week_number;


-- ---------------------------------------------------------------------
-- 4. PARA DESHACERLO
-- ---------------------------------------------------------------------
-- Cuando esté el APK nuevo instalado, o cuando al segundo bloque le toque
-- empezar. Quita los guiones del principio de las tres líneas y ejecútalo.
--
-- UPDATE public.training_blocks
--    SET is_active = TRUE
--  WHERE name = 'SEGUNDO BLOQUE HIPERTROFIA';
