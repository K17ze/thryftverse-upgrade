import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
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
import { Colors } from '../constants/colors';

import { useAppTheme } from '../theme/ThemeContext';

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
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { HorizontalRail } from '../components/HorizontalRail';
// Phase 3: Removed SyncStatusPill (status indicator clutter reduced)
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { ThryftCartIcon } from '../components/icons/ThryftCartIcon';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { MasonryGrid, ProductCardV2 } from '../components/ProductCardV2';
import { DoubleTapHeart } from '../components/DoubleTapHeart';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { isVideoUri } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { Space, Radius, Elevation } from '../theme/designTokens';
import { T } from '../components/ui/Text';
import { Typography } from '../theme/designTokens';
import { EditorialDiscoveryHero } from '../components/discover/EditorialDiscoveryHero';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { ProductAnalytics } from '../platform/product/productAnalytics';
import { CuratedCollectionsRail, type CuratedCollection } from '../components/product';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { useFollowingFeed } from '../hooks/useFollowingFeed';
import { resolveListingMediaHeightRatio } from '../utils/listingMediaGeometry';

type NavT = StackNavigationProp<RootStackParamList>;

const HEADER_EXPANDED = 80;
const HEADER_COLLAPSED = 56;
const GRID_GAP = 12;
const SCREEN_WIDTH = Dimensions.get('window').width;

const PANEL_BG = Colors.surfaceAlt;

// Skeleton variation communicates loading without inventing media geometry.
const SKELETON_HEIGHT_RATIOS = [1.25, 1.08, 1.32, 1.16] as const;

interface MediaPreviewProps {
  uri: string;
  posterUri?: string;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
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

const STORY_STATUS_GRADIENT: Record<StoryStatus, [string, string]> = {
  'new-listing': [Colors.brand, Colors.brandPressed],
  'live-auction': [Colors.textSecondary, Colors.textMuted],
  'co-own-launching': [Colors.success, Colors.success + '99'],
  'sold-recently': [Colors.danger, Colors.danger + '99'],
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
            <MediaPreview
              uri={item.mediaUri}
              posterUri={item.posterUri}
              style={styles.exploreImage}
              autoPlay={item.mediaType === 'video'}
              loop
              muted
              contentFit="cover"
              isVisible
            />
          </SharedTransitionView>
        </DoubleTapHeart>

        <View style={styles.exploreOverlay}>
          <View style={styles.exploreTag}>
            <ThryftCartIcon size={11} color="#fff" />
            <Text style={styles.exploreTagText}>{formatPrice(item.price ?? 0, 'GBP', { displayMode: 'fiat' })}</Text>
          </View>
        </View>
      </AnimatedPressable>

      {(sellerUsername || item.sellerId) && (
        <View style={styles.exploreSellerRow}>
          <AnimatedPressable
            style={styles.exploreSellerChip}
            onPress={() => item.sellerId && onPressSellerProfile(item.sellerId)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Seller: ${sellerUsername ?? item.sellerId}`}
          >
            {sellerAvatar ? (
              <CachedImage
                uri={sellerAvatar}
                style={styles.exploreSellerAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={styles.exploreSellerAvatarFallback}>
                <Ionicons name="person" size={10} color={Colors.textMuted} />
              </View>
            )}
            <Text style={styles.exploreSellerText} numberOfLines={1}>
              {sellerUsername ?? item.sellerId}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.exploreMessageBtn}
            onPress={() => item.sellerId && item.routeId && onPressSellerMessage(item.sellerId, item.routeId)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Message seller"
          >
            <Ionicons name="chatbubble-outline" size={13} color={Colors.textSecondary} />
          </AnimatedPressable>
        </View>
      )}
    </View>
  );
});

export default function HomeScreen() {
  const { isDark } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const notificationCount = useStore((state) => state.notificationCount);
  const hasSeenPoster = useStore((state) => state.hasSeenPoster);
  const customPosters = useStore((state) => state.customPosters);
  const { formatFromFiat } = useFormattedPrice();
  const haptic = useHaptic();
  const { listings, source, isSyncing, lastError, refreshListings, loadMoreListings, hasMore, isLoadingMore } = useBackendData();
  const followingFeed = useFollowingFeed();

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

    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [scrollRef]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
    void followingFeed.refresh();
    setPostersLoading(true);
    fetchPosterStories({ active: true, limit: 20 })
      .then((res) => setRealPosters(res.items))
      .catch(() => {})
      .finally(() => setPostersLoading(false));
    acknowledgeNewListings();
    setTimeout(() => setRefreshing(false), 380);
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
    () => (windowWidth - GRID_GAP * 3) / 2,
    [windowWidth],
  );

  const wishlist = useStore((state) => state.wishlist);

  // Editorial hero items — server-driven with graceful fallback
  const [serverHeroItems, setServerHeroItems] = React.useState<
    { id: string; uri: string; title: string; subtitle: string; ctaLabel: string; ctaRoute?: string }[]
  >([]);

  React.useEffect(() => {
    let mounted = true;
    fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/content/editorial-hero`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data?.items?.length) return;
        setServerHeroItems(
          data.items.map((h: any) => ({
            id: h.id,
            uri: h.uri ?? '',
            title: h.title ?? '',
            subtitle: h.subtitle ?? '',
            ctaLabel: h.ctaLabel ?? 'Explore',
            ctaRoute: h.ctaRoute,
          })),
        );
      })
      .catch(() => {
        // Backend endpoint not available — use fallback items below
      });
    return () => { mounted = false; };
  }, []);

  const heroItems = React.useMemo(() => {
    const buildAction = (route: string | undefined, fallbackCategoryId: string, fallbackTitle: string) => {
      if (route === 'auction') return () => navigation.navigate('AuctionHome');
      if (route === 'coown') return () => navigation.navigate('CoOwnHub');
      return () => navigation.navigate('Browse', { categoryId: fallbackCategoryId, title: fallbackTitle });
    };

    if (serverHeroItems.length > 0) {
      return serverHeroItems.map((h) => ({
        ...h,
        ctaAction: buildAction(h.ctaRoute, 'all', h.title),
      }));
    }

    // Fallback: UI placeholder for future curated content
    return [
      { id: 'hero1', uri: '', title: 'The Archive Drop', subtitle: 'Curated vintage essentials', ctaLabel: 'Explore', ctaAction: () => navigation.navigate('Browse', { categoryId: 'all', title: 'The Archive Drop' }) },
      { id: 'hero2', uri: '', title: 'Summer Layers', subtitle: 'Lightweight fits for the season', ctaLabel: 'Shop', ctaAction: () => navigation.navigate('Browse', { categoryId: 'all', title: 'Summer Layers' }) },
      { id: 'hero3', uri: '', title: 'Streetwear Daily', subtitle: 'New arrivals every day', ctaLabel: 'Browse', ctaAction: () => navigation.navigate('Browse', { categoryId: 'all', title: 'Streetwear Daily' }) },
    ];
  }, [serverHeroItems, navigation]);

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
        aspectRatio: resolveListingMediaHeightRatio(item),
        isSaved: wishlist.includes(item.id),
      };
    });
  }, [listings, wishlist]);

  // Curated collections — editorial picks
  const curatedCollections = React.useMemo<CuratedCollection[]>(() => {
    // Build collections from real listing data
    const luxuryItems = listings.filter((l) => l.price > 200).slice(0, 12);
    const vintageItems = listings.filter((l) =>
      l.condition?.toLowerCase().includes('vintage') ||
      l.title?.toLowerCase().includes('vintage') ||
      l.brand?.toLowerCase().includes('vintage')
    ).slice(0, 12);
    const streetwearItems = listings.filter((l) =>
      l.category?.toLowerCase().includes('street') ||
      l.subcategory?.toLowerCase().includes('street') ||
      l.title?.toLowerCase().includes('street')
    ).slice(0, 12);

    const collections: CuratedCollection[] = [];

    if (luxuryItems.length > 0) {
      collections.push({
        id: 'luxury_edit',
        title: 'Luxury Edit',
        subtitle: 'Investment pieces under £500',
        coverImage: luxuryItems[0].images?.[0] ?? '',
        itemCount: luxuryItems.length,
        curatorName: 'ThryftVerse',
        accentColor: Colors.brand,
      });
    }

    if (vintageItems.length > 0) {
      collections.push({
        id: 'vintage_finds',
        title: 'Vintage Finds',
        subtitle: 'One-of-a-kind archival pieces',
        coverImage: vintageItems[0].images?.[0] ?? '',
        itemCount: vintageItems.length,
        curatorName: 'ThryftVerse',
        accentColor: '#8b5cf6',
      });
    }

    if (streetwearItems.length > 0) {
      collections.push({
        id: 'streetwear_staples',
        title: 'Streetwear Staples',
        subtitle: 'Daily-driver grails',
        coverImage: streetwearItems[0].images?.[0] ?? '',
        itemCount: streetwearItems.length,
        curatorName: 'ThryftVerse',
        accentColor: '#f59e0b',
      });
    }

    return collections;
  }, [listings]);

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
        aspectRatio: resolveListingMediaHeightRatio(item),
        isSaved: wishlist.includes(item.id),
      };
    });
  }, [followingFeed.listings, wishlist]);

  const activeFeedData = feedMode === 'following' ? followingExploreData : exploreData;
  const activeListings = feedMode === 'following' ? followingFeed.listings : listings;
  const showFollowingLoading = feedMode === 'following' && followingFeed.isLoading && !followingFeed.isRefreshing;
  const showFollowingRefreshing = feedMode === 'following' && followingFeed.isRefreshing;
  const feedGridData = (showFeedLoadingSkeleton || showFollowingLoading) ? [] : activeFeedData;

  const masonryColumns = React.useMemo(() => {
    const columns: [Array<{ tile: ExploreTile; originalIndex: number }>, Array<{ tile: ExploreTile; originalIndex: number }>] = [[], []];
    const columnHeights = [0, 0];

    activeFeedData.forEach((tile, originalIndex) => {
      const tileHeight = Math.round(gridTileWidth * tile.aspectRatio) + (tile.sellerId && tile.routeId ? 38 : 0);
      const targetIndex = columnHeights[0] <= columnHeights[1] ? 0 : 1;
      columns[targetIndex].push({ tile, originalIndex });
      columnHeights[targetIndex] += tileHeight + GRID_GAP;
    });

    return columns;
  }, [activeFeedData, gridTileWidth]);

  const closePeek = React.useCallback(() => {
    setPeekItem(null);
  }, []);

  const renderPosters = () => {
    if (postersLoading) {
      return (
        <View style={styles.postersSection}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Posters</Text>
          </View>
          <HorizontalRail contentContainerStyle={styles.postersScroll}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={`poster_skeleton_${i}`} style={styles.posterCard}>
                <SkeletonLoader width={120} height={152} borderRadius={Radius.md} />
              </View>
            ))}
          </HorizontalRail>
        </View>
      );
    }

    return (
      <View style={styles.postersSection}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Posters</Text>
        </View>

        <HorizontalRail
          contentContainerStyle={styles.postersScroll}
        >
          <AnimatedPressable
            style={styles.posterCard}
            activeOpacity={0.9}
            onPress={() => { haptic.light(); navigation.navigate('CreatorStudio', { type: 'poster' }); }}
            accessibilityLabel="Create a new poster"
            accessibilityRole="button"
            accessibilityHint="Opens poster creator for auction or promotion posts"
          >
            <View style={styles.posterCreateTile}>
              <View style={styles.posterCreateIcon}>
                <Ionicons name="add" size={24} color={Colors.background} />
              </View>
              <Text style={styles.posterCreateLabel}>Create Poster</Text>
            </View>
          </AnimatedPressable>

          {realPosters.length === 0 && !postersLoading && (
            <View style={styles.posterCard}>
              <View style={[styles.posterTile, { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surfaceAlt }]}>
                <Ionicons name="images-outline" size={28} color={Colors.textMuted} />
                <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 6, textAlign: 'center' }}>No posters yet</Text>
              </View>
            </View>
          )}

          {(() => {
            // Sort stories: unwatched-first, then watched
            const sortedPosters = [...realPosters].sort((a, b) => {
              if (a.seenByViewer === b.seenByViewer) return 0;
              return a.seenByViewer ? 1 : -1;
            });
            const unwatchedCount = realPosters.filter((s) => !s.seenByViewer).length;
            return sortedPosters.map((story, idx) => {
            const firstFrame = story.frames[0];
            const mediaUrl = firstFrame?.mediaUrl ?? '';
            const caption = firstFrame?.caption ?? '';
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
                {isVideoUri(mediaUrl) ? (
                  <Video
                    source={{ uri: mediaUrl }}
                    style={styles.posterImage}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay
                    isLooping
                    isMuted
                  />
                ) : mediaUrl ? (
                  <CachedImage
                    uri={mediaUrl}
                    style={styles.posterImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: firstFrame?.backgroundColor ?? Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontFamily: Typography.family.medium, textAlign: 'center', paddingHorizontal: 8 }} numberOfLines={2}>{caption || 'Text story'}</Text>
                  </View>
                )}
                <View style={styles.posterShade} />

                <View style={styles.posterBottomOverlay}>
                  <Text style={styles.posterCaption} numberOfLines={2}>{caption}</Text>
                </View>

                {story.totalFrameCount > 1 && (
                  <View style={styles.frameCountBadge}>
                    <Ionicons name="layers" size={10} color="#fff" />
                    <Text style={styles.frameCountBadgeText}>{story.totalFrameCount}</Text>
                  </View>
                )}

                {showUnwatchedBadge && (
                  <View style={styles.unwatchedBadge}>
                    <Text style={styles.unwatchedBadgeText}>{unwatchedCount} new</Text>
                  </View>
                )}
              </View>

              <View style={styles.posterCardMetaRow}>
                <Text style={isUnwatched ? styles.posterFreshMeta : styles.posterSeenMeta}>
                  {isUnwatched ? 'New' : 'Seen'}
                </Text>
              </View>
            </AnimatedPressable>
            );
            });
          })()}
        </HorizontalRail>

        {lastError ? (
          <SyncRetryBanner
            message="Sync is unavailable. Showing cached items."
            onRetry={() => void handleRefresh()}
            isRetrying={isSyncing || refreshing}
            telemetryContext="home_feed_sync"
            containerStyle={styles.feedStatusBanner}
          />
        ) : null}
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
          icon={<Ionicons name="sparkles-outline" size={13} color={Colors.background} />}
          trailingIcon={<Ionicons name="arrow-up" size={13} color={Colors.background} />}
          iconContainerStyle={styles.newListingsBannerIconWrap}
          trailingIconContainerStyle={styles.newListingsBannerIconWrap}
          hapticFeedback="selection"
          onPress={acknowledgeNewListings}
          accessibilityLabel="Jump to new listings"
          accessibilityHint="Scrolls feed focus to newly added listings"
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
    });
  }, [navigation, haptic]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <Reanimated.View style={[styles.floatingHeaderShell, headerHeightStyle, headerShadowStyle]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surfaceAlt }]} />

        <View style={[styles.headerForeground, { paddingTop: insets.top + 2, paddingBottom: 8 }]}>
          <Reanimated.View style={[headerTitleStyle, styles.headerTitleWrap]}>
            <Text style={styles.brandTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Thryftverse</Text>
          </Reanimated.View>

          <View style={styles.headerRight}>
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={() => navigation.navigate('GlobalSearch')}
              accessibilityLabel="Search listings"
              accessibilityRole="button"
              accessibilityHint="Opens global search"
            >
              <Ionicons name="search" size={22} color={Colors.textPrimary} />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={() => navigation.navigate('NotificationsList')}
              accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications'}
              accessibilityRole="button"
              accessibilityHint="Opens notifications center"
            >
              <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
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

      <Reanimated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.feedContent, { paddingTop: headerCollapsedHeight + 2 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        {...({ onEndReached: () => { if (hasMore && !isLoadingMore) void loadMoreListings(); }, onEndReachedThreshold: 0.5 } as any)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
      >
        {renderPosters()}

        {/* Editorial Hero — renders when real imagery is configured */}
        {heroItems.some((h) => h.uri.trim().length > 0) && (
          <View style={{ marginBottom: Space.md }}>
            <EditorialDiscoveryHero items={heroItems.filter((h) => h.uri.trim().length > 0)} autoPlayInterval={6000} />
          </View>
        )}

        {renderNewListingsBanner()}

        {/* Curated collections rail */}
        {curatedCollections.length > 0 && (
          <CuratedCollectionsRail
            collections={curatedCollections}
            onOpenCollection={(collectionId) => {
              // Navigate to browse with a category filter matching the collection
              const collectionMap: Record<string, { categoryId: string; title: string }> = {
                luxury_edit: { categoryId: 'all', title: 'Luxury Edit' },
                vintage_finds: { categoryId: 'all', title: 'Vintage Finds' },
                streetwear_staples: { categoryId: 'all', title: 'Streetwear Staples' },
              };
              const config = collectionMap[collectionId];
              if (config) {
                navigation.navigate('Browse', { categoryId: config.categoryId, title: config.title });
              }
            }}
          />
        )}

        {/* For You | Following segment control */}
        <View style={styles.feedSegmentRow}>
          <AppSegmentControl
            options={[
              { value: 'foryou', label: 'For You', accessibilityLabel: 'For You feed' },
              {
                value: 'following',
                label: followingFeed.listings.length > 0
                  ? `Following · ${followingFeed.listings.length}`
                  : 'Following',
                accessibilityLabel: 'Following feed',
              },
            ]}
            value={feedMode}
            onChange={(next) => {
              haptic.selection();
              setFeedMode(next);
            }}
            fullWidth
            style={styles.feedSegment}
          />
        </View>

        {feedMode === 'foryou' && (
          <DiscoverySectionHeader
            kicker="Fresh from the community"
            title="Explore"
            actionLabel="See all"
            onAction={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Explore' })}
            style={{ marginTop: Space.sm }}
          />
        )}

        {showFeedLoadingSkeleton || showFollowingLoading ? (
          renderExploreLoadingState()
        ) : feedGridData.length === 0 ? (
          feedMode === 'following' ? (
            <Reanimated.View entering={FadeInDown.duration(300)} style={{ flex: 1 }}>
              <EmptyState
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
            <Reanimated.View entering={FadeInDown.duration(300)} style={{ flex: 1 }}>
              <EmptyState
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
        ) : (
          <View style={styles.masonryGrid}>
            <View style={styles.masonryColumn}>
              {masonryColumns[0].map(({ tile: item, originalIndex }) => {
                const listing = activeListings.find((l) => l.id === item.routeId);
                return (
                <View key={item.id}>
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
              })}
            </View>
            <View style={styles.masonryColumn}>
              {masonryColumns[1].map(({ tile: item, originalIndex }) => {
                const listing = activeListings.find((l) => l.id === item.routeId);
                return (
                <View key={item.id}>
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
              })}
            </View>
          </View>
        )}

        {isLoadingMore && (
          <View style={{ paddingVertical: Space.md, alignItems: 'center' }}>
            <Text style={{ color: Colors.textMuted, fontSize: 13 }}>Loading more...</Text>
          </View>
        )}
      </Reanimated.ScrollView>

      <Modal
        transparent
        visible={Boolean(peekItem)}
        animationType="fade"
        onRequestClose={closePeek}
      >
        <Pressable style={styles.peekBackdrop} onPress={closePeek}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.75)' }]} />

          {peekItem ? (
            <Pressable style={styles.peekCard} onPress={(event) => event.stopPropagation()}>
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
                  />

                  <AppButton
                    title="View Listing"
                    variant="primary"
                    size="sm"
                    align="center"
                    style={styles.peekPrimaryBtn}
                    titleStyle={styles.peekPrimaryText}
                    icon={<Ionicons name="arrow-forward" size={14} color={Colors.background} />}
                    iconContainerStyle={styles.peekPrimaryIconWrap}
                    onPress={() => {
                      if (peekItem.routeId) {
                        navigation.push('ItemDetail', { itemId: peekItem.routeId });
                      }
                      closePeek();
                    }}
                    accessibilityLabel="Open listing details"
                    accessibilityHint="Navigates to full listing details"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  floatingHeaderShell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
    ...Elevation.subtle, // ELEVATED: Subtle shadow for depth
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
    fontSize: 26, // Slightly reduced
    fontFamily: Typography.family.bold, // Changed from ExtraBold for elegance
    letterSpacing: 2, // Luxury spacing (ELEVATED)
    color: Colors.textPrimary,
    lineHeight: 30,
    textTransform: 'uppercase', // ELEVATED: Uppercase like luxury brands
  },
  brandSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.25,
    color: Colors.textSecondary,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Elevation.subtle, // ELEVATED: Subtle shadow
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    lineHeight: 12,
  },
  feedContent: {
    paddingBottom: 120,
  },
  feedSegmentRow: {
    paddingHorizontal: 16,
    marginBottom: 4,
    marginTop: 4,
  },
  feedSegment: {
    flex: 1,
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
    borderRadius: 20,
    backgroundColor: Colors.brand,
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
    color: Colors.background,
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
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  sectionHint: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
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
    backgroundColor: Colors.background,
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
    backgroundColor: Colors.brand,
    position: 'absolute',
    right: 1,
    top: 1,
    borderWidth: 1,
    borderColor: Colors.background,
  },
  storyName: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    width: 66,
    textAlign: 'center',
  },
  storyStatus: {
    marginTop: 2,
    fontSize: 9,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
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
    borderWidth: 0.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
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
    borderWidth: 0.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
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
    color: '#fff',
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  lookTitle: {
    color: '#fff',
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
    color: '#fff',
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
    marginTop: 0,
    paddingBottom: 8,
  },
  postersScroll: {
    paddingHorizontal: 16,
    gap: 14,
  },
  feedStatusBanner: {
    marginTop: 10,
    marginHorizontal: 16,
    marginBottom: 2,
  },
  posterCard: {

    width: 120,
  },
  posterTile: {

    width: 120,

    height: 152,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 5,
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
  },
  posterTileUnseen: {
    borderWidth: 2,
    borderColor: Colors.brand,
  },
  posterTileRing: {
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  posterTileSeen: {
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.2)',
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
    borderColor: '#fff',
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
  posterCreateTile: {

    width: 120,

    height: 152,
    borderRadius: 12,
    marginBottom: 5,
    backgroundColor: Colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  posterCreateIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterCreateLabel: {
    color: Colors.background,
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
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
    color: '#fff',
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
    color: '#fff',
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
    color: '#fff',
    fontSize: 9,
    lineHeight: 12,
    fontFamily: Typography.family.medium,
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
    color: '#fff',
    fontSize: 9,
    fontFamily: Typography.family.bold,
  },
  unwatchedBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: Colors.brand,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unwatchedBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: Typography.family.bold,
  },
  posterCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posterUserName: {
    fontSize: 9,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  posterFreshMeta: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  posterSeenMeta: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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
  exploreItemBox: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    // Pinterest feel: no border, no shadow — image is the card
  },
  exploreMediaWrap: {
    position: 'relative',
  },
  exploreSharedMedia: {
    ...StyleSheet.absoluteFill,
  },
  exploreImage: {
    width: '100%',
    height: '100%',
  },
  exploreOverlay: {
    position: 'absolute',
    left: 10,
    bottom: 10,
  },
  exploreTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  exploreTagText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.1,
  },
  exploreSellerRow: {
    marginTop: 7,
    marginHorizontal: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  exploreSellerChip: {
    flex: 1,
    minHeight: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    ...Elevation.subtle, // ELEVATED: Use design system
  },
  exploreSellerAvatarWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  exploreSellerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  exploreSellerAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  exploreSellerText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.1,
  },
  exploreMessageBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.subtle, // ELEVATED: Use design system
  },
  videoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
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
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  peekMediaWrap: {
    width: '100%',
    height: 340,
    backgroundColor: Colors.surfaceAlt,
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
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  peekSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  peekActionsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  peekGhostBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
  },
  peekGhostText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  peekPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
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
    color: Colors.background,
  },
});
