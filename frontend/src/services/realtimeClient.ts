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
import { parseMessageCommerceState } from '../domain';
import { fetchConversationPresenceFromApi, type PeerPresenceSnapshot } from './chatApi';

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

/** Save-in-chat — negotiated persistence. `saved` fires when any
 *  participant saves a message; `unsaved` fires when a participant
 *  retracts their save. Both carry the full post-change `savedBy` set so
 *  the client can apply shared state verbatim without a refetch. */
export const CHAT_MESSAGE_SAVED_EVENT = 'chat.message.saved';
export const CHAT_MESSAGE_UNSAVED_EVENT = 'chat.message.unsaved';

/** P0.7: Read receipt. */
export const CHAT_MESSAGE_READ_EVENT = 'chat.message.read';

/** Poll vote/unvote — carries the post-change `voteCounts` plus the voter's
 *  identity and full vote set so every member's PollMessageBubble converges
 *  live without a message refetch. */
export const CHAT_POLL_VOTED_EVENT = 'chat.poll.voted';

/** Group identity updated — emitted when an admin changes the group name,
 *  avatar, cover photo, or description. Other participants must merge this
 *  into their local store so the chat header and info screen stay current
 *  without a manual refetch. */
export const CHAT_GROUP_IDENTITY_UPDATED_EVENT = 'chat.group.identity.updated';
export const CHAT_GROUP_SETTINGS_UPDATED_EVENT = 'chat.group.settings.updated';
export const CHAT_DM_CREATED_EVENT = 'chat.dm.created';
export const CHAT_GROUP_CREATED_EVENT = 'chat.group.created';
export const CHAT_MEMBER_ADDED_EVENT = 'chat.member.added';
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
  editVersion?: number;
  editedAt?: string | null;
  deletedForEveryoneAt?: string | null;
  /** Voice receipt (joined from voice_messages by the backend serializer). */
  voice?: {
    id: string;
    durationMs: number;
    bytes?: number;
    container: 'm4a' | 'ogg' | 'webm' | 'mp4';
    codec: 'aac' | 'opus' | 'mp3';
    waveform: { samples: number[]; sampleCount: number; algorithmVersion: number } | null;
    moderationState?: 'pending' | 'allowed' | 'limited' | 'blocked';
  } | null;
  /** Media URI for image/video messages. */
  mediaUri?: string | null;
  /** Offer payload for offer messages. */
  offer?: {
    offerId?: string;
    amount?: number;
    status?: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled';
    buyerId?: string;
    sellerId?: string;
    listingId?: string;
    listingTitle?: string;
    originalPrice?: number;
    offerPrice?: number;
    expiresAt?: string;
    counterRound?: number;
  } | null;
  /** Save-in-chat shared state — present only when non-empty. */
  savedBy?: string[];
  savedAt?: string | null;
  /** Poll snapshot for poll-type messages (see backend serializer — the
   *  `chat_polls` row joined at send/read time). */
  poll?: {
    id: string;
    question: string;
    options: string[];
    allowMultiple: boolean;
    isAnonymous: boolean;
    closesAt?: string;
    voteCounts: number[];
    myVotes: number[];
  } | null;
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
  /** Offer snapshot — present when the "edit" is a commerce metadata sync
   *  (offer status flip emitted by offerChatCards.syncOfferChatCardStatus),
   *  not a body edit. Consumers must not flag `isEdited` for these. */
  offer?: ChatMessageCreatedPayload['offer'] | null;
  /** Full post-sync metadata — carried alongside `offer` for completeness. */
  metadata?: Record<string, unknown>;
}

/** Payload shape for `chat.reaction.added` / `chat.reaction.removed`. */
export interface ChatReactionPayload {
  conversationId: string;
  messageId: string;
  userId: string;
  emoji: string;
}

/** Payload shape for `chat.message.saved` / `chat.message.unsaved`. */
export interface ChatMessageSavedPayload {
  conversationId: string;
  messageId: string;
  actorUserId: string;
  /** Full set of user IDs who currently have the message saved. */
  savedBy: string[];
  savedAt?: string | null;
}

/** Payload shape for `chat.message.read`. */
export interface ChatMessageReadPayload {
  conversationId: string;
  userId: string;
  readAt: string;
  /** Message IDs that were marked read in this event. When absent, the
   *  event is a legacy conversation-level cursor (mark all up to readAt). */
  messageIds?: string[];
  /** Read cursor — the newest message the reader has seen. The authoritative
   *  signal for "read up to here"; `messageIds` is bounded receipt detail. */
  upToMessageId?: string;
}

/** Payload shape for `chat.typing.update`. */
export interface ChatTypingUpdatePayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

/** Payload shape for `chat.poll.voted` — emitted on both vote and unvote so
 *  every member's PollMessageBubble converges without a refetch. */
export interface ChatPollVotedPayload {
  conversationId: string;
  messageId: string;
  pollId: string;
  /** Post-change per-option vote totals. Absent on legacy payloads. */
  voteCounts?: number[];
  userId: string;
  optionIndex?: number;
  action?: 'added' | 'removed';
  /** The voter's full post-change vote set — lets the voter's other devices
   *  sync `myVotes` verbatim (single-vote polls replace the whole set). */
  voterVotes?: number[];
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

/** Realtime event emitted on `presence.user:{userId}` when a user's online
 *  state transitions (socket connect/disconnect). The backend only publishes
 *  it when the user's `activity_status_visible` privacy setting allows it. */
export const PRESENCE_UPDATE_EVENT = 'presence.update';

/** Payload shape for `presence.update`. */
export interface PresenceUpdatePayload {
  userId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}

/** Typed envelope for chat message events. */
export type ChatMessageEnvelope = RealtimeEnvelope<ChatMessageCreatedPayload>;
/** Typed envelope for typing events. */
export type ChatTypingEnvelope = RealtimeEnvelope<ChatTypingUpdatePayload>;

// ── Topic helpers ───────────────────────────────────────────────────

/** Build the realtime topic for a conversation. */
export function chatConversationTopic(conversationId: string): string {
  return `chat.conversation:${conversationId}`;
}

/** Build the per-user inbox topic — carries new-conversation signals
 *  (dm created, group created, member added) that can never arrive on a
 *  conversation topic the recipient hasn't subscribed to yet. */
export function chatUserTopic(userId: string): string {
  return `chat.user:${userId}`;
}

/** Build the realtime topic carrying presence transitions for a user.
 *  Subscription is authorized server-side for dyad conversation peers only. */
export function presenceUserTopic(userId: string): string {
  return `presence.user:${userId}`;
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

  // ── Type detection ────────────────────────────────────────────────
  // Voice: the backend attaches a `voice` receipt, or stashes voice
  // metadata under `metadata.voice` / `metadata.mediaType === 'voice'`.
  const voice =
    payload.voice ??
    (meta.voice as ChatMessageCreatedPayload['voice'] | undefined);
  const isVoice =
    Boolean(payload.voice) ||
    Boolean(meta.voice) ||
    meta.mediaType === 'voice';

  // Offer: the backend attaches an `offer` object, or stashes the offer
  // payload under `metadata.offerPayload`.
  const offerSource =
    payload.offer ??
    (meta.offerPayload as ChatMessageCreatedPayload['offer'] | undefined);
  const isOffer = Boolean(payload.offer) || Boolean(meta.offerPayload);

  // Listing-share: the card snapshot rides in `metadata.listingShare`.
  const listingShare = meta.listingShare as Record<string, unknown> | undefined;
  const isListingShare = Boolean(listingShare && typeof listingShare.listingId === 'string');

  // In-thread commerce cards (marketplace audit P1): order lifecycle
  // transitions arrive as `sender_type = 'system'` messages carrying the
  // order snapshot under `metadata.commerceState`.
  const commerceState = parseMessageCommerceState(meta);

  // Media: a non-voice message with a mediaUri renders as a media bubble.
  const mediaUri =
    typeof payload.mediaUri === 'string'
      ? payload.mediaUri
      : typeof meta.mediaUri === 'string'
        ? meta.mediaUri
        : undefined;
  // Poster still for video media — mediaUri may be an HLS playlist that no
  // image loader can decode; bubbles/grids render this instead.
  const posterUri = typeof meta.posterUri === 'string' ? meta.posterUri : undefined;

  let type: ConversationMessage['type'];
  if (commerceState) {
    type = 'commerce_state';
  } else if (payload.senderType === 'system') {
    type = 'system';
  } else if (isOffer) {
    type = 'offer';
  } else if (isListingShare) {
    type = 'listing_share';
  } else if (isVoice) {
    type = 'voice';
  } else if (mediaUri) {
    type = 'media';
  } else {
    type = 'text';
  }

  // Voice field extraction — prefer the canonical voice receipt, fall
  // back to metadata fields for backwards compatibility.
  const voiceUriFromMeta = typeof meta.mediaUri === 'string' ? meta.mediaUri : undefined;
  const voiceDurationMs =
    voice?.durationMs ??
    (typeof meta.durationMs === 'number' ? meta.durationMs : undefined);
  const voiceWaveform = voice?.waveform?.samples;
  const voiceContainer = voice?.container;
  const voiceCodec = voice?.codec;
  const voiceModerationState = voice?.moderationState;

  return {
    id: payload.id,
    senderId,
    text: payload.body,
    timestamp: payload.createdAt,
    date: payload.createdAt,
    isSystem: payload.senderType === 'system',
    systemTitle: payload.senderType === 'system' ? 'System' : undefined,
    type,
    sender: isCurrentUser ? 'me' : payload.senderType === 'system' ? 'system' : 'other',
    mediaUri,
    posterUri,
    mediaType:
      !isVoice && (meta.mediaType === 'image' || meta.mediaType === 'video')
        ? (meta.mediaType as 'image' | 'video')
        : undefined,
    // Lifecycle fields — carried through so the UI can render edit/delete
    // state and reconcile optimistic messages by clientMessageId.
    clientMessageId: payload.clientMessageId ?? undefined,
    editVersion: payload.editVersion ?? undefined,
    editedAt: payload.editedAt ?? undefined,
    isEdited: Boolean(payload.editedAt) || (payload.editVersion ?? 0) > 0,
    deletedForEveryoneAt: payload.deletedForEveryoneAt ?? undefined,
    isDeleted: Boolean(payload.deletedForEveryoneAt),
    // Save-in-chat shared state — identical on both sides.
    isSavedInChat: (payload.savedBy?.length ?? 0) > 0,
    savedBy: payload.savedBy?.length ? payload.savedBy : undefined,
    savedAt: payload.savedAt ?? undefined,
    // The server has accepted a realtime message, so it is at least "sent".
    readStatus: 'sent',
    readBy: [],
    // Voice fields — only populated when this is a voice message.
    voiceUri: isVoice ? voiceUriFromMeta : undefined,
    voiceDurationMs: isVoice ? voiceDurationMs : undefined,
    voiceWaveform: isVoice ? voiceWaveform : undefined,
    voiceContainer: isVoice ? voiceContainer : undefined,
    voiceCodec: isVoice ? voiceCodec : undefined,
    voiceModerationState: isVoice ? voiceModerationState : undefined,
    // Offer fields — only populated when this is an offer message.
    offer: isOffer && offerSource
      ? {
          offerId: offerSource.offerId,
          amount: offerSource.amount,
          status: offerSource.status,
          buyerId: offerSource.buyerId,
          sellerId: offerSource.sellerId,
          listingId: offerSource.listingId,
          listingTitle: offerSource.listingTitle,
          originalPrice: offerSource.originalPrice,
          offerPrice: offerSource.offerPrice,
          price: offerSource.offerPrice,
          expiresAt: offerSource.expiresAt,
          counterRound: offerSource.counterRound,
        }
      : undefined,
    // Listing-share snapshot — populated only for `listing_share` messages.
    listing: isListingShare && listingShare
      ? {
          id: listingShare.listingId as string,
          title: typeof listingShare.title === 'string' ? listingShare.title : '',
          price: typeof listingShare.price === 'number' ? listingShare.price : 0,
          originalPrice: typeof listingShare.originalPrice === 'number' ? listingShare.originalPrice : undefined,
          image: typeof listingShare.image === 'string' ? listingShare.image : undefined,
          brand: typeof listingShare.brand === 'string' ? listingShare.brand : null,
          size: typeof listingShare.size === 'string' ? listingShare.size : undefined,
          condition: typeof listingShare.condition === 'string' ? listingShare.condition : undefined,
          sellerId: typeof listingShare.sellerId === 'string' ? listingShare.sellerId : null,
          sellerUsername: typeof listingShare.sellerUsername === 'string' ? listingShare.sellerUsername : undefined,
          sellerRating: typeof listingShare.sellerRating === 'number' ? listingShare.sellerRating : undefined,
          isSold: listingShare.isSold === true,
        }
      : undefined,
    replyToMessageId: payload.replyToMessageId ?? undefined,
    // Order lifecycle snapshot — populated only for `commerce_state` cards.
    commerceState,
    // Poll snapshot — populated only for poll messages; live counts are
    // patched by `chat.poll.voted` events afterwards.
    poll: payload.poll ?? undefined,
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
 *
 * Returns a boolean for backwards compatibility. For named typing
 * (group chats), use `useTypingUsers` which exposes the set of typing
 * user IDs.
 */
export function useTypingIndicator(conversationId: string | undefined): boolean {
  const { isTyping } = useTypingUsers(conversationId);
  return isTyping;
}

/**
 * useTypingUsers — subscribe to typing events for a conversation and
 * expose the set of user IDs currently typing. Auto-clears individual
 * users 4s after their last typing event so stale states never linger.
 *
 * Returns:
 *   - typingUserIds: string[] — user IDs currently typing (excludes self)
 *   - isTyping: boolean — true if anyone is typing
 */
export function useTypingUsers(conversationId: string | undefined): {
  typingUserIds: string[];
  isTyping: boolean;
} {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const clearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const ctx = useRealtimeSafe();
  const client = ctx?.client;
  const selfId = useStore((s) => s.currentUser?.id);

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) {
      setTypingUserIds([]);
      return;
    }

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatTypingUpdatePayload>(topic, (envelope) => {
      if (envelope.type !== CHAT_TYPING_EVENT) return;
      const payload = envelope.payload;
      if (payload.conversationId && conversationId && payload.conversationId !== conversationId) {
        return;
      }
      const userId = payload.userId;
      if (!userId) return;
      // Never surface our own typing echo — the backend excludes the actor
      // from fan-out; this is the belt-filter for stale/duplicate delivery.
      if (selfId && userId === selfId) return;

      if (payload.isTyping) {
        setTypingUserIds((prev) => prev.includes(userId) ? prev : [...prev, userId]);
        // Clear existing timer for this user
        const existingTimer = clearTimersRef.current.get(userId);
        if (existingTimer) clearTimeout(existingTimer);
        // Set new auto-clear timer
        const timer = setTimeout(() => {
          setTypingUserIds((prev) => prev.filter((id) => id !== userId));
          clearTimersRef.current.delete(userId);
        }, 4000);
        clearTimersRef.current.set(userId, timer);
      } else {
        setTypingUserIds((prev) => prev.filter((id) => id !== userId));
        const existingTimer = clearTimersRef.current.get(userId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          clearTimersRef.current.delete(userId);
        }
      }
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
      for (const timer of clearTimersRef.current.values()) {
        clearTimeout(timer);
      }
      clearTimersRef.current.clear();
      setTypingUserIds([]);
    };
  }, [client, topic, conversationId, selfId]);

  // Belt at the render boundary too: a self-echo that arrives while the
  // store is still hydrating (selfId === null) bypasses the event-time
  // filter above — re-filtering here evicts it as soon as selfId resolves.
  const filteredTypingUserIds = selfId
    ? typingUserIds.filter((id) => id !== selfId)
    : typingUserIds;
  return { typingUserIds: filteredTypingUserIds, isTyping: filteredTypingUserIds.length > 0 };
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

/**
 * useInboxReadEvent — subscribe to `chat.message.read` across all loaded
 * conversation topics. When the current user reads a thread on another
 * device, the server broadcasts a read cursor with their userId — the inbox
 * clears the row's unread state without a refetch.
 */
export function useInboxReadEvent(
  handler: (payload: ChatMessageReadPayload) => void,
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
      const unsubscribe = client.on<ChatMessageReadPayload>(topic, (envelope) => {
        if (envelope.type !== CHAT_MESSAGE_READ_EVENT) return;
        handlerRef.current(envelope.payload);
      });
      unsubscribers.push(unsubscribe);
    }
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [client, conversations]);
}

// ── Per-user inbox signal hook ──────────────────────────────────────

export interface ChatInboxSignalPayload {
  conversationId: string;
}

/**
 * useInboxUserEvent — subscribe to `chat.user:{userId}` for new-conversation
 * signals (`chat.dm.created`, `chat.group.created`, `chat.member.added`).
 * Per-conversation subscriptions can't deliver these: the recipient isn't a
 * subscriber of a conversation they don't know exists yet. The handler
 * should refetch the inbox — the signal deliberately carries minimal data.
 */
export function useInboxUserEvent(
  userId: string | undefined,
  handler: (payload: ChatInboxSignalPayload, eventType: string) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = userId ? chatUserTopic(userId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatInboxSignalPayload>(topic, (envelope) => {
      if (
        envelope.type !== CHAT_DM_CREATED_EVENT &&
        envelope.type !== CHAT_GROUP_CREATED_EVENT &&
        envelope.type !== CHAT_MEMBER_ADDED_EVENT
      ) {
        return;
      }
      handlerRef.current(envelope.payload, envelope.type);
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

// ── Per-user offer lifecycle hook ───────────────────────────────────

/**
 * useUserOfferEvent — subscribe to `chat.user:{userId}` for offer
 * lifecycle signals (`offer.*`, `smart_sell_decision.*`). The drain
 * publishes these participant-privately because offers are never
 * observable on a public listing topic. The handler should refetch the
 * offers list — the payload deliberately stays thin.
 */
export function useUserOfferEvent(
  userId: string | undefined,
  handler: (payload: Record<string, unknown>, eventType: string) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = userId ? chatUserTopic(userId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<Record<string, unknown>>(topic, (envelope) => {
      if (
        !envelope.type.startsWith('offer.') &&
        !envelope.type.startsWith('smart_sell_decision.')
      ) {
        return;
      }
      handlerRef.current(envelope.payload, envelope.type);
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
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
    /** Present on commerce metadata syncs (offer status flips) — not a body
     *  edit; consumers must not flag `isEdited` when this is set. */
    offer?: ChatMessageCreatedPayload['offer'] | null;
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
        offer: payload.offer ?? undefined,
      });
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

// ── Poll vote event hook ────────────────────────────────────────────

/**
 * useChatPollVotedEvent — subscribe to `chat.poll.voted` events for a single
 * conversation. Emitted by the backend on both vote and unvote; the payload
 * carries the post-change `voteCounts`, the voter's identity, and the
 * voter's full vote set (`voterVotes`) so every member's PollMessageBubble
 * converges live without a message refetch.
 */
export function useChatPollVotedEvent(
  conversationId: string | undefined,
  onVoted: (event: ChatPollVotedPayload) => void,
): void {
  const handlerRef = useRef(onVoted);
  handlerRef.current = onVoted;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatPollVotedPayload>(topic, (envelope) => {
      if (envelope.type !== CHAT_POLL_VOTED_EVENT) return;
      handlerRef.current(envelope.payload);
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic]);
}

// ── Save-in-chat event hook ─────────────────────────────────────────

/**
 * useChatMessageSaveEvent — subscribe to `chat.message.saved` /
 * `chat.message.unsaved` events for a single conversation. Saved state is
 * shared (Snapchat-style negotiated persistence): both parties render the
 * "Saved" marker while any participant's save remains. The payload
 * carries the full post-change `savedBy` set, so the caller applies it
 * verbatim — no refetch needed.
 */
export function useChatMessageSaveEvent(
  conversationId: string | undefined,
  onSave: (event: {
    messageId: string;
    conversationId: string;
    action: 'saved' | 'unsaved';
    savedBy: string[];
    savedAt?: string | null;
    actorUserId: string;
  }) => void,
): void {
  const handlerRef = useRef(onSave);
  handlerRef.current = onSave;
  const ctx = useRealtimeSafe();
  const client = ctx?.client;

  const topic = conversationId ? chatConversationTopic(conversationId) : null;

  useEffect(() => {
    if (!topic || !client) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<ChatMessageSavedPayload>(topic, (envelope) => {
      if (
        envelope.type !== CHAT_MESSAGE_SAVED_EVENT &&
        envelope.type !== CHAT_MESSAGE_UNSAVED_EVENT
      ) {
        return;
      }
      const payload = envelope.payload;
      handlerRef.current({
        messageId: payload.messageId,
        conversationId: payload.conversationId,
        action: envelope.type === CHAT_MESSAGE_SAVED_EVENT ? 'saved' : 'unsaved',
        savedBy: payload.savedBy,
        savedAt: payload.savedAt,
        actorUserId: payload.actorUserId,
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

// ── Dyad presence hook ────────────────────────────────────────────

/**
 * usePeerPresence — resolves a DM counterparty's live presence for the chat
 * header. Pulls a snapshot from `GET /chat/conversations/:id/presence` and
 * keeps it current via `presence.update` events on the peer's topic.
 *
 * Returns `null` while presence is undetermined, when the peer hides their
 * activity status, or when the backend reports none — callers must render
 * no presence affordance in that case (never a fabricated dot). The
 * snapshot is re-pulled on every socket reconnect so a gap in
 * `presence.update` events can't leave a stale indicator.
 */
export function usePeerPresence(
  conversationId: string | undefined,
  peerUserId: string | null | undefined,
): PeerPresenceSnapshot | null {
  const [presence, setPresence] = useState<PeerPresenceSnapshot | null>(null);
  const ctx = useRealtimeSafe();
  const client = ctx?.client;
  const connectionState = ctx?.connectionState ?? 'idle';

  const topic = peerUserId ? presenceUserTopic(peerUserId) : null;

  useEffect(() => {
    let active = true;
    setPresence(null);
    if (!conversationId || !peerUserId || connectionState !== 'connected') {
      return () => { active = false; };
    }

    fetchConversationPresenceFromApi(conversationId)
      .then((snapshot) => {
        if (active) setPresence(snapshot);
      })
      .catch(() => {
        // Presence stays null — the header renders nothing.
      });

    return () => { active = false; };
  }, [conversationId, peerUserId, connectionState]);

  useEffect(() => {
    if (!topic || !client || !peerUserId) return;

    client.subscribe([topic]);
    const unsubscribe = client.on<PresenceUpdatePayload>(topic, (envelope) => {
      if (envelope.type !== PRESENCE_UPDATE_EVENT) return;
      const payload = envelope.payload;
      if (payload.userId !== peerUserId) return;
      setPresence({
        userId: payload.userId,
        isOnline: payload.isOnline === true,
        lastSeenAt: payload.lastSeenAt ?? null,
      });
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic, peerUserId]);

  return presence;
}
