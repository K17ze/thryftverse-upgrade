import type { ChatAgentConfig, ChatBot, Conversation, Message } from '../domain';
import { parseMessageCommerceState } from '../domain';
import type { ConversationContext } from '../domain/conversationContext';
import { fetchJson } from '../lib/apiClient';
import { parseServerDate } from '../utils/dateFormat';

type ApiConversationType = 'dm' | 'group';
type ApiSenderType = 'user' | 'bot' | 'system';

interface ApiConversationPayload {
  id: string;
  type: ApiConversationType;
  title: string | null;
  ownerId: string | null;
  itemId: string | null;
  description?: string | null;
  avatar?: string | null;
  coverPhoto?: string | null;
  participantIds: string[];
  participantProfiles?: Array<{
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    emailVerified: boolean;
    identityVerified?: boolean;
  }>;
  botIds: string[];
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  memberRoles?: Record<string, string>;
  isMuted?: boolean;
  /** Moderation ladder state vs the DM counterparty — viewer-scoped. */
  isBlocked?: boolean;
  isRestricted?: boolean;
  isAuthorMuted?: boolean;
  isAuthorRestricted?: boolean;
  isArchived?: boolean;
  requestStatus?: 'pending' | 'accepted' | 'declined';
  pinnedRank?: number;
  markedUnread?: boolean;
  /** Server-derived count of messages after the viewer's last_read_at. */
  unreadCount?: number;
  /** Server-derived transaction context (listing/offer/order/protection). */
  context?: ConversationContext | null;
}

interface ApiMessageReaction {
  emoji: string;
  userIds: string[];
}

export interface ApiMessagePayload {
  id: string;
  senderType: ApiSenderType;
  senderUserId: string | null;
  senderBotId: string | null;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  clientMessageId?: string;
  replyToMessageId?: string;
  deletedForEveryoneAt?: string;
  editVersion?: number;
  editedAt?: string;
  reactions?: ApiMessageReaction[];
  readBy?: string[];
  isReadByMe?: boolean;
  /** Save-in-chat shared state — user IDs that currently have the
   *  message saved; present only when non-empty. */
  savedBy?: string[];
  /** ISO timestamp of the first save. */
  savedAt?: string | null;
}

// Voice message receipt — the canonical voice metadata returned by the
// backend serializer (joined from voice_messages). The client renders a
// real waveform from `waveform.samples` or an honest progress line when
// `waveform` is null (never fake bars).
export interface VoiceMessageReceipt {
  id: string;
  durationMs: number;
  bytes: number;
  container: 'm4a' | 'ogg' | 'webm' | 'mp4';
  codec: 'aac' | 'opus' | 'mp3';
  waveform: {
    samples: number[];
    sampleCount: number;
    algorithmVersion: number;
  } | null;
  moderationState: 'pending' | 'allowed' | 'limited' | 'blocked';
}

export interface VoiceTranscriptionReceipt {
  id: string;
  state: 'queued' | 'processing' | 'complete' | 'failed_retryable' | 'failed_final' | 'unsupported';
  text: string | null;
  language: string | null;
  rating: 'good' | 'bad' | null;
  failureReason: string | null;
  derived: true;
}

interface ApiBotPayload {
  id: string;
  slug: string;
  name: string;
  description: string;
  commandHint: string;
  category: 'moderation' | 'commerce' | 'automation' | 'assistant' | 'safety' | 'styling';
  type?: 'system' | 'custom';
  status?: 'available' | 'local-only' | 'backend-required';
  runtimeMode?: string;
  isDraft?: boolean;
  permissions?: string[];
  icon?: string | null;
  ownerId?: string | null;
  installedAt?: string;
  installStatus?: string;
  agentConfig?: ChatAgentConfig | null;
  runtimeReady?: boolean;
  runtimeReadinessReason?: string | null;
}

interface ApiGroupInvitePayload {
  id: string;
  inviteLink: string;
  tokenPreview: string;
  createdBy: string;
  ownerId: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
}

export interface GroupInviteLink {
  id: string;
  inviteLink: string;
  tokenPreview: string;
  createdBy: string;
  ownerId: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  isExpired?: boolean;
  isRevoked?: boolean;
}

export type GroupPermissionScope = 'admins' | 'everyone';

export interface GroupSettings {
  editGroupInfo: GroupPermissionScope;
  sendMessages: GroupPermissionScope;
  addMembers: GroupPermissionScope;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface GroupSettingsCapabilities {
  canManage: boolean;
  canEditGroupInfo: boolean;
  canAddMembers: boolean;
  canSendMessages: boolean;
}

function normalizeMemberRoles(
  raw?: Record<string, string>
): Record<string, 'owner' | 'admin' | 'member'> | undefined {
  if (!raw) return undefined;
  const result: Record<string, 'owner' | 'admin' | 'member'> = {};
  for (const [userId, role] of Object.entries(raw)) {
    if (role === 'owner' || role === 'admin' || role === 'member') {
      result[userId] = role;
    } else {
      result[userId] = 'member';
    }
  }
  return result;
}

export function mapApiMessageToConversationMessage(
  payload: ApiMessagePayload,
  currentUserId?: string,
): Message {
  const senderId = payload.senderType === 'bot'
    ? payload.senderBotId ?? 'system'
    : payload.senderType === 'user'
      ? payload.senderUserId ?? 'system'
      : 'system';

  const meta = payload.metadata || {};

  // Voice messages (report 19): the backend returns a `voice` object with
  // canonical duration/waveform/container/codec. The mediaUri lives in
  // metadata for backwards compatibility, but the voice row is the truth.
  const voice = (payload as ApiMessagePayload & { voice?: VoiceMessageReceipt }).voice;
  const isVoice = Boolean(voice) || meta.voiceMessage === true || meta.mediaType === 'voice';

  // Offer messages (P1-05): the backend attaches an `offer` object or
  // stashes the offer payload under `metadata.offerPayload`.
  const offerSource =
    (payload as ApiMessagePayload & { offer?: Record<string, unknown> }).offer ??
    (meta.offerPayload as Record<string, unknown> | undefined);
  const isOffer = Boolean(
    (payload as ApiMessagePayload & { offer?: unknown }).offer || meta.offerPayload,
  );

  // Listing-share messages ride in metadata — `listingShare` carries the
  // display snapshot so the card renders without a second fetch.
  const listingShare = meta.listingShare as Record<string, unknown> | undefined;
  const isListingShare = Boolean(listingShare && typeof listingShare.listingId === 'string');

  // Document messages: the backend stamps mediaType 'document' and carries
  // documentUri/documentName/documentMimeType in metadata. They render a
  // document row, not an image bubble — keep them out of the media path.
  const isDocument = meta.mediaType === 'document';

  // In-thread commerce cards (marketplace audit P1): system-authored order
  // lifecycle messages carry the order snapshot in `metadata.commerceState`.
  // The parsed snapshot drives `type: 'commerce_state'` below so
  // ChatCommerceCard renders the rich order card instead of a system row.
  const commerceState = parseMessageCommerceState(meta);

  // Determine which side of the chat this message renders on. When the
  // current user's id is known and matches the message's senderId, the
  // message is "me"; otherwise it is "other" (or "system" for system msgs).
  const isMine = Boolean(currentUserId) && senderId === currentUserId;

  return {
    id: payload.id,
    senderId,
    text: payload.body,
    timestamp: payload.createdAt,
    date: payload.createdAt,
    isSystem: payload.senderType === 'system',
    systemTitle: payload.senderType === 'system' ? 'System' : undefined,
    type: commerceState
      ? 'commerce_state'
      : payload.senderType === 'system'
      ? 'system'
      : isOffer
        ? 'offer'
        : isListingShare
          ? 'listing_share'
          : isVoice
            ? 'voice'
            : isDocument
              ? 'document'
              : 'text',
    sender: payload.senderType === 'system'
      ? 'system'
      : isMine
        ? 'me'
        : 'other',
    status: 'sent',
    isEdited: Boolean(payload.editedAt) || (payload.editVersion ?? 0) > 0,
    isDeleted: Boolean(payload.deletedForEveryoneAt),
    clientMessageId: payload.clientMessageId ?? undefined,
    editVersion: payload.editVersion ?? undefined,
    editedAt: payload.editedAt ?? undefined,
    deletedForEveryoneAt: payload.deletedForEveryoneAt ?? undefined,
    // Read receipts: the API returns the durable per-message readBy set. For
    // the sender's own messages, "read" is truthful only when another
    // participant appears in it — the backend never reports a distinct
    // "delivered" receipt, so we claim sent until proven read.
    readBy: payload.readBy ?? undefined,
    isReadByMe: payload.isReadByMe ?? undefined,
    // Save-in-chat shared state — "Saved" marker is identical for both
    // participants; savedBy preserves attribution for either-party save.
    isSavedInChat: (payload.savedBy?.length ?? 0) > 0,
    savedBy: payload.savedBy?.length ? payload.savedBy : undefined,
    savedAt: payload.savedAt ?? undefined,
    readStatus:
      isMine && (payload.readBy ?? []).some((uid) => uid !== currentUserId)
        ? 'read'
        : 'sent',
    mediaUri: typeof meta.mediaUri === 'string' && !isDocument ? meta.mediaUri : undefined,
    mediaType: meta.mediaType === 'image' || meta.mediaType === 'video' ? meta.mediaType : undefined,
    documentUri: isDocument
      ? (typeof meta.documentUri === 'string' ? meta.documentUri : typeof meta.mediaUri === 'string' ? meta.mediaUri : undefined)
      : undefined,
    documentName: isDocument && typeof meta.documentName === 'string' ? meta.documentName : undefined,
    documentMimeType: isDocument && typeof meta.documentMimeType === 'string' ? meta.documentMimeType : undefined,
    posterUri: typeof meta.posterUri === 'string' ? meta.posterUri : undefined,
    voiceUri: typeof meta.mediaUri === 'string' && isVoice ? meta.mediaUri : undefined,
    voiceDurationMs: voice?.durationMs ?? (typeof meta.durationMs === 'number' ? meta.durationMs : undefined),
    voiceWaveform: voice?.waveform?.samples,
    voiceContainer: voice?.container,
    voiceCodec: voice?.codec,
    voiceModerationState: voice?.moderationState,
    offer: isOffer && offerSource
      ? {
          offerId: typeof offerSource.offerId === 'string' ? offerSource.offerId : undefined,
          amount: typeof offerSource.amount === 'number' ? offerSource.amount : undefined,
          status: (offerSource.status as 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled' | undefined),
          buyerId: typeof offerSource.buyerId === 'string' ? offerSource.buyerId : undefined,
          sellerId: typeof offerSource.sellerId === 'string' ? offerSource.sellerId : undefined,
          listingId: typeof offerSource.listingId === 'string' ? offerSource.listingId : undefined,
          listingTitle: typeof offerSource.listingTitle === 'string' ? offerSource.listingTitle : undefined,
          originalPrice: typeof offerSource.originalPrice === 'number' ? offerSource.originalPrice : undefined,
          offerPrice: typeof offerSource.offerPrice === 'number' ? offerSource.offerPrice : undefined,
          price: typeof offerSource.offerPrice === 'number' ? offerSource.offerPrice : undefined,
          // Normalize Postgres `::text` timestamps at the boundary — raw
          // '2026-07-28 12:34:56.789+00' parses to NaN on Hermes, which
          // would keep expired offers' Accept buttons live.
          expiresAt: typeof offerSource.expiresAt === 'string'
            ? (parseServerDate(offerSource.expiresAt)?.toISOString() ?? undefined)
            : undefined,
          counterRound: typeof offerSource.counterRound === 'number' ? offerSource.counterRound : undefined,
          offeredByUserId: typeof offerSource.offeredByUserId === 'string' ? offerSource.offeredByUserId : undefined,
        }
      : undefined,
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
    replyToMessageId: payload.replyToMessageId,
    reactions: payload.reactions?.map((r) => ({ emoji: r.emoji, userIds: r.userIds })),
    commerceState,
  };
}

function mapApiConversationToApp(
  payload: ApiConversationPayload,
  messages: Message[] = []
): Conversation {
  const latestMessage = payload.lastMessage || messages[messages.length - 1]?.text || 'No messages yet';
  const latestMessageTime = payload.lastMessageTime || messages[messages.length - 1]?.timestamp || 'just now';
  // No synthetic placeholder: an empty messages array is the honest state —
  // the thread fetches real history on open. A fabricated `sync_` row would
  // render a system message that never existed server-side.
  const resolvedMessages: Message[] = messages;

  return {
    id: payload.id,
    type: payload.type,
    title: payload.title ?? undefined,
    ownerId: payload.ownerId ?? undefined,
    itemId: payload.itemId ?? undefined,
    description: payload.description ?? undefined,
    avatar: payload.avatar ?? undefined,
    coverPhoto: payload.coverPhoto ?? undefined,
    participantIds: payload.participantIds,
    participantProfiles: payload.participantProfiles,
    botIds: payload.botIds,
    lastMessage: latestMessage,
    lastMessageTime: latestMessageTime,
    // A user-marked-unread conversation is unread regardless of server
    // last_read_at — the mark is the user's explicit intent. Prefer the
    // authoritative unreadCount: the server's `unread` boolean returns
    // false for never-read conversations (NULL last_read_at), while the
    // count correctly treats NULL as "everything is unread".
    unread: (payload.unreadCount ?? 0) > 0 || payload.unread || (payload.markedUnread ?? false),
    unreadCount: payload.unreadCount ?? 0,
    messages: resolvedMessages,
    memberRoles: normalizeMemberRoles(payload.memberRoles),
    isMuted: payload.isMuted ?? false,
    isBlocked: payload.isBlocked ?? false,
    isRestricted: payload.isRestricted ?? payload.isAuthorRestricted ?? false,
    isAuthorMuted: payload.isAuthorMuted ?? false,
    isAuthorRestricted: payload.isAuthorRestricted ?? false,
    isArchived: payload.isArchived ?? false,
    requestStatus: payload.requestStatus ?? 'accepted',
    isPinned: (payload.pinnedRank ?? 0) > 0,
    markedUnread: payload.markedUnread ?? false,
    context: payload.context ?? undefined,
  };
}

export async function createDmConversationOnApi(input: {
  recipientUserId: string;
  itemId?: string;
}): Promise<Conversation> {
  const payload = await fetchJson<{
    ok: true;
    conversation: ApiConversationPayload;
  }>('/chat/dm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientUserId: input.recipientUserId,
      itemId: input.itemId,
    }),
  });

  return mapApiConversationToApp(payload.conversation, []);
}

export async function createGroupConversationOnApi(input: {
  title: string;
  memberIds: string[];
  itemId?: string;
  idempotencyKey?: string;
  description?: string;
  avatar?: string;
  avatarFinalizationId?: string;
  coverPhoto?: string;
  coverPhotoFinalizationId?: string;
  currentUserId?: string;
}): Promise<Conversation> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (input.idempotencyKey) {
    headers['X-Idempotency-Key'] = input.idempotencyKey;
  }
  const payload = await fetchJson<{
    ok: true;
    conversation: ApiConversationPayload;
    initialMessage: ApiMessagePayload | null;
  }>('/chat/groups', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: input.title.trim(),
      memberIds: input.memberIds,
      itemId: input.itemId,
      description: input.description,
      avatar: input.avatar,
      avatarFinalizationId: input.avatarFinalizationId,
      coverPhoto: input.coverPhoto,
      coverPhotoFinalizationId: input.coverPhotoFinalizationId,
    }),
  });

  const messages = payload.initialMessage
    ? [mapApiMessageToConversationMessage(payload.initialMessage, input.currentUserId)]
    : [];

  return mapApiConversationToApp(payload.conversation, messages);
}

export async function fetchConversationsFromApi(): Promise<Conversation[]> {
  const payload = await fetchJson<{
    ok: true;
    items: ApiConversationPayload[];
  }>('/chat/conversations');

  return payload.items.map((item) => mapApiConversationToApp(item, []));
}

/** Dyad presence snapshot for the DM counterparty. `null` means presence
 *  is unavailable or the peer has hidden their activity status — callers
 *  must render no presence UI in that case. */
export interface PeerPresenceSnapshot {
  userId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export async function fetchConversationPresenceFromApi(
  conversationId: string,
): Promise<PeerPresenceSnapshot | null> {
  const payload = await fetchJson<{
    ok: true;
    presence: PeerPresenceSnapshot | null;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/presence`);

  return payload.presence ?? null;
}

export async function fetchConversationMessagesFromApi(
  conversationId: string,
  options?: {
    limit?: number;
    before?: string;
    after?: string;
    aroundMessageId?: string;
  }
): Promise<{ messages: ApiMessagePayload[]; oldestCursor?: string; newestCursor?: string; hasMore?: boolean }> {
  const limit = options?.limit ?? 120;
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (options?.before) params.set('before', options.before);
  if (options?.after) params.set('after', options.after);
  if (options?.aroundMessageId) params.set('aroundMessageId', options.aroundMessageId);

  const payload = await fetchJson<{
    ok: true;
    items: ApiMessagePayload[];
    oldestCursor?: string | null;
    newestCursor?: string | null;
    hasMore?: boolean | null;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`);

  return {
    messages: payload.items,
    oldestCursor: payload.oldestCursor ?? undefined,
    newestCursor: payload.newestCursor ?? undefined,
    hasMore: payload.hasMore ?? undefined,
  };
}

export async function sendConversationMessageOnApi(
  conversationId: string,
  text: string,
  metadata?: Record<string, unknown>,
  clientMessageId?: string,
  options?: {
    type?: 'text' | 'image' | 'video' | 'voice' | 'document';
    mediaUri?: string;
    replyToMessageId?: string;
    voiceDurationMs?: number;
    voiceWaveform?: number[];
    documentName?: string;
    documentMimeType?: string;
  },
  currentUserId?: string,
): Promise<Message> {
  // P0-MSG-1: Discriminated message payload. The backend accepts a
  // `type` field — 'text' (or absent) requires text; 'image'/'video'
  // require mediaUri and make text optional. 'voice' (report 19) requires
  // mediaUri plus voice metadata (durationMs, container, codec) and is
  // only sent after the audio asset is finalized. We only forward fields
  // that are present so text-only callers stay backwards compatible.
  const body: Record<string, unknown> = {};
  if (options?.type) {
    body.type = options.type;
  }
  if (text) {
    body.text = text;
  }
  if (options?.mediaUri) {
    body.mediaUri = options.mediaUri;
  }
  if (metadata !== undefined) {
    body.metadata = metadata;
  }
  if (clientMessageId) {
    body.clientMessageId = clientMessageId;
  }
  if (options?.replyToMessageId) {
    body.replyToMessageId = options.replyToMessageId;
  }
  if (options?.voiceDurationMs !== undefined) {
    body.voiceDurationMs = options.voiceDurationMs;
  }
  if (options?.voiceWaveform !== undefined) {
    body.voiceWaveform = options.voiceWaveform;
  }
  // Document display metadata — the backend reads documentName /
  // documentMimeType from `metadata` when type === 'document'.
  if (options?.type === 'document') {
    body.metadata = {
      ...(body.metadata as Record<string, unknown> | undefined),
      ...(options.documentName ? { documentName: options.documentName } : {}),
      ...(options.documentMimeType ? { documentMimeType: options.documentMimeType } : {}),
    };
  }
  const payload = await fetchJson<{
    ok: true;
    message: ApiMessagePayload;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return mapApiMessageToConversationMessage(payload.message, currentUserId);
}

/**
 * Send a listing-share card into a conversation. The display snapshot rides
 * in `metadata.listingShare` (round-trips verbatim — no backend schema
 * change); `text` carries the title so push previews and legacy clients
 * still show something meaningful.
 */
export async function sendListingShareMessage(
  conversationId: string,
  listing: {
    id: string;
    title: string;
    price: number;
    originalPrice?: number | null;
    image?: string | null;
    brand?: string | null;
    size?: string | null;
    condition?: string | null;
    sellerId?: string | null;
    sellerUsername?: string | null;
    sellerRating?: number | null;
    isSold?: boolean;
  },
  currentUserId?: string,
): Promise<Message> {
  return sendConversationMessageOnApi(
    conversationId,
    `Shared a listing: ${listing.title}`,
    {
      listingShare: {
        listingId: listing.id,
        title: listing.title,
        price: listing.price,
        originalPrice: listing.originalPrice ?? undefined,
        image: listing.image ?? undefined,
        brand: listing.brand ?? undefined,
        size: listing.size ?? undefined,
        condition: listing.condition ?? undefined,
        sellerId: listing.sellerId ?? undefined,
        sellerUsername: listing.sellerUsername ?? undefined,
        sellerRating: listing.sellerRating ?? undefined,
        isSold: listing.isSold === true,
      },
    },
    undefined,
    undefined,
    currentUserId,
  );
}

/**
 * Edit a message the caller authored (P2-03). Sender-only, enforced
 * server-side within a 15-minute window of creation; deleted messages are
 * rejected with 403. Returns the updated, re-serialized message.
 */
export async function editConversationMessageOnApi(
  conversationId: string,
  messageId: string,
  text: string,
  currentUserId?: string,
): Promise<Message> {
  const payload = await fetchJson<{ ok: true; message: ApiMessagePayload }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    },
  );
  return mapApiMessageToConversationMessage(payload.message, currentUserId);
}

export async function deleteConversationMessageOnApi(
  conversationId: string,
  messageId: string,
  scope: 'me' | 'everyone' = 'me'
): Promise<{ ok: true; deleted: boolean; scope: 'me' | 'everyone' }> {
  return fetchJson<{ ok: true; deleted: boolean; scope: 'me' | 'everyone' }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}?scope=${scope}`,
    { method: 'DELETE' }
  );
}

export async function deleteConversationOnApi(
  conversationId: string,
  scope: 'me' | 'leave' = 'me'
): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}?scope=${scope}`,
    { method: 'DELETE' }
  );
}

export async function addMessageReactionOnApi(
  conversationId: string,
  messageId: string,
  emoji: string
): Promise<{ ok: true; reacted: boolean; emoji: string }> {
  return fetchJson<{ ok: true; reacted: boolean; emoji: string }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    }
  );
}

export async function removeMessageReactionOnApi(
  conversationId: string,
  messageId: string,
  emoji: string
): Promise<{ ok: true; removed: boolean; emoji: string }> {
  return fetchJson<{ ok: true; removed: boolean; emoji: string }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions?emoji=${encodeURIComponent(emoji)}`,
    { method: 'DELETE' }
  );
}

// ── Pinned messages ───────────────────────────────────────────────────

export interface PinnedMessageResponse {
  pinned: {
    messageId: string;
    pinnedBy: string;
    pinnedAt: string;
    message: Record<string, unknown>;
  } | null;
}

export async function pinMessageOnApi(
  conversationId: string,
  messageId: string,
): Promise<{ ok: true; pinned: true; messageId: string }> {
  return fetchJson<{ ok: true; pinned: true; messageId: string }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/pin`,
    { method: 'POST' },
  );
}

export async function unpinMessageOnApi(
  conversationId: string,
  messageId: string,
): Promise<{ ok: true; unpinned: true }> {
  return fetchJson<{ ok: true; unpinned: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/pin`,
    { method: 'DELETE' },
  );
}

export async function fetchPinnedMessageFromApi(
  conversationId: string,
): Promise<PinnedMessageResponse> {
  return fetchJson<PinnedMessageResponse>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/pinned-message`,
  );
}

// ── Save in chat (Snapchat-style negotiated persistence) ──────────────
// Either participant may save or unsave; the response carries the full
// post-change `savedBy` set so the client renders shared state identically
// on both sides.

export interface SaveInChatResponse {
  ok: true;
  /** True while at least one participant's save remains. */
  saved: boolean;
  messageId: string;
  savedBy: string[];
  savedAt?: string | null;
}

export async function saveMessageInChatOnApi(
  conversationId: string,
  messageId: string,
): Promise<SaveInChatResponse> {
  return fetchJson<SaveInChatResponse>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/save`,
    { method: 'POST' },
  );
}

export async function unsaveMessageInChatOnApi(
  conversationId: string,
  messageId: string,
): Promise<SaveInChatResponse> {
  return fetchJson<SaveInChatResponse>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/save`,
    { method: 'DELETE' },
  );
}

// ── In-chat message search ────────────────────────────────────────────

export interface ChatSearchResult {
  messageId: string;
  createdAt: string;
}

export interface ChatSearchResponse {
  query: string;
  results: ChatSearchResult[];
}

export async function searchConversationMessagesOnApi(
  conversationId: string,
  query: string,
): Promise<ChatSearchResponse> {
  const qs = `?q=${encodeURIComponent(query)}&limit=20`;
  return fetchJson<ChatSearchResponse>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/search${qs}`,
  );
}

// ── Polls ──────────────────────────────────────────────────────────────

export interface PollVoteResponse {
  ok: true;
  voteCounts: number[];
  myVotes: number[];
}

export async function voteInPollOnApi(
  conversationId: string,
  messageId: string,
  optionIndex: number,
): Promise<PollVoteResponse> {
  return fetchJson<PollVoteResponse>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/poll/vote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionIndex }),
    },
  );
}

export async function unvoteInPollOnApi(
  conversationId: string,
  messageId: string,
  optionIndex: number,
): Promise<{ ok: true }> {
  return fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/poll/unvote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionIndex }),
    },
  );
}

export async function reportConversationOnApi(
  conversationId: string,
  reason: string,
  details?: string,
  messageId?: string,
  idempotencyKey?: string,
  evidenceUris?: string[]
): Promise<{ ok: true; reportId: string; status: string }> {
  const body: Record<string, unknown> = { reason };
  if (details) body.details = details;
  if (messageId) body.messageId = messageId;
  if (idempotencyKey) body.idempotencyKey = idempotencyKey;
  if (evidenceUris?.length) body.evidence_uris = evidenceUris;
  return fetchJson<{ ok: true; reportId: string; status: string }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/report`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

export async function deployBotToConversationOnApi(conversationId: string, botId: string) {
  return fetchJson<{
    ok: true;
    conversationId: string;
    botId: string;
    installed: boolean;
    botIds: string[];
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/bots/${encodeURIComponent(botId)}/deploy`, {
    method: 'POST',
  });
}

export async function undeployBotFromConversationOnApi(conversationId: string, botId: string) {
  return fetchJson<{
    ok: true;
    conversationId: string;
    botId: string;
    removed: boolean;
    botIds: string[];
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/bots/${encodeURIComponent(botId)}`, {
    method: 'DELETE',
  });
}

export async function fetchChatBotsFromApi(): Promise<ChatBot[]> {
  const payload = await fetchJson<{
    ok: true;
    items: ApiBotPayload[];
  }>('/chat/bots');

  return payload.items.map((item) => ({
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    commandHint: item.commandHint,
    category: item.category,
    type: item.type ?? 'system',
    status: item.status ?? 'backend-required',
    runtimeMode: item.runtimeMode ?? 'backend',
    isDraft: item.isDraft ?? false,
    permissions: item.permissions ?? ['read_messages', 'send_messages'],
    icon: item.icon ?? undefined,
    ownerId: item.ownerId ?? undefined,
    agentConfig: item.agentConfig ?? undefined,
    runtimeReady: item.runtimeReady ?? item.runtimeMode !== 'ai',
    runtimeReadinessReason: item.runtimeReadinessReason ?? undefined,
  }));
}

export async function fetchConversationBotsFromApi(conversationId: string): Promise<ChatBot[]> {
  const payload = await fetchJson<{
    ok: true;
    items: ApiBotPayload[];
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/bots`);

  return payload.items.map((item) => ({
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    commandHint: item.commandHint,
    category: item.category,
    type: item.type ?? 'system',
    status: item.status ?? 'backend-required',
    runtimeMode: item.runtimeMode ?? 'backend',
    isDraft: item.isDraft ?? false,
    permissions: item.permissions ?? ['read_messages', 'send_messages'],
    icon: item.icon ?? undefined,
    ownerId: item.ownerId ?? undefined,
    agentConfig: item.agentConfig ?? undefined,
    runtimeReady: item.runtimeReady ?? item.runtimeMode !== 'ai',
    runtimeReadinessReason: item.runtimeReadinessReason ?? undefined,
  }));
}

export async function fetchConversationFromApi(conversationId: string): Promise<{
  id: string;
  type: 'dm' | 'group';
  title: string | null;
  ownerId: string;
  itemId: string | null;
  description: string | null;
  avatar: string | null;
  coverPhoto: string | null;
  metadata: Record<string, unknown>;
  participantIds: string[];
  memberRoles: Record<string, string>;
  botIds: string[];
  botInstalls: { botId: string; installedAt: string; status: string }[];
  createdAt: string;
  updatedAt: string;
}> {
  const payload = await fetchJson<{
    ok: true;
    conversation: {
      id: string;
      type: 'dm' | 'group';
      title: string | null;
      ownerId: string;
      itemId: string | null;
      description: string | null;
      avatar: string | null;
      coverPhoto: string | null;
      metadata: Record<string, unknown>;
      participantIds: string[];
      memberRoles: Record<string, string>;
      botIds: string[];
      botInstalls: { botId: string; installedAt: string; status: string }[];
      createdAt: string;
      updatedAt: string;
    };
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}`);

  return payload.conversation;
}

export async function updateConversationOnApi(
  conversationId: string,
  updates: {
    title?: string;
    description?: string;
    avatar?: string | null;
    avatarFinalizationId?: string;
    coverPhoto?: string | null;
    coverPhotoFinalizationId?: string;
  },
  idempotencyKey?: string,
): Promise<{
  id: string;
  type: 'group';
  title: string;
  ownerId: string;
  itemId: string | null;
  description: string | null;
  avatar: string | null;
  coverPhoto: string | null;
  updatedAt: string;
}> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  const payload = await fetchJson<{
    ok: true;
    conversation: {
      id: string;
      type: 'group';
      title: string;
      ownerId: string;
      itemId: string | null;
      description: string | null;
      avatar: string | null;
      coverPhoto: string | null;
      updatedAt: string;
    };
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });
  return payload.conversation;
}

export async function fetchConversationMembersFromApi(conversationId: string): Promise<
  { userId: string; role: string; joinedAt: string }[]
> {
  const payload = await fetchJson<{
    ok: true;
    items: { userId: string; role: string; joinedAt: string }[];
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/members`);

  return payload.items;
}

export async function updateConversationUserStateOnApi(
  conversationId: string,
  changes: { pinned?: boolean; markedUnread?: boolean },
): Promise<void> {
  await fetchJson(`/chat/conversations/${encodeURIComponent(conversationId)}/user-state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export async function createGroupInviteLinkOnApi(
  conversationId: string,
  input?: {
    expiresInHours?: number;
    maxUses?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<GroupInviteLink> {
  const payload = await fetchJson<{
    ok: true;
    conversationId: string;
    invite: ApiGroupInvitePayload;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/invite-links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expiresInHours: input?.expiresInHours,
      maxUses: input?.maxUses,
      metadata: input?.metadata,
    }),
  });

  return {
    id: payload.invite.id,
    inviteLink: payload.invite.inviteLink,
    tokenPreview: payload.invite.tokenPreview,
    createdBy: payload.invite.createdBy,
    ownerId: payload.invite.ownerId,
    expiresAt: payload.invite.expiresAt,
    maxUses: payload.invite.maxUses,
    useCount: payload.invite.useCount,
  };
}

export async function joinGroupByInviteOnApi(inviteToken: string): Promise<{
  joined: boolean;
  conversation: Conversation;
}> {
  const payload = await fetchJson<{
    ok: true;
    joined: boolean;
    conversation: ApiConversationPayload;
  }>('/chat/groups/join', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inviteToken: inviteToken.trim(),
    }),
  });

  return {
    joined: payload.joined,
    conversation: mapApiConversationToApp(payload.conversation, []),
  };
}

export async function fetchGroupInviteLinksOnApi(conversationId: string): Promise<GroupInviteLink[]> {
  try {
    const payload = await fetchJson<{
      ok: true;
      links: Array<GroupInviteLink & { isExpired?: boolean; isRevoked?: boolean }>;
    }>(`/chat/conversations/${encodeURIComponent(conversationId)}/invite-links`);
    return payload.links ?? [];
  } catch {
    return [];
  }
}

export async function revokeGroupInviteLinkOnApi(
  conversationId: string,
  inviteId: string,
): Promise<void> {
  await fetchJson(`/chat/conversations/${encodeURIComponent(conversationId)}/invite-links/${encodeURIComponent(inviteId)}`, {
    method: 'DELETE',
  });
}

export async function fetchGroupSettingsFromApi(conversationId: string): Promise<{
  settings: GroupSettings;
  capabilities: GroupSettingsCapabilities;
}> {
  // §37.5 fail-closed: governance scopes must render only from the server row.
  // No client-side fallback defaults — a failed fetch must throw so the
  // caller can render a skeleton or error state, never fabricated authority.
  const payload = await fetchJson<{
    ok: true;
    settings: GroupSettings;
    capabilities: GroupSettingsCapabilities;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/group-settings`);
  return {
    settings: payload.settings,
    capabilities: payload.capabilities,
  };
}

export async function updateGroupSettingsOnApi(
  conversationId: string,
  updates: Partial<Record<'editGroupInfo' | 'sendMessages' | 'addMembers', GroupPermissionScope>>,
): Promise<GroupSettings> {
  const payload = await fetchJson<{
    ok: true;
    settings: GroupSettings;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/group-settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return payload.settings;
}

export async function fetchConversationMediaFromApi(
  conversationId: string,
  options?: { limit?: number; before?: string },
): Promise<Array<{
  id: string;
  mediaUri: string;
  mediaType: 'image' | 'video' | 'document';
  posterUri?: string;
  senderUserId: string | null;
  createdAt: string;
  documentName?: string;
  documentMimeType?: string;
}>> {
  try {
    const query = options?.limit ? `?limit=${encodeURIComponent(options.limit)}` : '';
    const payload = await fetchJson<{
      ok: true;
      items: Array<{
        id: string;
        mediaUri: string;
        mediaType: 'image' | 'video' | 'document';
        posterUri?: string;
        senderUserId: string | null;
        createdAt: string;
        documentName?: string;
        documentMimeType?: string;
      }>;
    }>(`/chat/conversations/${encodeURIComponent(conversationId)}/media${query}`);
    return payload.items ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// P0-7: Cross-device chat composer state persistence.
// The composer draft, reply target and pending attachment references are
// persisted per (user, conversation) so a draft started on one device
// restores on another. Callers should debounce PUTs (1–2s) and call
// DELETE after a successful send.
// ---------------------------------------------------------------------------

export interface ComposerPendingAttachment {
  kind: 'image' | 'video' | 'file' | 'audio';
  objectKey: string;
  finalizationId: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface ChatComposerState {
  draftText: string;
  replyToMessageId: string | null;
  pendingAttachments: ComposerPendingAttachment[];
  activeBotId: string | null;
  linkedListingId: string | null;
  schemaVersion: number;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function fetchComposerStateFromApi(
  conversationId: string
): Promise<ChatComposerState> {
  const payload = await fetchJson<{ ok: true; state: ChatComposerState }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/composer-state`
  );
  return payload.state;
}

export async function upsertComposerStateOnApi(
  conversationId: string,
  state: {
    draftText: string;
    replyToMessageId?: string | null;
    pendingAttachments?: ComposerPendingAttachment[];
    activeBotId?: string | null;
    linkedListingId?: string | null;
    schemaVersion?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<ChatComposerState> {
  const payload = await fetchJson<{ ok: true; state: ChatComposerState }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/composer-state`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftText: state.draftText,
        replyToMessageId: state.replyToMessageId ?? null,
        pendingAttachments: state.pendingAttachments ?? [],
        activeBotId: state.activeBotId ?? null,
        linkedListingId: state.linkedListingId ?? null,
        schemaVersion: state.schemaVersion ?? 1,
        metadata: state.metadata ?? {},
      }),
    }
  );
  return payload.state;
}

export async function clearComposerStateOnApi(conversationId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/composer-state`,
    { method: 'DELETE' }
  );
}

// ---------------------------------------------------------------------------
// Group member management — add and remove members via backend API.
// ---------------------------------------------------------------------------

export async function addConversationMembersOnApi(
  conversationId: string,
  memberIds: string[]
): Promise<{ addedMemberIds: string[]; participantIds: string[] }> {
  const payload = await fetchJson<{
    ok: true;
    conversationId: string;
    addedMemberIds: string[];
    participantIds: string[];
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberIds }),
  });

  return {
    addedMemberIds: payload.addedMemberIds,
    participantIds: payload.participantIds,
  };
}

export async function removeConversationMemberOnApi(
  conversationId: string,
  userId: string
): Promise<{ removed: boolean; participantIds: string[] }> {
  const payload = await fetchJson<{
    ok: true;
    removed: boolean;
    participantIds: string[];
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });

  return {
    removed: payload.removed,
    participantIds: payload.participantIds,
  };
}

/**
 * Leave a group conversation by removing the current user's own membership.
 * Uses the same member-removal endpoint as `removeConversationMemberOnApi`
 * but is semantically named for the "leave group" user action and returns
 * void — callers only need to know whether the leave succeeded.
 */
export async function leaveGroupOnApi(
  conversationId: string,
  memberUserId: string
): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(memberUserId)}`,
    { method: 'DELETE' }
  );
}

/**
 * Promote a group member to admin. Only the current owner (or another admin
 * with the add-admins permission) can call this.
 */
export async function promoteConversationMemberOnApi(
  conversationId: string,
  userId: string,
): Promise<{ memberRoles: Record<string, string> }> {
  const payload = await fetchJson<{
    ok: true;
    memberRoles: Record<string, string>;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  return { memberRoles: payload.memberRoles };
}

/**
 * Demote an admin back to regular member. Only the owner (or another admin
 * with the add-admins permission) can call this. The owner cannot be demoted.
 */
export async function demoteConversationMemberOnApi(
  conversationId: string,
  userId: string,
): Promise<{ memberRoles: Record<string, string> }> {
  const payload = await fetchJson<{
    ok: true;
    memberRoles: Record<string, string>;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'member' }),
  });
  return { memberRoles: payload.memberRoles };
}

/**
 * Transfer group ownership to another member. The current owner's role
 * becomes admin after the transfer. Only the current owner can call this.
 */
export async function transferConversationOwnershipOnApi(
  conversationId: string,
  newOwnerId: string,
): Promise<{ ownerId: string; memberRoles: Record<string, string> }> {
  const payload = await fetchJson<{
    ok: true;
    ownerId: string;
    memberRoles: Record<string, string>;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/transfer-ownership`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newOwnerId }),
  });
  return { ownerId: payload.ownerId, memberRoles: payload.memberRoles };
}

// ---------------------------------------------------------------------------
// P0 #1 / P2 #56: Typing indicator publisher.
// Ephemeral realtime signal — the backend fans this out to other participants
// via the conversation's realtime topic. Callers should debounce "started
// typing" (~1s) and send `false` on 3s inactivity or on message send.
// ---------------------------------------------------------------------------

export async function setTypingStatus(
  conversationId: string,
  isTyping: boolean
): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/typing`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTyping }),
    }
  );
}

// ---------------------------------------------------------------------------
// P1 #25: Per-user conversation state — mute, archive, message-request status.
// These mutations persist server-side so state survives across devices.
// ---------------------------------------------------------------------------

export async function muteConversationOnApi(conversationId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/mute`,
    { method: 'POST' }
  );
}

export async function unmuteConversationOnApi(conversationId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/mute`,
    { method: 'DELETE' }
  );
}

export async function archiveConversationOnApi(conversationId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/archive`,
    { method: 'POST' }
  );
}

export async function unarchiveConversationOnApi(conversationId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/archive`,
    { method: 'DELETE' }
  );
}

export async function markConversationReadBatchOnApi(
  conversationId: string,
  options?: { upToMessageId?: string; upToTimestamp?: string },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (options?.upToMessageId) body.upToMessageId = options.upToMessageId;
  if (options?.upToTimestamp) body.upToTimestamp = options.upToTimestamp;
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/read`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

export async function pinConversationOnApi(conversationId: string, pinned: boolean): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/pin`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    }
  );
}

export async function setConversationUnreadOnApi(conversationId: string, unread: boolean): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/unread`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unread }),
    }
  );
}

export async function acceptMessageRequestOnApi(conversationId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/accept`,
    { method: 'POST' }
  );
}

export async function declineMessageRequestOnApi(conversationId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/decline`,
    { method: 'POST' }
  );
}

// ---------------------------------------------------------------------------
// P1 #25: Quick replies — persisted per user with buyer/seller role.
// ---------------------------------------------------------------------------

export interface ApiQuickReply {
  id: string;
  role: 'buyer' | 'seller';
  title: string;
  body: string;
  sortOrder: number;
}

export async function fetchQuickRepliesFromApi(role?: 'buyer' | 'seller'): Promise<ApiQuickReply[]> {
  const query = role ? `?role=${role}` : '';
  const payload = await fetchJson<{ ok: true; items: ApiQuickReply[] }>(
    `/chat/quick-replies${query}`
  );
  return payload.items;
}

export async function createQuickReplyOnApi(input: {
  role: 'buyer' | 'seller';
  title: string;
  body: string;
}): Promise<ApiQuickReply> {
  const payload = await fetchJson<{ ok: true; quickReply: ApiQuickReply }>(
    '/chat/quick-replies',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  return payload.quickReply;
}

export async function updateQuickReplyOnApi(
  replyId: string,
  updates: { title?: string; body?: string }
): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/quick-replies/${encodeURIComponent(replyId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
}

export async function deleteQuickReplyOnApi(replyId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/quick-replies/${encodeURIComponent(replyId)}`,
    { method: 'DELETE' }
  );
}

// ---------------------------------------------------------------------------
// Voice messages — report 19. Playback authorization, waveform read path and
// opt-in transcription. These are the client-side contracts for the backend
// voice message routes.
// ---------------------------------------------------------------------------

export async function fetchVoiceMessageDetailsOnApi(
  conversationId: string,
  messageId: string,
): Promise<VoiceMessageReceipt> {
  const payload = await fetchJson<{
    ok: true;
    voice: VoiceMessageReceipt;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice`,
  );
  return payload.voice;
}

export async function requestVoicePlaybackUrlOnApi(
  conversationId: string,
  messageId: string,
): Promise<{ playbackUrl: string; expiresAt: string; expiresIn: number }> {
  const payload = await fetchJson<{
    ok: true;
    playbackUrl: string;
    expiresAt: string;
    expiresIn: number;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice/playback-url`,
    { method: 'POST' },
  );
  return payload;
}

export async function requestVoiceTranscriptionOnApi(
  conversationId: string,
  messageId: string,
  language?: string,
): Promise<VoiceTranscriptionReceipt> {
  const payload = await fetchJson<{
    ok: true;
    transcription: VoiceTranscriptionReceipt;
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice/transcribe`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: language ?? null }),
    },
  );
  return payload.transcription;
}

export async function fetchVoiceTranscriptionOnApi(
  conversationId: string,
  messageId: string,
): Promise<VoiceTranscriptionReceipt | null> {
  try {
    const payload = await fetchJson<{
      ok: true;
      transcription: VoiceTranscriptionReceipt;
    }>(
      `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice/transcription`,
    );
    return payload.transcription;
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status === 404) return null;
    throw e;
  }
}

export async function rateVoiceTranscriptionOnApi(
  conversationId: string,
  messageId: string,
  rating: 'good' | 'bad',
): Promise<{ rating: 'good' | 'bad' }> {
  const payload = await fetchJson<{
    ok: true;
    rating: 'good' | 'bad';
  }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/voice/transcription/rating`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    },
  );
  return payload;
}
