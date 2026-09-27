import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { AI_RATE_LIMITS } from './aiTruth.js';
import { recordAiSpendReservation } from './metrics.js';

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
  /**
   * Micro-USD atomically reserved against the daily budget by this
   * admission (0 when the request was rejected or the budget is
   * disabled). Pass back via `recordAiUsageEvent`'s `spendReservation`
   * so the reservation is reconciled against the real provider cost —
   * refunding on failure, topping up or refunding the difference on
   * success.
   */
  reservedMicrousd: number;
  /**
   * The daily spend bucket key the reservation was written to. Settlement
   * must target this exact key — a request admitted at 23:59 reconciles
   * after midnight, and refunding the NEW day's bucket would both leak
   * the old reservation and corrupt the new day's spend.
   */
  spendKey: string;
}

export interface AiProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Atomic admission script. A single EVAL performs:
 *   1. daily-budget check INCLUDING a per-request spend reservation
 *      (dailySpend + reservation > budget → reject), so a burst of N
 *      concurrent admissions cannot all pass against spend that is only
 *      recorded post-completion;
 *   2. per-user / per-conversation hourly counter check-and-increment;
 *   3. the monetary reservation itself (INCRBY on the daily spend key)
 *      before returning allowed=1.
 *
 * The reservation is reconciled by `recordAiUsageEvent`: succeeded runs
 * settle (actual − reserved), failed/quota-blocked runs refund the full
 * reservation. A crash between admission and settlement leaks at most one
 * reservation per request until the daily key expires — a bounded,
 * conservative (over-counting) error, never an under-count.
 *
 * Returns {allowed, userCount, conversationCount, dailySpendBefore,
 *          budgetExceeded, reservedMicrousd}.
 *
 * Exported so the budget-concurrency tests can pin the atomic contract.
 */
export const RESERVE_AI_QUOTA_SCRIPT = `
local userCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local conversationCount = tonumber(redis.call('GET', KEYS[2]) or '0')
local dailySpend = math.max(0, tonumber(redis.call('GET', KEYS[3]) or '0'))
local userLimit = tonumber(ARGV[1])
local conversationLimit = tonumber(ARGV[2])
local ttlSeconds = tonumber(ARGV[3])
local dailyBudget = tonumber(ARGV[4])
local reservationMicrousd = tonumber(ARGV[5]) or 0
local spendTtlSeconds = tonumber(ARGV[6]) or 0

if dailyBudget > 0 and dailySpend + reservationMicrousd > dailyBudget then
  return {0, userCount, conversationCount, dailySpend, 1, 0}
end

if userCount >= userLimit or conversationCount >= conversationLimit then
  return {0, userCount, conversationCount, dailySpend, 0, 0}
end

userCount = redis.call('INCR', KEYS[1])
conversationCount = redis.call('INCR', KEYS[2])
if userCount == 1 then redis.call('EXPIRE', KEYS[1], ttlSeconds) end
if conversationCount == 1 then redis.call('EXPIRE', KEYS[2], ttlSeconds) end

if dailyBudget > 0 and reservationMicrousd > 0 then
  redis.call('INCRBY', KEYS[3], reservationMicrousd)
  if spendTtlSeconds > 0 then redis.call('EXPIRE', KEYS[3], spendTtlSeconds) end
else
  reservationMicrousd = 0
end
return {1, userCount, conversationCount, dailySpend, 0, reservationMicrousd}
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

/**
 * Nominal input-token estimate used to size the admission reservation when
 * AI_SPEND_RESERVATION_MICROUSD is not configured. Conversation history
 * makes the real input unpredictable; this errs toward a multi-turn
 * context rather than a bare prompt, and the settle step reconciles any
 * difference against the provider-reported cost.
 */
export const AI_RESERVATION_INPUT_TOKEN_ESTIMATE = 8_192;

/**
 * The micro-USD amount reserved per admitted request. Configured value
 * wins; otherwise derived from the configured pricing rates over a nominal
 * input estimate plus the maximum output budget. Returns 0 when pricing
 * is unconfigured — with no rates there is no meaningful cost to reserve.
 */
export function estimateAiSpendReservationMicrousd(): number {
  if (config.aiSpendReservationMicrousd > 0) {
    return Math.round(config.aiSpendReservationMicrousd);
  }
  return calculateAiCostMicrousd({
    inputTokens: AI_RESERVATION_INPUT_TOKEN_ESTIMATE,
    outputTokens: config.openAiAgentMaxOutputTokens,
    totalTokens:
      AI_RESERVATION_INPUT_TOKEN_ESTIMATE + config.openAiAgentMaxOutputTokens,
  });
}

export async function reserveAiUsageQuota(
  input: {
    userId: string;
    conversationId: string;
    now?: Date;
    /**
     * Optional caller-supplied reservation size (micro-USD). Defaults to
     * estimateAiSpendReservationMicrousd(). Ignored when the daily budget
     * is disabled.
     */
    reservationMicrousd?: number;
  },
  client: RedisQuotaClient,
): Promise<AiQuotaReservation> {
  const now = input.now ?? new Date();
  const window = quotaWindow(now);
  const dailyKey = dailySpendKey(now);
  const reservationMicrousd = Math.max(
    0,
    Math.round(input.reservationMicrousd ?? estimateAiSpendReservationMicrousd()),
  );
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
    reservationMicrousd,
    DAILY_SPEND_TTL_SECONDS,
  );
  const values = Array.isArray(result) ? result : [];
  const allowed = Number(values[0]) === 1;
  const userCount = asCounter(values[1]);
  const conversationCount = asCounter(values[2]);
  const budgetExceeded = Number(values[4]) === 1;
  const reservedMicrousd = allowed ? asCounter(values[5]) : 0;
  if (allowed && reservedMicrousd > 0) {
    recordAiSpendReservation('reserved');
  } else if (budgetExceeded) {
    recordAiSpendReservation('budget_blocked');
  }
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
    budgetExceeded,
    dailySpendMicrousd: asCounter(values[3]),
    reservedMicrousd,
    spendKey: dailyKey,
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
    /**
     * The admission reservation returned by reserveAiUsageQuota — pass
     * `{ reservedMicrousd, spendKey }` verbatim from the reservation so
     * settlement lands on the same daily bucket. Omit (or pass null) for
     * events that never held a reservation (e.g. quota_blocked, where
     * admission was denied before any spend was reserved).
     */
    spendReservation?: {
      reservedMicrousd: number;
      spendKey: string;
    } | null;
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

  // R113 + reservation reconcile: the admission script already reserved
  // `spendReservation.reservedMicrousd` against the daily bucket, so this
  // settles the DELTA — succeeded runs top up (or refund) the difference
  // between the real provider cost and the reservation; failed runs refund
  // the reservation entirely — they made no billable request. Settlement
  // writes to the reservation's own bucket (spendKey), not today's, so a
  // request admitted before midnight reconciles against the day that
  // booked it. Best-effort: a Redis failure must not fail the usage ledger
  // write that already committed; an unsettled reservation simply decays
  // with the bucket's 48h TTL (conservative over-count, never under).
  if (redis) {
    const costMicrousd =
      input.status === 'succeeded' ? calculateAiCostMicrousd(usage) : 0;
    const reservedMicrousd = input.spendReservation?.reservedMicrousd ?? 0;
    const delta = costMicrousd - reservedMicrousd;
    if (delta !== 0) {
      try {
        const key = input.spendReservation?.spendKey ?? dailySpendKey(new Date());
        await redis.incrby(key, delta);
        await redis.expire(key, DAILY_SPEND_TTL_SECONDS);
        recordAiSpendReservation(delta > 0 ? 'settled' : 'refunded');
      } catch {
        // Spend counter is best-effort — the ledger row above is the truth.
      }
    }
  }
}
