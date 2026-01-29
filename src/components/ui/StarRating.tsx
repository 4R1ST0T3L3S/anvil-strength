import { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
    rating: number; // Current rating (1-5)
    onRatingChange?: (rating: number) => void; // Callback when rating changes
    readonly?: boolean; // If true, stars are not clickable
    size?: number; // Size of stars in pixels
}

export function StarRating({
    rating,
    onRatingChange,
    readonly = false,
    size = 24
}: StarRatingProps) {
    const [hoverRating, setHoverRating] = useState(0);

    const displayRating = readonly ? rating : (hoverRating || rating);

    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={readonly}
                    onClick={() => !readonly && onRatingChange?.(star)}
                    onMouseEnter={() => !readonly && setHoverRating(star)}
                    onMouseLeave={() => !readonly && setHoverRating(0)}
                    className={`transition-all ${readonly
                            ? 'cursor-default'
                            : 'cursor-pointer hover:scale-110 active:scale-95'
                        }`}
                    aria-label={`${star} ${star === 1 ? 'estrella' : 'estrellas'}`}
                >
                    <Star
                        size={size}
                        className={`${star <= displayRating
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'fill-none text-gray-400'
                            } transition-colors duration-150`}
                    />
                </button>
            ))}
        </div>
    );
}
