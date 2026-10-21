-- Carga inicial de CLUB_WEB_2026-10-21.sql con lo que había en src/data.
-- Idempotente: no pisa lo que ya se haya editado desde el panel.

INSERT INTO public.club_athletes (slug, name, category, image, description, instagram, last_competition, gl_points, squat, bench, deadlift, total, cutout_src, cutout_src800, cutout_width, cutout_height, cutout_scale, cutout_drop, order_index) VALUES
    ('gema-cruz', 'Gema Cruz', '-63kg JNR', '/athletes/gema.jpeg', 'Atleta de élite en la categoría -63kg. Constancia y técnica impecable en cada levantamiento.', 'https://www.instagram.com/gemacruz_', 'AEP3 Las Torres De Cotilla', 66.2, 120, 52.5, 125, 297.5, NULL, NULL, NULL, NULL, 1, 0, 0),
    ('alejandro-hermosilla', 'Alejandro Hermosilla', '-83kg Open', '/athletes/alejandro.jpg', 'Especialista en sentadilla pesada y referente de fuerza en la categoría -83kg.', 'https://www.instagram.com/alejandrohermosilla', 'AEP3 Las Torres De Cotilla', 84.88, 250, 127.5, 225, 602.5, '/athletes/roster/alejandro-hermosilla.webp', '/athletes/roster/alejandro-hermosilla-800.webp', 882, 1600, 1.08, 0.04, 1),
    ('marc-alonso', 'Marc Alonso', '-105kg JNR', '/athletes/marc.png', 'Compitiendo al más alto nivel por el club Anvil Strength. Superando límites y forjando una nueva historia de éxito en la plataforma.', 'https://www.instagram.com/mar_alonsoo_', 'SBD Cup 2025', 100.06, 295, 192.5, 312.5, 800, '/athletes/roster/marc-alonso.webp', '/athletes/roster/marc-alonso-800.webp', 1064, 1600, 0.86, 0, 2),
    ('pau-rodriguez', 'Pau Rodriguez', '-105kg SBJ', '/athletes/Pau.png', NULL, NULL, 'SBD Cup 2025', 79.65, 270, 140, 230, 640, '/athletes/roster/pau-rodriguez.webp', '/athletes/roster/pau-rodriguez-800.webp', 763, 1600, 1.42, 0.24, 3),
    ('josep-lopez', 'Josep Lopez', '-83kg Open', '/athletes/josep.png', NULL, NULL, 'SBD Cup 2025', 94.15, 270, 135, 270, 675, NULL, NULL, NULL, NULL, 1, 0, 4),
    ('carlos-villena', 'Carlos Villena', '-93kg JNR', '/athletes/villena.png', NULL, NULL, 'AEP3 Las Torres De Cotilla', 61.16, 182.5, 117.5, 165, 465, NULL, NULL, NULL, NULL, 1, 0, 5),
    ('marina-rico', 'Marina Rico', '-69 JNR', '/athletes/marina.jpg', NULL, NULL, 'III Project Energy Cup', 71.49, 127.5, 67.5, 145, 340, NULL, NULL, NULL, NULL, 1, 0, 6),
    ('elsa-fernandez-arenas', 'Elsa Fernandez-Arenas', '-69 JNR', '/athletes/elsa.jpeg', NULL, NULL, 'Campeonato de España Subjunior 2024', 55.41, 87.5, 52.5, 120, 262.5, NULL, NULL, NULL, NULL, 1, 0, 7),
    ('pau-camacho', 'Pau Camacho', '-83kg JNR', '/athletes/pauca.jpg', NULL, NULL, 'AEP2 Chiva 2025', 81.41, 212.5, 135, 230, 577.5, '/athletes/roster/pau-camacho.webp', '/athletes/roster/pau-camacho-800.webp', 526, 1600, 1.3, 0.2, 8),
    ('santiago-badia', 'Santiago Badia', '-105 SBJ', '/athletes/santi.jpg', NULL, NULL, 'AEP2 Chiva 2025', 62.28, 165, 85, 220, 470, NULL, NULL, NULL, NULL, 1, 0, 9),
    ('javier-rubio', 'Javier Rubio', '-83kg Open', '/Nutricionistas/Javier Rubio Nutricionista Foto Presentacion.jpeg', NULL, NULL, 'Nacional 2024', 99, 262.5, 162.5, 290, 715, NULL, NULL, NULL, NULL, 1, 0, 10),
    ('masoko', 'Masoko', '+120kg Open', '/athletes/Masoko.jpeg', NULL, NULL, NULL, 0, 280, 165, 230, 675, NULL, NULL, NULL, NULL, 1, 0, 11),
    ('alejandro', 'Alejandro', '-66Kg Junior', '/athletes/Alejandro_malaga.jpg', NULL, NULL, NULL, 0, 0, 0, 0, 0, NULL, NULL, NULL, NULL, 1, 0, 12)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.club_achievements (legacy_id, title, result, description, images, order_index) VALUES
    (1, 'Campeonato Nacional SBJ 2026', 'Primer puesto -105Kg', 'Campeón de España en los 3 movimientos y pase directo para competir en el Europeo Subjunior para Pau Rodríguez.', ARRAY['/Logros/PAU RODRIGUEZ-44.jpg', '/Logros/PODIO_SBJ26.jpg']::text[], 0),
    (2, 'SBD CUP 2025', '2 Segundos puestos', 'Plata en la categoría de -83Kg y -105Kg. En esta última, un record de España (no oficial) en press banca con 192.5kg.', ARRAY['/Logros/podio_sbd.jpg']::text[], 1),
    (3, 'Campeonato Nacional SBJ 2026', 'Tercer puesto -105Kg', 'Tercero de España en los 3 movimientos para Santiago Badía.', ARRAY['/Logros/Santiago_sbj26.jpg']::text[], 2),
    (4, 'Black Oni VI', 'Podio Absoluto', 'Tercer puesto absoluto de nuestro atleta Pau Camacho, además de hacerse con el oro en la categoría de 83Kg', ARRAY['/logro3_1.jpg']::text[], 3),
    (5, 'Campeonato Nacional SBJ 2026', '2do puesto por clubes', 'Segundo mejor club del campeonato de España Subjunior 2026 gracias a las actuaciones de Pau Rodriguez y Santi!', ARRAY['/logro1_1.jpg', '/logro1_2.jpg']::text[], 4),
    (6, 'Regional ESTE 2 · Chiva 2026', 'Campeón -74Kg', 'Fernando Alexander se proclamó campeón de la categoría de -74Kg en el Campeonato Regional ESTE 2 celebrado en Chiva.', ARRAY['/Logros/fernando_chiva26.jpg']::text[], 5),
    (7, 'Campeonato de España Junior 2026', 'Campeón -105Kg · 2º Absoluto', 'Campeón de España Junior en la categoría de -105Kg y segundo puesto absoluto del campeonato.', ARRAY['/Logros/junior26_105.jpg']::text[], 6)
ON CONFLICT (legacy_id) DO NOTHING;
