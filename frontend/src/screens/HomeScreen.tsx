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
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeInDown,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Video, ResizeMode } from '../components/compat/Video';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

// Typography simplified - using direct font names
import { fetchPosterStories } from '../services/postersApi';
import type { PosterStory } from '../services/postersApi';
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
import { EmptyState } from '../components/EmptyState';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { MasonryGrid, ProductCardV2 } from '../components/ProductCardV2';
import { DoubleTapHeart } from '../components/DoubleTapHeart';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { isVideoUri, getCategoryFocalPoint } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { Space, FontFamily, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { T } from '../components/ui/Text';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
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
      React.ComponentProps<typeof FlashList<ExploreTile>> & { ref?: React.Ref<any> }
    >;

type StoryStatus = 'new-listing' | 'live-auction' | 'co-own-launching' | 'sold-recently';

const STORY_STATUS_LABEL: Record<StoryStatus, string> = {
  'new-listing': 'new listing',
  'live-auction': 'auction',
  'co-own-launching': 'co-own launch',
  'sold-recently': 'sold recently',
};

// Trend clips removed — demo-only content, not real data

type ExploreTile = {
  id: string;
  type: 'listing' | 'clip';
  mediaType: 'image' | 'video';
  mediaUri: string;
  posterUri?: string;
  likes: number;
  routeId?: string;
  sellerId?: string;
  price?: number;
  caption: string;
  category?: string;
  aspectRatio: number;
  isSaved?: boolean;
  /** When true, this tile spans both columns as a wider editorial card.
   *  Per spec 11: asymmetric rhythm — 6-12 normal tiles, one larger
   *  featured unit, continue feed. Breaks the uniform grid silhouette. */
  featured?: boolean;
};

type StoryBubble = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  posterId?: string;
  isNew: boolean;
  status: StoryStatus;
  isSaved?: boolean;
};

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

function ListingMediaPlaceholder({ category }: { category?: string }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const normalized = category?.toLowerCase() ?? '';
  const icon: React.ComponentProps<typeof Ionicons>['name'] = normalized.includes('shoe')
    ? 'footsteps-outline'
    : normalized.includes('bag')
      ? 'bag-handle-outline'
      : normalized.includes('jewel') || normalized.includes('watch')
        ? 'diamond-outline'
        : 'shirt-outline';

  // Neutral fallback art — flat canvas + category icon, no decorative orbs
  // or gradients (audit §01: anti-AI art direction; fallback art made neutral).
  // Uses the same quiet surface tokens as the rest of the feed so a missing
  // image recedes rather than becoming a decorative element.
  // No icon circle — the glyph sits directly on the flat canvas (anti-AI:
  // icon circles with no state/function reason).
  return (
    <View
      style={styles.listingMediaPlaceholder}
      accessibilityLabel="Product image unavailable"
      accessibilityRole="image"
    >
      <Ionicons name={icon} size={32} color={colors.textMuted} />
    </View>
  );
}

interface ExploreGridItemProps {
  item: ExploreTile;
  tileWidth: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatPrice: (...args: any[]) => string;
  onPress: (routeId: string | undefined) => void;
  onLongPress: (item: ExploreTile) => void;
  onPressSellerProfile: (sellerId: string) => void;
  sellerUsername?: string | null;
  sellerAvatar?: string | null;
  /** Viewability-driven playback: only the most-visible video plays. */
  shouldPlay?: boolean;
}

const ExploreGridItem = React.memo(function ExploreGridItem({
  item,
  tileWidth,
  formatPrice,
  onPress,
  onLongPress,
  onPressSellerProfile,
  sellerUsername,
  sellerAvatar,
  shouldPlay = false,
}: ExploreGridItemProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const sharedTag = item.mediaType === 'image' && item.routeId
    ? `image-${item.routeId}-0`
    : undefined;
  const mediaHeight = Math.round(tileWidth * item.aspectRatio);
  const toggleWishlist = useStore((state) => state.toggleWishlist);
  const haptic = useHaptic();

  const handleDoubleTapLike = React.useCallback(() => {
    if (item.routeId) {
      toggleWishlist(item.routeId);
      ProductAnalytics.itemSave(item.routeId);
      haptic.success();
    }
  }, [item.routeId, toggleWishlist, haptic]);

  return (
    <View style={[styles.exploreItemBox, { width: tileWidth }]}>
      <AnimatedPressable
        style={[styles.exploreMediaWrap, { height: mediaHeight }]}
        onPress={() => onPress(item.routeId)}
        onLongPress={() => onLongPress(item)}
        accessibilityLabel={`${item.caption}, ${formatPrice(item.price ?? 0, 'GBP', { displayMode: 'fiat' })}`}
        accessibilityRole="button"
        accessibilityHint="Opens item details. Long press to preview this listing"
      >
        <DoubleTapHeart
          isLiked={item.isSaved || false}
          onLike={handleDoubleTapLike}
        >
          <SharedTransitionView
            style={styles.exploreSharedMedia}
            sharedTransitionTag={sharedTag}
          >
            {item.mediaUri ? (
              <CanonicalMediaPreview
                uri={item.mediaUri}
                posterUri={item.posterUri}
                style={styles.exploreImage}
                shouldPlay={shouldPlay}
                contentFit="cover"
                focalPoint={getCategoryFocalPoint(item.category)}
                isVisible
                showPlayBadge
                downscaleWidth={Math.round(tileWidth)}
              />
            ) : (
              <ListingMediaPlaceholder category={item.category} />
            )}
          </SharedTransitionView>
        </DoubleTapHeart>
      </AnimatedPressable>

      <View style={styles.exploreDetails}>
        <Text style={styles.exploreTitle} numberOfLines={2}>{item.caption}</Text>
        <Text style={styles.explorePrice} numberOfLines={1}>
          {formatPrice(item.price ?? 0, 'GBP', { displayMode: 'fiat' })}
        </Text>
      </View>

      {(sellerUsername || item.sellerId) && (
        <AnimatedPressable
          style={styles.exploreSellerRow}
          onPress={() => item.sellerId && onPressSellerProfile(item.sellerId)}
          accessibilityRole="button"
          accessibilityLabel={sellerUsername ? `Seller: @${sellerUsername}` : 'Open seller profile'}
          accessibilityHint="Opens the seller's profile"
        >
          {sellerAvatar ? (
            <CachedImage
              uri={sellerAvatar}
              style={styles.exploreSellerAvatar}
              contentFit="cover"
              downscaleWidth={64}
            />
          ) : (
            <View style={styles.exploreSellerAvatarFallback}>
              <Ionicons name="person" size={13} color={colors.textMuted} />
            </View>
          )}
          <Text style={styles.exploreSellerText} numberOfLines={1}>
            @{sellerUsername ?? item.sellerId}
          </Text>
        </AnimatedPressable>
      )}
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

  const [refreshing, setRefreshing] = React.useState(false);
  const [peekItem, setPeekItem] = React.useState<ExploreTile | null>(null);
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

  React.useEffect(() => {
    let mounted = true;
    setPostersLoading(true);
    fetchPosterStories({ active: true, limit: 20 })
      .then((res) => {
        if (mounted) setRealPosters(res.items);
      })
      .catch(() => { /* noop */ })
      .finally(() => { if (mounted) setPostersLoading(false); });
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

  const exploreData = React.useMemo<ExploreTile[]>(() => {
    return listings.map((item, index): ExploreTile => {
      const primaryMediaUri = item.images?.[0] ?? '';
      const posterUri = item.images?.find((uri) => !isVideoUri(uri));

      return {
        id: `item_${item.id}`,
        type: 'listing',
        mediaType: isVideoUri(primaryMediaUri) ? 'video' : 'image',
        mediaUri: primaryMediaUri,
        posterUri: isVideoUri(primaryMediaUri) ? posterUri : undefined,
        likes: item.likes,
        price: item.price,
        routeId: item.id,
        sellerId: item.sellerId,
        caption: item.title,
        category: item.subcategory || item.category,
        aspectRatio: primaryMediaUri
          ? resolveListingMediaHeightRatio(item)
          : MISSING_MEDIA_HEIGHT_RATIO,
        isSaved: wishlist.includes(item.id),
        // Asymmetric editorial rhythm: every 8th tile spans both columns
        // as a wider featured card (spec 11: 6-12 normal tiles, one larger
        // unit, continue feed).
        featured: (index + 1) % 8 === 0,
      };
    });
  }, [listings, wishlist]);

  // Following feed: transform following listings into the same ExploreTile shape
  const followingExploreData = React.useMemo<ExploreTile[]>(() => {
    return followingFeed.listings.map((item, index): ExploreTile => {
      const primaryMediaUri = item.images?.[0] ?? '';
      const posterUri = item.images?.find((uri) => !isVideoUri(uri));

      return {
        id: `item_${item.id}`,
        type: 'listing',
        mediaType: isVideoUri(primaryMediaUri) ? 'video' : 'image',
        mediaUri: primaryMediaUri,
        posterUri: isVideoUri(primaryMediaUri) ? posterUri : undefined,
        likes: item.likes,
        price: item.price,
        routeId: item.id,
        sellerId: item.sellerId,
        caption: item.title,
        category: item.subcategory || item.category,
        aspectRatio: primaryMediaUri
          ? resolveListingMediaHeightRatio(item)
          : MISSING_MEDIA_HEIGHT_RATIO,
        isSaved: wishlist.includes(item.id),
        featured: (index + 1) % 8 === 0,
      };
    });
  }, [followingFeed.listings, wishlist]);

  // For You feed: transform personalised recommendations into ExploreTile shape
  const forYouExploreData = React.useMemo<ExploreTile[]>(() => {
    return forYouFeed.listings.map((item, index): ExploreTile => {
      const primaryMediaUri = item.images?.[0] ?? '';
      const posterUri = item.images?.find((uri) => !isVideoUri(uri));

      return {
        id: `item_${item.id}`,
        type: 'listing',
        mediaType: isVideoUri(primaryMediaUri) ? 'video' : 'image',
        mediaUri: primaryMediaUri,
        posterUri: isVideoUri(primaryMediaUri) ? posterUri : undefined,
        likes: item.likes,
        price: item.price,
        routeId: item.id,
        sellerId: item.sellerId,
        caption: item.title,
        category: item.subcategory || item.category,
        aspectRatio: primaryMediaUri
          ? resolveListingMediaHeightRatio(item)
          : MISSING_MEDIA_HEIGHT_RATIO,
        isSaved: wishlist.includes(item.id),
        featured: (index + 1) % 8 === 0,
      };
    });
  }, [forYouFeed.listings, wishlist]);

  // For You mode uses personalised recommendations; fall back to all listings
  // when the recommendation feed is empty or errored with no cached results.
  const effectiveForYouData = forYouFeed.listings.length > 0 ? forYouExploreData : exploreData;
  const effectiveForYouListings = forYouFeed.listings.length > 0 ? forYouFeed.listings : listings;

  const activeFeedData = feedMode === 'following' ? followingExploreData : effectiveForYouData;
  const activeListings = feedMode === 'following' ? followingFeed.listings : effectiveForYouListings;
  const showFollowingLoading = feedMode === 'following' && followingFeed.isLoading && !followingFeed.isRefreshing;
  const showFollowingRefreshing = feedMode === 'following' && followingFeed.isRefreshing;
  const showForYouLoading = feedMode === 'foryou' && forYouFeed.isLoading && !forYouFeed.isRefreshing && forYouFeed.listings.length === 0;
  const feedGridData = (showFeedLoadingSkeleton || showFollowingLoading || showForYouLoading) ? [] : activeFeedData;

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

  const renderPosters = () => {
    if (postersLoading) {
      return (
        <View style={styles.postersSection}>
          <View style={styles.posterSectionHeading}>
            <Text style={styles.posterSectionTitle}>Posters</Text>
          </View>
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
        <View style={styles.posterSectionHeading}>
          <Text style={styles.posterSectionTitle}>Posters</Text>
        </View>

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
              <View style={[styles.posterTile, isUnwatched ? styles.posterTileUnseen : styles.posterTileSeen, isUnwatched && styles.posterTileRing]}>
                <PosterStoryArtwork story={story} />
                <View style={styles.posterShade} />

                <View style={styles.posterCreatorOverlay}>
                  <Text style={styles.posterCreatorName} numberOfLines={1}>
                    @{story.creator.username ?? story.creatorId}
                  </Text>
                  <View
                    style={isUnwatched ? styles.posterFreshDot : styles.posterSeenDot}
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
            </AnimatedPressable>
            );
            });
          })()}
        </HorizontalRail>

      </View>
    );
  };

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
              <PremiumSkeletonTile width="100%" height={Math.round(gridTileWidth * ratio)} borderRadius={RadiusRoleValue.sheetDialog} />
              <View style={styles.skeletonMetaRow}>
                <PremiumSkeletonTile width="70%" height={TypographyV2.meta.lineHeight} borderRadius={RadiusRoleValue.compactControl} />
                <PremiumSkeletonTile width="40%" height={TypographyV2.priceList.lineHeight} borderRadius={RadiusRoleValue.compactControl} />
              </View>
              <View style={styles.skeletonSellerRow}>
                <PremiumSkeletonTile width={24} height={24} borderRadius={RadiusRoleValue.pillAvatar} />
                <PremiumSkeletonTile width="45%" height={TypographyV2.meta.lineHeight} borderRadius={RadiusRoleValue.compactControl} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.exploreLoadingColumn}>
        {Array.from({ length: 4 }).map((_, index) => {
          const ratio = SKELETON_HEIGHT_RATIOS[(index + 2) % SKELETON_HEIGHT_RATIOS.length];
          return (
            <View key={`feed_loading_right_${index}`} style={styles.skeletonTileWrap}>
              <PremiumSkeletonTile width="100%" height={Math.round(gridTileWidth * ratio)} borderRadius={RadiusRoleValue.sheetDialog} />
              <View style={styles.skeletonMetaRow}>
                <PremiumSkeletonTile width="70%" height={TypographyV2.meta.lineHeight} borderRadius={RadiusRoleValue.compactControl} />
                <PremiumSkeletonTile width="40%" height={TypographyV2.priceList.lineHeight} borderRadius={RadiusRoleValue.compactControl} />
              </View>
              <View style={styles.skeletonSellerRow}>
                <PremiumSkeletonTile width={24} height={24} borderRadius={RadiusRoleValue.pillAvatar} />
                <PremiumSkeletonTile width="45%" height={TypographyV2.meta.lineHeight} borderRadius={RadiusRoleValue.compactControl} />
              </View>
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

  const handleTileLongPress = React.useCallback((item: ExploreTile) => {
    haptic.medium(); // ELEVATED: Medium haptic for long press
    setPeekItem(item);
  }, [haptic]);

  const handleSellerProfilePress = React.useCallback((sellerId: string) => {
    haptic.light(); // ELEVATED: Light haptic on seller interaction
    navigation.navigate('UserProfile', { userId: sellerId });
  }, [navigation, haptic]);

  // FlashList v2 performance: getItemType for heterogeneous row recycling.
  // ExploreTile has type 'listing' | 'clip' — FlashList recycles cells of the
  // same type, avoiding layout thrash when switching between item geometries.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.2)
  const getItemType = React.useCallback(
    (item: ExploreTile) => item.type,
    [],
  );

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible items on every parent state change (e.g. feed mode switch,
  // wishlist toggle). Inline arrow functions are recreated every render.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderFeedItem = React.useCallback(
    ({ item, index }: { item: ExploreTile; index: number }) => {
      const listing = activeListings.find((l) => l.id === item.routeId);
      // Featured tiles span both columns — pass the full row width so the
      // media and overlay scale up for the editorial rhythm break.
      const tileWidth = item.featured
        ? Math.floor(windowWidth - Space.sm * 2)
        : gridTileWidth;
      return (
        <View style={styles.flashListItem}>
          <ExploreGridItem
            item={item}
            tileWidth={tileWidth}
            formatPrice={formatFromFiat}
            onPress={handleTilePress}
            onLongPress={handleTileLongPress}
            onPressSellerProfile={handleSellerProfilePress}
            sellerUsername={listing?.seller?.username}
            sellerAvatar={listing?.seller?.avatar}
            shouldPlay={activePlaybackIndex === index}
          />
        </View>
      );
    },
    [
      activeListings,
      gridTileWidth,
      windowWidth,
      formatFromFiat,
      handleTilePress,
      handleTileLongPress,
      handleSellerProfilePress,
      activePlaybackIndex,
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
        keyExtractor={(item: ExploreTile) => item.id}
        getItemType={getItemType}
        renderItem={renderFeedItem}
        overrideItemLayout={(layout: { span?: number }, item: ExploreTile) => {
          // Featured tiles span both columns for asymmetric editorial rhythm
          layout.span = item.featured ? 2 : 1;
        }}
        ListHeaderComponent={
          <View>
            <DiscoverySectionHeader
              kicker={feedMode === 'following' ? 'Latest from people you follow' : undefined}
              title="Explore"
              actionLabel="See all"
              onAction={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Explore' })}
              style={styles.feedDiscoveryHeader}
            />

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

            {renderPosters()}

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

            {showFeedLoadingSkeleton || showFollowingLoading || showForYouLoading ? (
              renderExploreLoadingState()
            ) : feedGridData.length === 0 ? (
              feedMode === 'following' ? (
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={{ flex: 1 }}>
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
                </Reanimated.View>
              ) : (
                // Premium empty state — backend returned zero items and we are not
                // loading. Preserves the flagship layout instead of collapsing to
                // a blank masonry. Distinct from the sync-error banner above.
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={{ flex: 1 }}>
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
                </Reanimated.View>
              )
            ) : null}
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={{ paddingVertical: Space.md, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Loading more...</Text>
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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.75)' }]} />

          {peekItem ? (
            <Pressable
              style={styles.peekCard}
              onPress={(event) => event.stopPropagation()}
              accessibilityRole="none"
            >
              <View style={styles.peekMediaWrap}>
                <CanonicalMediaPreview
                  uri={peekItem.mediaUri}
                  posterUri={peekItem.posterUri}
                  style={styles.peekMedia}
                  shouldPlay
                  contentFit="cover"
                  showPlayBadge={false}
                />
              </View>

              <View style={styles.peekMeta}>
                <Text style={styles.peekTitle} numberOfLines={1}>{peekItem.caption}</Text>

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
  brandSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: FontFamily.regular,
    letterSpacing: 0.25,
    color: colors.textSecondary,
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
  },
  feedContent: {
    paddingBottom: 120,
  },
  feedDiscoveryHeader: {
    marginTop: 0,
    marginBottom: 2,
  },
  feedTabBar: {
    minHeight: 46,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Space.lg,
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

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
  },
  sectionTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  sectionHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    color: colors.textMuted,
    letterSpacing: 0.22,
  },

  storiesSection: {
    paddingTop: Space.xs + Space.xxs,
    paddingBottom: Space.sm + Space.xs,
  },
  storiesScroll: {
    paddingHorizontal: Space.md,
    gap: Space.sm + Space.xs,
  },
  storyCreateWrap: {
    alignItems: 'center',
    width: 68,
  },
  storyCreateRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    marginBottom: 6,
  },
  storyItem: {
    alignItems: 'center',
    width: 68,
  },
  storyRingGradient: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  storyRingGradientMuted: {
    opacity: 0.64,
  },
  storyRingInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  storyAvatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  storyAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 27,
  },
  storyPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
    position: 'absolute',
    right: 1,
    top: 1,
    borderWidth: 1,
    borderColor: colors.background,
  },
  storyName: {
    fontSize: 10,
    fontFamily: FontFamily.medium,
    color: colors.textSecondary,
    width: 66,
    textAlign: 'center',
  },
  storyStatus: {
    marginTop: 2,
    fontSize: 9,
    fontFamily: FontFamily.regular,
    color: colors.textMuted,
    width: 66,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.24,
  },

  looksSection: {
    marginTop: 4,
    marginBottom: 12,
  },
  looksRail: {
    paddingHorizontal: Space.md,
    gap: Space.smMd,
  },
  lookCard: {
    width: SCREEN_WIDTH * 0.82,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  lookImageWrap: {
    width: '100%',
    height: 280,
  },
  lookFeedRow: {
    paddingHorizontal: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  lookFeedCard: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  lookFeedImageWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  lookImage: {
    width: '100%',
    height: '100%',
  },
  lookOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  lookOwnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  lookOwnerAvatarWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  lookOwnerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  lookOwnerName: {
    color: colors.textInverse,
    fontSize: 11,
    fontFamily: FontFamily.semibold,
  },
  lookTitle: {
    color: colors.textInverse,
    fontSize: 21,
    fontFamily: FontFamily.extrabold,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  lookDescription: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: FontFamily.medium,
    marginTop: 2,
  },
  lookMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lookMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  lookMetaText: {
    color: colors.textInverse,
    fontSize: 11,
    fontFamily: FontFamily.semibold,
  },
  lookTime: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontFamily: FontFamily.medium,
    marginLeft: 'auto',
  },

  postersSection: {
    marginTop: 0,
    paddingBottom: Space.sm,
  },
  posterSectionHeading: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  // Poster heading: subtitle token with semibold — quieter than bold, clear hierarchy.
  posterSectionTitle: {
    color: colors.textPrimary,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
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
  posterTileUnseen: {
    borderWidth: 2,
    borderColor: colors.brand,
  },
  posterTileRing: {
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
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
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  posterAvatarOverlay: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.textInverse,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  posterAvatarOverlayWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  posterAvatarOverlayImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 12,
    flex: 1,
    gap: 4,
  },
  posterOwnerAvatarWrap: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  posterOwnerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 7,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
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
    backgroundColor: 'rgba(0,0,0,0.44)',
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
    backgroundColor: 'rgba(0,0,0,0.58)',
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 4,
    backgroundColor: colors.brand,
  },
  posterSeenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
  },

  masonryGrid: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  masonryColumn: {
    flex: 1,
    gap: Space.sm,
  },
  flashListItem: {
    paddingHorizontal: Space.xs,
    paddingBottom: GRID_GAP,
  },
  exploreItemBox: {
    backgroundColor: colors.background,
    // Pinterest feel: no border, no shadow — image is the card
  },
  exploreMediaWrap: {
    position: 'relative',
    borderRadius: RadiusRoleValue.sheetDialog,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  exploreSharedMedia: {
    ...StyleSheet.absoluteFill,
  },
  exploreImage: {
    width: '100%',
    height: '100%',
  },
  listingMediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  exploreDetails: {
    paddingTop: Space.sm,
    paddingHorizontal: Space.xs,
    gap: Space.xxs,
  },
  // Title: captionElevated (13/18/400) — quiet, lets price dominate.
  exploreTitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Price: bodyLarge (16/22/700) — clearly dominant over title.
  explorePrice: {
    color: colors.textPrimary,
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.priceList.letterSpacing,
  },
  exploreSellerRow: {
    minHeight: 44,
    marginTop: Space.xs,
    paddingHorizontal: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  // Avatar: 24pt circle with subtle border — proper identity element.
  exploreSellerAvatar: {
    width: 24,
    height: 24,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
  },
  exploreSellerAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
  },
  // Seller text: meta (11/14/500) — restrained, secondary to price/title.
  exploreSellerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  videoBadge: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: 28,
    height: 28,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigHeartLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 4,
  },
  exploreLoadingGrid: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  exploreLoadingColumn: {
    flex: 1,
    gap: Space.sm,
  },
  // Skeleton tile wrapper: media + metadata lines matching final tile silhouette.
  skeletonTileWrap: {
    gap: Space.xs,
  },
  skeletonMetaRow: {
    paddingHorizontal: Space.xs,
    gap: Space.xxs,
  },
  skeletonSellerRow: {
    paddingHorizontal: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
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
  peekSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: colors.textSecondary,
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
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  peekPrimaryText: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    color: colors.background,
  },
});
