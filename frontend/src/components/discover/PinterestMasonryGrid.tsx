import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Text,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Reanimated from 'react-native-reanimated';
import type { Listing } from '../../domain';
import type {
  DiscoveryFeedUnit,
  ListingFeedUnit,
  RecommendationBreakFeedUnit,
} from '../../contracts/discoveryFeedUnit';
import type { DiscoveryListingSummary } from '../../contracts/DiscoveryListingSummary';
import { ProductDiscoveryTile } from '../ProductCardV2';
import { Space, Type, Typography, Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
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
 *    hero listings + future editorial/look/poster modules), not a uniform
 *    catalogue. This is the structural fix for the Discover tab: the feed-
 *    unit model itself changed, not just the tile styling.
 *  - `editorial` / `look` / `poster` units render `null` until the backend
 *    sends valid data (truthful UI — the client never invents editorial
 *    media). The renderer is ready for them; the data path is not.
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
  onEndReached,
  isLoading = false,
  isLoadingMore = false,
  hasMore = true,
  numColumns = 2,
  gap = Space.sm,
  horizontalPadding = Space.md,
  testIDPrefix,
  refreshControl,
  onScroll,
  scrollRef,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotionEnabled = useReducedMotion();
  const { colors } = useAppTheme();

  // Heterogeneous path is active when the feed carries DiscoveryFeedUnit
  // objects. An empty feed falls back to the listing path (the empty/loading
  // states below are shape-agnostic).
  const unitMode = items.length > 0 && isFeedUnit(items[0]);

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
          onListingPress: handleUnitPress,
        });
      }
      // Legacy listing path — unchanged single-column tile.
      return (
        <View style={{ paddingHorizontal: gap / 2, paddingBottom: gap, width: '100%' }}>
          <ProductDiscoveryTile
            item={item}
            onPress={() => handleListingPress(item)}
            aspectRatio={resolveListingMediaAspectRatio(item)}
            downscaleWidth={colWidth}
            testID={testIDPrefix && index === 0 ? `${testIDPrefix}-first` : undefined}
          />
        </View>
      );
    },
    [gap, colWidth, testIDPrefix, handleListingPress, handleUnitPress, numColumns],
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
  onListingPress: (listing: DiscoveryListingSummary) => void;
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
            width: '100%',
          }}
        >
          <ProductDiscoveryTile
            item={u.listing}
            onPress={() => ctx.onListingPress(u.listing)}
            aspectRatio={u.aspectRatio}
            // Hero (full-width) units request a wider derivative; single-
            // column units request the column width.
            downscaleWidth={isHero ? ctx.colWidth * ctx.numColumns + ctx.gap : ctx.colWidth}
            testID={ctx.testIDPrefix && index === 0 ? `${ctx.testIDPrefix}-first` : undefined}
          />
        </View>
      );
    }
    case 'recommendation_break': {
      const u = unit as RecommendationBreakFeedUnit;
      return <RecommendationBreakRow label={u.label} gap={ctx.gap} />;
    }
    case 'editorial':
    case 'look':
    case 'poster':
      // The renderer is wired for these unit types, but they render only when
      // the backend sends valid media (discoveryFeedUnit.ts: the client never
      // invents editorial media). Until that data path exists, render null so
      // the feed never shows an empty-URI shell (AGENTS.md §11 — truthful UI).
      return null;
    default:
      return null;
  }
}

// ============================================================================
// RECOMMENDATION BREAK — full-width quiet eyebrow, no media
// ============================================================================

function RecommendationBreakRow({ label, gap }: { label: string; gap: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        // Full-width units in FlashList masonry still receive the column
        // padding; counter it so the eyebrow aligns to the outer rail.
        paddingHorizontal: 0,
        paddingTop: Space.lg,
        paddingBottom: Space.xs,
        width: '100%',
      }}
      accessibilityRole="header"
    >
      <Text
        style={{
          fontSize: Type.meta.size,
          lineHeight: Type.meta.lineHeight,
          fontFamily: Typography.family.semibold,
          color: colors.textSecondary,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          // Align to the same left rail as the masonry content.
          marginLeft: gap / 2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  footerSkeletonRow: {
    flexDirection: 'row',
    gap: Space.sm,
    justifyContent: 'center',
  },
  endOfList: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    gap: Space.sm,
  },
  endOfListHairline: {
    width: 40,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(128,128,128,0.3)',
  },
  endOfListText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: 'rgba(128,128,128,0.7)',
    letterSpacing: Type.meta.letterSpacing,
  },
  empty: {
    flex: 1,
    paddingHorizontal: Space.md,
  },
});
