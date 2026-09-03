import { supabase } from '../lib/supabase';

export interface AthletePayment {
    id: string;
    athlete_id: string;
    coach_id: string;
    paid_until: string;
    amount?: number | null;
    currency: string;
    method?: string | null;
    note?: string | null;
    created_by: string;
    created_at: string;
}

export const paymentsService = {
    /** Histórico completo, del pago más reciente al más antiguo. */
    async getHistory(athleteId: string): Promise<AthletePayment[]> {
        const { data, error } = await supabase
            .from('athlete_payments')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('paid_until', { ascending: false });

        if (error) {
            // 42P01 = la tabla no existe todavía (migración sin ejecutar).
            if (error.code === '42P01') return [];
            throw error;
        }
        return data || [];
    },

    /** "Pagado hasta" = el MAYOR paid_until registrado. null si no ha pagado nunca. */
    async getPaidUntil(athleteId: string): Promise<string | null> {
        const history = await this.getHistory(athleteId);
        return history[0]?.paid_until ?? null;
    },

    async registerPayment(payment: {
        athleteId: string;
        coachId: string;
        paidUntil: string;
        amount?: number | null;
        currency?: string;
        method?: string | null;
        note?: string | null;
    }): Promise<void> {
        const { error } = await supabase.from('athlete_payments').insert({
            athlete_id: payment.athleteId,
            coach_id: payment.coachId,
            paid_until: payment.paidUntil,
            amount: payment.amount ?? null,
            currency: payment.currency ?? 'EUR',
            method: payment.method ?? null,
            note: payment.note ?? null,
            created_by: payment.coachId,
        });

        if (error) throw error;
    },

    async deletePayment(id: string): Promise<void> {
        const { error } = await supabase.from('athlete_payments').delete().eq('id', id);
        if (error) throw error;
    },
};
