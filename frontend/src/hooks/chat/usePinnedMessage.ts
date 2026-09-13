import { useCallback, useEffect, useState } from "react";

import { fetchPinnedMessageFromApi } from "../../services/chatApi";
import type { Conversation } from "../../domain";

export interface PinnedMessageSummary {
  messageId: string;
  senderLabel: string;
  text: string;
}

/**
 * Pinned message — fetch the conversation's pinned message on mount and when
 * realtime pin/unpin events arrive. Only group chats support pinning.
 */
export function usePinnedMessage(
  conversationId: string,
  isGroup: boolean,
  conversations: Conversation[],
): PinnedMessageSummary | null {
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

  return pinnedMessage;
}
