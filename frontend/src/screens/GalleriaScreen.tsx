import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  RefreshControl,
  ImageStyle,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Control } from '../theme/designTokens';
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
  type GalleriaFeaturedAsset,
} from '../services/galleriaApi';
import { openProductDetail } from '../platform/product/openProductDetail';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Layout constants ──
const { width: SCREEN_W } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_W * (4 / 5));
const FEATURED_COLLECTION_HEIGHT = Math.round(SCREEN_W * (5 / 6));
// Collection rail card dimensions — intentional design constants:
// 200pt width balances cover-image legibility with ~3 cards visible per viewport;
// 260pt height gives the cover image room to breathe while keeping curator meta compact.
const COLLECTION_CARD_WIDTH = 200;
const COLLECTION_CARD_HEIGHT = 260;
const MASONRY_GAP = Space.sm;
const MASONRY_COLUMN_COUNT = 2;
const MASONRY_PADDING = Space.md;
const MASONRY_COL_WIDTH =
  (SCREEN_W - MASONRY_PADDING * 2 - MASONRY_GAP * (MASONRY_COLUMN_COUNT - 1)) /
  MASONRY_COLUMN_COUNT;

// Skeleton height variation communicates loading without inventing media geometry.
const SKELETON_ASPECT_RATIOS = [1.25, 1.0, 1.32, 0.92] as const;

// ---------------------------------------------------------------------------
// Hero editorial card — full-width, 16:10, title overlaid on image
// ---------------------------------------------------------------------------
const HeroEditorialCard = React.memo(function HeroEditorialCard({
  editorial,
}: {
  editorial: GalleriaEditorial;
}) {
  const styles = useStyles();

  return (
    <View
      style={styles.heroContainer}
      accessibilityRole="image"
      accessibilityLabel={`Editorial: ${editorial.title}`}
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
          <Text style={styles.heroEyebrow}>EDITORIAL</Text>
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
  onPress,
}: {
  collection: GalleriaCollection;
  onPress: () => void;
}) {
  const styles = useStyles();

  return (
    <AnimatedPressable
      style={[styles.collectionCard, { width: COLLECTION_CARD_WIDTH }]}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Collection: ${collection.title}`}
      accessibilityHint="Opens the collection detail"
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
  onPress,
}: {
  collection: GalleriaCollection;
  onPress: () => void;
}) {
  const styles = useStyles();

  return (
    <AnimatedPressable
      style={styles.featuredCollectionContainer}
      onPress={onPress}
      activeOpacity={0.94}
      scaleValue={0.99}
      accessibilityRole="button"
      accessibilityLabel={`Featured collection: ${collection.title}`}
      accessibilityHint="Opens the collection detail"
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
            Curated by {collection.curator}
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
  testID,
}: {
  asset: GalleriaFeaturedAsset;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { formatFromFiat } = useFormattedPrice();
  const imageHeight = Math.round(MASONRY_COL_WIDTH * asset.aspectRatio);

  return (
    <AnimatedPressable
      style={styles.assetCard}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${asset.title}, valued at ${formatFromFiat(asset.valuation)}`}
      accessibilityHint="Opens the asset detail"
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
  size = 'standard',
}: {
  editorial: GalleriaEditorial;
  isLast: boolean;
  size?: 'large' | 'standard';
}) {
  const styles = useStyles();
  const heroHeight = size === 'large'
    ? Math.round(SCREEN_W * (5 / 8))
    : Math.round(SCREEN_W * (9 / 16));

  return (
    <View style={[styles.editorialItem, isLast && styles.editorialItemLast]}>
      <View
        accessibilityRole="image"
        accessibilityLabel={`Editorial: ${editorial.title}`}
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
function buildMasonryColumns(items: GalleriaFeaturedAsset[]): GalleriaFeaturedAsset[][] {
  const cols: GalleriaFeaturedAsset[][] = Array.from({ length: MASONRY_COLUMN_COUNT }, () => []);
  const heights = Array.from({ length: MASONRY_COLUMN_COUNT }, () => 0);

  items.forEach((item) => {
    const imgHeight = Math.round(MASONRY_COL_WIDTH * item.aspectRatio);
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
  return (
    <View style={styles.heroContainer}>
      <PremiumSkeletonTile width="100%" height={HERO_HEIGHT} borderRadius={Radius.none} />
    </View>
  );
}

function CollectionRailSkeleton() {
  const styles = useStyles();
  return (
    <HorizontalRail
      contentContainerStyle={styles.railContent}
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Loading curated collections"
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
  const skeletonItems = Array.from({ length: 6 }).map((_, i) => ({
    id: `skel-${i}`,
    aspectRatio: SKELETON_ASPECT_RATIOS[i % SKELETON_ASPECT_RATIOS.length],
  }));
  const columns = buildMasonryColumns(skeletonItems as GalleriaFeaturedAsset[]);

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
      setError('We couldn\u2019t load the Galleria. Try again.');
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
        sourceItemId: asset.id,
      });
    },
    [haptic, navigation],
  );

  // ── Derived data ──
  const heroEditorial = editorials[0] ?? null;
  const remainingEditorials = editorials.slice(1);
  const featuredCollection = collections[0] ?? null;
  const railCollections = collections.slice(1);
  const masonryColumns = useMemo(
    () => buildMasonryColumns(featuredAssets),
    [featuredAssets],
  );

  // ── Error state ──
  if (error && !loading && collections.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
        <EmptyState
          icon="cloud-offline-outline"
          title="Galleria unavailable"
          subtitle={error}
          ctaLabel="Retry"
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
          title="The Galleria is being curated"
          subtitle="Our curators are preparing new collections and editorial pieces. Check back soon."
          ctaLabel="Refresh"
          onCtaPress={() => void loadAll(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoStatusBar style={isDark ? 'light' : 'dark'} />

      {/* Offline banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.scrimTextPrimary} />
          <Text style={styles.offlineBannerText}>Offline — showing cached Galleria content</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + Space.sm },
        ]}
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
        {/* ── Honest demo indicator (AGENTS.md §11) ── */}
        {GALLERIA_DEMO_MODE && (
          <View style={styles.demoBadgeRow}>
            <View style={styles.demoBadgeDot} />
            <Text style={styles.demoBadgeText}>Demo content</Text>
          </View>
        )}

        {/* ── Section 1: Hero editorial ── */}
        {loading ? (
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
            <Text style={styles.sectionEyebrow}>CURATED COLLECTIONS</Text>
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
                accessibilityLabel="Curated collections rail"
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

        {/* ── Section 3: Featured Assets masonry ── */}
        {loading ? (
          <>
            <SectionHeader eyebrow="FEATURED ASSETS" title="Co-Own highlights" />
            <FeaturedMasonrySkeleton />
          </>
        ) : featuredAssets.length > 0 ? (
          <Reanimated.View entering={reducedMotion ? undefined : FadeIn.duration(250)}>
            <SectionHeader eyebrow="FEATURED ASSETS" title="Co-Own highlights" />
            <View style={styles.masonryGrid}>
              {masonryColumns.map((columnItems, colIdx) => (
                <View
                  key={colIdx}
                  style={[styles.masonryColumn, { width: MASONRY_COL_WIDTH }]}
                >
                  {columnItems.map((asset, assetIdx) => (
                    <FeaturedAssetCard
                      key={asset.id}
                      asset={asset}
                      onPress={() => handleAssetPress(asset)}
                      testID={colIdx === 0 && assetIdx === 0 ? 'golden-coown-first-asset' : undefined}
                    />
                  ))}
                </View>
              ))}
            </View>
          </Reanimated.View>
        ) : null}

        {/* ── Section 4: Editorial list ── */}
        {loading ? (
          <>
            <SectionHeader eyebrow="EDITORIAL" title="Stories from the Galleria" />
            <EditorialSkeleton />
            <EditorialSkeleton />
          </>
        ) : remainingEditorials.length > 0 ? (
          <>
            <SectionHeader eyebrow="EDITORIAL" title="Stories from the Galleria" />
            {remainingEditorials.map((ed, idx) => (
              <EditorialListItem
                key={ed.id}
                editorial={ed}
                isLast={idx === remainingEditorials.length - 1}
                size={idx === 0 ? 'large' : 'standard'}
              />
            ))}
          </>
        ) : !loading && heroEditorial === null ? (
          <>
            <SectionHeader eyebrow="EDITORIAL" title="Stories from the Galleria" />
            <EmptyState
              density="compact"
              icon="book-outline"
              title="No editorials available"
              subtitle="Our editors are preparing new stories. Check back soon."
            />
          </>
        ) : null}

        {/* ── Section 5: Creative Tools — Poster Studio CTA ── */}
        <View style={styles.stylingToolsWrap}>
          <SectionHeader eyebrow="CREATIVE TOOLS" title="Make it yours" />
          <AnimatedPressable
            style={styles.moodboardCtaCard}
            onPress={() => { haptic.selection(); navigation.navigate('CreatorStudio', { type: 'poster', openTemplates: true }); }}
            activeOpacity={0.92}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel="Open Poster Studio"
            accessibilityHint="Create posters, looks, and moodboard collages"
          >
            <View style={styles.moodboardCtaIconWrap}>
              <Ionicons name="create-outline" size={22} color={colors.brand} />
            </View>
            <View style={styles.moodboardCtaCopy}>
              <Text style={styles.moodboardCtaTitle} numberOfLines={1}>
                Poster Studio
              </Text>
              <Text style={styles.moodboardCtaSubtitle} numberOfLines={2}>
                Create posters, looks & moodboard collages
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </AnimatedPressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
function useStyles() {
  const { colors } = useAppTheme();
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        stateContainer: {
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: Space.lg,
        },
        listContent: {
          paddingBottom: Space.xxl,
        },
        // ── Offline banner ──
        offlineBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          backgroundColor: colors.surfaceAlt,
          borderBottomWidth: Stroke.hairline,
          borderBottomColor: colors.border,
        },
        offlineBannerText: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.medium,
          color: colors.textSecondary,
        },
        // ── Honest demo indicator (AGENTS.md §11) ──
        demoBadgeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm,
        },
        demoBadgeDot: {
          width: Space.xs,
          height: Space.xs,
          borderRadius: Radius.full,
          backgroundColor: colors.textMuted,
        },
        demoBadgeText: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.medium,
          color: colors.textMuted,
          letterSpacing: Type.label.letterSpacing,
        },
        // ── Hero — full-bleed, no card chrome ──
        heroContainer: {
          width: '100%',
          marginBottom: Space.lg,
          overflow: 'hidden',
        },
        heroImage: {
          width: '100%',
          height: HERO_HEIGHT,
        } as ImageStyle,
        heroGradient: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '65%',
        },
        heroOverlay: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: Space.lg,
          gap: Space.sm,
        },
        heroEyebrowRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
        },
        heroEyebrowDot: {
          width: Space.xs + 2,
          height: Space.xs + 2,
          borderRadius: Radius.full,
          backgroundColor: colors.scrimTextPrimary,
        },
        heroEyebrow: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.semibold,
          color: colors.scrimTextPrimary,
          letterSpacing: Type.label.letterSpacing,
          opacity: 0.9,
        },
        heroTitle: {
          fontSize: Type.priceList.size,
          lineHeight: Type.priceList.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.scrimTextPrimary,
          letterSpacing: -0.5,
        },
        heroMeta: {
          fontSize: Type.body.size,
          fontFamily: Typography.family.medium,
          color: colors.scrimTextPrimary,
          opacity: 0.75,
        },
        // ── Section wrappers ──
        sectionWrap: {
          marginBottom: Space.lg,
        },
        sectionHeaderWrap: {
          paddingHorizontal: Space.md,
          paddingTop: Space.lg,
          paddingBottom: Space.sm,
        },
        sectionEyebrow: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.semibold,
          color: colors.textMuted,
          letterSpacing: Type.label.letterSpacing,
          marginBottom: Space.xs,
        },
        sectionTitle: {
          fontSize: Type.priceList.size,
          lineHeight: Type.priceList.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.textPrimary,
          letterSpacing: -0.4,
        },
        // ── Collections rail ──
        railContent: {
          paddingHorizontal: Space.md,
          gap: Space.sm,
        },
        // ── Featured collection ──
        featuredCollectionContainer: {
          marginHorizontal: Space.md,
          marginBottom: Space.md,
          borderRadius: Radius.xl,
          overflow: 'hidden',
        },
        featuredCollectionImage: {
          width: '100%',
          height: FEATURED_COLLECTION_HEIGHT,
        } as ImageStyle,
        featuredCollectionGradient: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '70%',
        },
        featuredCollectionOverlay: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: Space.lg,
          gap: Space.xs,
        },
        featuredCollectionTheme: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.semibold,
          color: colors.scrimTextPrimary,
          letterSpacing: Type.label.letterSpacing,
          opacity: 0.85,
        },
        featuredCollectionTitle: {
          fontSize: Type.priceList.size,
          lineHeight: Type.priceList.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.scrimTextPrimary,
          letterSpacing: -0.5,
        },
        featuredCollectionCuratorRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          marginTop: Space.xs,
        },
        featuredCollectionAvatar: {
          width: Space.smMd,
          height: Space.smMd,
          borderRadius: Radius.full,
        } as ImageStyle,
        featuredCollectionCurator: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.medium,
          color: colors.scrimTextPrimary,
          opacity: 0.8,
        },
        collectionCard: {
          gap: Space.sm,
        },
        collectionImageWrap: {
          width: '100%',
          height: COLLECTION_CARD_HEIGHT - 40,
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        collectionImage: {
          width: '100%',
          height: '100%',
        } as ImageStyle,
        collectionGradient: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '55%',
        },
        collectionOverlay: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: Space.sm,
          gap: Space.xs / 2,
        },
        collectionTheme: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.semibold,
          color: colors.scrimTextPrimary,
          opacity: 0.85,
          letterSpacing: Type.label.letterSpacing - 0.1,
        },
        collectionTitle: {
          fontSize: Type.subtitle.size,
          lineHeight: Type.subtitle.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.scrimTextPrimary,
          letterSpacing: Type.subtitle.letterSpacing,
        },
        collectionMeta: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
        },
        collectionAvatar: {
          width: Space.smMd,
          height: Space.smMd,
          borderRadius: Radius.full,
        } as ImageStyle,
        collectionCurator: {
          flex: 1,
          fontSize: Type.caption.size,
          fontFamily: Typography.family.medium,
          color: colors.textSecondary,
        },
        // ── Featured assets masonry ──
        masonryGrid: {
          flexDirection: 'row',
          justifyContent: 'center',
          paddingHorizontal: MASONRY_PADDING,
          gap: MASONRY_GAP,
        },
        masonryColumn: {
          flexDirection: 'column',
          gap: MASONRY_GAP,
        },
        assetCard: {
          gap: Space.xs,
        },
        assetImageWrap: {
          width: '100%',
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        assetImage: {
          width: '100%',
          height: '100%',
        } as ImageStyle,
        assetMeta: {
          gap: Space.xs / 2,
        },
        assetCollection: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.semibold,
          color: colors.textMuted,
          letterSpacing: Type.label.letterSpacing - 0.2,
        },
        assetTitle: {
          fontSize: Type.bodyStrong.size,
          lineHeight: Type.bodyStrong.lineHeight,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: Type.body.letterSpacing,
        },
        assetValuation: {
          fontSize: Type.body.size,
          lineHeight: Type.body.size - 2,
          fontFamily: Typography.family.bold,
          color: colors.textPrimary,
          fontVariant: ['tabular-nums'],
          letterSpacing: Type.body.letterSpacing,
        },
        // ── Editorial list ──
        editorialItem: {
          paddingHorizontal: Space.md,
          marginBottom: Space.lg,
        },
        editorialItemLast: {
          marginBottom: Radius.none,
        },
        editorialHeroWrap: {
          width: '100%',
          borderRadius: Radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surfaceAlt,
        },
        editorialHero: {
          width: '100%',
          height: '100%',
        } as ImageStyle,
        editorialHeroGradient: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
        },
        editorialHeroOverlay: {
          position: 'absolute',
          bottom: Space.sm,
          right: Space.sm,
        },
        editorialReadTime: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.semibold,
          color: colors.scrimTextPrimary,
          letterSpacing: Type.label.letterSpacing - 0.2,
          backgroundColor: colors.overlay,
          paddingHorizontal: Space.xs + 2,
          paddingVertical: Space.xs / 2,
          borderRadius: Radius.sm,
          overflow: 'hidden',
        },
        editorialContent: {
          paddingTop: Space.sm,
          gap: Space.xs,
        },
        editorialTitle: {
          fontSize: Type.subtitle.size,
          lineHeight: Type.subtitle.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.textPrimary,
          letterSpacing: Type.subtitle.letterSpacing,
        },
        editorialTitleLarge: {
          fontSize: Type.priceList.size,
          lineHeight: Type.priceList.lineHeight,
          letterSpacing: -0.4,
        },
        editorialExcerpt: {
          fontSize: Type.body.size,
          lineHeight: Type.body.lineHeight,
          fontFamily: Typography.family.regular,
          color: colors.textSecondary,
        },
        editorialAuthorRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          marginTop: Space.xs / 2,
        },
        editorialAvatar: {
          width: 18,
          height: 18,
          borderRadius: Radius.full,
        } as ImageStyle,
        editorialAuthor: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.medium,
          color: colors.textSecondary,
        },
        editorialSeparator: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginTop: Space.lg,
        },
        // ── Styling Tools — Moodboard CTA ──
        stylingToolsWrap: {
          paddingHorizontal: Space.md,
          marginTop: Space.lg,
          gap: Space.sm,
        },
        moodboardCtaCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.md,
          paddingVertical: Space.md,
          paddingHorizontal: Space.md,
          borderRadius: Radius.lg,
          borderWidth: Stroke.hairline,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        moodboardCtaIconWrap: {
          width: Control.hit,
          height: Control.hit,
          borderRadius: Radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceAlt,
        },
        moodboardCtaCopy: {
          flex: 1,
          gap: Space.xs / 2,
        },
        moodboardCtaTitle: {
          fontSize: Type.bodyStrong.size,
          lineHeight: Type.bodyStrong.lineHeight,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: Type.body.letterSpacing,
        },
        moodboardCtaSubtitle: {
          fontSize: Type.caption.size,
          lineHeight: Type.caption.lineHeight,
          fontFamily: Typography.family.regular,
          color: colors.textSecondary,
        },
      }),
    [colors],
  );
}
