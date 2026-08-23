/**
 * ANVIL STRENGTH — CLAVES DE CONSULTA
 * =====================================================================
 *
 * POR QUÉ EN UN SITIO Y NO EN CADA PANTALLA
 *
 * Una clave de react-query es un contrato entre quien LEE y quien INVALIDA.
 * Escrita a mano en los dos lados, basta una letra distinta —`['bloques', id]`
 * frente a `['blocks', id]`— para que guardar un bloque no refresque la lista
 * que lo enseña. Y no falla con un error: falla enseñando datos viejos, que
 * es la clase de fallo que se descubre semanas después.
 *
 * Aquí las claves son funciones, así que quien invalida y quien lee llaman a
 * la misma.
 *
 *
 * LA JERARQUÍA IMPORTA
 *
 * react-query invalida por PREFIJO: `['bloques']` alcanza a
 * `['bloques', 'atleta-1']` y a `['bloques', 'atleta-2']`. Por eso las claves
 * van de lo general a lo concreto, y por eso cada familia expone su raíz:
 * permite tirar de golpe todo lo de un recurso cuando hace falta.
 */

export const CLAVES = {
    // --- Entrenamiento -------------------------------------------------
    bloques: {
        raiz: ['bloques'] as const,
        deAtleta: (athleteId: string) => ['bloques', athleteId] as const,
    },
    macros: {
        raiz: ['macros'] as const,
        deAtleta: (athleteId: string) => ['macros', athleteId] as const,
    },
    sesiones: {
        raiz: ['sesiones'] as const,
        deBloque: (blockId: string) => ['sesiones', blockId] as const,
    },
    ejerciciosDeSesion: {
        raiz: ['ejercicios-sesion'] as const,
        deSesion: (sessionId: string) => ['ejercicios-sesion', sessionId] as const,
    },
    seriesDeEjercicio: {
        raiz: ['series-ejercicio'] as const,
        deEjercicio: (sessionExerciseId: string) => ['series-ejercicio', sessionExerciseId] as const,
    },

    // --- Ficha del atleta ----------------------------------------------
    atleta: {
        raiz: ['atleta'] as const,
        porId: (athleteId: string) => ['atleta', athleteId] as const,
    },
    notasDelCoach: {
        raiz: ['notas-coach'] as const,
        deRelacion: (coachId: string, athleteId: string) => ['notas-coach', coachId, athleteId] as const,
    },
    pagos: {
        raiz: ['pagos'] as const,
        deAtleta: (athleteId: string) => ['pagos', athleteId] as const,
    },
    competicionesAsignadas: {
        raiz: ['competiciones-asignadas'] as const,
        deAtleta: (athleteId: string) => ['competiciones-asignadas', athleteId] as const,
    },

    // --- VBT y cuestionarios -------------------------------------------
    vbt: {
        raiz: ['vbt'] as const,
        deAtleta: (athleteId: string) => ['vbt', athleteId] as const,
    },
    cuestionarios: {
        raiz: ['cuestionarios'] as const,
        estadoDeAtleta: (athleteId: string) => ['cuestionarios', 'estado', athleteId] as const,
        respuestasDeAtleta: (athleteId: string, tipo: string) =>
            ['cuestionarios', 'respuestas', athleteId, tipo] as const,
    },

    // --- Otros ----------------------------------------------------------
    resenas: {
        raiz: ['resenas'] as const,
    },
    apuestas: {
        raiz: ['apuestas'] as const,
    },
    usuariosAdmin: {
        raiz: ['usuarios-admin'] as const,
    },
} as const;
