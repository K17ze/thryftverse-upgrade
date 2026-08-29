import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  useWindowDimensions,
  ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { ClosetMediaMosaic } from '../components/closet/ClosetMediaMosaic';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnectivity } from '../hooks/useConnectivity';
import { BoardEmptyGraphic } from '../components/profile/BoardEmptyGraphic';
import { ShareSheet } from '../components/ShareSheet';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { Space, Radius, DockConstants, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
const COVER_H = 220;

/**
 * Relative-time formatter for "last updated" metadata.
 * Returns compact strings: "now", "3d", "2w", "1mo", "1y".
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}
type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function CollectionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<any>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const { colors, isDark } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { width: SCREEN_W } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, SCREEN_W), [colors, SCREEN_W]);
  const [refreshing, setRefreshing] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });
  const scrollY = useSharedValue(0);

  const collectionId = route.params?.collectionId;

  const collections = useStore((state) => state.collections);
  const deleteCollectionOnApi = useStore((state) => state.deleteCollectionOnApi);
  const { listings, refreshListings } = useBackendData();
  const { isOffline } = useConnectivity();

  const collection = useMemo(
    () => collections.find((c) => c.id === collectionId),
    [collections, collectionId]
  );

  const collectionItems = useMemo(
    () => listings.filter((l) => collection?.itemIds?.includes(l.id) ?? false),
    [listings, collection]
  );

  const coverImages = useMemo(() => {
    if (!collection?.itemIds?.length) return [];
    return collection.itemIds
      .slice(0, 4)
      .map((id) => listings.find((l) => l.id === id))
      .filter((l): l is NonNullable<typeof l> => !!l)
      .map((l) => l.images?.[0])
      .filter((uri): uri is string => !!uri);
  }, [collection, listings]);

  const coverImage = coverImages[0] ?? null;

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
    setConfirmSheet({
      visible: true,
      title: 'Delete Collection',
      message: `Are you sure you want to delete "${collection?.name}"? Items will remain in your Saved.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        if (collectionId) {
          try {
            await deleteCollectionOnApi(collectionId);
            show('Collection deleted', 'info');
            handleGoBack();
          } catch {
            show('Unable to delete collection. Try again.', 'error');
          }
        }
      } });
  }, [collection, collectionId, deleteCollectionOnApi, haptic, show, handleGoBack]);

  const handleShare = useCallback(() => {
    haptic.light();
    setShareVisible(true);
  }, [haptic]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    } });

  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, COVER_H - 60],
      [0, 1],
      Extrapolation.CLAMP
    ) }));

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
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* Floating Header with scroll fade */}
      <Reanimated.View style={[styles.floatingHeader, headerBgStyle]}>
        <View style={styles.headerInner}>
          <AnimatedPressable style={styles.backBtn} onPress={handleGoBack} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.floatingTitle} numberOfLines={1}>{collection.name}</Text>
          <View style={{ width: 40 }} />
        </View>
      </Reanimated.View>

      {/* Top-left back button (always visible over cover) — transparent
          44pt hit target; glyph legibility from the text-shadow scrim.
          No circular chrome per AGENTS.md §4 (separate hit area from visible shape). */}
      <View style={styles.absoluteBack} pointerEvents="box-none">
        <AnimatedPressable style={styles.backBtnOverlay} onPress={handleGoBack} activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.scrimTextPrimary} style={styles.backBtnGlyph} />
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
        {/* Cover Image Hero — 2x2 mosaic from first 2-4 items */}
        {coverImages.length > 0 && (
          <View style={styles.coverWrap}>
            {coverImages.length === 1 ? (
              <CachedImage uri={coverImages[0]} style={styles.coverImage} contentFit="cover" />
            ) : (
              <View style={styles.coverMosaic}>
                {coverImages.map((uri, i) => (
                  <CachedImage
                    key={uri + i}
                    uri={uri}
                    style={styles.coverMosaicTile}
                    contentFit="cover"
                  />
                ))}
                {/* Fill empty slots with dark tiles */}
                {Array.from({ length: 4 - coverImages.length }).map((_, i) => (
                  <View key={`empty-${i}`} style={[styles.coverMosaicTile, { backgroundColor: colors.surfaceAlt }]} />
                ))}
              </View>
            )}
            <LinearGradient
              colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.55)']}
              style={styles.coverGradient}
            />
            <View style={styles.coverInfo}>
              <View style={styles.coverTitleRow}>
                <Text style={styles.coverTitle} numberOfLines={1}>{collection.name}</Text>
                {collection.isPrivate && (
                  <View style={styles.privacyBadge}>
                    <Ionicons name="lock-closed" size={10} color={colors.scrimTextPrimary} />
                    <Text style={styles.privacyText}>Private</Text>
                  </View>
                )}
              </View>
              {collection.description ? (
                <Text style={styles.coverDesc} numberOfLines={2}>{collection.description}</Text>
              ) : null}
              <View style={styles.coverMetaRow}>
                <Text style={styles.coverMeta}>{count} {count === 1 ? 'item' : 'items'}</Text>
                {collection.updatedAt ? (
                  <>
                    <Text style={styles.coverMetaDot}>·</Text>
                    <Text style={styles.coverMetaUpdated}>Updated {formatRelativeTime(collection.updatedAt)}</Text>
                  </>
                ) : null}
              </View>
            </View>
            {/* Actions overlay */}
            <View style={styles.coverActions} pointerEvents="box-none">
              <View style={{ width: 40 }} />
              <View style={styles.actionRow}>
                <AnimatedPressable
                  style={styles.actionBtnOverlay}
                  onPress={handleShare}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Share collection"
                  accessibilityRole="button"
                >
                  <Ionicons name="share-outline" size={18} color={colors.scrimTextPrimary} />
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.actionBtnOverlay}
                  onPress={() => { haptic.light(); navigation.navigate('EditCollection', { collectionId }); }}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Edit collection"
                  accessibilityRole="button"
                >
                  <Ionicons name="settings-outline" size={18} color={colors.scrimTextPrimary} />
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
                    <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                    <Text style={styles.privacyTextOutline}>Private</Text>
                  </View>
                )}
              </View>
              {collection.description ? (
                <Text style={styles.noCoverDesc} numberOfLines={2}>{collection.description}</Text>
              ) : null}
              <View style={styles.noCoverMetaRow}>
                <Text style={styles.noCoverMeta}>{count} {count === 1 ? 'item' : 'items'}</Text>
                {collection.updatedAt ? (
                  <>
                    <Text style={styles.noCoverMetaDot}>·</Text>
                    <Text style={styles.noCoverMetaUpdated}>Updated {formatRelativeTime(collection.updatedAt)}</Text>
                  </>
                ) : null}
              </View>
            </View>
            <View style={styles.actionRow}>
              <AnimatedPressable
                style={styles.actionBtn}
                onPress={handleShare}
                activeOpacity={0.85}
                accessibilityLabel="Share collection"
                accessibilityRole="button"
              >
                <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.actionBtn}
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
            style={styles.manageRow}
            onPress={() => navigation.navigate('ManageCollectionItems', { collectionId })}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel="Manage collection items"
            accessibilityRole="button"
          >
            <Ionicons name="list-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.manageRowText}>Manage items</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </AnimatedPressable>
        )}

        {/* Offline banner — cached items are still visible but cannot refresh */}
        {isOffline && count > 0 ? (
          <OfflineBanner onRetry={() => void handleRefresh()} />
        ) : null}

        {/* Grid — 3-column media mosaic with 3:4 portrait thumbnails */}
        {count > 0 && (
          <View style={{ marginTop: Space.md }}>
            <ClosetMediaMosaic
              items={collectionItems}
              onPressItem={(item: any) => navigation.navigate('ItemDetail', { itemId: item.id })}
              showSaveButton
            />
          </View>
        )}
        {count === 0 && (
          <EmptyState
            graphic={<BoardEmptyGraphic title="No items yet" subtitle="Add items to this board" icon="folder-open-outline" size={140} />}
            title="This collection is empty"
            subtitle="Browse items and save them to this collection to start curating your board."
            ctaLabel="Browse items"
            onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
          />
        )}

        {/* More like this */}
        <MoreLikeThisRow collectionItems={collectionItems} listings={listings} navigation={navigation} formatFromFiat={formatFromFiat} currencyCode={currencyCode} />

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

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
        variant={confirmSheet.variant}
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
  currencyCode }: {
  collectionItems: any[];
  listings: any[];
  navigation: any;
  formatFromFiat: any;
  currencyCode: string;
}) {
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, SCREEN_W), [colors, SCREEN_W]);
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
    <View style={{ marginTop: Space.xl, paddingBottom: Space.sm }}>
      <Text style={styles.moreTitle}>More like this</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Space.xs + 2, paddingHorizontal: Space.md, paddingRight: 20 }}>
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
                containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.lg }}
                contentFit="cover"
              />
            </SharedTransitionView>
            <Text style={styles.morePrice}>{formatFromFiat(item.price, currencyCode, { displayMode: 'fiat' })}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors, screenWidth: number) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: colors.background,
    borderBottomWidth: Stroke.standard,
    borderBottomColor: colors.border },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Control.hit,
    paddingBottom: Space.sm,
    gap: Space.sm },
  floatingTitle: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    textAlign: 'center' },
  absoluteBack: {
    position: 'absolute',
    top: Control.hit,
    left: Space.md,
    zIndex: 60 },
  backBtn: {
    width: Space.xl + Space.xs + 4,
    height: Space.xl + Space.xs + 4,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center' },
  backBtnOverlay: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  backBtnGlyph: {
    textShadowColor: colors.overlay,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 },
  coverWrap: {
    width: screenWidth,
    height: COVER_H,
    position: 'relative',
    marginBottom: Space.md },
  coverImage: {
    width: '100%',
    height: '100%' },
  coverMosaic: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap' },
  coverMosaicTile: {
    width: '50%',
    height: '50%' },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '65%' },
  coverInfo: {
    position: 'absolute',
    bottom: Space.md,
    left: Space.md,
    right: Space.md },
  coverTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.scrimTextPrimary,
    textShadowColor: colors.overlay,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 },
  coverMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextSecondary,
    marginTop: Space.xs },
  coverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    marginTop: Space.xs },
  coverMetaDot: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextTertiary },
  coverMetaUpdated: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextSecondary },
  coverActions: {
    position: 'absolute',
    top: Control.hit,
    left: Space.md,
    right: Space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  actionRow: {
    flexDirection: 'row',
    gap: Space.xs },
  actionBtnOverlay: {
    width: Space.xl + 4,
    height: Space.xl + 4,
    borderRadius: Radius.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  noCoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md },
  noCoverTitle: {
    fontSize: TypographyV2.screenTitle.size - 2,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary },
  noCoverMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs / 2 },
  noCoverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    marginTop: Space.xs / 2 },
  noCoverMetaDot: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  noCoverMetaUpdated: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  coverTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  coverDesc: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextSecondary,
    marginTop: Space.xs / 2 },
  noCoverDesc: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    marginTop: Space.xs / 2 },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay },
  privacyText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary },
  privacyBadgeOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  privacyTextOutline: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  actionBtn: {
    width: Space.xl + Space.xs + 4,
    height: Space.xl + Space.xs + 4,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center' },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.lg,
    marginBottom: Space.xs,
    paddingVertical: Space.smMd,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: 'transparent',
    borderWidth: Stroke.hairline,
    borderColor: colors.border },
  manageRowText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  listContent: {
    paddingBottom: Space.xxl * 2 + Space.xl },
  moreTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    marginBottom: Space.md - 2,
    paddingHorizontal: Space.md },
  moreCard: {
    width: Space.xxl * 2 + Control.hit },
  moreMediaWrap: {
    width: Space.xxl * 2 + Control.hit,
    height: Space.xxl * 3 + Control.chrome,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.sm },
  moreImg: {
    width: '100%',
    height: '100%' },
  morePrice: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary } });
}