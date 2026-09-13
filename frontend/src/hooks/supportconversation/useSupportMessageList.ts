import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { FlashListRef } from '@shopify/flash-list';

import {
  buildListData,
  type DisplayMessage,
  type ListItem } from '../../components/supportconversation/supportConversationViewModels';

interface UseSupportMessageListOptions {
  messages: DisplayMessage[];
  hasMore: boolean;
  isLoading: boolean;
}

/**
 * useSupportMessageList — owns the FlashList ref, the one-shot auto-scroll
 * to bottom on initial load, the `scrollToBottom` helper used by the
 * composer after an optimistic send, and the derived `listData` (messages
 * plus the leading "load earlier" row when more pages exist).
 */
export function useSupportMessageList({
  messages,
  hasMore,
  isLoading }: UseSupportMessageListOptions) {
  const listRef = useRef<FlashListRef<ListItem>>(null);
  const hasInitiallyScrolledRef = useRef(false);

  // ── Auto-scroll to bottom on initial load ──
  useEffect(() => {
    if (messages.length > 0 && !hasInitiallyScrolledRef.current && !isLoading) {
      hasInitiallyScrolledRef.current = true;
      const timer = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: false });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isLoading]);

  // ── List data ──
  const listData = useMemo<ListItem[]>(
    () => buildListData(messages, hasMore),
    [messages, hasMore]);

  // ── Scroll helpers ──
  const scrollToBottom = useCallback((animated: boolean = true) => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
    }, 50);
  }, []);

  return { listRef, listData, scrollToBottom };
}
