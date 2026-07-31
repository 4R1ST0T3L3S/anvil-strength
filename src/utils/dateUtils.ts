/**
 * ANVIL STRENGTH - DATE UTILITIES
 */

/**
 * Returns the ISO week number (1-53) for a given date.
 */
export function getWeekNumber(d: Date = new Date()): number {
    // Copy date so don't modify original
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    // Get first day of year
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

/**
 * Returns the start (Monday) and end (Sunday) Date objects for a given ISO week number and year.
 */
export function getDateRangeFromWeek(week: number, year: number = new Date().getFullYear()): { start: Date, end: Date } {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

    // Ensure accurate Monday start
    // A more robust ISO week inverse:
    // 1. Get Jan 4th of that year (always in week 1)
    const d = new Date(Date.UTC(year, 0, 4));
    // 2. Adjust to Monday of Week 1
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() || 7) + 1);
    // 3. Add (week - 1) weeks
    d.setUTCDate(d.getUTCDate() + (week - 1) * 7);

    const start = new Date(d);
    const end = new Date(d);
    end.setUTCDate(end.getUTCDate() + 6);

    return { start, end };
}

/**
 * Formats a date range for display (e.g. "5 Feb - 11 Feb")
 */
export function formatDateRange(start: Date, end: Date): string {
    const format = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    return `${format(start)} - ${format(end)}`;
}

// =====================================================================
// SEMANAS DEL BLOQUE — publicación y agenda
// =====================================================================
// `training_sessions.week_number` es la semana ISO DEL AÑO, no el ordinal
// dentro del bloque. Todo lo de aquí abajo traduce ese número a fechas
// reales para poder decidir qué ve el atleta y cuándo.
//
// Estas funciones trabajan en hora LOCAL a propósito. `getDateRangeFromWeek`
// devuelve fechas en UTC y sirve para pintar rangos, pero comparar "hoy"
// contra un instante UTC se equivoca de día entero en cuanto el navegador
// está en otro huso.

/** Hoy a las 00:00 en hora local. */
export function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Lunes (00:00 local) de una semana ISO.
 *
 * Se ancla en el 4 de enero porque, por definición de la norma, siempre cae
 * dentro de la semana 1. Contar desde el 1 de enero falla en los años que
 * empiezan en viernes, sábado o domingo.
 */
export function getISOWeekStart(week: number, year: number): Date {
    const jan4 = new Date(year, 0, 4);
    const isoDow = jan4.getDay() || 7; // lunes = 1 … domingo = 7
    // new Date(year, 0, n) admite n fuera de rango y ajusta el mes solo.
    return new Date(year, 0, 4 - isoDow + 1 + (week - 1) * 7);
}

/** Fecha del día `weekdayIndex` (1 = lunes … 7 = domingo) de una semana ISO. */
export function getDateForWeekday(week: number, year: number, weekdayIndex: number): Date {
    const monday = getISOWeekStart(week, year);
    return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weekdayIndex - 1);
}

/**
 * Fecha en la que una semana se le abre al atleta: su lunes menos
 * `offsetDays`. Con el valor por defecto (1) eso es el domingo anterior.
 */
export function getWeekReleaseDate(week: number, year: number, offsetDays: number): Date {
    const monday = getISOWeekStart(week, year);
    return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - offsetDays);
}

/**
 * ¿Ha llegado ya la fecha de publicación de esta semana?
 *
 * Es el mismo cálculo que hace `week_is_released()` en la base de datos
 * (ver database/week_visibility_and_scheduling.sql). Aquí sirve para no
 * pintar lo que el servidor no va a devolver; la decisión real la toma la
 * RLS, así que un desajuste no filtra nada.
 */
export function isWeekReleased(
    week: number,
    year: number,
    offsetDays: number,
    now: Date = startOfToday()
): boolean {
    return now.getTime() >= getWeekReleaseDate(week, year, offsetDays).getTime();
}

/** Formatea una fecha como "lun, 4 ago". */
export function formatShortDate(d: Date): string {
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Returns the number of days remaining until a given date.
 */
export function getDaysRemaining(targetDate: string | Date): number {
    const target = new Date(typeof targetDate === 'string' ? targetDate + 'T00:00:00' : targetDate);
    const today = new Date();

    // Reset time components to compare dates only
    target.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}
