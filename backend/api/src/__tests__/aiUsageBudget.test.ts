/**
 * aiUsage daily-budget reservation (audit: "AI budget hard-cap claims").
 *
 * The daily spend guard used to admit against RECORDED spend — every
 * concurrent request read the same stale counter and overshot by its full
 * cost. The admission script now performs an atomic check-and-reserve:
 * each admitted request INCRBYs an estimated cost inside the same Lua
 * eval that passes the rate checks, and recordAiUsageEvent settles the
 * delta (top-up or refund) when the provider call completes.
 *
 * The fake Redis below is a faithful JS port of RESERVE_AI_QUOTA_SCRIPT's
 * semantics — eval runs are synchronous here, which models Redis's
 * atomic script execution. The real script text is also shape-pinned so
 * the port cannot silently drift from it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Config is a module-level singleton evaluated at import time — set the
// budget env before importing aiUsage.js.
process.env.AI_DAILY_BUDGET_MICROUSD = '1000000'; // $1.00/day
process.env.OPENAI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS = '1000';
process.env.OPENAI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS = '5000';

const {
  AI_RESERVATION_INPUT_TOKEN_ESTIMATE,
  RESERVE_AI_QUOTA_SCRIPT,
  calculateAiCostMicrousd,
  estimateAiSpendReservationMicrousd,
  recordAiUsageEvent,
  reserveAiUsageQuota,
} = await import('../lib/aiUsage.js');
const { config } = await import('../config.js');

type Store = Map<string, number>;

/**
 * In-memory Redis port of RESERVE_AI_QUOTA_SCRIPT. Synchronous critical
 * section = the script's atomicity guarantee.
 */
function fakeRedis(store: Store = new Map()) {
  const incrbyCalls: Array<{ key: string; delta: number }> = [];
  const client = {
    async eval(
      _script: string,
      _numKeys: number,
      ...args: Array<string | number>
    ): Promise<number[]> {
      const [userKey, convKey, spendKey] = args.slice(0, 3) as string[];
      const [userLimit, convLimit, , dailyBudget, reservation] = args
        .slice(3)
        .map(Number);
      const userCount = store.get(userKey) ?? 0;
      const convCount = store.get(convKey) ?? 0;
      const dailySpend = Math.max(0, store.get(spendKey) ?? 0);

      if (dailyBudget > 0 && dailySpend + reservation > dailyBudget) {
        return [0, userCount, convCount, dailySpend, 1, 0];
      }
      if (userCount >= userLimit || convCount >= convLimit) {
        return [0, userCount, convCount, dailySpend, 0, 0];
      }
      store.set(userKey, userCount + 1);
      store.set(convKey, convCount + 1);
      let reserved = 0;
      if (dailyBudget > 0 && reservation > 0) {
        reserved = reservation;
        store.set(spendKey, dailySpend + reservation);
      }
      return [1, userCount + 1, convCount + 1, dailySpend, 0, reserved];
    },
    async incrby(key: string, delta: number): Promise<number> {
      incrbyCalls.push({ key, delta });
      store.set(key, (store.get(key) ?? 0) + delta);
      return store.get(key)!;
    },
    async expire(): Promise<number> {
      return 1;
    },
  };
  return { client, incrbyCalls };
}

const fakeDb = {
  query: async () => ({ rows: [] }),
};

describe('RESERVE_AI_QUOTA_SCRIPT — atomic check-and-reserve contract', () => {
  it('checks budget WITH the reservation and INCRBYs before admitting', () => {
    // The port above is only truthful if the real script does these things.
    assert.match(
      RESERVE_AI_QUOTA_SCRIPT,
      /dailySpend \+ reservationMicrousd > dailyBudget/,
    );
    assert.match(RESERVE_AI_QUOTA_SCRIPT, /INCRBY', KEYS\[3\]/);
    // Reservation must only happen on the admitted path (after the
    // rejection returns, not before them).
    const deniedIdx = RESERVE_AI_QUOTA_SCRIPT.indexOf('return {0,');
    const reserveIdx = RESERVE_AI_QUOTA_SCRIPT.indexOf("INCRBY', KEYS[3]");
    assert.ok(deniedIdx > -1 && reserveIdx > deniedIdx);
    // Rejected admissions return reservedMicrousd = 0 (6th tuple element).
    assert.match(RESERVE_AI_QUOTA_SCRIPT, /return \{0, userCount, conversationCount, dailySpend, 1, 0\}/);
  });
});

describe('reserveAiUsageQuota — concurrent burst against the daily budget', () => {
  it('bounds admissions by the reservation margin, not the full burst', async () => {
    const store: Store = new Map();
    const { client } = fakeRedis(store);
    const budget = config.aiDailyBudgetMicrousd;
    const reservation = 300_000; // $0.30 per admission, $1.00 budget
    const N = 20;

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        reserveAiUsageQuota(
          {
            userId: `user_${i}`,
            conversationId: `conv_${i}`,
            reservationMicrousd: reservation,
            now: new Date('2026-09-21T12:00:00.000Z'),
          },
          client,
        ),
      ),
    );

    const admitted = results.filter((r) => r.allowed);
    // floor(1_000_000 / 300_000) = 3 — the 4th sees 900k reserved and would
    // overshoot the cap. Under the old recorded-spend check all 20 passed.
    assert.equal(admitted.length, 3);
    for (const r of admitted) {
      assert.equal(r.reservedMicrousd, reservation);
    }
    const denied = results.filter((r) => !r.allowed);
    assert.equal(denied.length, N - 3);
    assert.ok(denied.every((r) => r.budgetExceeded && r.reservedMicrousd === 0));

    // Reserved spend never exceeds the cap — overshoot margin is bounded
    // by (actual − reservation) at settle time, not by N × actual.
    const spendKey = admitted[0].spendKey;
    assert.equal(store.get(spendKey), 900_000);
    assert.ok(900_000 <= budget);
  });

  it('derives the default reservation from configured pricing', () => {
    const expected = calculateAiCostMicrousd({
      inputTokens: AI_RESERVATION_INPUT_TOKEN_ESTIMATE,
      outputTokens: config.openAiAgentMaxOutputTokens,
      totalTokens:
        AI_RESERVATION_INPUT_TOKEN_ESTIMATE + config.openAiAgentMaxOutputTokens,
    });
    assert.equal(estimateAiSpendReservationMicrousd(), expected);
    assert.ok(expected > 0);
  });
});

describe('recordAiUsageEvent — reservation settlement', () => {
  const usage = { inputTokens: 10_000, outputTokens: 500, totalTokens: 10_500 };

  it('tops up the reservation to the real provider cost on success', async () => {
    const store: Store = new Map();
    const { client, incrbyCalls } = fakeRedis(store);
    const reservation = await reserveAiUsageQuota(
      {
        userId: 'u',
        conversationId: 'c',
        reservationMicrousd: 40_000,
        now: new Date('2026-09-21T12:00:00.000Z'),
      },
      client,
    );
    assert.ok(reservation.allowed);

    const actual = calculateAiCostMicrousd(usage); // 10k*1000 + 500*5000 = 12_500
    await recordAiUsageEvent(
      fakeDb as never,
      {
        id: 'aiuse_1',
        userId: 'u',
        conversationId: 'c',
        botId: 'bot_1',
        model: 'm',
        status: 'succeeded',
        usage,
        spendReservation: {
          reservedMicrousd: reservation.reservedMicrousd,
          spendKey: reservation.spendKey,
        },
      },
      client,
    );

    assert.equal(incrbyCalls.length, 1);
    assert.equal(incrbyCalls[0].key, reservation.spendKey);
    assert.equal(incrbyCalls[0].delta, actual - 40_000); // negative delta refunds the excess
    assert.equal(store.get(reservation.spendKey), actual);
  });

  it('refunds the full reservation when the provider call fails', async () => {
    const store: Store = new Map();
    const { client, incrbyCalls } = fakeRedis(store);
    const reservation = await reserveAiUsageQuota(
      {
        userId: 'u',
        conversationId: 'c',
        reservationMicrousd: 40_000,
        now: new Date('2026-09-21T12:00:00.000Z'),
      },
      client,
    );

    await recordAiUsageEvent(
      fakeDb as never,
      {
        id: 'aiuse_2',
        userId: 'u',
        conversationId: 'c',
        botId: 'bot_1',
        model: 'm',
        status: 'failed',
        errorCode: 'AI_EXECUTION_FAILED',
        spendReservation: {
          reservedMicrousd: reservation.reservedMicrousd,
          spendKey: reservation.spendKey,
        },
      },
      client,
    );

    assert.equal(incrbyCalls.length, 1);
    assert.equal(incrbyCalls[0].delta, -40_000);
    assert.equal(store.get(reservation.spendKey), 0);
  });

  it('settles onto the reservation bucket even after a day rollover', async () => {
    const store: Store = new Map();
    const { client, incrbyCalls } = fakeRedis(store);
    // Admitted at 23:59 — settles "tomorrow". The refund must land on the
    // day that booked it, not the new day's bucket.
    const reservation = await reserveAiUsageQuota(
      {
        userId: 'u',
        conversationId: 'c',
        reservationMicrousd: 40_000,
        now: new Date('2026-09-21T23:59:59.000Z'),
      },
      client,
    );
    assert.match(reservation.spendKey, /ai:spend:daily:2026-09-21$/);

    await recordAiUsageEvent(
      fakeDb as never,
      {
        id: 'aiuse_3',
        userId: 'u',
        conversationId: 'c',
        botId: 'bot_1',
        model: 'm',
        status: 'failed',
        spendReservation: {
          reservedMicrousd: reservation.reservedMicrousd,
          spendKey: reservation.spendKey,
        },
      },
      client,
    );

    assert.equal(incrbyCalls[0].key, reservation.spendKey);
    assert.equal(store.get('ai:spend:daily:2026-09-22') ?? 0, 0);
  });

  it('keeps the legacy accumulate-only behaviour when no reservation was taken', async () => {
    const store: Store = new Map();
    const { client, incrbyCalls } = fakeRedis(store);
    const actual = calculateAiCostMicrousd(usage);
    await recordAiUsageEvent(
      fakeDb as never,
      {
        id: 'aiuse_4',
        userId: 'u',
        conversationId: 'c',
        botId: 'bot_1',
        model: 'm',
        status: 'succeeded',
        usage,
      },
      client,
    );
    assert.equal(incrbyCalls.length, 1);
    assert.equal(incrbyCalls[0].delta, actual);
  });
});
