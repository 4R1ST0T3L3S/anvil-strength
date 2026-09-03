import { useEffect, useRef, useState } from 'react';

/**
 * ¿Hay que enseñar el esqueleto ya?
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Con los datos en caché, una pantalla tarda 40 ms en aparecer. Si el
 * esqueleto se pinta en cuanto `isPending` se pone a true, aparece y
 * desaparece en dos frames: el ojo no lo lee como "está cargando" sino como
 * un PARPADEO, que es la señal universal de que algo va mal. Es peor que no
 * poner nada.
 *
 * Y al revés: si el esqueleto ya está a la vista y los datos llegan a los
 * 210 ms, quitarlo inmediatamente produce el mismo parpadeo por el otro
 * lado.
 *
 * Por eso hay dos umbrales y no uno:
 *
 *   `retraso`  (220 ms) — no se enseña nada antes de esto. Cubre la inmensa
 *                         mayoría de las lecturas con caché caliente, que
 *                         terminan sin que se llegue a pintar un esqueleto.
 *   `minimo`   (400 ms) — una vez enseñado, se mantiene al menos esto. Así
 *                         nunca se ve un destello.
 *
 * Los 220 ms coinciden con `--dur-base`, que es lo que el sistema considera
 * el límite de lo que se percibe como inmediato.
 *
 *
 *     const cargando = useQuery(...).isPending;
 *     const mostrar = useEsqueletoDiferido(cargando);
 *     if (mostrar) return <SkeletonList />;
 *     if (cargando) return null;   // dentro de la ventana: nada, ni hueco
 */
export function useEsqueletoDiferido(
    cargando: boolean,
    { retraso = 220, minimo = 400 }: { retraso?: number; minimo?: number } = {}
): boolean {
    const [mostrar, setMostrar] = useState(false);
    const mostradoEn = useRef<number | null>(null);

    useEffect(() => {
        let temporizador: number | undefined;

        if (cargando) {
            temporizador = window.setTimeout(() => {
                // `Date.now()` y no un contador: hay que medir tiempo de
                // pared, porque la pestaña puede haber estado en segundo plano.
                mostradoEn.current = Date.now();
                setMostrar(true);
            }, retraso);
        } else if (mostrar) {
            const visibleDesde = mostradoEn.current ?? Date.now();
            // `Math.max(0, ...)` y NO una rama que llame a setState directamente:
            // hacerlo en el cuerpo del efecto encadena un render extra, que es
            // el `set-state-in-effect` que F2 viene a quitar. Con retraso cero,
            // el navegador lo ejecuta igual de rápido y desde una devolución
            // de llamada, que es donde sí se puede.
            const restante = Math.max(0, minimo - (Date.now() - visibleDesde));
            temporizador = window.setTimeout(() => {
                mostradoEn.current = null;
                setMostrar(false);
            }, restante);
        }

        return () => { if (temporizador) window.clearTimeout(temporizador); };
        // `mostrar` entra en las dependencias a propósito: al apagarse hay que
        // volver a evaluar si toca cerrar la ventana mínima.
    }, [cargando, mostrar, retraso, minimo]);

    return mostrar;
}
