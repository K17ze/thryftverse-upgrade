import { Typography } from '../constants/typography';
import React, { useState, useCallback } from 'react';
import {
  AnimatedPressable
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { CachedImage } from '../components/CachedImage';
import Reanimated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ActiveTheme, Colors } from '../constants/colors';
import { MOCK_LISTINGS, MOCK_USERS, Listing, User } from '../data/mockData';
import { mockFind, mockFallback } from '../utils/mockGate';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { ImageViewer } from '../components/ImageViewer';
import { AnimatedHeart } from '../components/AnimatedHeart';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Motion } from '../constants/motion';
// Phase 3: Removed SyncStatusPill - no status indicators on detail screen
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useBackendData } from '../context/BackendDataContext';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { AppButton } from '../components/ui/AppButton';
import { ActivityBadge, ActivityBadgeRow } from '../components/ui/ActivityBadge';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { Space, Radius } from '../theme/designTokens';
import { T } from '../components/ui/Text';

const { width, height } = Dimensions.get('window');
const PANEL_BG = Colors.surface;
const PANEL_ALT_BG = Colors.background;
const PANEL_BORDER = Colors.border;
const TOP_SCRIM_BG = 'rgba(0,0,0,0.2)';

export default function ItemDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  // Collection modal state
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const isItemSavedAnywhere = useStore((state) => state.isItemSavedAnywhere);

  const isFav = useStore(state => state.isWishlisted(route.params?.itemId));
  const toggleFav = useStore(state => state.toggleWishlist);
  const { listings, source, isSyncing, lastError, refreshListings } = useBackendData();

  const { itemId } = route.params || {};
  const backendItem = listings.find(l => l.id === itemId);
  const mockItem = mockFind(MOCK_LISTINGS, l => l.id === itemId);
  const fallbackItem = listings[0] ?? mockFind(MOCK_LISTINGS, () => true);
  const item: Listing = backendItem ?? mockItem ?? fallbackItem!;
  const seller: User = mockFind(MOCK_USERS, u => u.id === item.sellerId) ?? MOCK_USERS[0];
  const sellerItems = listings.filter(l => l.sellerId === seller.id && l.id !== item.id);
  const otherListings = listings.filter(l => l.id !== item.id).slice(0, 12);

  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const haptic = useHaptic();

  const detailStatus = React.useMemo(
    () =>
      getBackendSyncStatus({
        isSyncing,
        source,
        hasError: Boolean(lastError),
        labels: {
          live: 'Synced listing',
        },
      }),
    [isSyncing, lastError, source],
  );

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

  const heroStyle = useAnimatedStyle(() => {
    const overscroll = Math.min(scrollY.value, 0);
    const pullDownTranslate = interpolate(overscroll, [-120, 0], [-56, 0], Extrapolation.CLAMP);
    const parallaxTranslate = interpolate(scrollY.value, [0, 360], [0, 90], Extrapolation.CLAMP);
    const scale = interpolate(overscroll, [-120, 0], [1.16, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: pullDownTranslate + parallaxTranslate }, { scale }],
    };
  });

  // Big heart for double tap animation
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

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: bigHeartOpacity.value,
    transform: [{ scale: bigHeartScale.value }],
  }));

  const onShare = useCallback(() => {
    handleShare();
  }, [handleShare]);

  const onToggleSaved = useCallback(() => {
    handleToggleFav();
  }, [handleToggleFav]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 126 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >

        {/* ── Image Carousel ── */}
        <Reanimated.View style={[styles.heroContainer, heroStyle]}>
          <ImageViewer images={item.images} height={height * 0.65} onDoubleTap={handleDoubleTap} itemId={item.id} />

          <View style={styles.heroTopScrim} />

          <Reanimated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }, bigHeartStyle]}>
            <Ionicons name="heart" size={100} color="#fff" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 }} />
          </Reanimated.View>

          {item.isSold && (
            <View style={styles.soldOverlay}>
              <Text style={styles.soldText}>SOLD</Text>
            </View>
          )}

          <View style={[styles.floatingHeader, { paddingTop: Math.max(insets.top, 20) }]}>
            <AnimatedPressable style={styles.blurBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </AnimatedPressable>
            <View style={styles.headerRight}>
              <AnimatedPressable style={styles.blurBtn} onPress={handleShare} accessibilityLabel="Share this listing">
                <Ionicons name="share-outline" size={24} color="#fff" />
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.blurBtn}
                onPress={() => setCollectionModalVisible(true)}
                accessibilityLabel={isItemSavedAnywhere(item?.id) ? 'Saved to collection' : 'Save to collection'}
                accessibilityHint="Opens collection picker"
              >
                <Ionicons
                  name={isItemSavedAnywhere(item?.id) ? 'bookmark' : 'bookmark-outline'}
                  size={24}
                  color={isItemSavedAnywhere(item?.id) ? Colors.brand : '#fff'}
                />
              </AnimatedPressable>
              <View style={styles.blurBtn}>
                <AnimatedHeart
                  isActive={isFav}
                  onToggle={handleToggleFav}
                  size={24}
                  activeColor={Colors.danger}
                  inactiveColor="#fff"
                />
              </View>
            </View>
          </View>
        </Reanimated.View>

        <View style={styles.detailsContainer}>

          {/* ── Title ── */}
          <Text style={styles.title}>{item.title}</Text>

          {/* ── Price ── */}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
            {item.priceWithProtection > item.price && (
              <Text style={styles.protectionText}>
                + {formatFromFiat(item.priceWithProtection - item.price, 'GBP', { displayMode: 'fiat' })} protection
              </Text>
            )}
          </View>

          {/* ── Product Attributes ── */}
          <View style={styles.attributesRow}>
            <View style={styles.attributeChip}>
              <Text style={styles.attributeLabel}>Brand</Text>
              <Text style={styles.attributeValue} numberOfLines={1}>{item.brand}</Text>
            </View>
            <View style={styles.attributeChip}>
              <Text style={styles.attributeLabel}>Size</Text>
              <Text style={styles.attributeValue}>{item.size}</Text>
            </View>
            <View style={styles.attributeChip}>
              <Text style={styles.attributeLabel}>Condition</Text>
              <Text style={styles.attributeValue}>{item.condition}</Text>
            </View>
          </View>

          {/* ── Description ── */}
          <View style={styles.descriptionBox}>
            <Text style={styles.description}>{item.description}</Text>
            <Text style={styles.timePosted}>Posted 2 hours ago · {seller.location}</Text>
          </View>

          {/* ── Social Proof & Scarcity ── */}
          <ActivityBadgeRow
            badges={[
              { variant: 'closeted', count: Math.max(3, (item.likes ?? 0) % 47 + 5), label: 'in closets' },
              { variant: 'viewers', count: Math.max(1, (item.id.charCodeAt(0) % 8) + 1), label: 'viewing now' },
              ...(item.price < 50 ? [{ variant: 'fastSelling' as const, label: 'selling fast' }] : []),
              ...(item.condition === 'New with tags' ? [{ variant: 'rareItem' as const, label: 'new with tags' }] : []),
            ]}
            style={{ marginBottom: Space.md }}
          />

          {/* Phase 3: Removed sync status card - cleaner detail view */}
          {lastError ? (
            <SyncRetryBanner
              message="Pull latest listing changes now."
              onRetry={() => void refreshListings()}
              isRetrying={isSyncing}
              telemetryContext="item_detail_listing_sync"
              containerStyle={styles.syncRetryBanner}
            />
          ) : null}

          {/* ── Seller Card (single, comprehensive) ── */}
          <View style={styles.sellerCard}>
            <AnimatedPressable
              style={styles.sellerIdentityTap}
              onPress={() => navigation.navigate('UserProfile', { userId: seller.id })}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={`Open @${seller.username} profile`}
            >
              <CachedImage uri={seller.avatar} style={styles.sellerAvatar} containerStyle={{ width: 52, height: 52, borderRadius: 26 }} contentFit="cover" />
              <View style={styles.sellerInfo}>
                <Text style={styles.sellerName}>@{seller.username}</Text>
                <View style={styles.sellerMetaRow}>
                  <Ionicons name="star" size={12} color={Colors.brand} />
                  <Text style={styles.sellerStats}>{seller.rating} · {seller.reviewCount} reviews</Text>
                </View>
                <Text style={styles.sellerLastSeen}>Last seen {seller.lastSeen} · {seller.location}</Text>
              </View>
            </AnimatedPressable>

            <AppButton
              title="Message"
              style={styles.messageSellerBtn}
              titleStyle={styles.messageSellerBtnText}
              variant="secondary"
              size="sm"
              onPress={() =>
                navigation.navigate('Chat', {
                  conversationId: `${seller.id}_${item.id}`,
                  focusQuery: seller.username,
                  partnerUserId: seller.id,
                })}
            />
          </View>

          {/* ── More from this seller ── */}
          {sellerItems.length > 0 && (
            <View style={styles.sellerItemsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>More from @{seller.username}</Text>
                <AnimatedPressable onPress={() => navigation.navigate('UserProfile', { userId: seller.id })}>
                  <Text style={styles.sectionLink}>See all</Text>
                </AnimatedPressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }}>
                {sellerItems.map(sItem => (
                  <AnimatedPressable
                    key={sItem.id}
                    style={styles.sellerItemCard}
                    onPress={() => navigation.push('ItemDetail', { itemId: sItem.id })}
                  >
                    <SharedTransitionView
                      style={styles.sellerItemMediaWrap}
                      sharedTransitionTag={`image-${sItem.id}-0`}
                    >
                      <CachedImage uri={sItem.images[0]} style={styles.sellerItemImg} containerStyle={{ width: '100%', height: '100%', borderRadius: 14 }} contentFit="cover" />
                    </SharedTransitionView>
                    <Text style={styles.sellerItemPrice}>{formatFromFiat(sItem.price, 'GBP', { displayMode: 'fiat' })}</Text>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── You may also like ── */}
          {otherListings.length > 0 && (
            <View style={styles.sellerItemsSection}>
              <Text style={styles.sectionTitle}>You may also like</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }}>
                {otherListings.map(oItem => (
                  <AnimatedPressable
                    key={oItem.id}
                    style={styles.sellerItemCard}
                    onPress={() => navigation.push('ItemDetail', { itemId: oItem.id })}
                  >
                    <SharedTransitionView
                      style={styles.sellerItemMediaWrap}
                      sharedTransitionTag={`image-${oItem.id}-0`}
                    >
                      <CachedImage uri={oItem.images[0]} style={styles.sellerItemImg} containerStyle={{ width: '100%', height: '100%', borderRadius: 14 }} contentFit="cover" />
                    </SharedTransitionView>
                    <Text style={styles.sellerItemPrice}>{formatFromFiat(oItem.price, 'GBP', { displayMode: 'fiat' })}</Text>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Reanimated.ScrollView>

      {/* ── Floating Buy Bar ── */}
      {!item.isSold && (
        <Reanimated.View style={[styles.floatingBuyBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <BlurView intensity={85} tint={ActiveTheme === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFillObject} />
          <AppButton
            style={styles.actionBtn}
            variant="primary"
            size="lg"
            title="Buy now"
            icon={<Ionicons name="flash-outline" size={15} color={Colors.background} />}
            onPress={() => navigation.navigate('Checkout', { itemId: item.id })}
            accessibilityLabel={`Buy ${item.title} for ${formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}`}
          />
          <AppButton
            style={styles.actionBtn}
            variant="secondary"
            size="lg"
            title="Make offer"
            icon={<Ionicons name="chatbubbles-outline" size={14} color={Colors.textPrimary} />}
            onPress={() => navigation.navigate('MakeOffer', { itemId: item.id, price: item.price, title: item.title })}
            accessibilityLabel={`Make an offer on ${item.title}`}
          />
        </Reanimated.View>
      )}

      <SaveToCollectionModal
        visible={collectionModalVisible}
        itemId={item?.id}
        onClose={() => setCollectionModalVisible(false)}
      />

      <ShareSheet
        visible={shareVisible}
        onDismiss={() => setShareVisible(false)}
        url={`https://thryftverse.com/item/${item?.id}`}
        title={item?.title ?? 'Check out this listing'}
        imageUri={item?.images?.[0]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heroContainer: {
    width: width,
    height: height * 0.65,
    position: 'relative',
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  heroTopScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 132, backgroundColor: TOP_SCRIM_BG },
  heroImage: { width: width, height: '100%' },
  soldOverlay: { position: 'absolute', bottom: 32, left: 20, backgroundColor: Colors.success, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  soldText: { color: Colors.background, fontSize: 16, fontFamily: Typography.family.bold, letterSpacing: 1 },
  floatingHeader: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, zIndex: 10 },
  headerRight: { flexDirection: 'row', gap: 12 },
  blurBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  detailsContainer: { paddingHorizontal: 20, paddingTop: 24 },
  price: { fontSize: 38, fontFamily: Typography.family.semibold, color: Colors.textPrimary, letterSpacing: -0.9, marginBottom: 2 },
  brand: { fontSize: 15, fontFamily: Typography.family.light, color: Colors.textSecondary, letterSpacing: 0.34, marginBottom: 8 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 8,
  },
  protectionText: { fontSize: 13, color: Colors.textMuted, fontFamily: Typography.family.medium },
  title: { fontSize: 22, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: 6, lineHeight: 30 },
  sizeCondition: { fontSize: 15, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  syncStatusCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderLight,
    backgroundColor: PANEL_ALT_BG,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm - Space.xs,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  syncStatusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  syncStatusHint: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  syncRetryBanner: {
    marginTop: Space.md - Space.xs,
  },
  syncFallbackHint: {
    marginTop: 8,
    flex: 1,
    backgroundColor: PANEL_BG,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
  },
  attributesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  attributeChip: {
    flex: 1,
    backgroundColor: PANEL_BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    alignItems: 'center',
  },
  attributeLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  attributeValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  descriptionBox: {
    marginTop: 4,
    backgroundColor: PANEL_BG,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
  },
  description: { fontSize: 15, fontFamily: Typography.family.regular, color: Colors.textSecondary, lineHeight: 24 },
  timePosted: { fontSize: 12, fontFamily: Typography.family.medium, color: Colors.textMuted, marginTop: 12 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  statsText: { fontSize: 12, color: Colors.textSecondary, marginLeft: 6, fontFamily: Typography.family.medium },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: PANEL_BG,
    gap: 12,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
  },
  sellerIdentityTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sellerAvatar: { width: 52, height: 52, borderRadius: 26 },
  sellerInfo: { flex: 1 },
  sellerName: { fontSize: 15, fontFamily: Typography.family.semibold, color: Colors.textPrimary },
  sellerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  sellerStats: { fontSize: 13, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  sellerLastSeen: { fontSize: 12, fontFamily: Typography.family.regular, color: Colors.textMuted, marginTop: 2 },
  messageSellerBtn: {
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    backgroundColor: Colors.background,
  },
  messageSellerBtnText: { color: Colors.textPrimary, fontSize: 13, fontFamily: Typography.family.semibold },
  sellerItemsSection: { marginTop: 28, paddingBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingRight: 4,
  },
  sectionTitle: { fontSize: 16, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  sectionLink: { fontSize: 13, fontFamily: Typography.family.semibold, color: Colors.brand },
  sellerItemCard: { width: 140 },
  sellerItemMediaWrap: { width: 140, height: 180, borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  sellerItemImg: { width: '100%', height: '100%' },
  sellerItemPrice: { fontSize: 14, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  floatingBuyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.1)',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  actionBtn: {
    flex: 1,
  },
});
