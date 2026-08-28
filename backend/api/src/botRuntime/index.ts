/**
 * BotRuntime — Main execution orchestrator
 *
 * Steps:
 * 1. Look up active bot installs in the conversation.
 * 2. Match the message text against each bot's command hint.
 * 3. If matched, resolve the handler by category.
 * 4. Execute handler with runtime context.
 * 5. If handler returns shouldReply=true, insert a bot message.
 * 6. Publish realtime event for the bot message.
 * 7. Log audit event for command execution.
 *
 * 2026 enhancements:
 * - Confidence scoring and human fallback are propagated from handler
 *   results into the audit trail and bot message metadata.
 * - Every response includes an `explanation` field in metadata so the
 *   audit trail records the rationale behind each agent action.
 * - AI agents can optionally stream responses via SSE, publishing partial
 *   realtime events so the UI shows text as it arrives.
 */

import type { Pool, PoolClient } from 'pg';
import type { BotRuntimeContext, BotInstallInfo, BotHandlerResult } from './types.js';
import { resolveBotHandler } from './handlers.js';
import { normalizeAgentConfig } from './agentConfig.js';
import { encryptMessageBody, resolveMessageBody } from '../lib/messageEncryption.js';
import { logger } from '../lib/logger.js';

interface DbQueryable {
  query: PoolClient['query'];
}

/**
 * Find active bot installs in a conversation and their metadata.
 */
export async function listActiveBotInstalls(
  client: DbQueryable,
  conversationId: string
): Promise<BotInstallInfo[]> {
  const result = await client.query<{
    bot_id: string;
    bot_name: string;
    bot_slug: string;
    bot_category: string;
    bot_type: 'system' | 'custom';
    command_hint: string;
    permissions_snapshot: unknown;
    runtime_mode: string;
    bot_status: string;
    agent_config: unknown;
  }>(
    `
      SELECT
        i.bot_id,
        b.name AS bot_name,
        b.slug AS bot_slug,
        b.category AS bot_category,
        b.type AS bot_type,
        b.command_hint,
        i.permissions_snapshot,
        b.runtime_mode,
        b.status AS bot_status,
        COALESCE(av.agent_config, b.agent_config) as agent_config
      FROM chat_bot_installs i
      JOIN chat_bots b ON b.id = i.bot_id
      LEFT JOIN agent_versions av ON av.id = i.agent_version_id
      WHERE i.conversation_id = $1
        AND i.status = 'active'
        AND b.is_active = TRUE
        AND b.status != 'disabled'
      ORDER BY i.installed_at ASC
    `,
    [conversationId]
  );

  return result.rows.map((row) => ({
    botId: row.bot_id,
    botName: row.bot_name,
    botSlug: row.bot_slug,
    botCategory: row.bot_category,
    botType: row.bot_type,
    commandHint: row.command_hint,
    permissionsSnapshot: Array.isArray(row.permissions_snapshot) ? row.permissions_snapshot : [],
    runtimeMode: row.runtime_mode,
    status: row.bot_status,
    agentConfig: row.runtime_mode === 'ai' ? normalizeAgentConfig(row.agent_config) : null,
  }));
}

/**
 * Check if a message text matches a bot's command hint.
 * Supports prefix-style commands (e.g. /deal, !deal, @bot deal).
 */
export function matchBotCommand(
  messageText: string,
  commandHint: string
): { command: string; args: string[] } | null {
  const trimmed = messageText.trim();
  const hint = commandHint.trim().toLowerCase();

  // Exact command match: message starts with the command hint
  const startsWithHint =
    trimmed.toLowerCase().startsWith(hint + ' ') ||
    trimmed.toLowerCase() === hint;

  if (!startsWithHint) {
    return null;
  }

  const afterHint = trimmed.slice(hint.length).trim();
  const parts = afterHint.split(/\s+/);
  const args = parts.filter((p) => p.length > 0);

  return { command: hint, args };
}

export function matchAgentInvocation(
  messageText: string,
  install: Pick<BotInstallInfo, 'botName' | 'botSlug' | 'commandHint' | 'agentConfig'>
): { command: string; args: string[] } | null {
  const agentConfig = install.agentConfig;
  if (!agentConfig) return matchBotCommand(messageText, install.commandHint);
  if (agentConfig.triggerMode === 'always') {
    return { command: 'message', args: [] };
  }
  if (agentConfig.triggerMode === 'command') {
    return matchBotCommand(messageText, install.commandHint);
  }

  const trimmed = messageText.trim();
  const aliases = [
    `@${install.botSlug.toLowerCase()}`,
    `@${install.botName.toLowerCase().replace(/\s+/g, '')}`,
  ];
  const lower = trimmed.toLowerCase();
  const alias = aliases.find((candidate) =>
    lower === candidate || lower.startsWith(`${candidate} `)
  );
  if (!alias) return null;
  const prompt = trimmed.slice(alias.length).trim();
  return { command: alias, args: prompt ? prompt.split(/\s+/) : [] };
}

async function loadConversationHistory(
  client: DbQueryable,
  conversationId: string,
  limit: number,
  triggeringText: string
): Promise<BotRuntimeContext['conversationHistory']> {
  if (limit <= 0) return [];
  const result = await client.query<{
    id: string;
    sender_type: 'user' | 'bot' | 'system';
    body: string;
    body_ciphertext: string | null;
    key_version: number | null;
  }>(
    `
      SELECT id, sender_type, body, body_ciphertext, key_version
      FROM chat_messages
      WHERE conversation_id = $1
        AND sender_type IN ('user', 'bot')
        AND body IS NOT NULL
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [conversationId, Math.min(40, limit + 1)]
  );
  // PII encryption: decrypt message bodies before building history.
  const decryptedRows = await Promise.all(result.rows.map(async (row) => ({
    ...row,
    body: await resolveMessageBody(row.id, row.body, row.body_ciphertext ?? null),
  })));
  const history = decryptedRows
    .reverse()
    .map((row) => ({
      role: row.sender_type === 'bot' ? 'assistant' as const : 'user' as const,
      text: row.body,
    }));
  const last = history.at(-1);
  if (last?.role === 'user' && last.text.trim() === triggeringText.trim()) {
    history.pop();
  }
  return history.slice(-limit);
}

async function loadRuntimeData(
  client: DbQueryable,
  input: {
    conversationId: string;
    category: string;
    args: string[];
  }
): Promise<BotRuntimeContext['runtimeData']> {
  const runtimeData: BotRuntimeContext['runtimeData'] = {
    listings: [],
    recentMessagesAnalyzed: 0,
    messagesRequiringReview: 0,
  };

  if (input.category === 'commerce' || input.category === 'styling') {
    const query = input.args[0]?.toLowerCase() === 'search'
      ? input.args.slice(1).join(' ').trim()
      : '';
    const searchPattern = query ? `%${query}%` : null;
    const listings = await client.query<{
      id: string;
      title: string;
      price_gbp: string | number;
      brand: string | null;
    }>(
      `
        SELECT
          l.id,
          l.title,
          l.price_gbp,
          l.brand
        FROM listings l
        LEFT JOIN interactions i
          ON i.listing_id = l.id
          AND i.created_at >= NOW() - INTERVAL '7 days'
        WHERE l.status = 'active'
          AND (
            $1::text IS NULL
            OR l.title ILIKE $1
            OR COALESCE(l.description, '') ILIKE $1
            OR COALESCE(l.brand, '') ILIKE $1
            OR COALESCE(l.category, '') ILIKE $1
          )
        GROUP BY l.id, l.title, l.price_gbp, l.brand, l.created_at
        ORDER BY
          COALESCE(SUM(
            CASE i.action
              WHEN 'purchase' THEN 4
              WHEN 'wishlist' THEN 2
              ELSE 1
            END
          ), 0) DESC,
          l.created_at DESC
        LIMIT 4
      `,
      [searchPattern]
    );

    runtimeData.listings = listings.rows.map((row) => ({
      id: row.id,
      title: row.title,
      priceGbp: Number(row.price_gbp),
      brand: row.brand,
    }));
  }

  if (input.category === 'safety') {
    const recentMessages = await client.query<{ id: string; body: string; body_ciphertext: string | null; key_version: number | null }>(
      `
        SELECT id, body, body_ciphertext, key_version
        FROM chat_messages
        WHERE conversation_id = $1
          AND sender_type = 'user'
        ORDER BY created_at DESC
        LIMIT 40
      `,
      [input.conversationId]
    );
    // PII encryption: decrypt message bodies before safety analysis.
    const decryptedRows = await Promise.all(recentMessages.rows.map(async (row) => ({
      ...row,
      body: await resolveMessageBody(row.id, row.body, row.body_ciphertext ?? null),
    })));
    const reviewPattern = /\b(?:scam|fraud|pay\s+outside|bank\s+transfer|gift\s+card|crypto\s+only)\b/i;
    runtimeData.recentMessagesAnalyzed = decryptedRows.length;
    runtimeData.messagesRequiringReview = decryptedRows.filter((row) =>
      reviewPattern.test(row.body)
    ).length;
  }

  return runtimeData;
}

function createRuntimeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

async function insertBotMessage(
  client: DbQueryable,
  input: {
    conversationId: string;
    botId: string;
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
      'messageEncryption.encryptFailed — storing plaintext for backfill',
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
      VALUES ($1, $2, 'bot', NULL, $3, $4, $5, $6, $7::jsonb)
      RETURNING id, created_at::text
    `,
    [messageId, input.conversationId, input.botId, bodyToStore, bodyCiphertext, keyVersion, toJsonString(input.metadata ?? {})]
  );

  await client.query(
    `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
    [input.conversationId]
  );

  return {
    id: result.rows[0].id,
    createdAt: result.rows[0].created_at,
  };
}

async function logBotAuditEvent(
  client: DbQueryable,
  input: {
    botId: string;
    conversationId: string;
    actorUserId: string;
    eventType: string;
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO chat_bot_audit_events (
        id, bot_id, conversation_id, actor_user_id, event_type, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
    `,
    [
      createRuntimeId('baudit'),
      input.botId,
      input.conversationId,
      input.actorUserId,
      input.eventType,
      toJsonString(input.metadata),
    ]
  );
}

/**
 * Execute a bot command in a conversation.
 * Returns the bot response message if one was generated, otherwise null.
 */
export async function executeBotCommand(
  client: DbQueryable,
  input: {
    conversationId: string;
    conversationType: 'dm' | 'group';
    conversationTitle: string | null;
    actorUserId: string;
    actorUserName: string | null;
    messageText: string;
    targetBotId?: string; // optional: if provided, only try this bot
    command?: string; // optional: bypass text matching
    args?: string[]; // optional: bypass text matching
    stream?: boolean; // optional: stream AI agent responses via realtime events
  }
): Promise<{ messageId: string | null; botId: string | null; text: string | null }> {
  const installs = await listActiveBotInstalls(client, input.conversationId);

  // If a specific bot is targeted, only consider that bot
  const candidates = input.targetBotId
    ? installs.filter((i) => i.botId === input.targetBotId)
    : installs;

  for (const install of candidates) {
    let match: { command: string; args: string[] } | null = null;

    if (input.command !== undefined) {
      match = { command: input.command, args: input.args ?? [] };
    } else {
      match = matchAgentInvocation(input.messageText, install);
    }

    if (!match) continue;

    if (install.status === 'disabled' || install.status === 'inactive') {
      logger.warn(
        { botId: install.botId, conversationId: input.conversationId, status: install.status },
        'executeBotCommand — skipping bot with non-active status',
      );
      continue;
    }

    const effectivePermissions =
      install.permissionsSnapshot.length === 0 && install.botType === 'system'
        ? ['reply_in_chat', 'read_messages']
        : install.permissionsSnapshot;
    const canReply = effectivePermissions.includes('reply_in_chat');

    if (!canReply) {
      await logBotAuditEvent(client, {
        botId: install.botId,
        conversationId: input.conversationId,
        actorUserId: input.actorUserId,
        eventType: 'command_attempted',
        metadata: {
          command: match.command,
          args: match.args,
          runtimeMode: install.runtimeMode,
          replied: false,
          reason: 'missing reply_in_chat permission',
        },
      });
      logger.info(
        { botId: install.botId, conversationId: input.conversationId },
        'executeBotCommand — agent skipped: missing reply_in_chat permission',
      );
      continue;
    }

    const useStreaming = install.runtimeMode === 'ai' && input.stream === true;
    const handler = install.runtimeMode === 'ai'
      ? (await import('./openaiAgent.js')).executeOpenAiAgent
      : resolveBotHandler(install.botCategory);
    if (!handler) continue;

    const conversationHistory =
      install.agentConfig && effectivePermissions.includes('read_messages')
        ? await loadConversationHistory(
          client,
          input.conversationId,
          install.agentConfig.historyLimit,
          input.messageText
        )
        : [];
    const runtimeData = await loadRuntimeData(client, {
      conversationId: input.conversationId,
      category: install.botCategory,
      args: match.args,
    });

    const ctx: BotRuntimeContext = {
      botId: install.botId,
      botName: install.botName,
      botSlug: install.botSlug,
      botCategory: install.botCategory,
      botType: install.botType,
      commandHint: install.commandHint,
      conversationId: input.conversationId,
      conversationType: input.conversationType,
      conversationTitle: input.conversationTitle,
      actorUserId: input.actorUserId,
      actorUserName: input.actorUserName,
      permissionsSnapshot: effectivePermissions,
      command: match.command,
      args: match.args,
      messageText:
        install.runtimeMode === 'ai' && match.args.length > 0
          ? match.args.join(' ')
          : input.messageText,
      agentConfig: install.agentConfig,
      conversationHistory,
      runtimeData,
    };

    let result: BotHandlerResult;
    let aiQuota: {
      allowed: boolean;
      userRemaining: number;
      conversationRemaining: number;
      resetsAt: string;
    } | null = null;
    try {
      if (install.runtimeMode === 'ai') {
        const { reserveAiUsageQuota } = await import('../lib/aiUsage.js');
        const { redis } = await import('../lib/redis.js');
        aiQuota = await reserveAiUsageQuota({
          userId: input.actorUserId,
          conversationId: input.conversationId,
        }, redis);
      }

      if (aiQuota && !aiQuota.allowed) {
        result = {
          text: `${install.botName} has reached its hourly usage limit for this account or conversation. Try again at the start of the next hour.`,
          shouldReply: true,
          confidence: 1.0,
          explanation: `Agent invocation was blocked by the per-hour quota guard (user remaining: ${aiQuota.userRemaining}, conversation remaining: ${aiQuota.conversationRemaining}). No provider request was made.`,
          metadata: {
            agentQuotaBlocked: true,
            userRemaining: aiQuota.userRemaining,
            conversationRemaining: aiQuota.conversationRemaining,
            resetsAt: aiQuota.resetsAt,
          },
        };
      } else if (useStreaming) {
        // Stream the AI response, publishing partial realtime events so
        // the UI can render text as it arrives. The final assembled
        // result (with confidence, explanation, usage) is returned.
        const { streamOpenAiAgent } = await import('./openaiAgent.js');
        const { publishRealtimeEvent } = await import('../lib/realtime.js');
        result = await streamOpenAiAgent(ctx, (delta) => {
          publishRealtimeEvent({
            topic: `chat.conversation:${input.conversationId}`,
            type: 'chat.agent.stream_delta',
            payload: {
              conversationId: input.conversationId,
              botId: install.botId,
              delta,
            },
          });
        });
      } else {
        result = await handler(ctx);
      }
    } catch (error) {
      await logBotAuditEvent(client, {
        botId: install.botId,
        conversationId: input.conversationId,
        actorUserId: input.actorUserId,
        eventType: 'execution_failed',
        metadata: {
          runtimeMode: install.runtimeMode,
          reason: error instanceof Error ? error.message.slice(0, 240) : 'unknown',
        },
      });
      result = {
        text: `${install.botName} could not respond right now. Please try again.`,
        shouldReply: true,
        confidence: 0,
        explanation: `Agent execution failed: ${error instanceof Error ? error.message.slice(0, 240) : 'unknown error'}. The response is a fallback error message, not a real agent reply.`,
        metadata: { agentError: true },
      };
    }

    if (install.runtimeMode === 'ai') {
      const providerUsage = result.metadata?.providerUsage;
      const normalizedUsage = providerUsage && typeof providerUsage === 'object'
        ? {
          inputTokens: Number((providerUsage as Record<string, unknown>).inputTokens) || 0,
          outputTokens: Number((providerUsage as Record<string, unknown>).outputTokens) || 0,
          totalTokens: Number((providerUsage as Record<string, unknown>).totalTokens) || 0,
        }
        : undefined;
      const quotaBlocked = result.metadata?.agentQuotaBlocked === true;
      const failed = result.metadata?.agentError === true;
      try {
        const { recordAiUsageEvent } = await import('../lib/aiUsage.js');
        await recordAiUsageEvent(client, {
          id: createRuntimeId('aiuse'),
          userId: input.actorUserId,
          conversationId: input.conversationId,
          botId: install.botId,
          model: typeof result.metadata?.model === 'string'
            ? result.metadata.model
            : install.agentConfig?.model ?? 'unconfigured',
          providerRequestId: typeof result.metadata?.providerRequestId === 'string'
            ? result.metadata.providerRequestId
            : null,
          status: quotaBlocked ? 'quota_blocked' : failed ? 'failed' : 'succeeded',
          usage: normalizedUsage,
          errorCode: quotaBlocked ? 'AI_HOURLY_QUOTA_EXCEEDED' : failed ? 'AI_EXECUTION_FAILED' : null,
          metadata: {
            userRemaining: aiQuota?.userRemaining ?? null,
            conversationRemaining: aiQuota?.conversationRemaining ?? null,
            resetsAt: aiQuota?.resetsAt ?? null,
            providerLatencyMs: result.metadata?.providerLatencyMs ?? null,
            attempt: result.metadata?.attempt ?? null,
            confidence: result.confidence ?? null,
            needsHumanReview: result.needsHumanReview ?? false,
            confidenceSignals: result.metadata?.confidenceSignals ?? null,
          },
        });
      } catch (usageError) {
        await logBotAuditEvent(client, {
          botId: install.botId,
          conversationId: input.conversationId,
          actorUserId: input.actorUserId,
          eventType: 'execution_failed',
          metadata: {
            stage: 'usage_accounting',
            reason: usageError instanceof Error
              ? usageError.message.slice(0, 240)
              : 'unknown',
          },
        });
      }
    }

    if (!result.shouldReply) {
      // Log the attempt even if we don't reply
      await logBotAuditEvent(client, {
        botId: install.botId,
        conversationId: input.conversationId,
        actorUserId: input.actorUserId,
        eventType: 'command_attempted',
        metadata: {
          command: match.command,
          args: match.args,
          runtimeMode: install.runtimeMode,
          replied: false,
          reason: 'handler declined',
          confidence: result.confidence ?? null,
          explanation: result.explanation ?? null,
        },
      });
      logger.info(
        { botId: install.botId, conversationId: input.conversationId },
        'executeBotCommand — agent did not reply, trying next candidate',
      );
      continue;
    }

    const botMessage = await insertBotMessage(client, {
      conversationId: input.conversationId,
      botId: install.botId,
      text: result.text,
      metadata: {
        ...result.metadata,
        botCommand: match.command,
        botArgs: match.args,
        confidence: result.confidence ?? null,
        explanation: result.explanation ?? null,
        needsHumanReview: result.needsHumanReview ?? false,
      },
    });

    await logBotAuditEvent(client, {
      botId: install.botId,
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
      eventType: 'command_attempted',
      metadata: {
        command: match.command,
        args: match.args,
        runtimeMode: install.runtimeMode,
        messageId: botMessage.id,
        executed: true,
        confidence: result.confidence ?? null,
        explanation: result.explanation ?? null,
        needsHumanReview: result.needsHumanReview ?? false,
      },
    });

    await logBotAuditEvent(client, {
      botId: install.botId,
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
      eventType: 'execution_succeeded',
      metadata: {
        runtimeMode: install.runtimeMode,
        messageId: botMessage.id,
        confidence: result.confidence ?? null,
        needsHumanReview: result.needsHumanReview ?? false,
      },
    });

    // Load the realtime boundary only for an execution that produced a
    // message. Pure command matching and handler tests no longer require
    // Redis/database configuration merely by importing BotRuntime.
    const { publishRealtimeEvent } = await import('../lib/realtime.js');
    publishRealtimeEvent({
      topic: `chat.conversation:${input.conversationId}`,
      type: 'chat.message.created',
      payload: {
        id: botMessage.id,
        conversationId: input.conversationId,
        senderType: 'bot',
        senderUserId: null,
        senderBotId: install.botId,
        body: result.text,
        metadata: {
          ...result.metadata,
          botCommand: match.command,
          botArgs: match.args,
          confidence: result.confidence ?? null,
          explanation: result.explanation ?? null,
          needsHumanReview: result.needsHumanReview ?? false,
        },
        createdAt: botMessage.createdAt,
      },
    });

    return { messageId: botMessage.id, botId: install.botId, text: result.text };
  }

  return { messageId: null, botId: null, text: null };
}

// ---------------------------------------------------------------------------
// Durable agent execution — Phase 4
//
// enqueueAgentRun replaces the inline `await executeBotCommand(...)` call
// inside message creation. Instead of blocking the message response on a
// 30-second provider timeout, it creates an agent_runs row (status='queued')
// and adds a BullMQ job. The worker calls processAgentRun, which loads the
// run, transitions it to 'running', executes the bot command, and records
// the final outcome. Runs survive process restarts.
// ---------------------------------------------------------------------------

/**
 * Enqueue agent runs for every active bot install in the conversation whose
 * trigger matches the incoming message. Returns one entry per bot that was
 * matched (whether newly queued or already pending). Idempotency is enforced
 * via a unique key derived from the trigger message + bot, so a duplicate
 * enqueue (e.g. from a retry) is a no-op.
 */
export async function enqueueAgentRun(
  client: DbQueryable,
  input: {
    conversationId: string;
    conversationType: 'dm' | 'group';
    conversationTitle: string | null;
    actorUserId: string;
    actorUserName: string | null;
    messageText: string;
    triggerMessageId: string | null;
  }
): Promise<{ runId: string; queued: boolean }[]> {
  const installs = await listActiveBotInstalls(client, input.conversationId);

  const runs: { runId: string; queued: boolean }[] = [];

  for (const install of installs) {
    const match = matchAgentInvocation(input.messageText, install);
    if (!match) continue;

    const effectivePermissions = install.permissionsSnapshot;
    const canReply = install.botType === 'system'
      ? (effectivePermissions.length === 0 || effectivePermissions.includes('reply_in_chat'))
      : effectivePermissions.includes('reply_in_chat');
    if (!canReply) continue;

    // Idempotency key: trigger message + bot. When there is no trigger
    // message (e.g. a manual/test invocation) fall back to a fresh random
    // key so each enqueue produces a distinct run.
    const idempotencyKey = input.triggerMessageId
      ? `${input.triggerMessageId}:${install.botId}`
      : `${createRuntimeId('idem')}:${install.botId}`;

    // Skip if a run with the same idempotency key already exists.
    const existing = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM agent_runs WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey]
    );

    if (existing.rowCount) {
      runs.push({ runId: existing.rows[0].id, queued: false });
      continue;
    }

    const runId = createRuntimeId('run');
    const triggerType = install.agentConfig?.triggerMode ?? 'mention';

    await client.query(
      `INSERT INTO agent_runs (id, bot_id, conversation_id, actor_user_id, agent_version_id, trigger_type, trigger_message_id, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8)`,
      [runId, install.botId, input.conversationId, input.actorUserId, null, triggerType, input.triggerMessageId, idempotencyKey]
    );

    await logBotAuditEvent(client, {
      botId: install.botId,
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
      eventType: 'run_queued',
      metadata: {
        runId,
        triggerType,
        triggerMessageId: input.triggerMessageId,
        idempotencyKey,
      },
    });

    const { agentRunQueue } = await import('../lib/queues.js');
    await agentRunQueue.add('agent-run', {
      runId,
      botId: install.botId,
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
      triggerMessageId: input.triggerMessageId,
      messageText: input.messageText,
    });

    runs.push({ runId, queued: true });
  }

  return runs;
}

/**
 * Process a single agent run — called by the BullMQ worker. Loads the run,
 * transitions it through the state machine (queued → running → succeeded |
 * failed | timed_out), and records audit events for each transition.
 */
export async function processAgentRun(
  db: Pool,
  runId: string
): Promise<void> {
  const runResult = await db.query<{
    id: string;
    bot_id: string;
    conversation_id: string;
    actor_user_id: string;
    trigger_message_id: string | null;
    status: string;
  }>(
    `SELECT id, bot_id, conversation_id, actor_user_id, trigger_message_id, status FROM agent_runs WHERE id = $1 LIMIT 1`,
    [runId]
  );

  if (!runResult.rowCount) return;
  const run = runResult.rows[0];
  if (run.status !== 'queued') return; // Already processed or cancelled

  // Transition queued → running (guarded so a concurrent worker cannot
  // double-process the same run).
  const claimed = await db.query<{ id: string }>(
    `UPDATE agent_runs SET status = 'running', started_at = NOW() WHERE id = $1 AND status = 'queued' RETURNING id`,
    [runId]
  );
  if (!claimed.rowCount) return; // Lost the race to another worker

  await logBotAuditEvent(db, {
    botId: run.bot_id,
    conversationId: run.conversation_id,
    actorUserId: run.actor_user_id,
    eventType: 'run_started',
    metadata: { runId },
  });

  try {
    const result = await executeBotCommand(db, {
      conversationId: run.conversation_id,
      conversationType: 'group',
      conversationTitle: null,
      actorUserId: run.actor_user_id,
      actorUserName: null,
      messageText: '',
      targetBotId: run.bot_id,
    });

    await db.query(
      `UPDATE agent_runs SET status = 'succeeded', completed_at = NOW(), result_message_id = $2, result_text = $3 WHERE id = $1`,
      [runId, result.messageId, result.text]
    );

    await logBotAuditEvent(db, {
      botId: run.bot_id,
      conversationId: run.conversation_id,
      actorUserId: run.actor_user_id,
      eventType: 'run_succeeded',
      metadata: {
        runId,
        resultMessageId: result.messageId,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message.slice(0, 500) : 'unknown error';
    await db.query(
      `UPDATE agent_runs SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE id = $1`,
      [runId, errorMessage]
    );

    await logBotAuditEvent(db, {
      botId: run.bot_id,
      conversationId: run.conversation_id,
      actorUserId: run.actor_user_id,
      eventType: 'run_failed',
      metadata: {
        runId,
        errorMessage,
      },
    });
  }
}
