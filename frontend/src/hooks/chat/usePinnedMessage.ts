import { useCallback, useEffect, useRef, useState } from "react";

import { fetchPinnedMessageFromApi } from "../../services/chatApi";
import { chatConversationTopic } from "../../services/realtimeClient";
import { useRealtimeSafe } from "../../platform/realtime";
import type { Conversation } from "../../domain";

export interface PinnedMessageSummary {
  messageId: string;
  senderLabel: string;
  text: string;
}

/**
 * Pinned message — fetch the conversation's pinned message on mount and
 * whenever a `chat.message.pinned` / `chat.message.unpinned` realtime
 * event lands on the conversation topic, so the bar reflects pins made
 * by other admins without a screen reload. Only group chats support
 * pinning (enforced server-side: group admins/owners only).
 */
export function usePinnedMessage(
  conversationId: string,
  isGroup: boolean,
  conversations: Conversation[],
): { pinnedMessage: PinnedMessageSummary | null; refresh: () => void } {
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessageSummary | null>(null);

  const loadPinnedMessage = useCallback(async () => {
    if (!isGroup) return;
    try {
      const result = await fetchPinnedMessageFromApi(conversationId);
      if (result.pinned) {
        const msg = result.pinned.message as Record<string, unknown>;
        const body = typeof msg.body === 'string' ? msg.body : '';
        const senderId = msg.senderUserId as string | null;
        const senderLabel = senderId
          ? (conversations.find((c) => c.id === conversationId)?.participantIds?.includes(senderId)
            ? 'Participant'
            : 'Someone')
          : 'System';
        setPinnedMessage({
          messageId: result.pinned.messageId,
          senderLabel,
          text: body || '(media)',
        });
      } else {
        setPinnedMessage(null);
      }
    } catch {
      // Silently fail — pinned bar is non-critical.
    }
  }, [conversationId, isGroup, conversations]);

  useEffect(() => {
    void loadPinnedMessage();
  }, [loadPinnedMessage]);

  // Realtime convergence — refetch on pin/unpin events so the bar tracks
  // pins made by other admins on other devices.
  const loadRef = useRef(loadPinnedMessage);
  loadRef.current = loadPinnedMessage;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;
  const topic = isGroup && conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;
    client.subscribe([topic]);
    const unsubscribe = client.on(topic, (envelope) => {
      if (
        envelope.type === 'chat.message.pinned' ||
        envelope.type === 'chat.message.unpinned'
      ) {
        void loadRef.current();
      }
    });
    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);

  return { pinnedMessage, refresh: loadPinnedMessage };
}
