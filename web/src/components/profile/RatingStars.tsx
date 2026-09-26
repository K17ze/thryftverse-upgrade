import { Icon } from '@/components/ui/Icon';

interface RatingStarsProps {
  rating: number;
  size?: number;
  className?: string;
}

/** Rating stars — warm rating-star ink, quiet outline for the remainder. */
export function RatingStars({ rating, size = 14, className = '' }: RatingStarsProps) {
  const full = Math.round(Math.min(5, Math.max(0, rating)));
  return (
    <span
      className={`inline-flex items-center gap-px ${className}`}
      role="img"
      aria-label={`Rated ${rating.toFixed(1)} out of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Icon
          key={i}
          name="star"
          filled={i < full}
          size={size}
          className={i < full ? 'text-rating-star' : 'text-text-muted'}
        />
      ))}
    </span>
  );
}
