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

type RedisSpendClient = {
  incrby(key: string, increment: number): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
};

/** Daily spend buckets live ~48h — long enough for midnight-boundary reads. */
const DAILY_SPEND_TTL_SECONDS = 48 * 60 * 60;

function dailySpendKey(now: Date): string {
  return `ai:spend:daily:${now.toISOString().slice(0, 10)}`;
}

export interface AiQuotaReservation {
  allowed: boolean;
  userCount: number;
  conversationCount: number;
  userRemaining: number;
  conversationRemaining: number;
  resetsAt: string;
  /**
   * True when the block came from the platform daily spend budget rather
   * than the per-user/per-conversation rate quota — callers surface a
   * different (honest) message for a budget exhaustion.
   */
  budgetExceeded: boolean;
  /** Current daily spend in micro-USD read at reservation time. */
  dailySpendMicrousd: number;
}

export interface AiProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const RESERVE_AI_QUOTA_SCRIPT = `
local userCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local conversationCount = tonumber(redis.call('GET', KEYS[2]) or '0')
local dailySpend = tonumber(redis.call('GET', KEYS[3]) or '0')
local userLimit = tonumber(ARGV[1])
local conversationLimit = tonumber(ARGV[2])
local ttlSeconds = tonumber(ARGV[3])
local dailyBudget = tonumber(ARGV[4])

if dailyBudget > 0 and dailySpend >= dailyBudget then
  return {0, userCount, conversationCount, dailySpend, 1}
end

if userCount >= userLimit or conversationCount >= conversationLimit then
  return {0, userCount, conversationCount, dailySpend, 0}
end

userCount = redis.call('INCR', KEYS[1])
conversationCount = redis.call('INCR', KEYS[2])
if userCount == 1 then redis.call('EXPIRE', KEYS[1], ttlSeconds) end
if conversationCount == 1 then redis.call('EXPIRE', KEYS[2], ttlSeconds) end
return {1, userCount, conversationCount, dailySpend, 0}
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
  const dailyKey = dailySpendKey(now);
  const result = await client.eval(
    RESERVE_AI_QUOTA_SCRIPT,
    3,
    `ai:quota:user:${input.userId}:${window.bucket}`,
    `ai:quota:conversation:${input.conversationId}:${window.bucket}`,
    dailyKey,
    AI_RATE_LIMITS.perUserPerHour,
    AI_RATE_LIMITS.perConversationPerHour,
    window.ttlSeconds,
    config.aiDailyBudgetMicrousd,
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
    budgetExceeded: Number(values[4]) === 1,
    dailySpendMicrousd: asCounter(values[3]),
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
  redis?: RedisSpendClient | null,
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

  // R113: accumulate the real recorded cost into the daily spend bucket
  // the quota script reads. Only 'succeeded' events carry provider spend —
  // quota_blocked/failed runs made no billable request. Best-effort: a
  // Redis failure must not fail the usage ledger write that already
  // committed; the daily cap degrades to the Postgres-recorded truth on
  // the next telemetry read.
  if (redis && input.status === 'succeeded') {
    const costMicrousd = calculateAiCostMicrousd(usage);
    if (costMicrousd > 0) {
      try {
        const key = dailySpendKey(new Date());
        await redis.incrby(key, costMicrousd);
        await redis.expire(key, DAILY_SPEND_TTL_SECONDS);
      } catch {
        // Spend counter is best-effort — the ledger row above is the truth.
      }
    }
  }
}
