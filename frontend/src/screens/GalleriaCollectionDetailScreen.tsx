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
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Control } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { OfflineBanner } from '../components/OfflineBanner';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import {
  fetchCollectionDetail,
  type GalleriaCollection,
  type GalleriaFeaturedAsset,
  type GalleriaCollectionDetail,
} from '../services/galleriaApi';

type Props = NativeStackScreenProps<RootStackParamList, 'GalleriaCollectionDetail'>;

// ── Layout constants ──
const { width: SCREEN_W } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_W * 0.62);
const MASONRY_GAP = Space.sm;
// Two columns balance visual richness with per-tile legibility on phone widths;
// more columns would shrink art below a useful size, one column wastes horizontal space.
const MASONRY_COLUMN_COUNT = 2;
const MASONRY_PADDING = Space.md;
const MASONRY_COL_WIDTH =
  (SCREEN_W - MASONRY_PADDING * 2 - MASONRY_GAP * (MASONRY_COLUMN_COUNT - 1)) /
  MASONRY_COLUMN_COUNT;

// Skeleton height variation communicates loading without inventing media geometry.
// The ratios mirror common asset aspect ratios so the loading-to-populated transition is minimal.
const SKELETON_ASPECT_RATIOS = [1.25, 1.0, 1.32, 0.92] as const;

// ---------------------------------------------------------------------------
// Masonry layout — true Pinterest-style column assignment by shortest height
// ---------------------------------------------------------------------------
function buildMasonryColumns(items: GalleriaFeaturedAsset[]): GalleriaFeaturedAsset[][] {
  const cols: GalleriaFeaturedAsset[][] = Array.from({ length: MASONRY_COLUMN_COUNT }, () => []);
  const heights = Array.from({ length: MASONRY_COLUMN_COUNT }, () => 0);

  items.forEach((item) => {
    const imgHeight = Math.round(MASONRY_COL_WIDTH * item.aspectRatio);
    const metaHeight = 72;
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
// Collection item card — masonry tile
// ---------------------------------------------------------------------------
const CollectionItemCard = React.memo(function CollectionItemCard({
  asset,
  onPress,
  sharedTag,
}: {
  asset: GalleriaFeaturedAsset;
  onPress: () => void;
  sharedTag?: string;
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
      accessibilityHint="Opens the item detail"
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
// Masonry skeleton
// ---------------------------------------------------------------------------
function MasonrySkeleton() {
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
                  <PremiumSkeletonTile width="90%" height={14} borderRadius={Radius.sm} />
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

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function GalleriaCollectionDetailScreen({ route }: Props) {
  const navigation = useNavigation<Props['navigation']>();
  const { colors, isDark } = useAppTheme();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const collectionId = route.params?.collectionId;

  const [detail, setDetail] = useState<GalleriaCollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollY = useSharedValue(0);

  // ── Data loading ──
  const loadDetail = useCallback(
    async (isRefresh: boolean) => {
      if (!collectionId) return;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await fetchCollectionDetail(collectionId);
        setDetail(result);
      } catch (e) {
        setError('We couldn\u2019t load this collection. Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [collectionId],
  );

  useEffect(() => {
    void loadDetail(false);
  }, [loadDetail]);

  const handleRefresh = useCallback(() => {
    haptic.selection();
    void loadDetail(true);
  }, [haptic, loadDetail]);

  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs', { screen: 'Home' });
    }
  }, [navigation]);

  const handleItemPress = useCallback(
    (asset: GalleriaFeaturedAsset) => {
      haptic.selection();
      navigation.navigate('ItemDetail', { itemId: asset.id });
    },
    [haptic, navigation],
  );

  // ── Parallax scroll handlers ──
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Hero parallax — image translates slower than scroll for depth
  const heroImageStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [-HERO_HEIGHT, 0, HERO_HEIGHT],
      [HERO_HEIGHT * 0.5, 0, -HERO_HEIGHT * 0.3],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      scrollY.value,
      [-HERO_HEIGHT, 0],
      [1.3, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateY }, { scale }],
    };
  });

  // Header background fade-in as hero scrolls under
  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, HERO_HEIGHT - 80],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // Hero content fade-out as it scrolls away
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, HERO_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const collection = detail?.collection ?? null;
  const items = detail?.items ?? [];
  const masonryColumns = useMemo(() => buildMasonryColumns(items), [items]);
  const sharedTag = collection ? `galleria-collection-${collection.id}` : undefined;

  // ── Error state ──
  if (error && !loading && !collection) {
    return (
      <View style={styles.stateContainer}>
        <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.backBtnAbsolute}>
          <AnimatedPressable
            style={styles.backBtnDark}
            onPress={handleGoBack}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the Galleria"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>
        <EmptyState
          icon="cloud-offline-outline"
          title="Collection unavailable"
          subtitle={error}
          ctaLabel="Retry"
          onCtaPress={() => void loadDetail(false)}
        />
      </View>
    );
  }

  // ── Not found state ──
  if (!loading && !collection) {
    return (
      <View style={styles.stateContainer}>
        <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.backBtnAbsolute}>
          <AnimatedPressable
            style={styles.backBtnDark}
            onPress={handleGoBack}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the Galleria"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>
        <EmptyState
          icon="alert-circle-outline"
          title="Collection not found"
          subtitle="This collection may have been removed."
          ctaLabel="Back to Galleria"
          onCtaPress={handleGoBack}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoStatusBar style={isDark ? 'light' : 'dark'} />

      {/* Floating header with scroll fade */}
      <Reanimated.View style={[styles.floatingHeader, headerBgStyle]}>
        <View style={[styles.headerInner, { paddingTop: insets.top }]}>
          <AnimatedPressable
            style={styles.backBtn}
            onPress={handleGoBack}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the Galleria"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.floatingTitle} numberOfLines={1}>
            {collection?.title ?? ''}
          </Text>
          <View style={{ width: Control.hit }} />
        </View>
      </Reanimated.View>

      {/* Top-left back button (always visible over hero) */}
      <View style={styles.absoluteBack} pointerEvents="box-none">
        <AnimatedPressable
          style={styles.backBtnOverlay}
          onPress={handleGoBack}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the Galleria"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textInverse} />
        </AnimatedPressable>
      </View>

      {/* Offline banner */}
      {isOffline && (
        <OfflineBanner message="Offline — showing cached content" />
      )}

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.listContent}
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
        {/* ── Parallax hero header ── */}
        {collection && (
          <View style={styles.heroWrap}>
            <Reanimated.View style={heroImageStyle}>
              <CachedImage
                uri={collection.coverImage}
                style={styles.heroImage}
                contentFit="cover"
                priority="high"
                // sharedTransitionTag enables a smooth shared-element transition
                // from the collection rail card on the Galleria screen.
                // Note: CachedImage wraps expo-image which supports the tag via
                // Reanimated's shared transition API on native-stack.
              />
            </Reanimated.View>
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
              style={styles.heroGradient}
            />
            <Reanimated.View style={[styles.heroContent, heroContentStyle]} pointerEvents="none">
              <Text style={styles.heroTheme}>{collection.theme}</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {collection.title}
              </Text>
              <Text style={styles.heroSubtitle} numberOfLines={2}>
                {collection.subtitle}
              </Text>
              <View style={styles.heroCuratorRow}>
                <CachedImage
                  uri={collection.curatorAvatar}
                  style={styles.heroCuratorAvatar}
                  contentFit="cover"
                />
                <Text style={styles.heroCuratorName} numberOfLines={1}>
                  Curated by {collection.curator}
                </Text>
              </View>
            </Reanimated.View>
          </View>
        )}

        {/* ── Items section ── */}
        <View style={styles.itemsSection}>
          <Text style={styles.itemsSectionEyebrow}>
            {items.length} {items.length === 1 ? 'piece' : 'pieces'}
          </Text>

          {loading ? (
            <MasonrySkeleton />
          ) : items.length === 0 ? (
            <EmptyState
              density="compact"
              icon="cube-outline"
              title="No pieces in this collection yet"
              subtitle="The curator hasn't added any items to this collection."
              ctaLabel="Refresh"
              onCtaPress={() => void loadDetail(true)}
            />
          ) : (
            <View style={styles.masonryGrid}>
              {masonryColumns.map((columnItems, colIdx) => (
                <View
                  key={colIdx}
                  style={[styles.masonryColumn, { width: MASONRY_COL_WIDTH }]}
                >
                  {columnItems.map((asset) => (
                    <CollectionItemCard
                      key={asset.id}
                      asset={asset}
                      onPress={() => handleItemPress(asset)}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </Reanimated.ScrollView>
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
        // ── Floating header ──
        floatingHeader: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          backgroundColor: colors.background,
          borderBottomWidth: Stroke.hairline,
          borderBottomColor: colors.border,
        },
        headerInner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Space.sm,
          paddingBottom: Space.sm,
          minHeight: Space.xxl + Space.xs,
        },
        floatingTitle: {
          flex: 1,
          fontSize: Type.subtitle.size,
          fontFamily: Typography.family.bold,
          color: colors.textPrimary,
          letterSpacing: Type.subtitle.letterSpacing,
          textAlign: 'center',
          marginHorizontal: Space.xs,
        },
        // ── Back buttons ──
        absoluteBack: {
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 20,
          paddingTop: 0,
        },
        backBtnAbsolute: {
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 20,
        },
        backBtn: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
        },
        backBtnDark: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
        },
        backBtnOverlay: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 0,
        },
        // ── Parallax hero ──
        heroWrap: {
          width: SCREEN_W,
          height: HERO_HEIGHT,
          overflow: 'hidden',
          backgroundColor: colors.surfaceAlt,
        },
        heroImage: {
          width: SCREEN_W,
          height: HERO_HEIGHT,
        } as ImageStyle,
        heroGradient: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '70%',
        },
        heroContent: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: Space.md,
          gap: Space.xs,
        },
        heroTheme: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.semibold,
          color: colors.textInverse,
          opacity: 0.85,
          letterSpacing: Type.metaElevated.letterSpacing,
        },
        heroTitle: {
          fontSize: Type.title.size,
          lineHeight: Type.title.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.textInverse,
          letterSpacing: Type.title.letterSpacing,
        },
        heroSubtitle: {
          fontSize: Type.body.size,
          lineHeight: Type.body.lineHeight,
          fontFamily: Typography.family.regular,
          color: colors.textInverse,
          opacity: 0.85,
        },
        heroCuratorRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          marginTop: Space.xs,
        },
        heroCuratorAvatar: {
          width: Control.icon,
          height: Control.icon,
          borderRadius: Radius.full,
        } as ImageStyle,
        heroCuratorName: {
          flex: 1,
          fontSize: Type.caption.size,
          fontFamily: Typography.family.medium,
          color: colors.textInverse,
          opacity: 0.9,
        },
        // ── Items section ──
        itemsSection: {
          paddingTop: Space.lg,
        },
        itemsSectionEyebrow: {
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm,
          fontSize: Type.meta.size,
          fontFamily: Typography.family.semibold,
          color: colors.textMuted,
          letterSpacing: Type.metaElevated.letterSpacing,
        },
        // ── Masonry ──
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
          backgroundColor: colors.surfaceAlt,
        },
        assetImage: {
          width: '100%',
          height: '100%',
        } as ImageStyle,
        assetMeta: {
          gap: Space.xs / 2,
        },
        assetTitle: {
          fontSize: Type.bodyEmphasis.size,
          lineHeight: Type.bodyEmphasis.lineHeight,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: Type.body.letterSpacing,
        },
        assetValuation: {
          fontSize: Type.bodyLarge.size,
          lineHeight: Type.body.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.textPrimary,
          fontVariant: ['tabular-nums'],
          letterSpacing: Type.bodyLarge.letterSpacing,
        },
      }),
    [colors],
  );
}
