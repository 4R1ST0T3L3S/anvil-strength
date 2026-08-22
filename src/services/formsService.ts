import { supabase } from '../lib/supabase';
import type { FormType } from '../lib/forms/period';

// Las funciones de periodo son puras y viven en `src/lib/forms/period.ts`
// para que el codigo de calculo pueda usarlas sin arrastrar el cliente de
// Supabase. Se reexportan para no obligar a nadie a cambiar el import.
export type { FormType } from '../lib/forms/period';
export { getPeriodKey, periodLabel, shortPeriodLabel } from '../lib/forms/period';

export type QuestionType = 'scale' | 'number' | 'text';

export interface FormQuestion {
    id: string;
    label: string;
    qtype: QuestionType;
    /** Cómo se responde ESTA pregunta. Bajo la etiqueta, en letra pequeña. */
    help?: string;
    /** Solo para qtype 'scale': qué significa cada extremo (1 = ..., 10 = ...). */
    scale?: {
        min: number;
        max: number;
        minLabel?: string;
        maxLabel?: string;
    };

    // -----------------------------------------------------------------
    // FAMILIA DE ESCALA (decisión K9)
    // -----------------------------------------------------------------
    // Todo esto vive en `form_templates.questions`, que ya es JSONB: NO hay
    // migración. Una plantilla guardada antes de que existieran estos campos
    // sigue funcionando — se clasifica con la heurística de
    // `src/lib/forms/axes.ts` y el resultado se escribe la primera vez que el
    // coach abre el editor.

    /**
     * A qué eje pertenece la respuesta. Determina en QUÉ gráfica se pinta.
     *
     * Sin esto, "pasos" (~9.000) y "sueño" (0-10) compartían eje Y y el
     * segundo quedaba aplastado contra el suelo. Ver `FormAxis`.
     */
    axis?: 'scale10' | 'count' | 'mass' | 'duration' | 'percent' | 'custom';
    /** Lo que se escribe detrás del número: 'kg', 'pasos', 'h', '%'. */
    unit?: string;
    /** Rango fijo del eje Y para ESTA pregunta. Gana al de su familia. */
    domain?: [number, number];
    /**
     * "Más alto es peor" — dormir mal puntúa 3, no 8.
     *
     * COLOREA EL PUNTO, NO INVIERTE EL EJE. Invertir el eje haría que dos
     * gráficas de la misma pantalla se leyeran en direcciones contrarias, que
     * es peor que el problema que resuelve.
     */
    invertPolarity?: boolean;
}

export interface FormAnswer extends FormQuestion {
    value: string | number | null;
}

export interface FormResponse {
    id: string;
    athlete_id: string;
    type: FormType;
    period_key: string;
    answers: FormAnswer[];
    created_at: string;
    /** Última persona que guardó la respuesta (el atleta o su coach). */
    updated_by?: string | null;
    updated_at?: string | null;
}

// ============ Plantillas predefinidas ============

export const DEFAULT_DAILY_QUESTIONS: FormQuestion[] = [
    { id: 'sleep', label: '¿Cómo has dormido?', qtype: 'scale' },
    { id: 'soreness', label: 'Dolor muscular', qtype: 'scale' },
    { id: 'performance', label: 'Sensación / rendimiento de la sesión', qtype: 'scale' },
    { id: 'stress', label: 'Nivel de estrés del día', qtype: 'scale' },
    { id: 'comment', label: '¿Algo más que quieras comentar?', qtype: 'text' },
];

export const DEFAULT_WEEKLY_QUESTIONS: FormQuestion[] = [
    { id: 'training_compliance', label: 'Cumplimiento del entrenamiento', qtype: 'scale' },
    { id: 'diet_compliance', label: 'Cumplimiento de la dieta', qtype: 'scale' },
    { id: 'steps', label: 'Media de pasos diarios esta semana', qtype: 'number' },
    { id: 'bodyweight', label: 'Peso corporal (kg)', qtype: 'number' },
    { id: 'comment', label: '¿Algo más que quieras comentar?', qtype: 'text' },
];

/**
 * Preguntas a mostrar al editar una respuesta: las de la plantilla actual del coach,
 * más las que solo existan en la respuesta guardada (preguntas antiguas ya retiradas
 * de la plantilla, para no perder lo que el atleta contestó en su día).
 */
export function mergeQuestions(template: FormQuestion[], answers: FormAnswer[] = []): FormQuestion[] {
    const inTemplate = new Set(template.map(q => q.id));
    // El `value` es lo ÚNICO que se quita: `FormAnswer` es una `FormQuestion`
    // con la respuesta dentro, y enumerar campos a mano aquí significaba que
    // cada campo nuevo de `FormQuestion` se perdía en silencio al reabrir una
    // respuesta antigua. Pasó con `axis`, `unit` y `domain`.
    const legacy = answers
        .filter(a => !inTemplate.has(a.id))
        .map(({ value: _value, ...question }) => question as FormQuestion);
    return [...template, ...legacy];
}

export const formsService = {
    /** Plantilla efectiva: la personalizada del coach, o la predefinida. */
    async getTemplate(coachId: string | null, type: FormType): Promise<FormQuestion[]> {
        const defaults = type === 'daily' ? DEFAULT_DAILY_QUESTIONS : DEFAULT_WEEKLY_QUESTIONS;
        if (!coachId) return defaults;

        const { data, error } = await supabase
            .from('form_templates')
            .select('questions')
            .eq('coach_id', coachId)
            .eq('type', type)
            .maybeSingle();

        if (error || !data?.questions) return defaults;
        const qs = data.questions as FormQuestion[];
        return Array.isArray(qs) && qs.length > 0 ? qs : defaults;
    },

    /** Guarda la plantilla personalizada del coach. */
    async saveTemplate(coachId: string, type: FormType, questions: FormQuestion[]): Promise<void> {
        const { error } = await supabase
            .from('form_templates')
            .upsert(
                { coach_id: coachId, type, questions, updated_at: new Date().toISOString() },
                { onConflict: 'coach_id, type' }
            );
        if (error) throw error;
    },

    /**
     * Indicación general del check-in ("rellénalo la noche anterior...").
     * No es de una pregunta: es del formulario entero, así que va en su
     * propia columna (`form_templates.intro`) y no dentro de `questions`.
     */
    async getIntro(coachId: string | null, type: FormType): Promise<string | null> {
        if (!coachId) return null;
        const { data, error } = await supabase
            .from('form_templates')
            .select('intro')
            .eq('coach_id', coachId)
            .eq('type', type)
            .maybeSingle();
        if (error) return null;
        return data?.intro ?? null;
    },

    /**
     * `questions` es NOT NULL en `form_templates`: si el coach nunca ha
     * tocado sus preguntas, no hay fila todavía, y guardar SOLO la intro
     * mediante un upsert intentaría un INSERT sin esa columna. Se manda la
     * plantilla efectiva de siempre junto con la intro para que la primera
     * vez cree la fila entera.
     */
    async saveIntro(coachId: string, type: FormType, intro: string): Promise<void> {
        const questions = await this.getTemplate(coachId, type);
        const { error } = await supabase
            .from('form_templates')
            .upsert(
                { coach_id: coachId, type, questions, intro: intro.trim() || null, updated_at: new Date().toISOString() },
                { onConflict: 'coach_id, type' }
            );
        if (error) throw error;
    },

    /** Restablece la plantilla predefinida (borra la personalizada). */
    async resetTemplate(coachId: string, type: FormType): Promise<void> {
        const { error } = await supabase
            .from('form_templates')
            .delete()
            .eq('coach_id', coachId)
            .eq('type', type);
        if (error) throw error;
    },

    /** ¿Ha respondido ya el atleta este periodo? */
    async getResponse(athleteId: string, type: FormType, periodKey: string): Promise<FormResponse | null> {
        const { data, error } = await supabase
            .from('form_responses')
            .select('*')
            .eq('athlete_id', athleteId)
            .eq('type', type)
            .eq('period_key', periodKey)
            .maybeSingle();

        if (error) throw error;
        return data as FormResponse | null;
    },

    /**
     * Guarda (crea o sobreescribe) la respuesta de un periodo.
     * `editorId` es quien guarda: el propio atleta o su coach editándole el check-in.
     */
    async submitResponse(
        athleteId: string,
        type: FormType,
        periodKey: string,
        answers: FormAnswer[],
        editorId?: string
    ): Promise<void> {
        const { error } = await supabase
            .from('form_responses')
            .upsert(
                {
                    athlete_id: athleteId,
                    type,
                    period_key: periodKey,
                    answers,
                    updated_by: editorId ?? athleteId,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'athlete_id, type, period_key' }
            );
        if (error) throw error;
    },

    /** Borra una respuesta (el atleta la suya, el coach las de sus atletas). */
    async deleteResponse(id: string): Promise<void> {
        const { error } = await supabase.from('form_responses').delete().eq('id', id);
        if (error) throw error;
    },

    /** Historial de respuestas de un atleta (para el coach). */
    async getResponsesByAthlete(athleteId: string, type?: FormType, limit = 60): Promise<FormResponse[]> {
        let query = supabase
            .from('form_responses')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('period_key', { ascending: false })
            .limit(limit);

        if (type) query = query.eq('type', type);

        const { data, error } = await query;
        if (error) throw error;
        return (data as FormResponse[]) || [];
    }
};
