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
        ) : cells.length === 1 ? (
          <AppImage
            src={cells[0]}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className="h-full w-full transition-transform duration-300 group-hover:scale-105"
            fallbackIcon="layers"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-muted">
            <Icon name="folder" size={32} />
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
