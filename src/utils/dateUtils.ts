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
