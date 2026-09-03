/**
 * ANVIL STRENGTH — LO QUE HAY QUE SABER ANTES DE ANALIZAR
 * =====================================================================
 *
 * EL HUECO QUE CIERRA (Fase 3)
 *
 * El ejercicio y la carga se pedían DESPUÉS de analizar, en el panel de
 * métricas, con la carga arrancando en 100 kg. La cinemática no depende de
 * ellos —el recorrido y la velocidad salen del vídeo— pero **la fuerza, la
 * potencia y el 1RM sí**, y los tres se calculan multiplicando por la masa:
 *
 *     analizar una serie de 60 kg con el campo en 100 infla las cifras un 67%
 *
 * Y nadie se acuerda de corregirlo, porque el número que sale ya parece bueno.
 * Es el mismo patrón que el resto del módulo lleva toda la revisión
 * persiguiendo: **el fallo silencioso que produce un resultado creíble**.
 *
 * Pedirlo antes no es solo moverlo de sitio. Antes de analizar, la pregunta se
 * contesta MIRANDO el vídeo que se acaba de elegir; después se contesta de
 * memoria, y con las métricas ya en pantalla tirando de la respuesta.
 *
 *
 * POR QUÉ ESTO ESTÁ EN `lib/` Y NO DENTRO DEL COMPONENTE
 *
 * Porque son reglas, no pintura: qué carga es imposible, qué barra invalida
 * qué métrica, qué hay que advertir. Aquí se pueden ejecutar en Node contra
 * casos conocidos, que es el compromiso de método de este módulo (§13 de la
 * auditoría). Un `if` dentro del JSX no se puede comprobar de ninguna manera.
 */

export type ExerciseType = 'squat' | 'bench' | 'deadlift';

export const EXERCISE_LABEL: Record<ExerciseType, string> = {
    squat: 'Sentadilla',
    bench: 'Press banca',
    deadlift: 'Peso muerto',
};

// =====================================================================
// BARRAS
// =====================================================================

export interface BarType {
    id: string;
    label: string;
    /**
     * Masa de la barra sola, en kilos.
     *
     * NO se suma a nada: la carga que se pide es la TOTAL, barra incluida, que
     * es como se registra en el resto de la aplicación. Sirve para lo
     * contrario — comprobar que la carga declarada no sea imposible.
     *
     * `null` cuando no se sabe. Entonces no se comprueba nada, que es mejor
     * que comprobar contra un valor inventado.
     */
    massKg: number | null;
    /**
     * `true` cuando el DISCO no viaja igual que la barra.
     *
     * Es la única propiedad de la barra que cambia la medición, y cambia la
     * parte que más importa: aquí se sigue el disco, no la barra. Una barra de
     * peso muerto flexa varios centímetros antes de que la carga despegue, así
     * que el disco arranca más tarde y con otro perfil. El recorrido total sale
     * bien —el disco acaba donde acaba— pero el arranque no es el de la barra.
     */
    plateLagsBar: boolean;
    /** Qué hay que saber al leer las cifras. Se enseña, no se esconde. */
    caveat?: string;
}

/**
 * Las barras que se pueden elegir.
 *
 * La lista es corta a propósito. Cada entrada tiene que ganarse el sitio
 * cambiando algo: la masa con la que se comprueba la carga, o la advertencia.
 * Quince barras que se comportan igual son un desplegable más largo y ni un
 * dato mejor.
 */
export const BAR_TYPES: BarType[] = [
    {
        id: 'olympic',
        label: 'Olímpica de 20 kg',
        massKg: 20,
        plateLagsBar: false,
    },
    {
        id: 'womens',
        label: 'Olímpica de 15 kg (mujer)',
        massKg: 15,
        plateLagsBar: false,
    },
    {
        id: 'deadlift',
        label: 'De peso muerto (flexible)',
        massKg: 20,
        plateLagsBar: true,
        caveat:
            'La barra de peso muerto flexa antes de que el disco despegue del suelo. ' +
            'El recorrido total sigue siendo correcto, pero el arranque —velocidad ' +
            'inicial, aceleración pico y tiempo hasta la velocidad máxima— describe el ' +
            'movimiento del DISCO, que va por detrás del de la barra.',
    },
    {
        id: 'ssb',
        label: 'Safety squat bar',
        massKg: 25,
        plateLagsBar: false,
    },
    {
        id: 'trap',
        label: 'Hexagonal / trap bar',
        massKg: 25,
        plateLagsBar: false,
    },
    {
        id: 'other',
        label: 'Otra, o no la sé',
        massKg: null,
        plateLagsBar: false,
    },
];

export function barTypeById(id: string): BarType {
    return BAR_TYPES.find(b => b.id === id) ?? BAR_TYPES[BAR_TYPES.length - 1];
}

// =====================================================================
// EL AJUSTE
// =====================================================================

export interface PwrSetup {
    exerciseType: ExerciseType;
    /** Carga TOTAL en la barra, barra incluida. */
    loadKg: number;
    barTypeId: string;
    /** El usuario ha confirmado que el vídeo cumple las condiciones. */
    lateralConfirmed: boolean;
}

export const DEFAULT_SETUP: PwrSetup = {
    exerciseType: 'squat',
    // CERO Y NO 100. Un campo vacío obliga a contestar; un 100 de partida es
    // una respuesta ya escrita que se acepta sin leerla, y era exactamente el
    // fallo que esta fase existe para cerrar.
    loadKg: 0,
    barTypeId: 'olympic',
    lateralConfirmed: false,
};

/**
 * Las condiciones que tiene que cumplir el vídeo.
 *
 * Se enseñan enteras y se confirman de una vez. Cuatro casillas separadas se
 * marcan en cadena sin leer ninguna; una sola casilla con las cuatro
 * condiciones delante al menos obliga a que pasen por el ojo.
 *
 * Cada una rompe la medición de una forma distinta, y **ninguna se puede
 * detectar desde el vídeo con fiabilidad**: por eso se preguntan en vez de
 * comprobarse. La cuarta es la más traicionera, porque un vídeo a cámara lenta
 * da un recorrido perfecto y una velocidad dividida entre cuatro u ocho, y
 * nada en la nota de calidad puede distinguirlo de un levantamiento lento.
 */
export const VIDEO_REQUIREMENTS: { title: string; why: string }[] = [
    {
        title: 'Grabado de lado, a la altura de la barra',
        why: 'De frente el disco se ve de canto y no hay elipse que medir: la escala sale de su altura.',
    },
    {
        title: 'La cámara no se mueve',
        why: 'Lo que se mueva la cámara se suma al recorrido de la barra y aparece como velocidad.',
    },
    {
        title: 'El disco se ve entero durante todo el levantamiento',
        why: 'Si sale del encuadre o lo tapa alguien, el seguimiento se engancha a otra cosa.',
    },
    {
        title: 'Velocidad normal, sin cámara lenta',
        why: 'A cámara lenta el recorrido sale bien y la velocidad sale dividida entre cuatro u ocho.',
    },
];

// =====================================================================
// VALIDACIÓN
// =====================================================================

export interface SetupIssue {
    field: 'loadKg' | 'barTypeId' | 'lateralConfirmed' | 'exerciseType';
    /** `error` impide analizar; `warning` solo avisa. */
    level: 'error' | 'warning';
    message: string;
}

/** Carga por encima de la cual se pregunta si no sobrará un cero. */
const IMPLAUSIBLE_LOAD_KG = 600;

/**
 * Qué impide analizar y qué solo merece un aviso.
 *
 * La diferencia importa: bloquear por todo enseña a rellenar cualquier cosa
 * para pasar, y avisar de todo hace que no se lea nada. Aquí solo bloquea lo
 * que **produciría un número falso sin decirlo**.
 */
export function validateSetup(setup: PwrSetup): SetupIssue[] {
    const issues: SetupIssue[] = [];
    const bar = barTypeById(setup.barTypeId);

    if (!Number.isFinite(setup.loadKg) || setup.loadKg <= 0) {
        issues.push({
            field: 'loadKg',
            level: 'error',
            message: 'Falta la carga. Sin ella no hay fuerza, ni potencia, ni 1RM estimado.',
        });
    } else {
        if (bar.massKg !== null && setup.loadKg < bar.massKg) {
            issues.push({
                field: 'loadKg',
                level: 'error',
                message:
                    `${setup.loadKg} kg es menos que la barra sola (${bar.massKg} kg). ` +
                    'La carga que se pide es la total, barra incluida.',
            });
        }
        if (setup.loadKg > IMPLAUSIBLE_LOAD_KG) {
            issues.push({
                field: 'loadKg',
                level: 'warning',
                message: `${setup.loadKg} kg supera el récord del mundo de cualquier movimiento. ¿Sobra un cero?`,
            });
        }
    }

    if (!setup.lateralConfirmed) {
        issues.push({
            field: 'lateralConfirmed',
            level: 'error',
            message: 'Falta confirmar que el vídeo cumple las cuatro condiciones.',
        });
    }

    return issues;
}

/** `true` cuando se puede analizar. Los avisos no bloquean. */
export function canAnalyse(setup: PwrSetup): boolean {
    return !validateSetup(setup).some(i => i.level === 'error');
}

/**
 * Lo que hay que decir al leer las cifras de esta medición.
 *
 * Sale del ajuste y no del vídeo, así que se conoce ANTES de analizar y
 * acompaña al resultado hasta las exportaciones. Es la misma política de
 * `quality.ts`: las salvedades se escriben en pantalla, no se esconden.
 */
export function setupCaveats(setup: PwrSetup): string[] {
    const out: string[] = [];
    const bar = barTypeById(setup.barTypeId);

    if (bar.caveat) out.push(bar.caveat);

    // La barra flexible con peso muerto es la combinación que de verdad se da;
    // avisar solo cuando NO coinciden evita el aviso genérico que nadie lee.
    if (bar.plateLagsBar && setup.exerciseType !== 'deadlift') {
        out.push(
            'Se ha declarado una barra flexible en un movimiento que no es peso muerto: ' +
            'comprueba que es la barra correcta.'
        );
    }

    return out;
}

/**
 * La masa de la barra, para guardarla junto a las métricas.
 *
 * Va como número porque la bolsa de métricas es numérica (ver
 * `src/lib/vbt/metricRegistry.ts`), y como MASA en vez de como código de barra
 * porque un número con unidades sigue significando algo dentro de seis meses;
 * un `3` que hay que ir a buscar a una tabla, no.
 */
export function barMassMetric(setup: PwrSetup): number | null {
    return barTypeById(setup.barTypeId).massKg;
}
