import { supabase } from '../lib/supabase';
import type { ChatAttachment } from './chatService';
import { carpetaDeConversacion } from './chatService';
import { extensionPara, mimeBase, tipoDeAdjunto, TAMANO_MAX_SUBIDA, formatearTamano } from '../lib/media/limites';

/**
 * ANVIL STRENGTH — ADJUNTOS DEL CHAT
 * =====================================================================
 *
 * Bucket PRIVADO `chat-media` + URLs firmadas de vida corta. Nunca una URL
 * pública: aquí viajan vídeos de series y fotos personales.
 *
 * Ruta: `{idMenor}__{idMayor}/{uuid}.{ext}`. Los dos UUID ordenados forman la
 * carpeta, así que la política de Storage autoriza mirando solo el nombre
 * (ver `chat_folder_member` / `chat_folder_can_write` en la migración).
 *
 * LA SUBIDA LLEVA PROGRESO. `supabase.storage.upload` usa `fetch`, que no
 * informa del progreso; un vídeo de 25 MB en una conexión de gimnasio puede
 * tardar un minuto y una barra parada se lee como "se ha colgado". Por eso
 * se pide una URL firmada de subida y se hace el PUT con `XMLHttpRequest`,
 * que sí lo cuenta.
 */

const BUCKET = 'chat-media';
/** Vida de la URL firmada: suficiente para leer el chat, corta para compartir. */
const TTL_FIRMA_S = 60 * 60;

export interface SubidaOpciones {
    onProgreso?: (fraccion: number) => void;
    signal?: AbortSignal;
}

function nombreAleatorio(ext: string): string {
    return `${crypto.randomUUID()}.${ext}`;
}

async function subirConProgreso(path: string, file: File | Blob, contentType: string, opciones: SubidaOpciones): Promise<void> {
    // 1. Token de subida firmado (la RLS del bucket decide si se concede).
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
        // Sin token, el PUT no es posible: se cae a la subida normal.
        const r = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
        if (r.error) throw traducirError(r.error);
        return;
    }

    // 2. PUT con progreso.
    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', data.signedUrl, true);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.upload.onprogress = e => {
            if (e.lengthComputable) opciones.onProgreso?.(e.loaded / e.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(xhr.status === 413 ? 'El archivo es demasiado grande.' : `No se ha podido subir (${xhr.status}).`));
        };
        xhr.onerror = () => reject(new Error('Sin conexión al subir el archivo.'));
        xhr.onabort = () => reject(new DOMException('Cancelado', 'AbortError'));
        opciones.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
        xhr.send(file);
    });
}

function traducirError(error: { message?: string; statusCode?: string | number }): Error {
    const msg = error.message ?? '';
    if (/row-level security|policy|403|Unauthorized/i.test(msg)) return new Error('Solo puedes enviar archivos a tu entrenador o a tus atletas.');
    if (/exceeded|too large|413/i.test(msg)) return new Error('El archivo es demasiado grande.');
    if (/mime|not allowed|415/i.test(msg)) return new Error('Ese tipo de archivo no se puede enviar.');
    if (/Bucket not found/i.test(msg)) return new Error('El almacén del chat no está preparado (falta ejecutar la migración).');
    return new Error(msg || 'No se ha podido subir el archivo.');
}

export const chatMediaService = {
    /**
     * Sube un fichero ya PREPARADO (comprimido, recodificado) y devuelve el
     * adjunto para guardar en el mensaje.
     */
    async subir(
        file: File,
        me: string,
        other: string,
        meta: { name?: string; duration_s?: number; width?: number; height?: number; poster?: File | null } = {},
        opciones: SubidaOpciones = {}
    ): Promise<ChatAttachment> {
        if (file.size > TAMANO_MAX_SUBIDA) {
            throw new Error(`El archivo pesa ${formatearTamano(file.size)}; el máximo son ${formatearTamano(TAMANO_MAX_SUBIDA)}.`);
        }
        const carpeta = carpetaDeConversacion(me, other);
        const mime = mimeBase(file.type) || 'application/octet-stream';
        const kind = tipoDeAdjunto(mime, file.name);
        if (kind === 'file' && !meta.name) meta.name = file.name;
        const path = `${carpeta}/${nombreAleatorio(extensionPara(mime, file.name))}`;

        await subirConProgreso(path, file, mime, opciones);

        const adjunto: ChatAttachment = {
            path,
            kind,
            mime,
            size: file.size,
            ...(meta.name ? { name: meta.name.slice(0, 120) } : {}),
            ...(meta.duration_s != null ? { duration_s: Math.round(meta.duration_s * 10) / 10 } : {}),
            ...(meta.width ? { width: meta.width } : {}),
            ...(meta.height ? { height: meta.height } : {}),
        };

        // El póster va después y sin bloquear el envío: si falla, el vídeo
        // sigue siendo válido y solo se ve sin miniatura.
        if (meta.poster) {
            try {
                const posterPath = `${carpeta}/${nombreAleatorio('webp')}`;
                const { error } = await supabase.storage.from(BUCKET).upload(posterPath, meta.poster, {
                    contentType: meta.poster.type || 'image/webp',
                    upsert: false,
                });
                if (!error) adjunto.poster_path = posterPath;
            } catch { /* sin póster */ }
        }

        return adjunto;
    },

    /** Firma UNA ruta. Con caché por React Query (ver `useAdjuntoUrl`). */
    async firmar(path: string): Promise<string | null> {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_FIRMA_S);
        if (error || !data?.signedUrl) return null;
        return data.signedUrl;
    },

    /** Firma varias rutas de golpe: al abrir un hilo con fotos. */
    async firmarVarias(paths: string[]): Promise<Record<string, string>> {
        const unicas = [...new Set(paths.filter(Boolean))];
        if (unicas.length === 0) return {};
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unicas, TTL_FIRMA_S);
        if (error) return {};
        const mapa: Record<string, string> = {};
        for (const fila of data ?? []) {
            if (fila.signedUrl && fila.path) mapa[fila.path] = fila.signedUrl;
        }
        return mapa;
    },

    /** Borra lo propio (una subida cancelada a medias). */
    async borrar(paths: string[]): Promise<void> {
        if (paths.length === 0) return;
        await supabase.storage.from(BUCKET).remove(paths);
    },
};
