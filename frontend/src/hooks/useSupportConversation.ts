import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import type {
  SupportConversation,
  SupportMessage,
  SupportFeedback,
} from '../contracts/support';
import {
  getSupportConversation,
  listSupportMessages,
  sendSupportMessage,
  requestSupportHandoff,
  confirmSupportResolution,
  submitSupportFeedback,
} from '../services/supportConversationApi';

// ─── Query keys ──────────────────────────────────────────────────────────────
const SUPPORT_KEYS = {
  conversation: (id: string) => ['support', 'conversation', id] as const,
  messages: (id: string) => ['support', 'conversation', id, 'messages'] as const,
};

// Polling cadence — only while the AI is actively composing or a human is
// engaged. The screen can disable polling once ownership settles.
const POLL_INTERVAL = 8000;

// ─── Offline draft state ─────────────────────────────────────────────────────
// A lightweight in-memory draft so the composer can retain unsent text across
// re-mounts when the device is offline. React Query mutations are
// `offlineFirst`, so queued sends retry automatically once connectivity
// returns; this draft only holds the raw input string.
let offlineDraft: Record<string, string> = {};

function readDraft(conversationId: string): string {
  return offlineDraft[conversationId] ?? '';
}

function writeDraft(conversationId: string, body: string): void {
  if (body.length === 0) {
    delete offlineDraft[conversationId];
  } else {
    offlineDraft[conversationId] = body;
  }
}

// ─── Hook return shape ───────────────────────────────────────────────────────
export interface UseSupportConversationResult {
  conversation: SupportConversation | undefined;
  messages: SupportMessage[];
  isLoading: boolean;
  isSending: boolean;
  error: Error | null;
  draft: string;
  setDraft: (body: string) => void;
  sendMessage: (body: string, attachments?: string[]) => Promise<SupportMessage>;
  requestHandoff: (reason?: string) => Promise<void>;
  confirmResolve: (resolved: boolean) => Promise<void>;
  submitFeedback: (
    rating: 'helpful' | 'unhelpful',
    reason?: string,
    messageId?: string,
  ) => Promise<SupportFeedback>;
  refetch: () => void;
  isOnline: boolean;
}

/**
 * useSupportConversation — React Query-backed support conversation state.
 *
 * Reads the conversation + its messages via `useQuery` (polling while the
 * conversation is active), and exposes mutations for sending messages,
 * requesting human handoff, confirming resolution, and submitting feedback.
 * All mutations invalidate the relevant query keys so the cache stays
 * consistent without manual refetch wiring.
 *
 * Offline drafts are retained in-memory so the composer input survives
 * re-mounts when the device is offline; the mutations themselves queue via
 * React Query's `offlineFirst` network mode and retry on reconnect.
 */
export function useSupportConversation(
  conversationId: string,
): UseSupportConversationResult {
  const queryClient = useQueryClient();
  const isOnline = onlineManager.isOnline();

  // ── Conversation ──
  const conversationQuery = useQuery<SupportConversation, Error>({
    queryKey: SUPPORT_KEYS.conversation(conversationId),
    queryFn: () => getSupportConversation(conversationId),
    refetchInterval: (query) => {
      const state = query.state.data?.ownershipState;
      if (!state) return POLL_INTERVAL;
      // Stop polling once the conversation has settled.
      if (state === 'resolved' || state === 'closed') return false;
      return POLL_INTERVAL;
    },
  });

  // ── Messages ──
  const messagesQuery = useQuery<SupportMessage[], Error>({
    queryKey: SUPPORT_KEYS.messages(conversationId),
    queryFn: async () => {
      const result = await listSupportMessages(conversationId, 100);
      return result.items;
    },
    refetchInterval: (query) => {
      const conv = queryClient.getQueryData<SupportConversation>(
        SUPPORT_KEYS.conversation(conversationId),
      );
      const state = conv?.ownershipState;
      if (state === 'resolved' || state === 'closed') return false;
      return POLL_INTERVAL;
    },
  });

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['support', 'conversation', conversationId],
    });
  }, [queryClient, conversationId]);

  // ── Send message ──
  const sendMutation = useMutation({
    mutationFn: ({ body, attachments }: { body: string; attachments?: string[] }) =>
      sendSupportMessage(conversationId, body, attachments),
    onSuccess: (sent) => {
      queryClient.setQueryData<SupportMessage[]>(
        SUPPORT_KEYS.messages(conversationId),
        (prev) => [...(prev ?? []), sent],
      );
      invalidateAll();
    },
  });

  // ── Request handoff ──
  const handoffMutation = useMutation({
    mutationFn: (reason?: string) => requestSupportHandoff(conversationId, reason),
    onSuccess: () => {
      queryClient.setQueryData<SupportConversation>(
        SUPPORT_KEYS.conversation(conversationId),
        (prev) => (prev ? { ...prev, ownershipState: 'human_queued' } : prev),
      );
      invalidateAll();
    },
  });

  // ── Confirm resolution ──
  const resolveMutation = useMutation({
    mutationFn: (resolved: boolean) => confirmSupportResolution(conversationId, resolved),
    onSuccess: (_data, resolved) => {
      queryClient.setQueryData<SupportConversation>(
        SUPPORT_KEYS.conversation(conversationId),
        (prev) =>
          prev
            ? { ...prev, ownershipState: resolved ? 'closed' : 'ai_active' }
            : prev,
      );
      invalidateAll();
    },
  });

  // ── Submit feedback ──
  const feedbackMutation = useMutation({
    mutationFn: ({
      rating,
      reason,
      messageId,
    }: {
      rating: 'helpful' | 'unhelpful';
      reason?: string;
      messageId?: string;
    }) => submitSupportFeedback(conversationId, rating, reason, messageId),
    onSuccess: () => invalidateAll(),
  });

  // ── Draft helpers ──
  const draft = useMemo(() => readDraft(conversationId), [conversationId]);
  const setDraft = useCallback(
    (body: string) => writeDraft(conversationId, body),
    [conversationId],
  );

  // ── Wrapped actions ──
  const sendMessage = useCallback(
    async (body: string, attachments?: string[]): Promise<SupportMessage> => {
      const sent = await sendMutation.mutateAsync({ body, attachments });
      writeDraft(conversationId, '');
      return sent;
    },
    [sendMutation, conversationId],
  );

  const requestHandoff = useCallback(
    async (reason?: string): Promise<void> => {
      await handoffMutation.mutateAsync(reason);
    },
    [handoffMutation],
  );

  const confirmResolve = useCallback(
    async (resolved: boolean): Promise<void> => {
      await resolveMutation.mutateAsync(resolved);
    },
    [resolveMutation],
  );

  const submitFeedback = useCallback(
    async (
      rating: 'helpful' | 'unhelpful',
      reason?: string,
      messageId?: string,
    ): Promise<SupportFeedback> => {
      return feedbackMutation.mutateAsync({ rating, reason, messageId });
    },
    [feedbackMutation],
  );

  const refetch = useCallback(() => {
    void queryClient.refetchQueries({
      queryKey: ['support', 'conversation', conversationId],
    });
  }, [queryClient, conversationId]);

  return {
    conversation: conversationQuery.data,
    messages: messagesQuery.data ?? [],
    isLoading: conversationQuery.isLoading || messagesQuery.isLoading,
    isSending: sendMutation.isPending,
    error: conversationQuery.error ?? messagesQuery.error ?? null,
    draft,
    setDraft,
    sendMessage,
    requestHandoff,
    confirmResolve,
    submitFeedback,
    refetch,
    isOnline,
  };
}
