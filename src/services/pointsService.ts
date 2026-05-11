import { supabase } from '../lib/supabase';

export type PointReason = 
    | 'WELCOME_BONUS' 
    | 'REFERRAL' 
    | 'GAME_PLACEMENT' 
    | 'BET_WON' 
    | 'ADMIN_ADJUSTMENT' 
    | 'CLUB_MEMBER_REWARD';

export const pointsService = {
    /**
     * Otorgar puntos a un usuario y registrar la transacción.
     * Utiliza la función RPC definida en el script SQL de la Fase 2.
     */
    async awardPoints(userId: string, amount: number, reason: PointReason) {
        try {
            const { error } = await supabase.rpc('award_anvil_points', {
                target_user_id: userId,
                points_amount: amount,
                point_reason: reason
            });

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error awarding points:', error);
            return { success: false, error };
        }
    },

    /**
     * Otorga el bono de bienvenida de 100 monedas.
     */
    async grantWelcomeBonus(userId: string) {
        return this.awardPoints(userId, 100, 'WELCOME_BONUS');
    },

    /**
     * Otorga el bono de miembro del club de 500 monedas.
     */
    async grantClubMemberBonus(userId: string) {
        return this.awardPoints(userId, 500, 'CLUB_MEMBER_REWARD');
    },

    /**
     * Obtener el historial de transacciones de un usuario.
     */
    async getTransactionHistory(userId: string) {
        const { data, error } = await supabase
            .from('anvil_point_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }
};
