/**
 * ANVIL STRENGTH — TEMA DEL DOCUMENTO PDF
 * =====================================================================
 *
 * QUÉ ES ESTO
 *
 * El aspecto del PDF que recibe el atleta, descrito como DATOS. Ni un solo
 * color, tamaño o margen del documento vive ya dentro del generador: todo
 * sale de este objeto, así que cambiar el diseño es cambiar un valor —desde
 * una pantalla de ajustes, sin tocar código ni desplegar nada.
 *
 * POR QUÉ IMPORTA QUE SEA UN OBJETO Y NO UN PUÑADO DE CONSTANTES
 *
 * El entrenador manda este documento a sus atletas con su propia marca. Si
 * el diseño está escrito en el generador, "que cada entrenador tenga el
 * suyo" significa una rama por entrenador, que es exactamente como se
 * pudren estas cosas. Con un tema por entrenador, el generador no sabe ni
 * cuántos hay.
 *
 * DÓNDE VIVE UN TEMA
 *
 * En el perfil del entrenador. Aquí solo están el contrato, los valores por
 * defecto y los presets, que son código porque son decisiones de diseño, no
 * datos de nadie.
 *
 * REGLA AL AMPLIAR
 *
 * Todo campo nuevo va con valor por defecto y `resolveTheme` lo rellena. Un
 * tema guardado hace seis meses tiene que seguir abriendo: los documentos
 * viejos no se regeneran, pero los bloques viejos sí se reimprimen.
 */

// =====================================================================
// FORMATO DE PÁGINA
// =====================================================================

/**
 * `mobile` — 9:16, la proporción de la pantalla de un móvil.
 *
 * Es el formato por defecto porque es donde se lee: el atleta abre el PDF
 * en el teléfono, entre series, y una página 9:16 le entra ENTERA en
 * pantalla sin pellizcar ni girar. Un A4 en vertical obliga a hacer zoom
 * para leer una cifra, que es justo el gesto que no se puede pedir con las
 * manos ocupadas.
 *
 * `a4` — para quien lo imprime y lo deja en el banco. Se conserva porque
 * una hoja 9:16 no sale de ninguna impresora doméstica sin recortes.
 */
export type PageFormat = 'mobile' | 'a4';

/** Dimensiones en milímetros. jsPDF trabaja en mm en todo el generador. */
export const PAGE_SIZES: Record<PageFormat, { w: number; h: number; label: string }> = {
    // 210 x 373.3 = exactamente 9:16. Se mantiene el ancho del A4 para que
    // los cuerpos de texto midan lo mismo y la maqueta no haya que reajustarla
    // al cambiar de formato: lo único que cambia es cuánto cabe a lo largo.
    mobile: { w: 210, h: 373.3, label: 'Móvil (9:16)' },
    a4: { w: 210, h: 297, label: 'A4 (imprimible)' },
};

// =====================================================================
// TIPOGRAFÍA
// =====================================================================

/**
 * Las tres familias que jsPDF trae incorporadas.
 *
 * No se ofrecen fuentes de la marca a propósito: incrustar una tipografía
 * suma entre 100 y 400 KB A CADA PDF y hay que licenciarla para incrustarla.
 * El día que haga falta, se añade aquí una clave nueva y el generador la
 * registra; el contrato no cambia.
 */
export type FontFamily = 'helvetica' | 'times' | 'courier';

export const FONT_FAMILIES: { key: FontFamily; label: string; hint: string }[] = [
    { key: 'helvetica', label: 'Helvética', hint: 'Neutra y compacta. La de por defecto.' },
    { key: 'times', label: 'Times', hint: 'Con remates. Más clásica y editorial.' },
    { key: 'courier', label: 'Courier', hint: 'Monoespaciada. Muy técnica.' },
];

// =====================================================================
// EL CONTRATO
// =====================================================================

export interface PdfPalette {
    /** Fondo de la página. */
    surface: string;
    /** Fondo de las cajas: calentamiento, extras, fila de cifras. */
    panel: string;
    /** Texto principal. */
    ink: string;
    /** Texto secundario: notas, etiquetas, metadatos. */
    muted: string;
    /** Filetes y separadores. */
    line: string;
    /** El color de la marca del entrenador. Se usa CON CUENTA: ver abajo. */
    accent: string;
    /** Texto que va ENCIMA del acento. Se calcula solo si no se fija. */
    onAccent?: string;
}

export interface PdfTypography {
    family: FontFamily;
    /**
     * Multiplicador de toda la escala. 1 es el tamaño de referencia.
     *
     * Es un solo número y no un tamaño por elemento a propósito: la jerarquía
     * la decide el diseño, no el usuario. Lo que el entrenador necesita
     * ajustar es "que se lea más grande", y eso es una escala.
     */
    scale: number;
    /** Titulares en mayúsculas (más rotundo) o como se escribieron. */
    upperHeadings: boolean;
}

export interface PdfHeader {
    /**
     * `bar`      — franja de color con el nombre del club. La más contundente.
     * `minimal`  — solo un filete. La más sobria.
     * `stacked`  — logotipo arriba y datos debajo, centrado. La más editorial.
     */
    style: 'bar' | 'minimal' | 'stacked';
    /** Nombre del club. Si está vacío se usa el del entrenador. */
    title?: string | null;
    /** Una línea bajo el título: lema, web, contacto. */
    subtitle?: string | null;
    showLogo: boolean;
    /**
     * El logotipo YA CONVERTIDO a data URL.
     *
     * No una URL: jsPDF necesita los bytes, y pedirlos a mitad de generar el
     * documento haría que el PDF dependiera de la red justo cuando el coach
     * está esperando la descarga. Lo resuelve `loadLogo()` antes de empezar.
     */
    logoDataUrl?: string | null;
}

export interface PdfLayout {
    /** Cuánto aire. Afecta a márgenes, alto de fila y separaciones. */
    density: 'compact' | 'normal' | 'relaxed';
    /** Notas del entrenador bajo cada ejercicio. */
    showNotes: boolean;
    /** Filete de acento a la izquierda de cada ejercicio. */
    accentBar: boolean;
    /** Fondo alterno en las filas. Apagado por defecto: ver el generador. */
    zebra: boolean;
}

export interface PdfFooter {
    /** Lo que firma el documento. Vacío = el nombre del club. */
    text?: string | null;
    showPageNumbers: boolean;
}

export interface PdfTheme {
    page: PageFormat;
    palette: PdfPalette;
    typography: PdfTypography;
    header: PdfHeader;
    layout: PdfLayout;
    footer: PdfFooter;
}

/** Lo que se guarda en el perfil: siempre parcial, siempre ampliable. */
export type PdfThemeInput = DeepPartial<PdfTheme>;

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object | undefined ? DeepPartial<NonNullable<T[K]>> : T[K];
};

// =====================================================================
// EL TEMA POR DEFECTO
// =====================================================================

/**
 * Papel blanco, tinta casi negra, un solo acento.
 *
 * Las decisiones que sostienen todo lo demás:
 *
 *   · FONDO BLANCO. Un PDF oscuro se ve espectacular en pantalla y es
 *     inservible en papel: vacía un cartucho por hoja y en la mayoría de
 *     impresoras sale gris sucio. Quien quiera oscuro lo tiene en el preset
 *     `carbon`, pero no puede ser lo que reciba todo el mundo por defecto.
 *
 *   · TINTA #16181C Y NO NEGRO PURO. El negro absoluto sobre blanco vibra
 *     en pantalla; un gris muy oscuro se lee igual de firme y descansa.
 *
 *   · UN ACENTO Y NADA MÁS. El color señala tres cosas —la cabecera, el
 *     nombre de la variante y los rótulos de sección— y no aparece en
 *     ningún otro sitio. Es lo que hace que signifique algo.
 */
export const DEFAULT_THEME: PdfTheme = {
    page: 'mobile',
    palette: {
        surface: '#FFFFFF',
        panel: '#F4F5F7',
        ink: '#16181C',
        muted: '#6B7078',
        line: '#DFE2E7',
        accent: '#C81E1E',
    },
    typography: {
        family: 'helvetica',
        scale: 1,
        upperHeadings: true,
    },
    header: {
        style: 'bar',
        title: null,
        subtitle: null,
        showLogo: true,
        logoDataUrl: null,
    },
    layout: {
        density: 'normal',
        showNotes: true,
        accentBar: true,
        // Apagada: las bandas grises sirven para seguir una fila LARGA con la
        // vista, y aquí cada ejercicio es un bloque separado por aire. Con
        // zebra, el documento parece una hoja de cálculo.
        zebra: false,
    },
    footer: {
        text: null,
        showPageNumbers: true,
    },
};

// =====================================================================
// PRESETS
// =====================================================================

export interface PdfPreset {
    key: string;
    label: string;
    hint: string;
    theme: PdfThemeInput;
}

/**
 * Puntos de partida, no jaulas: se elige uno y luego se retoca lo que sea.
 * Cuatro y no doce — un catálogo largo obliga a comparar en vez de elegir.
 */
export const PDF_PRESETS: PdfPreset[] = [
    {
        key: 'anvil',
        label: 'Anvil',
        hint: 'Papel blanco, acento rojo, cabecera con franja.',
        theme: {},
    },
    {
        key: 'minimal',
        label: 'Mínimo',
        hint: 'Sin color. Solo tipografía y filetes.',
        theme: {
            palette: { accent: '#16181C', panel: '#F7F7F8', line: '#E4E4E7' },
            header: { style: 'minimal' },
            layout: { accentBar: false, density: 'relaxed' },
        },
    },
    {
        key: 'editorial',
        label: 'Editorial',
        hint: 'Tipografía con remates y cabecera centrada.',
        theme: {
            typography: { family: 'times', scale: 1.05 },
            header: { style: 'stacked' },
            layout: { density: 'relaxed', accentBar: false },
        },
    },
    {
        key: 'carbon',
        label: 'Carbón',
        hint: 'Fondo oscuro. Pensado para leer en pantalla, no para imprimir.',
        theme: {
            palette: {
                surface: '#111317',
                panel: '#1B1E24',
                ink: '#F4F5F7',
                muted: '#9BA1AC',
                line: '#2C3038',
            },
            layout: { zebra: false },
        },
    },
];

// =====================================================================
// RESOLUCIÓN
// =====================================================================

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** Mezcla profunda. Lo que no venga en el parcial se queda como estaba. */
function merge<T>(base: T, patch: unknown): T {
    if (!isObject(patch)) return base;
    const out = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        out[key] = isObject(value) && isObject(out[key])
            ? merge(out[key], value)
            : value;
    }
    return out as T;
}

/** #RGB o #RRGGBB a [r,g,b]. Devuelve null si no es un color válido. */
export function hexToRgb(hex: string): [number, number, number] | null {
    const clean = hex.trim().replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
    ];
}

/**
 * Qué color de texto va encima de un fondo.
 *
 * Luminancia relativa con los coeficientes de la W3C, no la media de los
 * canales: el ojo ve el verde mucho más claro que el azul, y promediar
 * pinta texto negro sobre azul marino. Umbral 0,6 y no 0,5 porque el texto
 * blanco aguanta mejor sobre un fondo medio que el negro.
 */
export function readableOn(hex: string): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return '#FFFFFF';
    const [r, g, b] = rgb.map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.6 ? '#16181C' : '#FFFFFF';
}

/**
 * Convierte lo que hay guardado en un tema completo y usable.
 *
 * Es la única puerta: el generador nunca recibe un parcial, así que no tiene
 * que preguntarse si un campo existe. Y aquí es donde un tema guardado antes
 * de que un campo existiera se rellena solo.
 */
export function resolveTheme(input?: PdfThemeInput | null): PdfTheme {
    const theme = merge(DEFAULT_THEME, input ?? {});

    // Un color inválido —copiado a mano, o de un preset viejo— no puede
    // reventar la descarga: se cae al del tema por defecto.
    const palette = { ...theme.palette };
    (Object.keys(palette) as (keyof PdfPalette)[]).forEach(key => {
        const value = palette[key];
        if (typeof value === 'string' && !hexToRgb(value)) {
            palette[key] = DEFAULT_THEME.palette[key] as string;
        }
    });

    return {
        ...theme,
        palette: {
            ...palette,
            onAccent: palette.onAccent ?? readableOn(palette.accent),
        },
        typography: {
            ...theme.typography,
            // Fuera de 0,85–1,25 la maqueta deja de cuadrar: o los rótulos se
            // solapan o las cifras no caben en su celda.
            scale: Math.min(1.25, Math.max(0.85, theme.typography.scale || 1)),
        },
    };
}

/** Aplica un preset sobre el tema por defecto. */
export function themeFromPreset(key: string): PdfTheme {
    const preset = PDF_PRESETS.find(p => p.key === key);
    return resolveTheme(preset?.theme ?? {});
}

// =====================================================================
// LOGOTIPO
// =====================================================================

/**
 * Descarga el logotipo y lo convierte a data URL para jsPDF.
 *
 * Devuelve `null` ante cualquier problema —sin red, CORS, formato raro— en
 * vez de lanzar: que el logotipo no cargue no puede impedir que el atleta
 * reciba su entrenamiento. El documento sale sin él y ya está.
 */
export async function loadLogo(url?: string | null): Promise<string | null> {
    if (!url) return null;
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) return null;

        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) return null;
        // Un logotipo enorme incrustado en cada PDF los engorda sin que se
        // note en pantalla: por encima de 2 MB se descarta.
        if (blob.size > 2_000_000) return null;

        return await new Promise<string | null>(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}
