import { supabase } from '../lib/supabase';
import { AthleteReview } from '../types/database';

export const reviewsService = {
    /**
     * Get all reviews (public - no auth required)
     */
    async getAllReviews(): Promise<AthleteReview[]> {
        const { data, error } = await supabase
            .from('athlete_reviews')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching reviews:', error);
            throw error;
        }

        return data || [];
    },

    /**
     * Create a new review (requires authentication)
     */
    async createReview(athleteName: string, rating: number, reviewText: string): Promise<AthleteReview> {
        // Verify user is authenticated
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            throw new Error('Debes iniciar sesión para dejar una reseña');
        }

        // Validate inputs
        if (rating < 1 || rating > 5) {
            throw new Error('La calificación debe estar entre 1 y 5 estrellas');
        }

        if (reviewText.length < 10) {
            throw new Error('La reseña debe tener al menos 10 caracteres');
        }

        if (reviewText.length > 1000) {
            throw new Error('La reseña no puede exceder 1000 caracteres');
        }

        const { data, error } = await supabase
            .from('athlete_reviews')
            .insert({
                user_id: user.id,
                athlete_name: athleteName,
                rating,
                review_text: reviewText
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating review:', error);
            throw new Error('Error al publicar la reseña. Inténtalo de nuevo.');
        }

        return data;
    },

    /**
     * Update an existing review (user can only update their own)
     */
    async updateReview(reviewId: string, rating: number, reviewText: string): Promise<AthleteReview> {
        // Validate inputs
        if (rating < 1 || rating > 5) {
            throw new Error('La calificación debe estar entre 1 y 5 estrellas');
        }

        if (reviewText.length < 10 || reviewText.length > 1000) {
            throw new Error('La reseña debe tener entre 10 y 1000 caracteres');
        }

        const { data, error } = await supabase
            .from('athlete_reviews')
            .update({
                rating,
                review_text: reviewText,
                updated_at: new Date().toISOString()
            })
            .eq('id', reviewId)
            .select()
            .single();

        if (error) {
            console.error('Error updating review:', error);
            throw new Error('Error al actualizar la reseña');
        }

        return data;
    },

    /**
     * Delete a review (user can only delete their own)
     */
    async deleteReview(reviewId: string): Promise<void> {
        const { error } = await supabase
            .from('athlete_reviews')
            .delete()
            .eq('id', reviewId);

        if (error) {
            console.error('Error deleting review:', error);
            throw new Error('Error al eliminar la reseña');
        }
    },

    /**
     * Get average rating
     */
    async getAverageRating(): Promise<number> {
        const reviews = await this.getAllReviews();
        if (reviews.length === 0) return 0;

        const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
        return sum / reviews.length;
    }
};
