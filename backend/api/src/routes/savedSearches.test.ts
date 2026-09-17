/**
 * Saved-search persistence + matcher tests.
 *
 * Registers the real `registerSavedSearchRoutes` against a minimal Fastify
 * app with a fake `pg.Pool` (same pattern as users.username.test.ts), and
 * exercises `evaluateSavedSearchAlertsForListing` directly with a scripted
 * pool to prove the enqueue contract:
 *
 *   GET    /users/me/saved-searches
 *   POST   /users/me/saved-searches        — upsert keyed on dedupe_key
 *   PATCH  /users/me/saved-searches/:id    — alerts_enabled toggle
 *   DELETE /users/me/saved-searches/:id    — idempotent delete
 *   matcher — enqueues saved_search_match notifications for matching,
 *             alert-enabled searches owned by OTHER users only
 */

import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import { z } from "zod";

import {
  evaluateSavedSearchAlertsForListing,
  listingMatchesSavedSearch,
  registerSavedSearchRoutes,
} from "./savedSearches.js";

const ME = "user-me";

const SEARCH_ROW = {
  id: "ssearch_1",
  user_id: ME,
  query: "nike jordan",
  filters: { brands: ["Nike"], sizes: [], condition: "Any", sort: "Newest" },
  alerts_enabled: true,
  last_notified_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function empty<T extends QueryResultRow>(): QueryResult<T> {
  return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
}

function fakeDb(
  matcher: (text: string, params: unknown[]) => QueryResult | undefined,
) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const db = {
    calls,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ text, params });
      return (matcher(text, params ?? []) ?? empty()) as QueryResult<T>;
    },
  };
  return db;
}

async function buildApp(db: ReturnType<typeof fakeDb>) {
  const app = Fastify();
  app.addHook("preHandler", async (request, reply) => {
    if (!request.headers.authorization) {
      reply.code(401).send({ ok: false, error: "Unauthorized" });
      return reply;
    }
    request.authUser = { userId: ME, role: "user", sessionId: "s1" } as never;
  });
  // Mirror the production error handler (index.ts): Zod parse failures → 400.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      reply.code(400).send({ ok: false, error: "Invalid request payload" });
      return;
    }
    reply.code(500).send({ ok: false, error: "Internal error" });
  });
  registerSavedSearchRoutes({
    app,
    db: db as unknown as Pool,
    resolveAuthenticatedUserId: (request) => request.authUser?.userId ?? ME,
  });
  await app.ready();
  return app;
}

const auth = { authorization: "Bearer test" };

// ── GET /users/me/saved-searches ─────────────────────────────────────

test("GET /users/me/saved-searches returns the caller's searches", async () => {
  const db = fakeDb((text) => {
    if (/FROM saved_searches/i.test(text)) {
      return { rows: [SEARCH_ROW], rowCount: 1 } as QueryResult;
    }
    return undefined;
  });
  const app = await buildApp(db);
  try {
    const res = await app.inject({
      method: "GET",
      url: "/users/me/saved-searches",
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      ok: boolean;
      searches: Array<{ id: string; query: string; alertsEnabled: boolean }>;
    };
    assert.equal(body.ok, true);
    assert.equal(body.searches.length, 1);
    assert.equal(body.searches[0].id, "ssearch_1");
    assert.equal(body.searches[0].alertsEnabled, true);
    // Query must be scoped to the authenticated user.
    const select = db.calls.find((c) => /FROM saved_searches/i.test(c.text));
    assert.equal(select?.params?.[0], ME);
  } finally {
    await app.close();
  }
});

test("GET /users/me/saved-searches requires auth", async () => {
  const db = fakeDb(() => undefined);
  const app = await buildApp(db);
  try {
    const res = await app.inject({ method: "GET", url: "/users/me/saved-searches" });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

// ── POST /users/me/saved-searches ────────────────────────────────────

test("POST /users/me/saved-searches upserts on (user_id, dedupe_key)", async () => {
  const db = fakeDb((text) => {
    if (/INSERT INTO saved_searches/i.test(text)) {
      return { rows: [SEARCH_ROW], rowCount: 1 } as QueryResult;
    }
    return undefined;
  });
  const app = await buildApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: "/users/me/saved-searches",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({
        id: "ssearch_1",
        query: "nike jordan",
        filters: SEARCH_ROW.filters,
        alertsEnabled: true,
      }),
    });
    assert.equal(res.statusCode, 201);
    const body = res.json() as { ok: boolean; search: { id: string; query: string } };
    assert.equal(body.ok, true);
    assert.equal(body.search.id, "ssearch_1");
    const insert = db.calls.find((c) => /INSERT INTO saved_searches/i.test(c.text));
    assert.ok(insert);
    assert.match(insert!.text, /ON CONFLICT \(user_id, dedupe_key\)\s+DO UPDATE/);
    assert.equal(insert!.params?.[0], "ssearch_1");
    assert.equal(insert!.params?.[1], ME);
    // param $5 is the dedupe key: normalized query + hash separator.
    assert.match(String(insert!.params?.[4]), /^nike jordan\|[0-9a-f]{64}$/);
  } finally {
    await app.close();
  }
});

test("POST dedupe key is stable across key order and array order", async () => {
  const seenKeys: string[] = [];
  // Call the route twice with differently ordered equivalent filters and
  // compare the dedupe params captured from the INSERT.
  const db = fakeDb((text, params) => {
    if (/INSERT INTO saved_searches/i.test(text)) {
      seenKeys.push(String(params?.[4]));
      return { rows: [SEARCH_ROW], rowCount: 1 } as QueryResult;
    }
    return undefined;
  });
  const app = await buildApp(db);
  try {
    for (const filters of [
      { brands: ["Nike", "Adidas"], condition: "Any" },
      { condition: "Any", brands: ["Adidas", "Nike"] },
    ]) {
      await app.inject({
        method: "POST",
        url: "/users/me/saved-searches",
        headers: { ...auth, "content-type": "application/json" },
        payload: JSON.stringify({ query: "sneakers", filters }),
      });
    }
    assert.equal(seenKeys.length, 2);
    assert.equal(seenKeys[0], seenKeys[1]);
  } finally {
    await app.close();
  }
});

test("POST with an owned id updates that row in place", async () => {
  const db = fakeDb((text, params) => {
    if (/SELECT user_id FROM saved_searches WHERE id/i.test(text)) {
      return { rows: [{ user_id: ME }], rowCount: 1 } as QueryResult;
    }
    if (/UPDATE saved_searches/i.test(text)) {
      return { rows: [SEARCH_ROW], rowCount: 1 } as QueryResult;
    }
    return undefined;
  });
  const app = await buildApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: "/users/me/saved-searches",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({
        id: "ssearch_1",
        query: "nike jordan",
        filters: { brands: ["Nike", "Adidas"], sizes: [], condition: "Any" },
        alertsEnabled: true,
      }),
    });
    assert.equal(res.statusCode, 200);
    const update = db.calls.find((c) => /UPDATE saved_searches/i.test(c.text));
    assert.ok(update);
    assert.equal(update!.params?.[0], "ssearch_1");
    // The row's dedupe key is rewritten to the new filters' hash.
    assert.match(String(update!.params?.[4]), /^nike jordan\|[0-9a-f]{64}$/);
    // No INSERT ran — this was an in-place sync.
    assert.equal(db.calls.some((c) => /INSERT INTO saved_searches/i.test(c.text)), false);
  } finally {
    await app.close();
  }
});

test("POST dedupe collision on an owned id returns the canonical row (no PK violation)", async () => {
  // Reproduces the fall-through defect: the client re-saves an owned id
  // with filters that canonically match a DIFFERENT saved search. The
  // in-place UPDATE violates UNIQUE(user_id, dedupe_key); the handler
  // must adopt the canonical row instead of falling through to an INSERT
  // that reuses the still-existing payload.id as the primary key.
  const canonicalRow = { ...SEARCH_ROW, id: "ssearch_canonical" };
  const db = fakeDb((text) => {
    if (/SELECT user_id FROM saved_searches WHERE id/i.test(text)) {
      return { rows: [{ user_id: ME }], rowCount: 1 } as QueryResult;
    }
    if (/UPDATE saved_searches/i.test(text)) {
      if (/WHERE user_id = \$1 AND dedupe_key = \$2/i.test(text)) {
        // Canonical-row adoption update.
        return { rows: [canonicalRow], rowCount: 1 } as QueryResult;
      }
      // In-place update collides on (user_id, dedupe_key).
      const err = new Error("duplicate key value violates unique constraint") as Error & {
        code?: string;
      };
      err.code = "23505";
      throw err;
    }
    return undefined;
  });
  const app = await buildApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: "/users/me/saved-searches",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({
        id: "ssearch_1",
        query: "nike jordan",
        filters: { brands: ["Nike", "Adidas"], sizes: [], condition: "Any" },
        alertsEnabled: true,
      }),
    });
    // Same response shape as the insert path: 201 + { ok, search }.
    assert.equal(res.statusCode, 201);
    const body = res.json() as { ok: boolean; search: { id: string } };
    assert.equal(body.ok, true);
    assert.equal(body.search.id, "ssearch_canonical");
    // The PK-colliding INSERT never ran.
    assert.equal(db.calls.some((c) => /INSERT INTO saved_searches/i.test(c.text)), false);
    // The adoption update targeted (user_id, dedupe_key).
    const adopt = db.calls.find((c) => /WHERE user_id = \$1 AND dedupe_key = \$2/i.test(c.text));
    assert.ok(adopt);
    assert.equal(adopt!.params?.[0], ME);
    assert.match(String(adopt!.params?.[1]), /^nike jordan\|[0-9a-f]{64}$/);
  } finally {
    await app.close();
  }
});

test("POST /users/me/saved-searches rejects an id owned by another user", async () => {
  const db = fakeDb((text, params) => {
    if (/SELECT user_id FROM saved_searches WHERE id/i.test(text)) {
      return { rows: [{ user_id: "user-other" }], rowCount: 1 } as QueryResult;
    }
    return undefined;
  });
  const app = await buildApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: "/users/me/saved-searches",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ id: "ssearch_1", query: "nike jordan" }),
    });
    assert.equal(res.statusCode, 409);
    assert.equal(db.calls.some((c) => /INSERT INTO saved_searches/i.test(c.text)), false);
  } finally {
    await app.close();
  }
});

test("POST /users/me/saved-searches rejects an empty query", async () => {
  const db = fakeDb(() => undefined);
  const app = await buildApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: "/users/me/saved-searches",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ query: "   " }),
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await app.close();
  }
});

// ── PATCH /users/me/saved-searches/:id ───────────────────────────────

test("PATCH toggles alerts_enabled and returns the row", async () => {
  const db = fakeDb((text) => {
    if (/UPDATE saved_searches/i.test(text)) {
      return {
        rows: [{ ...SEARCH_ROW, alerts_enabled: false }],
        rowCount: 1,
      } as QueryResult;
    }
    return undefined;
  });
  const app = await buildApp(db);
  try {
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me/saved-searches/ssearch_1",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ alertsEnabled: false }),
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; search: { alertsEnabled: boolean } };
    assert.equal(body.search.alertsEnabled, false);
    const update = db.calls.find((c) => /UPDATE saved_searches/i.test(c.text));
    assert.equal(update?.params?.[0], "ssearch_1");
    assert.equal(update?.params?.[1], ME);
    assert.equal(update?.params?.[2], false);
  } finally {
    await app.close();
  }
});

test("PATCH returns 404 for a search the caller does not own", async () => {
  const db = fakeDb(() => undefined);
  const app = await buildApp(db);
  try {
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me/saved-searches/ssearch_other",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ alertsEnabled: true }),
    });
    assert.equal(res.statusCode, 404);
  } finally {
    await app.close();
  }
});

// ── DELETE /users/me/saved-searches/:id ──────────────────────────────

test("DELETE removes the caller's row (idempotent)", async () => {
  const db = fakeDb(() => undefined);
  const app = await buildApp(db);
  try {
    const res = await app.inject({
      method: "DELETE",
      url: "/users/me/saved-searches/ssearch_1",
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const del = db.calls.find((c) => /DELETE FROM saved_searches/i.test(c.text));
    assert.ok(del);
    assert.equal(del!.params?.[0], "ssearch_1");
    assert.equal(del!.params?.[1], ME);
  } finally {
    await app.close();
  }
});

// ── listingMatchesSavedSearch ────────────────────────────────────────

const LISTING = {
  id: "lst_1",
  seller_id: "seller_1",
  title: "Nike Air Jordan 1 Mid",
  description: "Worn twice, great condition",
  brand: "Nike",
  category: "sneakers",
  size: "UK 9",
  condition: "Used - Excellent",
  price_gbp: "85.00",
};

test("matcher: query tokens must all appear in listing fields", () => {
  assert.equal(
    listingMatchesSavedSearch(LISTING, { query: "nike jordan", filters: {} }),
    true,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { query: "nike adidas", filters: {} }),
    false,
  );
  // Token may land in description or category, not only the title.
  assert.equal(
    listingMatchesSavedSearch(LISTING, { query: "worn sneakers", filters: {} }),
    true,
  );
});

test("matcher: honours brand/size/condition/category/price filters", () => {
  const base = { query: "jordan", filters: {} as Record<string, unknown> };
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { brands: ["Nike"] } }),
    true,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { brands: ["Adidas"] } }),
    false,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { sizes: ["UK 9"] } }),
    true,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { sizes: ["UK 10"] } }),
    false,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { condition: "Used - Excellent" } }),
    true,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { condition: "New" } }),
    false,
  );
  // 'Any' is the no-constraint sentinel.
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { condition: "Any" } }),
    true,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { category: "sneakers" } }),
    true,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { category: "dresses" } }),
    false,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { minPrice: 50, maxPrice: 100 } }),
    true,
  );
  assert.equal(
    listingMatchesSavedSearch(LISTING, { ...base, filters: { maxPrice: 50 } }),
    false,
  );
});

test("matcher: size filter is an exact normalized match, not a substring", () => {
  const search = (sizes: string[]) => ({ query: "jordan", filters: { sizes } });
  // 'S' must not match 'XS', 'L' must not match 'XL' — substring matching
  // produced these false positives.
  const xsListing = { ...LISTING, size: "XS" };
  assert.equal(listingMatchesSavedSearch(xsListing, search(["XS"])), true);
  assert.equal(listingMatchesSavedSearch(xsListing, search(["S"])), false);
  assert.equal(listingMatchesSavedSearch(xsListing, search(["XXS"])), false);
  const xlListing = { ...LISTING, size: "XL" };
  assert.equal(listingMatchesSavedSearch(xlListing, search(["L"])), false);
  assert.equal(listingMatchesSavedSearch(xlListing, search(["XL"])), true);
  // Normalization: case and internal/outer whitespace are equivalent.
  assert.equal(listingMatchesSavedSearch(LISTING, search(["uk 9"])), true);
  assert.equal(listingMatchesSavedSearch(LISTING, search(["  UK  9 "])), true);
  // ...but a partial token is still not a match ('K 9' ⊄ 'UK 9').
  assert.equal(listingMatchesSavedSearch(LISTING, search(["K 9"])), false);
  // A listing with no size never satisfies a size filter.
  assert.equal(
    listingMatchesSavedSearch({ ...LISTING, size: null }, search(["UK 9"])),
    false,
  );
});

// ── evaluateSavedSearchAlertsForListing ──────────────────────────────

function matcherDb(listingRow: Record<string, unknown> | null, searchRows: Array<Record<string, unknown>>) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const db = {
    calls,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ text, params });
      if (/FROM listings/i.test(text)) {
        return { rows: (listingRow ? [listingRow] : []), rowCount: listingRow ? 1 : 0 } as QueryResult<T>;
      }
      if (/FROM saved_searches/i.test(text)) {
        // Honour the keyset scan: `user_id <> $1` (exclude seller),
        // `id > $2` (cursor) and `LIMIT $3` (batch size), ordered by id —
        // so the tests prove the pagination contract rather than
        // trusting the mock.
        const sellerId = params?.[0];
        const cursor = String(params?.[1] ?? "");
        const limit = Number(params?.[2]);
        const filtered = searchRows
          .filter((r) => r.user_id !== sellerId && String(r.id) > cursor)
          .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          .slice(0, limit);
        return { rows: filtered, rowCount: filtered.length } as unknown as QueryResult<T>;
      }
      return empty<T>();
    },
  };
  return db;
}

test("evaluator enqueues a notification per matching search, seller excluded", async () => {
  const searches = [
    { id: "s_1", user_id: "buyer_1", query: "jordan", filters: {} },
    { id: "s_2", user_id: "buyer_2", query: "adidas", filters: {} }, // no match
    { id: "s_3", user_id: "seller_1", query: "jordan", filters: {} }, // own listing
  ];
  const db = matcherDb(LISTING, searches);
  const enqueued: Array<Record<string, unknown>> = [];
  const outcome = await evaluateSavedSearchAlertsForListing({
    db: db as unknown as Pool,
    listingId: "lst_1",
    queueNotification: async (input) => {
      enqueued.push(input as Record<string, unknown>);
      return "notif_1";
    },
  });
  assert.equal(outcome.evaluated, 2); // seller's own row filtered by SQL
  assert.equal(outcome.notified, 1);
  assert.equal(enqueued.length, 1);
  const notif = enqueued[0] as {
    userId: string;
    eventType: string;
    idempotencyKey: string;
    route: { screen: string; params: Record<string, unknown> };
  };
  assert.equal(notif.userId, "buyer_1");
  assert.equal(notif.eventType, "saved_search_match");
  assert.equal(notif.idempotencyKey, "saved_search_s_1_lst_1");
  assert.equal(notif.route.screen, "Browse");
  assert.equal(notif.route.params.searchQuery, "jordan");
  // last_notified_at is stamped on matched searches.
  assert.ok(db.calls.some((c) => /UPDATE saved_searches/i.test(c.text) && /last_notified_at/.test(c.text)));
});

test("evaluator counts only genuinely enqueued notifications", async () => {
  const searches = [
    { id: "s_1", user_id: "buyer_1", query: "jordan", filters: {} },
    { id: "s_2", user_id: "buyer_2", query: "jordan 1", filters: {} },
  ];
  const db = matcherDb(LISTING, searches);
  // First call dedupes (returns null — already sent), second enqueues.
  let call = 0;
  const outcome = await evaluateSavedSearchAlertsForListing({
    db: db as unknown as Pool,
    listingId: "lst_1",
    queueNotification: async () => (call++ === 0 ? null : "notif_2"),
  });
  assert.equal(outcome.notified, 1);
  // last_notified_at is stamped ONLY on the search whose enqueue
  // succeeded — the deduped search (null return) must not be stamped.
  const stamp = db.calls.find(
    (c) => /UPDATE saved_searches/i.test(c.text) && /last_notified_at/.test(c.text),
  );
  assert.ok(stamp);
  assert.deepEqual(stamp!.params?.[0], ["s_2"]);
});

test("evaluator scans the full subscriber set in keyset batches (no global cap)", async () => {
  const many = Array.from({ length: 10 }, (_, i) => ({
    id: `s_${i}`,
    user_id: `buyer_${i}`,
    query: "jordan",
    filters: {},
  }));
  const db = matcherDb(LISTING, many);
  const outcome = await evaluateSavedSearchAlertsForListing({
    db: db as unknown as Pool,
    listingId: "lst_1",
    queueNotification: async () => "notif_x",
    batchSize: 3,
  });
  // batchSize is the page size, not a ceiling — all 10 searches are
  // evaluated across successive keyset pages regardless of position.
  assert.equal(outcome.evaluated, 10);
  assert.equal(outcome.notified, 10);
  const scans = db.calls.filter((c) => /FROM saved_searches/i.test(c.text));
  assert.equal(scans.length, 4); // 3 + 3 + 3 + 1 rows per page
  // Each page resumes strictly after the previous page's last id —
  // ordering is stable (`ORDER BY id ASC`), so every row is visited
  // exactly once and no subscriber can be starved.
  assert.deepEqual(
    scans.map((c) => c.params?.[1]),
    ["", "s_2", "s_5", "s_8"],
  );
  assert.ok(scans.every((c) => c.params?.[2] === 3));

  // Non-active / missing listing → no candidate scan at all.
  const db2 = matcherDb(null, many);
  const outcome2 = await evaluateSavedSearchAlertsForListing({
    db: db2 as unknown as Pool,
    listingId: "lst_gone",
    queueNotification: async () => "notif_x",
  });
  assert.deepEqual(outcome2, { evaluated: 0, notified: 0 });
  assert.equal(db2.calls.some((c) => /FROM saved_searches/i.test(c.text)), false);
});
