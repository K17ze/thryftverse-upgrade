import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  Share,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { useVisuallyComplete } from '../performance/visuallyComplete';
import * as Clipboard from 'expo-clipboard';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  runOnJS,
  FadeIn,
} from 'react-native-reanimated';
// Note: useAnimatedScrollHandler + AnimatedFlashList crashes on web due to
// Reanimated 4.x not backporting the FlashList scroll-event fix from 3.12.
// On web we use a plain JS scroll handler + non-animated FlashList.
// See: https://github.com/software-mansion/react-native-reanimated/issues/9266

import { useAppTheme } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Space, FontFamily, DockConstants, Elevation, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { useStore } from '../store/useStore';
import {
  type PublicProfileStats,
  type PublicProfileViewer,
  type PublicProfileTrader,
  type PublicProfileStorefrontSummary,
  type ReportReason,
} from '../services/profileApi';
import {
  usePublicProfileQuery,
  useUserListingsInfinite,
  useUserLooksInfinite,
  useSellerReviewsInfinite,
  useFollowMutation,
  useBlockMutation,
  useReportUserMutation,
} from '../platform/server';
import { useSellerTrust } from '../platform/product';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { useSignupWall } from '../hooks/useSignupWall';
import { useToast } from '../context/ToastContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import type { ListingApiItem } from '../services/listingsApi';
import type { LookApiItem } from '../services/looksApi';
import type { SellerReviewItem, SellerReviewSummary } from '../services/sellerReviewsApi';
import { respondToReview } from '../services/reviewApi';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ProfileSkeleton } from '../components/profile/ProfileSkeleton';
import { ProfileErrorState, ProfileUnavailableState, ProfileBlockedState } from '../components/profile/ProfileStates';
import { ProfileHero } from '../components/profile/ProfileHero';
import { TabRail, SegmentedControl, type TabKey, type SegmentKey } from '../components/profile/ProfileTabRail';
import { ProfileShopTile } from '../components/profile/ProfileShopTile';
import { ProfileLookTile } from '../components/profile/ProfileLookTile';
import { ReviewSummaryBlock, ProfileReviewRow } from '../components/profile/ProfileReviews';
import { SellerResponseComposer } from '../components/profile/SellerResponseComposer';
import { ReviewReportSheet } from '../components/profile/ReviewReportSheet';
import { ProfileMoreSheet, ProfileReportSheet, ProfileBlockConfirmSheet } from '../components/profile/ProfileSheets';
import { PublicProfileConnectionsSheet } from '../components/profile/PublicProfileConnectionsSheet';
import { PosterHighlightsRail } from '../components/poster/PosterHighlightsRail';
import { ShopRail, type ShopRailItem } from '../components/profile/ShopRail';
import { fetchPosterHighlights, type PosterHighlight } from '../services/postersApi';
import { OfflineBanner } from '../components/OfflineBanner';
import { track } from '../analytics';

// AnimatedFlashList crashes on web with Reanimated 4.x (issue #9266).
// Use plain FlashList on web; animated version on native for UI-thread perf.
const AnimatedFlashList: any = Platform.OS === 'web'
  ? FlashList
  : Reanimated.createAnimatedComponent(FlashList);

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

const COVER_HEIGHT = 160;
const GRID_GAP = 4;
const CARD_ASPECT = 4 / 3;
const SHOP_COLS = 3;
const LOOK_GAP = 4;
const LOOK_COLS = 3;
const COLLAPSED_BAR_HEIGHT = 50;

type Tab = 'Listings' | 'Looks' | 'About' | 'Reviews';
type ShopSegment = 'forsale' | 'sold';

const PROFILE_WEB_BASE = 'https://thryftverse.app';

function getCollapsedInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function UserProfileScreen({ navigation, route }: Props) {
  // -----------------------------------------------------------------------
  // ALL HOOKS - unconditional, no early returns before this section ends
  // -----------------------------------------------------------------------
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const { show: showToast } = useToast();
  const { requireAuth } = useSignupWall();
  const { colors, isDark } = useAppTheme();
  const haptic = useHaptic();
  useVisuallyComplete('UserProfile');

  // Themed color aliases - keep JSX readable, match old module-level consts
  const BG = colors.background;
  const BORDER = colors.border;
  const MUTED = colors.textMuted;
  const TEXT = colors.textPrimary;
  const SURFACE_ALT = colors.surfaceAlt;
  const BRAND = colors.brand;
  const TEXT_INVERSE = colors.textInverse;
  // On-cover icons: always white regardless of theme. colors.textInverse flips
  // to #000000 in dark mode, making icons invisible on the dark overlay.
  const SCRIM_PRIMARY = colors.scrimTextPrimary;

  // Themed color proxy - supplements module-level `styles` with color properties
  // that cannot live in StyleSheet.create (they depend on the active theme).
  const t = {
    container: { backgroundColor: BG },
    collapsedHeader: { backgroundColor: BG, borderBottomColor: BORDER },
    collapsedAvatarMonogram: { backgroundColor: SURFACE_ALT },
    collapsedAvatarInitials: { color: MUTED },
    collapsedTitle: { color: TEXT },
    collapsedFollowingBtn: { borderColor: BORDER, backgroundColor: BG },
    collapsedFollowActiveBtn: { backgroundColor: BRAND },
    collapsedFollowText: { color: TEXT },
    collapsedFollowActiveText: { color: TEXT_INVERSE },
    stickyRailWrap: { backgroundColor: BG, borderBottomColor: BORDER },
    awayBanner: { backgroundColor: SURFACE_ALT, borderColor: BORDER },
    awayBannerTitle: { color: TEXT },
    awayBannerSub: { color: MUTED },
    announcementText: { color: TEXT },
    traderClassification: { color: TEXT },
    traderDetail: { color: MUTED },
    listStateTitle: { color: TEXT },
    listStateSub: { color: MUTED },
    aboutSectionTitle: { color: TEXT },
    aboutRow: { borderBottomColor: BORDER },
    aboutLabel: { color: MUTED },
    aboutValue: { color: TEXT },
  };


  const [activeTab, setActiveTab] = useState<Tab>('Listings');
  const [shopSegment, setShopSegment] = useState<ShopSegment>('forsale');
  const [connectionsSheet, setConnectionsSheet] = useState<{ visible: boolean; segment: 'followers' | 'following' }>({ visible: false, segment: 'followers' });
  const [moreSheetVisible, setMoreSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [collapsedVisible, setCollapsedVisible] = useState(false);
  const [stickyRailVisible, setStickyRailVisible] = useState(false);
  const [responseComposer, setResponseComposer] = useState<{
    visible: boolean;
    reviewId: string;
    reviewerName?: string;
    rating?: number;
  }>({ visible: false, reviewId: '' });
  const [reportSheet, setReportSheet] = useState<{ visible: boolean; reviewId: string }>({ visible: false, reviewId: '' });

  // UserProfile is a public-only projection. Self-navigation is normalised
  // to the MyProfile tab by the openProfile() resolver before this screen
  // mounts. If a self-ID somehow reaches this screen (e.g. stale deep
  // link), redirect to the owner tab instead of rendering owner data.
  const userId = route.params?.userId;
  const targetUserId = userId;
  const currentUserId = useStore(s => s.currentUser?.id);
  useEffect(() => {
    if (userId && currentUserId && userId === currentUserId) {
      navigation.replace('MainTabs', { screen: 'Profile' });
    }
  }, [userId, currentUserId, navigation]);

  useEffect(() => {
    if (userId && userId !== currentUserId) {
      track('profile_viewed', { user_id: userId });
    }
  }, [userId, currentUserId]);

  const publicProfileQuery = usePublicProfileQuery(userId);
  const activeListingsQuery = useUserListingsInfinite(targetUserId, 'active');
  const soldListingsQuery = useUserListingsInfinite(targetUserId, 'sold');
  const looksQuery = useUserLooksInfinite(targetUserId);
  const reviewsQuery = useSellerReviewsInfinite(targetUserId);

  // Seller trust summary - verified badge, response time, dispatch time, completed sales.
  // This provides the detailed trust signals (response rate, dispatch time, badges)
  // that complement the aggregate's verification flags and away state.
  const { data: sellerTrust } = useSellerTrust(targetUserId ?? undefined);

  // Authoritative away state from the profile aggregate — replaces the
  // previous useSellerTrust-derived holiday mode. The aggregate is the
  // source-of-truth for the public profile projection.
  const awayState = publicProfileQuery.away ?? null;

  // DSA Article 30 trader disclosure from the aggregate.
  // Legally required in EU/UK — buyers must know if they're transacting
  // with a business (trader) or a private individual (non-trader).
  const traderDisclosure = publicProfileQuery.trader ?? null;

  // Published storefront summary from the aggregate.
  // Contains the seller's shop announcement, section titles, and
  // server-owned featured listing IDs for ordering.
  const storefrontSummary = publicProfileQuery.storefront ?? null;

  // Story highlights — fetched for the highlights rail below the ProfileHero.
  // Renders nothing when empty (truthful UI — no fabricated placeholder content).
  const [highlights, setHighlights] = useState<PosterHighlight[]>([]);
  useEffect(() => {
    if (!targetUserId) return;
    let cancelled = false;
    fetchPosterHighlights(targetUserId)
      .then((res) => { if (!cancelled) setHighlights(res.items ?? []); })
      .catch(() => { if (!cancelled) setHighlights([]); });
    return () => { cancelled = true; };
  }, [targetUserId]);

  const followMutation = useFollowMutation(targetUserId ?? '');
  const blockMutation = useBlockMutation(targetUserId ?? '');
  const reportMutation = useReportUserMutation(targetUserId ?? '');

  const { formatFromFiat } = useFormattedPrice();

  // Responsive geometry
  const cardWidth = useMemo(() => (screenWidth - Space.md * 2 - GRID_GAP * (SHOP_COLS - 1)) / SHOP_COLS, [screenWidth]);
  const cardHeight = cardWidth * CARD_ASPECT;
  const lookTileWidth = useMemo(() => (screenWidth - Space.md * 2 - LOOK_GAP * (LOOK_COLS - 1)) / LOOK_COLS, [screenWidth]);
  const lookTileHeight = lookTileWidth * (4 / 3);

  // Derived profile data
  const publicProfile = publicProfileQuery.data ?? null;
  const profileAggregate = publicProfileQuery.aggregate ?? null;
  const isLoadingProfile = publicProfileQuery.isLoading;
  const profileError = publicProfileQuery.error ? 'Unable to load profile. Tap to retry.' : null;
  const stats: PublicProfileStats | null = profileAggregate?.stats ?? null;
  const viewer: PublicProfileViewer | null = profileAggregate?.viewer ?? null;

  const targetProfile = publicProfile;
  const displayUsername = targetProfile?.username ?? 'Thryft user';
  const displayHandle = targetProfile ? `@${targetProfile.username}` : '';
  const displayAvatar = targetProfile?.avatar || undefined;
  const displayCover = targetProfile?.coverPhoto || '';
  const memberSince = targetProfile?.createdAt ? new Date(targetProfile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : undefined;

  const profileDeepLink = useMemo(() => targetUserId ? `${PROFILE_WEB_BASE}/u/${encodeURIComponent(targetUserId)}` : PROFILE_WEB_BASE, [targetUserId]);

  // Tab counts - ratingAverage consumed by ProfileHero via stats
  const activeCount = stats?.activeListingCount ?? 0;
  const soldCount = stats?.soldListingCount ?? 0;
  const lookCount = stats?.publishedLookCount ?? 0;
  const reviewCount = stats?.reviewCount ?? 0;

  // List data
  const listData = useMemo(() => {
    if (activeTab === 'About') return [];
    if (activeTab === 'Listings') {
      const query = shopSegment === 'forsale' ? activeListingsQuery : soldListingsQuery;
      const pages = query.data?.pages ?? [];
      const items: ListingApiItem[] = [];
      for (const page of pages) for (const item of page.items) items.push(item);
      // Server-owned featured listing ranks from the storefront aggregate.
      // The backend determines which listings are featured and their rank
      // order via storefront_featured_listings. We apply the server's rank
      // order to the grid — featured listings appear first in rank order,
      // non-featured listings follow in their original backend order.
      // This is NOT client-side featured derivation — it's applying the
      // server's authoritative ranking.
      const featuredIds = storefrontSummary?.featuredListingIds;
      if (featuredIds && featuredIds.length > 0 && shopSegment === 'forsale') {
        const rankMap = new Map<string, number>();
        featuredIds.forEach((id, idx) => rankMap.set(id, idx));
        const featured: ListingApiItem[] = [];
        const rest: ListingApiItem[] = [];
        for (const item of items) {
          if (rankMap.has(item.id)) {
            featured.push(item);
          } else {
            rest.push(item);
          }
        }
        featured.sort((a, b) => (rankMap.get(a.id) ?? 0) - (rankMap.get(b.id) ?? 0));
        return [...featured, ...rest];
      }
      return items;
    }
    if (activeTab === 'Looks') {
      const pages = looksQuery.data?.pages ?? [];
      const items: LookApiItem[] = [];
      for (const page of pages) for (const item of page.items) items.push(item);
      return items;
    }
    const pages = reviewsQuery.data?.pages ?? [];
    const items: SellerReviewItem[] = [];
    for (const page of pages) for (const item of page.items) items.push(item);
    return items;
  }, [activeTab, shopSegment, activeListingsQuery.data, soldListingsQuery.data, looksQuery.data, reviewsQuery.data, storefrontSummary]);

  // Curated shop window — featured listings for the ShopRail. Uses the
  // server-owned featuredListingIds from the storefront aggregate to pick
  // the curated selection. ShopRail renders nothing when empty.
  const shopRailItems = useMemo<ShopRailItem[]>(() => {
    const featuredIds = storefrontSummary?.featuredListingIds;
    if (!featuredIds || featuredIds.length === 0) return [];
    const pages = activeListingsQuery.data?.pages ?? [];
    const allItems: ListingApiItem[] = [];
    for (const page of pages) for (const item of page.items) allItems.push(item);
    const rankMap = new Map<string, number>();
    featuredIds.forEach((id, idx) => rankMap.set(id, idx));
    return allItems
      .filter((item) => rankMap.has(item.id))
      .sort((a, b) => (rankMap.get(a.id) ?? 0) - (rankMap.get(b.id) ?? 0))
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        title: item.title,
        price: item.priceGbp,
        imageUri: item.images?.[0] ?? item.imageUrl ?? '',
        brand: item.brand,
        isSold: item.status === 'sold',
        isPinned: true,
      }));
  }, [storefrontSummary, activeListingsQuery.data]);

  const activeQuery = activeTab === 'Listings' ? (shopSegment === 'forsale' ? activeListingsQuery : soldListingsQuery) : activeTab === 'Looks' ? looksQuery : activeTab === 'About' ? activeListingsQuery : reviewsQuery;
  const isRefreshing = activeQuery.isRefetching;
  const hasNextPage = Boolean(activeQuery.hasNextPage);
  const isFetchingNextPage = activeQuery.isFetchingNextPage;
  const reviewSummary: SellerReviewSummary | null = reviewsQuery.data?.pages?.[0]?.summary ?? null;

  // Scroll / header animation
  const scrollY = useSharedValue(0);
  const collapsedShared = useSharedValue(false);
  const stickyShared = useSharedValue(false);
  const stickyThreshold = useSharedValue(9999);

  // -- Per-destination scroll offset preservation --
  // Declared before the scroll handler so saveScrollOffset is accessible
  // in the animatedScrollHandler closure (temporal dead zone safety).
  const scrollOffsets = useRef<Record<string, number>>({});
  const currentDestination: string = activeTab === 'Listings' ? `${activeTab}-${shopSegment}` : activeTab;
  const listRef = useRef<any>(null);
  const pendingRestore = useRef<string | null>(null);
  const isListReady = useRef(false);

  const saveScrollOffset = useCallback((offset: number) => {
    scrollOffsets.current[currentDestination] = offset;
  }, [currentDestination]);

  // Scroll handler - animated on native (UI-thread), plain JS on web.
  // The web fallback is required because useAnimatedScrollHandler does not
  // receive scroll events from FlashList in Reanimated 4.x (issue #9266).
  const animatedScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      runOnJS(saveScrollOffset)(e.contentOffset.y);
      const collapsedAt = COVER_HEIGHT - 60;
      if (e.contentOffset.y > collapsedAt && !collapsedShared.value) {
        collapsedShared.value = true;
        runOnJS(setCollapsedVisible)(true);
      } else if (e.contentOffset.y <= collapsedAt && collapsedShared.value) {
        collapsedShared.value = false;
        runOnJS(setCollapsedVisible)(false);
      }
      const stickyAt = stickyThreshold.value;
      if (e.contentOffset.y > stickyAt && !stickyShared.value) {
        stickyShared.value = true;
        runOnJS(setStickyRailVisible)(true);
      } else if (e.contentOffset.y <= stickyAt && stickyShared.value) {
        stickyShared.value = false;
        runOnJS(setStickyRailVisible)(false);
      }
    },
  });

  const webScrollHandler = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    scrollY.value = offsetY;
    saveScrollOffset(offsetY);
    const collapsedAt = COVER_HEIGHT - 60;
    if (offsetY > collapsedAt && !collapsedShared.value) {
      collapsedShared.value = true;
      setCollapsedVisible(true);
    } else if (offsetY <= collapsedAt && collapsedShared.value) {
      collapsedShared.value = false;
      setCollapsedVisible(false);
    }
    const stickyAt = stickyThreshold.value;
    if (offsetY > stickyAt && !stickyShared.value) {
      stickyShared.value = true;
      setStickyRailVisible(true);
    } else if (offsetY <= stickyAt && stickyShared.value) {
      stickyShared.value = false;
      setStickyRailVisible(false);
    }
  }, [stickyThreshold]);

  const scrollHandler = Platform.OS === 'web' ? webScrollHandler : animatedScrollHandler;

  const topUtilityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  const collapsedHeaderStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: collapsedShared.value ? 1 : 0 };
    const opacity = interpolate(scrollY.value, [COVER_HEIGHT - 80, COVER_HEIGHT - 20], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  const collapsedHeaderShadowStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(scrollY.value, [COVER_HEIGHT - 80, COVER_HEIGHT - 20], [0, 0.06], Extrapolation.CLAMP);
    return { shadowOpacity };
  });

  const stickyRailStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: stickyShared.value ? 1 : 0 };
    const threshold = stickyThreshold.value;
    const opacity = interpolate(scrollY.value, [threshold - 20, threshold + 20], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  // Handlers
  const handleShare = useCallback(async () => {
    haptic.light();
    try {
      await Share.share({ message: `${displayUsername} on Thryftverse - ${profileDeepLink}`, url: Platform.OS === 'ios' ? profileDeepLink : undefined });
    } catch { /* ignore */ }
  }, [displayUsername, profileDeepLink, haptic]);

  const handleCopyLink = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(profileDeepLink);
      setMoreSheetVisible(false);
      showToast('Profile link copied', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  }, [profileDeepLink, showToast]);

  const handleMessageProfile = useCallback(() => {
    haptic.light();
    if (!requireAuth('message_seller')) return;
    if (!targetUserId) return;
    if (viewer && !viewer.canMessage) return;
    navigation.navigate('NewMessage', { preselectedUserId: targetUserId, preselectedDisplayName: displayUsername });
  }, [requireAuth, displayUsername, navigation, targetUserId, viewer, haptic]);

  const handleFollowToggle = useCallback(() => {
    haptic.light();
    if (!requireAuth('follow_seller')) return;
    if (targetUserId && viewer) followMutation.mutate(!viewer.isFollowing);
  }, [requireAuth, targetUserId, viewer, followMutation, haptic]);
  const handleMore = useCallback(() => setMoreSheetVisible(true), []);
  const handleReport = useCallback(() => { setMoreSheetVisible(false); setReportSheetVisible(true); }, []);
  const handleBlock = useCallback(() => { setMoreSheetVisible(false); setBlockConfirmVisible(true); }, []);

  const handleRespondToReview = useCallback(async (reviewId: string, text: string) => {
    await respondToReview(reviewId, text);
    reviewsQuery.refetch();
  }, [reviewsQuery]);

  const handleCloseResponseComposer = useCallback(() => {
    setResponseComposer((prev) => ({ ...prev, visible: false }));
  }, []);
  const confirmBlock = useCallback(() => {
    setBlockConfirmVisible(false);
    blockMutation.mutate(true, { onSuccess: () => showToast('User blocked', 'success'), onError: () => showToast('Could not block user', 'error') });
  }, [blockMutation, showToast]);
  const handleUnblock = useCallback(() => {
    setMoreSheetVisible(false);
    blockMutation.mutate(false, { onSuccess: () => showToast('User unblocked', 'success'), onError: () => showToast('Could not unblock user', 'error') });
  }, [blockMutation, showToast]);
  const openConnections = useCallback((segment: 'followers' | 'following') => setConnectionsSheet({ visible: true, segment }), []);
  const handleLoadMore = useCallback(() => { if (hasNextPage && !isFetchingNextPage) activeQuery.fetchNextPage(); }, [hasNextPage, isFetchingNextPage, activeQuery]);
  const handleRefresh = useCallback(() => { activeQuery.refetch(); publicProfileQuery.refetch(); }, [activeQuery, publicProfileQuery]);
  const onTabRailLayout = useCallback((y: number) => { stickyThreshold.value = y - (insets.top + COLLAPSED_BAR_HEIGHT); }, [insets.top]);

  // When destination changes, queue a restore - no setTimeout during render
  const prevDestination = useRef<string>(currentDestination);
  useEffect(() => {
    if (prevDestination.current !== currentDestination) {
      prevDestination.current = currentDestination;
      isListReady.current = false;
      pendingRestore.current = currentDestination;
    }
  }, [currentDestination]);

  // Restore scroll position after the new list content is measured
  const handleContentSizeChange = useCallback(() => {
    if (pendingRestore.current && listRef.current) {
      const dest = pendingRestore.current;
      pendingRestore.current = null;
      const saved = scrollOffsets.current[dest];
      if (saved !== undefined && saved > 0) {
        listRef.current.scrollToOffset?.({ offset: saved, animated: false });
        // Update overlay state from the restored offset
        const collapsedAt = COVER_HEIGHT - 60;
        const stickyAt = stickyThreshold.value;
        const shouldCollapse = saved > collapsedAt;
        const shouldSticky = saved > stickyAt;
        if (shouldCollapse !== collapsedShared.value) {
          collapsedShared.value = shouldCollapse;
          setCollapsedVisible(shouldCollapse);
        }
        if (shouldSticky !== stickyShared.value) {
          stickyShared.value = shouldSticky;
          setStickyRailVisible(shouldSticky);
        }
      } else {
        // No previous offset - if currently collapsed, start at sticky threshold
        if (collapsedShared.value) {
          const stickyAt = stickyThreshold.value;
          if (stickyAt < 9999 && listRef.current) {
            listRef.current.scrollToOffset?.({ offset: stickyAt + 1, animated: false });
          }
        }
      }
    }
    isListReady.current = true;
  }, [stickyThreshold]);

  // Render item
  const renderItem = useCallback(({ item }: { item: ListingApiItem | LookApiItem | SellerReviewItem }): React.ReactElement | null => {
    if (activeTab === 'Listings') {
      return <ProfileShopTile item={item as ListingApiItem} isSold={shopSegment === 'sold'} onPress={() => navigation.push('ItemDetail', { itemId: (item as ListingApiItem).id })} formatPrice={formatFromFiat} cardWidth={cardWidth} cardHeight={cardHeight} />;
    }
    if (activeTab === 'Looks') {
      return <ProfileLookTile item={item as LookApiItem} onPress={() => navigation.navigate('LookDetail', { lookId: (item as LookApiItem).id })} cardWidth={lookTileWidth} cardHeight={lookTileHeight} gap={LOOK_GAP} />;
    }
    const reviewItem = item as SellerReviewItem;
    return (
      <ProfileReviewRow
        item={reviewItem}
        onOpenReviewer={(uid) => openProfile(navigation, uid, currentUserId)}
        onOpenListing={(lid) => navigation.navigate('ItemDetail', { itemId: lid })}
        onRespond={targetUserId === currentUserId
          ? (reviewId, reviewerName, rating) => setResponseComposer({ visible: true, reviewId, reviewerName, rating })
          : undefined}
        onReport={targetUserId !== currentUserId
          ? (reviewId) => setReportSheet({ visible: true, reviewId })
          : undefined}
      />
    );
  }, [activeTab, shopSegment, navigation, formatFromFiat, cardWidth, cardHeight, lookTileWidth, lookTileHeight, targetUserId, currentUserId]);

  // -----------------------------------------------------------------------
  // DERIVED RENDER STATE - after all hooks
  // -----------------------------------------------------------------------
  const isBlockedByTarget = viewer?.isBlockedByTarget && !viewer.isSelf;
  const isBlocked = viewer?.isBlocked ?? false;
  const canMessage = viewer?.canMessage ?? false;

  // State labels - rendered by ProfileStates subcomponents:
  // "Profile unavailable" (ProfileUnavailableState)
  // "You've been blocked" (ProfileBlockedState)
  // canMessage gates the Message button (ProfileHero)

  // -----------------------------------------------------------------------
  // CONDITIONAL RENDERS - loading, error, unavailable, blocked
  // -----------------------------------------------------------------------
  if (isLoadingProfile && !targetProfile) {
    return <ProfileSkeleton coverHeight={COVER_HEIGHT} screenWidth={screenWidth} destination={activeTab as 'Listings' | 'Looks' | 'About' | 'Reviews'} />;
  }
  if (profileError && !targetProfile) {
    return <ProfileErrorState onRetry={() => publicProfileQuery.refetch()} onBack={() => navigation.goBack()} coverHeight={COVER_HEIGHT} />;
  }
  if (!targetProfile) {
    // Renders "Profile unavailable" state
    return <ProfileUnavailableState onBack={() => navigation.goBack()} coverHeight={COVER_HEIGHT} />;
  }
  if (isBlockedByTarget) {
    // Renders "You've been blocked" state
    return <ProfileBlockedState onBack={() => navigation.goBack()} onShare={handleShare} coverHeight={COVER_HEIGHT} />;
  }

  // -----------------------------------------------------------------------
  // MAIN RENDER
  // -----------------------------------------------------------------------
  const numColumns = activeTab === 'Reviews' || activeTab === 'About' ? 1 : activeTab === 'Looks' ? LOOK_COLS : SHOP_COLS;

  const listHeader = (
    <View>
      <ProfileHero
        targetProfile={targetProfile}
        displayUsername={displayUsername}
        displayAvatar={displayAvatar}
        displayCover={displayCover}
        isSelfProfile={false}
        viewer={viewer}
        stats={stats}
        activeCount={activeCount}
        soldCount={soldCount}
        reviewCount={reviewCount}
        memberSince={memberSince}
        sellerTrust={sellerTrust}
        traderClassification={traderDisclosure}
        followPending={followMutation.isPending}
        isBlocked={isBlocked}
        scrollY={scrollY}
        reducedMotion={reducedMotion}
        onFollowToggle={handleFollowToggle}
        onMessage={handleMessageProfile}
        onMore={handleMore}
        onShare={handleShare}
        onOpenConnections={openConnections}
        onTabSelect={(t) => setActiveTab(t)}
        onShopSegmentSelect={(s) => setShopSegment(s)}
      />

      {/* Away-mode banner - shown when the profile aggregate reports holiday mode.
          The aggregate is the authoritative source for away state (privacy-aware,
          viewer-dependent). sellerTrust is a secondary signal for detailed trust. */}
      {awayState?.holidayMode === true ? (
        <View style={[styles.awayBanner, t.awayBanner]}>
          <Ionicons name="pause-circle" size={18} color={MUTED} />
          <View style={styles.awayBannerTextWrap}>
            <Text style={[styles.awayBannerTitle, t.awayBannerTitle]}>
              This shop is on holiday
            </Text>
            <Text style={[styles.awayBannerSub, t.awayBannerSub]}>
              {awayState.awayMessage?.trim()
                ? awayState.awayMessage.trim()
                : 'The seller is away right now. Listings are paused and will return when they are back.'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Storefront announcement — the seller's shop greeting.
          Only rendered when a published storefront with an announcement exists.
          No decorative container — just text with spacing, per anti-AI design. */}
      {storefrontSummary?.announcement?.trim() ? (
        <View style={styles.announcementWrap}>
          <Text style={[styles.announcementText, t.announcementText]}>
            {storefrontSummary.announcement.trim()}
          </Text>
        </View>
      ) : null}

      {/* DSA Article 30 trader disclosure — legally required in EU/UK.
          Subtle, factual, no decorative chrome. Buyers must know whether
          they are transacting with a business or a private individual.
          Legal details (name, address, registration) are only shown for
          verified traders — non-traders see only the classification. */}
      {traderDisclosure ? (
        <View style={styles.traderDisclosureWrap}>
          <Text style={[styles.traderClassification, t.traderClassification]}>
            {traderDisclosure.classification === 'trader'
              ? 'Business seller'
              : 'Private seller'}
          </Text>
          {traderDisclosure.classification === 'trader' && traderDisclosure.legalName ? (
            <Text style={[styles.traderDetail, t.traderDetail]}>
              {traderDisclosure.legalName}
            </Text>
          ) : null}
          {traderDisclosure.classification === 'trader' && traderDisclosure.address ? (
            <Text style={[styles.traderDetail, t.traderDetail]}>
              {traderDisclosure.address}
            </Text>
          ) : null}
          {traderDisclosure.classification === 'trader' && traderDisclosure.registrationNumber ? (
            <Text style={[styles.traderDetail, t.traderDetail]}>
              Reg: {traderDisclosure.registrationNumber}
            </Text>
          ) : null}
          {traderDisclosure.classification === 'trader' && traderDisclosure.vatNumber ? (
            <Text style={[styles.traderDetail, t.traderDetail]}>
              VAT: {traderDisclosure.vatNumber}
            </Text>
          ) : null}
          {traderDisclosure.classification === 'trader' && traderDisclosure.contactEmail ? (
            <Text style={[styles.traderDetail, t.traderDetail]}>
              {traderDisclosure.contactEmail}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Story highlights rail — renders only when highlights exist.
          No "New" tile for public profiles (viewer is not the owner). */}
      {highlights.length > 0 ? (
        <PosterHighlightsRail
          highlights={highlights}
          isOwner={false}
          onOpenHighlight={(highlightId) => {
            navigation.navigate('PosterHighlightViewer', { highlightId });
          }}
          onHighlightLongPress={(highlightId) => {
            navigation.navigate('PosterHighlightViewer', { highlightId });
          }}
        />
      ) : null}

      {/* Curated shop window — horizontal rail of featured listings.
          Renders only when the storefront aggregate provides featured IDs
          and matching listings are loaded (ShopRail returns null when empty). */}
      <ShopRail
        items={shopRailItems}
        onPressItem={(id) => navigation.push('ItemDetail', { itemId: id })}
      />

      {/* Tab rail - measures Y for sticky threshold */}
      <View onLayout={(e) => onTabRailLayout(e.nativeEvent.layout.y)}>
        <TabRail
          tabs={[
            { key: 'Listings', label: 'Listings', count: activeCount + soldCount },
            { key: 'Looks', label: 'Looks', count: lookCount },
            { key: 'About', label: 'About' },
            ...(reviewCount > 0 ? [{ key: 'Reviews' as const, label: 'Reviews', count: reviewCount }] : []),
          ]}
          activeKey={activeTab as any}
          onChange={(k) => setActiveTab(k as Tab)}
          reducedMotion={reducedMotion}
        />
      </View>

      {activeTab === 'Listings' ? (
        <View style={styles.segmentWrap}>
          <SegmentedControl
            segments={[{ key: 'forsale', label: 'For sale' }, { key: 'sold', label: 'Sold' }]}
            activeKey={shopSegment}
            onChange={(k) => setShopSegment(k as ShopSegment)}
            reducedMotion={reducedMotion}
          />
        </View>
      ) : null}

      {activeTab === 'Reviews' && reviewSummary && reviewCount > 0 ? (
        <ReviewSummaryBlock summary={reviewSummary} />
      ) : null}


    </View>
  );

  const listEmpty = (() => {
    // About tab — static editorial content, not a paginated list.
    // Renders bio, website, shop policies and trust signals. Bypasses the
    // loading/error/empty states of the listing queries since the data is
    // already resolved by the public profile aggregate.
    if (activeTab === 'About') {
      const bio = targetProfile?.bio?.trim();
      const website = targetProfile?.website?.trim();
      const hasPolicies = Boolean(sellerTrust);
      const hasAboutContent = Boolean(bio || website || hasPolicies || storefrontSummary?.announcement?.trim());
      if (!hasAboutContent) {
        return (
          <View style={styles.listState}>
            <Text style={[styles.listStateTitle, t.listStateTitle]}>No additional details</Text>
            <Text style={[styles.listStateSub, t.listStateSub]}>This seller hasn't added an about section yet.</Text>
          </View>
        );
      }
      return (
        <View style={{ paddingTop: Space.md, paddingBottom: 100 }}>
          {storefrontSummary?.announcement?.trim() ? (
            <View style={styles.aboutContainer}>
              <Text style={[styles.announcementText, t.announcementText]}>
                {storefrontSummary.announcement.trim()}
              </Text>
            </View>
          ) : null}

          {bio ? (
            <View style={styles.aboutContainer}>
              <Text style={[styles.aboutSectionTitle, t.aboutSectionTitle]}>About</Text>
              <Text style={[styles.aboutBio, t.aboutValue]}>{bio}</Text>
            </View>
          ) : null}

          {website ? (
            <View style={styles.aboutContainer}>
              <View style={[styles.aboutRow, t.aboutRow, styles.aboutRowLast]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>Website</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs }}>
                  <Text style={[styles.aboutValue, t.aboutValue, { flexShrink: 1 }]} numberOfLines={1}>{website}</Text>
                  <Ionicons name="open-outline" size={12} color={MUTED} aria-hidden={true} />
                </View>
              </View>
            </View>
          ) : null}

          {/* Shop policies — dispatch/response details from seller trust. */}
          <View style={styles.aboutContainer}>
            <Text style={[styles.aboutSectionTitle, t.aboutSectionTitle]}>Shop policies</Text>
            <View style={[styles.aboutRow, t.aboutRow]}>
              <Text style={[styles.aboutLabel, t.aboutLabel]}>Payments</Text>
              <Text style={[styles.aboutValue, t.aboutValue]}>Secure checkout with buyer protection</Text>
            </View>
            <View style={[styles.aboutRow, t.aboutRow]}>
              <Text style={[styles.aboutLabel, t.aboutLabel]}>Shipping</Text>
              <Text style={[styles.aboutValue, t.aboutValue]}>
                {sellerTrust?.dispatchTimeLabel
                  ? `Seller ${sellerTrust.dispatchTimeLabel.toLowerCase()}. Tracking provided on dispatch.`
                  : 'Tracking provided on dispatch.'}
              </Text>
            </View>
            <View style={[styles.aboutRow, t.aboutRow]}>
              <Text style={[styles.aboutLabel, t.aboutLabel]}>Returns</Text>
              <Text style={[styles.aboutValue, t.aboutValue]}>Returns accepted for items not as described.</Text>
            </View>
            {sellerTrust?.responseRate !== null && sellerTrust?.responseRate !== undefined ? (
              <View style={[styles.aboutRow, t.aboutRow]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>Response rate</Text>
                <Text style={[styles.aboutValue, t.aboutValue]}>{sellerTrust.responseRate}%</Text>
              </View>
            ) : null}
            <View style={[styles.aboutRow, t.aboutRow, styles.aboutRowLast]}>
              <Text style={[styles.aboutLabel, t.aboutLabel]}>Response</Text>
              <Text style={[styles.aboutValue, t.aboutValue]}>
                {sellerTrust?.responseTimeLabel
                  ? `Seller typically replies ${sellerTrust.responseTimeLabel.toLowerCase()}.`
                  : 'Seller aims to respond promptly.'}
              </Text>
            </View>
          </View>
        </View>
      );
    }
    if (activeQuery.isLoading) return null;
    if (activeQuery.error) {
      return (
        <Pressable
          style={({ pressed }) => [styles.listState, pressed && { opacity: 0.7 }]}
          onPress={() => activeQuery.refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading content"
        >
          <Ionicons name="cloud-offline-outline" size={32} color={MUTED} />
          <Text style={[styles.listStateTitle, t.listStateTitle]}>Couldn't load {activeTab === 'Listings' ? 'listings' : activeTab === 'Looks' ? 'Looks' : 'reviews'}</Text>
          <Text style={[styles.listStateSub, t.listStateSub]}>Tap to retry</Text>
        </Pressable>
      );
    }
    if (listData.length === 0) {
      if (activeTab === 'Listings') {
        return (
          <View style={styles.listState}>
            <Ionicons name="shirt-outline" size={32} color={MUTED} />
            <Text style={[styles.listStateTitle, t.listStateTitle]}>{shopSegment === 'forsale' ? 'No active listings' : 'No sold items yet'}</Text>
            <Text style={[styles.listStateSub, t.listStateSub]}>{shopSegment === 'forsale' ? 'This seller has nothing for sale right now.' : 'Sold items will appear here.'}</Text>
          </View>
        );
      }
      if (activeTab === 'Looks') {
        return (
          <View style={styles.listState}>
            <Ionicons name="images-outline" size={32} color={MUTED} />
            <Text style={[styles.listStateTitle, t.listStateTitle]}>No published Looks</Text>
            <Text style={[styles.listStateSub, t.listStateSub]}>This creator hasn't published any Looks yet.</Text>
          </View>
        );
      }
      return (
        <View style={styles.listState}>
          <Ionicons name="chatbubble-ellipses-outline" size={32} color={MUTED} />
          <Text style={[styles.listStateTitle, t.listStateTitle]}>No reviews yet</Text>
          <Text style={[styles.listStateSub, t.listStateSub]}>Reviews from completed orders will appear here.</Text>
        </View>
      );
    }
    return null;
  })();

  const listFooter = isFetchingNextPage ? (
    <View style={styles.loadMoreIndicator}><ActivityIndicator size="small" color={MUTED} /></View>
  ) : <View style={{ height: DockConstants.singleActionHeight }} />;

  return (
    <View style={[styles.container, t.container]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={BG} />

      <OfflineBanner onRetry={() => void handleRefresh()} />

      {/* Top utility controls - overlay cover, fade out on scroll */}
      <View pointerEvents="box-none" style={styles.coverActionLayer}>
        <Reanimated.View
          style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }, topUtilityStyle]}
          pointerEvents={collapsedVisible ? 'none' : 'auto'}
        >
          <AnimatedPressable
            style={[styles.topUtilityIconBtn, { backgroundColor: colors.overlay }]}
            activeOpacity={0.9}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            accessibilityHint="Returns to previous screen"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="arrow-back" size={18} color={SCRIM_PRIMARY} />
          </AnimatedPressable>
          <View style={styles.topUtilityRight}>
            <AnimatedPressable
              style={[styles.topUtilityIconBtn, { backgroundColor: colors.overlay }]}
              activeOpacity={0.9}
              onPress={handleShare}
              accessibilityLabel="Share profile"
              accessibilityRole="button"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Ionicons name="share-outline" size={18} color={SCRIM_PRIMARY} />
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.topUtilityIconBtn, { backgroundColor: colors.overlay }]}
              activeOpacity={0.9}
              onPress={handleMore}
              accessibilityLabel="More options"
              accessibilityRole="button"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={SCRIM_PRIMARY} />
            </AnimatedPressable>
          </View>
        </Reanimated.View>
      </View>

      {/* Collapsed header - total height = insets.top + COLLAPSED_BAR_HEIGHT, paddingTop = insets.top, inner row = COLLAPSED_BAR_HEIGHT */}
      <Reanimated.View
        style={[styles.collapsedHeader, t.collapsedHeader, { height: insets.top + COLLAPSED_BAR_HEIGHT, paddingTop: insets.top }, collapsedHeaderStyle, collapsedHeaderShadowStyle]}
        pointerEvents={collapsedVisible ? 'auto' : 'none'}
      >
        <AnimatedPressable
          style={styles.collapsedBackBtn}
          activeOpacity={0.85}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={18} color={TEXT} />
        </AnimatedPressable>
        <View style={styles.collapsedCenter}>
          {displayAvatar ? (
            <CachedImage
              uri={displayAvatar}
              style={styles.collapsedAvatar}
              containerStyle={{ width: 28, height: 28, borderRadius: RadiusRoleValue.pillAvatar }}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.collapsedAvatar, styles.collapsedAvatarMonogram, t.collapsedAvatarMonogram]}>
              <Text style={[styles.collapsedAvatarInitials, t.collapsedAvatarInitials]}>
                {getCollapsedInitials(targetProfile?.displayName || displayUsername)}
              </Text>
            </View>
          )}
          <Text style={[styles.collapsedTitle, t.collapsedTitle]} numberOfLines={1} ellipsizeMode="tail">
            {targetProfile?.displayName || displayUsername}
          </Text>
        </View>
        <View style={styles.collapsedRight}>
          {viewer ? (
            <AnimatedPressable
              style={[styles.collapsedFollowBtn, viewer.isFollowing ? [styles.collapsedFollowingBtn, t.collapsedFollowingBtn] : [styles.collapsedFollowActiveBtn, t.collapsedFollowActiveBtn], (followMutation.isPending || isBlocked) && styles.btnDisabled]}
              onPress={handleFollowToggle}
              activeOpacity={0.85}
              disabled={followMutation.isPending || isBlocked}
              accessibilityRole="button"
              accessibilityLabel={viewer.isFollowing ? 'Unfollow' : 'Follow'}
            >
              <Text style={[styles.collapsedFollowText, t.collapsedFollowText, viewer.isFollowing ? {} : [styles.collapsedFollowActiveText, t.collapsedFollowActiveText]]}>
                {viewer.isFollowing ? 'Following' : 'Follow'}
              </Text>
            </AnimatedPressable>
          ) : null}
          <AnimatedPressable
            style={styles.collapsedIconBtn}
            onPress={handleShare}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share profile"
          >
            <Ionicons name="share-outline" size={16} color={TEXT} />
          </AnimatedPressable>
        </View>
      </Reanimated.View>

      {/* Sticky tab rail - external overlay, appears when original scrolls past */}
      <Reanimated.View
        style={[styles.stickyRailWrap, t.stickyRailWrap, { top: insets.top + COLLAPSED_BAR_HEIGHT }, stickyRailStyle]}
        pointerEvents={stickyRailVisible ? 'auto' : 'none'}
      >
        <TabRail
          tabs={[
            { key: 'Listings', label: 'Listings', count: activeCount + soldCount },
            { key: 'Looks', label: 'Looks', count: lookCount },
            { key: 'About', label: 'About' },
            ...(reviewCount > 0 ? [{ key: 'Reviews' as const, label: 'Reviews', count: reviewCount }] : []),
          ]}
          activeKey={activeTab as any}
          onChange={(k) => setActiveTab(k as Tab)}
          reducedMotion={reducedMotion}
        />
        {activeTab === 'Listings' ? (
          <View style={styles.stickySegmentWrap}>
            <SegmentedControl
              segments={[{ key: 'forsale', label: 'For sale' }, { key: 'sold', label: 'Sold' }]}
              activeKey={shopSegment}
              onChange={(k) => setShopSegment(k as ShopSegment)}
              reducedMotion={reducedMotion}
            />
          </View>
        ) : null}
      </Reanimated.View>

      {/* Content list - cover scrolls naturally as first header item.
          On native: FlashList for virtualization + recycling.
          On web: ScrollView + map because FlashList v2 crashes on web
          ("Changing onViewableItemsChanged on the fly is not supported"
          - FlashList v2 internally passes a new callback to FlatList). */}
      {Platform.OS === 'web' ? (
        <ScrollView
          ref={(r: any) => { if (r && listRef.current !== r) listRef.current = r; }}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler as any}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={MUTED} colors={[MUTED]} />}
          onContentSizeChange={handleContentSizeChange}
        >
          {listHeader}
          {listEmpty && (
            <Reanimated.View
              key={currentDestination}
              entering={reducedMotion ? undefined : FadeIn.duration(200)}
            >
              {listEmpty}
            </Reanimated.View>
          )}
          {listData.length > 0 && (
            numColumns > 1 ? (
              <View style={{ paddingHorizontal: Space.md, flexDirection: 'row', flexWrap: 'wrap', gap: activeTab === 'Listings' ? GRID_GAP : LOOK_GAP }}>
                {listData.map((item, index) => {
                  const rendered = renderItem({ item });
                  return rendered ? <View key={(item as { id?: string }).id ?? `item-${index}`} style={{ width: cardWidth }}>{rendered}</View> : null;
                })}
              </View>
            ) : (
              <View>
                {listData.map((item, index) => {
                  const rendered = renderItem({ item });
                  return rendered ? <View key={(item as { id?: string }).id ?? `item-${index}`}>{rendered}</View> : null;
                })}
              </View>
            )
          )}
          {listFooter}
        </ScrollView>
      ) : (
        <AnimatedFlashList
          ref={listRef}
          data={listData as (ListingApiItem | LookApiItem | SellerReviewItem)[]}
          renderItem={renderItem}
          keyExtractor={(item: ListingApiItem | LookApiItem | SellerReviewItem, index: number) => (item as { id?: string }).id ?? `item-${index}`}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty ? (
            <Reanimated.View
              key={currentDestination}
              entering={reducedMotion ? undefined : FadeIn.duration(200)}
            >
              {listEmpty}
            </Reanimated.View>
          ) : null}
          ListFooterComponent={listFooter}
          numColumns={numColumns}
          {...(numColumns > 1 ? { columnWrapperStyle: { paddingHorizontal: Space.md, gap: activeTab === 'Listings' ? GRID_GAP : LOOK_GAP } } : {})}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={MUTED} colors={[MUTED]} />}
          key={`list-${currentDestination}`}
          onContentSizeChange={handleContentSizeChange}
        />
      )}

      {/* Sheets */}
      <ProfileMoreSheet
        visible={moreSheetVisible}
        onDismiss={() => setMoreSheetVisible(false)}
        isSelfProfile={false}
        isBlocked={isBlocked}
        onShare={handleShare}
        onCopyLink={handleCopyLink}
        onReport={handleReport}
        onBlock={handleBlock}
        onUnblock={handleUnblock}
      />
      <ProfileReportSheet
        visible={reportSheetVisible}
        onDismiss={() => setReportSheetVisible(false)}
        isPending={reportMutation.isPending}
        onSubmit={(reason, details) => {
          reportMutation.mutate(
            { reason, details },
            {
              onSuccess: () => { setReportSheetVisible(false); showToast('Report submitted', 'success'); },
              onError: () => showToast('Could not submit report', 'error'),
            }
          );
        }}
      />
      <ProfileBlockConfirmSheet
        visible={blockConfirmVisible}
        onDismiss={() => setBlockConfirmVisible(false)}
        displayHandle={displayHandle}
        isPending={blockMutation.isPending}
        onConfirm={confirmBlock}
      />
      <PublicProfileConnectionsSheet
        visible={connectionsSheet.visible}
        onDismiss={() => setConnectionsSheet(s => ({ ...s, visible: false }))}
        userId={targetUserId}
        initialSegment={connectionsSheet.segment}
        followerCount={stats?.followerCount ?? 0}
        followingCount={stats?.followingCount ?? 0}
        onOpenProfile={(id) => openProfile(navigation, id, currentUserId)}
      />
      <SellerResponseComposer
        visible={responseComposer.visible}
        reviewId={responseComposer.reviewId}
        reviewerName={responseComposer.reviewerName}
        rating={responseComposer.rating}
        onClose={handleCloseResponseComposer}
        onSubmit={handleRespondToReview}
      />
      <ReviewReportSheet
        visible={reportSheet.visible}
        reviewId={reportSheet.reviewId}
        onDismiss={() => setReportSheet({ visible: false, reviewId: '' })}
        onSubmitted={() => showToast('Report submitted', 'success')}
        onError={(message) => showToast(message, 'error')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  coverActionLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: COVER_HEIGHT, zIndex: 8 },
  topUtilityRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topUtilityRight: { flexDirection: 'row', gap: Space.sm },
  topUtilityIconBtn: {
    width: Control.hit, height: Control.hit, borderRadius: RadiusRoleValue.sheetDialog,
    alignItems: 'center', justifyContent: 'center',
  },
  collapsedHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Space.sm, height: COLLAPSED_BAR_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Elevation.card,
  },
  collapsedBackBtn: { width: Control.hit, height: Control.hit, borderRadius: RadiusRoleValue.pillAvatar, alignItems: 'center', justifyContent: 'center' },
  collapsedCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.xs },
  collapsedAvatar: { width: Space.lg + Space.xs, height: Space.lg + Space.xs, borderRadius: RadiusRoleValue.pillAvatar, alignItems: 'center', justifyContent: 'center' },
  collapsedAvatarMonogram: {},
  collapsedAvatarInitials: { fontSize: TypographyV2.meta.size, fontFamily: FontFamily.bold },
  collapsedTitle: { fontSize: TypographyV2.priceList.size, fontFamily: FontFamily.semibold, letterSpacing: TypographyV2.priceList.letterSpacing - 0.1, flexShrink: 1 },
  collapsedRight: { flexDirection: 'row', alignItems: 'center', gap: Space.xs + 2 },
  collapsedFollowBtn: { height: Control.hit, paddingHorizontal: Space.md + 2, borderRadius: RadiusRoleValue.sheetDialog, alignItems: 'center', justifyContent: 'center' },
  collapsedFollowingBtn: { borderWidth: StyleSheet.hairlineWidth },
  collapsedFollowActiveBtn: {},
  collapsedFollowText: { fontSize: TypographyV2.meta.size, fontFamily: FontFamily.semibold },
  collapsedFollowActiveText: {},
  collapsedIconBtn: { width: Control.hit, height: Control.hit, borderRadius: RadiusRoleValue.pillAvatar, alignItems: 'center', justifyContent: 'center' },
  stickyRailWrap: {
    position: 'absolute', left: 0, right: 0, zIndex: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stickySegmentWrap: { paddingHorizontal: Space.md, paddingVertical: Space.sm },
  segmentWrap: { paddingHorizontal: Space.md, paddingVertical: Space.sm, flexDirection: 'row' },
  awayBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 2,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md - 2,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: StyleSheet.hairlineWidth,
  },
  awayBannerTextWrap: {
    flex: 1,
    gap: Space.xs / 2,
  },
  awayBannerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  awayBannerSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight + 1,
  },
  // Storefront announcement — seller's shop greeting. No decorative
  // container, just text with horizontal padding matching the screen.
  announcementWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  announcementText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight,
  },
  // DSA Article 30 trader disclosure — factual, no decorative chrome.
  // Hairline top separator distinguishes it from the announcement above.
  traderDisclosureWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.xs,
    gap: Space.xs / 2,
  },
  traderClassification: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  traderDetail: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  listState: { alignItems: 'center', justifyContent: 'center', paddingVertical: Space.xl, paddingHorizontal: Space.md, gap: Space.sm },
  listStateTitle: { fontSize: TypographyV2.bodyStrong.size, fontFamily: FontFamily.semibold },
  listStateSub: { fontSize: TypographyV2.meta.size, fontFamily: FontFamily.regular, textAlign: 'center' },
  loadMoreIndicator: { paddingVertical: Space.md, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  // About tab — flat editorial rows, mirroring MyProfile About composition.
  aboutContainer: { paddingHorizontal: Space.md },
  aboutSectionTitle: {
    fontSize: TypographyV2.label.size,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.label.letterSpacing,
    paddingTop: Space.md + 4,
    paddingBottom: Space.sm },
  aboutBio: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight },
  aboutRow: {
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.xs },
  aboutRowLast: { borderBottomWidth: 0 },
  aboutLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.label.letterSpacing },
  aboutValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight },
});
