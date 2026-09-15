import React, { useCallback, useRef } from "react";

import { ChatMessageItem, type ChatMessageItemProps } from "./ChatMessageItem";

import { type Message, useUnreadDividerAnchor } from "../../hooks/chat";

/** Row-level inputs shared by every message cell — everything
    ChatMessageItem needs except the per-item message/index. */
export type ChatMessageRowContext = Omit<ChatMessageItemProps, "message" | "index">;

/**
 * FlashList item-renderer factory for the chat message list.
 *
 * FlashList v2 performance: memoized renderItem prevents full re-render of
 * all visible messages on every parent state change (e.g. input text, agent
 * panel toggle). renderMessage closes over many component-scope values, so
 * we use a ref to always call the latest version while keeping a stable
 * callback reference for FlashList's cell recycling.
 * (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
 */
export function useChatMessageRenderer(context: ChatMessageRowContext) {
  // Resolve the "New messages" divider to the true first-unread index.
  // The upstream index only signals "unread on open" — the anchor hook
  // snapshots the first unread incoming message id before the open-time
  // read receipt lands, then re-resolves the index each render so
  // pagination prepends keep the banner on the same message.
  const { index: resolvedUnreadDividerIndex } = useUnreadDividerAnchor(
    context.conversationId,
    context.messages,
    context.unreadDividerIndex,
  );

  const renderMessage = (msg: Message, index: number) => (
    <ChatMessageItem
      message={msg}
      index={index}
      {...context}
      unreadDividerIndex={resolvedUnreadDividerIndex}
    />
  );

  const renderMessageRef = useRef(renderMessage);
  renderMessageRef.current = renderMessage;
  const renderMessageItem = useCallback(
    ({ item, index }: { item: Message; index: number }) =>
      renderMessageRef.current(item, index),
    [],
  );

  const messageKeyExtractor = useCallback((item: Message) => item.id, []);

  return { renderMessageItem, messageKeyExtractor };
}
