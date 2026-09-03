import { useEffect, useRef, useState } from 'react';
import { writeQueue, type QueueStatus } from '../lib/offlineQueue';

export interface WriteQueueState {
    status: QueueStatus;
    pending: number;
    /**
     * Acaba de vaciarse la cola. Dura dos segundos y se apaga solo.
     *
     * Se calcula aquí, en la transición de "había cosas pendientes" a "ya no
     * queda ninguna", y no simplemente comprobando `status === 'idle'`: eso
     * último es cierto también al abrir la pantalla sin haber guardado nada,
     * y enseñar "Guardado" a alguien que no ha tocado nada es mentira.
     */
    justSaved: boolean;
    retry: () => void;
}

/**
 * Estado de la cola de guardado, para pintarlo en la interfaz.
 *
 * Sin esto el atleta no tiene forma de distinguir "guardado" de "escrito en
 * la pantalla pero todavía no ha salido del móvil", que es justo la
 * diferencia que importa cuando cierras la app y te vas del gimnasio.
 */
export function useWriteQueue(): WriteQueueState {
    const [state, setState] = useState<Omit<WriteQueueState, 'retry'>>({
        status: 'idle',
        pending: 0,
        justSaved: false,
    });

    const previous = useRef<{ status: QueueStatus; pending: number } | null>(null);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        // El `setState` vive dentro de la suscripción, que es la forma
        // correcta de sincronizar con un sistema externo: llamarlo en el
        // cuerpo del efecto encadena renders y además dispararía el aviso de
        // "guardado" en cada montaje.
        const unsubscribe = writeQueue.subscribe((status, pending) => {
            const wasBusy = previous.current !== null &&
                (previous.current.pending > 0 || previous.current.status === 'saving');
            const nowIdle = status === 'idle' && pending === 0;
            const justSaved = wasBusy && nowIdle;

            previous.current = { status, pending };
            setState({ status, pending, justSaved });

            if (justSaved) {
                clearTimeout(timer);
                timer = setTimeout(() => setState(s => ({ ...s, justSaved: false })), 2000);
            }
        });

        return () => { unsubscribe(); clearTimeout(timer); };
    }, []);

    return { ...state, retry: () => writeQueue.flushNow() };
}
