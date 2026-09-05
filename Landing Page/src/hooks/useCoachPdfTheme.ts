import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadLogo, type PdfThemeInput } from '../lib/export/pdfTheme';

/**
 * EL TEMA DEL PDF DE UN ENTRENADOR
 * =====================================================================
 *
 * Devuelve el aspecto que debe tener el documento que se descarga desde
 * esta pantalla. Se resuelve en dos capas:
 *
 *   1. Lo que el entrenador haya guardado en `profiles.pdf_theme`.
 *   2. Y por debajo, su marca de siempre —`brand_color` y `logo_url`—, que
 *      YA existe en el perfil desde que se pudo personalizar el panel.
 *
 * Esa segunda capa es lo que hace que el PDF salga con la marca del club
 * desde el primer día, sin que nadie tenga que entrar a configurar nada.
 * Quien no toque los ajustes ya recibe un documento suyo; quien entre,
 * afina.
 *
 * EL LOGOTIPO SE DESCARGA AQUÍ Y NO AL GENERAR
 *
 * jsPDF necesita los bytes de la imagen, no su dirección. Pedirlos a mitad
 * de componer el documento haría que la descarga dependiera de la red justo
 * en el segundo en que el coach está esperando el archivo. Se trae al
 * montar la pantalla y se queda listo; si falla, el PDF sale sin logotipo y
 * nadie se queda sin su entrenamiento.
 */
export function useCoachPdfTheme(coachId?: string | null): PdfThemeInput | null {
    const [theme, setTheme] = useState<PdfThemeInput | null>(null);

    useEffect(() => {
        let alive = true;

        // El estado se toca solo DENTRO de la carga, nunca en el cuerpo del
        // efecto: hacerlo de forma síncrona provoca un render en cascada.
        const load = async () => {
            if (!coachId) { if (alive) setTheme(null); return; }

            const { data, error } = await supabase
                .from('profiles')
                .select('full_name, brand_color, logo_url, pdf_theme')
                .eq('id', coachId)
                .single();

            if (error || !data || !alive) return;

            const saved = (data.pdf_theme ?? {}) as PdfThemeInput;
            const logoDataUrl = await loadLogo(data.logo_url);
            if (!alive) return;

            setTheme({
                ...saved,
                palette: {
                    // El color guardado manda; si no hay, la marca del panel.
                    ...(data.brand_color ? { accent: data.brand_color } : {}),
                    ...saved.palette,
                },
                header: {
                    ...(data.full_name ? { title: data.full_name } : {}),
                    ...saved.header,
                    // El logotipo SIEMPRE se pisa con el recién descargado: lo
                    // que hubiera guardado es de una carga anterior.
                    logoDataUrl,
                },
            });
        };

        // Un fallo aquí no puede impedir la descarga: sin tema, el documento
        // sale con el diseño por defecto, que es correcto igualmente.
        load().catch(err => console.error('No se pudo cargar el tema del PDF:', err));
        return () => { alive = false; };
    }, [coachId]);

    return theme;
}
