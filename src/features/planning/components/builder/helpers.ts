import { TrainingSet, weekdayIndex } from '../../../../types/training';
import type { ExtendedSession, ExtendedSessionExercise } from './types';

// Helpers to parse and format target_reps field specifically for grouped sets
export const getSeriesCount = (target_reps: string | null | undefined) => {
    if (!target_reps) return '';
    const parts = target_reps.toLowerCase().split('x');
    if (parts.length >= 2) return parts[0].trim();
    return '1';
};

export const getRepsCount = (target_reps: string | null | undefined) => {
    if (!target_reps) return '';
    const parts = target_reps.toLowerCase().split('x');
    if (parts.length >= 2) return parts.slice(1).join('x').trim();
    return target_reps.trim();
};

/**
 * Ordena los días de una semana como los va a vivir el atleta.
 *
 * Manda el día de la semana agendado; los que no lo tienen van detrás por
 * `day_number`. Mezclar ambos criterios sin desempate dejaba "Día 3 (lunes)"
 * detrás de "Día 1 (jueves)" en el planificador y delante en la app del
 * atleta, que ya ordena por calendario.
 */
export function sortSessions<T extends { day_number: number; day_of_week?: string | null }>(sessions: T[]): T[] {
    return [...sessions].sort((a, b) => {
        const ia = weekdayIndex(a.day_of_week);
        const ib = weekdayIndex(b.day_of_week);
        if (ia != null && ib != null) return ia - ib;
        if (ia != null) return -1;
        if (ib != null) return 1;
        return a.day_number - b.day_number;
    });
}

/**
 * La serie tal y como viaja al servidor.
 *
 * Existe como función suelta porque se usa en DOS sitios que tienen que
 * coincidir campo por campo: al guardar y al tomar la foto de lo que ya
 * está guardado. Si divergieran, la comparación daría "cambiado" siempre y
 * volveríamos a mandar el bloque entero en cada guardado.
 */
export function savableSet(sessionExerciseId: string, set: TrainingSet) {
    return {
        id: set.id,
        session_exercise_id: sessionExerciseId,
        order_index: set.order_index,
        target_reps: set.target_reps ?? null,
        target_load: set.target_load ?? null,
        target_metric: set.target_metric ?? 'kg',
        target_rpe: set.target_rpe ?? null,
        rest_seconds: set.rest_seconds ?? null,
        is_video_required: set.is_video_required ?? false,
        notes: set.notes ?? null,
        set_type: set.set_type ?? null,
        set_detail: set.set_detail ?? null,
        group_tag: set.group_tag ?? null,
    };
}

/**
 * El texto completo del fallo, no solo `message`.
 *
 * PostgREST reparte la información en cuatro campos y `message` es el más
 * pobre: el nombre de la columna que falta viene en `message`, pero el de la
 * restricción violada vive en `details` y la pista de qué hacer en `hint`.
 * Quedarse con `message` dejaba errores indepurables desde la interfaz.
 */
export function rawSaveError(err: unknown): string {
    const e = (err ?? {}) as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean);
    return parts.length ? parts.join(' | ') : 'error desconocido';
}

/**
 * Traduce el error crudo de PostgREST a algo accionable.
 *
 * "canceling statement due to statement timeout" no le dice al coach ni que
 * el problema no es suyo ni qué hacer. Los casos de aquí son los que se han
 * visto de verdad en producción, y todos tienen arreglo concreto.
 */
export function explainSaveError(raw: string, filas: number): string {
    if (raw.includes('statement timeout')) {
        /**
         * EL NÚMERO DE FILAS ES EL DATO QUE DISTINGUE LAS DOS CAUSAS.
         *
         * Este mensaje mandaba siempre a crear los índices, y con los índices
         * ya creados dejaba al coach sin salida. Pero un timeout guardando UNA
         * fila no puede ser un problema de índices: con una fila no hay nada
         * que buscar. Lo que cuesta ahí es comprobar el permiso, y eso pasa
         * cuando training_sets acumula políticas duplicadas de varias
         * migraciones que además se evalúan anidadas. Ver la cabecera de
         * database/FIX_TIMEOUT_SERIES.sql.
         */
        if (filas <= 5) {
            return `el servidor ha tardado demasiado en guardar ${filas === 1 ? 'una sola serie' : `${filas} series`}. ` +
                'Con tan pocas filas no es cosa de índices ni de tu conexión: son las políticas de ' +
                'permisos de training_sets. Ejecuta database/FIX_TIMEOUT_SERIES.sql en Supabase.';
        }
        return `el servidor ha tardado demasiado guardando ${filas} series. No es tu conexión. ` +
            'Ejecuta database/MIGRACION_PENDIENTE.sql (crea los índices) y, si sigue, ' +
            'database/FIX_TIMEOUT_SERIES.sql (simplifica las políticas de permisos).';
    }
    if (raw.includes('PGRST204') || (raw.includes('column') && raw.includes('does not exist'))) {
        /**
         * QUÉ columna, y no solo "falta una columna".
         *
         * Este mensaje mandaba a ejecutar MIGRACION_PENDIENTE.sql sin decir
         * qué faltaba, y ese archivo no añadía `target_metric` ni `notes` —
         * las traían set_target_metric.sql y FIX_ENTRENAMIENTO.sql. El coach
         * ejecutaba la migración, la verificación decía OK, y el guardado
         * seguía fallando por una columna que nadie llegaba a nombrar. Ahora
         * las añade MIGRACION_PENDIENTE.sql (sección 3B) y, si algún día
         * vuelve a faltar otra, aquí se lee cuál.
         */
        const column = /'([^']+)' column/.exec(raw)?.[1]
            ?? /column "?([\w.]+)"? does not exist/.exec(raw)?.[1];

        return (column
            ? `la base de datos no tiene la columna "${column}" de training_sets. `
            : `falta una columna en la base de datos (${raw}). `) +
            'Ejecuta database/MIGRACION_PENDIENTE.sql ENTERO en el editor SQL de Supabase ' +
            'y comprueba que las cinco filas de la verificación dicen OK.';
    }
    if (raw.includes('violates check constraint')) {
        return `el servidor ha rechazado un valor de la serie (${raw}). ` +
            'Suele ser una métrica o un tipo de serie que la base todavía no admite: ' +
            'ejecuta database/MIGRACION_PENDIENTE.sql.';
    }
    if (raw.includes('row-level security') || raw.includes('violates row-level')) {
        return 'el servidor ha rechazado el cambio por permisos. ¿Sigues siendo el entrenador de este atleta?';
    }
    if (raw.includes('foreign key') || raw.includes('violates foreign key')) {
        return 'la serie apunta a un ejercicio que ya no existe. Recarga la página y vuelve a intentarlo.';
    }
    return raw;
}

/**
 * Traduce el error de copiar, clonar o crear una semana.
 *
 * Los tres manejadores de semana decían "Error copiando semana" y nada más,
 * con el motivo real solo en la consola. El caso que se ha visto —el choque de
 * clave única— tiene además un arreglo concreto que el mensaje puede dar.
 */
export function explainWeekError(raw: string): string {
    if (raw.includes('duplicate key') || raw.includes('23505') || raw.includes('unique constraint')) {
        /**
         * training_sessions se creó con UNIQUE(block_id, day_number), de cuando
         * un bloque era una lista plana de días. Con semanas, un bloque tiene
         * un "Día 1" por semana y esa restricción solo deja pasar el primero:
         * copiar una semana choca siempre. Ver database/FIX_COPIA_SEMANAS.sql.
         */
        return 'la base de datos no admite dos días con el mismo número en el bloque, ' +
            'y cada semana tiene su propio "Día 1". Ejecuta database/FIX_COPIA_SEMANAS.sql en Supabase.';
    }
    if (raw.includes('statement timeout')) {
        return 'el servidor ha tardado demasiado. Si la semana tiene muchos ejercicios, ' +
            'vuelve a intentarlo; si falla siempre, ejecuta database/FIX_TIMEOUT_SERIES.sql.';
    }
    if (raw.includes('row-level security') || raw.includes('violates row-level')) {
        return 'el servidor ha rechazado la copia por permisos. ¿Sigues siendo el entrenador de este atleta?';
    }
    return raw;
}

/**
 * ACTUALIZAR EL BLOQUE SIN REESCRIBIRLO ENTERO
 * =====================================================================
 *
 * El estado del constructor es un árbol de tres niveles: bloque → sesiones →
 * ejercicios → series. Los `setBlockData` de este fichero lo recorrían entero
 * con `map` anidados y devolvían objetos nuevos en TODOS los niveles, tocara
 * lo que tocara el cambio.
 *
 * React compara props por identidad. Con todo reconstruido, cada pulsación en
 * un campo de kilos convertía a "cambiado" a las 32 sesiones de un bloque de
 * ocho semanas, y con ellas todas sus tarjetas de día. El editor de un día
 * abierto encima repintaba también.
 *
 * Estas dos funciones cortan por lo sano en cuanto encuentran lo que buscan y
 * devuelven EL MISMO array cuando no hay nada que cambiar, así que solo se
 * repinta la rama afectada.
 */

/** Aplica `fn` a la serie con ese id. Devolver `null` la elimina. */
export function mapSets(
    sessions: ExtendedSession[],
    setId: string,
    fn: (set: TrainingSet) => TrainingSet | null
): ExtendedSession[] {
    let touched = false;

    const next = sessions.map(session => {
        let sessionTouched = false;

        const exercises = session.exercises.map(exercise => {
            if (!exercise.sets.some(s => s.id === setId)) return exercise;

            sessionTouched = true;
            const sets: TrainingSet[] = [];
            for (const set of exercise.sets) {
                if (set.id !== setId) { sets.push(set); continue; }
                const result = fn(set);
                if (result) sets.push(result);
            }
            return { ...exercise, sets };
        });

        if (!sessionTouched) return session;
        touched = true;
        return { ...session, exercises };
    });

    return touched ? next : sessions;
}

/** Aplica `fn` al ejercicio con ese id. */
export function mapExercise(
    sessions: ExtendedSession[],
    exerciseId: string,
    fn: (exercise: ExtendedSessionExercise) => ExtendedSessionExercise
): ExtendedSession[] {
    let touched = false;

    const next = sessions.map(session => {
        if (!session.exercises.some(e => e.id === exerciseId)) return session;
        touched = true;
        return {
            ...session,
            exercises: session.exercises.map(e => (e.id === exerciseId ? fn(e) : e)),
        };
    });

    return touched ? next : sessions;
}

export const formatTargetReps = (series: string, reps: string) => {
    if (!series || series === '1') return reps;
    if (!reps) return `${series}x`;
    return `${series}x${reps}`;
};
