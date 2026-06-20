import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
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
import { AppButton } from '../components/ui/AppButton';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';
import { FlagshipEmptyGraphic } from '../components/flagship';
import { ListingMediaHero } from '../components/listing/ListingMediaHero';
import { ListingIdentityBlock } from '../components/listing/ListingIdentityBlock';
import { ListingSellerRow } from '../components/listing/ListingSellerRow';

const { width, height } = Dimensions.get('window');

export default function ItemDetailScreen() {
  const { isDark } = useAppTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const isItemSavedAnywhere = useStore((state) => state.isItemSavedAnywhere);
  const isFav = useStore((state) => state.isWishlisted(route.params?.itemId));
  const toggleFav = useStore((state) => state.toggleWishlist);
  const currentUser = useStore((state) => state.currentUser);
  const { listings, source, isSyncing, lastError, refreshListings } = useBackendData();

  const { itemId } = route.params || {};
  const item = listings.find((l) => l.id === itemId);
  const resolvedSeller = item?.seller ?? undefined;
  const sellerItems = item ? listings.filter((l) => l.sellerId === item.sellerId && l.id !== item.id) : [];

  const [relatedListings, setRelatedListings] = React.useState<Listing[]>([]);
  const [relatedLoading, setRelatedLoading] = React.useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  React.useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    setRelatedLoading(true);
    import('../services/listingsApi').then(({ fetchRelatedListings }) =>
      fetchRelatedListings(itemId)
        .then((res) => {
          if (!cancelled && res.ok && res.items) setRelatedListings(res.items);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setRelatedLoading(false);
        })
    );
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const { formatFromFiat } = useFormattedPrice();

  if (!item) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: Space.xl }]}>
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

  const { show } = useToast();
  const haptic = useHaptic();

  const handleToggleFav = () => {
    toggleFav(item.id);
    if (!isFav) {
      show('Added to wishlist ♥', 'success');
    }
  };

  const handleShare = () => {
    setShareVisible(true);
  };

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const bigHeartScale = useSharedValue(0);
  const bigHeartOpacity = useSharedValue(0);

  const handleDoubleTap = () => {
    haptic.heavy();
    if (!isFav) {
      toggleFav(item.id);
      show('Added to wishlist ♥', 'success');
    }
    bigHeartOpacity.value = 1;
    bigHeartScale.value = withSequence(
      withSpring(1.5, Motion.spring.flagshipPop),
      withTiming(1.5, { duration: 400 }),
      withTiming(0, { duration: 200 })
    );
  };

  const onShare = useCallback(() => {
    handleShare();
  }, [handleShare]);

  const onToggleSaved = useCallback(() => {
    handleToggleFav();
  }, [handleToggleFav]);

  const isOwner = currentUser?.id && item.sellerId === currentUser.id;
  const hasDiscount = item.originalPrice !== undefined && item.originalPrice > item.price;
  const formattedPrice = formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' });
  const formattedOriginal = hasDiscount
    ? formatFromFiat(item.originalPrice!, 'GBP', { displayMode: 'fiat' })
    : null;

  const specs: { label: string; value: string }[] = [];
  if (item.size) specs.push({ label: 'Size', value: item.size });
  if (item.condition) specs.push({ label: 'Condition', value: item.condition });
  if (item.category) specs.push({ label: 'Category', value: item.category });
  if (item.brand) specs.push({ label: 'Brand', value: item.brand });

  const descriptionIsLong = item.description && item.description.length > 180;
  const displayDesc = descExpanded || !descriptionIsLong
    ? item.description
    : item.description.slice(0, 180) + '…';

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── 1. EDGE-TO-EDGE MEDIA HERO ── */}
      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 100 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        <ListingMediaHero
          images={item.images}
          itemId={item.id}
          isFav={isFav}
          isSaved={isItemSavedAnywhere(item.id)}
          isSold={!!item.isSold}
          topInset={insets.top}
          onBack={() => navigation.goBack()}
          onShare={() => { haptic.light(); handleShare(); }}
          onSave={() => { haptic.medium(); setCollectionModalVisible(true); }}
          onToggleFav={handleToggleFav}
          onDoubleTap={handleDoubleTap}
          bigHeartOpacity={bigHeartOpacity}
          bigHeartScale={bigHeartScale}
          scrollY={scrollY}
        />

        <Reanimated.View entering={FadeInDown.duration(350).delay(80)}>
          {/* ── 2. PRODUCT IDENTITY AND PRICE ── */}
          <ListingIdentityBlock
            brand={item.brand}
            title={item.title}
            price={formattedPrice}
            originalPrice={formattedOriginal}
            hasDiscount={hasDiscount}
          />

          {/* ── 3. ONE-LINE PURCHASE CONTEXT ── */}
          <View style={styles.purchaseContextRow}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.purchaseContextText}>
              Payment and delivery options are confirmed at checkout.
            </Text>
          </View>

          {/* ── 4. ESSENTIAL SPECIFICATIONS ── */}
          {specs.length > 0 && (
            <View style={styles.specsSection}>
              {specs.map((spec, i) => (
                <View
                  key={spec.label}
                  style={[styles.specRow, i < specs.length - 1 && styles.specRowBorder]}
                >
                  <Text style={styles.specLabel}>{spec.label}</Text>
                  <Text style={styles.specValue}>{spec.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 5. DESCRIPTION AND CONDITION ── */}
          {item.description ? (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionHeading}>Description</Text>
              <Text style={styles.descriptionText}>
                {displayDesc}
              </Text>
              {descriptionIsLong && (
                <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8}>
                  <Text style={styles.showMoreText}>
                    {descExpanded ? 'Show less' : 'Show more'}
                  </Text>
                </Pressable>
              )}
              {item.createdAt ? (
                <Text style={styles.postedDate}>Posted {item.createdAt}</Text>
              ) : null}
            </View>
          ) : null}

          {/* Sync retry */}
          {lastError ? (
            <SyncRetryBanner
              message="Pull latest listing changes now."
              onRetry={() => void refreshListings()}
              isRetrying={isSyncing}
              telemetryContext="item_detail_listing_sync"
              containerStyle={styles.syncRetry}
            />
          ) : null}

          {/* ── 6. SELLER IDENTITY ROW ── */}
          <View style={styles.sellerSection}>
            <ListingSellerRow
              seller={resolvedSeller}
              sellerId={item.sellerId}
              onProfilePress={() => navigation.navigate('UserProfile', { userId: resolvedSeller!.id })}
              onMessage={() => {
                if (!resolvedSeller?.id) return;
                navigation.navigate('NewMessage', {
                  preselectedUserId: resolvedSeller.id,
                  preselectedDisplayName: resolvedSeller.username,
                });
              }}
            />
          </View>

          {/* ── 7. DELIVERY AND PAYMENT ROWS ── */}
          <View style={styles.deliverySection}>
            <View style={styles.deliveryRow}>
              <Text style={styles.deliveryLabel}>Delivery</Text>
              <Text style={styles.deliveryValue}>Confirmed at checkout</Text>
            </View>
            <View style={[styles.deliveryRow, styles.deliveryRowLast]}>
              <Text style={styles.deliveryLabel}>Payment</Text>
              <Text style={styles.deliveryValue}>Through ThryftVerse checkout</Text>
            </View>
          </View>

          {/* ── 8. MORE FROM SELLER ── */}
          {sellerItems.length > 0 && resolvedSeller && (
            <View style={styles.railSection}>
              <DiscoverySectionHeader
                kicker="From the closet"
                title={`More from @${resolvedSeller.username || 'Seller'}`}
                actionLabel="See all"
                onAction={() => navigation.navigate('UserProfile', { userId: resolvedSeller.id })}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent}>
                {sellerItems.map((sItem) => (
                  <AnimatedPressable
                    key={sItem.id}
                    style={styles.railCard}
                    onPress={() => navigation.push('ItemDetail', { itemId: sItem.id })}
                  >
                    <SharedTransitionView
                      style={styles.railImageWrap}
                      sharedTransitionTag={`image-${sItem.id}-0`}
                    >
                      <CachedImage
                        uri={sItem.images?.[0] ?? ''}
                        style={styles.railImage}
                        containerStyle={{ width: '100%', height: '100%', borderRadius: 8 }}
                        contentFit="cover"
                      />
                    </SharedTransitionView>
                    {sItem.brand ? (
                      <Text style={styles.railBrand} numberOfLines={1}>{sItem.brand}</Text>
                    ) : null}
                    <Text style={styles.railPrice}>
                      {formatFromFiat(sItem.price, 'GBP', { displayMode: 'fiat' })}
                    </Text>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── 9. RELATED ITEMS ── */}
          {relatedListings.length > 0 && (
            <View style={styles.railSection}>
              <DiscoverySectionHeader
                kicker="You might like"
                title="Related items"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent}>
                {relatedListings.map((rItem) => (
                  <AnimatedPressable
                    key={rItem.id}
                    style={styles.railCard}
                    onPress={() => navigation.push('ItemDetail', { itemId: rItem.id })}
                  >
                    <SharedTransitionView
                      style={styles.railImageWrap}
                      sharedTransitionTag={`image-${rItem.id}-0`}
                    >
                      <CachedImage
                        uri={rItem.images?.[0] ?? ''}
                        style={styles.railImage}
                        containerStyle={{ width: '100%', height: '100%', borderRadius: 8 }}
                        contentFit="cover"
                      />
                    </SharedTransitionView>
                    {rItem.brand ? (
                      <Text style={styles.railBrand} numberOfLines={1}>{rItem.brand}</Text>
                    ) : null}
                    <Text style={styles.railPrice}>
                      {formatFromFiat(rItem.price, 'GBP', { displayMode: 'fiat' })}
                    </Text>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            </View>
          )}
        </Reanimated.View>
      </Reanimated.ScrollView>

      {/* ── 10. PERSISTENT COMMERCE ACTION BAR ── */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {item.isSold ? (
          <Text style={styles.soldStatus}>This item has been sold</Text>
        ) : isOwner ? (
          <View style={styles.actionRow}>
            <AppButton
              style={styles.actionBtn}
              variant="secondary"
              size="lg"
              title="Edit listing"
              icon={<Ionicons name="create-outline" size={14} color={Colors.textPrimary} />}
              onPress={() => navigation.navigate('EditListing', { itemId: item.id })}
              accessibilityLabel={`Edit ${item.title}`}
            />
            <AppButton
              style={styles.actionBtn}
              variant="primary"
              size="lg"
              title="Manage"
              icon={<Ionicons name="settings-outline" size={14} color={Colors.background} />}
              onPress={() => navigation.navigate('ManageListing', { itemId: item.id })}
              accessibilityLabel={`Manage ${item.title}`}
            />
          </View>
        ) : (
          <View style={styles.actionRow}>
            <AppButton
              style={styles.actionBtn}
              variant="secondary"
              size="lg"
              title="Make offer"
              icon={<Ionicons name="chatbubbles-outline" size={14} color={Colors.textPrimary} />}
              onPress={() => navigation.navigate('MakeOffer', { itemId: item.id, price: item.price, title: item.title })}
              accessibilityLabel={`Make an offer on ${item.title}`}
            />
            <AppButton
              style={styles.actionBtn}
              variant="primary"
              size="lg"
              title="Buy now"
              icon={<Ionicons name="flash-outline" size={15} color={Colors.background} />}
              onPress={() => navigation.navigate('Checkout', { itemId: item.id })}
              accessibilityLabel={`Buy ${item.title} for ${formattedPrice}`}
            />
          </View>
        )}
      </View>

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

  /* ── purchase context ── */
  purchaseContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  purchaseContextText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },

  /* ── specifications ── */
  specsSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  specRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  specLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  specValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },

  /* ── description ── */
  descriptionSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  sectionHeading: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  showMoreText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    marginTop: 6,
  },
  postedDate: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 10,
  },

  /* ── sync retry ── */
  syncRetry: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
  },

  /* ── seller section ── */
  sellerSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: Space.sm,
    paddingVertical: Space.sm,
  },

  /* ── delivery & payment ── */
  deliverySection: {
    paddingHorizontal: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  deliveryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  deliveryRowLast: {
    borderBottomWidth: 0,
  },
  deliveryLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  deliveryValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },

  /* ── related rails ── */
  railSection: {
    marginTop: Space.lg,
  },
  railContent: {
    gap: 10,
    paddingRight: 20,
    paddingHorizontal: Space.md,
  },
  railCard: {
    width: 140,
  },
  railImageWrap: {
    width: 140,
    height: 175,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  railImage: {
    width: '100%',
    height: '100%',
  },
  railBrand: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  railPrice: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },

  /* ── action bar ── */
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
  },
  soldStatus: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Space.md,
  },
});
