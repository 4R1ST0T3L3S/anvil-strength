import { supabase } from '../lib/supabase';

/**
 * ANVIL STRENGTH — INFORMACIÓN PERSONAL DEL ATLETA
 * =====================================================================
 *
 * Mismo patrón que los check-ins (`formsService`): un CATÁLOGO dice qué se
 * pide y una fila JSONB guarda qué se ha contestado. Es deliberado que se
 * parezcan tanto — quien entienda uno entiende el otro, y la pieza que evita
 * perder datos (`mergeFields` / `mergeQuestions`) funciona igual en los dos.
 *
 * Lo que NO se copió: los check-ins guardan una LISTA de pares con el
 * enunciado dentro de cada respuesta, porque son la foto de un día y quieren
 * conservar cómo se preguntó entonces. Aquí los valores son un OBJETO, porque
 * lo que interesa es el último valor de cada clave a lo largo del tiempo.
 *
 * Ver database/INFORMACION_PERSONAL.sql.
 */

export type PersonalFieldType = 'number' | 'text' | 'date' | 'select';

export interface PersonalField {
    /** Clave estable. NO se traduce ni se cambia: es lo que ata el valor. */
    id: string;
    label: string;
    type: PersonalFieldType;
    /** Sufijo que se pinta junto al valor: 'cm', 'kg', 'años'. */
    unit?: string;
    /** Solo para `select`. */
    options?: string[];
    /**
     * Si el atleta puede escribirlo, o solo verlo.
     *
     * Es una regla de FORMA DE TRABAJAR, no de seguridad: la RLS le deja
     * escribir sus propios datos personales porque son suyos. Sirve para que
     * el entrenador pueda marcar como suyas las medidas que toma él —fémur,
     * envergadura— y no aparezcan como un campo a rellenar en el móvil.
     */
    athleteCanEdit: boolean;
}

export type PersonalValue = string | number | null;
export type PersonalValues = Record<string, PersonalValue>;

/** Una toma de datos, con su fecha. */
export interface PersonalRecord {
    athlete_id: string;
    recorded_on: string;
    values: PersonalValues;
    updated_by?: string | null;
    updated_at?: string | null;
}

// =====================================================================
// CATÁLOGO PREDEFINIDO
// =====================================================================

/**
 * Lo que se pide cuando el entrenador no ha configurado nada.
 *
 * Corto a propósito. Un formulario de quince campos en el móvil no lo rellena
 * nadie, y el entrenador puede añadir lo que necesite. Estos seis son los que
 * usan de verdad las cuentas de powerlifting: los tres primeros para
 * categoría y seguimiento, los tres siguientes porque cambian la técnica que
 * se le enseña a alguien.
 */
export const DEFAULT_PERSONAL_FIELDS: PersonalField[] = [
    // Fecha y no edad: se calcula sola, no caduca, y de ella sale la categoría
    // (Sub-Junior, Junior, Open, Master) sin preguntar dos veces.
    { id: 'birth_date', label: 'Fecha de nacimiento', type: 'date', athleteCanEdit: true },
    { id: 'sex', label: 'Sexo', type: 'select', options: ['Hombre', 'Mujer'], athleteCanEdit: true },
    { id: 'height_cm', label: 'Altura', type: 'number', unit: 'cm', athleteCanEdit: true },
    { id: 'weight_kg', label: 'Peso corporal', type: 'number', unit: 'kg', athleteCanEdit: true },
    { id: 'wingspan_cm', label: 'Envergadura', type: 'number', unit: 'cm', athleteCanEdit: false },
    { id: 'injuries', label: 'Lesiones o limitaciones', type: 'text', athleteCanEdit: true },
];

/**
 * Campos que se pueden añadir con un toque, sin escribirlos a mano.
 *
 * No son "más campos por defecto": son los que un entrenador de fuerza acaba
 * pidiendo tarde o temprano, y tenerlos en una lista evita que cada uno
 * invente su propia clave para lo mismo. Dos entrenadores con `femur` y
 * `femur_cm` son dos series que ya no se pueden comparar nunca.
 */
export const SUGGESTED_PERSONAL_FIELDS: PersonalField[] = [
    { id: 'femur_cm', label: 'Longitud de fémur', type: 'number', unit: 'cm', athleteCanEdit: false },
    { id: 'torso_cm', label: 'Longitud de torso', type: 'number', unit: 'cm', athleteCanEdit: false },
    { id: 'training_years', label: 'Años entrenando', type: 'number', unit: 'años', athleteCanEdit: true },
    { id: 'federation', label: 'Federación', type: 'text', athleteCanEdit: true },
    { id: 'shoe_size', label: 'Talla de calzado', type: 'number', athleteCanEdit: true },
    { id: 'dominant_side', label: 'Lado dominante', type: 'select', options: ['Derecho', 'Izquierdo'], athleteCanEdit: true },
    { id: 'sleep_hours', label: 'Horas de sueño habituales', type: 'number', unit: 'h', athleteCanEdit: true },
    { id: 'job', label: 'Trabajo / actividad diaria', type: 'text', athleteCanEdit: true },
];

// =====================================================================
// LECTORES PUROS
// =====================================================================

/**
 * Campos a pintar: los de la plantilla, más los que solo existan en los datos.
 *
 * Es el equivalente de `mergeQuestions()` de los check-ins y está aquí por el
 * mismo motivo: si el entrenador retira "envergadura" de la plantilla, lo que
 * el atleta midió en enero NO puede desaparecer de la pantalla. Se conserva al
 * final y marcado, para que se vea que ya no se pide.
 */
export function mergeFields(
    template: PersonalField[],
    values: PersonalValues = {}
): PersonalField[] {
    const known = new Set(template.map(f => f.id));
    const catalog = [...DEFAULT_PERSONAL_FIELDS, ...SUGGESTED_PERSONAL_FIELDS];

    const legacy = Object.keys(values)
        .filter(id => !known.has(id))
        .map((id): PersonalField => {
            // Si la clave está en el catálogo, se recupera su etiqueta buena.
            // Si no —un campo que el entrenador escribió a mano y borró—, se
            // enseña la clave: fea, pero honesta, y no pierde el valor.
            const fromCatalog = catalog.find(f => f.id === id);
            return fromCatalog ?? { id, label: id, type: 'text', athleteCanEdit: false };
        });

    return [...template, ...legacy];
}

/**
 * El valor VIGENTE de cada campo: el último no nulo de toda la historia.
 *
 * Es lo que hace que un dato estable escrito una vez —la fecha de nacimiento—
 * siga contando sin tener que repetirlo en cada toma, mientras que el peso
 * corporal se queda con el de la última vez que alguien lo apuntó.
 *
 * Espera los registros de MÁS RECIENTE a más antiguo, que es como los devuelve
 * `getHistory()`.
 */
export function currentValues(records: PersonalRecord[]): PersonalValues {
    const out: PersonalValues = {};

    for (const record of records) {
        for (const [key, value] of Object.entries(record.values ?? {})) {
            if (value === null || value === undefined || value === '') continue;
            if (key in out) continue; // ya lo fijó un registro más reciente
            out[key] = value;
        }
    }

    return out;
}

/**
 * Serie temporal de UN campo, de más antiguo a más reciente.
 *
 * Es lo que convierte "peso corporal" en una gráfica sin haber tenido que
 * diseñar una tabla para el peso. Lo consumirá ANVIL Insights.
 */
export function seriesOf(
    records: PersonalRecord[],
    fieldId: string
): { date: string; value: number }[] {
    return records
        .map(r => ({ date: r.recorded_on, raw: r.values?.[fieldId] }))
        .filter((p): p is { date: string; raw: string | number } =>
            p.raw !== null && p.raw !== undefined && p.raw !== '')
        .map(p => ({ date: p.date, value: Number(p.raw) }))
        .filter(p => Number.isFinite(p.value))
        .sort((a, b) => a.date.localeCompare(b.date));
}

/** Edad a partir de la fecha de nacimiento. Null si no hay o no se entiende. */
export function ageFrom(birthDate: PersonalValue): number | null {
    if (!birthDate || typeof birthDate !== 'string') return null;

    const born = new Date(`${birthDate}T00:00:00`);
    if (Number.isNaN(born.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - born.getFullYear();
    // El cumpleaños de este año todavía no ha llegado.
    const monthDelta = today.getMonth() - born.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < born.getDate())) age -= 1;

    return age >= 0 && age < 120 ? age : null;
}

/** Fecha de hoy en formato ISO y en hora LOCAL. */
export function today(): string {
    const d = new Date();
    // `toISOString()` pasa a UTC y en España devuelve el día anterior durante
    // las primeras horas de la mañana: el mismo fallo que ya se corrigió en
    // el selector de día del entrenamiento.
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =====================================================================
// SERVICIO
// =====================================================================

/** La tabla no existe todavía si no se ha ejecutado la migración. */
function isMissingTable(error: { code?: string } | null): boolean {
    return error?.code === 'PGRST205' || error?.code === '42P01';
}

export const personalInfoService = {
    /**
     * Campos que se le piden a un atleta.
     *
     * Prioridad: lo configurado PARA ÉL, luego la plantilla por defecto de su
     * entrenador, y si no hay ninguna, el juego predefinido. Es la misma
     * escalera de ámbitos que los vídeos de ejercicio, y por la misma razón:
     * lo específico gana sobre lo general.
     */
    async getFields(coachId: string | null, athleteId: string): Promise<PersonalField[]> {
        if (!coachId) return DEFAULT_PERSONAL_FIELDS;

        const { data, error } = await supabase
            .from('athlete_profile_schemas')
            .select('athlete_id, fields')
            .eq('coach_id', coachId)
            .or(`athlete_id.is.null,athlete_id.eq.${athleteId}`);

        if (error) {
            if (!isMissingTable(error)) console.error('getFields:', error);
            return DEFAULT_PERSONAL_FIELDS;
        }

        const rows = (data ?? []) as { athlete_id: string | null; fields: PersonalField[] }[];
        const specific = rows.find(r => r.athlete_id === athleteId);
        const fallback = rows.find(r => r.athlete_id === null);
        const chosen = specific ?? fallback;

        // Una plantilla guardada VACÍA significa "no le pidas nada", y hay que
        // respetarlo: caer al juego predefinido volvería a pedir seis campos
        // que el entrenador acaba de quitar a propósito.
        return chosen ? chosen.fields : DEFAULT_PERSONAL_FIELDS;
    },

    /**
     * Guarda la plantilla. `athleteId` null = la que vale para todos.
     *
     * NO es un `.upsert()`. Los índices de unicidad de esta tabla son
     * PARCIALES (`WHERE athlete_id IS NULL` / `WHERE athlete_id IS NOT NULL`
     * — ver database/INFORMACION_PERSONAL.sql), y PostgREST traduce
     * `onConflict` a un `ON CONFLICT (columnas)` SIN predicado. Postgres no
     * puede inferir un índice parcial a partir de eso: la sentencia falla
     * con 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
     * specification") SIEMPRE, tanto para la plantilla por defecto como para
     * la de un atleta concreto. De ahí que guardar diera error y que, en el
     * caso en que no diera, no persistiera nada.
     *
     * Se resuelve a mano: se busca la fila con el mismo ámbito y se actualiza
     * por `id`, o se inserta si no existe.
     */
    async saveFields(
        coachId: string,
        athleteId: string | null,
        fields: PersonalField[]
    ): Promise<void> {
        let query = supabase
            .from('athlete_profile_schemas')
            .select('id')
            .eq('coach_id', coachId);
        query = athleteId ? query.eq('athlete_id', athleteId) : query.is('athlete_id', null);

        const { data: existing, error: findError } = await query.maybeSingle();
        if (findError) throw findError;

        if (existing) {
            const { error } = await supabase
                .from('athlete_profile_schemas')
                .update({ fields, updated_at: new Date().toISOString() })
                .eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('athlete_profile_schemas')
                .insert({ coach_id: coachId, athlete_id: athleteId, fields });
            if (error) throw error;
        }
    },

    /** Vuelve al juego predefinido borrando la plantilla guardada. */
    async resetFields(coachId: string, athleteId: string | null): Promise<void> {
        let query = supabase
            .from('athlete_profile_schemas')
            .delete()
            .eq('coach_id', coachId);

        query = athleteId ? query.eq('athlete_id', athleteId) : query.is('athlete_id', null);

        const { error } = await query;
        if (error) throw error;
    },

    /**
     * Historial de tomas, de más reciente a más antigua.
     *
     * El límite por defecto cubre unos dos años de pesajes semanales. Quien
     * necesite más está mirando una gráfica, no una ficha.
     */
    async getHistory(athleteId: string, limit = 120): Promise<PersonalRecord[]> {
        const { data, error } = await supabase
            .from('athlete_profile_data')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('recorded_on', { ascending: false })
            .limit(limit);

        if (error) {
            // Sin la migración aplicada, la pantalla enseña los campos vacíos
            // en vez de un error: se puede mirar, no se puede guardar todavía.
            if (isMissingTable(error)) return [];
            throw error;
        }

        return (data ?? []) as PersonalRecord[];
    },

    /**
     * Escribe valores en la toma de UNA fecha (hoy, salvo que se diga otra).
     *
     * FUSIONA con lo que ya hubiera ese día en vez de sustituirlo: el atleta
     * apunta su peso por la mañana y su entrenador le mide la envergadura por
     * la tarde, y el segundo no puede borrar lo del primero. La fusión se hace
     * leyendo antes porque `upsert` de PostgREST reemplaza la fila entera.
     */
    async saveValues(
        athleteId: string,
        values: PersonalValues,
        editorId: string,
        recordedOn: string = today()
    ): Promise<void> {
        const { data: existing, error: readError } = await supabase
            .from('athlete_profile_data')
            .select('values')
            .eq('athlete_id', athleteId)
            .eq('recorded_on', recordedOn)
            .maybeSingle();

        if (readError && !isMissingTable(readError)) throw readError;

        const merged: PersonalValues = {
            ...((existing?.values as PersonalValues) ?? {}),
            ...values,
        };

        // Un campo vaciado a propósito se BORRA de la bolsa en vez de guardarse
        // como null: así `currentValues()` sigue subiendo al valor anterior en
        // lugar de dejar el dato en blanco para siempre.
        for (const [key, value] of Object.entries(merged)) {
            if (value === null || value === undefined || value === '') delete merged[key];
        }

        const { error } = await supabase
            .from('athlete_profile_data')
            .upsert(
                {
                    athlete_id: athleteId,
                    recorded_on: recordedOn,
                    values: merged,
                    updated_by: editorId,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'athlete_id,recorded_on' }
            );

        if (error) throw error;
    },
};
