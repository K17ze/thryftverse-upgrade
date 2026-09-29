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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StoryRail } from '@/components/feed/StoryRail';
import { Tabs } from '@/components/ui/Tabs';
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
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { DATA_MODE } from '@/lib/api/client';
import {
  useFollowingFeed,
  useHomeFeed,
  useIntentTopics,
  type FeedSource,
  type ServeItemMeta,
} from '@/lib/hooks/feed-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useFeedPrefs } from '@/lib/feedPrefs';
import { prefersReducedMotion } from '@/lib/motion';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { useFollows } from '@/lib/store/follows';
import { useRecentlyViewed } from '@/lib/store/recentlyViewed';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';

type FeedMode = 'foryou' | 'following';

export default function HomePage() {
  const router = useRouter();
  const columns = useMasonryColumns();
  const feed = useHomeFeed();
  const { user } = useSession();
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

  // Following — live + signed-in reads the authoritative endpoint
  // (GET /feed/following/listings): followed sellers' active inventory,
  // not a slice of the recommendation serve. Guests/fixture keep the
  // local-follows filter below.
  const followingFeed = useFollowingFeed(mode === 'following');
  const followingLive = mode === 'following' && DATA_MODE === 'live' && user != null;
  const followingUnits = useMemo<DiscoveryFeedUnit[]>(
    () =>
      (followingFeed.data?.pages ?? []).flatMap((p) =>
        p.items.map((listing) => ({
          type: 'listing' as const,
          id: `listing-${listing.id}`,
          listing,
        })),
      ),
    [followingFeed.data],
  );

  const pages = useMemo(() => feed.data?.pages ?? [], [feed.data]);
  const firstPage = pages[0];
  const feedSource: FeedSource = followingLive
    ? 'feed'
    : (firstPage?.source ?? (DATA_MODE === 'live' ? 'feed' : 'fixture'));
  // Dedupe across pages — a refetch overlapping a pagination append can
  // re-serve a unit; the second copy renders as a duplicate tile.
  const allUnits = useMemo(() => {
    const seen = new Set<string>();
    const out: DiscoveryFeedUnit[] = [];
    for (const p of pages) {
      for (const u of p.units) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        out.push(u);
      }
    }
    return out;
  }, [pages]);
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

  // Count on the Following tab — only when the number is real. Fixture
  // mode counts the loaded authored feed; live omits it rather than
  // badge a first-page sample as the true total.
  const followingCount = useMemo(() => {
    if (DATA_MODE === 'live') return undefined;
    return allUnits.filter(
      (u) => u.type === 'listing' && followedSellers.has(u.listing.sellerId),
    ).length;
  }, [allUnits, followedSellers]);

  const units = useMemo<DiscoveryFeedUnit[]>(() => {
    // Hidden listings are suppressed in every mode — the "Not interested"
    // control is authoritative for the current feed.
    const hide = (list: DiscoveryFeedUnit[]) =>
      list.filter((u) => u.type !== 'listing' || !hiddenSet.has(u.listing.id));
    if (followingLive) {
      let source = hide(followingUnits);
      if (signal.key !== 'all') {
        const key = signal.key;
        source = source.filter(
          (u) => u.type === 'listing' && matchesHomeSignal(u.listing, key),
        );
      }
      // Server order is the truth — newest first; only down-weights
      // adjust locally (same rule as the recommendations branch).
      return rankFeedUnits(source, {
        likedIds: [],
        followingIds: [],
        downweightedKeys: downKeys,
        downweightedSizes: downSizes,
        priceCeilings: ceilings,
      });
    }
    let source = hide(allUnits);
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
  }, [allUnits, mode, signal, likedIds, followingIds, followedSellers, hiddenSet, downKeys, downSizes, ceilings, viewedIds, firstPage, followingLive, followingUnits]);

  // Channel state follows the active source — in Following-live mode the
  // dedicated feed's pending/error/pagination flags own the surface.
  const activeFeed = followingLive ? followingFeed : feed;
  // Stable sentinel target — an inline arrow re-registers the
  // IntersectionObserver every render.
  const loadMore = useCallback(() => {
    void activeFeed.fetchNextPage();
  }, [activeFeed]);
  const hasContent = followingLive ? followingUnits.length > 0 : allUnits.length > 0;
  const isInitialLoad = activeFeed.isPending;
  const fatalError = activeFeed.isError && !hasContent;
  // Split isError into its channels: initial-load failure swaps in the
  // error panel; a failed refresh/page-append keeps last-good content and
  // surfaces inline instead (mobile FRESH-02).
  const refreshFailed = activeFeed.isRefetchError;
  const loadMoreError = activeFeed.isFetchNextPageError;
  const isRefreshing = activeFeed.isRefetching && !activeFeed.isFetchingNextPage;

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Control bar first — tabs + signal rail pin on scroll (mobile
          HomeFeedHeader order: tabs → signal chips → stories → feed). */}
      <div className="sticky top-14 z-elevated flex items-center gap-3 border-b border-border-subtle bg-background px-4 py-2 sm:px-6 md:top-16">
        <Tabs
          tabs={[
            { key: 'foryou', label: 'For you' },
            { key: 'following', label: 'Following', count: followingCount },
          ]}
          active={mode}
          onChange={setMode}
          ariaLabel="Feed mode"
          hairline={false}
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
            void activeFeed.refetch();
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
        metaByListing={followingLive ? {} : metaByListing}
        requestId={followingLive ? null : (firstPage?.requestId ?? null)}
        policyVersion={followingLive ? null : (firstPage?.policyVersion ?? null)}
        serveMode={followingLive ? null : (firstPage?.serveMode ?? null)}
        surface="home_feed"
      >
        <HomeFeed
          units={units}
          columns={columns}
          isLoading={isInitialLoad}
          isError={fatalError}
          onRetry={() => void activeFeed.refetch()}
          refreshError={refreshFailed}
          onRefreshRetry={() => void activeFeed.refetch()}
          hasMore={activeFeed.hasNextPage === true}
          isLoadingMore={activeFeed.isFetchingNextPage}
          loadMoreError={loadMoreError}
          onLoadMore={loadMore}
          empty={
            mode === 'following'
              ? DATA_MODE === 'live' && user == null
                ? {
                    // Live Following is an authenticated surface — the
                    // local follows store can't enumerate real sellers.
                    title: 'Sign in to see your Following feed',
                    subtitle:
                      'New listings from members you follow land here.',
                    actionLabel: 'Sign in',
                    onAction: () => router.push('/auth/login'),
                  }
              : followingIds.length === 0 && !followingLive
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

      {/* Deep-scroll recovery — surfaces once the feed is two viewports
          down; below the mobile tab bar's reach and above content. */}
      <BackToTop />
    </div>
  );
}

/**
 * BackToTop — quiet floating control that appears after ~2 viewports of
 * scroll (Pinterest/Vinted deep-feed grammar). Reduced-motion sessions
 * jump instead of smooth-scrolling; the button mounts only when useful,
 * so it never sits in the tab order at the top of the feed.
 */
function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight * 2);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() =>
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }
      className="fade-in pressable fixed bottom-[88px] right-4 z-sticky flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-primary shadow-floating md:bottom-6 md:right-6"
    >
      <Icon name="arrowUp" size={20} />
    </button>
  );
}
