'use client';

/**
 * StoryRail — port of HomeStoryRail: tall poster cards (76×135 ratio),
 * unwatched ring, unwatched-first ordering, horizontal scroll.
 * Data comes through the client (`data.posterStories()`) so fixture and
 * live modes share the surface — no direct fixture imports.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AppImage } from '@/components/ui/AppImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { data } from '@/lib/api/client';

export function StoryRail() {
  const {
    data: stories,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['poster-stories'],
    queryFn: ({ signal }) => data.posterStories(signal),
    staleTime: 60_000,
  });

  const sorted = useMemo(
    () => [...(stories ?? [])].sort((a, b) => Number(a.seen ?? false) - Number(b.seen ?? false)),
    [stories],
  );
  const unwatched = sorted.filter((s) => !s.seen).length;

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-hidden px-4 py-3 sm:px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[135px] w-[76px] shrink-0 rounded-lg lg:h-[168px] lg:w-[94px]" />
        ))}
      </div>
    );
  }

  if (isError) {
    // A rail degrades to a slim inline row — the feed below still works.
    return (
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6" role="status">
        <span className="text-caption text-text-muted">Stories couldn&rsquo;t load</span>
        <Button variant="quiet" size="sm" icon="refresh" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (sorted.length === 0) return null;

  return (
    <div
      className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3 sm:px-6"
      role="list"
      aria-label="Poster stories"
    >
      {sorted.map((story, idx) => {
        const isUnwatched = !story.seen;
        // The count badge rides the first unwatched tile (mobile parity).
        const showBadge = isUnwatched && idx === 0 && unwatched > 1;
        // The 76px tile holds ≈8 glyphs at meta size, so the handle is
        // shown whole — first segment only ("@archive") — or deliberately
        // dropped: "@marie…" reads identically on every tile, so a
        // truncated handle is noise, not identity. Dropped handles leave
        // the status dot as the on-media marker; the full handle stays
        // in the aria-label.
        const handle = `@${(story.username || 'member').split(/[._-]/, 1)[0] || 'member'}`;
        const nameFits = handle.length <= 8;
        return (
          <Link
            key={story.id}
            href={`/poster/${story.id}`}
            role="listitem"
            aria-label={`Open poster story${story.username ? ` by @${story.username}` : ''}${isUnwatched ? ', new' : ''}`}
            className="pressable group relative shrink-0"
          >
            {/* Ring state — solid brand while unwatched, hairline once
                seen (mobile posterTileRing/posterTileSeen). */}
            <div
              className={`h-[135px] w-[76px] rounded-lg p-[2px] lg:h-[168px] lg:w-[94px] ${
                isUnwatched ? 'bg-brand' : 'bg-border-subtle'
              }`}
            >
              {/* Inner radius snaps to the grammar: the ring is
                  rounded-lg with a 2px pad, so the media corner sits just
                  inside the concentric arc (rounded-md, not an arbitrary
                  10px). */}
              <div className="relative h-full w-full overflow-hidden rounded-md bg-surface-alt">
                <AppImage
                  src={story.coverUri}
                  alt={`${story.username || 'Poster'} story`}
                  fill
                  sizes="(max-width: 1024px) 76px, 94px"
                  className="h-full w-full media-zoom"
                />
                {/* Name chip — scrim pill carrying the handle when it
                    fits whole, else just the fresh/seen status dot. */}
                <div className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-md bg-overlay px-1.5 py-1">
                  {nameFits ? (
                    <span className="clamp-1 min-w-0 text-meta font-semibold text-scrim-text-primary">
                      {handle}
                    </span>
                  ) : (
                    <span
                      aria-hidden
                      className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                        isUnwatched ? 'bg-brand' : 'bg-scrim-text-tertiary'
                      }`}
                    />
                  )}
                </div>
                {showBadge ? (
                  <span className="absolute right-1 top-1 rounded-md bg-brand px-1.5 py-0.5 text-micro font-semibold text-text-inverse">
                    {unwatched} new
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
