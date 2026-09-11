import { AUDIO_BITRATE, AUDIO_MAX_SEGUNDOS, elegirFormatoAudio, mimeBase } from './limites';

/**
 * NOTAS DE VOZ
 * =====================================================================
 *
 * `MediaRecorder` sobre el micrófono, a 32 kbit/s: voz perfectamente
 * inteligible en ~240 KB por minuto. AAC en MP4 donde el navegador sepa
 * escribirlo (se reproduce en cualquier sitio), Opus en el resto.
 *
 * El `nivel` sale de un `AnalyserNode` y sirve solo para pintar la barrita
 * que se mueve al hablar: es lo que le dice a quien graba que el micro
 * funciona.
 *
 * Siempre se sueltan las pistas al parar: si no, el indicador de micrófono
 * del sistema se queda encendido para siempre.
 */

export interface GrabacionDeVoz {
    file: File;
    duration: number;
    mime: string;
}

export function crearGrabadoraDeVoz(opciones: { onNivel?: (nivel: number) => void; onTiempo?: (segundos: number) => void } = {}) {
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let trozos: Blob[] = [];
    let inicio = 0;
    let animacion = 0;
    let temporizador: ReturnType<typeof setInterval> | null = null;

    const soltar = () => {
        cancelAnimationFrame(animacion);
        if (temporizador) clearInterval(temporizador);
        temporizador = null;
        stream?.getTracks().forEach(t => t.stop());
        stream = null;
        try { audioCtx?.close(); } catch { /* ya cerrado */ }
        audioCtx = null;
    };

    return {
        async start(): Promise<void> {
            if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
                throw new Error('Este navegador no puede grabar audio.');
            }
            const formato = elegirFormatoAudio(m => MediaRecorder.isTypeSupported(m));
            if (!formato) throw new Error('Este navegador no puede grabar notas de voz.');

            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });

            // Medidor de nivel. Opcional: si el AudioContext falla, se graba igual.
            try {
                const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
                if (Ctx && opciones.onNivel) {
                    audioCtx = new Ctx();
                    const fuente = audioCtx.createMediaStreamSource(stream);
                    const analizador = audioCtx.createAnalyser();
                    analizador.fftSize = 256;
                    fuente.connect(analizador);
                    const datos = new Uint8Array(analizador.frequencyBinCount);
                    const medir = () => {
                        analizador.getByteTimeDomainData(datos);
                        let suma = 0;
                        for (let i = 0; i < datos.length; i++) {
                            const v = (datos[i] - 128) / 128;
                            suma += v * v;
                        }
                        opciones.onNivel?.(Math.min(1, Math.sqrt(suma / datos.length) * 3));
                        animacion = requestAnimationFrame(medir);
                    };
                    medir();
                }
            } catch { /* sin medidor */ }

            trozos = [];
            recorder = new MediaRecorder(stream, { mimeType: formato, audioBitsPerSecond: AUDIO_BITRATE });
            recorder.ondataavailable = e => { if (e.data.size > 0) trozos.push(e.data); };
            inicio = performance.now();
            recorder.start(500);

            temporizador = setInterval(() => {
                const s = (performance.now() - inicio) / 1000;
                opciones.onTiempo?.(s);
                if (s >= AUDIO_MAX_SEGUNDOS) void this.stop();
            }, 250);
        },

        /** Devuelve null si no se llegó a grabar nada útil. */
        async stop(): Promise<GrabacionDeVoz | null> {
            if (!recorder) return null;
            const rec = recorder;
            recorder = null;
            const fin = new Promise<Blob>(resolve => {
                rec.onstop = () => resolve(new Blob(trozos, { type: mimeBase(rec.mimeType) }));
            });
            try { if (rec.state !== 'inactive') rec.stop(); } catch { /* ya parada */ }
            const blob = await fin;
            const duration = (performance.now() - inicio) / 1000;
            soltar();
            if (blob.size < 512 || duration < 0.5) return null;
            const mime = mimeBase(rec.mimeType) || 'audio/webm';
            const ext = mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : 'webm';
            return { file: new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type: mime }), duration, mime };
        },

        cancel() {
            try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* ya parada */ }
            recorder = null;
            trozos = [];
            soltar();
        },

        get grabando() {
            return recorder?.state === 'recording';
        },
    };
}
