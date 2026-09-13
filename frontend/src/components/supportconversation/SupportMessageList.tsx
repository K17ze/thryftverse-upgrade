import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator } from 'react-native';
import { FlashList, type ListRenderItem, type FlashListRef } from '@shopify/flash-list';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { FlagshipState } from '../flagship';
import { AnimatedPressable } from '../AnimatedPressable';
import { SupportMessageRow } from './SupportMessageRow';
import {
  listKeyExtractor,
  listItemType,
  type ListItem } from './supportConversationViewModels';

export interface SupportMessageListProps {
  isEmpty: boolean;
  listData: ListItem[];
  listRef: React.RefObject<FlashListRef<ListItem> | null>;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRetryMessage: (messageId: string) => void;
}

export function SupportMessageList({
  isEmpty,
  listData,
  listRef,
  isLoadingMore,
  onLoadMore,
  onRetryMessage }: SupportMessageListProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Render item ──
  const renderItem = useCallback<ListRenderItem<ListItem>>(
    ({ item }) => {
      if (item.kind === 'loadMore') {
        return (
          <View style={styles.loadMoreWrap}>
            <AnimatedPressable
              onPress={onLoadMore}
              style={styles.loadMoreBtn}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Load earlier messages"
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Text style={styles.loadMoreText}>Load earlier messages</Text>
              )}
            </AnimatedPressable>
          </View>
        );
      }
      return <SupportMessageRow message={item.message} onRetry={onRetryMessage} />;
    },
    [styles, onLoadMore, isLoadingMore, colors.textMuted, onRetryMessage]
  );

  if (isEmpty) {
    return (
      <FlagshipState
        variant="empty"
        title="No messages yet"
        subtitle="Send a message below to start the conversation."
        icon="chatbubble-outline"
        style={{ flex: 1 }}
      />
    );
  }

  return (
    <FlashList
      ref={listRef}
      data={listData}
      renderItem={renderItem}
      keyExtractor={listKeyExtractor}
      getItemType={listItemType}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── List ──
    listContent: {
      paddingVertical: Space.sm },

    // ── Load more ──
    loadMoreWrap: {
      alignItems: 'center',
      paddingVertical: Space.sm },
    loadMoreBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    loadMoreText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.meta.letterSpacing } });
}
