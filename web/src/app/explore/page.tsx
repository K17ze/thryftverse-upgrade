'use client';

/**
 * Explore — port of UnifiedDiscoveryScreen, restructured as a topic-led
 * surface: a discovery search header (text field with photo-search at
 * its trailing edge, conversational entry beneath), real query
 * shortcuts, the visual category shelf, an authored themes band, curated
 * member edits, an authored looks/moodboards band, member closets to
 * follow, then the inspiration masonry feed (listings + looks + posters
 * + moodboards + editorial breaks) behind department filter pills.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MasonryGrid, useMasonryColumns } from '@/components/feed/MasonryGrid';
import { Icon } from '@/components/ui/Icon';
import { ModuleSection } from '@/components/home/modules/ModuleSection';
import { CategoryShelf } from '@/components/explore/CategoryShelf';
import { FeedCategoryPills } from '@/components/explore/FeedCategoryPills';
import { TrendingQueries } from '@/components/explore/TrendingQueries';
import { TrendingTopics } from '@/components/explore/TrendingTopics';
import { LooksMoodboards } from '@/components/explore/LooksMoodboards';
import { ClosetsToFollow } from '@/components/explore/ClosetsToFollow';
import { CuratedEditsRail } from '@/components/discovery/CuratedEditsRail';
import { SearchField } from '@/components/search/SearchField';
import { CATEGORY_DIRECTORY } from '@/components/search/taxonomy';
import { FeedControlsProvider } from '@/components/feed/FeedControls';
import { rankFeedUnits } from '@/components/home/rankFeed';
import { useExploreFeed } from '@/lib/hooks/feed-queries';
import { useLoadMoreSentinel } from '@/lib/hooks/useLoadMoreSentinel';
import { useFeedPrefs } from '@/lib/feedPrefs';
import { useHydrated } from '@/lib/store/useStore';
import { DATA_MODE } from '@/lib/api/client';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';

export default function ExplorePage() {
  const router = useRouter();
  const columns = useMasonryColumns();
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useExploreFeed();
  const [q, setQ] = useState('');
  // Department filter for the masonry — 'all' or a CATEGORY_DIRECTORY slug.
  const [activeCategory, setActiveCategory] = useState('all');
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
    const source = data?.pages.flatMap((p) => p.units) ?? [];
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

  const activeDepartment = CATEGORY_DIRECTORY.find(
    (c) => c.slug === activeCategory,
  );

  // A department filter narrows the feed to its real listings — authored
  // units (looks, posters, editorial) carry no department and stay out
  // rather than leaking into a filtered view they don't belong to.
  const feedUnits = useMemo<DiscoveryFeedUnit[]>(() => {
    if (activeCategory === 'all') return units;
    return units.filter(
      (u) =>
        u.type === 'listing' &&
        u.listing.category.toLowerCase() === activeCategory,
    );
  }, [units, activeCategory]);

  // Tail pagination — the sentinel pulls the next page while the serve
  // has a nextCursor; an exhausted feed reports hasNextPage === false.
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const sentinelRef = useLoadMoreSentinel(
    hasNextPage === true && !isFetchingNextPage,
    loadMore,
  );

  const submit = (term: string) => {
    const query = term.trim();
    if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Discovery search header — dominant, quiet. The camera sits at
          the field's trailing edge (mobile AppSearchBar parity); the
          conversational entry stays a quiet text link beneath, then the
          honest query shortcuts — what members actually look for. */}
      <div className="px-4 pb-4 pt-5 sm:px-6">
        <h1 className="text-screen-title text-text-primary">Explore</h1>
        <div className="mt-3 flex max-w-2xl items-center gap-1">
          <SearchField
            value={q}
            onChange={setQ}
            onSubmit={submit}
            placeholder="Search for ideas, items and members"
            className="min-w-0 flex-1"
          />
          <Link
            href="/search/visual"
            aria-label="Search by photo"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-brand-subtle hover:text-text-primary"
          >
            <Icon name="camera" size={20} />
          </Link>
        </div>
        <Link
          href="/search/chat"
          className="pressable mt-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-caption font-medium text-text-muted hover:text-text-primary"
        >
          <Icon name="chat" size={13} />
          Describe what you&apos;re after
        </Link>
        <TrendingQueries />
      </div>

      {/* Department shelf → explore themes → member-authored bands →
          the full feed. Each module owns its own rhythm; the masonry
          keeps its department pills directly above the grid so a filter
          lands where the user sees it change. */}
      <CategoryShelf />
      <TrendingTopics />
      <CuratedEditsRail />
      <LooksMoodboards />
      <ClosetsToFollow />

      {/* The shared browse feed — recency/editorial order, not a
          personalised serve; the label says what it is. */}
      <ModuleSection title="More to explore">
        <FeedCategoryPills
          active={activeCategory}
          onChange={setActiveCategory}
        />
        <div className="mt-3">
          <FeedControlsProvider
            source={DATA_MODE === 'live' ? 'feed' : 'fixture'}
            surface="explore"
          >
            <MasonryGrid
              units={feedUnits}
              columns={columns}
              isLoading={isLoading}
              isError={isError}
              onRetry={() => void refetch()}
              emptyTitle={
                activeDepartment
                  ? `No ${activeDepartment.name.toLowerCase()} pieces yet`
                  : 'Nothing here yet'
              }
              emptySubtitle={
                activeDepartment
                  ? 'New pieces land every day — try another department.'
                  : 'Check back soon for new finds.'
              }
              emptyActionLabel={
                activeDepartment ? 'Browse everything' : undefined
              }
              onEmptyAction={
                activeDepartment
                  ? () => setActiveCategory('all')
                  : undefined
              }
            />
          </FeedControlsProvider>
        </div>
      </ModuleSection>

      {/* Feed tail — the sentinel fetches while the serve has a
          nextCursor; the end marker only renders once hasNextPage is
          provably false (undefined while the first page is in flight). */}
      {hasNextPage === true ? (
        <>
          <div ref={sentinelRef} className="h-px" aria-hidden />
          <div className="flex flex-col items-center gap-2 px-4 py-8">
            {isFetchingNextPage ? (
              <>
                <Icon
                  name="refresh"
                  size={18}
                  className="animate-spin text-text-muted"
                />
                <p className="sr-only" role="status">
                  Loading more results
                </p>
              </>
            ) : isFetchNextPageError ? (
              /* A failed page fetch stalls the sentinel — an honest retry
                  control is the only way forward. */
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                className="pressable text-body font-semibold text-brand"
              >
                Couldn&apos;t load more — try again
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {!isLoading && !isError && hasNextPage === false && feedUnits.length > 0 ? (
        <div className="flex flex-col items-center gap-2.5 px-4 py-10 sm:px-6">
          <span className="h-px w-10 bg-border-subtle" aria-hidden />
          <p className="text-meta text-text-muted">You&apos;ve reached the end</p>
        </div>
      ) : null}
    </div>
  );
}
