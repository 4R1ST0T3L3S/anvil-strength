import { supabase } from '../lib/supabase';

export type FormType = 'daily' | 'weekly';
export type QuestionType = 'scale' | 'number' | 'text';

export interface FormQuestion {
    id: string;
    label: string;
    qtype: QuestionType;
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
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
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

    async submitResponse(athleteId: string, type: FormType, periodKey: string, answers: FormAnswer[]): Promise<void> {
        const { error } = await supabase
            .from('form_responses')
            .upsert(
                { athlete_id: athleteId, type, period_key: periodKey, answers },
                { onConflict: 'athlete_id, type, period_key' }
            );
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
