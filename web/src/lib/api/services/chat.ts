/**
 * Web chat service — mirrors frontend/src/services/chatApi.ts.
 * Conversations carry participantProfiles; messages carry structured
 * metadata (offers, listing shares, reactions). Never flatten to
 * `{ sender, text }`.
 */

import { ApiRequestError, fetchJson } from '../http';
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

/** The idempotency key a sent message round-trips — the backend echoes
 *  `clientMessageId` on both the HTTP response and the
 *  `chat.message.created` realtime payload, so the optimistic bubble can
 *  be reconciled by identity, not by text heuristics. Non-contract field,
 *  same grammar as `savedBy`. */
export type MessageWithClientId = Message & { clientMessageId?: string };

/** Read the clientMessageId a message payload carried (absent for
 *  fixture rows and payloads that predate the field). */
export function messageClientMessageId(m: Message | null | undefined): string | undefined {
  return (m as MessageWithClientId | null | undefined)?.clientMessageId;
}

/** Generate the per-send idempotency key — the backend dedupes on
 *  (conversation_id, sender_user_id, client_message_id), so a retry of
 *  the same send returns the original row instead of a duplicate. */
export function newClientMessageId(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `cmid-${uuid}`;
}

function attachSaveState(message: Message, raw: ApiMessagePayload): Message {
  const full = raw as ApiMessagePayload & {
    savedBy?: string[];
    savedAt?: string | null;
    clientMessageId?: string | null;
  };
  if (typeof full.clientMessageId === 'string' && full.clientMessageId) {
    (message as MessageWithClientId).clientMessageId = full.clientMessageId;
  }
  if (!Array.isArray(full.savedBy) || full.savedBy.length === 0) return message;
  const target = message as MessageWithSaveState;
  target.savedBy = full.savedBy;
  if (typeof full.savedAt === 'string') target.savedAt = full.savedAt;
  return message;
}

/**
 * `chat.message.created` SSE payload → web `Message`. The realtime payload
 * is the same serializer output the messages route returns (plus
 * clientMessageId / savedBy which ride along here too), so the REST mapper
 * applies verbatim — metadata.mediaUri carries the media/document/voice
 * URI exactly as the REST path maps it.
 */
export function realtimePayloadToWebMessage(
  payload: Record<string, unknown>,
  currentUserId?: string,
): Message | null {
  if (typeof payload.id !== 'string' || !payload.id) return null;
  const mapped = mapApiMessageToWebMessage(
    payload as unknown as ApiMessagePayload,
    currentUserId,
  );
  return attachSaveState(mapped, payload as unknown as ApiMessagePayload);
}

export async function fetchConversationMessages(
  id: string,
  currentUserId?: string,
  signal?: AbortSignal,
): Promise<Message[]> {
  const page = await fetchConversationMessagesPage(id, currentUserId, undefined, signal);
  return page.messages;
}

/** POST /chat/dm — native grammar: { recipientUserId, itemId? }. The
 *  response is a conversation summary (id/type/participants), so the full
 *  payload is refetched for the mapped Conversation. `itemId` binds the
 *  marketplace context — without it the thread can never show the
 *  listing bar. */
export async function createDmConversation(
  participantId: string,
  options?: { itemId?: string },
  currentUserId?: string,
): Promise<Conversation> {
  const payload = await fetchJson<{
    ok: boolean;
    conversation?: { id: string };
  }>('/chat/dm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientUserId: participantId,
      ...(options?.itemId ? { itemId: options.itemId } : {}),
    }),
  });
  if (!payload.ok || !payload.conversation?.id) {
    throw new Error('Failed to create conversation');
  }
  const full = await fetchConversation(payload.conversation.id, currentUserId);
  if (!full) throw new Error('Failed to load conversation');
  return full;
}

export async function createGroupConversation(
  input: {
    title: string;
    participantIds: string[];
    description?: string;
    itemId?: string;
  },
  currentUserId?: string,
): Promise<Conversation> {
  const payload = await fetchJson<{
    ok: boolean;
    conversation?: { id: string };
  }>('/chat/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      memberIds: input.participantIds,
      description: input.description,
      ...(input.itemId ? { itemId: input.itemId } : {}),
    }),
  });
  if (!payload.ok || !payload.conversation?.id) {
    throw new Error('Failed to create group');
  }
  const full = await fetchConversation(payload.conversation.id, currentUserId);
  if (!full) throw new Error('Failed to load group');
  return full;
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
  /** Idempotent-send key — generated per send when absent; retries of the
   *  same send MUST reuse it (the backend returns the original row on a
   *  (conversation, sender, clientMessageId) conflict). Echoed back on the
   *  `chat.message.created` realtime event for optimistic dedupe. */
  clientMessageId?: string;
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
  // Every send carries an idempotency key — a retried write (or the SSE
  // echo racing the HTTP response) resolves to the same server row.
  body.clientMessageId = input.clientMessageId ?? newClientMessageId();
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
  return attachSaveState(
    mapApiMessageToWebMessage(payload.message, currentUserId),
    payload.message,
  );
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await fetchJson(`/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
  });
}

// ── Typing + dyad presence ────────────────────────────────────────────────
// Both mirror the mobile chatApi edges (setTypingStatus /
// fetchConversationPresenceFromApi). Typing is ephemeral realtime-only —
// the backend fans `chat.typing.update` onto the conversation topic and
// keeps no REST state, so there is nothing to map.

/** POST /chat/conversations/:id/typing — publish the composer's typing
 *  state to other participants. Fire-and-forget for callers; failures are
 *  the caller's to swallow (an indicator is never worth a toast). */
export async function setTypingStatus(
  conversationId: string,
  isTyping: boolean,
): Promise<void> {
  await fetchJson<{ ok: boolean }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/typing`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTyping }),
    },
  );
}

/** Dyad presence snapshot — GET /chat/conversations/:id/presence. The
 *  backend returns `presence: null` for groups and for peers whose
 *  activity-status privacy setting hides them; callers render nothing in
 *  that case rather than fabricating a status. */
export interface ConversationPresence {
  userId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export async function fetchConversationPresence(
  conversationId: string,
  signal?: AbortSignal,
): Promise<ConversationPresence | null> {
  const payload = await fetchJson<{
    ok: boolean;
    presence?: ConversationPresence | null;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/presence`,
    undefined,
    { signal },
  );
  return payload.presence ?? null;
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
  return attachSaveState(
    mapApiMessageToWebMessage(payload.message, currentUserId),
    payload.message,
  );
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

/** Poll vote tallies — the vote endpoints return the authoritative
 *  post-change counts plus the caller's own selections, so a voter can
 *  converge without waiting for the broadcast (which strips voter
 *  identity for anonymous polls). */
export interface PollVoteResult {
  voteCounts: number[];
  myVotes: number[];
}

/** Vote on a poll option — POST .../poll/vote. For single-choice polls
 *  the server replaces the voter's whole selection; for multi-choice it
 *  adds. Server-side: closed polls and bad option indexes 400. */
export async function voteOnPoll(
  conversationId: string,
  messageId: string,
  optionIndex: number,
): Promise<PollVoteResult> {
  const payload = await fetchJson<{
    ok: boolean;
    voteCounts?: number[];
    myVotes?: number[];
    error?: string;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/poll/vote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionIndex }),
    },
  );
  if (!payload.ok) throw new Error(payload.error || 'Vote failed');
  return { voteCounts: payload.voteCounts ?? [], myVotes: payload.myVotes ?? [] };
}

/** Retract one of the caller's votes — POST .../poll/unvote. */
export async function unvoteOnPoll(
  conversationId: string,
  messageId: string,
  optionIndex: number,
): Promise<PollVoteResult> {
  const payload = await fetchJson<{
    ok: boolean;
    voteCounts?: number[];
    myVotes?: number[];
    error?: string;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/poll/unvote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionIndex }),
    },
  );
  if (!payload.ok) throw new Error(payload.error || 'Vote failed');
  return { voteCounts: payload.voteCounts ?? [], myVotes: payload.myVotes ?? [] };
}

/**
 * Voice playback — voice media sits in a private bucket; the wire's
 * mediaUri is an identifier, not a playable URL. Playback goes through
 * the membership-bound signed grant (TTL'd, revocable — matches
 * mobile useVoicePlayer). The caller caches it until `expiresAt`.
 */
export async function fetchVoicePlaybackUrl(
  conversationId: string,
  messageId: string,
): Promise<{ playbackUrl: string; expiresAt: string }> {
  const payload = await fetchJson<{
    ok: boolean;
    playbackUrl?: string;
    expiresAt?: string;
    error?: string;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice/playback-url`,
    { method: 'POST' },
  );
  if (!payload.ok || typeof payload.playbackUrl !== 'string') {
    throw new Error(payload.error || 'Voice playback unavailable');
  }
  return { playbackUrl: payload.playbackUrl, expiresAt: payload.expiresAt ?? '' };
}

export type VoiceTranscriptionState =
  | 'queued'
  | 'processing'
  | 'complete'
  | 'failed_retryable'
  | 'failed_final'
  | 'unsupported';

export interface VoiceTranscriptionReceipt {
  id: string;
  state: VoiceTranscriptionState;
  text: string | null;
  language: string | null;
  rating: 'good' | 'bad' | null;
  failureReason: string | null;
}

function mapTranscription(t: {
  id: string;
  state: string;
  text?: string | null;
  language?: string | null;
  rating?: string | null;
  failureReason?: string | null;
}): VoiceTranscriptionReceipt {
  return {
    id: t.id,
    state: t.state as VoiceTranscriptionState,
    text: t.text ?? null,
    language: t.language ?? null,
    rating: t.rating === 'good' || t.rating === 'bad' ? t.rating : null,
    failureReason: t.failureReason ?? null,
  };
}

/** Read the caller's transcription state — 404 means never requested
 *  (returns null so the caller offers the opt-in). */
export async function fetchVoiceTranscription(
  conversationId: string,
  messageId: string,
  signal?: AbortSignal,
): Promise<VoiceTranscriptionReceipt | null> {
  try {
    const payload = await fetchJson<{
      ok: boolean;
      transcription?: Parameters<typeof mapTranscription>[0];
    }>(
      `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice/transcription`,
      undefined,
      { signal, maxRetries: 0 },
    );
    if (!payload.ok || !payload.transcription) throw new Error('Could not load transcript');
    return mapTranscription(payload.transcription);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return null;
    throw err;
  }
}

/** Opt-in transcription request — idempotent on
 *  (voice_message_id, requested_by); replays return the existing row's
 *  state instead of queueing a second job. */
export async function requestVoiceTranscription(
  conversationId: string,
  messageId: string,
  language?: string,
): Promise<VoiceTranscriptionReceipt> {
  const payload = await fetchJson<{
    ok: boolean;
    transcription?: Parameters<typeof mapTranscription>[0];
    error?: string;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice/transcribe`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(language ? { language } : {}),
    },
  );
  if (!payload.ok || !payload.transcription) {
    throw new Error(payload.error || 'Could not request transcription');
  }
  return mapTranscription(payload.transcription);
}

/** Rate a completed transcription — the binary quality signal, never
 *  shown to the sender. */
export async function rateVoiceTranscription(
  conversationId: string,
  messageId: string,
  rating: 'good' | 'bad',
): Promise<void> {
  const payload = await fetchJson<{ ok: boolean; error?: string }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice/transcription/rating`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    },
  );
  if (!payload.ok) throw new Error(payload.error || 'Rating failed');
}

export interface TranslationResult {
  translatedText: string;
  /** ISO 639-1 code of the detected source language. */
  sourceLanguage: string;
  targetLanguage: string;
  model?: string;
  /** Server-side PII-masked cache hit — no LLM call was billed. */
  cached?: boolean;
}

/** POST /chat/translate — the AI translation edge (WhatsApp/Instagram
 *  inline-translate parity). 429 rate-limit and 503 unconfigured
 *  responses throw with the server's message. */
export async function translateChatMessage(
  messageId: string,
  text: string,
  targetLocale: string,
): Promise<TranslationResult> {
  const payload = await fetchJson<{
    ok: boolean;
    translatedText?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    model?: string;
    cached?: boolean;
    message?: string;
  }>('/chat/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, text, targetLocale }),
  });
  if (!payload.ok || typeof payload.translatedText !== 'string') {
    throw new Error(payload.message || 'Translation failed');
  }
  return {
    translatedText: payload.translatedText,
    sourceLanguage: payload.sourceLanguage ?? '',
    targetLanguage: payload.targetLanguage ?? targetLocale,
    model: payload.model,
    cached: payload.cached,
  };
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

// ── Quick replies — GET/POST/PUT/DELETE /chat/quick-replies ─────────────────
// The mobile chatApi quick-reply edges, verbatim: per-user canned replies
// scoped by role (buyer/seller), title ≤ 40 chars, body ≤ 200 — the backend
// enforces the caps; the client never pads or truncates silently.

export interface ApiQuickReply {
  id: string;
  role: 'buyer' | 'seller';
  title: string;
  body: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchQuickReplies(
  role?: 'buyer' | 'seller',
  signal?: AbortSignal,
): Promise<ApiQuickReply[]> {
  const payload = await fetchJson<{ ok: boolean; items: ApiQuickReply[] }>(
    `/chat/quick-replies${role ? `?role=${role}` : ''}`,
    undefined,
    { signal },
  );
  return payload.items ?? [];
}

export async function createQuickReply(input: {
  role: 'buyer' | 'seller';
  title: string;
  body: string;
  sortOrder?: number;
}): Promise<ApiQuickReply> {
  const payload = await fetchJson<{ ok: boolean; quickReply: ApiQuickReply }>(
    '/chat/quick-replies',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return payload.quickReply;
}

export async function updateQuickReply(
  replyId: string,
  updates: { title?: string; body?: string; sortOrder?: number },
): Promise<void> {
  await fetchJson<{ ok: boolean }>(
    `/chat/quick-replies/${encodeURIComponent(replyId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    },
  );
}

export async function deleteQuickReply(replyId: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(
    `/chat/quick-replies/${encodeURIComponent(replyId)}`,
    { method: 'DELETE' },
  );
}

// ── Group invite links — /chat/conversations/:id/invite-links + /chat/groups/join
// The mobile chatApi invite edges: create is gated by the `add_members`
// capability server-side (members can mint links when the group's
// addMembers scope is 'everyone'); list/revoke are owner/admin-only
// (ensureGroupManagementAccess). The plaintext link is returned only at
// create time — list rows carry just the token preview.

export interface GroupInviteLink {
  id: string;
  /** The full `thryftverse://group-invite?token=…` link — present only on
   *  the create response. */
  inviteLink?: string;
  tokenPreview?: string;
  createdBy?: string;
  ownerId?: string;
  expiresAt?: string;
  maxUses?: number;
  useCount?: number;
  remainingUses?: number | null;
  revokedAt?: string | null;
  createdAt?: string;
  lastUsedAt?: string | null;
  lastUsedBy?: string | null;
  isExpired?: boolean;
  isRevoked?: boolean;
}

/** POST /chat/conversations/:id/invite-links — mirrors mobile
 *  createGroupInviteLinkOnApi. Only the create response carries the full
 *  link; treat it as a one-time reveal. */
export async function createGroupInviteLink(
  conversationId: string,
  input?: { expiresInHours?: number; maxUses?: number },
): Promise<GroupInviteLink> {
  const payload = await fetchJson<{
    ok: boolean;
    invite?: GroupInviteLink;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/invite-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(input?.expiresInHours ? { expiresInHours: input.expiresInHours } : {}),
      ...(input?.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
    }),
  });
  if (!payload.ok || !payload.invite?.id) {
    throw new Error('Failed to create invite link');
  }
  return payload.invite;
}

/** GET /chat/conversations/:id/invite-links — owner/admin only. Active
 *  links by default; `includeRevoked` for the audit view. The list rows
 *  carry previews, never the full token. */
export async function fetchGroupInviteLinks(
  conversationId: string,
  options?: { includeRevoked?: boolean; limit?: number },
  signal?: AbortSignal,
): Promise<GroupInviteLink[]> {
  const params = new URLSearchParams();
  if (options?.includeRevoked) params.set('includeRevoked', 'true');
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const payload = await fetchJson<{
    ok: boolean;
    items?: GroupInviteLink[];
    /** Older/native read path names the list `links`. */
    links?: GroupInviteLink[];
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/invite-links${qs ? `?${qs}` : ''}`,
    undefined,
    { signal },
  );
  return payload.items ?? payload.links ?? [];
}

/** DELETE /chat/conversations/:id/invite-links/:inviteId — owner/admin. */
export async function revokeGroupInviteLink(
  conversationId: string,
  inviteId: string,
): Promise<void> {
  const payload = await fetchJson<{ ok: boolean; revoked?: boolean }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/invite-links/${encodeURIComponent(inviteId)}`,
    { method: 'DELETE' },
  );
  if (!payload.ok) throw new Error('Failed to revoke invite link');
}

/**
 * POST /chat/groups/join — the invite-token landing call (mobile
 * joinGroupByInviteOnApi). `joined:false` means the caller was already a
 * member. The returned conversation is a summary payload — refetch the
 * full thread before navigating into it.
 */
export async function joinGroupByInvite(
  inviteToken: string,
  currentUserId?: string,
): Promise<{ joined: boolean; conversation: Conversation | null }> {
  const payload = await fetchJson<{
    ok: boolean;
    joined?: boolean;
    conversation?: ApiConversationPayload;
  }>('/chat/groups/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteToken: inviteToken.trim() }),
  });
  if (!payload.ok) throw new Error('Failed to join group');
  return {
    joined: payload.joined === true,
    conversation: payload.conversation
      ? mapApiConversationToWeb(payload.conversation, currentUserId)
      : null,
  };
}
