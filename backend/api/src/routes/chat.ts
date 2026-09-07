import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { AuthRole, AuthenticatedUser } from '../lib/auth.js';
import { createPublicToken, hashOpaqueValue } from '../lib/auth.js';
import { hashGroupCreatePayload } from '../lib/chatGroupIdempotency.js';
import { encryptMessageBody, resolveMessageBody } from '../lib/messageEncryption.js';
import { executeBotCommand } from '../botRuntime/index.js';
import { normalizeAgentConfig } from '../botRuntime/agentConfig.js';
import {
  isAgentRuntimeReady,
  agentRuntimeReadinessReason,
} from '../botRuntime/openaiAgent.js';
import { publishRealtimeEvent } from '../lib/realtime.js';
import { logger } from '../lib/logger.js';
import { checkFraudNonBlocking } from '../lib/fraudDetection.js';
import { evaluateRisk, recordExecution } from '../lib/riskDecision.js';
import { scanMessageForScamPatterns } from '../lib/messageScamScanner.js';

// ── Local types ──

interface ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

type DbQueryable = Pick<PoolClient, 'query'>;

type ChatConversationType = 'dm' | 'group';
type ChatSenderType = 'user' | 'bot' | 'system';
type ChatGroupMemberRole = 'owner' | 'admin' | 'member';
type ChatGroupPermissionScope = 'admins' | 'everyone';
type ChatGroupCapability = 'edit_group_info' | 'send_messages' | 'add_members';

interface ChatGroupSettingsRow {
  edit_group_info_scope: ChatGroupPermissionScope;
  send_messages_scope: ChatGroupPermissionScope;
  add_members_scope: ChatGroupPermissionScope;
  updated_by: string | null;
  updated_at: string;
}

interface ChatConversationAccessRow {
  id: string;
  type: ChatConversationType;
  title: string | null;
  owner_id: string;
  item_id: string | null;
}

interface ChatGroupMembershipRoleRow {
  role: ChatGroupMemberRole;
}

interface OwnedGroupAvatarReceipt {
  finalization_id: string;
  finalization_url: string;
  finalization_status: string;
  content_type: string;
  folder: string;
  scope: string;
  owner_id: string;
  media_asset_id: string | null;
  media_asset_status: string | null;
  canonical_url: string | null;
}

// ── Dependency injection ──

type ChatRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
  resolveAuthenticatedUserId: (request: { authUser?: AuthenticatedUser }, requestedUserId?: string) => string;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => ApiError;
  ensureUserExists: (userId: string) => Promise<void>;
  createRuntimeId: (prefix: string) => string;
  toJsonString: (value: unknown) => string;
  resolveHeaderString: (value: string | string[] | undefined) => string | null;
  asObject: (value: unknown) => Record<string, unknown>;
  queueUserNotification: (input: {
    userId: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    eventType?: string;
    actorUserId?: string;
    imageUrl?: string;
    route?: Record<string, unknown>;
    idempotencyKey?: string;
  }) => Promise<string | null>;
  fraudShadowService?: {
    scoreShadow(input: unknown): Promise<unknown>;
    logScoreComparison(
      eventId: string,
      eventType: string,
      userId: string | null,
      ruleEngineResult: unknown,
      shadowResult: unknown,
      input: unknown,
    ): Promise<void>;
  } | null;
  ipReputationProvider?: import('../lib/riskDecision.js').IpReputationProvider;
};

export const registerChatRoutes = ({
  app,
  db,
  redis,
  resolveAuthenticatedUserId,
  createApiError,
  ensureUserExists,
  createRuntimeId,
  toJsonString,
  resolveHeaderString,
  asObject,
  queueUserNotification,
  fraudShadowService,
  ipReputationProvider,
}: ChatRouteDependencies): void => {
function buildGroupInviteLink(inviteToken: string): string {
  return `thryftverse://group-invite?token=${encodeURIComponent(inviteToken)}`;
}

async function ensureChatConversationAccess(
  client: DbQueryable,
  conversationId: string,
  userId: string
): Promise<ChatConversationAccessRow> {
  const result = await client.query<ChatConversationAccessRow>(
    `
      SELECT c.id, c.type, c.title, c.owner_id, c.item_id
      FROM chat_conversations c
      INNER JOIN chat_members cm
        ON cm.conversation_id = c.id
      WHERE c.id = $1
        AND cm.user_id = $2
      LIMIT 1
    `,
    [conversationId, userId]
  );

  if (!result.rowCount) {
    throw createApiError('CHAT_CONVERSATION_NOT_FOUND', 'Conversation not found', {
      conversationId,
      userId,
    });
  }

  return result.rows[0];
}

async function ensureGroupConversationAccess(
  client: DbQueryable,
  conversationId: string,
  userId: string
): Promise<ChatConversationAccessRow> {
  const conversation = await ensureChatConversationAccess(client, conversationId, userId);

  if (conversation.type !== 'group') {
    throw createApiError('CHAT_CONVERSATION_INVALID', 'This action is available only for group conversations', {
      conversationId,
      conversationType: conversation.type,
    });
  }

  return conversation;
}

type ConversationContextListingStatus = 'active' | 'sold' | 'paused' | 'deleted';
type ConversationContextOfferStatus = 'pending' | 'countered' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';
type ConversationContextOrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded';

interface ConversationContextShape {
  listing?: {
    id: string;
    title: string;
    price: number;
    currency: string;
    imageUrl?: string;
    status: ConversationContextListingStatus;
    condition?: string;
  };
  offer?: {
    id: string;
    amount: number;
    currency: string;
    status: ConversationContextOfferStatus;
    expiresAt: string;
  };
  order?: {
    id: string;
    status: ConversationContextOrderStatus;
    totalAmount: number;
    currency: string;
    createdAt: string;
  };
  protection?: {
    status: 'active' | 'expired' | 'claimed' | 'resolved';
    expiresAt?: string;
  };
}

const OFFER_STATUS_MAP: Record<string, ConversationContextOfferStatus> = {
  pending: 'pending',
  countered: 'countered',
  accepted: 'accepted',
  declined: 'rejected',
  expired: 'expired',
  cancelled: 'withdrawn',
};

const ORDER_STATUS_MAP: Record<string, ConversationContextOrderStatus> = {
  created: 'pending',
  paid: 'paid',
  shipped: 'shipped',
  delivered: 'delivered',
  completed: 'completed',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

function mapListingStatus(raw: string): ConversationContextListingStatus {
  if (raw === 'sold' || raw === 'paused' || raw === 'deleted') return raw;
  return 'active';
}

async function resolveConversationsContextBatch(
  queryable: DbQueryable,
  entries: Array<{ conversationId: string; itemId: string | null }>
): Promise<Map<string, ConversationContextShape>> {
  const result = new Map<string, ConversationContextShape>();
  if (!entries.length) return result;

  const itemIds = [...new Set(entries.map((e) => e.itemId).filter((id): id is string => id !== null))];
  const conversationIds = entries.map((e) => e.conversationId);

  const [listingRows, offerRows, orderRows] = await Promise.all([
    itemIds.length
      ? queryable.query<{
          id: string;
          title: string;
          price_gbp: string;
          image_url: string | null;
          status: string;
          condition: string | null;
        }>(
          `SELECT id, title, price_gbp::text, image_url, status, condition
           FROM listings WHERE id = ANY($1::text[])`,
          [itemIds]
        )
      : Promise.resolve({ rows: [] as Array<{ id: string; title: string; price_gbp: string; image_url: string | null; status: string; condition: string | null }> }),
    queryable.query<{
      id: string;
      conversation_id: string | null;
      offer_price_gbp: string;
      status: string;
      expires_at: string;
    }>(
      `SELECT DISTINCT ON (conversation_id)
          id, conversation_id, offer_price_gbp::text, status, expires_at::text
       FROM listing_offers
       WHERE conversation_id = ANY($1::text[])
       ORDER BY conversation_id, created_at DESC`,
      [conversationIds]
    ),
    itemIds.length
      ? queryable.query<{
          id: string;
          listing_id: string;
          total_gbp: string;
          status: string;
          created_at: string;
          escrow_release_scheduled_at: string | null;
          escrow_released_at: string | null;
        }>(
          `SELECT DISTINCT ON (listing_id)
            id, listing_id, total_gbp::text, status, created_at::text,
            escrow_release_scheduled_at::text, escrow_released_at::text
           FROM orders
           WHERE listing_id = ANY($1::text[])
           ORDER BY listing_id, created_at DESC`,
          [itemIds]
        )
      : Promise.resolve({ rows: [] as Array<{ id: string; listing_id: string; total_gbp: string; status: string; created_at: string; escrow_release_scheduled_at: string | null; escrow_released_at: string | null }> }),
  ]);

  const listingById = new Map<string, { title: string; price: number; image_url: string | null; status: string; condition: string | null }>();
  for (const row of listingRows.rows) {
    listingById.set(row.id, {
      title: row.title,
      price: parseFloat(row.price_gbp),
      image_url: row.image_url,
      status: row.status,
      condition: row.condition,
    });
  }

  const offerByConversationId = new Map<string, { id: string; amount: number; status: string; expires_at: string }>();
  for (const row of offerRows.rows) {
    if (!row.conversation_id) continue;
    offerByConversationId.set(row.conversation_id, {
      id: row.id,
      amount: parseFloat(row.offer_price_gbp),
      status: row.status,
      expires_at: row.expires_at,
    });
  }

  const orderByListingId = new Map<string, { id: string; total: number; status: string; created_at: string; escrow_release_scheduled_at: string | null; escrow_released_at: string | null }>();
  for (const row of orderRows.rows) {
    orderByListingId.set(row.listing_id, {
      id: row.id,
      total: parseFloat(row.total_gbp),
      status: row.status,
      created_at: row.created_at,
      escrow_release_scheduled_at: row.escrow_release_scheduled_at,
      escrow_released_at: row.escrow_released_at,
    });
  }

  for (const entry of entries) {
    const listingData = entry.itemId ? listingById.get(entry.itemId) : undefined;
    if (!listingData) continue;

    const context: ConversationContextShape = {
      listing: {
        id: entry.itemId!,
        title: listingData.title,
        price: listingData.price,
        currency: 'GBP',
        imageUrl: listingData.image_url ?? undefined,
        status: mapListingStatus(listingData.status),
        condition: listingData.condition ?? undefined,
      },
    };

    const offerData = offerByConversationId.get(entry.conversationId);
    if (offerData) {
      const mappedOfferStatus = OFFER_STATUS_MAP[offerData.status];
      if (mappedOfferStatus) {
        context.offer = {
          id: offerData.id,
          amount: offerData.amount,
          currency: 'GBP',
          status: mappedOfferStatus,
          expiresAt: offerData.expires_at,
        };
      }
    }

    const orderData = entry.itemId ? orderByListingId.get(entry.itemId) : undefined;
    if (orderData) {
      const mappedOrderStatus = ORDER_STATUS_MAP[orderData.status] ?? 'pending';
      context.order = {
        id: orderData.id,
        status: mappedOrderStatus,
        totalAmount: orderData.total,
        currency: 'GBP',
        createdAt: orderData.created_at,
      };

      if (orderData.escrow_release_scheduled_at && !orderData.escrow_released_at) {
        const expiresAt = orderData.escrow_release_scheduled_at;
        const isExpired = new Date(expiresAt).getTime() < Date.now();
        context.protection = {
          status: isExpired ? 'expired' : 'active',
          expiresAt,
        };
      } else if (orderData.escrow_released_at) {
        context.protection = { status: 'resolved' };
      }
    }

    result.set(entry.conversationId, context);
  }

  return result;
}

async function resolveGroupConversationMembershipRole(
  client: DbQueryable,
  conversationId: string,
  userId: string
): Promise<ChatGroupMemberRole | null> {
  const result = await client.query<ChatGroupMembershipRoleRow>(
    `
      SELECT role
      FROM chat_members
      WHERE conversation_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [conversationId, userId]
  );

  return result.rows[0]?.role ?? null;
}

async function ensureGroupManagementAccess(
  client: DbQueryable,
  conversationId: string,
  userId: string,
  platformRole?: AuthRole
): Promise<ChatConversationAccessRow> {
  const conversation = await ensureGroupConversationAccess(client, conversationId, userId);

  if (platformRole === 'admin' || conversation.owner_id === userId) {
    return conversation;
  }

  const membershipRole = await resolveGroupConversationMembershipRole(client, conversationId, userId);
  if (membershipRole === 'owner' || membershipRole === 'admin') {
    return conversation;
  }

  throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only group owners/admins can perform this action', {
    actorUserId: userId,
    conversationId,
    ownerId: conversation.owner_id,
    membershipRole,
  });
}

const DEFAULT_GROUP_SETTINGS: ChatGroupSettingsRow = {
  edit_group_info_scope: 'admins',
  send_messages_scope: 'everyone',
  add_members_scope: 'admins',
  updated_by: null,
  updated_at: '',
};

async function resolveGroupSettings(
  client: DbQueryable,
  conversationId: string,
): Promise<ChatGroupSettingsRow> {
  const result = await client.query<ChatGroupSettingsRow>(
    `
      SELECT
        edit_group_info_scope,
        send_messages_scope,
        add_members_scope,
        updated_by,
        updated_at::text
      FROM chat_group_settings
      WHERE conversation_id = $1
      LIMIT 1
    `,
    [conversationId],
  );

  return result.rows[0] ?? DEFAULT_GROUP_SETTINGS;
}

function serializeGroupSettings(row: ChatGroupSettingsRow) {
  return {
    editGroupInfo: row.edit_group_info_scope,
    sendMessages: row.send_messages_scope,
    addMembers: row.add_members_scope,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at || null,
  };
}

async function ensureGroupCapabilityAccess(
  client: DbQueryable,
  conversationId: string,
  userId: string,
  capability: ChatGroupCapability,
  platformRole?: AuthRole,
): Promise<ChatConversationAccessRow> {
  const conversation = await ensureGroupConversationAccess(client, conversationId, userId);
  if (platformRole === 'admin' || conversation.owner_id === userId) return conversation;

  const membershipRole = await resolveGroupConversationMembershipRole(client, conversationId, userId);
  if (membershipRole === 'owner' || membershipRole === 'admin') return conversation;

  const settings = await resolveGroupSettings(client, conversationId);
  const scope = capability === 'edit_group_info'
    ? settings.edit_group_info_scope
    : capability === 'send_messages'
      ? settings.send_messages_scope
      : settings.add_members_scope;

  if (scope === 'everyone' && membershipRole === 'member') return conversation;

  const capabilityLabels: Record<ChatGroupCapability, string> = {
    edit_group_info: 'edit group info',
    send_messages: 'send messages',
    add_members: 'add or invite members',
  };
  throw createApiError(
    'CHAT_GROUP_PERMISSION_DENIED',
    `Only group owners/admins can ${capabilityLabels[capability]}`,
    { conversationId, capability, scope, membershipRole },
  );
}

async function ensureOwnedGroupMediaReceipt(
  client: DbQueryable,
  input: {
    actorUserId: string;
    finalizationId: string;
    mediaUrl: string;
    folder: 'avatars' | 'covers';
    scope: 'avatar' | 'cover';
  }
): Promise<void> {
  const result = await client.query<OwnedGroupAvatarReceipt>(
    `
      SELECT
        uf.id AS finalization_id,
        uf.public_url AS finalization_url,
        uf.status AS finalization_status,
        uf.content_type,
        uf.folder,
        uf.scope,
        uf.owner_id,
        ma.id AS media_asset_id,
        ma.status AS media_asset_status,
        ma.canonical_url
      FROM upload_finalizations uf
      LEFT JOIN media_assets ma ON ma.upload_finalization_id = uf.id
      WHERE uf.id = $1
      LIMIT 1
    `,
    [input.finalizationId]
  );

  const receipt = result.rows[0];
  const invalidAssetStatuses = new Set([
    'upload_expired',
    'integrity_failed',
    'quarantined',
    'rejected',
    'revoked',
    'deleted',
  ]);
  const urlMatchesReceipt = Boolean(
    receipt
    && (input.mediaUrl === receipt.finalization_url || input.mediaUrl === receipt.canonical_url)
  );

  const label = input.folder === 'covers' ? 'cover photo' : 'group photo';
  if (
    !receipt
    || receipt.owner_id !== input.actorUserId
    || receipt.finalization_status !== 'finalized'
    || !receipt.content_type.startsWith('image/')
    || receipt.folder !== input.folder
    || receipt.scope !== input.scope
    || !receipt.media_asset_id
    || (receipt.media_asset_status !== null && invalidAssetStatuses.has(receipt.media_asset_status))
    || !urlMatchesReceipt
  ) {
    throw createApiError(
      'CHAT_GROUP_AVATAR_INVALID',
      `Group ${label} must be a finalized image uploaded by the current user`,
      { finalizationId: input.finalizationId }
    );
  }
}

// Backward-compatible alias for existing call sites that upload avatars.
async function ensureOwnedGroupAvatarReceipt(
  client: DbQueryable,
  input: {
    actorUserId: string;
    finalizationId: string;
    avatarUrl: string;
  }
): Promise<void> {
  return ensureOwnedGroupMediaReceipt(client, {
    actorUserId: input.actorUserId,
    finalizationId: input.finalizationId,
    mediaUrl: input.avatarUrl,
    folder: 'avatars',
    scope: 'avatar',
  });
}

// â”€â”€ Chat message serialization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// P0.1/P0.7/P0.8/P0.9: Canonical message serializer that includes all
// lifecycle fields â€” clientMessageId, replyToMessageId, reactions, edit
// state, deleted state. Used by both the list and create routes so the
// contract is identical everywhere.

interface ChatMessageRow {
  id: string;
  sender_type: ChatSenderType;
  sender_user_id: string | null;
  sender_bot_id: string | null;
  body: string;
  body_ciphertext: string | null;
  key_version: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  client_message_id: string | null;
  reply_to_message_id: string | null;
  deleted_for_everyone_at: string | null;
  edit_version: number;
  edited_at: string | null;
}

function formatReactionsMap(
  reactionsByMessage: Map<string, Map<string, string[]>>,
  messageId: string,
): Array<{ emoji: string; userIds: string[] }> {
  const byEmoji = reactionsByMessage.get(messageId);
  if (!byEmoji) return [];
  return Array.from(byEmoji.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
}

// Batch serializer â€” loads reactions for all messages in a single query to
// avoid N+1. Used by the list route which returns multiple messages.
async function serializeChatMessageRows(
  rows: ChatMessageRow[],
  actorUserId: string,
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];

  const messageIds = rows.map((r) => r.id);
  const reactionsResult = await db.query<{ message_id: string; emoji: string; user_id: string }>(
    `SELECT message_id, emoji, user_id FROM chat_message_reactions WHERE message_id = ANY($1::text[])`,
    [messageIds]
  );

  const reactionsByMessage = new Map<string, Map<string, string[]>>();
  for (const r of reactionsResult.rows) {
    let byEmoji = reactionsByMessage.get(r.message_id);
    if (!byEmoji) {
      byEmoji = new Map();
      reactionsByMessage.set(r.message_id, byEmoji);
    }
    const existing = byEmoji.get(r.emoji);
    if (existing) existing.push(r.user_id);
    else byEmoji.set(r.emoji, [r.user_id]);
  }

  // Voice message binding â€” load in one batch to avoid N+1. Returns the
  // canonical voice metadata so the client can render a real waveform (or
  // an honest progress line when samples are not yet ready) and a duration.
  const voiceResult = await db.query<{
    message_id: string;
    duration_ms: number;
    bytes: string;
    container: string;
    codec: string;
    waveform_samples: number[] | null;
    waveform_sample_count: number | null;
    waveform_algorithm_version: number | null;
    moderation_state: string;
  }>(
    `SELECT message_id, duration_ms, bytes::text, container, codec,
            waveform_samples, waveform_sample_count, waveform_algorithm_version,
            moderation_state
     FROM voice_messages
     WHERE message_id = ANY($1::text[])`,
    [messageIds]
  );
  const voiceByMessage = new Map<string, {
    durationMs: number;
    bytes: number;
    container: string;
    codec: string;
    waveform: number[] | null;
    waveformSampleCount: number | null;
    waveformAlgorithmVersion: number | null;
    moderationState: string;
  }>();
  for (const r of voiceResult.rows) {
    voiceByMessage.set(r.message_id, {
      durationMs: r.duration_ms,
      bytes: Number(r.bytes),
      container: r.container,
      codec: r.codec,
      waveform: Array.isArray(r.waveform_samples) ? r.waveform_samples : null,
      waveformSampleCount: r.waveform_sample_count,
      waveformAlgorithmVersion: r.waveform_algorithm_version,
      moderationState: r.moderation_state,
    });
  }

  const readReceiptsResult = await db.query<{ message_id: string; user_id: string }>(
    `SELECT message_id, user_id FROM chat_message_read_receipts WHERE message_id = ANY($1::text[])`,
    [messageIds]
  );
  const readByMessage = new Map<string, string[]>();
  for (const r of readReceiptsResult.rows) {
    let userIds = readByMessage.get(r.message_id);
    if (!userIds) {
      userIds = [];
      readByMessage.set(r.message_id, userIds);
    }
    userIds.push(r.user_id);
  }

  // ── Poll data: batch-load polls and votes for these messages ─────────
  const pollsResult = await db.query<{
    id: string;
    message_id: string;
    question: string;
    options: string[];
    allow_multiple: boolean;
    is_anonymous: boolean;
    closes_at: string | null;
  }>(
    `SELECT id, message_id, question, options, allow_multiple, is_anonymous, closes_at
     FROM chat_polls WHERE message_id = ANY($1::text[])`,
    [messageIds],
  );
  const pollIds = pollsResult.rows.map((p) => p.id);
  const pollByMessage = new Map<string, typeof pollsResult.rows[0] & { voteCounts: number[]; myVotes: number[] }>();
  if (pollIds.length > 0) {
    const votesResult = await db.query<{ poll_id: string; option_index: number; user_id: string }>(
      `SELECT poll_id, option_index, user_id FROM chat_poll_votes WHERE poll_id = ANY($1::text[])`,
      [pollIds],
    );
    const votesByPoll = new Map<string, Map<number, string[]>>();
    for (const v of votesResult.rows) {
      let byOpt = votesByPoll.get(v.poll_id);
      if (!byOpt) { byOpt = new Map(); votesByPoll.set(v.poll_id, byOpt); }
      const arr = byOpt.get(v.option_index) ?? [];
      arr.push(v.user_id);
      byOpt.set(v.option_index, arr);
    }
    for (const p of pollsResult.rows) {
      const voteMap = votesByPoll.get(p.id) ?? new Map<number, string[]>();
      const voteCounts = p.options.map((_, i) => voteMap.get(i)?.length ?? 0);
      const myVotes = [...voteMap.entries()].filter(([, uids]) => uids.includes(actorUserId)).map(([opt]) => opt);
      pollByMessage.set(p.message_id, { ...p, voteCounts, myVotes });
    }
  }

  return rows.map((row) => {
    const readBy = readByMessage.get(row.id) ?? [];
    const baseReturn: Record<string, unknown> = {
      id: row.id,
      senderType: row.sender_type,
      senderUserId: row.sender_user_id,
      senderBotId: row.sender_bot_id,
      body: row.body,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
      clientMessageId: row.client_message_id ?? undefined,
      replyToMessageId: row.reply_to_message_id ?? undefined,
      deletedForEveryoneAt: row.deleted_for_everyone_at ?? undefined,
      editVersion: row.edit_version,
      editedAt: row.edited_at ?? undefined,
      reactions: formatReactionsMap(reactionsByMessage, row.id),
      readBy,
      isReadByMe: readBy.includes(actorUserId),
      scamWarning: (row.metadata as Record<string, unknown> | null)?.scamWarning === true || undefined,
    };
    const voice = voiceByMessage.get(row.id);
    if (voice) {
      baseReturn.voice = voice;
    }
    const poll = pollByMessage.get(row.id);
    if (poll) {
      baseReturn.poll = {
        id: poll.id,
        question: poll.question,
        options: poll.options,
        allowMultiple: poll.allow_multiple,
        isAnonymous: poll.is_anonymous,
        closesAt: poll.closes_at ?? undefined,
        voteCounts: poll.voteCounts,
        myVotes: poll.myVotes,
      };
    }
    return baseReturn;
  });
}

// Single-message serializer â€” for the create route where only one message
// is returned. Uses the batch serializer with a single-element array.
async function serializeChatMessageRow(
  row: ChatMessageRow,
  actorUserId: string,
): Promise<Record<string, unknown>> {
  const results = await serializeChatMessageRows([row], actorUserId);
  return results[0];
}

async function listChatParticipantIds(client: DbQueryable, conversationId: string): Promise<string[]> {
  const result = await client.query<{ user_id: string }>(
    `
      SELECT user_id
      FROM chat_members
      WHERE conversation_id = $1
      ORDER BY joined_at ASC
    `,
    [conversationId]
  );

  return result.rows.map((row) => row.user_id);
}

async function listChatBotIds(client: DbQueryable, conversationId: string): Promise<string[]> {
  const result = await client.query<{ bot_id: string }>(
    `
      SELECT bot_id
      FROM chat_bot_installs
      WHERE conversation_id = $1
        AND status = 'active'
      ORDER BY installed_at ASC
    `,
    [conversationId]
  );

  return result.rows.map((row) => row.bot_id);
}

async function appendSystemChatMessage(
  client: DbQueryable,
  input: {
    conversationId: string;
    text: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ id: string; createdAt: string }> {
  const messageId = createRuntimeId('chatmsg');
  // PII encryption dual-write: encrypt the body before INSERT. On failure,
  // store plaintext so the backfill worker can encrypt later.
  let bodyToStore = input.text;
  let bodyCiphertext: string | null = null;
  let keyVersion: number | null = null;
  try {
    const encrypted = await encryptMessageBody(messageId, input.text);
    bodyCiphertext = encrypted.ciphertext;
    keyVersion = encrypted.keyVersion;
    bodyToStore = '[encrypted]';
  } catch (err) {
    logger.warn(
      { messageId, err: err instanceof Error ? err.message : String(err) },
      'messageEncryption.encryptFailed â€” storing plaintext for backfill',
    );
  }
  const result = await client.query<{ id: string; created_at: string }>(
    `
      INSERT INTO chat_messages (
        id,
        conversation_id,
        sender_type,
        sender_user_id,
        sender_bot_id,
        body,
        body_ciphertext,
        key_version,
        metadata
      )
      VALUES ($1, $2, 'system', NULL, NULL, $3, $4, $5, $6::jsonb)
      RETURNING id, created_at::text
    `,
    [
      messageId,
      input.conversationId,
      bodyToStore,
      bodyCiphertext,
      keyVersion,
      toJsonString(input.metadata ?? {}),
    ]
  );

  return {
    id: result.rows[0].id,
    createdAt: result.rows[0].created_at,
  };
}

async function getChatGroupIdempotentResponse(
  client: DbQueryable,
  input: {
    creatorId: string;
    idempotencyKey: string;
    requestHash: string;
  }
): Promise<Record<string, unknown> | null> {
  const result = await client.query<{
    request_hash: string;
    response_payload: Record<string, unknown>;
  }>(
    `
      SELECT request_hash, response_payload
      FROM chat_group_idempotency_keys
      WHERE creator_id = $1
        AND idempotency_key = $2
      LIMIT 1
    `,
    [input.creatorId, input.idempotencyKey]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  if (row.request_hash !== input.requestHash) {
    throw createApiError(
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key was already used with a different request payload'
    );
  }

  return row.response_payload;
}

async function saveChatGroupIdempotentResponse(
  client: DbQueryable,
  input: {
    creatorId: string;
    idempotencyKey: string;
    requestHash: string;
    conversationId: string;
    responsePayload: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO chat_group_idempotency_keys (
        creator_id,
        idempotency_key,
        request_hash,
        conversation_id,
        response_payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (creator_id, idempotency_key)
      DO NOTHING
    `,
    [
      input.creatorId,
      input.idempotencyKey,
      input.requestHash,
      input.conversationId,
      toJsonString(input.responsePayload),
    ]
  );
}

const agentConfigSchema = z.object({
  instructions: z.string().trim().max(8_000),
  model: z.enum(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']),
  triggerMode: z.enum(['mention', 'command', 'always']),
  responseLength: z.enum(['concise', 'balanced', 'detailed']),
  tone: z.enum(['focused', 'warm', 'expert']),
  reasoningEffort: z.enum(['low', 'medium', 'high']),
  historyLimit: z.number().int().min(0).max(40),
  starterPrompts: z.array(z.string().trim().min(1).max(160)).max(4),
});

function botRuntimeReadiness(runtimeMode: string): {
  runtimeReady: boolean;
  runtimeReadinessReason: string | null;
} {
  if (runtimeMode !== 'ai') {
    return { runtimeReady: true, runtimeReadinessReason: null };
  }
  return {
    runtimeReady: isAgentRuntimeReady(),
    runtimeReadinessReason: agentRuntimeReadinessReason(),
  };
}

function publicAgentConfig(value: unknown) {
  const agentConfig = normalizeAgentConfig(value);
  return {
    ...agentConfig,
    instructions: '',
  };
}

app.post('/chat/dm', async (request, reply) => {
  const bodySchema = z.object({
    recipientUserId: z.string().trim().min(2).max(120),
    itemId: z.string().trim().min(2).max(120).optional(),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const payload = bodySchema.parse(request.body ?? {});

  if (payload.recipientUserId === actorUserId) {
    reply.code(400);
    return { ok: false, error: 'Cannot create a DM with yourself' };
  }

  await ensureUserExists(payload.recipientUserId);
  const participantIds = [actorUserId, payload.recipientUserId].sort();
  const dmPairKey = [
    participantIds[0],
    participantIds[1],
    payload.itemId ?? '',
  ].join('\u001f');

  if (payload.itemId) {
    const listingResult = await db.query<{ id: string }>(
      `SELECT id FROM listings WHERE id = $1 LIMIT 1`,
      [payload.itemId]
    );
    if (!listingResult.rowCount) {
      throw createApiError('LISTING_NOT_FOUND', 'Listing not found for DM context', {
        itemId: payload.itemId,
      });
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [dmPairKey],
    );

    const blockResult = await client.query(
      `SELECT 1
       FROM user_blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [actorUserId, payload.recipientUserId],
    );
    if (blockResult.rowCount) {
      await client.query('ROLLBACK');
      reply.code(403);
      return {
        ok: false,
        error: 'A direct conversation is unavailable for these participants',
        code: 'DM_BLOCKED',
      };
    }

    // P0.13: Enforce recipient privacy â€” check allow_messages_from.
    // 'everyone' â†’ accepted immediately. 'following' â†’ pending if not
    // mutually following. 'nobody' â†’ pending (request must be accepted).
    const recipientPrivacy = await client.query<{ allow_messages_from: string }>(
      `SELECT allow_messages_from FROM users WHERE id = $1 LIMIT 1`,
      [payload.recipientUserId]
    );
    const recipientAllowMessages = recipientPrivacy.rows[0]?.allow_messages_from ?? 'everyone';
    let requestStatus: 'pending' | 'accepted' = 'accepted';

    if (recipientAllowMessages === 'nobody') {
      requestStatus = 'pending';
    } else if (recipientAllowMessages === 'following') {
      // Check if the recipient follows the actor (mutual follow = accepted)
      const followResult = await client.query<{ id: string }>(
        `SELECT id FROM user_follows
         WHERE follower_id = $1 AND following_id = $2 LIMIT 1`,
        [payload.recipientUserId, actorUserId]
      );
      if (!followResult.rowCount) {
        requestStatus = 'pending';
      }
    }

    const existingResult = await client.query<{ id: string }>(
      `
        SELECT c.id
        FROM chat_conversations c
        WHERE c.type = 'dm'
          AND (
            c.dm_pair_key = $4
            OR (
              c.item_id IS NOT DISTINCT FROM $1
              AND EXISTS (
                SELECT 1 FROM chat_members cm1
                WHERE cm1.conversation_id = c.id AND cm1.user_id = $2
              )
              AND EXISTS (
                SELECT 1 FROM chat_members cm2
                WHERE cm2.conversation_id = c.id AND cm2.user_id = $3
              )
            )
          )
        ORDER BY (c.dm_pair_key = $4) DESC, c.created_at, c.id
        LIMIT 1
      `,
      [payload.itemId ?? null, actorUserId, payload.recipientUserId, dmPairKey]
    );

    if (existingResult.rowCount) {
      await client.query(
        `UPDATE chat_conversations
         SET dm_pair_key = COALESCE(dm_pair_key, $2)
         WHERE id = $1`,
        [existingResult.rows[0].id, dmPairKey],
      );
      // P0.13: Fetch the actor's request status for this conversation so the
      // client knows whether messages can be sent or are pending acceptance.
      const actorState = await client.query<{ request_status: string }>(
        `SELECT request_status FROM chat_conversation_user_state
         WHERE user_id = $1 AND conversation_id = $2 LIMIT 1`,
        [actorUserId, existingResult.rows[0].id]
      );
      const existingRequestStatus = actorState.rows[0]?.request_status ?? 'accepted';
      await client.query('COMMIT');
      const conversationId = existingResult.rows[0].id;
      reply.code(200);
      return {
        ok: true,
        conversation: {
          id: conversationId,
          type: 'dm' as const,
          title: null,
          itemId: payload.itemId ?? null,
          ownerId: actorUserId,
          participantIds: [actorUserId, payload.recipientUserId],
          requestStatus: existingRequestStatus,
        },
      };
    }

    const conversationId = createRuntimeId('chatdm');

    await client.query(
      `
        INSERT INTO chat_conversations (
          id, type, title, owner_id, item_id, metadata, dm_pair_key
        )
        VALUES ($1, 'dm', NULL, $2, $3, $4::jsonb, $5)
      `,
      [
        conversationId,
        actorUserId,
        payload.itemId ?? null,
        toJsonString({ createdVia: 'chat_dm_api' }),
        dmPairKey,
      ]
    );

    await client.query(
      `INSERT INTO chat_members (conversation_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [conversationId, actorUserId]
    );
    await client.query(
      `INSERT INTO chat_members (conversation_id, user_id, role) VALUES ($1, $2, 'member')`,
      [conversationId, payload.recipientUserId]
    );

    // P0.13: Create per-user conversation state with the correct request
    // status. The sender is always 'accepted' (they initiated). The recipient
    // gets 'pending' if their privacy settings require it.
    await client.query(
      `INSERT INTO chat_conversation_user_state (user_id, conversation_id, request_status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT (user_id, conversation_id) DO NOTHING`,
      [actorUserId, conversationId]
    );
    await client.query(
      `INSERT INTO chat_conversation_user_state (user_id, conversation_id, request_status)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, conversation_id)
       DO UPDATE SET request_status = EXCLUDED.request_status, updated_at = NOW()`,
      [payload.recipientUserId, conversationId, requestStatus]
    );

    await client.query(
      `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.dm.created',
      payload: {
        conversationId,
        ownerId: actorUserId,
        participantIds: [actorUserId, payload.recipientUserId],
        requestStatus,
      },
    });

    // Only notify the recipient if the request is accepted (pending requests
    // appear in the Requests inbox, not as push notifications)
    if (requestStatus === 'accepted') {
      try {
        await queueUserNotification({
          userId: payload.recipientUserId,
          title: 'New conversation',
          body: 'Someone started a conversation with you.',
          payload: {
            conversationId,
            event: 'chat_dm_created',
          },
          metadata: {
            source: 'chat.dm.create',
          },
        });
      } catch (error) {
        request.log.error(
          { err: error, conversationId, recipientUserId: payload.recipientUserId },
          'Failed to queue DM notification'
        );
      }
    }

    reply.code(201);
    return {
      ok: true,
      conversation: {
        id: conversationId,
        type: 'dm' as const,
        title: null,
        itemId: payload.itemId ?? null,
        ownerId: actorUserId,
        participantIds: [actorUserId, payload.recipientUserId],
        requestStatus,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.post('/chat/groups', async (request, reply) => {
  const bodySchema = z.object({
    title: z.string().trim().min(2).max(80),
    memberIds: z.array(z.string().trim().min(2)).max(48).default([]),
    itemId: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(280).optional(),
    avatar: z.string().trim().max(512).optional(),
    avatarFinalizationId: z.string().trim().min(2).max(120).optional(),
    coverPhoto: z.string().trim().max(512).optional(),
    coverPhotoFinalizationId: z.string().trim().min(2).max(120).optional(),
  }).superRefine((value, context) => {
    if (value.avatar && !value.avatarFinalizationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['avatarFinalizationId'],
        message: 'A finalized upload receipt is required for a group photo',
      });
    }
    if (value.coverPhoto && !value.coverPhotoFinalizationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coverPhotoFinalizationId'],
        message: 'A finalized upload receipt is required for a cover photo',
      });
    }
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const payload = bodySchema.parse(request.body ?? {});
  const title = payload.title.trim();

  const idempotencyKey = resolveHeaderString(request.headers['x-idempotency-key']);
  const requestHash = hashGroupCreatePayload(payload);

  const normalizedMemberIds = [...new Set([actorUserId, ...payload.memberIds.map((value) => value.trim())])]
    .filter((value) => value.length > 0);

  await Promise.all(normalizedMemberIds.map((memberId) => ensureUserExists(memberId)));

  if (payload.avatar && payload.avatarFinalizationId) {
    await ensureOwnedGroupAvatarReceipt(db, {
      actorUserId,
      finalizationId: payload.avatarFinalizationId,
      avatarUrl: payload.avatar,
    });
  }

  if (payload.coverPhoto && payload.coverPhotoFinalizationId) {
    await ensureOwnedGroupMediaReceipt(db, {
      actorUserId,
      finalizationId: payload.coverPhotoFinalizationId,
      mediaUrl: payload.coverPhoto,
      folder: 'covers',
      scope: 'cover',
    });
  }

  if (payload.itemId) {
    const listingResult = await db.query<{ id: string }>(
      `
        SELECT id
        FROM listings
        WHERE id = $1
        LIMIT 1
      `,
      [payload.itemId]
    );

    if (!listingResult.rowCount) {
      throw createApiError('LISTING_NOT_FOUND', 'Listing not found for group context', {
        itemId: payload.itemId,
      });
    }
  }

  const conversationId = createRuntimeId('chatgrp');
  const client = await db.connect();
  let createdMessage: { id: string; createdAt: string } | null = null;
  let cachedResponse: Record<string, unknown> | null = null;

  try {
    await client.query('BEGIN');

    if (idempotencyKey) {
      cachedResponse = await getChatGroupIdempotentResponse(client, {
        creatorId: actorUserId,
        idempotencyKey,
        requestHash,
      });

      if (cachedResponse) {
        await client.query('COMMIT');
        reply.code(201);
        return cachedResponse;
      }
    }

    await client.query(
      `
        INSERT INTO chat_conversations (
          id,
          type,
          title,
          owner_id,
          item_id,
          metadata
        )
        VALUES ($1, 'group', $2, $3, $4, $5::jsonb)
      `,
      [
        conversationId,
        title,
        actorUserId,
        payload.itemId ?? null,
        toJsonString({
          createdVia: 'chat_groups_api',
          ...(payload.description ? { description: payload.description } : {}),
          ...(payload.avatar ? { avatar: payload.avatar } : {}),
          ...(payload.avatarFinalizationId
            ? { avatarFinalizationId: payload.avatarFinalizationId }
            : {}),
          ...(payload.coverPhoto ? { coverPhoto: payload.coverPhoto } : {}),
          ...(payload.coverPhotoFinalizationId
            ? { coverPhotoFinalizationId: payload.coverPhotoFinalizationId }
            : {}),
        }),
      ]
    );

    for (const memberId of normalizedMemberIds) {
      await client.query(
        `
          INSERT INTO chat_members (conversation_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (conversation_id, user_id) DO NOTHING
        `,
        [conversationId, memberId, memberId === actorUserId ? 'owner' : 'member']
      );
    }

    createdMessage = await appendSystemChatMessage(client, {
      conversationId,
      text: `${title} was created.`,
      metadata: {
        event: 'group_created',
        actorUserId,
      },
    });

    await client.query(
      `
        UPDATE chat_conversations
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [conversationId]
    );

    const responsePayload = {
      ok: true,
      conversation: {
        id: conversationId,
        type: 'group' as const,
        title,
        itemId: payload.itemId ?? null,
        ownerId: actorUserId,
        description: payload.description ?? null,
        avatar: payload.avatar ?? null,
        coverPhoto: payload.coverPhoto ?? null,
        participantIds: normalizedMemberIds,
        memberRoles: Object.fromEntries(
          normalizedMemberIds.map((memberId) => [
            memberId,
            memberId === actorUserId ? 'owner' : 'member',
          ])
        ),
        botIds: [] as string[],
        lastMessage: createdMessage?.createdAt ? `${title} was created.` : 'Group created',
        lastMessageTime: createdMessage?.createdAt ?? new Date().toISOString(),
        unread: false,
      },
      initialMessage: createdMessage
        ? {
            id: createdMessage.id,
            senderType: 'system' as const,
            senderUserId: null,
            senderBotId: null,
            body: `${title} was created.`,
            metadata: {
              event: 'group_created',
              actorUserId,
            },
            createdAt: createdMessage.createdAt,
          }
        : null,
    };

    if (idempotencyKey) {
      await saveChatGroupIdempotentResponse(client, {
        creatorId: actorUserId,
        idempotencyKey,
        requestHash,
        conversationId,
        responsePayload,
      });
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const notifyMemberIds = normalizedMemberIds.filter((memberId) => memberId !== actorUserId);
  await Promise.all(
    notifyMemberIds.map(async (memberId) => {
      try {
        await queueUserNotification({
          userId: memberId,
          title: 'You were added to a group chat',
          body: `${title} is now active in Thryftverse chat.`,
          payload: {
            conversationId,
            event: 'chat_group_added',
          },
          metadata: {
            source: 'chat.groups.create',
          },
        });
      } catch (error) {
        request.log.error(
          {
            err: error,
            conversationId,
            memberId,
          },
          'Failed to queue group add notification'
        );
      }
    })
  );

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.group.created',
    payload: {
      conversationId,
      title,
      ownerId: actorUserId,
      description: payload.description ?? null,
      avatar: payload.avatar ?? null,
      participantIds: normalizedMemberIds,
      memberRoles: Object.fromEntries(
        normalizedMemberIds.map((memberId) => [
          memberId,
          memberId === actorUserId ? 'owner' : 'member',
        ])
      ),
    },
  });

  reply.code(201);
  return {
    ok: true,
    conversation: {
      id: conversationId,
      type: 'group' as const,
      title,
      itemId: payload.itemId ?? null,
      ownerId: actorUserId,
      description: payload.description ?? null,
      avatar: payload.avatar ?? null,
      participantIds: normalizedMemberIds,
      memberRoles: Object.fromEntries(
        normalizedMemberIds.map((memberId) => [
          memberId,
          memberId === actorUserId ? 'owner' : 'member',
        ])
      ),
      botIds: [] as string[],
      lastMessage: createdMessage?.createdAt ? `${title} was created.` : 'Group created',
      lastMessageTime: createdMessage?.createdAt ?? new Date().toISOString(),
      unread: false,
    },
    initialMessage: createdMessage
      ? {
          id: createdMessage.id,
          senderType: 'system' as const,
          senderUserId: null,
          senderBotId: null,
          body: `${title} was created.`,
          metadata: {
            event: 'group_created',
            actorUserId,
          },
          createdAt: createdMessage.createdAt,
        }
      : null,
  };
});

app.get('/chat/conversations', async (request) => {
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(120).default(40),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { limit } = querySchema.parse(request.query ?? {});

  const conversationsResult = await db.query<{
    id: string;
    type: ChatConversationType;
    title: string | null;
    owner_id: string;
    item_id: string | null;
    metadata: Record<string, unknown> | null;
    updated_at: string;
    last_message: string | null;
    last_message_created_at: string | null;
    last_message_id: string | null;
    last_message_ciphertext: string | null;
    last_message_key_version: number | null;
  }>(
    `
      SELECT
        c.id,
        c.type,
        c.title,
        c.owner_id,
        c.item_id,
        c.metadata,
        c.updated_at::text,
        lm.body AS last_message,
        lm.created_at::text AS last_message_created_at,
        lm.id AS last_message_id,
        lm.body_ciphertext AS last_message_ciphertext,
        lm.key_version AS last_message_key_version
      FROM chat_conversations c
      INNER JOIN chat_members cm
        ON cm.conversation_id = c.id
      LEFT JOIN LATERAL (
        SELECT id, body, body_ciphertext, key_version, created_at
        FROM chat_messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) lm ON TRUE
      WHERE cm.user_id = $1
      ORDER BY COALESCE(lm.created_at, c.updated_at) DESC
      LIMIT $2
    `,
    [actorUserId, limit]
  );

  const conversationIds = conversationsResult.rows.map((row) => row.id);
  if (!conversationIds.length) {
    return {
      ok: true,
      items: [],
    };
  }

  const [memberRows, botRows, stateRows, readStateRows, blockedMemberRows] = await Promise.all([
    db.query<{
      conversation_id: string;
      user_id: string;
      role: ChatGroupMemberRole;
      username: string;
      display_name: string | null;
      avatar: string | null;
      email_verified_at: string | null;
    }>(
      `
        SELECT
          cm.conversation_id,
          cm.user_id,
          cm.role,
          u.username,
          u.display_name,
          u.avatar,
          u.email_verified_at::text
        FROM chat_members cm
        INNER JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ANY($1::text[])
        ORDER BY cm.joined_at ASC
      `,
      [conversationIds]
    ),
    db.query<{ conversation_id: string; bot_id: string }>(
      `
        SELECT conversation_id, bot_id
        FROM chat_bot_installs
        WHERE conversation_id = ANY($1::text[])
        ORDER BY installed_at ASC
      `,
      [conversationIds]
    ),
    db.query<{
      conversation_id: string;
      is_muted: boolean;
      is_archived: boolean;
      request_status: string;
      pinned_rank: number;
      marked_unread_message_id: string | null;
    }>(
      `
        SELECT conversation_id, is_muted, is_archived, request_status, pinned_rank, marked_unread_message_id
        FROM chat_conversation_user_state
        WHERE user_id = $1 AND conversation_id = ANY($2::text[])
      `,
      [actorUserId, conversationIds]
    ),
    db.query<{
      conversation_id: string;
      last_read_at: string | null;
    }>(
      `
        SELECT conversation_id, last_read_at::text
        FROM chat_members
        WHERE user_id = $1 AND conversation_id = ANY($2::text[])
      `,
      [actorUserId, conversationIds]
    ),
    db.query<{ conversation_id: string }>(
      `
        SELECT cm.conversation_id
        FROM chat_members cm
        INNER JOIN user_blocks ub ON ub.blocked_id = cm.user_id
        WHERE cm.conversation_id = ANY($1::text[])
          AND ub.blocker_id = $2
      `,
      [conversationIds, actorUserId]
    ),
  ]);

  const blockedConversationIds = new Set(blockedMemberRows.rows.map((r) => r.conversation_id));

  const membersByConversation = new Map<string, string[]>();
  const rolesByConversation = new Map<string, Record<string, ChatGroupMemberRole>>();
  const memberProfilesByConversation = new Map<string, Array<{
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    emailVerified: boolean;
  }>>();
  for (const row of memberRows.rows) {
    const current = membersByConversation.get(row.conversation_id) ?? [];
    current.push(row.user_id);
    membersByConversation.set(row.conversation_id, current);
    const roles = rolesByConversation.get(row.conversation_id) ?? {};
    roles[row.user_id] = row.role;
    rolesByConversation.set(row.conversation_id, roles);
    const profiles = memberProfilesByConversation.get(row.conversation_id) ?? [];
    profiles.push({
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      emailVerified: Boolean(row.email_verified_at),
    });
    memberProfilesByConversation.set(row.conversation_id, profiles);
  }

  const botsByConversation = new Map<string, string[]>();
  for (const row of botRows.rows) {
    const current = botsByConversation.get(row.conversation_id) ?? [];
    current.push(row.bot_id);
    botsByConversation.set(row.conversation_id, current);
  }

  const stateByConversation = new Map<string, { isMuted: boolean; isArchived: boolean; requestStatus: string; pinnedRank: number; markedUnreadMessageId: string | null }>();
  for (const row of stateRows.rows) {
    stateByConversation.set(row.conversation_id, {
      isMuted: row.is_muted,
      isArchived: row.is_archived,
      requestStatus: row.request_status,
      pinnedRank: row.pinned_rank,
      markedUnreadMessageId: row.marked_unread_message_id,
    });
  }

  // Build last_read_at map for unread computation.
  const lastReadByConversation = new Map<string, string | null>();
  for (const row of readStateRows.rows) {
    lastReadByConversation.set(row.conversation_id, row.last_read_at);
  }

  // PII encryption: decrypt last-message preview for each conversation.
  await Promise.all(conversationsResult.rows.map(async (row) => {
    if (row.last_message !== null && row.last_message_id) {
      row.last_message = await resolveMessageBody(
        row.last_message_id,
        row.last_message,
        row.last_message_ciphertext ?? null,
      );
    }
  }));

  const contextEntries = conversationsResult.rows.map((row) => ({
    conversationId: row.id,
    itemId: row.item_id,
  }));
  const contextByConversation = await resolveConversationsContextBatch(db, contextEntries);

  return {
    ok: true,
    items: conversationsResult.rows.map((row) => {
      const state = stateByConversation.get(row.id);
      const metadata = asObject(row.metadata);
      return {
        id: row.id,
        type: row.type,
        title: row.title,
        ownerId: row.owner_id,
        description: typeof metadata.description === 'string' ? metadata.description : null,
        avatar: typeof metadata.avatar === 'string' ? metadata.avatar : null,
        coverPhoto: typeof metadata.coverPhoto === 'string' ? metadata.coverPhoto : null,
        itemId: row.item_id,
        participantIds: membersByConversation.get(row.id) ?? [],
        memberRoles: rolesByConversation.get(row.id) ?? {},
        participantProfiles: memberProfilesByConversation.get(row.id) ?? [],
        botIds: botsByConversation.get(row.id) ?? [],
        lastMessage: row.last_message ?? (row.type === 'group' ? `${row.title ?? 'Group'} created.` : 'No messages yet'),
        lastMessageTime: row.last_message_created_at ?? row.updated_at,
        unread: (() => {
          const lastRead = lastReadByConversation.get(row.id);
          const lastMsgTime = row.last_message_created_at ?? row.updated_at;
          if (!lastRead || !lastMsgTime) return false;
          return new Date(lastRead) < new Date(lastMsgTime);
        })(),
        isMuted: state?.isMuted ?? false,
        isArchived: state?.isArchived ?? false,
        requestStatus: state?.requestStatus ?? 'accepted',
        pinnedRank: state?.pinnedRank ?? 0,
        markedUnread: Boolean(state?.markedUnreadMessageId),
        isBlocked: blockedConversationIds.has(row.id),
        context: contextByConversation.get(row.id) ?? null,
      };
    }),
  };
});

// ── Conversation shared media ──────────────────────────────────────────────
// Read-only media listing for group-info media tabs and the full gallery.
// Media lives on chat_messages.metadata (mediaUri/mediaType). Returns the
// newest `limit` non-deleted media messages so paginated history no longer
// hides media that has scrolled out of the local cache (live-signs §37.2).
app.get('/chat/conversations/:conversationId/media', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(90),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const { limit } = querySchema.parse(request.query ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const result = await db.query<{
    id: string;
    sender_user_id: string | null;
    sender_bot_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>(
    `SELECT m.id, m.sender_user_id, m.sender_bot_id, m.metadata, m.created_at::text
     FROM chat_messages m
     WHERE m.conversation_id = $1
       AND m.deleted_for_everyone_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM chat_message_deletions cmd WHERE cmd.message_id = m.id AND cmd.user_id = $3)
       AND m.metadata ? 'mediaUri'
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $2`,
    [conversationId, limit, actorUserId]
  );

  const items = result.rows
    .map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const mediaUri = typeof meta.mediaUri === 'string' ? meta.mediaUri : null;
      if (!mediaUri) return null;
      const rawType = typeof meta.mediaType === 'string' ? meta.mediaType : '';
      const mediaType = rawType === 'video' ? 'video' : rawType === 'document' ? 'document' : 'image';
      return {
        id: row.id,
        mediaUri,
        mediaType,
        senderUserId: row.sender_user_id ?? row.sender_bot_id ?? null,
        createdAt: row.created_at,
        ...(rawType === 'document' ? {
          documentName: typeof meta.documentName === 'string' ? meta.documentName : undefined,
          documentMimeType: typeof meta.documentMimeType === 'string' ? meta.documentMimeType : undefined,
        } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return { ok: true, items };
});

app.get('/chat/conversations/:conversationId/messages', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  // P0.3: Keyset pagination on (created_at, id). Default returns the NEWEST
  // page (descending), reversed for display. `before` cursor fetches older
  // messages; `after` fetches newer ones. `aroundMessageId` fetches context
  // around a specific message (used for jump-to-result and reply scroll).
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(250).default(50),
    before: z.string().min(2).max(120).optional(),
    after: z.string().min(2).max(120).optional(),
    aroundMessageId: z.string().min(2).max(120).optional(),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const { limit, before, after, aroundMessageId } = querySchema.parse(request.query ?? {});

  const conversation = await ensureChatConversationAccess(db, conversationId, actorUserId);

  const messagesContextMap = await resolveConversationsContextBatch(db, [
    { conversationId, itemId: conversation.item_id },
  ]);
  const messagesContext = messagesContextMap.get(conversationId) ?? null;

  // â”€â”€ aroundMessageId: fetch a window centered on a message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (aroundMessageId) {
    const centerResult = await db.query<{ created_at: string; id: string }>(
      `SELECT created_at::text, id FROM chat_messages
       WHERE id = $1 AND conversation_id = $2 LIMIT 1`,
      [aroundMessageId, conversationId]
    );
    if (centerResult.rowCount) {
      const center = centerResult.rows[0];
      const halfLimit = Math.ceil(limit / 2);
      const older = await db.query<{
        id: string;
        sender_type: ChatSenderType;
        sender_user_id: string | null;
        sender_bot_id: string | null;
        body: string;
        body_ciphertext: string | null;
        key_version: number | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
        client_message_id: string | null;
        reply_to_message_id: string | null;
        deleted_for_everyone_at: string | null;
        edit_version: number;
        edited_at: string | null;
      }>(
        `SELECT m.id, m.sender_type, m.sender_user_id, m.sender_bot_id, m.body,
                m.body_ciphertext, m.key_version,
                m.metadata, m.created_at::text, m.client_message_id,
                m.reply_to_message_id, m.deleted_for_everyone_at,
                m.edit_version, m.edited_at::text
         FROM chat_messages m
         WHERE m.conversation_id = $1
           AND m.deleted_for_everyone_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM chat_message_deletions cmd WHERE cmd.message_id = m.id AND cmd.user_id = $5)
           AND (m.created_at, m.id) < ($2, $3)
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $4`,
        [conversationId, center.created_at, center.id, halfLimit, actorUserId]
      );
      const newer = await db.query<{
        id: string;
        sender_type: ChatSenderType;
        sender_user_id: string | null;
        sender_bot_id: string | null;
        body: string;
        body_ciphertext: string | null;
        key_version: number | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
        client_message_id: string | null;
        reply_to_message_id: string | null;
        deleted_for_everyone_at: string | null;
        edit_version: number;
        edited_at: string | null;
      }>(
        `SELECT m.id, m.sender_type, m.sender_user_id, m.sender_bot_id, m.body,
                m.body_ciphertext, m.key_version,
                m.metadata, m.created_at::text, m.client_message_id,
                m.reply_to_message_id, m.deleted_for_everyone_at,
                m.edit_version, m.edited_at::text
         FROM chat_messages m
         WHERE m.conversation_id = $1
           AND m.deleted_for_everyone_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM chat_message_deletions cmd WHERE cmd.message_id = m.id AND cmd.user_id = $5)
           AND (m.created_at, m.id) >= ($2, $3)
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT $4`,
        [conversationId, center.created_at, center.id, limit - halfLimit, actorUserId]
      );
      // Combine: older (reversed to ASC) + newer (already ASC)
      const items = [...older.rows.reverse(), ...newer.rows];
      // PII encryption: decrypt message bodies before serialization.
      await Promise.all(items.map(async (row) => {
        row.body = await resolveMessageBody(row.id, row.body, row.body_ciphertext ?? null);
      }));
      return {
        ok: true,
        conversation: {
          id: conversation.id,
          type: conversation.type,
          title: conversation.title,
          ownerId: conversation.owner_id,
          itemId: conversation.item_id,
          context: messagesContext,
        },
        items: await serializeChatMessageRows(items, actorUserId),
        hasMore: older.rows.length >= halfLimit,
        oldestCursor: items.length > 0
          ? `${items[0].created_at}|${items[0].id}` : null,
        newestCursor: items.length > 0
          ? `${items[items.length - 1].created_at}|${items[items.length - 1].id}` : null,
      };
    }
  }

  // â”€â”€ Cursor-based keyset pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Default (no cursor): return the NEWEST page.
  // `before`: messages older than the cursor (for scrolling up in history).
  // `after`: messages newer than the cursor ( for catching up after a gap).
  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;
  if (before || after) {
    const cursorStr = (before ?? after) as string;
    const sepIdx = cursorStr.lastIndexOf('|');
    if (sepIdx > 0) {
      cursorCreatedAt = cursorStr.slice(0, sepIdx);
      cursorId = cursorStr.slice(sepIdx + 1);
    }
  }

  const isAfter = Boolean(after);
  const result = await db.query<{
    id: string;
    sender_type: ChatSenderType;
    sender_user_id: string | null;
    sender_bot_id: string | null;
    body: string;
    body_ciphertext: string | null;
    key_version: number | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    client_message_id: string | null;
    reply_to_message_id: string | null;
    deleted_for_everyone_at: string | null;
    edit_version: number;
    edited_at: string | null;
  }>(
    `
      SELECT m.id, m.sender_type, m.sender_user_id, m.sender_bot_id, m.body,
             m.body_ciphertext, m.key_version,
             m.metadata, m.created_at::text, m.client_message_id,
             m.reply_to_message_id, m.deleted_for_everyone_at,
             m.edit_version, m.edited_at::text
      FROM chat_messages m
      WHERE m.conversation_id = $1
        AND m.deleted_for_everyone_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM chat_message_deletions cmd WHERE cmd.message_id = m.id AND cmd.user_id = ${cursorCreatedAt ? '$5' : '$3'})
        ${cursorCreatedAt ? (isAfter
          ? 'AND (m.created_at, m.id) > ($2, $3)'
          : 'AND (m.created_at, m.id) < ($2, $3)')
          : ''}
      ORDER BY m.created_at ${isAfter ? 'ASC' : 'DESC'}, m.id ${isAfter ? 'ASC' : 'DESC'}
      LIMIT $${cursorCreatedAt ? '4' : '2'}
    `,
    cursorCreatedAt
      ? [conversationId, cursorCreatedAt, cursorId, limit, actorUserId]
      : [conversationId, limit, actorUserId]
  );

  // For `before` and default (DESC query), reverse to chronological ASC for display.
  // For `after` (ASC query), keep as-is.
  const items = isAfter ? result.rows : result.rows.reverse();

  // PII encryption: decrypt message bodies before serialization.
  await Promise.all(items.map(async (row) => {
    row.body = await resolveMessageBody(row.id, row.body, row.body_ciphertext ?? null);
  }));

  return {
    ok: true,
    conversation: {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      ownerId: conversation.owner_id,
      itemId: conversation.item_id,
      context: messagesContext,
    },
    items: await serializeChatMessageRows(items, actorUserId),
    hasMore: result.rows.length >= limit,
    oldestCursor: items.length > 0
      ? `${items[0].created_at}|${items[0].id}` : null,
    newestCursor: items.length > 0
      ? `${items[items.length - 1].created_at}|${items[items.length - 1].id}` : null,
  };
});

app.post('/chat/conversations/:conversationId/messages', {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: '1 minute',
    },
  },
  // Fastify JSON Schema â€” framework-level defence-in-depth per OWASP API
  // security best practices. Validates structure before the handler runs;
  // Zod in the handler provides semantic validation as a second layer.
  schema: {
    params: {
      type: 'object',
      required: ['conversationId'],
      properties: {
        conversationId: { type: 'string', minLength: 2, maxLength: 120 },
      },
    },
    body: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['text', 'image', 'video', 'voice', 'document'] },
        text: { type: 'string', maxLength: 4000 },
        mediaUri: { type: 'string', minLength: 1, maxLength: 2048 },
        metadata: { type: 'object' },
        clientMessageId: { type: 'string', minLength: 1, maxLength: 120 },
        replyToMessageId: { type: 'string', minLength: 2, maxLength: 120 },
      },
      additionalProperties: false,
    },
  },
}, async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  // P0-MSG-1: Discriminated message payload. Text is required only for
  // `type: 'text'` (or when `type` is absent for backwards compatibility).
  // Image/video messages require a `mediaUri` and may omit the caption.
  // Voice messages (report 19) require a `mediaUri` plus voice metadata
  // (durationMs, container, codec) and are never sent without a finalized
  // audio asset â€” the client must upload + finalize before sending.
  const bodySchema = z
    .object({
      type: z.enum(['text', 'image', 'video', 'voice', 'document', 'poll']).optional(),
      text: z.string().trim().max(4000).optional(),
      mediaUri: z.string().min(1).max(2048).optional(),
      metadata: z.record(z.unknown()).optional(),
      clientMessageId: z.string().trim().min(1).max(120).optional(),
      replyToMessageId: z.string().trim().min(2).max(120).optional(),
    })
    .superRefine((val, ctx) => {
      const isMedia = val.type === 'image' || val.type === 'video';
      const isVoice = val.type === 'voice';
      const isDocument = val.type === 'document';
      if (isMedia) {
        if (!val.mediaUri || val.mediaUri.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'mediaUri is required for image/video messages',
            path: ['mediaUri'],
          });
        }
      } else if (isDocument) {
        if (!val.mediaUri || val.mediaUri.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'mediaUri is required for document messages',
            path: ['mediaUri'],
          });
        }
      } else if (isVoice) {
        if (!val.mediaUri || val.mediaUri.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'mediaUri is required for voice messages',
            path: ['mediaUri'],
          });
        }
        const meta = val.metadata ?? {};
        const durationMs = meta.durationMs ?? meta.duration_ms;
        if (typeof durationMs !== 'number' || durationMs <= 0 || durationMs > 120_000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'durationMs must be a positive number up to 120000 (2 minutes)',
            path: ['metadata', 'durationMs'],
          });
        }
        const container = meta.container ?? meta.audioContainer;
        if (typeof container !== 'string' || !['m4a', 'ogg', 'webm', 'mp4'].includes(container)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'container must be one of m4a, ogg, webm, mp4',
            path: ['metadata', 'container'],
          });
        }
        const codec = meta.codec ?? meta.audioCodec;
        if (typeof codec !== 'string' || !['aac', 'opus', 'mp3'].includes(codec)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'codec must be one of aac, opus, mp3',
            path: ['metadata', 'codec'],
          });
        }
      } else if (val.type === 'poll') {
        const meta = val.metadata ?? {};
        const question = meta.question;
        const options = meta.options;
        if (typeof question !== 'string' || question.trim().length < 1 || question.length > 200) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'metadata.question is required (1-200 chars) for poll messages',
            path: ['metadata', 'question'],
          });
        }
        if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'metadata.options must be an array of 2-10 strings for poll messages',
            path: ['metadata', 'options'],
          });
        } else if (options.some((o: unknown) => typeof o !== 'string' || o.trim().length < 1 || o.length > 100)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'each poll option must be a non-empty string (max 100 chars)',
            path: ['metadata', 'options'],
          });
        }
      } else {
        // `type: 'text'` or absent — backwards-compatible text message.
        if (!val.text || val.text.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'text is required for text messages',
            path: ['text'],
          });
        }
      }
    });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});

  const isMediaMessage = payload.type === 'image' || payload.type === 'video';
  const isVoiceMessage = payload.type === 'voice';
  const isDocumentMessage = payload.type === 'document';
  // `body` is NOT NULL in chat_messages; media-only and voice messages use
  // an empty string so the column constraint is satisfied while the media
  // URI lives in metadata for the read path.
  const bodyText = payload.text ?? '';
  const mergedMetadata: Record<string, unknown> = {
    ...(payload.metadata ?? {}),
    ...(isMediaMessage
      ? { mediaUri: payload.mediaUri, mediaType: payload.type }
      : {}),
    ...(isVoiceMessage
      ? { mediaUri: payload.mediaUri, mediaType: 'voice', voiceMessage: true }
      : {}),
    ...(isDocumentMessage
      ? { mediaUri: payload.mediaUri, mediaType: 'document', documentUri: payload.mediaUri, ...(payload.metadata ?? {}) }
      : {}),
  };

  await ensureUserExists(actorUserId);
  const conversation = await ensureChatConversationAccess(db, conversationId, actorUserId);

  if (conversation.type === 'group') {
    await ensureGroupCapabilityAccess(
      db,
      conversationId,
      actorUserId,
      'send_messages',
      request.authUser?.role,
    );
  }

  if (conversation.type === 'dm') {
    const recipientIdResult = await db.query<{ user_id: string }>(
      `SELECT user_id FROM chat_members
       WHERE conversation_id = $1 AND user_id <> $2
       LIMIT 1`,
      [conversationId, actorUserId],
    );
    const recipientId = recipientIdResult.rows[0]?.user_id;
    if (recipientId) {
      const blockCheck = await db.query<{ id: string }>(
        `SELECT id FROM user_blocks
         WHERE blocker_id = $1 AND blocked_id = $2
         LIMIT 1`,
        [recipientId, actorUserId],
      );
      if (blockCheck.rowCount) {
        reply.code(403);
        return {
          ok: false,
          error: 'You cannot send messages to this user',
          code: 'BLOCKED_BY_RECIPIENT',
        };
      }
    }
  }

  const scamScan = scanMessageForScamPatterns(bodyText);
  if (scamScan.severity === 'high') {
    reply.code(400);
    return {
      ok: false,
      error: 'This message contains patterns associated with scams. Please keep payments on the platform.',
    };
  }
  if (scamScan.severity === 'medium') {
    mergedMetadata.scamWarning = true;
    mergedMetadata.scamPatterns = scamScan.patterns;
  } else if (scamScan.flagged) {
    request.log.info(
      {
        conversationId,
        actorUserId,
        patterns: scamScan.patterns,
        severity: scamScan.severity,
      },
      'messageScamScanner.lowSeverityFlag — analytics only',
    );
  }

  const actorStateResult = await db.query<{ request_status: string | null }>(
    `SELECT request_status FROM chat_conversation_user_state
     WHERE user_id = $1 AND conversation_id = $2 LIMIT 1`,
    [actorUserId, conversationId],
  );
  const actorRequestStatus = actorStateResult.rowCount ? actorStateResult.rows[0].request_status : null;
  if (actorRequestStatus === 'pending' || actorRequestStatus === 'declined') {
    reply.code(403);
    return { ok: false, error: 'Message request has not been accepted' };
  }

  // P0.8: Validate reply target â€” must exist in this conversation and not be
  // deleted-for-everyone. This prevents cross-conversation reply spoofing.
  if (payload.replyToMessageId) {
    const replyTarget = await db.query<{ id: string }>(
      `SELECT id FROM chat_messages
       WHERE id = $1 AND conversation_id = $2 AND deleted_for_everyone_at IS NULL
       LIMIT 1`,
      [payload.replyToMessageId, conversationId]
    );
    if (!replyTarget.rowCount) {
      reply.code(400);
      return { ok: false, error: 'Reply target message not found in this conversation' };
    }
  }

  // P0-MSG-2: Idempotent replay. If the client retried a send after a dropped
  // response, the same clientMessageId will be presented. Return the original
  // message instead of creating a duplicate. The partial unique index on
  // (conversation_id, sender_user_id, client_message_id) is the race-condition
  // backstop; this lookup is the fast path.
  if (payload.clientMessageId) {
    const existing = await db.query<{
      id: string;
      body: string;
      body_ciphertext: string | null;
      key_version: number | null;
      metadata: Record<string, unknown>;
      created_at: string;
      client_message_id: string | null;
      reply_to_message_id: string | null;
    }>(
      `
        SELECT id, body, body_ciphertext, key_version, metadata, created_at::text, client_message_id, reply_to_message_id
        FROM chat_messages
        WHERE conversation_id = $1
          AND sender_user_id = $2
          AND client_message_id = $3
        LIMIT 1
      `,
      [conversationId, actorUserId, payload.clientMessageId]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const row = existing.rows[0];
      // PII encryption: resolve body from ciphertext or plaintext fallback.
      const resolvedBody = await resolveMessageBody(row.id, row.body, row.body_ciphertext ?? null);
      reply.code(201);
      return {
        ok: true,
        message: {
          id: row.id,
          senderType: 'user' as const,
          senderUserId: actorUserId,
          senderBotId: null,
          body: resolvedBody,
          metadata: row.metadata ?? {},
          createdAt: row.created_at,
          clientMessageId: row.client_message_id ?? undefined,
          replyToMessageId: row.reply_to_message_id ?? undefined,
        },
      };
    }
  }

  const messageId = createRuntimeId('chatmsg');
  // PII encryption dual-write: encrypt the body before INSERT. On failure,
  // store plaintext so the backfill worker can encrypt later.
  let bodyToStore = bodyText;
  let bodyCiphertext: string | null = null;
  let keyVersion: number | null = null;
  try {
    const encrypted = await encryptMessageBody(messageId, bodyText);
    bodyCiphertext = encrypted.ciphertext;
    keyVersion = encrypted.keyVersion;
    bodyToStore = '[encrypted]';
  } catch (err) {
    logger.warn(
      { messageId, err: err instanceof Error ? err.message : String(err) },
      'messageEncryption.encryptFailed â€” storing plaintext for backfill',
    );
  }
  const result = await db.query<{ id: string; created_at: string }>(
    `
      INSERT INTO chat_messages (
        id,
        conversation_id,
        sender_type,
        sender_user_id,
        sender_bot_id,
        body,
        body_ciphertext,
        key_version,
        metadata,
        client_message_id,
        reply_to_message_id
      )
      VALUES ($1, $2, 'user', $3, NULL, $4, $5, $6, $7::jsonb, $8, $9)
      ON CONFLICT (conversation_id, sender_user_id, client_message_id)
        WHERE client_message_id IS NOT NULL
      DO NOTHING
      RETURNING id, created_at::text
    `,
    [
      messageId,
      conversationId,
      actorUserId,
      bodyToStore,
      bodyCiphertext,
      keyVersion,
      toJsonString(mergedMetadata),
      payload.clientMessageId ?? null,
      payload.replyToMessageId ?? null,
    ]
  );

  // P0-MSG-2: Race-condition backstop. Two concurrent retries with the same
  // clientMessageId can both pass the SELECT lookup above. The partial unique
  // index makes the second INSERT a no-op (DO NOTHING); detect that and
  // replay the winning row so the client still gets a 201 with the message.
  if (result.rowCount === 0 && payload.clientMessageId) {
    const existing = await db.query<{
      id: string;
      body: string;
      body_ciphertext: string | null;
      key_version: number | null;
      metadata: Record<string, unknown>;
      created_at: string;
      client_message_id: string | null;
      reply_to_message_id: string | null;
    }>(
      `
        SELECT id, body, body_ciphertext, key_version, metadata, created_at::text, client_message_id, reply_to_message_id
        FROM chat_messages
        WHERE conversation_id = $1
          AND sender_user_id = $2
          AND client_message_id = $3
        LIMIT 1
      `,
      [conversationId, actorUserId, payload.clientMessageId]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const row = existing.rows[0];
      // PII encryption: resolve body from ciphertext or plaintext fallback.
      const resolvedBody = await resolveMessageBody(row.id, row.body, row.body_ciphertext ?? null);
      reply.code(201);
      return {
        ok: true,
        message: {
          id: row.id,
          senderType: 'user' as const,
          senderUserId: actorUserId,
          senderBotId: null,
          body: resolvedBody,
          metadata: row.metadata ?? {},
          createdAt: row.created_at,
          clientMessageId: row.client_message_id ?? undefined,
          replyToMessageId: row.reply_to_message_id ?? undefined,
        },
      };
    }
  }

  if ((isMediaMessage || isVoiceMessage || isDocumentMessage) && payload.mediaUri) {
    const mediaUri = payload.mediaUri;
    if (mediaUri.includes('/media/')) {
      const assetResult = await db.query<{
        id: string;
        owner_id: string;
        canonical_url: string | null;
        status: string;
        media_kind: string;
      }>(
        `SELECT id, owner_id, canonical_url, status, media_kind FROM media_assets WHERE canonical_url = $1 LIMIT 1`,
        [mediaUri],
      );
      if (!assetResult.rowCount) {
        reply.code(403);
        return { ok: false, error: 'Media asset not found' };
      }
      const asset = assetResult.rows[0];
      if (asset.owner_id !== actorUserId) {
        reply.code(403);
        return { ok: false, error: 'Media asset does not belong to the sender' };
      }
      // Voice messages require an audio-kind asset. Reject if the sender
      // claims type:'voice' but the asset is not audio â€” this catches a
      // misclassified upload (e.g. .m4a filed as image/jpeg) before it
      // becomes a voice bubble with no playable audio.
      if (isVoiceMessage && asset.media_kind !== 'audio') {
        reply.code(422);
        return {
          ok: false,
          error: 'Voice message media asset is not audio-kind. Re-upload with the correct content type.',
        };
      }
      const attachmentKind = isVoiceMessage
        ? 'audio'
        : isDocumentMessage
          ? 'document'
          : asset.media_kind === 'video'
            ? 'video'
            : 'image';
      await db.query(
        `INSERT INTO chat_message_attachments (id, message_id, media_asset_id, kind, canonical_url, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [createRuntimeId('chatatt'), result.rows[0].id, asset.id, attachmentKind, mediaUri],
      );

      // Voice messages get a canonical voice_messages row binding the asset
      // to the message with duration/container/codec metadata. The waveform
      // is left NULL â€” the waveform worker fills it async. The client reads
      // this row to render a real waveform or an honest progress line.
      if (isVoiceMessage) {
        const voiceMeta = payload.metadata ?? {};
        const durationMs = Number(voiceMeta.durationMs ?? voiceMeta.duration_ms ?? 0);
        const container = String(voiceMeta.container ?? voiceMeta.audioContainer ?? 'm4a');
        const codec = String(voiceMeta.codec ?? voiceMeta.audioCodec ?? 'aac');
        const bytes = Number(voiceMeta.bytes ?? voiceMeta.sizeBytes ?? 0);
        await db.query(
          `INSERT INTO voice_messages (
             id, message_id, conversation_id, media_asset_id, sender_user_id,
             duration_ms, bytes, container, codec, moderation_state
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
          [
            createRuntimeId('voice'),
            result.rows[0].id,
            conversationId,
            asset.id,
            actorUserId,
            durationMs,
            bytes,
            container,
            codec,
          ],
        );
      }
    } else {
      request.log.warn(
        { mediaUri, conversationId, actorUserId },
        'Chat message media URI does not match canonical media URL pattern â€” allowing without ownership check',
      );
      const attachmentKind = isVoiceMessage
        ? 'audio'
        : isDocumentMessage
          ? 'document'
          : payload.type === 'video'
            ? 'video'
            : 'image';
      await db.query(
        `INSERT INTO chat_message_attachments (id, message_id, kind, canonical_url, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [createRuntimeId('chatatt'), result.rows[0].id, attachmentKind, mediaUri],
      );
    }
  }

  // ── Poll message: create the chat_polls row ──────────────────────────
  if (payload.type === 'poll' && result.rows[0]) {
    const pollMeta = payload.metadata ?? {};
    const pollId = createRuntimeId('poll');
    await db.query(
      `INSERT INTO chat_polls (id, message_id, question, options, allow_multiple, is_anonymous)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        pollId,
        result.rows[0].id,
        String(pollMeta.question ?? ''),
        (pollMeta.options as string[]) ?? [],
        Boolean(pollMeta.allowMultiple),
        pollMeta.isAnonymous !== false, // default anonymous
      ],
    );
  }

  await db.query(
    `
      UPDATE chat_conversations
      SET updated_at = NOW()
      WHERE id = $1
    `,
    [conversationId],
  );

  const participantIds = await listChatParticipantIds(db, conversationId);
  const recipientIds = participantIds.filter((memberId) => memberId !== actorUserId);

  let notifiableRecipientIds = recipientIds;
  if (recipientIds.length > 0) {
    const stateResult = await db.query<{
      user_id: string;
      is_muted: boolean;
      is_archived: boolean;
      request_status: string | null;
    }>(
      `SELECT user_id, is_muted, is_archived, request_status
       FROM chat_conversation_user_state
       WHERE conversation_id = $1 AND user_id = ANY($2::text[])`,
      [conversationId, recipientIds],
    );
    const suppressedUserIds = new Set<string>();
    for (const row of stateResult.rows) {
      if (row.is_muted || row.is_archived || row.request_status === 'pending' || row.request_status === 'declined') {
        suppressedUserIds.add(row.user_id);
      }
    }
    notifiableRecipientIds = recipientIds.filter((id) => !suppressedUserIds.has(id));
  }

  // â”€â”€ FR-05: Authoritative risk decision BEFORE fan-out â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The message is already committed to the DB. We now evaluate risk before
  // any notification fan-out, realtime event, or bot execution so that
  // phishing/scam content is quarantined before it reaches recipients.
  //
  // Flow: DB insert â†’ evaluateRisk() â†’ conditional fan-out â†’ response.
  //   allow          â†’ full fan-out (notifications, realtime, bots)
  //   quarantine     â†’ no fan-out; sender-visible, recipient-hidden
  //   step_up / manual_review / delay â†’ realtime only, no push; pending_review
  //   deny           â†’ no fan-out; message blocked
  //
  // The legacy checkFraudNonBlocking call is retained below as a shadow log.
  let riskDecision: Awaited<ReturnType<typeof evaluateRisk>> | null = null;
  try {
    riskDecision = await evaluateRisk(
      { db, redis, logger: request.log, shadowService: fraudShadowService, ipReputationProvider },
      {
        eventType: 'chat.message.send',
        subjectRef: conversationId,
        userId: actorUserId,
        headers: request.headers as Record<string, string | string[] | undefined>,
        ip: request.ip,
        context: {
          conversationId,
          messageId: result.rows[0].id,
          messageLength: bodyText.length,
        },
      },
    );
  } catch (err) {
    // Risk evaluation failures must never break message sending (AGENTS.md Â§6).
    // Fail open: treat as allow so the message is delivered.
    request.log.error(
      { err, conversationId, actorUserId, messageId: result.rows[0].id },
      'evaluateRisk failed for chat message â€” failing open to allow',
    );
  }

  const ownerDecision = riskDecision?.ownerDecision ?? 'allow';
  const suppressNotifications =
    ownerDecision === 'quarantine' ||
    ownerDecision === 'deny' ||
    ownerDecision === 'step_up' ||
    ownerDecision === 'manual_review' ||
    ownerDecision === 'delay';
  const suppressRealtimeAndBots =
    ownerDecision === 'quarantine' || ownerDecision === 'deny';

  if (ownerDecision === 'quarantine') {
    request.log.warn(
      {
        conversationId,
        actorUserId,
        messageId: result.rows[0].id,
        decisionId: riskDecision?.decisionId,
        riskLevel: riskDecision?.riskLevel,
        reasonCodes: riskDecision?.ownerReasonCodes,
      },
      'Chat message quarantined by risk decision â€” suppressing all fan-out',
    );
  } else if (ownerDecision === 'deny') {
    request.log.warn(
      {
        conversationId,
        actorUserId,
        messageId: result.rows[0].id,
        decisionId: riskDecision?.decisionId,
        riskLevel: riskDecision?.riskLevel,
        reasonCodes: riskDecision?.ownerReasonCodes,
      },
      'Chat message blocked by risk decision â€” suppressing all fan-out',
    );
  }

  // Push notification fan-out â€” skipped for quarantine, deny, and
  // pending_review (step_up / manual_review / delay) decisions.
  if (!suppressNotifications && notifiableRecipientIds.length > 0) {
    await Promise.all(
      notifiableRecipientIds.map(async (memberId) => {
        try {
          await queueUserNotification({
            userId: memberId,
            title: 'New message',
            body: conversation.type === 'group'
              ? `New message in ${conversation.title ?? 'your group chat'}`
              : 'You have a new message in Thryftverse.',
            payload: {
              conversationId,
              messageId: result.rows[0].id,
              senderId: actorUserId,
              event: 'chat_message',
            },
            metadata: {
              source: 'chat.conversations.message.create',
            },
          });
        } catch (error) {
          request.log.error(
            {
              err: error,
              conversationId,
              memberId,
            },
            'Failed to queue chat message notification'
          );
        }
      })
    );
  }

  // Realtime event â€” skipped for quarantine and deny. For pending_review
  // (step_up / manual_review / delay) the realtime event still fires so an
  // active recipient in the chat sees the message in real-time.
  if (!suppressRealtimeAndBots) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.message.created',
      payload: {
        id: result.rows[0].id,
        conversationId,
        senderType: 'user',
        senderUserId: actorUserId,
        senderBotId: null,
        body: bodyText,
        metadata: mergedMetadata,
        createdAt: result.rows[0].created_at,
        clientMessageId: payload.clientMessageId ?? null,
        replyToMessageId: payload.replyToMessageId ?? null,
      },
    });
  }

  // Bot runtime â€” skipped for quarantine and deny. Bot execution on
  // suspicious content could trigger unwanted side-effects.
  if (!suppressRealtimeAndBots && conversation.type === 'group') {
    try {
      const { enqueueAgentRun } = await import('../botRuntime/index.js');
      await enqueueAgentRun(db, {
        conversationId,
        conversationType: conversation.type,
        conversationTitle: conversation.title ?? null,
        actorUserId,
        actorUserName: null,
        messageText: bodyText,
        triggerMessageId: result.rows[0].id ?? null,
      });
    } catch (err) {
      request.log.error({ err, conversationId, actorUserId }, 'Agent run enqueue failed');
    }
  }

  // Legacy fraud check â€” retained as a shadow log. The authoritative
  // decision above (evaluateRisk) is the primary; this provides comparison
  // data for model calibration (AGENTS.md Â§11 â€” truthful signals).
  try {
    const fraudResult = await checkFraudNonBlocking(
      redis,
      {
        eventType: 'message',
        userId: actorUserId,
        headers: request.headers as Record<string, string | string[] | undefined>,
        ip: request.ip,
      },
      undefined,
      request.log,
      fraudShadowService,
    );
    // Message events map to `allow_low_risk_flow` when the fraud service
    // is unavailable â€” messaging continues and spam can be caught post-hoc.
    if (fraudResult.evaluationStatus === 'unavailable') {
      request.log.warn(
        { userId: actorUserId, policyAction: fraudResult.policyAction, reasonCode: fraudResult.reasonCode },
        'Message fraud check unavailable â€” continuing with failover policy'
      );
    }
  } catch {
    // Fraud check failures must never break message sending (AGENTS.md Â§6).
  }

  // Record execution status for the authoritative risk decision (FR-13).
  if (riskDecision) {
    const executionStatus =
      ownerDecision === 'allow'
        ? ('executed' as const)
        : ownerDecision === 'deny'
          ? ('not_executed' as const)
          : ('executed' as const);
    try {
      await recordExecution(db, {
        decisionId: riskDecision.decisionId,
        ownerService: 'messaging',
        executionStatus,
        domainEntityType: 'chat_message',
        domainEntityId: result.rows[0].id,
      });
    } catch (err) {
      request.log.error(
        { err, decisionId: riskDecision.decisionId, messageId: result.rows[0].id },
        'Failed to record risk decision execution',
      );
    }
  }

  // Determine the message state to surface to the sender.
  const messageState =
    ownerDecision === 'quarantine'
      ? 'quarantined'
      : ownerDecision === 'deny'
        ? 'blocked'
        : ownerDecision === 'step_up' ||
            ownerDecision === 'manual_review' ||
            ownerDecision === 'delay'
          ? 'pending_review'
          : 'sent';

  reply.code(ownerDecision === 'deny' ? 403 : 201);
  return {
    ok: ownerDecision !== 'deny',
    messageState,
    message: {
      id: result.rows[0].id,
      senderType: 'user' as const,
      senderUserId: actorUserId,
      senderBotId: null,
      body: bodyText,
      metadata: mergedMetadata,
      createdAt: result.rows[0].created_at,
      clientMessageId: payload.clientMessageId ?? undefined,
      replyToMessageId: payload.replyToMessageId ?? undefined,
      scamWarning: scamScan.severity === 'medium' || undefined,
    },
  };
});

// â”€â”€ P0.5: Delete message â€” delete-for-me and delete-for-everyone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Two distinct semantics, never both labeled "Delete message":
//   DELETE .../messages/:messageId           â†’ delete-for-me (per-user tombstone)
//   DELETE .../messages/:messageId?scope=everyone â†’ delete-for-everyone (sender/admin, time-windowed)
app.delete('/chat/conversations/:conversationId/messages/:messageId', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });
  const querySchema = z.object({
    scope: z.enum(['me', 'everyone']).default('me'),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);
  const { scope } = querySchema.parse(request.query ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const messageResult = await db.query<{
    sender_user_id: string | null;
    created_at: string;
    deleted_for_everyone_at: string | null;
  }>(
    `SELECT sender_user_id, created_at::text, deleted_for_everyone_at
     FROM chat_messages WHERE id = $1 AND conversation_id = $2 LIMIT 1`,
    [messageId, conversationId]
  );

  if (!messageResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Message not found' };
  }

  const msg = messageResult.rows[0];

  if (msg.deleted_for_everyone_at) {
    // Already deleted for everyone â€” idempotent success
    return { ok: true, deleted: true, scope: 'everyone' };
  }

  if (scope === 'everyone') {
    // Only the sender can delete for everyone, within a 24h window.
    if (msg.sender_user_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Only the sender can delete a message for everyone' };
    }
    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      reply.code(403);
      return { ok: false, error: 'Delete for everyone is only available within 24 hours of sending' };
    }

    await db.query(
      `UPDATE chat_messages
       SET deleted_for_everyone_at = NOW(), deleted_by_user_id = $3, body = ''
       WHERE id = $1 AND conversation_id = $2`,
      [messageId, conversationId, actorUserId]
    );

    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.message.deleted',
      payload: { conversationId, messageId, scope: 'everyone', actorUserId },
    });

    return { ok: true, deleted: true, scope: 'everyone' };
  }

  // scope === 'me' â€” per-user tombstone
  await db.query(
    `INSERT INTO chat_message_deletions (message_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [messageId, actorUserId]
  );

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.message.deleted',
    payload: { conversationId, messageId, scope: 'me', actorUserId },
  });

  return { ok: true, deleted: true, scope: 'me' };
});

// ── P2-03: Edit message — sender-only, time-windowed, re-encrypted ──
// Edits the body of a message the caller authored. Only allowed within a
// configurable edit window (default 15 minutes) of the message's creation.
// Increments edit_version, sets edited_at = NOW(), and re-encrypts the body
// using the same dual-write pattern as message creation. Broadcasts a
// `chat.message.edited` realtime event so other participants and second
// devices reconcile the new text and the "Edited" label.
const MESSAGE_EDIT_WINDOW_MS = Number(process.env.CHAT_MESSAGE_EDIT_WINDOW_MS ?? 15 * 60 * 1000);
app.patch('/chat/conversations/:conversationId/messages/:messageId', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    text: z.string().trim().min(1).max(4000),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);
  const { text: newText } = bodySchema.parse(request.body ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const messageResult = await db.query<{
    sender_user_id: string | null;
    sender_type: string;
    created_at: string;
    deleted_for_everyone_at: string | null;
  }>(
    `SELECT sender_user_id, sender_type, created_at::text, deleted_for_everyone_at
     FROM chat_messages WHERE id = $1 AND conversation_id = $2 LIMIT 1`,
    [messageId, conversationId]
  );

  if (!messageResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Message not found' };
  }

  const msg = messageResult.rows[0];

  if (msg.deleted_for_everyone_at) {
    reply.code(403);
    return { ok: false, error: 'Cannot edit a deleted message' };
  }

  // Only the original sender can edit — bots/system messages are not editable.
  if (msg.sender_type !== 'user' || msg.sender_user_id !== actorUserId) {
    reply.code(403);
    return { ok: false, error: 'Only the sender can edit a message' };
  }

  const ageMs = Date.now() - new Date(msg.created_at).getTime();
  if (ageMs > MESSAGE_EDIT_WINDOW_MS) {
    reply.code(403);
    return { ok: false, error: 'Editing is only available within the edit window' };
  }

  // Re-encrypt the edited body using the same dual-write pattern as creation.
  // The message ID is reused as AAD so the ciphertext stays bound to this row.
  let bodyToStore = newText;
  let bodyCiphertext: string | null = null;
  let keyVersion: number | null = null;
  try {
    const encrypted = await encryptMessageBody(messageId, newText);
    bodyCiphertext = encrypted.ciphertext;
    keyVersion = encrypted.keyVersion;
    bodyToStore = '[encrypted]';
  } catch (err) {
    logger.warn(
      { messageId, err: err instanceof Error ? err.message : String(err) },
      'messageEncryption.encryptFailed on edit — storing plaintext for backfill',
    );
  }

  const updated = await db.query<ChatMessageRow>(
    `UPDATE chat_messages
       SET body = $3,
           body_ciphertext = $4,
           key_version = $5,
           edit_version = edit_version + 1,
           edited_at = NOW()
     WHERE id = $1 AND conversation_id = $2
     RETURNING id, sender_type, sender_user_id, sender_bot_id, body,
               body_ciphertext, key_version, metadata, created_at::text,
               client_message_id, reply_to_message_id, deleted_for_everyone_at,
               edit_version, edited_at::text`,
    [messageId, conversationId, bodyToStore, bodyCiphertext, keyVersion]
  );

  if (!updated.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Message not found' };
  }

  const serialized = await serializeChatMessageRow(updated.rows[0], actorUserId);

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.message.edited',
    payload: {
      conversationId,
      messageId,
      body: newText,
      editVersion: updated.rows[0].edit_version,
      editedAt: updated.rows[0].edited_at,
      actorUserId,
    },
  });

  return { ok: true, message: serialized };
});

// â”€â”€ P0.9: Message reactions â€” add and remove â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/chat/conversations/:conversationId/messages/:messageId/reactions', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    emoji: z.string().trim().min(1).max(32),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);
  const { emoji } = bodySchema.parse(request.body ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  // Verify message exists and isn't deleted
  const msgResult = await db.query<{ id: string }>(
    `SELECT id FROM chat_messages
     WHERE id = $1 AND conversation_id = $2 AND deleted_for_everyone_at IS NULL LIMIT 1`,
    [messageId, conversationId]
  );
  if (!msgResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Message not found' };
  }

  await db.query(
    `INSERT INTO chat_message_reactions (message_id, user_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
    [messageId, actorUserId, emoji]
  );

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.reaction.added',
    payload: { conversationId, messageId, userId: actorUserId, emoji },
  });

  reply.code(201);
  return { ok: true, reacted: true, emoji };
});

app.delete('/chat/conversations/:conversationId/messages/:messageId/reactions', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });
  const querySchema = z.object({
    emoji: z.string().trim().min(1).max(32),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);
  const { emoji } = querySchema.parse(request.query ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  await db.query(
    `DELETE FROM chat_message_reactions
     WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [messageId, actorUserId, emoji]
  );

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.reaction.removed',
    payload: { conversationId, messageId, userId: actorUserId, emoji },
  });

  return { ok: true, removed: true, emoji };
});

// ── Pinned messages ───────────────────────────────────────────────────
// One pinned message per conversation. Group admins/owners can pin.
// Pinning a new message replaces the previous pin (upsert on conversation_id).

app.post('/chat/conversations/:conversationId/messages/:messageId/pin', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);

  // Only group admins/owners can pin messages.
  await ensureGroupManagementAccess(db, conversationId, actorUserId, request.authUser?.role);

  // Verify the message exists and belongs to this conversation.
  const msgResult = await db.query(
    `SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2 AND deleted_for_everyone_at IS NULL`,
    [messageId, conversationId],
  );
  if (msgResult.rows.length === 0) {
    reply.code(404);
    return { error: 'Message not found in this conversation' };
  }

  // Upsert: replace any existing pin for this conversation.
  await db.query(
    `INSERT INTO chat_pinned_messages (conversation_id, message_id, pinned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id)
     DO UPDATE SET message_id = $2, pinned_by = $3, pinned_at = NOW()`,
    [conversationId, messageId, actorUserId],
  );

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.message.pinned',
    payload: { conversationId, messageId, pinnedBy: actorUserId },
  });

  return { ok: true, pinned: true, messageId };
});

app.delete('/chat/conversations/:conversationId/messages/:messageId/pin', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);

  // Only group admins/owners can unpin.
  await ensureGroupManagementAccess(db, conversationId, actorUserId, request.authUser?.role);

  await db.query(
    `DELETE FROM chat_pinned_messages WHERE conversation_id = $1 AND message_id = $2`,
    [conversationId, messageId],
  );

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.message.unpinned',
    payload: { conversationId, messageId },
  });

  return { ok: true, unpinned: true };
});

app.get('/chat/conversations/:conversationId/pinned-message', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const result = await db.query<{ message_id: string; pinned_by: string; pinned_at: string }>(
    `SELECT message_id, pinned_by, pinned_at FROM chat_pinned_messages WHERE conversation_id = $1`,
    [conversationId],
  );

  if (result.rows.length === 0) {
    return { pinned: null };
  }

  const pin = result.rows[0];
  // Fetch the actual message so the client has the full content.
  const msgResult = await db.query<ChatMessageRow>(
    `SELECT * FROM chat_messages WHERE id = $1 AND deleted_for_everyone_at IS NULL`,
    [pin.message_id],
  );

  if (msgResult.rows.length === 0) {
    // The pinned message was deleted — clean up the stale pin.
    await db.query(`DELETE FROM chat_pinned_messages WHERE conversation_id = $1`, [conversationId]);
    return { pinned: null };
  }

  const serialized = await serializeChatMessageRow(msgResult.rows[0], actorUserId);
  return {
    pinned: {
      messageId: pin.message_id,
      pinnedBy: pin.pinned_by,
      pinnedAt: pin.pinned_at,
      message: serialized,
    },
  };
});

// ── Polls: vote and unvote ────────────────────────────────────────────
app.post('/chat/conversations/:conversationId/messages/:messageId/poll/vote', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    optionIndex: z.number().int().min(0).max(9),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);
  const { optionIndex } = bodySchema.parse(request.body ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  // Fetch the poll row
  const pollResult = await db.query<{ id: string; options: string[]; allow_multiple: boolean; closes_at: string | null }>(
    `SELECT id, options, allow_multiple, closes_at FROM chat_polls WHERE message_id = $1`,
    [messageId],
  );
  if (pollResult.rows.length === 0) {
    reply.code(404);
    return { error: 'Poll not found for this message' };
  }
  const poll = pollResult.rows[0];
  if (optionIndex >= poll.options.length) {
    reply.code(400);
    return { error: 'Invalid option index' };
  }
  if (poll.closes_at && new Date(poll.closes_at) < new Date()) {
    reply.code(400);
    return { error: 'Poll is closed' };
  }

  if (poll.allow_multiple) {
    // Insert vote, ignore if already voted on this option
    await db.query(
      `INSERT INTO chat_poll_votes (poll_id, user_id, option_index)
       VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, user_id, option_index) DO NOTHING`,
      [poll.id, actorUserId, optionIndex],
    );
  } else {
    // Single-vote: remove any existing votes by this user, then insert
    await db.query(
      `DELETE FROM chat_poll_votes WHERE poll_id = $1 AND user_id = $2`,
      [poll.id, actorUserId],
    );
    await db.query(
      `INSERT INTO chat_poll_votes (poll_id, user_id, option_index)
       VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, user_id, option_index) DO NOTHING`,
      [poll.id, actorUserId, optionIndex],
    );
  }

  // Fetch updated vote counts
  const votesResult = await db.query<{ option_index: number; count: string }>(
    `SELECT option_index, COUNT(*)::text as count FROM chat_poll_votes WHERE poll_id = $1 GROUP BY option_index`,
    [poll.id],
  );
  const voteCounts = poll.options.map((_, i) => {
    const row = votesResult.rows.find((r) => r.option_index === i);
    return row ? Number(row.count) : 0;
  });

  // Fetch the user's current votes
  const myVotesResult = await db.query<{ option_index: number }>(
    `SELECT option_index FROM chat_poll_votes WHERE poll_id = $1 AND user_id = $2`,
    [poll.id, actorUserId],
  );
  const myVotes = myVotesResult.rows.map((r) => r.option_index);

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.poll.voted',
    payload: { conversationId, messageId, pollId: poll.id, voteCounts, userId: actorUserId },
  });

  return { ok: true, voteCounts, myVotes };
});

app.post('/chat/conversations/:conversationId/messages/:messageId/poll/unvote', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    optionIndex: z.number().int().min(0).max(9),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);
  const { optionIndex } = bodySchema.parse(request.body ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const pollResult = await db.query<{ id: string; closes_at: string | null }>(
    `SELECT id, closes_at FROM chat_polls WHERE message_id = $1`,
    [messageId],
  );
  if (pollResult.rows.length === 0) {
    reply.code(404);
    return { error: 'Poll not found' };
  }
  const poll = pollResult.rows[0];
  if (poll.closes_at && new Date(poll.closes_at) < new Date()) {
    reply.code(400);
    return { error: 'Poll is closed' };
  }

  await db.query(
    `DELETE FROM chat_poll_votes WHERE poll_id = $1 AND user_id = $2 AND option_index = $3`,
    [poll.id, actorUserId, optionIndex],
  );

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.poll.voted',
    payload: { conversationId, messageId, pollId: poll.id, userId: actorUserId },
  });

  return { ok: true };
});

// ── In-chat message search ────────────────────────────────────────────
// Searches message body text within a conversation. Returns matching
// message IDs + created_at timestamps so the client can jump to the
// right pagination window via aroundMessageId.
app.get('/chat/conversations/:conversationId/search', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const querySchema = z.object({
    q: z.string().trim().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const { q, limit } = querySchema.parse(request.query ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  // ILIKE for case-insensitive substring search. This is sufficient for
  // chat-scale message volumes; a GIN/pg_trgm index can be added later
  // if performance requires it.
  const result = await db.query<{ id: string; created_at: string }>(
    `SELECT id, created_at FROM chat_messages
     WHERE conversation_id = $1
       AND deleted_for_everyone_at IS NULL
       AND body ILIKE '%' || $2 || '%'
     ORDER BY created_at DESC
     LIMIT $3`,
    [conversationId, q, limit],
  );

  return {
    query: q,
    results: result.rows.map((r) => ({ messageId: r.id, createdAt: r.created_at })),
  };
});

// ── P0.11: Conversation report route â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// One canonical report workflow with evidence selection, idempotent submission,
// and a real report ID from the server.
app.post('/chat/conversations/:conversationId/report', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    reason: z.enum([
      'spam', 'harassment', 'scam_fraud', 'inappropriate_content',
      'off_platform_payment', 'impersonation', 'other',
    ]),
    details: z.string().trim().max(2000).optional(),
    messageId: z.string().trim().min(2).max(120).optional(),
    idempotencyKey: z.string().min(2).optional(),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const reportId = createRuntimeId('chatrpt');

  const insertResult = await db.query<{ id: string }>(
    `INSERT INTO conversation_reports (id, conversation_id, reporter_user_id, reason, details, message_id, status, created_at, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'submitted', NOW(), $7)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      reportId,
      conversationId,
      actorUserId,
      payload.reason,
      payload.details ?? null,
      payload.messageId ?? null,
      payload.idempotencyKey ?? null,
    ]
  );

  const effectiveReportId = insertResult.rowCount && insertResult.rowCount > 0
    ? insertResult.rows[0].id
    : reportId;

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.conversation.reported',
    payload: { conversationId, reportId: effectiveReportId, reason: payload.reason },
  });

  reply.code(201);
  return { ok: true, reportId: effectiveReportId, status: 'submitted' };
});

// P0 #1 / P2 #56: Typing indicator endpoint.
// Ephemeral realtime-only signal â€” no DB writes. The composer debounces
// "started typing" (1s) and "stopped typing" (3s inactivity / on send) on
// the client; this endpoint just fans the signal out to other participants
// via the conversation's realtime topic so `useTypingIndicator` lights up.
app.post('/chat/conversations/:conversationId/typing', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '10 seconds',
    },
  },
  schema: {
    params: {
      type: 'object',
      required: ['conversationId'],
      properties: {
        conversationId: { type: 'string', minLength: 2, maxLength: 120 },
      },
    },
    body: {
      type: 'object',
      required: ['isTyping'],
      properties: {
        isTyping: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
}, async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    isTyping: z.boolean(),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const { isTyping } = bodySchema.parse(request.body ?? {});

  await ensureChatConversationAccess(db, conversationId, actorUserId);

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.typing.update',
    payload: {
      conversationId,
      userId: actorUserId,
      isTyping,
    },
  });

  return { ok: true };
});

// â”€â”€ Mark conversation as read â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Updates chat_members.last_read_at for the current user. Used by the
// client when the user opens a conversation or scrolls to the bottom.
// Also publishes a realtime event so other participants can see read
// receipts update.
app.post('/chat/conversations/:conversationId/read', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    upToMessageId: z.string().min(2).max(120).optional(),
    upToTimestamp: z.string().min(2).max(120).optional(),
  }).optional();

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const body = bodySchema.parse(request.body ?? {});
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  await db.query(
    `
      UPDATE chat_members
      SET last_read_at = NOW()
      WHERE conversation_id = $1 AND user_id = $2
    `,
    [conversationId, actorUserId],
  );

  let markedMessageIds: string[] = [];

  if (body?.upToMessageId) {
    const cursorResult = await db.query<{ created_at: string; id: string }>(
      `SELECT created_at::text, id FROM chat_messages
       WHERE id = $1 AND conversation_id = $2 LIMIT 1`,
      [body.upToMessageId, conversationId]
    );
    if (cursorResult.rowCount) {
      const cursor = cursorResult.rows[0];
      const messagesResult = await db.query<{ id: string }>(
        `SELECT id FROM chat_messages
         WHERE conversation_id = $1
           AND deleted_for_everyone_at IS NULL
           AND (created_at, id) <= ($2, $3)
         ORDER BY created_at ASC, id ASC`,
        [conversationId, cursor.created_at, cursor.id]
      );
      markedMessageIds = messagesResult.rows.map((r) => r.id);
    }
  } else if (body?.upToTimestamp) {
    const messagesResult = await db.query<{ id: string }>(
      `SELECT id FROM chat_messages
       WHERE conversation_id = $1
         AND deleted_for_everyone_at IS NULL
         AND created_at <= $2
       ORDER BY created_at ASC, id ASC`,
      [conversationId, body.upToTimestamp]
    );
    markedMessageIds = messagesResult.rows.map((r) => r.id);
  } else {
    const messagesResult = await db.query<{ id: string }>(
      `SELECT id FROM chat_messages
       WHERE conversation_id = $1
         AND deleted_for_everyone_at IS NULL
       ORDER BY created_at ASC, id ASC`,
      [conversationId]
    );
    markedMessageIds = messagesResult.rows.map((r) => r.id);
  }

  if (markedMessageIds.length > 0) {
    const readAt = new Date();
    const values: string[] = [];
    const placeholders: string[] = [];
    for (let i = 0; i < markedMessageIds.length; i++) {
      const base = i * 3;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
      values.push(markedMessageIds[i], actorUserId, readAt.toISOString());
    }
    await db.query(
      `INSERT INTO chat_message_read_receipts (message_id, user_id, read_at)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      values
    );
  }

  const readReceiptsResult = await db.query<{ read_receipts_enabled: boolean }>(
    `SELECT read_receipts_enabled FROM users WHERE id = $1`,
    [actorUserId],
  );

  if (readReceiptsResult.rowCount && readReceiptsResult.rows[0].read_receipts_enabled) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.message.read',
      payload: {
        conversationId,
        userId: actorUserId,
        readAt: new Date().toISOString(),
        messageIds: markedMessageIds,
      },
    });
  }

  return { ok: true, conversationId, readAt: new Date().toISOString(), markedCount: markedMessageIds.length };
});

app.post('/chat/conversations/:conversationId/messages/:messageId/read', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const messageResult = await db.query<{ id: string }>(
    `SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2 AND deleted_for_everyone_at IS NULL LIMIT 1`,
    [messageId, conversationId]
  );
  if (!messageResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Message not found in this conversation' };
  }

  const readAt = new Date();
  await db.query(
    `INSERT INTO chat_message_read_receipts (message_id, user_id, read_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [messageId, actorUserId, readAt.toISOString()]
  );

  const readReceiptsResult = await db.query<{ read_receipts_enabled: boolean }>(
    `SELECT read_receipts_enabled FROM users WHERE id = $1`,
    [actorUserId],
  );

  if (readReceiptsResult.rowCount && readReceiptsResult.rows[0].read_receipts_enabled) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.message.read',
      payload: {
        conversationId,
        userId: actorUserId,
        readAt: readAt.toISOString(),
        messageIds: [messageId],
      },
    });
  }

  return {
    ok: true,
    receipt: { messageId, userId: actorUserId, readAt: readAt.toISOString() },
  };
});

app.get('/chat/conversations/:conversationId/messages/:messageId/receipts', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    messageId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, messageId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const result = await db.query<{ user_id: string; read_at: string }>(
    `SELECT user_id, read_at::text FROM chat_message_read_receipts WHERE message_id = $1 ORDER BY read_at ASC`,
    [messageId]
  );

  return {
    ok: true,
    items: result.rows.map((r) => ({ userId: r.user_id, readAt: r.read_at })),
  };
});

app.post('/chat/conversations/:conversationId/members', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    memberIds: z.array(z.string().trim().min(2)).min(1).max(48),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});

  const conversation = await ensureGroupCapabilityAccess(
    db,
    conversationId,
    actorUserId,
    'add_members',
    request.authUser?.role,
  );

  const normalizedMemberIds = [...new Set(payload.memberIds.map((value) => value.trim()))]
    .filter((value) => value.length > 0);
  await Promise.all(normalizedMemberIds.map((memberId) => ensureUserExists(memberId)));

  const client = await db.connect();
  const addedMemberIds: string[] = [];
  let participantIds: string[] = [];
  let updateMessage: { id: string; createdAt: string } | null = null;

  try {
    await client.query('BEGIN');

    for (const memberId of normalizedMemberIds) {
      const inserted = await client.query<{ user_id: string }>(
        `
          INSERT INTO chat_members (conversation_id, user_id, role)
          VALUES ($1, $2, 'member')
          ON CONFLICT (conversation_id, user_id) DO NOTHING
          RETURNING user_id
        `,
        [conversationId, memberId]
      );

      if (inserted.rowCount) {
        addedMemberIds.push(inserted.rows[0].user_id);
      }
    }

    if (addedMemberIds.length > 0) {
      updateMessage = await appendSystemChatMessage(client, {
        conversationId,
        text: `${addedMemberIds.length} member${addedMemberIds.length === 1 ? '' : 's'} added to the group.`,
        metadata: {
          event: 'group_members_added',
          actorUserId,
          memberIds: addedMemberIds,
        },
      });

      await client.query(
        `
          UPDATE chat_conversations
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [conversationId]
      );
    }

    participantIds = await listChatParticipantIds(client, conversationId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await Promise.all(
    addedMemberIds
      .filter((memberId) => memberId !== actorUserId)
      .map(async (memberId) => {
        try {
          await queueUserNotification({
            userId: memberId,
            title: 'Added to a group chat',
            body: `You were added to ${conversation.title ?? 'a group chat'}.`,
            payload: {
              conversationId,
              event: 'chat_group_member_added',
            },
            metadata: {
              source: 'chat.conversations.members.add',
            },
          });
        } catch (error) {
          request.log.error(
            {
              err: error,
              conversationId,
              memberId,
            },
            'Failed to queue member add notification'
          );
        }
      })
  );

  if (updateMessage) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.member.added',
      payload: {
        conversationId,
        actorUserId,
        memberIds: addedMemberIds,
        messageId: updateMessage.id,
      },
    });
  }

  return {
    ok: true,
    conversationId,
    addedMemberIds,
    participantIds,
  };
});

app.delete('/chat/conversations/:conversationId/members/:memberUserId', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    memberUserId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, memberUserId } = paramsSchema.parse(request.params);

  const conversation = await ensureGroupManagementAccess(
    db,
    conversationId,
    actorUserId,
    request.authUser?.role,
  );

  // Prevent removing the group owner â€” they must transfer ownership first.
  if (conversation.owner_id === memberUserId) {
    throw createApiError('CHAT_CANNOT_REMOVE_OWNER', 'The group owner cannot be removed. Transfer ownership first.', {
      conversationId,
      memberUserId,
    });
  }

  const client = await db.connect();
  let removed = false;
  let participantIds: string[] = [];
  let updateMessage: { id: string; createdAt: string } | null = null;

  try {
    await client.query('BEGIN');

    const deleteResult = await client.query<{ user_id: string }>(
      `
        DELETE FROM chat_members
        WHERE conversation_id = $1 AND user_id = $2
        RETURNING user_id
      `,
      [conversationId, memberUserId]
    );

    removed = (deleteResult.rowCount ?? 0) > 0;

    if (removed) {
      updateMessage = await appendSystemChatMessage(client, {
        conversationId,
        text: 'A member was removed from the group.',
        metadata: {
          event: 'group_member_removed',
          actorUserId,
          memberUserId,
        },
      });

      await client.query(
        `
          UPDATE chat_conversations
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [conversationId]
      );
    }

    participantIds = await listChatParticipantIds(client, conversationId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (updateMessage) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.member.removed',
      payload: {
        conversationId,
        actorUserId,
        memberUserId,
        messageId: updateMessage.id,
      },
    });
  }

  return {
    ok: true,
    removed,
    participantIds,
  };
});

// â”€â”€ Member role management: promote/demote â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.patch('/chat/conversations/:conversationId/members/:memberUserId/role', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    memberUserId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    role: z.enum(['admin', 'member']),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, memberUserId } = paramsSchema.parse(request.params);
  const { role: newRole } = bodySchema.parse(request.body ?? {});

  const conversation = await ensureGroupManagementAccess(
    db,
    conversationId,
    actorUserId,
    request.authUser?.role,
  );

  // Cannot change the owner's role via this route â€” use transfer-ownership.
  if (conversation.owner_id === memberUserId) {
    throw createApiError(
      'CHAT_CANNOT_CHANGE_OWNER_ROLE',
      'The group owner\'s role cannot be changed. Transfer ownership instead.',
      { conversationId, memberUserId },
    );
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const updateResult = await client.query<{ role: string }>(
      `
        UPDATE chat_members
        SET role = $3
        WHERE conversation_id = $1 AND user_id = $2
        RETURNING role
      `,
      [conversationId, memberUserId, newRole],
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      throw createApiError(
        'CHAT_MEMBER_NOT_FOUND',
        'The specified user is not a member of this conversation',
        { conversationId, memberUserId },
      );
    }

    const rolesResult = await client.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM chat_members WHERE conversation_id = $1 ORDER BY joined_at ASC`,
      [conversationId],
    );
    const memberRoles = Object.fromEntries(
      rolesResult.rows.map((r) => [r.user_id, r.role]),
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.member.role_updated',
      payload: {
        conversationId,
        actorUserId,
        memberUserId,
        newRole,
      },
    });

    return {
      ok: true,
      memberRoles,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// â”€â”€ Transfer group ownership â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/chat/conversations/:conversationId/transfer-ownership', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    newOwnerId: z.string().trim().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const { newOwnerId } = bodySchema.parse(request.body ?? {});

  const conversation = await ensureGroupManagementAccess(
    db,
    conversationId,
    actorUserId,
    request.authUser?.role,
  );

  // Only the current owner can transfer ownership.
  if (conversation.owner_id !== actorUserId) {
    throw createApiError(
      'CHAT_NOT_OWNER',
      'Only the group owner can transfer ownership',
      { conversationId, actorUserId, ownerId: conversation.owner_id },
    );
  }

  if (newOwnerId === actorUserId) {
    throw createApiError(
      'CHAT_CANNOT_TRANSFER_TO_SELF',
      'You are already the owner of this group',
      { conversationId, newOwnerId },
    );
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Verify the target is a member.
    const memberCheck = await client.query<{ user_id: string }>(
      `SELECT user_id FROM chat_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, newOwnerId],
    );
    if (memberCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      throw createApiError(
        'CHAT_MEMBER_NOT_FOUND',
        'The specified user is not a member of this conversation',
        { conversationId, newOwnerId },
      );
    }

    // Promote new owner to 'owner' role, demote current owner to 'admin'.
    await client.query(
      `UPDATE chat_members SET role = 'owner' WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, newOwnerId],
    );
    await client.query(
      `UPDATE chat_members SET role = 'admin' WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, actorUserId],
    );

    // Update the conversation owner_id.
    await client.query(
      `UPDATE chat_conversations SET owner_id = $2, updated_at = NOW() WHERE id = $1`,
      [conversationId, newOwnerId],
    );

    const rolesResult = await client.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM chat_members WHERE conversation_id = $1 ORDER BY joined_at ASC`,
      [conversationId],
    );
    const memberRoles = Object.fromEntries(
      rolesResult.rows.map((r) => [r.user_id, r.role]),
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.group.ownership_transferred',
      payload: {
        conversationId,
        actorUserId,
        newOwnerId,
      },
    });

    return {
      ok: true,
      ownerId: newOwnerId,
      memberRoles,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// P0.6: Separate "delete for me" (hide from inbox, per-user, reversible)
// from "leave" (membership mutation, posts system message, irreversible for DMs).
//   DELETE /chat/conversations/:id              â†’ delete-for-me (archive + hide)
//   DELETE /chat/conversations/:id?scope=leave  â†’ leave conversation (membership mutation)
app.delete('/chat/conversations/:conversationId', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const querySchema = z.object({
    scope: z.enum(['me', 'leave']).default('me'),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const { scope } = querySchema.parse(request.query ?? {});

  // Verify the user is a member of the conversation.
  const conversation = await ensureChatConversationAccess(db, conversationId, actorUserId);

  if (scope === 'me') {
    // Delete-for-me: archive the conversation for this user only. No
    // membership change, no system message, no effect on other participants.
    // This is the inbox-cleanup action the UI copy describes.
    await db.query(
      `INSERT INTO chat_conversation_user_state (user_id, conversation_id, is_archived, request_status, updated_at)
       VALUES ($1, $2, TRUE, 'accepted', NOW())
       ON CONFLICT (user_id, conversation_id)
       DO UPDATE SET is_archived = TRUE, updated_at = NOW()`,
      [actorUserId, conversationId]
    );

    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.conversation.archived',
      payload: { conversationId, actorUserId },
    });

    return { ok: true, archived: true, scope: 'me' };
  }

  // scope === 'leave' â€” actual membership mutation
  const client = await db.connect();
  let participantIds: string[] = [];
  let updateMessage: { id: string; createdAt: string } | null = null;

  try {
    await client.query('BEGIN');

    const deleteResult = await client.query<{ user_id: string }>(
      `
        DELETE FROM chat_members
        WHERE conversation_id = $1 AND user_id = $2
        RETURNING user_id
      `,
      [conversationId, actorUserId]
    );

    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      throw createApiError('CHAT_CONVERSATION_NOT_FOUND', 'You are not a member of this conversation', {
        conversationId,
        actorUserId,
      });
    }

    updateMessage = await appendSystemChatMessage(client, {
      conversationId,
      text: conversation.type === 'group' ? 'A member left the group.' : 'A participant left the conversation.',
      metadata: {
        event: conversation.type === 'group' ? 'group_member_left' : 'conversation_participant_left',
        actorUserId,
      },
    });

    await client.query(
      `
        UPDATE chat_conversations
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [conversationId]
    );

    participantIds = await listChatParticipantIds(client, conversationId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (updateMessage) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.member.left',
      payload: {
        conversationId,
        actorUserId,
        messageId: updateMessage.id,
      },
    });
  }

  return {
    ok: true,
    left: true,
    participantIds,
  };
});

app.post('/chat/conversations/:conversationId/invite-links', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    expiresInHours: z.coerce.number().int().min(1).max(24 * 30).default(72),
    maxUses: z.coerce.number().int().min(0).max(10_000).default(0),
    metadata: z.record(z.unknown()).optional(),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});

  const conversation = await ensureGroupCapabilityAccess(
    db,
    conversationId,
    actorUserId,
    'add_members',
    request.authUser?.role,
  );

  const inviteId = createRuntimeId('chatinv');
  const inviteToken = createPublicToken('ginv');
  const tokenHash = hashOpaqueValue(inviteToken);
  const tokenPrefix = inviteToken.slice(0, 14);
  const expiresAt = new Date(Date.now() + payload.expiresInHours * 60 * 60 * 1000).toISOString();

  await db.query(
    `
      INSERT INTO chat_group_invites (
        id,
        conversation_id,
        token_hash,
        token_prefix,
        created_by,
        max_uses,
        expires_at,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      inviteId,
      conversationId,
      tokenHash,
      tokenPrefix,
      actorUserId,
      payload.maxUses,
      expiresAt,
      toJsonString(payload.metadata ?? {}),
    ]
  );

  publishRealtimeEvent({
    topic: `chat.conversation:${conversationId}`,
    type: 'chat.invite.created',
    payload: {
      conversationId,
      inviteId,
      actorUserId,
    },
  });

  reply.code(201);
  return {
    ok: true,
    conversationId,
    invite: {
      id: inviteId,
      inviteLink: buildGroupInviteLink(inviteToken),
      tokenPreview: `${tokenPrefix}...`,
      createdBy: actorUserId,
      ownerId: conversation.owner_id,
      expiresAt,
      maxUses: payload.maxUses,
      useCount: 0,
    },
  };
});

app.get('/chat/conversations/:conversationId/invite-links', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const querySchema = z.object({
    includeRevoked: z.coerce.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const { includeRevoked, limit } = querySchema.parse(request.query ?? {});

  await ensureGroupManagementAccess(db, conversationId, actorUserId, request.authUser?.role);

  const result = includeRevoked
    ? await db.query<{
      id: string;
      token_prefix: string;
      created_by: string;
      max_uses: number | string;
      use_count: number | string;
      expires_at: string;
      revoked_at: string | null;
      created_at: string;
      updated_at: string;
      last_used_at: string | null;
      last_used_by: string | null;
    }>(
      `
        SELECT
          id,
          token_prefix,
          created_by,
          max_uses,
          use_count,
          expires_at::text,
          revoked_at::text,
          created_at::text,
          updated_at::text,
          last_used_at::text,
          last_used_by
        FROM chat_group_invites
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [conversationId, limit]
    )
    : await db.query<{
      id: string;
      token_prefix: string;
      created_by: string;
      max_uses: number | string;
      use_count: number | string;
      expires_at: string;
      revoked_at: string | null;
      created_at: string;
      updated_at: string;
      last_used_at: string | null;
      last_used_by: string | null;
    }>(
      `
        SELECT
          id,
          token_prefix,
          created_by,
          max_uses,
          use_count,
          expires_at::text,
          revoked_at::text,
          created_at::text,
          updated_at::text,
          last_used_at::text,
          last_used_by
        FROM chat_group_invites
        WHERE conversation_id = $1
          AND revoked_at IS NULL
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [conversationId, limit]
    );

  const now = Date.now();

  return {
    ok: true,
    conversationId,
    items: result.rows.map((row) => {
      const maxUses = Number(row.max_uses);
      const useCount = Number(row.use_count);
      const isExpired = new Date(row.expires_at).getTime() <= now;
      const remainingUses = maxUses > 0 ? Math.max(0, maxUses - useCount) : null;

      return {
        id: row.id,
        tokenPreview: `${row.token_prefix}...`,
        createdBy: row.created_by,
        maxUses,
        useCount,
        remainingUses,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.last_used_at,
        lastUsedBy: row.last_used_by,
        isExpired,
        isRevoked: Boolean(row.revoked_at),
      };
    }),
  };
});

app.delete('/chat/conversations/:conversationId/invite-links/:inviteId', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    inviteId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, inviteId } = paramsSchema.parse(request.params);
  await ensureGroupManagementAccess(db, conversationId, actorUserId, request.authUser?.role);

  const client = await db.connect();
  let revoked = false;
  let updateMessage: { id: string; createdAt: string } | null = null;

  try {
    await client.query('BEGIN');

    const revokeResult = await client.query<{ id: string }>(
      `
        UPDATE chat_group_invites
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE conversation_id = $1
          AND id = $2
          AND revoked_at IS NULL
        RETURNING id
      `,
      [conversationId, inviteId]
    );

    revoked = Boolean(revokeResult.rowCount);
    if (revoked) {
      updateMessage = await appendSystemChatMessage(client, {
        conversationId,
        text: 'An invite link was revoked.',
        metadata: {
          event: 'group_invite_revoked',
          actorUserId,
          inviteId,
        },
      });

      await client.query(
        `
          UPDATE chat_conversations
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [conversationId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (updateMessage) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.invite.revoked',
      payload: {
        conversationId,
        inviteId,
        actorUserId,
        messageId: updateMessage.id,
      },
    });
  }

  return {
    ok: true,
    conversationId,
    inviteId,
    revoked,
  };
});

app.post('/chat/groups/join', async (request, reply) => {
  const bodySchema = z.object({
    inviteToken: z.string().trim().min(6).max(260),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const payload = bodySchema.parse(request.body ?? {});
  const inviteTokenHash = hashOpaqueValue(payload.inviteToken);

  await ensureUserExists(actorUserId);

  const client = await db.connect();
  let joined = false;
  let conversationId = '';
  let conversationTitle: string | null = null;
  let ownerId = '';
  let itemId: string | null = null;
  let participantIds: string[] = [];
  let botIds: string[] = [];
  let inviteId = '';
  let maxUses = 0;
  let useCount = 0;
  let expiresAt = '';
  let joinMessage: { id: string; createdAt: string } | null = null;
  let lastMessage = '';
  let lastMessageTime = '';

  try {
    await client.query('BEGIN');

    const inviteResult = await client.query<{
      id: string;
      conversation_id: string;
      conversation_type: ChatConversationType;
      title: string | null;
      owner_id: string;
      item_id: string | null;
      max_uses: number | string;
      use_count: number | string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `
        SELECT
          cgi.id,
          cgi.conversation_id,
          c.type AS conversation_type,
          c.title,
          c.owner_id,
          c.item_id,
          cgi.max_uses,
          cgi.use_count,
          cgi.expires_at::text,
          cgi.revoked_at::text
        FROM chat_group_invites cgi
        INNER JOIN chat_conversations c
          ON c.id = cgi.conversation_id
        WHERE cgi.token_hash = $1
        LIMIT 1
        FOR UPDATE
      `,
      [inviteTokenHash]
    );

    if (!inviteResult.rowCount) {
      throw createApiError('CHAT_GROUP_INVITE_INVALID', 'Invite link is invalid or unavailable');
    }

    const invite = inviteResult.rows[0];
    if (invite.conversation_type !== 'group') {
      throw createApiError('CHAT_GROUP_INVITE_INVALID', 'Invite link is invalid for this conversation type', {
        conversationId: invite.conversation_id,
        conversationType: invite.conversation_type,
      });
    }

    if (invite.revoked_at) {
      throw createApiError('CHAT_GROUP_INVITE_INVALID', 'Invite link has been revoked', {
        inviteId: invite.id,
      });
    }

    const inviteExpiryMs = new Date(invite.expires_at).getTime();
    if (inviteExpiryMs <= Date.now()) {
      throw createApiError('CHAT_GROUP_INVITE_INVALID', 'Invite link has expired', {
        inviteId: invite.id,
        expiresAt: invite.expires_at,
      });
    }

    maxUses = Number(invite.max_uses);
    useCount = Number(invite.use_count);
    if (maxUses > 0 && useCount >= maxUses) {
      throw createApiError('CHAT_GROUP_INVITE_INVALID', 'Invite link has reached its usage limit', {
        inviteId: invite.id,
        maxUses,
        useCount,
      });
    }

    conversationId = invite.conversation_id;
    conversationTitle = invite.title;
    ownerId = invite.owner_id;
    itemId = invite.item_id;
    inviteId = invite.id;
    expiresAt = invite.expires_at;

    const memberInsertResult = await client.query<{ user_id: string }>(
      `
        INSERT INTO chat_members (conversation_id, user_id, role)
        VALUES ($1, $2, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING
        RETURNING user_id
      `,
      [conversationId, actorUserId]
    );

    joined = Boolean(memberInsertResult.rowCount);

    if (joined) {
      const usageResult = await client.query<{ use_count: number | string }>(
        `
          UPDATE chat_group_invites
          SET
            use_count = use_count + 1,
            last_used_at = NOW(),
            last_used_by = $2,
            updated_at = NOW()
          WHERE id = $1
          RETURNING use_count
        `,
        [inviteId, actorUserId]
      );

      useCount = Number(usageResult.rows[0]?.use_count ?? useCount + 1);

      joinMessage = await appendSystemChatMessage(client, {
        conversationId,
        text: 'A new member joined via invite link.',
        metadata: {
          event: 'group_invite_joined',
          actorUserId,
          inviteId,
        },
      });

      await client.query(
        `
          UPDATE chat_conversations
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [conversationId]
      );
    }

    participantIds = await listChatParticipantIds(client, conversationId);
    botIds = await listChatBotIds(client, conversationId);

    const latestMessageResult = await client.query<{ id: string; body: string; body_ciphertext: string | null; key_version: number | null; created_at: string }>(
      `
        SELECT id, body, body_ciphertext, key_version, created_at::text
        FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [conversationId]
    );

    if (latestMessageResult.rowCount) {
      const latestRow = latestMessageResult.rows[0];
      // PII encryption: resolve body from ciphertext or plaintext fallback.
      lastMessage = await resolveMessageBody(latestRow.id, latestRow.body, latestRow.body_ciphertext ?? null);
      lastMessageTime = latestRow.created_at;
    } else {
      lastMessage = `${conversationTitle ?? 'Group'} created.`;
      lastMessageTime = new Date().toISOString();
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (joinMessage) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.member.joined_via_invite',
      payload: {
        conversationId,
        actorUserId,
        inviteId,
        messageId: joinMessage.id,
      },
    });
  }

  reply.code(joined ? 201 : 200);
  return {
    ok: true,
    joined,
    conversation: {
      id: conversationId,
      type: 'group' as const,
      title: conversationTitle,
      ownerId,
      itemId,
      participantIds,
      botIds,
      lastMessage,
      lastMessageTime,
      unread: false,
    },
    invite: {
      id: inviteId,
      maxUses,
      useCount,
      expiresAt,
      remainingUses: maxUses > 0 ? Math.max(0, maxUses - useCount) : null,
    },
  };
});

app.get('/chat/bots', async (request) => {
  const authUserId = request.authUser?.userId;
  const result = await db.query<{
    id: string;
    slug: string;
    name: string;
    description: string;
    command_hint: string;
    category: 'moderation' | 'commerce' | 'automation';
    type: 'system' | 'custom';
    status: string;
    runtime_mode: string;
    is_draft: boolean;
    is_active: boolean;
    permissions: unknown;
    icon: string | null;
    owner_id: string | null;
    agent_config: unknown;
  }>(
    `
      SELECT
        id,
        slug,
        name,
        description,
        command_hint,
        category,
        type,
        status,
        runtime_mode,
        is_draft,
        is_active,
        permissions,
        icon,
        owner_id,
        agent_config
      FROM chat_bots
      WHERE (type = 'system' AND is_active = TRUE)
         OR (type = 'custom' AND owner_id = $1 AND status != 'disabled' AND is_draft = FALSE)
      ORDER BY type ASC, name ASC
    `,
    [authUserId ?? '']
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      commandHint: row.command_hint,
      category: row.category,
      type: row.type,
      status: row.status,
      runtimeMode: row.runtime_mode,
      isDraft: row.is_draft,
      isActive: row.is_active,
      permissions: row.permissions,
      icon: row.icon,
      ownerId: row.owner_id,
      agentConfig: row.runtime_mode === 'ai' ? publicAgentConfig(row.agent_config) : null,
      ...botRuntimeReadiness(row.runtime_mode),
    })),
  };
});

app.get('/chat/conversations/:conversationId/bots', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  await ensureGroupConversationAccess(db, conversationId, actorUserId);

  const result = await db.query<{
    bot_id: string;
    bot_name: string;
    bot_slug: string;
    bot_category: string;
    bot_type: 'system' | 'custom';
    command_hint: string;
    runtime_mode: string;
    bot_status: string;
    install_status: string;
    permissions_snapshot: unknown;
    installed_by: string | null;
    installed_at: string;
    agent_config: unknown;
  }>(
    `
      SELECT
        b.id AS bot_id,
        b.name AS bot_name,
        b.slug AS bot_slug,
        b.category AS bot_category,
        b.type AS bot_type,
        b.command_hint,
        b.runtime_mode,
        b.status AS bot_status,
        cbi.status AS install_status,
        cbi.permissions_snapshot,
        cbi.installed_by,
        cbi.installed_at,
        b.agent_config
      FROM chat_bot_installs cbi
      JOIN chat_bots b ON b.id = cbi.bot_id
      WHERE cbi.conversation_id = $1
        AND cbi.status = 'active'
        AND b.is_active = TRUE
        AND b.status != 'disabled'
      ORDER BY cbi.installed_at ASC
    `,
    [conversationId]
  );

  return {
    ok: true,
    conversationId,
    items: result.rows.map((row) => ({
      botId: row.bot_id,
      botName: row.bot_name,
      botSlug: row.bot_slug,
      botCategory: row.bot_category,
      botType: row.bot_type,
      commandHint: row.command_hint,
      runtimeMode: row.runtime_mode,
      status: row.bot_status,
      installStatus: row.install_status,
      permissionsSnapshot: row.permissions_snapshot,
      runtimeReady: row.runtime_mode !== 'ai' || isAgentRuntimeReady(),
      runtimeReadinessReason: row.runtime_mode === 'ai' ? agentRuntimeReadinessReason() : null,
      installedBy: row.installed_by,
      installedAt: row.installed_at,
      agentConfig: row.runtime_mode === 'ai' ? publicAgentConfig(row.agent_config) : null,
    })),
  };
});

app.post('/chat/conversations/:conversationId/bots/:botId/deploy', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    botId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, botId } = paramsSchema.parse(request.params);
  await ensureGroupManagementAccess(db, conversationId, actorUserId, request.authUser?.role);

  const botResult = await db.query<{
    id: string;
    name: string;
    command_hint: string;
    type: 'system' | 'custom';
    status: string;
    runtime_mode: string;
    is_draft: boolean;
    permissions: unknown;
    owner_id: string | null;
    agent_config: unknown;
  }>(
    `
      SELECT id, name, command_hint, type, status, runtime_mode, is_draft, permissions, owner_id, agent_config
      FROM chat_bots
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [botId]
  );

  if (!botResult.rowCount) {
    throw createApiError('CHAT_BOT_NOT_FOUND', 'Chat bot not found', {
      botId,
    });
  }

  const bot = botResult.rows[0];

  if (bot.type === 'custom' && bot.owner_id !== actorUserId) {
    throw createApiError('FORBIDDEN_USER_CONTEXT', 'Only the agent owner can connect this private agent.');
  }

  if (bot.is_draft) {
    throw createApiError('CHAT_BOT_DEPLOY_BLOCKED', 'Draft bots cannot be deployed. Publish the bot first.');
  }

  if (bot.status === 'backend-required') {
    throw createApiError('CHAT_BOT_DEPLOY_BLOCKED', 'This bot requires a backend runtime that is not currently connected.');
  }

  if (bot.runtime_mode === 'ai' && !isAgentRuntimeReady()) {
    throw createApiError(
      'CHAT_BOT_DEPLOY_BLOCKED',
      agentRuntimeReadinessReason() ?? 'The AI provider is unavailable.'
    );
  }

  const client = await db.connect();
  let installed = false;
  let updateMessage: { id: string; createdAt: string } | null = null;
  let botIds: string[] = [];

  try {
    await client.query('BEGIN');

    const installResult = await client.query<{ bot_id: string }>(
      `
        INSERT INTO chat_bot_installs (
          conversation_id,
          bot_id,
          installed_by,
          permissions_snapshot,
          configuration_snapshot
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (conversation_id, bot_id) DO UPDATE
        SET
          status = 'active',
          permissions_snapshot = EXCLUDED.permissions_snapshot,
          configuration_snapshot = EXCLUDED.configuration_snapshot,
          updated_at = NOW()
        RETURNING bot_id
      `,
      [
        conversationId,
        botId,
        actorUserId,
        toJsonString(bot.permissions ?? []),
        toJsonString(bot.runtime_mode === 'ai' ? normalizeAgentConfig(bot.agent_config) : {}),
      ]
    );

    installed = Boolean(installResult.rowCount);
    if (installed) {
      updateMessage = await appendSystemChatMessage(client, {
        conversationId,
          text: `${bot.name} connected. Try ${bot.command_hint} or mention the agent by name.`,
        metadata: {
          event: 'group_bot_deployed',
          actorUserId,
          botId,
          botType: bot.type,
          runtimeMode: bot.runtime_mode,
          runtimeAvailable: bot.runtime_mode !== 'ai' || isAgentRuntimeReady(),
        },
      });

      await client.query(
        `
          UPDATE chat_conversations
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [conversationId]
      );

      await client.query(
        `
          INSERT INTO chat_bot_audit_events (id, bot_id, conversation_id, actor_user_id, event_type, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          createRuntimeId('baev'),
          botId,
          conversationId,
          actorUserId,
          'deployed',
          toJsonString({
            runtimeMode: bot.runtime_mode,
            runtimeAvailable: bot.runtime_mode !== 'ai' || isAgentRuntimeReady(),
          }),
        ]
      );
    }

    botIds = await listChatBotIds(client, conversationId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (updateMessage) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.bot.deployed',
      payload: {
        conversationId,
        botId,
        actorUserId,
        messageId: updateMessage.id,
        runtimeMode: bot.runtime_mode,
        runtimeAvailable: bot.runtime_mode !== 'ai' || isAgentRuntimeReady(),
      },
    });
  }

  return {
    ok: true,
    conversationId,
    botId,
    installed,
    botIds,
    runtimeMode: bot.runtime_mode,
    runtimeAvailable: bot.runtime_mode !== 'ai' || isAgentRuntimeReady(),
  };
});

app.delete('/chat/conversations/:conversationId/bots/:botId', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    botId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, botId } = paramsSchema.parse(request.params);
  await ensureGroupManagementAccess(db, conversationId, actorUserId, request.authUser?.role);

  const botResult = await db.query<{ id: string; name: string }>(
    `
      SELECT id, name
      FROM chat_bots
      WHERE id = $1
      LIMIT 1
    `,
    [botId]
  );

  if (!botResult.rowCount) {
    throw createApiError('CHAT_BOT_NOT_FOUND', 'Chat bot not found', {
      botId,
    });
  }

  const bot = botResult.rows[0];
  const client = await db.connect();
  let removed = false;
  let updateMessage: { id: string; createdAt: string } | null = null;
  let botIds: string[] = [];

  try {
    await client.query('BEGIN');

    const updateResult = await client.query<{ bot_id: string }>(
      `
        UPDATE chat_bot_installs
        SET status = 'removed', updated_at = NOW()
        WHERE conversation_id = $1
          AND bot_id = $2
          AND status = 'active'
        RETURNING bot_id
      `,
      [conversationId, botId]
    );

    removed = Boolean(updateResult.rowCount);
    if (removed) {
      updateMessage = await appendSystemChatMessage(client, {
        conversationId,
        text: `${bot.name} removed from the group.`,
        metadata: {
          event: 'group_bot_removed',
          actorUserId,
          botId,
        },
      });

      await client.query(
        `
          UPDATE chat_conversations
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [conversationId]
      );

      await client.query(
        `
          INSERT INTO chat_bot_audit_events (id, bot_id, conversation_id, actor_user_id, event_type, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          createRuntimeId('baev'),
          botId,
          conversationId,
          actorUserId,
          'removed',
          toJsonString({}),
        ]
      );
    }

    botIds = await listChatBotIds(client, conversationId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (updateMessage) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.bot.removed',
      payload: {
        conversationId,
        botId,
        actorUserId,
        messageId: updateMessage.id,
      },
    });
  }

  return {
    ok: true,
    conversationId,
    botId,
    removed,
    botIds,
  };
});

app.post('/chat/conversations/:conversationId/bots/:botId/command', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
    botId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    command: z.string().min(1).max(200),
    args: z.array(z.string()).default([]),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId, botId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const conversation = await ensureGroupConversationAccess(db, conversationId, actorUserId);

  const botResult = await db.query<{ id: string; name: string; runtime_mode: string }>(
    `
      SELECT id, name, runtime_mode
      FROM chat_bots
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [botId]
  );

  if (!botResult.rowCount) {
    throw createApiError('CHAT_BOT_NOT_FOUND', 'Chat bot not found', { botId });
  }

  const bot = botResult.rows[0];

  const execution = await executeBotCommand(db, {
    conversationId,
    conversationType: 'group',
    conversationTitle: conversation.title ?? null,
    actorUserId,
    actorUserName: null,
    messageText: [payload.command, ...payload.args].join(' '),
    targetBotId: botId,
    command: payload.command,
    args: payload.args,
  });

  reply.code(200);
  return {
    ok: true,
    runtimeAvailable: bot.runtime_mode !== 'ai' || isAgentRuntimeReady(),
    executed: execution.messageId !== null,
    messageId: execution.messageId,
    botId,
    conversationId,
    command: payload.command,
    args: payload.args,
  };
});

app.get('/chat/conversations/:conversationId/group-settings', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const conversation = await ensureGroupConversationAccess(db, conversationId, actorUserId);
  const [settings, membershipRole] = await Promise.all([
    resolveGroupSettings(db, conversationId),
    resolveGroupConversationMembershipRole(db, conversationId, actorUserId),
  ]);
  const canManage = request.authUser?.role === 'admin'
    || conversation.owner_id === actorUserId
    || membershipRole === 'owner'
    || membershipRole === 'admin';

  return {
    ok: true,
    conversationId,
    settings: serializeGroupSettings(settings),
    capabilities: {
      canManage,
      canEditGroupInfo: canManage || settings.edit_group_info_scope === 'everyone',
      canSendMessages: canManage || settings.send_messages_scope === 'everyone',
      canAddMembers: canManage || settings.add_members_scope === 'everyone',
    },
  };
});

app.patch('/chat/conversations/:conversationId/group-settings', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    editGroupInfo: z.enum(['admins', 'everyone']).optional(),
    sendMessages: z.enum(['admins', 'everyone']).optional(),
    addMembers: z.enum(['admins', 'everyone']).optional(),
  }).refine(
    (value) => value.editGroupInfo !== undefined
      || value.sendMessages !== undefined
      || value.addMembers !== undefined,
    { message: 'At least one group permission is required' },
  );

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});
  const client = await db.connect();
  let serializedSettings: ReturnType<typeof serializeGroupSettings>;
  let changed = false;
  let systemMessage: { id: string; createdAt: string } | null = null;

  try {
    await client.query('BEGIN');
    await ensureGroupManagementAccess(
      client,
      conversationId,
      actorUserId,
      request.authUser?.role,
    );

    const currentResult = await client.query<ChatGroupSettingsRow>(
      `
        SELECT
          edit_group_info_scope,
          send_messages_scope,
          add_members_scope,
          updated_by,
          updated_at::text
        FROM chat_group_settings
        WHERE conversation_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [conversationId],
    );
    const current = currentResult.rows[0] ?? DEFAULT_GROUP_SETTINGS;
    const next = {
      editGroupInfo: payload.editGroupInfo ?? current.edit_group_info_scope,
      sendMessages: payload.sendMessages ?? current.send_messages_scope,
      addMembers: payload.addMembers ?? current.add_members_scope,
    };
    changed = next.editGroupInfo !== current.edit_group_info_scope
      || next.sendMessages !== current.send_messages_scope
      || next.addMembers !== current.add_members_scope;

    const updatedResult = await client.query<ChatGroupSettingsRow>(
      `
        INSERT INTO chat_group_settings (
          conversation_id,
          edit_group_info_scope,
          send_messages_scope,
          add_members_scope,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (conversation_id) DO UPDATE
        SET
          edit_group_info_scope = EXCLUDED.edit_group_info_scope,
          send_messages_scope = EXCLUDED.send_messages_scope,
          add_members_scope = EXCLUDED.add_members_scope,
          updated_by = EXCLUDED.updated_by,
          updated_at = CASE
            WHEN chat_group_settings.edit_group_info_scope IS DISTINCT FROM EXCLUDED.edit_group_info_scope
              OR chat_group_settings.send_messages_scope IS DISTINCT FROM EXCLUDED.send_messages_scope
              OR chat_group_settings.add_members_scope IS DISTINCT FROM EXCLUDED.add_members_scope
            THEN NOW()
            ELSE chat_group_settings.updated_at
          END
        RETURNING
          edit_group_info_scope,
          send_messages_scope,
          add_members_scope,
          updated_by,
          updated_at::text
      `,
      [conversationId, next.editGroupInfo, next.sendMessages, next.addMembers, actorUserId],
    );
    serializedSettings = serializeGroupSettings(updatedResult.rows[0]);

    if (changed) {
      systemMessage = await appendSystemChatMessage(client, {
        conversationId,
        text: 'Group permissions updated.',
        metadata: {
          event: 'group_settings_updated',
          actorUserId,
          settings: serializedSettings,
        },
      });
      await client.query(
        `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
        [conversationId],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (changed) {
    publishRealtimeEvent({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.group.settings.updated',
      payload: {
        conversationId,
        actorUserId,
        settings: serializedSettings!,
        messageId: systemMessage?.id ?? null,
      },
    });
  }

  return {
    ok: true,
    conversationId,
    changed,
    settings: serializedSettings!,
  };
});

app.get('/chat/conversations/:conversationId', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const result = await db.query<{
    id: string;
    type: 'dm' | 'group';
    title: string | null;
    owner_id: string;
    item_id: string | null;
    metadata: unknown;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT id, type, title, owner_id, item_id, metadata, created_at, updated_at
      FROM chat_conversations
      WHERE id = $1
      LIMIT 1
    `,
    [conversationId]
  );

  const conversation = result.rows[0];
  const conversationMetadata = asObject(conversation.metadata);
  const contextMap = await resolveConversationsContextBatch(db, [
    { conversationId, itemId: conversation.item_id },
  ]);
  const memberResult = await db.query<{ user_id: string; role: string; joined_at: string }>(
    `
      SELECT user_id, role, joined_at
      FROM chat_members
      WHERE conversation_id = $1
      ORDER BY joined_at ASC
    `,
    [conversationId]
  );

  const botResult = await db.query<{
    bot_id: string;
    installed_at: string;
    install_status: string;
  }>(
    `
      SELECT bot_id, installed_at::text, status AS install_status
      FROM chat_bot_installs
      WHERE conversation_id = $1
        AND status = 'active'
      ORDER BY installed_at ASC
    `,
    [conversationId]
  );

  return {
    ok: true,
    conversation: {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      ownerId: conversation.owner_id,
      itemId: conversation.item_id,
      description: typeof conversationMetadata.description === 'string'
        ? conversationMetadata.description
        : null,
      avatar: typeof conversationMetadata.avatar === 'string'
        ? conversationMetadata.avatar
        : null,
      coverPhoto: typeof conversationMetadata.coverPhoto === 'string'
        ? conversationMetadata.coverPhoto
        : null,
      metadata: conversation.metadata,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      participantIds: memberResult.rows.map((r) => r.user_id),
      memberRoles: memberResult.rows.reduce((acc, r) => {
        acc[r.user_id] = r.role;
        return acc;
      }, {} as Record<string, string>),
      botIds: botResult.rows.map((r) => r.bot_id),
      botInstalls: botResult.rows.map((r) => ({
        botId: r.bot_id,
        installedAt: r.installed_at,
        status: r.install_status,
      })),
      context: contextMap.get(conversationId) ?? null,
    },
  };
});

app.patch('/chat/conversations/:conversationId', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });
  const bodySchema = z.object({
    title: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(280).optional(),
    avatar: z.string().trim().max(512).nullable().optional(),
    avatarFinalizationId: z.string().trim().min(2).max(120).optional(),
    coverPhoto: z.string().trim().max(512).nullable().optional(),
    coverPhotoFinalizationId: z.string().trim().min(2).max(120).optional(),
  }).superRefine((value, context) => {
    if (typeof value.avatar === 'string' && !value.avatarFinalizationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['avatarFinalizationId'],
        message: 'A finalized upload receipt is required for a group photo',
      });
    }
    if (typeof value.coverPhoto === 'string' && !value.coverPhotoFinalizationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coverPhotoFinalizationId'],
        message: 'A finalized upload receipt is required for a cover photo',
      });
    }
    if (
      value.title === undefined
      && value.description === undefined
      && value.avatar === undefined
      && value.coverPhoto === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one group identity field is required',
      });
    }
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const idempotencyKey = resolveHeaderString(request.headers['x-idempotency-key']);
  const requestHash = hashGroupCreatePayload({ conversationId, ...payload });
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const conversation = await ensureGroupCapabilityAccess(
      client,
      conversationId,
      actorUserId,
      'edit_group_info',
      request.authUser?.role
    );

    if (idempotencyKey) {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`chat-group-edit:${actorUserId}:${idempotencyKey}`]
      );
      const cachedResponse = await getChatGroupIdempotentResponse(client, {
        creatorId: actorUserId,
        idempotencyKey,
        requestHash,
      });
      if (cachedResponse) {
        await client.query('COMMIT');
        return cachedResponse;
      }
    }

    if (typeof payload.avatar === 'string' && payload.avatarFinalizationId) {
      await ensureOwnedGroupAvatarReceipt(client, {
        actorUserId,
        finalizationId: payload.avatarFinalizationId,
        avatarUrl: payload.avatar,
      });
    }

    if (typeof payload.coverPhoto === 'string' && payload.coverPhotoFinalizationId) {
      await ensureOwnedGroupMediaReceipt(client, {
        actorUserId,
        finalizationId: payload.coverPhotoFinalizationId,
        mediaUrl: payload.coverPhoto,
        folder: 'covers',
        scope: 'cover',
      });
    }

    const currentResult = await client.query<{
      title: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT title, metadata FROM chat_conversations WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [conversationId]
    );
    const current = currentResult.rows[0];
    const currentMetadata = asObject(current.metadata);
    const nextTitle = payload.title ?? current.title ?? 'Group chat';
    const nextMetadata = {
      ...currentMetadata,
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.avatar !== undefined ? { avatar: payload.avatar } : {}),
      ...(payload.avatarFinalizationId !== undefined
        ? { avatarFinalizationId: payload.avatarFinalizationId }
        : payload.avatar === null
          ? { avatarFinalizationId: null }
          : {}),
      ...(payload.coverPhoto !== undefined ? { coverPhoto: payload.coverPhoto } : {}),
      ...(payload.coverPhotoFinalizationId !== undefined
        ? { coverPhotoFinalizationId: payload.coverPhotoFinalizationId }
        : payload.coverPhoto === null
          ? { coverPhotoFinalizationId: null }
          : {}),
    };

    const updatedResult = await client.query<{ updated_at: string }>(
      `
        UPDATE chat_conversations
        SET title = $2, metadata = $3::jsonb, updated_at = NOW()
        WHERE id = $1
        RETURNING updated_at::text
      `,
      [conversationId, nextTitle, toJsonString(nextMetadata)]
    );

    const changedFields = [
      payload.title !== undefined ? 'name' : null,
      payload.description !== undefined ? 'description' : null,
      payload.avatar !== undefined ? 'photo' : null,
      payload.coverPhoto !== undefined ? 'cover photo' : null,
    ].filter((value): value is string => Boolean(value));
    const identityUpdateText = changedFields.length === 1
      ? `Group ${changedFields[0]} updated.`
      : 'Group details updated.';
    const systemMessage = await appendSystemChatMessage(client, {
      conversationId,
      text: identityUpdateText,
      metadata: {
        event: 'group_identity_updated',
        actorUserId,
        changedFields,
      },
    });

    const responsePayload = {
      ok: true,
      conversation: {
        id: conversationId,
        type: 'group' as const,
        title: nextTitle,
        ownerId: conversation.owner_id,
        itemId: conversation.item_id,
        description: typeof nextMetadata.description === 'string' ? nextMetadata.description : null,
        avatar: typeof nextMetadata.avatar === 'string' ? nextMetadata.avatar : null,
        coverPhoto: typeof nextMetadata.coverPhoto === 'string' ? nextMetadata.coverPhoto : null,
        updatedAt: updatedResult.rows[0].updated_at,
      },
      systemMessage: {
        id: systemMessage.id,
        createdAt: systemMessage.createdAt,
      },
    };

    if (idempotencyKey) {
      await saveChatGroupIdempotentResponse(client, {
        creatorId: actorUserId,
        idempotencyKey,
        requestHash,
        conversationId,
        responsePayload,
      });
    }

    await client.query('COMMIT');

    try {
      publishRealtimeEvent({
        topic: `chat.conversation:${conversationId}`,
        type: 'chat.message.created',
        payload: {
          id: systemMessage.id,
          conversationId,
          senderType: 'system',
          senderUserId: null,
          senderBotId: null,
          body: identityUpdateText,
          metadata: {
            event: 'group_identity_updated',
            actorUserId,
            changedFields,
          },
          createdAt: systemMessage.createdAt,
        },
      });
      publishRealtimeEvent({
        topic: `chat.conversation:${conversationId}`,
        type: 'chat.group.identity.updated',
        payload: {
          conversationId,
          actorUserId,
          changedFields,
          title: nextTitle,
          description: responsePayload.conversation.description,
          avatar: responsePayload.conversation.avatar,
          coverPhoto: responsePayload.conversation.coverPhoto,
          updatedAt: responsePayload.conversation.updatedAt,
        },
      });
    } catch (eventError) {
      request.log.error(
        { err: eventError, conversationId, actorUserId },
        'Failed to publish group identity update after commit'
      );
    }

    return responsePayload;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/chat/conversations/:conversationId/members', async (request) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const result = await db.query<{
    user_id: string;
    role: string;
    joined_at: string;
  }>(
    `
      SELECT user_id, role, joined_at::text
      FROM chat_members
      WHERE conversation_id = $1
      ORDER BY joined_at ASC
    `,
    [conversationId]
  );

  return {
    ok: true,
    conversationId,
    items: result.rows.map((row) => ({
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
    })),
  };
});

// â”€â”€ Conversation participant summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns participant list with profile info and last-read timestamps.
// Used by the chat info screen to show who is in a conversation.
app.get('/chat/conversations/:conversationId/participants', async (request, reply) => {
  const paramsSchema = z.object({
    conversationId: z.string().min(2).max(120),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);

  // Verify conversation exists and the requesting user is a participant
  const convCheck = await db.query<{ id: string }>(
    `SELECT id FROM chat_conversations WHERE id = $1 LIMIT 1`,
    [conversationId]
  );
  if (!convCheck.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Conversation not found' };
  }
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const result = await db.query<{
    user_id: string;
    role: string;
    joined_at: string;
    last_read_at: string | null;
    username: string | null;
    display_name: string | null;
    avatar: string | null;
    last_activity_at: string | null;
  }>(
    `
      SELECT
        cm.user_id,
        cm.role,
        cm.joined_at::text,
        cm.last_read_at::text AS last_read_at,
        u.username,
        u.display_name,
        u.avatar,
        (
          SELECT MAX(m.created_at)::text
          FROM chat_messages m
          WHERE m.conversation_id = cm.conversation_id
        ) AS last_activity_at
      FROM chat_members cm
      LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = $1
      ORDER BY cm.joined_at ASC
    `,
    [conversationId]
  );

  return {
    ok: true,
    conversationId,
    participantCount: result.rowCount,
    participants: result.rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      role: row.role,
      joinedAt: row.joined_at,
      lastReadAt: row.last_read_at,
    })),
    lastActivityAt: result.rows[0]?.last_activity_at ?? null,
  };
});

// â”€â”€ Per-user conversation state: mute, archive, message-request status â”€â”€

app.post('/chat/conversations/:conversationId/mute', async (request) => {
  const paramsSchema = z.object({ conversationId: z.string().min(2).max(120) });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  await db.query(
    `
      INSERT INTO chat_conversation_user_state (user_id, conversation_id, is_muted, updated_at)
      VALUES ($1, $2, TRUE, NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET is_muted = TRUE, updated_at = NOW()
    `,
    [actorUserId, conversationId]
  );

  return { ok: true, conversationId, isMuted: true };
});

app.delete('/chat/conversations/:conversationId/mute', async (request) => {
  const paramsSchema = z.object({ conversationId: z.string().min(2).max(120) });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  await db.query(
    `
      INSERT INTO chat_conversation_user_state (user_id, conversation_id, is_muted, updated_at)
      VALUES ($1, $2, FALSE, NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET is_muted = FALSE, updated_at = NOW()
    `,
    [actorUserId, conversationId]
  );

  return { ok: true, conversationId, isMuted: false };
});

app.post('/chat/conversations/:conversationId/archive', async (request) => {
  const paramsSchema = z.object({ conversationId: z.string().min(2).max(120) });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  await db.query(
    `
      INSERT INTO chat_conversation_user_state (user_id, conversation_id, is_archived, updated_at)
      VALUES ($1, $2, TRUE, NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET is_archived = TRUE, updated_at = NOW()
    `,
    [actorUserId, conversationId]
  );

  return { ok: true, conversationId, isArchived: true };
});

app.delete('/chat/conversations/:conversationId/archive', async (request) => {
  const paramsSchema = z.object({ conversationId: z.string().min(2).max(120) });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  await db.query(
    `
      INSERT INTO chat_conversation_user_state (user_id, conversation_id, is_archived, updated_at)
      VALUES ($1, $2, FALSE, NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET is_archived = FALSE, updated_at = NOW()
    `,
    [actorUserId, conversationId]
  );

  return { ok: true, conversationId, isArchived: false };
});

app.patch('/chat/conversations/:conversationId/pin', async (request) => {
  const paramsSchema = z.object({ conversationId: z.string().min(2).max(120) });
  const bodySchema = z.object({ pinned: z.boolean() });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const { pinned } = bodySchema.parse(request.body ?? {});
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  const nextRank = pinned ? 1 : 0;

  await db.query(
    `
      INSERT INTO chat_conversation_user_state (user_id, conversation_id, pinned_rank, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET pinned_rank = $3, updated_at = NOW()
    `,
    [actorUserId, conversationId, nextRank]
  );

  return { ok: true, conversationId, pinned, pinnedRank: nextRank };
});

app.patch('/chat/conversations/:conversationId/unread', async (request) => {
  const paramsSchema = z.object({ conversationId: z.string().min(2).max(120) });
  const bodySchema = z.object({ unread: z.boolean() });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  const { unread } = bodySchema.parse(request.body ?? {});
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  if (unread) {
    const lastMessageResult = await db.query<{ id: string }>(
      `SELECT id FROM chat_messages
       WHERE conversation_id = $1 AND deleted_for_everyone_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [conversationId]
    );
    const markedUnreadMessageId = lastMessageResult.rowCount
      ? lastMessageResult.rows[0].id
      : `manual-${conversationId}`;

    await db.query(
      `
        INSERT INTO chat_conversation_user_state (user_id, conversation_id, marked_unread_message_id, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, conversation_id)
        DO UPDATE SET marked_unread_message_id = $3, updated_at = NOW()
      `,
      [actorUserId, conversationId, markedUnreadMessageId]
    );

    return { ok: true, conversationId, unread: true, markedUnreadMessageId };
  }

  await db.query(
    `
      INSERT INTO chat_conversation_user_state (user_id, conversation_id, marked_unread_message_id, updated_at)
      VALUES ($1, $2, NULL, NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET marked_unread_message_id = NULL, updated_at = NOW()
    `,
    [actorUserId, conversationId]
  );

  await db.query(
    `UPDATE chat_members SET last_read_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, actorUserId]
  );

  return { ok: true, conversationId, unread: false, markedUnreadMessageId: null };
});

app.post('/chat/conversations/:conversationId/accept', async (request) => {
  const paramsSchema = z.object({ conversationId: z.string().min(2).max(120) });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  await db.query(
    `
      INSERT INTO chat_conversation_user_state (user_id, conversation_id, request_status, updated_at)
      VALUES ($1, $2, 'accepted', NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET request_status = 'accepted', updated_at = NOW()
    `,
    [actorUserId, conversationId]
  );

  return { ok: true, conversationId, requestStatus: 'accepted' };
});

app.post('/chat/conversations/:conversationId/decline', async (request) => {
  const paramsSchema = z.object({ conversationId: z.string().min(2).max(120) });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { conversationId } = paramsSchema.parse(request.params);
  await ensureChatConversationAccess(db, conversationId, actorUserId);

  await db.query(
    `
      INSERT INTO chat_conversation_user_state (user_id, conversation_id, request_status, updated_at)
      VALUES ($1, $2, 'declined', NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET request_status = 'declined', updated_at = NOW()
    `,
    [actorUserId, conversationId]
  );

  return { ok: true, conversationId, requestStatus: 'declined' };
});

// â”€â”€ Quick replies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/chat/quick-replies', async (request) => {
  const querySchema = z.object({
    role: z.enum(['buyer', 'seller']).optional(),
  });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { role } = querySchema.parse(request.query ?? {});

  const result = await db.query<{
    id: string;
    role: string;
    title: string;
    body: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT id, role, title, body, sort_order, created_at::text, updated_at::text
      FROM chat_quick_replies
      WHERE user_id = $1 ${role ? 'AND role = $2' : ''}
      ORDER BY sort_order ASC, created_at ASC
    `,
    role ? [actorUserId, role] : [actorUserId]
  );

  return {
    ok: true,
    items: result.rows.map((row) => ({
      id: row.id,
      role: row.role,
      title: row.title,
      body: row.body,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
});

app.post('/chat/quick-replies', async (request) => {
  const bodySchema = z.object({
    role: z.enum(['buyer', 'seller']),
    title: z.string().trim().min(1).max(40),
    body: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const payload = bodySchema.parse(request.body ?? {});

  const id = `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sortOrder = payload.sortOrder ?? Date.now();

  await db.query(
    `
      INSERT INTO chat_quick_replies (id, user_id, role, title, body, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [id, actorUserId, payload.role, payload.title, payload.body, sortOrder]
  );

  return {
    ok: true,
    quickReply: {
      id,
      role: payload.role,
      title: payload.title,
      body: payload.body,
      sortOrder,
    },
  };
});

app.put('/chat/quick-replies/:replyId', async (request) => {
  const paramsSchema = z.object({ replyId: z.string().min(2).max(120) });
  const bodySchema = z.object({
    title: z.string().trim().min(1).max(40).optional(),
    body: z.string().trim().min(1).max(200).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  });

  const actorUserId = resolveAuthenticatedUserId(request);
  const { replyId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});

  const setClauses: string[] = [];
  const values: unknown[] = [replyId, actorUserId];
  let paramIdx = 3;

  if (payload.title !== undefined) {
    setClauses.push(`title = $${paramIdx++}`);
    values.push(payload.title);
  }
  if (payload.body !== undefined) {
    setClauses.push(`body = $${paramIdx++}`);
    values.push(payload.body);
  }
  if (payload.sortOrder !== undefined) {
    setClauses.push(`sort_order = $${paramIdx++}`);
    values.push(payload.sortOrder);
  }

  if (setClauses.length === 0) {
    return { ok: true, replyId, updated: {} };
  }

  setClauses.push(`updated_at = NOW()`);

  const result = await db.query<{ id: string }>(
    `
      UPDATE chat_quick_replies
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
    values
  );

  if (result.rowCount === 0) {
    throw createApiError('NOT_FOUND', 'Quick reply not found');
  }

  return {
    ok: true,
    replyId,
    updated: {
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.body !== undefined ? { body: payload.body } : {}),
      ...(payload.sortOrder !== undefined ? { sortOrder: payload.sortOrder } : {}),
    },
  };
});

app.delete('/chat/quick-replies/:replyId', async (request) => {
  const paramsSchema = z.object({ replyId: z.string().min(2).max(120) });
  const actorUserId = resolveAuthenticatedUserId(request);
  const { replyId } = paramsSchema.parse(request.params);

  const result = await db.query<{ id: string }>(
    `DELETE FROM chat_quick_replies WHERE id = $1 AND user_id = $2 RETURNING id`,
    [replyId, actorUserId]
  );

  if (result.rowCount === 0) {
    throw createApiError('NOT_FOUND', 'Quick reply not found');
  }

  return { ok: true, replyId, deleted: true };
});
};
