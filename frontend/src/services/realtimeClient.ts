/**
 * realtimeClient — chat-domain facade over the platform realtime WebSocket
 * client.
 *
 * The low-level WebSocket client (singleton) lives in `platform/realtime/`
 * and is mounted once at the app root via `<RealtimeProvider>`. This module
 * provides chat-specific typed hooks so messaging surfaces can subscribe to
 * real-time events without coupling to the transport layer.
 *
 * Backend protocol (see backend/api/src/lib/realtime.ts + routes/realtime.ts):
 *   - Endpoint:  GET /realtime/ws  (upgraded to WebSocket)
 *   - Auth:       Bearer access token in the `Authorization` header
 *   - Topic:      `chat.conversation:${conversationId}`
 *   - Event type: `chat.message.created`  (new message)
 *   - Event type: `chat.typing.update`     (typing indicator — forward-ready)
 *   - Envelope:   { id, topic, type, payload, timestamp, seq?, v? }
 *
 * The hooks below subscribe to the per-conversation topic, filter by event
 * type, and dispatch typed payloads to the caller. Topic subscription and
 * handler registration are cleaned up automatically on unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeSafe, type RealtimeConnectionState, type RealtimeEnvelope } from '../platform/realtime';
import { useStore } from '../store/useStore';
import type { Message as ConversationMessage } from '../domain';

// ── Backend event types ─────────────────────────────────────────────

/** Realtime event type emitted by the backend when a new chat message is
 *  created (see backend/api/src/index.ts → publishRealtimeEvent). */
export const CHAT_MESSAGE_EVENT = 'chat.message.created';

/** Forward-ready typing indicator event type. The backend protocol reserves
 *  this type for composer typing state; the client handles it gracefully
 *  even if the server isn't emitting it yet. */
export const CHAT_TYPING_EVENT = 'chat.typing.update';

/** P0.5: Message deleted (for-me or for-everyone). */
export const CHAT_MESSAGE_DELETED_EVENT = 'chat.message.deleted';

/** P2-03: Message edited (sender-only, time-windowed). Other participants and
 *  second devices reconcile the new body and the "Edited" label. */
export const CHAT_MESSAGE_EDITED_EVENT = 'chat.message.edited';

/** P0.9: Reaction added/removed. */
export const CHAT_REACTION_ADDED_EVENT = 'chat.reaction.added';
export const CHAT_REACTION_REMOVED_EVENT = 'chat.reaction.removed';

/** P0.7: Read receipt. */
export const CHAT_MESSAGE_READ_EVENT = 'chat.message.read';

/** Group identity updated — emitted when an admin changes the group name,
 *  avatar, cover photo, or description. Other participants must merge this
 *  into their local store so the chat header and info screen stay current
 *  without a manual refetch. */
export const CHAT_GROUP_IDENTITY_UPDATED_EVENT = 'chat.group.identity.updated';
export const CHAT_GROUP_SETTINGS_UPDATED_EVENT = 'chat.group.settings.updated';
export const CHAT_MEMBER_REMOVED_EVENT = 'chat.member.removed';
export const CHAT_MEMBER_LEFT_EVENT = 'chat.member.left';
export const CHAT_MEMBER_ROLE_UPDATED_EVENT = 'chat.member.role_updated';
export const CHAT_GROUP_OWNERSHIP_TRANSFERRED_EVENT = 'chat.group.ownership_transferred';

// ── Typed payloads ──────────────────────────────────────────────────

/** Payload shape for `chat.message.created`, mirroring the backend. */
export interface ChatMessageCreatedPayload {
  id: string;
  conversationId: string;
  senderType: 'user' | 'bot' | 'system';
  senderUserId: string | null;
  senderBotId: string | null;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  clientMessageId?: string | null;
  replyToMessageId?: string | null;
}

/** Payload shape for `chat.message.deleted`. */
export interface ChatMessageDeletedPayload {
  conversationId: string;
  messageId: string;
  scope: 'me' | 'everyone';
  actorUserId: string;
}

/** Payload shape for `chat.message.edited` (P2-03). */
export interface ChatMessageEditedPayload {
  conversationId: string;
  messageId: string;
  body: string;
  editVersion: number;
  editedAt: string | null;
  actorUserId: string;
}

/** Payload shape for `chat.reaction.added` / `chat.reaction.removed`. */
export interface ChatReactionPayload {
  conversationId: string;
  messageId: string;
  userId: string;
  emoji: string;
}

/** Payload shape for `chat.message.read`. */
export interface ChatMessageReadPayload {
  conversationId: string;
  userId: string;
  readAt: string;
}

/** Payload shape for `chat.typing.update`. */
export interface ChatTypingUpdatePayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

/** Payload shape for `chat.group.identity.updated`. Mirrors the backend
 *  publish at backend/api/src/index.ts → PATCH /chat/conversations/:id.
 *  All fields except `conversationId` are optional — only changed fields
 *  are included by the backend. */
export interface ChatGroupIdentityUpdatedPayload {
  conversationId: string;
  actorUserId: string;
  changedFields: string[];
  title?: string | null;
  description?: string | null;
  avatar?: string | null;
  coverPhoto?: string | null;
  updatedAt: string;
}

export interface ChatGroupSettingsUpdatedPayload {
  conversationId: string;
  actorUserId: string;
  settings: {
    editGroupInfo: 'admins' | 'everyone';
    sendMessages: 'admins' | 'everyone';
    addMembers: 'admins' | 'everyone';
    updatedBy: string | null;
    updatedAt: string | null;
  };
  messageId: string | null;
}

export type ChatGroupMembershipEvent =
  | { type: typeof CHAT_MEMBER_REMOVED_EVENT; payload: { conversationId: string; memberUserId: string } }
  | { type: typeof CHAT_MEMBER_LEFT_EVENT; payload: { conversationId: string; actorUserId: string } }
  | { type: typeof CHAT_MEMBER_ROLE_UPDATED_EVENT; payload: { conversationId: string; memberUserId: string; newRole: 'owner' | 'admin' | 'member' } }
  | { type: typeof CHAT_GROUP_OWNERSHIP_TRANSFERRED_EVENT; payload: { conversationId: string; newOwnerId: string } };

/** Typed envelope for chat message events. */
export type ChatMessageEnvelope = RealtimeEnvelope<ChatMessageCreatedPayload>;
/** Typed envelope for typing events. */
export type ChatTypingEnvelope = RealtimeEnvelope<ChatTypingUpdatePayload>;

// ── Topic helpers ───────────────────────────────────────────────────

/** Build the realtime topic for a conversation. */
export function chatConversationTopic(conversationId: string): string {
  return `chat.conversation:${conversationId}`;
}

// ── Connection hook ─────────────────────────────────────────────────

/**
 * useRealtimeConnection — reactive connection state for the singleton
 * realtime client. Returns the current state and re-renders on changes.
 */
export function useRealtimeConnection(): RealtimeConnectionState {
  const ctx = useRealtimeSafe();
  return ctx?.connectionState ?? 'idle';
}

// ── Payload → domain mapper ─────────────────────────────────────────

/**
 * Convert a `chat.message.created` payload into the app's `Message` domain
 * shape so it can be appended directly to a conversation's message list.
 */
export function realtimePayloadToMessage(
  payload: ChatMessageCreatedPayload,
  currentUserId?: string,
): ConversationMessage {
  const senderId =
    payload.senderType === 'bot'
      ? payload.senderBotId ?? 'system'
      : payload.senderType === 'user'
        ? payload.senderUserId ?? 'system'
        : 'system';

  const meta = payload.metadata ?? {};
  const isCurrentUser = Boolean(currentUserId && senderId === currentUserId);

  return {
    id: payload.id,
    senderId,
    text: payload.body,
    timestamp: payload.createdAt,
    isSystem: payload.senderType === 'system',
    systemTitle: payload.senderType === 'system' ? 'System' : undefined,
    type: payload.senderType === 'system' ? 'system' : 'text',
    sender: isCurrentUser ? 'me' : payload.senderType === 'system' ? 'system' : 'other',
    mediaUri: typeof meta.mediaUri === 'string' ? meta.mediaUri : undefined,
    mediaType:
      meta.mediaType === 'image' || meta.mediaType === 'video'
        ? (meta.mediaType as 'image' | 'video')
        : undefined,
    replyToMessageId: payload.replyToMessageId ?? undefined,
  };
}

// ── Chat message event hook (single conversation) ───────────────────

/**
 * useChatMessageEvent — subscribe to new-message events for a single
 * conversation. The handler is invoked for each `chat.message.created`
 * event on the conversation's topic. Subscription and handler cleanup are
 * automatic on unmount.
 *
 * The handler is stored in a ref so a new closure is captured on every
 * render without re-subscribing to the topic.
 */
export function useChatMessageEvent(
  conversationId: string | undefined,
  handler: (payload: ChatMessageCreatedPayload, envelope: ChatMessageEnvelope) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatMessageCreatedPayload>(topic, (envelope) => {
      if (envelope.type !== CHAT_MESSAGE_EVENT) return;
      handlerRef.current(envelope.payload, envelope as ChatMessageEnvelope);
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

// ── Typing indicator hook ───────────────────────────────────────────

/**
 * useTypingIndicator — subscribe to typing events for a conversation and
 * expose a reactive `isTyping` flag. The flag auto-clears 4s after the
 * last typing event so a stale "typing…" state never lingers.
 */
export function useTypingIndicator(conversationId: string | undefined): boolean {
  const [isTyping, setIsTyping] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) {
      setIsTyping(false);
      return;
    }

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatTypingUpdatePayload>(topic, (envelope) => {
      if (envelope.type !== CHAT_TYPING_EVENT) return;
      const payload = envelope.payload;
      if (payload.conversationId && conversationId && payload.conversationId !== conversationId) {
        return;
      }
      setIsTyping(Boolean(payload.isTyping));
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
      if (payload.isTyping) {
        clearTimerRef.current = setTimeout(() => {
          setIsTyping(false);
          clearTimerRef.current = null;
        }, 4000);
      }
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      setIsTyping(false);
    };
  }, [client, topic, conversationId]);

  return isTyping;
}

// ── Inbox-wide message event hook ───────────────────────────────────

/**
 * useInboxMessageEvent — subscribe to new-message events across all loaded
 * conversations and invoke the handler with the payload. The handler
 * receives the conversationId so it can update the matching inbox row.
 *
 * This subscribes to each conversation's topic individually (the backend
 * authorizes per-conversation). Topics are reconciled as the conversation
 * list changes.
 */
export function useInboxMessageEvent(
  handler: (payload: ChatMessageCreatedPayload, envelope: ChatMessageEnvelope) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;
  const conversations = useStore((state) => state.conversations);

  // Build the desired topic set from the current conversation list.
  const desiredTopics = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!client) return;
    const next = new Set(conversations.map((c) => chatConversationTopic(c.id)));
    const prev = desiredTopics.current;

    const toAdd = Array.from(next).filter((t) => !prev.has(t));
    const toRemove = Array.from(prev).filter((t) => !next.has(t));

    if (toAdd.length) client.subscribe(toAdd);
    if (toRemove.length) {
      client.unsubscribe(toRemove);
      // Handlers for removed topics are dropped by the per-topic effect below.
    }
    desiredTopics.current = next;
  }, [client, conversations]);

  // Register a handler on every desired topic. Each handler filters by
  // event type and forwards to the caller's callback.
  useEffect(() => {
    if (!client) return;
    const unsubscribers: Array<() => void> = [];
    for (const topic of desiredTopics.current) {
      const unsubscribe = client.on<ChatMessageCreatedPayload>(topic, (envelope) => {
        if (envelope.type !== CHAT_MESSAGE_EVENT) return;
        handlerRef.current(envelope.payload, envelope as ChatMessageEnvelope);
      });
      unsubscribers.push(unsubscribe);
    }
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [client, conversations]);
}

// ── Group identity event hook (single conversation) ─────────────────

/**
 * useChatGroupIdentityEvent — subscribe to `chat.group.identity.updated`
 * events for a single conversation. When an admin changes the group name,
 * avatar, cover photo, or description, this hook fires so the caller can
 * merge the update into the local store.
 */
export function useChatGroupIdentityEvent(
  conversationId: string | undefined,
  handler: (payload: ChatGroupIdentityUpdatedPayload) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatGroupIdentityUpdatedPayload>(topic, (envelope) => {
      if (envelope.type !== CHAT_GROUP_IDENTITY_UPDATED_EVENT) return;
      handlerRef.current(envelope.payload);
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

/** Keep composer authority in sync when an admin changes group permissions. */
export function useChatGroupSettingsEvent(
  conversationId: string | undefined,
  handler: (payload: ChatGroupSettingsUpdatedPayload) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;
  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;
    client.subscribe([topic]);
    const unsubscribe = client.on<ChatGroupSettingsUpdatedPayload>(topic, (envelope) => {
      if (envelope.type !== CHAT_GROUP_SETTINGS_UPDATED_EVENT) return;
      handlerRef.current(envelope.payload);
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

export function useChatGroupMembershipEvent(
  conversationId: string | undefined,
  handler: (event: ChatGroupMembershipEvent) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;
  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;
    client.subscribe([topic]);
    const unsubscribe = client.on<unknown>(topic, (envelope) => {
      if (
        envelope.type === CHAT_MEMBER_REMOVED_EVENT
        || envelope.type === CHAT_MEMBER_LEFT_EVENT
        || envelope.type === CHAT_MEMBER_ROLE_UPDATED_EVENT
        || envelope.type === CHAT_GROUP_OWNERSHIP_TRANSFERRED_EVENT
      ) {
        handlerRef.current(envelope as ChatGroupMembershipEvent);
      }
    });
    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

// ── Inbox-wide group identity event hook ────────────────────────────

/**
 * useInboxGroupIdentityEvent — subscribe to `chat.group.identity.updated`
 * events across all loaded conversations. This ensures the inbox list,
 * chat header, and group info screen stay current when any admin changes
 * the group identity, without requiring a manual refetch.
 */
export function useInboxGroupIdentityEvent(
  handler: (payload: ChatGroupIdentityUpdatedPayload) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;
  const conversations = useStore((state) => state.conversations);

  const desiredTopics = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!client) return;
    const next = new Set(conversations.map((c) => chatConversationTopic(c.id)));
    const prev = desiredTopics.current;

    const toAdd = Array.from(next).filter((t) => !prev.has(t));
    const toRemove = Array.from(prev).filter((t) => !next.has(t));

    if (toAdd.length) client.subscribe(toAdd);
    if (toRemove.length) client.unsubscribe(toRemove);
    desiredTopics.current = next;
  }, [client, conversations]);

  useEffect(() => {
    if (!client) return;
    const unsubscribers: Array<() => void> = [];
    for (const topic of desiredTopics.current) {
      const unsubscribe = client.on<ChatGroupIdentityUpdatedPayload>(topic, (envelope) => {
        if (envelope.type !== CHAT_GROUP_IDENTITY_UPDATED_EVENT) return;
        handlerRef.current(envelope.payload);
      });
      unsubscribers.push(unsubscribe);
    }
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [client, conversations]);
}

// ── Read receipt event hook ─────────────────────────────────────────

/**
 * useChatReadReceiptEvent — subscribe to read receipt events for a single
 * conversation. The handler is invoked for each `chat.message.read` event
 * on the conversation's topic, signaling that another participant has read
 * the conversation up to the current cursor.
 *
 * P0.7: This closes the gap where read receipts were "decorative" — the
 * client now subscribes to the canonical read event and can update the
 * delivered/read status of outgoing messages.
 */
export function useChatReadReceiptEvent(
  conversationId: string | undefined,
  handler: (payload: ChatMessageReadPayload) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatMessageReadPayload>(topic, (envelope) => {
      if (envelope.type !== CHAT_MESSAGE_READ_EVENT) return;
      handlerRef.current(envelope.payload);
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

// ── Message deleted event hook ──────────────────────────────────────

/**
 * useChatMessageDeletedEvent — subscribe to message-deleted events for a
 * single conversation. The handler is invoked for each
 * `chat.message.deleted` event on the conversation's topic, signalling that
 * a message was deleted for the caller (`scope: 'me'`) or for everyone.
 *
 * The backend payload uses `actorUserId`; this hook surfaces it as
 * `deletedBy` for caller ergonomics.
 */
export function useChatMessageDeletedEvent(
  conversationId: string | undefined,
  onDeleted: (event: { messageId: string; conversationId: string; scope: 'me' | 'everyone'; deletedBy: string }) => void,
): void {
  const handlerRef = useRef(onDeleted);
  handlerRef.current = onDeleted;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatMessageDeletedPayload>(topic, (envelope) => {
      if (envelope.type !== CHAT_MESSAGE_DELETED_EVENT) return;
      const payload = envelope.payload;
      handlerRef.current({
        messageId: payload.messageId,
        conversationId: payload.conversationId,
        scope: payload.scope,
        deletedBy: payload.actorUserId,
      });
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

// ── Message edited event hook (P2-03) ───────────────────────────────

/**
 * useChatMessageEditedEvent — subscribe to message-edited events for a
 * single conversation. The handler is invoked for each
 * `chat.message.edited` event on the conversation's topic, signalling that
 * a message's body was edited. The caller reconciles the new text and the
 * "Edited" label into its local message list.
 */
export function useChatMessageEditedEvent(
  conversationId: string | undefined,
  onEdited: (event: {
    messageId: string;
    conversationId: string;
    body: string;
    editVersion: number;
    editedAt: string | null;
    editedBy: string;
  }) => void,
): void {
  const handlerRef = useRef(onEdited);
  handlerRef.current = onEdited;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatMessageEditedPayload>(topic, (envelope) => {
      if (envelope.type !== CHAT_MESSAGE_EDITED_EVENT) return;
      const payload = envelope.payload;
      handlerRef.current({
        messageId: payload.messageId,
        conversationId: payload.conversationId,
        body: payload.body,
        editVersion: payload.editVersion,
        editedAt: payload.editedAt,
        editedBy: payload.actorUserId,
      });
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

// ── Reaction event hook ─────────────────────────────────────────────

/**
 * useChatReactionEvent — subscribe to reaction added/removed events for a
 * single conversation. The handler is invoked for each
 * `chat.reaction.added` / `chat.reaction.removed` event on the
 * conversation's topic, with an `action` field distinguishing the two.
 */
export function useChatReactionEvent(
  conversationId: string | undefined,
  onReaction: (event: { messageId: string; conversationId: string; emoji: string; userId: string; action: 'added' | 'removed' }) => void,
): void {
  const handlerRef = useRef(onReaction);
  handlerRef.current = onReaction;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatReactionPayload>(topic, (envelope) => {
      if (
        envelope.type !== CHAT_REACTION_ADDED_EVENT &&
        envelope.type !== CHAT_REACTION_REMOVED_EVENT
      ) {
        return;
      }
      const payload = envelope.payload;
      handlerRef.current({
        messageId: payload.messageId,
        conversationId: payload.conversationId,
        emoji: payload.emoji,
        userId: payload.userId,
        action: envelope.type === CHAT_REACTION_ADDED_EVENT ? 'added' : 'removed',
      });
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}
