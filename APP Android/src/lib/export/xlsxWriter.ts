/**
 * ANVIL STRENGTH — UN ESCRITOR MÍNIMO DE .XLSX
 * =====================================================================
 *
 * POR QUÉ ESTO Y NO UNA LIBRERÍA
 *
 * Las librerías de hoja de cálculo pesan entre 400 KB y 1 MB, y esta aplicación
 * ya carga 670 KB de OpenCV en la misma pantalla. Un `.xlsx` es, por dentro, un
 * ZIP con cuatro ficheros XML; escribirlo entero cuesta menos código que
 * configurar la librería, y no añade nada al paquete de quien nunca exporta.
 *
 * Se escribe SIN COMPRIMIR (método «store»). Un ZIP admite entradas sin
 * comprimir y Excel las abre igual, así que no hace falta implementar Deflate.
 * El coste es tamaño: un informe de veinte repeticiones ocupa unos 12 KB en vez
 * de 4. Para un fichero que se descarga una vez y se abre, no importa.
 *
 *
 * POR QUÉ NO UN CSV RENOMBRADO A .XLS
 *
 * Es lo que hace medio internet y es una mentira que se paga: Excel avisa de
 * que el formato no coincide con la extensión, y el usuario aprende a ignorar
 * ese aviso. Además un CSV no tiene hojas, y este informe son tres cosas
 * distintas —los metadatos, el resumen y la tabla por repetición— que en una
 * sola hoja quedan apelotonadas.
 *
 *
 * LO QUE **NO** HACE
 *
 * Ni fórmulas, ni gráficas, ni formatos de número, ni anchos de columna
 * calculados, ni colores. Solo texto, números y negrita en las cabeceras. Si
 * algún día hace falta más, ese es el momento de plantearse la librería — no
 * antes.
 */

// =====================================================================
// ZIP
// =====================================================================

/** Tabla de CRC-32, construida una vez. */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
    name: string;
    data: Uint8Array;
    crc: number;
    offset: number;
}

/**
 * Empaqueta ficheros en un ZIP sin comprimir.
 *
 * Las fechas van todas a la misma marca fija en lugar de a la hora actual: así
 * el mismo informe produce el mismo fichero byte a byte, que es lo que permite
 * compararlos y lo que evita que un ZIP «cambie» sin que hayan cambiado los
 * datos.
 */
export function zipStore(files: { name: string; content: string }[]): Blob {
    const encoder = new TextEncoder();
    const entries: ZipEntry[] = [];
    const chunks: Uint8Array[] = [];
    let offset = 0;

    // 1 de enero de 2020, 00:00, en formato MS-DOS.
    const DOS_TIME = 0;
    const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
    /** Bit 11: los nombres van en UTF-8. */
    const FLAG_UTF8 = 0x0800;

    const push = (bytes: Uint8Array) => { chunks.push(bytes); offset += bytes.length; };

    const header = (size: number) => {
        const buffer = new ArrayBuffer(size);
        return { view: new DataView(buffer), bytes: new Uint8Array(buffer) };
    };

    for (const file of files) {
        const nameBytes = encoder.encode(file.name);
        const data = encoder.encode(file.content);
        const crc = crc32(data);

        const { view, bytes } = header(30);
        view.setUint32(0, 0x04034b50, true);   // firma de cabecera local
        view.setUint16(4, 20, true);           // versión necesaria
        view.setUint16(6, FLAG_UTF8, true);
        view.setUint16(8, 0, true);            // método 0 = sin comprimir
        view.setUint16(10, DOS_TIME, true);
        view.setUint16(12, DOS_DATE, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, data.length, true); // tamaño comprimido
        view.setUint32(22, data.length, true); // tamaño original
        view.setUint16(26, nameBytes.length, true);
        view.setUint16(28, 0, true);           // sin campo extra

        entries.push({ name: file.name, data, crc, offset });
        push(bytes);
        push(nameBytes);
        push(data);
    }

    const centralStart = offset;

    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        const { view, bytes } = header(46);
        view.setUint32(0, 0x02014b50, true);   // firma del directorio central
        view.setUint16(4, 20, true);           // versión con la que se creó
        view.setUint16(6, 20, true);           // versión necesaria
        view.setUint16(8, FLAG_UTF8, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, DOS_TIME, true);
        view.setUint16(14, DOS_DATE, true);
        view.setUint32(16, entry.crc, true);
        view.setUint32(20, entry.data.length, true);
        view.setUint32(24, entry.data.length, true);
        view.setUint16(28, nameBytes.length, true);
        view.setUint16(30, 0, true);           // extra
        view.setUint16(32, 0, true);           // comentario
        view.setUint16(34, 0, true);           // disco inicial
        view.setUint16(36, 0, true);           // atributos internos
        view.setUint32(38, 0, true);           // atributos externos
        view.setUint32(42, entry.offset, true);

        push(bytes);
        push(nameBytes);
    }

    const centralSize = offset - centralStart;

    const { view, bytes } = header(22);
    view.setUint32(0, 0x06054b50, true);       // fin del directorio central
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralStart, true);
    view.setUint16(20, 0, true);               // sin comentario
    push(bytes);

    return new Blob(chunks as BlobPart[], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

// =====================================================================
// XLSX
// =====================================================================

/** Una celda: texto, número, o vacía. */
export type Cell = string | number | null;

export interface Sheet {
    /** Nombre de la pestaña. Excel no admite `[]:*?/\` ni más de 31 caracteres. */
    name: string;
    /** La primera fila se pinta en negrita si `headerRow` es `true`. */
    headerRow?: boolean;
    rows: Cell[][];
}

/** Escapa lo que no puede ir crudo dentro de un XML. */
function xmlEscape(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        // Los caracteres de control son ILEGALES en XML 1.0 —ni siquiera
        // escapados— y Excel se niega a abrir el fichero entero por uno solo.
        // Es el tipo de dato que se cuela desde el nombre de un atleta pegado
        // de otra aplicación.
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** `0 → A`, `25 → Z`, `26 → AA`. */
function columnName(index: number): string {
    let name = '';
    let n = index;
    while (n >= 0) {
        name = String.fromCharCode(65 + (n % 26)) + name;
        n = Math.floor(n / 26) - 1;
    }
    return name;
}

/** Deja el nombre de hoja como Excel lo admite. */
function safeSheetName(name: string, fallback: string): string {
    const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
    return cleaned || fallback;
}

function sheetXml(sheet: Sheet): string {
    const rows = sheet.rows.map((cells, rowIndex) => {
        const r = rowIndex + 1;
        const bold = sheet.headerRow && rowIndex === 0;

        const body = cells.map((cell, columnIndex) => {
            const ref = `${columnName(columnIndex)}${r}`;
            const style = bold ? ' s="1"' : '';

            if (cell === null || cell === undefined || cell === '') {
                // Una celda vacía se escribe vacía, no como "0" ni como "-".
                // En una hoja de cálculo un hueco significa «no se midió», y un
                // cero significa cero: confundirlos falsea cualquier media.
                return `<c r="${ref}"${style}/>`;
            }
            if (typeof cell === 'number' && Number.isFinite(cell)) {
                return `<c r="${ref}"${style}><v>${cell}</v></c>`;
            }
            return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(cell))}</t></is></c>`;
        }).join('');

        return `<row r="${r}">${body}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData>${rows}</sheetData></worksheet>`;
}

/**
 * Construye un `.xlsx` con las hojas dadas.
 *
 * Las cadenas van «en línea» (`inlineStr`) en vez de por la tabla de cadenas
 * compartidas: ocupa algo más, pero ahorra una pieza entera del formato y con
 * ella toda una clase de fallo —un índice mal calculado deja el fichero abierto
 * con las etiquetas cambiadas de sitio, que es peor que no abrirse—.
 */
export function buildXlsx(sheets: Sheet[]): Blob {
    const usable = sheets.length > 0 ? sheets : [{ name: 'Hoja1', rows: [] }];

    const names = usable.map((sheet, i) => safeSheetName(sheet.name, `Hoja${i + 1}`));

    const contentTypes =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        usable.map((_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        ).join('') +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`;

    const rootRels =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`;

    const workbook =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        names.map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        `</sheets></workbook>`;

    // Los estilos van con el identificador SIGUIENTE al de la última hoja: si
    // se reutilizara uno, Excel resolvería la hoja hacia los estilos y no
    // abriría el fichero.
    const stylesRelId = `rId${usable.length + 1}`;

    const workbookRels =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        usable.map((_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        ).join('') +
        `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`;

    // Dos estilos: el 0 normal y el 1 en negrita, que es el de las cabeceras.
    const styles =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
        `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill>` +
        `<fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border/></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
        `</styleSheet>`;

    return zipStore([
        { name: '[Content_Types].xml', content: contentTypes },
        { name: '_rels/.rels', content: rootRels },
        { name: 'xl/workbook.xml', content: workbook },
        { name: 'xl/_rels/workbook.xml.rels', content: workbookRels },
        { name: 'xl/styles.xml', content: styles },
        ...usable.map((sheet, i) => ({
            name: `xl/worksheets/sheet${i + 1}.xml`,
            content: sheetXml(sheet),
        })),
    ]);
}
