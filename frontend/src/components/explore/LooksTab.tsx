import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type, AspectRatio } from '../../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { EmptyState } from '../EmptyState';
import { PremiumSkeletonTile } from '../discover/PremiumSkeletonTile';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';
import { fetchLooksFromApi, type LookApiItem } from '../../services/looksApi';
import { isVideoUri } from '../../utils/media';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Template set ─────────────────────────────────────────────────────────────
// A small, deterministic template set drives the mixed-tile Explore canvas.
// Templates are assigned from item properties + index, never at random.
//
//   1×1 standard        — default image look (span 1, 4:5)
//   1×2 portrait feature — tall portrait look (span 1, 4:5, taller media)
//   2×1 cinematic        — video or multi-layer collage (span 2, 16:9)
//   2×2 editorial anchor — rare, every 8th item (span 2, 4:5)
//
// `span` is consumed by FlashList's `overrideItemLayout`; the aspect ratio is
// applied inside the tile so each cell sizes to its creator's media, not a
// screen-imposed fixed height.
const EDITORIAL_ANCHOR_INTERVAL = 8;

interface LookTemplate {
  /** Column span (1 or 2). Consumed by overrideItemLayout. */
  span: 1 | 2;
  /** Media aspect ratio (width / height) applied to the tile image. */
  aspect: number;
  /** Semantic template id — drives overlay cues. */
  kind: 'standard' | 'portrait' | 'cinematic' | 'editorial';
}

function resolveLookTemplate(look: LookApiItem, index: number): LookTemplate {
  // 2×2 editorial anchor — rare, at a controlled interval.
  if (index > 0 && index % EDITORIAL_ANCHOR_INTERVAL === 0) {
    return { span: 2, aspect: AspectRatio.marketplace, kind: 'editorial' };
  }

  // 2×1 cinematic — video or multi-layer collage looks get a wide feature.
  const isVideo = look.mediaType === 'video' || isVideoUri(look.mediaUrl);
  const isMultiLayer = look.compositionDocument != null;
  if (isVideo || isMultiLayer) {
    return { span: 2, aspect: AspectRatio.wide, kind: 'cinematic' };
  }

  // 1×1 standard image look. 4:5 is the marketplace default; the tile honours
  // real media dimensions once exposed by the service.
  return { span: 1, aspect: AspectRatio.marketplace, kind: 'standard' };
}

// ── LookTile ─────────────────────────────────────────────────────────────────
// Lightweight inline tile for the Explore canvas. Overlay density is kept low:
// only creator identity, a media-type / multi-layer cue, and one shoppable
// marker — enough to decide whether to open, nothing more.
//
// No gradient, no statistics pill, no social icons, no entrance animations.
// FlashList recycles cells, so the tile is pure and animation-free.
function LookTile({
  look,
  template,
  onPress,
  colors,
  styles,
}: {
  look: LookApiItem;
  template: LookTemplate;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const isVideo = look.mediaType === 'video' || isVideoUri(look.mediaUrl);
  const isMultiLayer = look.compositionDocument != null;
  const isShoppable = look.tags.length > 0;
  const creatorHandle = look.creator.username ?? 'unknown';

  return (
    <Pressable
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Look by ${creatorHandle}`}
      accessibilityHint="Opens the look detail"
    >
      <View style={[styles.tileMedia, { aspectRatio: template.aspect }]}>
        <ExpoImage
          source={{ uri: look.mediaUrl }}
          style={styles.tileImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`look-${look.id}`}
          transition={180}
        />

        {/* Creator identity — small, bottom-left, low density */}
        <View style={styles.creatorOverlay}>
          <Text style={styles.creatorText} numberOfLines={1}>
            @{creatorHandle}
          </Text>
        </View>

        {/* Media-type / multi-layer cue — top-right, small icon only */}
        {(isVideo || isMultiLayer) && (
          <View style={styles.mediaCueBadge}>
            <Ionicons
              name={isVideo ? 'play' : 'layers'}
              size={12}
              color={colors.textInverse}
            />
          </View>
        )}

        {/* Shoppable / provenance marker — bottom-right, distinct from likes */}
        {isShoppable && (
          <View style={styles.shoppableMarker}>
            <Ionicons name="pricetag" size={11} color={colors.textInverse} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── LooksTab ─────────────────────────────────────────────────────────────────
export default function LooksTab() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const { width: windowWidth } = useWindowDimensions();

  const [looks, setLooks] = useState<LookApiItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Initial / refresh load. Resets the cursor and replaces the list.
  const loadLooks = useCallback(async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    }
    setLoadError(null);
    try {
      const res = await fetchLooksFromApi({ status: 'published' });
      setLooks(res.items ?? []);
      setCursor(res.nextCursor ?? null);
    } catch {
      if (!isRefresh && looks.length === 0) {
        setLoadError('Looks could not be loaded.\nCheck your connection and try again.');
      } else if (isRefresh) {
        setLoadError('Looks could not be refreshed.\nShowing the last loaded posts.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [looks.length]);

  useEffect(() => {
    loadLooks();
  }, [loadLooks]);

  const handleRefresh = useCallback(() => {
    loadLooks(true);
  }, [loadLooks]);

  // Cursor-based pagination. The service returns nextCursor; when present we
  // fetch the next page and append. Otherwise onEndReached stays undefined.
  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchLooksFromApi({ status: 'published', cursor });
      setLooks((prev) => [...prev, ...(res.items ?? [])]);
      setCursor(res.nextCursor ?? null);
    } catch {
      // Silent fail on pagination — the user still has the loaded pages.
      setCursor(null);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore]);

  const handleCreateLook = useCallback(() => {
    navigation.navigate('CreatorStudio', { type: 'look' });
  }, [navigation]);

  // ── Loading / error / empty states (preserved) ────────────────────────────
  if (isLoading) {
    // Masonry skeleton matching the final layout — two columns of
    // surfaceAlt blocks with varying heights that mirror the template
    // set's aspect ratios (AGENTS.md §14: skeletons should resemble the
    // final layout; no generic centred spinner).
    const colWidth = (windowWidth - Space.md * 2 - Space.sm) / 2;
    const skeletonHeights = [
      Math.round(colWidth / AspectRatio.marketplace),
      Math.round(colWidth / AspectRatio.wide),
      Math.round(colWidth / AspectRatio.marketplace),
      Math.round(colWidth / AspectRatio.marketplace),
    ];
    const leftCol = [skeletonHeights[0], skeletonHeights[2]];
    const rightCol = [skeletonHeights[1], skeletonHeights[3]];

    return (
      <View style={styles.scrollContent}>
        <View style={styles.headerWrap}>
          <DiscoverySectionHeader kicker="Community" title="Looks" />
        </View>
        <View style={styles.masonrySkeletonGrid}>
          <View style={styles.masonrySkeletonCol}>
            {leftCol.map((h, i) => (
              <PremiumSkeletonTile
                key={`l-${i}`}
                width={colWidth}
                height={h}
                borderRadius={Radius.lg}
                style={styles.masonrySkeletonTile}
              />
            ))}
          </View>
          <View style={styles.masonrySkeletonCol}>
            {rightCol.map((h, i) => (
              <PremiumSkeletonTile
                key={`r-${i}`}
                width={colWidth}
                height={h}
                borderRadius={Radius.lg}
                style={styles.masonrySkeletonTile}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (loadError && looks.length === 0) {
    return (
      <View style={styles.errorWrap}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
        <Text style={styles.errorTitle}>Looks could not be loaded</Text>
        <Text style={styles.errorSubtitle}>Check your connection and try again.</Text>
        <AnimatedPressable
          style={styles.retryBtn}
          onPress={() => {
            setIsLoading(true);
            loadLooks();
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Retry loading looks"
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </AnimatedPressable>
      </View>
    );
  }

  if (looks.length === 0 && !loadError) {
    return (
      <View>
        <EmptyState
          icon="camera-outline"
          title="No looks yet"
          subtitle="Create a look, tag real products, and share your style with the community."
          ctaLabel="Create a Look"
          onCtaPress={handleCreateLook}
          graphic={
            <View style={{ alignItems: 'center', marginBottom: Space.md }}>
              <Ionicons name="images-outline" size={48} color={colors.brand} />
            </View>
          }
        />
      </View>
    );
  }

  // ── FlashList v2 masonry canvas ───────────────────────────────────────────
  const keyExtractor = useCallback((item: LookApiItem) => `look-${item.id}`, []);

  const renderItem = useCallback(
    ({ item, index }: { item: LookApiItem; index: number }) => {
      const template = resolveLookTemplate(item, index);
      return (
        <View
          style={[
            styles.tileCell,
            { paddingHorizontal: styles.tileCell.paddingHorizontal / 2 },
          ]}
        >
          <LookTile
            look={item}
            template={template}
            onPress={() => navigation.navigate('LookDetail', { lookId: item.id })}
            colors={colors}
            styles={styles}
          />
        </View>
      );
    },
    [colors, styles, navigation],
  );

  // Deterministic span: editorial anchors + cinematic (video / multi-layer)
  // looks span both columns. Everything else is a single-column tile.
  const overrideItemLayout = useCallback(
    (layout: { span?: number }, item: LookApiItem, index: number) => {
      const template = resolveLookTemplate(item, index);
      layout.span = template.span;
    },
    [],
  );

  const ListHeaderComponent = useMemo(
    () => (
      <View style={styles.headerWrap}>
        <DiscoverySectionHeader kicker="Community" title="Looks" />
        {loadError && looks.length > 0 && (
          <View style={styles.refreshErrorBanner}>
            <Text style={styles.refreshErrorText}>
              Looks could not be refreshed. Showing the last loaded posts.
            </Text>
            <Pressable
              onPress={() => loadLooks(true)}
              accessibilityRole="button"
              accessibilityLabel="Retry refresh"
            >
              <Text style={styles.retryLink}>Retry</Text>
            </Pressable>
          </View>
        )}
      </View>
    ),
    [loadError, looks.length, loadLooks, styles],
  );

  const ListFooterComponent = useMemo(
    () =>
      isLoadingMore ? (
        <View style={styles.footer}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : null,
    [isLoadingMore, colors.textMuted],
  );

  // Column width for CDN downscaling (kept for future derivative sizing).
  void windowWidth;

  // Only wire onEndReached when there is a cursor to consume — avoids
  // no-op fetches at the end of a finite feed.
  const onEndReached = cursor ? loadMore : undefined;

  return (
    <FlashList
      data={looks}
      masonry
      numColumns={2}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      overrideItemLayout={overrideItemLayout}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.brand} />
      }
    />
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
    },
    masonrySkeletonGrid: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Space.sm,
    },
    masonrySkeletonCol: {
      flexDirection: 'column',
      gap: Space.sm,
    },
    masonrySkeletonTile: {
      marginBottom: 0,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl,
    },
    headerWrap: {
      paddingBottom: Space.md,
    },
    errorWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: Space.md,
      gap: Space.sm,
    },
    errorTitle: {
      fontSize: 18,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    errorSubtitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      textAlign: 'center',
    },
    retryBtn: {
      marginTop: Space.sm,
      paddingHorizontal: Space.lg,
      paddingVertical: 10,
      backgroundColor: colors.brand,
      borderRadius: Radius.xxl,
    },
    retryBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textInverse,
    },
    refreshErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: 10,
      marginBottom: Space.md,
      gap: Space.sm,
    },
    refreshErrorText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
    },
    retryLink: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },
    footer: {
      paddingVertical: Space.md,
      alignItems: 'center',
    },
    // ── Tile ──
    tileCell: {
      paddingHorizontal: Space.sm,
      paddingBottom: Space.sm,
      width: '100%',
    },
    tile: {
      width: '100%',
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    tileMedia: {
      width: '100%',
      position: 'relative',
    },
    tileImage: {
      width: '100%',
      height: '100%',
    },
    // Creator identity — small, bottom-left. Low-density overlay.
    creatorOverlay: {
      position: 'absolute',
      bottom: Space.xs,
      left: Space.xs,
      right: Space.xl,
      backgroundColor: colors.overlay,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xxs,
      alignSelf: 'flex-start',
    },
    creatorText: {
      color: colors.textInverse,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.meta.letterSpacing,
    },
    // Media-type / multi-layer cue — top-right, small icon only.
    mediaCueBadge: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: 22,
      height: 22,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay,
    },
    // Shoppable / provenance marker — bottom-right, distinct from likes.
    shoppableMarker: {
      position: 'absolute',
      bottom: Space.xs,
      right: Space.xs,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay,
    },
  });
}
