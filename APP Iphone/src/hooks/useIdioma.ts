import { useCallback, useMemo } from 'react';
import { useState } from 'react';
import {
    detectarIdioma,
    formatearFecha,
    formatearNumero,
    formatearPeso,
    guardarIdioma,
    plural,
    traducir,
    type ArgsDe,
    type BaseDePlural,
    type Idioma,
} from '../lib/i18n';
import type { ClaveDeTraduccion } from '../lib/i18n/es';

/**
 * EL IDIOMA, PARA REACT.
 * =====================================================================
 *
 * POR QUÉ NO HAY CONTEXTO NI PROVEEDOR
 *
 * Porque no hace falta. El idioma no cambia sin recargar nada más que este
 * estado, no hay jerarquía de idiomas por subárbol, y un contexto obligaría a
 * envolver la aplicación entera para no ganar nada.
 *
 * El precio de no tenerlo: cambiar el idioma solo repintaría los componentes
 * que usen ESTE hook. Por eso `cambiar` recarga la página — ver ahí abajo.
 *
 *
 * `t` Y `p` VAN MEMORIZADOS CONTRA EL IDIOMA
 *
 * Se usan dentro de listas de cientos de filas. Una función nueva en cada
 * render invalidaría cualquier `memo` que la reciba, que es la forma habitual
 * de que una capa de traducción se coma el rendimiento de una tabla.
 */
export function useIdioma() {
    const [idioma, setIdioma] = useState<Idioma>(() => detectarIdioma());

    const cambiar = useCallback((nuevo: Idioma) => {
        guardarIdioma(nuevo);
        setIdioma(nuevo);
        /*
         * RECARGAR, Y NO ES PEREZA.
         *
         * Sin contexto, cambiar el idioma solo repinta los componentes
         * suscritos. Los que todavía tienen su texto escrito a mano —que hoy
         * son casi todos, ver la nota de estado en lib/i18n/index.ts— se
         * quedarían como estaban, y la pantalla acabaría medio en cada idioma.
         *
         * Una recarga es honesta: cuesta una fracción de segundo, ocurre una
         * vez cada muchos meses y garantiza que lo que se ve es coherente.
         * Cuando la extracción esté hecha, esta línea se cae sola.
         *
         * `location.reload()` conserva la URL, así que se vuelve a la misma
         * pantalla; y `useScrollRestoration` guarda la posición en `pagehide`,
         * así que también al mismo sitio de la página.
         */
        window.location.reload();
    }, []);

    /** Traduce. Solo acepta claves declaradas: los datos no pasan por aquí. */
    const t = useCallback(
        <K extends ClaveDeTraduccion>(clave: K, ...resto: ArgsDe<K>) =>
            traducir(idioma, clave, ...resto),
        [idioma]
    );

    /** Plural por `Intl.PluralRules`, no por `n === 1`. */
    const p = useCallback(
        (base: BaseDePlural, n: number, extra?: Record<string, string | number>) =>
            plural(idioma, base, n, extra),
        [idioma]
    );

    const fecha = useCallback(
        (f: Date | string, o?: Intl.DateTimeFormatOptions) => formatearFecha(idioma, f, o),
        [idioma]
    );
    const numero = useCallback(
        (n: number, o?: Intl.NumberFormatOptions) => formatearNumero(idioma, n, o),
        [idioma]
    );
    const peso = useCallback((kg: number) => formatearPeso(idioma, kg), [idioma]);

    return useMemo(
        () => ({ idioma, cambiar, t, p, fecha, numero, peso }),
        [idioma, cambiar, t, p, fecha, numero, peso]
    );
}
