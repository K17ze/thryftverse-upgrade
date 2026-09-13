import React, { useCallback } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { Space } from '../../theme/designTokens';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { ListingApiItem } from '../../services/listingsApi';
import { InventoryRow } from './InventoryRow';
import type { InventoryScreenStyles } from './inventoryScreenStyles';

const InventoryFlashList = FlashList as unknown as React.ComponentType<
  FlashListProps<ListingApiItem> & { estimatedItemSize: number }
>;

export interface InventoryListProps {
  listings: ListingApiItem[];
  colors: ThemeColors;
  styles: InventoryScreenStyles;
  selectionMode: boolean;
  selectedIds: Set<string>;
  pendingActionIds: Set<string>;
  onLongPress: (id: string) => void;
  onPressRow: (item: ListingApiItem) => void;
  onEdit: (item: ListingApiItem) => void;
  onTogglePause: (item: ListingApiItem) => void;
  onRelist: (item: ListingApiItem) => void;
  onDelete: (item: ListingApiItem) => void;
  onToggleSelect: (id: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  isLoadingMore: boolean;
  selectionBarHeight: number;
}

/** Paginated inventory list — FlashList with refresh + load-more footer. */
export function InventoryList({
  listings,
  colors,
  styles,
  selectionMode,
  selectedIds,
  pendingActionIds,
  onLongPress,
  onPressRow,
  onEdit,
  onTogglePause,
  onRelist,
  onDelete,
  onToggleSelect,
  isRefreshing,
  onRefresh,
  onEndReached,
  isLoadingMore,
  selectionBarHeight }: InventoryListProps) {
  const renderItem = useCallback(({ item, index }: { item: ListingApiItem; index: number }) => (
    <InventoryRow
      item={item}
      isLast={index === listings.length - 1}
      colors={colors}
      styles={styles}
      selectionMode={selectionMode}
      isSelected={selectedIds.has(item.id)}
      isPendingAction={pendingActionIds.has(item.id)}
      onLongPress={() => onLongPress(item.id)}
      onPress={() => onPressRow(item)}
      onEdit={() => onEdit(item)}
      onTogglePause={() => onTogglePause(item)}
      onRelist={() => onRelist(item)}
      onDelete={() => onDelete(item)}
      onToggleSelect={() => onToggleSelect(item.id)}
    />
  ), [listings, colors, styles, selectionMode, selectedIds, pendingActionIds, onLongPress, onPressRow, onEdit, onTogglePause, onRelist, onDelete, onToggleSelect]);

  return (
    <InventoryFlashList
      data={listings}
      renderItem={renderItem}
      estimatedItemSize={72}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      ListFooterComponent={
        <View style={{ height: selectionBarHeight || Space.xl, alignItems: 'center', justifyContent: 'center' }}>
          {isLoadingMore ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        </View>
      }
    />
  );
}
