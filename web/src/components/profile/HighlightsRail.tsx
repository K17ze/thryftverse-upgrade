'use client';

/**
 * HighlightsRail — story-highlight circles above the shop rail
 * (native PosterHighlightsRail grammar: ringed cover + label, tap opens
 * the highlight viewer). Live reads the public per-member list; renders
 * nothing when the member has no highlights or the fetch fails — a
 * missing rail is never load-bearing chrome.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { fetchPosterHighlights } from '@/lib/api/services/social';
import { PROFILE_HIGHLIGHTS } from '@/components/profile/fixtures';
import { usePosterArchive } from '@/lib/store/posterArchive';
import { useHydrated } from '@/lib/store/useStore';
import { AppImage } from '@/components/ui/AppImage';
import type { PosterHighlight } from '@/lib/data/fixtures-posters';

interface HighlightsRailProps {
  ownerId: string;
  /** Owner mode merges session-created highlights onto the fixture rail
   *  (fixture path only — live always reads the server list). */
  isOwner?: boolean;
}

export function HighlightsRail({ ownerId, isOwner = false }: HighlightsRailProps) {
  const hydrated = useHydrated();
  const created = usePosterArchive((s) => s.highlights);

  const { data } = useQuery<PosterHighlight[]>({
    queryKey: ['profile-highlights', ownerId],
    enabled: DATA_MODE === 'live' && !!ownerId,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const items = await fetchPosterHighlights(ownerId, signal);
      return items.map((h) => ({
        id: h.id,
        title: h.title,
        coverUri: h.coverUri,
        frames: h.frames,
      }));
    },
  });

  const highlights =
    DATA_MODE === 'live'
      ? data ?? []
      : [
          ...(PROFILE_HIGHLIGHTS[isOwner ? 'me' : ownerId] ?? []),
          ...(isOwner && hydrated ? created : []),
        ];

  if (highlights.length === 0) return null;

  return (
    <section aria-label="Story highlights" className="mt-5">
      <div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-4 pb-1 sm:px-6">
        {highlights.map((h) => (
          <Link
            key={h.id}
            href={`/poster/highlight/${h.id}`}
            className="pressable group w-[72px] shrink-0"
            aria-label={`${h.title} highlight`}
          >
            <span className="relative block h-[68px] w-[68px] overflow-hidden rounded-full bg-surface-alt ring-1 ring-border">
              <AppImage
                src={h.coverUri}
                alt=""
                fill
                sizes="68px"
                className="h-full w-full transition-transform duration-300 group-hover:scale-[1.05]"
                fallbackIcon="bookmark"
              />
            </span>
            <span className="clamp-1 mt-1.5 block text-center text-meta text-text-secondary">
              {h.title}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
