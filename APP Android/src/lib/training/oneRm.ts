/**
 * 1RM ESTIMADO A PARTIR DE REPETICIONES — LA ÚNICA COPIA
 * =====================================================================
 * Esta es la ÚNICA implementación de "cuánto levantaría este atleta a una
 * repetición, visto lo que ha levantado a N". Todo lo que necesite esa
 * cifra —estadísticas, análisis de bloque, la calculadora del atleta—
 * importa de aquí.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 *
 * Había tres copias con tres comportamientos distintos, y la diferencia no
 * era cosmética:
 *
 *   src/lib/planning/blockAnalytics.ts   cortaba en `reps === 1`
 *   src/lib/stats/athleteStats.ts        NO cortaba
 *   OneRMCalculator.tsx (en línea)       usaba 0,0333 en vez de 1/30,
 *                                        y sin techo de repeticiones
 *
 * La segunda es la que hacía daño: un atleta que levanta 100 kg a UNA
 * repetición —un 1RM real, medido, no estimado— aparecía en toda la
 * pantalla de estadísticas como 103,3 kg, porque la fórmula se aplicaba
 * igualmente sobre un dato que ya era el máximo. Un 3,3% de inflación
 * sobre el dato MÁS fiable que existe, y arrastrado a todo lo que se
 * calcula encima: la intensidad relativa, la comparativa entre
 * ejercicios, el reparto por zonas.
 *
 * La tercera es más sutil: 0,0333 no es 1/30 (0,0333…), así que la
 * calculadora del atleta y el resto de la aplicación daban números
 * distintos para la misma serie. Poco, pero distinto, y sin ninguna razón.
 *
 *
 * POR QUÉ EPLEY Y NO BRZYCKI
 *
 * En el rango de 1-8 repeticiones —donde se programa el powerlifting—
 * Epley es algo más conservadora por arriba y no se rompe con
 * repeticiones altas, mientras que Brzycki diverge por encima de 10 (a 37
 * repeticiones daría un 1RM infinito).
 *
 *
 * LO QUE NO VIVE AQUÍ, Y NO ES UN OLVIDO
 *
 * Estimar el 1RM por VELOCIDAD es otro modelo físico, no otra copia de
 * este. Trabaja con la recta carga-velocidad del atleta y responde a una
 * pregunta distinta, así que tiene su propio sitio y se queda ahí:
 *
 *   src/utils/vbtCalculator.ts     calcular1RMporVelocidad()
 *   src/lib/cv/pwrMath.ts          estimate1RM() sobre velocidad medida
 *   src/lib/vbt/analysis.ts        el corte de la recta con la MVT
 *
 * Unificar aquello con esto daría una cifra que no significa nada.
 */

/**
 * Techo de repeticiones sobre el que ninguna fórmula predice fuerza máxima.
 *
 * Por encima se está midiendo resistencia, no fuerza: una serie de 20 daría
 * un "1RM" que nadie levantaría nunca.
 */
export const MAX_REPS_FOR_1RM = 12;

/**
 * 1RM estimado por Epley: `1RM = carga × (1 + reps/30)`.
 *
 * Devuelve `null` —y no un número— cuando la entrada no permite estimar
 * nada: carga o repeticiones no finitas, cero o negativas, o por encima de
 * {@link MAX_REPS_FOR_1RM}. Quien llama decide qué hacer con la ausencia;
 * lo que no puede pasar es que se cuele un 0 en una media.
 *
 * A UNA repetición devuelve la carga TAL CUAL. No es un caso especial de
 * la fórmula: es que a una repetición no hay nada que estimar, el dato ya
 * es el máximo. Aplicarle Epley lo inflaría un 3,3%.
 */
export function estimate1RM(load: number, reps: number): number | null {
    if (!Number.isFinite(load) || load <= 0) return null;
    if (!Number.isFinite(reps) || reps <= 0 || reps > MAX_REPS_FOR_1RM) return null;
    if (reps === 1) return load;
    return round1(load * (1 + reps / 30));
}

/**
 * Carga teórica para N repeticiones dado un 1RM. Inversa exacta de
 * {@link estimate1RM}.
 *
 * A una repetición devuelve el propio 1RM, por simetría con la de arriba:
 * si `estimate1RM(x, 1) === x`, entonces `loadForReps(x, 1)` tiene que ser
 * `x` y no `x/1,0333`.
 */
export function loadForReps(oneRm: number, reps: number): number | null {
    if (!Number.isFinite(oneRm) || oneRm <= 0) return null;
    if (!Number.isFinite(reps) || reps <= 0 || reps > MAX_REPS_FOR_1RM) return null;
    if (reps === 1) return oneRm;
    return round1(oneRm / (1 + reps / 30));
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}
