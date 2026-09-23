/**
 * fxEngine — decimal-rate helpers, conversion quote math, rate resolution
 * (direct / inverse / USD-cross), persisted quote creation, and atomic quote
 * execution.
 *
 * DB-touching functions are exercised against a stateful fake DbQueryable in
 * the same style as commercePayments.test.ts: it answers the fx_rates /
 * oneze_internal_fx_rates reads, persists fx_quotes rows (including the
 * (user_id, idempotency_key) conflict claim), and simulates the wallet +
 * wallet_currency_balances + wallet_ledger writes that executeFxQuote drives
 * through walletMoneyPath primitives.
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import {
  createFxQuote,
  executeFxQuote,
  invertDecimalRate,
  multiplyDecimalRates,
  quoteConversion,
  resolveExchangeRate,
} from "./fxEngine.js";
import { hashWalletIdempotencyPayload } from "./walletMoneyPath.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function empty(): any {
  return { rows: [], rowCount: 0 };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rows(r: unknown[]): any {
  return { rows: r, rowCount: r.length };
}

const errorCode = (code: string) => (error: unknown) =>
  (error as { code?: string }).code === code;

const freshIso = () => new Date(Date.now() - 60_000).toISOString();
const staleIso = () => new Date(Date.now() - 31 * 60_000).toISOString();

// ── Stateful fake DbQueryable ────────────────────────────────────────────────

interface FakeWallet {
  id: string;
  user_id: string;
  oneze_balance_units: string;
  fiat_balance_minor: string;
  fiat_currency: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface FakeQuote {
  id: string;
  user_id: string;
  wallet_id: string;
  source_currency: string;
  target_currency: string;
  fixed_side: "source" | "target";
  source_amount_minor: string;
  target_amount_minor: string;
  mid_rate: string;
  customer_rate: string;
  spread_bps: number;
  fee_minor: string;
  fee_currency: string | null;
  rate_source: string;
  rate_observed_at: string;
  rate_stale: boolean;
  status: "open" | "executed" | "expired" | "cancelled";
  idempotency_key: string | null;
  request_hash: string | null;
  tx_id: string | null;
  expires_at: string;
  executed_at: string | null;
  created_at: string;
  unexpired: boolean;
}

function fakeWallet(overrides: Partial<FakeWallet> = {}): FakeWallet {
  return {
    id: "wal_1",
    user_id: "u1",
    oneze_balance_units: "0",
    fiat_balance_minor: "200000",
    fiat_currency: "GBP",
    version: 1,
    created_at: freshIso(),
    updated_at: freshIso(),
    ...overrides,
  };
}

/** Hash createFxQuote computes for the canonical createInput payload below. */
const CREATE_INPUT_HASH = hashWalletIdempotencyPayload({
  sourceCurrency: "GBP",
  targetCurrency: "USD",
  fixedSide: "source",
  amountMinor: "100000",
});

function fakeQuote(overrides: Partial<FakeQuote> = {}): FakeQuote {
  return {
    id: "fxq_stored",
    user_id: "u1",
    wallet_id: "wal_1",
    source_currency: "GBP",
    target_currency: "USD",
    fixed_side: "source",
    source_amount_minor: "100000",
    target_amount_minor: "124375",
    mid_rate: "1.25",
    customer_rate: "1.24375",
    spread_bps: 50,
    fee_minor: "500",
    fee_currency: "GBP",
    rate_source: "test-feed",
    rate_observed_at: freshIso(),
    rate_stale: false,
    status: "open",
    idempotency_key: "key-1",
    request_hash: CREATE_INPUT_HASH,
    tx_id: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    executed_at: null,
    created_at: freshIso(),
    unexpired: true,
    ...overrides,
  };
}

interface FakeFxState {
  /** fx_rates ticks keyed "BASE/QUOTE". */
  ticks: Record<string, { rate: string; source: string; observed_at: string }>;
  /** oneze_internal_fx_rates keyed "BASE/QUOTE". */
  internal: Record<string, { rate: string; source: string; updated_at: string }>;
  wallets: FakeWallet[];
  quotes: FakeQuote[];
  /** wallet_currency_balances keyed "walletId/CURRENCY" → balance_minor. */
  pockets: Record<string, number>;
  ledgerEntries: unknown[][];
}

function fakeFxDb(partial: Partial<FakeFxState> = {}) {
  const state: FakeFxState = {
    ticks: {},
    internal: {},
    wallets: [],
    quotes: [],
    pockets: {},
    ledgerEntries: [],
    ...partial,
  };
  const calls: Array<{ text: string; params?: unknown[] }> = [];

  const query = async <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> => {
    calls.push({ text, params });
    const p = params ?? [];

    // ── fx_quotes writes (before the FROM fx_quotes read branch) ──
    if (text.includes("INSERT INTO fx_quotes")) {
      const idemKey = p[16] as string | null;
      const conflict =
        idemKey !== null &&
        state.quotes.some(
          (q) => q.user_id === p[1] && q.idempotency_key === idemKey,
        );
      if (conflict) {
        return empty() as QueryResult<T>; // ON CONFLICT DO NOTHING → no RETURNING row
      }
      const quote: FakeQuote = {
        id: p[0] as string,
        user_id: p[1] as string,
        wallet_id: p[2] as string,
        source_currency: p[3] as string,
        target_currency: p[4] as string,
        fixed_side: p[5] as FakeQuote["fixed_side"],
        source_amount_minor: String(p[6]),
        target_amount_minor: String(p[7]),
        mid_rate: String(p[8]),
        customer_rate: String(p[9]),
        spread_bps: Number(p[10]),
        fee_minor: String(p[11]),
        fee_currency: p[12] as string | null,
        rate_source: p[13] as string,
        rate_observed_at: p[14] as string,
        rate_stale: Boolean(p[15]),
        status: "open",
        idempotency_key: idemKey,
        request_hash: p[17] as string | null,
        tx_id: null,
        expires_at: new Date(Date.now() + Number(p[18]) * 1000).toISOString(),
        executed_at: null,
        created_at: new Date().toISOString(),
        unexpired: true,
      };
      state.quotes.push(quote);
      return rows([quote]) as QueryResult<T>;
    }

    if (text.includes("UPDATE fx_quotes")) {
      if (text.includes("'executed'")) {
        const quote = state.quotes.find((q) => q.id === p[0]);
        if (quote) {
          quote.status = "executed";
          quote.tx_id = p[1] as string;
          quote.executed_at = new Date().toISOString();
        }
        return rows(quote ? [quote] : []) as QueryResult<T>;
      }
      // status = 'expired' — id-scoped lazy expiry (and the sweep shape).
      if (p.length > 0) {
        const quote = state.quotes.find((q) => q.id === p[0]);
        if (quote && quote.status === "open") {
          quote.status = "expired";
        }
      } else {
        for (const quote of state.quotes) {
          if (quote.status === "open" && !quote.unexpired) {
            quote.status = "expired";
          }
        }
      }
      return empty() as QueryResult<T>;
    }

    if (text.includes("FROM fx_quotes")) {
      if (text.includes("WHERE id = $1")) {
        const quote = state.quotes.find((q) => q.id === p[0]);
        return rows(quote ? [quote] : []) as QueryResult<T>;
      }
      const quote = state.quotes.find(
        (q) => q.user_id === p[0] && q.idempotency_key === p[1],
      );
      return rows(quote ? [quote] : []) as QueryResult<T>;
    }

    // ── Rate stores (internal first — its name contains 'fx_rates') ──
    if (text.includes("FROM oneze_internal_fx_rates")) {
      const hit = state.internal[`${p[0]}/${p[1]}`];
      return rows(hit ? [hit] : []) as QueryResult<T>;
    }
    if (text.includes("FROM fx_rates")) {
      const hit = state.ticks[`${p[0]}/${p[1]}`];
      return rows(hit ? [hit] : []) as QueryResult<T>;
    }

    // ── Currency pockets ──
    if (text.includes("INSERT INTO wallet_currency_balances")) {
      const key = `${p[0]}/${p[1]}`;
      if (!(key in state.pockets)) {
        state.pockets[key] = Number(p[2]);
      }
      return empty() as QueryResult<T>;
    }
    if (text.includes("UPDATE wallet_currency_balances")) {
      state.pockets[`${p[0]}/${p[1]}`] = Number(p[2]);
      return empty() as QueryResult<T>;
    }
    if (text.includes("FROM wallet_currency_balances")) {
      if (text.includes("ANY($2")) {
        const currencies = p[1] as string[];
        return rows(
          currencies
            .filter((c) => `${p[0]}/${c}` in state.pockets)
            .map((c) => ({
              currency: c,
              balance_minor: String(state.pockets[`${p[0]}/${c}`]),
            })),
        ) as QueryResult<T>;
      }
      const key = `${p[0]}/${p[1]}`;
      return rows(
        key in state.pockets
          ? [{ balance_minor: String(state.pockets[key]) }]
          : [],
      ) as QueryResult<T>;
    }

    // ── Wallet ledger + wallet row ──
    if (text.includes("INSERT INTO wallet_ledger")) {
      state.ledgerEntries.push(p);
      return empty() as QueryResult<T>;
    }
    if (text.includes("UPDATE wallets")) {
      const wallet = state.wallets.find((w) => w.id === p[0]);
      if (wallet && text.includes("fiat_balance_minor")) {
        wallet.fiat_balance_minor = String(p[1]);
      }
      if (wallet && text.includes("oneze_balance_units")) {
        wallet.oneze_balance_units = String(p[1]);
      }
      return empty() as QueryResult<T>;
    }
    if (text.includes("FROM wallets")) {
      let wallet: FakeWallet | undefined;
      if (text.includes("WHERE id = $1 AND user_id = $2")) {
        wallet = state.wallets.find((w) => w.id === p[0] && w.user_id === p[1]);
      } else if (text.includes("WHERE user_id = $1")) {
        wallet = state.wallets.find((w) => w.user_id === p[0]);
      } else {
        wallet = state.wallets.find((w) => w.id === p[0]);
      }
      return rows(wallet ? [wallet] : []) as QueryResult<T>;
    }

    return empty() as QueryResult<T>;
  };

  return { calls, state, query };
}

// ── invertDecimalRate ────────────────────────────────────────────────────────

test("invertDecimalRate inverts decimal-string rates at 12dp half-up", () => {
  // 12dp half-up, trailing zeros trimmed by the decimal renderer.
  assert.equal(invertDecimalRate("0.79"), "1.26582278481");
  assert.equal(invertDecimalRate("1"), "1");
  assert.equal(invertDecimalRate("2"), "0.5");
  assert.equal(invertDecimalRate("1.25"), "0.8");
  assert.equal(invertDecimalRate("83.3"), "0.012004801921");
});

test("invertDecimalRate rejects non-positive and malformed rates", () => {
  for (const bad of ["0", "0.0", "abc", "-1", "1.2.3", "", "  "]) {
    assert.throws(() => invertDecimalRate(bad), errorCode("FX_RATE_INVALID"), bad);
  }
});

// ── multiplyDecimalRates ─────────────────────────────────────────────────────

test("multiplyDecimalRates multiplies decimal-string rates at 12dp", () => {
  assert.equal(multiplyDecimalRates("0.79", "83.3"), "65.807");
  assert.equal(multiplyDecimalRates("1", "1"), "1");
  assert.equal(multiplyDecimalRates("1.005", "2"), "2.01");
  // Precision is carried at 12dp — no float collapse.
  assert.equal(multiplyDecimalRates("0.333333333333", "3"), "0.999999999999");
  assert.equal(multiplyDecimalRates("1.111111111111", "83"), "92.222222222213");
});

test("multiplyDecimalRates rejects non-positive and malformed operands", () => {
  for (const [a, b] of [
    ["0", "1"],
    ["1", "0"],
    ["abc", "1"],
    ["1", "-2"],
  ] as const) {
    assert.throws(() => multiplyDecimalRates(a, b), errorCode("FX_RATE_INVALID"), `${a}×${b}`);
  }
});

// ── resolveExchangeRate ──────────────────────────────────────────────────────

test("resolveExchangeRate short-circuits identical currencies without touching the DB", async () => {
  const db = fakeFxDb();
  const resolved = await resolveExchangeRate(db as never, "GBP", "gbp");
  assert.equal(resolved.rate, "1");
  assert.equal(resolved.path, "direct");
  assert.equal(resolved.source, "identity");
  assert.equal(resolved.stale, false);
  assert.deepEqual(resolved.legs, []);
  assert.equal(db.calls.length, 0);
});

test("resolveExchangeRate takes the latest fx_rates tick as a direct hit", async () => {
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: freshIso() } },
  });
  const resolved = await resolveExchangeRate(db as never, "GBP", "USD");
  assert.equal(resolved.rate, "1.25");
  assert.equal(resolved.path, "direct");
  assert.equal(resolved.source, "test-feed");
  assert.equal(resolved.stale, false);
  assert.equal(resolved.legs.length, 1);
  assert.equal(resolved.legs[0].base, "GBP");
  assert.equal(resolved.legs[0].quote, "USD");
  assert.equal(resolved.legs[0].usedInverse, false);
  // The tick store is probed before the internal store.
  assert.ok(db.calls[0].text.includes("FROM fx_rates"));
});

test("resolveExchangeRate falls back to oneze_internal_fx_rates when no tick exists", async () => {
  const db = fakeFxDb({
    internal: { "GBP/USD": { rate: "1.30", source: "operator", updated_at: freshIso() } },
  });
  const resolved = await resolveExchangeRate(db as never, "GBP", "USD");
  assert.equal(resolved.rate, "1.30");
  assert.equal(resolved.path, "direct");
  assert.equal(resolved.source, "operator");
  assert.ok(db.calls.some((c) => c.text.includes("FROM oneze_internal_fx_rates")));
});

test("resolveExchangeRate inverts the reverse pair when only it is stored", async () => {
  const db = fakeFxDb({
    ticks: { "USD/GBP": { rate: "0.8", source: "test-feed", observed_at: freshIso() } },
  });
  const resolved = await resolveExchangeRate(db as never, "GBP", "USD");
  assert.equal(resolved.rate, "1.25");
  assert.equal(resolved.path, "inverse");
  assert.equal(resolved.source, "test-feed:inverse");
  assert.equal(resolved.legs[0].base, "USD");
  assert.equal(resolved.legs[0].quote, "GBP");
  assert.equal(resolved.legs[0].usedInverse, true);
});

test("resolveExchangeRate composes a USD cross when no pair exists either way", async () => {
  const db = fakeFxDb({
    ticks: {
      "EUR/USD": { rate: "1.1", source: "feed-a", observed_at: freshIso() },
      "USD/INR": { rate: "83", source: "feed-b", observed_at: freshIso() },
    },
  });
  const resolved = await resolveExchangeRate(db as never, "EUR", "INR");
  assert.equal(resolved.rate, "91.3"); // 1.1 × 83
  assert.equal(resolved.path, "cross");
  assert.equal(resolved.legs.length, 2);
  assert.equal(resolved.source, "cross:feed-a+feed-b");
  assert.equal(resolved.stale, false);
});

test("resolveExchangeRate uses an inverse leg inside a USD cross", async () => {
  const db = fakeFxDb({
    ticks: {
      // Only USD/EUR stored → EUR→USD hop must invert it (1/0.9).
      "USD/EUR": { rate: "0.9", source: "feed-a", observed_at: freshIso() },
      "USD/INR": { rate: "83", source: "feed-b", observed_at: freshIso() },
    },
  });
  const resolved = await resolveExchangeRate(db as never, "EUR", "INR");
  assert.equal(resolved.rate, "92.222222222213"); // 1.111111111111 × 83
  assert.equal(resolved.path, "cross");
  assert.equal(resolved.legs[0].usedInverse, true);
  assert.equal(resolved.source, "cross:feed-a:inverse+feed-b");
});

test("resolveExchangeRate reports the oldest leg observation on a cross", async () => {
  const older = new Date(Date.now() - 10 * 60_000).toISOString();
  const newer = new Date(Date.now() - 5 * 60_000).toISOString();
  const db = fakeFxDb({
    ticks: {
      "EUR/USD": { rate: "1.1", source: "feed-a", observed_at: newer },
      "USD/INR": { rate: "83", source: "feed-b", observed_at: older },
    },
  });
  const resolved = await resolveExchangeRate(db as never, "EUR", "INR");
  assert.equal(resolved.observedAt, older);
});

test("resolveExchangeRate flags stale observations and seeded rates", async () => {
  const staleTick = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: staleIso() } },
  });
  assert.equal((await resolveExchangeRate(staleTick as never, "GBP", "USD")).stale, true);

  const seeded = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "seed", observed_at: freshIso() } },
  });
  assert.equal((await resolveExchangeRate(seeded as never, "GBP", "USD")).stale, true);
});

test("resolveExchangeRate throws FX_RATE_UNAVAILABLE when no path exists", async () => {
  const db = fakeFxDb();
  await assert.rejects(
    () => resolveExchangeRate(db as never, "GBP", "USD"),
    errorCode("FX_RATE_UNAVAILABLE"),
  );
  // Cross is not attempted when a leg is missing.
  const oneLeg = fakeFxDb({
    ticks: { "EUR/USD": { rate: "1.1", source: "feed", observed_at: freshIso() } },
  });
  await assert.rejects(
    () => resolveExchangeRate(oneLeg as never, "EUR", "INR"),
    errorCode("FX_RATE_UNAVAILABLE"),
  );
});

test("resolveExchangeRate rejects unsupported currency codes", async () => {
  const db = fakeFxDb();
  await assert.rejects(
    () => resolveExchangeRate(db as never, "GBP", "ZZZ"),
    errorCode("FX_CURRENCY_INVALID"),
  );
  await assert.rejects(
    () => resolveExchangeRate(db as never, "GB", "USD"),
    errorCode("FX_CURRENCY_INVALID"),
  );
});

// ── quoteConversion ──────────────────────────────────────────────────────────

const gbpUsdDb = () =>
  fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: freshIso() } },
  });

test("quoteConversion carves the spread fee out of a source-fixed amount before converting", async () => {
  const db = gbpUsdDb();
  const quote = await quoteConversion(db as never, {
    userId: "u1",
    sourceCurrency: "GBP",
    targetCurrency: "USD",
    fixedSide: "source",
    amountMinor: "100000",
    spreadBps: 50,
  });

  assert.equal(quote.sourceAmountMinor, "100000");
  assert.equal(quote.feeMinor, "500"); // 100000 × 50/10000
  assert.equal(quote.feeCurrency, "GBP");
  assert.equal(quote.targetAmountMinor, "124375"); // 99500 × 1.25
  assert.equal(quote.midRate, "1.25");
  assert.equal(quote.customerRate, "1.24375"); // 1.25 × (1 - 0.005)
  assert.equal(quote.spreadBps, 50);
  assert.equal(quote.fixedSide, "source");
  assert.equal(quote.walletId, null);
  assert.equal(quote.rate.path, "direct");
  assert.equal(quote.rate.stale, false);
});

test("quoteConversion solves the minimal source gross for a target-fixed amount", async () => {
  const db = gbpUsdDb();
  const quote = await quoteConversion(db as never, {
    userId: "u1",
    sourceCurrency: "GBP",
    targetCurrency: "USD",
    fixedSide: "target",
    amountMinor: "124375",
    spreadBps: 50,
  });
  // 99999 GBP minor nets 99499 → 124373.75 → 124374 USD minor (short by one);
  // 100000 is the minimal gross that delivers exactly 124375.
  assert.equal(quote.sourceAmountMinor, "100000");
  assert.equal(quote.targetAmountMinor, "124375");
  assert.equal(quote.feeMinor, "500");

  const zeroSpread = await quoteConversion(gbpUsdDb() as never, {
    userId: "u1",
    sourceCurrency: "GBP",
    targetCurrency: "USD",
    fixedSide: "target",
    amountMinor: "125000",
    spreadBps: 0,
  });
  assert.equal(zeroSpread.sourceAmountMinor, "100000");
  assert.equal(zeroSpread.feeMinor, "0");
  assert.equal(zeroSpread.customerRate, "1.25");
});

test("quoteConversion rejects same-currency, bad amounts, spreads, and sides", async () => {
  const db = gbpUsdDb();
  const base = {
    userId: "u1",
    sourceCurrency: "GBP",
    targetCurrency: "USD",
    fixedSide: "source" as const,
    amountMinor: "100000",
    spreadBps: 50,
  };

  await assert.rejects(
    () => quoteConversion(db as never, { ...base, targetCurrency: "gbp" }),
    errorCode("FX_SAME_CURRENCY"),
  );
  for (const amountMinor of ["0", "-1", "abc", "1.5"]) {
    await assert.rejects(
      () => quoteConversion(db as never, { ...base, amountMinor }),
      errorCode("FX_AMOUNT_INVALID"),
      amountMinor,
    );
  }
  for (const spreadBps of [-1, 10_000, 0.5]) {
    await assert.rejects(
      () => quoteConversion(db as never, { ...base, spreadBps }),
      errorCode("FX_SPREAD_INVALID"),
      String(spreadBps),
    );
  }
  await assert.rejects(
    () =>
      quoteConversion(db as never, {
        ...base,
        fixedSide: "middle" as never,
      }),
    errorCode("FX_FIXED_SIDE_INVALID"),
  );
  await assert.rejects(
    () => quoteConversion(db as never, { ...base, targetCurrency: "ZZZ" }),
    errorCode("FX_CURRENCY_INVALID"),
  );
});

test("quoteConversion propagates the resolved rate staleness flag", async () => {
  const stale = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: staleIso() } },
  });
  const quote = await quoteConversion(stale as never, {
    userId: "u1",
    sourceCurrency: "GBP",
    targetCurrency: "USD",
    fixedSide: "source",
    amountMinor: "100000",
    spreadBps: 50,
  });
  assert.equal(quote.rate.stale, true);

  const seeded = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "seed", observed_at: freshIso() } },
  });
  const seededQuote = await quoteConversion(seeded as never, {
    userId: "u1",
    sourceCurrency: "GBP",
    targetCurrency: "USD",
    fixedSide: "source",
    amountMinor: "100000",
    spreadBps: 50,
  });
  assert.equal(seededQuote.rate.stale, true);
});

test("quoteConversion fails when the conversion yields less than one target minor unit", async () => {
  const db = fakeFxDb({
    ticks: { "GBP/JPY": { rate: "0.000001", source: "test-feed", observed_at: freshIso() } },
  });
  await assert.rejects(
    () =>
      quoteConversion(db as never, {
        userId: "u1",
        sourceCurrency: "GBP",
        targetCurrency: "JPY",
        fixedSide: "source",
        amountMinor: "1",
        spreadBps: 0,
      }),
    errorCode("FX_AMOUNT_INVALID"),
  );
});

// ── createFxQuote ────────────────────────────────────────────────────────────

const createInput = {
  userId: "u1",
  walletId: "wal_1",
  sourceCurrency: "GBP",
  targetCurrency: "USD",
  fixedSide: "source" as const,
  amountMinor: "100000",
  spreadBps: 50,
};

test("createFxQuote persists the computed quote and returns it un-replayed", async () => {
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: freshIso() } },
    wallets: [fakeWallet()],
  });
  const { quote, replayed } = await createFxQuote(db as never, {
    ...createInput,
    idempotencyKey: "key-1",
    ttlSeconds: 60,
  });

  assert.equal(replayed, false);
  assert.ok(quote.id.startsWith("fxq_"));
  assert.equal(quote.userId, "u1");
  assert.equal(quote.walletId, "wal_1");
  assert.equal(quote.sourceAmountMinor, "100000");
  assert.equal(quote.targetAmountMinor, "124375");
  assert.equal(quote.midRate, "1.25");
  assert.equal(quote.customerRate, "1.24375");
  assert.equal(quote.feeMinor, "500");
  assert.equal(quote.feeCurrency, "GBP");
  assert.equal(quote.status, "open");
  assert.equal(quote.idempotencyKey, "key-1");
  assert.equal(quote.rateSource, "test-feed");
  assert.equal(quote.rateStale, false);

  const insert = db.calls.find((c) => c.text.includes("INSERT INTO fx_quotes"));
  assert.ok(insert, "an INSERT INTO fx_quotes must be issued");
  const p = insert.params as unknown[];
  assert.equal(p[1], "u1");
  assert.equal(p[2], "wal_1");
  assert.equal(p[3], "GBP");
  assert.equal(p[4], "USD");
  assert.equal(p[5], "source");
  assert.equal(p[6], "100000");
  assert.equal(p[7], "124375");
  assert.equal(p[10], 50);
  assert.equal(p[11], "500");
  assert.equal(p[12], "GBP");
  assert.equal(p[15], false); // rate_stale
  assert.equal(p[16], "key-1");
  assert.match(String(p[17]), /^[0-9a-f]{64}$/); // request_hash (sha256)
  assert.equal(p[18], 60);
});

test("createFxQuote replays a still-open stored quote on idempotency-key conflict", async () => {
  const stored = fakeQuote({ id: "fxq_winner", idempotency_key: "key-1", unexpired: true });
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: freshIso() } },
    wallets: [fakeWallet()],
    quotes: [stored],
  });
  const { quote, replayed } = await createFxQuote(db as never, {
    ...createInput,
    idempotencyKey: "key-1",
  });
  assert.equal(replayed, true);
  assert.equal(quote.id, "fxq_winner");
});

test("createFxQuote expires a lapsed open quote and rejects the replay", async () => {
  const stored = fakeQuote({ id: "fxq_lapsed", idempotency_key: "key-1", unexpired: false });
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: freshIso() } },
    wallets: [fakeWallet()],
    quotes: [stored],
  });
  await assert.rejects(
    () => createFxQuote(db as never, { ...createInput, idempotencyKey: "key-1" }),
    errorCode("FX_QUOTE_EXPIRED"),
  );
  assert.equal(stored.status, "expired");
  assert.ok(
    db.calls.some(
      (c) => c.text.includes("UPDATE fx_quotes") && c.text.includes("'expired'"),
    ),
    "the lapsed quote must be lazily marked expired",
  );
});

test("createFxQuote refuses a key bound to a terminal quote", async () => {
  const stored = fakeQuote({ id: "fxq_done", idempotency_key: "key-1", status: "executed" });
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: freshIso() } },
    wallets: [fakeWallet()],
    quotes: [stored],
  });
  await assert.rejects(
    () => createFxQuote(db as never, { ...createInput, idempotencyKey: "key-1" }),
    errorCode("FX_QUOTE_NOT_OPEN"),
  );
});

test("createFxQuote validates the TTL before touching the database", async () => {
  const db = gbpUsdDb();
  for (const ttlSeconds of [0, -5, 3601, 1.5]) {
    await assert.rejects(
      () => createFxQuote(db as never, { ...createInput, ttlSeconds }),
      errorCode("FX_QUOTE_TTL_INVALID"),
      String(ttlSeconds),
    );
  }
  assert.equal(db.calls.length, 0);
});

test("createFxQuote throws WALLET_NOT_FOUND when the wallet lookup misses", async () => {
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: freshIso() } },
  });
  await assert.rejects(
    () => createFxQuote(db as never, createInput),
    errorCode("WALLET_NOT_FOUND"),
  );
});

// ── executeFxQuote ───────────────────────────────────────────────────────────

test("executeFxQuote debits source, credits target, and marks the quote executed", async () => {
  const quote = fakeQuote();
  const db = fakeFxDb({
    wallets: [fakeWallet()],
    quotes: [quote],
    pockets: { "wal_1/GBP": 200000 },
  });

  const result = await executeFxQuote(db as never, "fxq_stored", { userId: "u1" });

  assert.ok(result.txId.startsWith("wtx_"));
  assert.equal(result.debitedSourceMinor, "100000");
  assert.equal(result.creditedTargetMinor, "124375");
  assert.equal(result.feeMinor, "500");
  assert.equal(result.feeCurrency, "GBP");
  assert.equal(result.sourceBalanceAfterMinor, 100000);
  assert.equal(result.targetBalanceAfterMinor, 124375);
  assert.equal(result.quote.status, "executed");
  assert.equal(result.quote.txId, result.txId);
  assert.equal(result.replayed, false);
  assert.equal(quote.status, "executed");

  // The quote row lock is taken first — it cannot cycle with wallet locks.
  assert.ok(db.calls[0].text.includes("FROM fx_quotes"));
  assert.ok(db.calls[0].text.includes("FOR UPDATE"));

  // Both wallet legs ride one tx_id, debit negative / credit positive.
  const ledger = db.state.ledgerEntries;
  assert.equal(ledger.length, 2);
  const debit = ledger.find((p) => p[5] === "FX_CONVERT_DEBIT");
  const credit = ledger.find((p) => p[5] === "FX_CONVERT_CREDIT");
  assert.ok(debit && credit);
  assert.equal(debit[1], result.txId);
  assert.equal(credit[1], result.txId);
  assert.equal(debit[3], -100000);
  assert.equal(credit[3], 124375);
  assert.equal(debit[4], 100000); // balance_after on the source pocket
  assert.equal(credit[4], 124375); // balance_after on the target pocket
  assert.equal(debit[10], "GBP");
  assert.equal(credit[10], "USD");

  // The legacy fiat mirror moves only for the wallet's own fiat currency (GBP
  // debit) — the USD credit must not touch wallets.fiat_balance_minor.
  const mirrorUpdates = db.calls.filter(
    (c) => c.text.includes("UPDATE wallets") && c.text.includes("fiat_balance_minor"),
  );
  assert.equal(mirrorUpdates.length, 1);
});

test("executeFxQuote marks an expired open quote and throws FX_QUOTE_EXPIRED", async () => {
  const quote = fakeQuote({ unexpired: false });
  const db = fakeFxDb({ wallets: [fakeWallet()], quotes: [quote] });

  await assert.rejects(
    () => executeFxQuote(db as never, "fxq_stored", { userId: "u1" }),
    errorCode("FX_QUOTE_EXPIRED"),
  );
  assert.equal(quote.status, "expired");
});

test("executeFxQuote rejects the wrong user and non-open quotes", async () => {
  const db = fakeFxDb({
    wallets: [fakeWallet()],
    quotes: [fakeQuote({ user_id: "u2" })],
  });
  await assert.rejects(
    () => executeFxQuote(db as never, "fxq_stored", { userId: "u1" }),
    errorCode("FX_QUOTE_NOT_FOUND"),
  );

  const cancelled = fakeFxDb({
    wallets: [fakeWallet()],
    quotes: [fakeQuote({ status: "cancelled" })],
  });
  await assert.rejects(
    () => executeFxQuote(cancelled as never, "fxq_stored", { userId: "u1" }),
    errorCode("FX_QUOTE_NOT_OPEN"),
  );

  const missing = fakeFxDb({ wallets: [fakeWallet()] });
  await assert.rejects(
    () => executeFxQuote(missing as never, "fxq_nope", { userId: "u1" }),
    errorCode("FX_QUOTE_NOT_FOUND"),
  );
});

test("executeFxQuote fails closed when the source pocket cannot fund the debit", async () => {
  const db = fakeFxDb({
    wallets: [fakeWallet()],
    quotes: [fakeQuote()],
    pockets: { "wal_1/GBP": 50_000 }, // half the required 100000
  });
  await assert.rejects(
    () => executeFxQuote(db as never, "fxq_stored", { userId: "u1" }),
    errorCode("WALLET_INSUFFICIENT_BALANCE"),
  );
  // No ledger legs may be posted when the spendable check fails.
  assert.equal(db.state.ledgerEntries.length, 0);
});

test("executeFxQuote replays the stored execution for an already-executed quote", async () => {
  const quote = fakeQuote({ status: "executed", tx_id: "wtx_done" });
  const db = fakeFxDb({
    wallets: [fakeWallet()],
    quotes: [quote],
    pockets: { "wal_1/GBP": 100000, "wal_1/USD": 124375 },
  });

  const result = await executeFxQuote(db as never, "fxq_stored", { userId: "u1" });

  // The stored execution is returned verbatim — no new tx_id, no new legs.
  assert.equal(result.replayed, true);
  assert.equal(result.txId, "wtx_done");
  assert.equal(result.debitedSourceMinor, "100000");
  assert.equal(result.creditedTargetMinor, "124375");
  assert.equal(result.feeMinor, "500");
  assert.equal(result.feeCurrency, "GBP");
  assert.equal(result.quote.status, "executed");
  assert.equal(result.sourceBalanceAfterMinor, 100000);
  assert.equal(result.targetBalanceAfterMinor, 124375);
  assert.equal(db.state.ledgerEntries.length, 0, "a replay must not post wallet legs again");
  assert.equal(
    db.calls.some((c) => c.text.includes("INSERT INTO wallet_ledger")),
    false,
  );
});

// ── Stale-rate gate, operator-override freshness, idempotent reuse ──────────

test("createFxQuote rejects a stale resolved rate unless allowStaleRate is set", async () => {
  const staleDb = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: staleIso() } },
    wallets: [fakeWallet()],
  });
  await assert.rejects(
    () => createFxQuote(staleDb as never, createInput),
    errorCode("FX_RATE_STALE"),
  );
  // The quote is refused before any insert is attempted.
  assert.equal(
    staleDb.calls.some((c) => c.text.includes("INSERT INTO fx_quotes")),
    false,
  );

  const allowedDb = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: staleIso() } },
    wallets: [fakeWallet()],
  });
  const { quote } = await createFxQuote(allowedDb as never, {
    ...createInput,
    allowStaleRate: true,
  });
  assert.equal(quote.rateStale, true);
  assert.equal(allowedDb.state.quotes[0].rate_stale, true);
});

test("resolveExchangeRate prefers a fresh internal override over a stale tick", async () => {
  // /admin/1ze/fx-rate writes oneze_internal_fx_rates — an operator override
  // must beat an old provider tick, not hide behind it.
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "external_fx_provider", observed_at: staleIso() } },
    internal: { "GBP/USD": { rate: "1.30", source: "operator", updated_at: freshIso() } },
  });
  const resolved = await resolveExchangeRate(db as never, "GBP", "USD");
  assert.equal(resolved.rate, "1.30");
  assert.equal(resolved.source, "operator");
  assert.equal(resolved.stale, false);
});

test("resolveExchangeRate prefers a fresh tick over a stale internal row", async () => {
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "external_fx_provider", observed_at: freshIso() } },
    internal: { "GBP/USD": { rate: "1.30", source: "operator", updated_at: staleIso() } },
  });
  const resolved = await resolveExchangeRate(db as never, "GBP", "USD");
  assert.equal(resolved.rate, "1.25");
  assert.equal(resolved.source, "external_fx_provider");
  assert.equal(resolved.stale, false);
});

test("resolveExchangeRate prefers the fresher of two stale sources", async () => {
  const older = new Date(Date.now() - 60 * 60_000).toISOString();
  const newer = new Date(Date.now() - 45 * 60_000).toISOString();
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "external_fx_provider", observed_at: older } },
    internal: { "GBP/USD": { rate: "1.30", source: "operator", updated_at: newer } },
  });
  const resolved = await resolveExchangeRate(db as never, "GBP", "USD");
  assert.equal(resolved.rate, "1.30");
  assert.equal(resolved.source, "operator");
  assert.equal(resolved.stale, true, "the freshest stale source is still stale");
});

test("createFxQuote rejects a recycled idempotency key with a different payload", async () => {
  const stored = fakeQuote({
    id: "fxq_winner",
    idempotency_key: "key-1",
    unexpired: true,
    // A hash that cannot match the incoming canonical payload.
    request_hash: "0".repeat(64),
  });
  const db = fakeFxDb({
    ticks: { "GBP/USD": { rate: "1.25", source: "test-feed", observed_at: freshIso() } },
    wallets: [fakeWallet()],
    quotes: [stored],
  });
  await assert.rejects(
    () => createFxQuote(db as never, { ...createInput, idempotencyKey: "key-1" }),
    errorCode("IDEMPOTENCY_KEY_REUSED"),
  );
});
