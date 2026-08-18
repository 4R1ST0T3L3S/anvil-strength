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
 * Y es lo que permite lo de `pdfTemplateScan.ts`: leer el PDF que el coach
 * ya usaba, deducir sus colores, su tipografía y su rejilla, y volcarlo
 * TODO aquí. Copiar una plantilla ajena es rellenar este objeto.
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
 * `a4`     — la hoja de siempre. Es el formato por defecto porque es el que
 *            usan las plantillas que los entrenadores ya reparten: se
 *            imprime, se cuelga del banco y se raya con boli.
 *
 * `mobile` — 9:16, la proporción de la pantalla de un móvil. El atleta abre
 *            el PDF en el teléfono, entre series, y una página 9:16 le entra
 *            ENTERA sin pellizcar ni girar. Va con la maqueta de bloques.
 *
 * `custom` — el tamaño exacto del PDF que el entrenador subió como modelo.
 *            Cartas americanas, hojas cuadradas, lo que sea: copiar una
 *            plantilla incluye copiar su papel.
 */
export type PageFormat = 'mobile' | 'a4' | 'custom';

/** Dimensiones en milímetros. jsPDF trabaja en mm en todo el generador. */
export const PAGE_SIZES: Record<'mobile' | 'a4', { w: number; h: number; label: string }> = {
    a4: { w: 210, h: 297, label: 'A4' },
    // 210 x 373.3 = exactamente 9:16. Se mantiene el ancho del A4 para que
    // los cuerpos de texto midan lo mismo y la maqueta no haya que reajustarla
    // al cambiar de formato: lo único que cambia es cuánto cabe a lo largo.
    mobile: { w: 210, h: 373.3, label: 'Móvil (9:16)' },
};

/**
 * El papel de un tema ya resuelto.
 *
 * Se pasa por aquí y no se lee `PAGE_SIZES[page]` a pelo porque `custom` no
 * está en esa tabla: su tamaño viaja en el propio tema. Los topes evitan que
 * un escaneo raro —una página de 3 metros— reviente la generación.
 */
export function pageDimensions(theme: { page: PageFormat; pageSize?: { w: number; h: number } | null }): { w: number; h: number } {
    if (theme.page === 'custom' && theme.pageSize) {
        const w = Math.min(600, Math.max(80, theme.pageSize.w));
        const h = Math.min(900, Math.max(80, theme.pageSize.h));
        return { w, h };
    }
    return PAGE_SIZES[theme.page as 'mobile' | 'a4'] ?? PAGE_SIZES.a4;
}

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
 *
 * Cuando se copia un PDF ajeno, su fuente real se clasifica en una de estas
 * tres (ver `classifyFont` en pdfTemplateScan.ts). No es la misma letra,
 * pero sí el mismo GÉNERO de letra, que es lo que se nota de un vistazo.
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
    /** Filetes, separadores y la rejilla de la tabla. */
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
     * `stacked`  — logotipo arriba y datos debajo, centrado. La más editorial,
     *              y la de la hoja de siempre: el yunque presidiendo la página.
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
    /**
     * Alto del logotipo en milímetros, cuando la cabecera es `stacked`.
     *
     * Existe porque al copiar una plantilla se mide el logotipo REAL del
     * entrenador en su hoja, y ahí un yunque de 19 mm y uno de 30 mm son dos
     * documentos distintos. `null` = el alto que decida la maqueta.
     */
    logoHeight?: number | null;
}

export interface PdfLayout {
    /**
     * LA MAQUETA. Es la decisión más grande del documento.
     *
     * `table`  — la hoja de entrenamiento de toda la vida: una rejilla con
     *            una fila por ejercicio y una columna por dato, la caja de
     *            indicaciones debajo y el pie enmarcado. Es lo que el coach
     *            ya reparte en papel y lo que el atleta reconoce, así que es
     *            la de por defecto.
     *
     * `blocks` — un bloque por ejercicio, el nombre a ancho completo y las
     *            cifras debajo con su rótulo. Se lee de arriba abajo, que es
     *            como se lee un teléfono. Para quien no imprime nada.
     */
    sheet: 'table' | 'blocks';
    /** Cuánto aire. Afecta a márgenes, alto de fila y separaciones. */
    density: 'compact' | 'normal' | 'relaxed';
    /** Notas del entrenador bajo cada ejercicio. */
    showNotes: boolean;
    /** Filete de acento a la izquierda de cada ejercicio (maqueta `blocks`). */
    accentBar: boolean;
    /** Fondo alterno en las filas. Apagado por defecto: ver el generador. */
    zebra: boolean;
}

/**
 * UNA COLUMNA DE LA HOJA.
 *
 * `key` dice QUÉ dato se imprime; `label` cómo se llama en la cabecera de la
 * tabla. Van separados porque cada entrenador rotula a su manera —"CARGA",
 * "KG/INTENSIDAD", "PESO"— y eso no puede obligar a tocar el generador.
 *
 * `blank` es la pieza que hace que copiar una plantilla ajena funcione de
 * verdad: la columna existe, se dibuja, se rotula y se deja VACÍA. Si el
 * coach tenía una columna de "RPE REAL" o de "✓" para marcar la serie hecha,
 * su hoja la sigue teniendo aunque Anvil no sepa qué meter dentro.
 */
export interface PdfSheetColumn {
    key: 'name' | 'series' | 'reps' | 'rest' | 'intensity' | 'blank';
    label: string;
    /** Peso relativo del ancho. Se normaliza sobre la suma de todas. */
    width: number;
}

export interface PdfSheet {
    /** Rótulos de los campos de la cabecera. Vacío = no se imprime el campo. */
    dayLabel: string;
    athleteLabel: string;
    blockLabel: string;
    columns: PdfSheetColumn[];
    /**
     * Alto mínimo de fila, en unidades de rejilla.
     *
     * En una plantilla de papel las filas son ENORMES —tres centímetros— y no
     * es un descuido: ahí se apunta a mano el peso que salió. Se conserva.
     */
    rowUnits: number;
    /**
     * Estirar las filas hasta llenar la hoja cuando el día cabe entero.
     *
     * Sin esto, un día de tres ejercicios deja media página en blanco y la
     * tabla parece cortada. Con esto, la hoja siempre se ve completa, igual
     * que la plantilla impresa.
     */
    stretchRows: boolean;
    /** La caja de texto libre bajo la tabla. */
    notesBox: { show: boolean; label: string };
    /** El recuadro del pie. */
    footerBox: { show: boolean; label: string };
    /** Grosor de la rejilla, en milímetros. */
    rule: number;
}

export interface PdfFooter {
    /** Lo que firma el documento. Vacío = el nombre del club. */
    text?: string | null;
    showPageNumbers: boolean;
}

export interface PdfTheme {
    page: PageFormat;
    /** Solo cuando `page` es `custom`. En milímetros. */
    pageSize?: { w: number; h: number } | null;
    palette: PdfPalette;
    typography: PdfTypography;
    header: PdfHeader;
    layout: PdfLayout;
    sheet: PdfSheet;
    footer: PdfFooter;
}

/** Lo que se guarda en el perfil: siempre parcial, siempre ampliable. */
export type PdfThemeInput = DeepPartial<PdfTheme>;

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends (infer U)[]
        ? U[]
        : T[K] extends object | undefined
            ? DeepPartial<NonNullable<T[K]>>
            : T[K];
};

// =====================================================================
// LAS COLUMNAS DE SIEMPRE
// =====================================================================

/**
 * Los rótulos de la hoja que el club ya reparte, literales.
 *
 * Los anchos no son redondos porque están MEDIDOS sobre esa hoja: el nombre
 * del ejercicio se lleva casi un tercio y las cuatro cifras se reparten el
 * resto sin que ninguna quede tan estrecha que "2'30\"" no le entre.
 */
export const DEFAULT_COLUMNS: PdfSheetColumn[] = [
    { key: 'name', label: 'Nombre de ejercicio', width: 30.5 },
    { key: 'series', label: 'Series', width: 14.5 },
    { key: 'reps', label: 'Repeticiones', width: 19 },
    { key: 'rest', label: 'Descanso', width: 17 },
    { key: 'intensity', label: 'Kg/Intensidad', width: 19 },
];

// =====================================================================
// EL TEMA POR DEFECTO
// =====================================================================

/**
 * LA PIZARRA: fondo negro, rejilla blanca, el yunque arriba.
 *
 * Es la hoja que el club ya imprime y reparte, y por eso es la de por
 * defecto: el atleta que recibe el PDF ve EL MISMO documento que tiene
 * pegado en la nevera, no una versión "de la app". Que la aplicación no
 * imponga su propio diseño encima del de nadie es la mitad de esto.
 *
 * Las decisiones que sostienen todo lo demás:
 *
 *   · FONDO NEGRO. Se sabe lo que cuesta imprimirlo —vacía un cartucho por
 *     hoja— y aun así manda, porque este documento se mira en el móvil
 *     mucho más de lo que se imprime, y porque es la hoja de la casa. Quien
 *     imprima tiene el preset `papel` a un clic, mismo diseño en blanco.
 *
 *   · REJILLA BLANCA Y FINA. 0,35 mm: se ve como un filete, no como un
 *     borde. Es lo que separa una hoja de entrenamiento de una tabla de
 *     Excel.
 *
 *   · FILAS ALTAS. 5,5 unidades = 22 mm de mínimo. En la hoja de papel son
 *     tres centímetros porque ahí se apunta a mano lo que salió; aquí se
 *     conserva la proporción aunque la fila ya venga rellena.
 *
 *   · UN ACENTO Y NADA MÁS. El color de la marca señala la variante del
 *     ejercicio y poco más. Es lo que hace que signifique algo.
 */
export const DEFAULT_THEME: PdfTheme = {
    page: 'a4',
    pageSize: null,
    palette: {
        surface: '#0F1012',
        panel: '#191B1F',
        ink: '#FFFFFF',
        muted: '#A6ABB3',
        line: '#FFFFFF',
        accent: '#C81E1E',
    },
    typography: {
        family: 'helvetica',
        scale: 1,
        upperHeadings: true,
    },
    header: {
        style: 'stacked',
        title: null,
        subtitle: null,
        showLogo: true,
        logoDataUrl: null,
        logoHeight: null,
    },
    layout: {
        sheet: 'table',
        density: 'normal',
        showNotes: true,
        accentBar: true,
        // Apagada: las bandas grises sirven para seguir una fila LARGA con la
        // vista, y aquí la rejilla ya guía el ojo. Con zebra, el documento
        // parece una hoja de cálculo.
        zebra: false,
    },
    sheet: {
        dayLabel: 'Día',
        athleteLabel: 'Nombre',
        blockLabel: 'Información bloque',
        columns: DEFAULT_COLUMNS,
        rowUnits: 5.5,
        stretchRows: true,
        notesBox: { show: true, label: 'Indicaciones y calentamiento' },
        footerBox: { show: true, label: '' },
        rule: 0.35,
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
        key: 'pizarra',
        label: 'Pizarra',
        hint: 'La hoja de siempre: fondo negro, rejilla blanca, yunque arriba.',
        theme: {},
    },
    {
        key: 'papel',
        label: 'Papel',
        hint: 'La misma hoja en blanco, para imprimir sin vaciar el cartucho.',
        theme: {
            palette: {
                surface: '#FFFFFF',
                panel: '#F4F5F7',
                ink: '#16181C',
                muted: '#6B7078',
                line: '#16181C',
            },
        },
    },
    {
        key: 'minimo',
        label: 'Mínimo',
        hint: 'Papel blanco, sin color y con la rejilla al mínimo.',
        theme: {
            palette: {
                surface: '#FFFFFF',
                panel: '#F7F7F8',
                ink: '#16181C',
                muted: '#6B7078',
                line: '#C9CCD2',
                accent: '#16181C',
            },
            header: { style: 'minimal' },
            layout: { density: 'relaxed' },
            sheet: { rule: 0.2, rowUnits: 4 },
        },
    },
    {
        key: 'movil',
        label: 'Móvil',
        hint: 'Un bloque por ejercicio en formato 9:16. Sin tabla, para leer en el gimnasio.',
        theme: {
            page: 'mobile',
            palette: {
                surface: '#FFFFFF',
                panel: '#F4F5F7',
                ink: '#16181C',
                muted: '#6B7078',
                line: '#DFE2E7',
            },
            header: { style: 'bar' },
            layout: { sheet: 'blocks', accentBar: true },
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
        // Las listas se sustituyen enteras, nunca se funden posición a
        // posición: las columnas de una plantilla copiada no tienen nada que
        // ver con las de por defecto, y mezclarlas daría una tabla híbrida
        // que no es la de nadie.
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

/** [r,g,b] a "#RRGGBB". El camino de vuelta, para lo que se deduce de un PDF. */
export function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return `#${[r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
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
    const luminance = relativeLuminance(rgb);
    return luminance > 0.6 ? '#16181C' : '#FFFFFF';
}

/** Luminancia relativa W3C de un [r,g,b] de 0 a 255. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
    const [lr, lg, lb] = [r, g, b].map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Interpola dos colores. `t` = 0 devuelve `a`; `t` = 1, `b`. */
export function mixHex(a: string, b: string, t: number): string {
    const ca = hexToRgb(a) ?? [0, 0, 0];
    const cb = hexToRgb(b) ?? [255, 255, 255];
    return rgbToHex(
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t,
    );
}

/** Saneado de una lista de columnas venida de fuera (un tema guardado, un escaneo). */
function resolveColumns(input: unknown): PdfSheetColumn[] {
    if (!Array.isArray(input) || input.length === 0) return DEFAULT_COLUMNS;

    const valid: PdfSheetColumn['key'][] = ['name', 'series', 'reps', 'rest', 'intensity', 'blank'];
    const columns = input
        .filter(isObject)
        .map(c => ({
            key: valid.includes(c.key as PdfSheetColumn['key']) ? (c.key as PdfSheetColumn['key']) : 'blank',
            label: typeof c.label === 'string' ? c.label.slice(0, 32) : '',
            width: typeof c.width === 'number' && c.width > 0 ? Math.min(80, c.width) : 15,
        }))
        // Más de ocho columnas en 190 mm son celdas de dos centímetros donde
        // no entra "2'30\"". Antes de dejar salir un documento ilegible se
        // recorta: lo que sobra es siempre lo de más a la derecha.
        .slice(0, 8);

    return columns.length > 0 ? columns : DEFAULT_COLUMNS;
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
        sheet: {
            ...theme.sheet,
            columns: resolveColumns(theme.sheet?.columns),
            rowUnits: Math.min(14, Math.max(2.6, theme.sheet?.rowUnits || DEFAULT_THEME.sheet.rowUnits)),
            rule: Math.min(1.2, Math.max(0.1, theme.sheet?.rule || DEFAULT_THEME.sheet.rule)),
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
    // Un logotipo ya extraído de un PDF llega como data URL: ya son los
    // bytes, no hay nada que descargar.
    if (url.startsWith('data:')) return url;
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
