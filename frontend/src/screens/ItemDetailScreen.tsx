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
import { Typography, Space, Radius } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { Listing } from '../data/mockData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Motion } from '../constants/motion';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { FlagshipEmptyGraphic } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';

import {
  ProductMediaGallery,
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
} from '../components/product';

import {
  useListingDetail,
  useRecommendations,
  useContinueExploring,
  ProductAnalytics,
  setProductAnalyticsHandler,
  setProductSessionId,
  buildCommerceContext,
  buildSellerTrustSummary,
  buildCapabilities,
} from '../platform/product';

import { useWindowDimensions } from 'react-native';

export default function ItemDetailScreen() {
  const { isDark } = useAppTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
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

  useEffect(() => {
    setProductAnalyticsHandler((event) => {
      // Analytics dispatched via existing infrastructure
    });
    const session = `item_${itemId}_${Date.now()}`;
    setProductSessionId(session);
  }, [itemId]);

  useEffect(() => {
    if (item) {
      ProductAnalytics.itemView(item.id);
    }
  }, [item?.id]);

  const { formatFromFiat } = useFormattedPrice();
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
        <ProductErrorState onRetry={() => refetchListing()} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.xl }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />
        <FlagshipEmptyGraphic variant="box" size={140} />
        <Text style={{ marginTop: Space.md, fontSize: 16, fontFamily: Typography.family.medium, color: Colors.textSecondary, textAlign: 'center' }}>
          Item not found
        </Text>
        <Text style={{ marginTop: Space.sm, fontSize: 13, color: Colors.textMuted, textAlign: 'center' }}>
          This listing may have been removed or is no longer available.
        </Text>
        <AnimatedPressable
          style={{ marginTop: Space.lg, paddingHorizontal: Space.lg, paddingVertical: Space.md, backgroundColor: Colors.brand, borderRadius: Radius.lg }}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Text style={{ color: Colors.textInverse, fontFamily: Typography.family.semibold }}>Go back</Text>
        </AnimatedPressable>
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
  const seller = buildSellerTrustSummary(item.seller);

  const recommendationSections = recommendationsData?.sections ?? [];
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');
  const railSections = recommendationSections.filter(
    (s) => s.key !== 'seen_in_looks' && s.key !== 'continue_exploring'
  );

  const exploreItems: Listing[] = useMemo(() => {
    const allPages = exploreData?.pages ?? [];
    const items: Listing[] = [];
    for (const page of allPages) {
      const section = page.sections.find((s) => s.key === 'continue_exploring');
      if (section) items.push(...section.items);
    }
    return items;
  }, [exploreData]);

  const heroHeight = Math.min(screenHeight * 0.62, screenWidth * 1.35);

  const handlePressRecommendation = (recItem: Listing) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
  };

  const handlePressLook = (lookItem: Listing) => {
    if (lookItem.price === 0) {
      navigation.navigate('LookDetail', { lookId: lookItem.id });
    } else {
      navigation.push('ItemDetail', { itemId: lookItem.id });
    }
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
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 100 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        <ProductMediaGallery
          images={item.images}
          itemId={item.id}
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
          bigHeartOpacity={bigHeartOpacity}
          bigHeartScale={bigHeartScale}
        />

        <Reanimated.View entering={FadeInDown.duration(350).delay(80)}>
          <ProductIdentitySummary
            brand={item.brand}
            title={item.title}
            price={formattedPrice}
            originalPrice={formattedOriginal}
            hasDiscount={hasDiscount}
            protectionTotal={formattedProtectionTotal}
          />

          <ProductAttributeChips
            size={item.size}
            condition={item.condition}
            category={item.category}
          />

          <ProductDescription description={item.description} />

          {item.createdAt ? (
            <Text style={styles.postedDate}>Posted {item.createdAt}</Text>
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
            <SeenInLooksRail
              items={seenInLooksSection.items}
              onPressItem={handlePressLook}
            />
          )}

          {recsLoading && recommendationSections.length === 0 ? (
            <View style={styles.railLoading}>
              <ActivityIndicator size="small" color={Colors.textMuted} />
              <Text style={styles.railLoadingText}>Finding recommendations...</Text>
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
            <DiscoveryGrid
              items={exploreItems}
              listingId={item.id}
              onPressItem={handlePressRecommendation}
              onEndReached={() => exploreNextPage()}
              hasMore={!!exploreHasNextPage && !exploreFetching}
            />
          )}

          {recsError && recommendationSections.length === 0 && (
            <View style={styles.recErrorRow}>
              <Text style={styles.recErrorText}>
                Recommendations are temporarily unavailable.
              </Text>
            </View>
          )}
        </Reanimated.View>
      </Reanimated.ScrollView>

      <View style={[styles.actionBarWrap, { paddingBottom: Math.max(insets.bottom, Space.sm) }]}>
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
      </View>

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
  actionBarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
