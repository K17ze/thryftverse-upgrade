'use client';

/**
 * CategoryTile — media-first category entry. Media is the colour;
 * the name (and, when the department has stock, its live count) sit on
 * a bottom scrim — never on chrome. Counts are fixture-truth: no
 * count is shown for an empty department.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';

interface CategoryTileProps {
  slug: string;
  name: string;
  image?: string;
  /** Live item count — omitted (not zero) when the department is empty. */
  count?: number;
  className?: string;
  sizes?: string;
  /** Above-the-fold media skips the lazy fade. */
  priority?: boolean;
}

export function CategoryTile({
  slug,
  name,
  image,
  count,
  className = '',
  sizes = '192px',
  priority,
}: CategoryTileProps) {
  return (
    <Link
      href={`/category/${slug}`}
      className={`group relative block shrink-0 overflow-hidden rounded-lg ${className}`}
      aria-label={
        count
          ? `${name} — ${count} item${count === 1 ? '' : 's'}`
          : `Browse ${name}`
      }
    >
      <AppImage
        src={image}
        alt={name}
        fill
        sizes={sizes}
        priority={priority}
        className="h-full w-full"
        imgClassName="transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
      <span className="absolute bottom-2 left-2.5 right-2.5">
        <span className="block text-body-emphasis font-semibold text-scrim-text-primary">
          {name}
        </span>
        {count ? (
          <span className="tnum mt-0.5 block text-caption font-medium text-scrim-text-secondary">
            {count} item{count === 1 ? '' : 's'}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
