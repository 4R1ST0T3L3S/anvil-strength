import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { escucharScroll, irAScroll, posicionDeScroll } from '../lib/scrollHost';

/**
 * ANVIL STRENGTH — RESTAURACIÓN DE SCROLL
 * =====================================================================
 *
 * QUÉ ARREGLA
 *
 * Hasta ahora no había ninguna: cambiar de ruta conservaba la posición del
 * scroll, así que pulsar «Competiciones» desde el pie de la portada aterrizaba
 * a media página en la nueva. Se lee como que la página ha cargado mal.
 *
 * Y al revés: volver atrás desde una ficha a la lista de atletas te dejaba
 * arriba del todo, cuando estabas mirando al número veinte. Eso obliga a
 * recorrer la lista otra vez cada vez que se entra y se sale, que es lo que
 * un entrenador hace treinta veces seguidas.
 *
 *
 * LAS DOS REGLAS
 *
 *   · Navegación NUEVA (`PUSH`) → arriba. Es contenido que no habías visto.
 *   · Volver o avanzar (`POP`)  → a donde estabas. Es contenido que ya
 *     habías recorrido, y el navegador lo hace así desde siempre.
 *
 *
 * LO QUE HABÍA QUE QUITAR PARA QUE ESTO FUNCIONARA
 *
 * `PublicHeader` hacía esto en el manejador del clic de cada enlace:
 *
 *     navigate(href);
 *     window.scrollTo(0, 0);
 *
 * Esa segunda línea corre SÍNCRONA, dentro del clic, cuando la página que se
 * abandona todavía está entera en pantalla. O sea que borraba la posición de
 * scroll antes de que existiera nadie que pudiera apuntarla. Medido con una
 * traza en el navegador: `anota default 0` con el documento aún midiendo
 * 9.952px, o sea sin que la página hubiera encogido lo más mínimo.
 *
 * Cuesta verlo porque el síntoma —volver atrás aterriza arriba— es
 * exactamente lo que uno espera de una app que no tiene restauración, así que
 * parece que falte código en vez de sobrar.
 *
 * Lo que ese `scrollTo` hacía bien (subir arriba al cambiar de ruta) lo hace
 * ahora este hook para TODA la aplicación, no solo para los enlaces de esa
 * cabecera, y distinguiendo lo que aquella línea no distinguía: ruta nueva
 * arriba, volver atrás a donde estabas.
 *
 * Antes de dar con eso se probaron tres arreglos sobre una teoría equivocada
 * —que la culpa era del recorte del navegador al encoger la página al cambiar
 * de ruta— y los tres fallaron, porque no era eso. Queda escrito para que
 * nadie los repita: apuntar la posición en el efecto de la ruta nueva, cancelar
 * el frame pendiente al limpiar, y mover esa limpieza a `useLayoutEffect`.
 *
 *
 * POR QUÉ NO SE USA `<ScrollRestoration>` DE REACT ROUTER
 *
 * Porque solo existe en los enrutadores de datos (`createBrowserRouter`), y
 * esta aplicación monta `<BrowserRouter>` con rutas declaradas en JSX. Migrar
 * el enrutador entero para conseguir esto sería mover una pieza crítica —la
 * que decide quién ve qué panel— por una mejora de scroll.
 *
 *
 * OJO CON `window.scrollY`
 *
 * El panel no desplaza la ventana: desplaza un `<main>` interno. Todo lo de
 * aquí pasa por `src/lib/scrollHost.ts`, que pregunta cuál de los dos es. Un
 * `window.scrollTo` a secas restauraría cero en la mitad de la aplicación sin
 * dar ni un error.
 */

const CLAVE = 'anvil_scroll';

function leerDeSesion(): Record<string, number> {
    try {
        return JSON.parse(sessionStorage.getItem(CLAVE) ?? '{}');
    } catch {
        return {};
    }
}

/**
 * El espejo en memoria.
 *
 * Se escribe en cada frame con scroll, y eso son decenas de veces por
 * segundo: hacer `JSON.stringify` de todo el historial a ese ritmo sería
 * trabajo de sobra en el hilo principal justo mientras el usuario se
 * desplaza, que es cuando menos se le puede robar. A `sessionStorage` solo se
 * baja al cambiar de ruta y al salir de la página, para que sobreviva a un F5.
 */
const posiciones: Record<string, number> = leerDeSesion();

/**
 * Cuántas entradas del historial se recuerdan.
 *
 * Cada navegación crea una clave nueva y ninguna se borra sola: un entrenador
 * que entre y salga de treinta fichas en una sesión larga acumula cientos.
 * Pesan poco —una veintena de bytes cada una— pero no hay razón para no
 * ponerle techo, y cincuenta cubre de sobra cualquier "atrás" que alguien
 * vaya a pulsar de verdad.
 */
const TOPE = 50;

function bajarASesion() {
    try {
        // Las claves de un objeto conservan el orden de inserción, así que las
        // primeras son siempre las más viejas.
        const claves = Object.keys(posiciones);
        for (const vieja of claves.slice(0, claves.length - TOPE)) {
            delete posiciones[vieja];
        }
        sessionStorage.setItem(CLAVE, JSON.stringify(posiciones));
    } catch { /* sin cuota, o modo privado: no es crítico */ }
}

export function useScrollRestoration() {
    const location = useLocation();
    const tipo = useNavigationType();
    const clave = location.key ?? location.pathname;

    // ---------------------------------------------------------------
    // 1. Apuntar dónde está, mientras el usuario se desplaza.
    // ---------------------------------------------------------------
    useEffect(() => {
        let pendiente = 0;

        const anotar = () => {
            pendiente = 0;
            posiciones[clave] = posicionDeScroll();
        };

        // Embudo por frame: el evento llega decenas de veces por segundo y no
        // hace falta atender a todas.
        const alDesplazar = () => {
            if (pendiente) return;
            pendiente = requestAnimationFrame(anotar);
        };

        const soltar = escucharScroll(alDesplazar);
        return () => {
            soltar();
            cancelAnimationFrame(pendiente);
            bajarASesion();
        };
    }, [clave]);

    // ---------------------------------------------------------------
    // 2. Colocarse al llegar.
    // ---------------------------------------------------------------
    useEffect(() => {
        /*
         * EL SALTO NO PUEDE SER UN SOLO `requestAnimationFrame`.
         *
         * Al volver atrás a una ruta diferida —que son las veintiuna— lo que
         * hay en pantalla en el frame siguiente es el ESQUELETO, no la lista de
         * atletas. La página mide seiscientos pixeles en vez de dos mil
         * cuatrocientos, y un `scrollTo(2400)` sobre eso lo recorta el
         * navegador al máximo disponible: aterrizas al final del esqueleto, y
         * cuando por fin llega el contenido te quedas a un tercio.
         *
         * Así que se reintenta cada frame hasta que la página mida lo
         * suficiente, con dos frenos: 600ms de tope y parar en cuanto el
         * usuario toque la rueda. Restaurar el scroll DEBAJO de alguien que ya
         * ha empezado a leer es peor que no restaurarlo.
         */
        let id = 0;
        const limite = performance.now() + 600;
        let cancelado = false;

        const alInterferir = () => { cancelado = true; };
        window.addEventListener('wheel', alInterferir, { passive: true, once: true });
        window.addEventListener('touchstart', alInterferir, { passive: true, once: true });
        window.addEventListener('keydown', alInterferir, { once: true });

        const destino = tipo === 'POP' ? (posiciones[clave] ?? 0) : 0;

        const intentar = () => {
            if (cancelado) return;

            // `instant` y no `smooth`: al volver atrás, ver la página
            // deslizarse hasta donde estabas es más lento y más raro que
            // aparecer ya allí, que es lo que hace el navegador nativo.
            irAScroll(destino);

            // Arriba del todo siempre cabe: no hay nada que esperar.
            if (destino === 0) return;

            // ¿Ha llegado de verdad? Si el contenido aún no da de sí, la
            // posición real se queda corta y toca esperar otro frame.
            const llego = Math.abs(posicionDeScroll() - destino) < 2;
            if (llego || performance.now() > limite) return;

            id = requestAnimationFrame(intentar);
        };

        id = requestAnimationFrame(intentar);

        return () => {
            cancelado = true;
            cancelAnimationFrame(id);
            window.removeEventListener('wheel', alInterferir);
            window.removeEventListener('touchstart', alInterferir);
            window.removeEventListener('keydown', alInterferir);
        };
        // `tipo` queda fuera a propósito: lo que dispara una restauración es
        // haber cambiado de entrada del historial, y `clave` ya lo dice.
        // Incluirlo la repetiría si el enrutador reevalúa sin haberse movido.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave]);

    // ---------------------------------------------------------------
    // 3. Cerrar la pestaña o recargar también tiene que guardar.
    // ---------------------------------------------------------------
    useEffect(() => {
        const alSalir = () => {
            posiciones[clave] = posicionDeScroll();
            bajarASesion();
        };
        window.addEventListener('pagehide', alSalir);
        return () => window.removeEventListener('pagehide', alSalir);
    }, [clave]);
}
