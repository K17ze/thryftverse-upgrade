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
import { StackScreenProps } from '@react-navigation/stack';
import { FlashList } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { useStore } from '../store/useStore';
import { ActiveTheme, Colors } from '../constants/colors';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Space, Typography, DockConstants } from '../theme/designTokens';
import {
  type PublicProfileStats,
  type PublicProfileViewer,
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
import { useToast } from '../context/ToastContext';
import { RootStackParamList } from '../navigation/types';
import type { ListingApiItem } from '../services/listingsApi';
import type { LookApiItem } from '../services/looksApi';
import type { SellerReviewItem, SellerReviewSummary } from '../services/sellerReviewsApi';
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
import { respondToReview } from '../services/reviewApi';
import { ProfileMoreSheet, ProfileReportSheet, ProfileBlockConfirmSheet } from '../components/profile/ProfileSheets';
import { PublicProfileConnectionsSheet } from '../components/profile/PublicProfileConnectionsSheet';

const AnimatedFlashList: any = Reanimated.createAnimatedComponent(FlashList);

type Props = StackScreenProps<RootStackParamList, 'UserProfile'>;

const BG = Colors.background;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SURFACE_ALT = Colors.surfaceAlt;
const BRAND = Colors.brand;
const TEXT_INVERSE = Colors.textInverse;

const COVER_HEIGHT = 160;
const GRID_GAP = 8;
const CARD_ASPECT = 1.25;
const LOOK_GAP = 2;
const LOOK_COLS = 3;
const COLLAPSED_BAR_HEIGHT = 50;

type Tab = 'Shop' | 'Looks' | 'Reviews';
type ShopSegment = 'forsale' | 'sold';

const PROFILE_WEB_BASE = 'https://thryftverse.app';

function getCollapsedInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function UserProfileScreen({ navigation, route }: Props) {
  // ═══════════════════════════════════════════════════════════════════════
  // ALL HOOKS — unconditional, no early returns before this section ends
  // ═══════════════════════════════════════════════════════════════════════
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const { show: showToast } = useToast();

  const currentUser = useStore(s => s.currentUser);
  const userAvatar = useStore(s => s.userAvatar);
  const userCover = useStore(s => s.userCover);
  const profileMediaOverrides = useStore(s => s.profileMediaOverrides);

  const [activeTab, setActiveTab] = useState<Tab>('Shop');
  const [shopSegment, setShopSegment] = useState<ShopSegment>('forsale');
  const [connectionsSheet, setConnectionsSheet] = useState<{ visible: boolean; segment: 'followers' | 'following' }>({ visible: false, segment: 'followers' });
  const [moreSheetVisible, setMoreSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [collapsedVisible, setCollapsedVisible] = useState(false);
  const [stickyRailVisible, setStickyRailVisible] = useState(false);
  const [responseComposerState, setResponseComposerState] = useState<{
    visible: boolean;
    reviewId: string;
    reviewerName?: string;
    rating?: number;
  }>({ visible: false, reviewId: '' });

  const isMe = route.params?.isMe ?? false;
  const userId = route.params?.userId;
  const isSelfProfile = isMe || userId === currentUser?.id;
  const targetUserId = isSelfProfile ? currentUser?.id : userId;

  const publicProfileQuery = usePublicProfileQuery(isSelfProfile ? null : userId);
  const activeListingsQuery = useUserListingsInfinite(isSelfProfile ? null : targetUserId, 'active');
  const soldListingsQuery = useUserListingsInfinite(isSelfProfile ? null : targetUserId, 'sold');
  const looksQuery = useUserLooksInfinite(isSelfProfile ? null : targetUserId);
  const reviewsQuery = useSellerReviewsInfinite(isSelfProfile ? null : targetUserId);

  // Seller trust summary — verified badge, response time, dispatch time, completed sales
  const { data: sellerTrust } = useSellerTrust(targetUserId ?? undefined);

  const followMutation = useFollowMutation(targetUserId ?? '');
  const blockMutation = useBlockMutation(targetUserId ?? '');
  const reportMutation = useReportUserMutation(targetUserId ?? '');

  const { formatFromFiat } = useFormattedPrice();

  // Responsive geometry
  const cardWidth = useMemo(() => (screenWidth - Space.md * 2 - GRID_GAP) / 2, [screenWidth]);
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

  const mediaOverride = (userId ? profileMediaOverrides[userId] : undefined) ?? (currentUser ? profileMediaOverrides[currentUser.id] : undefined) ?? null;
  const targetProfile = isSelfProfile ? currentUser : publicProfile;
  const displayUsername = targetProfile?.username ?? 'Thryft user';
  const displayHandle = targetProfile ? `@${targetProfile.username}` : '';
  const displayAvatar = isSelfProfile ? targetProfile?.avatar || userAvatar || mediaOverride?.avatar || undefined : targetProfile?.avatar || undefined;
  const displayCover = isSelfProfile ? targetProfile?.coverPhoto || userCover || mediaOverride?.cover || '' : targetProfile?.coverPhoto || '';
  const memberSince = targetProfile?.createdAt ? new Date(targetProfile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : undefined;

  const profileDeepLink = useMemo(() => targetUserId ? `${PROFILE_WEB_BASE}/u/${encodeURIComponent(targetUserId)}` : PROFILE_WEB_BASE, [targetUserId]);

  // Tab counts — ratingAverage consumed by ProfileHero via stats
  const activeCount = stats?.activeListingCount ?? 0;
  const soldCount = stats?.soldListingCount ?? 0;
  const lookCount = stats?.publishedLookCount ?? 0;
  const reviewCount = stats?.reviewCount ?? 0;

  // List data
  const listData = useMemo(() => {
    if (activeTab === 'Shop') {
      const query = shopSegment === 'forsale' ? activeListingsQuery : soldListingsQuery;
      const pages = query.data?.pages ?? [];
      const items: ListingApiItem[] = [];
      for (const page of pages) for (const item of page.items) items.push(item);
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
  }, [activeTab, shopSegment, activeListingsQuery.data, soldListingsQuery.data, looksQuery.data, reviewsQuery.data]);

  const activeQuery = activeTab === 'Shop' ? (shopSegment === 'forsale' ? activeListingsQuery : soldListingsQuery) : activeTab === 'Looks' ? looksQuery : reviewsQuery;
  const isRefreshing = activeQuery.isRefetching;
  const hasNextPage = Boolean(activeQuery.hasNextPage);
  const isFetchingNextPage = activeQuery.isFetchingNextPage;
  const reviewSummary: SellerReviewSummary | null = reviewsQuery.data?.pages?.[0]?.summary ?? null;

  // Scroll / header animation
  const hasCover = Boolean(displayCover);
  const collapseAtShared = useSharedValue(COVER_HEIGHT - 60);
  const scrollY = useSharedValue(0);
  const collapsedShared = useSharedValue(false);
  const stickyShared = useSharedValue(false);
  const stickyThreshold = useSharedValue(9999);

  useEffect(() => {
    collapseAtShared.value = hasCover ? COVER_HEIGHT - 60 : 80;
  }, [hasCover, collapseAtShared]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      runOnJS(saveScrollOffset)(e.contentOffset.y);
      const collapsedAt = collapseAtShared.value;
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

  const topUtilityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  const collapsedHeaderStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: collapsedShared.value ? 1 : 0 };
    const collapseAt = collapseAtShared.value;
    const opacity = interpolate(scrollY.value, [collapseAt - 20, collapseAt + 40], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  const collapsedHeaderShadowStyle = useAnimatedStyle(() => {
    const collapseAt = collapseAtShared.value;
    const shadowOpacity = interpolate(scrollY.value, [collapseAt - 20, collapseAt + 40], [0, 0.06], Extrapolation.CLAMP);
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
    try {
      await Share.share({ message: `${displayUsername} on Thryftverse — ${profileDeepLink}`, url: Platform.OS === 'ios' ? profileDeepLink : undefined });
    } catch { /* ignore */ }
  }, [displayUsername, profileDeepLink]);

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
    if (!targetUserId) return;
    if (viewer && !viewer.canMessage) return;
    navigation.navigate('NewMessage', { preselectedUserId: targetUserId, preselectedDisplayName: displayUsername });
  }, [displayUsername, navigation, targetUserId, viewer]);

  const handleEditProfile = useCallback(() => navigation.navigate('EditProfile', {}), [navigation]);
  const handleFollowToggle = useCallback(() => { if (targetUserId && viewer) followMutation.mutate(!viewer.isFollowing); }, [targetUserId, viewer, followMutation]);
  const handleMore = useCallback(() => setMoreSheetVisible(true), []);
  const handleReport = useCallback(() => { setMoreSheetVisible(false); setReportSheetVisible(true); }, []);
  const handleBlock = useCallback(() => { setMoreSheetVisible(false); setBlockConfirmVisible(true); }, []);
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
  const handleRefresh = useCallback(() => { activeQuery.refetch(); if (!isSelfProfile) publicProfileQuery.refetch(); }, [activeQuery, publicProfileQuery, isSelfProfile]);
  const onTabRailLayout = useCallback((y: number) => { stickyThreshold.value = y - (insets.top + COLLAPSED_BAR_HEIGHT); }, [insets.top]);

  // ── Per-destination scroll offset preservation ──
  // No overlay reset on tab switch — overlay state is derived from the real scroll offset.
  const scrollOffsets = useRef<Record<string, number>>({});
  const currentDestination: string = activeTab === 'Shop' ? `${activeTab}-${shopSegment}` : activeTab;
  const listRef = useRef<any>(null);
  const pendingRestore = useRef<string | null>(null);
  const isListReady = useRef(false);

  const saveScrollOffset = useCallback((offset: number) => {
    scrollOffsets.current[currentDestination] = offset;
  }, [currentDestination]);

  // When destination changes, queue a restore — no setTimeout during render
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
        const collapsedAt = hasCover ? COVER_HEIGHT - 60 : 80;
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
        // No previous offset — if currently collapsed, start at sticky threshold
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
    if (activeTab === 'Shop') {
      return <ProfileShopTile item={item as ListingApiItem} isSold={shopSegment === 'sold'} onPress={() => navigation.push('ItemDetail', { itemId: (item as ListingApiItem).id })} formatPrice={formatFromFiat} cardWidth={cardWidth} cardHeight={cardHeight} />;
    }
    if (activeTab === 'Looks') {
      return <ProfileLookTile item={item as LookApiItem} onPress={() => navigation.navigate('LookDetail', { lookId: (item as LookApiItem).id })} cardWidth={lookTileWidth} cardHeight={lookTileHeight} gap={LOOK_GAP} />;
    }
    const reviewItem = item as SellerReviewItem;
    return (
      <ProfileReviewRow
        item={reviewItem}
        onOpenReviewer={(uid) => navigation.push('UserProfile', { userId: uid })}
        onOpenListing={(lid) => navigation.navigate('ItemDetail', { itemId: lid })}
        onRespond={isSelfProfile && !reviewItem.sellerResponse ? (reviewId, reviewerName, rating) => {
          setResponseComposerState({ visible: true, reviewId, reviewerName, rating });
        } : undefined}
      />
    );
  }, [activeTab, shopSegment, navigation, formatFromFiat, cardWidth, cardHeight, lookTileWidth, lookTileHeight, isSelfProfile]);

  // ═══════════════════════════════════════════════════════════════════════
  // DERIVED RENDER STATE — after all hooks
  // ═══════════════════════════════════════════════════════════════════════
  const isBlockedByTarget = viewer?.isBlockedByTarget && !viewer.isSelf;
  const isBlocked = viewer?.isBlocked ?? false;
  const canMessage = viewer?.canMessage ?? false;

  // State labels — rendered by ProfileStates subcomponents:
  // "Profile unavailable" (ProfileUnavailableState)
  // "You've been blocked" (ProfileBlockedState)
  // canMessage gates the Message button (ProfileHero)

  // ═══════════════════════════════════════════════════════════════════════
  // CONDITIONAL RENDERS — loading, error, unavailable, blocked
  // ═══════════════════════════════════════════════════════════════════════
  if (isLoadingProfile && !targetProfile) {
    return <ProfileSkeleton coverHeight={COVER_HEIGHT} screenWidth={screenWidth} destination={activeTab} />;
  }
  if (profileError && !targetProfile) {
    return <ProfileErrorState onRetry={() => publicProfileQuery.refetch()} onBack={() => navigation.goBack()} coverHeight={COVER_HEIGHT} />;
  }
  if (!targetProfile && !isSelfProfile) {
    // Renders "Profile unavailable" state
    return <ProfileUnavailableState onBack={() => navigation.goBack()} coverHeight={COVER_HEIGHT} />;
  }
  if (isBlockedByTarget) {
    // Renders "You've been blocked" state
    return <ProfileBlockedState onBack={() => navigation.goBack()} onShare={handleShare} coverHeight={COVER_HEIGHT} />;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════
  const numColumns = activeTab === 'Reviews' ? 1 : activeTab === 'Looks' ? LOOK_COLS : 2;
  const estimatedItemSize = activeTab === 'Shop' ? cardHeight + 64 : activeTab === 'Looks' ? lookTileHeight + LOOK_GAP : 130;

  const listHeader = (
    <View>
      <ProfileHero
        targetProfile={targetProfile}
        displayUsername={displayUsername}
        displayAvatar={displayAvatar}
        displayCover={displayCover}
        isSelfProfile={isSelfProfile}
        viewer={viewer}
        stats={stats}
        activeCount={activeCount}
        soldCount={soldCount}
        reviewCount={reviewCount}
        memberSince={memberSince}
        sellerTrust={sellerTrust}
        emailVerified={targetProfile?.emailVerified}
        followPending={followMutation.isPending}
        isBlocked={isBlocked}
        scrollY={scrollY}
        reducedMotion={reducedMotion}
        onFollowToggle={handleFollowToggle}
        onMessage={handleMessageProfile}
        onMore={handleMore}
        onEditProfile={handleEditProfile}
        onShare={handleShare}
        onOpenConnections={openConnections}
        onTabSelect={(t) => setActiveTab(t)}
        onShopSegmentSelect={(s) => setShopSegment(s)}
      />

      {/* Away-mode banner — shown when seller has holiday mode enabled */}
      {sellerTrust?.holidayMode === true ? (
        <View style={styles.awayBanner}>
          <Ionicons name="pause-circle" size={18} color={Colors.textMuted} />
          <View style={styles.awayBannerTextWrap}>
            <Text style={styles.awayBannerTitle}>
              {isSelfProfile ? 'Your shop is on holiday' : 'This shop is on holiday'}
            </Text>
            <Text style={styles.awayBannerSub}>
              {sellerTrust.awayMessage?.trim()
                ? sellerTrust.awayMessage.trim()
                : 'The seller is away right now. Listings are paused and will return when they are back.'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Tab rail — measures Y for sticky threshold */}
      <View onLayout={(e) => onTabRailLayout(e.nativeEvent.layout.y)}>
        <TabRail
          tabs={[
            { key: 'Shop', label: 'Shop', count: activeCount + soldCount },
            { key: 'Looks', label: 'Looks', count: lookCount },
            { key: 'Reviews', label: 'Reviews', count: reviewCount },
          ]}
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as Tab)}
          reducedMotion={reducedMotion}
        />
      </View>

      {activeTab === 'Shop' ? (
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

      {/* Shop policies — shown on Shop tab, derived from seller trust data */}
      {activeTab === 'Shop' && sellerTrust ? (
        <View style={styles.shopPoliciesSection}>
          <Text style={styles.shopPoliciesTitle}>Shop policies</Text>
          <View style={styles.shopPoliciesGrid}>
            {sellerTrust.dispatchTimeLabel ? (
              <View style={styles.shopPolicyItem}>
                <Ionicons name="cube-outline" size={14} color={MUTED} />
                <Text style={styles.shopPolicyText}>{sellerTrust.dispatchTimeLabel}</Text>
              </View>
            ) : null}
            {sellerTrust.responseTimeLabel ? (
              <View style={styles.shopPolicyItem}>
                <Ionicons name="time-outline" size={14} color={MUTED} />
                <Text style={styles.shopPolicyText}>Replies {sellerTrust.responseTimeLabel}</Text>
              </View>
            ) : null}
            <View style={styles.shopPolicyItem}>
              <Ionicons name="shield-checkmark-outline" size={14} color={MUTED} />
              <Text style={styles.shopPolicyText}>Buyer protection</Text>
            </View>
            <View style={styles.shopPolicyItem}>
              <Ionicons name="return-down-back-outline" size={14} color={MUTED} />
              <Text style={styles.shopPolicyText}>Returns accepted</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Featured listings — pinned top items from the seller's active inventory */}
      {activeTab === 'Shop' && shopSegment === 'forsale' && listData.length > 0 && (
        <View style={styles.featuredSection}>
          <View style={styles.featuredHeader}>
            <Ionicons name="star-outline" size={14} color={Colors.brand} />
            <Text style={styles.featuredTitle}>Featured</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredScroll}
          >
            {listData.slice(0, 5).map((item) => {
              const listing = item as ListingApiItem;
              return (
                <Pressable
                  key={listing.id}
                  style={styles.featuredCard}
                  onPress={() => navigation.push('ItemDetail', { itemId: listing.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${listing.title}`}
                >
                  {listing.images?.[0] ? (
                    <CachedImage uri={listing.images[0]} style={styles.featuredImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.featuredImage, styles.featuredImagePlaceholder]}>
                      <Ionicons name="shirt-outline" size={20} color={MUTED} />
                    </View>
                  )}
                  <Text style={styles.featuredPrice}>{formatFromFiat(listing.priceGbp, 'GBP', { displayMode: 'fiat' })}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const listEmpty = (() => {
    if (activeQuery.isLoading) return null;
    if (activeQuery.error) {
      return (
        <Pressable style={styles.listState} onPress={() => activeQuery.refetch()} accessibilityRole="button" accessibilityLabel="Retry loading content">
          <Ionicons name="cloud-offline-outline" size={32} color={MUTED} />
          <Text style={styles.listStateTitle}>Couldn't load {activeTab === 'Shop' ? 'listings' : activeTab === 'Looks' ? 'Looks' : 'reviews'}</Text>
          <Text style={styles.listStateSub}>Tap to retry</Text>
        </Pressable>
      );
    }
    if (listData.length === 0) {
      if (activeTab === 'Shop') {
        return (
          <View style={styles.listState}>
            <Ionicons name="shirt-outline" size={32} color={MUTED} />
            <Text style={styles.listStateTitle}>{shopSegment === 'forsale' ? 'No active listings' : 'No sold items yet'}</Text>
            <Text style={styles.listStateSub}>{shopSegment === 'forsale' ? 'This seller has nothing for sale right now.' : 'Sold items will appear here.'}</Text>
          </View>
        );
      }
      if (activeTab === 'Looks') {
        return (
          <View style={styles.listState}>
            <Ionicons name="images-outline" size={32} color={MUTED} />
            <Text style={styles.listStateTitle}>No published Looks</Text>
            <Text style={styles.listStateSub}>This creator hasn't published any Looks yet.</Text>
          </View>
        );
      }
      return (
        <View style={styles.listState}>
          <Ionicons name="chatbubble-ellipses-outline" size={32} color={MUTED} />
          <Text style={styles.listStateTitle}>No reviews yet</Text>
          <Text style={styles.listStateSub}>Reviews from completed orders will appear here.</Text>
        </View>
      );
    }
    return null;
  })();

  const listFooter = isFetchingNextPage ? (
    <View style={styles.loadMoreIndicator}><ActivityIndicator size="small" color={MUTED} /></View>
  ) : <View style={{ height: DockConstants.singleActionHeight }} />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />

      {/* Top utility controls — overlay cover, fade out on scroll */}
      <View pointerEvents="box-none" style={[styles.coverActionLayer, !hasCover && { height: insets.top + 50 }]}>
        <Reanimated.View
          style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }, topUtilityStyle]}
          pointerEvents={collapsedVisible ? 'none' : 'auto'}
        >
          <AnimatedPressable
            style={[styles.topUtilityIconBtn, !hasCover && styles.topUtilityIconBtnCompact]}
            activeOpacity={0.9}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            accessibilityHint="Returns to previous screen"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="arrow-back" size={18} color={hasCover ? '#fff' : TEXT} />
          </AnimatedPressable>
          <View style={styles.topUtilityRight}>
            <AnimatedPressable
              style={[styles.topUtilityIconBtn, !hasCover && styles.topUtilityIconBtnCompact]}
              activeOpacity={0.9}
              onPress={handleShare}
              accessibilityLabel="Share profile"
              accessibilityRole="button"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Ionicons name="share-outline" size={18} color={hasCover ? '#fff' : TEXT} />
            </AnimatedPressable>
            {!isSelfProfile && (
              <AnimatedPressable
                style={[styles.topUtilityIconBtn, !hasCover && styles.topUtilityIconBtnCompact]}
                activeOpacity={0.9}
                onPress={handleMore}
                accessibilityLabel="More options"
                accessibilityRole="button"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={hasCover ? '#fff' : TEXT} />
              </AnimatedPressable>
            )}
          </View>
        </Reanimated.View>
      </View>

      {/* Collapsed header — total height = insets.top + COLLAPSED_BAR_HEIGHT, paddingTop = insets.top, inner row = COLLAPSED_BAR_HEIGHT */}
      <Reanimated.View
        style={[styles.collapsedHeader, { height: insets.top + COLLAPSED_BAR_HEIGHT, paddingTop: insets.top }, collapsedHeaderStyle, collapsedHeaderShadowStyle]}
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
              containerStyle={{ width: 28, height: 28, borderRadius: 14 }}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.collapsedAvatar, styles.collapsedAvatarMonogram]}>
              <Text style={styles.collapsedAvatarInitials}>
                {getCollapsedInitials(targetProfile?.displayName || displayUsername)}
              </Text>
            </View>
          )}
          <Text style={styles.collapsedTitle} numberOfLines={1} ellipsizeMode="tail">
            {targetProfile?.displayName || displayUsername}
          </Text>
        </View>
        <View style={styles.collapsedRight}>
          {!isSelfProfile && viewer ? (
            <AnimatedPressable
              style={[styles.collapsedFollowBtn, viewer.isFollowing ? styles.collapsedFollowingBtn : styles.collapsedFollowActiveBtn, (followMutation.isPending || isBlocked) && styles.btnDisabled]}
              onPress={handleFollowToggle}
              activeOpacity={0.85}
              disabled={followMutation.isPending || isBlocked}
              accessibilityRole="button"
              accessibilityLabel={viewer.isFollowing ? 'Unfollow' : 'Follow'}
            >
              <Text style={[styles.collapsedFollowText, viewer.isFollowing ? {} : styles.collapsedFollowActiveText]}>
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

      {/* Sticky tab rail — external overlay, appears when original scrolls past */}
      <Reanimated.View
        style={[styles.stickyRailWrap, { top: insets.top + COLLAPSED_BAR_HEIGHT }, stickyRailStyle]}
        pointerEvents={stickyRailVisible ? 'auto' : 'none'}
      >
        <TabRail
          tabs={[
            { key: 'Shop', label: 'Shop', count: activeCount + soldCount },
            { key: 'Looks', label: 'Looks', count: lookCount },
            { key: 'Reviews', label: 'Reviews', count: reviewCount },
          ]}
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as Tab)}
          reducedMotion={reducedMotion}
        />
        {activeTab === 'Shop' ? (
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

      {/* Content list — cover scrolls naturally as first header item */}
      <AnimatedFlashList
        ref={listRef}
        data={listData as (ListingApiItem | LookApiItem | SellerReviewItem)[]}
        renderItem={renderItem as any}
        keyExtractor={(item: ListingApiItem | LookApiItem | SellerReviewItem, index: number) => (item as { id?: string }).id ?? `item-${index}`}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { paddingHorizontal: Space.md, gap: activeTab === 'Shop' ? GRID_GAP : LOOK_GAP } : undefined}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={MUTED} colors={[MUTED]} />}
        key={`list-${numColumns}`}
        estimatedItemSize={estimatedItemSize}
        onContentSizeChange={handleContentSizeChange}
      />

      {/* Sheets */}
      <ProfileMoreSheet
        visible={moreSheetVisible}
        onDismiss={() => setMoreSheetVisible(false)}
        isSelfProfile={isSelfProfile}
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
        onOpenProfile={(id) => navigation.push('UserProfile', { userId: id })}
      />

      {/* Seller response composer — for own profile reviews */}
      <SellerResponseComposer
        visible={responseComposerState.visible}
        reviewId={responseComposerState.reviewId}
        reviewerName={responseComposerState.reviewerName}
        rating={responseComposerState.rating}
        onClose={() => setResponseComposerState(s => ({ ...s, visible: false }))}
        onSubmit={async (reviewId, text) => {
          await respondToReview(reviewId, text);
          // Refresh reviews to show the new response
          reviewsQuery.refetch();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  coverActionLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: COVER_HEIGHT, zIndex: 8 },
  topUtilityRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topUtilityRight: { flexDirection: 'row', gap: 8 },
  topUtilityIconBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  topUtilityIconBtnCompact: {
    backgroundColor: SURFACE_ALT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  collapsedHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, height: COLLAPSED_BAR_HEIGHT,
    backgroundColor: BG, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 4,
  },
  collapsedBackBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  collapsedCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  collapsedAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  collapsedAvatarMonogram: { backgroundColor: SURFACE_ALT },
  collapsedAvatarInitials: { fontSize: 12, fontFamily: Typography.family.bold, color: MUTED },
  collapsedTitle: { fontSize: 16, fontFamily: Typography.family.semibold, color: TEXT, letterSpacing: -0.3, flexShrink: 1 },
  collapsedRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  collapsedFollowBtn: { height: 44, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  collapsedFollowingBtn: { borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, backgroundColor: BG },
  collapsedFollowActiveBtn: { backgroundColor: BRAND },
  collapsedFollowText: { fontSize: 13, fontFamily: Typography.family.semibold, color: TEXT },
  collapsedFollowActiveText: { color: TEXT_INVERSE },
  collapsedIconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stickyRailWrap: {
    position: 'absolute', left: 0, right: 0, zIndex: 9,
    backgroundColor: BG, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  stickySegmentWrap: { paddingHorizontal: Space.md, paddingVertical: Space.sm },
  segmentWrap: { paddingHorizontal: Space.md, paddingVertical: Space.sm, flexDirection: 'row' },
  awayBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: 12,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  awayBannerTextWrap: {
    flex: 1,
    gap: 2,
  },
  awayBannerTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  awayBannerSub: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  shopPoliciesSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
  },
  shopPoliciesTitle: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: Space.xs,
  },
  shopPoliciesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  shopPolicyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
  },
  shopPolicyText: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: TEXT,
  },
  featuredSection: {
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
  },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Space.md,
    marginBottom: Space.xs,
  },
  featuredTitle: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  featuredScroll: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  featuredCard: {
    width: 100,
    gap: 4,
  },
  featuredImage: {
    width: 100,
    height: 120,
    borderRadius: 8,
    backgroundColor: Colors.surfaceAlt,
  },
  featuredImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredPrice: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  listState: { alignItems: 'center', justifyContent: 'center', paddingVertical: Space.xl * 2, paddingHorizontal: Space.md, gap: 8 },
  listStateTitle: { fontSize: 15, fontFamily: Typography.family.semibold, color: TEXT },
  listStateSub: { fontSize: 13, fontFamily: Typography.family.regular, color: MUTED, textAlign: 'center' },
  loadMoreIndicator: { paddingVertical: Space.md, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
});
