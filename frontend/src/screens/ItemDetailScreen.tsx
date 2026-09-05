import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  RefreshControl,
} from 'react-native';
import Reanimated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
  FadeIn,
  type SharedValue,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import type { Listing } from '../services/listingsApi';
import type { DisplayReadyListing } from '../services/listingMapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useSignupWall } from '../hooks/useSignupWall';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Motion } from '../theme/motionTokens';
import { toIze, formatIzeAmount } from '../utils/currency';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { ImageEmptyGraphic } from '../components/ImageEmptyGraphic';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { BottomSheet } from '../components/BottomSheet';
import { HorizontalRail } from '../components/HorizontalRail';
import { ProductCard } from '../components/ProductCard';
import type { Listing as CatalogListing } from '../domain';

import {
  FullscreenMediaViewer,
  ProductFamilyBadge,
  SizeGuideSheet,
  BundleUpsellRow,
  ListingQA,
  SeenInLooksRail,
} from '../components/product';
import {
  CommerceMediaStage,
  CommerceStateCanvas,
  CategoryEvidence,
} from '../components/commerce';
import {
  CommerceDetailHeader,
  CommerceDetailIdentity,
  CommerceDetailSection,
  CommerceDetailDisclosureRow,
  CommerceDetailMetricRow,
  CommerceDetailStateDock,
  CommerceDetailMediaRail,
  CommerceDetailUnavailableInline,
  CommerceDetailOfflineBanner,
  CommerceDetailSellerRow,
  SellerInfoCard,
  ShippingReturnsInfo,
  SustainabilityImpact,
  MakeOfferSheet,
} from '../components/commerce/detail';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';
import {
  ProductAnalytics,
  setProductAnalyticsHandler,
  buildCommerceContext,
  buildCapabilities,
  buildDirectViewModel,
  isDirectViewModel,
  isRecommendationLook,
  type RecommendationLook,
} from '../platform/product';
import { useVisuallyComplete } from '../performance/visuallyComplete';
import { Space, FontFamily, DockConstants, Control, AspectRatio, Stroke, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { t } from '../i18n';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';
import { useItemDetailData } from '../hooks/itemDetail/useItemDetailData';
import { useItemDetailActions } from '../hooks/itemDetail/useItemDetailActions';
import { useItemDetailMedia } from '../hooks/itemDetail/useItemDetailMedia';

type ItemDetailRoute = RouteProp<RootStackParamList, 'ItemDetail'>;
type ItemDetailNav = NativeStackNavigationProp<RootStackParamList>;

// ───────────────────────────────────────────────────────────────────────────
// Image pagination dots.
// A row of dots below the carousel; the active dot stretches into a pill.
// A single spring-driven SharedValue (activeIndex) interpolates each dot's
// width so the pill stretch feels physical, not snapped.
// ───────────────────────────────────────────────────────────────────────────
const DOT_INACTIVE = 6;
const DOT_ACTIVE = 20;
const DOT_HEIGHT = 6;

function PaginationDot({
  index,
  activeIndex,
  color,
}: {
  index: number;
  activeIndex: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const width = interpolate(
      activeIndex.value,
      [index - 0.5, index, index + 0.5],
      [DOT_INACTIVE, DOT_ACTIVE, DOT_INACTIVE],
      Extrapolation.CLAMP,
    );
    return {
      width,
      opacity: interpolate(
        activeIndex.value,
        [index - 0.5, index, index + 0.5],
        [0.35, 1, 0.35],
        Extrapolation.CLAMP,
      ),
    };
  });
  return (
    <Reanimated.View
      style={[paginationStyles.dot, { backgroundColor: color }, style]}
    />
  );
}

function PaginationDots({
  count,
  activeIndex,
  counterText,
  color,
}: {
  count: number;
  activeIndex: SharedValue<number>;
  counterText?: string;
  color: string;
}) {
  return (
    <View style={paginationStyles.wrap}>
      <View style={paginationStyles.dotRow} accessible={false} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: count }, (_, i) => (
          <PaginationDot
            key={i}
            index={i}
            activeIndex={activeIndex}
            color={color}
          />
        ))}
      </View>
      {counterText ? (
        <Text style={[paginationStyles.counter, { color }]} numberOfLines={1}>
          {counterText}
        </Text>
      ) : null}
    </View>
  );
}

const paginationStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  dot: {
    height: DOT_HEIGHT,
    borderRadius: DOT_HEIGHT / 2,
  },
  counter: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: LetterSpacing.wide,
    fontVariant: ['tabular-nums'],
  },
});

export default function ItemDetailScreen() {
  const { isDark, colors } = useAppTheme();
  const route = useRoute<ItemDetailRoute>();
  const navigation = useNavigation<ItemDetailNav>();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, isCommerceCompact: isCompactScreen } = useBreakpoint();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  useVisuallyComplete('ItemDetail');
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [sizeGuideVisible, setSizeGuideVisible] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [qaSheetVisible, setQaSheetVisible] = useState(false);
  const [purchaseDetailsVisible, setPurchaseDetailsVisible] = useState(false);
  const [overflowVisible, setOverflowVisible] = useState(false);
  const [makeOfferVisible, setMakeOfferVisible] = useState(false);
  const [conditionInfoVisible, setConditionInfoVisible] = useState(false);
  const [priceHistoryExpanded, setPriceHistoryExpanded] = useState(false);

  const currentUser = useStore((state) => state.currentUser);
  const [refreshing, setRefreshing] = useState(false);
  const { isSyncing, lastError, refreshListings, listings: backendListings } = useBackendData();

  const { itemId, sectionKey, position, reasonCode, personalised } = route.params || {};

  // ── Product-query domain (listing, seller, recommendations, comparables,
  // price history, Q&A, continue-exploring prefetch, analytics session) ──
  const data = useItemDetailData({
    itemId,
    sectionKey,
    position,
    reasonCode,
    personalised,
  });

  const item = data.listing;
  const serverCommerce = data.commerce;
  const seller = data.seller;
  const sellerFollowMutation = data.sellerFollow;
  const recommendationSections = data.recommendationSections;
  const recsError = data.recommendationsError;
  const soldComps = data.soldComparables;
  const priceHistory = data.priceHistory;
  const qaSummary = data.qaSummary;

  // ── Action orchestration (share, save, report, seller nav, buy-now,
  // make-offer, price-alert toggle, enquire / request viewing) ──
  const actions = useItemDetailActions({
    listing: item,
    seller,
    currentUserId: currentUser?.id,
    navigation,
  });
  const {
    isFav,
    handleShare,
    shareVisible,
    closeShare: setShareVisible,
    handleToggleFav,
    handleViewSeller,
    handleMessageSeller,
    handleEnquire,
    handleRequestViewing,
    isResolvingConversation,
    handleTogglePriceAlert,
    priceAlertEnabled,
    priceAlertLoading,
  } = actions;
  const isItemSavedAnywhere = useStore((state) => state.isItemSavedAnywhere);

  // ── Media stage (active image index + full-screen viewer) ──
  const media = useItemDetailMedia({ listing: item });
  const fullscreenIndex = media.activeIndex;
  const fullscreenVisible = media.isViewerVisible;
  const setFullscreenIndex = media.setActiveIndex;
  const closeFullscreen = media.closeViewer;

  const { formatFromFiat, fxRates, displayMode } = useFormattedPrice();
  const { show } = useToast();
  const haptic = useHaptic();
  const { requireAuth } = useSignupWall();

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // ── Image pagination ──
  // Spring-driven active index. The integer page comes from the media
  // stage's onViewableItemsChanged; we spring the float so each dot's
  // width interpolates smoothly.
  const paginationIndex = useSharedValue(0);

  // ── Swipe-to-dismiss ──
  // Vertical drag down (from the top of the scroll content) scales the
  // scene and fades chrome. Releasing past 50% of screen height dismisses;
  // otherwise the scene springs back. Reduced-motion users keep the back
  // button — the gesture still dismisses but without the scale/translate.
  const dragY = useSharedValue(0);
  const dismissScale = useSharedValue(1);
  const chromeOpacity = useSharedValue(1);
  const isDismissing = useSharedValue(0);
  // Track the initial touch position so manualActivation can decide
  // direction from the delta, not the absolute coordinate.
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const goBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const dismissPan = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((event) => {
          'worklet';
          const touch = event.changedTouches[0];
          if (touch) {
            panStartX.value = touch.x;
            panStartY.value = touch.y;
          }
        })
        .onTouchesMove((event, stateManager) => {
          'worklet';
          // Only activate on a downward drag from the top of the content
          // (scrollY <= 0). Horizontal movement yields to the image
          // carousel; upward / mid-scroll movement yields to the
          // ScrollView so existing scroll behaviour is preserved.
          if (scrollY.value > 1) {
            stateManager.fail();
            return;
          }
          const touch = event.changedTouches[0];
          if (!touch) {
            stateManager.fail();
            return;
          }
          const dx = touch.x - panStartX.value;
          const dy = touch.y - panStartY.value;
          if (dy > 12 && Math.abs(dx) < 24) {
            stateManager.activate();
          } else if (Math.abs(dx) > 24 || dy < -12) {
            stateManager.fail();
          }
        })
        .onUpdate((e) => {
          'worklet';
          const raw = Math.max(0, e.translationY);
          dragY.value = raw;
          const progress = raw / screenHeight;
          dismissScale.value = interpolate(
            progress,
            [0, 1],
            [1, 0.85],
            Extrapolation.CLAMP,
          );
          chromeOpacity.value = interpolate(
            progress,
            [0, 0.5],
            [1, 0],
            Extrapolation.CLAMP,
          );
        })
        .onEnd((e) => {
          'worklet';
          const threshold = screenHeight * 0.5;
          const fastDismiss = e.velocityY > 800;
          if (dragY.value > threshold || fastDismiss) {
            isDismissing.value = 1;
            dragY.value = withTiming(screenHeight, { duration: Motion.duration.slow });
            dismissScale.value = withTiming(0.85, { duration: Motion.duration.slow });
            chromeOpacity.value = withTiming(0, { duration: Motion.duration.normal });
            runOnJS(goBack)();
          } else {
            dragY.value = withSpring(0, spring.tap);
            dismissScale.value = withSpring(1, spring.tap);
            chromeOpacity.value = withSpring(1, spring.tap);
          }
        }),
    [scrollY, dragY, dismissScale, chromeOpacity, isDismissing, panStartX, panStartY, screenHeight, spring, goBack],
  );

  const dismissContainerStyle = useAnimatedStyle(() => {
    'worklet';
    if (reducedMotion) {
      // Reduced motion: no scale/translate, only a gentle opacity fade so
      // the dismiss still reads as a transition without travel.
      return {
        opacity: chromeOpacity.value,
        transform: [{ translateY: 0 }, { scale: 1 }],
      };
    }
    return {
      transform: [{ translateY: dragY.value }, { scale: dismissScale.value }],
    };
  });

  const dismissChromeStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: chromeOpacity.value };
  });

  const bigHeartScale = useSharedValue(0);
  const bigHeartOpacity = useSharedValue(0);

  // Double-tap wraps the hook's fav toggle with the big-heart animation
  // (the animation SharedValues live in the screen because they are
  // Reanimated worklet state bound to the media stage).
  const handleDoubleTap = () => {
    actions.handleDoubleTap();
    if (reducedMotion) {
      bigHeartOpacity.value = 0;
      bigHeartScale.value = 0;
      return;
    }
    bigHeartOpacity.value = 1;
    bigHeartScale.value = withSequence(
      withTiming(1.4, { duration: Motion.duration.normal }),
      withTiming(1.4, { duration: Motion.duration.slower }),
      withTiming(0, { duration: Motion.duration.normal })
    );
  };

  // Pull-to-refresh — refetches the listing and backend data in parallel.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        data.refetch(),
        refreshListings(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [data, refreshListings]);

  // These values are consumed by the planned continuation surface. Retaining
  // them here ensures pagination state remains available when that route lands.
  void data.explore.items;
  void data.explore.fetchNextPage;
  void data.explore.hasNextPage;
  void data.explore.isFetchingNextPage;

  const listingEngagement = item?.engagement ?? null;

  // ── First-viewport seller trust row ──
  // Compact stats line for the rich seller row: sales · rating ·
  // response rate. Only truthful backend-backed signals — never
  // fabricated. Surfaces seller identity + verification in the first
  // viewport so a buyer sees who is selling before the price.
  const sellerStatsLine = (() => {
    if (!seller) return undefined;
    const parts: string[] = [];
    if (seller.completedSales != null && seller.completedSales > 0) {
      parts.push(`${seller.completedSales} sale${seller.completedSales > 1 ? 's' : ''}`);
    }
    if (seller.rating != null && seller.rating > 0) {
      parts.push(`${seller.rating.toFixed(1)}★`);
    }
    if (seller.responseRate != null && seller.responseRate > 0) {
      parts.push(`${Math.round(seller.responseRate)}% response`);
    }
    return parts.length > 0 ? parts.join(' · ') : undefined;
  })();
  const sellerVerified = !!seller?.verified
    || seller?.verificationTier === 'seller'
    || seller?.verificationTier === 'id';

  // "More from this seller" browse rail — moved before conditional returns.
  const moreFromSellerRailItems: Listing[] = useMemo(
    () =>
      item
        ? backendListings
            .filter(
              (l) =>
                l.id !== item.id &&
                !l.isSold &&
                item.sellerId != null &&
                l.sellerId === item.sellerId,
            )
            .slice(0, 6)
        : [],
    [backendListings, item?.id, item?.sellerId],
  );

  if (data.isLoading && !item) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CommerceStateCanvas
          state="loading"
          family="direct"
          heroFraction={isCompactScreen ? 0.54 : 0.58}
        />
      </View>
    );
  }

  if (data.isError && !item) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CommerceStateCanvas
          state="error"
          onRetry={() => data.refetch()}
        />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CommerceStateCanvas
          state="unavailable"
          title="Item not found"
          message="This listing may have been removed or is no longer available."
          onRetry={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
          retryLabel={t('product.browseSimilar')}
        />
      </View>
    );
  }

  const displayTitle = item.title ?? 'Listing details';
  const hasPrice = item.price !== null;
  const hasDiscount = hasPrice
    && item.originalPrice !== undefined
    && item.originalPrice > item.price!;
  const formattedPrice = hasPrice
    ? formatFromFiat(item.price!, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
    : 'Price unavailable';
  const formattedOriginal = hasDiscount
    ? formatFromFiat(item.originalPrice!, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
    : null;
  const discountPercent = hasDiscount && item.originalPrice
    ? ((item.originalPrice - item.price!) / item.originalPrice) * 100
    : null;
  const formattedProtectionTotal = serverCommerce?.estimatedTotal != null
    ? formatFromFiat(serverCommerce.estimatedTotal, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
    : null;
  const priceIzeText = hasPrice && fxRates && displayMode !== 'fiat'
    ? formatIzeAmount(toIze(item.price!, 'GBP', fxRates))
    : null;

  const capabilities = buildCapabilities(item, currentUser?.id);
  // Use the platform view-model builder for the commerce context
  // transformation — single source of truth for direct-listing data
  // shaping. buildCapabilities is retained for the full capability
  // set (isOwner / isSold / isAvailable / commerceTier / canEnquire)
  // which the VM's capabilities subset does not expose.
  const directViewModel = buildDirectViewModel({
    listing: item,
    commerce: serverCommerce ?? undefined,
    seller: seller ?? undefined,
    currentUserId: currentUser?.id,
    isLiked: isFav,
    isSavedToCollection: isItemSavedAnywhere(item.id),
  });
  // buildDirectViewModel always returns the direct family branch; the
  // type guard narrows the discriminated union so commerce is typed.
  const commerce = isDirectViewModel(directViewModel)
    ? directViewModel.commerce
    : buildCommerceContext(item);

  // Bundle upsell: items from the same seller (more_from_seller section)
  const moreFromSellerSection = recommendationSections.find((s) => s.key === 'more_from_seller');
  const bundleItems: DisplayReadyListing[] = moreFromSellerSection
    ? moreFromSellerSection.items.filter(
        (i): i is DisplayReadyListing => !isRecommendationLook(i)
      )
    : [];

  // "Seen in Looks" — community Looks that tag this item. Sourced from
  // the `seen_in_looks` recommendation section. Only rendered when the
  // backend supplies real look data (Design.md: "Seen in Looks" below
  // core decision info).
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');
  const seenInLooksItems: RecommendationLook[] = seenInLooksSection
    ? seenInLooksSection.items.filter(isRecommendationLook)
    : [];

  const handlePressRecommendation = (
    recItem: Listing,
    recSectionKey?: string,
    recPosition?: number,
    recReasonCode?: string,
    recPersonalised?: boolean,
  ) => {
    navigation.push('ItemDetail', {
      itemId: recItem.id,
      sectionKey: recSectionKey,
      position: recPosition,
      reasonCode: recReasonCode,
      personalised: recPersonalised,
    });
  };

  const interestSignal = (() => {
    if (item.likes && item.likes > 0) return `${item.likes} like${item.likes > 1 ? 's' : ''}`;
    return undefined;
  })();

  // ── Social proof line (truthful) ──
  // Built only from real engagement data — never fabricated. Combines
  // active offers (scarcity urgency) and cumulative views (popularity)
  // into a single muted line below the price. Each signal is only
  // included when the backend provides a positive count.
  const socialProofLine = (() => {
    const parts: string[] = [];
    const activeOffers = listingEngagement?.activeOfferCount;
    if (activeOffers != null && activeOffers > 0) {
      parts.push(`${activeOffers} offer${activeOffers > 1 ? 's' : ''} active`);
    }
    const views = item.views;
    if (views != null && views > 0) {
      parts.push(`${views} view${views > 1 ? 's' : ''}`);
    }
    return parts.length > 0 ? parts.join(' · ') : undefined;
  })();

  const attributeLine = [
    item.size && `Size ${item.size}`,
    item.condition,
    item.category,
  ].filter(Boolean).join(' · ');

  // Condition colour-coding + definition. Maps each ListingCondition to a
  // semantic accent and a plain-English definition shown on tap.
  const conditionMeta = (() => {
    switch (item.condition) {
      case 'New with tags':
        return { color: colors.success, definition: 'New: Unworn, with original tags and packaging intact.' };
      case 'Very good':
        return { color: colors.commerceTrust, definition: 'Very good: No visible flaws, minimal wear.' };
      case 'Good':
        return { color: colors.warning, definition: 'Good: Light wear consistent with gentle use; no major flaws.' };
      case 'Satisfactory':
        return { color: colors.bronze, definition: 'Satisfactory: Visible wear or minor flaws; fully wearable.' };
      default:
        return null;
    }
  })();

  const secondaryLine = [
    formattedProtectionTotal ? `${formattedProtectionTotal} with Buyer Protection` : null,
  ].filter(Boolean).join(' · ') || undefined;

  // The sold state is already shown via the media overlay "SOLD" badge
  // and the dock "Sold" badge — don't repeat it on the ProductFamilyBadge.
  // The family badge should communicate provenance, not transaction state.
  const familyStateAccent = null;

  // ── Dock geometry ──
  const isDualActionDock = !capabilities.isOwner && !capabilities.isSold && capabilities.canBuy && capabilities.canOffer;
  const dockHeight = isDualActionDock
    ? DockConstants.dualActionHeight
    : DockConstants.singleActionHeight;
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + dockHeight + Space.md;

  // ── Price insight rows (only truthful facts) ──
  const priceInsightRows: Array<{ label: string; value: string; muted?: boolean }> = [];
  if (hasDiscount && discountPercent && discountPercent > 0) {
    priceInsightRows.push({ label: 'Price drop', value: `-${Math.round(discountPercent)}%` });
  }
  if (
    soldComps &&
    soldComps.sampleSize >= 2 &&
    soldComps.minPrice != null &&
    soldComps.maxPrice != null
  ) {
    priceInsightRows.push({
      label: `${soldComps.sampleSize} similar sold`,
      value: `${formatFromFiat(soldComps.minPrice, soldComps.currency)}–${formatFromFiat(soldComps.maxPrice, soldComps.currency)}`,
      muted: true,
    });
  }
  const latestPriceEvent = priceHistory[0];
  if (latestPriceEvent) {
    priceInsightRows.push({
      label: 'Previous price',
      value: formatFromFiat(latestPriceEvent.previousPrice, latestPriceEvent.currency),
      muted: true,
    });
  }
  const daysListed = item.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  if (daysListed != null && daysListed >= 3) {
    priceInsightRows.push({
      label: 'Time on market',
      value: daysListed === 1 ? '1 day' : `${daysListed} days`,
      muted: true,
    });
  }

  // One inline insight for the consolidated disclosure — surface only
  // the most material fact; the full breakdown expands on tap.
  const priceInsightSummary = (() => {
    if (hasDiscount && discountPercent && discountPercent > 0) {
      return `Reduced ${Math.round(discountPercent)}%`;
    }
    if (soldComps && soldComps.sampleSize >= 2) {
      return `${soldComps.sampleSize} similar sold`;
    }
    if (latestPriceEvent) {
      return `Previous ${formatFromFiat(latestPriceEvent.previousPrice, latestPriceEvent.currency)}`;
    }
    if (daysListed != null && daysListed >= 3) {
      return daysListed === 1 ? '1 day on market' : `${daysListed} days on market`;
    }
    return undefined;
  })();

  // ── Purchase detail rows (compact summary + disclosure) ──
  const purchaseSummary = [
    commerce.shippingMethod,
    commerce.protectionPolicy?.available ? commerce.protectionPolicy.label : null,
    commerce.returnPolicy
      ? commerce.returnPolicy.accepted
        ? commerce.returnPolicy.windowDays
          ? `Returns within ${commerce.returnPolicy.windowDays} days`
          : 'Returns accepted'
        : 'No returns'
      : null,
    commerce.authenticity && commerce.authenticity.status !== 'not_offered'
      ? commerce.authenticity.label ?? (commerce.authenticity.status === 'verified' ? 'Verified' : 'Eligible')
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <GestureDetector gesture={dismissPan}>
    <Reanimated.View
      testID="item-detail-screen"
      entering={reducedMotion ? FadeIn.duration(0) : FadeIn.duration(Motion.transitions.mediaLoad.duration)}
      style={[styles.container, { backgroundColor: colors.background }, dismissContainerStyle]}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── Collapsed scrolling header ──
          Quiet glyph hit targets, no large rounded-square containers.
          Separate hit area from visible shape.
          Wrapped in a chrome-fade layer so the header recedes as the
          swipe-to-dismiss drag progresses. */}
      <Reanimated.View style={dismissChromeStyle}>
      <CommerceDetailHeader
        scrollY={scrollY}
        title={displayTitle}
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'share-outline',
          label: 'Share listing',
          onPress: actions.handleShare,
        }}
      />
      </Reanimated.View>

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        accessibilityElementsHidden={collectionModalVisible || actions.shareVisible || fullscreenVisible || sizeGuideVisible || qaSheetVisible || purchaseDetailsVisible || overflowVisible || makeOfferVisible || conditionInfoVisible}
        importantForAccessibility={collectionModalVisible || actions.shareVisible || fullscreenVisible || sizeGuideVisible || qaSheetVisible || purchaseDetailsVisible || overflowVisible || makeOfferVisible || conditionInfoVisible ? 'no-hide-descendants' : 'auto'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      >
        {/* ── Zone A — Media stage ──
            CommerceMediaStage handles paging/zoom/fullscreen only.
            CommerceDetailMediaRail overlays the max-3-visible-controls
            (Back, Share, Save) + overflow (Fav, Watch, Report). */}
        <CommerceMediaStage
          images={item.images}
          category={item.category ?? undefined}
          objectId={item.id}
          isFav={isFav}
          isSaved={isItemSavedAnywhere(item.id)}
          isSold={!!item.isSold}
          topInset={insets.top}
          scrollY={scrollY}
          onBack={() => navigation.goBack()}
          onShare={actions.handleShare}
          onSave={() => { if (!requireAuth('save_item')) return; haptic.patterns.save(); setCollectionModalVisible(true); }}
          onToggleFav={actions.handleToggleFav}
          onDoubleTap={handleDoubleTap}
          onZoomStart={() => { if (item) ProductAnalytics.mediaZoom(item.id); }}
          onOpenFullscreen={media.openViewer}
          heightFraction={isCompactScreen ? 0.54 : 0.58}
          initialIndex={fullscreenIndex}
          onActiveIndexChange={(index) => {
            media.setActiveIndex(index);
            paginationIndex.value = reducedMotion
              ? index
              : withSpring(index, spring.tap);
          }}
          bigHeartOpacity={bigHeartOpacity}
          bigHeartScale={bigHeartScale}
          showDefaultControls={false}
          showPageIndicator={false}
          showThumbnailStrip={item.images ? item.images.length > 1 : false}
          overlayTopContent={
            familyStateAccent ? (
              <View style={styles.familyBadgeOverlay}>
                <ProductFamilyBadge
                  family="direct"
                  stateAccent={familyStateAccent}
                  compact
                />
              </View>
            ) : null
          }
        />
        <CommerceDetailMediaRail
          onBack={() => navigation.goBack()}
          topInset={insets.top}
          rightActions={[
            {
              icon: 'share-outline',
              label: 'Share',
              onPress: handleShare,
            },
            {
              icon: isItemSavedAnywhere(item.id) ? 'bookmark' : 'bookmark-outline',
              activeIcon: 'bookmark',
              label: isItemSavedAnywhere(item.id) ? 'Saved to collection' : 'Save to collection',
              onPress: () => { haptic.patterns.save(); setCollectionModalVisible(true); },
              isActive: isItemSavedAnywhere(item.id),
            },
          ]}
          onOverflow={() => setOverflowVisible(true)}
          showOverflow
        />

        {/* ── Image pagination ──
            Thumbnail strip is rendered inside CommerceMediaStage
            (showThumbnailStrip=true). No external dots/counter needed —
            the thumbnail rail is the premium 2026 pattern (eBay/Depop). */}

        <CommerceDetailOfflineBanner isOffline={isOffline} />

        {/* ── First-viewport seller trust row (display-only) ──
            Per spec: seller identity + verification badge + stats line
            must appear in the first viewport, right after the media
            stage and before the price. This is the buyer's first trust
            signal — who is selling this item. Display-only — no onPress.
            The full SellerInfoCard (with Follow / Message / View shop
            actions and the "More from this seller" rail) lives in Zone
            E below and is the sole profile navigation point. */}
        {seller ? (
          <View style={[styles.firstViewportSellerRow, { borderBottomColor: colors.borderSubtle }]}>
            <CommerceDetailSellerRow
              variant="rich"
              avatarUri={seller.avatar ?? undefined}
              name={seller.username}
              verified={sellerVerified}
              statsLine={sellerStatsLine}
              ratingLine={
                seller?.rating != null && seller.rating > 0
                  ? (seller.reviewCount != null && seller.reviewCount > 0
                    ? `${seller.rating.toFixed(1)} · ${seller.reviewCount} reviews`
                    : `${seller.rating.toFixed(1)}`)
                  : undefined
              }
              locationLine={seller?.location ?? undefined}
            />
          </View>
        ) : null}

        {/* ── Zone B — Identity seam ──
            Direct keeps critical copy off arbitrary seller photography.
            Media establishes desire first; the stable editorial canvas
            then owns brand, identity and price. The dock is the only
            actionable repetition of that price. */}
        <View style={styles.editorialIdentityChapter}>
          <CommerceDetailIdentity
            family="direct"
            tone="canvas"
            density={isCompactScreen ? 'compact' : 'standard'}
            eyebrow={item.brand ?? item.category ?? undefined}
            title={displayTitle}
            primaryValue={formattedPrice}
            originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
            discountBadge={hasDiscount && discountPercent ? `-${Math.round(discountPercent)}%` : undefined}
            secondaryLine={secondaryLine}
            interestSignal={interestSignal}
          />

          {/* ── Consolidated attribute row ──
              Condition chip, size/category, social proof, and izeText
              in one composed row — replaces the former 3 separate thin
              metadata lines (socialProofLine, attributeRow, izeText)
              that created label-everything disease. Per AGENTS.md §4:
              "Real apps show less: the object is the label." Per 2026
              PDP research: "The first viewport normally uses no more
              than three type sizes and one eyebrow." */}
          {(attributeLine || socialProofLine || priceIzeText) ? (
            <View style={styles.attributeRow}>
              <View style={styles.attributeLeftCluster}>
                {/* Condition chip — condition gets a distinct visual
                    treatment instead of blending into muted text. It
                    is the most important attribute for second-hand
                    buyers, so it earns its own affordance and a tap
                    target that opens the definition. */}
                {item.condition ? (
                  <AnimatedPressable
                    onPress={() => setConditionInfoVisible(true)}
                    hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                    style={[
                      styles.conditionChip,
                      {
                        borderColor: conditionMeta ? `${conditionMeta.color}66` : colors.borderSubtle,
                        backgroundColor: conditionMeta ? `${conditionMeta.color}14` : 'transparent',
                      },
                    ]}
                    scaleValue={0.98}
                    hapticFeedback="light"
                    accessibilityLabel={`Condition: ${item.condition}. Tap for definition.`}
                    accessibilityRole="button"
                  >
                    <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
                    <Text style={[styles.conditionChipText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1}>
                      {item.condition}
                    </Text>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                  </AnimatedPressable>
                ) : null}
                {(() => {
                  const remaining = [
                    item.size && `Size ${item.size}`,
                    item.category,
                  ].filter(Boolean).join(' · ');
                  return remaining ? (
                    <Text style={[styles.attributeText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1}>
                      {remaining}
                    </Text>
                  ) : null;
                })()}
                {/* Social proof — truthful engagement signals (active
                    offers, views) rendered as a quiet trailing element
                    in the same row. Only included when the backend
                    provides positive counts — never fabricated. */}
                {socialProofLine ? (
                  <Text style={[styles.socialProofInline, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1}>
                    · {socialProofLine}
                  </Text>
                ) : null}
              </View>
              {item.size && (
                <AnimatedPressable
                  onPress={() => setSizeGuideVisible(true)}
                  hitSlop={8}
                  style={styles.quietTextTarget}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  accessibilityLabel="View size guide"
                  accessibilityRole="button"
                >
                  <Text style={[styles.sizeGuideLink, { color: colors.brand }]} maxFontSizeMultiplier={1}>
                    Size guide
                  </Text>
                </AnimatedPressable>
              )}
            </View>
          ) : null}

          {/* izeText — quiet 1ZE-equivalent value on its own line
              below the attribute row. Kept separate because it is a
              price-adjacent fact, not an attribute. */}
          {priceIzeText ? (
            <Text style={[styles.izeText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1}>
              {priceIzeText}
            </Text>
          ) : null}
        </View>

        {/* ── Zone C — Trust facts (max 3) ──
            Seller rating and dispatch time — the facts a buyer needs
            to decide whether to keep reading. Condition is already
            shown in the attribute row above, so it is not repeated
            here. Full commerce details (protection, returns,
            authenticity) live in the Shipping & returns section below.
            Flat rows with hairline separators — no chips, no cards.
            Each row is one fact with an icon + label, separated by
            hairlines for clear scanning. */}
        {(() => {
          const trustRows: { icon: keyof typeof Ionicons.glyphMap; label: string; dotColor?: string }[] = [];
          // 1. Seller rating — social proof (review count/score summary)
          if (seller?.rating != null && seller.rating > 0) {
            const ratingText = seller.reviewCount != null && seller.reviewCount > 0
              ? `${seller.rating.toFixed(1)} · ${seller.reviewCount} reviews`
              : `${seller.rating.toFixed(1)}`;
            trustRows.push({
              icon: 'star-outline',
              label: ratingText,
            });
          }
          // 2. Seller verification — trust badge for verified sellers
          if (seller?.verified || seller?.verificationTier === 'seller' || seller?.verificationTier === 'id') {
            const verifyLabel = seller.verificationTier === 'seller'
              ? 'Trusted Seller'
              : seller.verificationTier === 'id'
                ? 'ID Verified'
                : 'Verified';
            trustRows.push({
              icon: 'checkmark-circle-outline',
              label: verifyLabel,
            });
          }
          // 3. Response time — "Usually responds in 2h" signal
          if (seller?.responseTimeLabel) {
            trustRows.push({
              icon: 'chatbubble-ellipses-outline',
              label: seller.responseTimeLabel,
            });
          }
          // 4. Dispatch time — when will it arrive?
          if (seller?.dispatchTimeLabel) {
            trustRows.push({
              icon: 'car-outline',
              label: seller.dispatchTimeLabel,
            });
          } else if (commerce.shippingMethod) {
            trustRows.push({
              icon: commerce.shippingPayer === 'seller' ? 'gift-outline' : 'car-outline',
              label: commerce.shippingPayer === 'seller'
                ? `Free ${commerce.shippingMethod}`
                : commerce.shippingMethod,
            });
          }
          // 5. Buyer protection fallback — per research doc M1: when no
          // seller rating or dispatch time exists, the first viewport
          // must still carry at least one trust signal. For a
          // stranger-to-stranger marketplace, buyer protection / escrow
          // is the baseline trust guarantee.
          if (trustRows.length === 0 && commerce.protectionPolicy?.available) {
            trustRows.push({
              icon: 'checkmark-circle-outline',
              label: commerce.protectionPolicy.label ?? 'Buyer Protection',
            });
          }
          if (trustRows.length === 0) return null;
          const elevated = trustRows.slice(0, 3);
          return (
            <View style={styles.trustFactsSection}>
              {elevated.map((row, i) => (
                <View
                  key={i}
                  style={[
                    styles.trustFactRow,
                    i < elevated.length - 1 && { borderBottomColor: colors.borderSubtle },
                  ]}
                >
                  {row.dotColor ? (
                    <View style={[styles.trustFactDot, { backgroundColor: row.dotColor }]} />
                  ) : (
                    <Ionicons name={row.icon} size={16} color={colors.textSecondary} />
                  )}
                  <Text style={[styles.trustFactText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1}>
                    {row.label}
                  </Text>
                </View>
              ))}
            </View>
          );
        })()}

        {/* ── Zone D — Description (progressive disclosure) ──
            Description + condition + category evidence + posted date.
            Sits after trust facts, before shipping. */}
        <CommerceDetailSection label="Item details" divider variant="editorial">
          {item.description ? (
            <View style={styles.descriptionWrap}>
              {/* Full-area tap target — the entire collapsed text is
                  tappable, not just the "Read more" link. Buyers often
                  do not notice that a description can be expanded via
                  a small "see more" link, so the whole collapsed block
                  is the hit target. */}
              <Pressable
                onPress={() => {
                  if (item.description && item.description.length > 120) {
                    setDescriptionExpanded((prev) => !prev);
                  }
                }}
                accessibilityLabel={descriptionExpanded ? 'Show less' : 'Read more'}
                accessibilityRole="button"
                accessibilityState={{ expanded: descriptionExpanded }}
                disabled={descriptionExpanded || (item.description.length <= 120)}
              >
                <Text
                  style={[styles.descriptionText, { color: colors.textPrimary }]}
                  numberOfLines={descriptionExpanded ? undefined : 3}
                  maxFontSizeMultiplier={2}
                >
                  {item.description}
                </Text>
                {/* Gradient fade at the collapse edge when collapsed.
                    Visual signal that there's more content below. */}
                {!descriptionExpanded && item.description.length > 120 && (
                  <LinearGradient
                    // NOTE: hex-alpha required for gradient stops — token substitution not applicable
                    colors={[`${colors.background}00`, colors.background]}
                    style={styles.descriptionFade}
                    pointerEvents="none"
                    accessible={false}
                  />
                )}
              </Pressable>
              {item.description.length > 120 && (
                <AnimatedPressable
                  onPress={() => setDescriptionExpanded((prev) => !prev)}
                  hitSlop={8}
                  style={styles.quietTextTarget}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  accessibilityLabel={descriptionExpanded ? 'Show less' : 'Read more'}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: descriptionExpanded }}
                >
                  <Text style={[styles.descriptionToggle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1}>
                    {descriptionExpanded ? 'Show less' : 'Read more'}
                  </Text>
                </AnimatedPressable>
              )}
            </View>
          ) : null}

          {(() => {
            // ── Category evidence ──
            // resolveEvidenceGroups() supports car/yacht fields (make,
            // mileage, transmission, fuelType, bodyType, serviceRecords,
            // motInspection, mechanicalCondition, inspectionAvailable,
            // inspectionReport, v5Logbook, numberOfOwners, financeStatus,
            // length, beam, draft, displacement, engineType, engineHours,
            // surveyAvailable, surveyDate, surveyReport, registration,
            // flag, ownershipDocs, viewingAvailable, viewingLocation,
            // seaTrialAvailable) plus watch/art/electronics extras
            // (material, measurements, flaws, reference, movement,
            // caseSize, serviceHistory, boxPapers, dimensions, hardware,
            // exteriorCondition, interiorCondition, includedAccessories,
            // serialImagery, provenance, model, storage, batteryCondition,
            // functionalIssues, warranty, creator, year, medium, edition).
            //
            // The Listing model does not yet declare these fields, so we
            // read them dynamically from the listing object. When the
            // backend schema is extended to return them, they will flow
            // through here without further frontend changes. Until then
            // only the known fields (category, subcategory, brand, size,
            // condition, description) are guaranteed to be present, which
            // keeps the existing evidence groups rendering correctly.
            const dynamicItem = item as unknown as Record<string, string | null | undefined>;
            const pickStr = (key: string): string | null | undefined => {
              const value = dynamicItem[key];
              return typeof value === 'string' ? value : null;
            };
            const evidenceGroups = resolveEvidenceGroups({
              // Known Listing fields
              category: item.category,
              subcategory: item.subcategory,
              brand: item.brand,
              size: item.size,
              condition: item.condition,
              description: item.description,
              // Watch / jewellery / electronics / art extras
              material: pickStr('material'),
              measurements: pickStr('measurements'),
              flaws: pickStr('flaws'),
              reference: pickStr('reference'),
              movement: pickStr('movement'),
              caseSize: pickStr('caseSize'),
              serviceHistory: pickStr('serviceHistory'),
              boxPapers: pickStr('boxPapers'),
              dimensions: pickStr('dimensions'),
              hardware: pickStr('hardware'),
              exteriorCondition: pickStr('exteriorCondition'),
              interiorCondition: pickStr('interiorCondition'),
              includedAccessories: pickStr('includedAccessories'),
              serialImagery: pickStr('serialImagery'),
              provenance: pickStr('provenance'),
              model: pickStr('model'),
              storage: pickStr('storage'),
              batteryCondition: pickStr('batteryCondition'),
              functionalIssues: pickStr('functionalIssues'),
              warranty: pickStr('warranty'),
              creator: pickStr('creator'),
              year: pickStr('year'),
              medium: pickStr('medium'),
              edition: pickStr('edition'),
              // Car fields
              make: pickStr('make'),
              mileage: pickStr('mileage'),
              transmission: pickStr('transmission'),
              fuelType: pickStr('fuelType'),
              bodyType: pickStr('bodyType'),
              serviceRecords: pickStr('serviceRecords'),
              motInspection: pickStr('motInspection'),
              mechanicalCondition: pickStr('mechanicalCondition'),
              inspectionAvailable: pickStr('inspectionAvailable'),
              inspectionReport: pickStr('inspectionReport'),
              v5Logbook: pickStr('v5Logbook'),
              numberOfOwners: pickStr('numberOfOwners'),
              financeStatus: pickStr('financeStatus'),
              // Yacht fields
              length: pickStr('length'),
              beam: pickStr('beam'),
              draft: pickStr('draft'),
              displacement: pickStr('displacement'),
              engineType: pickStr('engineType'),
              engineHours: pickStr('engineHours'),
              surveyAvailable: pickStr('surveyAvailable'),
              surveyDate: pickStr('surveyDate'),
              surveyReport: pickStr('surveyReport'),
              registration: pickStr('registration'),
              flag: pickStr('flag'),
              ownershipDocs: pickStr('ownershipDocs'),
              viewingAvailable: pickStr('viewingAvailable'),
              viewingLocation: pickStr('viewingLocation'),
              seaTrialAvailable: pickStr('seaTrialAvailable'),
            });
            return evidenceGroups.length > 0 ? (
              <CategoryEvidence groups={evidenceGroups} />
            ) : null;
          })()}

          {item.createdAt ? (
            <Text style={[styles.postedDate, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1}>
              Posted {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          ) : null}
        </CommerceDetailSection>

        {/* ── Zone E — Seller row (compact, links to profile) ──
            Seller identity sits in the second viewport (after description,
            before shipping). The buyer sees media, identity, trust facts,
            description, then the seller — before shipping and similar
            items. This is the evidence role: source credibility immediately
            after the item evidence.
            The seller section closes with a "More from this seller" rail. */}
        {seller && (
          <View style={[styles.sellerTrustSection, { borderTopColor: colors.borderSubtle }]}>
            <SellerInfoCard
              seller={seller}
              isOwner={capabilities.isOwner}
              isFollowing={seller?.isFollowing ?? false}
              isFollowPending={sellerFollowMutation.isPending}
              onFollow={() => {
                if (!requireAuth('follow_seller')) return;
                sellerFollowMutation.mutate(undefined, {
                  onSuccess: (data) => {
                    show(data.isFollowing ? 'Followed seller' : 'Unfollowed seller', 'success');
                  },
                  onError: () => {
                    show('Could not follow seller. Try again.', 'error');
                  },
                });
              }}
              onMessage={handleMessageSeller}
              onViewShop={handleViewSeller}
            />
          </View>
        )}

        {/* ── More from this seller ──
            Horizontal browse rail of other live listings from the same
            seller. Contextual to the seller section — closes it with a
            bottom hairline. Only rendered when there are at least 2 real
            items. Uses ProductCard inside HorizontalRail so cards match
            discovery surfaces. Distinct from the Bundle upsell discovery
            module in the tail (which incentivises multi-item purchase). */}
        {seller && moreFromSellerRailItems.length >= 2 ? (
          <View style={[styles.moreFromSellerRailWrap, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.moreFromSellerRailTitle, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={2}>
              More from {seller.username ?? 'this seller'}
            </Text>
            <HorizontalRail
              contentContainerStyle={styles.railContent}
              accessibilityLabel={`More from ${seller.username ?? 'this seller'}`}
            >
              {moreFromSellerRailItems.map((railItem) => (
                <View key={railItem.id} style={styles.railCardWrap}>
                  <ProductCard
                    item={railItem as unknown as CatalogListing}
                    onPress={() => handlePressRecommendation(railItem, 'more_from_seller')}
                    showSaveButton={false}
                    enableEntranceAnimation={false}
                    visualOnly
                  />
                </View>
              ))}
            </HorizontalRail>
          </View>
        ) : null}

        {/* ── Zone F — Shipping & returns (collapsed by default) ──
            Full commerce details: costs, delivery, protection, returns,
            authenticity. Progressive disclosure — summary visible, details
            expand on tap. Sits after the seller. */}
        {purchaseSummary ? (
          <CommerceDetailSection label="Buying this item" variant="continuation">
            <CommerceDetailDisclosureRow
              label="Costs, delivery & protection"
              summary="Full breakdown"
              onPress={() => {
                haptic.light();
                setPurchaseDetailsVisible(true);
              }}
              leadingIcon="information-circle-outline"
            />
            <ShippingReturnsInfo
              commerce={commerce}
            />
            <SustainabilityImpact listingId={item.id} />
          </CommerceDetailSection>
        ) : null}

        {/* ── Price history & market ──
            Consolidated disclosure: one inline insight surfaces the
            most material fact (price drop, sold comparables, etc.);
            the full breakdown expands on tap. */}
        {priceInsightRows.length > 0 ? (
          <>
            <CommerceDetailDisclosureRow
              label={priceHistoryExpanded ? 'Hide price history' : 'Price history & market'}
              summary={priceInsightSummary}
              onPress={() => setPriceHistoryExpanded((prev) => !prev)}
              leadingIcon="trending-up-outline"
              accessibilityLabel="Toggle price history and market"
            />
            {priceHistoryExpanded ? (
              <CommerceDetailSection label="Price history & market" variant="continuation">
                {priceInsightRows.map((row) => (
                  <CommerceDetailMetricRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    muted={row.muted}
                  />
                ))}
                {hasDiscount && discountPercent && discountPercent > 0 ? (
                  <AnimatedPressable
                    onPress={handleTogglePriceAlert}
                    disabled={priceAlertLoading}
                    style={styles.alertRow}
                    scaleValue={0.98}
                    hapticFeedback="light"
                    accessibilityRole="switch"
                    accessibilityState={{
                      checked: priceAlertEnabled,
                      disabled: priceAlertLoading,
                      busy: priceAlertLoading,
                    }}
                    accessibilityLabel={priceAlertEnabled ? 'Disable price drop alert' : 'Enable price drop alert'}
                  >
                    <View style={styles.alertRowLeft}>
                      <Ionicons
                        name={priceAlertEnabled ? 'notifications' : 'notifications-outline'}
                        size={18}
                        color={priceAlertEnabled ? colors.brand : colors.textSecondary}
                      />
                      <Text style={[styles.alertRowLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1}>
                        Price drop alerts
                      </Text>
                    </View>
                    <View style={[styles.toggleTrack, { borderColor: priceAlertEnabled ? colors.brand : colors.border, backgroundColor: priceAlertEnabled ? colors.brandSubtle : colors.surfaceAlt }]}>
                      <View style={[styles.toggleThumb, { backgroundColor: priceAlertEnabled ? colors.brand : colors.textMuted, alignSelf: priceAlertEnabled ? 'flex-end' : 'flex-start' }]} />
                    </View>
                  </AnimatedPressable>
                ) : null}
              </CommerceDetailSection>
            ) : null}
          </>
        ) : null}

        <CommerceDetailSection label="Questions" variant="compact" divider>
          <CommerceDetailDisclosureRow
            label={qaSummary?.questionCount ? 'View all questions' : 'Ask a question'}
            summary={qaSummary?.questionCount ? undefined : 'No questions yet'}
            count={qaSummary?.questionCount ?? listingEngagement?.questionCount}
            onPress={() => setQaSheetVisible(true)}
            leadingIcon="help-circle-outline"
            accessibilityLabel="View questions and answers"
          />
        </CommerceDetailSection>

        {/* ── Zone G — Related / recommended (below fold) ──
            Bundle upsell + visual-similar grid. These are discovery
            surfaces that extend the session — they belong below all
            item-critical content. */}
        <BundleUpsellRow
          items={bundleItems}
          currentListingId={item.id}
          shippingPayer={commerce.shippingPayer}
          onPressItem={handlePressRecommendation}
          sellerId={item.seller?.id ?? undefined}
          sellerName={item.seller?.username ?? undefined}
          onOpenBundleBag={(sellerId, sellerName) => navigation.navigate('BundleBag', { sellerId, sellerName })}
        />

        {/* More like this — visual-similar grid by category/brand.
            Contextual heading: prefer brand when available, fall back
            to category, then to the generic label. */}
        {(() => {
          const visualSimilar = backendListings
            .filter((l) =>
              l.id !== item.id &&
              !l.isSold &&
              (l.category === item.category || l.brand === item.brand)
            )
            .slice(0, 4);
          if (visualSimilar.length < 2) return null;
          const discoveryLabel = item.brand
            ? `More from ${item.brand}`
            : item.category
            ? `More ${item.category.toLowerCase()}`
            : 'More like this';
          return (
            <CommerceDetailSection label={discoveryLabel} divider variant="discovery">
                <View style={styles.moreLikeThisGrid}>
                  {visualSimilar.map((simItem) => {
                    const simPriceFormatted = simItem.price != null
                      ? formatFromFiat(simItem.price, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
                      : null;
                    return (
                    <AnimatedPressable
                      key={simItem.id}
                      style={styles.moreLikeThisCard}
                      scaleValue={0.98}
                      hapticFeedback="light"
                      onPress={() => handlePressRecommendation(simItem, 'similar_items')}
                      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${simItem.title}${simPriceFormatted ? `, ${simPriceFormatted}` : ''}${simItem.brand ? `, ${simItem.brand}` : ''}`}
                    >
                      {simItem.images?.[0] ? (
                        <CachedImage
                          uri={simItem.images[0]}
                          style={styles.moreLikeThisImage}
                          contentFit="cover"
                        />
                      ) : (
                        <ImageEmptyGraphic
                          icon="shirt-outline"
                          style={styles.moreLikeThisImage}
                        />
                      )}
                      <Text style={[styles.moreLikeThisTitle, { color: colors.textPrimary }]} numberOfLines={2} maxFontSizeMultiplier={2}>
                        {simItem.title}
                      </Text>
                      {(simItem.brand || simItem.condition) && (
                        <Text style={[styles.moreLikeThisMeta, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1}>
                          {[simItem.brand, simItem.condition].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      <Text style={[styles.moreLikeThisPrice, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={2}>
                        {simPriceFormatted}
                      </Text>
                    </AnimatedPressable>
                    );
                  })}
                </View>
              </CommerceDetailSection>
          );
        })()}

        {/* Seen in Looks — community-styled outfits featuring this item.
            Per Design.md: "Seen in Looks" below core decision info.
            Only rendered when the backend supplies real look data. */}
        {seenInLooksItems.length > 0 ? (
          <SeenInLooksRail
            items={seenInLooksItems}
            onPressItem={(look) => navigation.navigate('LookDetail', { lookId: look.id })}
          />
        ) : null}

        {recsError && recommendationSections.length === 0 && (
          <View style={styles.recErrorRow}>
            <CommerceDetailUnavailableInline
              title="Recommendations unavailable"
              body="Recommendations are temporarily unavailable."
            />
          </View>
        )}

        {/* Sync retry banner — only when there is a real sync error */}
        {lastError ? (
          <View style={styles.syncRetryWrap}>
            <SyncRetryBanner
              message="Pull latest listing changes now."
              onRetry={() => void refreshListings()}
              isRetrying={isSyncing}
              telemetryContext="item_detail_listing_sync"
            />
          </View>
        ) : null}
      </Reanimated.ScrollView>

      {/* ── Zone I — Sticky action dock ──
          Buyer: price + Buy now + Make offer.
          Seller: Manage listing.
          Sold/unavailable: factual state + one next action. */}
      {(() => {
        if (capabilities.isOwner) {
          return (
            <CommerceDetailStateDock
              value={formattedPrice}
              valueLabel="Your listing"
              thumbnailUri={item.images?.[0]}
              primaryAction={{
                label: t('product.manageListing'),
                onPress: () => navigation.navigate('ManageListing', { itemId: item.id }),
              }}
            />
          );
        }

        if (capabilities.isSold) {
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.success }]} maxFontSizeMultiplier={1}>
                  Sold
                </Text>
              }
              subtitle="This item has been sold"
              primaryAction={{
                label: 'More like this',
                onPress: () => navigation.navigate('MainTabs', { screen: 'Explore' }),
              }}
            />
          );
        }

        if (!capabilities.isAvailable) {
          const unavailableCopy = (() => {
            switch (capabilities.unavailableReason) {
              case 'reserved':
                return { label: 'Reserved', subtitle: 'This item is currently held for another buyer' };
              case 'paused':
                return { label: 'Paused', subtitle: 'The seller has paused this listing' };
              case 'draft':
                return { label: 'Not published', subtitle: 'This listing is not available to buy' };
              case 'missing_price':
                return { label: 'Price unavailable', subtitle: 'The seller has not supplied a valid price' };
              case 'missing_seller':
                return { label: 'Seller unavailable', subtitle: 'Seller details could not be verified' };
              case 'status_unknown':
                return { label: 'Status unavailable', subtitle: 'Purchase availability could not be verified' };
              default:
                return { label: 'Unavailable', subtitle: 'This listing is no longer available' };
            }
          })();
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]} maxFontSizeMultiplier={1}>
                  {unavailableCopy.label}
                </Text>
              }
              subtitle={unavailableCopy.subtitle}
              primaryAction={{
                label: t('product.browseSimilar'),
                onPress: () => navigation.navigate('MainTabs', { screen: 'Explore' }),
              }}
            />
          );
        }

        // ── Tier-adaptive dock actions ──
        // Category-adaptive CTAs by commerce tier:
        //   - brokered: Enquire + Request viewing (no direct buy/offer)
        //   - specialist: Buy now + Enquire (expert review questions)
        //   - authenticated_luxury: Buy now + Make offer (authentication
        //     note shows in the trust strip)
        //   - standard: Buy now + Make offer (existing behaviour)
        // The enquiry/viewing actions open a DM conversation with the
        // seller, following the same createDmConversationOnApi → Chat
        // navigation pattern used by the SellerInfoCard message action.
        const enquireAction = capabilities.canEnquire
          ? {
              label: 'Enquire',
              onPress: handleEnquire,
            }
          : undefined;

        const requestViewingAction = capabilities.canRequestViewing
          ? {
              label: 'Request viewing',
              onPress: handleRequestViewing,
            }
          : undefined;

        const buyNowAction = {
          label: t('product.buyNow'),
          onPress: () => {
            if (!requireAuth('purchase')) return;
            if (item) ProductAnalytics.checkoutStart(item.id);
            // Do not fire a success haptic before the purchase has
            // actually completed. "Buy now" navigates to checkout — it
            // does not complete the purchase. A medium impact acknowledges
            // the primary-action press; the success pattern belongs in the
            // Checkout confirmation flow.
            haptic.medium();
            navigation.navigate('Checkout', { itemId: item.id });
          },
        };

        const makeOfferAction = capabilities.canOffer
          ? {
              label: 'Make offer',
              onPress: () => {
                if (!requireAuth('purchase')) return;
                if (item) ProductAnalytics.offerStart(item.id);
                setMakeOfferVisible(true);
              },
            }
          : undefined;

        // Brokered assets: enquire + request viewing replace buy/offer.
        if (capabilities.commerceTier === 'brokered') {
          return (
            <CommerceDetailStateDock
              value={formattedPrice}
              originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
              thumbnailUri={item.images?.[0]}
              shippingHint={
                commerce.shippingPayer === 'seller'
                  ? 'Free shipping'
                  : commerce.shippingMethod
                    ? 'Shipping calculated at checkout'
                    : undefined
              }
              commerceTier="brokered"
              primaryAction={enquireAction}
              secondaryAction={requestViewingAction}
            />
          );
        }

        // Specialist items: buy now + enquire (for expert review questions).
        if (capabilities.commerceTier === 'specialist') {
          return (
            <CommerceDetailStateDock
              value={formattedPrice}
              originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
              thumbnailUri={item.images?.[0]}
              shippingHint={
                commerce.shippingPayer === 'seller'
                  ? 'Free shipping'
                  : commerce.shippingMethod
                    ? 'Shipping calculated at checkout'
                    : undefined
              }
              showProtectionStrip={commerce.protectionPolicy?.available ?? false}
              commerceTier="specialist"
              primaryAction={buyNowAction}
              secondaryAction={enquireAction}
            />
          );
        }

        // Authenticated luxury: buy now + make offer; authentication
        // note shows in the trust strip.
        if (capabilities.commerceTier === 'authenticated_luxury') {
          return (
            <CommerceDetailStateDock
              value={formattedPrice}
              originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
              thumbnailUri={item.images?.[0]}
              shippingHint={
                commerce.shippingPayer === 'seller'
                  ? 'Free shipping'
                  : commerce.shippingMethod
                    ? 'Shipping calculated at checkout'
                    : undefined
              }
              showProtectionStrip={commerce.protectionPolicy?.available ?? false}
              commerceTier="authenticated_luxury"
              primaryAction={buyNowAction}
              secondaryAction={makeOfferAction}
            />
          );
        }

        // Standard tier: existing buy now + make offer behaviour.
        return (
          <CommerceDetailStateDock
            value={formattedPrice}
            originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
            thumbnailUri={item.images?.[0]}
            shippingHint={
              commerce.shippingPayer === 'seller'
                ? 'Free shipping'
                : commerce.shippingMethod
                  ? 'Shipping calculated at checkout'
                  : undefined
            }
            showProtectionStrip={commerce.protectionPolicy?.available ?? false}
            commerceTier="standard"
            primaryAction={buyNowAction}
            secondaryAction={makeOfferAction}
          />
        );
      })()}

      <FullscreenMediaViewer
        images={item.images}
        initialIndex={fullscreenIndex}
        visible={fullscreenVisible}
        onActiveIndexChange={setFullscreenIndex}
        onClose={closeFullscreen}
      />

      <SaveToCollectionModal
        visible={collectionModalVisible}
        itemId={item.id}
        onClose={() => setCollectionModalVisible(false)}
      />

      <ShareSheet
        visible={shareVisible}
        onDismiss={setShareVisible}
        url={`https://thryftverse.com/item/${item.id}`}
        title={displayTitle}
        subtitle={item.brand ? `${item.brand} · ${formattedPrice}` : formattedPrice}
        imageUri={item.images?.[0]}
      />

      <SizeGuideSheet
        visible={sizeGuideVisible}
        category={item.category}
        currentSize={item.size}
        onClose={() => setSizeGuideVisible(false)}
      />

      <BottomSheet
        visible={purchaseDetailsVisible}
        onDismiss={() => setPurchaseDetailsVisible(false)}
        snapPoint={0.72}
      >
        <View style={[styles.purchaseSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <View>
            <Text style={[styles.purchaseSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
              Costs, delivery & protection
            </Text>
            <Text style={[styles.purchaseSheetSubtitle, { color: colors.textMuted }]} maxFontSizeMultiplier={1}>
              Confirmed terms for this listing
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => setPurchaseDetailsVisible(false)}
            style={styles.sheetCloseTarget}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Close costs, delivery and protection"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </AnimatedPressable>
        </View>
        <View style={styles.purchaseSheetBody}>
          {hasPrice ? (
            <CommerceDetailMetricRow label="Item price" value={formattedPrice} />
          ) : null}
          {commerce.buyerProtectionFee != null ? (
            <CommerceDetailMetricRow
              label="Buyer protection fee"
              value={formatFromFiat(commerce.buyerProtectionFee, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}
            />
          ) : null}
          <CommerceDetailMetricRow
            label="Shipping"
            value={
              commerce.shippingPayer === 'seller'
                ? 'Free'
                : 'Calculated at checkout'
            }
            muted={commerce.shippingPayer !== 'seller'}
          />
          {formattedProtectionTotal ? (
            <CommerceDetailMetricRow
              label="Estimated total"
              value={formattedProtectionTotal}
              subLabel={commerce.shippingPayer === 'seller' ? undefined : 'excl. shipping'}
              emphasis
              large
              separated
            />
          ) : null}
          <CommerceDetailMetricRow
            label="Delivery method"
            value={commerce.shippingMethod ?? 'Confirmed at checkout'}
            muted={!commerce.shippingMethod}
          />
          <CommerceDetailMetricRow
            label="Buyer protection"
            value={commerce.protectionPolicy?.available ? commerce.protectionPolicy.label : 'Not included'}
            subLabel={commerce.protectionPolicy?.summary ?? undefined}
          />
          <CommerceDetailMetricRow
            label="Returns"
            value={
              commerce.returnPolicy?.accepted
                ? commerce.returnPolicy.windowDays
                  ? `${commerce.returnPolicy.windowDays} days`
                  : 'Accepted'
                : 'Not accepted'
            }
          />
          {commerce.authenticity && commerce.authenticity.status !== 'not_offered' && (
            <CommerceDetailMetricRow
              label="Authenticity"
              value={commerce.authenticity.label ?? 'Eligible'}
            />
          )}
          <CommerceDetailMetricRow label="Payment" value="Thryftverse checkout" muted />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={qaSheetVisible}
        onDismiss={() => setQaSheetVisible(false)}
        snapPoint={0.7}
      >
        <View style={[styles.qaSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.qaSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
            Questions & answers
          </Text>
          <AnimatedPressable
            onPress={() => setQaSheetVisible(false)}
            hitSlop={12}
            style={styles.sheetCloseTarget}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Close questions and answers"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </AnimatedPressable>
        </View>
        <ListingQA
          listingId={item.id}
          currentUserName={currentUser?.username ?? 'You'}
          isSeller={item.seller?.id === currentUser?.id}
        />
      </BottomSheet>

      {/* Overflow sheet — lower-frequency hero actions (Fav, Report). */}
      <BottomSheet
        visible={overflowVisible}
        onDismiss={() => setOverflowVisible(false)}
        snapPoint={0.4}
      >
        <View style={[styles.overflowHeader, { borderColor: colors.border }]}>
          <Text style={[styles.overflowTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>More actions</Text>
        </View>
        <AnimatedPressable
          style={styles.overflowRow}
          scaleValue={0.98}
          hapticFeedback="light"
          onPress={() => {
            setOverflowVisible(false);
            handleShare();
          }}
          accessibilityRole="button"
          accessibilityLabel="Share listing"
        >
          <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>Share listing</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.overflowRow}
          scaleValue={0.98}
          hapticFeedback="light"
          onPress={() => {
            setOverflowVisible(false);
            handleToggleFav();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: isFav }}
          accessibilityLabel={isFav ? 'Remove from Saved' : 'Add to Saved'}
        >
          <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? colors.danger : colors.textPrimary} />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
            {isFav ? 'Remove from Saved' : 'Add to Saved'}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.overflowRow}
          scaleValue={0.98}
          hapticFeedback="light"
          onPress={() => {
            setOverflowVisible(false);
            navigation.navigate('Report', { type: 'item', targetId: item.id });
          }}
          accessibilityRole="button"
          accessibilityLabel="Report this listing"
        >
          <Ionicons name="flag-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.overflowRowText, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>Report listing</Text>
        </AnimatedPressable>
      </BottomSheet>

      <MakeOfferSheet
        visible={makeOfferVisible}
        onDismiss={() => setMakeOfferVisible(false)}
        listing={item ? {
          id: item.id,
          title: displayTitle,
          price: item.price ?? 0,
          image: item.images?.[0],
        } : null}
        sellerId={item?.seller?.id ?? null}
        onSent={(payload) => {
          setMakeOfferVisible(false);
          show('Offer sent', 'success');
          // Only navigate to Chat if the backend provisioned a real conversation.
          // If conversationId is null, the offer was created but no conversation
          // exists — stay on the detail screen rather than navigating to a dead route.
          if (payload.conversationId) {
            navigation.navigate('Chat', {
              conversationId: payload.conversationId,
              partnerUserId: payload.partnerUserId,
            });
          }
        }}
      />

      <BottomSheet
        visible={conditionInfoVisible}
        onDismiss={() => setConditionInfoVisible(false)}
        snapPoint={0.42}
      >
        <View style={styles.conditionSheetWrap}>
          <View style={styles.conditionSheetHeader}>
            <Text style={[styles.conditionSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
              Condition
            </Text>
            <AnimatedPressable
              onPress={() => setConditionInfoVisible(false)}
              style={styles.sheetCloseTarget}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityLabel="Close condition definition"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </AnimatedPressable>
          </View>
          <View style={styles.conditionSheetBody}>
            <View style={[styles.conditionSheetBadge, { backgroundColor: conditionMeta ? `${conditionMeta.color}14` : colors.surfaceAlt }]}>
              <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
              <Text style={[styles.conditionSheetBadgeText, { color: conditionMeta?.color ?? colors.textPrimary }]} maxFontSizeMultiplier={1}>
                {item.condition}
              </Text>
            </View>
            {conditionMeta ? (
              <Text style={[styles.conditionSheetDefinition, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
                {conditionMeta.definition}
              </Text>
            ) : null}
            {item.images && item.images.length > 1 ? (
              <AnimatedPressable
                style={styles.conditionEvidenceJump}
                scaleValue={0.98}
                hapticFeedback="light"
                onPress={() => {
                  setConditionInfoVisible(false);
                  // Jump to the last photo (detail/flaw shot per policy)
                  const evidenceIndex = item.images!.length - 1;
                  media.openViewer(evidenceIndex);
                }}
                accessibilityLabel="View condition evidence photos"
                accessibilityRole="button"
              >
                <Ionicons name="images-outline" size={18} color={colors.brand} />
                <Text style={[styles.conditionEvidenceJumpText, { color: colors.brand }]} maxFontSizeMultiplier={1}>
                  View condition photos
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.brand} />
              </AnimatedPressable>
            ) : null}
          </View>
        </View>
      </BottomSheet>
    </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  familyBadgeOverlay: {
    alignSelf: 'flex-start',
  },
  editorialIdentityChapter: {
    // Between-group spacing after full-bleed media. 16px (Space.md)
    // creates a deliberate chapter break without excessive white space.
    // The media is the product; the canvas is the author — the
    // transition should feel deliberate but not distant.
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  // ── First-viewport seller trust row ──
  // Sits on the flat canvas right after the media stage, before the
  // price identity chapter. Horizontal padding matches the identity
  // rhythm; no card surface — hairline-only separation per surface
  // budget. The row itself carries its own vertical padding.
  firstViewportSellerRow: {
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent', // overridden inline with theme color
  },
  // ── Attribute row ──
  // Rendered inside the identity's padding rhythm — no separate
  // horizontal padding. The negative top margin pulls it closer to
  // the identity block so it reads as part of the composition.
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginTop: 0,
    paddingBottom: Space.sm,
  },
  attributeLeftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 1,
  },
  // Condition chip — condition gets a distinct visual treatment
  // (small surface-alt pill) instead of blending into muted text.
  // It's the most important attribute for second-hand buyers.
  // Compact contained control, 32px visible chrome inside 44px hit
  // target. paddingVertical 5 gives a 26px visible height with 12px
  // caption text — premium pill proportion.
  conditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.standard,
    borderColor: 'transparent', // overridden inline with theme color
    flexShrink: 0,
  },
  conditionDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: (Space.xs + 2) / 2,
    flexShrink: 0,
  },
  conditionChipText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  attributeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  sizeGuideLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    flexShrink: 0,
  },
  quietTextTarget: {
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  izeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // ── Social proof inline ──
  // Quiet trailing element inside the attribute row's left cluster.
  // Muted, single line, prefixed with "·" so it reads as a continuation
  // of the attribute line rather than a separate metadata fragment.
  socialProofInline: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 1,
  },
  // ── Trust facts (flat rows with hairline separators) ──
  // Flat rows, no chips, no cards. Each row is one fact with icon +
  // label, separated by hairlines. Flat canvas + hairlines are the
  // default utility structure.
  trustFactsSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  trustFactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    minHeight: Control.hit,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent', // overridden inline with theme color
  },
  trustFactDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: (Space.xs + 2) / 2,
    flexShrink: 0,
  },
  trustFactText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  // ── Seller row ──
  // The seller row is a distinct group from the identity chapter.
  // paddingVertical Space.md (16px) gives proper breathing room for
  // avatar + name + rating + actions. The hairline top border separates
  // it from the identity chapter without adding a card surface.
  // No padding here — SellerInfoCard handles its own internal padding.
  // This avoids double-padding that would push content inward.
  sellerTrustSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent', // overridden inline with theme color
  },
  // ── More from this seller rail ──
  // Bottom hairline closes the seller section before the purchase
  // details section below — flat canvas + hairlines.
  moreFromSellerRailWrap: {
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent', // overridden inline with theme color
  },
  moreFromSellerRailTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  railContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  railCardWrap: {
    width: 160,
  },
  // ── Purchase details ──
  purchaseSheetHeader: {
    minHeight: Space.md * 4,
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  purchaseSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  purchaseSheetSubtitle: {
    marginTop: Space.xs / 2,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
  },
  purchaseSheetBody: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  sheetCloseTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Description ──
  // Tighter gap (Space.xs) so the "Read more" toggle reads as part of
  // the description block, not a disconnected separate element.
  descriptionWrap: {
    gap: Space.xs,
    paddingBottom: Space.sm,
  },
  // Gradient fade overlay at the bottom of collapsed description text.
  // Visual signal that there's more content below — replaces the bare
  // text link that buyers often miss.
  descriptionFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Space.lg + Space.xs,
  },
  // Description text — 14px body with 26px line height (body + sm)
  // for generous scannability. Per 2026 PDP research: description copy
  // should be readable, not cramped. The extra 2px over the former
  // 24px line height gives each line breathing room without making
  // the block feel airy.
  descriptionText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + Space.sm,
    fontFamily: FontFamily.regular,
  },
  descriptionToggle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    alignSelf: 'flex-start',
    paddingTop: Space.xs,
  },
  postedDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    paddingTop: Space.xs,
    fontVariant: ['tabular-nums'],
  },
  // ── Price insight alert row ──
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  alertRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  alertRowLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
  },
  toggleTrack: {
    width: Control.chrome,
    height: Space.md + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    paddingHorizontal: Space.xs / 2,
  },
  toggleThumb: {
    width: Space.md - 2,
    height: Space.md - 2,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  // ── Sync retry ──
  syncRetryWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  // ── More like this grid ──
  // Discovery density: at least two meaningful media objects.
  // 2-column grid with gap Space.sm (8px) between cards.
  // Card internal gap 4px for text breathing room below image.
  moreLikeThisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  moreLikeThisCard: {
    flex: 1,
    minWidth: '47%',
    maxWidth: '49%',
    gap: Space.xs,
  },
  moreLikeThisImage: {
    width: '100%',
    aspectRatio: AspectRatio.portrait,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLikeThisPrice: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
    marginTop: Space.xs / 2,
  },
  moreLikeThisTitle: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
  },
  moreLikeThisMeta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  // ── Discovery ──
  recErrorRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  qaSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  qaSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
  },
  // ── Dock state badge ──
  dockStateBadge: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: LetterSpacing.normal,
  },
  // ── Overflow sheet (rendered inside canonical BottomSheet) ──
  overflowHeader: {
    paddingBottom: Space.sm,
    marginBottom: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overflowTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    minHeight: Control.hit + Space.xs,
  },
  overflowRowText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
  },
  // ── Condition definition sheet ──
  conditionSheetWrap: {
    paddingBottom: Space.md,
  },
  conditionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm,
  },
  conditionSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  conditionSheetBody: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.md,
  },
  conditionSheetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: RadiusRoleValue.sheetDialog,
  },
  conditionSheetBadgeText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  conditionSheetDefinition: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + Space.xs,
    fontFamily: FontFamily.regular,
  },
  // ── Condition evidence gallery jump ──
  conditionEvidenceJump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  conditionEvidenceJumpText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
});
