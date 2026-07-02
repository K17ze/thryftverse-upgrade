import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  Share,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { FlashList } from '@shopify/flash-list';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useStore } from '../store/useStore';
import { ActiveTheme, Colors } from '../constants/colors';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { SupportedCurrencyCode } from '../constants/currencies';
import { CurrencyDisplayMode } from '../utils/currency';
import { Space, Typography, Radius } from '../theme/designTokens';
import { FlagshipProfileMedia } from '../components/flagship';
import {
  type PublicProfileUser,
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
  queryClient,
  queryKeys,
} from '../platform/server';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { isVideoUri } from '../utils/media';
import { NativeSheet } from '../platform/native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { RootStackParamList } from '../navigation/types';
import type { ListingApiItem } from '../services/listingsApi';
import type { LookApiItem } from '../services/looksApi';
import type { SellerReviewItem, SellerReviewSummary } from '../services/sellerReviewsApi';

const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList);

type Props = StackScreenProps<RootStackParamList, 'UserProfile'>;

const BG = Colors.background;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SECONDARY = Colors.textSecondary;
const SURFACE_ALT = Colors.surfaceAlt;
const BRAND = Colors.brand;
const BRAND_PRESSED = Colors.brandPressed;
const TEXT_INVERSE = Colors.textInverse;
const DANGER = Colors.danger;

const COVER_HEIGHT = 240;
const AVATAR_SIZE = 92;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;
const GRID_GAP = 8;
const CARD_ASPECT = 1.25; // 4:5 portrait

type Tab = 'Shop' | 'Looks' | 'Reviews';
type ShopSegment = 'forsale' | 'sold';

const PROFILE_WEB_BASE = 'https://thryftverse.app';

export default function UserProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const currentUser = useStore(state => state.currentUser);
  const userAvatar = useStore(state => state.userAvatar);
  const userCover = useStore(state => state.userCover);
  const profileMediaOverrides = useStore(state => state.profileMediaOverrides);
  const [activeTab, setActiveTab] = useState<Tab>('Shop');
  const [shopSegment, setShopSegment] = useState<ShopSegment>('forsale');

  // Responsive grid geometry (brief §2: no module-level screen-width calc)
  const cardWidth = useMemo(
    () => (screenWidth - Space.md * 2 - GRID_GAP) / 2,
    [screenWidth]
  );
  const cardHeight = cardWidth * CARD_ASPECT;

  const isMe = route.params?.isMe ?? false;
  const userId = route.params?.userId;

  const isSelfProfile = isMe || userId === currentUser?.id;

  const publicProfileQuery = usePublicProfileQuery(isSelfProfile ? null : userId);
  const publicProfile = publicProfileQuery.data ?? null;
  const profileAggregate = publicProfileQuery.aggregate ?? null;
  const isLoadingProfile = publicProfileQuery.isLoading;
  const profileError = publicProfileQuery.error ? 'Unable to load profile. Tap to retry.' : null;

  const stats: PublicProfileStats | null = profileAggregate?.stats ?? null;
  const viewer: PublicProfileViewer | null = profileAggregate?.viewer ?? null;

  const [moreSheetVisible, setMoreSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const { formatFromFiat } = useFormattedPrice();

  const targetUserId = isSelfProfile ? currentUser?.id : userId;

  // ── Data queries (only for non-self public profile) ──
  const activeListingsQuery = useUserListingsInfinite(isSelfProfile ? null : targetUserId, 'active');
  const soldListingsQuery = useUserListingsInfinite(isSelfProfile ? null : targetUserId, 'sold');
  const looksQuery = useUserLooksInfinite(isSelfProfile ? null : targetUserId);
  const reviewsQuery = useSellerReviewsInfinite(isSelfProfile ? null : targetUserId);

  const followMutation = useFollowMutation(targetUserId ?? '');
  const blockMutation = useBlockMutation(targetUserId ?? '');
  const reportMutation = useReportUserMutation(targetUserId ?? '');

  const mediaOverride =
    (userId ? profileMediaOverrides[userId] : undefined)
    ?? (currentUser ? profileMediaOverrides[currentUser.id] : undefined)
    ?? null;

  const targetProfile = isSelfProfile ? currentUser : publicProfile;
  const displayUsername = targetProfile?.username ?? 'Thryft user';
  const displayHandle = targetProfile ? `@${targetProfile.username}` : '';
  const displayAvatar = isSelfProfile
    ? targetProfile?.avatar || userAvatar || mediaOverride?.avatar || undefined
    : targetProfile?.avatar || undefined;
  const displayCover = isSelfProfile
    ? targetProfile?.coverPhoto || userCover || mediaOverride?.cover || ''
    : targetProfile?.coverPhoto || '';

  const memberSince = targetProfile?.createdAt
    ? new Date(targetProfile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : undefined;

  // ── Deep link ──
  const profileDeepLink = useMemo(() => {
    if (!targetUserId) return PROFILE_WEB_BASE;
    return `${PROFILE_WEB_BASE}/u/${encodeURIComponent(targetUserId)}`;
  }, [targetUserId]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `${displayUsername} on Thryftverse — ${profileDeepLink}`,
        url: Platform.OS === 'ios' ? profileDeepLink : undefined,
      });
    } catch {
      // Ignore share cancellation errors.
    }
  }, [displayUsername, profileDeepLink]);

  const handleCopyLink = useCallback(async () => {
    try {
      await Share.share({ message: profileDeepLink });
    } catch {
      // Ignore errors.
    }
  }, [profileDeepLink]);

  const handleMessageProfile = useCallback(() => {
    if (!targetUserId) return;
    if (viewer && !viewer.canMessage) return;
    navigation.navigate('NewMessage', {
      preselectedUserId: targetUserId,
      preselectedDisplayName: displayUsername,
    });
  }, [displayUsername, navigation, targetUserId, viewer]);

  const handleEditProfile = useCallback(() => {
    navigation.navigate('EditProfile', {});
  }, [navigation]);

  const handleFollowToggle = useCallback(() => {
    if (!targetUserId || !viewer) return;
    const shouldFollow = !viewer.isFollowing;
    followMutation.mutate(shouldFollow);
  }, [targetUserId, viewer, followMutation]);

  const handleMore = useCallback(() => {
    setMoreSheetVisible(true);
  }, []);

  const handleReport = useCallback(() => {
    setMoreSheetVisible(false);
    setReportSheetVisible(true);
  }, []);

  const handleBlock = useCallback(() => {
    setMoreSheetVisible(false);
    setBlockConfirmVisible(true);
  }, []);

  const confirmBlock = useCallback(() => {
    setBlockConfirmVisible(false);
    blockMutation.mutate(true, {
      onSuccess: () => setActionFeedback('User blocked'),
      onError: () => setActionFeedback('Could not block user'),
    });
  }, [blockMutation]);

  const handleUnblock = useCallback(() => {
    setMoreSheetVisible(false);
    blockMutation.mutate(false, {
      onSuccess: () => setActionFeedback('User unblocked'),
      onError: () => setActionFeedback('Could not unblock user'),
    });
  }, [blockMutation]);

  // ── Scroll / header animation ──
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const coverStyle = useAnimatedStyle(() => {
    if (reducedMotion) return {};
    const overscroll = Math.min(scrollY.value, 0);
    const translateY = interpolate(overscroll, [-120, 0], [-60, 0], Extrapolation.CLAMP);
    const scale = interpolate(overscroll, [-120, 0], [1.3, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY }, { scale }] };
  });

  const topUtilityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  const collapsedHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [COVER_HEIGHT - 80, COVER_HEIGHT - 20], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  const collapsedHeaderShadowStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(scrollY.value, [COVER_HEIGHT - 80, COVER_HEIGHT - 20], [0, 0.06], Extrapolation.CLAMP);
    return { shadowOpacity };
  });

  // ── Tab counts ──
  const activeCount = stats?.activeListingCount ?? 0;
  const soldCount = stats?.soldListingCount ?? 0;
  const lookCount = stats?.publishedLookCount ?? 0;
  const reviewCount = stats?.reviewCount ?? 0;

  // ── Loading state ──
  if (isLoadingProfile && !targetProfile) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
        <View style={[styles.coverSkeleton, { height: COVER_HEIGHT }]} />
        <View style={styles.skeletonBody}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonName} />
          <View style={styles.skeletonHandle} />
          <View style={styles.skeletonStatsRow}>
            <View style={styles.skeletonStat} />
            <View style={styles.skeletonStat} />
            <View style={styles.skeletonStat} />
          </View>
          <View style={styles.skeletonTabRail} />
          <View style={styles.skeletonGrid}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
        </View>
      </View>
    );
  }

  // ── Error state ──
  if (profileError && !targetProfile) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
        <View style={[styles.coverSkeleton, { height: COVER_HEIGHT }]} />
        <Pressable
          style={styles.stateContainer}
          onPress={() => publicProfileQuery.refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
        >
          <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
          <Text style={styles.stateText}>Unable to load profile</Text>
          <Text style={styles.stateSubtext}>Tap to retry</Text>
        </Pressable>
      </View>
    );
  }

  // ── Unavailable state ──
  if (!targetProfile && !isSelfProfile) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
        <View style={[styles.coverSkeleton, { height: COVER_HEIGHT }]} />
        <View style={styles.stateContainer}>
          <Ionicons name="person-outline" size={40} color={MUTED} />
          <Text style={styles.stateText}>Profile unavailable</Text>
          <Text style={styles.stateSubtext}>This account may no longer be active.</Text>
        </View>
      </View>
    );
  }

  // ── Blocked-by-target state ──
  if (viewer?.isBlockedByTarget && !viewer.isSelf) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
        <View style={styles.coverActionLayer}>
          <Reanimated.View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }]}>
            <AnimatedPressable
              style={styles.topUtilityIconBtn}
              activeOpacity={0.9}
              onPress={() => navigation.goBack()}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={18} color="#fff" />
            </AnimatedPressable>
            <View style={{ flex: 1 }} />
            <AnimatedPressable
              style={styles.topUtilityIconBtn}
              activeOpacity={0.9}
              onPress={handleShare}
              accessibilityLabel="Share profile"
              accessibilityRole="button"
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
            </AnimatedPressable>
          </Reanimated.View>
        </View>
        <View style={[styles.coverSkeleton, { height: COVER_HEIGHT }]} />
        <View style={styles.stateContainer}>
          <Ionicons name="eye-off-outline" size={40} color={MUTED} />
          <Text style={styles.stateText}>You've been blocked</Text>
          <Text style={styles.stateSubtext}>This user blocked you from viewing their profile.</Text>
        </View>
      </View>
    );
  }

  const isBlocked = viewer?.isBlocked ?? false;

  // ── Build list data based on active tab ──
  const listData = useMemo(() => {
    if (activeTab === 'Shop') {
      const query = shopSegment === 'forsale' ? activeListingsQuery : soldListingsQuery;
      const pages = query.data?.pages ?? [];
      const items: ListingApiItem[] = [];
      for (const page of pages) {
        for (const item of page.items) items.push(item);
      }
      return items;
    }
    if (activeTab === 'Looks') {
      const pages = looksQuery.data?.pages ?? [];
      const items: LookApiItem[] = [];
      for (const page of pages) {
        for (const item of page.items) items.push(item);
      }
      return items;
    }
    // Reviews
    const pages = reviewsQuery.data?.pages ?? [];
    const items: SellerReviewItem[] = [];
    for (const page of pages) {
      for (const item of page.items) items.push(item);
    }
    return items;
  }, [activeTab, shopSegment, activeListingsQuery.data, soldListingsQuery.data, looksQuery.data, reviewsQuery.data]);

  const activeQuery = activeTab === 'Shop'
    ? (shopSegment === 'forsale' ? activeListingsQuery : soldListingsQuery)
    : activeTab === 'Looks' ? looksQuery : reviewsQuery;

  const isRefreshing = activeQuery.isRefetching;
  const hasNextPage = Boolean(activeQuery.hasNextPage);
  const isFetchingNextPage = activeQuery.isFetchingNextPage;

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      activeQuery.fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, activeQuery]);

  const handleRefresh = useCallback(() => {
    activeQuery.refetch();
    if (!isSelfProfile) publicProfileQuery.refetch();
  }, [activeQuery, publicProfileQuery, isSelfProfile]);

  // ── List header: identity hero + stats + actions + tab rail + shop segment ──
  const ListHeader = useMemo(() => (
    <View>
      {/* Identity hero */}
      <View style={styles.identitySection}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            {displayAvatar ? (
              <CachedImage
                uri={displayAvatar}
                style={styles.avatar}
                containerStyle={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={36} color={MUTED} />
              </View>
            )}
          </View>

          <View style={styles.identityCol}>
            <Text style={styles.displayName} numberOfLines={2}>{targetProfile?.displayName || displayUsername}</Text>
            <Text style={styles.username} numberOfLines={1}>@{targetProfile?.username ?? 'thryft'}</Text>
          </View>
        </View>

        {targetProfile?.bio ? (
          <Text style={styles.bio}>{targetProfile.bio}</Text>
        ) : null}

        {/* Context line: location · member since · website */}
        <View style={styles.contextRow}>
          {targetProfile?.location ? (
            <View style={styles.contextItem}>
              <Ionicons name="location-outline" size={12} color={MUTED} />
              <Text style={styles.contextText} numberOfLines={1}>{targetProfile.location}</Text>
            </View>
          ) : null}
          {memberSince ? (
            <View style={styles.contextItem}>
              <Ionicons name="calendar-outline" size={12} color={MUTED} />
              <Text style={styles.contextText} numberOfLines={1}>Joined {memberSince}</Text>
            </View>
          ) : null}
          {targetProfile?.website ? (
            <Pressable
              style={styles.contextItem}
              onPress={() => openWebsite(targetProfile.website!)}
              accessibilityRole="link"
              accessibilityLabel={`Open website ${targetProfile.website}`}
            >
              <Ionicons name="link-outline" size={12} color={SECONDARY} />
              <Text style={[styles.contextText, styles.contextLink]} numberOfLines={1}>{targetProfile.website}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Statistics — compact, tappable, real */}
        <View style={styles.statsRow}>
          <StatCell
            label="For sale"
            value={activeCount}
            onPress={activeCount > 0 ? () => { setActiveTab('Shop'); setShopSegment('forsale'); } : undefined}
          />
          <StatCell
            label="Sold"
            value={soldCount}
            onPress={soldCount > 0 ? () => { setActiveTab('Shop'); setShopSegment('sold'); } : undefined}
          />
          <StatCell
            label="Followers"
            value={stats?.followerCount ?? 0}
          />
          <StatCell
            label="Following"
            value={stats?.followingCount ?? 0}
          />
        </View>

        {stats && stats.ratingAverage !== null && reviewCount > 0 ? (
          <Pressable
            style={styles.ratingRow}
            onPress={() => setActiveTab('Reviews')}
            accessibilityRole="button"
            accessibilityLabel={`Rating ${stats.ratingAverage} out of 5, ${reviewCount} reviews. View reviews.`}
          >
            <Ionicons name="star" size={14} color={BRAND} />
            <Text style={styles.ratingValue}>{stats.ratingAverage!.toFixed(1)}</Text>
            <Text style={styles.ratingCount}>· {reviewCount} review{reviewCount !== 1 ? 's' : ''}</Text>
            <Ionicons name="chevron-forward" size={12} color={MUTED} style={{ marginLeft: 2 }} />
          </Pressable>
        ) : null}
      </View>

      {/* Relationship actions */}
      {!isSelfProfile && viewer ? (
        <View style={styles.actionRow}>
          <AnimatedPressable
            style={[
              styles.followBtn,
              viewer.isFollowing ? styles.followingBtn : styles.followBtnActive,
              followMutation.isPending && styles.btnDisabled,
            ]}
            onPress={handleFollowToggle}
            activeOpacity={0.85}
            disabled={followMutation.isPending || isBlocked}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={viewer.isFollowing ? 'Unfollow user' : 'Follow user'}
            accessibilityState={{ disabled: followMutation.isPending || isBlocked }}
          >
            {followMutation.isPending ? (
              <ActivityIndicator size="small" color={viewer.isFollowing ? TEXT : TEXT_INVERSE} />
            ) : (
              <Text style={[styles.followBtnText, viewer.isFollowing ? styles.followingBtnText : styles.followActiveBtnText]}>
                {viewer.isFollowing ? 'Following' : 'Follow'}
              </Text>
            )}
          </AnimatedPressable>

          <AnimatedPressable
            style={[styles.messageBtn, !viewer.canMessage && styles.btnDisabled]}
            onPress={handleMessageProfile}
            activeOpacity={0.85}
            disabled={!viewer.canMessage}
            accessibilityRole="button"
            accessibilityLabel={viewer.canMessage ? 'Send message to seller' : 'Messaging unavailable'}
            accessibilityState={{ disabled: !viewer.canMessage }}
          >
            <Ionicons name="chatbubble-outline" size={16} color={TEXT} />
            <Text style={styles.messageBtnText}>Message</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.secondaryActionBtn}
            onPress={handleMore}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={TEXT} />
          </AnimatedPressable>
        </View>
      ) : null}

      {/* Self-profile action row */}
      {isSelfProfile ? (
        <View style={styles.actionRow}>
          <AnimatedPressable
            style={styles.editProfileBtn}
            onPress={handleEditProfile}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
          >
            <Ionicons name="create-outline" size={16} color={TEXT} />
            <Text style={styles.editProfileBtnText}>Edit profile</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.secondaryActionBtn}
            onPress={handleShare}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share profile"
          >
            <Ionicons name="share-outline" size={18} color={TEXT} />
          </AnimatedPressable>
        </View>
      ) : null}

      {/* Tab rail */}
      <View style={styles.tabRailWrap}>
        <TabRail
          tabs={[
            { key: 'Shop', label: 'Shop', count: activeCount + soldCount },
            { key: 'Looks', label: 'Looks', count: lookCount },
            { key: 'Reviews', label: 'Reviews', count: reviewCount },
          ]}
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as Tab)}
        />
      </View>

      {/* Shop sub-segment */}
      {activeTab === 'Shop' ? (
        <View style={styles.segmentWrap}>
          <SegmentedControl
            segments={[
              { key: 'forsale', label: 'For sale' },
              { key: 'sold', label: 'Sold' },
            ]}
            activeKey={shopSegment}
            onChange={(k) => setShopSegment(k as ShopSegment)}
          />
        </View>
      ) : null}
    </View>
  ), [
    displayAvatar, displayUsername, targetProfile, memberSince,
    activeCount, soldCount, lookCount, reviewCount, stats,
    isSelfProfile, viewer, followMutation, isBlocked,
    handleFollowToggle, handleMessageProfile, handleMore, handleShare, handleEditProfile,
    activeTab, shopSegment,
  ]);

  // ── Render list item ──
  const renderItem = useCallback(({ item }: { item: ListingApiItem | LookApiItem | SellerReviewItem }): React.ReactElement | null => {
    if (activeTab === 'Shop') {
      return (
        <ShopTile
          item={item as ListingApiItem}
          isSold={shopSegment === 'sold'}
          onPress={() => navigation.push('ItemDetail', { itemId: (item as ListingApiItem).id })}
          formatPrice={formatFromFiat}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
        />
      );
    }
    if (activeTab === 'Looks') {
      return (
        <LookTile
          item={item as LookApiItem}
          onPress={() => navigation.navigate('LookDetail', { lookId: (item as LookApiItem).id })}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
        />
      );
    }
    return (
      <ReviewRow item={item as SellerReviewItem} />
    );
  }, [activeTab, shopSegment, navigation, formatFromFiat, cardWidth, cardHeight]);

  // ── Empty / error / footer for list ──
  const listEmpty = (() => {
    if (activeQuery.isLoading) return null; // skeleton handled by header
    if (activeQuery.error) {
      return (
        <Pressable
          style={styles.listState}
          onPress={() => activeQuery.refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading content"
        >
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

  const listFooter = (() => {
    if (isFetchingNextPage) {
      return (
        <View style={styles.loadMoreIndicator}>
          <ActivityIndicator size="small" color={MUTED} />
        </View>
      );
    }
    if (hasNextPage) {
      return (
        <Pressable style={styles.loadMoreBtn} onPress={handleLoadMore} accessibilityRole="button" accessibilityLabel="Load more">
          <Text style={styles.loadMoreText}>Load more</Text>
        </Pressable>
      );
    }
    if (listData.length > 0) {
      return <View style={{ height: 120 }} />;
    }
    return <View style={{ height: 120 }} />;
  })();

  const numColumns = activeTab === 'Reviews' ? 1 : 2;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />

      {/* ── 1. FULL-WIDTH COVER ── */}
      <Reanimated.View style={[styles.coverWrap, coverStyle]}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          coverVideoUri={isVideoUri(displayCover) ? displayCover : undefined}
          isSelf={isSelfProfile}
          coverOnly
          style={{ width: '100%' }}
          coverHeight={COVER_HEIGHT}
        />
      </Reanimated.View>

      {/* ── 2. FLOATING TOP CONTROLS (expanded) ── */}
      <View pointerEvents="box-none" style={styles.coverActionLayer}>
        <Reanimated.View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }, topUtilityStyle]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            accessibilityHint="Returns to previous screen"
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </AnimatedPressable>

          <View style={styles.topUtilityRight}>
            <AnimatedPressable
              style={styles.topUtilityIconBtn}
              activeOpacity={0.9}
              onPress={handleShare}
              accessibilityLabel="Share profile"
              accessibilityRole="button"
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
            </AnimatedPressable>
            {!isSelfProfile && (
              <AnimatedPressable
                style={styles.topUtilityIconBtn}
                activeOpacity={0.9}
                onPress={handleMore}
                accessibilityLabel="More options"
                accessibilityRole="button"
              >
                <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
              </AnimatedPressable>
            )}
          </View>
        </Reanimated.View>
      </View>

      {/* ── 3. COMPACT COLLAPSED HEADER ── */}
      <Reanimated.View
        style={[
          styles.collapsedHeader,
          { paddingTop: insets.top },
          collapsedHeaderStyle,
          collapsedHeaderShadowStyle,
        ]}
        pointerEvents="box-none"
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
            <View style={[styles.collapsedAvatar, { backgroundColor: SURFACE_ALT }]} />
          )}
          <Text style={styles.collapsedTitle} numberOfLines={1} ellipsizeMode="tail">
            {targetProfile?.displayName || displayUsername}
          </Text>
        </View>

        <View style={styles.collapsedRight}>
          {!isSelfProfile && viewer ? (
            <AnimatedPressable
              style={[
                styles.collapsedFollowBtn,
                viewer.isFollowing ? styles.collapsedFollowingBtn : styles.collapsedFollowActiveBtn,
              ]}
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

      {/* ── 4. VIRTUALIZED CONTENT LIST ── */}
      <Reanimated.View style={styles.scrollHost} onLayout={() => {}}>
        <AnimatedFlashList
          data={listData as (ListingApiItem | LookApiItem | SellerReviewItem)[]}
          renderItem={renderItem as any}
          keyExtractor={(item, index) => (item as { id?: string }).id ?? `item-${index}`}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          numColumns={numColumns}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={MUTED}
              colors={[MUTED]}
            />
          }
          key={`list-${activeTab}-${shopSegment}-${numColumns}`}
        />
      </Reanimated.View>

      {/* ── 5. MORE ACTIONS SHEET ── */}
      <NativeSheet
        visible={moreSheetVisible}
        onDismiss={() => setMoreSheetVisible(false)}
        snapPoints={['half']}
      >
        <View style={styles.sheetContainer}>
          <Text style={styles.sheetTitle}>Profile options</Text>

          <SheetItem
            icon="share-outline"
            label="Share profile"
            onPress={() => { setMoreSheetVisible(false); handleShare(); }}
          />
          <SheetItem
            icon="link-outline"
            label="Copy profile link"
            onPress={() => { setMoreSheetVisible(false); handleCopyLink(); }}
          />
          {!isSelfProfile ? (
            <>
              <SheetItem
                icon="flag-outline"
                label="Report profile"
                onPress={handleReport}
              />
              {isBlocked ? (
                <SheetItem
                  icon="hand-right-outline"
                  label="Unblock user"
                  onPress={handleUnblock}
                  destructive={false}
                />
              ) : (
                <SheetItem
                  icon="hand-right-outline"
                  label="Block user"
                  onPress={handleBlock}
                  destructive
                />
              )}
            </>
          ) : null}
        </View>
      </NativeSheet>

      {/* ── 6. REPORT SHEET ── */}
      <NativeSheet
        visible={reportSheetVisible}
        onDismiss={() => setReportSheetVisible(false)}
        snapPoints={[{ fraction: 0.7 }]}
      >
        <ReportSheetContent
          isPending={reportMutation.isPending}
          onSubmit={(reason, details) => {
            reportMutation.mutate(
              { reason, details },
              {
                onSuccess: () => {
                  setReportSheetVisible(false);
                  setActionFeedback('Report submitted');
                },
                onError: () => setActionFeedback('Could not submit report'),
              }
            );
          }}
        />
      </NativeSheet>

      {/* ── 7. BLOCK CONFIRMATION SHEET ── */}
      <NativeSheet
        visible={blockConfirmVisible}
        onDismiss={() => setBlockConfirmVisible(false)}
        snapPoints={[{ fraction: 0.4 }]}
      >
        <View style={styles.sheetContainer}>
          <Text style={styles.sheetTitle}>Block {displayHandle}?</Text>
          <Text style={styles.sheetDescription}>
            They won't be able to follow you, message you, or view your profile. You can unblock them anytime.
          </Text>
          <View style={styles.confirmRow}>
            <AnimatedPressable
              style={styles.cancelBtn}
              onPress={() => setBlockConfirmVisible(false)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cancel block"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.confirmBlockBtn}
              onPress={confirmBlock}
              activeOpacity={0.85}
              disabled={blockMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Confirm block"
            >
              {blockMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmBlockBtnText}>Block</Text>
              )}
            </AnimatedPressable>
          </View>
        </View>
      </NativeSheet>
    </View>
  );
}

// ── Helper: open website safely ──────────────────────────────────────
function openWebsite(url: string) {
  let normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  Linking.openURL(normalized).catch(() => {});
}

// ── Stat cell ────────────────────────────────────────────────────────
function StatCell({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  const content = (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${value} ${label}`}>
        {content}
      </Pressable>
    );
  }
  return content;
}

// ── Tab rail ─────────────────────────────────────────────────────────
function TabRail({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.tabRail}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} tab${tab.count !== undefined ? `, ${tab.count} items` : ''}`}
          >
            <View style={styles.tabContent}>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
              {tab.count !== undefined ? (
                <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>{tab.count}</Text>
              ) : null}
            </View>
            {isActive ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Segmented control ────────────────────────────────────────────────
function SegmentedControl({
  segments,
  activeKey,
  onChange,
}: {
  segments: { key: string; label: string }[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.segmentControl}>
      {segments.map((seg) => {
        const isActive = seg.key === activeKey;
        return (
          <Pressable
            key={seg.key}
            style={[styles.segment, isActive && styles.segmentActive]}
            onPress={() => onChange(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={seg.label}
          >
            <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>{seg.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Shop tile (4:5 portrait) ─────────────────────────────────────────
const ShopTile = React.memo(function ShopTile({
  item,
  isSold,
  onPress,
  formatPrice,
  cardWidth,
  cardHeight,
}: {
  item: ListingApiItem;
  isSold: boolean;
  onPress: () => void;
  formatPrice: (fiatAmount: number, sourceCurrency?: SupportedCurrencyCode, options?: { displayMode?: CurrencyDisplayMode; fiatFractionDigits?: number; izeFractionDigits?: number }) => string;
  cardWidth: number;
  cardHeight: number;
}) {
  const showSold = isSold || item.status === 'sold';
  return (
    <AnimatedPressable
      style={[styles.gridCard, { width: cardWidth }]}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open listing ${item.title}`}
      accessibilityHint="Opens listing details"
    >
      <SharedTransitionView
        style={[styles.gridImageWrap, { width: cardWidth, height: cardHeight }]}
        sharedTransitionTag={`image-${item.id}-0`}
      >
        <CachedImage
          uri={item.images?.[0] ?? item.imageUrl ?? ''}
          style={styles.gridImage}
          containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.sm }}
          contentFit="cover"
        />
        {showSold ? (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldText}>SOLD</Text>
          </View>
        ) : null}
      </SharedTransitionView>
      <Text style={styles.gridPrice} numberOfLines={1}>
        {formatPrice(item.priceGbp, 'GBP', { displayMode: 'fiat' })}
      </Text>
      {item.brand ? (
        <Text style={styles.gridBrand} numberOfLines={1}>{item.brand}</Text>
      ) : null}
      {(item.size || item.condition) ? (
        <Text style={styles.gridMeta} numberOfLines={1}>
          {[item.size, item.condition].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
});

// ── Look tile (portrait editorial) ───────────────────────────────────
const LookTile = React.memo(function LookTile({
  item,
  onPress,
  cardWidth,
  cardHeight,
}: {
  item: LookApiItem;
  onPress: () => void;
  cardWidth: number;
  cardHeight: number;
}) {
  const isVideo = isVideoUri(item.mediaUrl);
  return (
    <AnimatedPressable
      style={[styles.gridCard, { width: cardWidth }]}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open Look ${item.title}`}
      accessibilityHint="Opens Look details"
    >
      <SharedTransitionView
        style={[styles.gridImageWrap, { width: cardWidth, height: cardHeight }]}
        sharedTransitionTag={`look-${item.id}`}
      >
        <CachedImage
          uri={item.mediaUrl}
          style={styles.gridImage}
          containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.sm }}
          contentFit="cover"
        />
        {/* Restrained overlays: video indicator + tag count */}
        {isVideo ? (
          <View style={styles.videoBadge}>
            <Ionicons name="play" size={10} color="#fff" />
          </View>
        ) : null}
        {item.tags && item.tags.length > 0 ? (
          <View style={styles.tagCountBadge}>
            <Text style={styles.tagCountText}>{item.tags.length}</Text>
          </View>
        ) : null}
      </SharedTransitionView>
      {item.title ? (
        <Text style={styles.lookTitle} numberOfLines={1}>{item.title}</Text>
      ) : null}
      <View style={styles.lookMetaRow}>
        {item.likeCount > 0 ? (
          <View style={styles.lookMetaItem}>
            <Ionicons name="heart-outline" size={11} color={MUTED} />
            <Text style={styles.lookMetaText}>{item.likeCount}</Text>
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
});

// ── Review row (flat editorial) ──────────────────────────────────────
const ReviewRow = React.memo(function ReviewRow({ item }: { item: SellerReviewItem }) {
  const reviewerName = item.reviewer.displayName || item.reviewer.username || 'Anonymous';
  const dateText = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewAvatarWrap}>
          {item.reviewer.avatar ? (
            <CachedImage
              uri={item.reviewer.avatar}
              style={styles.reviewAvatar}
              containerStyle={{ width: 36, height: 36, borderRadius: 18 }}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.reviewAvatar, styles.reviewAvatarFallback]}>
              <Ionicons name="person" size={16} color={MUTED} />
            </View>
          )}
        </View>
        <View style={styles.reviewIdentityCol}>
          <Text style={styles.reviewName} numberOfLines={1}>{reviewerName}</Text>
          <Text style={styles.reviewDate}>{dateText}</Text>
        </View>
        <View style={styles.reviewRatingRow}>
          <Ionicons name="star" size={12} color={BRAND} />
          <Text style={styles.reviewRatingValue}>{item.rating}</Text>
        </View>
      </View>
      {item.comment ? (
        <Text style={styles.reviewComment}>{item.comment}</Text>
      ) : null}
      {item.listing ? (
        <View style={styles.reviewListingContext}>
          {item.listing.imageUrl ? (
            <CachedImage
              uri={item.listing.imageUrl}
              style={styles.reviewListingThumb}
              containerStyle={{ width: 28, height: 28, borderRadius: 4 }}
              contentFit="cover"
            />
          ) : null}
          <Text style={styles.reviewListingTitle} numberOfLines={1}>{item.listing.title}</Text>
        </View>
      ) : null}
    </View>
  );
});

// ── Sheet item ───────────────────────────────────────────────────────
function SheetItem({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      style={styles.sheetItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={destructive ? DANGER : TEXT} />
      <Text style={[styles.sheetItemText, destructive && styles.sheetItemTextDestructive]}>{label}</Text>
    </Pressable>
  );
}

// ── Report sheet content ─────────────────────────────────────────────
const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam or misleading' },
  { key: 'inappropriate', label: 'Inappropriate content' },
  { key: 'counterfeit', label: 'Counterfeit item' },
  { key: 'unresponsive', label: 'Seller unresponsive' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'other', label: 'Other' },
];

function ReportSheetContent({
  isPending,
  onSubmit,
}: {
  isPending: boolean;
  onSubmit: (reason: ReportReason, details?: string) => void;
}) {
  const [selected, setSelected] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');

  return (
    <View style={styles.sheetContainer}>
      <Text style={styles.sheetTitle}>Report profile</Text>
      <Text style={styles.sheetDescription}>Help us understand the issue. Reports are reviewed by our team.</Text>
      {REPORT_REASONS.map((reason) => {
        const isActive = selected === reason.key;
        return (
          <Pressable
            key={reason.key}
            style={[styles.reportReason, isActive && styles.reportReasonActive]}
            onPress={() => setSelected(reason.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={reason.label}
          >
            <View style={[styles.radioOuter, isActive && styles.radioOuterActive]}>
              {isActive ? <View style={styles.radioInner} /> : null}
            </View>
            <Text style={styles.reportReasonLabel}>{reason.label}</Text>
          </Pressable>
        );
      })}
      <AnimatedPressable
        style={[styles.submitBtn, !selected && styles.btnDisabled]}
        onPress={() => selected && onSubmit(selected, details.trim() || undefined)}
        activeOpacity={0.85}
        disabled={!selected || isPending}
        accessibilityRole="button"
        accessibilityLabel="Submit report"
      >
        {isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>Submit report</Text>
        )}
      </AnimatedPressable>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Cover
  coverWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    zIndex: 0,
    overflow: 'hidden',
    backgroundColor: SURFACE_ALT,
  },
  coverSkeleton: {
    backgroundColor: SURFACE_ALT,
  },
  coverActionLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    zIndex: 8,
  },
  topUtilityRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topUtilityRight: {
    flexDirection: 'row',
    gap: 8,
  },
  topUtilityIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Collapsed header
  collapsedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 4,
  },
  collapsedBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  collapsedAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  collapsedTitle: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: TEXT,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  collapsedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collapsedFollowBtn: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedFollowingBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  collapsedFollowActiveBtn: {
    backgroundColor: BRAND,
  },
  collapsedFollowText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  collapsedFollowActiveText: {
    color: TEXT_INVERSE,
  },
  collapsedIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll host
  scrollHost: {
    flex: 1,
    zIndex: 1,
  },

  // Identity section
  identitySection: {
    paddingHorizontal: Space.md,
    paddingTop: AVATAR_OVERLAP + Space.sm,
    paddingBottom: Space.sm,
    backgroundColor: BG,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: Space.sm,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: BG,
  },
  avatarFallback: {
    backgroundColor: SURFACE_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCol: {
    flex: 1,
  },
  displayName: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: TEXT,
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: SECONDARY,
  },
  bio: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: TEXT,
    lineHeight: 20,
    marginBottom: Space.sm,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: Space.sm,
  },
  contextItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contextText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  contextLink: {
    color: SECONDARY,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Space.lg,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    marginBottom: Space.sm,
  },
  statCell: {
    alignItems: 'flex-start',
  },
  statValue: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    color: TEXT,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: MUTED,
    marginTop: 1,
  },

  // Rating row
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  ratingValue: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    color: TEXT,
  },
  ratingCount: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: SECONDARY,
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: BG,
  },
  followBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnActive: {
    backgroundColor: BRAND,
  },
  followingBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  followBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
  },
  followActiveBtnText: {
    color: TEXT_INVERSE,
  },
  followingBtnText: {
    color: TEXT,
  },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  messageBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  secondaryActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  editProfileBtnText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Tab rail
  tabRailWrap: {
    backgroundColor: BG,
  },
  tabRail: {
    flexDirection: 'row',
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: Space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  tabLabelActive: {
    fontFamily: Typography.family.bold,
    color: TEXT,
  },
  tabCount: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  tabCountActive: {
    color: SECONDARY,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    backgroundColor: TEXT,
  },

  // Segmented control
  segmentWrap: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: BG,
  },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: SURFACE_ALT,
    borderRadius: Radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    height: 34,
    borderRadius: Radius.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: BG,
  },
  segmentLabel: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: MUTED,
  },
  segmentLabelActive: {
    color: TEXT,
    fontFamily: Typography.family.semibold,
  },

  // Grid
  gridCard: {
    marginBottom: Space.md,
  },
  gridImageWrap: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  soldOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Typography.family.bold,
    letterSpacing: 1,
  },
  gridPrice: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    color: TEXT,
    marginTop: 6,
  },
  gridBrand: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: SECONDARY,
    marginTop: 1,
  },
  gridMeta: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: MUTED,
    marginTop: 1,
  },

  // Look tile
  lookTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: TEXT,
    marginTop: 6,
  },
  lookMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  lookMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  lookMetaText: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  videoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagCountBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagCountText: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: '#fff',
  },

  // Review row
  reviewRow: {
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  reviewAvatarWrap: {},
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  reviewAvatarFallback: {
    backgroundColor: SURFACE_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewIdentityCol: {
    flex: 1,
  },
  reviewName: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  reviewDate: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: MUTED,
    marginTop: 1,
  },
  reviewRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  reviewRatingValue: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    color: TEXT,
  },
  reviewComment: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: TEXT,
    lineHeight: 20,
  },
  reviewListingContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 4,
  },
  reviewListingThumb: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  reviewListingTitle: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: SECONDARY,
  },

  // List states
  listState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    paddingHorizontal: Space.md,
    gap: 8,
  },
  listStateTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  listStateSub: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: MUTED,
    textAlign: 'center',
  },
  loadMoreIndicator: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  loadMoreBtn: {
    paddingVertical: 12,
    paddingHorizontal: Space.lg,
    alignItems: 'center',
    marginBottom: Space.md,
  },
  loadMoreText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: SECONDARY,
  },

  // Skeleton
  skeletonBody: {
    paddingHorizontal: Space.md,
    paddingTop: AVATAR_OVERLAP + Space.sm,
  },
  skeletonAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: SURFACE_ALT,
    marginBottom: Space.sm,
  },
  skeletonName: {
    width: 180,
    height: 22,
    borderRadius: 4,
    backgroundColor: SURFACE_ALT,
    marginBottom: 6,
  },
  skeletonHandle: {
    width: 120,
    height: 14,
    borderRadius: 4,
    backgroundColor: SURFACE_ALT,
    marginBottom: Space.md,
  },
  skeletonStatsRow: {
    flexDirection: 'row',
    gap: Space.lg,
    marginBottom: Space.md,
  },
  skeletonStat: {
    width: 60,
    height: 36,
    borderRadius: 4,
    backgroundColor: SURFACE_ALT,
  },
  skeletonTabRail: {
    height: 44,
    backgroundColor: SURFACE_ALT,
    marginBottom: Space.md,
  },
  skeletonGrid: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  skeletonCard: {
    flex: 1,
    aspectRatio: 1 / CARD_ASPECT,
    borderRadius: Radius.sm,
    backgroundColor: SURFACE_ALT,
  },

  // State containers
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: Space.md,
  },
  stateText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  stateSubtext: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: MUTED,
    textAlign: 'center',
  },

  // Sheet
  sheetContainer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: TEXT,
    marginBottom: Space.sm,
  },
  sheetDescription: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: SECONDARY,
    lineHeight: 20,
    marginBottom: Space.md,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    minHeight: 52,
  },
  sheetItemText: {
    fontSize: 16,
    fontFamily: Typography.family.regular,
    color: TEXT,
    flex: 1,
  },
  sheetItemTextDestructive: {
    color: DANGER,
  },

  // Report sheet
  reportReason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    minHeight: 52,
  },
  reportReasonActive: {},
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: BRAND,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND,
  },
  reportReasonLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: TEXT,
  },
  submitBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.md,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: TEXT_INVERSE,
  },

  // Block confirm
  confirmRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: Space.md,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  confirmBlockBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: DANGER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBlockBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
});
