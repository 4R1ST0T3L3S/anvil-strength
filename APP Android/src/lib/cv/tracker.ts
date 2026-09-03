import { useEffect, useSyncExternalStore } from 'react';
import type { PlateEllipse } from './plateGeometry';
import { urlRecursoRemoto } from '../plataforma';

/**
 * ANVIL STRENGTH — EL PUENTE CON EL HILO DE VISIÓN
 * =====================================================================
 *
 * QUÉ ESTABA MAL
 *
 * Las respuestas del worker se resolvían con TRES variables sueltas de módulo
 * —`initDoneCallback`, `trackDoneCallback`, `detectPlateCallback`—, una por
 * tipo de mensaje. Cada petición nueva pisaba la anterior. Mientras todo fuera
 * estrictamente secuencial no se notaba, pero bastaba con que el usuario tocara
 * el disco durante la detección automática para que la promesa de la primera
 * petición se quedara sin nadie que la resolviera: la interfaz se quedaba en
 * "Buscando el disco…" para siempre, sin error y sin salida.
 *
 * Ahora cada petición lleva un identificador y se resuelve por ese
 * identificador. Dos peticiones a la vez ya no se estorban, y una respuesta que
 * llega tarde —de un análisis que se canceló— se descarta en vez de resolver la
 * petición equivocada.
 *
 * El segundo fallo era `cvWorker.onmessage = …` dentro del efecto del hook:
 * cada componente que llamaba a `useOpenCV()` se quedaba con el buzón, dejando
 * mudo al anterior. El manejador se instala ahora UNA vez, junto al worker.
 *
 *
 * QUÉ PASA CON EL VÍDEO
 *
 * Nada: no sale del dispositivo. Los fotogramas van del `<canvas>` al worker por
 * memoria compartida y se descartan. Ver docs/ARQUITECTURA_VIDEO_PWR.md.
 */

declare global {
    interface Window {
        cv: Record<string, unknown>;
        onOpenCvReady: () => void;
    }
}

/**
 * Lo que devuelve el detector de disco.
 *
 * `method` importa tanto como la elipse: `'ellipse'` es el ajuste bueno,
 * `'hough'` es el respaldo que solo acierta con la cámara perpendicular, y
 * `null` es que no se ha encontrado nada. La puntuación de calidad lo usa.
 */
export interface PlateDetection {
    ellipse: PlateEllipse | null;
    /** Confianza, 0–1. */
    score: number;
    method: 'ellipse' | 'hough' | null;
    /**
     * Qué fracción del borde del disco se ve, de 0 a 1. `null` con Hough.
     *
     * Es lo ÚNICO que distingue un disco tapado a medias de uno entero, y un
     * disco tapado se mide mal por construcción: ajustar una elipse a un arco
     * parcial está mal condicionado y sobrestima los ejes. Medido en
     * `scripts/verify/deteccion-disco.mjs`: con una pierna tapando el 25% del
     * disco, la altura sale un +18%, o sea un −18% en todas las velocidades.
     *
     * La confianza NO sirve para detectarlo: en el barrido, casos tapados
     * puntúan 0,49 y casos perfectos de disco grande y girado puntúan 0,51. Se
     * solapan. La cobertura no.
     */
    coverage: number | null;
}

/** Resultado de sembrar la nube de puntos sobre el disco. */
export interface TrackerInit {
    x: number;
    y: number;
    /** Cuántos features se han podido fijar. */
    features: number;
    /** `false` si no hay textura suficiente para seguir nada. */
    ok: boolean;
}

/** Resultado de un fotograma de seguimiento. */
export interface TrackStep {
    /** 1 = seguido; 0 = fotograma perdido, el centro no se ha movido. */
    status: number;
    x: number;
    y: number;
    /** Puntos de la nube que han sobrevivido a la validación en este paso. */
    tracked: number;
}

export interface TrackingPoint {
    x: number;
    y: number;
    /** Milisegundos dentro del vídeo. */
    timestamp: number;
}

// =====================================================================
// EL WORKER
// =====================================================================

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };

let cvWorker: Worker | null = null;
let workerFailed: string | null = null;
let workerReady = false;
let nextRequestId = 1;

const pending = new Map<number, Pending>();
const readyListeners = new Set<() => void>();

/**
 * Estado del motor, como almacén externo.
 *
 * Se guarda un objeto CACHEADO y no se reconstruye en cada lectura porque
 * `useSyncExternalStore` compara por identidad: devolver un objeto nuevo cada
 * vez le haría creer que el estado cambia siempre y re-renderizaría sin parar.
 */
let snapshot: { ready: boolean; error: string | null } = { ready: false, error: null };

function announce() {
    snapshot = { ready: workerReady, error: workerFailed };
    for (const listener of readyListeners) listener();
}

function subscribe(onChange: () => void) {
    readyListeners.add(onChange);
    return () => { readyListeners.delete(onChange); };
}

const getSnapshot = () => snapshot;

/**
 * Crea el worker la primera vez que hace falta y le instala UN manejador.
 *
 * Es un singleton a propósito: OpenCV son ~670 KB de WebAssembly que hay que
 * compilar, y montar uno por componente costaría eso cada vez que se abre un
 * diálogo de análisis.
 */
function ensureWorker(): Worker | null {
    if (cvWorker || workerFailed) return cvWorker;

    try {
        // Worker clásico a propósito: `{ type: 'module' }` rompe
        // `importScripts`, que es como se carga /opencv.js.
        // La URL de opencv viaja en la query del worker: dentro del APK no va
        // empaquetado (10 MB) y se descarga de la web la primera vez. Ver
        // src/lib/plataforma.ts.
        const urlWorker = new URL('./cv.worker.js', import.meta.url);
        urlWorker.searchParams.set('opencv', urlRecursoRemoto('/opencv.js'));
        cvWorker = new Worker(urlWorker);
    } catch (err) {
        workerFailed = 'No se ha podido iniciar el motor de visión: ' +
            (err instanceof Error ? err.message : String(err));
        announce();
        return null;
    }

    const failureTimer = setTimeout(() => {
        if (workerReady) return;
        workerFailed = 'El motor de visión no responde. Comprueba que /opencv.js está accesible.';
        announce();
    }, 12000);

    cvWorker.onmessage = (e: MessageEvent) => {
        const data = e.data as Record<string, unknown> & { type: string; id?: number };

        if (data.type === 'READY') {
            clearTimeout(failureTimer);
            workerReady = true;
            workerFailed = null;
            announce();
            return;
        }

        // Un error SIN identificador no pertenece a ninguna petición: es un
        // fallo del motor y afecta a todo. Con identificador es el fallo de una
        // petición concreta y se le devuelve solo a ella.
        if (data.type === 'ERROR' && data.id === undefined) {
            workerFailed = String(data.message ?? 'Error en el motor de visión');
            announce();
            return;
        }

        if (typeof data.id !== 'number') return;
        const entry = pending.get(data.id);
        // Respuesta de una petición ya cancelada: se descarta. Antes esto
        // resolvía la petición que estuviera en curso, con datos de otro
        // fotograma.
        if (!entry) return;
        pending.delete(data.id);

        if (data.type === 'ERROR') entry.reject(new Error(String(data.message ?? 'Error en el motor de visión')));
        else entry.resolve(data);
    };

    cvWorker.onerror = (event: ErrorEvent) => {
        clearTimeout(failureTimer);
        workerFailed = event.message || 'El motor de visión ha fallado.';
        announce();
        for (const [, entry] of pending) entry.reject(new Error(workerFailed));
        pending.clear();
    };

    cvWorker.postMessage({ type: 'PING' });
    return cvWorker;
}

/**
 * Manda una petición y espera su respuesta.
 *
 * `transfer` mueve el búfer del fotograma al worker en vez de copiarlo. Quien
 * llame tiene que pasar un búfer del que pueda desprenderse: el de un
 * `getImageData` recién hecho lo es, el de un `<canvas>` vivo no.
 */
function request<T>(type: string, payload: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
    const worker = ensureWorker();
    if (!worker) return Promise.reject(new Error(workerFailed ?? 'El motor de visión no está disponible.'));

    const id = nextRequestId++;
    return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        try {
            worker.postMessage({ type, id, ...payload }, transfer);
        } catch (err) {
            pending.delete(id);
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}

// =====================================================================
// EL HOOK
// =====================================================================

/**
 * Estado del motor de visión.
 *
 * `useSyncExternalStore` y no `useState` + efecto: el worker es un almacén
 * EXTERNO y compartido, que puede haber quedado listo antes de que este
 * componente se montara. Con el patrón anterior —un `setState` dentro del
 * efecto para ponerse al día— el segundo análisis de la sesión se quedaba
 * esperando un `READY` que ya había pasado, y además provocaba un render en
 * cascada en cada montaje.
 */
export const useOpenCV = () => {
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => { ensureWorker(); }, []);

    return { cvReady: state.ready, cvError: state.error };
};

// =====================================================================
// OPERACIONES
// =====================================================================

/**
 * Busca el disco en un fotograma.
 *
 * `hint` es opcional. Sin él busca en toda la imagen; con él —cuando el usuario
 * ha tocado el disco— exige que el candidato caiga ahí, que es lo que convierte
 * la detección en un problema tratable cuando el gimnasio está lleno de cosas
 * redondas.
 */
export function detectPlate(
    image: ImageData,
    hint: { x: number; y: number } | null
): Promise<PlateDetection> {
    const buffer = image.data.buffer.slice(0);
    return request<{
        ellipse: PlateEllipse | null;
        score: number;
        method: PlateDetection['method'];
        coverage: number | null;
    }>(
        'DETECT_PLATE',
        { buffer, width: image.width, height: image.height, hintX: hint?.x, hintY: hint?.y },
        [buffer]
    ).then(r => ({
        ellipse: r.ellipse ?? null,
        score: r.score ?? 0,
        method: r.method ?? null,
        coverage: typeof r.coverage === 'number' ? r.coverage : null,
    }));
}

/**
 * Siembra la nube de puntos sobre el disco.
 *
 * `radiusPx` y `ellipse` acotan dónde buscar textura. Pasarlos importa: sembrar
 * dentro del disco detectado —y no en un cuadrado alrededor del dedo— es lo que
 * garantiza que se sigue el disco y no lo que hubiera detrás.
 */
export function initTracker(
    image: ImageData,
    x: number,
    y: number,
    radiusPx: number,
    ellipse: PlateEllipse | null
): Promise<TrackerInit> {
    const buffer = image.data.buffer.slice(0);
    return request<TrackerInit>(
        'INIT',
        { buffer, width: image.width, height: image.height, x, y, radiusPx, ellipse },
        [buffer]
    );
}

/** Un fotograma de seguimiento. */
export function trackFrame(image: ImageData, ellipse: PlateEllipse | null): Promise<TrackStep> {
    const buffer = image.data.buffer.slice(0);
    return request<TrackStep>(
        'TRACK',
        { buffer, width: image.width, height: image.height, ellipse },
        [buffer]
    );
}

/** Libera el estado del seguimiento sin matar el worker. */
export function cleanupTracker() {
    if (cvWorker) cvWorker.postMessage({ type: 'CLEANUP' });
}
