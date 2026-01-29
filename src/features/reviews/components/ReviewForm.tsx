import { useState } from 'react';
import { StarRating } from '../../../components/ui/StarRating';
import { reviewsService } from '../../../services/reviewsService';
import { useUser } from '../../../hooks/useUser';

interface ReviewFormProps {
    onSubmitSuccess: () => void;
}

export function ReviewForm({ onSubmitSuccess }: ReviewFormProps) {
    const { data: user } = useUser();
    const [rating, setRating] = useState(5);
    const [reviewText, setReviewText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess(false);
        setIsSubmitting(true);

        try {
            await reviewsService.createReview(
                user?.full_name || user?.nickname || 'Atleta Anvil',
                rating,
                reviewText
            );

            // Reset form
            setRating(5);
            setReviewText('');
            setSuccess(true);

            // Call success callback
            onSubmitSuccess();

            // Hide success message after 3 seconds
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message || 'Error al publicar la reseña');
        } finally {
            setIsSubmitting(false);
        }
    };

    const characterCount = reviewText.length;
    const isValid = reviewText.length >= 10 && reviewText.length <= 1000;

    return (
        <form onSubmit={handleSubmit} className="bg-[#1c1c1c] p-6 md:p-8 rounded-xl border border-white/10">
            <h3 className="text-xl md:text-2xl font-bold mb-6">
                Comparte tu <span className="text-anvil-red">Experiencia</span>
            </h3>

            {/* Rating Selection */}
            <div className="mb-6">
                <label className="block text-sm font-bold text-gray-300 mb-3">
                    Tu Calificación
                </label>
                <StarRating
                    rating={rating}
                    onRatingChange={setRating}
                    size={36}
                />
                <p className="text-xs text-gray-500 mt-2">
                    {rating === 5 ? '¡Excelente!' : rating === 4 ? 'Muy bueno' : rating === 3 ? 'Bueno' : rating === 2 ? 'Regular' : 'Necesita mejorar'}
                </p>
            </div>

            {/* Review Text */}
            <div className="mb-6">
                <label className="block text-sm font-bold text-gray-300 mb-2">
                    Tu Opinión
                </label>
                <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Cuéntanos sobre tu experiencia con Anvil Strength. ¿Qué te ha parecido el entrenamiento? ¿Los resultados? ¿El equipo?"
                    rows={5}
                    required
                    minLength={10}
                    maxLength={1000}
                    className="w-full bg-[#252525] border border-white/10 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-anvil-red transition-colors resize-none"
                />
                <p className={`text-xs mt-2 ${!isValid && characterCount > 0
                        ? 'text-red-500'
                        : characterCount > 900
                            ? 'text-yellow-500'
                            : 'text-gray-500'
                    }`}>
                    {characterCount}/1000 caracteres {characterCount < 10 && '(mínimo 10)'}
                </p>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
                    {error}
                </div>
            )}

            {/* Success Message */}
            {success && (
                <div className="mb-4 p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-500 text-sm">
                    ¡Reseña publicada con éxito! Gracias por compartir tu experiencia.
                </div>
            )}

            {/* Submit Button */}
            <button
                type="submit"
                disabled={isSubmitting || !isValid}
                className="w-full bg-anvil-red text-white font-bold py-3 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {isSubmitting ? 'Publicando...' : 'Publicar Reseña'}
            </button>
        </form>
    );
}
