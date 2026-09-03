import { useEffect, useState } from 'react';
import { vbtService } from '../../../../services/vbtService';
import { buildPatternVelocityProfile } from '../../../../lib/vbt/analysis';
import type { AthleteVelocityProfile } from '../../../../lib/cv/pwrMath';
import type { ExerciseType } from '../../../../lib/cv/pwrSetup';

/**
 * EL PERFIL CARGA-VELOCIDAD DEL ATLETA, PARA EL 1RM DE PWR
 * =====================================================================
 *
 * La estimación de 1RM usaba un perfil GENÉRICO: todo el mundo termina su
 * máximo a la misma velocidad y el %1RM baja igual para todos. Es razonable en
 * promedio y falso en un individuo — la velocidad del máximo varía bastante
 * entre atletas —, y la aplicación ya tenía la recta del atleta calculada en
 * otra pantalla. Usar el genérico teniendo la suya delante era la mayor pérdida
 * de precisión del módulo que no dependía del vídeo.
 *
 * Esto no ajusta nada: pide las mediciones y llama al mismo
 * `buildPatternVelocityProfile` que alimenta la pestaña de VBT. Dos ajustes
 * distintos del mismo perfil acabarían dando dos 1RM distintos del mismo
 * atleta, que es justo el fallo que se acaba de corregir con el MVT.
 *
 *
 * SE CUENTAN TAMBIÉN LAS MEDICIONES DE VÍDEO, Y ES A PROPÓSITO
 *
 * Podría parecer que el perfil solo debería construirse con mediciones de
 * encoder, que son más fiables. Pero lo que se usa del perfil es la PENDIENTE,
 * y la de PWR viene medida con el mismo sesgo (−4,4% en velocidad media) que
 * la medición de hoy: al recorrer la recta desde el punto de hoy, los dos
 * sesgos van en el mismo sentido y se cancelan en buena parte. Con un perfil
 * de encoder y una medición de vídeo NO se cancelarían.
 *
 * Y en la práctica: casi nadie tiene encoder. Un perfil que solo se construye
 * con encoder es un perfil que no se construye nunca.
 */

export interface AthleteProfileState {
    /** Lo que `estimate1RM` necesita, o `null` si no hay recta. */
    profile: AthleteVelocityProfile | null;
    /** Cuántas mediciones lo sostienen. Para poder enseñarlo en pantalla. */
    measurements: number;
}

const EMPTY: AthleteProfileState = { profile: null, measurements: 0 };

/** De quién y de qué movimiento es lo que hay guardado ahora mismo. */
interface Resolved extends AthleteProfileState {
    key: string;
}

export function useAthleteVelocityProfile(
    athleteId: string | null | undefined,
    exerciseType: ExerciseType
): AthleteProfileState {
    const [resolved, setResolved] = useState<Resolved | null>(null);
    const key = athleteId ? `${athleteId}|${exerciseType}` : null;

    useEffect(() => {
        if (!athleteId || !key) return;

        // Cuando el ejercicio cambia mientras la petición está en vuelo, la
        // respuesta vieja llegaría después y pisaría a la nueva. El perfil de
        // banca acabaría estimando el 1RM de una sentadilla.
        let current = true;

        void (async () => {
            try {
                const measurements = await vbtService.getMeasurements(athleteId);
                if (!current) return;

                const fitted = buildPatternVelocityProfile(measurements, exerciseType);

                setResolved({
                    key,
                    measurements: fitted?.points.length ?? 0,
                    profile: fitted
                        ? {
                            slopePerKg: fitted.slope,
                            n: fitted.points.length,
                            r2: fitted.r2,
                            loadRangeKg: fitted.loadRangeKg,
                        }
                        : null,
                });
            } catch {
                // Sin perfil se cae al genérico, que es exactamente lo que
                // hacía antes: un fallo de red no puede impedir analizar un
                // vídeo. Se marca con la clave igualmente para no reintentar
                // en bucle sobre el mismo atleta.
                if (current) setResolved({ key, ...EMPTY });
            }
        })();

        return () => { current = false; };
    }, [athleteId, exerciseType, key]);

    /**
     * SE COMPARA LA CLAVE, Y NO ES UN DETALLE.
     *
     * Devolver `resolved` a secas dejaría el perfil ANTERIOR en pie mientras
     * llega el nuevo: cambiar de sentadilla a banca estimaría el 1RM de banca
     * con la pendiente de la sentadilla durante el par de décimas que tarda la
     * petición. Saldría una cifra plausible, en pantalla, y luego cambiaría
     * sola — que es justo el tipo de fallo silencioso que este módulo lleva
     * toda la revisión persiguiendo.
     *
     * Mientras no coincidan, se devuelve vacío y el 1RM sale del genérico
     * diciéndolo.
     */
    return resolved && resolved.key === key ? resolved : EMPTY;
}
