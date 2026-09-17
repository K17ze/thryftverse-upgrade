/**
 * checkoutMoneyPathGuards — P0 regression coverage for the order/payment
 * race hardening:
 *
 *  1. cancelOrderOnReservationExpiry refuses to cancel a 'created' order
 *     while a payment intent is still in flight (provider_submission_pending,
 *     processing, or recently-active parked states) — the exact defect where
 *     a late provider 'succeeded' captured money against a cancelled order
 *     and the paid-order UPDATE silently matched nothing.
 *  2. flagOrphanedCommercePayment persists an order.payment_orphaned
 *     order_events row (deduped per intent) and a critical
 *     reconciliation_breaks row — the settlement-time tripwire for any
 *     captured payment whose order is no longer payable.
 *  3. Pause provenance: migration 305 scopes every automatic restore to
 *     pause_source='checkout_reservation' so expiry cleanup can never undo
 *     a seller (or auction) pause — plus source-level checks that every
 *     reservation pause writes the provenance and every expiry cancel
 *     routes through the shared guard.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  cancelOrderOnReservationExpiry,
  flagOrphanedCommercePayment,
  noInFlightPaymentGuardSql,
  releaseParkedPaymentIntent,
} from "../lib/commerceCheckoutLifecycle.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "..");
const repoSrc = (rel: string) =>
  readFileSync(path.join(srcRoot, rel), "utf8").replace(/\s+/g, " ");

interface FakeResult {
  rows: unknown[];
  rowCount?: number;
}

function fakeClient(handlers: Array<{ match: string; result: FakeResult }>) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async <T = unknown>(text: string, params?: unknown[]) => {
    calls.push({ text, params });
    const normalized = text.replace(/\s+/g, " ");
    const handler = handlers.find((h) => normalized.includes(h.match));
    const result = handler?.result ?? { rows: [], rowCount: 0 };
    return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length } as {
      rows: T[];
      rowCount: number;
    };
  };
  return { calls, query };
}

// ── cancelOrderOnReservationExpiry ──────────────────────────────────────────

test("expiry cancel is refused while provider_submission_pending intent is in flight", async () => {
  const db = fakeClient([
    // Order row lock — still 'created'.
    {
      match: "FROM orders WHERE id = $1",
      result: { rows: [{ id: "ord_1", status: "created" }], rowCount: 1 },
    },
    // In-flight recheck → a provider_submission_pending intent exists.
    {
      match: "FROM payment_intents pi",
      result: { rows: [{ id: "pi_live" }], rowCount: 1 },
    },
  ]);

  const outcome = await cancelOrderOnReservationExpiry(db as never, "ord_1");
  assert.equal(outcome, "blocked_in_flight");
  assert.ok(
    !db.calls.some((c) => c.text.includes("UPDATE orders SET status = 'cancelled'")),
    "the order must NOT be cancelled while an intent is in flight",
  );

  // The row lock is acquired BEFORE the in-flight check — an intent
  // committed by a concurrent bind transaction is visible to the
  // post-lock snapshot, closing the READ COMMITTED TOCTOU window.
  const lockIndex = db.calls.findIndex((c) => c.text.includes("FOR UPDATE"));
  const checkIndex = db.calls.findIndex((c) => c.text.includes("FROM payment_intents pi"));
  assert.ok(lockIndex >= 0 && checkIndex > lockIndex, "in-flight check must run after the row lock");
});

test("the guarded UPDATE still carries the in-flight predicate as belt-and-braces", async () => {
  const db = fakeClient([
    {
      match: "FROM orders WHERE id = $1",
      result: { rows: [{ id: "ord_1", status: "created" }], rowCount: 1 },
    },
    {
      match: "UPDATE orders SET status = 'cancelled'",
      result: { rows: [{ id: "ord_1" }], rowCount: 1 },
    },
  ]);
  const outcome = await cancelOrderOnReservationExpiry(db as never, "ord_1");
  assert.equal(outcome, "cancelled");

  const guardedUpdate = db.calls.find((c) => c.text.includes("UPDATE orders"));
  assert.ok(guardedUpdate);
  const sql = guardedUpdate!.text.replace(/\s+/g, " ");
  for (const status of [
    "provider_submission_pending",
    "processing",
    "requires_confirmation",
    "requires_payment_method",
  ]) {
    assert.ok(sql.includes(status), `guard must cover '${status}'`);
  }
  // Both link directions — a recovery path may have created an intent the
  // order row never bound back.
  assert.ok(sql.includes("pi.order_id"), "guard must join via payment_intents.order_id");
  assert.ok(sql.includes("pi.id = orders.payment_intent_id"), "guard must also check the bound intent");
});

test("expiry cancel reports already_terminal for a drifted reservation", async () => {
  const db = fakeClient([
    // Order already 'cancelled'/'paid' — the lock read sees terminal state.
    {
      match: "FROM orders WHERE id = $1",
      result: { rows: [{ id: "ord_1", status: "paid" }], rowCount: 1 },
    },
  ]);
  const outcome = await cancelOrderOnReservationExpiry(db as never, "ord_1");
  assert.equal(outcome, "already_terminal");
  assert.ok(!db.calls.some((c) => c.text.includes("UPDATE orders SET status = 'cancelled'")));
});

test("expiry cancel reports already_terminal when the guarded UPDATE matches nothing", async () => {
  const db = fakeClient([
    {
      match: "FROM orders WHERE id = $1",
      result: { rows: [{ id: "ord_1", status: "created" }], rowCount: 1 },
    },
    { match: "UPDATE orders SET status = 'cancelled'", result: { rows: [], rowCount: 0 } },
  ]);
  const outcome = await cancelOrderOnReservationExpiry(db as never, "ord_1");
  assert.equal(outcome, "already_terminal");
});

test("noInFlightPaymentGuardSql honours the orders-table alias", () => {
  const sql = noInFlightPaymentGuardSql("o").replace(/\s+/g, " ");
  assert.ok(sql.includes("pi.order_id = o.id"));
  assert.ok(sql.includes("pi.id = o.payment_intent_id"));
});

// ── releaseParkedPaymentIntent ─────────────────────────────────────────────

test("release refuses while a provider-owned intent is in flight — and mutates nothing", async () => {
  const db = fakeClient([
    {
      match: "SELECT pi.id, pi.status, pi.provider_intent_ref, pi.gateway_id",
      result: {
        rows: [{ id: "pi_1", status: "processing", provider_intent_ref: "pi_stripe_1", gateway_id: "stripe" }],
        rowCount: 1,
      },
    },
  ]);

  const outcome = await releaseParkedPaymentIntent(db as never, "ord_1");
  assert.equal(outcome.outcome, "blocked_in_flight");
  assert.equal(outcome.releasedIntents.length, 0);
  assert.ok(
    !db.calls.some((c) => c.text.includes("UPDATE payment_intents")),
    "a provider-owned intent must not be marked cancelled",
  );
  assert.ok(
    !db.calls.some((c) => c.text.includes("UPDATE orders SET payment_intent_id = NULL")),
    "the binding must stay while money may still move",
  );
});

test("a succeeded intent reports terminal — the capture already landed", async () => {
  const db = fakeClient([
    {
      match: "SELECT pi.id, pi.status, pi.provider_intent_ref, pi.gateway_id",
      result: {
        rows: [{ id: "pi_1", status: "succeeded", provider_intent_ref: "pi_stripe_1", gateway_id: "stripe" }],
        rowCount: 1,
      },
    },
  ]);
  const outcome = await releaseParkedPaymentIntent(db as never, "ord_1");
  assert.equal(outcome.outcome, "terminal");
  assert.ok(!db.calls.some((c) => c.text.includes("UPDATE payment_intents")));
});

test("parked intent releases: conditional UPDATE, provider ref returned, order unbound", async () => {
  const db = fakeClient([
    {
      match: "SELECT pi.id, pi.status, pi.provider_intent_ref, pi.gateway_id",
      result: {
        rows: [{ id: "pi_1", status: "requires_confirmation", provider_intent_ref: "pi_stripe_1", gateway_id: "stripe" }],
        rowCount: 1,
      },
    },
    { match: "UPDATE payment_intents", result: { rows: [{ id: "pi_1" }], rowCount: 1 } },
    // Post-release in-flight re-check: clean.
    { match: "AND pi.status IN", result: { rows: [], rowCount: 0 } },
  ]);

  const outcome = await releaseParkedPaymentIntent(db as never, "ord_1");
  assert.equal(outcome.outcome, "released");
  assert.deepEqual(outcome.releasedIntents, [
    { id: "pi_1", provider_intent_ref: "pi_stripe_1", gateway_id: "stripe" },
  ]);

  // The UPDATE must re-assert the parked status — a webhook flipping the
  // intent to 'processing' between SELECT and UPDATE must lose the race.
  const cancelCall = db.calls.find((c) => c.text.includes("UPDATE payment_intents"));
  assert.ok(cancelCall);
  const sql = cancelCall!.text.replace(/\s+/g, " ");
  assert.ok(
    sql.includes("status IN ('requires_confirmation', 'requires_payment_method')"),
    "the release UPDATE must be conditional on a still-parked status",
  );

  // The order binding is cleared only after a successful release.
  assert.ok(db.calls.some((c) => c.text.includes("UPDATE orders SET payment_intent_id = NULL")));
});

test("webhook race: parked intent moved mid-release → re-check blocks and keeps the binding", async () => {
  const db = fakeClient([
    {
      match: "SELECT pi.id, pi.status, pi.provider_intent_ref, pi.gateway_id",
      result: {
        rows: [{ id: "pi_1", status: "requires_confirmation", provider_intent_ref: "pi_stripe_1", gateway_id: "stripe" }],
        rowCount: 1,
      },
    },
    // The conditional UPDATE loses the race — a webhook already flipped
    // the intent to 'processing'.
    { match: "UPDATE payment_intents", result: { rows: [], rowCount: 0 } },
    // The post-release re-check now sees it in flight.
    { match: "LIMIT 1", result: { rows: [{ id: "pi_1" }], rowCount: 1 } },
  ]);

  const outcome = await releaseParkedPaymentIntent(db as never, "ord_1");
  assert.equal(outcome.outcome, "blocked_in_flight");
  assert.equal(outcome.releasedIntents.length, 0);
  assert.ok(
    !db.calls.some((c) => c.text.includes("UPDATE orders SET payment_intent_id = NULL")),
    "must not unbind an order whose intent may still capture",
  );
});

test("an order with no payment intents releases trivially", async () => {
  const db = fakeClient([
    { match: "SELECT pi.id, pi.status", result: { rows: [], rowCount: 0 } },
    { match: "LIMIT 1", result: { rows: [], rowCount: 0 } },
  ]);
  const outcome = await releaseParkedPaymentIntent(db as never, "ord_1");
  assert.equal(outcome.outcome, "none");
  assert.equal(outcome.releasedIntents.length, 0);
});

// ── flagOrphanedCommercePayment ─────────────────────────────────────────────

test("settling a captured payment against a non-payable order flags reconciliation", async () => {
  const db = fakeClient([
    {
      match: "INSERT INTO order_events",
      result: { rows: [{ id: 41 }], rowCount: 1 },
    },
    {
      match: "to_regclass('public.reconciliation_breaks')",
      result: { rows: [{ exists: true }], rowCount: 1 },
    },
    {
      match: "INSERT INTO reconciliation_breaks",
      result: { rows: [], rowCount: 1 },
    },
  ]);

  const { flagged } = await flagOrphanedCommercePayment(db as never, {
    orderId: "ord_1",
    intentId: "int_1",
    gatewayId: "stripe",
    actorUserId: "usr_buyer",
    orderStatus: "cancelled",
    amountGbp: 52.5,
    currency: "GBP",
  });
  assert.equal(flagged, true);

  const eventInsert = db.calls.find((c) => c.text.includes("INSERT INTO order_events"));
  assert.ok(eventInsert, "an order.payment_orphaned timeline row must be written");
  const eventSql = eventInsert!.text.replace(/\s+/g, " ");
  assert.ok(eventSql.includes("order.payment_orphaned"));
  assert.ok(eventSql.includes("DO NOTHING"), "the flag must be idempotent per intent");
  assert.equal(eventInsert!.params?.[2], "order.payment_orphaned:int_1");

  const breakInsert = db.calls.find((c) => c.text.includes("INSERT INTO reconciliation_breaks"));
  assert.ok(breakInsert, "a reconciliation break must be recorded when the store exists");
  const breakSql = breakInsert!.text.replace(/\s+/g, " ");
  assert.ok(breakSql.includes("'status_mismatch'"));
  assert.ok(breakSql.includes("'critical'"));
  assert.equal(breakInsert!.params?.[3], "ord_1");
});

test("orphan flag is idempotent — a second settle attempt reports flagged=false", async () => {
  const db = fakeClient([
    { match: "INSERT INTO order_events", result: { rows: [], rowCount: 0 } },
    {
      match: "to_regclass('public.reconciliation_breaks')",
      result: { rows: [{ exists: true }], rowCount: 1 },
    },
  ]);
  const { flagged } = await flagOrphanedCommercePayment(db as never, {
    orderId: "ord_1",
    intentId: "int_1",
    gatewayId: "stripe",
    actorUserId: "usr_buyer",
    orderStatus: "cancelled",
    amountGbp: 10,
    currency: "GBP",
  });
  assert.equal(flagged, false);
});

test("orphan flag tolerates a database without reconciliation_breaks", async () => {
  const db = fakeClient([
    {
      match: "INSERT INTO order_events",
      result: { rows: [{ id: 7 }], rowCount: 1 },
    },
    {
      match: "to_regclass('public.reconciliation_breaks')",
      result: { rows: [{ exists: false }], rowCount: 1 },
    },
  ]);
  const { flagged } = await flagOrphanedCommercePayment(db as never, {
    orderId: "ord_1",
    intentId: "int_1",
    gatewayId: "stripe",
    actorUserId: "usr_buyer",
    orderStatus: "cancelled",
    amountGbp: 10,
    currency: "GBP",
  });
  assert.equal(flagged, true);
  assert.ok(
    !db.calls.some((c) => c.text.includes("INSERT INTO reconciliation_breaks")),
    "no break insert when the table does not exist",
  );
});

// ── Migration 305: pause provenance ─────────────────────────────────────────

const migration305 = repoSrc("db/migrations/305_listing_pause_provenance.sql");
const migration305Down = repoSrc("db/migrations/305_listing_pause_provenance_down.sql");

test("migration 305 adds listings.pause_source with the provenance vocabulary", () => {
  assert.ok(migration305.includes("pause_source"));
  for (const source of ["seller", "checkout_reservation", "auction", "coown_asset"]) {
    assert.ok(migration305.includes(`'${source}'`), `pause_source must allow '${source}'`);
  }
});

test("migration 305 trigger restores ONLY reservation-owned pauses", () => {
  assert.ok(
    migration305.includes("pause_source = 'checkout_reservation'"),
    "the cancelled-order restore branch must be provenance-scoped",
  );
  // The restore must also clear provenance on the way back to 'active'.
  assert.ok(
    migration305.includes("SET status = 'active', pause_source = NULL"),
    "a reservation restore must clear pause_source",
  );
  // The 'paid' branch marks the listing sold and clears provenance.
  assert.ok(migration305.includes("SET status = 'sold', pause_source = NULL"));
});

test("migration 305 backfills provenance for in-flight pauses", () => {
  assert.ok(
    migration305.includes("SET pause_source = 'checkout_reservation'"),
    "paused listings under an active reservation backfill as reservation-owned",
  );
  assert.ok(
    migration305.includes("SET pause_source = 'seller'"),
    "unattributed paused listings conservatively backfill as seller-owned",
  );
});

test("migration 305 down migration restores the 071 trigger and drops the column", () => {
  assert.ok(migration305Down.includes("DROP COLUMN IF EXISTS pause_source"));
  assert.ok(migration305Down.includes("CREATE OR REPLACE FUNCTION reconcile_listing_checkout_from_order"));
  assert.ok(
    migration305Down.includes("WHERE id = reservation_listing_id AND status = 'paused'"),
    "the down function must reproduce the 071 restore semantics",
  );
});

// ── Source-level wiring assertions ──────────────────────────────────────────

test("every reservation-driven listing pause writes checkout_reservation provenance", () => {
  const index = repoSrc("index.ts");
  // The offer-accept pause lives in the shared transition — Smart Sell and
  // the manual route both funnel through lib/offerAcceptance.ts.
  const offerAccept = repoSrc("lib/offerAcceptance.ts");
  const liveLot = repoSrc("routes/liveLotEngine.ts");
  for (const [name, source] of [
    ["index.ts (direct checkout)", index],
    ["offerAcceptance.ts (offer accept)", offerAccept],
    ["liveLotEngine.ts (live lot)", liveLot],
  ] as const) {
    assert.ok(
      source.includes("status = 'paused', pause_source = 'checkout_reservation'"),
      `${name} must stamp pause_source='checkout_reservation' on the reservation pause`,
    );
  }
});

test("every expiry-driven order cancel routes through the shared in-flight guard", () => {
  const index = repoSrc("index.ts");
  const guardedCalls = index.split("cancelOrderOnReservationExpiry(client").length - 1;
  assert.ok(
    guardedCalls >= 3,
    `index.ts must guard all expiry cancels (sweep, POST /orders lazy reclaim, ` +
      `payment-intent create, checkout PATCH) — found ${guardedCalls}`,
  );
  const offers = repoSrc("routes/listingOffers.ts");
  const liveLot = repoSrc("routes/liveLotEngine.ts");
  for (const [name, source] of [
    ["listingOffers.ts (offer sweep)", offers],
    ["liveLotEngine.ts (lot settle lazy reclaim)", liveLot],
  ] as const) {
    assert.ok(
      source.includes("cancelOrderOnReservationExpiry(client"),
      `${name} must route its expiry cancel through the shared guard`,
    );
  }
});

test("seller-initiated pauses stamp pause_source='seller'", () => {
  const index = repoSrc("index.ts");
  assert.ok(
    index.includes(`pause_source = 'seller'`),
    "PATCH /listings must stamp seller provenance on a seller pause",
  );
  const commandService = repoSrc("lib/listingCommandService.ts");
  assert.ok(
    commandService.includes("CASE WHEN $2 = 'paused' THEN 'seller'"),
    "the listing command service must stamp seller provenance",
  );
});

test("automatic restores are scoped to their own pause source", () => {
  const index = repoSrc("index.ts");
  const offers = repoSrc("routes/listingOffers.ts");
  for (const [name, source] of [
    ["index.ts (reservation sweep drifted branch)", index],
    ["listingOffers.ts (offer sweep)", offers],
  ] as const) {
    assert.ok(
      source.includes("AND pause_source = 'checkout_reservation'")
        || source.includes("l.pause_source = 'checkout_reservation'"),
      `${name} must only restore reservation-owned pauses`,
    );
  }
  const auctionSweep = repoSrc("workers/handlers/auctionSweepHandler.ts");
  assert.ok(
    auctionSweep.includes("pause_source = 'auction'"),
    "auction restores must only touch auction-owned pauses",
  );
});

test("settlePaymentIntent flags orphaned captures and reuses the preflight 1ZE quote", () => {
  const index = repoSrc("index.ts");
  assert.ok(
    index.includes("flagOrphanedCommercePayment(client"),
    "a paid-order UPDATE that matched nothing must flag for reconciliation",
  );
  assert.ok(
    index.includes("resolvedOnezeDebitQuote: debitQuote"),
    "the oneze_internal settle call must pass the preflight quote through",
  );
  assert.ok(
    index.includes("code: 'captured_payment_orphaned'"),
    "an orphaned capture must raise the ops alert",
  );
});
