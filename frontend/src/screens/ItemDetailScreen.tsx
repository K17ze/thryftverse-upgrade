import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Reanimated, {
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
  FadeInDown,
} from 'react-native-reanimated';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import type { Listing } from '../services/listingsApi';
import type { DisplayReadyListing } from '../services/listingMapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { enablePriceAlert, disablePriceAlert, getPriceAlertStatus } from '../services/priceAlertsApi';
import { toIze, formatIzeAmount } from '../utils/currency';
import { Motion } from '../constants/motion';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { BottomSheet } from '../components/BottomSheet';

import {
  ProductDescription,
  RecommendationRail,
  SeenInLooksRail,
  DiscoveryGrid,
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
  CommerceDetailSellerRow,
  CommerceDetailSection,
  CommerceDetailDisclosureRow,
  CommerceDetailMetricRow,
  CommerceDetailStateDock,
  CommerceDetailMediaRail,
  CommerceDetailUnavailableInline,
  CommerceDetailOfflineBanner,
  COMMERCE_DETAIL_COMPACT_WIDTH,
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
import type { RecommendationLook } from '../platform/product';
import { trackTelemetryEvent } from '../lib/telemetry';
import { Space, Type, Typography, Radius, DockConstants } from '../theme/designTokens';

export default function ItemDetailScreen() {
  const { isDark, colors } = useAppTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isCompactScreen = screenWidth < COMMERCE_DETAIL_COMPACT_WIDTH;
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [priceAlertEnabled, setPriceAlertEnabled] = useState(false);
  const [priceAlertLoading, setPriceAlertLoading] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [sizeGuideVisible, setSizeGuideVisible] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  // Per spec 04_DIRECT §3: Q&A opens in a canonical BottomSheet.
  const [qaSheetVisible, setQaSheetVisible] = useState(false);
  const [purchaseDetailsVisible, setPurchaseDetailsVisible] = useState(false);
  const [overflowVisible, setOverflowVisible] = useState(false);

  const isItemSavedAnywhere = useStore((state) => state.isItemSavedAnywhere);
  const isFav = useStore((state) => state.isWishlisted(route.params?.itemId));
  const toggleFav = useStore((state) => state.toggleWishlist);
  const currentUser = useStore((state) => state.currentUser);
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
      show('Could not update price alert. Please try again.', 'error');
    } finally {
      setPriceAlertLoading(false);
    }
  }, [item?.id, priceAlertEnabled, priceAlertLoading, show]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
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
      withSpring(1.5, Motion.spring.flagshipPop),
      withTiming(1.5, { duration: 400 }),
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

  // NOTE: exploreItems useMemo must run BEFORE any conditional return so the
  // hook count stays stable across loading → loaded (Rules of Hooks).
  // Per spec 04_DIRECT §4: "Continue exploring" items are prefetched via
  // the useContinueExploring hook but not rendered as a fourth discovery
  // module — the three-module budget (Bundle upsell → Seen in Looks →
  // More like this) is the canonical order. The prefetched data is
  // available for downstream navigation surfaces.
  // ── Listing engagement summary ──
  // Per spec 04_DIRECT §5: backend-backed engagement summary. The
  // frontend must not fabricate question counts. listingEngagement is
  // null until the backend exposes questionCount.
  const listingEngagement = item?.engagement ?? null;

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
          retryLabel="Browse similar"
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
  const seller = sellerTrustData
    ? sellerTrustData
    : buildSellerTrustSummary(item.seller);

  const recommendationSections = recommendationsData?.sections ?? [];
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');
  const railSections = recommendationSections.filter(
    (s) => s.key !== 'seen_in_looks' && s.key !== 'continue_exploring'
  );

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

  const handlePressLook = (lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  };

  // ── Identity composition ──
  // One dominant price location (identity). The dock carries a compact
  // actionable price. No price repetition in between.
  // Per spec 04_DIRECT §1: do not fabricate "N people interested" by
  // adding saved-to-collection to likes. Only show truthful likes from
  // the backend, and only when the count is meaningful (>= 1).
  const interestSignal = (() => {
    if (item.likes && item.likes > 0) return `${item.likes} like${item.likes > 1 ? 's' : ''}`;
    return undefined;
  })();

  const attributeLine = [
    item.size && `Size ${item.size}`,
    item.condition,
    item.category,
  ].filter(Boolean).join(' · ');

  const secondaryLine = [
    hasDiscount && formattedOriginal ? `Was ${formattedOriginal}` : null,
    discountPercent ? `-${Math.round(discountPercent)}%` : null,
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
  // Per spec 04_DIRECT §2: do not label likes as "Demand". Likes are
  // not a demand signal — they are a wishlist signal. The interest
  // signal in the identity already shows truthful likes.
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── Collapsed scrolling header ──
          Quiet glyph hit targets, no large rounded-square containers.
          Spec 02 shape system: separate hit area from visible shape. */}
      <CommerceDetailHeader
        scrollY={scrollY}
        title={displayTitle}
        onBack={() => navigation.goBack()}
      />

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
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
          onSave={() => { haptic.medium(); setCollectionModalVisible(true); }}
          onToggleFav={handleToggleFav}
          onDoubleTap={handleDoubleTap}
          onZoomStart={() => { if (item) ProductAnalytics.mediaZoom(item.id); }}
          onOpenFullscreen={handleOpenFullscreen}
          heightFraction={isCompactScreen ? 0.54 : 0.58}
          initialIndex={fullscreenIndex}
          onActiveIndexChange={setFullscreenIndex}
          bigHeartOpacity={bigHeartOpacity}
          bigHeartScale={bigHeartScale}
          showDefaultControls={false}
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
              icon: isItemSavedAnywhere(item.id) ? 'bookmark' : 'bookmark-outline',
              activeIcon: 'bookmark',
              label: isItemSavedAnywhere(item.id) ? 'Saved to collection' : 'Save to collection',
              onPress: () => { haptic.medium(); setCollectionModalVisible(true); },
              isActive: isItemSavedAnywhere(item.id),
            },
          ]}
          onOverflow={() => setOverflowVisible(true)}
          showOverflow
        />

        {/* ── Offline banner ──
            Per spec 05 §14: offline state must be designed, not a blank
            screen. Cached listing data may still be visible. */}
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
            secondaryLine={secondaryLine}
            interestSignal={interestSignal}
          />

          {attributeLine ? (
            <View style={styles.attributeRow}>
              <Text style={[styles.attributeText, { color: colors.textMuted }]} numberOfLines={2}>
                {attributeLine}
              </Text>
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

        {seller && (
          <View style={styles.sellerRowWrap}>
            <CommerceDetailSellerRow
              avatarUri={seller.avatar ?? undefined}
              name={seller.username}
              verified={seller.verified}
              ratingLine={
                seller.rating != null
                  ? `${seller.rating.toFixed(1)}${seller.reviewCount != null ? ` · ${seller.reviewCount} reviews` : ''}`
                  : undefined
              }
              locationLine={seller.location ?? seller.dispatchTimeLabel ?? undefined}
              onPress={() => {
                if (item) ProductAnalytics.sellerProfileOpen(item.id, seller.id);
                navigation.navigate('UserProfile', { userId: seller.id });
              }}
              primaryAction={
                !capabilities.isOwner
                  ? {
                      label: 'Message',
                      onPress: () => {
                        if (item) ProductAnalytics.sellerMessageStart(item.id);
                        navigation.navigate('NewMessage', {
                          preselectedUserId: seller.id,
                          preselectedDisplayName: seller.username,
                        });
                      },
                    }
                  : undefined
              }
              secondaryAction={
                !capabilities.isOwner
                  ? {
                      label: 'Follow',
                      onPress: () => sellerFollowMutation.mutate(),
                    }
                  : undefined
              }
            />
          </View>
        )}

        {/* ── Zone D — Purchase details ──
            Compact summary + disclosure. Groups shipping, buyer
            protection, returns, authenticity, payment context.
            Spec 05 §4: "Use a compact summary plus disclosure sheet.
            Do not render a separate bordered strip for every policy." */}
        {purchaseSummary ? (
          <CommerceDetailSection label="Buying this item" variant="continuation">
            <CommerceDetailDisclosureRow
              label="Delivery & protection"
              summary={purchaseSummary}
              onPress={() => {
                haptic.light();
                setPurchaseDetailsVisible(true);
              }}
              leadingIcon="shield-checkmark-outline"
            />
          </CommerceDetailSection>
        ) : null}

        {/* ── Zone E — Product details ──
            Description + condition + category evidence + posted date.
            Spec 05 §5. */}
        <CommerceDetailSection label="Item details" divider variant="editorial">
          {item.description ? (
            <View style={styles.descriptionWrap}>
              <Text
                style={[styles.descriptionText, { color: colors.textPrimary }]}
                numberOfLines={descriptionExpanded ? undefined : 4}
              >
                {item.description}
              </Text>
              {item.description.length > 120 && (
                <Pressable
                  onPress={() => setDescriptionExpanded((prev) => !prev)}
                  hitSlop={8}
                  style={styles.quietTextTarget}
                  accessibilityLabel={descriptionExpanded ? 'Show less' : 'Read more'}
                  accessibilityRole="button"
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

        {/* ── Zone F — Price insight ──
            Only render facts that are genuinely supported. No fabricated
            history. Spec 05 §6. */}
        {priceInsightRows.length > 0 ? (
          <CommerceDetailSection label="Price insight" divider variant="editorial">
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

        {/* ── Zone G — Social proof and Q&A ──
            Per spec 04_DIRECT §3: collapse Q&A into a disclosure row.
            Do not render the full Q&A inline by default — it adds
            vertical length without aiding the purchase decision. The
            disclosure opens a canonical BottomSheet with the full Q&A. */}
        <CommerceDetailSection label="Questions" variant="compact" divider>
          <CommerceDetailDisclosureRow
            label={qaSummary?.questionCount ? 'View all questions' : 'Ask a question'}
            summary={qaSummary?.questionCount ? undefined : 'No questions yet'}
            count={qaSummary?.questionCount ?? listingEngagement?.questionCount}
            onPress={() => setQaSheetVisible(true)}
            leadingIcon="chatbubble-outline"
            accessibilityLabel="View questions and answers"
          />
        </CommerceDetailSection>

        {/* ── Zone H — Discovery ──
            Per spec 04_DIRECT §4: maximum three discovery modules.
            Order: Bundle upsell → Seen in Looks → More like this.
            Removed generic recommendation rail mapping and DiscoveryGrid
            to stay within the three-module budget. */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(220).delay(80)}>
          <BundleUpsellRow
            items={bundleItems}
            currentListingId={item.id}
            shippingPayer={commerce.shippingPayer}
            onPressItem={handlePressRecommendation}
            sellerId={item.seller?.id ?? undefined}
            sellerName={item.seller?.username ?? undefined}
            onOpenBundleBag={(sellerId, sellerName) => navigation.navigate('BundleBag', { sellerId, sellerName })}
          />
        </Reanimated.View>

        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <SeenInLooksRail
              items={seenInLooksSection.items.filter(isRecommendationLook) as RecommendationLook[]}
              onPressItem={handlePressLook}
            />
          </View>
        )}

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
            <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(220).delay(120)}>
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
                        <View style={[styles.moreLikeThisImage, { backgroundColor: colors.surfaceAlt }]}>
                          <Ionicons name="shirt-outline" size={20} color={colors.textMuted} />
                        </View>
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
            </Reanimated.View>
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
              primaryAction={{
                label: 'Manage listing',
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
                label: 'Browse similar',
                onPress: () => navigation.navigate('MainTabs', { screen: 'Explore' }),
              }}
            />
          );
        }

        return (
          <CommerceDetailStateDock
            value={formattedPrice}
            primaryAction={{
              label: 'Buy now',
              onPress: () => {
                if (item) ProductAnalytics.checkoutStart(item.id);
                navigation.navigate('Checkout', { itemId: item.id });
              },
            }}
            secondaryAction={
              capabilities.canOffer
                ? {
                    label: 'Make offer',
                    onPress: () => {
                      if (item) ProductAnalytics.offerStart(item.id);
                      navigation.navigate('MakeOffer', {
                        itemId: item.id,
                        price: item.price!,
                        title: displayTitle,
                      });
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
        snapPoint={0.58}
      >
        <View style={[styles.purchaseSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <View>
            <Text style={[styles.purchaseSheetTitle, { color: colors.textPrimary }]}>
              Delivery & protection
            </Text>
            <Text style={[styles.purchaseSheetSubtitle, { color: colors.textMuted }]}>
              Confirmed terms for this listing
            </Text>
          </View>
          <Pressable
            onPress={() => setPurchaseDetailsVisible(false)}
            style={styles.sheetCloseTarget}
            accessibilityLabel="Close delivery and protection"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.purchaseSheetBody}>
          <CommerceDetailMetricRow
            label="Shipping"
            value={commerce.shippingMethod ?? 'Confirmed at checkout'}
            subLabel={
              commerce.estimatedDeliveryStart && commerce.estimatedDeliveryEnd
                ? `${commerce.estimatedDeliveryStart}–${commerce.estimatedDeliveryEnd}`
                : undefined
            }
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

      {/* ── Q&A BottomSheet ──
          Per spec 04_DIRECT §3: canonical BottomSheet for Q&A. Opens
          from the "View questions & answers" disclosure row. */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  familyBadgeOverlay: {
    alignSelf: 'flex-start',
  },
  editorialIdentityChapter: {
    paddingTop: Space.xs,
    paddingBottom: Space.xs,
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
  attributeText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    flexShrink: 1,
  },
  sizeGuideLink: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    flexShrink: 0,
  },
  quietTextTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  izeText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    letterSpacing: 0.1,
  },
  // ── Seller row ──
  sellerRowWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  // ── Purchase details ──
  purchaseSummary: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    paddingBottom: Space.sm,
  },
  purchaseSheetHeader: {
    minHeight: 64,
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
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  purchaseSheetSubtitle: {
    marginTop: 2,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  purchaseSheetBody: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  sheetCloseTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Description ──
  descriptionWrap: {
    gap: Space.xs,
    paddingBottom: Space.sm,
  },
  descriptionText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 4,
    fontFamily: Typography.family.regular,
  },
  descriptionToggle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    alignSelf: 'flex-start',
  },
  postedDate: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    paddingTop: Space.xs,
  },
  // ── Price insight alert row ──
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    minHeight: 44,
  },
  alertRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  alertRowLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  // ── Sync retry ──
  syncRetryWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  // ── More like this grid ──
  moreLikeThisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  moreLikeThisCard: {
    flex: 1,
    minWidth: '47%',
    maxWidth: '49%',
    gap: 3,
  },
  moreLikeThisImage: {
    width: '100%',
    aspectRatio: 0.86,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLikeThisPrice: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  moreLikeThisTitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
  },
  moreLikeThisMeta: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Discovery ──
  recommendationSection: {
    marginTop: Space.lg,
  },
  railLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.lg,
  },
  railLoadingText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  recErrorRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  // ── Q&A BottomSheet header (per spec 04_DIRECT §3) ──
  qaSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  qaSheetTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    lineHeight: Type.subtitle.lineHeight,
  },
  // ── Dock state badge ──
  dockStateBadge: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
  },
  // ── Overflow sheet (rendered inside canonical BottomSheet) ──
  overflowHeader: {
    paddingBottom: Space.sm,
    marginBottom: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  overflowTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    minHeight: 48,
  },
  overflowRowText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
