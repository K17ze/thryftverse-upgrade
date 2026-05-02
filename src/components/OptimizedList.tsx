import React, { useCallback } from 'react';
import { FlashList, ListRenderItem, FlashListProps } from '@shopify/flash-list';
import { View, ViewStyle } from 'react-native';

type OptimizedListProps<T> = {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor?: (item: T, index: number) => string;
  numColumns?: number;
  estimatedItemSize: number;
  contentContainerStyle?: ViewStyle;
  ListEmptyComponent?: React.ComponentType<any>;
  ListFooterComponent?: React.ComponentType<any> | React.ReactElement;
  onEndReached?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  horizontal?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
}

/**
 * Performance-optimized FlashList wrapper
 * Uses FlashList's built-in virtualization for efficient rendering
 */
export function OptimizedList<T>({
  data,
  renderItem,
  keyExtractor,
  numColumns = 1,
  estimatedItemSize,
  contentContainerStyle,
  ListEmptyComponent,
  ListFooterComponent,
  onEndReached,
  onRefresh,
  refreshing,
  horizontal = false,
  showsHorizontalScrollIndicator = false,
  showsVerticalScrollIndicator = false,
}: OptimizedListProps<T>) {
  const _keyExtractor = useCallback(
    (item: T, index: number) => {
      if (keyExtractor) return keyExtractor(item, index);
      return String(index);
    },
    [keyExtractor]
  );

  return (
    <FlashList
      data={data}
      renderItem={renderItem}
      keyExtractor={_keyExtractor}
      numColumns={numColumns}
      {...{ estimatedItemSize }}
      contentContainerStyle={contentContainerStyle}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      onRefresh={onRefresh}
      refreshing={refreshing}
      horizontal={horizontal}
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    />
  );
}

/**
 * Masonry-optimized list for Pinterest-style layouts
 */
export function MasonryList<T>({
  data,
  renderItem,
  estimatedItemSize,
  numColumns = 2,
}: {
  data: T[];
  renderItem: ListRenderItem<T>;
  estimatedItemSize: number;
  numColumns?: number;
}) {
  return (
    <OptimizedList
      data={data}
      renderItem={renderItem}
      numColumns={numColumns}
      estimatedItemSize={estimatedItemSize}
    />
  );
}
