/**
 * commercePayments — 1ZE debit quote math, locked balance reads, retriable
 * provider-failure guard, and stale-submission classification.
 *
 * `computeOnezeDebitQuote` is exercised against a stateful fake pool that
 * answers the three pricing queries the function composes
 * (oneze_country_pricing_profiles, oneze_anchor_config,
 * oneze_internal_fx_rates). The core assertion is the P0 unit fix: the
 * debit is totalGbp / gbpToUsdRate — NOT the raw GBP amount — so the
 * balance the client compares can never disagree with settlement.
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import {
  classifyStaleSubmission,
  computeOnezeDebitQuote,
  isRetriableProviderPaymentFailure,
  onezeUnitsToAmount,
  readOnezeBalanceUnitsForUpdate,
} from "./commercePayments.js";

const GBP_TO_USD = 0.79; // 1 GBP = 1/0.79 USD… wait: fxRate is USD-per-GBP here

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function empty(): any {
  return { rows: [], rowCount: 0 };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rows(r: unknown[]): any {
  return { rows: r, rowCount: r.length };
}

interface PricingState {
  profileCurrency: string;
  fxRate: number;
  anchorValue: number;
}

function fakePricingDb(state: PricingState & { walletUnits?: number }) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> => {
    calls.push({ text, params });

    if (text.includes("FROM oneze_country_pricing_profiles")) {
      return rows([{
        country_code: "GB",
        currency: state.profileCurrency,
        fx_fee_bps: 0,
        load_fee_bps: 0,
        withdraw_fee_bps: 0,
        withdrawal_lock_hours: 0,
        daily_redeem_limit_ize: "0",
        weekly_redeem_limit_ize: "0",
        is_active: true,
        metadata: {},
        updated_at: new Date().toISOString(),
      }]) as QueryResult<T>;
    }

    if (text.includes("FROM oneze_anchor_config")) {
      return rows([{
        anchor_currency: "USD",
        anchor_value: String(state.anchorValue),
        notes: null,
        metadata: {},
        updated_at: new Date().toISOString(),
      }]) as QueryResult<T>;
    }

    if (text.includes("FROM oneze_internal_fx_rates")) {
      const [base, quote] = params as [string, string];
      if (base === "USD" && quote === "GBP") {
        return rows([{ rate: String(state.fxRate), source: "operator" }]) as QueryResult<T>;
      }
      return empty();
    }

    if (text.includes("FROM wallets") && text.includes("FOR UPDATE")) {
      if (state.walletUnits === undefined) return empty();
      return rows([{ oneze_balance_units: state.walletUnits }]) as QueryResult<T>;
    }

    return empty();
  };

  return { calls, query };
}

// ── computeOnezeDebitQuote ───────────────────────────────────────────────────

test("computeOnezeDebitQuote debits totalGbp / fxRate — not the raw GBP amount", async () => {
  // fxRate semantics match the settlement path: izeAmount = totalGbp / fxRate.
  // With fxRate 0.79 a £52.50 order requires ~66.455696 1ZE, i.e. 66456
  // units — ~27% MORE than the naive GBP figure the client used to compare.
  const db = fakePricingDb({ profileCurrency: "GBP", fxRate: GBP_TO_USD, anchorValue: 86 });
  const quote = await computeOnezeDebitQuote(db as never, 52.5);

  assert.equal(quote.totalGbp, 52.5);
  assert.equal(quote.gbpToUsdRate, GBP_TO_USD);
  assert.equal(quote.izeAmount, Number((52.5 / GBP_TO_USD).toFixed(6)));
  assert.equal(quote.debitUnits, Math.round(quote.izeAmount * 1000));
  assert.ok(quote.debitUnits > 52500, "debit units must exceed the raw GBP×1000 figure");
});

test("computeOnezeDebitQuote throws IZE_AMOUNT_INVALID on a non-positive total", async () => {
  const db = fakePricingDb({ profileCurrency: "GBP", fxRate: GBP_TO_USD, anchorValue: 86 });
  await assert.rejects(
    () => computeOnezeDebitQuote(db as never, 0),
    (error: unknown) => (error as { code?: string }).code === "IZE_AMOUNT_INVALID",
  );
});

test("computeOnezeDebitQuote throws PAYMENT_PROVIDER_UNAVAILABLE when the FX row is missing", async () => {
  const db = fakePricingDb({ profileCurrency: "GBP", fxRate: GBP_TO_USD, anchorValue: 86 });
  // Point the profile at a currency with no FX row so resolveInternalFxRate throws.
  const broken = fakePricingDb({ profileCurrency: "EUR", fxRate: GBP_TO_USD, anchorValue: 86 });
  await assert.rejects(
    () => computeOnezeDebitQuote(broken as never, 10),
    (error: unknown) => (error as { code?: string }).code === "PAYMENT_PROVIDER_UNAVAILABLE",
  );
  void db;
});

// ── readOnezeBalanceUnitsForUpdate ───────────────────────────────────────────

test("readOnezeBalanceUnitsForUpdate returns the locked balance in units", async () => {
  const db = fakePricingDb({
    profileCurrency: "GBP",
    fxRate: GBP_TO_USD,
    anchorValue: 86,
    walletUnits: 66456,
  });
  const units = await readOnezeBalanceUnitsForUpdate(db as never, "wal_1");
  assert.equal(units, 66456);
  assert.ok(
    db.calls.some((c) => c.text.includes("FOR UPDATE")),
    "balance read must hold a row lock",
  );
});

test("readOnezeBalanceUnitsForUpdate throws WALLET_NOT_FOUND on a missing row", async () => {
  const db = fakePricingDb({ profileCurrency: "GBP", fxRate: GBP_TO_USD, anchorValue: 86 });
  await assert.rejects(
    () => readOnezeBalanceUnitsForUpdate(db as never, "wal_missing"),
    (error: unknown) => (error as { code?: string }).code === "WALLET_NOT_FOUND",
  );
});

test("onezeUnitsToAmount converts minor units to major 1ZE", () => {
  assert.equal(onezeUnitsToAmount(66456), 66.456);
  assert.equal(onezeUnitsToAmount(0), 0);
});

// ── isRetriableProviderPaymentFailure (P2-7) ─────────────────────────────────

const stripeEvent = (status: string) => ({
  id: "evt_1",
  type: "payment_intent.payment_failed",
  data: { object: { id: "pi_1", object: "payment_intent", status } },
});

test("retriable guard: a declined attempt keeps the PI actionable", () => {
  assert.equal(isRetriableProviderPaymentFailure("stripe", stripeEvent("requires_payment_method")), true);
  assert.equal(isRetriableProviderPaymentFailure("stripe", stripeEvent("requires_action")), true);
  assert.equal(isRetriableProviderPaymentFailure("stripe", stripeEvent("requires_confirmation")), true);
  assert.equal(isRetriableProviderPaymentFailure("stripe", stripeEvent("processing")), true);
});

test("retriable guard: a canceled PI is terminal, not retriable", () => {
  assert.equal(isRetriableProviderPaymentFailure("stripe", stripeEvent("canceled")), false);
});

test("retriable guard: non-Stripe providers always report terminal failures", () => {
  const molliePayload = { id: "tr_1", status: "failed" };
  assert.equal(isRetriableProviderPaymentFailure("mollie", molliePayload), false);
  assert.equal(isRetriableProviderPaymentFailure("tap", { status: "DECLINED" }), false);
});

test("retriable guard: malformed payloads are terminal", () => {
  assert.equal(isRetriableProviderPaymentFailure("stripe", null), false);
  assert.equal(isRetriableProviderPaymentFailure("stripe", { data: {} }), false);
});

// ── classifyStaleSubmission (P1 reconciler) ──────────────────────────────────

test("classifyStaleSubmission settles provable terminal states", () => {
  assert.deepEqual(classifyStaleSubmission("succeeded"), {
    action: "settle",
    finalStatus: "succeeded",
  });
  assert.deepEqual(classifyStaleSubmission("failed"), {
    action: "settle",
    finalStatus: "failed",
  });
  assert.deepEqual(classifyStaleSubmission("cancelled"), {
    action: "settle",
    finalStatus: "cancelled",
  });
});

test("classifyStaleSubmission recovers intents still actionable at the provider", () => {
  assert.deepEqual(classifyStaleSubmission("requires_confirmation"), {
    action: "recover",
    status: "requires_confirmation",
  });
  assert.deepEqual(classifyStaleSubmission("processing"), {
    action: "recover",
    status: "processing",
  });
});

test("classifyStaleSubmission fails submissions with no provable provider state", () => {
  assert.deepEqual(classifyStaleSubmission(null), { action: "fail" });
  assert.deepEqual(classifyStaleSubmission("query_failed"), { action: "fail" });
  assert.deepEqual(classifyStaleSubmission("something_unmapped"), { action: "fail" });
});
