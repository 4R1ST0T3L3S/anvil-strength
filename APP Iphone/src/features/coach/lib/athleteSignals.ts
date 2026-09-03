/**
 * ANVIL STRENGTH — SEÑALES DE UN ATLETA
 *
 * Las mismas reglas para el panel de inicio del coach y para la lista de
 * atletas. Estaban a punto de vivir en dos sitios, y dos definiciones de
 * "lleva mucho sin entrenar" que no coinciden es peor que ninguna: el panel
 * diría que hay tres atletas en riesgo y la lista enseñaría cinco.
 */

import type { AthleteAdherence } from '../../../services/trainingService';

export const ATTENTION_THRESHOLDS = {
    /**
     * Días sin cerrar una sesión a partir de los cuales el atleta sale en el
     * panel de atención.
     *
     * Cinco y no tres: casi nadie entrena todos los días, y un umbral de tres
     * marcaría en rojo a quien entrena lunes, miércoles y viernes cada
     * domingo. Un aviso que salta cuando no pasa nada deja de leerse, y a
     * partir de ahí tampoco se lee cuando sí pasa.
     */
    inactiveDays: 5,

    /** Por debajo de este porcentaje de días cumplidos, hay algo que hablar. */
    lowAdherence: 0.7,

    /** Días de margen para avisar de que un bloque se está acabando. */
    blockEndingDays: 7,
} as const;

/** Días completos transcurridos desde una marca ISO. Null si nunca. */
export function daysSince(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return null;
    return Math.floor((Date.now() - then) / 86_400_000);
}

/** "Hoy", "Ayer", "Hace 4 días"… en el idioma en el que se piensa. */
export function activityLabel(days: number | null): string {
    if (days === null) return 'Sin sesiones registradas';
    if (days <= 0) return 'Entrenó hoy';
    if (days === 1) return 'Entrenó ayer';
    if (days < 7) return `Hace ${days} días`;
    if (days < 14) return 'Hace más de una semana';
    if (days < 31) return `Hace ${Math.floor(days / 7)} semanas`;
    return 'Hace más de un mes';
}

export type ActivityTone = 'good' | 'warn' | 'bad' | 'none';

export function activityTone(days: number | null): ActivityTone {
    if (days === null) return 'none';
    if (days <= 2) return 'good';
    if (days < ATTENTION_THRESHOLDS.inactiveDays) return 'warn';
    return 'bad';
}

/**
 * Proporción de días vencidos que el atleta ha cerrado, entre 0 y 1.
 *
 * Devuelve null cuando todavía no ha vencido ningún día: un atleta que
 * empieza el bloque el lunes no está al 0% de constancia, está a cero días
 * de haber empezado. Pintar un 0% ahí sería información falsa, y basar en
 * ella un aviso mandaría al coach a hablar con alguien que no ha hecho nada
 * mal.
 */
export function adherenceRatio(
    source: AthleteAdherence | { adherence?: AthleteAdherence } | null | undefined
): number | null {
    const adherence = source && 'dueSessions' in source ? source : source?.adherence;
    if (!adherence || adherence.dueSessions === 0) return null;
    return adherence.completedSessions / adherence.dueSessions;
}
