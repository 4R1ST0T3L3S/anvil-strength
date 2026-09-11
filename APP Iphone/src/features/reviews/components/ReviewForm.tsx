import { useState } from 'react';
import { StarRating } from '../../../components/ui/StarRating';
import { reviewsService } from '../../../services/reviewsService';
import { useUser } from '../../../hooks/useUser';
import { rellenar, useTextosWeb } from '../../landing/textos';

interface ReviewFormProps {
    onSubmitSuccess: () => void;
}

export function ReviewForm({ onSubmitSuccess }: ReviewFormProps) {
    const { data: user } = useUser();
    const c = useTextosWeb().formulario;
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
                // El nombre de respaldo se GUARDA en la base y lo ve todo el
                // mundo, así que no sigue al idioma de quien escribe.
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
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : c.errorPublicar);
        } finally {
            setIsSubmitting(false);
        }
    };

    const characterCount = reviewText.length;
    const isValid = reviewText.length >= 10 && reviewText.length <= 1000;

    return (
        <form onSubmit={handleSubmit} className="bg-surface-sunken p-6 md:p-8 rounded-xl border border-line">
            <h3 className="text-xl md:text-2xl font-bold mb-6">
                {c.titulo1} <span className="text-brand-text">{c.titulo2}</span>
            </h3>

            {/* Rating Selection */}
            <div className="mb-6">
                <label className="block text-sm font-bold text-gray-300 mb-3">
                    {c.calificacion}
                </label>
                <StarRating
                    rating={rating}
                    onRatingChange={setRating}
                    size={36}
                />
                <p className="text-xs text-gray-500 mt-2">
                    {c.niveles[Math.min(Math.max(rating, 1), 5) - 1]}
                </p>
            </div>

            {/* Review Text */}
            <div className="mb-6">
                <label className="block text-sm font-bold text-gray-300 mb-2">
                    {c.opinion}
                </label>
                <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder={c.placeholder}
                    rows={5}
                    required
                    minLength={10}
                    maxLength={1000}
                    className="w-full bg-surface-sunken border border-line rounded-lg p-4 text-ink placeholder-gray-500 focus:border-brand transition-colors resize-none"
                />
                <p className={`text-xs mt-2 ${!isValid && characterCount > 0
                    ? 'text-red-500'
                    : characterCount > 900
                        ? 'text-yellow-500'
                        : 'text-gray-500'
                    }`}>
                    {rellenar(c.caracteres, { n: characterCount })} {characterCount < 10 && c.minimo}
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
                    {c.exito}
                </div>
            )}

            {/* Submit Button */}
            <button
                type="submit"
                disabled={isSubmitting || !isValid}
                className="w-full bg-brand text-ink font-bold py-3 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {isSubmitting ? c.publicando : c.publicar}
            </button>
        </form>
    );
}
