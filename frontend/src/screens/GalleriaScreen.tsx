import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  RefreshControl,
  ImageStyle } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { HorizontalRail } from '../components/HorizontalRail';
import { EmptyState } from '../components/EmptyState';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import {
  fetchGalleriaCollections,
  fetchGalleriaEditorials,
  fetchFeaturedAssets,
  GALLERIA_DEMO_MODE,
  type GalleriaCollection,
  type GalleriaEditorial,
  type GalleriaFeaturedAsset } from '../services/galleriaApi';
import { openProductDetail } from '../platform/product/openProductDetail';
import { useAppTranslation } from '../i18n/useAppTranslation';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Layout constants ──
// Collection rail card dimensions — intentional design constants:
// 200pt width balances cover-image legibility with ~3 cards visible per viewport;
// 260pt height gives the cover image room to breathe while keeping curator meta compact.
const COLLECTION_CARD_WIDTH = 200;
const COLLECTION_CARD_HEIGHT = 260;
const MASONRY_GAP = Space.sm;
const MASONRY_COLUMN_COUNT = 2;
const MASONRY_PADDING = Space.md;

// Skeleton height variation communicates loading without inventing media geometry.
const SKELETON_ASPECT_RATIOS = [1.25, 1.0, 1.32, 0.92] as const;

// ---------------------------------------------------------------------------
// Hero editorial card — full-width, 16:10, title overlaid on image
// ---------------------------------------------------------------------------
const HeroEditorialCard = React.memo(function HeroEditorialCard({
  editorial }: {
  editorial: GalleriaEditorial;
}) {
  const styles = useStyles();
  const { t } = useAppTranslation('galleria');

  return (
    <View
      style={styles.heroContainer}
      accessibilityRole="image"
      accessibilityLabel={t('accessibility.editorial', { title: editorial.title })}
    >
      <CachedImage
        uri={editorial.heroImage}
        style={styles.heroImage}
        contentFit="cover"
        priority="high"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
        style={styles.heroGradient}
      />
      <View style={styles.heroOverlay} pointerEvents="none">
        <View style={styles.heroEyebrowRow}>
          <View style={styles.heroEyebrowDot} />
          <Text style={styles.heroEyebrow}>{t('editorial.eyebrow')}</Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={3}>
          {editorial.title}
        </Text>
        <Text style={styles.heroMeta} numberOfLines={1}>
          {editorial.author} · {editorial.readTime}
        </Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Collection rail card — 200pt wide, cover image + title + curator
// ---------------------------------------------------------------------------
const CollectionRailCard = React.memo(function CollectionRailCard({
  collection,
  onPress }: {
  collection: GalleriaCollection;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { t } = useAppTranslation('galleria');

  return (
    <AnimatedPressable
      style={[styles.collectionCard, { width: COLLECTION_CARD_WIDTH }]}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.collection', { title: collection.title })}
      accessibilityHint={t('accessibility.collectionHint')}
    >
      <View style={styles.collectionImageWrap}>
        <CachedImage
          uri={collection.coverImage}
          style={styles.collectionImage}
          contentFit="cover"
          priority="normal"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
          style={styles.collectionGradient}
        />
        <View style={styles.collectionOverlay} pointerEvents="none">
          <Text style={styles.collectionTheme}>{collection.theme}</Text>
          <Text style={styles.collectionTitle} numberOfLines={2}>
            {collection.title}
          </Text>
        </View>
      </View>
      <View style={styles.collectionMeta}>
        <CachedImage
          uri={collection.curatorAvatar}
          style={styles.collectionAvatar}
          contentFit="cover"
        />
        <Text style={styles.collectionCurator} numberOfLines={1}>
          {collection.curator}
        </Text>
      </View>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Featured collection card — full-width, large art-directed media object
// ---------------------------------------------------------------------------
const FeaturedCollectionCard = React.memo(function FeaturedCollectionCard({
  collection,
  onPress }: {
  collection: GalleriaCollection;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { t } = useAppTranslation('galleria');

  return (
    <AnimatedPressable
      style={styles.featuredCollectionContainer}
      onPress={onPress}
      activeOpacity={0.94}
      scaleValue={0.99}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.featuredCollection', { title: collection.title })}
      accessibilityHint={t('accessibility.collectionHint')}
    >
      <CachedImage
        uri={collection.coverImage}
        style={styles.featuredCollectionImage}
        contentFit="cover"
        priority="high"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
        style={styles.featuredCollectionGradient}
      />
      <View style={styles.featuredCollectionOverlay} pointerEvents="none">
        <Text style={styles.featuredCollectionTheme}>{collection.theme}</Text>
        <Text style={styles.featuredCollectionTitle} numberOfLines={3}>
          {collection.title}
        </Text>
        <View style={styles.featuredCollectionCuratorRow}>
          <CachedImage
            uri={collection.curatorAvatar}
            style={styles.featuredCollectionAvatar}
            contentFit="cover"
          />
          <Text style={styles.featuredCollectionCurator} numberOfLines={1}>
            {t('collections.curatedBy', { curator: collection.curator })}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Featured asset card — masonry tile with image, title, valuation, collection
// ---------------------------------------------------------------------------
const FeaturedAssetCard = React.memo(function FeaturedAssetCard({
  asset,
  onPress,
  testID }: {
  asset: GalleriaFeaturedAsset;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { t } = useAppTranslation('galleria');
  const { formatFromFiat } = useFormattedPrice();
  const { width: SCREEN_W } = useWindowDimensions();
  const MASONRY_COL_WIDTH =
    (SCREEN_W - MASONRY_PADDING * 2 - MASONRY_GAP * (MASONRY_COLUMN_COUNT - 1)) /
    MASONRY_COLUMN_COUNT;
  const imageHeight = Math.round(MASONRY_COL_WIDTH * asset.aspectRatio);

  return (
    <AnimatedPressable
      style={styles.assetCard}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.asset', { title: asset.title, value: formatFromFiat(asset.valuation) })}
      accessibilityHint={t('accessibility.assetHint')}
      testID={testID}
    >
      <View style={[styles.assetImageWrap, { height: imageHeight }]}>
        <CachedImage
          uri={asset.image}
          style={styles.assetImage}
          contentFit="cover"
          priority="normal"
        />
      </View>
      <View style={styles.assetMeta}>
        <Text style={styles.assetCollection} numberOfLines={1}>
          {asset.collection}
        </Text>
        <Text style={styles.assetTitle} numberOfLines={2}>
          {asset.title}
        </Text>
        <Text style={styles.assetValuation} numberOfLines={1}>
          {formatFromFiat(asset.valuation)}
        </Text>
      </View>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Editorial list item — hero, title, excerpt, author + read time
// Varies size for editorial rhythm: 'large' for the lead story, 'standard' for rest
// ---------------------------------------------------------------------------
const EditorialListItem = React.memo(function EditorialListItem({
  editorial,
  isLast,
  size = 'standard' }: {
  editorial: GalleriaEditorial;
  isLast: boolean;
  size?: 'large' | 'standard';
}) {
  const styles = useStyles();
  const { t } = useAppTranslation('galleria');
  const { width: SCREEN_W } = useWindowDimensions();
  const heroHeight = size === 'large'
    ? Math.round(SCREEN_W * (5 / 8))
    : Math.round(SCREEN_W * (9 / 16));

  return (
    <View style={[styles.editorialItem, isLast && styles.editorialItemLast]}>
      <View
        accessibilityRole="image"
        accessibilityLabel={t('accessibility.editorial', { title: editorial.title })}
      >
        <View style={[styles.editorialHeroWrap, { height: heroHeight }]}>
          <CachedImage
            uri={editorial.heroImage}
            style={styles.editorialHero}
            contentFit="cover"
            priority="normal"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
            style={styles.editorialHeroGradient}
          />
          <View style={styles.editorialHeroOverlay} pointerEvents="none">
            <Text style={styles.editorialReadTime}>{editorial.readTime}</Text>
          </View>
        </View>
        <View style={styles.editorialContent}>
          <Text
            style={[styles.editorialTitle, size === 'large' && styles.editorialTitleLarge]}
            numberOfLines={size === 'large' ? 3 : 2}
          >
            {editorial.title}
          </Text>
          <Text style={styles.editorialExcerpt} numberOfLines={size === 'large' ? 4 : 3}>
            {editorial.excerpt}
          </Text>
          <View style={styles.editorialAuthorRow}>
            <CachedImage
              uri={editorial.authorAvatar}
              style={styles.editorialAvatar}
              contentFit="cover"
            />
            <Text style={styles.editorialAuthor} numberOfLines={1}>
              {editorial.author}
            </Text>
          </View>
        </View>
      </View>
      {!isLast && <View style={styles.editorialSeparator} />}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Masonry layout — true Pinterest-style column assignment by shortest height
// ---------------------------------------------------------------------------
function buildMasonryColumns(items: GalleriaFeaturedAsset[], colWidth: number): GalleriaFeaturedAsset[][] {
  const cols: GalleriaFeaturedAsset[][] = Array.from({ length: MASONRY_COLUMN_COUNT }, () => []);
  const heights = Array.from({ length: MASONRY_COLUMN_COUNT }, () => 0);

  items.forEach((item) => {
    const imgHeight = Math.round(colWidth * item.aspectRatio);
    const metaHeight = 72; // approximate: collection + title(2 lines) + valuation
    const itemHeight = imgHeight + metaHeight + MASONRY_GAP;

    let shortestCol = 0;
    let shortestHeight = heights[0];
    for (let c = 1; c < MASONRY_COLUMN_COUNT; c++) {
      if (heights[c] < shortestHeight) {
        shortestCol = c;
        shortestHeight = heights[c];
      }
    }
    cols[shortestCol].push(item);
    heights[shortestCol] += itemHeight;
  });

  return cols;
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------
function HeroSkeleton() {
  const styles = useStyles();
  const { width: SCREEN_W } = useWindowDimensions();
  const HERO_HEIGHT = Math.round(SCREEN_W * (4 / 5));
  return (
    <View style={styles.heroContainer}>
      <PremiumSkeletonTile width="100%" height={HERO_HEIGHT} borderRadius={Radius.none} />
    </View>
  );
}

function CollectionRailSkeleton() {
  const styles = useStyles();
  const { t } = useAppTranslation('galleria');
  return (
    <HorizontalRail
      contentContainerStyle={styles.railContent}
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t('accessibility.loadingCollections')}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={[styles.collectionCard, { width: COLLECTION_CARD_WIDTH }]}>
          <PremiumSkeletonTile width="100%" height={COLLECTION_CARD_HEIGHT - 40} borderRadius={Radius.lg} />
          <View style={styles.collectionMeta}>
            <PremiumSkeletonTile width={20} height={20} borderRadius={Radius.full} />
            <PremiumSkeletonTile width={80} height={12} borderRadius={Radius.sm} />
          </View>
        </View>
      ))}
    </HorizontalRail>
  );
}

function FeaturedMasonrySkeleton() {
  const styles = useStyles();
  const { width: SCREEN_W } = useWindowDimensions();
  const MASONRY_COL_WIDTH =
    (SCREEN_W - MASONRY_PADDING * 2 - MASONRY_GAP * (MASONRY_COLUMN_COUNT - 1)) /
    MASONRY_COLUMN_COUNT;
  const skeletonItems = Array.from({ length: 6 }).map((_, i) => ({
    id: `skel-${i}`,
    aspectRatio: SKELETON_ASPECT_RATIOS[i % SKELETON_ASPECT_RATIOS.length] }));
  const columns = buildMasonryColumns(skeletonItems as GalleriaFeaturedAsset[], MASONRY_COL_WIDTH);

  return (
    <View style={styles.masonryGrid}>
      {columns.map((col, colIdx) => (
        <View key={colIdx} style={[styles.masonryColumn, { width: MASONRY_COL_WIDTH }]}>
          {col.map((item) => {
            const imgHeight = Math.round(MASONRY_COL_WIDTH * item.aspectRatio);
            return (
              <View key={item.id} style={styles.assetCard}>
                <PremiumSkeletonTile width="100%" height={imgHeight} borderRadius={Radius.lg} />
                <View style={styles.assetMeta}>
                  <PremiumSkeletonTile width={60} height={10} borderRadius={Radius.sm} />
                  <PremiumSkeletonTile width="100%" height={14} borderRadius={Radius.sm} />
                  <PremiumSkeletonTile width={70} height={16} borderRadius={Radius.sm} />
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function EditorialSkeleton() {
  const styles = useStyles();
  const { width: SCREEN_W } = useWindowDimensions();
  const heroHeight = Math.round(SCREEN_W * (9 / 16));
  return (
    <View style={styles.editorialItem}>
      <PremiumSkeletonTile width="100%" height={heroHeight} borderRadius={Radius.lg} />
      <View style={styles.editorialContent}>
        <PremiumSkeletonTile width="90%" height={18} borderRadius={Radius.sm} />
        <PremiumSkeletonTile width="100%" height={14} borderRadius={Radius.sm} />
        <PremiumSkeletonTile width="60%" height={12} borderRadius={Radius.sm} />
      </View>
      <View style={styles.editorialSeparator} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section header — eyebrow + title
// ---------------------------------------------------------------------------
function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeaderWrap}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function GalleriaScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const { t } = useAppTranslation('galleria');

  const [collections, setCollections] = useState<GalleriaCollection[]>([]);
  const [editorials, setEditorials] = useState<GalleriaEditorial[]>([]);
  const [featuredAssets, setFeaturedAssets] = useState<GalleriaFeaturedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Data loading ──
  const loadAll = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [cols, eds, assets] = await Promise.all([
        fetchGalleriaCollections(),
        fetchGalleriaEditorials(),
        fetchFeaturedAssets(),
      ]);
      setCollections(cols);
      setEditorials(eds);
      setFeaturedAssets(assets);
    } catch (e) {
      setError(t('error.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  const handleRefresh = useCallback(() => {
    haptic.selection();
    void loadAll(true);
  }, [haptic, loadAll]);

  // ── Navigation handlers ──
  const handleCollectionPress = useCallback(
    (collection: GalleriaCollection) => {
      haptic.selection();
      navigation.navigate('GalleriaCollectionDetail', { collectionId: collection.id });
    },
    [haptic, navigation],
  );

  const handleAssetPress = useCallback(
    (asset: GalleriaFeaturedAsset) => {
      haptic.selection();
      openProductDetail(navigation, {
        referenceKind: 'co_own',
        canonicalId: asset.id,
        sourceSurface: 'Galleria',
        sourceItemId: asset.id });
    },
    [haptic, navigation],
  );

  // ── Derived data ──
  const heroEditorial = editorials[0] ?? null;
  const remainingEditorials = editorials.slice(1);
  const featuredCollection = collections[0] ?? null;
  const railCollections = collections.slice(1);
  // ── FlashList masonry callbacks ──
  const keyExtractor = useCallback(
    (item: GalleriaFeaturedAsset) => item.id,
    [],
  );

  const renderMasonryItem = useCallback(
    ({ item, index }: { item: GalleriaFeaturedAsset; index: number }) => (
      <View style={{ paddingHorizontal: MASONRY_GAP / 2, paddingBottom: MASONRY_GAP, width: '100%' }}>
        <FeaturedAssetCard
          asset={item}
          onPress={() => handleAssetPress(item)}
          testID={index === 0 ? 'golden-coown-first-asset' : undefined}
        />
      </View>
    ),
    [handleAssetPress],
  );

  const overrideItemLayout = useCallback(
    (layout: { span?: number }) => {
      layout.span = 1;
    },
    [],
  );

  const listHeader = useMemo(
    () => (
      <View style={{ marginHorizontal: -(MASONRY_PADDING - MASONRY_GAP / 2) }}>
        {/* ── Honest demo indicator (AGENTS.md §11) ── */}
        {GALLERIA_DEMO_MODE && (
          <View style={styles.demoBadgeRow}>
            <View style={styles.demoBadgeDot} />
            <Text style={styles.demoBadgeText}>{t('demo.content')}</Text>
          </View>
        )}

        {/* ── Section 1: Hero editorial ── */}
        {loading && editorials.length > 0 ? (
          <HeroSkeleton />
        ) : heroEditorial ? (
          <HeroEditorialCard
            editorial={heroEditorial}
          />
        ) : null}

        {/* ── Section 2: Curated Collections — featured + rail ── */}
        {loading ? (
          <CollectionRailSkeleton />
        ) : collections.length > 0 ? (
          <Reanimated.View entering={reducedMotion ? undefined : FadeIn.duration(250)} style={styles.sectionWrap}>
            <Text style={styles.sectionEyebrow}>{t('collections.eyebrow')}</Text>
            {featuredCollection && (
              <FeaturedCollectionCard
                collection={featuredCollection}
                onPress={() => handleCollectionPress(featuredCollection)}
              />
            )}
            {railCollections.length > 0 && (
              <HorizontalRail
                contentContainerStyle={styles.railContent}
                showsHorizontalScrollIndicator={false}
                accessibilityLabel={t('accessibility.collectionsRail')}
              >
                {railCollections.map((col) => (
                  <CollectionRailCard
                    key={col.id}
                    collection={col}
                    onPress={() => handleCollectionPress(col)}
                  />
                ))}
              </HorizontalRail>
            )}
          </Reanimated.View>
        ) : null}

        {/* ── Section 3: Featured Assets — header + loading skeleton ── */}
        {loading ? (
          <>
            <SectionHeader eyebrow={t('assets.eyebrow')} title={t('assets.title')} />
            <FeaturedMasonrySkeleton />
          </>
        ) : featuredAssets.length > 0 ? (
          <SectionHeader eyebrow={t('assets.eyebrow')} title={t('assets.title')} />
        ) : null}
      </View>
    ),
    [
      loading,
      heroEditorial,
      editorials.length,
      collections,
      featuredCollection,
      railCollections,
      featuredAssets.length,
      reducedMotion,
      styles,
      handleCollectionPress,
      t,
    ],
  );

  const listFooter = useMemo(
    () => (
      <View style={{ marginHorizontal: -(MASONRY_PADDING - MASONRY_GAP / 2) }}>
        {/* ── Section 4: Editorial list ── */}
        {loading && editorials.length > 0 ? (
          <>
            <SectionHeader eyebrow={t('editorialList.eyebrow')} title={t('editorialList.title')} />
            <EditorialSkeleton />
            <EditorialSkeleton />
          </>
        ) : remainingEditorials.length > 0 ? (
          <>
            <SectionHeader eyebrow={t('editorialList.eyebrow')} title={t('editorialList.title')} />
            {remainingEditorials.map((ed, idx) => (
              <EditorialListItem
                key={ed.id}
                editorial={ed}
                isLast={idx === remainingEditorials.length - 1}
                size={idx === 0 ? 'large' : 'standard'}
              />
            ))}
          </>
        ) : null}

        {/* ── Section 5: Creative Tools — Poster Studio CTA ── */}
        <View style={styles.stylingToolsWrap}>
          <SectionHeader eyebrow={t('creativeTools.eyebrow')} title={t('creativeTools.title')} />
          <AnimatedPressable
            style={styles.moodboardCtaCard}
            onPress={() => { haptic.selection(); navigation.navigate('CreatorStudio', { type: 'poster', openTemplates: true }); }}
            activeOpacity={0.92}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.openPosterStudio')}
            accessibilityHint={t('accessibility.posterStudioHint')}
          >
            <Ionicons name="create-outline" size={22} color={colors.brand} />
            <View style={styles.moodboardCtaCopy}>
              <Text style={styles.moodboardCtaTitle} numberOfLines={1}>
                {t('creativeTools.posterStudio')}
              </Text>
              <Text style={styles.moodboardCtaSubtitle} numberOfLines={2}>
                {t('creativeTools.posterStudioSub')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </AnimatedPressable>
        </View>
      </View>
    ),
    [
      loading,
      remainingEditorials,
      editorials.length,
      heroEditorial,
      styles,
      colors,
      haptic,
      navigation,
      t,
    ],
  );

  // ── Error state ──
  if (error && !loading && collections.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
        <EmptyState
          icon="cloud-offline-outline"
          title={t('error.title')}
          subtitle={error}
          ctaLabel={t('error.retry')}
          onCtaPress={() => void loadAll(false)}
        />
      </View>
    );
  }

  // ── Empty state ──
  if (
    !loading &&
    collections.length === 0 &&
    editorials.length === 0 &&
    featuredAssets.length === 0
  ) {
    return (
      <View style={styles.stateContainer}>
        <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
        <EmptyState
          icon="images-outline"
          title={t('empty.title')}
          subtitle={t('empty.subtitle')}
          ctaLabel={t('empty.refresh')}
          onCtaPress={() => void loadAll(false)}
        />
      </View>
    );
  }

  return (
    <View testID="coown-screen" style={styles.container}>
      <ExpoStatusBar style={isDark ? 'light' : 'dark'} />

      {/* Offline banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.scrimTextPrimary} />
          <Text style={styles.offlineBannerText}>{t('offline.banner')}</Text>
        </View>
      )}

      <FlashList
        data={loading ? [] : featuredAssets}
        masonry
        numColumns={MASONRY_COLUMN_COUNT}
        renderItem={renderMasonryItem}
        keyExtractor={keyExtractor}
        overrideItemLayout={overrideItemLayout}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={{
          paddingHorizontal: Math.max(MASONRY_PADDING - MASONRY_GAP / 2, 0),
          paddingTop: insets.top + Space.sm,
          paddingBottom: Space.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
function useStyles() {
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const HERO_HEIGHT = Math.round(SCREEN_W * (4 / 5));
  const FEATURED_COLLECTION_HEIGHT = Math.round(SCREEN_W * (5 / 6));
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background },
        stateContainer: {
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: Space.lg },
        listContent: {
          paddingBottom: Space.xxl },
        // ── Offline banner ──
        offlineBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          backgroundColor: colors.surfaceAlt,
          borderBottomWidth: Stroke.hairline,
          borderBottomColor: colors.border },
        offlineBannerText: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textSecondary },
        // ── Honest demo indicator (AGENTS.md §11) ──
        demoBadgeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm },
        demoBadgeDot: {
          width: Space.xs,
          height: Space.xs,
          borderRadius: Radius.full,
          backgroundColor: colors.textMuted },
        demoBadgeText: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textMuted,
          letterSpacing: TypographyV2.label.letterSpacing },
        // ── Hero — full-bleed, no card chrome ──
        heroContainer: {
          width: '100%',
          marginBottom: Space.lg,
          overflow: 'hidden' },
        heroImage: {
          width: '100%',
          height: HERO_HEIGHT } as ImageStyle,
        heroGradient: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '65%' },
        heroOverlay: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: Space.lg,
          gap: Space.sm },
        heroEyebrowRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs },
        heroEyebrowDot: {
          width: Space.xs + 2,
          height: Space.xs + 2,
          borderRadius: Radius.full,
          backgroundColor: colors.scrimTextPrimary },
        heroEyebrow: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.scrimTextPrimary,
          letterSpacing: TypographyV2.label.letterSpacing,
          opacity: 0.9 },
        heroTitle: {
          fontSize: TypographyV2.priceList.size,
          lineHeight: TypographyV2.priceList.lineHeight,
          fontFamily: TypographyV2.priceList.fontFamily,
          color: colors.scrimTextPrimary,
          letterSpacing: -0.5 },
        heroMeta: {
          fontSize: TypographyV2.body.size,
          fontFamily: TypographyV2.body.fontFamily,
          color: colors.scrimTextPrimary,
          opacity: 0.75 },
        // ── Section wrappers ──
        sectionWrap: {
          marginBottom: Space.lg },
        sectionHeaderWrap: {
          paddingHorizontal: Space.md,
          paddingTop: Space.lg,
          paddingBottom: Space.sm },
        sectionEyebrow: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textMuted,
          letterSpacing: TypographyV2.label.letterSpacing,
          marginBottom: Space.xs },
        sectionTitle: {
          fontSize: TypographyV2.priceList.size,
          lineHeight: TypographyV2.priceList.lineHeight,
          fontFamily: TypographyV2.priceList.fontFamily,
          color: colors.textPrimary,
          letterSpacing: -0.4 },
        // ── Collections rail ──
        railContent: {
          paddingHorizontal: Space.md,
          gap: Space.sm },
        // ── Featured collection ──
        featuredCollectionContainer: {
          marginHorizontal: Space.md,
          marginBottom: Space.md,
          borderRadius: Radius.xl,
          overflow: 'hidden' },
        featuredCollectionImage: {
          width: '100%',
          height: FEATURED_COLLECTION_HEIGHT } as ImageStyle,
        featuredCollectionGradient: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '70%' },
        featuredCollectionOverlay: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: Space.lg,
          gap: Space.xs },
        featuredCollectionTheme: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.scrimTextPrimary,
          letterSpacing: TypographyV2.label.letterSpacing,
          opacity: 0.85 },
        featuredCollectionTitle: {
          fontSize: TypographyV2.priceList.size,
          lineHeight: TypographyV2.priceList.lineHeight,
          fontFamily: TypographyV2.priceList.fontFamily,
          color: colors.scrimTextPrimary,
          letterSpacing: -0.5 },
        featuredCollectionCuratorRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          marginTop: Space.xs },
        featuredCollectionAvatar: {
          width: Space.smMd,
          height: Space.smMd,
          borderRadius: Radius.full } as ImageStyle,
        featuredCollectionCurator: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.scrimTextPrimary,
          opacity: 0.8 },
        collectionCard: {
          gap: Space.sm },
        collectionImageWrap: {
          width: '100%',
          height: COLLECTION_CARD_HEIGHT - 40,
          borderRadius: Radius.lg,
          overflow: 'hidden' },
        collectionImage: {
          width: '100%',
          height: '100%' } as ImageStyle,
        collectionGradient: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '55%' },
        collectionOverlay: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: Space.sm,
          gap: Space.xs / 2 },
        collectionTheme: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.scrimTextPrimary,
          opacity: 0.85,
          letterSpacing: TypographyV2.label.letterSpacing - 0.1 },
        collectionTitle: {
          fontSize: TypographyV2.sectionTitle.size,
          lineHeight: TypographyV2.sectionTitle.lineHeight,
          fontFamily: TypographyV2.sectionTitle.fontFamily,
          color: colors.scrimTextPrimary,
          letterSpacing: TypographyV2.sectionTitle.letterSpacing },
        collectionMeta: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs },
        collectionAvatar: {
          width: Space.smMd,
          height: Space.smMd,
          borderRadius: Radius.full } as ImageStyle,
        collectionCurator: {
          flex: 1,
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textSecondary },
        // ── Featured assets masonry ──
        masonryGrid: {
          flexDirection: 'row',
          justifyContent: 'center',
          paddingHorizontal: MASONRY_PADDING,
          gap: MASONRY_GAP },
        masonryColumn: {
          flexDirection: 'column',
          gap: MASONRY_GAP },
        assetCard: {
          gap: Space.xs },
        assetImageWrap: {
          width: '100%',
          borderRadius: Radius.lg,
          overflow: 'hidden' },
        assetImage: {
          width: '100%',
          height: '100%' } as ImageStyle,
        assetMeta: {
          gap: Space.xs / 2 },
        assetCollection: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textMuted,
          letterSpacing: TypographyV2.label.letterSpacing - 0.2 },
        assetTitle: {
          fontSize: TypographyV2.bodyStrong.size,
          lineHeight: TypographyV2.bodyStrong.lineHeight,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.textPrimary,
          letterSpacing: TypographyV2.body.letterSpacing },
        assetValuation: {
          fontSize: TypographyV2.body.size,
          lineHeight: TypographyV2.body.size - 2,
          fontFamily: TypographyV2.body.fontFamily,
          color: colors.textPrimary,
          fontVariant: ['tabular-nums'],
          letterSpacing: TypographyV2.body.letterSpacing },
        // ── Editorial list ──
        editorialItem: {
          paddingHorizontal: Space.md,
          marginBottom: Space.lg },
        editorialItemLast: {
          marginBottom: Radius.none },
        editorialHeroWrap: {
          width: '100%',
          borderRadius: Radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surfaceAlt },
        editorialHero: {
          width: '100%',
          height: '100%' } as ImageStyle,
        editorialHeroGradient: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%' },
        editorialHeroOverlay: {
          position: 'absolute',
          bottom: Space.sm,
          right: Space.sm },
        editorialReadTime: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.scrimTextPrimary,
          letterSpacing: TypographyV2.label.letterSpacing - 0.2,
          backgroundColor: colors.overlay,
          paddingHorizontal: Space.xs + 2,
          paddingVertical: Space.xs / 2,
          borderRadius: Radius.sm,
          overflow: 'hidden' },
        editorialContent: {
          paddingTop: Space.sm,
          gap: Space.xs },
        editorialTitle: {
          fontSize: TypographyV2.sectionTitle.size,
          lineHeight: TypographyV2.sectionTitle.lineHeight,
          fontFamily: TypographyV2.sectionTitle.fontFamily,
          color: colors.textPrimary,
          letterSpacing: TypographyV2.sectionTitle.letterSpacing },
        editorialTitleLarge: {
          fontSize: TypographyV2.priceList.size,
          lineHeight: TypographyV2.priceList.lineHeight,
          letterSpacing: -0.4 },
        editorialExcerpt: {
          fontSize: TypographyV2.body.size,
          lineHeight: TypographyV2.body.lineHeight,
          fontFamily: TypographyV2.body.fontFamily,
          color: colors.textSecondary },
        editorialAuthorRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          marginTop: Space.xs / 2 },
        editorialAvatar: {
          width: 18,
          height: 18,
          borderRadius: Radius.full } as ImageStyle,
        editorialAuthor: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textSecondary },
        editorialSeparator: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginTop: Space.lg },
        // ── Styling Tools — Moodboard CTA ──
        stylingToolsWrap: {
          paddingHorizontal: Space.md,
          marginTop: Space.lg,
          gap: Space.sm },
        moodboardCtaCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.md,
          paddingVertical: Space.md,
          paddingHorizontal: Space.md,
          borderRadius: Radius.lg,
          borderWidth: Stroke.hairline,
          borderColor: colors.border,
          backgroundColor: colors.surface },
        moodboardCtaCopy: {
          flex: 1,
          gap: Space.xs / 2 },
        moodboardCtaTitle: {
          fontSize: TypographyV2.bodyStrong.size,
          lineHeight: TypographyV2.bodyStrong.lineHeight,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.textPrimary,
          letterSpacing: TypographyV2.body.letterSpacing },
        moodboardCtaSubtitle: {
          fontSize: TypographyV2.meta.size,
          lineHeight: TypographyV2.meta.lineHeight,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textSecondary } }),
    [colors, HERO_HEIGHT, FEATURED_COLLECTION_HEIGHT],
  );
}
