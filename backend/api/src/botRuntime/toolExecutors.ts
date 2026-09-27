/**
 * Tool executors — the real domain-backed implementations behind the
 * agent_tools registry (Phase 6). Each executor runs inside the acting
 * user's scope: reads return only data the actor is already allowed to see
 * (their own rows, active listings, their own conversations), and every
 * result is JSON-serialised for the model's function_call_output channel.
 *
 * Deny-by-default: a tool name with no executor is a failed call, never a
 * fabricated success.
 */

import type { Pool } from 'pg';
import type { BotRuntimeContext } from './types.js';
import type { ToolRegistryDb } from './toolRegistry.js';
import { withActorContext } from '../db/pool.js';
import { resolveMessageBody } from '../lib/messageEncryption.js';
import { logger } from '../lib/logger.js';
import {
  getAgentMemorySettings,
  recallAgentMemories,
  retractAgentMemory,
  storeAgentMemory,
} from '../lib/agentMemory.js';

export interface ToolExecutionResult {
  success: boolean;
  /** JSON-encoded payload handed back to the model as function_call_output. */
  output: string;
}

type Executor = (
  db: ToolRegistryDb,
  ctx: BotRuntimeContext,
  args: Record<string, unknown>,
) => Promise<ToolExecutionResult>;

function ok(payload: unknown): ToolExecutionResult {
  return { success: true, output: JSON.stringify(payload) };
}

function fail(message: string): ToolExecutionResult {
  return { success: false, output: JSON.stringify({ error: message }) };
}

function boundedLimit(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

// ── Catalog reads ──────────────────────────────────────────────────────

const execSearchListings: Executor = async (db, _ctx, args) => {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return fail('query is required');
  const limit = boundedLimit(args.maxResults, 10, 25);
  const minPrice = Number.isFinite(Number(args.minPrice)) ? Number(args.minPrice) : null;
  const maxPrice = Number.isFinite(Number(args.maxPrice)) ? Number(args.maxPrice) : null;
  const pattern = `%${query}%`;

  const res = await db.query(
    `SELECT l.id, l.title, l.price_gbp::text, l.brand, l.category, l.condition,
            u.username AS seller_username
     FROM listings l
     JOIN users u ON u.id = l.seller_id
     WHERE l.status = 'active'
       AND (l.title ILIKE $1 OR COALESCE(l.description,'') ILIKE $1
            OR COALESCE(l.brand,'') ILIKE $1 OR COALESCE(l.category,'') ILIKE $1)
       AND ($2::numeric IS NULL OR l.price_gbp >= $2)
       AND ($3::numeric IS NULL OR l.price_gbp <= $3)
     ORDER BY l.created_at DESC
     LIMIT $4`,
    [pattern, minPrice, maxPrice, limit],
  );
  return ok({
    listings: res.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      title: r.title,
      priceGbp: Number(r.price_gbp),
      brand: r.brand ?? null,
      category: r.category ?? null,
      condition: r.condition ?? null,
      seller: r.seller_username ?? null,
    })),
    count: res.rowCount ?? 0,
  });
};

const execGetListingDetails: Executor = async (db, _ctx, args) => {
  const listingId = typeof args.listingId === 'string' ? args.listingId.trim() : '';
  if (!listingId) return fail('listingId is required');
  const res = await db.query(
    `SELECT l.id, l.title, l.description, l.price_gbp::text, l.brand, l.category,
            l.condition, l.size, l.status, l.created_at::text,
            u.username AS seller_username
     FROM listings l
     JOIN users u ON u.id = l.seller_id
     WHERE l.id = $1 AND l.status IN ('active', 'sold')
     LIMIT 1`,
    [listingId],
  );
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) return fail('listing not found or not available');
  return ok({
    listing: {
      id: row.id,
      title: row.title,
      description: typeof row.description === 'string' ? row.description.slice(0, 800) : '',
      priceGbp: Number(row.price_gbp),
      brand: row.brand ?? null,
      category: row.category ?? null,
      condition: row.condition ?? null,
      size: row.size ?? null,
      status: row.status,
      listedAt: row.created_at,
      seller: row.seller_username ?? null,
    },
  });
};

const execCheckPriceHistory: Executor = async (db, _ctx, args) => {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return fail('query is required');
  const days = boundedLimit(args.days, 30, 365);
  const res = await db.query(
    `SELECT o.total_gbp::text AS price, o.created_at::text, l.title
     FROM orders o
     JOIN listings l ON l.id = o.listing_id
     WHERE o.status IN ('paid', 'shipped', 'delivered')
       AND l.title ILIKE $1
       AND o.created_at >= NOW() - ($2 || ' days')::interval
     ORDER BY o.created_at DESC
     LIMIT 25`,
    [`%${query}%`, String(days)],
  );
  const prices = res.rows.map((r: Record<string, unknown>) => Number(r.price)).filter(Number.isFinite);
  if (prices.length === 0) {
    return ok({ sales: [], count: 0, note: 'No recorded sales matched in the window.' });
  }
  return ok({
    count: prices.length,
    averageGbp: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
    minGbp: Math.min(...prices),
    maxGbp: Math.max(...prices),
    sales: res.rows.slice(0, 10).map((r: Record<string, unknown>) => ({
      title: r.title,
      priceGbp: Number(r.price),
      soldAt: r.created_at,
    })),
  });
};

// ── Conversation read ──────────────────────────────────────────────────

const execReadConversation: Executor = async (db, ctx, args) => {
  const limit = boundedLimit(args.maxMessages, 20, 50);
  const res = await db.query(
    `SELECT m.id, m.sender_type, m.body, m.body_ciphertext, m.created_at::text,
            u.username AS sender_username, b.name AS sender_bot_name
     FROM chat_messages m
     LEFT JOIN users u ON u.id = m.sender_user_id
     LEFT JOIN chat_bots b ON b.id = m.sender_bot_id
     WHERE m.conversation_id = $1 AND m.sender_type IN ('user', 'bot')
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [ctx.conversationId, limit],
  );
  const messages = await Promise.all(res.rows.map(async (r: Record<string, unknown>) => ({
    author: r.sender_type === 'bot' ? (r.sender_bot_name ?? 'agent') : (r.sender_username ?? 'user'),
    role: r.sender_type === 'bot' ? 'agent' : 'user',
    text: await resolveMessageBody(String(r.id), String(r.body ?? ''), r.body_ciphertext as string | null),
    at: r.created_at,
  })));
  return ok({ messages: messages.reverse() });
};

const execDraftReply: Executor = async (_db, _ctx, args) => {
  const text = typeof args.text === 'string' ? args.text.trim().slice(0, 4000) : '';
  if (!text) return fail('text is required');
  // Draft is returned to the model; publishing happens through the run's
  // own reply path — the tool never sends a message itself.
  return ok({ draft: text, status: 'drafted_not_sent' });
};

// ── Actor-scoped reads (the user's own data) ───────────────────────────

const execGetMyListings: Executor = async (db, ctx, args) => {
  const limit = boundedLimit(args.maxResults, 10, 25);
  const status = typeof args.status === 'string' ? args.status.trim() : null;
  const res = await db.query(
    `SELECT id, title, price_gbp::text, status, brand, category, created_at::text
     FROM listings
     WHERE seller_id = $1 AND status != 'deleted'
       AND ($2::text IS NULL OR status = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [ctx.actorUserId, status, limit],
  );
  return ok({
    listings: res.rows.map((r: Record<string, unknown>) => ({
      id: r.id, title: r.title, priceGbp: Number(r.price_gbp),
      status: r.status, brand: r.brand ?? null, category: r.category ?? null,
      listedAt: r.created_at,
    })),
    count: res.rowCount ?? 0,
  });
};

const execGetMyOrders: Executor = async (db, ctx, args) => {
  const limit = boundedLimit(args.maxResults, 10, 25);
  const role = args.role === 'buyer' || args.role === 'seller' ? args.role : 'any';
  const res = await db.query(
    `SELECT o.id, o.status, o.total_gbp::text, o.created_at::text,
            l.title AS listing_title,
            CASE WHEN o.buyer_id = $1 THEN 'buyer' ELSE 'seller' END AS role
     FROM orders o
     JOIN listings l ON l.id = o.listing_id
     WHERE (o.buyer_id = $1 OR o.seller_id = $1)
       AND ($2::text = 'any' OR ($2::text = 'buyer' AND o.buyer_id = $1) OR ($2::text = 'seller' AND o.seller_id = $1))
     ORDER BY o.created_at DESC
     LIMIT $3`,
    [ctx.actorUserId, role, limit],
  );
  return ok({
    orders: res.rows.map((r: Record<string, unknown>) => ({
      id: r.id, role: r.role, status: r.status,
      listingTitle: r.listing_title, totalGbp: Number(r.total_gbp),
      at: r.created_at,
    })),
    count: res.rowCount ?? 0,
  });
};

// ── Memory tools ───────────────────────────────────────────────────────

const MAX_RECALL_CAP = 12;

const execRecallMemories: Executor = async (db, ctx, args) => {
  const query = typeof args.query === 'string' ? args.query.trim() : ctx.messageText;
  const result = await recallAgentMemories(db, {
    userId: ctx.actorUserId,
    botId: ctx.botId,
    queryText: query || ctx.messageText,
    limit: boundedLimit(args.maxResults, 5, MAX_RECALL_CAP),
  });
  return ok({
    memories: result.memories.map((m) => ({ id: m.id, kind: m.kind, content: m.content })),
    method: result.method,
  });
};

const execStoreMemory: Executor = async (db, ctx, args) => {
  const settings = await getAgentMemorySettings(db, ctx.actorUserId);
  if (!settings.memoryEnabled) return fail('memory is disabled for this user');
  const kind = args.kind === 'preference' || args.kind === 'directive' ? args.kind : 'fact';
  const content = typeof args.content === 'string' ? args.content : '';
  const result = await storeAgentMemory(db, {
    userId: ctx.actorUserId,
    botId: ctx.botId,
    kind,
    content,
    sourceType: 'conversation',
    sourceConversationId: ctx.conversationId,
    sourceRunId: ctx.runId ?? null,
    confidence: 0.8,
  });
  if ('rejected' in result) return fail(`memory not stored: ${result.reason}`);
  return ok({ memoryId: result.id, stored: true, deduped: result.deduped });
};

const execForgetMemory: Executor = async (db, ctx, args) => {
  const memoryId = typeof args.memoryId === 'string' ? args.memoryId.trim() : '';
  if (memoryId) {
    const done = await retractAgentMemory(db, ctx.actorUserId, memoryId);
    return done ? ok({ forgotten: true, memoryId }) : fail('memory not found or already retracted');
  }
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return fail('query or memoryId is required');
  const found = await recallAgentMemories(db, {
    userId: ctx.actorUserId,
    botId: ctx.botId,
    queryText: query,
    limit: 1,
  });
  const target = found.memories[0];
  if (!target) return fail('no matching memory found');
  const done = await retractAgentMemory(db, ctx.actorUserId, target.id);
  return done
    ? ok({ forgotten: true, memoryId: target.id, content: target.content })
    : fail('memory could not be retracted');
};

// ── Registry ───────────────────────────────────────────────────────────

const EXECUTORS: Record<string, Executor> = {
  search_listings: execSearchListings,
  get_listing_details: execGetListingDetails,
  check_price_history: execCheckPriceHistory,
  read_conversation: execReadConversation,
  draft_reply: execDraftReply,
  get_my_listings: execGetMyListings,
  get_my_orders: execGetMyOrders,
  recall_memories: execRecallMemories,
  store_memory: execStoreMemory,
  forget_memory: execForgetMemory,
};

/**
 * Execute a policy-approved tool call. Returns a failed result (never
 * throws) for unknown tools so the model sees an honest error instead of a
 * fabricated success.
 */
export async function executeAgentTool(
  db: ToolRegistryDb,
  ctx: BotRuntimeContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const executor = EXECUTORS[toolName];
  if (!executor) return fail(`tool '${toolName}' has no executor`);
  try {
    // When handed the shared Pool, execute inside an actor-scoped
    // transaction (app.current_user_id set) so RLS policies apply once
    // enforcement is enabled. A PoolClient/test double runs directly.
    if (typeof (db as Pool).connect === 'function') {
      return await withActorContext(db as Pool, ctx.actorUserId, (client) =>
        executor(client, ctx, args),
      );
    }
    return await executor(db, ctx, args);
  } catch (error) {
    logger.warn(
      { toolName, err: error instanceof Error ? error.message : String(error) },
      'executeAgentTool — executor failed',
    );
    return fail(`tool '${toolName}' failed: ${error instanceof Error ? error.message.slice(0, 160) : 'unknown error'}`);
  }
}
