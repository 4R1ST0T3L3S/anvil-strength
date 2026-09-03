/**
 * ANVIL STRENGTH — EL LECTOR DE FOTOGRAMAS
 * =====================================================================
 *
 * QUÉ ESTABA MAL, Y POR QUÉ ERA EL TECHO DE TODO LO DEMÁS
 *
 * La versión anterior analizaba así: `video.play()` y un bucle de
 * `requestAnimationFrame` que, en cada vuelta, miraba si `currentTime` había
 * cambiado desde la anterior. Eso tiene tres problemas y los tres se pagan en
 * la velocidad medida:
 *
 *   1. SE PERDÍAN FOTOGRAMAS. `requestAnimationFrame` va al ritmo de la
 *      PANTALLA, no del vídeo, y cada vuelta tenía que copiar el fotograma
 *      entero, mandarlo al worker y esperar la respuesta. Si eso tardaba más
 *      que un fotograma de vídeo —y a 1080p tardaba—, el vídeo seguía
 *      corriendo y esos fotogramas no se miraban nunca. Un vídeo a 30 Hz se
 *      analizaba a 12 ó 15. La concéntrica de una sentadilla pesada dura ~0,8 s:
 *      eso son DIEZ muestras para estimar un pico de velocidad.
 *
 *   2. EL INSTANTE ERA APROXIMADO. `video.currentTime` durante la
 *      reproducción es "por dónde va el reloj", no "qué fotograma se está
 *      viendo". El error es de hasta medio fotograma y entra directo en el
 *      denominador de dx/dt.
 *
 *   3. TARDABA LO QUE DURA EL VÍDEO. Analizar 15 segundos costaba 15 segundos
 *      como mínimo, aunque el levantamiento fueran 2.
 *
 * AQUÍ NO SE REPRODUCE: SE PIDE FOTOGRAMA A FOTOGRAMA
 *
 * Se posiciona el vídeo, se espera a que esté ahí, se lee y se avanza. El
 * bucle no compite con nadie: si el móvil va lento, tarda más, pero no se salta
 * ni un fotograma. Y como el recorte acota el análisis a la repetición, lo
 * normal es leer 60-120 fotogramas en lugar de los 450 de un vídeo entero.
 *
 * `requestVideoFrameCallback` es lo que lo hace exacto. Además de avisar de que
 * el fotograma ya está pintado, entrega su `mediaTime`: el instante REAL de ese
 * fotograma según el descodificador. Con eso, `dt` deja de ser una estimación.
 * Firefox todavía no lo tiene (se sigue el avance con `seeked` y `currentTime`),
 * así que se marca la diferencia en `exactTimestamps` y `quality.ts` la penaliza:
 * es justo el tipo de degradación que hay que decir, no esconder.
 *
 *
 * EL ESPACIO DE TRABAJO
 *
 * Los fotogramas se entregan reducidos a `MAX_WORK_WIDTH` como mucho. El flujo
 * óptico tiene precisión de subpíxel, así que reducir un 1080p a 1280 cuesta
 * ~0,1 px de error real y ahorra la mitad de los bytes que hay que copiar en
 * cada fotograma, que es lo que de verdad limita la velocidad del análisis.
 *
 * `scale` es el factor para volver: **todo lo que sale de aquí hacia el resto
 * de la aplicación se convierte antes a píxeles del vídeo original**, porque la
 * calibración se mide ahí y mezclar los dos espacios es un error de escala
 * silencioso — exactamente la clase de fallo que este módulo existe para evitar.
 */

// =====================================================================
// TIPOS
// =====================================================================

/** Un fotograma leído, en el espacio de trabajo. */
export interface SourceFrame {
    /** Instante del fotograma dentro del vídeo, en segundos. */
    time: number;
    image: ImageData;
    /** Posición dentro del recorte, empezando en 0. */
    index: number;
}

export interface FrameReader {
    /** Dimensiones del espacio de trabajo. */
    width: number;
    height: number;
    /** Multiplicador para pasar del espacio de trabajo al vídeo original. */
    scale: number;
    /** Intervalo medido entre fotogramas, en segundos. */
    frameIntervalS: number;
    /** Fotogramas por segundo medidos en el fichero. */
    fps: number;
    /**
     * `true` si los instantes vienen del descodificador (`mediaTime`) y no de
     * `currentTime`. Cuando es `false` hay hasta medio fotograma de
     * incertidumbre en cada `dt`.
     */
    exactTimestamps: boolean;
    /** Cuántos fotogramas tiene un recorte. Para la barra de progreso. */
    estimateFrames(from: number, to: number): number;
    /**
     * Recorre el recorte entregando cada fotograma, sin perder ninguno.
     *
     * `onRestart` se llama si hay que empezar de cero con la otra estrategia:
     * quien consuma tiene que tirar lo acumulado y volver a sembrar el
     * seguimiento. Ver `ReadReport`.
     */
    read(
        range: TrimRange,
        onFrame: (frame: SourceFrame) => Promise<void> | void,
        options?: { onRestart?: () => void | Promise<void> }
    ): Promise<ReadReport>;
    /** Un fotograma suelto, para la detección y la previsualización. */
    grab(time: number): Promise<SourceFrame>;
    /** Cancela una lectura en curso. */
    abort(): void;
    dispose(): void;
}

/** Un recorte, en segundos. */
export interface TrimRange {
    from: number;
    to: number;
}

/** Cómo ha ido la lectura. Interesa para la nota de calidad y para depurar. */
export interface ReadReport {
    /** `'playback'` es la vía rápida; `'seek'`, la lenta que no pierde nada. */
    strategy: 'playback' | 'seek';
    /** Fotogramas entregados al consumidor. */
    delivered: number;
    /**
     * Fotogramas que el compositor se comió antes de que llegaran aquí.
     *
     * Con la estrategia `seek` es siempre 0 por construcción. Con `playback` se
     * detecta comparando `presentedFrames` entre avisos consecutivos.
     */
    droppedByDecoder: number;
    /** `true` si se abandonó la reproducción y se repitió por `seek`. */
    fellBack: boolean;
}

/** Ancho máximo del espacio de trabajo. Ver la cabecera. */
const MAX_WORK_WIDTH = 1280;

/** Fotogramas por segundo que se suponen cuando no se puede medir. */
const FALLBACK_FPS = 30;

/** Límites de lo que se acepta como cadencia real de un vídeo. */
const MIN_FPS = 12;
const MAX_FPS = 240;

/**
 * Tope de seguridad de fotogramas por análisis.
 *
 * Existe por si alguien intenta analizar un vídeo entero de diez minutos sin
 * recortar: a 60 Hz serían 36.000 seeks y el navegador se queda colgado. Con
 * el recorte puesto no se llega nunca.
 */
const MAX_FRAMES = 1800;

/** Espera máxima por un `seeked`. Pasada, se sigue con lo que haya. */
const SEEK_TIMEOUT_MS = 2000;

/**
 * Cuántos fotogramas se pueden tener decodificados esperando al seguimiento.
 *
 * Es el amortiguador entre el descodificador, que va a su ritmo, y el worker,
 * que va al suyo. Cada uno ocupa ancho×alto×4 bytes: a 1280×720 son 3,5 MB, así
 * que ocho son 28 MB. Se puede subir en un portátil y habría que bajarlo en un
 * móvil viejo, pero ocho aguanta un desajuste de un cuarto de segundo, que es
 * de sobra para absorber un fotograma que tarde de más.
 */
const MAX_QUEUED_FRAMES = 8;

/** Con la cola por debajo de esto se vuelve a soltar el vídeo. */
const RESUME_QUEUE_BELOW = 3;

/**
 * Cuánto se espera sin que llegue un fotograma antes de dar la reproducción por
 * muerta, en milisegundos.
 *
 * `requestVideoFrameCallback` solo dispara si el navegador PRESENTA fotogramas,
 * y hay situaciones perfectamente normales en que no lo hace: el `<video>` en
 * `display: none`, la pestaña en segundo plano, o una ventana que no está
 * componiendo. En todas ellas el bucle se quedaría esperando un aviso que no va
 * a llegar.
 *
 * Tres segundos es de sobra para el fotograma más lento de decodificar y lo
 * bastante corto para no desesperar a nadie antes de pasarse a `seek`.
 */
const PLAYBACK_STALL_MS = 3000;

/**
 * Qué fracción del recorte tienen que ABARCAR los fotogramas entregados para
 * dar la reproducción por buena.
 *
 * ESTA COMPROBACIÓN EXISTE POR UN FALLO QUE SE COLÓ Y QUE HABRÍA SIDO
 * SILENCIOSO. La primera versión devolvía «correcto» mientras no se hubiera
 * abandonado explícitamente, así que un entorno donde
 * `requestVideoFrameCallback` no dispara producía cero fotogramas, cero
 * pérdidas declaradas y un resultado marcado como bueno. Aguas abajo eso es un
 * recorrido vacío y un «no se ha reconocido ninguna repetición» del que nadie
 * podría deducir la causa. Se descubrió al medir, no al leer.
 *
 *
 * POR QUÉ COBERTURA DE TIEMPO Y NO NÚMERO DE FOTOGRAMAS
 *
 * Porque el número esperado sale de la cadencia MEDIDA, y esa medida puede
 * fallar —de hecho falla exactamente en el mismo caso que estamos vigilando: si
 * `requestVideoFrameCallback` no dispara, `measureFps` se cae a suponer 30—. Se
 * vio en el banco: se esperaban 90 fotogramas y el vídeo tenía 121. Comparar
 * contra un número que puede estar un 35% desviado da falsas alarmas, y una
 * falsa alarma cuesta diez veces el tiempo de análisis.
 *
 * El instante de cada fotograma, en cambio, lo da el descodificador y no depende
 * de ninguna estimación nuestra. Si el primero está donde empieza el recorte y
 * el último donde acaba, se ha recorrido el recorte — sean los que sean.
 */
const MIN_SPAN_FRACTION = 0.8;

/**
 * Cuántos fotogramas se pueden perder antes de renunciar a la reproducción.
 *
 * `presentedFrames` del descodificador dice cuántos fotogramas ha presentado en
 * total, así que un salto de más de uno entre dos avisos significa que el
 * compositor se ha comido alguno. Con pocos no pasa nada —la cinemática se
 * calcula sobre instantes reales, no sobre un índice—; con muchos, el muestreo
 * baja y el pico de velocidad se aplasta, que es justo el fallo que tenía la
 * versión de hace dos revisiones.
 *
 * Pasado el 4%, se tira lo hecho y se repite por `seek`, que es lento pero no
 * pierde ni uno.
 */
const MAX_DROP_FRACTION = 0.04;

// =====================================================================
// SOPORTE DEL NAVEGADOR
// =====================================================================

interface FrameMetadata {
    mediaTime: number;
    presentedFrames: number;
}

type VideoWithRVFC = HTMLVideoElement & {
    requestVideoFrameCallback(cb: (now: number, metadata: FrameMetadata) => void): number;
    cancelVideoFrameCallback(handle: number): void;
};

/**
 * Devuelve el vídeo tipado con `requestVideoFrameCallback`, o `null`.
 *
 * Devuelve el elemento en vez de ser un `video is VideoWithRVFC`: con un
 * predicado, TypeScript estrecha la rama `else` a `never` —no sabe describir
 * "un HTMLVideoElement al que le falta un método"— y ahí dentro deja de
 * dejarte tocar el vídeo.
 */
function asRVFC(video: HTMLVideoElement): VideoWithRVFC | null {
    return typeof (video as Partial<VideoWithRVFC>).requestVideoFrameCallback === 'function'
        ? (video as VideoWithRVFC)
        : null;
}

// =====================================================================
// PRIMITIVAS
// =====================================================================

/**
 * Posiciona el vídeo y espera a que el fotograma esté disponible.
 *
 * Devuelve el instante REAL del fotograma que ha quedado en pantalla, que no
 * es el que se ha pedido: un vídeo solo puede pararse en fotogramas que
 * existen, así que pedir 1,234 s deja en pantalla el que empiece antes.
 * Devolver el instante pedido en vez del real era una de las fuentes de error
 * en `dt`.
 *
 * El `timeout` no es defensivo por si acaso: hay ficheros —sobre todo .mov de
 * iPhone con audio raro— donde un `seek` concreto no emite nunca `seeked`, y
 * sin él el análisis se quedaba colgado para siempre sin decir nada.
 */
function seekTo(video: HTMLVideoElement, time: number): Promise<number> {
    return new Promise(resolve => {
        const target = Math.max(0, Math.min(time, Math.max(0, (video.duration || 0) - 1e-4)));
        let settled = false;

        const finish = (exact: number) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            video.removeEventListener('seeked', onSeeked);
            resolve(exact);
        };

        // Con `requestVideoFrameCallback` el instante lo da el descodificador.
        // Es la diferencia entre medir `dt` y estimarlo.
        const onSeeked = () => {
            const rvfc = asRVFC(video);
            if (rvfc) {
                rvfc.requestVideoFrameCallback((_now, meta) => finish(meta.mediaTime));
                // Si el fotograma ya estaba presentado, `requestVideoFrameCallback`
                // puede no volver a dispararse. `currentTime` es el respaldo.
                setTimeout(() => finish(video.currentTime), 120);
            } else {
                finish(video.currentTime);
            }
        };

        const timer = setTimeout(() => finish(video.currentTime), SEEK_TIMEOUT_MS);

        // Ya está exactamente ahí: no habrá `seeked` y la promesa se colgaría.
        if (Math.abs(video.currentTime - target) < 1e-6) {
            onSeeked();
            return;
        }

        video.addEventListener('seeked', onSeeked);
        video.currentTime = target;
    });
}

/**
 * Cadencia real del fichero, medida reproduciendo un instante.
 *
 * Se mide y no se supone porque el paso del recorrido depende de ella: suponer
 * 30 en un vídeo a 60 lee la mitad de los fotogramas, y suponer 60 en uno a 30
 * hace el doble de `seek` para leer cada fotograma dos veces.
 *
 * La MEDIANA de los intervalos y no la media: un solo fotograma que tarde en
 * decodificarse arrastra la media y no mueve la mediana.
 */
async function measureFps(video: HTMLVideoElement, probeAt: number): Promise<{ fps: number; exact: boolean }> {
    const rvfc = asRVFC(video);
    if (!rvfc) return { fps: FALLBACK_FPS, exact: false };

    await seekTo(video, probeAt);

    const times: number[] = [];
    const wasMuted = video.muted;
    video.muted = true;

    const collected = await new Promise<boolean>(resolve => {
        let handle = 0;
        let done = false;

        const stop = (ok: boolean) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { rvfc.cancelVideoFrameCallback(handle); } catch { /* ya cancelado */ }
            video.pause();
            resolve(ok);
        };

        const onFrame = (_now: number, meta: FrameMetadata) => {
            times.push(meta.mediaTime);
            if (times.length >= 14) return stop(true);
            handle = rvfc.requestVideoFrameCallback(onFrame);
        };

        // Si el vídeo no arranca (política de reproducción, códec) no se
        // insiste: se mide con lo que haya o se cae al valor por defecto.
        const timer = setTimeout(() => stop(times.length >= 4), 1600);

        handle = video.requestVideoFrameCallback(onFrame);
        void video.play().catch(() => stop(false));
    });

    video.muted = wasMuted;

    /**
     * NO SE HA PODIDO MEDIR: NI LA CADENCIA NI LA EXACTITUD SON REALES.
     *
     * Esto devolvía `exact: true`, y es mentira con consecuencias. Si
     * `requestVideoFrameCallback` no llega a dispararse —pasa cuando el
     * `<video>` está en `display: none`, y también cuando el navegador se niega
     * a reproducir— aquí no se ha medido nada: se está devolviendo la
     * suposición de 30 fps. Declararla «exacta» hacía que `quality.ts` NO
     * penalizara un vídeo cuyos instantes son, precisamente, los que no se
     * pueden verificar.
     *
     * Se descubrió midiendo: el banco de pruebas tenía el vídeo oculto y esta
     * rama devolvía «30,00 fps medidos · instantes exactos», que es exactamente
     * lo que se ve cuando todo va bien.
     */
    if (!collected || times.length < 4) return { fps: FALLBACK_FPS, exact: false };

    const deltas: number[] = [];
    for (let i = 1; i < times.length; i++) {
        const d = times[i] - times[i - 1];
        if (d > 1 / MAX_FPS / 2 && d < 1 / MIN_FPS) deltas.push(d);
    }
    // Se recogieron instantes pero ninguno con una separación creíble: la
    // cadencia sigue sin medirse, así que tampoco aquí se puede prometer nada.
    if (deltas.length === 0) return { fps: FALLBACK_FPS, exact: false };

    deltas.sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)];
    const fps = Math.min(MAX_FPS, Math.max(MIN_FPS, 1 / median));

    // Redondear a la cadencia nominal más cercana evita que un 29,94 medido
    // como 29,91 vaya acumulando desfase a lo largo del recorrido.
    const NOMINAL = [24, 25, 29.97, 30, 48, 50, 59.94, 60, 120, 240];
    const snapped = NOMINAL.find(n => Math.abs(n - fps) / n < 0.04);

    return { fps: snapped ?? fps, exact: true };
}

// =====================================================================
// EL LECTOR
// =====================================================================

export interface FrameReaderOptions {
    /** Ancho máximo del espacio de trabajo. Por defecto `MAX_WORK_WIDTH`. */
    maxWidth?: number;
}

/**
 * Prepara un lector sobre un `<video>` ya cargado.
 *
 * Mide la cadencia una vez —cuesta menos de dos segundos y solo ocurre al abrir
 * el vídeo— y deja listo el lienzo de trabajo. El recorte se pasa en cada
 * `read()` y no aquí, para que mover el recorte y volver a analizar no obligue a
 * medir la cadencia otra vez.
 */
export async function createFrameReader(
    video: HTMLVideoElement,
    options: FrameReaderOptions = {}
): Promise<FrameReader> {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    if (!srcW || !srcH) throw new Error('El vídeo no ha dado sus dimensiones todavía.');

    const maxWidth = options.maxWidth ?? MAX_WORK_WIDTH;
    const shrink = srcW > maxWidth ? maxWidth / srcW : 1;
    const width = Math.round(srcW * shrink);
    const height = Math.round(srcH * shrink);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No se ha podido preparar el lienzo de análisis.');

    /**
     * El mismo contexto, con el tipo ya sin `null`.
     *
     * `readByPlayback` y `readBySeek` son declaraciones de función, y por tanto
     * IZADAS: TypeScript las considera invocables antes de que se ejecute la
     * comprobación de arriba y dentro de ellas vuelve a ver `ctx` como
     * posiblemente nulo. Fijar el tipo aquí, una vez, evita tener que poner un
     * `!` en cada uso —que es la clase de aserción que un día resulta ser falsa.
     */
    const ctx: CanvasRenderingContext2D = context;

    // Se mide en mitad del vídeo: es donde seguro que hay imagen, y evita el
    // primer fotograma, que en muchos ficheros es negro.
    const { fps, exact } = await measureFps(video, duration / 2);
    const frameIntervalS = 1 / fps;

    let aborted = false;

    return {
        width,
        height,
        scale: 1 / shrink,
        frameIntervalS,
        fps,
        exactTimestamps: exact,

        estimateFrames(from, to) {
            return Math.min(MAX_FRAMES, Math.max(1, Math.ceil((to - from) / frameIntervalS) + 1));
        },

        abort() {
            aborted = true;
        },

        dispose() {
            aborted = true;
            canvas.width = 0;
            canvas.height = 0;
        },

        async grab(time) {
            const actual = await seekTo(video, time);
            ctx.drawImage(video, 0, 0, width, height);
            return { time: actual, image: ctx.getImageData(0, 0, width, height), index: 0 };
        },

        async read(range, onFrame, options) {
            aborted = false;
            video.pause();

            const from = Math.max(0, Math.min(range.from, duration || range.from));
            const to = Math.max(from, Math.min(range.to, duration || range.to));

            // ---------------------------------------------------------
            // VÍA RÁPIDA: REPRODUCIR
            // ---------------------------------------------------------
            const fast = await readByPlayback(from, to, onFrame);
            if (fast.ok) {
                return {
                    strategy: 'playback',
                    delivered: fast.delivered,
                    droppedByDecoder: fast.dropped,
                    fellBack: false,
                };
            }
            if (aborted) {
                return { strategy: 'playback', delivered: fast.delivered, droppedByDecoder: fast.dropped, fellBack: false };
            }

            // La reproducción ha perdido demasiados fotogramas (o no había
            // `requestVideoFrameCallback`). Lo entregado hasta ahora no sirve:
            // quien consume tiene que tirarlo y volver a sembrar.
            await options?.onRestart?.();
            video.pause();
            const slow = await readBySeek(from, to, onFrame);

            return {
                strategy: 'seek',
                delivered: slow,
                // Por construcción, posicionando no se pierde ninguno: cada
                // fotograma se pide y se espera.
                droppedByDecoder: 0,
                fellBack: true,
            };
        },
    };

    /**
     * LA VÍA RÁPIDA: SE REPRODUCE EL VÍDEO Y SE COGEN LOS FOTOGRAMAS AL VUELO.
     *
     * POR QUÉ, CON NÚMEROS
     *
     * Se midió el bucle entero sobre un vídeo real de 1280×720 generado en el
     * navegador (`src/dev/pwrBench.tsx`):
     *
     *     leer el fotograma (seek + dibujar + getImageData)   198,6 ms   90%
     *     seguimiento (transferencia + flujo óptico ×2)        22,4 ms   10%
     *                                                        ─────────
     *     total por fotograma                                 221,0 ms
     *
     * O sea: **nueve de cada diez milisegundos se iban en posicionar el vídeo.**
     * Un `seek` obliga al descodificador a volver al fotograma clave anterior y
     * decodificar hacia delante; hacerlo una vez por fotograma es pedirle que
     * decodifique el vídeo entero una y otra vez.
     *
     * Reproduciendo, el descodificador hace lo que sabe hacer: ir hacia
     * delante. Y el dato que lo hace viable es el otro: **el seguimiento cuesta
     * 22 ms, menos que los 33 ms que dura un fotograma a 30 fps.** Da tiempo de
     * sobra a procesar cada uno antes de que llegue el siguiente.
     *
     *
     * POR QUÉ ESTO NO ES VOLVER AL FALLO ANTIGUO
     *
     * Hace dos revisiones se analizaba reproduciendo, y se retiró porque perdía
     * fotogramas: un vídeo a 30 Hz se analizaba a 12 ó 15. Tres cosas eran
     * distintas y las tres importan:
     *
     *   1. Iba a golpe de `requestAnimationFrame`, que va al ritmo de la
     *      PANTALLA. Aquí se usa `requestVideoFrameCallback`, que va al ritmo
     *      del VÍDEO y además entrega el instante exacto del descodificador.
     *   2. No había amortiguador: si el seguimiento tardaba, el vídeo seguía
     *      corriendo y esos fotogramas no se miraban nunca. Aquí hay una cola y,
     *      cuando se llena, **SE PAUSA EL VÍDEO**. El descodificador espera al
     *      seguimiento en vez de atropellarlo.
     *   3. No se sabía cuántos se perdían. Aquí `presentedFrames` lo dice
     *      exactamente, y si se pierden más de un 4% se abandona y se repite por
     *      `seek`, que es lento pero exacto.
     *
     * Es decir: se coge la velocidad de reproducir y se conserva la garantía de
     * no perder ninguno, que es la propiedad por la que se pagó el `seek`.
     */
    async function readByPlayback(
        from: number,
        to: number,
        onFrame: (frame: SourceFrame) => Promise<void> | void
    ): Promise<{ ok: boolean; delivered: number; dropped: number }> {
        const rvfc = asRVFC(video);
        // Sin `requestVideoFrameCallback` no hay forma de saber ni cuándo llega
        // un fotograma ni cuál es: reproducir a ciegas es justo el fallo
        // antiguo. Firefox va por `seek`, más lento y correcto.
        if (!rvfc) return { ok: false, delivered: 0, dropped: 0 };

        await seekTo(video, from);
        if (aborted) return { ok: true, delivered: 0, dropped: 0 };

        const queue: SourceFrame[] = [];
        let producerDone = false;
        let dropped = 0;
        let delivered = 0;
        let queued = 0;
        let lastPresented = -1;
        let throttled = false;
        let giveUp = false;

        /** Despierta al consumidor cuando entra un fotograma o acaba el vídeo. */
        let wake: (() => void) | null = null;
        const signal = () => { const w = wake; wake = null; w?.(); };
        const waitForFrame = () => new Promise<void>(resolve => {
            wake = resolve;
            // Red de seguridad: si el descodificador se queda mudo —pasa con
            // algún .mov raro— sin esto el consumidor esperaría para siempre.
            setTimeout(() => { if (wake === resolve) { wake = null; resolve(); } }, 250);
        });

        /** Cuándo llegó el último fotograma. Para detectar que se ha parado. */
        let lastArrivalMs = performance.now();

        /** Instantes DEL VÍDEO del primer y del último fotograma entregados. */
        let firstTime: number | null = null;
        let lastTime: number | null = null;

        const onVideoFrame = (_now: number, meta: FrameMetadata) => {
            if (aborted || giveUp) { producerDone = true; signal(); return; }

            // `presentedFrames` es un contador del descodificador: si sube más
            // de uno entre dos avisos, el compositor se ha comido los de en
            // medio y hay que contarlos.
            if (lastPresented >= 0 && meta.presentedFrames > lastPresented + 1) {
                dropped += meta.presentedFrames - lastPresented - 1;
            }
            lastPresented = meta.presentedFrames;

            if (meta.mediaTime > to + frameIntervalS * 0.5) {
                producerDone = true;
                video.pause();
                signal();
                return;
            }

            lastArrivalMs = performance.now();

            if (meta.mediaTime >= from - frameIntervalS * 0.5) {
                ctx.drawImage(video, 0, 0, width, height);
                queue.push({
                    time: meta.mediaTime,
                    image: ctx.getImageData(0, 0, width, height),
                    index: queued++,
                });
            }

            // CONTRAPRESIÓN: con la cola llena se para el vídeo. Es lo que
            // convierte «reproducir» en «no perder ninguno».
            if (queue.length >= MAX_QUEUED_FRAMES && !video.paused) {
                video.pause();
                throttled = true;
            }

            signal();
            rvfc.requestVideoFrameCallback(onVideoFrame);
        };

        rvfc.requestVideoFrameCallback(onVideoFrame);

        const wasMuted = video.muted;
        video.muted = true;
        try {
            await video.play();
        } catch {
            video.muted = wasMuted;
            return { ok: false, delivered: 0, dropped: 0 };
        }

        const onEnded = () => { producerDone = true; signal(); };
        video.addEventListener('ended', onEnded);

        try {
            while (!aborted) {
                if (queue.length === 0) {
                    if (producerDone) break;

                    // El descodificador no presenta fotogramas: `<video>`
                    // oculto, pestaña en segundo plano, ventana sin componer.
                    // Sin esto el bucle esperaría hasta que el vídeo terminase
                    // solo, o para siempre si la contrapresión lo dejó pausado.
                    if (performance.now() - lastArrivalMs > PLAYBACK_STALL_MS) {
                        giveUp = true;
                        break;
                    }

                    await waitForFrame();
                    continue;
                }

                const frame = queue.shift()!;

                // Con sitio otra vez en la cola, se suelta el vídeo.
                if (throttled && queue.length <= RESUME_QUEUE_BELOW && !producerDone) {
                    throttled = false;
                    void video.play().catch(() => { producerDone = true; });
                }

                await onFrame(frame);
                delivered++;
                if (firstTime === null) firstTime = frame.time;
                lastTime = frame.time;

                // Se comprueba pronto y de forma continua: si se están perdiendo
                // fotogramas, cuanto antes se abandone menos trabajo se tira.
                const seen = delivered + dropped;
                if (seen >= 24 && dropped / seen > MAX_DROP_FRACTION) {
                    giveUp = true;
                    break;
                }
            }
        } finally {
            video.removeEventListener('ended', onEnded);
            video.pause();
            video.muted = wasMuted;
        }

        /**
         * ¿Se ha recorrido el recorte de verdad?
         *
         * No basta con «no se abandonó»: hay formas de terminar limpiamente sin
         * haber leído nada —el vídeo llega a su fin sin haber presentado un solo
         * fotograma— y darlas por buenas convierte el fallo en un recorrido
         * vacío sin explicación. Ver `MIN_SPAN_FRACTION`.
         */
        const wanted = to - from;
        const covered = firstTime === null || lastTime === null ? 0 : lastTime - firstTime;
        // Un recorte más corto que un par de fotogramas no tiene «cobertura» que
        // medir; ahí basta con haber entregado algo.
        const enough = wanted <= frameIntervalS * 2
            ? delivered > 0
            : covered >= wanted * MIN_SPAN_FRACTION;

        return { ok: !giveUp && enough, delivered, dropped };
    }

    /**
     * LA VÍA LENTA: SE POSICIONA EL VÍDEO FOTOGRAMA A FOTOGRAMA.
     *
     * Cuesta unos 200 ms por fotograma —el 90% del bucle— pero no pierde ni uno
     * y funciona sin `requestVideoFrameCallback`. Es el respaldo, y sigue siendo
     * la única vía en Firefox.
     */
    async function readBySeek(
        from: number,
        to: number,
        onFrame: (frame: SourceFrame) => Promise<void> | void
    ): Promise<number> {
        let index = 0;
        let previousTime = -Infinity;
        // Se pide tres cuartos de fotograma por delante del anterior REAL.
        // Pedir el instante exacto del siguiente cae justo en la frontera y,
        // según cómo redondee el descodificador, devuelve otra vez el mismo.
        let cursor = from;

        while (!aborted && cursor <= to + frameIntervalS * 0.5 && index < MAX_FRAMES) {
            const actual = await seekTo(video, cursor);
            if (aborted) break;

                /**
                 * El descodificador ha devuelto un fotograma que ya se leyó.
                 *
                 * El margen es medio intervalo, no un cuarto. Con un cuarto se
                 * colaban duplicados: un fichero con cadencia irregular
                 * —cualquier grabación de pantalla, y algunos móviles— devolvía
                 * el mismo fotograma con un `mediaTime` unos milisegundos
                 * distinto y pasaba el filtro. Se midió: un vídeo de 4,2 s a
                 * 30 Hz entregaba 170 muestras en vez de 128, y esos pares con
                 * `dt` casi cero disparaban el detector de saltos hasta
                 * bloquear la medición entera.
                 *
                 * Medio intervalo es seguro: dos fotogramas de verdad están
                 * separados un intervalo completo.
                 */
            if (actual <= previousTime + frameIntervalS * 0.5) {
                cursor = Math.max(cursor, actual) + frameIntervalS * 0.75;
                continue;
            }

            // Pasado el final del recorte: el fotograma que había justo
            // antes ya se entregó y este sobra.
            if (actual > to + frameIntervalS * 0.5) break;

            ctx.drawImage(video, 0, 0, width, height);
            const image = ctx.getImageData(0, 0, width, height);

            await onFrame({ time: actual, image, index });

            previousTime = actual;
            index++;
            cursor = actual + frameIntervalS * 0.75;
        }

        return index;
    }
}
