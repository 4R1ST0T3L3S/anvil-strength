import { useState, useEffect } from 'react';
import { StarRating } from '../../../components/ui/StarRating';
import { ReviewForm } from './ReviewForm';
import { reviewsService } from '../../../services/reviewsService';
import { AthleteReview } from '../../../types/database';
import { MessageCircle } from 'lucide-react';

interface ReviewsSectionProps {
    isAuthenticated: boolean;
}

export function ReviewsSection({ isAuthenticated }: ReviewsSectionProps) {
    const [reviews, setReviews] = useState<AthleteReview[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const loadReviews = async () => {
        try {
            setError('');
            const data = await reviewsService.getAllReviews();
            setReviews(data);
        } catch (err: any) {
            console.error('Error loading reviews:', err);
            setError('Error al cargar las reseñas');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadReviews();
    }, []);

    // Calculate average rating
    const averageRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    // Group reviews by rating for stats
    const ratingCounts = reviews.reduce((acc, review) => {
        acc[review.rating] = (acc[review.rating] || 0) + 1;
        return acc;
    }, {} as Record<number, number>);

    return (
        <section id="reviews" className="py-24 px-6 bg-[#0a0a0a]">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="text-center mb-16">
                    <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4">
                        Opiniones de <span className="text-anvil-red">Nuestros Atletas</span>
                    </h2>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                        Descubre lo que nuestros atletas piensan sobre su experiencia con Anvil Strength
                    </p>

                    {/* Rating Summary */}
                    {reviews.length > 0 && (
                        <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-6">
                            <div className="text-center">
                                <div className="text-5xl font-black text-anvil-red">
                                    {averageRating.toFixed(1)}
                                </div>
                                <StarRating rating={Math.round(averageRating)} readonly size={28} />
                                <p className="text-sm text-gray-500 mt-2">
                                    {reviews.length} {reviews.length === 1 ? 'reseña' : 'reseñas'}
                                </p>
                            </div>

                            {/* Rating Distribution */}
                            <div className="space-y-1 w-full max-w-xs">
                                {[5, 4, 3, 2, 1].map((star) => {
                                    const count = ratingCounts[star] || 0;
                                    const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                                    return (
                                        <div key={star} className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-400 w-12">{star} ★</span>
                                            <div className="flex-1 bg-[#1c1c1c] rounded-full h-2 overflow-hidden">
                                                <div
                                                    className="bg-yellow-400 h-full transition-all duration-500"
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                            <span className="text-gray-500 w-8 text-right">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Review Form (Only for authenticated users) */}
                {isAuthenticated && (
                    <div className="mb-16 max-w-3xl mx-auto">
                        <ReviewForm onSubmitSuccess={loadReviews} />
                    </div>
                )}

                {/* Info box for non-authenticated users */}
                {!isAuthenticated && reviews.length > 0 && (
                    <div className="mb-12 max-w-3xl mx-auto bg-[#1c1c1c] p-6 rounded-xl border border-white/10 text-center">
                        <MessageCircle className="inline-block mb-3 text-anvil-red" size={32} />
                        <h3 className="text-lg font-bold mb-2">¿Quieres dejar tu opinión?</h3>
                        <p className="text-gray-400 mb-4">
                            Inicia sesión o regístrate para compartir tu experiencia con la comunidad
                        </p>
                        <button
                            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                            className="bg-anvil-red text-white font-bold px-6 py-2 rounded-lg hover:bg-red-600 transition-colors"
                        >
                            Iniciar Sesión
                        </button>
                    </div>
                )}

                {/* Reviews List */}
                <div className="space-y-6">
                    {isLoading ? (
                        <div className="text-center py-12">
                            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-anvil-red"></div>
                            <p className="text-gray-400 mt-4">Cargando reseñas...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <p className="text-red-500">{error}</p>
                            <button
                                onClick={loadReviews}
                                className="mt-4 text-anvil-red hover:underline"
                            >
                                Reintentar
                            </button>
                        </div>
                    ) : reviews.length === 0 ? (
                        <div className="text-center py-12 bg-[#1c1c1c] rounded-xl border border-white/10">
                            <MessageCircle className="inline-block mb-4 text-gray-600" size={48} />
                            <p className="text-gray-400 text-lg">
                                Aún no hay reseñas.
                            </p>
                            {isAuthenticated && (
                                <p className="text-gray-500 mt-2">
                                    ¡Sé el primero en compartir tu experiencia!
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {reviews.map((review) => (
                                <div
                                    key={review.id}
                                    className="bg-[#1c1c1c] p-6 rounded-xl border border-white/10 hover:border-white/20 transition-colors"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <p className="font-bold text-lg mb-1">{review.athlete_name}</p>
                                            <StarRating rating={review.rating} readonly size={18} />
                                        </div>
                                        <span className="text-xs text-gray-500">
                                            {new Date(review.created_at).toLocaleDateString('es-ES', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </span>
                                    </div>
                                    <p className="text-gray-300 leading-relaxed">
                                        {review.review_text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
