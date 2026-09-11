import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  Modal,
  Pressable,
  AppState,
  Platform,
  useWindowDimensions } from 'react-native';
import {
  useSharedValue,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

// Typography simplified - using direct font names
import { fetchPosterStories } from '../services/postersApi';
import type { PosterStory } from '../services/postersApi';
import { fetchLooksFromApi } from '../services/looksApi';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore, useIsGuest } from '../store/useStore';
import { useTabScroll } from '../context/TabScrollContext';
// Phase 3: Removed AnimatedBadge (badge clutter reduced)
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import { useBackendData } from '../context/BackendDataContext';
import { MediaPreview as CanonicalMediaPreview } from '../components/MediaPreview';
import { useViewabilityPlayback } from '../hooks/useViewabilityPlayback';
// Phase 3: Removed SyncStatusPill (status indicator clutter reduced)
import { useConnectivity } from '../hooks/useConnectivity';
import { toHomeDiscoveryItemVM, type HomeDiscoveryItemVM } from '../presentation/homeDiscoveryViewModel';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { preloadCriticalImages } from '../utils/imagePreloader';
import { AppButton } from '../components/ui/AppButton';
import { Space, Control, Radius, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { appStorage } from '../storage/mmkv';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { ProductAnalytics } from '../platform/product/productAnalytics';
import { openProductDetail } from '../platform/product/openProductDetail';
import { useFollowingFeed } from '../hooks/useFollowingFeed';
import { useForYouFeed } from '../hooks/useForYouFeed';
import { useRecommendationImpressions } from '../hooks/useRecommendationImpressions';
import { useFeatureFlag } from '../analytics';
import { useVisuallyComplete } from '../performance/visuallyComplete';
import { useDynamicAlgorithmSignals } from '../hooks/useDynamicAlgorithmSignals';
import { matchesSignal, type DynamicSignalChip } from '../services/algorithmicSignalsService';
import { HomeHeader } from '../components/home/HomeHeader';
import { HomeMasonryFeed, type FeedDataItem, type LookFeedMarker, extractFeedImageUri } from '../components/home/HomeMasonryFeed';
import { HomeFeedHeader, type FeedMode } from '../components/home/HomeFeedHeader';

// Lazy-load the monitoring module at call time to avoid circular import
// issues where the static binding may be undefined during initial module
// evaluation.
function safeMarkInteractive(attributes: Record<string, string | number | boolean | null | undefined> | undefined): void {
  try {
    // Use a dynamic require to bypass the static import binding which may
    // be undefined due to circular dependency resolution order.
    const mod = require('../platform/monitoring');
    if (mod && typeof mod.markInteractive === 'function') {
      mod.markInteractive(attributes);
    }
  } catch {
    // Observability must never crash the app.
  }
}

type NavT = NativeStackNavigationProp<RootStackParamList>;

const HEADER_EXPANDED = 58;
const HEADER_COLLAPSED = 52;

export default function HomeScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  // Home is nested HomeStack → BottomTabs → RootStack. Global overlays are
  // owned by RootStack and must not be dispatched into the tab-local stack.
  const rootNavigation = navigation
    .getParent()
    ?.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const notificationCount = useStore((state) => state.notificationCount);
  const isGuest = useIsGuest();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();
  const { spring } = useMotionConfig();
  const { listings, source, isSyncing, lastError, refreshListings, loadMoreListings, hasMore, isLoadingMore } = useBackendData();
  const followingFeed = useFollowingFeed();
  const forYouFeed = useForYouFeed();
  const { isOffline } = useConnectivity();
  useVisuallyComplete('Home');

  // Feature flags — additive enhancements gated by PostHog. Both default to
  // false (current behaviour) when PostHog is not configured.
  // - new_home_feed: shows an editorial section header introducing the feed.
  // - live_shopping_enabled: shows a Live shopping badge in the header.
  const newHomeFeedEnabled = useFeatureFlag('new_home_feed');
  const liveShoppingEnabled = useFeatureFlag('live_shopping_enabled');

  const [refreshing, setRefreshing] = React.useState(false);
  const [peekItem, setPeekItem] = React.useState<HomeDiscoveryItemVM | null>(null);
  const [newListingIds, setNewListingIds] = React.useState<Set<string>>(() => new Set());
  // Persist feed mode across sessions via MMKV so the user's last-used
  // feed view (For you / Following) is restored on app launch.
  const [feedMode, setFeedModeState] = React.useState<FeedMode>(() => {
    try {
      const stored = appStorage.getString('home.feedMode');
      if (stored === 'foryou' || stored === 'following') {
        return stored;
      }
    } catch {}
    return 'foryou';
  });
  const setFeedMode = React.useCallback((mode: FeedMode) => {
    setFeedModeState(mode);
    try { appStorage.set('home.feedMode', mode); } catch {}
  }, []);
  const {
    signals: dynamicSignals,
    activeSignal: selectedSignalChip,
    selectSignal: handleSelectSignalChip,
    isPersonalized: hasPersonalizedSignals,
  } = useDynamicAlgorithmSignals({ surface: 'home' });

  // Viewability-driven video autoplay: only the most-visible feed tile plays
  // its video. Settlement delay (350ms) avoids spinning up players during fast
  // scrolling. Offscreen items pause immediately, releasing decode resources
  // (AGENTS.md §16, §27.8 — one active player across the surface).
  const {
    activeIndex: activePlaybackIndex,
    viewabilityConfig: playbackViewabilityConfig,
    onViewableItemsChanged: onPlaybackViewableItemsChanged,
    reset: resetPlayback } = useViewabilityPlayback(350);

  const {
    onViewableItemsChanged: onImpressionViewableItemsChanged,
    reset: resetImpressions } = useRecommendationImpressions(
    React.useCallback(
      (entries) => void forYouFeed.confirmImpressions(entries),
      [forYouFeed.confirmImpressions],
    ),
  );

  React.useEffect(() => {
    resetImpressions();
  }, [forYouFeed.requestId, resetImpressions]);

  const scrollY = useSharedValue(0);
  const lastScrollY = useSharedValue(0);
  // Crossfade opacity for feed content on tab switch (120ms = Motion.duration.fast).
  const feedOpacity = useSharedValue(1);
  const { tabBarVisible } = useTabScroll();
  const scrollRef = React.useRef<any>(null);
  const knownListingIdsRef = React.useRef<Set<string>>(new Set());
  const seededKnownListingIdsRef = React.useRef(false);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPrefetchedIndexRef = React.useRef(-1);

  const headerExpandedHeight = React.useMemo(() => HEADER_EXPANDED + insets.top, [insets.top]);
  const headerCollapsedHeight = React.useMemo(() => HEADER_COLLAPSED + insets.top, [insets.top]);

  // Spring-driven header height — settles towards the scroll-derived target
  // with physics instead of tracking it linearly. This gives the collapse a
  // natural, flagship feel (AGENTS.md §4 motion language) while still snapping
  // to the expanded/collapsed edges via the spring's damping.
  const headerHeightSV = useSharedValue(headerExpandedHeight);

  useScrollToTop(scrollRef);

  const animatedScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;

      // Direct shared value assignment — continuous scroll motion should
      // use interpolation, not springs. Springs on continuously changing
      // values create lag and jank (AGENTS.md P1-UI-3).
      headerHeightSV.value = interpolate(
        e.contentOffset.y,
        [0, 120],
        [headerExpandedHeight, headerCollapsedHeight],
        Extrapolation.CLAMP,
      );

      if (e.contentOffset.y > lastScrollY.value + 5 && e.contentOffset.y > 80) {
        tabBarVisible.value = false;
      } else if (e.contentOffset.y < lastScrollY.value - 5 || e.contentOffset.y <= 0) {
        tabBarVisible.value = true;
      }

      lastScrollY.value = e.contentOffset.y;
    } });

  // Web fallback: plain JS scroll handler (Reanimated worklets not supported
  // on web with createAnimatedComponent). LIST_RENDERING_POLICY.md §2.5.
  const webScrollHandler = React.useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    scrollY.value = offsetY;

    const targetHeight = interpolate(
      offsetY,
      [0, 120],
      [headerExpandedHeight, headerCollapsedHeight],
      Extrapolation.CLAMP,
    );
    headerHeightSV.value = targetHeight;

    if (offsetY > lastScrollY.value + 5 && offsetY > 80) {
      tabBarVisible.value = false;
    } else if (offsetY < lastScrollY.value - 5 || offsetY <= 0) {
      tabBarVisible.value = true;
    }

    lastScrollY.value = offsetY;
  }, [scrollY, headerHeightSV, headerExpandedHeight, headerCollapsedHeight, lastScrollY, tabBarVisible]);

  const scrollHandler = Platform.OS === 'web' ? webScrollHandler : animatedScrollHandler;

  React.useEffect(() => {
    if (!seededKnownListingIdsRef.current) {
      if (listings.length === 0) {
        return;
      }

      knownListingIdsRef.current = new Set(listings.map((listing) => listing.id));
      seededKnownListingIdsRef.current = true;
      return;
    }

    const unseenListingIds = listings
      .map((listing) => listing.id)
      .filter((listingId) => !knownListingIdsRef.current.has(listingId));

    if (unseenListingIds.length === 0) {
      return;
    }

    setNewListingIds((previous) => {
      const merged = new Set(previous);
      unseenListingIds.forEach((id) => merged.add(id));
      return merged;
    });
  }, [listings]);

  React.useEffect(() => {
    let pollingTimer: ReturnType<typeof setInterval> | null = null;

    const runSilentRefresh = () => {
      if (refreshing) {
        return;
      }

      void refreshListings();
    };

    pollingTimer = setInterval(() => {
      if (AppState.currentState === 'active') {
        runSilentRefresh();
      }
    }, 55000);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        runSilentRefresh();
      }
    });

    return () => {
      if (pollingTimer) {
        clearInterval(pollingTimer);
      }
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      appStateSubscription.remove();
    };
  }, [refreshListings, refreshing]);

  const acknowledgeNewListings = React.useCallback(() => {
    setNewListingIds((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      previous.forEach((id) => {
        knownListingIdsRef.current.add(id);
      });

      return new Set();
    });

    // FlashList exposes scrollToOffset rather than ScrollView's scrollTo.
    scrollRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  }, [scrollRef]);

  const handleRefresh = async () => {
    haptic.patterns.refresh();
    setRefreshing(true);
    await refreshListings();
    void followingFeed.refresh();
    void forYouFeed.refresh();
    loadPostersAndLooks();
    acknowledgeNewListings();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshing(false);
    }, 380);
  };

  const [realPosters, setRealPosters] = React.useState<PosterStory[]>([]);
  const [postersLoading, setPostersLoading] = React.useState(false);
  // Looks fetched for the feed interruption rail. Optional enrichment — a
  // fetch failure silently leaves the feed without a Looks rail rather than
  // surfacing an error (looks are not core to the commerce feed).
  const [feedLooks, setFeedLooks] = React.useState<LookFeedMarker['looks']>([]);

  const loadPostersAndLooks = React.useCallback(() => {
    let mounted = true;
    setPostersLoading(true);
    fetchPosterStories({ active: true, limit: 20 })
      .then((res) => {
        if (mounted) setRealPosters(res.items);
      })
      .catch(() => { /* noop */ })
      .finally(() => { if (mounted) setPostersLoading(false); });
    // Fetch looks for feed interruption — published public looks only.
    fetchLooksFromApi({ status: 'published', limit: 6 })
      .then((res) => {
        if (!mounted) return;
        const lookItems = res.items.map((l) => ({
          id: l.id,
          mediaUri: l.mediaUrl,
          title: l.title,
          sellerUsername: l.creator.username ?? undefined,
          sellerAvatar: l.creator.avatar ?? undefined,
          taggedCount: l.tags?.length ?? 0 }));
        setFeedLooks(lookItems);
      })
      .catch(() => { /* silent fail — looks are optional enrichment */ });
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    const cleanup = loadPostersAndLooks();
    return cleanup;
  }, [loadPostersAndLooks]);

  // Refetch posters and looks on focus so newly published content appears
  // in the feed without requiring a manual pull-to-refresh.
  useFocusEffect(
    React.useCallback(() => {
      loadPostersAndLooks();
    }, [loadPostersAndLooks]),
  );

  const feedStatus = React.useMemo(
    () =>
      getBackendSyncStatus({
        isSyncing,
        source,
        hasError: Boolean(lastError) }),
    [isSyncing, lastError, source],
  );

  const showFeedLoadingSkeleton = isSyncing && !lastError;

  const gridTileWidth = React.useMemo(
    // FlashList numColumns=2 gives each column windowWidth/2.
    // flashListItem paddingHorizontal: Space.xs (4pt) → 8pt gutter, 4pt edge.
    // Tile width = column width - 2 * padding = windowWidth/2 - Space.sm.
    () => Math.floor((windowWidth - Space.sm * 2) / 2),
    [windowWidth],
  );

  const wishlist = useStore((state) => state.wishlist);

  // Followed seller IDs for context derivation (followed_seller badge on cards)
  const followedSellerIdsSet = React.useMemo(
    () => new Set(followingFeed.followingUsers.map((u) => u.id)),
    [followingFeed.followingUsers],
  );

  // Phase 5: Home discovery view models carry product identity (brand + title)
  // and price below media so the feed reads as visual commerce, not
  // a passive image board. Identity synthesis follows doc 46 precedence.
  //
  // Asymmetric editorial rhythm (spec 11): 6-12 normal tiles, one larger
  // featured unit, continue feed. We use a deterministic-but-varied pattern
  // so the rhythm doesn't read as mechanical every-8th. The sequence is
  // [7, 9, 6, 10, 8] repeating — average 8, range 6-10, never identical
  // twice in a row. This breaks the uniform grid silhouette without being
  // random (randomness would cause layout jumps on data refresh).
  const FEATURED_RHYTHM = [7, 9, 6, 10, 8];
  const computeFeatured = React.useCallback((index: number) => {
    let pos = 0;
    let i = index;
    while (i >= FEATURED_RHYTHM[pos % FEATURED_RHYTHM.length]) {
      i -= FEATURED_RHYTHM[pos % FEATURED_RHYTHM.length];
      pos++;
    }
    return i === FEATURED_RHYTHM[pos % FEATURED_RHYTHM.length] - 1;
  }, []);

  // Following feed: transform following listings into discovery VMs
  const followingExploreData = React.useMemo<HomeDiscoveryItemVM[]>(() => {
    return followingFeed.listings.map((listing) =>
      toHomeDiscoveryItemVM(listing, {
        isSaved: wishlist.includes(listing.id),
        currency: currencyCode,
        followedSellerIds: followedSellerIdsSet }),
    ).map((vm, index) => ({
      ...vm,
      featured: computeFeatured(index) }));
  }, [followingFeed.listings, wishlist, followedSellerIdsSet, computeFeatured]);

  // For You feed: transform personalised recommendations into discovery VMs
  const forYouExploreData = React.useMemo<HomeDiscoveryItemVM[]>(() => {
    return forYouFeed.listings.map((listing) =>
      toHomeDiscoveryItemVM(listing, {
        isSaved: wishlist.includes(listing.id),
        currency: currencyCode,
        followedSellerIds: followedSellerIdsSet }),
    ).map((vm, index) => ({
      ...vm,
      featured: computeFeatured(index) }));
  }, [forYouFeed.listings, wishlist, followedSellerIdsSet, computeFeatured]);

  // For You mode uses personalised recommendations. When the feed is empty
  // or errored, we do NOT silently substitute general listings. The empty/
  // error state renders an honest message and the user can pull to refresh
  // or browse all via the Explore tab.
  const effectiveForYouData = forYouFeed.listings.length > 0 ? forYouExploreData : [];
  const forYouIsEmpty = feedMode === 'foryou' && !forYouFeed.isLoading && !forYouFeed.isRefreshing && forYouFeed.listings.length === 0;
  const forYouHasError = feedMode === 'foryou' && forYouFeed.error !== null && forYouFeed.listings.length === 0;
  const forYouIsDegraded = feedMode === 'foryou' && forYouFeed.serveMode === 'degraded_baseline' && forYouFeed.listings.length > 0;

  // Base feed data switches between Following and For You feeds.
  const baseFeedData = React.useMemo(() => {
    if (feedMode === 'following') {
      return followingExploreData;
    }
    return effectiveForYouData;
  }, [feedMode, followingExploreData, effectiveForYouData]);

  // G2: Apply dynamic quick signal filtering to the base feed data.
  const activeFeedData = React.useMemo(() => {
    if (selectedSignalChip.filterKey === 'all') return baseFeedData;
    return baseFeedData.filter((item) => matchesSignal(item, selectedSignalChip));
  }, [baseFeedData, selectedSignalChip]);

  const handleSelectSignal = React.useCallback(
    (signal: DynamicSignalChip) => {
      haptic.selection();
      handleSelectSignalChip(signal);
    },
    [handleSelectSignalChip, haptic]
  );

  const showFollowingLoading = feedMode === 'following' && followingFeed.isLoading && !followingFeed.isRefreshing;
  const showFollowingRefreshing = feedMode === 'following' && followingFeed.isRefreshing;
  const showForYouLoading = feedMode === 'foryou' && forYouFeed.isLoading && !forYouFeed.isRefreshing && forYouFeed.listings.length === 0;

  // Posters rail injected into the feed after 4 items (2 rows in 2-column
  // grid) so the first viewport shows header + tabs + media — nothing else.
  // Posters rail renders in the ListHeaderComponent (above the grid) so it
  // is visible in the first viewport — aligned with 2026
  // story-tray placement. The rail is a compact horizontal scroll that does
  // not displace the first media row significantly.
  // Looks rail injected as a full-span item further down the feed to create
  // an authored interruption (~6 rows of products) so the feed reads as
  // curated rhythm rather than a flat product list.
  const LOOKS_INJECT_INDEX = 12;
  const feedGridData = React.useMemo<FeedDataItem[]>(() => {
    if (showFeedLoadingSkeleton || showFollowingLoading || showForYouLoading) return [];
    if (activeFeedData.length === 0) return [];
    const result: FeedDataItem[] = [...activeFeedData];
    // Looks rail — inject as an authored interruption further down the feed.
    if (feedLooks.length > 0 && result.length > LOOKS_INJECT_INDEX) {
      result.splice(LOOKS_INJECT_INDEX, 0, {
        id: 'feed-looks-rail',
        type: 'looks',
        looks: feedLooks } as LookFeedMarker);
    }
    return result;
  }, [activeFeedData, feedLooks, showFeedLoadingSkeleton, showFollowingLoading, showForYouLoading]);

  // EAS Observe: record TTI once the home feed has real content rendered for
  // the first time. Only the first markInteractive() call across the whole app
  // records the metric, so this is safe to fire on every transition into a
  // populated feed.
  const feedFirstRenderRef = React.useRef(false);
  React.useEffect(() => {
    if (feedFirstRenderRef.current) {
      return;
    }
    if (feedGridData.length > 0) {
      feedFirstRenderRef.current = true;
      safeMarkInteractive({ surface: 'home_feed_first_render', feed_mode: feedMode });
    }
  }, [feedGridData.length, feedMode]);

  // Crossfade the feed content when the active tab changes. The opacity dips
  // to 0 then returns to 1 over Motion.duration.fast (120ms) so the content
  // swap reads as a smooth fade rather than an instant cut. Reduced-motion
  // users get an instant swap (duration 0).
  React.useEffect(() => {
    feedOpacity.value = 0;
    feedOpacity.value = withTiming(1, {
      duration: reducedMotionEnabled ? 0 : Motion.duration.fast });
    // Reset viewability playback when the feed content swaps so a stale
    // activeIndex does not cause a now-offscreen video to keep playing.
    resetPlayback();
    lastPrefetchedIndexRef.current = -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedMode, selectedSignalChip.filterKey]);

  const closePeek = React.useCallback(() => {
    setPeekItem(null);
  }, []);

  const handleTilePress = React.useCallback((routeId: string | undefined) => {
    if (!routeId) return;
    haptic.selection();
    ProductAnalytics.itemView(routeId);
    openProductDetail(navigation, { referenceKind: 'listing', canonicalId: routeId, sourceSurface: 'HomeScreen' });
  }, [navigation, haptic]);

  const handleTileLongPress = React.useCallback((item: HomeDiscoveryItemVM) => {
    haptic.medium(); // ELEVATED: Medium haptic for long press
    setPeekItem(item);
  }, [haptic]);

  const handleViewableItemsChanged = React.useCallback((info: { changed: import('react-native').ViewToken[]; viewableItems: import('react-native').ViewToken[] }) => {
    onPlaybackViewableItemsChanged(info);
    onImpressionViewableItemsChanged(info);
    const maxVisibleIndex = info.viewableItems.reduce((max, token) => {
      const idx = typeof token.index === 'number' ? token.index : -1;
      return idx > max ? idx : max;
    }, -1);
    if (maxVisibleIndex < 0 || maxVisibleIndex <= lastPrefetchedIndexRef.current) return;
    lastPrefetchedIndexRef.current = maxVisibleIndex;
    const ahead = feedGridData.slice(maxVisibleIndex + 1, maxVisibleIndex + 11);
    const uris: string[] = [];
    for (const item of ahead) {
      const uri = extractFeedImageUri(item);
      if (uri) uris.push(uri);
    }
    if (uris.length > 0) {
      void preloadCriticalImages(uris, { priority: 'normal', cachePolicy: 'disk' });
    }
  }, [onPlaybackViewableItemsChanged, onImpressionViewableItemsChanged, feedGridData]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <HomeHeader
        scrollY={scrollY}
        headerHeightSV={headerHeightSV}
        isGuest={isGuest}
        notificationCount={notificationCount}
        liveShoppingEnabled={liveShoppingEnabled}
      />

      <HomeMasonryFeed
        ref={scrollRef}
        feedOpacity={feedOpacity}
        data={feedGridData}
        contentContainerStyle={[styles.feedContent, { paddingTop: headerExpandedHeight + Space.sm }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        viewabilityConfig={playbackViewabilityConfig}
        onViewableItemsChanged={handleViewableItemsChanged}
        onEndReached={() => {
          if (hasMore && !isLoadingMore) void loadMoreListings();
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <HomeFeedHeader
            feedMode={feedMode}
            onFeedModeChange={setFeedMode}
            followingListingsCount={followingFeed.listings.length}
            signals={dynamicSignals}
            selectedSignal={selectedSignalChip}
            onSelectSignal={handleSelectSignal}
            newHomeFeedEnabled={newHomeFeedEnabled}
            postersLoading={postersLoading}
            posters={realPosters}
            newListingCount={newListingIds.size}
            onAcknowledgeNewListings={acknowledgeNewListings}
            isOffline={isOffline}
            hasSyncError={Boolean(lastError)}
            isSyncing={isSyncing}
            isRefreshing={refreshing}
            forYouIsDegraded={forYouIsDegraded}
            onRetry={() => void handleRefresh()}
            showLoadingSkeleton={showFeedLoadingSkeleton}
            showFollowingLoading={showFollowingLoading}
            showForYouLoading={showForYouLoading}
            feedDataLength={feedGridData.length}
            followingError={followingFeed.error}
            followingHasFollowing={followingFeed.hasFollowing}
            onFollowingRefresh={() => void followingFeed.refresh()}
            forYouError={forYouFeed.error}
            forYouIsEmpty={forYouIsEmpty}
            forYouHasError={forYouHasError}
            onForYouRefresh={() => void forYouFeed.refresh()}
            onBrowse={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Explore' })}
            gridTileWidth={gridTileWidth}
          />
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={{ paddingVertical: Space.md, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: TypographyV2.meta.size }} maxFontSizeMultiplier={1.8}>Loading more...</Text>
            </View>
          ) : !hasMore && feedGridData.length > 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: Space.lg, gap: Space.sm }}>
              <View style={{ width: 40, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
              <Text style={{ color: colors.textMuted, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily }} maxFontSizeMultiplier={1.8}>
                You've reached the end
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            titleColor={colors.textMuted}
            progressBackgroundColor={colors.background}
          />
        }
        gridTileWidth={gridTileWidth}
        windowWidth={windowWidth}
        formatPrice={formatFromFiat}
        onTilePress={handleTilePress}
        onTileLongPress={handleTileLongPress}
        activePlaybackIndex={activePlaybackIndex}
      />

      <Modal
        transparent
        visible={Boolean(peekItem)}
        animationType="fade"
        onRequestClose={closePeek}
      >
        <Pressable
          style={styles.peekBackdrop}
          onPress={closePeek}
          accessibilityRole="button"
          accessibilityLabel="Close preview"
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />

          {peekItem ? (
            <Pressable
              style={styles.peekCard}
              onPress={(event) => event.stopPropagation()}
              accessibilityRole="none"
            >
              <View style={styles.peekMediaWrap}>
                <CanonicalMediaPreview
                  uri={peekItem.media.uri}
                  posterUri={peekItem.media.posterUri}
                  style={styles.peekMedia}
                  shouldPlay
                  contentFit="cover"
                  showPlayBadge={false}
                />
              </View>

              <View style={styles.peekMeta}>
                <Text style={styles.peekTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>{peekItem.identity.primary}</Text>

                <View style={styles.peekActionsRow}>
                  <AppButton
                    title="Close"
                    variant="secondary"
                    size="sm"
                    align="center"
                    style={styles.peekGhostBtn}
                    titleStyle={styles.peekGhostText}
                    onPress={closePeek}
                    accessibilityLabel="Close preview"
                    accessibilityHint="Closes the quick listing preview"
                    accessibilityRole="button"
                  />

                  <AppButton
                    title="View Listing"
                    variant="primary"
                    size="sm"
                    align="center"
                    style={styles.peekPrimaryBtn}
                    titleStyle={styles.peekPrimaryText}
                    icon={<Ionicons name="arrow-forward" size={14} color={colors.background} />}
                    iconContainerStyle={styles.peekPrimaryIconWrap}
                    onPress={() => {
                      if (peekItem.routeId) {
                        openProductDetail(navigation, { referenceKind: 'listing', canonicalId: peekItem.routeId, sourceSurface: 'HomeScreenPeek' });
                      }
                      closePeek();
                    }}
                    accessibilityLabel="Open listing details"
                    accessibilityHint="Navigates to full listing details"
                    accessibilityRole="button"
                  />
                </View>
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  feedContent: {
    paddingBottom: 120 },
  peekBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md },
  peekCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: RadiusRoleValue.standalonePanel,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt },
  peekMediaWrap: {
    width: '100%',
    height: 340,
    backgroundColor: colors.surfaceAlt },
  peekMedia: {
    width: '100%',
    height: '100%' },
  peekMeta: {
    paddingHorizontal: 14,
    paddingVertical: 14 },
  peekTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2 },
  peekActionsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10 },
  peekGhostBtn: {
    flex: 1,
    height: Control.hit,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'transparent' },
  peekGhostText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary },
  peekPrimaryBtn: {
    flex: 1,
    height: Control.hit,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'transparent' },
  peekPrimaryIconWrap: {
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: 'transparent' },
  peekPrimaryText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold,
    color: colors.background } });
