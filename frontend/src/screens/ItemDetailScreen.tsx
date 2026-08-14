import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  useWindowDimensions,
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
  type SharedValue,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../theme/ThemeContext';
import type { Listing } from '../services/listingsApi';
import type { DisplayReadyListing } from '../services/listingMapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { createDmConversationOnApi } from '../services/chatApi';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { enablePriceAlert, disablePriceAlert, getPriceAlertStatus } from '../services/priceAlertsApi';
import { toIze, formatIzeAmount } from '../utils/currency';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { ImageEmptyGraphic } from '../components/ImageEmptyGraphic';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { BottomSheet } from '../components/BottomSheet';
import { SellerTrustBadge } from '../components/seller/SellerTrustBadge';
import { HorizontalRail } from '../components/HorizontalRail';
import { ProductCardV2 } from '../components/ProductCardV2';
import type { Listing as CatalogListing } from '../data/mockData';

import {
  ProductDescription,
  RecommendationRail,
  ProductDetailSkeleton,
  FullscreenMediaViewer,
  ProductFamilyBadge,
  SizeGuideSheet,
  BundleUpsellRow,
  ListingQA,
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
  COMMERCE_DETAIL_COMPACT_WIDTH,
  SellerInfoCard,
  ShippingReturnsInfo,
  MakeOfferSheet,
} from '../components/commerce/detail';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';
import {
  useListingDetail,
  useListingPriceHistory,
  useListingQaSummary,
  useListingSoldComparables,
  useRecommendations,
  useContinueExploring,
  useSellerTrust,
  useSellerFollow,
  ProductAnalytics,
  setProductAnalyticsHandler,
  setProductSessionId,
  buildCommerceContext,
  buildSellerTrustSummary,
  buildCapabilities,
  isRecommendationLook,
} from '../platform/product';
import { trackTelemetryEvent } from '../lib/telemetry';
import { Space, FontFamily, DockConstants, Control, AspectRatio, Stroke, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { t } from '../i18n';

type ItemDetailRoute = RouteProp<RootStackParamList, 'ItemDetail'>;
type ItemDetailNav = NativeStackNavigationProp<RootStackParamList>;

// ───────────────────────────────────────────────────────────────────────────
// Image pagination dots — iOS Photos pattern.
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
  counterText: string;
  color: string;
}) {
  return (
    <View style={paginationStyles.wrap}>
      <View style={paginationStyles.dotRow}>
        {Array.from({ length: count }, (_, i) => (
          <PaginationDot
            key={i}
            index={i}
            activeIndex={activeIndex}
            color={color}
          />
        ))}
      </View>
      <Text style={[paginationStyles.counter, { color }]} numberOfLines={1}>
        {counterText}
      </Text>
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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompactScreen = screenWidth < COMMERCE_DETAIL_COMPACT_WIDTH;
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [priceAlertEnabled, setPriceAlertEnabled] = useState(false);
  const [priceAlertLoading, setPriceAlertLoading] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [sizeGuideVisible, setSizeGuideVisible] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [qaSheetVisible, setQaSheetVisible] = useState(false);
  const [purchaseDetailsVisible, setPurchaseDetailsVisible] = useState(false);
  const [overflowVisible, setOverflowVisible] = useState(false);
  const [makeOfferVisible, setMakeOfferVisible] = useState(false);
  const [conditionInfoVisible, setConditionInfoVisible] = useState(false);

  const isItemSavedAnywhere = useStore((state) => state.isItemSavedAnywhere);
  const isFav = useStore((state) => state.isWishlisted(route.params?.itemId));
  const toggleFav = useStore((state) => state.toggleWishlist);
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const [isResolvingConversation, setIsResolvingConversation] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { isSyncing, lastError, refreshListings, listings: backendListings } = useBackendData();

  const { itemId } = route.params || {};

  const {
    data: queryData,
    isLoading: queryLoading,
    isError: queryError,
    refetch: refetchListing,
  } = useListingDetail(itemId);

  const {
    data: recommendationsData,
    isError: recsError,
  } = useRecommendations(itemId);
  const {
    data: exploreData,
    fetchNextPage: exploreNextPage,
    hasNextPage: exploreHasNextPage,
    isFetchingNextPage: exploreFetching,
  } = useContinueExploring(itemId);
  const { data: soldComps } = useListingSoldComparables(itemId);
  const { data: priceHistory = [] } = useListingPriceHistory(itemId);
  const { data: qaSummary } = useListingQaSummary(itemId);

  const item = queryData?.listing ?? null;
  const serverCommerce = queryData?.commerce ?? null;

  // Fetch initial price alert status from backend
  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    getPriceAlertStatus(item.id)
      .then((enabled) => { if (!cancelled) setPriceAlertEnabled(enabled); })
      .catch(() => { /* endpoint may not exist yet — default to off */ });
    return () => { cancelled = true; };
  }, [item?.id]);

  const { data: sellerTrustData } = useSellerTrust(item?.sellerId ?? undefined);
  const sellerFollowMutation = useSellerFollow(item?.sellerId ?? undefined);

  useEffect(() => {
    setProductAnalyticsHandler((event) => {
      trackTelemetryEvent(event.event, {
        listingId: event.listingId,
        sectionKey: event.sectionKey,
        position: event.position,
        reasonCode: event.reasonCode,
        personalised: event.personalised,
        sessionId: event.sessionId,
      });
    });
    const session = `item_${itemId}_${Date.now()}`;
    setProductSessionId(session);
    return () => {
      setProductAnalyticsHandler(() => {});
    };
  }, [itemId]);

  useEffect(() => {
    if (item) {
      ProductAnalytics.itemView(item.id);
    }
  }, [item?.id]);

  const { formatFromFiat, goldRates, displayMode } = useFormattedPrice();
  const { show } = useToast();
  const haptic = useHaptic();

  const handleTogglePriceAlert = useCallback(async () => {
    if (!item?.id || priceAlertLoading) return;
    const next = !priceAlertEnabled;
    setPriceAlertLoading(true);
    setPriceAlertEnabled(next);
    try {
      if (next) {
        await enablePriceAlert(item.id);
        show('Price drop alerts enabled for this item', 'success');
      } else {
        await disablePriceAlert(item.id);
        show('Price drop alerts disabled', 'info');
      }
    } catch {
      setPriceAlertEnabled(!next);
      show('Could not update price alert. Try again.', 'error');
    } finally {
      setPriceAlertLoading(false);
    }
  }, [item?.id, priceAlertEnabled, priceAlertLoading, show]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // ── Image pagination ──
  // Spring-driven active index. The integer page comes from the media
  // stage's onViewableItemsChanged; we spring the float so each dot's
  // width interpolates smoothly (iOS Photos pill-stretch pattern).
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
            dragY.value = withTiming(screenHeight, { duration: 220 });
            dismissScale.value = withTiming(0.85, { duration: 220 });
            chromeOpacity.value = withTiming(0, { duration: 160 });
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

  const handleDoubleTap = () => {
    haptic.heavy();
    if (item && !isFav) {
      toggleFav(item.id);
      show('Added to wishlist', 'success');
    }
    if (reducedMotion) {
      bigHeartOpacity.value = 0;
      bigHeartScale.value = 0;
      return;
    }
    bigHeartOpacity.value = 1;
    bigHeartScale.value = withSequence(
      withTiming(1.4, { duration: 180 }),
      withTiming(1.4, { duration: 400 }),
      withTiming(0, { duration: 200 })
    );
  };

  const handleToggleFav = () => {
    if (!item) return;
    toggleFav(item.id);
    ProductAnalytics.itemSave(item.id);
    if (!isFav) {
      show('Added to wishlist', 'success');
    }
  };

  // Pull-to-refresh — refetches the listing and backend data in parallel.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        refetchListing(),
        refreshListings(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchListing, refreshListings]);

  const handleShare = () => {
    setShareVisible(true);
    if (item) ProductAnalytics.itemShare(item.id);
  };

  const handleOpenFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenVisible(true);
    if (item) ProductAnalytics.mediaZoom(item.id);
  };

  // Prefetch the next discovery surface even though the current detail page
  // intentionally stays within its three-module content budget. Keeping this
  // data warm preserves the planned continuation flow without adding another
  // competing rail to the page today.
  const exploreItems: Listing[] = useMemo(() => {
    const items: Listing[] = [];
    for (const page of exploreData?.pages ?? []) {
      const section = page.sections.find((candidate) => candidate.key === 'continue_exploring');
      if (!section) continue;
      for (const recommendation of section.items) {
        if (!isRecommendationLook(recommendation)) items.push(recommendation);
      }
    }
    return items;
  }, [exploreData]);

  // These values are consumed by the planned continuation surface. Retaining
  // them here ensures pagination state remains available when that route lands.
  void exploreItems;
  void exploreNextPage;
  void exploreHasNextPage;
  void exploreFetching;

  const listingEngagement = item?.engagement ?? null;

  // Seller trust summary — moved before conditional returns so the
  // moreFromSellerRailItems useMemo can reference it (Rules of Hooks).
  const seller = sellerTrustData
    ? sellerTrustData
    : item
      ? buildSellerTrustSummary(item.seller)
      : null;

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

  if (queryLoading && !item) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ProductDetailSkeleton />
      </View>
    );
  }

  if (queryError && !item) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CommerceStateCanvas
          state="error"
          onRetry={() => refetchListing()}
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
    ? formatFromFiat(item.price!, 'GBP', { displayMode: 'fiat' })
    : 'Price unavailable';
  const formattedOriginal = hasDiscount
    ? formatFromFiat(item.originalPrice!, 'GBP', { displayMode: 'fiat' })
    : null;
  const discountPercent = hasDiscount && item.originalPrice
    ? ((item.originalPrice - item.price!) / item.originalPrice) * 100
    : null;
  const formattedProtectionTotal = serverCommerce?.estimatedTotal != null
    ? formatFromFiat(serverCommerce.estimatedTotal, 'GBP', { displayMode: 'fiat' })
    : null;
  const priceIzeText = hasPrice && goldRates && displayMode !== 'fiat'
    ? formatIzeAmount(toIze(item.price!, 'GBP', goldRates))
    : null;

  const capabilities = buildCapabilities(item, currentUser?.id);
  const commerce = buildCommerceContext(item, serverCommerce ? {
    buyerProtectionFee: serverCommerce.buyerProtectionFee,
    estimatedTotal: serverCommerce.estimatedTotal,
    shippingMethod: serverCommerce.shippingMethod,
    shippingPayer: (serverCommerce.shippingPayer as 'buyer' | 'seller' | null) ?? null,
    protectionPolicy: serverCommerce.protectionPolicy,
    returnPolicy: serverCommerce.returnPolicy,
    authenticity: serverCommerce.authenticity,
  } : undefined);
  const recommendationSections = recommendationsData?.sections ?? [];

  // Bundle upsell: items from the same seller (more_from_seller section)
  const moreFromSellerSection = recommendationSections.find((s) => s.key === 'more_from_seller');
  const bundleItems: DisplayReadyListing[] = moreFromSellerSection
    ? moreFromSellerSection.items.filter(
        (i): i is DisplayReadyListing => !isRecommendationLook(i)
      )
    : [];

  const handlePressRecommendation = (recItem: Listing) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
  };

  const interestSignal = (() => {
    if (item.likes && item.likes > 0) return `${item.likes} like${item.likes > 1 ? 's' : ''}`;
    return undefined;
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

  const familyStateAccent = item.isSold ? 'Sold' : null;

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
    <Reanimated.View style={[styles.container, { backgroundColor: colors.background }, dismissContainerStyle]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── Collapsed scrolling header ──
          Quiet glyph hit targets, no large rounded-square containers.
          Spec 02 shape system: separate hit area from visible shape.
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
          onPress: handleShare,
        }}
      />
      </Reanimated.View>

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        accessibilityElementsHidden={collectionModalVisible || shareVisible || fullscreenVisible || sizeGuideVisible || qaSheetVisible || purchaseDetailsVisible || overflowVisible || makeOfferVisible || conditionInfoVisible}
        importantForAccessibility={collectionModalVisible || shareVisible || fullscreenVisible || sizeGuideVisible || qaSheetVisible || purchaseDetailsVisible || overflowVisible || makeOfferVisible || conditionInfoVisible ? 'no-hide-descendants' : 'auto'}
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
            (Back, Share, Save) + overflow (Fav, Watch, Report).
            Spec 02 §A + spec 05 §1. */}
        <CommerceMediaStage
          images={item.images}
          objectId={item.id}
          isFav={isFav}
          isSaved={isItemSavedAnywhere(item.id)}
          isSold={!!item.isSold}
          topInset={insets.top}
          scrollY={scrollY}
          onBack={() => navigation.goBack()}
          onShare={handleShare}
          onSave={() => { haptic.patterns.save(); setCollectionModalVisible(true); }}
          onToggleFav={handleToggleFav}
          onDoubleTap={handleDoubleTap}
          onZoomStart={() => { if (item) ProductAnalytics.mediaZoom(item.id); }}
          onOpenFullscreen={handleOpenFullscreen}
          heightFraction={isCompactScreen ? 0.54 : 0.58}
          initialIndex={fullscreenIndex}
          onActiveIndexChange={(index) => {
            setFullscreenIndex(index);
            paginationIndex.value = reducedMotion
              ? index
              : withSpring(index, spring.tap);
          }}
          bigHeartOpacity={bigHeartOpacity}
          bigHeartScale={bigHeartScale}
          showDefaultControls={false}
          showPageIndicator={false}
          overlayTopContent={
            <View style={styles.familyBadgeOverlay}>
              <ProductFamilyBadge
                family="direct"
                stateAccent={familyStateAccent}
                compact
              />
            </View>
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

        {/* ── Image pagination — iOS Photos pattern ──
            A row of dots below the carousel; the active dot stretches
            into a pill (6pt → 20pt) driven by a single spring. A "1 of N"
            counter sits beside the dots for precise orientation. Only
            rendered when there is more than one image. */}
        {item.images && item.images.length > 1 && (
          <PaginationDots
            count={item.images.length}
            activeIndex={paginationIndex}
            counterText={`${fullscreenIndex + 1} of ${item.images.length}`}
            color={colors.textSecondary}
          />
        )}

        <CommerceDetailOfflineBanner isOffline={isOffline} />

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
            eyebrow={item.brand ?? item.category ?? 'Direct listing'}
            title={displayTitle}
            primaryValue={formattedPrice}
            originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
            discountBadge={hasDiscount && discountPercent ? `-${Math.round(discountPercent)}%` : undefined}
            secondaryLine={secondaryLine}
            interestSignal={interestSignal}
          />

          {attributeLine ? (
            <View style={styles.attributeRow}>
              <View style={styles.attributeLeftCluster}>
                {/* Condition chip — Vinted pattern: condition is the
                    most important attribute for second-hand buyers, so
                    it gets a distinct visual treatment instead of
                    blending into muted text. */}
                {item.condition ? (
                  <Pressable
                    onPress={() => { haptic.light(); setConditionInfoVisible(true); }}
                    hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                    style={[
                      styles.conditionChip,
                      {
                        borderColor: conditionMeta ? `${conditionMeta.color}66` : colors.borderSubtle,
                        backgroundColor: conditionMeta ? `${conditionMeta.color}14` : 'transparent',
                      },
                    ]}
                    accessibilityLabel={`Condition: ${item.condition}. Tap for definition.`}
                    accessibilityRole="button"
                  >
                    <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
                    <Text style={[styles.conditionChipText, { color: colors.textPrimary }]}>
                      {item.condition}
                    </Text>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                  </Pressable>
                ) : null}
                {(() => {
                  const remaining = [
                    item.size && `Size ${item.size}`,
                    item.category,
                  ].filter(Boolean).join(' · ');
                  return remaining ? (
                    <Text style={[styles.attributeText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {remaining}
                    </Text>
                  ) : null;
                })()}
              </View>
              {item.size && (
                <Pressable
                  onPress={() => { haptic.light(); setSizeGuideVisible(true); }}
                  hitSlop={8}
                  style={styles.quietTextTarget}
                  accessibilityLabel="View size guide"
                  accessibilityRole="button"
                >
                  <Text style={[styles.sizeGuideLink, { color: colors.brand }]}>
                    Size guide
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {priceIzeText ? (
            <Text style={[styles.izeText, { color: colors.textSecondary }]} numberOfLines={1}>
              {priceIzeText}
            </Text>
          ) : null}
        </View>

        {(() => {
          const trustChips: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [];
          if (commerce.shippingMethod) {
            trustChips.push({
              icon: commerce.shippingPayer === 'seller' ? 'gift-outline' : 'cube-outline',
              label: commerce.shippingPayer === 'seller'
                ? `Free ${commerce.shippingMethod}`
                : commerce.shippingMethod,
            });
          }
          if (commerce.protectionPolicy?.available) {
            trustChips.push({
              icon: 'shield-checkmark-outline',
              label: commerce.protectionPolicy.label ?? 'Buyer protection',
            });
          }
          if (commerce.returnPolicy?.accepted) {
            trustChips.push({
              icon: 'return-up-back-outline',
              label: commerce.returnPolicy.windowDays
                ? `${commerce.returnPolicy.windowDays}-day returns`
                : 'Returns accepted',
            });
          }
          if (commerce.authenticity && commerce.authenticity.status !== 'not_offered') {
            trustChips.push({
              icon: 'ribbon-outline',
              label: commerce.authenticity.label ?? (commerce.authenticity.status === 'verified' ? 'Verified' : 'Authentic'),
            });
          }
          if (trustChips.length === 0) return null;
          // Show at most 3 chips in the elevated strip — the rest are
          // available in the full "Buying this item" section below.
          const elevated = trustChips.slice(0, 3);
          return (
            <View style={styles.elevatedTrustStrip}>
              {elevated.map((chip, i) => (
                <View key={i} style={styles.trustChip}>
                  <Ionicons name={chip.icon} size={16} color={colors.textSecondary} />
                  <Text style={[styles.trustChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {chip.label}
                  </Text>
                </View>
              ))}
            </View>
          );
        })()}

        {seller && (
          <View style={[styles.sellerTrustSection, { borderTopColor: colors.borderSubtle }]}>
            <SellerInfoCard
              seller={seller}
              isOwner={capabilities.isOwner}
              isFollowing={sellerTrustData?.isFollowing ?? false}
              isFollowPending={sellerFollowMutation.isPending}
              onFollow={() => {
                if (!currentUser?.id) {
                  show('Sign in to follow this seller.', 'error');
                  return;
                }
                sellerFollowMutation.mutate(undefined, {
                  onSuccess: (data) => {
                    show(data.isFollowing ? 'Followed seller' : 'Unfollowed seller', 'success');
                  },
                  onError: () => {
                    show('Could not follow seller. Try again.', 'error');
                  },
                });
              }}
              onMessage={async () => {
                if (!currentUser?.id) {
                  show('Sign in to message the seller.', 'error');
                  return;
                }
                if (isResolvingConversation) return;
                if (item) ProductAnalytics.sellerMessageStart(item.id);
                setIsResolvingConversation(true);
                try {
                  const conversation = await createDmConversationOnApi({
                    recipientUserId: seller.id,
                    itemId: item.id,
                  });
                  upsertConversation(conversation);
                  navigation.navigate('Chat', {
                    conversationId: conversation.id,
                    partnerUserId: seller.id,
                  });
                } catch {
                  show('Could not start conversation. Try again.', 'error');
                } finally {
                  setIsResolvingConversation(false);
                }
              }}
              onViewShop={() => {
                if (item) ProductAnalytics.sellerProfileOpen(item.id, seller.id);
                openProfile(navigation, seller.id, currentUser?.id);
              }}
            />
            <View style={styles.sellerVerificationRow}>
              <SellerTrustBadge seller={seller} limit={2} />
            </View>
          </View>
        )}

        {/* ── More from this seller ──
            Horizontal browse rail of other live listings from the same
            seller. Contextual to the seller section — closes it with a
            bottom hairline. Only rendered when there are at least 2 real
            items. Uses ProductCardV2 inside HorizontalRail so cards match
            discovery surfaces. Distinct from the Bundle upsell discovery
            module in the tail (which incentivises multi-item purchase). */}
        {seller && moreFromSellerRailItems.length >= 2 ? (
          <View style={[styles.moreFromSellerRailWrap, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.moreFromSellerRailTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              More from {seller.username ?? 'this seller'}
            </Text>
            <HorizontalRail
              contentContainerStyle={styles.railContent}
              accessibilityLabel={`More from ${seller.username ?? 'this seller'}`}
            >
              {moreFromSellerRailItems.map((railItem) => (
                <View key={railItem.id} style={styles.railCardWrap}>
                  <ProductCardV2
                    item={railItem as unknown as CatalogListing}
                    onPress={() => handlePressRecommendation(railItem)}
                    showSaveButton={false}
                    enableEntranceAnimation={false}
                    visualOnly
                  />
                </View>
              ))}
            </HorizontalRail>
          </View>
        ) : null}

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
              carbonNeutral={commerce.shippingPayer === 'seller'}
            />
          </CommerceDetailSection>
        ) : null}

        {/* ── Zone E — Product details ──
            Description + condition + category evidence + posted date.
            Spec 05 §5. */}
        <CommerceDetailSection label="Item details" divider variant="editorial">
          {item.description ? (
            <View style={styles.descriptionWrap}>
              {/* Full-area tap target — the entire collapsed text is
                  tappable, not just the "Read more" link. Research
                  (Vestiaire): "buyers very often do not notice that
                  description can be expanded by clicking 'see more'". */}
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
                  numberOfLines={descriptionExpanded ? undefined : 4}
                >
                  {item.description}
                </Text>
                {/* Gradient fade at the collapse edge when collapsed.
                    Visual signal that there's more content below. */}
                {!descriptionExpanded && item.description.length > 120 && (
                  <LinearGradient
                    colors={[`${colors.background}00`, colors.background]}
                    style={styles.descriptionFade}
                    pointerEvents="none"
                  />
                )}
              </Pressable>
              {item.description.length > 120 && (
                <Pressable
                  onPress={() => setDescriptionExpanded((prev) => !prev)}
                  hitSlop={8}
                  style={styles.quietTextTarget}
                  accessibilityLabel={descriptionExpanded ? 'Show less' : 'Read more'}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: descriptionExpanded }}
                >
                  <Text style={[styles.descriptionToggle, { color: colors.textSecondary }]}>
                    {descriptionExpanded ? 'Show less' : 'Read more'}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {(() => {
            const evidenceGroups = resolveEvidenceGroups({
              category: item.category,
              subcategory: item.subcategory,
              brand: item.brand,
              size: item.size,
              condition: item.condition,
              description: item.description,
            });
            return evidenceGroups.length > 0 ? (
              <CategoryEvidence groups={evidenceGroups} />
            ) : null;
          })()}

          {item.createdAt ? (
            <Text style={[styles.postedDate, { color: colors.textMuted }]} numberOfLines={1}>
              Posted {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          ) : null}
        </CommerceDetailSection>

        {/* ── Zone F — Pricing ──
            Only render facts that are genuinely supported. No fabricated
            history. Spec 05 §6. */}
        {priceInsightRows.length > 0 ? (
          <CommerceDetailSection label="Pricing" divider variant="editorial">
            {priceInsightRows.map((row) => (
              <CommerceDetailMetricRow
                key={row.label}
                label={row.label}
                value={row.value}
                muted={row.muted}
              />
            ))}
            {hasDiscount && discountPercent && discountPercent > 0 ? (
              <Pressable
                onPress={handleTogglePriceAlert}
                disabled={priceAlertLoading}
                style={({ pressed }) => [styles.alertRow, pressed && styles.pressed]}
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
                  <Text style={[styles.alertRowLabel, { color: colors.textSecondary }]}>
                    Price drop alerts
                  </Text>
                </View>
                <View style={[styles.toggleTrack, { borderColor: priceAlertEnabled ? colors.brand : colors.border, backgroundColor: priceAlertEnabled ? `${colors.brand}20` : colors.surfaceAlt }]}>
                  <View style={[styles.toggleThumb, { backgroundColor: priceAlertEnabled ? colors.brand : colors.textMuted, alignSelf: priceAlertEnabled ? 'flex-end' : 'flex-start' }]} />
                </View>
              </Pressable>
            ) : null}
          </CommerceDetailSection>
        ) : null}

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
            to category, then to the generic label. Curation cue per
            spec 04_DIRECT §4. */}
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
                  {visualSimilar.map((simItem) => (
                    <Pressable
                      key={simItem.id}
                      style={({ pressed }) => [styles.moreLikeThisCard, pressed && styles.pressed]}
                      onPress={() => handlePressRecommendation(simItem)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${simItem.title}`}
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
                      <Text style={[styles.moreLikeThisTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                        {simItem.title}
                      </Text>
                      {(simItem.brand || simItem.condition) && (
                        <Text style={[styles.moreLikeThisMeta, { color: colors.textMuted }]} numberOfLines={1}>
                          {[simItem.brand, simItem.condition].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      <Text style={[styles.moreLikeThisPrice, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {formatFromFiat(simItem.price, 'GBP', { displayMode: 'fiat' })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </CommerceDetailSection>
          );
        })()}

        {recsError && recommendationSections.length === 0 && (
          <View style={styles.recErrorRow}>
            <CommerceDetailUnavailableInline
              title="Recommendations unavailable"
              body="Recommendations are temporarily unavailable."
            />
          </View>
        )}
      </Reanimated.ScrollView>

      {/* ── Zone I — Sticky action dock ──
          Buyer: price + Buy now + Make offer.
          Seller: Manage listing.
          Sold/unavailable: factual state + one next action.
          Spec 05 §9. */}
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
                <Text style={[styles.dockStateBadge, { color: colors.success }]}>
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
                <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]}>
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

        return (
          <CommerceDetailStateDock
            value={formattedPrice}
            thumbnailUri={item.images?.[0]}
            shippingHint={
              commerce.shippingPayer === 'seller'
                ? 'Free shipping'
                : commerce.shippingMethod
                  ? 'Shipping calculated at checkout'
                  : undefined
            }
            showProtectionStrip={commerce.protectionPolicy?.available ?? false}
            primaryAction={{
              label: t('product.buyNow'),
              onPress: () => {
                if (item) ProductAnalytics.checkoutStart(item.id);
                // Per AGENTS.md §11: do not fire a success haptic before the
                // purchase has actually completed. "Buy now" navigates to
                // checkout — it does not complete the purchase. A medium
                // impact acknowledges the primary-action press; the success
                // pattern belongs in the Checkout confirmation flow.
                haptic.medium();
                navigation.navigate('Checkout', { itemId: item.id });
              },
            }}
            secondaryAction={
              capabilities.canOffer
                ? {
                    label: 'Make offer',
                    onPress: () => {
                      if (item) ProductAnalytics.offerStart(item.id);
                      setMakeOfferVisible(true);
                    },
                  }
                : undefined
            }
          />
        );
      })()}

      <FullscreenMediaViewer
        images={item.images}
        initialIndex={fullscreenIndex}
        visible={fullscreenVisible}
        onActiveIndexChange={setFullscreenIndex}
        onClose={() => setFullscreenVisible(false)}
      />

      <SaveToCollectionModal
        visible={collectionModalVisible}
        itemId={item.id}
        onClose={() => setCollectionModalVisible(false)}
      />

      <ShareSheet
        visible={shareVisible}
        onDismiss={() => setShareVisible(false)}
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
            <Text style={[styles.purchaseSheetTitle, { color: colors.textPrimary }]}>
              Costs, delivery & protection
            </Text>
            <Text style={[styles.purchaseSheetSubtitle, { color: colors.textMuted }]}>
              Confirmed terms for this listing
            </Text>
          </View>
          <Pressable
            onPress={() => setPurchaseDetailsVisible(false)}
            style={styles.sheetCloseTarget}
            accessibilityLabel="Close costs, delivery and protection"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.purchaseSheetBody}>
          {hasPrice ? (
            <CommerceDetailMetricRow label="Item price" value={formattedPrice} />
          ) : null}
          {commerce.buyerProtectionFee != null ? (
            <CommerceDetailMetricRow
              label="Buyer protection fee"
              value={formatFromFiat(commerce.buyerProtectionFee, 'GBP', { displayMode: 'fiat' })}
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
          <Text style={[styles.qaSheetTitle, { color: colors.textPrimary }]}>
            Questions & answers
          </Text>
          <Pressable
            onPress={() => setQaSheetVisible(false)}
            hitSlop={12}
            style={styles.sheetCloseTarget}
            accessibilityLabel="Close questions and answers"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
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
          <Text style={[styles.overflowTitle, { color: colors.textPrimary }]}>More actions</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
          onPress={() => {
            setOverflowVisible(false);
            handleShare();
          }}
          accessibilityRole="button"
          accessibilityLabel="Share listing"
        >
          <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>Share listing</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
          onPress={() => {
            setOverflowVisible(false);
            handleToggleFav();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: isFav }}
          accessibilityLabel={isFav ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? colors.danger : colors.textPrimary} />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>
            {isFav ? 'Remove from wishlist' : 'Add to wishlist'}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
          onPress={() => {
            setOverflowVisible(false);
            navigation.navigate('Report', { type: 'item', targetId: item.id });
          }}
          accessibilityRole="button"
          accessibilityLabel="Report this listing"
        >
          <Ionicons name="flag-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.overflowRowText, { color: colors.textSecondary }]}>Report listing</Text>
        </Pressable>
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
            <Text style={[styles.conditionSheetTitle, { color: colors.textPrimary }]}>
              Condition
            </Text>
            <Pressable
              onPress={() => setConditionInfoVisible(false)}
              style={styles.sheetCloseTarget}
              accessibilityLabel="Close condition definition"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.conditionSheetBody}>
            <View style={[styles.conditionSheetBadge, { backgroundColor: conditionMeta ? `${conditionMeta.color}1F` : colors.surfaceAlt }]}>
              <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
              <Text style={[styles.conditionSheetBadgeText, { color: conditionMeta?.color ?? colors.textPrimary }]}>
                {item.condition}
              </Text>
            </View>
            {conditionMeta ? (
              <Text style={[styles.conditionSheetDefinition, { color: colors.textSecondary }]}>
                {conditionMeta.definition}
              </Text>
            ) : null}
            {item.images && item.images.length > 1 ? (
              <Pressable
                style={({ pressed }) => [styles.conditionEvidenceJump, pressed && styles.pressed]}
                onPress={() => {
                  setConditionInfoVisible(false);
                  // Jump to the last photo (detail/flaw shot per policy)
                  const evidenceIndex = item.images!.length - 1;
                  setFullscreenIndex(evidenceIndex);
                  setFullscreenVisible(true);
                  haptic.light();
                }}
                accessibilityLabel="View condition evidence photos"
                accessibilityRole="button"
              >
                <Ionicons name="images-outline" size={18} color={colors.brand} />
                <Text style={[styles.conditionEvidenceJumpText, { color: colors.brand }]}>
                  View condition photos
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.brand} />
              </Pressable>
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
    // Per Design.md spacing rhythm: between-group spacing after
    // full-bleed media. 16px (Space.md) creates a deliberate chapter
    // break without excessive white space. The media is the product;
    // the canvas is the author — the transition should feel deliberate
    // but not distant.
    paddingTop: Space.md,
    paddingBottom: Space.sm,
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
  // Condition chip — Vinted pattern: condition gets a distinct visual
  // treatment (small surface-alt pill) instead of blending into muted
  // text. It's the most important attribute for second-hand buyers.
  // Per Design.md: compact contained control, 32px visible chrome
  // inside 44px hit target. paddingVertical 5 gives a 26px visible
  // height with 12px caption text — premium pill proportion.
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
  },
  attributeText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    flexShrink: 1,
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
  },
  // ── Elevated trust strip ──
  elevatedTrustStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  // ── Seller row ──
  // Per Design.md between-group spacing: the seller row is a distinct
  // group from the identity chapter. paddingVertical Space.md (16px)
  // gives proper breathing room for avatar + name + rating + actions.
  // The hairline top border separates it from the identity chapter
  // without adding a card surface (per AGENTS.md surface budget).
  // No padding here — SellerInfoCard handles its own internal padding.
  // This avoids double-padding that would push content inward.
  sellerTrustSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent', // overridden inline with theme color
  },
  sellerVerificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  // ── More from this seller rail ──
  // Bottom hairline closes the seller section before the purchase
  // details section below (per §4 surface budget — flat canvas + hairlines).
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
  // Trust chips — flat inline icon+text pairs. No card, no surface fill,
  // no border. Just icon + label + gap. Per AGENTS.md surface budget.
  // Per Design.md trust/commerce card micro spec: captionElevated (13px)
  // for trust copy. Icons at 16px (standard metadata glyph band 14-18px).
  trustChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm + 2,
    paddingBottom: Space.sm + 2,
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
  },
  trustChipText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
  },
  purchaseSummary: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + Space.xs,
    paddingBottom: Space.sm,
  },
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
  descriptionWrap: {
    gap: Space.sm,
    paddingBottom: Space.sm,
  },
  // Gradient fade overlay at the bottom of collapsed description text.
  // Visual signal that there's more content — replaces the bare text
  // link that users miss (per Vestiaire research).
  descriptionFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Space.lg + Space.xs,
  },
  descriptionText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + Space.xs,
    fontFamily: FontFamily.regular,
  },
  descriptionToggle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    alignSelf: 'flex-start',
  },
  postedDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    paddingTop: Space.xs,
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
  // Per Design.md: discovery density, at least two meaningful media
  // objects. 2-column grid with gap Space.sm (8px) between cards.
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
  },
  // ── Discovery ──
  railLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.lg,
  },
  railLoadingText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
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
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
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
