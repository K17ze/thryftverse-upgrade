import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Dimensions,
  RefreshControl,
  Modal,
  Pressable,
  AppState,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Video, ResizeMode } from '../components/compat/Video';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

// Typography simplified - using direct font names
import { fetchPosterStories } from '../services/postersApi';
import type { PosterStory } from '../services/postersApi';
import { fetchLooksFromApi } from '../services/looksApi';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useTabScroll } from '../context/TabScrollContext';
// Phase 3: Removed AnimatedBadge (badge clutter reduced)
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { MediaPreview as CanonicalMediaPreview } from '../components/MediaPreview';
import { useViewabilityPlayback } from '../hooks/useViewabilityPlayback';
import { HorizontalRail } from '../components/HorizontalRail';
// Phase 3: Removed SyncStatusPill (status indicator clutter reduced)
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnectivity } from '../hooks/useConnectivity';
import { EmptyState } from '../components/EmptyState';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { HomeDiscoveryCard } from '../components/discover/HomeDiscoveryCard';
import { toHomeDiscoveryItemVM, type HomeDiscoveryItemVM } from '../presentation/homeDiscoveryViewModel';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { isVideoUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { Space, Radius, FontFamily, Stroke, Type, Typography, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { ProductAnalytics } from '../platform/product/productAnalytics';
import { useFollowingFeed } from '../hooks/useFollowingFeed';
import { useForYouFeed } from '../hooks/useForYouFeed';
import { markInteractive } from '../platform/monitoring';

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
import { resolveListingMediaHeightRatio } from '../utils/listingMediaGeometry';
import { safeValidateDocument, type CreatorDocument } from '../creator/composition';
import { CreatorCanvas } from '../creator/CreatorCanvas';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const HEADER_EXPANDED = 58;
const HEADER_COLLAPSED = 52;
// Design.md Component B: 8pt gutters for dense media/discovery surfaces.
const GRID_GAP = Space.sm;
// Missing media is not photography and should not dominate discovery like it is.
// Keep the fallback compact while real assets continue to use their API geometry.
const MISSING_MEDIA_HEIGHT_RATIO = 0.78;
const POSTER_CARD_WIDTH = 76;
const POSTER_CARD_HEIGHT = 135;
const LISTING_CARD_CHROME_HEIGHT = 110;
const SCREEN_WIDTH = Dimensions.get('window').width;

// Skeleton variation communicates loading without inventing media geometry.
const SKELETON_HEIGHT_RATIOS = [1.25, 1.08, 1.32, 1.16] as const;

// P0-3: FlashList virtualizes the home feed so memory does not grow with feed
// length. FlashList v2 measures items automatically, so per-item heights do
// not need to be declared. `onEndReached` is a native FlashList prop (no `as
// any` cast onto ScrollView). The animated wrapper lets Reanimated's scroll
// handler drive the floating header collapse/expand.
// On web: use plain FlashList (Reanimated 4.x crashes with createAnimatedComponent
// on web — issue #9266). LIST_RENDERING_POLICY.md §2.5 web fallback.
const AnimatedFlashList: any = Platform.OS === 'web'
  ? FlashList
  : Reanimated.createAnimatedComponent(FlashList) as unknown as React.ComponentClass<
      React.ComponentProps<typeof FlashList<FeedDataItem>> & { ref?: React.Ref<any> }
    >;

/**
 * Feed data union: Home discovery card VMs (listing tiles) or looks rail
 * markers. The FlashList renders both through the same masonry path.
 * The `type` field discriminates the two variants — VMs do not carry it.
 * Posters rail renders in the ListHeaderComponent (above the grid) so it
 * is visible in the first viewport — aligned with Instagram/Pinterest 2026
 * story-tray placement.
 */

/**
 * Look feed marker — an authored interruption rail of Looks interspersed
 * into the product grid based on real content semantics (not a flat list).
 * Carries the resolved Look thumbnails so the FlashList can render the rail
 * inline without re-fetching.
 */
interface LookFeedMarker {
  id: string;
  type: 'looks';
  looks: Array<{
    id: string;
    mediaUri: string;
    title?: string;
    sellerUsername?: string;
    sellerAvatar?: string;
    taggedCount?: number;
  }>;
}

type FeedDataItem = HomeDiscoveryItemVM | LookFeedMarker;

function isLookMarker(item: FeedDataItem): item is LookFeedMarker {
  return (item as LookFeedMarker).type === 'looks';
}

const PosterStoryArtwork = React.memo(function PosterStoryArtwork({ story }: { story: PosterStory }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const firstFrame = story.frames[0];
  const composition = React.useMemo<CreatorDocument | null>(() => {
    if (!story.compositionDocument) return null;
    const result = safeValidateDocument(story.compositionDocument);
    return result.success && result.data?.type === 'poster' ? result.data : null;
  }, [story.compositionDocument]);
  const compositionPage = composition?.pages[0] ?? null;

  if (composition && compositionPage) {
    return (
      <CreatorCanvas
        document={composition}
        page={compositionPage}
        canvasWidth={POSTER_CARD_WIDTH}
        canvasHeight={POSTER_CARD_HEIGHT}
        mode="preview"
      />
    );
  }

  if (isVideoUri(firstFrame?.mediaUrl ?? '')) {
    return (
      <Video
        source={{ uri: firstFrame.mediaUrl }}
        style={styles.posterImage}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isLooping
        isMuted
      />
    );
  }

  if (firstFrame?.mediaUrl) {
    return <CachedImage uri={firstFrame.mediaUrl} style={styles.posterImage} contentFit="cover" />;
  }

  // Quiet text-only Poster preview — no decorative sparkle/orb. The caption
  // is the artwork when no media is available (audit: anti-AI art direction).
  const backgroundColor = firstFrame?.backgroundColor ?? colors.surfaceAlt;
  return (
    <View style={[styles.posterTextArtwork, { backgroundColor }]}>
      <Text style={styles.posterTextArtworkCopy} numberOfLines={5}>
        {firstFrame?.caption || 'Poster'}
      </Text>
    </View>
  );
});

export default function HomeScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const notificationCount = useStore((state) => state.notificationCount);
  const { formatFromFiat } = useFormattedPrice();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();
  const { spring } = useMotionConfig();
  const { listings, source, isSyncing, lastError, refreshListings, loadMoreListings, hasMore, isLoadingMore } = useBackendData();
  const followingFeed = useFollowingFeed();
  const forYouFeed = useForYouFeed();
  const { isOffline } = useConnectivity();

  const [refreshing, setRefreshing] = React.useState(false);
  const [peekItem, setPeekItem] = React.useState<HomeDiscoveryItemVM | null>(null);
  const [newListingIds, setNewListingIds] = React.useState<Set<string>>(() => new Set());
  const [feedMode, setFeedMode] = React.useState<'foryou' | 'following'>('foryou');

  // Viewability-driven video autoplay: only the most-visible feed tile plays
  // its video. Settlement delay (350ms) avoids spinning up players during fast
  // scrolling. Offscreen items pause immediately, releasing decode resources
  // (AGENTS.md §16, §27.8 — one active player across the surface).
  const {
    activeIndex: activePlaybackIndex,
    viewabilityConfig: playbackViewabilityConfig,
    onViewableItemsChanged: onPlaybackViewableItemsChanged,
    reset: resetPlayback,
  } = useViewabilityPlayback(350);

  const scrollY = useSharedValue(0);
  const lastScrollY = useSharedValue(0);
  // Crossfade opacity for feed content on tab switch (120ms = Motion.duration.fast).
  const feedOpacity = useSharedValue(1);
  const { tabBarVisible } = useTabScroll();
  const scrollRef = React.useRef<any>(null);
  const knownListingIdsRef = React.useRef<Set<string>>(new Set());
  const seededKnownListingIdsRef = React.useRef(false);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

      // Spring the header towards the scroll-derived target height. The spring
      // is triggered from the scroll worklet so a new animation is only created
      // when the target actually changes — Reanimated coalesces concurrent
      // springs on the same shared value, so this remains performant.
      const targetHeight = interpolate(
        e.contentOffset.y,
        [0, 120],
        [headerExpandedHeight, headerCollapsedHeight],
        Extrapolation.CLAMP,
      );
      headerHeightSV.value = withSpring(targetHeight, spring.entrance);

      if (e.contentOffset.y > lastScrollY.value + 5 && e.contentOffset.y > 80) {
        tabBarVisible.value = false;
      } else if (e.contentOffset.y < lastScrollY.value - 5 || e.contentOffset.y <= 0) {
        tabBarVisible.value = true;
      }

      lastScrollY.value = e.contentOffset.y;
    },
  });

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

  const headerHeightStyle = useAnimatedStyle(() => {
    return { height: headerHeightSV.value };
  });

  const headerTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 70], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 90], [0, -10], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const headerShadowStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(scrollY.value, [0, 60], [0, 0.12], Extrapolation.CLAMP);
    const shadowRadius = interpolate(scrollY.value, [0, 60], [0, 12], Extrapolation.CLAMP);
    return {
      shadowOpacity,
      shadowRadius,
      elevation: interpolate(scrollY.value, [0, 60], [0, 6], Extrapolation.CLAMP),
    };
  });

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
    setPostersLoading(true);
    fetchPosterStories({ active: true, limit: 20 })
      .then((res) => setRealPosters(res.items))
      .catch(() => {})
      .finally(() => setPostersLoading(false));
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

  React.useEffect(() => {
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
          taggedCount: l.tags?.length ?? 0,
        }));
        setFeedLooks(lookItems);
      })
      .catch(() => { /* silent fail — looks are optional enrichment */ });
    return () => { mounted = false; };
  }, []);

  const feedStatus = React.useMemo(
    () =>
      getBackendSyncStatus({
        isSyncing,
        source,
        hasError: Boolean(lastError),
      }),
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
  // "Pinterest with prices". Identity synthesis follows doc 46 precedence.
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

  const exploreData = React.useMemo<HomeDiscoveryItemVM[]>(() => {
    return listings.map((listing, index) =>
      toHomeDiscoveryItemVM(listing, {
        isSaved: wishlist.includes(listing.id),
        currency: 'GBP',
        followedSellerIds: followedSellerIdsSet,
      }),
    ).map((vm, index) => ({
      ...vm,
      featured: computeFeatured(index),
    }));
  }, [listings, wishlist, followedSellerIdsSet, computeFeatured]);

  // Following feed: transform following listings into discovery VMs
  const followingExploreData = React.useMemo<HomeDiscoveryItemVM[]>(() => {
    return followingFeed.listings.map((listing) =>
      toHomeDiscoveryItemVM(listing, {
        isSaved: wishlist.includes(listing.id),
        currency: 'GBP',
        followedSellerIds: followedSellerIdsSet,
      }),
    ).map((vm, index) => ({
      ...vm,
      featured: computeFeatured(index),
    }));
  }, [followingFeed.listings, wishlist, followedSellerIdsSet, computeFeatured]);

  // For You feed: transform personalised recommendations into discovery VMs
  const forYouExploreData = React.useMemo<HomeDiscoveryItemVM[]>(() => {
    return forYouFeed.listings.map((listing) =>
      toHomeDiscoveryItemVM(listing, {
        isSaved: wishlist.includes(listing.id),
        currency: 'GBP',
        followedSellerIds: followedSellerIdsSet,
      }),
    ).map((vm, index) => ({
      ...vm,
      featured: computeFeatured(index),
    }));
  }, [forYouFeed.listings, wishlist, followedSellerIdsSet, computeFeatured]);

  // For You mode uses personalised recommendations; fall back to all listings
  // when the recommendation feed is empty or errored with no cached results.
  const effectiveForYouData = forYouFeed.listings.length > 0 ? forYouExploreData : exploreData;

  const activeFeedData = feedMode === 'following' ? followingExploreData : effectiveForYouData;
  const showFollowingLoading = feedMode === 'following' && followingFeed.isLoading && !followingFeed.isRefreshing;
  const showFollowingRefreshing = feedMode === 'following' && followingFeed.isRefreshing;
  const showForYouLoading = feedMode === 'foryou' && forYouFeed.isLoading && !forYouFeed.isRefreshing && forYouFeed.listings.length === 0;

  // Posters rail injected into the feed after 4 items (2 rows in 2-column
  // grid) so the first viewport shows header + tabs + media — nothing else.
  // Posters rail renders in the ListHeaderComponent (above the grid) so it
  // is visible in the first viewport — aligned with Instagram/Pinterest 2026
  // story-tray placement. The rail is a compact horizontal scroll that does
  // not displace the first media row significantly.
  // Looks rail injected as a full-span item further down the feed to create
  // an authored interruption (~6 rows of products) so the feed reads as
  // curated rhythm rather than a flat product list.
  const LOOKS_INJECT_INDEX = 12;
  const hasPosters = !postersLoading && realPosters.length > 0;
  const feedGridData = React.useMemo<FeedDataItem[]>(() => {
    if (showFeedLoadingSkeleton || showFollowingLoading || showForYouLoading) return [];
    if (activeFeedData.length === 0) return [];
    const result: FeedDataItem[] = [...activeFeedData];
    // Looks rail — inject as an authored interruption further down the feed.
    if (feedLooks.length > 0 && result.length > LOOKS_INJECT_INDEX) {
      result.splice(LOOKS_INJECT_INDEX, 0, {
        id: 'feed-looks-rail',
        type: 'looks',
        looks: feedLooks,
      } as LookFeedMarker);
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
      duration: reducedMotionEnabled ? 0 : Motion.duration.fast,
    });
    // Reset viewability playback when the feed content swaps so a stale
    // activeIndex does not cause a now-offscreen video to keep playing.
    resetPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedMode]);

  const feedOpacityStyle = useAnimatedStyle(() => ({
    opacity: feedOpacity.value,
  }));

  const closePeek = React.useCallback(() => {
    setPeekItem(null);
  }, []);

  const renderPosters = React.useCallback(() => {
    if (postersLoading) {
      return (
        <View style={styles.postersSection}>
          <HorizontalRail contentContainerStyle={styles.postersScroll}>
            {Array.from({ length: 4 }).map((_, index) => (
              <PremiumSkeletonTile
                key={`poster-skeleton-${index}`}
                width={POSTER_CARD_WIDTH}
                height={POSTER_CARD_HEIGHT}
                borderRadius={RadiusRoleValue.mediaThumbnail}
              />
            ))}
          </HorizontalRail>
        </View>
      );
    }

    if (realPosters.length === 0) return null;

    return (
      <View style={styles.postersSection}>
        <HorizontalRail
          contentContainerStyle={styles.postersScroll}
        >
          {(() => {
            // Sort stories: unwatched-first, then watched
            const sortedPosters = [...realPosters].sort((a, b) => {
              if (a.seenByViewer === b.seenByViewer) return 0;
              return a.seenByViewer ? 1 : -1;
            });
            const unwatchedCount = realPosters.filter((s) => !s.seenByViewer).length;
            return sortedPosters.map((story, idx) => {
            const isUnwatched = !story.seenByViewer;
            // Show unwatched badge on the first unwatched story
            const showUnwatchedBadge = isUnwatched && idx === 0 && unwatchedCount > 1;
            return (
            <AnimatedPressable
              key={story.id}
              style={styles.posterCard}
              onPress={() => { haptic.light(); navigation.navigate('PosterViewer', { storyId: story.id }); }}
              accessibilityRole="button"
              accessibilityLabel={`Open poster story by @${story.creator.username ?? story.creatorId}${isUnwatched ? ', new' : ''}`}
              accessibilityHint="Opens poster story viewer"
            >
              {isUnwatched ? (
                <LinearGradient
                  colors={[colors.brand, colors.discovery]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.posterTileGradientRing}
                >
                  <View style={styles.posterTileInner}>
                    <PosterStoryArtwork story={story} />
                    <View style={styles.posterShade} />

                    <View style={styles.posterCreatorOverlay}>
                      <Text style={styles.posterCreatorName} numberOfLines={1}>
                        @{story.creator.username ?? story.creatorId}
                      </Text>
                      <View
                        style={styles.posterFreshDot}
                        accessible={false}
                      />
                    </View>

                    {story.totalFrameCount > 1 && (
                      <View style={styles.frameCountBadge} accessible={false}>
                        <Ionicons name="layers" size={10} color={colors.textInverse} />
                        <Text style={styles.frameCountBadgeText}>{story.totalFrameCount}</Text>
                      </View>
                    )}

                    {showUnwatchedBadge && (
                      <View style={styles.unwatchedBadge} accessible={false}>
                        <Text style={styles.unwatchedBadgeText}>{unwatchedCount} new</Text>
                      </View>
                    )}
                  </View>
                </LinearGradient>
              ) : (
                <View style={[styles.posterTile, styles.posterTileSeen]}>
                  <PosterStoryArtwork story={story} />
                  <View style={styles.posterShade} />

                  <View style={styles.posterCreatorOverlay}>
                    <Text style={styles.posterCreatorName} numberOfLines={1}>
                      @{story.creator.username ?? story.creatorId}
                    </Text>
                    <View
                      style={styles.posterSeenDot}
                      accessible={false}
                    />
                  </View>

                  {story.totalFrameCount > 1 && (
                    <View style={styles.frameCountBadge} accessible={false}>
                      <Ionicons name="layers" size={10} color={colors.textInverse} />
                      <Text style={styles.frameCountBadgeText}>{story.totalFrameCount}</Text>
                    </View>
                  )}
                </View>
              )}
            </AnimatedPressable>
            );
            });
          })()}
        </HorizontalRail>

      </View>
    );
  }, [postersLoading, realPosters, colors, haptic, navigation]);

  const renderNewListingsBanner = () => {
    if (newListingIds.size === 0) {
      return null;
    }

    return (
      <View style={styles.newListingsBannerWrap}>
        <AppButton
          title={`${newListingIds.size} new ${newListingIds.size === 1 ? 'drop' : 'drops'} ready`}
          variant="primary"
          size="sm"
          align="center"
          style={styles.newListingsBanner}
          contentStyle={styles.newListingsBannerContent}
          titleStyle={styles.newListingsBannerText}
          icon={<Ionicons name="arrow-up-circle-outline" size={14} color={colors.background} />}
          trailingIcon={<Ionicons name="chevron-up" size={14} color={colors.background} />}
          iconContainerStyle={styles.newListingsBannerIconWrap}
          trailingIconContainerStyle={styles.newListingsBannerIconWrap}
          hapticFeedback="selection"
          onPress={acknowledgeNewListings}
          accessibilityLabel="Jump to new listings"
          accessibilityHint="Scrolls feed focus to newly added listings"
          accessibilityRole="button"
        />
      </View>
    );
  };

  const renderExploreLoadingState = () => (
    <View style={styles.exploreLoadingGrid}>
      <View style={styles.exploreLoadingColumn}>
        {Array.from({ length: 4 }).map((_, index) => {
          const ratio = SKELETON_HEIGHT_RATIOS[index % SKELETON_HEIGHT_RATIOS.length];
          return (
            <View key={`feed_loading_left_${index}`} style={styles.skeletonTileWrap}>
              <PremiumSkeletonTile width="100%" height={Math.round(gridTileWidth * ratio)} borderRadius={RadiusRoleValue.mediaThumbnail} />
              {/* Identity line skeleton — matches the 14sp identity text height */}
              <PremiumSkeletonTile width="80%" height={14} borderRadius={RadiusRoleValue.compactControl} />
              {/* Price line skeleton — matches the 15sp semibold price height */}
              <PremiumSkeletonTile width="45%" height={16} borderRadius={RadiusRoleValue.compactControl} />
            </View>
          );
        })}
      </View>
      <View style={styles.exploreLoadingColumn}>
        {Array.from({ length: 4 }).map((_, index) => {
          const ratio = SKELETON_HEIGHT_RATIOS[(index + 2) % SKELETON_HEIGHT_RATIOS.length];
          return (
            <View key={`feed_loading_right_${index}`} style={styles.skeletonTileWrap}>
              <PremiumSkeletonTile width="100%" height={Math.round(gridTileWidth * ratio)} borderRadius={RadiusRoleValue.mediaThumbnail} />
              <PremiumSkeletonTile width="70%" height={14} borderRadius={RadiusRoleValue.compactControl} />
              <PremiumSkeletonTile width="50%" height={16} borderRadius={RadiusRoleValue.compactControl} />
            </View>
          );
        })}
      </View>
    </View>
  );

  const handleTilePress = React.useCallback((routeId: string | undefined) => {
    if (!routeId) return;
    haptic.selection();
    ProductAnalytics.itemView(routeId);
    navigation.push('ItemDetail', { itemId: routeId });
  }, [navigation, haptic]);

  const handleTileLongPress = React.useCallback((item: HomeDiscoveryItemVM) => {
    haptic.medium(); // ELEVATED: Medium haptic for long press
    setPeekItem(item);
  }, [haptic]);

  // FlashList v2 performance: getItemType for heterogeneous row recycling.
  // FeedDataItem has two variants: 'listing' (discovery VM) and 'posters'
  // (rail marker). FlashList recycles cells of the same type, avoiding
  // layout thrash when switching between item geometries.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.2)
  const getItemType = React.useCallback(
    (item: FeedDataItem) => (isLookMarker(item) ? 'looks' : 'listing'),
    [],
  );

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible items on every parent state change (e.g. feed mode switch,
  // wishlist toggle). Inline arrow functions are recreated every render.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderFeedItem = React.useCallback(
    ({ item, index }: { item: FeedDataItem; index: number }) => {
      // Looks rail — authored interruption of Look thumbnails
      if (isLookMarker(item)) {
        return (
          <View style={[styles.flashListItem, { width: SCREEN_WIDTH }]}>
            <View style={{ paddingHorizontal: Space.md, paddingVertical: Space.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Space.xs }}>
                <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textPrimary }}>
                  Looks to shop
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Space.sm }}>
                {item.looks.map((look) => (
                  <Pressable
                    key={look.id}
                    onPress={() => { haptic.light(); navigation.navigate('LookDetail', { lookId: look.id }); }}
                    style={{ width: 120, borderRadius: Radius.lg, overflow: 'hidden' }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open Look${look.title ? ` ${look.title}` : ''}${look.taggedCount ? `, ${look.taggedCount} tagged items` : ''}`}
                    accessibilityHint="Opens Look details"
                  >
                    <CachedImage
                      uri={look.mediaUri}
                      style={{ width: 120, height: 160 }}
                      contentFit="cover"
                      downscaleWidth={120}
                    />
                    {look.taggedCount && look.taggedCount > 0 ? (
                      <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: colors.overlay, borderRadius: Radius.md, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: colors.scrimTextPrimary, fontSize: 10, fontFamily: Typography.family.semibold }}>
                          {look.taggedCount} items
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        );
      }
      // item is HomeDiscoveryItemVM here (posters rail handled above)
      // Featured tiles span both columns — pass the full row width so the
      // media and identity/price scale up for the editorial rhythm break.
      const tileWidth = item.featured
        ? Math.floor(windowWidth - Space.sm * 2)
        : gridTileWidth;
      return (
        <View style={styles.flashListItem}>
          <HomeDiscoveryCard
            item={item}
            tileWidth={tileWidth}
            formatPrice={formatFromFiat}
            onPress={handleTilePress}
            onLongPress={handleTileLongPress}
            shouldPlay={activePlaybackIndex === index}
          />
        </View>
      );
    },
    [
      gridTileWidth,
      windowWidth,
      formatFromFiat,
      handleTilePress,
      handleTileLongPress,
      activePlaybackIndex,
      renderPosters,
      colors,
      haptic,
      navigation,
    ],
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <Reanimated.View style={[styles.floatingHeaderShell, headerHeightStyle, headerShadowStyle]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />

        <View style={[styles.headerForeground, { paddingTop: insets.top + 2, paddingBottom: 8 }]}>
          <Reanimated.View style={[headerTitleStyle, styles.headerTitleWrap]}>
            <Text style={styles.brandTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Thryftverse</Text>
          </Reanimated.View>

          <View style={styles.headerRight}>
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={() => navigation.navigate('Sell')}
              accessibilityLabel="List an item"
              accessibilityRole="button"
              accessibilityHint="Opens sell listing flow"
            >
              <Ionicons name="add" size={24} color={colors.textPrimary} />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={() => navigation.navigate('GlobalSearch')}
              accessibilityLabel="Search listings"
              accessibilityRole="button"
              accessibilityHint="Opens global search"
            >
              <Ionicons name="search" size={22} color={colors.textPrimary} />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={() => navigation.navigate('NotificationsList')}
              accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications'}
              accessibilityRole="button"
              accessibilityHint="Opens notifications center"
            >
              <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
              {notificationCount > 0 && (
                <View style={styles.notificationBadge} pointerEvents="none" accessible={false}>
                  <Text style={styles.notificationBadgeText}>
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </Text>
                </View>
              )}
            </AnimatedPressable>
          </View>
        </View>
      </Reanimated.View>

      <Reanimated.View style={[styles.feedShell, feedOpacityStyle]}>
      <AnimatedFlashList
        ref={scrollRef}
        data={feedGridData}
        masonry
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.feedContent, { paddingTop: headerExpandedHeight + Space.sm }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        viewabilityConfig={playbackViewabilityConfig}
        onViewableItemsChanged={onPlaybackViewableItemsChanged}
        onEndReached={() => {
          if (hasMore && !isLoadingMore) void loadMoreListings();
        }}
        onEndReachedThreshold={0.5}
        keyExtractor={(item: FeedDataItem) => item.id}
        getItemType={getItemType}
        renderItem={renderFeedItem}
        overrideItemLayout={(layout: { span?: number }, item: FeedDataItem) => {
          // Featured tiles and looks rail span both columns
          if (isLookMarker(item)) {
            layout.span = 2;
          } else {
            layout.span = item.featured ? 2 : 1;
          }
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.feedTabBar} accessibilityRole="tablist">
              {(['foryou', 'following'] as const).map((option) => {
                const isSelected = feedMode === option;
                const label = option === 'foryou' ? 'For you' : 'Following';
                return (
                  <AnimatedPressable
                    key={option}
                    style={styles.feedTab}
                    onPress={() => {
                      if (!isSelected) {
                        haptic.selection();
                        setFeedMode(option);
                      }
                    }}
                    accessibilityRole="tab"
                    accessibilityLabel={option === 'foryou'
                      ? 'For you feed'
                      : `Following feed${followingFeed.listings.length > 0 ? `, ${followingFeed.listings.length} listings` : ''}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.feedTabLabel, isSelected && styles.feedTabLabelActive]} numberOfLines={1}>
                      {label}
                    </Text>
                    {option === 'following' && followingFeed.listings.length > 0 ? (
                      <Text style={[styles.feedTabCount, isSelected && styles.feedTabCountActive]}>
                        {followingFeed.listings.length}
                      </Text>
                    ) : null}
                    {isSelected ? <View style={styles.feedTabIndicator} /> : null}
                  </AnimatedPressable>
                );
              })}
            </View>

            {/* Search prompt — compact tappable field that communicates
                marketplace discoverability in the first viewport. Grailed's
                #1 discovery finding: users didn't know how to search. A
                prominent search affordance is the single highest-impact
                first-viewport signal for a commerce app. Hairline-bordered
                (not filled) so it reads as the one functional panel, not
                decorative chrome. */}
            <Pressable
              style={styles.searchPrompt}
              onPress={() => navigation.navigate('GlobalSearch')}
              accessibilityRole="search"
              accessibilityLabel="Search drops, brands, sellers"
              accessibilityHint="Opens global search"
            >
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <Text style={styles.searchPromptText} numberOfLines={1}>
                Search drops, brands, sellers
              </Text>
            </Pressable>

            {hasPosters ? renderPosters() : null}

            {renderNewListingsBanner()}

            {lastError ? (
              <SyncRetryBanner
                message="Sync is unavailable. Showing cached items."
                onRetry={() => void handleRefresh()}
                isRetrying={isSyncing || refreshing}
                telemetryContext="home_feed_sync"
                containerStyle={styles.feedStatusBanner}
              />
            ) : null}

            {isOffline && feedGridData.length > 0 ? (
              <OfflineBanner onRetry={() => void handleRefresh()} />
            ) : null}

            {showFeedLoadingSkeleton || showFollowingLoading || showForYouLoading ? (
              renderExploreLoadingState()
            ) : feedGridData.length === 0 ? (
              feedMode === 'following' ? (
                <View style={{ flex: 1 }}>
                  <EmptyState
                    density="compact"
                    icon={followingFeed.hasFollowing ? 'pricetag-outline' : 'people-outline'}
                    title={followingFeed.hasFollowing ? 'No new drops yet' : 'Follow sellers to see their drops'}
                    subtitle={followingFeed.hasFollowing
                      ? 'Pull to refresh.'
                      : 'Tap follow on seller profiles to build your feed.'
                    }
                    ctaLabel={followingFeed.hasFollowing ? 'Refresh' : 'Discover sellers'}
                    onCtaPress={followingFeed.hasFollowing ? () => void handleRefresh() : () => navigation.navigate('Browse', { categoryId: 'all', title: 'Explore' })}
                    secondaryCtaLabel={followingFeed.hasFollowing ? 'Browse all' : undefined}
                    onSecondaryCtaPress={followingFeed.hasFollowing ? () => navigation.navigate('Browse', { categoryId: 'all', title: 'Explore' }) : undefined}
                  />
                </View>
              ) : (
                // Premium empty state — backend returned zero items and we are not
                // loading. Preserves the flagship layout instead of collapsing to
                // a blank masonry. Distinct from the sync-error banner above.
                <View style={{ flex: 1 }}>
                  <EmptyState
                    density="compact"
                    icon="cube-outline"
                    title="No drops live yet"
                    subtitle="Pull to refresh or browse categories."
                    ctaLabel="Browse all"
                    onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Explore' })}
                    secondaryCtaLabel="Refresh"
                    onSecondaryCtaPress={() => void handleRefresh()}
                  />
                </View>
              )
            ) : null}
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={{ paddingVertical: Space.md, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Loading more...</Text>
            </View>
          ) : !hasMore && feedGridData.length > 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: Space.lg, gap: Space.sm }}>
              <View style={{ width: 40, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: Typography.family.regular }}>
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
      />
      </Reanimated.View>

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
                <Text style={styles.peekTitle} numberOfLines={1}>{peekItem.identity.primary}</Text>

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
                        navigation.push('ItemDetail', { itemId: peekItem.routeId });
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
    backgroundColor: colors.background,
  },
  feedShell: {
    flex: 1,
  },
  floatingHeaderShell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  headerForeground: {
    flex: 1,
    paddingHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: Space.sm,
  },
  // Brand title: subtitle token (17/24/600) — lighter header chrome per AGENTS.md §4.
  brandTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 2,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: Stroke.standard,
    borderColor: colors.background,
  },
  notificationBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    lineHeight: 12,
    fontVariant: ['tabular-nums'],
  },
  feedContent: {
    paddingBottom: 120,
  },
  feedTabBar: {
    minHeight: 44,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  feedTab: {
    minWidth: 76,
    minHeight: 44,
    paddingHorizontal: Space.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + Space.xxs,
    position: 'relative',
  },
  feedTabLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
    color: colors.textMuted,
  },
  feedTabLabelActive: {
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
  },
  feedTabCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: TypographyV2.meta.size,
    lineHeight: 20,
    fontFamily: FontFamily.semibold,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceAlt,
    fontVariant: ['tabular-nums'],
  },
  feedTabCountActive: {
    color: colors.textInverse,
    backgroundColor: colors.textPrimary,
  },
  feedTabIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: colors.textPrimary,
  },
  // Search prompt: compact hairline-bordered field. One functional panel
  // above the fold (AGENTS.md §4 surface budget). 44pt touch target,
  // hairline border (not filled) so it defers to media below.
  searchPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    height: 44,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  searchPromptText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    color: colors.textMuted,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  newListingsBannerWrap: {
    marginTop: Space.xs,
    marginBottom: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
  },
  newListingsBanner: {
    alignSelf: 'center',
    minHeight: 40,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: colors.brand,
    borderWidth: 0,
  },
  newListingsBannerContent: {
    gap: Space.xs - Space.xxs,
  },
  newListingsBannerIconWrap: {
    width: 16,
    height: 16,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'transparent',
  },
  newListingsBannerText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    color: colors.background,
    letterSpacing: 0.2,
  },

  postersSection: {
    marginTop: 0,
    paddingBottom: Space.sm,
  },
  postersScroll: {
    paddingHorizontal: Space.md,
    paddingBottom: 2,
    gap: Space.sm,
  },
  feedStatusBanner: {
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.xxs,
  },
  posterCard: {
    width: POSTER_CARD_WIDTH,
  },
  posterTile: {
    width: POSTER_CARD_WIDTH,
    height: POSTER_CARD_HEIGHT,
    borderRadius: RadiusRoleValue.sheetDialog,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
  },
  // Gradient ring for unwatched stories — Instagram-style gradient border
  // using brand + discovery accent colors. 2pt padding creates the ring
  // thickness (Stroke.emphasis = 2, reserved for focus/selection per
  // AGENTS.md §4 stroke grammar). The inner tile clips artwork to the
  // sheetDialog radius while the outer gradient uses sheetDialog + 2.
  posterTileGradientRing: {
    width: POSTER_CARD_WIDTH,
    height: POSTER_CARD_HEIGHT,
    borderRadius: RadiusRoleValue.sheetDialog + Stroke.emphasis,
    padding: Stroke.emphasis,
  },
  posterTileInner: {
    flex: 1,
    borderRadius: RadiusRoleValue.sheetDialog,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
  },
  posterTileSeen: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterTextArtwork: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
    gap: Space.xs,
  },
  posterTextArtworkCopy: {
    color: colors.textInverse,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  posterShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  posterAvatarOverlay: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.textInverse,
    ...Elevation.floating,
  },
  posterAvatarOverlayWrap: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
  },
  posterAvatarOverlayImage: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.full,
  },
  posterTopRow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  posterOwnerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: Radius.lg,
    flex: 1,
    gap: 4,
  },
  posterOwnerAvatarWrap: {
    width: 14,
    height: 14,
    borderRadius: Radius.full,
  },
  posterOwnerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.full,
  },
  posterOwnerName: {
    color: colors.textInverse,
    fontSize: 8,
    fontFamily: FontFamily.medium,
    flex: 1,
  },
  posterExpiryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.overlay,
    borderRadius: Radius.lg,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  posterExpiryText: {
    color: colors.textInverse,
    fontSize: 9,
    fontFamily: FontFamily.bold,
  },
  posterBottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: colors.overlay,
  },
  posterCaption: {
    color: colors.textInverse,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: FontFamily.medium,
  },
  posterCreatorOverlay: {
    position: 'absolute',
    left: 5,
    right: 5,
    bottom: 5,
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    borderRadius: RadiusRoleValue.compactControl,
    backgroundColor: colors.overlay,
  },
  posterCreatorName: {
    flex: 1,
    color: colors.textInverse,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: FontFamily.semibold,
  },
  frameCountBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.overlay,
    borderRadius: Radius.md,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  frameCountBadgeText: {
    color: colors.textInverse,
    fontSize: 9,
    fontFamily: FontFamily.bold,
  },
  unwatchedBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: colors.brand,
    borderRadius: Radius.md,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unwatchedBadgeText: {
    color: colors.textInverse,
    fontSize: 9,
    fontFamily: FontFamily.bold,
  },
  posterFreshDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
  },
  posterSeenDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: colors.border,
  },

  flashListItem: {
    paddingHorizontal: Space.xs,
    paddingBottom: GRID_GAP,
  },
  exploreLoadingGrid: {
    flexDirection: 'row',
    paddingHorizontal: Space.xs,
    gap: Space.sm,
  },
  exploreLoadingColumn: {
    flex: 1,
    gap: Space.sm,
  },
  // Skeleton tile wrapper: media-only silhouette matching the reduced tile.
  skeletonTileWrap: {
    gap: Space.xs,
  },

  peekBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  peekCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: RadiusRoleValue.standalonePanel,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  peekMediaWrap: {
    width: '100%',
    height: 340,
    backgroundColor: colors.surfaceAlt,
  },
  peekMedia: {
    width: '100%',
    height: '100%',
  },
  peekMeta: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  peekTitle: {
    fontSize: 19,
    fontFamily: FontFamily.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  peekActionsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  peekGhostBtn: {
    flex: 1,
    height: 44,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'transparent',
  },
  peekGhostText: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
  },
  peekPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'transparent',
  },
  peekPrimaryIconWrap: {
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
  },
  peekPrimaryText: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: colors.background,
  },
});
