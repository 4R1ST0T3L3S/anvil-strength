import { useCallback, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createFrameReader, type FrameReader } from '../lib/cv/frameSource';
import { detectPlate, initTracker, trackFrame, cleanupTracker, useOpenCV } from '../lib/cv/tracker';
import '../index.css';

/**
 * BANCO DE MEDICIÓN DEL BUCLE DE ANÁLISIS — solo desarrollo.
 *
 * Ver pwr-bench.html. Se sirve en /pwr-bench.html y no entra en el bundle.
 *
 *
 * PARA QUÉ
 *
 * La auditoría (docs/AUDITORIA_PWR_2.0.md §6) dice que el lector por `seek` es
 * el techo del rendimiento, y lo dice de forma ANALÍTICA: nadie ha cronometrado
 * el reparto real entre posicionar el vídeo, copiar el fotograma y correr el
 * flujo óptico. Optimizar la parte que no manda es tiempo tirado, y este módulo
 * ya tiene un historial de suposiciones que resultaron falsas al medirlas.
 *
 * Aquí se mide de verdad, separando las tres etapas.
 *
 *
 * SALVEDAD IMPORTANTE SOBRE EL VÍDEO GENERADO
 *
 * `MediaRecorder` produce WebM, y el WebM que genera **no lleva índice de
 * búsqueda (Cues)**. Un contenedor sin índice se posiciona bastante peor que un
 * MP4 de móvil, así que **el coste de `seek` medido aquí es un TECHO, no el
 * valor que verá un usuario con un vídeo de iPhone**. No se debe citar como «el
 * seek cuesta X ms» sin esta salvedad.
 *
 * Lo que sí es directamente comparable con la realidad, porque no depende del
 * contenedor: el coste de copiar el fotograma, el de transferirlo al worker y
 * el del flujo óptico. Que es justamente lo que hay que saber para decidir si
 * merece la pena WebCodecs o basta con quitar las copias redundantes.
 */

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const SECONDS = 6;
/** Radio del disco en el vídeo sintético, en píxeles. */
const PLATE_R = 150;

// =====================================================================
// GENERAR UN VÍDEO DE VERDAD
// =====================================================================

/**
 * Dibuja un disco texturado que sube y baja, y lo graba.
 *
 * Texturado a propósito: `goodFeaturesToTrack` necesita esquinas, y un círculo
 * liso no tiene ninguna. Un disco de competición real tiene letras, tornillos y
 * el aro de color; esto los imita con radios y manchas deterministas.
 */
function drawFrame(ctx: CanvasRenderingContext2D, t: number) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Fondo con estructura, para que el flujo óptico tenga de qué agarrarse
    // fuera del disco y un fallo de máscara se note.
    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 2;
    for (let x = 0; x < WIDTH; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
    }

    // Una repetición por segundo y medio: baja y sube.
    const phase = (t / 1.5) % 2;
    const travel = 220;
    const offset = phase < 1 ? travel * phase : travel * (2 - phase);
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2 - travel / 2 + offset;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.6);

    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(0, 0, PLATE_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2c2c2c';
    ctx.beginPath();
    ctx.arc(0, 0, PLATE_R * 0.30, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * PLATE_R * 0.38, Math.sin(a) * PLATE_R * 0.38);
        ctx.lineTo(Math.cos(a) * PLATE_R * 0.88, Math.sin(a) * PLATE_R * 0.88);
        ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * PLATE_R * 0.62, Math.sin(a) * PLATE_R * 0.62, 7, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    return { cx, cy };
}

async function recordSyntheticVideo(log: (s: string) => void): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;

    // `captureStream(0)` + `requestFrame()` da control exacto de cuándo entra
    // cada fotograma, en vez de depender de que el navegador muestree el lienzo
    // a su ritmo — que con la pestaña en segundo plano se cae a 1 Hz.
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame(): void };

    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find(m => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('Este navegador no puede grabar WebM.');
    log(`Grabando ${SECONDS}s a ${FPS} fps en ${mime}…`);

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    const done = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    recorder.start();

    const total = SECONDS * FPS;
    for (let i = 0; i < total; i++) {
        drawFrame(ctx, i / FPS);
        track.requestFrame();
        // Un respiro real entre fotogramas: sin él el codificador recibe todo
        // de golpe y sella marcas de tiempo que no se parecen a un vídeo.
        await new Promise(r => setTimeout(r, 1000 / FPS));
    }

    recorder.stop();
    await done;

    const blob = new Blob(chunks, { type: mime });
    log(`Vídeo listo: ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
    return URL.createObjectURL(blob);
}

// =====================================================================
// MEDIR
// =====================================================================

interface Stage {
    label: string;
    totalMs: number;
    frames: number;
    note?: string;
}

function Bench() {
    const { cvReady, cvError } = useOpenCV();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [lines, setLines] = useState<string[]>([]);
    const [stages, setStages] = useState<Stage[]>([]);
    const [running, setRunning] = useState(false);

    const log = useCallback((s: string) => setLines(l => [...l, s]), []);

    const run = useCallback(async () => {
        setRunning(true);
        setLines([]);
        setStages([]);

        try {
            const url = await recordSyntheticVideo(log);
            const video = videoRef.current!;
            video.src = url;
            await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => resolve();
                video.onerror = () => reject(new Error('El vídeo generado no carga.'));
            });
            // Algunos WebM de MediaRecorder declaran duración infinita hasta que
            // se los recorre. Sin duración, el lector no sabe dónde parar.
            if (!Number.isFinite(video.duration)) {
                video.currentTime = 1e6;
                await new Promise<void>(r => {
                    const onSeek = () => { video.removeEventListener('seeked', onSeek); r(); };
                    video.addEventListener('seeked', onSeek);
                });
                video.currentTime = 0;
            }
            log(`Vídeo: ${video.videoWidth}×${video.videoHeight}, ${video.duration.toFixed(2)} s`);

            const reader: FrameReader = await createFrameReader(video);
            log(`Lector: ${reader.width}×${reader.height} · ${reader.fps.toFixed(2)} fps medidos · instantes ${reader.exactTimestamps ? 'exactos' : 'aproximados'}`);

            const range = { from: 1.0, to: 4.0 };
            const expected = reader.estimateFrames(range.from, range.to);
            log(`Recorte ${range.from}–${range.to} s ≈ ${expected} fotogramas`);

            // -----------------------------------------------------------
            // 1. Solo leer: seek + drawImage + getImageData
            // -----------------------------------------------------------
            let readOnlyMs = 0;
            let readOnlyFrames = 0;
            {
                const t0 = performance.now();
                const r = await reader.read(range, () => { readOnlyFrames++; });
                readOnlyMs = performance.now() - t0;
                log(
                    `① Solo lectura por «${r.strategy}»: ${readOnlyMs.toFixed(0)} ms para ${readOnlyFrames} ` +
                    `fotogramas (${(readOnlyMs / readOnlyFrames).toFixed(1)} ms/fotograma) · ` +
                    `${r.droppedByDecoder} perdidos`
                );
            }

            // -----------------------------------------------------------
            // 2. Solo el worker, sobre un fotograma ya en memoria
            // -----------------------------------------------------------
            const sample = await reader.grab(2.0);
            const detection = await detectPlate(sample.image, { x: reader.width / 2, y: reader.height / 2 });
            log(`Detección del disco: ${detection.method ?? 'nada'} · confianza ${detection.score.toFixed(2)}`);

            const seed = await initTracker(
                sample.image,
                detection.ellipse?.cx ?? reader.width / 2,
                detection.ellipse?.cy ?? reader.height / 2,
                (detection.ellipse?.height ?? PLATE_R * 2) / 2,
                detection.ellipse ?? null
            );
            log(`Nube sembrada: ${seed.features} puntos${seed.ok ? '' : ' (INSUFICIENTES)'}`);

            let workerOnlyMs = 0;
            const REPEATS = 40;
            {
                const t0 = performance.now();
                for (let i = 0; i < REPEATS; i++) {
                    // Se copia aquí porque `trackFrame` transfiere el búfer y
                    // dejaría el original inutilizable a la segunda vuelta.
                    const copy = new ImageData(
                        new Uint8ClampedArray(sample.image.data),
                        sample.image.width,
                        sample.image.height
                    );
                    await trackFrame(copy, detection.ellipse ?? null);
                }
                workerOnlyMs = performance.now() - t0;
            }
            log(`② Solo worker (copia+transferencia+flujo óptico): ${(workerOnlyMs / REPEATS).toFixed(1)} ms/fotograma`);

            // -----------------------------------------------------------
            // 3. El bucle completo, tal y como corre hoy
            // -----------------------------------------------------------
            cleanupTracker();
            const sample2 = await reader.grab(range.from);
            await initTracker(
                sample2.image,
                detection.ellipse?.cx ?? reader.width / 2,
                detection.ellipse?.cy ?? reader.height / 2,
                (detection.ellipse?.height ?? PLATE_R * 2) / 2,
                detection.ellipse ?? null
            );

            let fullMs = 0;
            let fullFrames = 0;
            let inWorkerMs = 0;
            let inReadMs = 0;
            {
                const t0 = performance.now();
                let mark = t0;
                const report = await reader.read(range, async frame => {
                    const gotFrame = performance.now();
                    inReadMs += gotFrame - mark;
                    await trackFrame(frame.image, detection.ellipse ?? null);
                    mark = performance.now();
                    inWorkerMs += mark - gotFrame;
                    fullFrames++;
                });
                fullMs = performance.now() - t0;
                log(
                    `③ Bucle completo por «${report.strategy}»: ${fullMs.toFixed(0)} ms para ${fullFrames} ` +
                    `fotogramas · ${report.droppedByDecoder} perdidos por el descodificador` +
                    (report.fellBack ? ' · HUBO VUELTA ATRÁS a seek' : '')
                );
            }

            // -----------------------------------------------------------
            // Cuánto pesa cada copia
            // -----------------------------------------------------------
            const bytes = reader.width * reader.height * 4;
            const t0 = performance.now();
            for (let i = 0; i < 50; i++) sample.image.data.buffer.slice(0);
            const sliceMs = (performance.now() - t0) / 50;

            setStages([
                { label: 'Esperar al fotograma', totalMs: inReadMs, frames: fullFrames,
                  note: 'Reproduciendo, es el hueco entre fotogramas; posicionando, el coste del seek.' },
                { label: 'Seguimiento (copia + transferencia + flujo óptico ×2)', totalMs: inWorkerMs, frames: fullFrames },
                { label: 'TOTAL del bucle', totalMs: fullMs, frames: fullFrames },
                { label: 'Solo lectura, sin seguimiento', totalMs: readOnlyMs, frames: readOnlyFrames,
                  note: 'Referencia medida con el lector ANTERIOR (solo seek) sobre este mismo vídeo: 198,6 ms/fotograma. ' +
                        'OJO: el WebM generado no lleva índice de búsqueda; en un MP4 de móvil el seek es más barato.' },
                { label: 'Copia redundante `buffer.slice(0)`', totalMs: sliceMs * fullFrames, frames: fullFrames,
                  note: `${(bytes / 1024 / 1024).toFixed(1)} MB por fotograma, copiados para nada` },
            ]);

            const perSecond = fullFrames / (fullMs / 1000);
            log(`→ ${perSecond.toFixed(1)} fotogramas analizados por segundo. ` +
                `Un vídeo de 60 s a 30 fps (1800 fotogramas) tardaría ${(1800 / perSecond).toFixed(0)} s.`);

            reader.dispose();
            cleanupTracker();
            URL.revokeObjectURL(url);
        } catch (err) {
            log(`FALLO: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setRunning(false);
        }
    }, [log]);

    return (
        <div className="min-h-[100dvh] bg-surface-canvas p-4 text-ink">
            <div className="mx-auto max-w-4xl">
                <h1 className="text-t-lg font-black">Banco de medición del bucle de análisis</h1>
                <p className="mt-1 text-t-2xs text-ink-subtle">
                    Genera un vídeo real de {WIDTH}×{HEIGHT} a {FPS} fps y cronometra las tres etapas
                    por separado. El coste de <code>seek</code> es un techo: el WebM de MediaRecorder
                    no lleva índice de búsqueda.
                </p>

                <button
                    type="button"
                    onClick={() => void run()}
                    disabled={running || !cvReady}
                    className="mt-3 rounded-card bg-brand px-4 py-2 text-t-xs font-bold text-brand-ink disabled:opacity-40"
                >
                    {running ? 'Midiendo…' : cvReady ? 'Medir' : 'Cargando OpenCV…'}
                </button>
                {cvError && <p className="mt-2 text-t-xs font-bold text-danger-text">{cvError}</p>}

                {/* VISIBLE A PROPÓSITO, y no `hidden`.
                    Un `<video>` en `display: none` no presenta fotogramas, así
                    que `requestVideoFrameCallback` NO SE DISPARA: medir con él
                    oculto daba cero fotogramas por reproducción e inflaba el
                    coste del `seek` con los 120 ms del temporizador de respaldo
                    de `seekTo`. La aplicación real lo tiene a la vista; el banco
                    tiene que medir en las mismas condiciones. */}
                <video ref={videoRef} muted playsInline className="mt-3 w-48 rounded border border-subtle" />

                {stages.length > 0 && (
                    <table className="mt-4 w-full text-left text-t-2xs">
                        <thead className="text-ink-faint">
                            <tr className="border-b border-subtle">
                                <th className="py-1.5 font-bold">Etapa</th>
                                <th className="py-1.5 text-right font-bold">ms/fotograma</th>
                                <th className="py-1.5 text-right font-bold">total</th>
                                <th className="py-1.5 text-right font-bold">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stages.map(s => {
                                const total = stages.find(x => x.label.startsWith('TOTAL'))?.totalMs ?? 1;
                                return (
                                    <tr key={s.label} className="border-b border-subtle/50 align-top">
                                        <td className="py-1.5 pr-3">
                                            {s.label}
                                            {s.note && <p className="mt-0.5 text-ink-faint">{s.note}</p>}
                                        </td>
                                        <td className="py-1.5 text-right font-bold">{(s.totalMs / s.frames).toFixed(1)}</td>
                                        <td className="py-1.5 text-right text-ink-muted">{s.totalMs.toFixed(0)} ms</td>
                                        <td className="py-1.5 text-right text-ink-muted">{((s.totalMs / total) * 100).toFixed(0)}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                <pre className="mt-4 whitespace-pre-wrap rounded-card border border-subtle bg-surface-sunken p-3 text-t-2xs leading-relaxed text-ink-muted">
                    {lines.join('\n') || 'Sin ejecutar.'}
                </pre>
            </div>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Bench />);
