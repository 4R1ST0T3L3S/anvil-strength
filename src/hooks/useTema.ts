import { useCallback, useEffect, useState } from 'react';
import { aplicarTema, guardarTema, leerTema, temaEfectivo, type Tema } from '../lib/tema';

/**
 * El tema, para React.
 *
 * El estado arranca con un inicializador perezoso —una sola lectura, antes
 * del primer pintado— en vez de con un efecto que provocaría un segundo
 * render con el tema equivocado en medio.
 *
 * EL EFECTO QUE ESCUCHA AL SISTEMA es la mitad que se suele olvidar. Con el
 * tema en `sistema`, si alguien cambia el ajuste del móvil con la app abierta
 * —o si el móvil lo cambia solo al anochecer, que es lo normal— la app tiene
 * que seguirle. Sin este oyente, se queda en el tema que había al abrirla
 * hasta que se recargue.
 */
export function useTema() {
    const [tema, setTemaEstado] = useState<Tema>(() => leerTema());

    const establecer = useCallback((nuevo: Tema) => {
        setTemaEstado(nuevo);
        guardarTema(nuevo);
    }, []);

    useEffect(() => {
        if (tema !== 'sistema') return;

        const mq = window.matchMedia('(prefers-color-scheme: light)');
        const alCambiar = () => aplicarTema('sistema');
        mq.addEventListener('change', alCambiar);
        return () => mq.removeEventListener('change', alCambiar);
    }, [tema]);

    return {
        tema,
        /** Lo que se está pintando ahora, con `sistema` ya resuelto. */
        efectivo: temaEfectivo(tema),
        establecer,
    };
}
