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
  ImageStyle,
  StyleProp,
  ViewStyle,
  AppState,
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
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from '../components/compat/Video';
import { ImageContentFit } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

// Typography simplified - using direct font names
import { fetchPosterStories } from '../services/postersApi';
import type { PosterStory } from '../services/postersApi';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useTabScroll } from '../context/TabScrollContext';
// Phase 3: Removed AnimatedBadge (badge clutter reduced)
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
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
import { Space, Radius, Type, Stroke } from '../theme/designTokens';
import { T } from '../components/ui/Text';
import { Typography } from '../theme/designTokens';
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

type NavT = StackNavigationProp<RootStackParamList>;

const HEADER_EXPANDED = 58;
const HEADER_COLLAPSED = 52;
const GRID_GAP = 12; // 12pt — breathable discovery gutter (flagship spacing)
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
const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList) as unknown as React.ComponentClass<
  React.ComponentProps<typeof FlashList<ExploreTile>> & { ref?: React.Ref<any> }
>;

interface MediaPreviewProps {
  uri: string;
  posterUri?: string;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  focalPoint?: { x: number; y: number };
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  isVisible?: boolean;
}

function MediaPreview({
  uri,
  posterUri,
  style,
  containerStyle,
  contentFit = 'cover',
  focalPoint,
  autoPlay = false,
  muted = true,
  loop = true,
  isVisible = true,
}: MediaPreviewProps) {
  if (isVideoUri(uri)) {
    return (
      <Video
        source={{ uri }}
        style={style as StyleProp<ViewStyle>}
        resizeMode={ResizeMode.COVER}
        shouldPlay={autoPlay}
        isMuted={muted}
        isLooping={loop}
        usePoster={!!posterUri}
        posterSource={posterUri ? { uri: posterUri } : undefined}
      />
    );
  }

  return (
    <CachedImage
      uri={uri}
      style={style}
      containerStyle={containerStyle}
      contentFit={contentFit}
      focalPoint={focalPoint}
      isVisible={isVisible}
    />
  );
}

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

  const backgroundColor = firstFrame?.backgroundColor ?? colors.surfaceAlt;
  return (
    <LinearGradient
      colors={[backgroundColor, '#111111']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.posterTextArtwork}
    >
      <View style={styles.posterTextArtworkOrb} />
      <Ionicons name="sparkles-outline" size={14} color="rgba(255,255,255,0.72)" />
      <Text style={styles.posterTextArtworkCopy} numberOfLines={4}>
        {firstFrame?.caption || 'Poster'}
      </Text>
    </LinearGradient>
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

  return (
    <LinearGradient
      colors={[colors.surfaceAlt, colors.background]}
      start={{ x: 0.08, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.listingMediaPlaceholder}
      accessibilityLabel="Product image unavailable"
      accessibilityRole="image"
    >
      <View style={styles.listingMediaPlaceholderOrbLarge} />
      <View style={styles.listingMediaPlaceholderOrbSmall} />
      <View style={styles.listingMediaPlaceholderIcon}>
        <Ionicons name={icon} size={28} color={colors.textMuted} />
      </View>
    </LinearGradient>
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
  onPressSellerMessage: (sellerId: string, listingId: string) => void;
  sellerUsername?: string | null;
  sellerAvatar?: string | null;
}

const ExploreGridItem = React.memo(function ExploreGridItem({
  item,
  tileWidth,
  formatPrice,
  onPress,
  onLongPress,
  onPressSellerProfile,
  onPressSellerMessage,
  sellerUsername,
  sellerAvatar,
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
        activeOpacity={0.92}
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
              <MediaPreview
                uri={item.mediaUri}
                posterUri={item.posterUri}
                style={styles.exploreImage}
                autoPlay={item.mediaType === 'video'}
                loop
                muted
                contentFit="cover"
                focalPoint={getCategoryFocalPoint(item.category)}
                isVisible
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
        <View style={styles.exploreSellerRow}>
          <AnimatedPressable
            style={styles.exploreSellerChip}
            onPress={() => item.sellerId && onPressSellerProfile(item.sellerId)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={sellerUsername ? `Seller: @${sellerUsername}` : 'Open seller profile'}
          >
            {sellerAvatar ? (
              <CachedImage
                uri={sellerAvatar}
                style={styles.exploreSellerAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={styles.exploreSellerAvatarFallback}>
                <Ionicons name="person" size={12} color={colors.textMuted} />
              </View>
            )}
            <Text style={styles.exploreSellerText} numberOfLines={1}>
              @{sellerUsername ?? item.sellerId}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.exploreMessageBtn}
            onPress={() => item.sellerId && item.routeId && onPressSellerMessage(item.sellerId, item.routeId)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Message seller"
          >
            <Ionicons name="chatbubble-outline" size={14} color={colors.textPrimary} />
            <Text style={styles.exploreMessageText}>Chat</Text>
          </AnimatedPressable>
        </View>
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
  const { listings, source, isSyncing, lastError, refreshListings, loadMoreListings, hasMore, isLoadingMore } = useBackendData();
  const followingFeed = useFollowingFeed();
  const forYouFeed = useForYouFeed();

  const [refreshing, setRefreshing] = React.useState(false);
  const [peekItem, setPeekItem] = React.useState<ExploreTile | null>(null);
  const [newListingIds, setNewListingIds] = React.useState<Set<string>>(() => new Set());
  const [feedMode, setFeedMode] = React.useState<'foryou' | 'following'>('foryou');

  const scrollY = useSharedValue(0);
  const lastScrollY = useSharedValue(0);
  const { tabBarVisible } = useTabScroll();
  const scrollRef = React.useRef<any>(null);
  const knownListingIdsRef = React.useRef<Set<string>>(new Set());
  const seededKnownListingIdsRef = React.useRef(false);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const headerExpandedHeight = React.useMemo(() => HEADER_EXPANDED + insets.top, [insets.top]);
  const headerCollapsedHeight = React.useMemo(() => HEADER_COLLAPSED + insets.top, [insets.top]);

  useScrollToTop(scrollRef);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;

      if (e.contentOffset.y > lastScrollY.value + 5 && e.contentOffset.y > 80) {
        tabBarVisible.value = false;
      } else if (e.contentOffset.y < lastScrollY.value - 5 || e.contentOffset.y <= 0) {
        tabBarVisible.value = true;
      }

      lastScrollY.value = e.contentOffset.y;
    },
  });

  const headerHeightStyle = useAnimatedStyle(() => {
    const height = interpolate(
      scrollY.value,
      [0, 120],
      [headerExpandedHeight, headerCollapsedHeight],
      Extrapolation.CLAMP,
    );

    return { height };
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
    () => Math.floor((windowWidth - (Space.md * 2) - GRID_GAP) / 2),
    [windowWidth],
  );

  const wishlist = useStore((state) => state.wishlist);

  const exploreData = React.useMemo<ExploreTile[]>(() => {
    return listings.map((item): ExploreTile => {
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
      };
    });
  }, [listings, wishlist]);

  // Following feed: transform following listings into the same ExploreTile shape
  const followingExploreData = React.useMemo<ExploreTile[]>(() => {
    return followingFeed.listings.map((item): ExploreTile => {
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
      };
    });
  }, [followingFeed.listings, wishlist]);

  // For You feed: transform personalised recommendations into ExploreTile shape
  const forYouExploreData = React.useMemo<ExploreTile[]>(() => {
    return forYouFeed.listings.map((item): ExploreTile => {
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
                borderRadius={Radius.md}
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
              activeOpacity={0.9}
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
                    accessible
                    accessibilityLabel={isUnwatched ? 'New poster' : 'Seen poster'}
                    accessibilityRole="image"
                  />
                </View>

                {story.totalFrameCount > 1 && (
                  <View style={styles.frameCountBadge}>
                    <Ionicons name="layers" size={10} color={colors.textInverse} />
                    <Text style={styles.frameCountBadgeText}>{story.totalFrameCount}</Text>
                  </View>
                )}

                {showUnwatchedBadge && (
                  <View style={styles.unwatchedBadge}>
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
          icon={<Ionicons name="sparkles-outline" size={13} color={colors.background} />}
          trailingIcon={<Ionicons name="arrow-up" size={13} color={colors.background} />}
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
            <View key={`feed_loading_left_${index}`}>
              <PremiumSkeletonTile width="100%" height={Math.round(gridTileWidth * ratio)} borderRadius={Radius.sm} />
            </View>
          );
        })}
      </View>
      <View style={styles.exploreLoadingColumn}>
        {Array.from({ length: 4 }).map((_, index) => {
          const ratio = SKELETON_HEIGHT_RATIOS[(index + 2) % SKELETON_HEIGHT_RATIOS.length];
          return (
            <View key={`feed_loading_right_${index}`}>
              <PremiumSkeletonTile width="100%" height={Math.round(gridTileWidth * ratio)} borderRadius={Radius.sm} />
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

  const handleSellerMessagePress = React.useCallback((sellerId: string, listingId: string) => {
    haptic.light();
    navigation.navigate('Chat', {
      conversationId: `${sellerId}_${listingId}`,
      focusQuery: '',
      partnerUserId: sellerId,
      itemId: listingId,
    });
  }, [navigation, haptic]);

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
              activeOpacity={0.58}
              scaleValue={0.94}
            >
              <Ionicons name="add" size={24} color={colors.textPrimary} />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={() => navigation.navigate('GlobalSearch')}
              accessibilityLabel="Search listings"
              accessibilityRole="button"
              accessibilityHint="Opens global search"
              activeOpacity={0.58}
              scaleValue={0.94}
            >
              <Ionicons name="search" size={22} color={colors.textPrimary} />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={() => navigation.navigate('NotificationsList')}
              accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications'}
              accessibilityRole="button"
              accessibilityHint="Opens notifications center"
              activeOpacity={0.58}
              scaleValue={0.94}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
              {notificationCount > 0 && (
                <View style={styles.notificationBadge} pointerEvents="none">
                  <Text style={styles.notificationBadgeText}>
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </Text>
                </View>
              )}
            </AnimatedPressable>
          </View>
        </View>
      </Reanimated.View>

      <AnimatedFlashList
        ref={scrollRef}
        data={feedGridData}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.feedContent, { paddingTop: headerExpandedHeight + Space.sm }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onEndReached={() => {
          if (hasMore && !isLoadingMore) void loadMoreListings();
        }}
        onEndReachedThreshold={0.5}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const listing = activeListings.find((l) => l.id === item.routeId);
          return (
            <View style={styles.flashListItem}>
              <ExploreGridItem
                item={item}
                tileWidth={gridTileWidth}
                formatPrice={formatFromFiat}
                onPress={handleTilePress}
                onLongPress={handleTileLongPress}
                onPressSellerProfile={handleSellerProfilePress}
                onPressSellerMessage={handleSellerMessagePress}
                sellerUsername={listing?.seller?.username}
                sellerAvatar={listing?.seller?.avatar}
              />
            </View>
          );
        }}
        overrideItemLayout={(layout) => {
          layout.span = 1;
        }}
        ListHeaderComponent={
          <View>
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
                    activeOpacity={0.68}
                    scaleValue={0.98}
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

            {showFeedLoadingSkeleton || showFollowingLoading ? (
              renderExploreLoadingState()
            ) : feedGridData.length === 0 ? (
              feedMode === 'following' ? (
                <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={{ flex: 1 }}>
                  <EmptyState
                    density="compact"
                    icon={followingFeed.hasFollowing ? 'pricetag-outline' : 'people-outline'}
                    title={followingFeed.hasFollowing ? 'No new drops from sellers you follow' : 'Follow sellers to see their drops here'}
                    subtitle={followingFeed.hasFollowing
                      ? 'When sellers you follow list new items, they\u2019ll appear here in chronological order. Pull to refresh.'
                      : 'Build your following feed by tapping follow on seller profiles. Their latest listings will show up here.'
                    }
                    ctaLabel={followingFeed.hasFollowing ? 'Refresh' : 'Discover sellers'}
                    onCtaPress={followingFeed.hasFollowing ? () => void handleRefresh() : () => navigation.navigate('Browse', { categoryId: 'all', title: 'Explore' })}
                    secondaryCtaLabel={followingFeed.hasFollowing ? 'Explore all' : undefined}
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
                    icon="sparkles-outline"
                    title="No drops live yet"
                    subtitle="The community hasn't listed anything live yet. Pull to refresh or explore curated categories."
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
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.75)' }]} />

          {peekItem ? (
            <Pressable
              style={styles.peekCard}
              onPress={(event) => event.stopPropagation()}
              accessibilityRole="none"
            >
              <View style={styles.peekMediaWrap}>
                <MediaPreview
                  uri={peekItem.mediaUri}
                  posterUri={peekItem.posterUri}
                  style={styles.peekMedia}
                  autoPlay
                  loop
                  muted
                  contentFit="cover"
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
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  brandTitle: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.35,
    color: colors.textPrimary,
    lineHeight: 26,
  },
  brandSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: Typography.family.regular,
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
    borderRadius: Radius.full,
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
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  feedTabLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  feedTabLabelActive: {
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  feedTabCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: Radius.full,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: Type.meta.size,
    lineHeight: 20,
    fontFamily: Typography.family.semibold,
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
    borderRadius: Radius.full,
    backgroundColor: colors.textPrimary,
  },
  newListingsBannerWrap: {
    marginTop: 6,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  newListingsBanner: {
    alignSelf: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    borderWidth: 0,
  },
  newListingsBannerContent: {
    gap: 7,
  },
  newListingsBannerIconWrap: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'transparent',
  },
  newListingsBannerText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: colors.background,
    letterSpacing: 0.2,
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.1,
  },
  sectionHint: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    letterSpacing: 0.22,
  },

  storiesSection: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  storiesScroll: {
    paddingHorizontal: 16,
    gap: 14,
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
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    width: 66,
    textAlign: 'center',
  },
  storyStatus: {
    marginTop: 2,
    fontSize: 9,
    fontFamily: Typography.family.regular,
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
    paddingHorizontal: 16,
    gap: 12,
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
    fontFamily: Typography.family.semibold,
  },
  lookTitle: {
    color: colors.textInverse,
    fontSize: 21,
    fontFamily: Typography.family.extrabold,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  lookDescription: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: Typography.family.medium,
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
    fontFamily: Typography.family.semibold,
  },
  lookTime: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontFamily: Typography.family.medium,
    marginLeft: 'auto',
  },

  postersSection: {
    marginTop: 2,
    paddingBottom: Space.sm,
  },
  posterSectionHeading: {
    paddingHorizontal: Space.md,
    marginBottom: Space.xs,
  },
  posterSectionTitle: {
    color: colors.textPrimary,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },
  postersScroll: {
    paddingHorizontal: Space.md,
    paddingBottom: 2,
    gap: Space.sm,
  },
  feedStatusBanner: {
    marginTop: 10,
    marginHorizontal: 16,
    marginBottom: 2,
  },
  posterCard: {
    width: POSTER_CARD_WIDTH,
  },
  posterTile: {
    width: POSTER_CARD_WIDTH,
    height: POSTER_CARD_HEIGHT,
    borderRadius: Radius.lg,
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
  posterTextArtworkOrb: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    top: -42,
    right: -34,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  posterTextArtworkCopy: {
    color: colors.textInverse,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.bold,
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
    fontFamily: Typography.family.medium,
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
    fontFamily: Typography.family.bold,
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
    fontFamily: Typography.family.medium,
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
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  posterCreatorName: {
    flex: 1,
    color: colors.textInverse,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: Typography.family.semibold,
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
    fontFamily: Typography.family.bold,
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
    fontFamily: Typography.family.bold,
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
    borderRadius: Radius.lg,
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
  },
  listingMediaPlaceholderOrbLarge: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    top: -76,
    right: -64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  listingMediaPlaceholderOrbSmall: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    bottom: -44,
    left: -30,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  listingMediaPlaceholderIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  exploreDetails: {
    paddingTop: Space.sm,
    paddingHorizontal: Space.xs,
    gap: Space.xs,
  },
  exploreTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  // Price elevated to hero — 16pt bold, clearly dominant over 14pt title.
  explorePrice: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  exploreSellerRow: {
    minHeight: 32,
    marginTop: 2,
    paddingHorizontal: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  exploreSellerChip: {
    flex: 1,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingRight: Space.xs,
  },
  exploreSellerAvatarWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  exploreSellerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  exploreSellerAvatarFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  exploreSellerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
  exploreMessageBtn: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: Space.xs + 2,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreMessageText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontFamily: Typography.family.semibold,
  },
  videoBadge: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
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

  peekBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  peekCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radius.xl,
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
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  peekSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: Typography.family.regular,
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
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
  },
  peekGhostText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  peekPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
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
    fontFamily: Typography.family.bold,
    color: colors.background,
  },
});
