'use client';

/**
 * UserCollectionCard — square cover-collage card for the "Your collections"
 * grid. Mirrors the mobile ClosetBoardCard grammar: 2×2 media collage (full-
 * bleed when a single cover), quiet folder glyph when empty, title + meta
 * below. Privacy is a lock glyph leading the meta line, never a badge.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { timeAgo } from '@/lib/utils/format';

interface UserCollectionCardProps {
  href: string;
  name: string;
  /** Item cover images; ≥2 renders a 2×2 collage, 1 renders full-bleed. */
  thumbs: string[];
  count: number;
  isPrivate?: boolean;
  updatedAt?: string;
}

export function UserCollectionCard({
  href,
  name,
  thumbs,
  count,
  isPrivate = false,
  updatedAt,
}: UserCollectionCardProps) {
  const cells = thumbs.slice(0, 4);
  return (
    <Link
      href={href}
      className="group block"
      aria-label={`${name}, ${count} items${isPrivate ? ', private' : ''}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-alt">
        {/* Adaptive collage — ≥4 tiles a 2×2, 3 gives the lead item the
            left column, 2 splits the cover. A short board never leaves a
            bare dark quadrant on the media surface. */}
        {cells.length > 1 ? (
          <div
            className={`grid h-full gap-0.5 ${
              cells.length === 2
                ? 'grid-cols-2 grid-rows-1'
                : 'grid-cols-2 grid-rows-2'
            }`}
          >
            {cells.map((src, i) => (
              <div
                key={i}
                className={`relative overflow-hidden ${
                  cells.length === 3 && i === 0 ? 'row-span-2' : ''
                }`}
              >
                <AppImage
                  src={src}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 25vw, (max-width: 1024px) 17vw, (max-width: 1280px) 13vw, 10vw"
                  className="h-full w-full media-zoom"
                />
              </div>
            ))}
          </div>
        ) : cells.length === 1 ? (
          <AppImage
            src={cells[0]}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
            className="h-full w-full media-zoom"
            fallbackIcon="layers"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-text-muted">
            <Icon name="folder" size={28} />
            <span className="text-micro">Empty collection</span>
          </div>
        )}
      </div>
      <h3 className="clamp-1 mt-2 text-body-emphasis font-semibold text-text-primary">
        {name}
      </h3>
      <p className="mt-0.5 flex items-center gap-1 text-meta text-text-muted">
        {isPrivate ? <Icon name="lock" filled size={11} aria-label="Private" /> : null}
        <span className="tnum">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
        {updatedAt ? (
          <>
            <span aria-hidden>·</span>
            <span>{timeAgo(updatedAt)}</span>
          </>
        ) : null}
      </p>
    </Link>
  );
}
