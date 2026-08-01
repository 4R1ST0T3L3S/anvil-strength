import { supabase } from '../lib/supabase';

/**
 * ANVIL STRENGTH — ADJUNTOS DEL CHAT
 *
 * Bucket PRIVADO + URLs firmadas de vida corta. Nada de URLs públicas: aquí
 * viajan vídeos de series, notas de voz y a veces fotos de una lesión.
 *
 * Lo que hace que esto sea barato es la compresión EN EL CLIENTE, antes de
 * subir. Sin ella, un vídeo de móvil son 80 MB; con ella, una nota de voz de
 * un minuto ocupa ~180 KB y una foto ~200 KB. Con 50 atletas activos el coste
 * de almacenamiento son céntimos al mes.
 *
 * Ver database/chat_media.sql para el bucket y las políticas.
 */

export type AttachmentKind = 'image' | 'audio' | 'video';

export interface Attachment {
    /** Clave dentro del bucket. NUNCA una URL: las URLs se firman al mostrar. */
    path: string;
    kind: AttachmentKind;
    mime: string;
    size: number;
    duration_s?: number;
    width?: number;
    height?: number;
    poster_path?: string;
}

const BUCKET = 'chat-media';

/** Vida de la URL firmada. Suficiente para leer el chat sin dejar un enlace
 *  compartible indefinidamente si alguien copia la dirección. */
const SIGNED_URL_TTL = 60 * 60;

/**
 * Carpeta de la conversación: los dos UUID ordenados.
 *
 * Ordenarlos hace que (A,B) y (B,A) den la misma carpeta, y por eso la
 * política de Storage puede autorizar mirando solo el nombre del archivo,
 * sin consultar la tabla de mensajes en cada descarga.
 */
export function chatFolder(a: string, b: string): string {
    return a < b ? `${a}__${b}` : `${b}__${a}`;
}

// ---------------------------------------------------------------------
// Compresión en cliente
// ---------------------------------------------------------------------

const MAX_IMAGE_EDGE = 1600;
const IMAGE_QUALITY = 0.82;

/**
 * Reescala a 1600px de lado mayor y reencoda a WebP.
 *
 * 1600px es el punto en el que una foto sigue viéndose nítida a pantalla
 * completa en un móvil moderno pero ya no arrastra los 12 megapíxeles del
 * sensor. Una foto de 4 MB queda en ~200 KB.
 */
export async function compressImage(file: File): Promise<File> {
    const bitmap = await createImageBitmap(file);

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file; // sin canvas se sube el original antes que fallar
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY)
    );
    if (!blob) return file;

    // Si el "comprimido" pesa más que el original (pasa con capturas de
    // pantalla ya optimizadas), se sube el original.
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' });
}

/** Primer fotograma de un vídeo, para usarlo de póster. */
export async function extractPoster(file: File): Promise<File | null> {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.src = URL.createObjectURL(file);

        const cleanup = () => URL.revokeObjectURL(video.src);

        video.onloadeddata = () => {
            // Se busca el segundo 0.1 y no el 0: muchos vídeos arrancan con un
            // fotograma negro y el póster saldría en negro.
            video.currentTime = Math.min(0.1, video.duration || 0.1);
        };

        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                cleanup();
                return resolve(null);
            }
            ctx.drawImage(video, 0, 0);
            canvas.toBlob(
                (blob) => {
                    cleanup();
                    resolve(
                        blob
                            ? new File([blob], 'poster.webp', { type: 'image/webp' })
                            : null
                    );
                },
                'image/webp',
                0.7
            );
        };

        video.onerror = () => {
            cleanup();
            resolve(null);
        };
    });
}

/**
 * Grabadora de notas de voz.
 *
 * Opus a 24 kbps: voz perfectamente inteligible en ~180 KB por minuto. El
 * ajuste por defecto del navegador (128 kbps) daría casi 1 MB por minuto sin
 * ninguna mejora audible para una nota hablada.
 */
export function createVoiceRecorder() {
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let stream: MediaStream | null = null;
    let startedAt = 0;

    return {
        async start(): Promise<void> {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';

            chunks = [];
            recorder = new MediaRecorder(stream, {
                mimeType: mime,
                audioBitsPerSecond: 24000,
            });
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            startedAt = performance.now();
            recorder.start();
        },

        /** Devuelve null si no se llegó a grabar nada. */
        async stop(): Promise<{ file: File; duration: number } | null> {
            if (!recorder) return null;

            const rec = recorder;
            const done = new Promise<Blob>((resolve) => {
                rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
            });
            rec.stop();
            const blob = await done;

            // Siempre se sueltan los tracks: si no, el navegador deja el
            // indicador de micrófono encendido indefinidamente.
            stream?.getTracks().forEach((t) => t.stop());
            stream = null;
            recorder = null;

            if (blob.size === 0) return null;

            return {
                file: new File([blob], 'nota-de-voz.webm', { type: 'audio/webm' }),
                duration: (performance.now() - startedAt) / 1000,
            };
        },

        cancel() {
            try {
                recorder?.stop();
            } catch {
                /* ya estaba parada */
            }
            stream?.getTracks().forEach((t) => t.stop());
            stream = null;
            recorder = null;
            chunks = [];
        },

        get isRecording() {
            return recorder?.state === 'recording';
        },
    };
}

// ---------------------------------------------------------------------
// Subida y lectura
// ---------------------------------------------------------------------

function kindOf(mime: string): AttachmentKind {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    return 'video';
}

function randomName(ext: string): string {
    return `${crypto.randomUUID()}.${ext}`;
}

export const chatMediaService = {
    /**
     * Comprime y sube un archivo, devolviendo el adjunto listo para guardar
     * en `messages.attachments`.
     */
    async upload(
        file: File,
        userId: string,
        otherId: string,
        opts: { durationS?: number } = {}
    ): Promise<Attachment> {
        const folder = chatFolder(userId, otherId);
        const kind = kindOf(file.type);

        const prepared = kind === 'image' ? await compressImage(file) : file;
        const ext = prepared.name.split('.').pop() || 'bin';
        const path = `${folder}/${randomName(ext)}`;

        const { error } = await supabase.storage
            .from(BUCKET)
            .upload(path, prepared, { contentType: prepared.type, upsert: false });
        if (error) throw error;

        const attachment: Attachment = {
            path,
            kind,
            mime: prepared.type,
            size: prepared.size,
            duration_s: opts.durationS,
        };

        // El póster se sube después y sin bloquear: si falla, el vídeo sigue
        // siendo válido y solo se ve sin miniatura.
        if (kind === 'video') {
            try {
                const poster = await extractPoster(file);
                if (poster) {
                    const posterPath = `${folder}/${randomName('webp')}`;
                    const { error: pErr } = await supabase.storage
                        .from(BUCKET)
                        .upload(posterPath, poster, { contentType: 'image/webp' });
                    if (!pErr) attachment.poster_path = posterPath;
                }
            } catch {
                /* sin póster, no es un fallo del envío */
            }
        }

        return attachment;
    },

    /**
     * Firma las rutas de una tanda de adjuntos.
     *
     * En bloque y no una a una: un chat con 40 mensajes con foto haría 40
     * peticiones de firma al abrirse.
     */
    async signAll(paths: string[]): Promise<Record<string, string>> {
        if (paths.length === 0) return {};

        const unique = [...new Set(paths)];
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrls(unique, SIGNED_URL_TTL);

        if (error) {
            console.error('createSignedUrls:', error);
            return {};
        }

        const map: Record<string, string> = {};
        for (const row of data || []) {
            if (row.signedUrl && row.path) map[row.path] = row.signedUrl;
        }
        return map;
    },

    /** Todas las rutas (incluidos pósters) de una lista de mensajes. */
    collectPaths(messages: { attachments?: Attachment[] | null }[]): string[] {
        const paths: string[] = [];
        for (const m of messages) {
            for (const a of m.attachments || []) {
                paths.push(a.path);
                if (a.poster_path) paths.push(a.poster_path);
            }
        }
        return paths;
    },
};
