/**
 * ANVIL STRENGTH — FECHAS Y HORAS PARA PERSONAS
 * =====================================================================
 * Funciones puras. Todo en `es-ES`, que es el idioma del panel.
 */

const MS_DIA = 86_400_000;

const aFecha = (v: Date | string | number): Date => (v instanceof Date ? v : new Date(v));

/** Medianoche local de una fecha. */
export function inicioDelDia(v: Date | string | number): Date {
    const d = aFecha(v);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Días naturales entre dos fechas (b - a), ignorando la hora. */
export function diasEntre(a: Date | string | number, b: Date | string | number = new Date()): number {
    return Math.round((inicioDelDia(b).getTime() - inicioDelDia(a).getTime()) / MS_DIA);
}

/** "2026-09-08" (fecha de calendario) → Date local sin hora. */
export function fechaDeClave(clave: string): Date {
    const [y, m, d] = clave.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

/** Date → "2026-09-08", en hora local (no UTC: a las 00:30 sigue siendo hoy). */
export function claveDeFecha(v: Date | string | number): string {
    const d = aFecha(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "Lunes 8 de septiembre" (con el año si no es el actual). */
export function fechaLarga(v: Date | string | number, ahora = new Date()): string {
    const d = aFecha(v);
    const conAnio = d.getFullYear() !== ahora.getFullYear();
    // Según la versión de ICU sale «lunes, 7 de septiembre» o «lunes 7 de
    // septiembre»; se unifica sin la coma.
    return mayuscula(
        d.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            ...(conAnio ? { year: 'numeric' } : {}),
        }).replace(/,\s*/g, ' ')
    );
}

/** "Hoy", "Ayer", "Lunes", "Lun 8 sep": lo que se pone en una lista. */
export function fechaRelativa(v: Date | string | number, ahora = new Date()): string {
    const dias = diasEntre(v, ahora);
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
    const d = aFecha(v);
    if (dias > 1 && dias < 7) return mayuscula(d.toLocaleDateString('es-ES', { weekday: 'long' }));
    return mayuscula(
        d.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            ...(d.getFullYear() !== ahora.getFullYear() ? { year: 'numeric' } : {}),
        }).replace('.', '')
    );
}

/** "18:45" */
export function hora(v: Date | string | number): string {
    return aFecha(v).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Lo que va a la derecha de una conversación o un aviso: la hora si es de
 * hoy, "Ayer", el día de la semana si es de esta semana, la fecha si no.
 */
export function marcaCorta(v: Date | string | number, ahora = new Date()): string {
    const dias = diasEntre(v, ahora);
    if (dias === 0) return hora(v);
    if (dias === 1) return 'Ayer';
    const d = aFecha(v);
    if (dias < 7) return mayuscula(d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''));
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** "ahora", "hace 5 min", "hace 3 h", "hace 2 días", o la fecha. */
export function haceCuanto(v: Date | string | number, ahora = new Date()): string {
    const seg = Math.max(0, Math.floor((ahora.getTime() - aFecha(v).getTime()) / 1000));
    if (seg < 60) return 'ahora';
    const min = Math.floor(seg / 60);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const dias = diasEntre(v, ahora);
    if (dias === 1) return 'ayer';
    if (dias < 7) return `hace ${dias} días`;
    return fechaRelativa(v, ahora).toLowerCase();
}

/** Separador de un hilo: "Hoy", "Ayer", "Lunes 8 de septiembre". */
export function separadorDeDia(v: Date | string | number, ahora = new Date()): string {
    const dias = diasEntre(v, ahora);
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
    return fechaLarga(v, ahora);
}

/** ¿Las dos marcas caen en el mismo día natural? */
export function mismoDia(a: Date | string | number, b: Date | string | number): boolean {
    return claveDeFecha(a) === claveDeFecha(b);
}
