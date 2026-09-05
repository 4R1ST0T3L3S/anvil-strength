/**
 * ANVIL STRENGTH — LA MATRIZ DE APLICABILIDAD
 * =====================================================================
 *
 * QUÉ PREGUNTA CONTESTA
 *
 * "¿Tiene sentido este periodo en esta pantalla?"
 *
 * Y hace falta porque la respuesta no es siempre sí. Un par de ejemplos que
 * lo dejan claro:
 *
 *   · **"Esta semana" en el histórico de competiciones** no dice nada: puede
 *     que la última competición fuera hace tres meses, y la pantalla saldría
 *     vacía sin que eso signifique nada malo.
 *   · **"Un bloque" en el registro de peso corporal** tampoco: el peso se
 *     apunta todos los días, tenga o no un bloque abierto.
 *   · **"Desde siempre" en el volumen semanal** produce una gráfica de 200
 *     puntos donde no se distingue nada.
 *
 * Enseñar una opción que va a dar una pantalla vacía es peor que no
 * enseñarla: la persona no sabe si es que no hay datos o es que ha preguntado
 * mal.
 *
 *
 * POR QUÉ UN REGISTRO Y NO UN `if` EN CADA PANTALLA
 *
 * Mismo patrón que `src/lib/forms/axes.ts` y `src/lib/vbt/metricRegistry.ts`,
 * que ya funcionan en este proyecto: la pantalla no decide, consulta. Añadir
 * una pantalla nueva es una entrada aquí, y si alguien se la deja, el
 * selector cae en el conjunto por defecto en vez de romperse.
 */

import type { Periodo, TipoPeriodo } from './types';

/** Las pantallas que llevan selector de periodo. */
export type Ambito =
    /** Volumen por grupo muscular y series semanales. */
    | 'volumen'
    /** Progresión de cargas y máximos estimados. */
    | 'cargas'
    /** Constancia: sesiones hechas frente a programadas. */
    | 'constancia'
    /** Cuestionarios diarios y semanales. */
    | 'cuestionarios'
    /** Mediciones de velocidad. */
    | 'vbt'
    /** Historial de competiciones y resultados. */
    | 'competiciones';

interface Regla {
    /** Tipos admitidos, en el orden en que se ofrecen. */
    admite: TipoPeriodo[];
    /** El que se elige si la URL no dice nada. */
    porDefecto: Periodo;
    /** Por qué se han descartado los demás. Sale como ayuda del selector. */
    nota?: string;
}

const REGLAS: Record<Ambito, Regla> = {
    /*
     * VOLUMEN. La unidad natural es la semana: el volumen se prescribe y se
     * lee por semana. "Desde siempre" queda fuera a propósito — una gráfica
     * de 200 semanas no se lee, y para ver una tendencia larga están las
     * últimas 12.
     */
    volumen: {
        admite: ['semana', 'ultimas', 'mes', 'bloque'],
        porDefecto: { tipo: 'ultimas', semanas: 4 },
        nota: 'El volumen se lee por semanas. Para tendencias largas, usa las últimas 12.',
    },

    /*
     * CARGAS. Aquí sí tiene sentido "desde siempre": un récord personal es
     * interesante precisamente porque se compara con toda la historia.
     * "Esta semana" no: un máximo no se bate cada siete días.
     */
    cargas: {
        admite: ['ultimas', 'mes', 'bloque', 'todo'],
        porDefecto: { tipo: 'bloque' },
        nota: 'Una marca se compara con toda la historia, no con la semana pasada.',
    },

    /*
     * CONSTANCIA. Todo vale: cumplir la semana, el mes o el bloque son tres
     * preguntas legítimas y distintas.
     */
    constancia: {
        admite: ['semana', 'ultimas', 'mes', 'bloque', 'todo'],
        porDefecto: { tipo: 'ultimas', semanas: 4 },
    },

    /*
     * CUESTIONARIOS. Por calendario siempre: sueño, dolor y estrés se apuntan
     * a diario, tenga o no un bloque abierto. Por eso `bloque` NO está.
     */
    cuestionarios: {
        admite: ['semana', 'ultimas', 'mes'],
        porDefecto: { tipo: 'ultimas', semanas: 4 },
        nota: 'Los cuestionarios se rellenan a diario, con bloque o sin él.',
    },

    /*
     * VBT. Las mediciones son escasas —una serie medida de vez en cuando—,
     * así que una semana suele salir vacía. Se empieza en el bloque.
     */
    vbt: {
        admite: ['ultimas', 'bloque', 'todo'],
        porDefecto: { tipo: 'bloque' },
        nota: 'Las mediciones de velocidad son puntuales: por semanas suele salir vacío.',
    },

    /*
     * COMPETICIONES. Son dos o tres al año. Cualquier periodo corto sale
     * vacío casi siempre, y eso se lee como un error.
     */
    competiciones: {
        admite: ['todo'],
        porDefecto: { tipo: 'todo' },
        nota: 'Se compite dos o tres veces al año: filtrar por semanas no dice nada.',
    },
};

/** Conjunto de reserva si alguien pide un ámbito que no está registrado. */
const POR_DEFECTO: Regla = {
    admite: ['semana', 'ultimas', 'mes', 'todo'],
    porDefecto: { tipo: 'ultimas', semanas: 4 },
};

export function reglaDe(ambito: Ambito): Regla {
    return REGLAS[ambito] ?? POR_DEFECTO;
}

/** ¿Esta pantalla admite este periodo? */
export function admite(ambito: Ambito, p: Periodo): boolean {
    return reglaDe(ambito).admite.includes(p.tipo);
}

/**
 * Ajusta un periodo al ámbito.
 *
 * Si la URL trae uno que esta pantalla no admite —porque se ha navegado desde
 * otra que sí, conservando el parámetro— se cae en el de la pantalla en vez
 * de enseñar una vista vacía sin explicación.
 */
export function ajustarAlAmbito(ambito: Ambito, p: Periodo): Periodo {
    return admite(ambito, p) ? p : reglaDe(ambito).porDefecto;
}
