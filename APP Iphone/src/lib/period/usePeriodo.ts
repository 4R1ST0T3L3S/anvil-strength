import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ajustarAlAmbito, reglaDe, type Ambito } from './applicability';
import { resolverPeriodo, type BloqueTemporal } from './resolve';
import { conPeriodo, leerPeriodo } from './url';
import type { Periodo, PeriodoResuelto } from './types';

/**
 * EL PERIODO DE UNA PANTALLA.
 * =====================================================================
 *
 * Junta las tres piezas: lee el periodo de la URL, lo ajusta a lo que la
 * pantalla admite (matriz de aplicabilidad) y lo resuelve contra el
 * calendario.
 *
 *     const { periodo, resuelto, cambiar, opciones } = usePeriodo('volumen', { bloques });
 *
 *
 * DOS DETALLES QUE IMPORTAN
 *
 * `replace: true` al cambiar de periodo. Cambiar de "esta semana" a "este
 * mes" NO debe dejar una entrada nueva en el historial: si alguien prueba
 * cinco periodos seguidos y luego pulsa atrás, espera salir de la pantalla,
 * no deshacer cinco filtros de uno en uno. Lo que sí se conserva es que la
 * dirección es compartible y sobrevive a un F5, que era el objetivo.
 *
 * El ajuste al ámbito ocurre AL LEER, no al escribir. Así, navegar de una
 * pantalla que admite "por bloque" a otra que no —arrastrando el parámetro—
 * cae en el periodo de la nueva en vez de enseñar una vista vacía, y al
 * volver atrás el periodo original sigue en la URL intacto.
 */
export function usePeriodo(
    ambito: Ambito,
    { bloques = [] }: { bloques?: BloqueTemporal[] } = {}
): {
    /** El periodo elegido, ya ajustado a lo que esta pantalla admite. */
    periodo: Periodo;
    /** Resuelto contra el calendario (o en modo ordinal). */
    resuelto: PeriodoResuelto;
    cambiar: (siguiente: Periodo) => void;
    /** Los periodos que ofrecer, en orden, ya montados con sus bloques. */
    opciones: Periodo[];
} {
    const [params, setParams] = useSearchParams();

    const periodo = useMemo(
        () => ajustarAlAmbito(ambito, leerPeriodo(params)),
        [ambito, params]
    );

    /*
     * FIRMA DEL CONJUNTO DE BLOQUES, en vez de la referencia del array.
     *
     * `bloques` llega como un array nuevo en cada render del padre, así que
     * usarlo de dependencia recalcularía siempre. Lo que de verdad identifica
     * al conjunto para este cálculo son los identificadores y las fechas de
     * inicio: si ninguna cambia, el periodo se resuelve igual.
     *
     * Se calcula fuera del `useMemo` porque la regla exige que las
     * dependencias sean expresiones simples, no llamadas.
     */
    const firmaBloques = bloques.map(b => `${b.id}:${b.start_date ?? ''}`).join('|');
    const firmaIds = bloques.map(b => b.id).join('|');

    const resuelto = useMemo(
        () => resolverPeriodo(periodo, { bloques }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [periodo, firmaBloques]
    );

    const cambiar = useCallback(
        (siguiente: Periodo) => setParams(previos => conPeriodo(previos, siguiente), { replace: true }),
        [setParams]
    );

    const opciones = useMemo(() => {
        const regla = reglaDe(ambito);
        const salida: Periodo[] = [];

        for (const tipo of regla.admite) {
            if (tipo === 'ultimas') {
                // Dos horizontes y no cinco: 4 semanas es "el mesociclo que
                // llevo" y 12 es "la temporada". Entre medias no hay ninguna
                // pregunta que alguien se haga de verdad.
                salida.push({ tipo: 'ultimas', semanas: 4 });
                salida.push({ tipo: 'ultimas', semanas: 12 });
            } else if (tipo === 'bloque') {
                // Un bloque por opción, del más reciente al más antiguo.
                for (const b of bloques) salida.push({ tipo: 'bloque', blockId: b.id });
            } else {
                salida.push({ tipo });
            }
        }
        return salida;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ambito, firmaIds]);

    return { periodo, resuelto, cambiar, opciones };
}
