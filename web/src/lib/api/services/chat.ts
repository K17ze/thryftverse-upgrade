/**
 * Web chat service — mirrors frontend/src/services/chatApi.ts.
 * Conversations carry participantProfiles; messages carry structured
 * metadata (offers, listing shares, reactions). Never flatten to
 * `{ sender, text }`.
 */

import { fetchJson } from '../http';
import {
  mapApiConversationToWeb,
  mapApiMessageToWebMessage,
  type ApiConversationPayload,
  type ApiMessagePayload,
} from '../mappers';
import type { Conversation, Message } from '@/lib/contracts/domain';

/**
 * Marketplace/role meta — the signals the mobile classifier reads that
 * the web `Conversation` contract doesn't carry: `itemId`/`context.listing`
 * (the thread is about a listing → marketplace) and `ownerId` (the
 * conversation creator — native's `sellerId ?? ownerId` proxy for the
 * seller side). Attached as a non-contract field, same grammar as
 * `messageHistory`; fixture conversations never carry it (their
 * `listing` contract field is the marketplace signal there).
 */
export interface ConversationMarketplaceMeta {
  itemId?: string;
  ownerId?: string;
  /** Server-projected context listing id, when the payload carries one. */
  listingId?: string;
}

export type ConversationWithMarketplace = Conversation & {
  marketplace?: ConversationMarketplaceMeta;
};

/** Read the marketplace meta a live conversation payload carries. */
export function marketplaceMeta(
  c: Conversation | null | undefined,
): ConversationMarketplaceMeta {
  return (c as ConversationWithMarketplace | null | undefined)?.marketplace ?? {};
}

/** The conversation payload fields beyond the declared contract — read
 *  defensively, absent payloads stay absent. */
type ApiConversationPayloadFull = ApiConversationPayload & {
  context?: { listing?: { id?: string } | null } | null;
};

function attachMarketplaceMeta(
  conversation: Conversation,
  raw: ApiConversationPayload | undefined,
): Conversation {
  if (!raw) return conversation;
  const full = raw as ApiConversationPayloadFull;
  const listingId = full.context?.listing?.id;
  const itemId = raw.itemId ?? (typeof listingId === 'string' ? listingId : undefined);
  const ownerId = raw.ownerId ?? undefined;
  if (!itemId && !ownerId) return conversation;
  (conversation as ConversationWithMarketplace).marketplace = {
    itemId,
    ownerId,
    listingId: typeof listingId === 'string' ? listingId : undefined,
  };
  return conversation;
}

export async function fetchConversations(
  currentUserId?: string,
  signal?: AbortSignal,
): Promise<Conversation[]> {
  const payload = await fetchJson<{
    ok?: boolean;
    items?: ApiConversationPayload[];
    conversations?: ApiConversationPayload[];
  }>('/chat/conversations', undefined, { signal });
  const rows = payload.items ?? payload.conversations ?? [];
  return rows.map((c) =>
    attachMarketplaceMeta(mapApiConversationToWeb(c, currentUserId), c),
  );
}

/** Pagination envelope the messages route returns (mirrors the mobile
 *  fetchConversationMessagesFromApi contract — limit/before/after +
 *  oldestCursor/newestCursor/hasMore). */
export interface ConversationMessagesPage {
  messages: Message[];
  oldestCursor?: string;
  newestCursor?: string;
  hasMore?: boolean;
}

/** First-page cursors the thread surface needs for "load older" — the
 *  conversation payload rides with this meta attached (non-contract
 *  field; absent when the payload carries no envelope). */
export interface ConversationHistoryMeta {
  oldestCursor?: string;
  hasMore?: boolean;
}

export type ConversationWithHistory = Conversation & {
  messageHistory?: ConversationHistoryMeta;
};

/** Read the history meta a live conversation payload carries. */
export function messageHistoryMeta(c: Conversation | null | undefined): ConversationHistoryMeta {
  return (c as ConversationWithHistory | null | undefined)?.messageHistory ?? {};
}

export async function fetchConversation(
  id: string,
  currentUserId?: string,
  signal?: AbortSignal,
): Promise<Conversation | null> {
  const payload = await fetchJson<{
    ok: boolean;
    conversation?: ApiConversationPayload;
  }>(`/chat/conversations/${encodeURIComponent(id)}`, undefined, { signal });
  if (!payload.ok || !payload.conversation) return null;
  const page = await fetchConversationMessagesPage(id, currentUserId, undefined, signal);
  const conversation: ConversationWithHistory = mapApiConversationToWeb(
    payload.conversation,
    currentUserId,
    page.messages,
  );
  conversation.messageHistory = {
    oldestCursor: page.oldestCursor,
    hasMore: page.hasMore ?? Boolean(page.oldestCursor),
  };
  attachMarketplaceMeta(conversation, payload.conversation);
  return conversation;
}

/**
 * Paged message fetch — mirrors mobile fetchConversationMessagesFromApi:
 * `before` walks backwards from oldestCursor (older history), `after`
 * re-syncs forward. The envelope's cursors are preserved — the previous
 * fetchConversationMessages dropped them, which is why the thread could
 * never reach past the first window.
 */
export async function fetchConversationMessagesPage(
  id: string,
  currentUserId?: string,
  options?: { limit?: number; before?: string; after?: string },
  signal?: AbortSignal,
): Promise<ConversationMessagesPage> {
  const params = new URLSearchParams();
  params.set('limit', String(options?.limit ?? 120));
  if (options?.before) params.set('before', options.before);
  if (options?.after) params.set('after', options.after);
  const payload = await fetchJson<{
    ok?: boolean;
    items?: ApiMessagePayload[];
    messages?: ApiMessagePayload[];
    oldestCursor?: string | null;
    newestCursor?: string | null;
    hasMore?: boolean | null;
  }>(
    `/chat/conversations/${encodeURIComponent(id)}/messages?${params.toString()}`,
    undefined,
    { signal },
  );
  const rows = payload.items ?? payload.messages ?? [];
  return {
    messages: rows.map((m) => attachSaveState(mapApiMessageToWebMessage(m, currentUserId), m)),
    oldestCursor: payload.oldestCursor ?? undefined,
    newestCursor: payload.newestCursor ?? undefined,
    hasMore: payload.hasMore ?? undefined,
  };
}

/**
 * Saved-in-chat state — the backend serializes `savedBy`/`savedAt` on
 * every message (the negotiated-persistence marker both sides see), but
 * the web `Message` contract doesn't declare them. Attached as a
 * non-contract field so the actions menu can offer "Save in chat" /
 * "Unsave" truthfully — same grammar as `messageHistory` on the
 * conversation.
 */
export interface MessageSaveState {
  /** User ids who have the message saved — the viewer's membership
   *  drives the Save/Unsave label. */
  savedBy?: string[];
  savedAt?: string;
}

export type MessageWithSaveState = Message & MessageSaveState;

/** Read the save state a message carries (empty when absent). */
export function messageSaveState(m: Message | null | undefined): MessageSaveState {
  return (m as MessageWithSaveState | null | undefined) ?? {};
}

function attachSaveState(message: Message, raw: ApiMessagePayload): Message {
  const full = raw as ApiMessagePayload & {
    savedBy?: string[];
    savedAt?: string | null;
  };
  if (!Array.isArray(full.savedBy) || full.savedBy.length === 0) return message;
  const target = message as MessageWithSaveState;
  target.savedBy = full.savedBy;
  if (typeof full.savedAt === 'string') target.savedAt = full.savedAt;
  return message;
}

export async function fetchConversationMessages(
  id: string,
  currentUserId?: string,
  signal?: AbortSignal,
): Promise<Message[]> {
  const page = await fetchConversationMessagesPage(id, currentUserId, undefined, signal);
  return page.messages;
}

export async function createDmConversation(
  participantId: string,
  currentUserId?: string,
): Promise<Conversation> {
  const payload = await fetchJson<{
    ok: boolean;
    conversation?: ApiConversationPayload;
  }>('/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'dm', participantId }),
  });
  if (!payload.ok || !payload.conversation) {
    throw new Error('Failed to create conversation');
  }
  return attachMarketplaceMeta(mapApiConversationToWeb(payload.conversation, currentUserId), payload.conversation);
}

export async function createGroupConversation(
  input: { title: string; participantIds: string[]; description?: string },
  currentUserId?: string,
): Promise<Conversation> {
  const payload = await fetchJson<{
    ok: boolean;
    conversation?: ApiConversationPayload;
  }>('/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'group',
      title: input.title,
      participantIds: input.participantIds,
      description: input.description,
    }),
  });
  if (!payload.ok || !payload.conversation) {
    throw new Error('Failed to create group');
  }
  return attachMarketplaceMeta(mapApiConversationToWeb(payload.conversation, currentUserId), payload.conversation);
}

export interface SendChatMessageApiInput {
  text?: string;
  mediaUri?: string;
  /** 'image'/'video'/'document'/'voice' — the backend's discriminated
   *  message type; absent = plain text. */
  mediaType?: 'image' | 'video' | 'document' | 'voice';
  replyToMessageId?: string;
  /** Document display metadata — sent in `metadata` (mobile grammar). */
  documentName?: string;
  documentMimeType?: string;
  /** Voice metadata — top-level fields the backend voice serializer reads. */
  voiceDurationMs?: number;
  voiceWaveform?: number[];
}

/**
 * Send a message — the backend's discriminated payload (mirrors mobile
 * sendConversationMessageOnApi): 'image'/'video'/'document'/'voice' types
 * carry mediaUri and make text optional; absent type = plain text.
 * Documents send name/MIME in `metadata`; voice sends durationMs and the
 * waveform top-level. Only present fields are forwarded so text sends
 * stay minimal.
 */
export async function sendChatMessage(
  conversationId: string,
  input: SendChatMessageApiInput,
  currentUserId?: string,
): Promise<Message> {
  const body: Record<string, unknown> = {};
  if (input.text) body.text = input.text;
  if (input.mediaUri) {
    body.type = input.mediaType ?? 'image';
    body.mediaUri = input.mediaUri;
  }
  if (input.mediaType === 'document') {
    body.metadata = {
      ...(input.documentName ? { documentName: input.documentName } : {}),
      ...(input.documentMimeType
        ? { documentMimeType: input.documentMimeType }
        : {}),
    };
  }
  if (input.voiceDurationMs !== undefined) {
    body.voiceDurationMs = input.voiceDurationMs;
  }
  if (input.voiceWaveform !== undefined) {
    body.voiceWaveform = input.voiceWaveform;
  }
  if (input.replyToMessageId) body.replyToMessageId = input.replyToMessageId;
  const payload = await fetchJson<{
    ok: boolean;
    message?: ApiMessagePayload;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!payload.ok || !payload.message) {
    throw new Error('Failed to send message');
  }
  return mapApiMessageToWebMessage(payload.message, currentUserId);
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await fetchJson(`/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
  });
}

/** Per-viewer conversation mute — POST mutes, DELETE restores. */
export async function setConversationMuted(
  conversationId: string,
  muted: boolean,
): Promise<void> {
  await fetchJson(`/chat/conversations/${encodeURIComponent(conversationId)}/mute`, {
    method: muted ? 'POST' : 'DELETE',
  });
}

/** Per-viewer conversation archive — POST archives, DELETE unarchives. */
export async function setConversationArchived(
  conversationId: string,
  archived: boolean,
): Promise<void> {
  await fetchJson(`/chat/conversations/${encodeURIComponent(conversationId)}/archive`, {
    method: archived ? 'POST' : 'DELETE',
  });
}

/**
 * Edit a message the caller authored — PATCH, mirrors mobile
 * editConversationMessageOnApi. Sender-only, enforced server-side within
 * a 15-minute window of creation; deleted messages are rejected. Returns
 * the updated, re-serialized message.
 */
export async function editChatMessage(
  conversationId: string,
  messageId: string,
  text: string,
  currentUserId?: string,
): Promise<Message> {
  const payload = await fetchJson<{ ok: boolean; message?: ApiMessagePayload }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    },
  );
  if (!payload.message) throw new Error('Failed to edit message');
  return mapApiMessageToWebMessage(payload.message, currentUserId);
}

/**
 * Delete a message — `scope='everyone'` tombstones it for all
 * participants (sender-only, enforced server-side); `scope='me'`
 * removes it from the caller's view. Mirrors mobile
 * deleteConversationMessageOnApi.
 */
export async function deleteChatMessage(
  conversationId: string,
  messageId: string,
  scope: 'me' | 'everyone',
): Promise<{ deleted: boolean; scope: 'me' | 'everyone' }> {
  const payload = await fetchJson<{
    ok: boolean;
    deleted: boolean;
    scope: 'me' | 'everyone';
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}?scope=${scope}`,
    { method: 'DELETE' },
  );
  // A 200 envelope can still carry ok:false — without the throw the
  // optimistic tombstone/removal would survive a rejected delete.
  if (!payload.ok) throw new Error('Failed to delete message');
  return payload;
}

/** Add an emoji reaction — POST /reactions. Mirrors mobile addMessageReactionOnApi. */
export async function addMessageReaction(
  conversationId: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  await fetchJson(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    },
  );
}

/** Remove an emoji reaction — DELETE /reactions?emoji=. Mirrors mobile removeMessageReactionOnApi. */
export async function removeMessageReaction(
  conversationId: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  await fetchJson(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions?emoji=${encodeURIComponent(emoji)}`,
    { method: 'DELETE' },
  );
}

/**
 * Save / unsave a message in chat — POST/DELETE /save, mirrors mobile
 * saveMessageInChatOnApi / unsaveMessageInChatOnApi. Shared negotiated
 * persistence: the response carries the post-change `savedBy` set.
 */
export async function saveChatMessage(
  conversationId: string,
  messageId: string,
): Promise<{ savedBy: string[]; savedAt?: string }> {
  const payload = await fetchJson<{
    ok: boolean;
    saved?: boolean;
    savedBy?: string[];
    savedAt?: string;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/save`,
    { method: 'POST' },
  );
  if (!payload.ok) throw new Error('Failed to save message');
  return { savedBy: payload.savedBy ?? [], savedAt: payload.savedAt };
}

export async function unsaveChatMessage(
  conversationId: string,
  messageId: string,
): Promise<{ savedBy: string[] }> {
  const payload = await fetchJson<{
    ok: boolean;
    saved?: boolean;
    savedBy?: string[];
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/save`,
    { method: 'DELETE' },
  );
  if (!payload.ok) throw new Error('Failed to unsave message');
  return { savedBy: payload.savedBy ?? [] };
}

/** Backend report taxonomy — POST /chat/conversations/:id/report. */
export type ConversationReportReason =
  | 'spam'
  | 'harassment'
  | 'scam_fraud'
  | 'inappropriate_content'
  | 'off_platform_payment'
  | 'impersonation'
  | 'other';

/**
 * Report a conversation, optionally citing a specific message — POST
 * /report accepts `messageId` as the evidence reference (validated
 * server-side against the conversation). Returns the issued report id.
 */
export async function reportConversation(
  conversationId: string,
  input: {
    reason: ConversationReportReason;
    messageId?: string;
    details?: string;
    idempotencyKey?: string;
  },
): Promise<{ reportId: string; noticeId?: string }> {
  const payload = await fetchJson<{
    ok: boolean;
    reportId?: string;
    noticeId?: string;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: input.reason,
      ...(input.messageId ? { messageId: input.messageId } : {}),
      ...(input.details ? { details: input.details } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    }),
  });
  if (!payload.ok || !payload.reportId) throw new Error('Failed to send report');
  return { reportId: payload.reportId, noticeId: payload.noticeId };
}

// ── Pinned message — one per conversation, group admins/owners only ────

/**
 * The conversation's pinned message — GET /pinned-message returns the
 * pin row plus the full serialized message, mapped to the web Message.
 * Mirrors mobile fetchPinnedMessageFromApi; `{ pinned: null }` → null.
 */
export async function fetchPinnedMessage(
  conversationId: string,
  currentUserId?: string,
  signal?: AbortSignal,
): Promise<{ messageId: string; pinnedBy?: string; message?: Message } | null> {
  const payload = await fetchJson<{
    pinned: {
      messageId: string;
      pinnedBy?: string;
      pinnedAt?: string;
      message?: ApiMessagePayload;
    } | null;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/pinned-message`,
    undefined,
    { signal },
  );
  if (!payload.pinned) return null;
  return {
    messageId: payload.pinned.messageId,
    pinnedBy: payload.pinned.pinnedBy,
    message: payload.pinned.message
      ? mapApiMessageToWebMessage(payload.pinned.message, currentUserId)
      : undefined,
  };
}

/** Pin / unpin — the backend enforces group admin/owner authority. */
export async function pinChatMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  await fetchJson(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/pin`,
    { method: 'POST' },
  );
}

export async function unpinChatMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  await fetchJson(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/pin`,
    { method: 'DELETE' },
  );
}
