/**
 * ANVIL STRENGTH — LÍMITES Y DECISIONES DE LA MULTIMEDIA DEL CHAT
 * =====================================================================
 *
 * Todo lo que decide CUÁNTO pesa lo que se sube vive aquí, en funciones
 * puras que se prueban sin navegador (limites.test.ts).
 *
 * LA PRIORIDAD: que la técnica se pueda analizar (una sentadilla a 720p y 30
 * fps se lee perfectamente) gastando lo mínimo de almacenamiento.
 *
 * VÍDEO: 720p como máximo (el lado largo a 1280, el corto a 720), 30 fps,
 * ~1,8 Mbit/s de vídeo y 96 kbit/s de audio. Un levantamiento de 30 s ocupa
 * unos 7 MB; el tope de 2 minutos, unos 28. Por encima de 2 Mbit/s no se ve
 * más la barra; por debajo de 1,2 el movimiento rápido se emborrona.
 *
 * FOTO: lado largo a 2048 px (se leen una etiqueta o una hoja), WebP o JPEG
 * al 82 %. Una foto de 4 MB del móvil queda en 300-600 KB.
 *
 * AUDIO: voz a 32 kbit/s (AAC u Opus): un minuto, ~240 KB.
 *
 * RETENCIÓN: fotos y vídeos, 15 días (lo hace el servidor). Audio y
 * documentos se conservan: su coste es trivial.
 */

export const VIDEO_MAX_SEGUNDOS = 120;
export const VIDEO_LADO_LARGO = 1280;
export const VIDEO_LADO_CORTO = 720;
export const VIDEO_FPS = 30;
export const VIDEO_BITRATE = 1_800_000;
export const VIDEO_AUDIO_BITRATE = 96_000;

export const IMAGEN_LADO_MAX = 2048;
export const IMAGEN_CALIDAD = 0.82;

export const AUDIO_BITRATE = 32_000;
export const AUDIO_MAX_SEGUNDOS = 300;

/** El techo del bucket (y del plan gratuito de Supabase). */
export const TAMANO_MAX_SUBIDA = 50 * 1024 * 1024;
/** Documentos: generoso para un PDF con fotos, sin convertir el chat en un disco. */
export const DOCUMENTO_MAX_BYTES = 20 * 1024 * 1024;
/** Un vídeo que ya es ligero, MP4 y ≤720p no se recodifica: se ahorra el tiempo. */
export const VIDEO_SUBIR_TAL_CUAL_BYTES = 8 * 1024 * 1024;

export const RETENCION_DIAS = { image: 15, video: 15 } as const;

export type TipoAdjunto = 'image' | 'video' | 'audio' | 'file';

export const DOCUMENTOS_PERMITIDOS: Record<string, string> = {
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

/** Lo que el selector de archivos ofrece para "Documento". */
export const ACEPTAR_DOCUMENTOS = Object.keys(DOCUMENTOS_PERMITIDOS).join(',') + ',.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

/** `video/webm;codecs=vp9,opus` → `video/webm`. Storage compara el tipo base. */
export function mimeBase(mime: string): string {
    return (mime || '').split(';')[0].trim().toLowerCase();
}

/** Qué es un fichero, por su tipo y, si el móvil no lo dice, por su extensión. */
export function tipoDeAdjunto(mime: string, nombre = ''): TipoAdjunto {
    const base = mimeBase(mime);
    if (base.startsWith('image/')) return 'image';
    if (base.startsWith('video/')) return 'video';
    if (base.startsWith('audio/')) return 'audio';
    const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'm4v', 'webm'].includes(ext)) return 'video';
    if (['m4a', 'aac', 'mp3', 'ogg', 'wav', 'webm'].includes(ext)) return 'audio';
    return 'file';
}

/** Extensión para la clave de Storage. */
export function extensionPara(mime: string, nombre = ''): string {
    const base = mimeBase(mime);
    const conocidas: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
        'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
        'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/webm': 'webm',
        'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a',
        ...DOCUMENTOS_PERMITIDOS,
    };
    return conocidas[base] ?? (nombre.split('.').pop()?.toLowerCase() || 'bin');
}

/**
 * El tamaño de salida de un vídeo: cabe en 1280×720 (o 720×1280 si es
 * vertical) sin agrandar nunca y con lados PARES — H.264 no admite impares y
 * algunos codificadores fallan sin avisar.
 */
export function dimensionesVideo(ancho: number, alto: number): { ancho: number; alto: number } {
    if (!(ancho > 0) || !(alto > 0)) return { ancho: VIDEO_LADO_LARGO, alto: VIDEO_LADO_CORTO };
    const vertical = alto > ancho;
    const maxAncho = vertical ? VIDEO_LADO_CORTO : VIDEO_LADO_LARGO;
    const maxAlto = vertical ? VIDEO_LADO_LARGO : VIDEO_LADO_CORTO;
    const escala = Math.min(1, maxAncho / ancho, maxAlto / alto);
    const par = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    return { ancho: par(ancho * escala), alto: par(alto * escala) };
}

/** El tamaño de salida de una foto: el lado largo a 2048 como mucho. */
export function dimensionesImagen(ancho: number, alto: number, ladoMax = IMAGEN_LADO_MAX): { ancho: number; alto: number } {
    if (!(ancho > 0) || !(alto > 0)) return { ancho: 0, alto: 0 };
    const escala = Math.min(1, ladoMax / Math.max(ancho, alto));
    return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/**
 * El primer formato que el navegador sepa GRABAR. MP4/H.264 primero: se ve en
 * todos los móviles (iPhone incluido); WebM como respaldo.
 */
export function elegirFormatoVideo(soporta: (mime: string) => boolean): string | null {
    const candidatos = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
    ];
    return candidatos.find(c => soporta(c)) ?? null;
}

/** Voz: AAC en MP4 primero (se reproduce en todas partes), Opus después. */
export function elegirFormatoAudio(soporta: (mime: string) => boolean): string | null {
    const candidatos = [
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
    ];
    return candidatos.find(c => soporta(c)) ?? null;
}

export interface ValidacionArchivo {
    ok: boolean;
    motivo?: string;
    tipo: TipoAdjunto;
}

/** Lo que se puede mandar ANTES de procesarlo. Los vídeos largos se recortan, no se rechazan. */
export function validarArchivo(f: { type: string; name: string; size: number }): ValidacionArchivo {
    const tipo = tipoDeAdjunto(f.type, f.name);
    if (tipo === 'file') {
        const conocido = DOCUMENTOS_PERMITIDOS[mimeBase(f.type)] || /\.(pdf|txt|csv|docx?|xlsx?|pptx?)$/i.test(f.name);
        if (!conocido) return { ok: false, tipo, motivo: 'Ese tipo de archivo no se puede enviar. Prueba con PDF, Word, Excel o texto.' };
        if (f.size > DOCUMENTO_MAX_BYTES) return { ok: false, tipo, motivo: `El archivo pesa ${formatearTamano(f.size)}; el máximo son ${formatearTamano(DOCUMENTO_MAX_BYTES)}.` };
    }
    if (tipo === 'audio' && f.size > TAMANO_MAX_SUBIDA) {
        return { ok: false, tipo, motivo: 'El audio es demasiado grande.' };
    }
    return { ok: true, tipo };
}

/**
 * ¿Se puede subir este vídeo tal cual? Solo si ya es ligero, MP4, cabe en
 * 720p, dura como mucho 2 minutos y no hay que recortarlo. Un .mov del iPhone
 * (HEVC) SIEMPRE se recodifica: fuera de Apple no se reproduce en todas partes.
 */
export function videoSeSubeTalCual(meta: { mime: string; size: number; ancho: number; alto: number; duracion: number }, recorte: { desde: number; hasta: number }): boolean {
    const dur = recorte.hasta - recorte.desde;
    const sinRecortar = recorte.desde <= 0.05 && Math.abs(recorte.hasta - meta.duracion) <= 0.1;
    return mimeBase(meta.mime) === 'video/mp4'
        && meta.size <= VIDEO_SUBIR_TAL_CUAL_BYTES
        && Math.max(meta.ancho, meta.alto) <= VIDEO_LADO_LARGO
        && Math.min(meta.ancho, meta.alto) <= VIDEO_LADO_CORTO
        && dur <= VIDEO_MAX_SEGUNDOS
        && sinRecortar;
}

/** El recorte inicial: los primeros 2 minutos si el vídeo es más largo. */
export function recorteInicial(duracion: number): { desde: number; hasta: number } {
    return { desde: 0, hasta: Math.min(duracion > 0 ? duracion : VIDEO_MAX_SEGUNDOS, VIDEO_MAX_SEGUNDOS) };
}

/** Ajusta un recorte para que nunca pase de 2 minutos ni se salga del vídeo. */
export function normalizarRecorte(r: { desde: number; hasta: number }, duracion: number, minimo = 1): { desde: number; hasta: number } {
    let desde = Math.max(0, Math.min(r.desde, Math.max(0, duracion - minimo)));
    let hasta = Math.min(duracion, Math.max(r.hasta, desde + minimo));
    if (hasta - desde > VIDEO_MAX_SEGUNDOS) {
        // Se respeta el extremo que se estaba moviendo: si el inicio cambió, el
        // fin lo sigue; si no, el inicio se acerca al fin.
        if (r.desde !== desde) hasta = desde + VIDEO_MAX_SEGUNDOS;
        else desde = hasta - VIDEO_MAX_SEGUNDOS;
    }
    return { desde: Math.max(0, desde), hasta: Math.min(duracion, hasta) };
}

/** Estimación del peso de un vídeo recodificado, para decírselo al usuario antes. */
export function pesoEstimadoVideo(segundos: number): number {
    return Math.round(((VIDEO_BITRATE + VIDEO_AUDIO_BITRATE) / 8) * Math.max(0, segundos));
}

export function formatearTamano(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    const mb = bytes / (1024 * 1024);
    return `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB`;
}

/** 83 → "1:23". */
export function formatearDuracion(segundos: number): string {
    if (!Number.isFinite(segundos) || segundos < 0) return '0:00';
    const s = Math.round(segundos);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
