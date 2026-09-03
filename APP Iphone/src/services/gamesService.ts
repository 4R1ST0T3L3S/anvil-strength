import { supabase } from '../lib/supabase';

export interface GameScore {
    id: string;
    user_id: string;
    game_id: string;
    score: number;
    played_date: string;
    created_at: string;
}

export const gamesService = {
    async getDailyBest(userId: string, gameId: string, date: string): Promise<GameScore | null> {
        const { data, error } = await supabase
            .from('game_scores')
            .select('*')
            .eq('user_id', userId)
            .eq('game_id', gameId)
            .eq('played_date', date)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        return data as GameScore | null;
    },

    async saveScore(userId: string, gameId: string, score: number, date: string, isLowerBetter: boolean = false): Promise<void> {
        // Primero, verificar si ya hay un score hoy
        const currentBest = await this.getDailyBest(userId, gameId, date);

        if (currentBest) {
            // Si ya hay un score, actualizamos solo si es mejor
            const isBetter = isLowerBetter ? score < currentBest.score : score > currentBest.score;
            
            if (isBetter) {
                const { error } = await supabase
                    .from('game_scores')
                    .update({ score })
                    .eq('id', currentBest.id);
                if (error) throw error;
            }
        } else {
            // Si no hay score hoy, lo insertamos
            const { error } = await supabase
                .from('game_scores')
                .insert({
                    user_id: userId,
                    game_id: gameId,
                    score,
                    played_date: date
                });
            if (error) throw error;
        }
    }
};
