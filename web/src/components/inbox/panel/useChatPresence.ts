'use client';

import { useQuery } from '@tanstack/react-query';
import type { Conversation, Message } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import { fetchConversationPresence, type ConversationPresence } from '@/lib/api/services/chat';
import { useConversationRealtime } from '@/lib/hooks/chat-realtime';

export const PRESENCE_KEY = (id: string) => ['conversation-presence', id] as const;

/** REST snapshot for the DM peer's presence — the live-mode source for the
 *  header's "Active now" / "Last active X" line. `null` data means the
 *  peer hides their activity status or presence was never recorded —
 *  render nothing rather than a fabricated dot. */
export function useConversationPresence(conversationId: string, enabled: boolean) {
  return useQuery<ConversationPresence | null>({
    queryKey: [...PRESENCE_KEY(conversationId)],
    queryFn: ({ signal }) => fetchConversationPresence(conversationId, signal),
    enabled: DATA_MODE === 'live' && enabled && !!conversationId,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

interface UseChatPresenceOptions {
  conversationId: string;
  viewerId: string;
  conversation?: Conversation | null;
  isGroup: boolean;
  isGuest: boolean;
  hydrated: boolean;
  onServerEcho: (clientMessageId: string) => void;
  onPinChanged: () => void;
  patchOlder?: (id: string, fn: (m: Message) => Message | null) => void;
}

export function useChatPresence({
  conversationId,
  viewerId,
  conversation,
  isGroup,
  isGuest,
  hydrated,
  onServerEcho,
  onPinChanged,
  patchOlder,
}: UseChatPresenceOptions) {
  const peerUserId =
    conversation && !isGroup ? conversation.participantId || null : null;

  const presenceQuery = useConversationPresence(
    conversationId,
    !!conversation && !isGroup && !isGuest,
  );

  const { typingUserIds } = useConversationRealtime({
    conversationId,
    viewerId,
    peerUserId,
    enabled: hydrated && !isGuest && !!conversation,
    onServerEcho,
    onPinChanged,
    patchOlder,
  });

  const peerTyping = typingUserIds.length > 0;

  return {
    peerUserId,
    presenceQuery,
    peerTyping,
    typingUserIds,
  };
}
