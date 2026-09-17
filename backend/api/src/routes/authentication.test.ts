/**
 * Route tests for the authentication pipeline read surface.
 *
 *   GET /orders/:orderId/authentication   — party-gated status: durable
 *     `orders.verification_requested` flag from Postgres + live pipeline
 *     state from Redis (90-day TTL). Honest `request_pending` when the flag
 *     is set but no Redis record exists.
 *   GET /authentication/certificates/:id  — public verification of a
 *     certificate id issued with a badge.
 *
 * Mounted on a real Fastify instance with a fake pg pool and the pipeline's
 * in-memory mock Redis — the same pattern as routeRegistration.smoke.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import { registerAuthenticationRoutes } from "./authentication.js";
import {
  createMockRedis,
  createAuthenticationRequest,
  runAiTriage,
  performAiTriage,
} from "../lib/authenticationPipeline.js";

const BUYER = "user-buyer";
const SELLER = "user-seller";
const STRANGER = "user-stranger";
const ORDER_ID = "order-1234";
const LISTING_ID = "listing-99";

const ORDER_ROW = {
  buyer_id: BUYER,
  seller_id: SELLER,
  verification_requested: true,
};

function fakeDb(orderRow: typeof ORDER_ROW | null) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const db = {
    calls,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      calls.push({ text, params });
      if (text.includes("FROM orders")) {
        return {
          rows: (orderRow ? [orderRow] : []) as unknown as T[],
          rowCount: orderRow ? 1 : 0,
        } as QueryResult<T>;
      }
      return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
    },
  };
  return db;
}

async function buildApp(options: {
  orderRow?: typeof ORDER_ROW | null;
  authUser?: { userId: string; role: string } | null;
  seedRequest?: boolean;
}) {
  const db = fakeDb(options.orderRow === undefined ? ORDER_ROW : options.orderRow);
  const redis = createMockRedis();
  const app = Fastify();

  if (options.seedRequest) {
    await createAuthenticationRequest(redis, {
      listingId: LISTING_ID,
      orderId: ORDER_ID,
      itemValue: 250,
      category: "watches",
      brand: "Omega",
      sellerId: SELLER,
      buyerId: BUYER,
      requestedBy: "buyer",
    });
  }

  // Mirrors the production preHandler contract: no Authorization → no
  // authUser; otherwise the configured actor is populated before the handler.
  app.addHook("preHandler", async (request) => {
    if (options.authUser && request.headers.authorization) {
      (request as unknown as { authUser?: unknown }).authUser = options.authUser;
    }
  });

  registerAuthenticationRoutes({ app, db: db as unknown as Pool, redis });
  await app.ready();
  return { app, db, redis };
}

const auth = { authorization: "Bearer test" };

// ── GET /orders/:orderId/authentication ───────────────────────────────────

test("order authentication: unauthenticated request → 401", async () => {
  const { app } = await buildApp({ authUser: { userId: BUYER, role: "user" } });
  try {
    const res = await app.inject({
      method: "GET",
      url: `/orders/${ORDER_ID}/authentication`,
    });
    assert.equal(res.statusCode, 401);
    assert.equal((res.json() as { ok: boolean }).ok, false);
  } finally {
    await app.close();
  }
});

test("order authentication: missing order → 404", async () => {
  const { app } = await buildApp({
    orderRow: null,
    authUser: { userId: BUYER, role: "user" },
  });
  try {
    const res = await app.inject({
      method: "GET",
      url: `/orders/${ORDER_ID}/authentication`,
      headers: auth,
    });
    assert.equal(res.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("order authentication: non-party user → 403", async () => {
  const { app } = await buildApp({
    authUser: { userId: STRANGER, role: "user" },
  });
  try {
    const res = await app.inject({
      method: "GET",
      url: `/orders/${ORDER_ID}/authentication`,
      headers: auth,
    });
    assert.equal(res.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("order authentication: buyer sees live pipeline state", async () => {
  const { app } = await buildApp({
    authUser: { userId: BUYER, role: "user" },
    seedRequest: true,
  });
  try {
    const res = await app.inject({
      method: "GET",
      url: `/orders/${ORDER_ID}/authentication`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      authentication: {
        requested: boolean;
        status: string;
        request: { id: string; tier: number; listingId: string } | null;
        storage?: { persistence: string; recordExpiresAt: string | null };
      };
    };
    assert.equal(body.authentication.requested, true);
    assert.equal(body.authentication.status, "pending_ai_triage");
    assert.equal(body.authentication.request?.id, `auth_order_${ORDER_ID}`);
    assert.equal(body.authentication.request?.listingId, LISTING_ID);
    // £250 → tier 2 (AI + remote expert)
    assert.equal(body.authentication.request?.tier, 2);
    assert.equal(body.authentication.storage?.persistence, "ephemeral");
    assert.ok(body.authentication.storage?.recordExpiresAt);
  } finally {
    await app.close();
  }
});

test("order authentication: seller is also a party", async () => {
  const { app } = await buildApp({
    authUser: { userId: SELLER, role: "user" },
    seedRequest: true,
  });
  try {
    const res = await app.inject({
      method: "GET",
      url: `/orders/${ORDER_ID}/authentication`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("order authentication: flag set but Redis record absent → request_pending, not fabricated progress", async () => {
  const { app } = await buildApp({
    authUser: { userId: BUYER, role: "user" },
    seedRequest: false,
  });
  try {
    const res = await app.inject({
      method: "GET",
      url: `/orders/${ORDER_ID}/authentication`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      authentication: { requested: boolean; status: string; request: unknown };
    };
    assert.equal(body.authentication.requested, true);
    assert.equal(body.authentication.status, "request_pending");
    assert.equal(body.authentication.request, null);
  } finally {
    await app.close();
  }
});

test("order authentication: verification not requested → not_requested", async () => {
  const { app } = await buildApp({
    orderRow: { ...ORDER_ROW, verification_requested: false },
    authUser: { userId: BUYER, role: "user" },
  });
  try {
    const res = await app.inject({
      method: "GET",
      url: `/orders/${ORDER_ID}/authentication`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      authentication: { requested: boolean; status: string };
    };
    assert.equal(body.authentication.requested, false);
    assert.equal(body.authentication.status, "not_requested");
  } finally {
    await app.close();
  }
});

// ── GET /authentication/certificates/:certificateId ───────────────────────

test("certificate verification: unknown id → 404", async () => {
  const { app } = await buildApp({});
  try {
    const res = await app.inject({
      method: "GET",
      url: "/authentication/certificates/CERT-DEADBEEF00",
    });
    assert.equal(res.statusCode, 404);
    assert.equal((res.json() as { ok: boolean }).ok, false);
  } finally {
    await app.close();
  }
});

test("certificate verification: issued badge resolves publicly", async () => {
  const redis = createMockRedis();
  const db = fakeDb(ORDER_ROW);
  const app = Fastify();
  registerAuthenticationRoutes({ app, db: db as unknown as Pool, redis });
  await app.ready();

  try {
    // Drive a tier-1 request to an issued badge. performAiTriage is
    // deterministic per listing id, so pick a listing id whose simulated
    // triage passes; fail→counterfeit listings get no badge.
    let certId: string | null = null;
    for (let i = 0; i < 50 && !certId; i += 1) {
      const listingId = `listing-cert-${i}`;
      if (performAiTriage(listingId, []).recommendation !== "pass") continue;
      const req = await createAuthenticationRequest(redis, {
        listingId,
        orderId: `order-cert-${i}`,
        itemValue: 50, // tier 1 — AI pass alone authenticates
        category: "shoes",
        sellerId: SELLER,
        buyerId: BUYER,
        requestedBy: "buyer",
      });
      const triaged = await runAiTriage(redis, req.id, []);
      certId = triaged.badge?.certificateId ?? null;
    }
    assert.ok(certId, "expected at least one passing tier-1 triage in 50 ids");

    const res = await app.inject({
      method: "GET",
      url: `/authentication/certificates/${certId}`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      certificate: {
        certificateId: string;
        type: string;
        itemDetails: { listingId: string };
      };
    };
    assert.equal(body.certificate.certificateId, certId);
    assert.equal(body.certificate.type, "AI_VERIFIED");
    assert.ok(body.certificate.itemDetails.listingId.startsWith("listing-cert-"));
  } finally {
    await app.close();
  }
});
