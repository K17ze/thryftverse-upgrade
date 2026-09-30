import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMasonryColumns } from '@/components/feed/MasonryGrid';
import {
  deriveHomeSignals,
  matchesHomeSignal,
  type HomeSignal,
} from '@/components/home/homeSignals';
import { rankFeedUnits } from '@/components/home/rankFeed';
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
import { useHydrated, useStore } from '@/lib/store/useStore';
import { useFollows } from '@/lib/store/follows';
import { useRecentlyViewed } from '@/lib/store/recentlyViewed';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';
import type { FeedMode } from './HomeControlBar';

export function useHomeFeedWorkflow() {
  const router = useRouter();
  const columns = useMasonryColumns();
  const feed = useHomeFeed();
  const { user } = useSession();
  const { data: intentTopics } = useIntentTopics();
  const [mode, setMode] = useState<FeedMode>('foryou');
  const [signal, setSignal] = useState<HomeSignal>({ label: 'All', key: 'all' });
  const [newDrops, setNewDrops] = useState(0);
  const seenUnitIds = useRef<Set<string> | null>(null);

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
      return [signals[0], signal, ...signals.slice(1)];
    }
    return signals;
  }, [signals, signal]);

  const followingCount = useMemo(() => {
    if (DATA_MODE === 'live') return undefined;
    return allUnits.filter(
      (u) => u.type === 'listing' && followedSellers.has(u.listing.sellerId),
    ).length;
  }, [allUnits, followedSellers]);

  const units = useMemo<DiscoveryFeedUnit[]>(() => {
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
      source = source.filter(
        (u) => u.type === 'listing' && followedSellers.has(u.listing.sellerId),
      );
    }
    if (signal.key !== 'all') {
      const key = signal.key;
      source = source.filter(
        (u) => u.type !== 'listing' || matchesHomeSignal(u.listing, key),
      );
    }
    if (firstPage?.source === 'recommendations') {
      return rankFeedUnits(source, {
        likedIds: [],
        followingIds: [],
        downweightedKeys: downKeys,
        downweightedSizes: downSizes,
        priceCeilings: ceilings,
      });
    }
    return rankFeedUnits(source, {
      likedIds,
      followingIds,
      viewedIds,
      downweightedKeys: downKeys,
      downweightedSizes: downSizes,
      priceCeilings: ceilings,
    });
  }, [
    allUnits,
    mode,
    signal,
    likedIds,
    followingIds,
    followedSellers,
    hiddenSet,
    downKeys,
    downSizes,
    ceilings,
    viewedIds,
    firstPage,
    followingLive,
    followingUnits,
  ]);

  const activeFeed = followingLive ? followingFeed : feed;
  const loadMore = useCallback(() => {
    void activeFeed.fetchNextPage();
  }, [activeFeed]);
  const hasContent = followingLive ? followingUnits.length > 0 : allUnits.length > 0;
  const isInitialLoad = activeFeed.isPending;
  const fatalError = activeFeed.isError && !hasContent;
  const refreshFailed = activeFeed.isRefetchError;
  const loadMoreError = activeFeed.isFetchNextPageError;
  const isRefreshing = activeFeed.isRefetching && !activeFeed.isFetchingNextPage;

  const emptyConfig = useMemo(() => {
    if (mode === 'following') {
      if (DATA_MODE === 'live' && user == null) {
        return {
          title: 'Sign in to see your Following feed',
          subtitle: 'New listings from members you follow land here.',
          actionLabel: 'Sign in',
          onAction: () => router.push('/auth/login'),
        };
      }
      if (followingIds.length === 0 && !followingLive) {
        return {
          title: 'You\u2019re not following anyone yet',
          subtitle: 'Follow members and their new listings land here.',
          actionLabel: 'Discover members',
          onAction: () => router.push('/explore'),
        };
      }
      if (signal.key === 'all') {
        return {
          title: 'Nothing from members you follow yet',
          subtitle: 'When members you follow list new items, they land here.',
          actionLabel: 'Find more members',
          onAction: () => router.push('/explore'),
        };
      }
      return {
        title: 'Nothing in this signal yet',
        subtitle: 'Members you follow have nothing here — try another signal.',
      };
    }
    return {
      title: 'No drops live yet',
      subtitle: 'Check back soon — or browse the catalogue.',
      actionLabel: 'Browse all',
      onAction: () => router.push('/explore'),
    };
  }, [mode, user, followingIds, followingLive, signal.key, router]);

  return {
    router,
    columns,
    mode,
    setMode,
    signal,
    setSignal,
    newDrops,
    setNewDrops,
    signalChips,
    followingCount,
    feedSource,
    metaByListing,
    firstPage,
    followingLive,
    units,
    activeFeed,
    loadMore,
    isInitialLoad,
    fatalError,
    refreshFailed,
    loadMoreError,
    isRefreshing,
    emptyConfig,
  };
}
