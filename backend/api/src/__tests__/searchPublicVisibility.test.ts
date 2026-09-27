/**
 * Public-visibility safety net for /search/semantic and /search/autocomplete
 * (review P1-1).
 *
 * `syncSingleListing` indexes every status except deleted/sold, so
 * draft/paused/risk_pending documents can linger in the index (and in the
 * mirrored local fallback). The lexical /search legs already re-check every
 * hit `WHERE status = 'active'`; these tests pin the same guarantee on the
 * two routes that previously had no status predicate:
 *
 *   - POST /search/semantic re-checks every returned id against live rows
 *     with `status = 'active'` — unconditionally, for anonymous viewers too
 *     (the old code only re-checked seller_id, and only when the viewer had
 *     block exclusions).
 *   - GET /search/autocomplete drops suggestion terms that no ACTIVE listing
 *     corroborates, and discloses retrievalMeta/serveMode like every other
 *     search route.
 *
 * Runs on the in-memory SearchAdapter (no MEILISEARCH_URL in test env),
 * seeded through the exported `searchIndex` singleton — same pattern as
 * searchScoped.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";

// Force the in-memory adapter and the no-Meilisearch path before the route
// modules lazily construct their singletons.
delete process.env.MEILISEARCH_URL;
delete process.env.MEILISEARCH_KEY;
process.env.SEARCH_ALLOW_IN_MEMORY = "true";

const { registerSearchRoutes } = await import("../routes/search.js");
const { searchIndex } = await import("../lib/searchIndex.js");

function empty<T extends QueryResultRow>(): QueryResult<T> {
  return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
}

function rows<T extends QueryResultRow>(r: T[]): QueryResult<T> {
  return { rows: r, rowCount: r.length } as QueryResult<T>;
}

const isBlocksQuery = (text: string) => text.includes("FROM user_blocks");
const isListingRecheckQuery = (text: string) =>
  text.includes("SELECT id, seller_id FROM listings") &&
  text.includes("id = ANY($1::text[])");
const isAutocompleteCorroborationQuery = (text: string) =>
  text.includes("FROM unnest");

type FakeDb = ReturnType<typeof fakeDb>;

function fakeDb(matcher: (text: string, params?: unknown[]) => QueryResult | undefined) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const db = {
    calls,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ text, params });
      return (matcher(text, params) ?? empty()) as QueryResult<T>;
    },
  };
  return db;
}

async function buildApp(db: FakeDb) {
  const app = Fastify();
  // `x-test-user` marks the request authenticated, mirroring the real
  // optionalAuthenticate hook — absent header means anonymous viewer.
  app.addHook("preHandler", async (request) => {
    const userId = request.headers["x-test-user"] as string | undefined;
    if (userId) {
      request.authUser = { userId, role: "user", sessionId: "s1" } as never;
    }
  });
  registerSearchRoutes({
    app,
    db: db as unknown as Pool,
    createApiError: (code: string, message: string) =>
      Object.assign(new Error(message), { code }),
    resolveAuthenticatedUserId: (request) => request.authUser?.userId ?? "user_1",
  });
  await app.ready();
  return app;
}

// Seed the in-memory listing index once — test files run in their own
// process, so the singleton does not leak into other suites. Unique tokens
// per listing keep the assertions independent.
searchIndex.addListing({
  id: "lst_held1",
  sellerId: "usr_s1",
  title: "Zxqwheld moderation-held coat",
  description: "Held piece",
  category: "Coats",
  brand: "Zxheldbrand",
  size: "L",
  condition: "good",
  priceGbp: 60,
  imageUrl: "https://cdn.example.com/lst_held1.jpg",
  createdAt: "2026-02-01T00:00:00.000Z",
  sellerRating: null,
  viewCount: 0,
  saleCount: 0,
  sellerUsername: "sellerone",
});
searchIndex.addListing({
  id: "lst_pub1",
  sellerId: "usr_s2",
  title: "Acvisible public tee",
  description: "Public piece",
  category: "Tees",
  brand: "Acvisbrand",
  size: "M",
  condition: "new",
  priceGbp: 25,
  imageUrl: "https://cdn.example.com/lst_pub1.jpg",
  createdAt: "2026-02-02T00:00:00.000Z",
  sellerRating: null,
  viewCount: 0,
  saleCount: 0,
  sellerUsername: "sellertwo",
});

// ── POST /search/semantic ────────────────────────────────────────────────────

test("semantic: an indexed hit whose row is not status='active' is dropped, even for an anonymous viewer", async () => {
  // The DB holds no ACTIVE row for lst_held1 (draft/paused/risk_pending) —
  // the re-check returns nothing and the hit must not be served.
  const db = fakeDb(() => undefined);
  const app = await buildApp(db);

  const res = await app.inject({
    method: "POST",
    url: "/search/semantic",
    payload: { query: "zxqwheld" },
  });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    ok: boolean;
    total: number;
    items: Array<{ id: string }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.total, 0);
  assert.equal(body.items.length, 0);

  // The safety net must run unconditionally — the old code skipped the
  // re-check entirely when the viewer had no block exclusions.
  const recheck = db.calls.find((c) => isListingRecheckQuery(c.text));
  assert.ok(recheck, "semantic route must re-check hits against live listings");
  assert.match(recheck.text, /status = 'active'/);
});

test("semantic: an active-corroborated hit is served with its document", async () => {
  const db = fakeDb((text) => {
    if (isListingRecheckQuery(text)) {
      return rows([{ id: "lst_pub1", seller_id: "usr_s2" }]);
    }
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({
    method: "POST",
    url: "/search/semantic",
    payload: { query: "acvisible" },
  });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    ok: boolean;
    total: number;
    retrievalMeta?: { method: string };
    items: Array<{ id: string; score: number }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.total, 1);
  assert.equal(body.items[0]?.id, "lst_pub1");
});

test("semantic: blocked sellers are still excluded after the status re-check", async () => {
  const db = fakeDb((text) => {
    if (isBlocksQuery(text)) return rows([{ other_id: "usr_s2" }]);
    if (isListingRecheckQuery(text)) {
      return rows([{ id: "lst_pub1", seller_id: "usr_s2" }]);
    }
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({
    method: "POST",
    url: "/search/semantic",
    payload: { query: "acvisible" },
    headers: { "x-test-user": "viewer_1" },
  });
  assert.equal(res.statusCode, 200);

  const body = res.json() as { ok: boolean; total: number; items: unknown[] };
  assert.equal(body.ok, true);
  assert.equal(body.total, 0);
  assert.equal(body.items.length, 0);
});

// ── GET /search/autocomplete ─────────────────────────────────────────────────

test("autocomplete: a suggestion backed only by a non-active listing is dropped", async () => {
  // No ACTIVE listing corroborates the term — the fake DB returns nothing
  // from the corroboration query.
  const db = fakeDb(() => undefined);
  const app = await buildApp(db);

  const res = await app.inject({
    method: "GET",
    url: "/search/autocomplete?q=zxqwheld",
  });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    ok: boolean;
    suggestions: Array<{ text: string }>;
  };
  assert.equal(body.ok, true);
  assert.equal(
    body.suggestions.some((s) => s.text === "zxqwheld"),
    false,
    "a term sourced only from a non-public document must not be suggested",
  );
});

test("autocomplete: a suggestion corroborated by an active listing is served, with retrievalMeta", async () => {
  const db = fakeDb((text, params) => {
    if (isAutocompleteCorroborationQuery(text)) {
      // Simulate the EXISTS probe: corroborate only the public listing's
      // term (the bound texts arrive LIKE-escaped, but these carry no
      // wildcards so they compare verbatim).
      const bound = (params?.[0] as string[]) ?? [];
      return rows(
        bound
          .filter((t) => t === "acvisible")
          .map((t) => ({ text: t })),
      );
    }
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({
    method: "GET",
    url: "/search/autocomplete?q=acvis",
  });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    ok: boolean;
    suggestions: Array<{ text: string; type: string }>;
    retrievalMeta?: { method: string; backend?: string; degraded?: boolean };
    serveMode?: string;
  };
  assert.equal(body.ok, true);
  assert.ok(
    body.suggestions.some((s) => s.text === "acvisible"),
    "an active-backed suggestion must survive corroboration",
  );

  // Degradation disclosure parity with the other search routes — a
  // fallback-served autocomplete is no longer invisible to clients.
  assert.equal(body.retrievalMeta?.method, "lexical");
  assert.equal(body.retrievalMeta?.backend, "in_memory");
  assert.equal(body.serveMode, "cold_start");
});

test("autocomplete: corroboration is scoped to status='active' rows", async () => {
  const db = fakeDb(() => undefined);
  const app = await buildApp(db);

  await app.inject({ method: "GET", url: "/search/autocomplete?q=acvis" });

  const corr = db.calls.find((c) => isAutocompleteCorroborationQuery(c.text));
  assert.ok(corr, "autocomplete must corroborate suggestions against live listings");
  assert.match(corr.text, /l\.status = 'active'/);
});
