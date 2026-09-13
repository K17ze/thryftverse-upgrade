import React, { useMemo } from "react";

import {
  View,
  StyleSheet,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent } from "react-native";

import {
  FlashList,
  type FlashListRef,
  type ListRenderItem } from "@shopify/flash-list";

import { useAppTheme } from "../../theme/ThemeContext";
import { Space } from "../../theme/designTokens";

import { MESSAGE_LIST_MIN_HEIGHT_RATIO } from "../../utils/chatContextualStack";

import { SkeletonChatLoader } from "./SkeletonChatLoader";
import { RetryState } from "../RetryState";
import { EmptyState } from "../EmptyState";

import { type Message } from "../../hooks/chat";

export interface ChatMessageListProps {
  isSyncing: boolean;
  syncError: boolean;
  messages: Message[];
  /** Ref owned by useConversationMessages — forwarded to the FlashList. */
  listRef: React.RefObject<FlashListRef<Message> | null>;
  renderItem: ListRenderItem<Message>;
  keyExtractor: (item: Message) => string;
  chatBackground: string;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onRetrySync: () => void;
}

export function ChatMessageList({
  isSyncing,
  syncError,
  messages,
  listRef,
  renderItem,
  keyExtractor,
  chatBackground,
  onScroll,
  onRetrySync }: ChatMessageListProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => StyleSheet.create({
    emptyStateWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Space.xl,
      paddingBottom: Space.xl },

    messageList: {
      paddingTop: Space.sm,
      paddingBottom: Space.md },

    // Message list container — flexes to fill remaining space but is
    // never squeezed below ~40% of screen height (audit requirement).
    messageListContainer: {
      flex: 1,
      minHeight: Math.floor(
        Dimensions.get('window').height * MESSAGE_LIST_MIN_HEIGHT_RATIO,
      ) } }), [colors]);

  // Message list — persistent. Flexes to fill remaining space but
  // is never squeezed below ~40% of screen height (audit).
  return (
    <View style={styles.messageListContainer}>
      {isSyncing ? (
        <SkeletonChatLoader count={6} />
      ) : syncError && !messages.length ? (
        <RetryState
          message="Couldn't load messages. Check your connection and try again."
          onRetry={onRetrySync}
        />
      ) : messages.length ? (
        <FlashList
          style={{ backgroundColor: chatBackground }}
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="always"
          accessibilityLiveRegion="polite"
          onScroll={onScroll}
          scrollEventThrottle={200}
          // FlashList v2 rendering tuning (LIST_RENDERING_POLICY.md §2.4).
          //
          // `inverted` is intentionally NOT applied here. The scroll
          // management is split between the screen and the
          // useConversationMessages hook (out of scope for this change):
          //   - the row renderer uses messages[index-1]/messages[index+1]
          //     for cluster detection, dateSeparatorIndices.has(index),
          //     and unreadDividerIndex === index — all keyed to the
          //     chronological array order.
          //   - The hook owns scrollToMessage / search scrollToIndex
          //     (indices into the chronological array), scrollToEnd /
          //     scrollToBottom, and handleMessageListScroll's "near
          //     bottom" detection (contentSize - offset - layout < 150),
          //     whose coordinate math flips under `inverted`.
          // Reversing the data array to satisfy `inverted` would desync
          // every one of those index/coordinate lookups. Per the task's
          // escape clause for complex scroll management, `inverted` is
          // skipped and only the tuning props are applied.
          //
          // FlashList v2 (2.0.2) does not expose the v1 props
          // `windowSize` / `maxToRenderPerBatch`. The v2-native
          // equivalents are used instead:
          //   - drawDistance (v2 default 250dp) controls how far beyond
          //     the viewport items are rendered — the v2 counterpart of
          //     `windowSize`. 1200dp gives a chat-tuned buffer (~1.5
          //     screens each side) that smooths fast scroll without
          //     over-allocating.
          //   - overrideProps.initialDrawBatchSize (v2 default 2) is the
          //     v2 counterpart of `maxToRenderPerBatch` and caps the
          //     first render batch.
          drawDistance={1200}
          overrideProps={{ initialDrawBatchSize: 6 }}
          // P0.6: Preserve scroll anchor when older messages are
          // prepended via cursor pagination. This keeps the user's
          // current viewing position stable instead of jumping to top.
          maintainVisibleContentPosition={{
            autoscrollToTopThreshold: 0 }}
        />
      ) : (
        <View style={styles.emptyStateWrap}>
          <EmptyState
            density="compact"
            icon="chatbubble-outline"
            title="Start the conversation"
            subtitle="Send a message below to get started."
          />
        </View>
      )}
    </View>
  );
}
