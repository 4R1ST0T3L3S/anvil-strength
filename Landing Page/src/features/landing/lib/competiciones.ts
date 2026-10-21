import { buscarAtleta, normalizarNombre } from '../../../lib/atletas';
import { nombreCorto } from '../../../data/competitions';
import type { Athlete } from '../../../data/athletes';

/**
 * LAS COMPETICIONES DE LA WEB PÚBLICA, YA AGRUPADAS
 * =====================================================================
 *
 * `get_public_upcoming_competitions` devuelve UNA FILA POR ATLETA Y
 * COMPETICIÓN: cada entrenador apunta a su atleta por separado, así que el
 * Europeo con dos convocados son dos filas, a veces con fechas o lugares
 * escritos un poco distinto. Aquí se juntan en una competición con su lista
 * de convocados.
 *
 * Se agrupa por nombre normalizado (sin tildes ni mayúsculas) y AÑO. Solo
 * por nombre, como antes, fundía en una misma tarjeta el "AEP 3" de este año
 * con el del que viene.
 */

export interface FilaPublica {
    id?: string;
    name: string;
    date: string;
    end_date?: string | null;
    location?: string | null;
    level?: string | null;
    description?: string | null;
    athlete_id?: string | null;
    athlete_full_name?: string | null;
    athlete_avatar_url?: string | null;
}

export interface Convocado {
    /** `athlete_id`, o el nombre si no hay id. Clave estable para React. */
    clave: string;
    /** El nombre tal cual viene de la base, sin espacios sobrantes. */
    nombre: string;
    avatar: string | null;
    /** La ficha del club (foto recortada, categoría, marcas), si existe. */
    ficha?: Athlete;
    /** Identificador para la URL: el de la ficha o, si no, el nombre. */
    slug: string;
}

export interface Competicion {
    slug: string;
    nombre: string;
    fecha: string;
    fin: string | null;
    lugar: string | null;
    nivel: string | null;
    descripcion: string | null;
    convocados: Convocado[];
}

/**
 * El nombre para un rótulo grande: el corto de data/competitions.ts si lo
 * hay, y `oficial` con el nombre de la base cuando difiere, para enseñarlo
 * debajo en pequeño.
 */
export function nombreDeCartel(c: Pick<Competicion, 'nombre'>, idioma: 'es' | 'en'): { cartel: string; oficial: string | null } {
    const corto = nombreCorto(c.nombre, idioma);
    return corto ? { cartel: corto, oficial: c.nombre } : { cartel: c.nombre, oficial: null };
}

const aSlug = (texto: string) => normalizarNombre(texto).replace(/ /g, '-');

export function slugCompeticion(nombre: string, fecha: string): string {
    const anio = fecha.slice(0, 4);
    return `${aSlug(nombre)}-${anio}`;
}

export function agruparCompeticiones(filas: FilaPublica[], atletas?: Athlete[]): Competicion[] {
    const grupos = new Map<string, Competicion>();

    for (const f of filas) {
        if (!f.name || !f.date) continue;
        const slug = slugCompeticion(f.name, f.date);
        let g = grupos.get(slug);
        if (!g) {
            g = {
                slug,
                nombre: f.name.trim(),
                fecha: f.date,
                fin: f.end_date ?? null,
                lugar: f.location?.trim() || null,
                nivel: f.level?.trim() || null,
                descripcion: f.description?.trim() || null,
                convocados: [],
            };
            grupos.set(slug, g);
        }
        // La competición empieza el día más temprano y acaba el más tardío de
        // los que haya apuntado cualquiera de los entrenadores.
        if (f.date < g.fecha) g.fecha = f.date;
        if (f.end_date && (!g.fin || f.end_date > g.fin)) g.fin = f.end_date;
        g.lugar ??= f.location?.trim() || null;
        g.nivel ??= f.level?.trim() || null;
        g.descripcion ??= f.description?.trim() || null;

        const nombre = f.athlete_full_name?.trim().replace(/\s+/g, ' ');
        if (!nombre) continue;
        const clave = f.athlete_id ?? normalizarNombre(nombre);
        if (g.convocados.some((c) => c.clave === clave)) continue;
        const ficha = buscarAtleta(nombre, atletas);
        g.convocados.push({
            clave,
            nombre,
            avatar: f.athlete_avatar_url ?? null,
            ficha,
            slug: ficha?.slug ?? aSlug(nombre),
        });
    }

    const lista = [...grupos.values()];
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
    // Dentro de cada convocatoria, primero quien tiene foto recortada: la
    // presentación arranca con el atleta que mejor luce.
    for (const c of lista) {
        c.convocados.sort((a, b) => Number(!!b.ficha?.recorte) - Number(!!a.ficha?.recorte));
    }
    return lista;
}

/**
 * Las fechas como se dicen: "6 dic 2026", o "6–13 dic 2026" si dura varios
 * días del mismo mes, o "28 nov – 2 dic 2026" si cambia de mes.
 */
export function formatearFechas(fecha: string, fin: string | null, idioma: 'es' | 'en' = 'es'): string {
    const loc = idioma === 'en' ? 'en-GB' : 'es-ES';
    const d1 = new Date(`${fecha}T12:00:00`);
    if (Number.isNaN(d1.getTime())) return fecha;
    const dia = (d: Date) => d.getDate();
    const mes = (d: Date) => new Intl.DateTimeFormat(loc, { month: 'short' }).format(d).replace('.', '');
    const anio = (d: Date) => d.getFullYear();
    if (!fin || fin === fecha) return `${dia(d1)} ${mes(d1)} ${anio(d1)}`;
    const d2 = new Date(`${fin}T12:00:00`);
    if (Number.isNaN(d2.getTime())) return `${dia(d1)} ${mes(d1)} ${anio(d1)}`;
    if (d1.getMonth() === d2.getMonth() && anio(d1) === anio(d2)) {
        return `${dia(d1)}–${dia(d2)} ${mes(d1)} ${anio(d1)}`;
    }
    return `${dia(d1)} ${mes(d1)} – ${dia(d2)} ${mes(d2)} ${anio(d2)}`;
}

/** Tiempo hasta el inicio, en días/horas/minutos/segundos. Cero si ya empezó. */
export function cuentaAtras(fecha: string, ahora: number = Date.now()) {
    const objetivo = new Date(`${fecha}T09:00:00`).getTime();
    const ms = Math.max(0, objetivo - ahora);
    const s = Math.floor(ms / 1000);
    return {
        total: ms,
        dias: Math.floor(s / 86400),
        horas: Math.floor((s % 86400) / 3600),
        minutos: Math.floor((s % 3600) / 60),
        segundos: s % 60,
    };
}
