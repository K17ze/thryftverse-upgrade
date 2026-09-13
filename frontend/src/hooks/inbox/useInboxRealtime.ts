import { useCallback } from 'react';
import { useStore } from '../../store/useStore';
import {
  useInboxMessageEvent,
  useInboxGroupIdentityEvent,
  realtimePayloadToMessage,
} from '../../services/realtimeClient';

/**
 * Realtime inbox subscriptions — live-update rows when new messages arrive
 * on any loaded conversation and merge group identity changes into the store
 * so row titles/avatars stay current without a manual refetch.
 */
export function useInboxRealtime(loadConversations: () => Promise<void>) {
  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);

  // useInboxMessageEvent subscribes to every conversation topic currently
  // in the store and reconciles as the list changes.
  useInboxMessageEvent(
    useCallback(
      (payload) => {
        const existing = conversations.find((c) => c.id === payload.conversationId);
        const domainMessage = realtimePayloadToMessage(payload, currentUser?.id);

        // If the conversation isn't in the local store yet, reload the full
        // inbox so the new thread appears.
        if (!existing) {
          void loadConversations();
          return;
        }

        // Skip messages the current user just sent — the sending surface
        // already optimistically updated the row.
        const isOwnMessage = Boolean(
          currentUser?.id && payload.senderType === 'user' && payload.senderUserId === currentUser.id,
        );

        // Deduplicate — the store may already hold this message after an
        // optimistic send or a prior realtime event.
        const alreadyStored = existing.messages.some((m) => m.id === domainMessage.id);

        // `text` is '' (not undefined) for voice/media-only payloads, so a
        // truthy check — not `??` — is required to reach the fallbacks.
        const nextLastMessage =
          domainMessage.text ||
          (domainMessage.mediaType === 'image'
            ? '📷 Photo'
            : domainMessage.mediaType === 'video'
              ? '🎥 Video'
              : domainMessage.type === 'voice'
                ? '🎤 Voice message'
                : domainMessage.systemTitle) ||
          'New message';

        upsertConversation({
          ...existing,
          lastMessage: nextLastMessage,
          lastMessageTime: domainMessage.timestamp,
          unread: isOwnMessage ? existing.unread : true,
          messages: alreadyStored ? existing.messages : [...existing.messages, domainMessage],
        });
      },
      [conversations, currentUser?.id, upsertConversation, loadConversations],
    ),
  );

  // Realtime group identity updates — when an admin changes the group name,
  // avatar, cover, or description, merge it into the inbox store so the row
  // title and avatar stay current without a manual refetch.
  useInboxGroupIdentityEvent(
    useCallback(
      (payload) => {
        const existing = conversations.find((c) => c.id === payload.conversationId);
        if (!existing) return;
        upsertConversation({
          ...existing,
          title: payload.title ?? existing.title,
          description: payload.description ?? existing.description,
          avatar: payload.avatar !== undefined ? (payload.avatar ?? undefined) : existing.avatar,
          coverPhoto: payload.coverPhoto !== undefined ? (payload.coverPhoto ?? undefined) : existing.coverPhoto,
        });
      },
      [conversations, upsertConversation],
    ),
  );
}
