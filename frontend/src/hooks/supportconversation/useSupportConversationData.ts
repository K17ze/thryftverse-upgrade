import { useCallback, useEffect, useState } from 'react';

import type { SupportConversation } from '../../contracts/support';
import {
  getSupportConversation,
  listSupportMessages } from '../../services/supportConversationApi';
import type { DisplayMessage } from '../../components/supportconversation/supportConversationViewModels';

interface UseSupportConversationDataOptions {
  conversationId: string;
  show: (msg: string, type: 'success' | 'error' | 'info') => void;
}

/**
 * useSupportConversationData — owns the conversation + message list data:
 * the initial load effect (with cancellation + reload key), pagination
 * state (cursor/hasMore/isLoadingMore), and the load-more + retry-load
 * handlers. Optimistic pending messages live in `messages` too — the
 * composer hook appends/patches them via `setMessages`.
 */
export function useSupportConversationData({
  conversationId,
  show }: UseSupportConversationDataOptions) {
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // ── Load conversation + messages ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [conv, msgsResult] = await Promise.all([
          getSupportConversation(conversationId),
          listSupportMessages(conversationId, 50),
        ]);
        if (cancelled) return;
        setConversation(conv);
        setMessages(msgsResult.items);
        setCursor(msgsResult.nextCursor);
        setHasMore(!!msgsResult.nextCursor);
      } catch {
        if (!cancelled) {
          setLoadError('We could not load this conversation.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [conversationId, reloadKey]);

  // ── Load more (older messages) ──
  const handleLoadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || !cursor) return;
    setIsLoadingMore(true);
    try {
      const result = await listSupportMessages(conversationId, 50, cursor);
      setMessages(prev => [...result.items, ...prev]);
      setCursor(result.nextCursor);
      setHasMore(!!result.nextCursor);
    } catch {
      show('Could not load earlier messages', 'error');
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId, cursor, hasMore, isLoadingMore, show]);

  // ── Retry initial load ──
  const handleRetryLoad = useCallback(() => {
    setReloadKey(k => k + 1);
  }, []);

  return {
    conversation,
    setConversation,
    messages,
    setMessages,
    isLoading,
    loadError,
    hasMore,
    isLoadingMore,
    handleLoadMore,
    handleRetryLoad };
}
