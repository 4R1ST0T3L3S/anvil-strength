import type { ReactNode } from 'react';
import type { ClaveDeTraduccion } from '../../lib/i18n/es';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { useEsqueletoDiferido } from '../../hooks/useEsqueletoDiferido';
import { useIdioma } from '../../hooks/useIdioma';

/**
 * ANVIL STRENGTH — LOS CUATRO ESTADOS, EN UN SITIO
 * =====================================================================
 *
 * EL PROBLEMA QUE RESUELVE, QUE NO ES DE ESTILO
 *
 * De los 26 componentes que consultan datos, **22 no miran si la consulta ha
 * fallado**. No es que enseñen un error feo: es que no enseñan nada. El
 * `data` viene vacío, el código dibuja su estado vacío, y el entrenador lee
 * «Todavía no tienes atletas» cuando lo que ha pasado es que se ha caído la
 * red.
 *
 * Los dos mensajes son opuestos y llevan a acciones opuestas. Uno invita a
 * crear el primero; el otro tendría que invitar a reintentar. Confundirlos
 * hace que el usuario dé por perdido algo que sigue estando ahí — y en una
 * app donde los datos son el historial de entrenamiento de años, eso asusta.
 *
 *
 * POR QUÉ UN COMPONENTE Y NO UN `if` EN CADA SITIO
 *
 * Porque el `if` correcto tiene cuatro ramas y un orden que importa, y
 * escribirlo veintidós veces garantiza que en algunas falte una:
 *
 *   1. **Error primero.** Si la consulta falló, da igual lo que haya en
 *      `data`: puede ser la respuesta buena de hace diez minutos.
 *   2. **Cargando**, y solo con esqueleto DIFERIDO. Si la respuesta llega en
 *      80ms, enseñar un esqueleto y quitarlo es un parpadeo que se lee como
 *      un fallo. Ver `useEsqueletoDiferido`.
 *   3. **Vacío**, que es un estado legítimo y no un error.
 *   4. **Contenido.**
 *
 *
 * LO QUE NO HACE
 *
 * No decide si algo está vacío: eso lo dice quien lo usa, porque «vacío» es
 * `.length === 0` en una lista pero `!plan` en un objeto y `total === 0` en
 * un agregado. Adivinarlo sería fuente de fallos silenciosos.
 */

export interface EstadoDeDatosProps {
    /** Lo que devuelve `useQuery`, o cualquier cosa con esta forma. */
    consulta: {
        isPending?: boolean;
        isLoading?: boolean;
        isError?: boolean;
        error?: unknown;
        refetch?: () => void;
    };
    /** Si los datos que han llegado están vacíos. Lo decide quien llama. */
    vacio?: boolean;

    /** Esqueleto con la FORMA del contenido final, no un spinner. */
    esqueleto: ReactNode;

    /** Qué se ofrece cuando no hay nada todavía. */
    vacioIcono?: ReactNode;
    /** Si no se pasa, se usa el texto genérico del diccionario. */
    vacioTitulo?: string;
    vacioCuerpo?: string;
    vacioAccion?: ReactNode;

    /**
     * Qué se estaba cargando, como CLAVE del diccionario (`que.atletas`).
     * No como texto: si se pasara «los atletas» a mano, la frase inglesa
     * saldría medio traducida — "Couldn't load los atletas".
     */
    queEs?: Extract<ClaveDeTraduccion, `que.${string}`>;

    children: ReactNode;
}

export function EstadoDeDatos({
    consulta,
    vacio = false,
    esqueleto,
    vacioIcono,
    vacioTitulo,
    vacioCuerpo,
    vacioAccion,
    queEs,
    children,
}: EstadoDeDatosProps) {
    const { t } = useIdioma();
    // `isPending` es el nombre de TanStack Query v5; `isLoading` el de v4 y el
    // de los hooks propios. Se aceptan los dos para que esto valga en toda la
    // app sin obligar a migrar nada primero.
    const cargando = consulta.isPending ?? consulta.isLoading ?? false;
    const mostrarEsqueleto = useEsqueletoDiferido(cargando);

    // 1. El error manda sobre todo lo demás.
    if (consulta.isError) {
        return (
            <EmptyState
                kind="error"
                icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
                title={queEs ? t('estado.errorTituloDe', { que: queEs }) : t('estado.errorTitulo')}
                body={t(mensajeDeError(consulta.error))}
                action={
                    consulta.refetch && (
                        <Button variant="secondary" onClick={() => consulta.refetch?.()}>
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            {t('accion.reintentar')}
                        </Button>
                    )
                }
            />
        );
    }

    // 2. Cargando. Dentro de la ventana de 220ms no se pinta NADA: ni
    //    esqueleto ni hueco. Un hueco que aparece y desaparece salta igual.
    if (cargando) return mostrarEsqueleto ? <>{esqueleto}</> : null;

    // 3. Vacío de verdad, que no es un fallo.
    if (vacio) {
        return (
            <EmptyState
                icon={vacioIcono}
                title={vacioTitulo ?? t('estado.vacioTitulo')}
                body={vacioCuerpo}
                action={vacioAccion}
            />
        );
    }

    return <>{children}</>;
}

/**
 * Qué se le cuenta al usuario cuando algo falla.
 *
 * Devuelve una CLAVE, no una frase: así el mensaje se traduce con el resto de
 * la interfaz en vez de quedarse en español dentro de una pantalla inglesa.
 *
 * Y nunca el mensaje crudo de Postgres: «duplicate key value violates unique
 * constraint "coach_athletes_pkey"» no le dice nada a un entrenador y le dice
 * demasiado a quien no debería estar mirando. Se reconoce lo que se puede y,
 * para el resto, se dice que se puede reintentar — que es la única
 * información accionable que hay.
 */
function mensajeDeError(error: unknown): ClaveDeTraduccion {
    const texto = error instanceof Error ? error.message : String(error ?? '');

    if (/Failed to fetch|NetworkError|network/i.test(texto)) return 'estado.errorSinRed';
    if (/JWT|401|not authenticated/i.test(texto)) return 'estado.errorSesion';
    if (/timeout|timed out/i.test(texto)) return 'estado.errorLento';
    return 'estado.errorGenerico';
}
