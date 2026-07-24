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
 */

import type { PoolClient } from 'pg';
import { publishRealtimeEvent } from '../lib/realtime.js';
import type { BotRuntimeContext, BotInstallInfo, BotHandlerResult } from './types.js';
import { resolveBotHandler } from './handlers.js';
import { normalizeAgentConfig } from './agentConfig.js';
import { executeOpenAiAgent } from './openaiAgent.js';

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
        b.agent_config
      FROM chat_bot_installs i
      JOIN chat_bots b ON b.id = i.bot_id
      WHERE i.conversation_id = $1
        AND i.status = 'active'
        AND b.is_active = TRUE
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
    sender_type: 'user' | 'bot' | 'system';
    body: string;
  }>(
    `
      SELECT sender_type, body
      FROM chat_messages
      WHERE conversation_id = $1
        AND sender_type IN ('user', 'bot')
        AND body IS NOT NULL
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [conversationId, Math.min(40, limit + 1)]
  );
  const history = result.rows
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
    const recentMessages = await client.query<{ body: string }>(
      `
        SELECT body
        FROM chat_messages
        WHERE conversation_id = $1
          AND sender_type = 'user'
        ORDER BY created_at DESC
        LIMIT 40
      `,
      [input.conversationId]
    );
    const reviewPattern = /\b(?:scam|fraud|pay\s+outside|bank\s+transfer|gift\s+card|crypto\s+only)\b/i;
    runtimeData.recentMessagesAnalyzed = recentMessages.rows.length;
    runtimeData.messagesRequiringReview = recentMessages.rows.filter((row) =>
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
  const result = await client.query<{ id: string; created_at: string }>(
    `
      INSERT INTO chat_messages (
        id,
        conversation_id,
        sender_type,
        sender_user_id,
        sender_bot_id,
        body,
        metadata
      )
      VALUES ($1, $2, 'bot', NULL, $3, $4, $5::jsonb)
      RETURNING id, created_at::text
    `,
    [messageId, input.conversationId, input.botId, input.text, toJsonString(input.metadata ?? {})]
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

    // Permission check: allow reply if snapshot is empty (backward compatible)
    // or explicitly includes reply_in_chat
    const canReply =
      install.permissionsSnapshot.length === 0 ||
      install.permissionsSnapshot.includes('reply_in_chat');

    const handler = install.runtimeMode === 'ai'
      ? executeOpenAiAgent
      : resolveBotHandler(install.botCategory);
    if (!handler) continue;

    const conversationHistory =
      install.agentConfig && install.permissionsSnapshot.includes('read_messages')
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
      permissionsSnapshot: install.permissionsSnapshot,
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
    try {
      result = await handler(ctx);
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
        metadata: { agentError: true },
      };
    }

    if (!result.shouldReply || !canReply) {
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
          reason: !canReply ? 'missing reply_in_chat permission' : 'handler declined',
        },
      });
      return { messageId: null, botId: install.botId, text: null };
    }

    const botMessage = await insertBotMessage(client, {
      conversationId: input.conversationId,
      botId: install.botId,
      text: result.text,
      metadata: {
        ...result.metadata,
        botCommand: match.command,
        botArgs: match.args,
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
      },
    });

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
        metadata: { ...result.metadata, botCommand: match.command, botArgs: match.args },
        createdAt: botMessage.createdAt,
      },
    });

    return { messageId: botMessage.id, botId: install.botId, text: result.text };
  }

  return { messageId: null, botId: null, text: null };
}
