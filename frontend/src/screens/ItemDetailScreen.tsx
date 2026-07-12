import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Pressable,
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
import { Colors } from '../constants/colors';
import { Typography, Space, DockConstants } from '../theme/designTokens';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Listing } from '../data/mockData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { enablePriceAlert, disablePriceAlert, getPriceAlertStatus } from '../services/priceAlertsApi';
import { toIze, formatIzeAmount } from '../utils/currency';
import { Motion } from '../constants/motion';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { CachedImage } from '../components/CachedImage';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';

import {
  ProductDetailHeader,
  ProductIdentitySummary,
  ProductAttributeChips,
  ProductDescription,
  ProductCommerceSummary,
  BuyerProtectionStrip,
  SellerTrustCard,
  RecommendationRail,
  SeenInLooksRail,
  DiscoveryGrid,
  ProductActionBar,
  ProductDetailSkeleton,
  ProductErrorState,
  FullscreenMediaViewer,
  ProductFamilyBadge,
  PriceInsightStrip,
  SizeGuideSheet,
  BundleUpsellRow,
  ListingQA,
} from '../components/product';
import {
  CommerceMediaStage,
  CommerceStickyDock,
  CommerceStateCanvas,
  CategoryEvidence,
} from '../components/commerce';
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

import { useWindowDimensions } from 'react-native';

export default function ItemDetailScreen() {
  const { isDark } = useAppTheme();
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
  const reducedMotionEnabled = useReducedMotion();

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

  // Price history — derived from originalPrice and current price
  const priceHistory = useMemo(() => {
    if (!item) return null;
    const history: { price: number; date: string }[] = [];
    if (item.originalPrice && item.originalPrice > item.price) {
      history.push({ price: item.originalPrice, date: item.createdAt ?? new Date().toISOString() });
    }
    history.push({ price: item.price, date: new Date().toISOString() });
    return history.length > 1 ? history : null;
  }, [item]);

  if (queryLoading && !item) {
    return (
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ProductDetailSkeleton />
      </View>
    );
  }

  if (queryError && !item) {
    return (
      <View style={styles.container}>
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
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.unavailableContainer}>
          <FlagshipEmptyGraphic variant="box" size={160} />
          <Text style={styles.unavailableTitle}>Item not found</Text>
          <Text style={styles.unavailableBody}>
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

  const heroHeight = Math.min(screenHeight * 0.62, screenWidth * 1.35);

  const handlePressRecommendation = (recItem: Listing) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
  };

  const handlePressLook = (lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ProductDetailHeader
        brand={item.brand}
        title={item.title}
        price={formattedPrice}
        scrollY={scrollY}
        heroHeight={heroHeight}
        onBack={() => navigation.goBack()}
        onShare={handleShare}
        isFav={isFav}
        onToggleFav={handleToggleFav}
      />

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, Space.md) + DockConstants.dualActionHeight }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        <CommerceMediaStage
          images={item.images}
          objectId={item.id}
          isFav={isFav}
          isSaved={isItemSavedAnywhere(item.id)}
          isSold={!!item.isSold}
          topInset={insets.top}
          scrollY={scrollY}
          onBack={() => navigation.goBack()}
          onShare={() => { haptic.light(); handleShare(); }}
          onSave={() => { haptic.medium(); setCollectionModalVisible(true); }}
          onToggleFav={handleToggleFav}
          onDoubleTap={handleDoubleTap}
          onZoomStart={() => { if (item) ProductAnalytics.mediaZoom(item.id); }}
          onOpenFullscreen={handleOpenFullscreen}
          heightFraction={isCompactScreen ? 0.5 : 0.62}
          bigHeartOpacity={bigHeartOpacity}
          bigHeartScale={bigHeartScale}
          overlayTopContent={
            <View style={{ alignItems: 'flex-start' }}>
              <ProductFamilyBadge
                family="direct"
                stateAccent={item.isSold ? 'Sold' : null}
                compact
              />
            </View>
          }
        />

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(80)}>
          <ProductIdentitySummary
            brand={item.brand}
            title={item.title}
            price={formattedPrice}
            originalPrice={formattedOriginal}
            hasDiscount={hasDiscount}
            discountPercent={discountPercent}
            protectionTotal={formattedProtectionTotal}
            izeText={priceIzeText}
            engagement={{
              likes: item.likes,
              views: item.views,
              saves: 0,
              offers: 0,
            }}
          />

          <BuyerProtectionStrip
            policyLabel={commerce.protectionPolicy?.label}
          />

          <ProductAttributeChips
            size={item.size}
            condition={item.condition}
            category={item.category}
            onSizePress={() => { haptic.light(); setSizeGuideVisible(true); }}
          />

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

          <ProductDescription description={item.description} />

          {item.createdAt ? (
            <Text style={styles.postedDate} numberOfLines={1}>
              Posted {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          ) : null}

          <ProductCommerceSummary
            commerce={commerce}
            formattedPrice={formattedPrice}
            formattedProtectionTotal={formattedProtectionTotal}
          />

          {/* Authentication service CTA for high-value items */}
          {(() => {
            const authStatus = commerce.authenticity?.status ?? 'not_offered';
            const isHighValue = item.price >= 200;
            if (authStatus === 'verified') {
              return (
                <View style={styles.authCard}>
                  <View style={styles.authIconWrap}>
                    <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.authTitle}>Authenticity verified</Text>
                    <Text style={styles.authSubtitle}>This item has been verified by Thryftverse authentication partners.</Text>
                  </View>
                </View>
              );
            }
            if (isHighValue && authStatus === 'not_offered') {
              return (
                <Pressable
                  style={styles.authCard}
                  onPress={() => {
                    haptic.light();
                    show('Authentication request submitted. We\'ll review and notify you within 48 hours.', 'info');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Request authenticity verification"
                >
                  <View style={styles.authIconWrap}>
                    <Ionicons name="shield-outline" size={20} color={Colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.authTitle}>Request authenticity check</Text>
                    <Text style={styles.authSubtitle}>High-value item. Request professional verification before purchase.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </Pressable>
              );
            }
            return null;
          })()}

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(120)}>
            <PriceInsightStrip
              price={item.price}
              originalPrice={item.originalPrice}
              listedAt={item.createdAt}
              likes={item.likes}
              alertEnabled={priceAlertEnabled}
              onToggleAlert={handleTogglePriceAlert}
              soldComps={soldComps}
              priceHistory={priceHistory}
            />
          </Reanimated.View>

          {lastError ? (
            <SyncRetryBanner
              message="Pull latest listing changes now."
              onRetry={() => void refreshListings()}
              isRetrying={isSyncing}
              telemetryContext="item_detail_listing_sync"
              containerStyle={styles.syncRetry}
            />
          ) : null}

          {seller && (
            <SellerTrustCard
              seller={seller}
              onFollow={() => sellerFollowMutation.mutate()}
              onOpenProfile={() => {
                if (item) ProductAnalytics.sellerProfileOpen(item.id, seller.id);
                navigation.navigate('UserProfile', { userId: seller.id });
              }}
              onMessage={() => {
                if (item) ProductAnalytics.sellerMessageStart(item.id);
                navigation.navigate('NewMessage', {
                  preselectedUserId: seller.id,
                  preselectedDisplayName: seller.username,
                });
              }}
            />
          )}

          {/* Public Q&A section */}
          <ListingQA
            listingId={item.id}
            currentUserName={currentUser?.username ?? 'You'}
            isSeller={item.seller?.id === currentUser?.id}
          />

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(160)}>
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
              <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(180)}>
                <View style={styles.sectionDivider} />
                <Text style={styles.moreLikeThisTitle}>More like this</Text>
                <View style={styles.moreLikeThisGrid}>
                  {visualSimilar.map((simItem) => (
                    <Pressable
                      key={simItem.id}
                      style={styles.moreLikeThisCard}
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
                        <View style={[styles.moreLikeThisImage, styles.moreLikeThisPlaceholder]}>
                          <Ionicons name="shirt-outline" size={20} color={Colors.textMuted} />
                        </View>
                      )}
                      <Text style={styles.moreLikeThisPrice}>
                        £{simItem.price.toFixed(0)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Reanimated.View>
            );
          })()}

          {seenInLooksSection && seenInLooksSection.items.length > 0 && (
            <>
              <View style={styles.sectionDivider} />
              <SeenInLooksRail
                items={seenInLooksSection.items.filter(isRecommendationLook) as RecommendationLook[]}
                onPressItem={handlePressLook}
              />
            </>
          )}

          {recsLoading && recommendationSections.length === 0 ? (
            <View style={styles.railLoading}>
              <ActivityIndicator size="small" color={Colors.textMuted} />
              <Text style={styles.railLoadingText} numberOfLines={1}>Finding recommendations...</Text>
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
            <>
              <View style={styles.sectionDivider} />
              <DiscoveryGrid
                items={exploreItems}
                listingId={item.id}
                onPressItem={handlePressRecommendation}
                onEndReached={() => exploreNextPage()}
                hasMore={!!exploreHasNextPage && !exploreFetching}
              />
            </>
          )}

          {recsError && recommendationSections.length === 0 && (
            <View style={styles.recErrorRow}>
              <Text style={styles.recErrorText} numberOfLines={2}>
                Recommendations are temporarily unavailable.
              </Text>
            </View>
          )}
        </Reanimated.View>
      </Reanimated.ScrollView>

      <CommerceStickyDock bottomInset={insets.bottom}>
        <ProductActionBar
          capabilities={capabilities}
          formattedPrice={formattedPrice}
          onBuy={() => {
            if (item) ProductAnalytics.checkoutStart(item.id);
            navigation.navigate('Checkout', { itemId: item.id });
          }}
          onOffer={() => {
            if (item) ProductAnalytics.offerStart(item.id);
            navigation.navigate('MakeOffer', { itemId: item.id, price: item.price, title: item.title });
          }}
          onMessage={() => {
            if (item) ProductAnalytics.sellerMessageStart(item.id);
            navigation.navigate('NewMessage', {
              preselectedUserId: item.sellerId,
              preselectedDisplayName: item.seller?.username,
            });
          }}
          onManage={() => navigation.navigate('ManageListing', { itemId: item.id })}
        />
      </CommerceStickyDock>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  unavailableBody: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: Space.md,
    marginVertical: Space.lg,
  },
  moreLikeThisTitle: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  moreLikeThisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
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
    backgroundColor: Colors.surfaceAlt,
  },
  moreLikeThisPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLikeThisPrice: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  postedDate: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  authCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  authIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.brand}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authTitle: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  authSubtitle: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  syncRetry: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
  },
  railLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.lg,
  },
  railLoadingText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  recErrorRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  recErrorText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
});
