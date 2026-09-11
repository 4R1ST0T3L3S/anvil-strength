import { IMAGEN_CALIDAD, dimensionesImagen } from './limites';

/**
 * FOTOS: REESCALAR Y RECOMPRIMIR EN EL NAVEGADOR, ANTES DE SUBIR
 * =====================================================================
 *
 * Una foto del móvil son 12 megapíxeles y 3-5 MB. Para verla en un chat —y
 * para leer una etiqueta o una hoja de gimnasio— bastan 2048 px de lado
 * largo. Se decodifica con `createImageBitmap` (que además aplica la
 * orientación EXIF, así las fotos verticales no salen tumbadas) y se
 * recomprime a WebP, o a JPEG donde WebP no se pueda escribir (Safari viejo).
 *
 * Los HEIC del iPhone: el navegador no los decodifica. Se intenta y, si
 * falla, se explica en vez de subir un fichero que nadie podrá abrir.
 */

export interface ImagenPreparada {
    file: File;
    width: number;
    height: number;
    /** URL de objeto para la vista previa. Quien la use la revoca. */
    previewUrl: string;
}

async function decodificar(file: File): Promise<ImageBitmap> {
    try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
        // Algún navegador no admite la opción: se intenta sin ella.
        return createImageBitmap(file);
    }
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, tipo, calidad));
}

export async function prepararImagen(file: File, ladoMax?: number): Promise<ImagenPreparada> {
    let bitmap: ImageBitmap;
    try {
        bitmap = await decodificar(file);
    } catch {
        throw new Error(
            /hei[cf]/i.test(file.name) || /hei[cf]/i.test(file.type)
                ? 'Este navegador no puede abrir fotos HEIC. En el iPhone, Ajustes → Cámara → Formatos → «Más compatible», o elige la foto desde la galería para que se convierta.'
                : 'No se ha podido leer la imagen.'
        );
    }

    const { ancho, alto } = dimensionesImagen(bitmap.width, bitmap.height, ladoMax);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        bitmap.close();
        throw new Error('No se ha podido procesar la imagen.');
    }
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    // WebP primero; si el navegador devuelve PNG (no sabe escribir WebP), JPEG.
    let blob = await aBlob(canvas, 'image/webp', IMAGEN_CALIDAD);
    let tipo = 'image/webp';
    if (!blob || blob.type !== 'image/webp') {
        blob = await aBlob(canvas, 'image/jpeg', IMAGEN_CALIDAD);
        tipo = 'image/jpeg';
    }
    if (!blob) throw new Error('No se ha podido comprimir la imagen.');

    // Si el "comprimido" pesa más que el original (una captura ya optimizada
    // y más pequeña que 2048), se manda el original.
    const usarOriginal = blob.size >= file.size && (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp');
    const salida = usarOriginal
        ? file
        : new File([blob], file.name.replace(/\.[^.]+$/, '') + (tipo === 'image/webp' ? '.webp' : '.jpg'), { type: tipo });

    return { file: salida, width: ancho, height: alto, previewUrl: URL.createObjectURL(salida) };
}
