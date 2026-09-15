/**
 * Seller fulfilment routes — POST /orders/:orderId/shipping-label and
 * POST /orders/:orderId/fulfilment/handoff-assertion.
 *
 * Registered against a minimal Fastify app with a stateful in-memory
 * `pg.Pool` stand-in (same pattern as promotions.test.ts). `createShipment`
 * and `emitOrderCommerceCard` are injected so the tests never touch the
 * network or the realtime bus.
 *
 * Covered:
 *   - shipping-label: auth/ownership gates, 404, paid-status gate,
 *     happy-path label provisioning with persisted artifacts, idempotent
 *     replay of an existing label, honest provider error codes
 *   - handoff-assertion: auth/ownership gates, paid-only gate, idempotent
 *     order_parcel_events insert, and proof it never mutates orders.status
 */

import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";

import { registerOrderFulfilmentRoutes } from "./orderFulfilment.js";

const SELLER = "usr_seller_1";
const BUYER = "usr_buyer_1";
const OTHER = "usr_other_1";

interface FakeOrder {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string | null;
  status: string;
  address_id: number | null;
  postage_fee_gbp: string | null;
  shipping_carrier_id: string | null;
  shipping_provider: string | null;
  tracking_number: string | null;
  shipping_label_url: string | null;
  shipping_quote_gbp: string | null;
  shipping_metadata?: Record<string, unknown>;
}

interface FakeState {
  orders: Map<string, FakeOrder>;
  addresses: Map<number, { id: number; user_id: string; postcode: string }>;
  parcelEvents: Array<Record<string, unknown>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function empty(): any {
  return { rows: [], rowCount: 0 };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rows(r: unknown[]): any {
  return { rows: r, rowCount: r.length };
}

function fakeDb(state: FakeState) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> => {
    calls.push({ text, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text.trim())) return empty();

    // table availability probes
    if (text.includes("to_regclass")) {
      return rows([{ ready: true }]) as QueryResult<T>;
    }

    // order row lock
    if (text.includes("FROM orders") && text.includes("FOR UPDATE")) {
      const order = state.orders.get((params as string[])[0]);
      return (order ? rows([order]) : empty()) as QueryResult<T>;
    }

    // buyer address by id
    if (text.includes("FROM user_addresses") && text.includes("WHERE id = $1 AND user_id = $2")) {
      const [id, userId] = params as [number, string];
      const address = state.addresses.get(Number(id));
      return (address && address.user_id === userId ? rows([address]) : empty()) as QueryResult<T>;
    }

    // primary address
    if (text.includes("FROM user_addresses") && text.includes("ORDER BY")) {
      const userId = (params as string[])[0];
      const address = [...state.addresses.values()].find((a) => a.user_id === userId);
      return (address ? rows([address]) : empty()) as QueryResult<T>;
    }

    // compliance profile upsert + read
    if (text.includes("INSERT INTO user_compliance_profiles")) return empty();
    if (text.includes("FROM user_compliance_profiles")) {
      const userId = (params as string[])[0];
      return rows([{
        user_id: userId,
        legal_name: null,
        date_of_birth: null,
        country_code: "GB",
        residency_country_code: null,
        kyc_status: "verified",
        kyc_level: "basic",
        kyc_vendor: null,
        kyc_vendor_ref: null,
        document_status: "approved",
        liveness_status: "approved",
        sanctions_status: "clear",
        pep_status: "clear",
        aml_risk_tier: "low",
        trading_enabled: true,
        max_single_trade_gbp: null,
        max_daily_volume_gbp: null,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]) as QueryResult<T>;
    }

    // parcel event insert — dedupe on (provider, provider_event_id)
    if (text.includes("INSERT INTO order_parcel_events")) {
      const [orderId, provider, providerEventId, trackingId, payload] =
        params as [string, string, string, string | null, string];
      const existing = state.parcelEvents.find(
        (e) => e.provider === provider && e.provider_event_id === providerEventId,
      );
      if (existing) return empty(); // ON CONFLICT DO NOTHING
      const row = {
        order_id: orderId,
        provider,
        event_type: "handoff_asserted",
        provider_event_id: providerEventId,
        tracking_id: trackingId,
        occurred_at: "2026-03-01T12:00:00.000Z",
        payload: JSON.parse(payload),
      };
      state.parcelEvents.push(row);
      return rows([{ occurred_at: row.occurred_at, payload: row.payload }]) as QueryResult<T>;
    }

    // idempotent parcel-event re-read
    if (text.includes("FROM order_parcel_events") && text.includes("provider = $1")) {
      const [provider, providerEventId] = params as [string, string];
      const found = state.parcelEvents.find(
        (e) => e.provider === provider && e.provider_event_id === providerEventId,
      );
      return (found ? rows([{ occurred_at: found.occurred_at }]) : empty()) as QueryResult<T>;
    }

    // order shipping persistence (COALESCE semantics)
    if (text.includes("UPDATE orders") && text.includes("shipping_carrier_id = COALESCE")) {
      const [orderId, carrierId, provider, tracking, labelUrl, quoteGbp, metadata] =
        params as [string, string, string, string, string | null, number, string];
      const order = state.orders.get(orderId);
      if (order) {
        order.shipping_carrier_id ??= carrierId;
        order.shipping_provider ??= provider;
        order.tracking_number ??= tracking;
        order.shipping_label_url ??= labelUrl;
        order.shipping_quote_gbp ??= String(quoteGbp);
        order.shipping_metadata = {
          ...(order.shipping_metadata ?? {}),
          ...(JSON.parse(metadata) as Record<string, unknown>),
        };
        return rows([{
          tracking_number: order.tracking_number,
          shipping_provider: order.shipping_provider,
          shipping_label_url: order.shipping_label_url,
          shipping_quote_gbp: order.shipping_quote_gbp,
        }]) as QueryResult<T>;
      }
      return empty();
    }

    return empty();
  };

  return {
    calls,
    query,
    connect: async () => ({ query, release: () => {} }),
  };
}

function seedOrder(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: "ord_1",
    buyer_id: BUYER,
    seller_id: SELLER,
    listing_id: "lst_1",
    status: "paid",
    address_id: 10,
    postage_fee_gbp: "3.49",
    shipping_carrier_id: "evri",
    shipping_provider: null,
    tracking_number: null,
    shipping_label_url: null,
    shipping_quote_gbp: null,
    ...overrides,
  };
}

function seedState(overrides: Partial<FakeState> = {}): FakeState {
  const orders = new Map<string, FakeOrder>();
  orders.set("ord_1", seedOrder());
  const addresses = new Map<number, { id: number; user_id: string; postcode: string }>();
  addresses.set(10, { id: 10, user_id: BUYER, postcode: "E1 6AN" });
  addresses.set(20, { id: 20, user_id: SELLER, postcode: "M1 1AA" });
  return { orders, addresses, parcelEvents: [], ...overrides };
}

interface BuildOptions {
  authUser?: { userId: string; role: string } | null;
  createShipmentFn?: () => Promise<unknown>;
  emittedCards?: Array<Record<string, unknown>>;
}

async function buildApp(state: FakeState, options: BuildOptions = {}) {
  const db = fakeDb(state);
  const app = Fastify();
  const authUser = options.authUser === undefined
    ? { userId: SELLER, role: "user" }
    : options.authUser;
  app.addHook("preHandler", async (request) => {
    if (authUser) {
      request.authUser = { userId: authUser.userId, role: authUser.role, sessionId: "s1" } as never;
    }
  });
  registerOrderFulfilmentRoutes({
    app,
    db: db as unknown as Pool,
    createShipmentFn: (options.createShipmentFn ?? (async () => ({
      provider: "evri",
      carrierId: "evri",
      carrierLabel: "Evri",
      trackingNumber: "EVR0001TEST",
      labelUrl: "https://labels.example.com/ord_1.pdf",
      priceGbp: 2.9,
      live: false,
      metadata: { mock: true },
    }))) as never,
    emitOrderCommerceCardFn: (async (input: Record<string, unknown>) => {
      options.emittedCards?.push(input);
      return { emitted: true, conversationId: "conv_1", messageId: "m1" };
    }) as never,
  });
  await app.ready();
  return { app, db };
}

// ── POST /orders/:orderId/shipping-label ────────────────────────────────────

test("shipping-label: requires authentication", async () => {
  const { app } = await buildApp(seedState(), { authUser: null });
  const res = await app.inject({ method: "POST", url: "/orders/ord_1/shipping-label" });
  assert.equal(res.statusCode, 401);
});

test("shipping-label: rejects non-seller callers", async () => {
  const { app } = await buildApp(seedState(), {
    authUser: { userId: OTHER, role: "user" },
  });
  const res = await app.inject({ method: "POST", url: "/orders/ord_1/shipping-label" });
  assert.equal(res.statusCode, 403);
});

test("shipping-label: 404 for unknown order", async () => {
  const { app } = await buildApp(seedState());
  const res = await app.inject({ method: "POST", url: "/orders/ord_missing/shipping-label" });
  assert.equal(res.statusCode, 404);
});

test("shipping-label: 409 when the order is not paid", async () => {
  const state = seedState();
  state.orders.set("ord_1", seedOrder({ status: "created" }));
  const { app } = await buildApp(state);
  const res = await app.inject({ method: "POST", url: "/orders/ord_1/shipping-label" });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, "ORDER_NOT_PAID");
});

test("shipping-label: provisions and persists the label for a paid order", async () => {
  const state = seedState();
  const emittedCards: Array<Record<string, unknown>> = [];
  const { app, db } = await buildApp(state, { emittedCards });
  const res = await app.inject({ method: "POST", url: "/orders/ord_1/shipping-label" });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.alreadyExists, false);
  assert.equal(body.trackingNumber, "EVR0001TEST");
  assert.equal(body.shippingProvider, "evri");
  assert.equal(body.shippingLabelUrl, "https://labels.example.com/ord_1.pdf");
  assert.equal(body.shippingQuoteGbp, 3.49); // postage_fee_gbp wins over provider price
  // persisted to the order row
  const order = state.orders.get("ord_1");
  assert.equal(order?.tracking_number, "EVR0001TEST");
  assert.equal(order?.shipping_label_url, "https://labels.example.com/ord_1.pdf");
  // label_created commerce card emitted post-commit
  assert.equal(emittedCards.length, 1);
  assert.equal(emittedCards[0].stateType, "label_created");
  // no status mutation anywhere in the route
  assert.equal(
    db.calls.some((c) => /UPDATE orders\s+SET\s+status/i.test(c.text)),
    false,
  );
});

test("shipping-label: idempotent when a label already exists", async () => {
  const state = seedState();
  state.orders.set("ord_1", seedOrder({
    tracking_number: "EVR-EXISTING",
    shipping_label_url: "https://labels.example.com/existing.pdf",
    shipping_provider: "evri",
  }));
  let shipmentCalls = 0;
  const { app } = await buildApp(state, {
    createShipmentFn: async () => {
      shipmentCalls += 1;
      return {};
    },
  });
  const res = await app.inject({ method: "POST", url: "/orders/ord_1/shipping-label" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.alreadyExists, true);
  assert.equal(body.trackingNumber, "EVR-EXISTING");
  assert.equal(shipmentCalls, 0);
});

test("shipping-label: TV- placeholder tracking does not count as an artifact", async () => {
  const state = seedState();
  state.orders.set("ord_1", seedOrder({ tracking_number: "TV-ORD_1" }));
  const { app } = await buildApp(state);
  const res = await app.inject({ method: "POST", url: "/orders/ord_1/shipping-label" });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().alreadyExists, false);
});

test("shipping-label: provider outage surfaces an honest error code", async () => {
  const { app } = await buildApp(seedState(), {
    createShipmentFn: async () => {
      const err = new Error("No shipping provider is available") as Error & { code?: string };
      err.code = "SHIPPING_PROVIDER_UNAVAILABLE";
      throw err;
    },
  });
  const res = await app.inject({ method: "POST", url: "/orders/ord_1/shipping-label" });
  assert.equal(res.statusCode, 503);
  const body = res.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "SHIPPING_PROVIDER_UNAVAILABLE");
  assert.equal(body.details.code, "SHIPPING_PROVIDER_UNAVAILABLE");
});

test("shipping-label: missing postcode context returns INVALID_DESTINATION", async () => {
  const state = seedState();
  state.addresses.clear(); // no buyer or seller addresses
  const { app } = await buildApp(state);
  const res = await app.inject({ method: "POST", url: "/orders/ord_1/shipping-label" });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().code, "INVALID_DESTINATION");
});

// ── POST /orders/:orderId/fulfilment/handoff-assertion ──────────────────────

test("handoff-assertion: requires authentication", async () => {
  const { app } = await buildApp(seedState(), { authUser: null });
  const res = await app.inject({
    method: "POST",
    url: "/orders/ord_1/fulfilment/handoff-assertion",
    payload: {},
  });
  assert.equal(res.statusCode, 401);
});

test("handoff-assertion: rejects non-seller callers", async () => {
  const { app } = await buildApp(seedState(), {
    authUser: { userId: BUYER, role: "user" },
  });
  const res = await app.inject({
    method: "POST",
    url: "/orders/ord_1/fulfilment/handoff-assertion",
    payload: {},
  });
  assert.equal(res.statusCode, 403);
});

test("handoff-assertion: 404 for unknown order", async () => {
  const { app } = await buildApp(seedState());
  const res = await app.inject({
    method: "POST",
    url: "/orders/ord_missing/fulfilment/handoff-assertion",
    payload: {},
  });
  assert.equal(res.statusCode, 404);
});

test("handoff-assertion: 409 unless the order is paid", async () => {
  for (const status of ["created", "shipped", "delivered", "cancelled"]) {
    const state = seedState();
    state.orders.set("ord_1", seedOrder({ status }));
    const { app } = await buildApp(state);
    const res = await app.inject({
      method: "POST",
      url: "/orders/ord_1/fulfilment/handoff-assertion",
      payload: {},
    });
    assert.equal(res.statusCode, 409, `status ${status} should be rejected`);
    assert.equal(res.json().code, "ORDER_NOT_PAID");
  }
});

test("handoff-assertion: records the event without mutating order status", async () => {
  const state = seedState();
  state.orders.set("ord_1", seedOrder({ tracking_number: "EVR0001TEST", shipping_provider: "evri" }));
  const { app, db } = await buildApp(state);
  const res = await app.inject({
    method: "POST",
    url: "/orders/ord_1/fulfilment/handoff-assertion",
    payload: {},
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.orderId, "ord_1");
  assert.equal(body.status, "paid");
  assert.ok(typeof body.handoffClaimedAt === "string" && body.handoffClaimedAt.length > 0);
  // evidence row persisted
  assert.equal(state.parcelEvents.length, 1);
  assert.equal(state.parcelEvents[0].event_type, "handoff_asserted");
  assert.equal(state.parcelEvents[0].tracking_id, "EVR0001TEST");
  // canonical order status untouched — no status write issued at all
  assert.equal(state.orders.get("ord_1")?.status, "paid");
  assert.equal(
    db.calls.some((c) => /UPDATE orders/i.test(c.text) && /status/i.test(c.text)),
    false,
  );
});

test("handoff-assertion: idempotent replay returns the original claim", async () => {
  const state = seedState();
  const { app } = await buildApp(state);
  const first = await app.inject({
    method: "POST",
    url: "/orders/ord_1/fulfilment/handoff-assertion",
    payload: {},
  });
  const second = await app.inject({
    method: "POST",
    url: "/orders/ord_1/fulfilment/handoff-assertion",
    payload: {},
  });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(state.parcelEvents.length, 1);
  assert.equal(second.json().handoffClaimedAt, first.json().handoffClaimedAt);
});
