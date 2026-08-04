-- =====================================================================
-- ANVIL STRENGTH — EL ASPECTO DEL PDF, COMO DATO
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- QUÉ GUARDA
--
-- El diseño del documento que cada entrenador manda a sus atletas:
-- colores, tipografía, logotipo, cabecera, densidad y formato de página.
-- El contrato completo está en src/lib/export/pdfTheme.ts.
--
-- POR QUÉ JSONB Y NO VEINTE COLUMNAS
--
-- Porque el tema es una decisión de diseño, no un modelo de datos: sus
-- campos cambian cada vez que el diseño evoluciona, y con una columna por
-- ajuste cada retoque sería una migración. Aquí no se consulta ni se filtra
-- por nada de esto —se lee entero, para un solo entrenador, en el momento
-- de generar el PDF—, así que no se pierde nada por no tenerlo desglosado.
--
-- `resolveTheme()` rellena en el cliente lo que falte, así que un tema
-- guardado hace seis meses sigue abriendo aunque el contrato haya crecido.
-- =====================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS pdf_theme JSONB;

COMMENT ON COLUMN public.profiles.pdf_theme IS
    'Aspecto del PDF de entrenamiento de este entrenador. Contrato: src/lib/export/pdfTheme.ts. Siempre parcial: lo que falte lo rellena resolveTheme().';

-- Un objeto, no una lista ni un número. Sin esto, un cliente con un error
-- podría dejar ahí una cadena y el generador recibiría algo que no sabe
-- interpretar.
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_pdf_theme_is_object;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_pdf_theme_is_object
    CHECK (pdf_theme IS NULL OR jsonb_typeof(pdf_theme) = 'object');

/**
 * Tope de tamaño.
 *
 * El logotipo NO se guarda aquí: viaja en `profiles.logo_url` y se descarga
 * al generar el documento. Si alguien metiera una imagen en base64 dentro
 * del tema, cada lectura del perfil —que ocurre en cada arranque de sesión y
 * en cada carga de la lista de atletas— arrastraría cientos de kilobytes.
 * 8 KB sobran para colores y ajustes, y no llegan para una imagen.
 */
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_pdf_theme_size;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_pdf_theme_size
    CHECK (pdf_theme IS NULL OR pg_column_size(pdf_theme) <= 8192);

-- El atleta LEE el tema de su entrenador para generar su propio PDF, así que
-- la columna tiene que ser visible desde su lado. No hace falta política
-- nueva: `profiles` ya deja al atleta leer el perfil de su coach (de ahí
-- saca el nombre, el color y el logo del panel), y esto es una columna más
-- de esa misma fila. Escribirla, en cambio, solo puede su dueño:
-- `profiles_update_self` sigue siendo la única puerta.

NOTIFY pgrst, 'reload schema';
