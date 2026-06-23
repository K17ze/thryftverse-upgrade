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
import { ActiveTheme, Colors } from '../constants/colors';
import { Type, Space, Radius } from '../theme/designTokens';
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
const { width: SCREEN_W } = Dimensions.get('window');
const COVER_H = 180;
type NavT = StackNavigationProp<RootStackParamList>;

export default function CollectionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<any>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);

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
      <SafeAreaView style={styles.container} edges={['top']}>
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* Floating Header with scroll fade */}
      <Reanimated.View style={[styles.floatingHeader, headerBgStyle]}>
        <View style={styles.headerInner}>
          <AnimatedPressable style={styles.backBtn} onPress={handleGoBack} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.floatingTitle} numberOfLines={1}>{collection.name}</Text>
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
                    <Ionicons name="lock-closed" size={10} color={Colors.textInverse} />
                    <Text style={styles.privacyText}>Private</Text>
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
                <AnimatedPressable style={styles.actionBtnOverlay} onPress={() => { haptic.light(); navigation.navigate('EditCollection', { collectionId }); }} activeOpacity={0.85} accessibilityLabel="Edit collection">
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
                <Text style={styles.noCoverTitle}>{collection.name}</Text>
                {collection.isPrivate && (
                  <View style={styles.privacyBadgeOutline}>
                    <Ionicons name="lock-closed" size={10} color={Colors.textMuted} />
                    <Text style={styles.privacyTextOutline}>Private</Text>
                  </View>
                )}
              </View>
              {collection.description ? (
                <Text style={styles.noCoverDesc} numberOfLines={2}>{collection.description}</Text>
              ) : null}
              <Text style={styles.noCoverMeta}>{count} {count === 1 ? 'item' : 'items'}</Text>
            </View>
            <View style={styles.actionRow}>
              <AnimatedPressable style={styles.actionBtn} onPress={() => { haptic.light(); navigation.navigate('EditCollection', { collectionId }); }} activeOpacity={0.85}>
                <Ionicons name="settings-outline" size={20} color={Colors.textPrimary} />
              </AnimatedPressable>
            </View>
          </View>
        )}

        {/* Manage items row */}
        {count > 0 && (
          <AnimatedPressable
            style={styles.manageRow}
            onPress={() => navigation.navigate('ManageCollectionItems', { collectionId })}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel="Manage collection items"
            accessibilityRole="button"
          >
            <Ionicons name="list-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.manageRowText}>Manage items</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </AnimatedPressable>
        )}

        {/* Grid */}
        {count > 0 && (
          <Reanimated.View entering={FadeInDown.duration(300)} style={{ marginTop: Space.md }}>
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

        <View style={{ height: 120 }} />
      </Reanimated.ScrollView>

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
      <Text style={styles.moreTitle}>More like this</Text>
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
            <Text style={styles.morePrice}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    color: Colors.textPrimary,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
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
  noCoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  noCoverTitle: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  noCoverMeta: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
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
    color: Colors.textSecondary,
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
    color: Colors.textInverse,
  },
  privacyBadgeOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  privacyTextOutline: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: Colors.textMuted,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  manageRowText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  listContent: {
    paddingBottom: 120,
  },
  moreTitle: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
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
    color: Colors.textPrimary,
  },
});