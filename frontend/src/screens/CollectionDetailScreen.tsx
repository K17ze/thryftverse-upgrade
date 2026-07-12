import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  Alert,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  FadeInDown,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAppTheme } from '../theme/ThemeContext';
import { Type, Space, Radius, DockConstants } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { MasonryGrid } from '../components/ProductCardV2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { Typography } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { BoardEmptyGraphic } from '../components/profile/BoardEmptyGraphic';
import { ShareSheet } from '../components/ShareSheet';
import { useReducedMotion } from '../hooks/useReducedMotion';
const { width: SCREEN_W } = Dimensions.get('window');
const COVER_H = 180;
type NavT = StackNavigationProp<RootStackParamList>;

export default function CollectionDetailScreen() {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const route = useRoute<any>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const [refreshing, setRefreshing] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const scrollY = useSharedValue(0);
  const reducedMotionEnabled = useReducedMotion();

  const collectionId = route.params?.collectionId;

  const collections = useStore((state) => state.collections);
  const deleteCollectionOnApi = useStore((state) => state.deleteCollectionOnApi);
  const { listings, refreshListings } = useBackendData();

  const collection = useMemo(
    () => collections.find((c) => c.id === collectionId),
    [collections, collectionId]
  );

  const collectionItems = useMemo(
    () => listings.filter((l) => collection?.itemIds?.includes(l.id) ?? false),
    [listings, collection]
  );

  const coverImage = useMemo(() => {
    if (!collection?.itemIds?.length) return null;
    const firstItem = listings.find((l) => l.id === collection.itemIds[0]);
    return firstItem?.images?.[0] ?? null;
  }, [collection, listings]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
    setTimeout(() => setRefreshing(false), 350);
  };

  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Closet');
    }
  }, [navigation]);

  const handleDelete = useCallback(async () => {
    haptic.heavy();
    Alert.alert(
      'Delete Collection',
      `Are you sure you want to delete "${collection?.name}"? Items will remain in your Saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (collectionId) {
              try {
                await deleteCollectionOnApi(collectionId);
                show('Collection deleted', 'info');
                handleGoBack();
              } catch {
                show('Unable to delete collection. Please try again.', 'error');
              }
            }
          },
        },
      ]
    );
  }, [collection, collectionId, deleteCollectionOnApi, haptic, show, handleGoBack]);

  const handleShare = useCallback(() => {
    haptic.light();
    setShareVisible(true);
  }, [haptic]);

  const handleToggleFollow = useCallback(() => {
    haptic.light();
    setIsFollowing((prev) => {
      const next = !prev;
      show(next ? `Following "${collection?.name}"` : `Unfollowed "${collection?.name}"`, 'info');
      return next;
    });
  }, [haptic, show, collection]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, COVER_H - 60],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  if (!collection) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <EmptyState
          icon="alert-circle-outline"
          title="Collection not found"
          subtitle="This collection may have been deleted."
          ctaLabel="Go Back"
          onCtaPress={handleGoBack}
        />
      </SafeAreaView>
    );
  }

  const count = collectionItems.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Floating Header with scroll fade */}
      <Reanimated.View style={[styles.floatingHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }, headerBgStyle]}>
        <View style={styles.headerInner}>
          <AnimatedPressable style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={handleGoBack} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={[styles.floatingTitle, { color: colors.textPrimary }]} numberOfLines={1}>{collection.name}</Text>
          <View style={{ width: 40 }} />
        </View>
      </Reanimated.View>

      {/* Top-left back button (always visible over cover) */}
      <View style={styles.absoluteBack} pointerEvents="box-none">
        <AnimatedPressable style={[styles.backBtn, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'transparent' }]} onPress={handleGoBack} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </AnimatedPressable>
      </View>

      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

      <Reanimated.ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
      >
        {/* Cover Image Hero */}
        {coverImage && (
          <View style={styles.coverWrap}>
            <CachedImage uri={coverImage} style={styles.coverImage} contentFit="cover" />
            <View style={styles.coverGradient} />
            <View style={styles.coverInfo}>
              <View style={styles.coverTitleRow}>
                <Text style={styles.coverTitle} numberOfLines={1}>{collection.name}</Text>
                {collection.isPrivate && (
                  <View style={styles.privacyBadge}>
                    <Ionicons name="lock-closed" size={10} color={colors.textInverse} />
                    <Text style={[styles.privacyText, { color: colors.textInverse }]}>Private</Text>
                  </View>
                )}
              </View>
              {collection.description ? (
                <Text style={styles.coverDesc} numberOfLines={2}>{collection.description}</Text>
              ) : null}
              <Text style={styles.coverMeta}>{count} {count === 1 ? 'item' : 'items'}</Text>
            </View>
            {/* Actions overlay */}
            <View style={styles.coverActions} pointerEvents="box-none">
              <View style={{ width: 40 }} />
              <View style={styles.actionRow}>
                {!collection.isPrivate && (
                  <AnimatedPressable
                    style={[styles.actionBtnOverlay, isFollowing && styles.actionBtnOverlayActive]}
                    onPress={handleToggleFollow}
                    activeOpacity={0.85}
                    accessibilityLabel={isFollowing ? 'Unfollow collection' : 'Follow collection'}
                    accessibilityRole="button"
                  >
                    <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} size={18} color={isFollowing ? colors.brand : '#fff'} />
                  </AnimatedPressable>
                )}
                <AnimatedPressable
                  style={styles.actionBtnOverlay}
                  onPress={handleShare}
                  activeOpacity={0.85}
                  accessibilityLabel="Share collection"
                  accessibilityRole="button"
                >
                  <Ionicons name="share-outline" size={18} color="#fff" />
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.actionBtnOverlay}
                  onPress={() => { haptic.light(); navigation.navigate('EditCollection', { collectionId }); }}
                  activeOpacity={0.85}
                  accessibilityLabel="Edit collection"
                  accessibilityRole="button"
                >
                  <Ionicons name="settings-outline" size={18} color="#fff" />
                </AnimatedPressable>
              </View>
            </View>
          </View>
        )}

        {/* Fallback header when no cover */}
        {!coverImage && (
          <View style={styles.noCoverHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.coverTitleRow}>
                <Text style={[styles.noCoverTitle, { color: colors.textPrimary }]}>{collection.name}</Text>
                {collection.isPrivate && (
                  <View style={[styles.privacyBadgeOutline, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                    <Text style={[styles.privacyTextOutline, { color: colors.textMuted }]}>Private</Text>
                  </View>
                )}
              </View>
              {collection.description ? (
                <Text style={[styles.noCoverDesc, { color: colors.textSecondary }]} numberOfLines={2}>{collection.description}</Text>
              ) : null}
              <Text style={[styles.noCoverMeta, { color: colors.textMuted }]}>{count} {count === 1 ? 'item' : 'items'}</Text>
            </View>
            <View style={styles.actionRow}>
              {!collection.isPrivate && (
                <AnimatedPressable
                  style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.surface }, isFollowing && { borderColor: colors.brand, backgroundColor: `${colors.brand}15` }]}
                  onPress={handleToggleFollow}
                  activeOpacity={0.85}
                  accessibilityLabel={isFollowing ? 'Unfollow collection' : 'Follow collection'}
                  accessibilityRole="button"
                >
                  <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} size={20} color={isFollowing ? colors.brand : colors.textPrimary} />
                </AnimatedPressable>
              )}
              <AnimatedPressable
                style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={handleShare}
                activeOpacity={0.85}
                accessibilityLabel="Share collection"
                accessibilityRole="button"
              >
                <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => { haptic.light(); navigation.navigate('EditCollection', { collectionId }); }}
                activeOpacity={0.85}
                accessibilityLabel="Edit collection"
                accessibilityRole="button"
              >
                <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
              </AnimatedPressable>
            </View>
          </View>
        )}

        {/* Manage items row */}
        {count > 0 && (
          <AnimatedPressable
            style={[styles.manageRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('ManageCollectionItems', { collectionId })}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel="Manage collection items"
            accessibilityRole="button"
          >
            <Ionicons name="list-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.manageRowText, { color: colors.textPrimary }]}>Manage items</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </AnimatedPressable>
        )}

        {/* Grid */}
        {count > 0 && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={{ marginTop: Space.md }}>
            <MasonryGrid
              items={collectionItems}
              onPressItem={(item: any) => navigation.navigate('ItemDetail', { itemId: item.id })}
              numColumns={2}
              showSaveButton
            />
          </Reanimated.View>
        )}
        {count === 0 && (
          <EmptyState
            graphic={<BoardEmptyGraphic title="Empty collection" subtitle="Add items to this board" icon="folder-open-outline" size={140} />}
            title="Empty collection"
            subtitle="Browse items and add them to this collection."
            ctaLabel="Browse"
            onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
          />
        )}

        {/* More like this */}
        <MoreLikeThisRow collectionItems={collectionItems} listings={listings} navigation={navigation} formatFromFiat={formatFromFiat} />

        <View style={{ height: DockConstants.singleActionHeight }} />
      </Reanimated.ScrollView>

      {/* Share sheet */}
      <ShareSheet
        visible={shareVisible}
        onDismiss={() => setShareVisible(false)}
        url={`https://thryftverse.app/collection/${collectionId}`}
        title={collection.name}
        imageUri={coverImage ?? undefined}
      />

    </SafeAreaView>
  );
}

// ============================================================================
// More Like This Row
// ============================================================================
function MoreLikeThisRow({
  collectionItems,
  listings,
  navigation,
  formatFromFiat,
}: {
  collectionItems: any[];
  listings: any[];
  navigation: any;
  formatFromFiat: any;
}) {
  const { colors } = useAppTheme();
  const similarItems = React.useMemo(() => {
    if (collectionItems.length === 0) return [];
    const brands = new Set(collectionItems.map((i) => i.brand?.toLowerCase()));
    const cats = new Set(collectionItems.map((i) => i.category?.toLowerCase()));
    return listings
      .filter((l) => !collectionItems.some((c) => c.id === l.id))
      .filter((l) => brands.has(l.brand?.toLowerCase()) || cats.has(l.category?.toLowerCase()))
      .slice(0, 10);
  }, [collectionItems, listings]);

  if (similarItems.length === 0) return null;

  return (
    <View style={{ marginTop: 32, paddingBottom: 8 }}>
      <Text style={[styles.moreTitle, { color: colors.textPrimary }]}>More like this</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }}>
        {similarItems.map((item) => (
          <AnimatedPressable
            key={item.id}
            style={styles.moreCard}
            onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
            activeOpacity={0.9}
          >
            <SharedTransitionView
              style={styles.moreMediaWrap}
              sharedTransitionTag={"image-"+item.id+"-0"}
            >
              <CachedImage
                uri={item.images?.[0] ?? ''}
                style={styles.moreImg}
                containerStyle={{ width: '100%', height: '100%', borderRadius: 12 }}
                contentFit="cover"
              />
            </SharedTransitionView>
            <Text style={[styles.morePrice, { color: colors.textPrimary }]}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderBottomWidth: 1,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: 44,
    paddingBottom: Space.sm,
    gap: Space.sm,
  },
  floatingTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: Typography.family.bold,
    textAlign: 'center',
  },
  absoluteBack: {
    position: 'absolute',
    top: 44,
    left: Space.md,
    zIndex: 60,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverWrap: {
    width: SCREEN_W,
    height: COVER_H,
    position: 'relative',
    marginBottom: Space.md,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  coverInfo: {
    position: 'absolute',
    bottom: Space.md,
    left: Space.md,
    right: Space.md,
  },
  coverTitle: {
    fontSize: 24,
    fontFamily: Typography.family.bold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  coverMeta: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  coverActions: {
    position: 'absolute',
    top: 44,
    left: Space.md,
    right: Space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  actionBtnOverlay: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnOverlayActive: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  noCoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  noCoverTitle: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
  },
  noCoverMeta: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    marginTop: 2,
  },
  coverTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  coverDesc: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  noCoverDesc: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  privacyText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
  privacyBadgeOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  privacyTextOutline: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    borderWidth: 1,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  manageRowText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.family.semibold,
  },
  listContent: {
    paddingBottom: 120,
  },
  moreTitle: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    marginBottom: 14,
    paddingHorizontal: Space.md,
  },
  moreCard: {
    width: 140,
    paddingLeft: Space.md,
  },
  moreMediaWrap: {
    width: 140,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  moreImg: {
    width: '100%',
    height: '100%',
  },
  morePrice: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
  },
});