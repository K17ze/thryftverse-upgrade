/**
 * Route-registration smoke test.
 *
 * Three route modules exported registrars that were never called from
 * index.ts, leaving live frontend callers hitting 404s:
 *
 *   routes/appeals.ts          → POST /appeals, GET /appeals/:decisionId
 *   routes/chatPreferences.ts  → GET/PUT /chat/conversations/:id/preferences
 *   routes/auctions.ts (tail)  → registerAuctionLifecycleRoutes:
 *                                POST /auctions/:id/cancel, /payment,
 *                                /second-chance/accept, /second-chance/decline,
 *                                /accept-highest-bid,
 *                                GET /users/me/auction-bids/lookup-by-key/:key
 *   routes/listings.ts (tail)  → registerListingInteractionRoutes:
 *                                POST /listings/:listingId/view,
 *                                POST /listings/:listingId/interact,
 *                                POST /listings/:listingId/report
 *
 * appeals.ts and chatPreferences.ts are mounted here against a real Fastify
 * app with a fake pool. auctions.ts and listings.ts are covered statically
 * instead: importing them eagerly creates ioredis connections via
 * lib/queues.ts which would keep the test process alive. The static guard
 * is the stronger regression check anyway — it reads the REAL index.ts and
 * asserts none of the extracted paths collide with an inline route literal.
 * Runtime coverage for the six auction endpoints lives in
 * src/scripts/auctionLifecycle.smoke.ts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import { registerAppealsRoutes } from "./appeals.js";
import { registerChatPreferencesRoutes } from "./chatPreferences.js";

const ME = "user-me";
const auth = { authorization: "Bearer test" };

const here = path.dirname(fileURLToPath(import.meta.url));

function fakeDb() {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const empty = <T extends QueryResultRow>(): QueryResult<T> =>
    ({ rows: [] as T[], rowCount: 0 }) as QueryResult<T>;
  const client = {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
      calls.push({ text, params });
      return empty<T>();
    },
    release() {},
  };
  const db = {
    calls,
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
      calls.push({ text, params });
      return empty<T>();
    },
    async connect() {
      return client;
    },
  };
  return db;
}

async function buildApp() {
  const db = fakeDb();
  const app = Fastify();

  // Mirrors the production preHandler contract: no Authorization → 401,
  // otherwise request.authUser is populated before the handler runs.
  app.addHook("preHandler", async (request, reply) => {
    if (!request.headers.authorization) {
      reply.code(401).send({ ok: false, error: "Unauthorized" });
      return reply;
    }
    request.authUser = { userId: ME, role: "user", sessionId: "s1" } as never;
  });

  registerAppealsRoutes({
    app,
    db: db as unknown as Pool,
    createApiError: (code: string, message: string, details?: Record<string, unknown>) =>
      Object.assign(new Error(message), { code, details }),
    resolveAuthenticatedUserId: (request) => request.authUser?.userId ?? ME,
  });

  registerChatPreferencesRoutes({
    app,
    db: db as unknown as Pool,
    resolveAuthenticatedUserId: (request) => request.authUser?.userId ?? ME,
  });

  await app.ready();
  return { app, db };
}

/** Extract `app.<method>('<path>'` literals from a source string. */
function extractRouteLiterals(source: string): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    out.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return out;
}

const AUCTION_LIFETIME_ROUTES = [
  "GET /users/me/auction-bids/lookup-by-key/:idempotencyKey",
  "POST /auctions/:auctionId/cancel",
  "POST /auctions/:auctionId/payment",
  "POST /auctions/:auctionId/second-chance/accept",
  "POST /auctions/:auctionId/second-chance/decline",
  "POST /auctions/:auctionId/accept-highest-bid",
];

const LISTING_INTERACTION_ROUTES = [
  "POST /listings/:listingId/view",
  "POST /listings/:listingId/interact",
  // Moved out of index.ts: the report write is bridged into the safety
  // case graph via recordConsumerReport (reportSafetyBridge.test.ts).
  "POST /listings/:listingId/report",
];

// ── Appeals (runtime mount) ─────────────────────────────────────────

test("POST /appeals reaches the handler (decision not found → 404 body)", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/appeals",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ decisionId: "dec-1234", grounds: "I did nothing wrong" }),
    });
    assert.equal(res.statusCode, 404);
    const body = res.json() as { ok: boolean; code: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, "DECISION_NOT_FOUND");
  } finally {
    await app.close();
  }
});

test("GET /appeals/:decisionId reaches the handler", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "GET",
      url: "/appeals/dec-1234",
      headers: auth,
    });
    assert.equal(res.statusCode, 404);
    assert.equal((res.json() as { code: string }).code, "DECISION_NOT_FOUND");
  } finally {
    await app.close();
  }
});

test("POST /appeals rejects an invalid body with 400", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/appeals",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ decisionId: "x", grounds: "" }),
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("POST /appeals requires auth", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/appeals",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ decisionId: "dec-1234", grounds: "g" }),
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

// ── Chat preferences (runtime mount) ────────────────────────────────

test("GET /chat/conversations/:id/preferences reaches the handler", async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: "GET",
      url: "/chat/conversations/conv-1/preferences",
      headers: auth,
    });
    // Fake pool returns no membership row → handler-level 403, not route 404.
    assert.equal(res.statusCode, 403);
    assert.equal((res.json() as { ok: boolean }).ok, false);
    assert.ok(db.calls.some((c) => /chat_members/.test(c.text)));
  } finally {
    await app.close();
  }
});

test("PUT /chat/conversations/:id/preferences reaches the handler", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "PUT",
      url: "/chat/conversations/conv-1/preferences",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ theme: "Midnight" }),
    });
    assert.equal(res.statusCode, 403);
    assert.equal((res.json() as { ok: boolean }).ok, false);
  } finally {
    await app.close();
  }
});

// ── Auction lifecycle (static guards) ───────────────────────────────

test("registerAuctionLifecycleRoutes defines exactly the six expected routes", () => {
  const source = readFileSync(path.join(here, "auctions.ts"), "utf-8");
  const start = source.indexOf("export const registerAuctionLifecycleRoutes");
  assert.ok(start > -1, "registerAuctionLifecycleRoutes export is missing from auctions.ts");
  const body = source.slice(start);

  const defined = new Set(extractRouteLiterals(body).map((r) => `${r.method} ${r.path}`));
  for (const expected of AUCTION_LIFETIME_ROUTES) {
    assert.ok(defined.has(expected), `lifecycle registrar is missing: ${expected}`);
  }
  assert.deepEqual(
    [...defined].sort(),
    [...AUCTION_LIFETIME_ROUTES].sort(),
    "lifecycle registrar must not define routes beyond the six lifecycle endpoints",
  );
});

test("auction lifecycle routes have no duplicate in index.ts (would crash boot)", () => {
  const indexSource = readFileSync(path.join(here, "..", "index.ts"), "utf-8");
  const inline = new Set(
    extractRouteLiterals(indexSource).map((r) => `${r.method} ${r.path}`),
  );
  for (const lifecycle of AUCTION_LIFETIME_ROUTES) {
    assert.ok(!inline.has(lifecycle), `${lifecycle} is already registered inline in index.ts`);
  }
  // And the registrar must actually be wired up.
  assert.ok(
    indexSource.includes("registerAuctionLifecycleRoutes({"),
    "index.ts does not call registerAuctionLifecycleRoutes",
  );
  assert.ok(
    indexSource.includes("registerAppealsRoutes({"),
    "index.ts does not call registerAppealsRoutes",
  );
  assert.ok(
    indexSource.includes("registerChatPreferencesRoutes({"),
    "index.ts does not call registerChatPreferencesRoutes",
  );
});

// ── Listing interactions (static guards) ────────────────────────────

test("registerListingInteractionRoutes defines exactly the three expected routes", () => {
  const source = readFileSync(path.join(here, "listings.ts"), "utf-8");
  const start = source.indexOf("export const registerListingInteractionRoutes");
  assert.ok(start > -1, "registerListingInteractionRoutes export is missing from listings.ts");
  const body = source.slice(start);

  const defined = new Set(extractRouteLiterals(body).map((r) => `${r.method} ${r.path}`));
  for (const expected of LISTING_INTERACTION_ROUTES) {
    assert.ok(defined.has(expected), `interaction registrar is missing: ${expected}`);
  }
  assert.deepEqual(
    [...defined].sort(),
    [...LISTING_INTERACTION_ROUTES].sort(),
    "interaction registrar must not define routes beyond the three listing endpoints",
  );

  // The extracted routes must not also remain inside the dead
  // registerListingRoutes body — registering that module wholesale would
  // then collide with the interaction registrar.
  const deadRegistrar = source.slice(0, start);
  const deadDefined = new Set(
    extractRouteLiterals(deadRegistrar).map((r) => `${r.method} ${r.path}`),
  );
  for (const interaction of LISTING_INTERACTION_ROUTES) {
    assert.ok(
      !deadDefined.has(interaction),
      `${interaction} is still defined inside registerListingRoutes — it must live only in the interaction registrar`,
    );
  }
});

test("listing interaction routes have no duplicate in index.ts (would crash boot)", () => {
  const indexSource = readFileSync(path.join(here, "..", "index.ts"), "utf-8");
  const inline = new Set(
    extractRouteLiterals(indexSource).map((r) => `${r.method} ${r.path}`),
  );
  for (const interaction of LISTING_INTERACTION_ROUTES) {
    assert.ok(!inline.has(interaction), `${interaction} is already registered inline in index.ts`);
  }
  // And the registrar must actually be wired up.
  assert.ok(
    indexSource.includes("registerListingInteractionRoutes({"),
    "index.ts does not call registerListingInteractionRoutes",
  );
});
