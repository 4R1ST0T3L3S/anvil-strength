-- =====================================================================
-- FOTO Y RECORTE NUEVOS DE MARC ALONSO (Campeonato de España Junior 2026)
-- 21 de octubre de 2026
-- =====================================================================
--
-- EJECUTAR DESPUÉS DE DESPLEGAR: apunta a ficheros que llegan con el
-- despliegue (public/athletes/roster/marc-alonso-jnr26*.webp y
-- public/athletes/marc-jnr26.jpg). Antes, la web pediría ficheros que no
-- existen todavía.
--
-- Las marcas (307,5 / 197,5 / 320 y las de Pau Rodríguez, 270 / 150 /
-- 242,5) ya se cambiaron directamente el mismo día.
-- =====================================================================

UPDATE public.club_athletes
SET image          = '/athletes/marc-jnr26.jpg',
    cutout_src     = '/athletes/roster/marc-alonso-jnr26.webp',
    cutout_src800  = '/athletes/roster/marc-alonso-jnr26-800.webp',
    cutout_width   = 1215,
    cutout_height  = 1600,
    cutout_scale   = 1.12,
    cutout_drop    = 0.06,
    updated_at     = now()
WHERE slug = 'marc-alonso';
