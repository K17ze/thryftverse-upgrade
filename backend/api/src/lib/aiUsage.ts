import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { AI_RATE_LIMITS } from './aiTruth.js';

type RedisQuotaClient = {
  eval(
    script: string,
    numberOfKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
};

type DbQueryable = {
  query: PoolClient['query'];
};

export interface AiQuotaReservation {
  allowed: boolean;
  userCount: number;
  conversationCount: number;
  userRemaining: number;
  conversationRemaining: number;
  resetsAt: string;
}

export interface AiProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const RESERVE_AI_QUOTA_SCRIPT = `
local userCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local conversationCount = tonumber(redis.call('GET', KEYS[2]) or '0')
local userLimit = tonumber(ARGV[1])
local conversationLimit = tonumber(ARGV[2])
local ttlSeconds = tonumber(ARGV[3])

if userCount >= userLimit or conversationCount >= conversationLimit then
  return {0, userCount, conversationCount}
end

userCount = redis.call('INCR', KEYS[1])
conversationCount = redis.call('INCR', KEYS[2])
if userCount == 1 then redis.call('EXPIRE', KEYS[1], ttlSeconds) end
if conversationCount == 1 then redis.call('EXPIRE', KEYS[2], ttlSeconds) end
return {1, userCount, conversationCount}
`;

function quotaWindow(now: Date): {
  bucket: string;
  resetsAt: string;
  ttlSeconds: number;
} {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  const reset = new Date(start.getTime() + 60 * 60_000);
  return {
    bucket: start.toISOString().slice(0, 13),
    resetsAt: reset.toISOString(),
    ttlSeconds: Math.max(60, Math.ceil((reset.getTime() - now.getTime()) / 1_000) + 60),
  };
}

function asCounter(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export async function reserveAiUsageQuota(
  input: {
    userId: string;
    conversationId: string;
    now?: Date;
  },
  client: RedisQuotaClient,
): Promise<AiQuotaReservation> {
  const now = input.now ?? new Date();
  const window = quotaWindow(now);
  const result = await client.eval(
    RESERVE_AI_QUOTA_SCRIPT,
    2,
    `ai:quota:user:${input.userId}:${window.bucket}`,
    `ai:quota:conversation:${input.conversationId}:${window.bucket}`,
    AI_RATE_LIMITS.perUserPerHour,
    AI_RATE_LIMITS.perConversationPerHour,
    window.ttlSeconds,
  );
  const values = Array.isArray(result) ? result : [];
  const allowed = Number(values[0]) === 1;
  const userCount = asCounter(values[1]);
  const conversationCount = asCounter(values[2]);
  return {
    allowed,
    userCount,
    conversationCount,
    userRemaining: Math.max(0, AI_RATE_LIMITS.perUserPerHour - userCount),
    conversationRemaining: Math.max(
      0,
      AI_RATE_LIMITS.perConversationPerHour - conversationCount,
    ),
    resetsAt: window.resetsAt,
  };
}

export function calculateAiCostMicrousd(usage: AiProviderUsage): number {
  const inputCost = usage.inputTokens
    * config.openAiInputCostMicrousdPerMillionTokens
    / 1_000_000;
  const outputCost = usage.outputTokens
    * config.openAiOutputCostMicrousdPerMillionTokens
    / 1_000_000;
  return Math.max(0, Math.round(inputCost + outputCost));
}

export async function recordAiUsageEvent(
  db: DbQueryable,
  input: {
    id: string;
    userId: string;
    conversationId: string;
    botId: string;
    model: string;
    providerRequestId?: string | null;
    status: 'succeeded' | 'failed' | 'quota_blocked';
    usage?: AiProviderUsage;
    errorCode?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const usage = input.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  await db.query(
    `INSERT INTO ai_usage_events (
       id, user_id, conversation_id, bot_id, provider, model,
       provider_request_id, status,
       input_tokens, output_tokens, total_tokens,
       estimated_cost_microusd, pricing_version, error_code, metadata
     )
     VALUES (
       $1, $2, $3, $4, 'openai', $5,
       $6, $7,
       $8, $9, $10,
       $11, $12, $13, $14::jsonb
     )`,
    [
      input.id,
      input.userId,
      input.conversationId,
      input.botId,
      input.model,
      input.providerRequestId ?? null,
      input.status,
      usage.inputTokens,
      usage.outputTokens,
      usage.totalTokens,
      calculateAiCostMicrousd(usage),
      config.aiUsagePricingVersion,
      input.errorCode ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
