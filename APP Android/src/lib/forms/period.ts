/**
 * PERIODOS DE LOS CUESTIONARIOS
 * =====================================================================
 * Qué día o qué semana identifica una respuesta, y cómo se escribe.
 *
 * POR QUÉ VIVE AQUÍ Y NO EN `formsService`
 *
 * Son funciones puras: no tocan la red ni la base. Estaban dentro del
 * servicio, que importa el cliente de Supabase, así que cualquier módulo de
 * cálculo que necesitara `periodLabel` arrastraba el cliente entero —y con
 * él `import.meta.env`, que fuera del empaquetador no existe—. Resultado:
 * el banco de pruebas no podía cargar ni una línea de esto.
 *
 * `formsService` las sigue reexportando, así que nadie tiene que cambiar
 * de dónde las importa.
 */

export type FormType = 'daily' | 'weekly';

/** Clave de periodo: diario = fecha de hoy, semanal = año-semana ISO. */
export function getPeriodKey(type: FormType, date = new Date()): string {
    if (type === 'daily') {
        return date.toISOString().split('T')[0];
    }
    // Semana ISO
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    // El relleno de ceros NO es cosmético: es lo que hace que '2026-W09'
    // ordene antes que '2026-W31' comparando como texto, que es como se
    // ordenan las series de la gráfica.
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Texto legible: '2026-08-02' → 'domingo, 2 de agosto'; '2026-W31' → 'Semana 31 · 2026'. */
export function periodLabel(type: FormType, periodKey: string): string {
    if (type === 'daily') {
        const d = new Date(`${periodKey}T00:00:00`);
        if (Number.isNaN(d.getTime())) return periodKey;
        return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    const [year, week] = periodKey.split('-W');
    return week ? `Semana ${week} · ${year}` : periodKey;
}

/**
 * Etiqueta CORTA, para el eje de una gráfica.
 *
 * `periodLabel` da "domingo, 2 de agosto", que es lo correcto en una ficha e
 * imposible en un eje X con veinte puntos. Aquí: '02/08' y 'S31'.
 */
export function shortPeriodLabel(type: FormType, periodKey: string): string {
    if (type === 'daily') {
        const [, month, day] = periodKey.split('-');
        return month && day ? `${day}/${month}` : periodKey;
    }
    const week = periodKey.split('-W')[1];
    return week ? `S${Number(week)}` : periodKey;
}
