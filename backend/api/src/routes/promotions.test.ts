/**
 * Flat-fee promoted listings (migration 299) — route + serving tests.
 *
 * Registers the real `registerPromotionRoutes` against a minimal Fastify app
 * with a stateful in-memory `pg.Pool` stand-in (same pattern as
 * searchExtended.test.ts, extended to model the tables the feature touches:
 * listings, listing_promotions, promotion_charges, promotion_impressions,
 * ledger_accounts, ledger_entries). The charge path exercises
 * `chargePromotionForToday`, which checks out a client via `db.connect()` —
 * the fake pool returns itself with a no-op release.
 *
 * Covered:
 *   - POST /seller/promotions creates + charges day 1 via paired
 *     ledger_entries (seller_payable debit / platform_revenue credit,
 *     source_type 'promotion')
 *   - budget bounds (£1–£500/day), ownership, listing-status gates
 *   - idempotency-key replay returns the original promotion, no double charge
 *   - insufficient seller_payable balance → 402, nothing created
 *   - pause/resume/end transitions + invalid-transition 409s
 *   - GET stats reports real posted spend and impression counts
 *   - fetchPromotedListingsForQuery only serves charged/active placements
 *   - unservable inventory (sold / risk_pending listing, limited/suspended
 *     seller) is auto-paused with paused_reason — never billed
 *   - 'exhausted' (insufficient balance) stays distinct from auto-pause and
 *     is resumable once the balance covers the fee
 *   - the seller payable ledger account is row-locked FOR UPDATE before the
 *     balance read, serializing debits across concurrent promotions
 *   - explicit buyer filters (price/condition/size/brands/sizes/
 *     sustainableOnly) apply to sponsored units
 *   - blendPromotedIntoResults: fixed slot rate, organic order untouched,
 *     promoted+disclosure stamped (including into `data` payloads), and no
 *     sponsored tail on pages that never reach a slot boundary
 */

import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";

import { registerPromotionRoutes } from "./promotions.js";
import {
  blendPromotedIntoResults,
  chargePromotionForToday,
  fetchPromotedListingsForQuery,
  recordPromotionImpressions,
  settlePromotionLifecycle,
  type FetchPromotedOptions,
} from "../lib/promotionServing.js";

const ME = "usr_seller_1";
const OTHER = "usr_seller_2";
const TODAY = new Date().toISOString().slice(0, 10);

// ── Stateful fake DB ─────────────────────────────────────────────────────────

interface FakeState {
  listings: Map<string, { id: string; seller_id: string; status: string; title?: string; category?: string | null; brand?: string | null; price_gbp?: string; image_url?: string | null; description?: string | null; size?: string | null; condition?: string | null; original_price_gbp?: string | null; sustainability_grade?: string | null; created_at?: string }>;
  users: Map<string, { id: string; reach_state?: string }>;
  promotions: Map<string, Record<string, unknown>>;
  charges: Array<Record<string, unknown>>;
  impressions: Array<Record<string, unknown>>;
  ledgerAccounts: Map<string, number>;
  ledgerEntries: Array<{ account_id: number; direction: string; amount_gbp: number; source_type: string; source_id: string; line_type: string }>;
}

// Loosely typed on purpose — the fake pool dispatches by SQL text, so every
// call site returns a differently-shaped result that the generic signature
// of Pool#query would otherwise fight.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function empty(): any {
  return { rows: [], rowCount: 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rows(r: unknown[]): any {
  return { rows: r, rowCount: r.length };
}

function sellerPayableBalanceMinor(state: FakeState, sellerId: string): number {
  const accountId = state.ledgerAccounts.get(`user:${sellerId}:seller_payable`);
  if (!accountId) return 0;
  const total = state.ledgerEntries
    .filter((e) => e.account_id === accountId)
    .reduce((sum, e) => sum + (e.direction === "credit" ? e.amount_gbp : -e.amount_gbp), 0);
  return Math.round(total * 100);
}

function fakeDb(state: FakeState) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> => {
    calls.push({ text, params });
    // transaction control
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text.trim())) return empty();

    // ledger account upsert
    if (text.includes("INSERT INTO ledger_accounts")) {
      const [ownerType, ownerId, code] = params as [string, string, string];
      const key = `${ownerType}:${ownerId}:${code}`;
      let id = state.ledgerAccounts.get(key);
      if (!id) {
        id = state.ledgerAccounts.size + 1;
        state.ledgerAccounts.set(key, id);
      }
      return rows([{ id }]) as QueryResult<T>;
    }

    // ledger entry insert
    if (text.includes("INSERT INTO ledger_entries")) {
      const [accountId, , direction, amountGbp, , , , , , sourceId, lineType] = params as unknown[];
      state.ledgerEntries.push({
        account_id: accountId as number,
        direction: direction as string,
        amount_gbp: amountGbp as number,
        source_type: "promotion",
        source_id: sourceId as string,
        line_type: lineType as string,
      });
      return empty();
    }

    // payable account row lock — serializes debits across promotions and
    // vs payout debits before the balance is read
    if (text.includes("FROM ledger_accounts") && text.includes("FOR UPDATE")) {
      return rows([{ id: (params as number[])[0] }]) as QueryResult<T>;
    }

    // seller payable balance
    if (text.includes("seller_payable") && text.includes("ledger_entries")) {
      const sellerId = (params as string[])[0];
      return rows([
        { available_gbp: (sellerPayableBalanceMinor(state, sellerId) / 100).toFixed(2) },
      ]) as QueryResult<T>;
    }

    // listings lookup (route ownership check)
    if (text.includes("FROM listings") && text.includes("WHERE id = $1") && !text.includes("JOIN")) {
      const listing = state.listings.get((params as string[])[0]);
      return (listing ? rows([listing]) : empty()) as QueryResult<T>;
    }

    // serveability re-check inside the charge transaction
    // (listings ⨝ seller reach_state)
    if (text.includes("FROM listings l") && text.includes("users u")) {
      const [listingId, sellerId] = params as string[];
      const listing = state.listings.get(listingId);
      if (!listing) return empty();
      return rows([{
        listing_status: listing.status,
        reach_state: state.users.get(sellerId)?.reach_state ?? "normal",
      }]) as QueryResult<T>;
    }

    // promotion idempotency lookup
    if (text.includes("idempotency_key = $2")) {
      const [sellerId, key] = params as string[];
      const found = [...state.promotions.values()].find(
        (p) => p.seller_id === sellerId && p.idempotency_key === key,
      );
      return (found ? rows([found]) : empty()) as QueryResult<T>;
    }

    // promotion insert
    if (text.includes("INSERT INTO listing_promotions")) {
      const [id, listingId, sellerId, budgetMinor, startsAt, endsAt, idemKey] =
        params as [string, string, string, number, string, string, string | null];
      // enforce the "one active promotion per listing" partial unique index
      const clash = [...state.promotions.values()].find(
        (p) => p.listing_id === listingId && p.status === "active",
      );
      if (clash) {
        const err = new Error("duplicate") as Error & { code?: string; constraint?: string };
        err.code = "23505";
        err.constraint = "listing_promotions_active_listing_idx";
        throw err;
      }
      const row = {
        id, listing_id: listingId, seller_id: sellerId,
        daily_budget_minor: budgetMinor, daily_spend_minor: 0,
        spend_day: null, status: "active", paused_reason: null,
        starts_at: startsAt, ends_at: endsAt,
        created_at: startsAt, idempotency_key: idemKey,
      };
      state.promotions.set(id, row);
      return rows([row]) as QueryResult<T>;
    }

    // promotion select by id (with or without FOR UPDATE)
    if (text.includes("FROM listing_promotions") && text.includes("WHERE id = $1")) {
      const row = state.promotions.get((params as string[])[0]);
      return (row ? rows([row]) : empty()) as QueryResult<T>;
    }

    // promotion list for seller (GET /seller/promotions)
    if (text.includes("FROM listing_promotions p") && text.includes("WHERE p.seller_id = $1")) {
      const sellerId = (params as string[])[0];
      const out = [...state.promotions.values()]
        .filter((p) => p.seller_id === sellerId)
        .map((p) => ({
          ...p,
          listing_title: state.listings.get(p.listing_id as string)?.title ?? null,
          listing_image_url: state.listings.get(p.listing_id as string)?.image_url ?? null,
          total_spend_minor: String(
            state.charges
              .filter((c) => c.promotion_id === p.id && c.status === "charged")
              .reduce((s, c) => s + (c.amount_minor as number), 0),
          ),
        }));
      return rows(out) as QueryResult<T>;
    }

    // lazy lifecycle: end expired
    if (text.includes("SET status = 'ended'") && text.includes("ends_at <= NOW()")) {
      const now = Date.now();
      for (const p of state.promotions.values()) {
        if (p.status === "active" && new Date(p.ends_at as string).getTime() <= now) {
          p.status = "ended";
        }
      }
      return empty();
    }

    // lazy lifecycle: promotions due a daily charge
    if (text.includes("spend_day IS NULL OR spend_day < CURRENT_DATE")) {
      const due = [...state.promotions.values()]
        .filter((p) => p.status === "active" && p.spend_day !== TODAY)
        .map((p) => ({ id: p.id }));
      return rows(due) as QueryResult<T>;
    }

    // charge claim
    if (text.includes("INSERT INTO promotion_charges")) {
      const [id, promotionId, sellerId, amountMinor] = params as [string, string, string, number];
      const existing = state.charges.find(
        (c) => c.promotion_id === promotionId && c.charge_day === TODAY,
      );
      if (existing) return empty();
      state.charges.push({
        id, promotion_id: promotionId, seller_id: sellerId,
        charge_day: TODAY, amount_minor: amountMinor,
        status: "charged", ledger_source_id: null,
      });
      return rows([{ id }]) as QueryResult<T>;
    }

    if (text.includes("UPDATE promotion_charges SET status = 'insufficient_balance'")) {
      const c = state.charges.find((x) => x.id === (params as string[])[0]);
      if (c) c.status = "insufficient_balance";
      return empty();
    }

    if (text.includes("UPDATE promotion_charges SET ledger_source_id")) {
      const c = state.charges.find((x) => x.id === (params as string[])[0]);
      if (c) c.ledger_source_id = (params as string[])[1];
      return empty();
    }

    // promotion status/spend/pause-reason updates (RETURNING * or bare)
    if (text.includes("UPDATE listing_promotions")) {
      const row = state.promotions.get((params as string[] | undefined)?.[0] ?? "");
      if (row) {
        if (text.includes("status = 'exhausted'")) row.status = "exhausted";
        else if (text.includes("status = 'ended'")) row.status = "ended";
        else if (text.includes("status = 'paused'")) row.status = "paused";
        else if (text.includes("status = 'active'")) row.status = "active";
        if (text.includes("paused_reason = $2")) {
          row.paused_reason = (params as unknown[] | undefined)?.[1] ?? null;
        }
        if (text.includes("paused_reason = NULL")) row.paused_reason = null;
        if (text.includes("spend_day = CURRENT_DATE")) {
          row.spend_day = TODAY;
          row.daily_spend_minor = (params as unknown[])[1];
        }
      }
      return (text.includes("RETURNING") && row ? rows([row]) : empty()) as QueryResult<T>;
    }

    // serving query (join promotions to listings + seller reach check),
    // honouring every explicit-filter clause the text carries
    if (text.includes("FROM listing_promotions p") && text.includes("JOIN listings l")) {
      const paramAt = (re: RegExp): unknown => {
        const m = text.match(re);
        return m ? (params as unknown[] | undefined)?.[Number(m[1]) - 1] : undefined;
      };
      // viewerId is the first bound param when the self-exclusion clause is present.
      const viewerId = text.includes("p.seller_id <>")
        ? ((params as string[] | undefined)?.[0] ?? null)
        : null;
      const category = paramAt(/l\.category = \$(\d+)/) as string | undefined;
      const condition = paramAt(/l\.condition = \$(\d+)/) as string | undefined;
      const sizeEq = paramAt(/l\.size = \$(\d+)/) as string | undefined;
      const sizeAny = paramAt(/l\.size = ANY\(\$(\d+)\)/) as string[] | undefined;
      const brandAny = paramAt(/l\.brand = ANY\(\$(\d+)\)/) as string[] | undefined;
      const priceMin = paramAt(/l\.price_gbp >= \$(\d+)/) as number | undefined;
      const priceMax = paramAt(/l\.price_gbp <= \$(\d+)/) as number | undefined;
      const sustainableOnly = text.includes("sustainability_grade IN ('A', 'B')");
      const out = [...state.promotions.values()]
        .filter((p) => {
          if (p.status !== "active" || p.spend_day !== TODAY) return false;
          if ((p.daily_spend_minor as number) <= 0) return false;
          if (new Date(p.ends_at as string).getTime() <= Date.now()) return false;
          const l = state.listings.get(p.listing_id as string);
          if (!l || l.status !== "active") return false;
          if ((state.users.get(p.seller_id as string)?.reach_state ?? "normal") !== "normal") {
            return false;
          }
          if (viewerId && p.seller_id === viewerId) return false;
          if (category !== undefined && l.category !== category) return false;
          if (condition !== undefined && l.condition !== condition) return false;
          if (sizeEq !== undefined && l.size !== sizeEq) return false;
          if (sizeAny !== undefined && !(l.size && sizeAny.includes(l.size))) return false;
          if (brandAny !== undefined && !(l.brand && brandAny.includes(l.brand))) return false;
          if (priceMin !== undefined && Number(l.price_gbp) < priceMin) return false;
          if (priceMax !== undefined && Number(l.price_gbp) > priceMax) return false;
          if (
            sustainableOnly &&
            !(l.sustainability_grade === "A" || l.sustainability_grade === "B")
          ) {
            return false;
          }
          return true;
        })
        .map((p) => ({
          promotion_id: p.id,
          ...(state.listings.get(p.listing_id as string) as Record<string, unknown>),
        }));
      return rows(out) as QueryResult<T>;
    }

    // click insert — POST /promotions/:id/click. Two shapes: authed inserts
    // via SELECT…WHERE NOT EXISTS (dedupe on promotion+viewer+click); the
    // anonymous VALUES shape has viewer_id NULL. promotion_id=$1,
    // listing_id=$2, viewer_id=$3-or-absent in both.
    if (text.includes("INSERT INTO promotion_impressions") && text.includes("'click'")) {
      const [promotionId, listingId, viewerId] = params as Array<string | null>;
      const deduped =
        text.includes("WHERE NOT EXISTS") &&
        viewerId != null &&
        state.impressions.some(
          (i) =>
            i.promotion_id === promotionId &&
            i.viewer_id === viewerId &&
            i.event_type === "click",
        );
      if (!deduped) {
        state.impressions.push({
          promotion_id: promotionId,
          listing_id: listingId,
          viewer_id: viewerId ?? null,
          event_type: "click",
          surface: "tap_through",
        });
      }
      return empty();
    }

    // impressions insert (multi-row VALUES)
    if (text.includes("INSERT INTO promotion_impressions")) {
      const p = params as Array<string | null>;
      for (let i = 0; i < p.length; i += 4) {
        state.impressions.push({
          promotion_id: p[i], listing_id: p[i + 1],
          viewer_id: p[i + 2], event_type: "impression", surface: p[i + 3],
        });
      }
      return empty();
    }

    // stats: impressions/clicks aggregate
    if (text.includes("FROM promotion_impressions")) {
      const promoId = (params as string[])[0];
      const evts = state.impressions.filter((i) => i.promotion_id === promoId);
      return rows([{
        impressions: String(evts.filter((e) => e.event_type === "impression").length),
        clicks: String(evts.filter((e) => e.event_type === "click").length),
      }]) as QueryResult<T>;
    }

    // stats: charges aggregate
    if (text.includes("FROM promotion_charges") && text.includes("SUM(amount_minor)")) {
      const promoId = (params as string[])[0];
      const charged = state.charges.filter(
        (c) => c.promotion_id === promoId && c.status === "charged",
      );
      return rows([{
        total_spend_minor: String(charged.reduce((s, c) => s + (c.amount_minor as number), 0)),
        charged_days: String(charged.length),
        last_charge_day: charged.length > 0 ? TODAY : null,
      }]) as QueryResult<T>;
    }

    return empty();
  };

  return {
    calls,
    query,
    connect: async () => ({ query, release: () => {} }),
  };
}

async function buildApp(
  state: FakeState,
  db: ReturnType<typeof fakeDb> = fakeDb(state),
) {
  const app = Fastify();
  // Mirror the production preHandler contract: unauthenticated → the route's
  // own 401 branch; authenticated → request.authUser is populated.
  app.addHook("preHandler", async (request) => {
    request.authUser = { userId: ME, role: "user", sessionId: "s1" } as never;
  });
  registerPromotionRoutes({ app, db: db as unknown as Pool });
  await app.ready();
  return app;
}

function seedState(overrides: Partial<FakeState> = {}): FakeState {
  const listings = new Map<string, FakeState["listings"] extends Map<string, infer V> ? V : never>();
  listings.set("lst_mine", {
    id: "lst_mine", seller_id: ME, status: "active",
    title: "Vintage denim jacket", category: "Outerwear", brand: "Levi's",
    price_gbp: "45.00", image_url: "https://cdn.example.com/lst.jpg",
    description: "desc", size: null, condition: "good",
    original_price_gbp: null, created_at: "2026-02-01T00:00:00.000Z",
  });
  listings.set("lst_theirs", {
    id: "lst_theirs", seller_id: OTHER, status: "active",
    title: "Seller two jacket", category: "Outerwear", brand: null,
  });
  listings.set("lst_sold", { id: "lst_sold", seller_id: ME, status: "sold" });
  return {
    listings,
    users: new Map(),
    promotions: new Map(),
    charges: [],
    impressions: [],
    ledgerAccounts: new Map(),
    ledgerEntries: [],
    ...overrides,
  };
}

/** Give a seller a spendable balance by crediting seller_payable directly. */
function creditSeller(state: FakeState, sellerId: string, gbp: number) {
  let id = state.ledgerAccounts.get(`user:${sellerId}:seller_payable`);
  if (!id) {
    id = state.ledgerAccounts.size + 1;
    state.ledgerAccounts.set(`user:${sellerId}:seller_payable`, id);
  }
  state.ledgerEntries.push({
    account_id: id, direction: "credit", amount_gbp: gbp,
    source_type: "order_payment", source_id: "seed", line_type: "seller_payable_release",
  });
}

// ── Create ───────────────────────────────────────────────────────────────────

test("POST /seller/promotions creates an active promotion and posts the day-1 ledger charge", async () => {
  const state = seedState();
  creditSeller(state, ME, 50);
  const app = await buildApp(state);

  const res = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 500, durationDays: 7 },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json() as {
    ok: boolean;
    promotion: { id: string; status: string; dailyBudgetMinor: number; chargedTodayMinor: number };
    charge: { outcome: string; amountMinor: number };
  };
  assert.equal(body.ok, true);
  assert.equal(body.promotion.status, "active");
  assert.equal(body.promotion.dailyBudgetMinor, 500);
  assert.equal(body.promotion.chargedTodayMinor, 500);
  assert.equal(body.charge.outcome, "charged");

  // Ledger truth: seller debited, platform credited, source_type 'promotion'.
  const sellerAccount = state.ledgerAccounts.get(`user:${ME}:seller_payable`)!;
  const platformAccount = state.ledgerAccounts.get("platform:platform:platform_revenue")!;
  const debit = state.ledgerEntries.find(
    (e) => e.account_id === sellerAccount && e.direction === "debit",
  );
  const credit = state.ledgerEntries.find(
    (e) => e.account_id === platformAccount && e.direction === "credit",
  );
  assert.equal(debit?.amount_gbp, 5);
  assert.equal(credit?.amount_gbp, 5);
  assert.equal(debit?.source_type, "promotion");
  assert.equal(debit?.line_type, "promotion_daily_fee");

  // Spendable balance dropped by exactly the daily fee.
  assert.equal(sellerPayableBalanceMinor(state, ME), 4500);
});

test("POST /seller/promotions enforces the £1–£500/day bounds", async () => {
  const state = seedState();
  creditSeller(state, ME, 1000);
  const app = await buildApp(state);

  for (const bad of [99, 50_001]) {
    const res = await app.inject({
      method: "POST",
      url: "/seller/promotions",
      payload: { listingId: "lst_mine", dailyBudgetMinor: bad, durationDays: 7 },
    });
    assert.equal(res.statusCode, 400, `budget ${bad} should be rejected`);
  }
  assert.equal(state.promotions.size, 0);
});

test("POST /seller/promotions rejects other sellers' listings and non-active listings", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  const notMine = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_theirs", dailyBudgetMinor: 200, durationDays: 7 },
  });
  assert.equal(notMine.statusCode, 403);

  const notActive = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_sold", dailyBudgetMinor: 200, durationDays: 7 },
  });
  assert.equal(notActive.statusCode, 409);
  assert.equal(state.promotions.size, 0);
});

test("POST /seller/promotions is idempotent on the client replay key", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  const payload = {
    listingId: "lst_mine",
    dailyBudgetMinor: 300,
    durationDays: 14,
    idempotencyKey: "client-req-abc123",
  };
  const first = await app.inject({ method: "POST", url: "/seller/promotions", payload });
  const second = await app.inject({ method: "POST", url: "/seller/promotions", payload });

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200);
  const a = first.json() as { promotion: { id: string } };
  const b = second.json() as { promotion: { id: string }; replayed: boolean };
  assert.equal(a.promotion.id, b.promotion.id);
  assert.equal(b.replayed, true);
  assert.equal(state.promotions.size, 1);
  assert.equal(state.charges.length, 1, "replay must not double-charge");
});

test("POST /seller/promotions returns 402 when the payable balance cannot cover the fee", async () => {
  const state = seedState(); // no balance credited
  const app = await buildApp(state);

  const res = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });
  assert.equal(res.statusCode, 402);
  const body = res.json() as { code: string; availableMinor: number; requiredMinor: number };
  assert.equal(body.code, "INSUFFICIENT_BALANCE");
  assert.equal(body.availableMinor, 0);
  assert.equal(body.requiredMinor, 200);
  assert.equal(state.promotions.size, 0);
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

test("pause / resume / end transitions are enforced and resume re-bills honestly", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  const created = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });
  const id = (created.json() as { promotion: { id: string } }).promotion.id;

  const paused = await app.inject({ method: "POST", url: `/seller/promotions/${id}/pause` });
  assert.equal(paused.statusCode, 200);
  assert.equal((paused.json() as { promotion: { status: string } }).promotion.status, "paused");

  // Same-day resume does not charge twice (charge row already claimed today).
  const resumed = await app.inject({ method: "POST", url: `/seller/promotions/${id}/resume` });
  assert.equal(resumed.statusCode, 200);
  const resumedBody = resumed.json() as { promotion: { status: string }; charge: { outcome: string } };
  assert.equal(resumedBody.promotion.status, "active");
  assert.equal(resumedBody.charge.outcome, "already_charged");
  assert.equal(state.charges.length, 1);

  const ended = await app.inject({ method: "POST", url: `/seller/promotions/${id}/end` });
  assert.equal((ended.json() as { promotion: { status: string } }).promotion.status, "ended");

  const resumeAfterEnd = await app.inject({ method: "POST", url: `/seller/promotions/${id}/resume` });
  assert.equal(resumeAfterEnd.statusCode, 409);
});

test("a second active promotion for the same listing is rejected", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });
  const dupe = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 300, durationDays: 7 },
  });
  assert.equal(dupe.statusCode, 409);
  assert.equal((dupe.json() as { code: string }).code, "PROMOTION_ALREADY_ACTIVE");
});

// ── Stats ────────────────────────────────────────────────────────────────────

test("GET /seller/promotions/:id/stats reports real posted spend and impressions", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  const created = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 400, durationDays: 7 },
  });
  const id = (created.json() as { promotion: { id: string } }).promotion.id;

  const res = await app.inject({ method: "GET", url: `/seller/promotions/${id}/stats` });
  assert.equal(res.statusCode, 200);
  const stats = (res.json() as { stats: Record<string, unknown> }).stats;
  assert.equal(stats.totalSpendMinor, 400);
  assert.equal(stats.chargedDays, 1);
  assert.equal(stats.chargedTodayMinor, 400);
  assert.equal(stats.impressions, 0);
  assert.equal(stats.clicks, 0);
});

// ── Serving + blending ───────────────────────────────────────────────────────

test("fetchPromotedListingsForQuery serves only charged, active placements and records impressions", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  const created = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });
  const promotionId = (created.json() as { promotion: { id: string } }).promotion.id;
  await app.close();

  const db = fakeDb(state) as unknown as Pool;

  // A third-party viewer sees the charged placement…
  const forViewer = await fetchPromotedListingsForQuery(db, { viewerId: OTHER, limit: 4 });
  assert.equal(forViewer.length, 1);
  assert.equal(forViewer[0].listing.id, "lst_mine");
  assert.equal(forViewer[0].promotionId, promotionId);

  // …the seller never sees their own ad.
  const forSeller = await fetchPromotedListingsForQuery(db, { viewerId: ME, limit: 4 });
  assert.equal(forSeller.length, 0);

  // Impression facts land for stats reporting.
  await recordPromotionImpressions(
    db,
    forViewer.map((p) => ({ promotionId: p.promotionId, listingId: p.listing.id })),
    OTHER,
    "feed_home",
  );
  assert.equal(state.impressions.length, 1);
  assert.equal(state.impressions[0].surface, "feed_home");

  // Pause → stops serving immediately.
  state.promotions.get(promotionId)!.status = "paused";
  const afterPause = await fetchPromotedListingsForQuery(db, { viewerId: OTHER, limit: 4 });
  assert.equal(afterPause.length, 0);
});

test("blendPromotedIntoResults interleaves at the slot rate and never reorders organic items", () => {
  const organic = Array.from({ length: 14 }, (_, i) => ({ id: `o${i + 1}` }));
  const promoted = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];

  const blended = blendPromotedIntoResults(organic, promoted, 6);

  // Organic order is preserved exactly (promoted items filtered out).
  const organicOut = blended.filter((i) => !(i as { promoted?: boolean }).promoted);
  assert.deepEqual(organicOut.map((i) => i.id), organic.map((i) => i.id));

  // One promoted slot after every 6 organic items: positions 6, 13, 20…
  const promotedIndexes = blended
    .map((i, idx) => ((i as { promoted?: boolean }).promoted ? idx : -1))
    .filter((idx) => idx >= 0);
  assert.deepEqual(promotedIndexes, [6, 13, blended.length - 1]);
  assert.equal(blended.length, organic.length + promoted.length);

  // Every promoted unit is stamped with server disclosure — and the stamp
  // reaches into envelope `data` payloads too.
  for (const idx of promotedIndexes) {
    const unit = blended[idx] as unknown as { promoted: boolean; disclosure: string };
    assert.equal(unit.promoted, true);
    assert.equal(unit.disclosure, "Sponsored");
  }

  const envelope = blendPromotedIntoResults(
    [{ id: "o1", data: { title: "a" } }],
    [{ id: "p1", data: { title: "b" } }],
    1,
  );
  assert.equal(
    (envelope[1] as unknown as { data: { promoted: boolean } }).data.promoted,
    true,
  );
});

test("blendPromotedIntoResults never pads a short or empty organic page with ads", () => {
  const isPromoted = (i: unknown) => (i as { promoted?: boolean }).promoted === true;

  // Zero-organic page → unchanged; it must never come back all-ads.
  assert.deepEqual(blendPromotedIntoResults([], [{ id: "p1" }, { id: "p2" }], 6), []);

  // Fewer organics than the slot rate → no slot boundary was reached, so no
  // sponsored tail is appended.
  const five = Array.from({ length: 5 }, (_, i) => ({ id: `o${i + 1}` }));
  const short = blendPromotedIntoResults(five, [{ id: "p1" }, { id: "p2" }], 6);
  assert.deepEqual(short.map((i) => i.id), five.map((i) => i.id));
  assert.equal(short.filter(isPromoted).length, 0);

  // Once a boundary is reached the slot fires and leftover units still trail.
  const seven = Array.from({ length: 7 }, (_, i) => ({ id: `o${i + 1}` }));
  const blended = blendPromotedIntoResults(seven, [{ id: "p1" }, { id: "p2" }], 6);
  assert.equal(blended.filter(isPromoted).length, 2);
  assert.equal(blended.length, 9);
});

// ── Unservable inventory: auto-pause, never billed ──────────────────────────

test("a promotion whose listing sold is auto-paused and never billed again", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  const created = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });
  const id = (created.json() as { promotion: { id: string } }).promotion.id;
  await app.close();

  // The listing sells mid-campaign; the next daily settle must not bill it.
  state.listings.get("lst_mine")!.status = "sold";
  state.promotions.get(id)!.spend_day = "2000-01-01";

  const db = fakeDb(state);
  await settlePromotionLifecycle(db as unknown as Pool);

  const promo = state.promotions.get(id)!;
  assert.equal(promo.status, "paused");
  assert.equal(promo.paused_reason, "listing_unservable");
  assert.equal(state.charges.length, 1, "no charge row claimed for an unservable day");
  assert.equal(sellerPayableBalanceMinor(state, ME), 9800, "balance untouched");

  // …and it cannot serve either (serving requires status='active').
  const served = await fetchPromotedListingsForQuery(db as unknown as Pool, {
    viewerId: OTHER,
    limit: 4,
  });
  assert.equal(served.length, 0);
});

test("a sold or risk_pending listing is auto-paused without billing", async () => {
  const state = seedState();
  state.listings.set("lst_mine2", {
    id: "lst_mine2", seller_id: ME, status: "active", title: "Second jacket",
  });
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  const created1 = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });
  const created2 = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine2", dailyBudgetMinor: 200, durationDays: 7 },
  });
  const id1 = (created1.json() as { promotion: { id: string } }).promotion.id;
  const id2 = (created2.json() as { promotion: { id: string } }).promotion.id;
  await app.close();

  // lst_mine: sold through checkout → status flips to 'sold' (the listings
  // lifecycle uses status, there is no sold_at column). lst_mine2: held.
  state.listings.get("lst_mine")!.status = "sold";
  state.listings.get("lst_mine2")!.status = "risk_pending";
  state.promotions.get(id1)!.spend_day = "2000-01-01";
  state.promotions.get(id2)!.spend_day = "2000-01-01";

  const db = fakeDb(state);
  await settlePromotionLifecycle(db as unknown as Pool);

  assert.equal(state.promotions.get(id1)!.status, "paused");
  assert.equal(state.promotions.get(id1)!.paused_reason, "listing_unservable");
  assert.equal(state.promotions.get(id2)!.status, "paused");
  assert.equal(state.promotions.get(id2)!.paused_reason, "listing_unservable");
  assert.equal(state.charges.length, 2, "only the two day-1 charges exist");
  assert.equal(sellerPayableBalanceMinor(state, ME), 9600);
});

test("a limited or suspended seller's promotion is auto-paused without billing", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  const created = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });
  const id = (created.json() as { promotion: { id: string } }).promotion.id;
  await app.close();
  const db = fakeDb(state);

  for (const reach of ["limited", "suspended"]) {
    state.users.set(ME, { id: ME, reach_state: reach });
    // Re-arm the promotion as if it were still active and due a charge.
    state.promotions.get(id)!.status = "active";
    state.promotions.get(id)!.paused_reason = null;
    state.promotions.get(id)!.spend_day = "2000-01-01";

    await settlePromotionLifecycle(db as unknown as Pool);

    assert.equal(state.promotions.get(id)!.status, "paused", `reach ${reach}`);
    assert.equal(state.promotions.get(id)!.paused_reason, "seller_restricted");
  }
  assert.equal(state.charges.length, 1, "only the day-1 charge exists");
  assert.equal(sellerPayableBalanceMinor(state, ME), 9800);
});

test("insufficient balance still flips to 'exhausted', distinct from auto-pause", async () => {
  const state = seedState();
  creditSeller(state, ME, 5); // exactly one £5 day
  const app = await buildApp(state);

  const created = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 500, durationDays: 7 },
  });
  const id = (created.json() as { promotion: { id: string } }).promotion.id;
  await app.close();
  assert.equal(sellerPayableBalanceMinor(state, ME), 0);

  // Simulate a later UTC day: the day-1 claim row is retired (the fake
  // models charge_day as the current day) and spend_day is moved back.
  state.charges = state.charges.filter((c) => c.promotion_id !== id);
  state.promotions.get(id)!.spend_day = "2000-01-01";
  const db = fakeDb(state);
  await settlePromotionLifecycle(db as unknown as Pool);

  const promo = state.promotions.get(id)!;
  assert.equal(promo.status, "exhausted");
  assert.equal(promo.paused_reason, null, "exhausted is not a pause");
  const failedCharge = state.charges.find(
    (c) => c.promotion_id === id && c.status === "insufficient_balance",
  );
  assert.ok(failedCharge, "the day is claimed as insufficient_balance");
});

test("an exhausted promotion resumes once the balance covers the fee (402 without)", async () => {
  const state = seedState();
  creditSeller(state, ME, 5);
  const app = await buildApp(state);

  const created = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 500, durationDays: 7 },
  });
  const id = (created.json() as { promotion: { id: string } }).promotion.id;

  // Drain → settle a later day → exhausted (the day-1 claim row is retired
  // so today's claim is attempted — the fake models charge_day as today).
  state.charges = state.charges.filter((c) => c.promotion_id !== id);
  state.promotions.get(id)!.spend_day = "2000-01-01";
  await settlePromotionLifecycle(fakeDb(state) as unknown as Pool);
  assert.equal(state.promotions.get(id)!.status, "exhausted");

  // Resume with no funds → 402, promotion stays exhausted.
  const broke = await app.inject({ method: "POST", url: `/seller/promotions/${id}/resume` });
  assert.equal(broke.statusCode, 402);
  assert.equal((broke.json() as { code: string }).code, "INSUFFICIENT_BALANCE");
  assert.equal(state.promotions.get(id)!.status, "exhausted");

  // Fund the wallet → resume succeeds and the promotion is active again.
  creditSeller(state, ME, 10);
  const resumed = await app.inject({ method: "POST", url: `/seller/promotions/${id}/resume` });
  assert.equal(resumed.statusCode, 200);
  const body = resumed.json() as { promotion: { status: string; pausedReason: string | null } };
  assert.equal(body.promotion.status, "active");
  assert.equal(body.promotion.pausedReason, null);
});

test("resuming a promotion whose listing went unservable re-pauses with 409", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  const created = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });
  const id = (created.json() as { promotion: { id: string } }).promotion.id;

  await app.inject({ method: "POST", url: `/seller/promotions/${id}/pause` });
  state.listings.get("lst_mine")!.status = "sold";

  const resumed = await app.inject({ method: "POST", url: `/seller/promotions/${id}/resume` });
  assert.equal(resumed.statusCode, 409);
  const body = resumed.json() as {
    code: string;
    promotion: { status: string; pausedReason: string | null };
  };
  assert.equal(body.code, "LISTING_UNSERVABLE");
  assert.equal(body.promotion.status, "paused");
  assert.equal(body.promotion.pausedReason, "listing_unservable");
});

// ── Cross-promotion balance serialization ───────────────────────────────────

test("the payable account is row-locked FOR UPDATE before the balance read", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const db = fakeDb(state);
  const app = await buildApp(state, db);

  await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });

  const texts = db.calls.map((c) => c.text);
  const lockIdx = texts.findIndex(
    (t) => t.includes("FROM ledger_accounts") && t.includes("FOR UPDATE"),
  );
  // The create route also reads the balance (pre-insert check), so assert a
  // balance read happens AFTER the lock inside the charge transaction.
  const balanceAfterLock = texts.findIndex(
    (t, i) =>
      i > lockIdx &&
      t.includes("ledger_entries") &&
      t.includes("seller_payable") &&
      t.includes("SUM("),
  );
  assert.ok(lockIdx >= 0, "charge must lock the seller_payable account row");
  assert.ok(balanceAfterLock > lockIdx, "balance read must follow the account lock");
});

test("two promotions of one seller can never overdraw the payable balance", async () => {
  const state = seedState();
  state.listings.set("lst_mine2", {
    id: "lst_mine2", seller_id: ME, status: "active", title: "Second jacket",
  });
  creditSeller(state, ME, 10);
  const app = await buildApp(state);

  const c1 = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 500, durationDays: 7 },
  });
  const c2 = await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine2", dailyBudgetMinor: 500, durationDays: 7 },
  });
  const id1 = (c1.json() as { promotion: { id: string } }).promotion.id;
  const id2 = (c2.json() as { promotion: { id: string } }).promotion.id;
  await app.close();
  assert.equal(sellerPayableBalanceMinor(state, ME), 0);

  // Both come due on the same later day with funds for exactly one fee
  // (day-1 claim rows are retired — the fake models charge_day as today).
  state.charges = state.charges.filter(
    (c) => c.promotion_id !== id1 && c.promotion_id !== id2,
  );
  state.promotions.get(id1)!.spend_day = "2000-01-01";
  state.promotions.get(id2)!.spend_day = "2000-01-01";
  creditSeller(state, ME, 5);

  const db = fakeDb(state) as unknown as Pool;
  const first = await chargePromotionForToday(db, id1);
  const second = await chargePromotionForToday(db, id2);

  assert.equal(first, "charged");
  assert.equal(second, "insufficient_balance");
  assert.equal(state.promotions.get(id2)!.status, "exhausted");
  assert.equal(
    sellerPayableBalanceMinor(state, ME),
    0,
    "the account is never driven negative",
  );
});

// ── Explicit buyer filters apply to sponsored units ─────────────────────────

test("fetchPromotedListingsForQuery honours the buyer's explicit filter set", async () => {
  const state = seedState();
  creditSeller(state, ME, 100);
  const app = await buildApp(state);

  // lst_mine: £45.00, brand Levi's, condition 'good', size null, no grade.
  await app.inject({
    method: "POST",
    url: "/seller/promotions",
    payload: { listingId: "lst_mine", dailyBudgetMinor: 200, durationDays: 7 },
  });
  await app.close();
  const db = fakeDb(state) as unknown as Pool & ReturnType<typeof fakeDb>;

  const fetch = (filters: FetchPromotedOptions["filters"]) =>
    fetchPromotedListingsForQuery(db, { viewerId: OTHER, limit: 4, filters });

  assert.equal((await fetch(undefined)).length, 1, "unfiltered context serves the placement");

  assert.equal((await fetch({ priceMax: 10 })).length, 0, "priceMax excludes the £45 unit");
  assert.equal((await fetch({ priceMin: 10, priceMax: 100 })).length, 1);
  assert.equal((await fetch({ condition: "new" })).length, 0);
  assert.equal((await fetch({ condition: "good" })).length, 1);
  assert.equal((await fetch({ brands: ["Nike"] })).length, 0);
  assert.equal((await fetch({ brands: ["Levi's", "Nike"] })).length, 1);
  assert.equal((await fetch({ sizes: ["M"] })).length, 0, "listing has no size");
  assert.equal((await fetch({ size: "M" })).length, 0);
  assert.equal((await fetch({ sustainableOnly: true })).length, 0, "no sustainability grade");

  state.listings.get("lst_mine")!.sustainability_grade = "A";
  assert.equal((await fetch({ sustainableOnly: true })).length, 1);

  // The serving SQL itself carries the clauses (params, not literals).
  const withPriceBound = db.calls.find(
    (c) => c.text.includes("FROM listing_promotions p") && c.text.includes("l.price_gbp <="),
  );
  assert.ok(withPriceBound, "serving query should carry the price bound");
  assert.ok(
    db.calls.some(
      (c) => c.text.includes("FROM listing_promotions p") && /l\.brand = ANY\(\$\d+\)/.test(c.text),
    ),
    "serving query should carry the brands[] clause",
  );
});


// ── Click recording ──────────────────────────────────────────────────────────
// The Sponsored-unit tap path: POST /promotions/:id/click writes a 'click'
// event the stats aggregate already counts, and dedupes per viewer so a
// double-tap can't inflate the metric.

test("POST /promotions/:id/click records a click, deduped per viewer", async () => {
  const state = seedState();
  state.promotions.set("pr_1", {
    id: "pr_1", listing_id: "lst_mine", seller_id: OTHER,
    daily_budget_minor: 500, daily_spend_minor: 0,
    spend_day: TODAY, status: "active", paused_reason: null,
    starts_at: TODAY, ends_at: "2999-01-01",
    created_at: TODAY, idempotency_key: "k1",
  });
  const app = await buildApp(state);

  const res = await app.inject({ method: "POST", url: "/promotions/pr_1/click" });
  assert.equal(res.statusCode, 200);
  const clicks = state.impressions.filter(
    (i) => i.event_type === "click" && i.promotion_id === "pr_1",
  );
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0]!.viewer_id, ME);
  assert.equal(clicks[0]!.listing_id, "lst_mine");

  // Same viewer again → deduped.
  const res2 = await app.inject({ method: "POST", url: "/promotions/pr_1/click" });
  assert.equal(res2.statusCode, 200);
  assert.equal(
    state.impressions.filter((i) => i.event_type === "click" && i.promotion_id === "pr_1").length,
    1,
    "repeat click from the same viewer must not inflate the stat",
  );
});

test("POST /promotions/:id/click 404s on an unknown promotion", async () => {
  const app = await buildApp(seedState());
  const res = await app.inject({ method: "POST", url: "/promotions/pr_nope/click" });
  assert.equal(res.statusCode, 404);
});
