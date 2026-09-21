/**
 * GET /search — scoped + fused search contract tests (audit R98).
 *
 * Registers the real `registerSearchRoutes` against a minimal Fastify app
 * with a scripted `pg.Pool` (same pattern as routes/searchExtended.test.ts).
 * The items leg runs on the in-memory SearchAdapter (no MEILISEARCH_URL in
 * test env), seeded through the exported `searchIndex` singleton.
 *
 * Covered:
 *   - scope=boards serves public moodboards via postgres ILIKE with the
 *     tile contract fields (coverImage, curatorUsername, itemCount, score)
 *   - scope=people serves search-visible users with tiered CASE scores
 *   - boards/people SQL carries the bidirectional block-exclusion clause
 *   - scope=all fuses items + people + boards into one `results` list via
 *     reciprocal rank fusion (position-based — scope scores are
 *     incomparable), stamped with type + rawScore + counts
 *   - the default items scope keeps its legacy shape (+ additive type/scope)
 *   - an unknown scope is a 400
 */

import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";

import { registerSearchRoutes } from "../routes/search.js";
import { searchIndex } from "../lib/searchIndex.js";

const BOARD_ROW = {
  id: "mbd_1",
  creator_id: "usr_creator",
  title: "Vintage denim moodboard",
  description: "Denim inspiration",
  cover_image_url: "https://cdn.example.com/mbd_1.jpg",
  theme: "theme-linen",
  item_count: 4,
  created_at: "2026-01-10T00:00:00.000Z",
  updated_at: "2026-01-12T00:00:00.000Z",
  curator_username: "curatorone",
  curator_name: "Curator One",
  curator_avatar: "https://cdn.example.com/av_1.jpg",
  score: 0.6,
};

const PERSON_ROW = {
  id: "usr_p1",
  username: "vintagevicky",
  display_name: "Vicky V",
  avatar: "https://cdn.example.com/av_p1.jpg",
  is_following: false,
  score: 0.8,
};

const LISTING_CARD_ROW = {
  id: "lst_v1",
  seller_id: "usr_s1",
  image_url: "https://cdn.example.com/lst_v1.jpg",
  seller_username: "sellerone",
};

function empty<T extends QueryResultRow>(): QueryResult<T> {
  return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
}

function rows<T extends QueryResultRow>(r: T[]): QueryResult<T> {
  return { rows: r, rowCount: r.length } as QueryResult<T>;
}

const isBlocksQuery = (text: string) => text.includes("FROM user_blocks");
const isBoardsQuery = (text: string) => text.includes("FROM moodboards m");
const isPeopleQuery = (text: string) =>
  text.includes("FROM users u") && text.includes("search_visibility");
const isListingCardQuery = (text: string) =>
  text.includes("FROM listings l") && text.includes("l.id = ANY($1::text[])");
// Serving-time safety net on the items leg — every returned id is
// re-checked against live `status = 'active'` rows before render.
const isListingRecheckQuery = (text: string) =>
  text.includes("SELECT id, seller_id FROM listings") &&
  text.includes("id = ANY($1::text[])");

function fakeDb(matcher: (text: string) => QueryResult | undefined) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const db = {
    calls,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ text, params });
      return (matcher(text) ?? empty()) as QueryResult<T>;
    },
  };
  return db;
}

async function buildApp(db: ReturnType<typeof fakeDb>) {
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
// process, so the singleton does not leak into other suites.
searchIndex.addListing({
  id: "lst_v1",
  sellerId: "usr_s1",
  title: "Vintage denim jacket",
  description: "Classic wash",
  category: "Jackets",
  brand: "Levi's",
  size: "M",
  condition: "good",
  priceGbp: 40,
  imageUrl: "https://cdn.example.com/lst_v1.jpg",
  createdAt: "2026-01-09T00:00:00.000Z",
  sellerRating: null,
  viewCount: 0,
  saleCount: 0,
  sellerUsername: "sellerone",
});

// ── scope=boards ─────────────────────────────────────────────────────────────

test("scope=boards serves public moodboards with the tile contract fields", async () => {
  const db = fakeDb((text) => {
    if (isBoardsQuery(text)) return rows([BOARD_ROW]);
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({ method: "GET", url: "/search?q=denim&scope=boards" });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    ok: boolean;
    scope: string;
    total: number;
    retrievalMeta?: { method: string; searchEngineVersion?: string };
    items: Array<Record<string, unknown>>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.scope, "boards");
  assert.equal(body.total, 1);
  // SQL scopes honestly report the postgres path, not a search engine.
  assert.equal(body.retrievalMeta?.method, "lexical");
  assert.equal(body.retrievalMeta?.searchEngineVersion, "scoped-search-postgres-v1");

  const board = body.items[0];
  assert.equal(board.type, "board");
  assert.equal(board.id, "mbd_1");
  assert.equal(board.title, BOARD_ROW.title);
  assert.equal(board.coverImage, BOARD_ROW.cover_image_url);
  assert.equal(board.curatorUsername, "curatorone");
  assert.equal(board.creatorId, "usr_creator");
  assert.equal(board.itemCount, 4);
  assert.equal(board.score, 0.6);

  const sql = db.calls.find((c) => isBoardsQuery(c.text))?.text ?? "";
  // Same visibility gate as GET /moodboards — public, non-trashed only.
  assert.match(sql, /m\.visibility = 'public'/);
  assert.match(sql, /m\.deleted_at IS NULL/);
  assert.match(sql, /m\.title ILIKE '%' \|\| \$1 \|\| '%'/);
  // Blocked creators are excluded through the bidirectional block list.
  assert.match(sql, /NOT \(m\.creator_id = ANY\(\$2::text\[\]\)\)/);
});

test("scope=boards with an authenticated viewer binds the block list", async () => {
  const db = fakeDb((text) => {
    if (isBlocksQuery(text)) return rows([{ other_id: "usr_blocked" }]);
    if (isBoardsQuery(text)) return rows([BOARD_ROW]);
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({
    method: "GET",
    url: "/search?q=denim&scope=boards",
    headers: { "x-test-user": "viewer_1" },
  });
  assert.equal(res.statusCode, 200);

  const boardsCall = db.calls.find((c) => isBoardsQuery(c.text));
  assert.ok(boardsCall);
  const params = (boardsCall?.params ?? []) as unknown[];
  assert.ok(
    params.some((p) => Array.isArray(p) && p.includes("usr_blocked")),
    "blocked creator ids must be bound into the boards query",
  );
});

// ── scope=people ─────────────────────────────────────────────────────────────

test("scope=people serves search-visible users with tiered scores", async () => {
  const db = fakeDb((text) => {
    if (isPeopleQuery(text)) return rows([PERSON_ROW]);
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({ method: "GET", url: "/search?q=vicky&scope=people" });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    ok: boolean;
    scope: string;
    items: Array<Record<string, unknown>>;
  };
  assert.equal(body.scope, "people");
  assert.equal(body.items.length, 1);
  const person = body.items[0];
  assert.equal(person.type, "person");
  assert.equal(person.id, "usr_p1");
  assert.equal(person.username, "vintagevicky");
  assert.equal(person.displayName, "Vicky V");
  assert.equal(person.isFollowing, false);
  assert.equal(person.score, 0.8);

  const sql = db.calls.find((c) => isPeopleQuery(c.text))?.text ?? "";
  // Mirrors /users/search: visibility opt-in, not erased, not deleted.
  assert.match(sql, /u\.search_visibility = 'visible'/);
  assert.match(sql, /u\.is_erased = FALSE/);
  assert.match(sql, /u\.deleted_at IS NULL/);
});

// ── scope=all (fused) ────────────────────────────────────────────────────────

test("scope=all fuses items, people and boards into one RRF-ranked list", async () => {
  const db = fakeDb((text) => {
    if (isBoardsQuery(text)) return rows([BOARD_ROW]);
    if (isPeopleQuery(text)) return rows([PERSON_ROW]);
    if (isListingCardQuery(text)) return rows([LISTING_CARD_ROW]);
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({ method: "GET", url: "/search?q=vintage&scope=all&limit=10" });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    ok: boolean;
    scope: string;
    total: number;
    counts: { items: number; people: number; boards: number };
    retrievalMeta?: { method: string };
    results: Array<{
      id: string;
      type: string;
      score: number;
      rawScore: number;
      data: Record<string, unknown>;
    }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.scope, "all");
  assert.equal(body.retrievalMeta?.method, "lexical");
  assert.equal(body.counts.items, 1);
  assert.equal(body.counts.people, 1);
  assert.equal(body.counts.boards, 1);
  assert.equal(body.results.length, 3);

  // Every hit carries a prefixed id, the fused RRF score and the scope's
  // own score preserved as rawScore.
  const types = body.results.map((r) => r.type);
  assert.deepEqual(new Set(types), new Set(["item", "person", "board"]));
  for (const hit of body.results) {
    assert.ok(hit.id.startsWith(`${hit.type}:`));
    assert.ok(hit.score > 0);
    assert.ok(hit.rawScore > 0);
  }
  // Scores are non-increasing — the list is one merged ranking.
  for (let i = 1; i < body.results.length; i++) {
    assert.ok(body.results[i - 1].score >= body.results[i].score);
  }

  // The item leg carries the card fields the fused tile needs — the index
  // document alone has no imageUrl.
  const item = body.results.find((r) => r.type === "item");
  assert.equal(item?.data.id, "lst_v1");
  assert.equal(item?.data.imageUrl, LISTING_CARD_ROW.image_url);
  assert.equal(item?.data.sellerUsername, "sellerone");
});

test("scope=all still returns people/boards when the item leg is empty", async () => {
  const db = fakeDb((text) => {
    if (isBoardsQuery(text)) return rows([BOARD_ROW]);
    if (isPeopleQuery(text)) return rows([PERSON_ROW]);
    return undefined;
  });
  const app = await buildApp(db);

  // "zzz-no-match" matches nothing in the in-memory item index.
  const res = await app.inject({ method: "GET", url: "/search?q=zzz&scope=all" });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    counts: { items: number; people: number; boards: number };
    results: Array<{ type: string }>;
  };
  assert.equal(body.counts.items, 0);
  assert.equal(body.counts.people, 1);
  assert.equal(body.counts.boards, 1);
  assert.deepEqual(
    new Set(body.results.map((r) => r.type)),
    new Set(["person", "board"]),
  );
});

// ── Default scope stays backward compatible ──────────────────────────────────

test("default scope=items keeps the legacy items payload", async () => {
  const db = fakeDb((text) => {
    // The items leg unconditionally re-checks hits against live
    // status='active' rows (index-lag safety net) — corroborate the
    // seeded listing so it survives the filter.
    if (isListingRecheckQuery(text)) {
      return rows([{ id: "lst_v1", seller_id: "usr_s1" }]);
    }
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({ method: "GET", url: "/search?q=vintage" });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    ok: boolean;
    scope: string;
    items: Array<Record<string, unknown>>;
    results?: unknown;
  };
  assert.equal(body.ok, true);
  assert.equal(body.scope, "items");
  assert.ok(Array.isArray(body.items));
  assert.equal(body.items[0]?.type, "item");
  assert.equal(body.items[0]?.id, "lst_v1");
  // The fused envelope must not leak into the scoped response.
  assert.equal(body.results, undefined);
});

test("an unknown scope is rejected with 400", async () => {
  const db = fakeDb(() => undefined);
  const app = await buildApp(db);

  const res = await app.inject({ method: "GET", url: "/search?q=denim&scope=shops" });
  assert.equal(res.statusCode, 400);
  const body = res.json() as { ok: boolean };
  assert.equal(body.ok, false);
});
