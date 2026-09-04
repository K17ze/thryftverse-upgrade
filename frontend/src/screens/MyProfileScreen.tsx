import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  Share,
  Pressable,
  ActivityIndicator } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Space, FontFamily, Control, LetterSpacing } from '../theme/designTokens';
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
import { LinearGradient } from 'expo-linear-gradient';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipProfileMedia } from '../components/flagship';
import { LookPreviewCard, ProfileLooksGrid } from '../components/profile';
import { MyProfileIdentityHero } from '../components/profile/MyProfileIdentityHero';
import { ProfileUtilityRail } from '../components/profile/ProfileUtilityRail';
import { MyProfileTabRail } from '../components/profile/MyProfileTabRail';
import { useSellerTrust, VERIFICATION_TIERS } from '../platform/product';
import { useSellerReviewsInfinite } from '../platform/server';
import { ReviewSummaryBlock, ProfileReviewRow } from '../components/profile/ProfileReviews';
import { ShopRail, type ShopRailItem } from '../components/profile/ShopRail';
import type { SellerReviewItem, SellerReviewSummary } from '../services/sellerReviewsApi';
import { openProfile } from '../navigation/openProfile';
import { openProductDetail } from '../platform/product/openProductDetail';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';
import { isVideoUri } from '../utils/media';
import { fetchLooksFromApi, type LookApiItem } from '../services/looksApi';
import { fetchPosterHighlights, type PosterHighlight } from '../services/postersApi';
import { PosterHighlightsRail } from '../components/poster/PosterHighlightsRail';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { OfflineBanner } from '../components/OfflineBanner';
import { FlashList } from '@shopify/flash-list';
import { useAppTranslation } from '../i18n/useAppTranslation';

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
    coverWrap: { backgroundColor: colors.surfaceAlt },
    coverFailureText: { color: colors.scrimTextPrimary },
    coverFailureActionText: { color: colors.scrimTextPrimary },
    floatingHeader: { backgroundColor: colors.background, borderBottomColor: colors.border },
    floatingHeaderTitle: { color: colors.textPrimary },
    gridHeaderCount: { color: colors.textMuted },
    gridHeaderAction: { color: colors.brand },
    soldText: { color: colors.scrimTextPrimary },
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
    topUtilityVisible: { backgroundColor: colors.overlay, borderColor: colors.scrimTextTertiary },
    coverEditVisible: { backgroundColor: colors.overlay, borderColor: colors.scrimTextTertiary },
    coverFailure: { backgroundColor: colors.overlay },
    soldOverlay: { backgroundColor: colors.overlay },
    pinnedBadge: { backgroundColor: colors.overlay },
    statsRow: { borderBottomColor: colors.borderSubtle, borderTopColor: colors.borderSubtle },
    statValue: { color: colors.textPrimary },
    statLabel: { color: colors.textMuted },
    statDivider: { backgroundColor: colors.borderSubtle },
    trustBadgeText: { color: colors.textSecondary },
    trustBadgeVerified: { color: colors.success },
    trustBadgeSep: { backgroundColor: colors.borderSubtle },
    profileStatusPanel: { backgroundColor: colors.surfaceAlt },
    profileStatusDivider: { backgroundColor: colors.borderSubtle },
    completionTrack: { backgroundColor: colors.borderSubtle },
    completionFill: { backgroundColor: colors.brand },
    completionTitle: { color: colors.textPrimary },
    completionPercent: { color: colors.textMuted },
    completionCta: { backgroundColor: colors.brand },
    completionCtaText: { color: colors.textInverse },
    growthTitle: { color: colors.textPrimary },
    growthRow: { borderColor: colors.borderSubtle },
    growthRowTitle: { color: colors.textPrimary },
    growthRowSub: { color: colors.textMuted },
    portfolioPreview: { backgroundColor: colors.surfaceAlt },
    portfolioLabel: { color: colors.textSecondary },
    portfolioHoldingTitle: { color: colors.textPrimary },
    portfolioHoldingUnits: { color: colors.textMuted } };
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
        ) },
    ] }));

  const topUtilityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }] };
  });

  const headerOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [COVER_HEIGHT - 88, COVER_HEIGHT - 44],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const handleShare = async () => {
    if (!user) return;
    haptic.light();
    try {
      await Share.share({
        message: tt('share.message', { username: user.username }),
        url: `https://thryftverse.com/@${user.username}`,
        title: tt('share.title', { name: user.displayName || user.username }) });
    } catch { /* user cancelled or share unavailable */ }
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
        icon: 'bag-handle-outline' as const,
        label: tt('utility.orders'),
        onPress: () => { haptic.light(); navigation.navigate('MyOrders'); },
        accessibilityLabel: tt('accessibility.orders') },
      {
        icon: 'stats-chart-outline' as const,
        label: tt('utility.analytics'),
        onPress: () => { haptic.light(); navigation.navigate('CreatorAnalyticsDashboard'); },
        accessibilityLabel: tt('accessibility.creatorAnalytics') },
      {
        icon: 'bookmark-outline' as const,
        label: tt('utility.closet'),
        value: tt('utility.itemsCount', { count: savedCount + wishlistCount }),
        onPress: () => { haptic.light(); navigation.navigate('Closet'); },
        accessibilityLabel: tt('accessibility.closet') },
      {
        icon: 'wallet-outline' as const,
        label: tt('utility.wallet'),
        onPress: () => { haptic.light(); navigation.navigate('Wallet'); },
        accessibilityLabel: tt('accessibility.wallet') },
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
      {
        icon: 'storefront-outline' as const,
        label: tt('utility.sellerHub'),
        onPress: () => { haptic.light(); navigation.navigate('SellerHub'); },
        accessibilityLabel: tt('accessibility.sellerHub') },
    ],
    [coOwnHoldings.length, savedCount, wishlistCount, allOwnedListings.length, haptic, navigation, tt]
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
            <Text style={[styles.gridPrice, t.gridPrice]} numberOfLines={1}>
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

  return (
    <View testID="profile-screen" style={[styles.container, t.container]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <OfflineBanner />

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
        {/* Top gradient fade — improves floating control contrast over any cover media */}
        <LinearGradient
          colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.12)', 'transparent']}
          style={styles.coverTopFade}
          pointerEvents="none"
        />
        {/* Subtle bottom fade around the avatar seam — no hard dark strip */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.10)']}
          style={styles.coverBottomFade}
          pointerEvents="none"
        />
      </Reanimated.View>

      {/* ── 2. FLOATING PERSONALISATION, SHARE AND SETTINGS ── */}
      <Reanimated.View pointerEvents="box-none" style={[styles.coverActionLayer, coverActionStyle]}>
        <Reanimated.View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }, topUtilityStyle]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            onPress={() => { haptic.light(); navigation.navigate('Settings'); }}
            accessibilityLabel={tt('accessibility.openSettings')}
            accessibilityRole="button"
            accessibilityHint={tt('accessibility.openSettingsHint')}
          >
            <View style={[styles.topUtilityVisible, t.topUtilityVisible]}>
              <Ionicons name="settings-outline" size={22} color={colors.scrimTextPrimary} aria-hidden={true} />
            </View>
          </AnimatedPressable>

          <View style={styles.topUtilityRight}>
            <AnimatedPressable
              style={styles.topUtilityIconBtn}
              onPress={handleShare}
              accessibilityLabel={tt('accessibility.shareProfile')}
              accessibilityRole="button"
              accessibilityHint={tt('accessibility.shareProfileHint')}
            >
              <View style={[styles.topUtilityVisible, t.topUtilityVisible]}>
                <Ionicons name="share-outline" size={18} color={colors.scrimTextPrimary} aria-hidden={true} />
              </View>
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        {coverState.status === 'failed' ? (
          <View style={[styles.coverFailure, t.coverFailure]}>
            <View style={styles.coverFailureCopy}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.scrimTextPrimary} aria-hidden={true} />
              <Text style={[styles.coverFailureText, t.coverFailureText]} numberOfLines={1}>
                {coverState.error || tt('cover.uploadFailed')}
              </Text>
            </View>
            <AnimatedPressable
              style={styles.coverFailureAction}
              onPress={retryCover}
              accessibilityRole="button"
              accessibilityLabel={tt('accessibility.retryCoverUpload')}
              hitSlop={5}
            >
              <Text style={[styles.coverFailureActionText, t.coverFailureActionText]}>{tt('cover.retry')}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.coverFailureAction}
              onPress={revertCover}
              accessibilityRole="button"
              accessibilityLabel={tt('accessibility.cancelCoverChange')}
              hitSlop={5}
            >
              <Text style={[styles.coverFailureActionText, t.coverFailureActionText]}>{tt('cover.cancel')}</Text>
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
                ? tt('accessibility.uploadingCover')
                : tt('accessibility.changeCover')
            }
            accessibilityState={{ disabled: coverState.status === 'uploading', busy: coverState.status === 'uploading' }}
          >
            <View style={[styles.coverEditVisible, t.coverEditVisible]}>
              {coverState.status === 'uploading' ? (
                <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
              ) : (
                <Ionicons name="image-outline" size={16} color={colors.scrimTextPrimary} aria-hidden={true} />
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
                <Text style={[myProfileStyles.awayBannerSub, tMyProfile.awayBannerSub]}>
                  {tt('holiday.subtitle')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </Pressable>
          ) : null}

          {/* ── STORY HIGHLIGHTS RAIL ──
              Instagram-pattern: highlights sit between the identity hero and
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

          {/* ── 9. STICKY FLAT TAB RAIL ── */}
          <MyProfileTabRail
            tabs={tabs}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'listings' | 'looks' | 'about' | 'reviews')}
          />
        </View>

        {/* ── 10. ACTIVE TAB CONTENT ── */}
        <View
          onLayout={(e) => { tabContentY.current = e.nativeEvent.layout.y; }}
        >

        {/* LISTINGS TAB — two-column portfolio grid */}
        {activeTab === 'listings' && (
          <Reanimated.View
            key="listings"
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
            style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}
          >
            {allOwnedListings.length === 0 ? (
              <View style={styles.listingsEmpty}>
                <Ionicons name="bag-add-outline" size={28} color={colors.textSecondary} aria-hidden={true} />
                <Text style={[styles.listingsEmptyTitle, t.listingsEmptyTitle]}>{tt('listings.emptyTitle')}</Text>
                <Text style={[styles.listingsEmptyBody, t.listingsEmptyBody]}>
                  {tt('listings.emptyBody')}
                </Text>
                <AnimatedPressable
                  style={[styles.listingsEmptyCta, t.listingsEmptyCta]}
                  onPress={() => navigation.navigate('Sell')}
                  accessibilityRole="button"
                  accessibilityLabel="Start selling"
                  hitSlop={1}
                >
                  <Text style={[styles.listingsEmptyCtaText, t.listingsEmptyCtaText]}>{tt('listings.startSelling')}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.listingsEmptyImportLink}
                  onPress={() => navigation.navigate('CatalogImportStart')}
                  accessibilityRole="button"
                  accessibilityLabel={tt('listings.bringOverListings')}
                  accessibilityHint={tt('accessibility.importListingsHint')}
                  hitSlop={8}
                >
                  <Text style={[styles.listingsEmptyImportText, { color: colors.brand }]}>
                    {tt('listings.bringOverListings')}
                  </Text>
                </AnimatedPressable>
              </View>
            ) : (
              <>
                <View style={styles.gridHeader}>
                  <Text style={[styles.gridHeaderCount, t.gridHeaderCount]}>{tt('listings.listingsCount', { count: allOwnedListings.length })}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.md }}>
                    {/* G4: Reorder-mode toggle — "Edit" enters, "Done" saves & exits */}
                    <Pressable
                      onPress={() => {
                        if (isReorderMode) {
                          void handleSaveReorder();
                        } else {
                          handleToggleReorderMode();
                        }
                      }}
                      disabled={isSavingReorder}
                      accessibilityRole="button"
                      accessibilityLabel={isReorderMode ? tt('listings.done') : tt('listings.editOrder')}
                      hitSlop={13}
                    >
                      {isSavingReorder ? (
                        <ActivityIndicator size="small" color={colors.brand} />
                      ) : (
                        <Text style={[styles.gridHeaderAction, t.gridHeaderAction]}>
                          {isReorderMode ? tt('listings.done') : tt('listings.editOrder')}
                        </Text>
                      )}
                    </Pressable>
                    {!isReorderMode ? (
                      <Pressable
                        onPress={() => navigation.navigate('MyListings')}
                        accessibilityRole="button"
                        accessibilityLabel="View all listings"
                        hitSlop={13}
                      >
                        <Text style={[styles.gridHeaderAction, t.gridHeaderAction]}>{tt('listings.viewAll')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <FlashList
                  data={allOwnedListings}
                  numColumns={3}
                  keyExtractor={(item) => item.id}
                  renderItem={renderListingItem}
                  scrollEnabled={false}
                />
              </>
            )}
          </Reanimated.View>
        )}

        {/* LOOKS TAB — 2-column grid (Instagram/Pinterest profile pattern) */}
        {activeTab === 'looks' && (
          <Reanimated.View
            key="looks"
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
            style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}
          >
            {looksLoading ? (
              <View style={{ paddingHorizontal: Space.md, gap: Space.md }} accessibilityLabel={tt('accessibility.loadingLooks')}>
                <SkeletonLoader width="100%" height={360} borderRadius={RadiusRoleValue.standalonePanel} />
                <SkeletonLoader width="100%" height={280} borderRadius={RadiusRoleValue.standalonePanel} />
              </View>
            ) : looksError ? (
              <EmptyState
                density="compact"
                icon="cloud-offline-outline"
                title={tt('looks.errorTitle')}
                subtitle={tt('looks.errorSubtitle')}
                ctaLabel={tt('looks.tryAgain')}
                onCtaPress={() => { void loadMyLooks(); }}
              />
            ) : myLooks.length === 0 ? (
              <EmptyState
                density="compact"
                icon="images-outline"
                title={tt('looks.emptyTitle')}
                subtitle={tt('looks.emptySubtitle')}
                ctaLabel={tt('looks.createLook')}
                onCtaPress={() => navigation.navigate('CreatorStudio', { type: 'look' })}
              />
            ) : (
              <ProfileLooksGrid
                looks={myLooks}
                isLoading={false}
                error={null}
                isSelfProfile
                onRetry={() => { void loadMyLooks(); }}
                onCreateLook={() => navigation.navigate('CreatorStudio', { type: 'look' })}
                navigation={navigation}
              />
            )}
          </Reanimated.View>
        )}

        {/* ABOUT TAB — flat editorial layout */}
        {/* Bio, location, and member-since are shown in the IdentityHero above.
            The About tab shows only information NOT already visible: website,
            shop policies, and Co-Own portfolio (recessed from the hero). */}
        {activeTab === 'about' && (
          <Reanimated.View
            key="about"
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
            style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}
          >
            {/* ── CO-OWN PORTFOLIO PREVIEW — recessed into About tab ── */}
            {coOwnHoldings.length > 0 ? (
              <AnimatedPressable
                style={[styles.portfolioPreview, t.portfolioPreview]}
                onPress={() => { haptic.light(); navigation.navigate('CoOwnHub'); }}
                accessibilityRole="button"
                accessibilityLabel={tt('accessibility.viewCoOwnPortfolio')}
                accessibilityHint={tt('accessibility.viewCoOwnPortfolioHint')}
              >
                <View style={styles.portfolioHeader}>
                  <Text style={[styles.portfolioLabel, t.portfolioLabel]}>{tt('about.coOwnPortfolio')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs / 2 }}>
                    <Text style={[styles.portfolioHoldingUnits, t.portfolioHoldingUnits]}>{tt('about.viewAll')}</Text>
                    <Ionicons name="chevron-forward" size={12} color={colors.textMuted} aria-hidden={true} />
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
                          {h.yourUnits} {h.yourUnits === 1 ? tt('about.unit') : tt('about.units')}
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
                  <Text style={[styles.aboutLabel, t.aboutLabel]}>{tt('about.website')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs }}>
                    <Text style={[styles.aboutValue, t.aboutValue, { flexShrink: 1 }]} numberOfLines={1}>{user.website}</Text>
                    <Ionicons name="open-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                  </View>
                </View>
              </View>
            ) : null}

            {/* Shop policies — canonical home for dispatch/response details.
                Trust badges above show a compact "Replies Xh" pill; this section
                provides the full policy context without duplicating the badge. */}
            <View style={styles.aboutContainer}>
              <Text style={[styles.aboutSectionTitle, t.aboutSectionTitle]}>{tt('about.shopPolicies')}</Text>
              <View style={[styles.aboutRow, t.aboutRow]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>{tt('about.payments')}</Text>
                <Text style={[styles.aboutValue, t.aboutValue]}>{tt('about.paymentsValue')}</Text>
              </View>
              <View style={[styles.aboutRow, t.aboutRow]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>{tt('about.shipping')}</Text>
                <Text style={[styles.aboutValue, t.aboutValue]}>
                  {sellerTrust?.dispatchTimeLabel
                    ? tt('about.shippingSeller', { label: sellerTrust.dispatchTimeLabel.toLowerCase() })
                    : tt('about.shippingDefault')}
                </Text>
              </View>
              <View style={[styles.aboutRow, t.aboutRow]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>{tt('about.returns')}</Text>
                <Text style={[styles.aboutValue, t.aboutValue]}>{tt('about.returnsValue')}</Text>
              </View>
              {sellerTrust?.responseRate !== null && sellerTrust?.responseRate !== undefined ? (
                <View style={[styles.aboutRow, t.aboutRow]}>
                  <Text style={[styles.aboutLabel, t.aboutLabel]}>{tt('about.responseRate')}</Text>
                  <Text style={[styles.aboutValue, t.aboutValue]}>{sellerTrust.responseRate}%</Text>
                </View>
              ) : null}
              <View style={[styles.aboutRow, t.aboutRow, styles.aboutRowLast]}>
                <Text style={[styles.aboutLabel, t.aboutLabel]}>{tt('about.response')}</Text>
                <Text style={[styles.aboutValue, t.aboutValue]}>
                  {sellerTrust?.responseTimeLabel
                    ? tt('about.responseSeller', { label: sellerTrust.responseTimeLabel.toLowerCase() })
                    : tt('about.responseDefault')}
                </Text>
              </View>
            </View>

            {!user.website && !sellerTrust && (
              <Text style={[styles.aboutEmpty, t.aboutEmpty]}>{tt('about.noDetails')}</Text>
            )}
          </Reanimated.View>
        )}

        {/* REVIEWS TAB — reputation summary + review rows.
            Only rendered when the seller has reviews (the tab itself is
            conditional on myReviewCount > 0). Owner can respond to reviews. */}
        {activeTab === 'reviews' && (
          <Reanimated.View
            key="reviews"
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
            style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}
          >
            {myReviewSummary && myReviewCount > 0 ? (
              <ReviewSummaryBlock summary={myReviewSummary} />
            ) : null}
            {reviewsQuery.isLoading && myReviews.length === 0 ? (
              <View style={{ paddingVertical: Space.xl, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : reviewsQuery.error && myReviews.length === 0 ? (
              <EmptyState
                density="compact"
                icon="cloud-offline-outline"
                title="Couldn't load reviews"
                subtitle="Check your connection and try again."
                ctaLabel="Try again"
                onCtaPress={() => { void reviewsQuery.refetch(); }}
              />
            ) : myReviews.length === 0 ? (
              <EmptyState
                density="compact"
                icon="chatbubble-ellipses-outline"
                title="No reviews yet"
                subtitle="Reviews from completed orders will appear here."
              />
            ) : (
              <View style={{ paddingHorizontal: Space.md }}>
                {myReviews.map((review) => (
                  <ProfileReviewRow
                    key={review.id}
                    item={review}
                    onOpenReviewer={(uid) => openProfile(navigation, uid, currentUser?.id)}
                    onOpenListing={(lid) => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: lid, sourceSurface: 'MyProfileReview' })}
                  />
                ))}
              </View>
            )}
          </Reanimated.View>
        )}
        </View>

        {showCompletionPrompt || showGrowthPrompt ? (
          <View style={[styles.profileStatusPanel, t.profileStatusPanel]}>
            {showCompletionPrompt ? (
              <View style={styles.completionSection}>
                <View style={styles.completionHead}>
                  <View style={styles.completionHeadText}>
                    <Text style={[styles.completionTitle, t.completionTitle]}>{tt('completion.title')}</Text>
                    <Text style={[styles.completionPercent, t.completionPercent]}>
                      {tt('completion.progress', { percent: completion.percent, done: completion.done, total: completion.total })}
                    </Text>
                  </View>
                  <AnimatedPressable
                    style={[styles.completionDismiss, { backgroundColor: `${colors.textMuted}14` }]}
                    onPress={() => { haptic.light(); setCompletionDismissed(true); }}
                    accessibilityRole="button"
                    accessibilityLabel={tt('accessibility.dismissCompletion')}
                  >
                    <Ionicons name="close" size={16} color={colors.textMuted} aria-hidden={true} />
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
                  <Ionicons name="chevron-forward" size={12} color={colors.textInverse} aria-hidden={true} />
                </AnimatedPressable>
              </View>
            ) : null}

            {showCompletionPrompt && showGrowthPrompt ? (
              <View style={[styles.profileStatusDivider, t.profileStatusDivider]} />
            ) : null}

            {showGrowthPrompt ? (
              <View style={styles.growthSection}>
                <View style={styles.growthHead}>
                  <Text style={[styles.growthTitle, t.growthTitle]}>{tt('growth.title')}</Text>
                  <AnimatedPressable
                    style={[styles.completionDismiss, { backgroundColor: `${colors.textMuted}14` }]}
                    onPress={() => { haptic.light(); setGrowthDismissed(true); }}
                    accessibilityRole="button"
                    accessibilityLabel={tt('accessibility.dismissGrowth')}
                  >
                    <Ionicons name="close" size={16} color={colors.textMuted} aria-hidden={true} />
                  </AnimatedPressable>
                </View>

                {showFirstListingGrowth ? (
                  <AnimatedPressable
                    style={[styles.growthRow, t.growthRow]}
                    onPress={() => { haptic.light(); navigation.navigate('Sell'); }}
                    accessibilityRole="button"
                    accessibilityLabel={tt('growth.listFirstItemTitle')}
                    accessibilityHint={tt('accessibility.listFirstItemHint')}
                  >
                    <View style={styles.growthRowText}>
                      <Text style={[styles.growthRowTitle, t.growthRowTitle]}>{tt('growth.listFirstItemTitle')}</Text>
                      <Text style={[styles.growthRowSub, t.growthRowSub]}>
                        {tt('growth.listFirstItemSub')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
                  </AnimatedPressable>
                ) : null}

                {showAudienceGrowth ? (
                  <AnimatedPressable
                    style={[styles.growthRow, t.growthRow, styles.growthRowLast]}
                    onPress={() => { haptic.light(); navigation.navigate('CreatorAnalyticsDashboard'); }}
                    accessibilityRole="button"
                    accessibilityLabel={tt('growth.growAudienceTitle')}
                    accessibilityHint={tt('accessibility.growAudienceHint')}
                  >
                    <View style={styles.growthRowText}>
                      <Text style={[styles.growthRowTitle, t.growthRowTitle]}>{tt('growth.growAudienceTitle')}</Text>
                      <Text style={[styles.growthRowSub, t.growthRowSub]}>
                        {tt('growth.growAudienceSub')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
                  </AnimatedPressable>
                ) : null}
              </View>
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

  // Cover
  coverWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    zIndex: 0,
    overflow: 'hidden' },
  // Cover gradient fades — match the public ProfileHero treatment for control
  // contrast and a premium authored cover. Top fade improves floating button
  // legibility; bottom fade softens the avatar seam.
  coverTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80 },
  coverBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40 },
  coverActionLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    zIndex: 8 },
  topUtilityRow: {
    position: 'absolute',
    left: Space.md - 2,
    right: Space.md - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  topUtilityRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  topUtilityIconBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  // ── Co-Own portfolio preview — flagship elevated card ──
  portfolioPreview: {
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog },
  portfolioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md },
  portfolioLabel: {
    fontSize: TypographyV2.label.size,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.label.letterSpacing },
  portfolioHoldings: {
    flexDirection: 'row',
    gap: Space.md },
  portfolioHoldingCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  portfolioHoldingImage: {
    width: 48,
    height: 48,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    flexShrink: 0 },
  portfolioHoldingInfo: {
    flexShrink: 1,
    gap: Space.xxs },
  portfolioHoldingTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.meta.lineHeight },
  portfolioHoldingUnits: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  topUtilityVisible: {
    width: Space.xl - 2,
    height: Space.xl - 2,
    borderRadius: RadiusRoleValue.standalonePanel,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center' },
  coverEditTarget: {
    position: 'absolute',
    right: Space.md - 2,
    bottom: Space.sm,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  coverEditVisible: {
    width: Space.xl + 2,
    height: Space.xl + 2,
    borderRadius: RadiusRoleValue.dominantPanel,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center' },
  coverFailure: {
    position: 'absolute',
    left: Space.md - 2,
    right: Space.md - 2,
    bottom: Space.sm,
    minHeight: Control.hit,
    paddingLeft: Space.smMd,
    paddingRight: Space.xs + 1,
    borderRadius: RadiusRoleValue.sheetDialog,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  coverFailureCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 3 },
  coverFailureText: {
    flexShrink: 1,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size },
  coverFailureAction: {
    minWidth: Space.xxl + 4,
    minHeight: Space.xl + 2,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center' },
  coverFailureActionText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size },

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
    borderBottomWidth: StyleSheet.hairlineWidth },
  floatingHeaderTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.priceList.letterSpacing },

  // Listings grid
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm },
  gridHeaderCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  gridHeaderAction: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold },
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

  // Listings empty state — compact in-grid prompt, not full blank page
  listingsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl + Space.sm,
    paddingHorizontal: Space.md,
    gap: Space.sm },
  listingsEmptyTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  listingsEmptyBody: {
    maxWidth: 280,
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    textAlign: 'center' },
  listingsEmptyCta: {
    marginTop: Space.xs + 2,
    minHeight: Control.hit,
    paddingHorizontal: Space.md + 2,
    justifyContent: 'center',
    borderRadius: RadiusRoleValue.sheetDialog },
  listingsEmptyCtaText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold },
  listingsEmptyImportLink: {
    marginTop: Space.sm,
    minHeight: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.sm },
  listingsEmptyImportText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
    lineHeight: TypographyV2.body.lineHeight,
    letterSpacing: TypographyV2.body.letterSpacing },

  // About — flat editorial rows, flagship elevated
  aboutContainer: {
    paddingHorizontal: Space.md },
  aboutSectionTitle: {
    fontSize: TypographyV2.label.size,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.label.letterSpacing,
    paddingTop: Space.md + 4,
    paddingBottom: Space.sm },
  aboutRow: {
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.xs },
  aboutRowLast: {
    borderBottomWidth: 0 },
  aboutLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.label.letterSpacing },
  aboutValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight },
  aboutEmpty: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    paddingVertical: Space.xl + Space.sm },

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
    height: Space.sm + Space.xxs },

  profileStatusPanel: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog,
    overflow: 'hidden' },
  profileStatusDivider: {
    height: StyleSheet.hairlineWidth },
  completionSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.md },
  completionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.sm },
  completionHeadText: {
    flex: 1,
    gap: Space.xs / 2 },
  completionTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  completionPercent: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.1,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  completionDismiss: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -Space.xs / 2,
    marginRight: -Space.xs / 2,
    borderRadius: RadiusRoleValue.pillAvatar },
  completionTrack: {
    height: 4,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden' },
  completionFill: {
    height: '100%',
    borderRadius: RadiusRoleValue.pillAvatar },
  completionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    minHeight: Control.hit,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    paddingHorizontal: Space.md },
  completionCtaText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.1 },

  growthSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.sm },
  growthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm },
  growthTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  growthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth },
  growthRowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth },
  growthRowText: {
    flex: 1,
    gap: Space.xs / 2 },
  growthRowTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight },
  growthRowSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight } });
