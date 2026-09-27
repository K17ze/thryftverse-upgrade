'use client';

/**
 * Home — port of HomeScreen, in the mobile module order: the sticky
 * control bar leads (For you / Following tabs + signal chip rail + the
 * refresh affordance), then the poster story rail, then the authored
 * feed — a product rail, denser masonry, and quiet editorial/members
 * breaks interleaved.
 *
 * Serve truth: signed-in live mode calls GET /recommendations/:userId
 * (server-ranked, reason codes + serve attribution); guests and fixture
 * mode render the baseline feed. Signal chips derive from real signals —
 * serve facets, intent topics, wishlist affinity — with the curated
 * baseline only where it matches feed content.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StoryRail } from '@/components/feed/StoryRail';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { useMasonryColumns } from '@/components/feed/MasonryGrid';
import { FeedControlsProvider } from '@/components/feed/FeedControls';
import { HomeFeed } from '@/components/home/HomeFeed';
import { EntryBand } from '@/components/home/modules/EntryBand';
import {
  deriveHomeSignals,
  matchesHomeSignal,
  type HomeSignal,
} from '@/components/home/homeSignals';
import { rankFeedUnits } from '@/components/home/rankFeed';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { DATA_MODE } from '@/lib/api/client';
import {
  useHomeFeed,
  useIntentTopics,
  type FeedSource,
  type ServeItemMeta,
} from '@/lib/hooks/feed-queries';
import { useFeedPrefs } from '@/lib/feedPrefs';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { useFollows } from '@/lib/store/follows';
import { useRecentlyViewed } from '@/lib/store/recentlyViewed';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';

type FeedMode = 'foryou' | 'following';

export default function HomePage() {
  const router = useRouter();
  const columns = useMasonryColumns();
  const feed = useHomeFeed();
  const { data: intentTopics } = useIntentTopics();
  const [mode, setMode] = useState<FeedMode>('foryou');
  const [signal, setSignal] = useState<HomeSignal>({ label: 'All', key: 'all' });
  const [newDrops, setNewDrops] = useState(0);
  const seenUnitIds = useRef<Set<string> | null>(null);

  // Personalization signals — persisted stores are gated behind hydration
  // so SSR and the first client render produce the same feed order.
  const hydrated = useHydrated();
  const wishlist = useStore((s) => s.wishlist);
  const followedIds = useFollows((s) => s.followingIds);
  const hiddenIds = useFeedPrefs((s) => s.hiddenListingIds);
  const downweightedKeys = useFeedPrefs((s) => s.downweightedKeys);
  const downweightedSizes = useFeedPrefs((s) => s.downweightedSizes);
  const priceCeilings = useFeedPrefs((s) => s.priceCeilings);
  const viewedListingIds = useRecentlyViewed((s) => s.listingIds);
  const likedIds = useMemo(() => (hydrated ? wishlist : []), [hydrated, wishlist]);
  const followingIds = useMemo(() => (hydrated ? followedIds : []), [hydrated, followedIds]);
  const followedSellers = useMemo(() => new Set(followingIds), [followingIds]);
  const hiddenSet = useMemo(
    () => new Set(hydrated ? hiddenIds : []),
    [hydrated, hiddenIds],
  );
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
  const viewedIds = useMemo(
    () => (hydrated ? viewedListingIds : []),
    [hydrated, viewedListingIds],
  );

  const pages = useMemo(() => feed.data?.pages ?? [], [feed.data]);
  const firstPage = pages[0];
  const feedSource: FeedSource = firstPage?.source ?? (DATA_MODE === 'live' ? 'feed' : 'fixture');
  const allUnits = useMemo(() => pages.flatMap((p) => p.units), [pages]);
  const metaByListing = useMemo<Record<string, ServeItemMeta>>(
    () => Object.assign({}, ...pages.map((p) => p.metaByListing)),
    [pages],
  );

  // "N new drops" — a refetch that lands new units at the head earns the
  // pill (mobile HomeFeedHeader parity). Pagination appends don't count:
  // their ids were already served. First load seeds the seen set silently.
  useEffect(() => {
    const data = feed.data;
    if (!data) return;
    const seen = seenUnitIds.current;
    const headIds = data.pages[0]?.units.map((u) => u.id) ?? [];
    if (seen === null) {
      seenUnitIds.current = new Set(data.pages.flatMap((p) => p.units.map((u) => u.id)));
      return;
    }
    const fresh = headIds.filter((id) => !seen.has(id)).length;
    for (const p of data.pages) for (const u of p.units) seen.add(u.id);
    if (fresh > 0) setNewDrops(fresh);
  }, [feed.data]);

  // Signal chips — derived from real signals when they exist (serve
  // facets, intent topics, wishlist), curated baseline only where it
  // matches the feed. A chip with nothing behind it is never offered.
  const signals = useMemo(
    () =>
      deriveHomeSignals({
        units: allUnits,
        likedIds,
        intentTopics,
        metaByListing,
      }),
    [allUnits, likedIds, intentTopics, metaByListing],
  );
  const signalChips = useMemo(() => {
    if (signal.key !== 'all' && !signals.some((s) => s.key === signal.key)) {
      // The active chip fell out of the derived set after a refresh —
      // keep it rendered so the filter stays dismissible.
      return [signals[0], signal, ...signals.slice(1)];
    }
    return signals;
  }, [signals, signal]);

  // Count shown on the Following tab — listing units from followed sellers.
  const followingCount = useMemo(
    () =>
      allUnits.filter(
        (u) => u.type === 'listing' && followedSellers.has(u.listing.sellerId),
      ).length,
    [allUnits, followedSellers],
  );

  const units = useMemo<DiscoveryFeedUnit[]>(() => {
    // Hidden listings are suppressed in every mode — the "Not interested"
    // control is authoritative for the current feed.
    let source = allUnits.filter(
      (u) => u.type !== 'listing' || !hiddenSet.has(u.listing.id),
    );
    if (mode === 'following') {
      // Following is followed sellers' listings only — authored for-you
      // units (looks, posters, breaks) carry no seller id, so keeping
      // them would fabricate membership in a feed built from follows.
      source = source.filter(
        (u) => u.type === 'listing' && followedSellers.has(u.listing.sellerId),
      );
    }
    if (signal.key !== 'all') {
      // Signal chips filter listings across identity fields; authored
      // units (looks, posters, boards) stay — they carry no department.
      const key = signal.key;
      source = source.filter(
        (u) => u.type !== 'listing' || matchesHomeSignal(u.listing, key),
      );
    }
    if (firstPage?.source === 'recommendations') {
      // The serve order is the ranking truth — only the user's own
      // down-weights adjust it locally (boost re-sorting a serve would
      // detach position from the logged impression).
      return rankFeedUnits(source, {
        likedIds: [],
        followingIds: [],
        downweightedKeys: downKeys,
        downweightedSizes: downSizes,
        priceCeilings: ceilings,
      });
    }
    // Like/follow/view-driven ordering — runs after filtering so the signal
    // chips stay authoritative; authored units hold their positions.
    return rankFeedUnits(source, {
      likedIds,
      followingIds,
      viewedIds,
      downweightedKeys: downKeys,
      downweightedSizes: downSizes,
      priceCeilings: ceilings,
    });
  }, [allUnits, mode, signal, likedIds, followingIds, followedSellers, hiddenSet, downKeys, downSizes, ceilings, viewedIds, firstPage]);

  const hasContent = allUnits.length > 0;
  const isInitialLoad = feed.isPending;
  const fatalError = feed.isError && !hasContent;
  // Split isError into its channels: initial-load failure swaps in the
  // error panel; a failed refresh/page-append keeps last-good content and
  // surfaces inline instead (mobile FRESH-02).
  const refreshFailed = feed.isRefetchError;
  const loadMoreError = feed.isFetchNextPageError;
  const isRefreshing = feed.isRefetching && !feed.isFetchingNextPage;

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Control bar first — tabs + signal rail pin on scroll (mobile
          HomeFeedHeader order: tabs → signal chips → stories → feed). */}
      <div className="sticky top-16 z-elevated flex items-center gap-3 border-b border-border-subtle bg-background px-4 py-2 sm:px-6">
        <SegmentedControl
          options={[
            { value: 'foryou', label: 'For you' },
            { value: 'following', label: 'Following', count: followingCount },
          ]}
          value={mode}
          onChange={setMode}
          className="shrink-0"
        />
        <div className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
          {signalChips.map((s) => (
            <Chip
              key={s.key}
              selected={signal.key === s.key}
              onClick={() => setSignal(s)}
            >
              {s.personalized ? (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${signal.key === s.key ? 'bg-text-inverse' : 'bg-brand'}`}
                  aria-hidden
                />
              ) : null}
              {s.label}
            </Chip>
          ))}
        </div>
        <IconButton
          name="refresh"
          aria-label="Refresh feed"
          onClick={() => {
            setNewDrops(0);
            void feed.refetch();
          }}
          disabled={isRefreshing}
          className={isRefreshing ? 'motion-safe:animate-spin' : ''}
        />
      </div>

      {/* "N new drops" pill — appears when a refresh lands new units while
          the user is down-feed; tapping scrolls home and clears it. */}
      {newDrops > 0 ? (
        <button
          type="button"
          onClick={() => {
            setNewDrops(0);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="pressable sticky top-[104px] z-elevated mx-auto mt-2 flex w-fit min-h-9 items-center gap-1.5 rounded-full bg-surface-elevated px-4 text-caption font-semibold text-text-primary shadow-modal border border-border"
        >
          {newDrops} new {newDrops === 1 ? 'drop' : 'drops'}
        </button>
      ) : null}

      <StoryRail />

      {/* Authored entry band — taste-led ways into the catalogue, each
          tile derived from listing truth and linking to a route that
          resolves (Vinted's curated-selections answer to the feed). */}
      <EntryBand />

      <FeedControlsProvider
        source={feedSource}
        metaByListing={metaByListing}
        requestId={firstPage?.requestId ?? null}
        policyVersion={firstPage?.policyVersion ?? null}
        serveMode={firstPage?.serveMode ?? null}
        surface="home_feed"
      >
        <HomeFeed
          units={units}
          columns={columns}
          isLoading={isInitialLoad}
          isError={fatalError}
          onRetry={() => void feed.refetch()}
          refreshError={refreshFailed}
          onRefreshRetry={() => void feed.refetch()}
          hasMore={feed.hasNextPage === true}
          isLoadingMore={feed.isFetchingNextPage}
          loadMoreError={loadMoreError}
          onLoadMore={() => void feed.fetchNextPage()}
          empty={
            mode === 'following'
              ? followingIds.length === 0
                ? {
                    title: 'You\u2019re not following anyone yet',
                    subtitle:
                      'Follow members and their new listings land here.',
                    actionLabel: 'Discover members',
                    onAction: () => router.push('/explore'),
                  }
                : signal.key === 'all'
                  ? {
                      title: 'Nothing from members you follow yet',
                      subtitle:
                        'When members you follow list new items, they land here.',
                      actionLabel: 'Find more members',
                      onAction: () => router.push('/explore'),
                    }
                  : {
                      title: 'Nothing in this signal yet',
                      subtitle:
                        'Members you follow have nothing here — try another signal.',
                    }
              : {
                  // For-you empty — mobile parity: honest copy + a real
                  // recovery path into the catalogue.
                  title: 'No drops live yet',
                  subtitle: 'Check back soon — or browse the catalogue.',
                  actionLabel: 'Browse all',
                  onAction: () => router.push('/explore'),
                }
          }
        />
      </FeedControlsProvider>
    </div>
  );
}
