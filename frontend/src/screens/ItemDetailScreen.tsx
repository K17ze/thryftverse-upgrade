import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
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
import { useAppTheme } from '../theme/ThemeContext';
import { Listing } from '../data/mockData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { toIze, formatIzeAmount } from '../utils/currency';
import { Motion } from '../constants/motion';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';

import {
  ProductDetailHeader,
  ProductIdentitySummary,
  ProductAttributeChips,
  ProductDescription,
  ProductCommerceSummary,
  SellerTrustCard,
  RecommendationRail,
  SeenInLooksRail,
  DiscoveryGrid,
  ProductActionBar,
  ProductDetailSkeleton,
  ProductErrorState,
  FullscreenMediaViewer,
  ProductFamilyBadge,
} from '../components/product';
import {
  CommerceMediaStage,
  CommerceStickyDock,
  CommerceStateCanvas,
  CategoryEvidence,
} from '../components/commerce';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';

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
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);

  const isItemSavedAnywhere = useStore((state) => state.isItemSavedAnywhere);
  const isFav = useStore((state) => state.isWishlisted(route.params?.itemId));
  const toggleFav = useStore((state) => state.toggleWishlist);
  const currentUser = useStore((state) => state.currentUser);
  const { isSyncing, lastError, refreshListings } = useBackendData();

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
        <CommerceStateCanvas
          state="unavailable"
          title="Item not found"
          message="This listing may have been removed or is no longer available."
        />
      </View>
    );
  }

  const hasDiscount = item.originalPrice !== undefined && item.originalPrice > item.price;
  const formattedPrice = formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' });
  const formattedOriginal = hasDiscount
    ? formatFromFiat(item.originalPrice!, 'GBP', { displayMode: 'fiat' })
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

        <Reanimated.View entering={FadeInDown.duration(350).delay(80)}>
          <ProductIdentitySummary
            brand={item.brand}
            title={item.title}
            price={formattedPrice}
            originalPrice={formattedOriginal}
            hasDiscount={hasDiscount}
            protectionTotal={formattedProtectionTotal}
            izeText={priceIzeText}
          />

          <ProductAttributeChips
            size={item.size}
            condition={item.condition}
            category={item.category}
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
        imageUri={item.images?.[0]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: Space.md,
    marginVertical: Space.lg,
  },
  postedDate: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
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
