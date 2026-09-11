import {
    VIDEO_FPS, VIDEO_BITRATE, VIDEO_AUDIO_BITRATE, dimensionesVideo, elegirFormatoVideo, mimeBase,
} from './limites';

/**
 * VÍDEO: RECORTAR Y RECODIFICAR A 720p / 30 fps EN EL NAVEGADOR
 * =====================================================================
 *
 * No hay librería (decisión U3: cero dependencias en tiempo de ejecución):
 * se usa lo que el navegador ya sabe hacer.
 *
 *   1. El vídeo se reproduce en un `<video>` invisible desde el punto de
 *      inicio del recorte hasta el de fin.
 *   2. Cada fotograma se pinta en un `<canvas>` del tamaño de salida
 *      (`dimensionesVideo`: 1280×720 como máximo, sin agrandar).
 *   3. `canvas.captureStream(30)` da la pista de vídeo; el audio se saca del
 *      mismo `<video>` con un `AudioContext` y un destino de MediaStream.
 *   4. `MediaRecorder` junta las dos pistas al bitrate pedido, en MP4/H.264
 *      donde el navegador sepa (Safari, Chrome reciente) o WebM en el resto.
 *
 * Es codificación EN TIEMPO REAL: un recorte de 30 s tarda 30 s. Por eso hay
 * progreso y cancelación, y por eso un vídeo que ya es ligero y MP4 se sube
 * tal cual (`videoSeSubeTalCual`).
 *
 * LO QUE PUEDE FALLAR, Y QUÉ SE HACE
 *   · Sin `MediaRecorder` o sin `captureStream` (navegadores viejos): se
 *     lanza un error claro y la interfaz ofrece subir el original si cabe.
 *   · La pestaña en segundo plano: el navegador frena `<video>` y los
 *     fotogramas; el resultado sale a trompicones. Se avisa en la interfaz.
 *   · El audio no se puede capturar (algún WebView): se codifica sin audio y
 *     se dice.
 */

export interface VideoMeta {
    duration: number;
    width: number;
    height: number;
}

export interface Recorte {
    desde: number;
    hasta: number;
}

export interface VideoPreparado {
    file: File;
    width: number;
    height: number;
    duration: number;
    /** Fotograma del inicio, para la miniatura del mensaje. */
    poster: File | null;
    recodificado: boolean;
}

/** Carga los metadatos de un vídeo. */
export function leerMetadatosVideo(file: File): Promise<VideoMeta> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        const url = URL.createObjectURL(file);
        const limpiar = () => { URL.revokeObjectURL(url); video.removeAttribute('src'); video.load(); };
        video.onloadedmetadata = () => {
            const meta = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
            limpiar();
            // Duración infinita = fichero con cabecera rota (algunos WebM).
            if (!Number.isFinite(meta.duration) || meta.duration <= 0 || !meta.width) {
                reject(new Error('No se ha podido leer el vídeo.'));
                return;
            }
            resolve(meta);
        };
        video.onerror = () => { limpiar(); reject(new Error('Este navegador no puede reproducir ese vídeo.')); };
        video.src = url;
    });
}

function esperarBusqueda(video: HTMLVideoElement, t: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const alBuscar = () => { limpiar(); resolve(); };
        const alFallar = () => { limpiar(); reject(new Error('No se ha podido posicionar el vídeo.')); };
        const limpiar = () => {
            video.removeEventListener('seeked', alBuscar);
            video.removeEventListener('error', alFallar);
        };
        video.addEventListener('seeked', alBuscar);
        video.addEventListener('error', alFallar);
        video.currentTime = Math.max(0, Math.min(t, Math.max(0, video.duration - 0.05)));
    });
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, tipo, calidad));
}

/**
 * Fotograma a un instante dado, como imagen. Sirve para el póster y para la
 * tira de miniaturas del recortador.
 */
export async function fotograma(file: File | string, t: number, anchoMax = 640, calidad = 0.75): Promise<Blob | null> {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = typeof file === 'string' ? file : URL.createObjectURL(file);
    try {
        await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error('No se ha podido leer el vídeo.'));
            video.src = url;
        });
        await esperarBusqueda(video, t);
        const escala = Math.min(1, anchoMax / Math.max(video.videoWidth, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.round(video.videoWidth * escala));
        canvas.height = Math.max(2, Math.round(video.videoHeight * escala));
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await aBlob(canvas, 'image/webp', calidad);
        return blob && blob.type === 'image/webp' ? blob : aBlob(canvas, 'image/jpeg', calidad);
    } finally {
        if (typeof file !== 'string') URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
    }
}

/** N miniaturas equiespaciadas para la tira del recortador. */
export async function miniaturas(file: File, n = 8, anchoMax = 160): Promise<string[]> {
    const meta = await leerMetadatosVideo(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    const salida: string[] = [];
    try {
        await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error('No se ha podido leer el vídeo.'));
            video.src = url;
        });
        const escala = Math.min(1, anchoMax / Math.max(video.videoWidth, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.round(video.videoWidth * escala));
        canvas.height = Math.max(2, Math.round(video.videoHeight * escala));
        const ctx = canvas.getContext('2d');
        if (!ctx) return [];
        for (let i = 0; i < n; i++) {
            const t = ((i + 0.5) / n) * meta.duration;
            try {
                await esperarBusqueda(video, t);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                salida.push(canvas.toDataURL('image/jpeg', 0.6));
            } catch {
                /* una miniatura menos no rompe la tira */
            }
        }
        return salida;
    } finally {
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
    }
}

/** ¿Este navegador puede recodificar? */
export function puedeRecodificar(): boolean {
    if (typeof MediaRecorder === 'undefined') return false;
    if (typeof HTMLCanvasElement === 'undefined') return false;
    const c = document.createElement('canvas');
    return typeof (c as HTMLCanvasElement & { captureStream?: unknown }).captureStream === 'function'
        && !!elegirFormatoVideo(m => MediaRecorder.isTypeSupported(m));
}

export interface OpcionesRecodificar {
    recorte: Recorte;
    onProgreso?: (fraccion: number) => void;
    signal?: AbortSignal;
}

/**
 * Recodifica el recorte a 720p / 30 fps / ~1,8 Mbit/s. Devuelve el fichero
 * nuevo y su póster. Lanza si el navegador no puede o si se cancela.
 */
export async function recodificarVideo(file: File, opciones: OpcionesRecodificar): Promise<VideoPreparado> {
    if (!puedeRecodificar()) {
        throw new Error('Este navegador no puede comprimir vídeo.');
    }
    const formato = elegirFormatoVideo(m => MediaRecorder.isTypeSupported(m)) as string;
    const meta = await leerMetadatosVideo(file);
    const { ancho, alto } = dimensionesVideo(meta.width, meta.height);
    const desde = Math.max(0, opciones.recorte.desde);
    const hasta = Math.min(meta.duration, opciones.recorte.hasta);
    const duracion = Math.max(0.5, hasta - desde);

    const video = document.createElement('video');
    video.preload = 'auto';
    video.playsInline = true;
    // Muted a nivel de elemento para que iOS deje reproducir sin gesto; el
    // audio se saca por el AudioContext, no por los altavoces.
    video.muted = true;
    (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
    const url = URL.createObjectURL(file);

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('No se ha podido preparar el vídeo.');

    let audioCtx: AudioContext | null = null;
    let grabadora: MediaRecorder | null = null;
    const trozos: Blob[] = [];
    let cancelado = false;

    const limpiar = () => {
        try { if (grabadora && grabadora.state !== 'inactive') grabadora.stop(); } catch { /* ya parada */ }
        try { audioCtx?.close(); } catch { /* ya cerrado */ }
        video.pause();
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
    };

    const alCancelar = () => { cancelado = true; limpiar(); };
    opciones.signal?.addEventListener('abort', alCancelar, { once: true });

    try {
        await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error('Este navegador no puede reproducir ese vídeo.'));
            video.src = url;
        });
        await esperarBusqueda(video, desde);

        // Pista de vídeo: el canvas a 30 fps.
        const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(VIDEO_FPS);
        const pistas: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

        // Pista de audio: el <video> a través de un AudioContext. Si falla
        // (WebView sin permisos), se codifica sin sonido.
        let conAudio = false;
        try {
            const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (Ctx) {
                audioCtx = new Ctx();
                const fuente = audioCtx.createMediaElementSource(video);
                const destino = audioCtx.createMediaStreamDestination();
                fuente.connect(destino);
                if (destino.stream.getAudioTracks().length > 0) {
                    pistas.push(...destino.stream.getAudioTracks());
                    conAudio = true;
                }
                if (audioCtx.state === 'suspended') await audioCtx.resume();
            }
        } catch {
            conAudio = false;
        }

        grabadora = new MediaRecorder(new MediaStream(pistas), {
            mimeType: formato,
            videoBitsPerSecond: VIDEO_BITRATE,
            ...(conAudio ? { audioBitsPerSecond: VIDEO_AUDIO_BITRATE } : {}),
        });
        grabadora.ondataavailable = e => { if (e.data.size > 0) trozos.push(e.data); };

        const terminado = new Promise<void>((resolve, reject) => {
            grabadora!.onstop = () => resolve();
            grabadora!.onerror = () => reject(new Error('La codificación del vídeo ha fallado.'));
        });

        // Bucle de pintado: un fotograma por cada uno del vídeo si el
        // navegador los anuncia, o a ritmo de pantalla si no.
        let vivo = true;
        const conRVFC = 'requestVideoFrameCallback' in video;
        const pintar = () => {
            if (!vivo) return;
            ctx.drawImage(video, 0, 0, ancho, alto);
            const t = video.currentTime;
            opciones.onProgreso?.(Math.max(0, Math.min(1, (t - desde) / duracion)));
            if (t >= hasta - 0.02 || video.ended) {
                vivo = false;
                video.pause();
                try { if (grabadora?.state === 'recording') grabadora.stop(); } catch { /* nada */ }
                return;
            }
            if (conRVFC) (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(pintar);
            else requestAnimationFrame(pintar);
        };

        grabadora.start(250);
        await video.play();
        pintar();

        // Cinturón: si `timeupdate` no llega al final (el vídeo se atasca),
        // se corta a la duración del recorte más un margen.
        const tope = setTimeout(() => {
            vivo = false;
            try { if (grabadora?.state === 'recording') grabadora.stop(); } catch { /* nada */ }
        }, (duracion + 3) * 1000);
        await terminado;
        clearTimeout(tope);

        if (cancelado) throw new DOMException('Cancelado', 'AbortError');

        const salidaMime = mimeBase(formato);
        const ext = salidaMime === 'video/mp4' ? 'mp4' : 'webm';
        const blob = new Blob(trozos, { type: salidaMime });
        if (blob.size < 1024) throw new Error('El vídeo ha salido vacío. Prueba con otro navegador.');
        const salida = new File([blob], `video-${Date.now()}.${ext}`, { type: salidaMime });

        // El póster sale del vídeo ORIGINAL en el instante de inicio: el
        // recodificado (WebM) no siempre se puede posicionar todavía.
        let poster: File | null = null;
        try {
            const p = await fotograma(file, desde + Math.min(0.15, duracion / 2), 640);
            if (p) poster = new File([p], 'poster.webp', { type: p.type });
        } catch { /* sin póster no pasa nada */ }

        return { file: salida, width: ancho, height: alto, duration: duracion, poster, recodificado: true };
    } finally {
        opciones.signal?.removeEventListener('abort', alCancelar);
        limpiar();
    }
}

/** Para un vídeo que se sube tal cual: solo el póster y los metadatos. */
export async function prepararSinRecodificar(file: File): Promise<VideoPreparado> {
    const meta = await leerMetadatosVideo(file);
    let poster: File | null = null;
    try {
        const p = await fotograma(file, Math.min(0.15, meta.duration / 2), 640);
        if (p) poster = new File([p], 'poster.webp', { type: p.type });
    } catch { /* nada */ }
    return { file, width: meta.width, height: meta.height, duration: meta.duration, poster, recodificado: false };
}
