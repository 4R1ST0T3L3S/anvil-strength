/**
 * ANVIL STRENGTH — COLA DE ESCRITURA RESISTENTE
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * El registro de series escribía directo a Supabase con un `debounce` de
 * 800ms. Si la petición fallaba salía un aviso rojo y el dato se perdía: no
 * quedaba en ninguna parte, y el atleta —que está de pie, entre series, con
 * el móvil en una mano— ni se enteraba de qué serie era.
 *
 * Eso no es un caso raro. Es el caso NORMAL: los gimnasios son sótanos con
 * paredes de hormigón y la cobertura entra y sale continuamente.
 *
 * CÓMO FUNCIONA
 *
 * Cada cambio se escribe primero en `localStorage` y solo después se intenta
 * mandar. Si falla, se queda encolado y se reintenta al recuperar conexión,
 * al volver a la pestaña o pasado un rato. Cerrar el navegador no lo pierde:
 * la cola se vacía en el siguiente arranque.
 *
 * COALESCENCIA
 *
 * Los cambios de una misma fila se FUNDEN en una sola entrada. Escribir
 * "1", "12", "125" en la casilla de peso genera una escritura, no tres, y la
 * que se manda es la última. Sin esto, una mala conexión acumularía una cola
 * de decenas de peticiones que además pueden llegar desordenadas y dejar el
 * valor viejo encima del nuevo.
 *
 * LO QUE NO HACE
 *
 * No resuelve conflictos entre dispositivos. Es "gana el último que
 * escribe", que es lo correcto aquí: el único que registra una serie es el
 * atleta que la está haciendo, desde un dispositivo.
 */

import { supabase } from './supabase';

const STORAGE_KEY = 'anvil:write-queue:v1';

/** Cuánto se espera entre reintentos, en ms. Crece pero topa en 30s. */
const RETRY_BACKOFF = [1_000, 3_000, 8_000, 20_000, 30_000] as const;

export type QueueStatus = 'idle' | 'saving' | 'pending' | 'offline' | 'error';

interface QueuedWrite {
    /** `tabla:id` — la clave de fusión. */
    key: string;
    table: string;
    id: string;
    payload: Record<string, unknown>;
    /** Para el desempate al fundir y para no reordenar escrituras. */
    updatedAt: number;
    attempts: number;
}

type Listener = (status: QueueStatus, pendingCount: number) => void;

class WriteQueue {
    private entries = new Map<string, QueuedWrite>();
    private listeners = new Set<Listener>();
    private status: QueueStatus = 'idle';
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private flushing = false;
    private hydrated = false;

    // -----------------------------------------------------------------
    // API pública
    // -----------------------------------------------------------------

    /**
     * Encola una actualización parcial de una fila.
     *
     * Devuelve inmediatamente: la interfaz no espera a la red. Quien llama
     * ya ha pintado el valor nuevo (actualización optimista) y esto solo se
     * encarga de que acabe llegando.
     */
    enqueue(table: string, id: string, payload: Record<string, unknown>): void {
        this.hydrate();

        const key = `${table}:${id}`;
        const existing = this.entries.get(key);

        this.entries.set(key, {
            key,
            table,
            id,
            // Fusión superficial: el cambio nuevo pisa al viejo campo a campo,
            // así que escribir el RPE no borra el peso que estaba pendiente.
            payload: { ...(existing?.payload ?? {}), ...payload },
            updatedAt: Date.now(),
            attempts: 0,
        });

        this.persist();
        this.emit();
        this.scheduleFlush(0);
    }

    subscribe(listener: Listener): () => void {
        this.hydrate();
        this.listeners.add(listener);
        listener(this.status, this.entries.size);
        return () => { this.listeners.delete(listener); };
    }

    get pendingCount(): number {
        this.hydrate();
        return this.entries.size;
    }

    /** Fuerza un intento inmediato. Para el botón de "reintentar". */
    flushNow(): void {
        this.scheduleFlush(0);
    }

    // -----------------------------------------------------------------
    // Persistencia
    // -----------------------------------------------------------------

    /**
     * Se lee de `localStorage` una sola vez y de forma perezosa: al arrancar
     * la app, no al importar el módulo, porque en el arranque el hilo
     * principal ya tiene bastante trabajo.
     */
    private hydrate(): void {
        if (this.hydrated) return;
        this.hydrated = true;

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed: QueuedWrite[] = JSON.parse(raw);
            parsed.forEach(entry => {
                if (entry?.key && entry.table && entry.id) this.entries.set(entry.key, entry);
            });
            if (this.entries.size > 0) this.scheduleFlush(500);
        } catch {
            // Un JSON corrupto no puede impedir que la app arranque. Se tira.
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    private persist(): void {
        try {
            if (this.entries.size === 0) localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.entries.values()]));
        } catch {
            // Cuota llena o modo privado. Se sigue funcionando en memoria:
            // peor que persistir, mucho mejor que perder el dato ahora mismo.
        }
    }

    // -----------------------------------------------------------------
    // Envío
    // -----------------------------------------------------------------

    private scheduleFlush(delay: number): void {
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => { void this.flush(); }, delay);
    }

    private async flush(): Promise<void> {
        this.hydrate();
        if (this.flushing) return;
        if (this.entries.size === 0) { this.setStatus('idle'); return; }

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            this.setStatus('offline');
            return;
        }

        this.flushing = true;
        this.setStatus('saving');

        // Se recorre una copia ordenada por antigüedad: mandar antes lo que
        // lleva más tiempo esperando evita que una fila muy tocada deje a las
        // demás sin salir nunca.
        const batch = [...this.entries.values()].sort((a, b) => a.updatedAt - b.updatedAt);
        let failed = false;

        for (const entry of batch) {
            // La entrada puede haberse fundido con un cambio nuevo mientras
            // se enviaba la anterior: se relee para no mandar un valor viejo.
            const current = this.entries.get(entry.key);
            if (!current) continue;

            const { error } = await supabase
                .from(current.table)
                .update(current.payload)
                .eq('id', current.id);

            if (error) {
                failed = true;
                current.attempts += 1;
                // Un error de permisos o de columna inexistente no se arregla
                // reintentando: se descarta tras cinco intentos para que la
                // cola no se atasque para siempre por una fila rota.
                if (current.attempts >= RETRY_BACKOFF.length) this.entries.delete(current.key);
                continue;
            }

            // Solo se borra si nadie la ha vuelto a tocar mientras viajaba.
            const after = this.entries.get(current.key);
            if (after && after.updatedAt === current.updatedAt) this.entries.delete(current.key);
        }

        this.persist();
        this.flushing = false;

        if (this.entries.size === 0) {
            this.setStatus('idle');
            return;
        }

        const attempts = Math.max(...[...this.entries.values()].map(e => e.attempts), 0);
        this.setStatus(failed ? 'error' : 'pending');
        this.scheduleFlush(RETRY_BACKOFF[Math.min(attempts, RETRY_BACKOFF.length - 1)]);
    }

    // -----------------------------------------------------------------

    private setStatus(status: QueueStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.emit();
    }

    private emit(): void {
        this.listeners.forEach(listener => listener(this.status, this.entries.size));
    }
}

export const writeQueue = new WriteQueue();

// ---------------------------------------------------------------------
// Disparadores
// ---------------------------------------------------------------------
if (typeof window !== 'undefined') {
    // Recuperar cobertura es el momento exacto en el que hay que reintentar.
    window.addEventListener('online', () => writeQueue.flushNow());

    // Volver a la pestaña también: el móvil suspende los temporizadores con
    // la pantalla apagada, así que al desbloquear puede haber cola parada.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') writeQueue.flushNow();
    });

    /**
     * Aviso al cerrar con datos sin subir.
     *
     * No es decorativo: si el atleta cierra la pestaña sin conexión, la cola
     * sobrevive en `localStorage` pero no se subirá hasta que vuelva a abrir
     * la app, y conviene que lo sepa antes de irse del gimnasio.
     */
    window.addEventListener('beforeunload', (event) => {
        if (writeQueue.pendingCount > 0) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}
