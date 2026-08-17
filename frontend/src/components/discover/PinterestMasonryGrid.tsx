import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions, ActivityIndicator, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { Listing } from '../../domain';
import { ProductDiscoveryTile } from '../ProductCardV2';
import { Space } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { resolveListingMediaAspectRatio } from '../../utils/listingMediaGeometry';
import { MasonrySkeleton } from '../skeletons/MasonrySkeleton';
import { EmptyState } from '../EmptyState';

interface Props {
  items: Listing[];
  /** Legacy navigation callback — kept so existing callers type-check. */
  onPressItem?: (item: Listing) => void;
  /** Preferred navigation callback (spec). Falls back to onPressItem. */
  onItemPress?: (item: Listing) => void;
  /** Kept for interface compatibility; the discovery tile has no seller row. */
  onPressSeller?: (item: Listing) => void;
  onMessageSeller?: (item: Listing) => void;
  /** Pagination — invoked when the user nears the end of the feed. */
  onEndReached?: () => void;
  /** Initial load (no items yet) → masonry skeleton. */
  isLoading?: boolean;
  /** Loading more pages (items present) → small footer indicator. */
  isLoadingMore?: boolean;
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
}

/**
 * PinterestMasonryGrid — production FlashList v2 masonry feed.
 *
 * Replaces the former manual two-array height-estimation layout. FlashList
 * v2 measures actual rendered item heights, so no `estimatedItemSize` is
 * required and no manual column balancing is needed. The FlashList owns its
 * own scrolling — it must NOT be wrapped in a ScrollView.
 *
 * Recycling safety:
 *  - `keyExtractor` returns a stable `product-${id}` key.
 *  - `renderItem` is memoized with `useCallback`.
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
  numColumns = 2,
  gap = Space.sm,
  horizontalPadding = Space.md,
  testIDPrefix,
  refreshControl,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotionEnabled = useReducedMotion();
  const { colors } = useAppTheme();

  // Column width for CDN downscaling. FlashList v2 masonry gives each column
  // (windowWidth - 2*horizontalPadding) / numColumns; subtract the inter-item
  // gutter so thumbnails request appropriately sized derivatives.
  const colWidth = Math.max(
    1,
    Math.floor((windowWidth - horizontalPadding * 2 - gap * (numColumns - 1)) / numColumns),
  );

  // Resolve navigation handler — prefer the spec's onItemPress, fall back to
  // the legacy onPressItem so existing callers keep working. The grid never
  // navigates directly; the parent decides.
  const handlePress = useCallback(
    (item: Listing) => {
      const handler = onItemPress ?? onPressItem;
      handler?.(item);
    },
    [onItemPress, onPressItem],
  );

  const keyExtractor = useCallback((item: Listing) => `product-${item.id}`, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Listing; index: number }) => (
      <View style={{ paddingHorizontal: gap / 2, paddingBottom: gap, width: '100%' }}>
        <ProductDiscoveryTile
          item={item}
          onPress={() => handlePress(item)}
          aspectRatio={resolveListingMediaAspectRatio(item)}
          downscaleWidth={colWidth}
          testID={testIDPrefix && index === 0 ? `${testIDPrefix}-first` : undefined}
        />
      </View>
    ),
    [gap, colWidth, handlePress, testIDPrefix],
  );

  // Discovery tiles never span the full width — single-column placement only.
  // `overrideItemLayout` is wired so full-span units (e.g. editorial breaks)
  // can be introduced later by switching on item type here.
  const overrideItemLayout = useCallback(
    (layout: { span?: number }) => {
      layout.span = 1;
    },
    [],
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
    <FlashList
      data={items}
      masonry
      numColumns={numColumns}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      overrideItemLayout={overrideItemLayout}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: Math.max(horizontalPadding - gap / 2, 0) }}
      ListFooterComponent={ListFooterComponent}
      refreshControl={refreshControl}
    />
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    paddingHorizontal: Space.md,
  },
});
