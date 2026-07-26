import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Listing } from '../data/mockData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { enablePriceAlert, disablePriceAlert, getPriceAlertStatus } from '../services/priceAlertsApi';
import { toIze, formatIzeAmount } from '../utils/currency';
import { Motion } from '../constants/motion';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';

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
} from '../components/commerce/detail';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';
import { FlagshipEmptyGraphic } from '../components/flagship';

import {
  useListingDetail,
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
import { Space, Type, Typography, DockConstants } from '../theme/designTokens';

export default function ItemDetailScreen() {
  const { isDark, colors } = useAppTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompactScreen = screenWidth < 390;
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [priceAlertEnabled, setPriceAlertEnabled] = useState(false);
  const [priceAlertLoading, setPriceAlertLoading] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [sizeGuideVisible, setSizeGuideVisible] = useState(false);
  const [overflowVisible, setOverflowVisible] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

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
    isLoading: recsLoading,
    isError: recsError,
  } = useRecommendations(itemId);

  const {
    data: exploreData,
    fetchNextPage: exploreNextPage,
    hasNextPage: exploreHasNextPage,
    isFetchingNextPage: exploreFetching,
  } = useContinueExploring(itemId);

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

  const { data: sellerTrustData } = useSellerTrust(item?.sellerId);
  const sellerFollowMutation = useSellerFollow(item?.sellerId);

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

  // NOTE: exploreItems useMemo must run BEFORE any conditional return so the
  // hook count stays stable across loading → loaded (Rules of Hooks).
  const exploreItems: Listing[] = useMemo(() => {
    const allPages = exploreData?.pages ?? [];
    const items: Listing[] = [];
    for (const page of allPages) {
      const section = page.sections.find((s) => s.key === 'continue_exploring');
      if (section) {
        for (const item of section.items) {
          if (!isRecommendationLook(item)) items.push(item);
        }
      }
    }
    return items;
  }, [exploreData]);

  // Sold comparables — derived from backend listings with same category/brand that are sold
  const soldComps = useMemo(() => {
    if (!item) return null;
    const sold = backendListings.filter((l) =>
      l.id !== item.id &&
      l.isSold &&
      (l.category === item.category || l.brand === item.brand)
    );
    if (sold.length < 2) return null;
    const prices = sold.map((l) => l.price).sort((a, b) => a - b);
    return {
      minPrice: prices[0],
      maxPrice: prices[prices.length - 1],
      medianPrice: prices[Math.floor(prices.length / 2)],
      sampleSize: sold.length,
    };
  }, [backendListings, item]);

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
        <View style={styles.unavailableContainer}>
          <FlagshipEmptyGraphic variant="box" size={160} />
          <Text style={[styles.unavailableTitle, { color: colors.textPrimary }]}>Item not found</Text>
          <Text style={[styles.unavailableBody, { color: colors.textSecondary }]}>
            This listing may have been removed or is no longer available.
          </Text>
        </View>
      </View>
    );
  }

  const hasDiscount = item.originalPrice !== undefined && item.originalPrice > item.price;
  const formattedPrice = formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' });
  const formattedOriginal = hasDiscount
    ? formatFromFiat(item.originalPrice!, 'GBP', { displayMode: 'fiat' })
    : null;
  const discountPercent = hasDiscount && item.originalPrice
    ? ((item.originalPrice - item.price) / item.originalPrice) * 100
    : null;
  const formattedProtectionTotal = serverCommerce?.estimatedTotal != null
    ? formatFromFiat(serverCommerce.estimatedTotal, 'GBP', { displayMode: 'fiat' })
    : null;
  const priceIzeText = goldRates && displayMode !== 'fiat'
    ? formatIzeAmount(toIze(item.price, 'GBP', goldRates))
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
  const bundleItems: Listing[] = moreFromSellerSection
    ? moreFromSellerSection.items.filter((i): i is Listing => !isRecommendationLook(i))
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
  const interestSignal = (() => {
    const interestCount = (item.likes ?? 0) + (isItemSavedAnywhere(item.id) ? 1 : 0);
    if (interestCount >= 5) return `${interestCount} people interested`;
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
  if (soldComps && soldComps.sampleSize > 0) {
    priceInsightRows.push({
      label: 'Similar sold',
      value: `£${soldComps.minPrice.toFixed(0)}–£${soldComps.maxPrice.toFixed(0)}`,
      muted: true,
    });
  }
  if (item.likes && item.likes >= 10) {
    priceInsightRows.push({ label: 'Demand', value: `${item.likes} likes` });
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── Collapsed scrolling header ──
          Quiet glyph hit targets, no large rounded-square containers.
          Spec 02 shape system: separate hit area from visible shape. */}
      <CommerceDetailHeader
        scrollY={scrollY}
        title={item.title}
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
          heightFraction={isCompactScreen ? 0.5 : 0.62}
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
              icon: 'share-outline',
              label: 'Share',
              onPress: handleShare,
            },
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

        {/* ── Zone B — Identity seam ──
            One compact identity composition: brand eyebrow + title +
            dominant price + discount/protection secondary line +
            interest signal. The family badge lives on the media stage
            above; the price is NOT repeated elsewhere except the dock.
            Spec 02 §B + spec 05 §2. */}
        <CommerceDetailIdentity
          eyebrow={item.brand ?? undefined}
          title={item.title}
          primaryValue={formattedPrice}
          secondaryLine={secondaryLine}
          interestSignal={interestSignal}
        />

        {/* Key attributes — one quiet row, not filled pills.
            Spec 05 §2: "Do not make every attribute a filled pill." */}
        {attributeLine ? (
          <View style={styles.attributeRow}>
            <Text style={[styles.attributeText, { color: colors.textMuted }]} numberOfLines={2}>
              {attributeLine}
            </Text>
            {item.size && (
              <Pressable
                onPress={() => { haptic.light(); setSizeGuideVisible(true); }}
                hitSlop={8}
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

        {/* 1ZE equivalent — quiet secondary line when gold rates exist */}
        {priceIzeText ? (
          <Text style={[styles.izeText, { color: colors.textSecondary }]} numberOfLines={1}>
            {priceIzeText}
          </Text>
        ) : null}

        {/* ── Zone C — Seller confidence ──
            Slim seller row — the primary seller presentation. Carries
            Follow/Message and navigates to the full profile on tap.
            Spec 05 §3: "Move seller identity closer to the purchase
            decision. Compact row." */}
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
          <CommerceDetailSection label="Purchase details" divider>
            <Text style={[styles.purchaseSummary, { color: colors.textSecondary }]}>
              {purchaseSummary}
            </Text>
            <CommerceDetailDisclosureRow
              label="Shipping & delivery"
              summary={commerce.shippingMethod ?? undefined}
              onPress={() => {
                haptic.light();
                show(
                  commerce.estimatedDeliveryStart && commerce.estimatedDeliveryEnd
                    ? `${commerce.shippingMethod ?? 'Standard shipping'} · ${commerce.estimatedDeliveryStart}–${commerce.estimatedDeliveryEnd}`
                    : commerce.shippingMethod ?? 'Shipping confirmed at checkout',
                  'info'
                );
              }}
              leadingIcon="cube-outline"
            />
            <CommerceDetailDisclosureRow
              label="Buyer protection"
              summary={commerce.protectionPolicy?.available ? commerce.protectionPolicy.label : 'Not included'}
              onPress={() => {
                haptic.light();
                show(
                  commerce.protectionPolicy?.summary ?? 'Your money is held safely until you confirm receipt.',
                  'info'
                );
              }}
              leadingIcon="shield-checkmark-outline"
            />
            <CommerceDetailDisclosureRow
              label="Returns"
              summary={
                commerce.returnPolicy
                  ? commerce.returnPolicy.accepted
                    ? commerce.returnPolicy.windowDays
                      ? `${commerce.returnPolicy.windowDays} days`
                      : 'Accepted'
                    : 'Not accepted'
                  : undefined
              }
              onPress={() => {
                haptic.light();
                show(
                  commerce.returnPolicy?.accepted
                    ? `Returns accepted${commerce.returnPolicy?.windowDays ? ` within ${commerce.returnPolicy.windowDays} days` : ''}.`
                    : 'This seller does not accept returns.',
                  'info'
                );
              }}
              leadingIcon="return-up-back-outline"
            />
            <CommerceDetailMetricRow
              label="Secure payment"
              value="Thryftverse checkout"
              muted
            />
          </CommerceDetailSection>
        ) : null}

        {/* ── Zone E — Product details ──
            Description + condition + category evidence + posted date.
            Spec 05 §5. */}
        <CommerceDetailSection label="Item details" divider>
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
          <CommerceDetailSection label="Price insight" divider>
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
                style={({ pressed }) => [styles.alertRow, pressed && styles.pressed]}
                accessibilityRole="switch"
                accessibilityState={{ checked: priceAlertEnabled }}
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
            Q&A remains; wrapped in a flat section. Spec 05 §7. */}
        <CommerceDetailSection label="Questions & answers" divider>
          <ListingQA
            listingId={item.id}
            currentUserName={currentUser?.username ?? 'You'}
            isSeller={item.seller?.id === currentUser?.id}
          />
        </CommerceDetailSection>

        {/* ── Zone H — Discovery ──
            Order: More from seller → Bundle → Seen in Looks → More like
            this → Continue exploring. Spec 05 §8. */}
        <Reanimated.View entering={FadeInDown.duration(350).delay(120)}>
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

        {/* More like this — visual-similar grid by category/brand */}
        {(() => {
          const visualSimilar = backendListings
            .filter((l) =>
              l.id !== item.id &&
              !l.isSold &&
              (l.category === item.category || l.brand === item.brand)
            )
            .slice(0, 6);
          if (visualSimilar.length < 2) return null;
          return (
            <Reanimated.View entering={FadeInDown.duration(350).delay(180)}>
              <CommerceDetailSection label="More like this" divider>
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
                      <Text style={[styles.moreLikeThisPrice, { color: colors.textPrimary }]} numberOfLines={1}>
                        £{simItem.price.toFixed(0)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </CommerceDetailSection>
            </Reanimated.View>
          );
        })()}

        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <SeenInLooksRail
              items={seenInLooksSection.items.filter(isRecommendationLook) as RecommendationLook[]}
              onPressItem={handlePressLook}
            />
          </View>
        )}

        {recsLoading && recommendationSections.length === 0 ? (
          <View style={styles.railLoading}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Text style={[styles.railLoadingText, { color: colors.textMuted }]} numberOfLines={1}>
              Finding recommendations...
            </Text>
          </View>
        ) : (
          railSections.map((section) => (
            <RecommendationRail
              key={section.key}
              section={section}
              listingId={item.id}
              onPressItem={handlePressRecommendation}
            />
          ))
        )}

        {exploreItems.length > 0 && (
          <View style={styles.recommendationSection}>
            <DiscoveryGrid
              items={exploreItems}
              listingId={item.id}
              onPressItem={handlePressRecommendation}
              onEndReached={() => exploreNextPage()}
              hasMore={!!exploreHasNextPage && !exploreFetching}
            />
          </View>
        )}

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
                onPress: () => navigation.navigate('Home'),
              }}
            />
          );
        }

        if (!capabilities.isAvailable) {
          return (
            <CommerceDetailStateDock
              stateBadge={
                <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]}>
                  Unavailable
                </Text>
              }
              subtitle="This listing is no longer available"
            />
          );
        }

        return (
          <CommerceDetailStateDock
            value={formattedPrice}
            valueLabel="Price"
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
                      navigation.navigate('MakeOffer', { itemId: item.id, price: item.price, title: item.title });
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
        title={item.title}
        subtitle={item.brand ? `${item.brand} · £${item.price}` : `£${item.price}`}
        imageUri={item.images?.[0]}
      />

      <SizeGuideSheet
        visible={sizeGuideVisible}
        category={item.category}
        currentSize={item.size}
        onClose={() => setSizeGuideVisible(false)}
      />

      {/* Overflow sheet — lower-frequency hero actions (Fav, Report). */}
      {overflowVisible && (
        <View style={styles.overflowBackdrop}>
          <Pressable
            style={styles.overflowBackdropPress}
            onPress={() => setOverflowVisible(false)}
            accessibilityLabel="Close more actions"
            accessibilityRole="button"
          />
          <View style={[styles.overflowSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
              onPress={() => {
                setOverflowVisible(false);
                handleToggleFav();
              }}
              accessibilityRole="button"
              accessibilityLabel={isFav ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={18} color={isFav ? colors.danger : colors.textPrimary} />
              <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>
                {isFav ? 'Remove from wishlist' : 'Add to wishlist'}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
              onPress={() => {
                setOverflowVisible(false);
                navigation.navigate('ReportListing', { itemId: item.id });
              }}
              accessibilityRole="button"
              accessibilityLabel="Report this listing"
            >
              <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.overflowRowText, { color: colors.textSecondary }]}>
                Report listing
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  unavailableContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  unavailableTitle: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
  },
  unavailableBody: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
  familyBadgeOverlay: {
    alignSelf: 'flex-start',
  },
  // ── Attribute row ──
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingBottom: Space.xs,
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
    minWidth: '31%',
    maxWidth: '33%',
    gap: 4,
  },
  moreLikeThisImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLikeThisPrice: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
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
  // ── Dock state badge ──
  dockStateBadge: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
  },
  // ── Overflow sheet ──
  overflowBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 200,
    justifyContent: 'flex-end',
  },
  overflowBackdropPress: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  overflowSheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    paddingBottom: Space.lg,
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
    opacity: 0.6,
  },
});
