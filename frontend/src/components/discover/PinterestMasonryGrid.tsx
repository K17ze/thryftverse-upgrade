import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Text,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Reanimated from 'react-native-reanimated';
import type { Listing } from '../../domain';
import type {
  DiscoveryFeedUnit,
  ListingFeedUnit,
  LookFeedUnit,
  MoodboardFeedUnit,
  PosterFeedUnit,
  RecommendationBreakFeedUnit } from '../../contracts/discoveryFeedUnit';
import type { DiscoveryListingSummary } from '../../contracts/DiscoveryListingSummary';
import { mapListingToDiscoverySummary } from '../../contracts/DiscoveryListingSummary';
import { ProductDiscoveryTile } from '../ProductCard';
import { Space, Typography, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { typographyV2Style } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { resolveListingMediaAspectRatio } from '../../utils/listingMediaGeometry';
import { MasonrySkeleton } from '../skeletons/MasonrySkeleton';
import { PremiumSkeletonTile } from './PremiumSkeletonTile';
import { EmptyState } from '../EmptyState';

// ============================================================================
// ANIMATED FLASHLIST
// ============================================================================
// FlashList v2 is wrapped with Reanimated so the grid can receive an animated
// `onScroll` handler (worklet) for surfaces that drive a shared scroll value
// (e.g. DiscoverScene's RefreshIndicator). The wrap is transparent for
// callers that pass a plain onScroll or none at all — it is still one
// FlashList, one performance path. This matches the established pattern in
// HomeScreen / InboxScreen.
const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList) as unknown as React.ComponentClass<
  React.ComponentProps<typeof FlashList<Listing | DiscoveryFeedUnit>> & { ref?: React.Ref<any> }
>;

// ============================================================================
// FEED-UNIT TYPE GUARD
// ============================================================================
const FEED_UNIT_TYPES = new Set<string>([
  'listing',
  'look',
  'poster',
  'moodboard',
  'editorial',
  'recommendation_break',
]);

function isFeedUnit(item: Listing | DiscoveryFeedUnit): item is DiscoveryFeedUnit {
  return typeof (item as DiscoveryFeedUnit).type === 'string' && FEED_UNIT_TYPES.has((item as DiscoveryFeedUnit).type);
}

interface Props {
  /**
   * The feed data. Accepts either:
   *  - `DiscoveryFeedUnit[]` (heterogeneous path): the renderer switches on
   *    `unit.type` and honours `unit.span`. This is the Discover tab's
   *    authored-feed path.
   *  - `Listing[]` (legacy path): unchanged single-column listing tiles.
   *    Used by Browse / CategoryDetail / VisualSearch.
   * The grid detects which path to use from the first item's shape.
   */
  items: (Listing | DiscoveryFeedUnit)[];
  /** Legacy navigation callback (Listing[] path). */
  onPressItem?: (item: Listing) => void;
  /**
   * Heterogeneous-path navigation callback for listing units. Receives the
   * production `DiscoveryListingSummary` carried by the `ListingFeedUnit`.
   */
  onItemPress?: (listing: DiscoveryListingSummary) => void;
  /**
   * Save-toggle callback for listing tiles. When provided, each listing tile
   * renders a bookmark button over the media (Pinterest/Depop quick-save
   * pattern). The parent owns the saved state and passes it back via
   * `isItemSaved`.
   */
  onItemSaveToggle?: (listing: DiscoveryListingSummary) => void;
  /** Returns whether a listing is currently saved. Drives the bookmark glyph. */
  isItemSaved?: (listingId: string) => boolean;
  onLookPress?: (lookId: string) => void;
  onPosterPress?: (storyId: string) => void;
  /** Fired when a moodboard tile is tapped. */
  onMoodboardPress?: (moodboardId: string) => void;
  /** Kept for interface compatibility; the discovery tile has no seller row. */
  onPressSeller?: (item: Listing) => void;
  onMessageSeller?: (item: Listing) => void;
  /** Pagination — invoked when the user nears the end of the feed. */
  onEndReached?: () => void;
  /** Initial load (no items yet) → masonry skeleton. */
  isLoading?: boolean;
  /** Loading more pages (items present) → small footer indicator. */
  isLoadingMore?: boolean;
  /** When false and not loading more, show end-of-list state. */
  hasMore?: boolean;
  numColumns?: number;
  /** Kept for interface compatibility; the discovery tile has no save button. */
  showSaveButton?: boolean;
  visualOnly?: boolean;
  gap?: number;
  horizontalPadding?: number;
  /**
   * Kept for interface compatibility. FlashList recycles items, so staggered
   * entrance animations are intentionally NOT rendered (they break recycling
   * and replay on every recycled cell). Silently ignored.
   */
  enableEntranceAnimation?: boolean;
  /**
   * TestID prefix for Maestro/automation. When provided, the first card
   * (index 0) receives `${prefix}-first` so Maestro flows can tapOn by
   * id instead of brittle coordinate taps (P0.6).
   */
  testIDPrefix?: string;
  /** Explicit testID for the first card (index 0). When provided, overrides
   *  the prefix-derived testID so Maestro flows can tapOn by an exact id. */
  firstItemTestID?: string;
  /** Pull-to-refresh control — passed through to FlashList. */
  refreshControl?: React.ReactElement<any>;
  /**
   * Optional scroll handler so a parent can drive a shared scroll value from
   * the FlashList's own scrolling — without wrapping the grid in a ScrollView
   * (which would break virtualization). A plain JS handler that sets a
   * Reanimated SharedValue's `.value` is the proven pattern with FlashList +
   * Reanimated 4.x (`useAnimatedScrollHandler` does not fire from FlashList
   * in 4.x).
   */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Optional ref forwarded to the FlashList (scrollToOffset / useScrollToTop). */
  scrollRef?: React.MutableRefObject<any>;
  /**
   * Optional header rendered by FlashList above the masonry grid. Scrolls
   * with the feed (it is NOT sticky-fixed) so it never overlaps content.
   * Used by DiscoverScene to mount the category pill bar.
   */
  listHeaderComponent?: React.ReactElement;
}

/**
 * PinterestMasonryGrid — production FlashList v2 masonry feed.
 *
 * Replaces the former manual two-array height-estimation layout. FlashList
 * v2 measures actual rendered item heights, so no `estimatedItemSize` is
 * required and no manual column balancing is needed. The FlashList owns its
 * own scrolling — it must NOT be wrapped in a ScrollView.
 *
 * Heterogeneous feed (DiscoveryFeedUnit[]):
 *  - The renderer switches on `unit.type` and honours `unit.span`, so the
 *    feed is an authored canvas (listings + full-width context breaks +
 *    hero listings + live Looks/Posters/Moodboards), not a uniform catalogue.
 *    This is the structural fix for the Discover tab: the feed-unit model
 *    itself changed, not just the tile styling.
 *  - Creator modules render only after the assembly layer validates live
 *    media. Server editorial remains fail-closed until its route is wired.
 *
 * Recycling safety:
 *  - `keyExtractor` returns a stable `${id}` key.
 *  - `renderItem` is memoized with `useCallback`.
 *  - `getItemType` returns `type:span` so recycled cells stay type-stable.
 *  - The tile uses `expo-image` with `recyclingKey={item.id}` so recycled
 *    cells never display stale media.
 *  - No per-item service subscriptions or network calls inside the tile.
 */
export function PinterestMasonryGrid({
  items,
  onPressItem,
  onItemPress,
  onItemSaveToggle,
  isItemSaved,
  onLookPress,
  onPosterPress,
  onMoodboardPress,
  onEndReached,
  isLoading = false,
  isLoadingMore = false,
  hasMore = true,
  numColumns = 2,
  gap = Space.sm,
  horizontalPadding = Space.md,
  testIDPrefix,
  firstItemTestID,
  refreshControl,
  onScroll,
  scrollRef,
  listHeaderComponent }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotionEnabled = useReducedMotion();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Column width for CDN downscaling. FlashList v2 masonry gives each column
  // (windowWidth - 2*horizontalPadding) / numColumns; subtract the inter-item
  // gutter so thumbnails request appropriately sized derivatives.
  const colWidth = Math.max(
    1,
    Math.floor((windowWidth - horizontalPadding * 2 - gap * (numColumns - 1)) / numColumns),
  );
  const footerTileWidth = colWidth;

  // Navigation handlers — kept distinct so the two paths stay type-safe.
  const handleListingPress = useCallback(
    (item: Listing) => {
      onPressItem?.(item);
    },
    [onPressItem],
  );

  const handleUnitPress = useCallback(
    (listing: DiscoveryListingSummary) => {
      onItemPress?.(listing);
    },
    [onItemPress],
  );

  const keyExtractor = useCallback(
    (item: Listing | DiscoveryFeedUnit) => item.id,
    [],
  );

  // getItemType — type+span so recycled cells are reused only among
  // structurally identical units (a full-width break never recycles into a
  // single-column tile's measured cell).
  const getItemType = useCallback(
    (item: Listing | DiscoveryFeedUnit): string => {
      if (isFeedUnit(item)) {
        return `${item.type}:${item.span ?? 1}`;
      }
      return 'listing:1';
    },
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Listing | DiscoveryFeedUnit; index: number }) => {
      if (isFeedUnit(item)) {
        return renderUnit(item, index, {
          numColumns,
          gap,
          colWidth,
          testIDPrefix,
          firstItemTestID,
          onListingPress: handleUnitPress,
          onListingSaveToggle: onItemSaveToggle,
          isListingSaved: isItemSaved,
          onLookPress,
          onPosterPress,
          onMoodboardPress });
      }
      // Legacy listing path — single-column tile with optional save button.
      return (
        <View style={{ paddingHorizontal: gap / 2, paddingBottom: gap, width: '100%' }}>
          <ProductDiscoveryTile
            item={item}
            onPress={() => handleListingPress(item)}
            aspectRatio={resolveListingMediaAspectRatio(item)}
            downscaleWidth={colWidth}
            testID={index === 0 ? (firstItemTestID ?? (testIDPrefix ? `${testIDPrefix}-first` : undefined)) : undefined}
            isSaved={isItemSaved?.(item.id)}
            onSaveToggle={onItemSaveToggle ? () => onItemSaveToggle(mapListingToDiscoverySummary(item)) : undefined}
          />
        </View>
      );
    },
    [gap, colWidth, testIDPrefix, firstItemTestID, handleListingPress, handleUnitPress, numColumns, onItemSaveToggle, isItemSaved, onLookPress, onPosterPress, onMoodboardPress],
  );

  // overrideItemLayout — span is decided here from the unit's declared span
  // (clamped to numColumns). Listings default to span 1; full-width units
  // (breaks, editorial, hero listings) declare span = numColumns upstream in
  // the feed-assembly layer, so the rhythm decision lives in one place.
  const overrideItemLayout = useCallback(
    (layout: { span?: number }, item: Listing | DiscoveryFeedUnit) => {
      if (isFeedUnit(item)) {
        const span = item.span ?? 1;
        layout.span = Math.max(1, Math.min(span, numColumns));
      } else {
        layout.span = 1;
      }
    },
    [numColumns],
  );

  const ListFooterComponent = useMemo(
    () =>
      isLoadingMore ? (
        <View style={styles.footer}>
          <View style={styles.footerSkeletonRow}>
            <PremiumSkeletonTile
              width={footerTileWidth}
              height={Math.round(footerTileWidth / 0.75)}
              borderRadius={Radius.lg}
            />
            <PremiumSkeletonTile
              width={footerTileWidth}
              height={Math.round(footerTileWidth / 1.0)}
              borderRadius={Radius.lg}
            />
          </View>
        </View>
      ) : !hasMore && items.length > 0 ? (
        <View style={styles.endOfList}>
          <View style={styles.endOfListHairline} />
          <Text style={styles.endOfListText}>You've reached the end</Text>
        </View>
      ) : null,
    [isLoadingMore, hasMore, items.length, footerTileWidth],
  );

  // Empty / loading states. FlashList owns its own scrolling, so these render
  // as the list body — never wrapped in a ScrollView.
  if (items.length === 0) {
    if (isLoading) {
      return (
        <MasonrySkeleton
          numColumns={numColumns}
          horizontalPadding={horizontalPadding}
          gap={gap}
        />
      );
    }
    return (
      <View style={styles.empty}>
        <EmptyState
          icon="search-outline"
          title="Nothing here yet"
          subtitle="Check back soon for new finds."
          density="compact"
        />
      </View>
    );
  }

  // `reducedMotionEnabled` is referenced (not gated) so the skeleton path and
  // future viewability-driven surfaces honour the accessibility preference
  // without introducing animations that would break recycling.
  void reducedMotionEnabled;

  return (
    <AnimatedFlashList
      ref={scrollRef}
      data={items}
      masonry
      numColumns={numColumns}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      overrideItemLayout={overrideItemLayout}
      onScroll={onScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: Math.max(horizontalPadding - gap / 2, 0) }}
      ListHeaderComponent={listHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      refreshControl={refreshControl}
    />
  );
}

// ============================================================================
// UNIT RENDERER — switches on DiscoveryFeedUnit.type
// ============================================================================

interface UnitRenderContext {
  numColumns: number;
  gap: number;
  colWidth: number;
  testIDPrefix?: string;
  firstItemTestID?: string;
  onListingPress: (listing: DiscoveryListingSummary) => void;
  onListingSaveToggle?: (listing: DiscoveryListingSummary) => void;
  isListingSaved?: (listingId: string) => boolean;
  onLookPress?: (lookId: string) => void;
  onPosterPress?: (storyId: string) => void;
  onMoodboardPress?: (moodboardId: string) => void;
}

function renderUnit(
  unit: DiscoveryFeedUnit,
  index: number,
  ctx: UnitRenderContext,
): React.ReactElement | null {
  switch (unit.type) {
    case 'listing': {
      const u = unit as ListingFeedUnit;
      const isHero = (u.span ?? 1) >= ctx.numColumns;
      return (
        <View
          style={{
            paddingHorizontal: ctx.gap / 2,
            paddingBottom: ctx.gap,
            width: '100%' }}
        >
          <ProductDiscoveryTile
            item={u.listing}
            onPress={() => ctx.onListingPress(u.listing)}
            aspectRatio={u.aspectRatio}
            // Hero (full-width) units request a wider derivative; single-
            // column units request the column width.
            downscaleWidth={isHero ? ctx.colWidth * ctx.numColumns + ctx.gap : ctx.colWidth}
            testID={index === 0 ? (ctx.firstItemTestID ?? (ctx.testIDPrefix ? `${ctx.testIDPrefix}-first` : undefined)) : undefined}
            isSaved={ctx.isListingSaved?.(u.listing.id)}
            onSaveToggle={ctx.onListingSaveToggle ? () => ctx.onListingSaveToggle!(u.listing) : undefined}
          />
        </View>
      );
    }
    case 'recommendation_break': {
      const u = unit as RecommendationBreakFeedUnit;
      return <RecommendationBreakRow label={u.label} gap={ctx.gap} />;
    }
    case 'look': {
      const u = unit as LookFeedUnit;
      return (
        <View style={{ paddingHorizontal: ctx.gap / 2, paddingBottom: ctx.gap }}>
          <LookDiscoveryTile unit={u} onPress={ctx.onLookPress} />
        </View>
      );
    }
    case 'poster': {
      const u = unit as PosterFeedUnit;
      return (
        <View style={{ paddingHorizontal: ctx.gap / 2, paddingBottom: ctx.gap }}>
          <PosterDiscoveryTile unit={u} onPress={ctx.onPosterPress} />
        </View>
      );
    }
    case 'moodboard': {
      const u = unit as MoodboardFeedUnit;
      return (
        <View style={{ paddingHorizontal: ctx.gap / 2, paddingBottom: Space.md }}>
          <MoodboardDiscoveryTile unit={u} onPress={ctx.onMoodboardPress} />
        </View>
      );
    }
    case 'editorial':
      // Editorial remains fail-closed until a valid server-owned module and
      // destination are present. Looks, Posters and Moodboards have concrete
      // renderers above and are filtered at the assembly boundary.
      return null;
    default:
      return null;
  }
}

function LookDiscoveryTile({
  unit,
  onPress }: {
  unit: LookFeedUnit;
  onPress?: (lookId: string) => void;
}) {
  const { colors } = useAppTheme();
  const creator = unit.look.creator.username ?? 'creator';
  const creatorVerified = unit.look.creator.verified === true;
  const tile = (
    <View style={{ aspectRatio: unit.aspectRatio, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
        <ExpoImage
          source={{ uri: unit.coverImageUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={unit.id}
          transition={160}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          locations={[0.48, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={{ position: 'absolute', left: Space.smMd, right: Space.smMd, bottom: Space.smMd }}>
          <Text style={{ color: colors.scrimTextPrimary, fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight }} numberOfLines={2}>
            {unit.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xxs, marginTop: 2 }}>
            <Text style={{ color: colors.scrimTextPrimary, fontFamily: TypographyV2.body.fontFamily, fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
              @{creator}
            </Text>
            {creatorVerified && (
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={colors.brand}
                accessibilityLabel="Verified creator"
              />
            )}
          </View>
        </View>
        {unit.itemIds.length > 0 ? (
          <View style={{ position: 'absolute', top: Space.sm, right: Space.sm }}>
            <Ionicons name="pricetag" size={15} color={colors.scrimTextPrimary} />
          </View>
        ) : null}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={`${unit.title}, look by ${creator}${creatorVerified ? ', verified creator' : ''}`}>
        {tile}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onPress(unit.look.id)}
      accessibilityRole="button"
      accessibilityLabel={`${unit.title}, look by ${creator}${creatorVerified ? ', verified creator' : ''}`}
      accessibilityHint="Opens the look"
      style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}
    >
      {tile}
    </Pressable>
  );
}

function PosterDiscoveryTile({
  unit,
  onPress }: {
  unit: PosterFeedUnit;
  onPress?: (storyId: string) => void;
}) {
  const { colors } = useAppTheme();
  const creator = unit.story.creator.username ?? 'creator';
  const creatorVerified = unit.story.creator.isVerified === true;
  const tile = (
    <View style={{ aspectRatio: unit.aspectRatio, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
        <ExpoImage
          source={{ uri: unit.coverUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={unit.id}
          transition={160}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          locations={[0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Ionicons name="play" size={16} color={colors.scrimTextPrimary} style={{ position: 'absolute', top: Space.sm, right: Space.sm }} />
        <View style={{ position: 'absolute', left: Space.smMd, right: Space.smMd, bottom: Space.smMd, flexDirection: 'row', alignItems: 'center', gap: Space.xxs }}>
          <Text
            style={{ color: colors.scrimTextPrimary, fontFamily: Typography.family.semibold, fontSize: 12, lineHeight: 16 }}
            numberOfLines={1}
          >
            @{creator}
          </Text>
          {creatorVerified && (
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={colors.brand}
              accessibilityLabel="Verified creator"
            />
          )}
        </View>
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={`Poster by ${creator}${creatorVerified ? ', verified creator' : ''}`}>
        {tile}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onPress(unit.story.id)}
      accessibilityRole="button"
      accessibilityLabel={`Poster by ${creator}${creatorVerified ? ', verified creator' : ''}`}
      accessibilityHint="Opens the poster"
      style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}
    >
      {tile}
    </Pressable>
  );
}

function MoodboardDiscoveryTile({
  unit,
  onPress }: {
  unit: MoodboardFeedUnit;
  onPress?: (moodboardId: string) => void;
}) {
  const { colors } = useAppTheme();
  const imageUris = [unit.coverUri, ...unit.moodboard.items.map((item) => item.imageUri)]
    .filter((uri, index, all) => uri.trim().length > 0 && all.indexOf(uri) === index)
    .slice(0, 3);
  const tile = (
    <View style={{ aspectRatio: unit.aspectRatio, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt, flexDirection: 'row', gap: 2 }}>
        <ExpoImage
          source={{ uri: imageUris[0] }}
          style={{ flex: imageUris.length > 1 ? 1.35 : 1 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`${unit.id}:0`}
          transition={160}
        />
        {imageUris.length > 1 ? (
          <View style={{ flex: 0.9, gap: 2 }}>
            {imageUris.slice(1).map((uri, index) => (
              <ExpoImage
                key={uri}
                source={{ uri }}
                style={{ flex: 1 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={`${unit.id}:${index + 1}`}
                transition={160}
              />
            ))}
          </View>
        ) : null}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.62)']}
          locations={[0.48, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={{ position: 'absolute', left: Space.md, right: Space.md, bottom: Space.smMd }}>
          <Text style={{ color: colors.scrimTextPrimary, fontFamily: TypographyV2.sectionTitle.fontFamily, fontSize: TypographyV2.sectionTitle.size, lineHeight: TypographyV2.sectionTitle.lineHeight }} numberOfLines={1}>
            {unit.moodboard.title}
          </Text>
          <Text style={{ color: colors.scrimTextSecondary, fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, lineHeight: TypographyV2.meta.lineHeight }} numberOfLines={1}>
            {unit.moodboard.curator} · {unit.moodboard.items.length} pieces
          </Text>
        </View>
      </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={`${unit.moodboard.title}, moodboard by ${unit.moodboard.curator}`}>
        {tile}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onPress(unit.moodboard.id)}
      accessibilityRole="button"
      accessibilityLabel={`${unit.moodboard.title}, moodboard by ${unit.moodboard.curator}`}
      accessibilityHint="Opens the moodboard"
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      {tile}
    </Pressable>
  );
}

// ============================================================================
// RECOMMENDATION BREAK — full-width quiet eyebrow, no media
// ============================================================================

/** Short decorative hairline before the eyebrow label (24pt). */
const BREAK_HAIRLINE_WIDTH = 24;

function RecommendationBreakRow({ label, gap }: { label: string; gap: number }) {
  const { colors } = useAppTheme();
  // TypographyV2 has no dedicated `eyebrow` role; `label` is the canonical
  // uppercase role (11/14/600, letterSpacing 0.5) and is the closest semantic
  // match for a quiet section-divider eyebrow.
  const eyebrowStyle = React.useMemo(
    () => ({
      ...typographyV2Style('label'),
      color: colors.textSecondary }),
    [colors.textSecondary],
  );
  return (
    <View
      style={{
        // Full-width units in FlashList masonry still receive the column
        // padding; counter it so the eyebrow aligns to the outer rail.
        paddingHorizontal: 0,
        paddingTop: Space.lg,
        paddingBottom: Space.xs,
        width: '100%' }}
      accessibilityRole="header"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginLeft: gap / 2,
          gap: Space.xs }}
      >
        {/* Subtle decorative hairline before the text — a quiet visual
            marker that separates chapters without fabricated media. */}
        <View
          style={{
            width: BREAK_HAIRLINE_WIDTH,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.borderSubtle }}
        />
        <Text style={eyebrowStyle} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  footer: {
    paddingVertical: Space.md,
    alignItems: 'center' },
  footerSkeletonRow: {
    flexDirection: 'row',
    gap: Space.sm,
    justifyContent: 'center' },
  endOfList: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    gap: Space.sm },
  endOfListHairline: {
    width: 40,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle },
  endOfListText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: TypographyV2.meta.letterSpacing },
  empty: {
    flex: 1,
    paddingHorizontal: Space.md } });
}
