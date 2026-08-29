import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, AspectRatio } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useScrollToTop } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { EmptyState } from '../EmptyState';
import { PremiumSkeletonTile } from '../discover/PremiumSkeletonTile';
import { fetchLooksFromApi, type LookApiItem } from '../../services/looksApi';
import { isVideoUri } from '../../utils/media';
import {
  resolveLookTemplate,
  type LookTemplate } from '../../utils/lookTemplates';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Feed mode tabs ───────────────────────────────────────────────────────────
// Pinterest/LTK-style feed segmentation. "For You" is the personalised default,
// "Following" restricts to creators the viewer follows. The `sort` value is
// passed through to the API; unsupported ranking modes are not exposed as
// decorative controls.
type FeedMode = 'foryou' | 'following';

const FEED_TABS: { key: FeedMode; label: string; sort: string }[] = [
  { key: 'foryou', label: 'For You', sort: 'foryou' },
  { key: 'following', label: 'Following', sort: 'following' },
];

// Template set and resolveLookTemplate are now shared from
// ../../utils/lookTemplates — see that file for the height rhythm
// and editorial/cinematic anchor logic.

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
  styles }: {
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
  const creatorVerified = look.creator.verified === true;

  return (
    <Pressable
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Look by ${creatorHandle}${creatorVerified ? ', verified creator' : ''}`}
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

        {/* Bottom gradient scrim — guarantees text contrast across all
            imagery (AGENTS.md §4: text on variable imagery MUST have a
            contrast scrim). Fades from transparent to a 0.6 dark scrim
            over the bottom 45% of the tile. */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.6)']}
          locations={[0, 0.5, 1.0]}
          style={styles.tileScrim}
          pointerEvents="none"
        />

        {/* Creator identity — bottom-left, on the gradient scrim. No pill.
            Username is 12pt semibold white; the verified checkmark is 14pt
            blue so it reads as a recognisable trust signal, not a tiny
            inline glyph. */}
        <View style={styles.creatorOverlay}>
          <Text style={styles.creatorText} numberOfLines={1}>
            @{creatorHandle}
          </Text>
          {creatorVerified && (
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={colors.brand}
              style={styles.verifiedIcon}
              accessibilityLabel="Verified creator"
            />
          )}
          {isShoppable && (
            <View style={styles.shoppableInline}>
              <Ionicons name="pricetag" size={10} color={colors.textInverse} />
              <Text style={styles.shoppableText}>{look.tags.length}</Text>
            </View>
          )}
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

        {/* Like count — bottom-right, on the gradient scrim. Heart icon is
            14pt white with an 11pt regular white count — Pinterest-style
            engagement cue with guaranteed contrast from the scrim. */}
        {look.likeCount > 0 && (
          <View style={styles.likeOverlay}>
            <Ionicons name="heart" size={14} color={colors.textInverse} />
            <Text style={styles.likeText}>
              {look.likeCount > 999 ? `${(look.likeCount / 1000).toFixed(1)}k` : look.likeCount}
            </Text>
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
  const scrollRef = useRef<any>(null);
  useScrollToTop(scrollRef);
  const haptic = useHaptic();

  const [looks, setLooks] = useState<LookApiItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>('foryou');
  const loadedLookCountRef = useRef(0);

  useEffect(() => {
    loadedLookCountRef.current = looks.length;
  }, [looks.length]);

  // Initial / refresh load. Resets the cursor and replaces the list.
  // The feed mode drives the `sort` parameter so the API can segment the feed.
  const loadLooks = useCallback(
    async (isRefresh: boolean = false, mode: FeedMode) => {
      const sort = FEED_TABS.find((t) => t.key === mode)?.sort ?? 'foryou';
      if (isRefresh) {
        setIsRefreshing(true);
      }
      setLoadError(null);
      try {
        const res = await fetchLooksFromApi({ status: 'published', sort });
        setLooks(res.items ?? []);
        setCursor(res.nextCursor ?? null);
      } catch {
        if (!isRefresh && loadedLookCountRef.current === 0) {
          setLoadError('Looks could not be loaded.\nCheck your connection and try again.');
        } else if (isRefresh) {
          setLoadError('Looks could not be refreshed.\nShowing the last loaded posts.');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadLooks(false, feedMode);
  }, [feedMode, loadLooks]);

  const handleRefresh = useCallback(() => {
    haptic.patterns.refresh();
    void loadLooks(true, feedMode);
  }, [feedMode, loadLooks, haptic]);

  // Feed tab switch — haptic, clear the list, reload with the new sort.
  const handleFeedModeChange = useCallback(
    (mode: FeedMode) => {
      if (mode === feedMode) return;
      haptic.selection();
      setFeedMode(mode);
      setLooks([]);
      setCursor(null);
      setIsLoading(true);
    },
    [feedMode, haptic],
  );

  // Cursor-based pagination. The service returns nextCursor; when present we
  // fetch the next page and append. Otherwise onEndReached stays undefined.
  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const sort = FEED_TABS.find((t) => t.key === feedMode)?.sort ?? 'foryou';
      const res = await fetchLooksFromApi({ status: 'published', sort, cursor });
      setLooks((prev) => [...prev, ...(res.items ?? [])]);
      setCursor(res.nextCursor ?? null);
    } catch {
      // Silent fail on pagination — the user still has the loaded pages.
      setCursor(null);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore, feedMode]);

  const handleCreateLook = useCallback(() => {
    navigation.navigate('CreatorStudio', { type: 'look' });
  }, [navigation]);

  // Pill-style feed tabs — rendered above the masonry grid in every state
  // except the full-screen error. Active pill uses the brand fill; inactive
  // pills are plain secondary text. Mirrors Pinterest/LTK feed segmentation.
  const FeedTabs = useMemo(
    () => (
      <View style={styles.feedTabsRow}>
        {FEED_TABS.map((tab) => {
          const isActive = feedMode === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.feedPill, isActive && styles.feedPillActive]}
              onPress={() => handleFeedModeChange(tab.key)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.feedPillText,
                  isActive ? styles.feedPillTextActive : styles.feedPillTextInactive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ),
    [feedMode, handleFeedModeChange, styles],
  );

  // ── FlashList v2 masonry hooks ────────────────────────────────────────────
  // These hooks MUST be called before any early returns. React requires hooks
  // to be called in the same order on every render. If we return early (e.g.
  // during loading) and skip these hooks, React throws "Rendered more hooks
  // than during the previous render" when the loading state clears.
  const keyExtractor = useCallback(
    (item: LookApiItem) => `look-${item.id}`,
    [],
  );

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
    [styles, colors, navigation],
  );

  // Deterministic span: editorial anchors + cinematic (video / multi-layer)
  // looks span both columns. Everything else is a single-column tile.
  const overrideItemLayout = useCallback(
    (
      layout: { span?: number },
      item: LookApiItem,
      index: number,
    ) => {
      const template = resolveLookTemplate(item, index);
      layout.span = template.span;
    },
    [],
  );

  const ListHeaderComponent = useMemo(
    () => (
      <>
        {loadError && looks.length > 0 && (
          <View style={styles.refreshErrorBanner}>
            <Text style={styles.refreshErrorText}>
              Looks could not be refreshed. Showing the last loaded posts.
            </Text>
            <Pressable
              onPress={() => loadLooks(true, feedMode)}
              accessibilityRole="button"
              accessibilityLabel="Retry refresh"
            >
              <Text style={styles.retryLink}>Retry</Text>
            </Pressable>
          </View>
        )}
      </>
    ),
    [loadError, looks.length, styles, loadLooks, feedMode],
  );

  const ListFooterComponent = useMemo(
    () =>
      isLoadingMore ? (
        <View style={styles.footer}>
          <View style={styles.masonrySkeletonGrid}>
            <View style={styles.masonrySkeletonCol}>
              <PremiumSkeletonTile
                width={(windowWidth - Space.md * 2 - Space.sm) / 2}
                height={Math.round((windowWidth - Space.md * 2 - Space.sm) / 2 / AspectRatio.marketplace)}
                borderRadius={Radius.lg}
                style={styles.masonrySkeletonTile}
              />
            </View>
            <View style={styles.masonrySkeletonCol}>
              <PremiumSkeletonTile
                width={(windowWidth - Space.md * 2 - Space.sm) / 2}
                height={Math.round((windowWidth - Space.md * 2 - Space.sm) / 2 / AspectRatio.wide)}
                borderRadius={Radius.lg}
                style={styles.masonrySkeletonTile}
              />
            </View>
          </View>
        </View>
      ) : !cursor && looks.length > 0 ? (
        <View style={styles.endOfList}>
          <View style={styles.endOfListHairline} />
          <Text style={styles.endOfListText}>You've reached the end</Text>
        </View>
      ) : null,
    [isLoadingMore, cursor, looks.length, windowWidth, styles],
  );

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
        {FeedTabs}
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
            void loadLooks(false, feedMode);
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
      <View style={styles.scrollContent}>
        {FeedTabs}
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

  // Only wire onEndReached when there is a cursor to consume — avoids
  // no-op fetches at the end of a finite feed.
  const onEndReached = cursor ? loadMore : undefined;

  return (
    <View style={styles.feedContainer}>
      <View style={styles.feedStaticHeader}>
        {FeedTabs}
      </View>
      <FlashList
        ref={scrollRef}
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
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    masonrySkeletonGrid: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Space.sm },
    masonrySkeletonCol: {
      flexDirection: 'column',
      gap: Space.sm },
    masonrySkeletonTile: {
      marginBottom: 0 },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl },
    // Outer container for the populated feed — holds the static header +
    // feed tabs above the scrolling FlashList.
    feedContainer: {
      flex: 1 },
    // Static (non-scrolling) header region: section header + feed tabs.
    // Horizontal padding matches the FlashList content padding so the
    // header aligns with the masonry grid below.
    feedStaticHeader: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm },
    // ── Feed tabs ──
    // Pill-style feed segmentation (For You / Following / Trending).
    // Active pill carries the brand fill; inactive pills are plain text.
    feedTabsRow: {
      flexDirection: 'row',
      gap: Space.xs,
      paddingBottom: Space.sm },
    feedPill: {
      paddingVertical: Space.xs + 2,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full },
    feedPillActive: {
      backgroundColor: colors.brand },
    feedPillText: {
      fontSize: TypographyV2.meta.size },
    feedPillTextActive: {
      color: colors.textInverse,
      fontFamily: TypographyV2.meta.fontFamily },
    feedPillTextInactive: {
      color: colors.textSecondary,
      fontFamily: TypographyV2.meta.fontFamily },
    errorWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: Space.md,
      gap: Space.sm },
    errorTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary },
    errorSubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted,
      textAlign: 'center' },
    retryBtn: {
      marginTop: Space.sm,
      paddingHorizontal: Space.lg,
      paddingVertical: 10,
      backgroundColor: colors.brand,
      borderRadius: Radius.xxl },
    retryBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textInverse },
    refreshErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: 10,
      marginBottom: Space.md,
      gap: Space.sm },
    refreshErrorText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    retryLink: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.brand },
    footer: {
      paddingVertical: Space.md,
      alignItems: 'center' },
    endOfList: {
      alignItems: 'center',
      paddingVertical: Space.lg,
      gap: Space.sm },
    endOfListHairline: {
      width: 40,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border },
    endOfListText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing },
    // ── Tile ──
    tileCell: {
      paddingHorizontal: Space.sm,
      paddingBottom: Space.sm,
      width: '100%' },
    tile: {
      width: '100%',
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    tileMedia: {
      width: '100%',
      position: 'relative' },
    tileImage: {
      width: '100%',
      height: '100%' },
    // Gradient scrim — covers bottom 40% of tile for text legibility.
    tileScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '45%' },
    // Creator identity — bottom-left, on the gradient scrim. No pill.
    creatorOverlay: {
      position: 'absolute',
      bottom: Space.xs + 2,
      left: Space.xs + 2,
      right: Space.xs + 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    // Username — 12pt semibold white. Fixed white ink because the gradient
    // scrim is always dark at the bottom; a theme text token (black in dark
    // mode) would render invisible.
    creatorText: {
      color: '#FFFFFF',
      fontSize: TypographyV2.meta.size,
      lineHeight: 16,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      flexShrink: 1 },
    // Verified checkmark — 14pt blue, recognisable trust signal (not a tiny
    // inline glyph). Uses the brand blue so it reads as verification, not
    // a decorative icon.
    verifiedIcon: {
      flexShrink: 0 },
    // Shoppable count — inline with creator handle, not a separate badge.
    shoppableInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2 },
    shoppableText: {
      color: '#FFFFFF',
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
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
      backgroundColor: colors.overlay },
    // Like count — bottom-right, on the gradient scrim.
    likeOverlay: {
      position: 'absolute',
      bottom: Space.xs + 2,
      right: Space.xs + 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3 },
    // Heart count — 11pt regular white. Fixed white ink because the gradient
    // scrim guarantees contrast; a theme token would render black-on-dark in
    // dark mode.
    likeText: {
      color: '#FFFFFF',
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily } });
}
