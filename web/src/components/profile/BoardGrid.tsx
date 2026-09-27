'use client';

/**
 * BoardGrid — moodboard / saved-collection cards.
 * 2×2 media collage cover (item thumbs), quiet count chip on media,
 * title + item count below. Mirrors MoodboardHomeScreen's collage grammar.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';

interface BoardCardProps {
  href: string;
  title: string;
  /** Item cover images; ≥2 renders a 2×2 collage, 1 renders full-bleed. */
  thumbs: string[];
  count: number;
  /** e.g. "@username" for boards not owned by the viewer. */
  ownerName?: string;
  /** Private boards show a lock meta instead of the item count. */
  isPrivate?: boolean;
}

export function BoardCard({ href, title, thumbs, count, ownerName, isPrivate }: BoardCardProps) {
  const cells = thumbs.slice(0, 4);
  return (
    <Link
      href={href}
      className="group block"
      aria-label={`${title}, ${count} items`}
    >
      <div className="relative overflow-hidden rounded-xl bg-surface-alt" style={{ aspectRatio: '0.85' }}>
        {cells.length > 1 ? (
          <div className="grid h-full grid-cols-2 grid-rows-2 gap-0.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="relative overflow-hidden">
                {cells[i] ? (
                  <AppImage
                    src={cells[i]}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 25vw, 15vw"
                    className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full bg-surface-raised" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <AppImage
            src={cells[0]}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className="h-full w-full transition-transform duration-300 group-hover:scale-105"
            fallbackIcon="layers"
          />
        )}
        <span className="tnum absolute right-2 top-2 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
          {count}
        </span>
      </div>
      <h3 className="clamp-1 mt-2 text-body-emphasis font-semibold text-text-primary">{title}</h3>
      {isPrivate ? (
        <p className="mt-0.5 flex items-center gap-1 text-meta text-text-muted">
          <Icon name="lock" size={11} />
          Private
        </p>
      ) : (
        <p className="text-meta text-text-muted">
          {count} {count === 1 ? 'item' : 'items'}
          {ownerName ? ` · ${ownerName}` : ''}
        </p>
      )}
    </Link>
  );
}

export function BoardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
      {children}
    </div>
  );
}
