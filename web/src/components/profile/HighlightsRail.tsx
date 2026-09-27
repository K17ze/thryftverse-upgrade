'use client';

/**
 * HighlightsRail — Instagram story-highlights grammar: circular covers in
 * a horizontal rail sitting between the identity hero and the tab rail.
 * Renders nothing when the member has no highlights — including for the
 * owner, matching native (PosterHighlightsRail mounts only when
 * highlights.length > 0; an empty profile shows no rail at all).
 * Owners get a TRAILING "New" tile (native renders it after the map)
 * that lands on the archive's create-highlight flow. Multi-frame
 * highlights carry the native frame-count badge.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import type { ProfileHighlightItem } from './useProfileHighlights';

interface HighlightsRailProps {
  highlights: ProfileHighlightItem[];
  /** Owner rail carries the "New" entry → /poster/archive (create flow). */
  isOwner?: boolean;
}

export function HighlightsRail({ highlights, isOwner = false }: HighlightsRailProps) {
  // Native parity: no rail at all on an empty profile — not even the
  // owner's "New" tile.
  if (highlights.length === 0) return null;

  return (
    <section aria-label="Story highlights" className="mt-4 px-4 sm:px-6">
      <ul className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
        {highlights.map((h) => (
          <li key={h.id} className="shrink-0">
            <Link
              href={`/poster/highlight/${h.id}`}
              className="pressable group flex w-[88px] flex-col items-center gap-1.5"
              aria-label={`Highlight: ${h.title}${
                h.frameCount > 1 ? `, ${h.frameCount} frames` : ''
              }`}
            >
              {/* Story-ring grammar — the same double-ring frame story
                  avatars carry, reused for the curated highlight cover. */}
              <span className="relative rounded-full bg-gradient-to-tr from-brand/70 via-brand to-brand/70 p-[2.5px]">
                <span className="relative block h-20 w-20 overflow-hidden rounded-full bg-surface-alt ring-2 ring-background">
                  <AppImage
                    src={h.coverUri}
                    alt=""
                    fill
                    sizes="80px"
                    className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                    fallbackIcon="bookmark"
                  />
                </span>
                {/* Frame-count badge — native badges multi-frame
                    highlights; single-frame tiles stay clean. */}
                {h.frameCount > 1 ? (
                  <span
                    aria-hidden
                    className="absolute bottom-0 right-0 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-overlay px-1 text-micro font-semibold leading-none text-scrim-text-primary"
                  >
                    {h.frameCount}
                  </span>
                ) : null}
              </span>
              <span className="clamp-1 w-full text-center text-meta text-text-secondary">
                {h.title}
              </span>
            </Link>
          </li>
        ))}
        {isOwner ? (
          <li className="shrink-0">
            <Link
              href="/poster/archive"
              className="pressable group flex w-[88px] flex-col items-center gap-1.5"
              aria-label="Create a highlight from your poster archive"
            >
              {/* Same outer diameter as the ringed tiles (80px + ring) so
                  the trailing tile reads as one of the set, not a bolt-on. */}
              <span className="flex h-[85px] w-[85px] items-center justify-center rounded-full border border-dashed border-border text-text-muted transition-colors group-hover:border-text-muted group-hover:text-text-primary">
                <Icon name="plus" size={24} />
              </span>
              <span className="clamp-1 w-full text-center text-meta text-text-secondary">
                New
              </span>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
