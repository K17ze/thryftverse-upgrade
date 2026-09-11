import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  Share,
  Pressable } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Space, FontFamily, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { listCoOwnAssets, fetchCoOwnHoldings } from '../services/marketApi';
import { fetchFollowCounts } from '../services/profileApi';
import { parseApiError } from '../lib/apiClient';
import { setFeaturedListings } from '../services/storefrontApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { MyProfileIdentityHero } from '../components/profile/MyProfileIdentityHero';
import { SharePassportModal } from '../components/profile/SharePassportModal';
import { ProfileUtilityRail } from '../components/profile/ProfileUtilityRail';
import { useSellerTrust, VERIFICATION_TIERS } from '../platform/product';
import { useSellerReviewsInfinite } from '../platform/server';
import { ShopRail, type ShopRailItem } from '../components/profile/ShopRail';
import type { SellerReviewItem, SellerReviewSummary } from '../services/sellerReviewsApi';
import { openProfile } from '../navigation/openProfile';
import { openProductDetail } from '../platform/product/openProductDetail';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';
import { fetchLooksFromApi, type LookApiItem } from '../services/looksApi';
import { fetchPosterHighlights, type PosterHighlight } from '../services/postersApi';
import { PosterHighlightsRail } from '../components/poster/PosterHighlightsRail';
import { OfflineBanner } from '../components/OfflineBanner';
import { useAppTranslation } from '../i18n/useAppTranslation';
import { ProfileHeaderHero, CompletionGrowthPanel, StorefrontTabs } from '../components/myprofile';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// A profile cover is identity media, not a thin toolbar backdrop. At 200pt it
// retains a useful crop on common phone widths while leaving the avatar/stats
// seam outside the cover-control layer.
const COVER_HEIGHT = 200;

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
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { t: tt } = useAppTranslation('myProfile');

  // Themed style overrides — color properties extracted from module-level styles
  const t = {
    container: { backgroundColor: colors.background },
    soldText: { color: colors.scrimTextPrimary },
    gridPrice: { color: colors.textPrimary },
    gridBrand: { color: colors.textSecondary },
    gridMeta: { color: colors.textMuted },
    soldOverlay: { backgroundColor: colors.overlay },
    pinnedBadge: { backgroundColor: colors.overlay },
    statsRow: { borderBottomColor: colors.borderSubtle, borderTopColor: colors.borderSubtle },
    statValue: { color: colors.textPrimary },
    statLabel: { color: colors.textMuted },
    statDivider: { backgroundColor: colors.borderSubtle },
    trustBadgeText: { color: colors.textSecondary },
    trustBadgeVerified: { color: colors.success },
    trustBadgeSep: { backgroundColor: colors.borderSubtle } };
  const tMyProfile = {
    awayBanner: { backgroundColor: colors.surfaceAlt },
    awayBannerTitle: { color: colors.textPrimary },
    awayBannerSub: { color: colors.textMuted } };

  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const scrollRef = React.useRef<Reanimated.ScrollView>(null);
  useScrollToTop(scrollRef);
  const [activeTab, setActiveTab] = React.useState<'listings' | 'looks' | 'about' | 'reviews'>('listings');
  const tabContentY = React.useRef(0);

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

  // Seller reviews — infinite list for the Reviews tab. Only rendered when
  // the seller has reviews (reviewCount > 0), keeping the tab conditional.
  const reviewsQuery = useSellerReviewsInfinite(currentUser?.id);
  const myReviews: SellerReviewItem[] = React.useMemo(() => {
    const pages = reviewsQuery.data?.pages ?? [];
    const items: SellerReviewItem[] = [];
    for (const page of pages) for (const item of page.items) items.push(item);
    return items;
  }, [reviewsQuery.data]);
  const myReviewSummary: SellerReviewSummary | null = reviewsQuery.data?.pages?.[0]?.summary ?? null;
  const myReviewCount = sellerTrust?.reviewCount ?? myReviewSummary?.reviewCount ?? 0;

  // Follow counts — followers/following for the seam row.
  // Status distinguishes loading/error from a real zero so the UI never
  // displays an unknown count as a factual "0 followers" (M2 — truthful UI).
  const [followCounts, setFollowCounts] = React.useState<{ followerCount: number; followingCount: number }>({ followerCount: 0, followingCount: 0 });
  const [followCountsStatus, setFollowCountsStatus] = React.useState<'loading' | 'error' | 'loaded'>('loading');
  React.useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    setFollowCountsStatus('loading');
    fetchFollowCounts(currentUser.id)
      .then((counts) => { if (!cancelled) { setFollowCounts(counts); setFollowCountsStatus('loaded'); } })
      .catch(() => { if (!cancelled) setFollowCountsStatus('error'); });
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
              realizedProfitGBP: h?.realized };
          });
        setCoOwnHoldings(merged);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, tt('toast.portfolioLoadFailed'));
        show(parsed.message, 'error');
      });
    return () => { cancelled = true; };
  }, [currentUser?.id, show, tt]);

  const userAvatar = useStore((state) => state.userAvatar);
  const userCover = useStore((state) => state.userCover);
  const updateUserAvatar = useStore((state) => state.updateUserAvatar);
  const updateUserCover = useStore((state) => state.updateUserCover);
  const user = currentUser;
  const [myLooks, setMyLooks] = React.useState<LookApiItem[]>([]);
  const [showPassportModal, setShowPassportModal] = React.useState(false);
  const [looksLoading, setLooksLoading] = React.useState(false);
  const [looksError, setLooksError] = React.useState(false);

  const loadMyLooks = React.useCallback(async () => {
    if (!currentUser?.id) return;
    setLooksLoading(true);
    setLooksError(false);
    try {
      const res = await fetchLooksFromApi({ creatorId: currentUser.id, status: 'published', limit: 24 });
      setMyLooks(res.items ?? []);
    } catch {
      setLooksError(true);
    } finally {
      setLooksLoading(false);
    }
  }, [currentUser?.id]);

  // Refetch looks on focus so newly published content appears without
  // requiring a manual refresh. React Query cache invalidation after
  // publish marks these queries stale, but the direct-fetch pattern
  // here needs an explicit focus refetch.
  useFocusEffect(
    React.useCallback(() => {
      void loadMyLooks();
    }, [loadMyLooks]),
  );

  // Story highlights — fetched for the highlights rail between identity hero
  // and the utility rail. Renders nothing when empty (no fabricated content).
  const [highlights, setHighlights] = React.useState<PosterHighlight[]>([]);
  React.useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    fetchPosterHighlights(currentUser.id)
      .then((res) => { if (!cancelled) setHighlights(res.items ?? []); })
      .catch(() => { if (!cancelled) setHighlights([]); });
    return () => { cancelled = true; };
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
    revertCover } = useProfileMediaUpload(
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
      show(tt('toast.coverUpdated'), 'success');
    } else if (coverState.status === 'failed' && prevCoverStatus.current !== 'failed') {
      show(tt('toast.coverUploadFailed'), 'error');
    }
    prevCoverStatus.current = coverState.status;
  }, [coverState.status, show]);

  // Show toast on avatar upload status changes
  const prevAvatarStatus = React.useRef(avatarState.status);
  React.useEffect(() => {
    if (avatarState.status === 'confirmed' && prevAvatarStatus.current !== 'confirmed') {
      show(tt('toast.avatarUpdated'), 'success');
    } else if (avatarState.status === 'failed' && prevAvatarStatus.current !== 'failed') {
      show(tt('toast.avatarUploadFailed'), 'error');
    }
    prevAvatarStatus.current = avatarState.status;
  }, [avatarState.status, show]);

  const profileUserId = user?.id ?? null;
  const profileMediaOverride = profileUserId ? (profileMediaOverrides[profileUserId] ?? null) : null;

  // Display priority: pending local > confirmed remote > store > override
  const displayCover = coverState.pendingLocal
    || coverState.confirmedRemote
    || user?.coverPhoto
    || userCover
    || profileMediaOverride?.cover
    || '';
  const displayAvatar = avatarState.pendingLocal
    || avatarState.confirmedRemote
    || user?.avatar
    || userAvatar
    || profileMediaOverride?.avatar
    || null;

  // ── G4: Profile grid drag-reorder ──────────────────────────────────────
  // Sellers can pin/unpin listings to their shop grid, reorder pinned
  // listings, and save the order to the backend via setFeaturedListings.
  const [isReorderMode, setIsReorderMode] = React.useState(false);
  const [overrideFeaturedIds, setOverrideFeaturedIds] = React.useState<string[] | null>(null);
  const [isSavingReorder, setIsSavingReorder] = React.useState(false);

  const allOwnedListings = React.useMemo(() => {
    if (!profileUserId) return [];
    // Pinned/featured listings appear first in the Shop grid (2026 pattern).
    // When an override order is active (reorder mode), sort by the override
    // rank; otherwise fall back to the backend `featured` flag with a stable
    // sort that preserves backend ordering for non-featured items.
    return listings
      .filter((item) => item.sellerId === profileUserId)
      .sort((a, b) => {
        if (overrideFeaturedIds) {
          const ai = overrideFeaturedIds.indexOf(a.id);
          const bi = overrideFeaturedIds.indexOf(b.id);
          const ar = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
          const br = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
          return ar - br;
        }
        const af = a.featured === true ? 0 : 1;
        const bf = b.featured === true ? 0 : 1;
        return af - bf;
      });
  }, [listings, profileUserId, overrideFeaturedIds]);

  // When overrideFeaturedIds is set, featured state is derived from the
  // override array; otherwise it falls back to the backend `featured` flag.
  const isItemFeatured = useCallback(
    (id: string, defaultFeatured: boolean | null | undefined): boolean => {
      if (overrideFeaturedIds) return overrideFeaturedIds.includes(id);
      return defaultFeatured === true;
    },
    [overrideFeaturedIds],
  );

  // Returns the 1-based rank position of a featured item, or 0 if not featured.
  const getItemFeaturedRank = useCallback(
    (id: string, defaultFeatured: boolean | null | undefined): number => {
      if (overrideFeaturedIds) {
        const idx = overrideFeaturedIds.indexOf(id);
        return idx === -1 ? 0 : idx + 1;
      }
      return defaultFeatured === true ? 1 : 0;
    },
    [overrideFeaturedIds],
  );

  const handleTogglePin = useCallback(
    (listingId: string) => {
      haptic.light();
      const current = overrideFeaturedIds
        ?? allOwnedListings.filter((l) => l.featured === true).map((l) => l.id);
      if (current.includes(listingId)) {
        setOverrideFeaturedIds(current.filter((id) => id !== listingId));
        show(tt('listings.unpinned'), 'success');
      } else {
        if (current.length >= 8) {
          haptic.medium();
          show(tt('listings.featuredMaxReached'), 'error');
          return;
        }
        setOverrideFeaturedIds([...current, listingId]);
        show(tt('listings.pinned'), 'success');
      }
    },
    [overrideFeaturedIds, allOwnedListings, haptic, show, tt],
  );

  const handleShiftFeatured = useCallback(
    (listingId: string, direction: -1 | 1) => {
      if (!overrideFeaturedIds) return;
      const idx = overrideFeaturedIds.indexOf(listingId);
      if (idx === -1) return;
      const target = idx + direction;
      if (target < 0 || target >= overrideFeaturedIds.length) return;
      haptic.light();
      const next = [...overrideFeaturedIds];
      [next[idx], next[target]] = [next[target], next[idx]];
      setOverrideFeaturedIds(next);
    },
    [overrideFeaturedIds, haptic],
  );

  const handleSaveReorder = useCallback(async () => {
    if (!overrideFeaturedIds) {
      setIsReorderMode(false);
      return;
    }
    setIsSavingReorder(true);
    try {
      await setFeaturedListings(overrideFeaturedIds);
      haptic.light();
      show(tt('listings.orderSaved'), 'success');
      setOverrideFeaturedIds(null);
      setIsReorderMode(false);
    } catch (err) {
      const parsed = parseApiError(err, tt('listings.orderSaveFailed'));
      show(parsed.message, 'error');
    } finally {
      setIsSavingReorder(false);
    }
  }, [overrideFeaturedIds, haptic, show, tt]);

  const handleToggleReorderMode = useCallback(() => {
    if (isReorderMode) {
      // Exit without saving — discard override.
      haptic.light();
      setOverrideFeaturedIds(null);
      setIsReorderMode(false);
    } else {
      haptic.light();
      // Seed override from current featured state so shifts are visible.
      const currentFeatured = allOwnedListings
        .filter((l) => l.featured === true)
        .map((l) => l.id);
      setOverrideFeaturedIds(currentFeatured.length > 0 ? currentFeatured : []);
      setIsReorderMode(true);
    }
  }, [isReorderMode, allOwnedListings, haptic]);

  // Curated shop window — featured listings for the ShopRail. The rail renders
  // only when featured items exist (ShopRail returns null for empty input),
  // keeping the first viewport truthful — no fabricated placeholder content.
  const shopRailItems = React.useMemo<ShopRailItem[]>(() => {
    return allOwnedListings
      .filter((item) => isItemFeatured(item.id, item.featured))
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        imageUri: item.images?.[0] ?? '',
        brand: item.brand ?? null,
        isSold: item.isSold,
        isPinned: true,
      }));
  }, [allOwnedListings, isItemFeatured]);

  // Profile completion — drives the progress prompt. Completion measures ONLY
  // identity fields the user can complete directly: display name, bio, profile
  // photo and cover. Audience growth (followers) and first listing are NOT
  // profile-completion requirements — they are growth tasks surfaced separately
  // below the identity hero so a user is never told their profile is
  // "incomplete" because nobody has followed them or they haven't listed yet.
  const completion = React.useMemo(() => {
    const checks = [
      Boolean(user?.displayName?.trim()),
      Boolean(user?.bio?.trim()),
      Boolean(displayAvatar),
      Boolean(displayCover),
    ];
    const done = checks.filter(Boolean).length;
    return { percent: Math.round((done / checks.length) * 100), done, total: checks.length };
  }, [user?.displayName, user?.bio, displayAvatar, displayCover]);

  // Once every direct identity field is filled the profile is "sufficiently
  // complete" and the completion card is permanently removed from the ordinary
  // profile view (it does not reappear on later visits).
  const profileSufficientlyComplete = completion.percent >= 100;

  // First missing identity facet → the CTA label + EditProfile focus. Every
  // completion CTA routes to EditProfile because every remaining gap is a
  // direct profile field. Listing/audience growth CTAs live in the separate
  // growth-tasks section below the identity hero.
  const completionCta = React.useMemo<{ label: string; focus?: 'avatar' | 'cover' }>(() => {
    if (!user?.displayName?.trim()) return { label: tt('completionCta.addName') };
    if (!user?.bio?.trim()) return { label: tt('completionCta.addBio') };
    if (!displayAvatar) return { label: tt('completionCta.addPhoto'), focus: 'avatar' };
    if (!displayCover) return { label: tt('completionCta.addCover'), focus: 'cover' };
    return { label: tt('completionCta.editProfile') };
  }, [user?.displayName, user?.bio, displayAvatar, displayCover, tt]);

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
  const showAudienceGrowth = followCountsStatus === 'loaded' && followCounts.followerCount === 0;
  const [growthDismissed, setGrowthDismissed] = React.useState(false);
  const showGrowthPrompt = !growthDismissed && (showFirstListingGrowth || showAudienceGrowth);

  // Parallax scroll for cover
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    } });

  const handleShare = () => {
    if (!user) return;
    haptic.light();
    setShowPassportModal(true);
  };

  const wishlistCount = useStore((state) => state.wishlist.length);
  const savedCount = useStore((state) => state.savedProducts.length);
  const savedProductIds = useStore(useShallow((state) => state.savedProducts));
  const savedListings = React.useMemo(
    () => listings.filter((item) => savedProductIds.includes(item.id)),
    [listings, savedProductIds]
  );

  const utilityItems = React.useMemo(
    () => [
      {
        icon: 'storefront-outline' as const,
        label: tt('utility.sellerHub'),
        value: 'Commerce & Ops',
        onPress: () => { haptic.light(); navigation.navigate('SellerHub'); },
        accessibilityLabel: tt('accessibility.sellerHub'),
        accessibilityHint: 'Open Seller Hub for Orders, Wallet, Analytics, and Closet' },
      {
        icon: 'timer-outline' as const,
        label: tt('utility.auctions'),
        onPress: () => { haptic.light(); navigation.navigate('AuctionHome'); },
        accessibilityLabel: tt('accessibility.browseAuctions') },
      {
        icon: 'layers-outline' as const,
        label: tt('utility.coOwn'),
        value: coOwnHoldings.length > 0 ? tt('utility.assetsCount', { count: coOwnHoldings.length }) : undefined,
        onPress: () => { haptic.light(); navigation.navigate('CoOwnHub'); },
        accessibilityLabel: tt('accessibility.browseCoOwnMarket') },
    ],
    [coOwnHoldings.length, haptic, navigation, tt]
  );

  const GRID_GAP = Space.xs;
  const GRID_COLS = 3;
  const CARD_WIDTH = (SCREEN_WIDTH - Space.md * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const CARD_HEIGHT = CARD_WIDTH * (4 / 3); // 3:4 portrait grid

  const renderListingItem = useCallback(
    ({ item, index }: { item: (typeof allOwnedListings)[number]; index: number }) => {
      const isFeatured = isItemFeatured(item.id, item.featured);
      const featuredRank = isFeatured ? getItemFeaturedRank(item.id, item.featured) : 0;
      const colIndex = index % 3;
      return (
        <View
          style={{
            paddingLeft: colIndex === 0 ? Space.md : Space.xs / 2,
            paddingRight: colIndex === 2 ? Space.md : Space.xs / 2,
            paddingBottom: Space.sm,
          }}
        >
          <AnimatedPressable
            style={styles.gridCard}
            onPress={() => {
              if (isReorderMode) {
                handleTogglePin(item.id);
              } else {
                navigation.navigate('ManageListing', { itemId: item.id });
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`Manage ${item.title}${isFeatured ? ', pinned' : ''}`}
          >
            <SharedTransitionView
              style={[styles.gridImageWrap, { height: CARD_HEIGHT }]}
              sharedTransitionTag={`image-${item.id}-0`}
            >
              <CachedImage
                uri={item.images?.[0] ?? ''}
                style={styles.gridImage}
                containerStyle={{ width: '100%', height: '100%', borderRadius: RadiusRoleValue.compactControl }}
                contentFit="cover"
              />
              {isFeatured ? (
                <View style={[styles.pinnedBadge, t.pinnedBadge]} pointerEvents="none">
                  <Ionicons name="pin" size={12} color={colors.scrimTextPrimary} aria-hidden={true} />
                </View>
              ) : null}
              {item.isSold ? (
                <View style={[styles.soldOverlay, t.soldOverlay]}>
                  <Text style={[styles.soldText, t.soldText]}>{tt('listings.sold')}</Text>
                </View>
              ) : null}

              {/* ── Reorder-mode controls ── */}
              {isReorderMode ? (
                <View style={styles.reorderOverlay} pointerEvents="box-none">
                  {/* Rank badge for featured items */}
                  {isFeatured ? (
                    <View style={[styles.rankBadge, t.pinnedBadge]} pointerEvents="none">
                      <Text
                        style={[styles.rankBadgeText, t.soldText]}
                        maxFontSizeMultiplier={1.3}
                      >
                        {featuredRank}
                      </Text>
                    </View>
                  ) : null}

                  {/* Pin/unpin toggle — top-right */}
                  <Pressable
                    style={styles.reorderPinBtn}
                    onPress={() => handleTogglePin(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={isFeatured ? tt('listings.unpin') : tt('listings.pin')}
                    hitSlop={4}
                  >
                    <View style={[styles.reorderPinVisible, t.pinnedBadge]}>
                      <Ionicons
                        name={isFeatured ? 'pin' : 'pin-outline'}
                        size={16}
                        color={colors.scrimTextPrimary}
                        aria-hidden={true}
                      />
                    </View>
                  </Pressable>

                  {/* Shift arrows — bottom-center for featured items */}
                  {isFeatured ? (
                    <View style={styles.reorderShiftRow} pointerEvents="box-none">
                      <Pressable
                        style={styles.reorderShiftBtn}
                        onPress={() => handleShiftFeatured(item.id, -1)}
                        accessibilityRole="button"
                        accessibilityLabel={tt('listings.shiftLeft')}
                        hitSlop={4}
                      >
                        <View style={[styles.reorderShiftVisible, t.pinnedBadge]}>
                          <Ionicons name="chevron-back" size={16} color={colors.scrimTextPrimary} aria-hidden={true} />
                        </View>
                      </Pressable>
                      <Pressable
                        style={styles.reorderShiftBtn}
                        onPress={() => handleShiftFeatured(item.id, 1)}
                        accessibilityRole="button"
                        accessibilityLabel={tt('listings.shiftRight')}
                        hitSlop={4}
                      >
                        <View style={[styles.reorderShiftVisible, t.pinnedBadge]}>
                          <Ionicons name="chevron-forward" size={16} color={colors.scrimTextPrimary} aria-hidden={true} />
                        </View>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </SharedTransitionView>
            <Text style={[styles.gridPrice, t.gridPrice]} numberOfLines={1} maxFontSizeMultiplier={2}>
              {formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}
            </Text>
            {item.brand ? (
              <Text style={[styles.gridBrand, t.gridBrand]} numberOfLines={1}>{item.brand}</Text>
            ) : null}
          </AnimatedPressable>
        </View>
      );
    },
    [navigation, t, tt, colors, formatFromFiat, CARD_HEIGHT, isReorderMode, isItemFeatured, getItemFeaturedRank, handleTogglePin, handleShiftFeatured]
  );

  const tabs = React.useMemo(
    () => [
      { key: 'listings', label: tt('tabs.shop'), count: allOwnedListings.length },
      { key: 'looks', label: tt('tabs.looks'), count: myLooks.length },
      { key: 'about', label: tt('tabs.about') },
      ...(myReviewCount > 0 ? [{ key: 'reviews' as const, label: tt('tabs.reviews'), count: myReviewCount }] : []),
    ],
    [tt, allOwnedListings.length, myLooks.length, myReviewCount]
  );

  if (!user) {
    return (
      <View style={[styles.container, t.container]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <EmptyState
          icon="person-outline"
          title={tt('common:misc.notSignedIn')}
          subtitle={tt('notSignedIn.subtitle')}
          ctaLabel={tt('notSignedIn.signIn')}
          onCtaPress={() => navigation.navigate('Login')}
        />
      </View>
    );
  }

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : undefined;

  return (
    <View testID="profile-screen" style={[styles.container, t.container]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <OfflineBanner />

      <ProfileHeaderHero
        coverMedia={displayCover}
        coverState={coverState}
        avatarState={avatarState}
        insetsTop={insets.top}
        scrollY={scrollY}
        username={user.username}
        onSettings={() => { haptic.light(); navigation.navigate('Settings'); }}
        onShare={handleShare}
        onEditCover={pickCover}
        onRetryCover={retryCover}
        onRevertCover={revertCover}
      />

      <Reanimated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: COVER_HEIGHT }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── 3-9: IDENTITY HERO + ACTIONS ── */}
        <View>
          <MyProfileIdentityHero
            avatarUri={displayAvatar}
            displayName={user.displayName || user.username}
            username={user.username}
            bio={user.bio ?? undefined}
            location={user.location ?? undefined}
            website={user.website ?? null}
            memberSince={memberSince}
            sellerTrust={sellerTrust}
            ratingAverage={sellerTrust?.rating ?? null}
            reviewCount={sellerTrust?.reviewCount}
            responseTimeLabel={sellerTrust?.responseTimeLabel ?? null}
            followerCount={followCounts.followerCount}
            followingCount={followCounts.followingCount}
            followCountsStatus={followCountsStatus}
            onEditAvatar={pickAvatar}
            onEditProfile={() => navigation.navigate('EditProfile', {})}
            onShare={handleShare}
            onPressSold={() => { haptic.light(); navigation.navigate('MyOrders'); }}
            onPressFollowers={() => { haptic.light(); navigation.navigate('ConnectionList', { userId: currentUser!.id, mode: 'followers' }); }}
            onPressFollowing={() => { haptic.light(); navigation.navigate('ConnectionList', { userId: currentUser!.id, mode: 'following' }); }}
          />

          {/* Away-mode indicator — shown when holiday mode is enabled */}
          {holidayMode ? (
            <Pressable
              style={[myProfileStyles.awayBanner, tMyProfile.awayBanner]}
              onPress={() => navigation.navigate('PrivacySettings')}
              accessibilityRole="button"
              accessibilityLabel={tt('accessibility.holidayMode')}
            >
              <Ionicons name="pause-circle" size={18} color={colors.textMuted} aria-hidden={true} />
              <View style={myProfileStyles.awayBannerTextWrap}>
                <Text style={[myProfileStyles.awayBannerTitle, tMyProfile.awayBannerTitle]}>{tt('holiday.title')}</Text>
                <Text style={[myProfileStyles.awayBannerSub, tMyProfile.awayBannerSub]} maxFontSizeMultiplier={2}>
                  {tt('holiday.subtitle')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </Pressable>
          ) : null}

          {/* ── STORY HIGHLIGHTS RAIL ──
              Highlights sit between the identity hero and
              the utility rail. Renders only when highlights exist (truthful UI —
              no fabricated placeholder content). Owner sees a "New" tile. */}
          {highlights.length > 0 ? (
            <PosterHighlightsRail
              highlights={highlights}
              isOwner
              onOpenHighlight={(highlightId) => {
                haptic.light();
                navigation.navigate('PosterHighlightViewer', { highlightId });
              }}
              onCreateHighlight={() => {
                haptic.light();
                navigation.navigate('CreatePosterHighlight', {});
              }}
              onHighlightLongPress={(highlightId) => {
                haptic.light();
                navigation.navigate('PosterHighlightViewer', { highlightId });
              }}
            />
          ) : null}

          {/* ── 8. COMPACT MARKETPLACE UTILITY RAIL ── */}
          <ProfileUtilityRail items={utilityItems} />

          {/* ── 8b. CURATED SHOP WINDOW ──
              Horizontal rail of featured listings — the shop's front window.
              Renders only when featured items exist (ShopRail returns null
              when empty). Sits between the utility rail and the tab rail so
              the curated selection leads into the full shop grid. */}
          <ShopRail
            items={shopRailItems}
            onPressItem={(id) => { haptic.light(); navigation.navigate('ManageListing', { itemId: id }); }}
          />

        </View>

        <StorefrontTabs
          tabs={tabs}
          activeKey={activeTab}
          onTabChange={(key) => setActiveTab(key)}
          onTabContentLayout={(y) => { tabContentY.current = y; }}
          reducedMotion={reducedMotion}
          listings={allOwnedListings}
          reorderMode={isReorderMode}
          isSaving={isSavingReorder}
          onToggleReorder={() => {
            if (isReorderMode) {
              void handleSaveReorder();
            } else {
              handleToggleReorderMode();
            }
          }}
          onViewAll={() => navigation.navigate('MyListings')}
          onStartSelling={() => navigation.navigate('Sell')}
          onImport={() => navigation.navigate('CatalogImportStart')}
          renderItem={renderListingItem}
          looks={myLooks}
          looksLoading={looksLoading}
          looksError={looksError}
          onRetryLooks={() => { void loadMyLooks(); }}
          onCreateLook={() => navigation.navigate('CreatorStudio', { type: 'look' })}
          looksNavigation={navigation}
          coOwnHoldings={coOwnHoldings}
          website={user.website ?? null}
          sellerTrust={sellerTrust}
          onViewPortfolio={() => { haptic.light(); navigation.navigate('CoOwnHub'); }}
          reviewSummary={myReviewSummary}
          reviewCount={myReviewCount}
          reviewsLoading={reviewsQuery.isLoading}
          reviewsError={reviewsQuery.error}
          reviews={myReviews}
          onRefetchReviews={() => { void reviewsQuery.refetch(); }}
          onOpenReviewer={(uid) => openProfile(navigation, uid, currentUser?.id)}
          onOpenListing={(lid) => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: lid, sourceSurface: 'MyProfileReview' })}
        />

        <CompletionGrowthPanel
          showCompletionPrompt={showCompletionPrompt}
          showGrowthPrompt={showGrowthPrompt}
          completionPercent={completion.percent}
          completionDone={completion.done}
          completionTotal={completion.total}
          completionCtaLabel={completionCta.label}
          completionCtaFocus={completionCta.focus}
          showFirstListingGrowth={showFirstListingGrowth}
          showAudienceGrowth={showAudienceGrowth}
          onDismissCompletion={() => { haptic.light(); setCompletionDismissed(true); }}
          onDismissGrowth={() => { haptic.light(); setGrowthDismissed(true); }}
          onCompleteProfile={(focus) => { haptic.light(); navigation.navigate('EditProfile', focus ? { focus } : {}); }}
          onListFirstItem={() => { haptic.light(); navigation.navigate('Sell'); }}
          onGrowAudience={() => { haptic.light(); navigation.navigate('CreatorAnalyticsDashboard'); }}
        />
      </Reanimated.ScrollView>

      {user ? (
        <SharePassportModal
          visible={showPassportModal}
          onClose={() => setShowPassportModal(false)}
          username={user.username}
          displayName={user.displayName || user.username}
          avatarUri={displayAvatar}
          ratingAverage={sellerTrust?.rating ?? null}
          completedSales={sellerTrust?.completedSales ?? 0}
          verificationTier={sellerTrust?.verificationTier ?? (sellerTrust?.verified ? 'seller' : null)}
          memberSince={memberSince}
          bio={user.bio ?? null}
        />
      ) : null}
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
    borderRadius: RadiusRoleValue.sheetDialog },
  awayBannerTextWrap: {
    flex: 1,
    gap: Space.xs / 2 },
  awayBannerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  awayBannerSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight } });

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  scrollContent: { paddingBottom: Space.xxl + Space.xxl + Space.xs, overflow: 'hidden' },

  // Listings grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: Space.xs },
  gridCard: {
    marginBottom: Space.sm },
  gridImageWrap: {
    borderRadius: RadiusRoleValue.mediaThumbnail,
    overflow: 'hidden',
    position: 'relative' },
  pinnedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center' },
  // ── G4: Reorder-mode overlay controls ──
  reorderOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 4 },
  rankBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center' },
  rankBadgeText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  reorderPinBtn: {
    position: 'absolute',
    top: 4,
    right: 4 },
  reorderPinVisible: {
    width: Space.xl - 2,
    height: Space.xl - 2,
    borderRadius: RadiusRoleValue.standalonePanel,
    alignItems: 'center',
    justifyContent: 'center' },
  reorderShiftRow: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.xs },
  reorderShiftBtn: {},
  reorderShiftVisible: {
    width: Space.xl - 2,
    height: Space.xl - 2,
    borderRadius: RadiusRoleValue.standalonePanel,
    alignItems: 'center',
    justifyContent: 'center' },
  gridImage: {
    width: '100%',
    height: '100%' },
  // Hero card gradient overlay — price sits on a subtle bottom fade so the
  // first viewport is media-dense without a separate text block below.
  heroPriceGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    borderBottomLeftRadius: RadiusRoleValue.compactControl,
    borderBottomRightRadius: RadiusRoleValue.compactControl },
  heroPriceOverlay: {
    position: 'absolute',
    bottom: Space.sm,
    left: 10,
    right: 10 },
  heroPriceText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  heroBrandText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    marginTop: 1 },
  soldOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  soldText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold,
    letterSpacing: LetterSpacing.caps + 0.18 },
  gridPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold,
    marginTop: Space.xs + 1,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  gridBrand: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    marginTop: 1 },

  // Stats row — followers / following / listings / sales
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.sm,
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs,
    gap: Space.xs / 4 },
  statValue: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  statLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: Space.xl - Space.xs },

  // Seller trust badges — horizontal scroll
  trustBadgesScroll: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm },
  trustBadgesContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs / 2 },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  trustBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.1 },
  trustBadgeSep: {
    width: StyleSheet.hairlineWidth,
    height: Space.sm + Space.xxs } });
