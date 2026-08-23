import type { ChatAgentConfig, ChatBot, Conversation, Message } from '../domain';
import { fetchJson } from '../lib/apiClient';

type ApiConversationType = 'dm' | 'group';
type ApiSenderType = 'user' | 'bot' | 'system';

interface ApiConversationPayload {
  id: string;
  type: ApiConversationType;
  title: string | null;
  ownerId: string | null;
  itemId: string | null;
  participantIds: string[];
  participantProfiles?: Array<{
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    emailVerified: boolean;
  }>;
  botIds: string[];
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  memberRoles?: Record<string, string>;
}

interface ApiMessagePayload {
  id: string;
  senderType: ApiSenderType;
  senderUserId: string | null;
  senderBotId: string | null;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
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

function mapApiMessageToConversationMessage(payload: ApiMessagePayload): Message {
  const senderId = payload.senderType === 'bot'
    ? payload.senderBotId ?? 'system'
    : payload.senderType === 'user'
      ? payload.senderUserId ?? 'system'
      : 'system';

  const meta = payload.metadata || {};

  return {
    id: payload.id,
    senderId,
    text: payload.body,
    timestamp: payload.createdAt,
    isSystem: payload.senderType === 'system',
    systemTitle: payload.senderType === 'system' ? 'System' : undefined,
    type: payload.senderType === 'system' ? 'system' : 'text',
    sender: payload.senderType === 'system' ? 'system' : 'other',
    mediaUri: typeof meta.mediaUri === 'string' ? meta.mediaUri : undefined,
    mediaType: meta.mediaType === 'image' || meta.mediaType === 'video' ? meta.mediaType : undefined,
  };
}

function mapApiConversationToApp(
  payload: ApiConversationPayload,
  messages: Message[] = []
): Conversation {
  const latestMessage = payload.lastMessage || messages[messages.length - 1]?.text || 'No messages yet';
  const latestMessageTime = payload.lastMessageTime || messages[messages.length - 1]?.timestamp || 'just now';
  const resolvedMessages: Message[] = messages.length
    ? messages
    : payload.lastMessage
      ? [
          {
            id: `sync_${payload.id}`,
            senderId: 'system',
            text: payload.lastMessage,
            timestamp: latestMessageTime,
            isSystem: true,
            systemTitle: payload.type === 'group' ? 'Group update' : 'Conversation update',
            type: 'system' as const,
            sender: 'system' as const,
          },
        ]
      : [];

  return {
    id: payload.id,
    type: payload.type,
    title: payload.title ?? undefined,
    ownerId: payload.ownerId ?? undefined,
    itemId: payload.itemId ?? undefined,
    participantIds: payload.participantIds,
    participantProfiles: payload.participantProfiles,
    botIds: payload.botIds,
    lastMessage: latestMessage,
    lastMessageTime: latestMessageTime,
    unread: payload.unread,
    messages: resolvedMessages,
    memberRoles: normalizeMemberRoles(payload.memberRoles),
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
    }),
  });

  const messages = payload.initialMessage
    ? [mapApiMessageToConversationMessage(payload.initialMessage)]
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

export async function fetchConversationMessagesFromApi(
  conversationId: string,
  limit = 120
): Promise<Message[]> {
  const payload = await fetchJson<{
    ok: true;
    items: ApiMessagePayload[];
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`);

  return payload.items.map((item) => mapApiMessageToConversationMessage(item));
}

export async function sendConversationMessageOnApi(
  conversationId: string,
  text: string,
  metadata?: Record<string, unknown>
): Promise<Message> {
  const payload = await fetchJson<{
    ok: true;
    message: ApiMessagePayload;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      metadata,
    }),
  });

  return mapApiMessageToConversationMessage(payload.message);
}

export async function deleteConversationMessageOnApi(
  conversationId: string,
  messageId: string
): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' }
  );
}

export async function deleteConversationOnApi(conversationId: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' }
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
  updates: { title?: string; description?: string; avatar?: string }
): Promise<void> {
  await fetchJson<{ ok: true }>(`/chat/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
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
