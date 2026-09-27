'use client';

/**
 * Explore — port of UnifiedDiscoveryScreen, restructured as a topic-led
 * surface: discovery search header, visual category tiles, a trending
 * topics band, an authored looks/moodboards band, then the inspiration
 * masonry feed (listings + looks + posters + moodboards + editorial
 * breaks).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MasonryGrid } from '@/components/feed/MasonryGrid';
import { useResultColumns } from '@/components/filters/useResultColumns';
import { AppImage } from '@/components/ui/AppImage';
import { ModuleSection } from '@/components/home/modules/ModuleSection';
import { TrendingTopics } from '@/components/explore/TrendingTopics';
import { LooksMoodboards } from '@/components/explore/LooksMoodboards';
import { CuratedEditsRail } from '@/components/discovery/CuratedEditsRail';
import { SearchField } from '@/components/search/SearchField';
import { CATEGORY_DIRECTORY } from '@/components/search/taxonomy';
import { FeedControlsProvider } from '@/components/feed/FeedControls';
import { rankFeedUnits } from '@/components/home/rankFeed';
import { useFeed } from '@/lib/hooks/queries';
import { useFeedPrefs } from '@/lib/feedPrefs';
import { useHydrated } from '@/lib/store/useStore';
import { DATA_MODE } from '@/lib/api/client';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';

export default function ExplorePage() {
  const router = useRouter();
  const columns = useResultColumns();
  const { data, isLoading, isError, refetch } = useFeed();
  const [q, setQ] = useState('');
  const hydrated = useHydrated();
  const hiddenIds = useFeedPrefs((s) => s.hiddenListingIds);
  const downweightedKeys = useFeedPrefs((s) => s.downweightedKeys);
  const downweightedSizes = useFeedPrefs((s) => s.downweightedSizes);
  const priceCeilings = useFeedPrefs((s) => s.priceCeilings);
  const downKeys = useMemo(
    () => (hydrated ? downweightedKeys : []),
    [hydrated, downweightedKeys],
  );
  const downSizes = useMemo(
    () => (hydrated ? downweightedSizes : []),
    [hydrated, downweightedSizes],
  );
  const ceilings = useMemo(
    () => (hydrated ? priceCeilings : []),
    [hydrated, priceCeilings],
  );

  const units = useMemo<DiscoveryFeedUnit[]>(() => {
    const source = data?.units ?? [];
    // "Not interested" hides apply wherever feed cards render.
    const hidden = new Set(hydrated ? hiddenIds : []);
    const visible = source.filter(
      (u) => u.type !== 'listing' || !hidden.has(u.listing.id),
    );
    // The feedback layer is a real control here too — facet keys, size
    // pairs and price ceilings all demote to the tail of the listing
    // slots, same as home. Explore stays non-personalised otherwise: no
    // like/follow boosts, just the user's own down-weights on top of
    // catalogue order.
    return rankFeedUnits(visible, {
      likedIds: [],
      followingIds: [],
      downweightedKeys: downKeys,
      downweightedSizes: downSizes,
      priceCeilings: ceilings,
    });
  }, [data, hydrated, hiddenIds, downKeys, downSizes, ceilings]);

  const submit = (term: string) => {
    const query = term.trim();
    if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Discovery search header — dominant, quiet */}
      <div className="px-4 pb-4 pt-5 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">Explore</h1>
        <SearchField
          value={q}
          onChange={setQ}
          onSubmit={submit}
          placeholder="Search for ideas, items and members"
          className="mt-3 max-w-2xl"
        />
      </div>

      {/* Visual category tiles — media-first, one row scroll */}
      <div
        className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 sm:px-6"
        role="list"
        aria-label="Categories"
      >
        {CATEGORY_DIRECTORY.map((cat, i) => (
          <Link
            key={cat.slug}
            href={`/category/${cat.slug}`}
            role="listitem"
            aria-label={
              cat.count > 0
                ? `${cat.name} — ${cat.count} item${cat.count === 1 ? '' : 's'}`
                : `${cat.name} — browse the category`
            }
            className="pressable group relative h-24 w-40 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-48"
          >
            <AppImage
              src={cat.image}
              alt={cat.name}
              fill
              sizes="(max-width: 640px) 160px, 192px"
              priority={i < 4}
              className="h-full w-full media-zoom"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
            <span className="absolute bottom-2 left-2.5 right-2.5">
              <span className="block text-body-emphasis font-semibold text-scrim-text-primary">
                {cat.name}
              </span>
              {cat.count ? (
                <span className="tnum mt-0.5 block text-caption font-medium text-scrim-text-secondary">
                  {cat.count} item{cat.count === 1 ? '' : 's'}
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>

      <TrendingTopics />
      <LooksMoodboards />
      <CuratedEditsRail />

      {/* The shared browse feed — recency/editorial order, not a
          personalised serve; the label says what it is. */}
      <ModuleSection title="More to explore">
        <FeedControlsProvider
          source={DATA_MODE === 'live' ? 'feed' : 'fixture'}
          surface="explore"
        >
          <MasonryGrid
            units={units}
            columns={columns}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
          />
        </FeedControlsProvider>
      </ModuleSection>

      {/* Honest finite-feed marker — same grammar as the home footer. */}
      {!isLoading && !isError && units.length > 0 ? (
        <div className="flex flex-col items-center gap-2.5 px-4 py-10 sm:px-6">
          <span className="h-px w-10 bg-border-subtle" aria-hidden />
          <p className="text-meta text-text-muted">You&apos;ve reached the end</p>
        </div>
      ) : null}
    </div>
  );
}
