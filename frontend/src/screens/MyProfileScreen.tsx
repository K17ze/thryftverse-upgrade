import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  Share,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { EmptyState } from '../components/EmptyState';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, FontFamily, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { useStore } from '../store/useStore';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { listCoOwnAssets, fetchCoOwnHoldings } from '../services/marketApi';
import { fetchFollowCounts } from '../services/profileApi';
import { parseApiError } from '../lib/apiClient';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipProfileMedia } from '../components/flagship';
import { LookPreviewCard } from '../components/profile';
import { MyProfileIdentityHero } from '../components/profile/MyProfileIdentityHero';
import { ProfileUtilityRail } from '../components/profile/ProfileUtilityRail';
import { MyProfileTabRail } from '../components/profile/MyProfileTabRail';
import { useSellerTrust, VERIFICATION_TIERS } from '../platform/product';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';
import { isVideoUri } from '../utils/media';
import { fetchLooksFromApi, type LookApiItem } from '../services/looksApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COVER_HEIGHT = 152;

/**
 * Compact number formatting for social/stats counters.
 *   999        → "999"
 *   1200       → "1.2K"
 *   12500      → "12.5K"
 *   125000     → "125K"
 *   1250000    → "1.2M"
 *   12500000   → "12M"
 */
function formatCompact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100000) {
    const v = (n / 1000).toFixed(1).replace(/\.0$/, '');
    return `${v}K`;
  }
  if (n < 1000000) {
    return `${Math.round(n / 1000)}K`;
  }
  if (n < 10000000) {
    const v = (n / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${v}M`;
  }
  return `${Math.round(n / 1000000)}M`;
}

export default function MyProfileScreen() {
  const { colors, isDark } = useAppTheme();

  // Themed style overrides — color properties extracted from module-level styles
  const t = {
    container: { backgroundColor: colors.background },
    coverWrap: { backgroundColor: colors.surfaceAlt },
    coverFailureText: { color: colors.textInverse },
    coverFailureActionText: { color: colors.textInverse },
    floatingHeader: { backgroundColor: colors.background, borderBottomColor: colors.border },
    floatingHeaderTitle: { color: colors.textPrimary },
    gridHeaderCount: { color: colors.textMuted },
    gridHeaderAction: { color: colors.brand },
    soldText: { color: colors.textInverse },
    gridPrice: { color: colors.textPrimary },
    gridBrand: { color: colors.textSecondary },
    gridMeta: { color: colors.textMuted },
    listingsEmptyTitle: { color: colors.textPrimary },
    listingsEmptyBody: { color: colors.textMuted },
    listingsEmptyCta: { backgroundColor: colors.brand },
    listingsEmptyCtaText: { color: colors.textInverse },
    aboutSectionTitle: { color: colors.textPrimary },
    aboutRow: { borderBottomColor: colors.border },
    aboutLabel: { color: colors.textMuted },
    aboutValue: { color: colors.textPrimary },
    aboutEmpty: { color: colors.textMuted },
    topUtilityVisible: { backgroundColor: `${colors.textPrimary}6B`, borderColor: `${colors.textInverse}2E` },
    coverEditVisible: { backgroundColor: `${colors.textPrimary}8C`, borderColor: `${colors.textInverse}3D` },
    coverFailure: { backgroundColor: `${colors.textPrimary}B8` },
    soldOverlay: { backgroundColor: `${colors.textPrimary}80` },
    statsRow: { borderBottomColor: colors.borderSubtle, borderTopColor: colors.borderSubtle },
    statValue: { color: colors.textPrimary },
    statLabel: { color: colors.textMuted },
    statDivider: { backgroundColor: colors.borderSubtle },
    trustBadgeText: { color: colors.textSecondary },
    trustBadgeVerified: { color: colors.success },
    trustBadgeSep: { backgroundColor: colors.borderSubtle },
    completionCard: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle },
    completionTrack: { backgroundColor: colors.borderSubtle },
    completionFill: { backgroundColor: colors.brand },
    completionTitle: { color: colors.textPrimary },
    completionPercent: { color: colors.textMuted },
    completionCta: { backgroundColor: colors.brand },
    completionCtaText: { color: colors.textInverse },
    growthCard: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle },
    growthTitle: { color: colors.textPrimary },
    growthRow: { borderColor: colors.borderSubtle },
    growthRowTitle: { color: colors.textPrimary },
    growthRowSub: { color: colors.textMuted },
    portfolioPreview: { backgroundColor: colors.surfaceAlt },
    portfolioLabel: { color: colors.textSecondary },
    portfolioHoldingTitle: { color: colors.textPrimary },
    portfolioHoldingUnits: { color: colors.textMuted },
  };
  const tMyProfile = {
    awayBanner: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    awayBannerTitle: { color: colors.textPrimary },
    awayBannerSub: { color: colors.textMuted },
  };

  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const reducedMotionEnabled = useReducedMotion();
  const scrollRef = React.useRef<Reanimated.ScrollView>(null);
  useScrollToTop(scrollRef);
  const [activeTab, setActiveTab] = React.useState<'listings' | 'looks' | 'saved' | 'about'>('listings');

  const { show } = useToast();
  const haptic = useHaptic();

  const { formatFromFiat } = useFormattedPrice();

  const { listings } = useBackendData();
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);
  const updateUserProfile = useStore((state) => state.updateUserProfile);

  const currentUser = useStore((state) => state.currentUser);
  const holidayMode = useStore((state) => state.accountPreferences?.holidayMode === true);

  const [coOwnHoldings, setCoOwnHoldings] = React.useState<any[]>([]);

  // Seller trust summary — verified badge, response time, dispatch time, completed sales
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

  // Follow counts — followers/following for the stats row
  const [followCounts, setFollowCounts] = React.useState<{ followerCount: number; followingCount: number }>({ followerCount: 0, followingCount: 0 });
  React.useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    fetchFollowCounts(currentUser.id)
      .then((counts) => { if (!cancelled) setFollowCounts(counts); })
      .catch(() => { /* follow counts are non-critical */ });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    Promise.all([
      listCoOwnAssets({ limit: 120 }),
      fetchCoOwnHoldings(currentUser.id).catch(() => []),
    ])
      .then(([assets, holdings]) => {
        if (cancelled) return;
        const holdingMap = new Map<string, { units: number; avgEntry: number; realized: number }>();
        for (const h of holdings) {
          holdingMap.set(h.assetId, { units: h.unitsOwned, avgEntry: h.avgEntryPriceGbp, realized: h.realizedPnlGbp });
        }
        const merged = assets
          .filter((a) => (holdingMap.get(a.id)?.units ?? 0) > 0)
          .map((a) => {
            const h = holdingMap.get(a.id);
            return {
              id: a.id,
              title: a.title,
              image: a.imageUrl ?? '',
              totalUnits: a.totalUnits,
              availableUnits: a.availableUnits,
              unitPriceGBP: a.unitPriceGbp,
              unitPriceStable: a.unitPriceStable,
              settlementMode: a.settlementMode,
              issuerId: a.issuerId,
              marketMovePct24h: a.marketMovePct24h,
              holders: a.holders,
              volume24hGBP: a.volume24hGbp,
              isOpen: a.isOpen,
              yourUnits: h?.units ?? 0,
              avgEntryPriceGBP: h?.avgEntry,
              realizedProfitGBP: h?.realized,
            };
          });
        setCoOwnHoldings(merged);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load portfolio');
        show(parsed.message, 'error');
      });
    return () => { cancelled = true; };
  }, [currentUser?.id, show]);

  const userAvatar = useStore((state) => state.userAvatar);
  const userCover = useStore((state) => state.userCover);
  const updateUserAvatar = useStore((state) => state.updateUserAvatar);
  const updateUserCover = useStore((state) => state.updateUserCover);
  const user = currentUser;
  const [myLooks, setMyLooks] = React.useState<LookApiItem[]>([]);
  const [looksLoading, setLooksLoading] = React.useState(false);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    setLooksLoading(true);
    fetchLooksFromApi({ creatorId: currentUser.id })
      .then((res) => setMyLooks(res.items ?? []))
      .catch(() => setMyLooks([]))
      .finally(() => setLooksLoading(false));
  }, [currentUser?.id]);

  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);

  const confirmedAvatarRemote = user?.avatar ?? userAvatar ?? null;
  const confirmedCoverRemote = user?.coverPhoto ?? userCover ?? null;

  const {
    avatar: avatarState,
    cover: coverState,
    pickAvatar,
    pickCover,
    retryAvatar,
    retryCover,
    revertAvatar,
    revertCover,
  } = useProfileMediaUpload(
    user?.id,
    confirmedAvatarRemote,
    confirmedCoverRemote,
    (url) => {
      updateUserAvatar(url);
      updateUserProfile({ avatar: url });
    },
    (url) => {
      updateUserCover(url);
      updateUserProfile({ coverPhoto: url, coverVideo: null });
      fetchMyProfile().catch(() => {});
    }
  );

  React.useEffect(() => {
    fetchMyProfile().catch(() => {});
  }, [fetchMyProfile]);

  // Show toast on cover upload status changes
  const prevCoverStatus = React.useRef(coverState.status);
  React.useEffect(() => {
    if (coverState.status === 'confirmed' && prevCoverStatus.current !== 'confirmed') {
      show('Cover updated', 'success');
    } else if (coverState.status === 'failed' && prevCoverStatus.current !== 'failed') {
      show('Cover upload failed', 'error');
    }
    prevCoverStatus.current = coverState.status;
  }, [coverState.status, show]);

  // Show toast on avatar upload status changes
  const prevAvatarStatus = React.useRef(avatarState.status);
  React.useEffect(() => {
    if (avatarState.status === 'confirmed' && prevAvatarStatus.current !== 'confirmed') {
      show('Avatar updated', 'success');
    } else if (avatarState.status === 'failed' && prevAvatarStatus.current !== 'failed') {
      show('Avatar upload failed', 'error');
    }
    prevAvatarStatus.current = avatarState.status;
  }, [avatarState.status, show]);

  if (!user) {
    return (
      <View style={[styles.container, t.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <EmptyState
          icon="person-outline"
          title="Not signed in"
          subtitle="Sign in to view your profile, listings, and wallet."
          ctaLabel="Sign In"
          onCtaPress={() => navigation.navigate('Login')}
        />
      </View>
    );
  }

  const profileUserId = user.id;
  const profileMediaOverride = profileMediaOverrides[profileUserId] ?? null;

  // Display priority: pending local > confirmed remote > store > override
  const displayCover = coverState.pendingLocal
    || coverState.confirmedRemote
    || user.coverPhoto
    || userCover
    || profileMediaOverride?.cover
    || '';
  const displayAvatar = avatarState.pendingLocal
    || avatarState.confirmedRemote
    || user.avatar
    || userAvatar
    || profileMediaOverride?.avatar
    || null;

  const allOwnedListings = React.useMemo(() => listings.filter((item) => item.sellerId === profileUserId), [listings, profileUserId]);

  // Profile completion — drives the progress prompt. Completion measures ONLY
  // identity fields the user can complete directly: display name, bio, profile
  // photo and cover. Audience growth (followers) and first listing are NOT
  // profile-completion requirements — they are growth tasks surfaced separately
  // below the identity hero so a user is never told their profile is
  // "incomplete" because nobody has followed them or they haven't listed yet.
  const completion = React.useMemo(() => {
    const checks = [
      Boolean(user.displayName?.trim()),
      Boolean(user.bio?.trim()),
      Boolean(displayAvatar),
      Boolean(displayCover),
    ];
    const done = checks.filter(Boolean).length;
    return { percent: Math.round((done / checks.length) * 100), done, total: checks.length };
  }, [user.displayName, user.bio, displayAvatar, displayCover]);

  // Once every direct identity field is filled the profile is "sufficiently
  // complete" and the completion card is permanently removed from the ordinary
  // profile view (it does not reappear on later visits).
  const profileSufficientlyComplete = completion.percent >= 100;

  // First missing identity facet → the CTA label + EditProfile focus. Every
  // completion CTA routes to EditProfile because every remaining gap is a
  // direct profile field. Listing/audience growth CTAs live in the separate
  // growth-tasks section below the identity hero.
  const completionCta = React.useMemo<{ label: string; focus?: 'avatar' | 'cover' }>(() => {
    if (!user.displayName?.trim()) return { label: 'Add name' };
    if (!user.bio?.trim()) return { label: 'Add bio' };
    if (!displayAvatar) return { label: 'Add photo', focus: 'avatar' };
    if (!displayCover) return { label: 'Add cover', focus: 'cover' };
    return { label: 'Edit profile' };
  }, [user.displayName, user.bio, displayAvatar, displayCover]);

  const [completionDismissed, setCompletionDismissed] = React.useState(false);
  // Re-show the prompt when completion improves so progress is celebrated once.
  const prevPercentRef = React.useRef(completion.percent);
  React.useEffect(() => {
    if (completion.percent > prevPercentRef.current) {
      setCompletionDismissed(false);
    }
    prevPercentRef.current = completion.percent;
  }, [completion.percent]);
  const showCompletionPrompt =
    !profileSufficientlyComplete && !completionDismissed && completion.percent < 100;

  // Growth tasks — first listing and audience growth are surfaced outside the
  // identity hero as optional onboarding prompts. They are NOT profile-
  // completion requirements. Each CTA routes to a truthful destination:
  // "List your first item" → Sell, "Grow your audience" → creator analytics.
  const showFirstListingGrowth = allOwnedListings.length === 0;
  const showAudienceGrowth = followCounts.followerCount === 0;
  const [growthDismissed, setGrowthDismissed] = React.useState(false);
  const showGrowthPrompt = !growthDismissed && (showFirstListingGrowth || showAudienceGrowth);

  // Parallax scroll for cover
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const coverStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [-100, 0, COVER_HEIGHT],
      [-50, 0, -COVER_HEIGHT],
      Extrapolation.CLAMP
    );
    const scale = interpolate(scrollY.value, [-100, 0], [1.25, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY }, { scale }] };
  });

  const coverActionStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, COVER_HEIGHT],
          [0, -COVER_HEIGHT],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const topUtilityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const headerOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [32, 72],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const handleShare = async () => {
    haptic.light();
    try {
      await Share.share({
        message: `Check out @${user.username} on Thryftverse! https://thryftverse.com/@${user.username}`,
        url: `https://thryftverse.com/@${user.username}`,
        title: `${user.displayName || user.username} on Thryftverse`,
      });
    } catch { /* user cancelled or share unavailable */ }
  };

  const wishlistCount = useStore((state) => state.wishlist.length);
  const savedCount = useStore((state) => state.savedProducts.length);
  const savedProductIds = useStore((state) => state.savedProducts);
  const savedListings = React.useMemo(
    () => listings.filter((item) => savedProductIds.includes(item.id)),
    [listings, savedProductIds]
  );

  const utilityItems = React.useMemo(
    () => [
      {
        icon: 'bag-handle-outline' as const,
        label: 'Orders',
        onPress: () => { haptic.light(); navigation.navigate('MyOrders'); },
        accessibilityLabel: 'Orders',
      },
      {
        icon: 'pulse-outline' as const,
        label: 'Analytics',
        onPress: () => { haptic.light(); navigation.navigate('CreatorAnalyticsDashboard'); },
        accessibilityLabel: 'Creator analytics',
      },
      {
        icon: 'bookmark-outline' as const,
        label: 'Closet',
        value: `${savedCount + wishlistCount} items`,
        onPress: () => { haptic.light(); navigation.navigate('Closet'); },
        accessibilityLabel: 'Closet',
      },
      {
        icon: 'wallet-outline' as const,
        label: 'Wallet',
        onPress: () => { haptic.light(); navigation.navigate('Wallet'); },
        accessibilityLabel: 'Wallet',
      },
      {
        icon: 'timer-outline' as const,
        label: 'Auctions',
        onPress: () => { haptic.light(); navigation.navigate('AuctionHome'); },
        accessibilityLabel: 'Browse auctions',
      },
      {
        icon: 'layers-outline' as const,
        label: 'Co-own',
        value: coOwnHoldings.length > 0 ? `${coOwnHoldings.length} assets` : undefined,
        onPress: () => { haptic.light(); navigation.navigate('CoOwnHub'); },
        accessibilityLabel: 'Browse co-own market',
      },
    ],
    [coOwnHoldings.length, savedCount, wishlistCount, allOwnedListings.length, haptic, navigation]
  );

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : undefined;

  const GRID_GAP = 4;
  const GRID_COLS = 3;
  const CARD_WIDTH = (SCREEN_WIDTH - Space.md * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const CARD_HEIGHT = CARD_WIDTH * (4 / 3); // 3:4 portrait — Poshmark 2026 standard

  return (
    <View style={[styles.container, t.container]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* ── 1. FULL-WIDTH COVER ── */}
      <Reanimated.View style={[styles.coverWrap, t.coverWrap, coverStyle]}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          coverVideoUri={isVideoUri(displayCover) ? displayCover : undefined}
          isSelf
          coverOnly
          coverHeight={COVER_HEIGHT}
          isUploadingCover={coverState.status === 'uploading'}
          isUploadingAvatar={avatarState.status === 'uploading'}
          style={{ width: '100%' }}
        />
      </Reanimated.View>

      {/* ── 2. FLOATING PERSONALISATION, SHARE AND SETTINGS ── */}
      <Reanimated.View pointerEvents="box-none" style={[styles.coverActionLayer, coverActionStyle]}>
        <Reanimated.View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }, topUtilityStyle]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            onPress={() => { haptic.light(); navigation.navigate('Personalisation'); }}
            accessibilityLabel="Open personalisation settings"
            accessibilityRole="button"
            accessibilityHint="Opens your style and experience preferences"
          >
            <View style={styles.topUtilityVisible}>
              <Ionicons name="options-outline" size={19} color={colors.textInverse} />
            </View>
          </AnimatedPressable>

          <View style={styles.topUtilityRight}>
            <AnimatedPressable
              style={styles.topUtilityIconBtn}
              onPress={handleShare}
              accessibilityLabel="Share profile"
              accessibilityRole="button"
              accessibilityHint="Opens the system share sheet to share your profile"
            >
              <View style={styles.topUtilityVisible}>
                <Ionicons name="share-outline" size={18} color={colors.textInverse} />
              </View>
            </AnimatedPressable>

            <AnimatedPressable
              style={styles.topUtilityIconBtn}
              onPress={() => { haptic.light(); navigation.navigate('Settings'); }}
              accessibilityLabel="Open settings"
              accessibilityRole="button"
              accessibilityHint="Opens account and app settings"
            >
              <View style={styles.topUtilityVisible}>
                <Ionicons name="settings-outline" size={19} color={colors.textInverse} />
              </View>
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        {coverState.status === 'failed' ? (
          <View style={styles.coverFailure}>
            <View style={styles.coverFailureCopy}>
              <Ionicons name="alert-circle-outline" size={17} color={colors.textInverse} />
              <Text style={[styles.coverFailureText, t.coverFailureText]} numberOfLines={1}>
                {coverState.error || 'Cover upload failed'}
              </Text>
            </View>
            <AnimatedPressable
              style={styles.coverFailureAction}
              onPress={retryCover}
              accessibilityRole="button"
              accessibilityLabel="Retry cover upload"
              hitSlop={5}
            >
              <Text style={[styles.coverFailureActionText, t.coverFailureActionText]}>Retry</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.coverFailureAction}
              onPress={revertCover}
              accessibilityRole="button"
              accessibilityLabel="Cancel cover change"
              hitSlop={5}
            >
              <Text style={[styles.coverFailureActionText, t.coverFailureActionText]}>Cancel</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <AnimatedPressable
            style={styles.coverEditTarget}
            onPress={pickCover}
            hapticFeedback="light"
            disabled={coverState.status === 'uploading'}
            accessibilityRole="button"
            accessibilityLabel={
              coverState.status === 'uploading'
                ? 'Uploading profile cover'
                : 'Change profile cover'
            }
            accessibilityState={{ disabled: coverState.status === 'uploading', busy: coverState.status === 'uploading' }}
          >
            <View style={styles.coverEditVisible}>
              {coverState.status === 'uploading' ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Ionicons name="image-outline" size={17} color={colors.textInverse} />
              )}
            </View>
          </AnimatedPressable>
        )}
      </Reanimated.View>

      {/* ── COLLAPSED SCROLL HEADER ── */}
      <Reanimated.View style={[styles.floatingHeader, t.floatingHeader, { paddingTop: insets.top }, headerOpacityStyle]} pointerEvents="none">
        <View style={{ flex: 1 }} />
        <Text style={[styles.floatingHeaderTitle, t.floatingHeaderTitle]} numberOfLines={1} ellipsizeMode="tail">{user.username}</Text>
        <View style={{ flex: 1 }} />
      </Reanimated.View>

      <Reanimated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: COVER_HEIGHT - 50 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── 3-9: IDENTITY HERO + ACTIONS ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(40)}>
          <MyProfileIdentityHero
            avatarUri={displayAvatar}
            displayName={user.displayName || user.username}
            username={user.username}
            bio={user.bio ?? undefined}
            location={user.location ?? undefined}
            memberSince={memberSince}
            listingCount={allOwnedListings.length}
            lookCount={myLooks.length}
            sellerTrust={sellerTrust}
            emailVerified={user.emailVerified}
            followerCount={followCounts.followerCount}
            followingCount={followCounts.followingCount}
            onEditAvatar={pickAvatar}
            onEditProfile={() => navigation.navigate('EditProfile', {})}
            onShare={handleShare}
            onPressListings={() => { haptic.light(); navigation.navigate('MyListings'); }}
            onPressLooks={() => { haptic.light(); }}
            onPressSold={() => { haptic.light(); navigation.navigate('MyOrders'); }}
          />

          {/* Away-mode indicator — shown when holiday mode is enabled */}
          {holidayMode ? (
            <Pressable
              style={[myProfileStyles.awayBanner, tMyProfile.awayBanner]}
              onPress={() => navigation.navigate('PrivacySettings')}
              accessibilityRole="button"
              accessibilityLabel="Holiday mode is on — tap to manage"
            >
              <Ionicons name="pause-circle" size={18} color={colors.textMuted} />
              <View style={myProfileStyles.awayBannerTextWrap}>
                <Text style={[myProfileStyles.awayBannerTitle, tMyProfile.awayBannerTitle]}>Holiday mode is on</Text>
                <Text style={[myProfileStyles.awayBannerSub, tMyProfile.awayBannerSub]}>
                  Your shop is paused. Tap to manage.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}

          {/* ── 8. COMPACT MARKETPLACE UTILITY RAIL ── */}
          <ProfileUtilityRail items={utilityItems} />

          {/* ── 9. STICKY FLAT TAB RAIL ── */}
          <MyProfileTabRail
            tabs={[
              { key: 'listings', label: 'Listings', count: allOwnedListings.length },
              { key: 'looks', label: 'Looks', count: myLooks.length },
              { key: 'saved', label: 'Saved', count: savedCount + wishlistCount },
              { key: 'about', label: 'About' },
            ]}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'listings' | 'looks' | 'saved' | 'about')}
          />
        </Reanimated.View>

        {/* ── 10. ACTIVE TAB CONTENT ── */}

        {/* LISTINGS TAB — two-column portfolio grid */}
        {activeTab === 'listings' && (
          <View style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}>
            {allOwnedListings.length === 0 ? (
              <View style={styles.listingsEmpty}>
                <Ionicons name="bag-add-outline" size={27} color={colors.textSecondary} />
                <Text style={[styles.listingsEmptyTitle, t.listingsEmptyTitle]}>List your first item</Text>
                <Text style={[styles.listingsEmptyBody, t.listingsEmptyBody]}>
                  Photograph an item and publish it when you are ready.
                </Text>
                <AnimatedPressable
                  style={[styles.listingsEmptyCta, t.listingsEmptyCta]}
                  onPress={() => navigation.navigate('Sell')}
                  accessibilityRole="button"
                  accessibilityLabel="Start selling"
                  hitSlop={1}
                >
                  <Text style={[styles.listingsEmptyCtaText, t.listingsEmptyCtaText]}>Start selling</Text>
                </AnimatedPressable>
              </View>
            ) : (
              <>
                <View style={styles.gridHeader}>
                  <Text style={[styles.gridHeaderCount, t.gridHeaderCount]}>{allOwnedListings.length} listings</Text>
                  <Pressable
                    onPress={() => navigation.navigate('MyListings')}
                    accessibilityRole="button"
                    accessibilityLabel="View all listings"
                    hitSlop={13}
                  >
                    <Text style={[styles.gridHeaderAction, t.gridHeaderAction]}>View All</Text>
                  </Pressable>
                </View>
                <View style={styles.grid}>
                  {allOwnedListings.map((item) => (
                    <AnimatedPressable
                      key={item.id}
                      style={[styles.gridCard, { width: CARD_WIDTH }]}
                      onPress={() => navigation.navigate('ManageListing', { itemId: item.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Manage ${item.title}`}
                    >
                      <SharedTransitionView
                        style={[styles.gridImageWrap, { width: CARD_WIDTH, height: CARD_HEIGHT }]}
                        sharedTransitionTag={`image-${item.id}-0`}
                      >
                        <CachedImage
                          uri={item.images?.[0] ?? ''}
                          style={styles.gridImage}
                          containerStyle={{ width: '100%', height: '100%', borderRadius: RadiusRoleValue.compactControl }}
                          contentFit="cover"
                        />
                        {item.isSold ? (
                          <View style={styles.soldOverlay}>
                            <Text style={[styles.soldText, t.soldText]}>SOLD</Text>
                          </View>
                        ) : null}
                      </SharedTransitionView>
                      <Text style={[styles.gridPrice, t.gridPrice]} numberOfLines={1}>
                        {formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}
                      </Text>
                      {item.brand ? (
                        <Text style={[styles.gridBrand, t.gridBrand]} numberOfLines={1}>{item.brand}</Text>
                      ) : null}
                    </AnimatedPressable>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* LOOKS TAB — fetched from backend */}
        {activeTab === 'looks' && (
          <View style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}>
            {looksLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ color: colors.textMuted, fontSize: TypographyV2.body.size }}>Loading looks...</Text>
              </View>
            ) : myLooks.length === 0 ? (
              <EmptyState
                density="compact"
                icon="images-outline"
                title="No Looks yet"
                subtitle="Create your first Look to showcase your style."
                ctaLabel="Create Look"
                onCtaPress={() => navigation.navigate('CreatorStudio', { type: 'look' })}
              />
            ) : (
              <View style={{ paddingHorizontal: Space.md }}>
                {myLooks.map((look, index) => (
                  <LookPreviewCard
                    key={look.id}
                    id={look.id}
                    title={look.caption || look.title}
                    coverImage={look.mediaUrl}
                    items={look.tags.map((t) => ({ id: t.id, label: t.label, x: t.x, y: t.y }))}
                    creatorName={look.creator.username ?? user.username}
                    creatorAvatar={look.creator.avatar ?? undefined}
                    likes={look.likeCount}
                    saved={look.savedByViewer}
                    onPress={() => navigation.navigate('LookDetail', { lookId: look.id })}
                    index={index}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* SAVED TAB — saved items and wishlist */}
        {activeTab === 'saved' && (
          <View style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}>
            {savedCount + wishlistCount === 0 ? (
              <EmptyState
                density="compact"
                icon="bookmark-outline"
                title="Nothing saved yet"
                subtitle="Tap the bookmark on any listing to save it for later."
                ctaLabel="Browse listings"
                onCtaPress={() => navigation.navigate('MainTabs')}
              />
            ) : (
              <>
                <View style={styles.gridHeader}>
                  <Text style={[styles.gridHeaderCount, t.gridHeaderCount]}>
                    {savedCount + wishlistCount} saved
                  </Text>
                  <Pressable
                    onPress={() => navigation.navigate('Closet')}
                    accessibilityRole="button"
                    accessibilityLabel="View all saved items"
                    hitSlop={13}
                  >
                    <Text style={[styles.gridHeaderAction, t.gridHeaderAction]}>View All</Text>
                  </Pressable>
                </View>
                <View style={styles.grid}>
                  {savedListings.slice(0, 9).map((item) => (
                    <AnimatedPressable
                      key={item.id}
                      style={[styles.gridCard, { width: CARD_WIDTH }]}
                      onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${item.title}`}
                    >
                      <SharedTransitionView
                        style={[styles.gridImageWrap, { width: CARD_WIDTH, height: CARD_HEIGHT }]}
                        sharedTransitionTag={`image-${item.id}-saved`}
                      >
                        <CachedImage
                          uri={item.images?.[0] ?? ''}
                          style={styles.gridImage}
                          containerStyle={{ width: '100%', height: '100%', borderRadius: RadiusRoleValue.compactControl }}
                          contentFit="cover"
                        />
                      </SharedTransitionView>
                      <Text style={[styles.gridPrice, t.gridPrice]} numberOfLines={1}>
                        {formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}
                      </Text>
                      {item.brand ? (
                        <Text style={[styles.gridBrand, t.gridBrand]} numberOfLines={1}>{item.brand}</Text>
                      ) : null}
                    </AnimatedPressable>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* ABOUT TAB — flat editorial layout */}
        {/* Bio, location, and member-since are shown in the IdentityHero above.
            The About tab shows only information NOT already visible: website,
            shop policies, and Co-Own portfolio (recessed from the hero). */}
        {activeTab === 'about' && (
          <View style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}>
            {/* ── CO-OWN PORTFOLIO PREVIEW — recessed into About tab ── */}
            {coOwnHoldings.length > 0 ? (
              <AnimatedPressable
                style={[styles.portfolioPreview, t.portfolioPreview]}
                onPress={() => { haptic.light(); navigation.navigate('CoOwnHub'); }}
                accessibilityRole="button"
                accessibilityLabel="View Co-Own portfolio"
                accessibilityHint="Opens your Co-Own holdings hub"
              >
                <View style={styles.portfolioHeader}>
                  <Text style={[styles.portfolioLabel, t.portfolioLabel]}>CO-OWN PORTFOLIO</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs / 2 }}>
                    <Text style={[styles.portfolioHoldingUnits, t.portfolioHoldingUnits]}>View all</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </View>
                </View>
                <View style={styles.portfolioHoldings}>
                  {coOwnHoldings.slice(0, 3).map((h) => (
                    <View key={h.id} style={styles.portfolioHoldingCard}>
                      {h.image ? (
                        <CachedImage
                          uri={h.image}
                          style={styles.portfolioHoldingImage}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.portfolioHoldingImage, { backgroundColor: colors.surfaceAlt }]} />
                      )}
                      <View style={styles.portfolioHoldingInfo}>
                        <Text style={[styles.portfolioHoldingTitle, t.portfolioHoldingTitle]} numberOfLines={1}>
                          {h.title}
                        </Text>
                        <Text style={[styles.portfolioHoldingUnits, t.portfolioHoldingUnits]}>
                          {h.yourUnits} {h.yourUnits === 1 ? 'unit' : 'units'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </AnimatedPressable>
            ) : null}

            {user.website ? (
              <View style={styles.aboutContainer}>
                <View style={[styles.aboutRow, t.aboutRow, styles.aboutRowLast]}>
                  <Text style={[styles.aboutLabel, t.aboutLabel]}>Website</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs }}>
                    <Text style={[styles.aboutValue, t.aboutValue, { flexShrink: 1 }]} numberOfLines={1}>{user.website}</Text>
                    <Ionicons name="open-outline" size={13} color={colors.textMuted} />
                  </View>
                </View>
              </View>
            ) : null}

            {/* Shop policies — canonical home for dispatch/response details.
                Trust badges above show a compact "Replies Xh" pill; this section
                provides the full policy context without duplicating the badge. */}
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

            {!user.website && !sellerTrust && (
              <Text style={[styles.aboutEmpty, t.aboutEmpty]}>No additional details available.</Text>
            )}
          </View>
        )}

        {/* ── COMPLETION & GROWTH PROMPTS — below the fold, not competing with identity ── */}
        {/* These are optional onboarding prompts that recede below the tab
            content so identity dominates the first viewport. They are still
            accessible by scrolling down. */}
        {showCompletionPrompt ? (
          <View style={[styles.completionCard, t.completionCard]}>
            <View style={styles.completionHead}>
              <View style={styles.completionHeadText}>
                <Text style={[styles.completionTitle, t.completionTitle]}>Complete your profile</Text>
                <Text style={[styles.completionPercent, t.completionPercent]}>
                  {completion.percent}% · {completion.done}/{completion.total}
                </Text>
              </View>
              <AnimatedPressable
                style={[styles.completionDismiss, { backgroundColor: `${colors.textMuted}14` }]}
                onPress={() => { haptic.light(); setCompletionDismissed(true); }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss profile completion prompt"
              >
                <Ionicons name="close" size={15} color={colors.textMuted} />
              </AnimatedPressable>
            </View>
            <View style={[styles.completionTrack, t.completionTrack]}>
              <View style={[styles.completionFill, t.completionFill, { width: `${completion.percent}%` }]} />
            </View>
            <AnimatedPressable
              style={[styles.completionCta, t.completionCta]}
              onPress={() => {
                haptic.light();
                navigation.navigate('EditProfile', completionCta.focus ? { focus: completionCta.focus } : {});
              }}
              accessibilityRole="button"
              accessibilityLabel={completionCta.label}
            >
              <Text style={[styles.completionCtaText, t.completionCtaText]}>{completionCta.label}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textInverse} />
            </AnimatedPressable>
          </View>
        ) : null}

        {showGrowthPrompt ? (
          <View style={[styles.growthCard, t.growthCard]}>
            <View style={styles.growthHead}>
              <Text style={[styles.growthTitle, t.growthTitle]}>Grow on Thryftverse</Text>
              <AnimatedPressable
                style={[styles.completionDismiss, { backgroundColor: `${colors.textMuted}14` }]}
                onPress={() => { haptic.light(); setGrowthDismissed(true); }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss growth prompts"
              >
                <Ionicons name="close" size={15} color={colors.textMuted} />
              </AnimatedPressable>
            </View>

            {showFirstListingGrowth ? (
              <AnimatedPressable
                style={[styles.growthRow, t.growthRow]}
                onPress={() => { haptic.light(); navigation.navigate('Sell'); }}
                accessibilityRole="button"
                accessibilityLabel="List your first item"
                accessibilityHint="Opens the sell flow to create your first listing"
              >
                <View style={styles.growthRowText}>
                  <Text style={[styles.growthRowTitle, t.growthRowTitle]}>List your first item</Text>
                  <Text style={[styles.growthRowSub, t.growthRowSub]}>
                    Photograph and publish an item to start selling.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </AnimatedPressable>
            ) : null}

            {showAudienceGrowth ? (
              <AnimatedPressable
                style={[styles.growthRow, t.growthRow, styles.growthRowLast]}
                onPress={() => { haptic.light(); navigation.navigate('CreatorAnalyticsDashboard'); }}
                accessibilityRole="button"
                accessibilityLabel="Grow your audience"
                accessibilityHint="Opens creator analytics with audience growth tools"
              >
                <View style={styles.growthRowText}>
                  <Text style={[styles.growthRowTitle, t.growthRowTitle]}>Grow your audience</Text>
                  <Text style={[styles.growthRowSub, t.growthRowSub]}>
                    Share your profile and create content to attract followers.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </AnimatedPressable>
            ) : null}
          </View>
        ) : null}
      </Reanimated.ScrollView>
    </View>
  );
}

const myProfileStyles = StyleSheet.create({
  awayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
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
    lineHeight: TypographyV2.meta.lineHeight,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  scrollContent: { paddingBottom: Space.xxl + Space.xxl + Space.xs, overflow: 'hidden' },

  // Cover
  coverWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    zIndex: 0,
    overflow: 'hidden',
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
    left: Space.md - 2,
    right: Space.md - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topUtilityRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  topUtilityIconBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Co-Own portfolio preview — flagship elevated card ──
  portfolioPreview: {
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog,
  },
  portfolioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  portfolioLabel: {
    fontSize: TypographyV2.label.size,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.label.letterSpacing,
  },
  portfolioHoldings: {
    flexDirection: 'row',
    gap: Space.md,
  },
  portfolioHoldingCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  portfolioHoldingImage: {
    width: 48,
    height: 48,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    flexShrink: 0,
  },
  portfolioHoldingInfo: {
    flexShrink: 1,
    gap: 2,
  },
  portfolioHoldingTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  portfolioHoldingUnits: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  topUtilityVisible: {
    width: Space.xl - 2,
    height: Space.xl - 2,
    borderRadius: RadiusRoleValue.standalonePanel,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditTarget: {
    position: 'absolute',
    right: Space.md - 2,
    bottom: Space.sm,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditVisible: {
    width: Space.xl + 2,
    height: Space.xl + 2,
    borderRadius: RadiusRoleValue.dominantPanel,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFailure: {
    position: 'absolute',
    left: Space.md - 2,
    right: Space.md - 2,
    bottom: Space.sm,
    minHeight: Control.hit,
    paddingLeft: Space.smMd,
    paddingRight: Space.xs + 1,
    borderRadius: RadiusRoleValue.sheetDialog,
    backgroundColor: 'rgba(0,0,0,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  coverFailureCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 3,
  },
  coverFailureText: {
    flexShrink: 1,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
  },
  coverFailureAction: {
    minWidth: Space.xxl + 4,
    minHeight: Space.xl + 2,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFailureActionText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
  },

  // Collapsed header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  floatingHeaderTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.priceList.letterSpacing,
  },

  // Listings grid
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  gridHeaderCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  gridHeaderAction: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: 4,
  },
  gridCard: {
    marginBottom: Space.sm,
  },
  gridImageWrap: {
    borderRadius: RadiusRoleValue.mediaThumbnail,
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
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold,
    letterSpacing: LetterSpacing.caps + 0.18,
  },
  gridPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold,
    marginTop: Space.xs + 1,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  gridBrand: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    marginTop: 1,
  },

  // Listings empty state — compact in-grid prompt, not full blank page
  listingsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl + Space.sm,
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  listingsEmptyTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  listingsEmptyBody: {
    maxWidth: 280,
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    textAlign: 'center',
  },
  listingsEmptyCta: {
    marginTop: Space.xs + 2,
    minHeight: 44,
    paddingHorizontal: Space.md + 2,
    justifyContent: 'center',
    borderRadius: RadiusRoleValue.sheetDialog,
  },
  listingsEmptyCtaText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },

  // About — flat editorial rows, flagship elevated
  aboutContainer: {
    paddingHorizontal: Space.md,
  },
  aboutSectionTitle: {
    fontSize: TypographyV2.label.size,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    paddingTop: Space.md + 4,
    paddingBottom: Space.sm,
  },
  aboutRow: {
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.xs,
  },
  aboutRowLast: {
    borderBottomWidth: 0,
  },
  aboutLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
  },
  aboutValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight,
  },
  aboutEmpty: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    paddingVertical: Space.xl + Space.sm,
  },

  // Stats row — followers / following / listings / sales
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.sm,
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs,
    gap: Space.xs / 4,
  },
  statValue: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  statLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: Space.xl - Space.xs,
  },

  // Seller trust badges — horizontal scroll
  trustBadgesScroll: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  trustBadgesContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs / 2,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  trustBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.1,
  },
  trustBadgeSep: {
    width: StyleSheet.hairlineWidth,
    height: Space.sm + Space.xxs,
  },

  // Profile completion prompt — flagship elevated card
  completionCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
  },
  completionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  completionHeadText: {
    flex: 1,
    gap: Space.xs / 2,
  },
  completionTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  completionPercent: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.1,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  completionDismiss: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -Space.xs / 2,
    marginRight: -Space.xs / 2,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  completionTrack: {
    height: 4,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden',
  },
  completionFill: {
    height: '100%',
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  completionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    minHeight: 44,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    paddingHorizontal: Space.md,
  },
  completionCtaText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.1,
  },

  // Growth tasks — optional onboarding prompts (first listing / audience)
  growthCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.sm,
  },
  growthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  growthTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  growthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  growthRowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  growthRowText: {
    flex: 1,
    gap: Space.xs / 2,
  },
  growthRowTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight,
  },
  growthRowSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight,
  },
});
