import React, { useCallback } from 'react';
import { StyleSheet, RefreshControl } from 'react-native';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import {
  NotificationListEmpty,
  NotificationListFooter } from './NotificationListStates';
import type {
  NotificationFilter,
  NotificationListItem } from './notificationViewModels';

export interface NotificationsListProps {
  data: NotificationListItem[];
  renderItem: ListRenderItem<NotificationListItem>;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasSyncError: boolean;
  hasNotifications: boolean;
  activeFilter: NotificationFilter;
  onRetry: () => void;
  onDiscover: () => void;
}

/**
 * The notifications FlashList. Data arrives pre-flattened (section headers
 * interleaved with notification rows) so cells recycle by type via
 * `getItemType`. Empty and footer states are owned by
 * NotificationListStates.
 */
export function NotificationsList({
  data,
  renderItem,
  refreshing,
  onRefresh,
  onEndReached,
  isLoading,
  isLoadingMore,
  hasSyncError,
  hasNotifications,
  activeFilter,
  onRetry,
  onDiscover,
}: NotificationsListProps) {
  const { colors } = useAppTheme();

  const getItemType = useCallback(
    (item: NotificationListItem) => item.type,
    []
  );

  const keyExtractor = useCallback(
    (item: NotificationListItem) =>
      item.type === 'header' ? `header-${item.sectionTitle}` : item.card.id,
    []
  );

  return (
    <FlashList
      data={data}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.brand}
          colors={[colors.brand]}
        />
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.3}
      // Performance: notification lists can grow long; cap the render
      // batch to keep scroll at 58+ fps. FlashList recycles cells by
      // type via getItemType (header vs item) for efficient pooling.
      //
      // FlashList v2 (2.0.2) does not expose the v1 props
      // `windowSize` / `maxToRenderPerBatch`. The v2-native equivalents:
      //   - drawDistance controls how far beyond the viewport items are
      //     rendered — the v2 counterpart of `windowSize`. 2000dp gives
      //     a generous buffer (~2.5 screens each side) for smooth scroll.
      //   - overrideProps.initialDrawBatchSize caps the first render
      //     batch — the v2 counterpart of `maxToRenderPerBatch`.
      drawDistance={2000}
      overrideProps={{ initialDrawBatchSize: 6 }}
      ListEmptyComponent={
        <NotificationListEmpty
          isLoading={isLoading}
          hasSyncError={hasSyncError}
          hasNotifications={hasNotifications}
          activeFilter={activeFilter}
          onRetry={onRetry}
          onDiscover={onDiscover}
        />
      }
      ListFooterComponent={isLoadingMore ? <NotificationListFooter /> : null}
    />
  );
}

const styles = StyleSheet.create({
  // No horizontal padding on the list content — each row already has its
  // own paddingHorizontal: Space.md in NotificationRowBase. Adding list-level
  // padding double-indents the rows, creating a wide flat margin of
  // background colour that reads as "grey slop". Rows extend edge-to-edge
  // with their internal padding providing the inset.
  listContent: { paddingHorizontal: 0, paddingTop: Space.xs, paddingBottom: Space.xxl + Space.xxl + Space.lg },
});
