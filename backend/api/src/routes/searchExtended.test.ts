/**
 * GET /search/listings — pg_trgm fallback tests (migration 298).
 *
 * Registers the real `registerSearchExtendedRoutes` against a minimal
 * Fastify app with a scripted `pg.Pool` and the in-memory mock Redis from
 * searchCache.ts (same pattern as savedSearches.test.ts). The pool script
 * answers "0 rows" to the FTS query so the trigram/substring fallback
 * path is exercised, and records every SQL statement so tests can assert
 * which clauses the fallback query actually contained.
 *
 * Covered:
 *   - typo-length queries (>= 3 chars) get trgm similarity clauses and
 *     report fallbackReason 'fts_no_matches_trgm'
 *   - 2-char queries stay substring-only and keep reporting
 *     'fts_no_matches_ilike_fallback' (trgm on short strings is garbage)
 *   - relevance sort ranks fallback hits by GREATEST(title, brand)
 *     similarity; non-relevance sorts keep the caller's ORDER BY
 *   - status='active' and structured filters carry into the fallback
 *   - fallbackReason survives the results-cache round trip
 *   - a successful FTS query never reports a fallback
 */

import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";

import { registerSearchExtendedRoutes } from "./searchExtended.js";
import { createMockRedis } from "../lib/searchCache.js";

const LISTING_ROW = {
  id: "lst_1",
  seller_id: "usr_1",
  title: "Nike Air Max 90 — barely worn",
  description: "Classic sneakers, great condition.",
  price_gbp: "45.00",
  image_url: "https://cdn.example.com/lst_1.jpg",
  created_at: "2026-01-10T00:00:00.000Z",
  rank_score: "0.12",
  seller_username: "sellerone",
  brand: "Nike",
  size: "UK 9",
  condition: "good",
  category: "Shoes",
};

function empty<T extends QueryResultRow>(): QueryResult<T> {
  return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
}

function rows<T extends QueryResultRow>(r: T[]): QueryResult<T> {
  return { rows: r, rowCount: r.length } as QueryResult<T>;
}

const isFtsQuery = (text: string) => text.includes("l.search_vector @@");
const isFallbackQuery = (text: string) =>
  text.includes("POSITION(lower($1) IN lower(l.title))");
const isMediaQuery = (text: string) => text.includes("FROM listing_images");

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
    fallbackCalls() {
      return calls.filter((c) => isFallbackQuery(c.text));
    },
  };
  return db;
}

async function buildApp(db: ReturnType<typeof fakeDb>) {
  const app = Fastify();
  registerSearchExtendedRoutes({
    app,
    db: db as unknown as Pool,
    readDb: db as unknown as Pool,
    redis: createMockRedis(),
  });
  await app.ready();
  return app;
}

// ── Trigram fallback ──────────────────────────────────────────────────────────

test("typo query falls back to trgm similarity and discloses the reason", async () => {
  const db = fakeDb((text) => {
    if (isFtsQuery(text)) return empty(); // FTS misses on "nikee"
    if (isFallbackQuery(text)) return rows([LISTING_ROW]);
    if (isMediaQuery(text)) return empty();
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({ method: "GET", url: "/search/listings?q=nikee" });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    ok: boolean;
    fallback?: boolean;
    retrievalMeta?: { method: string; fallbackReason?: string };
    items: Array<{ id: string; title: string }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.fallback, true);
  assert.equal(body.retrievalMeta?.method, "lexical");
  assert.equal(body.retrievalMeta?.fallbackReason, "fts_no_matches_trgm");
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].title, LISTING_ROW.title);

  const fallbackSql = db.fallbackCalls()[0]?.text ?? "";
  assert.match(fallbackSql, /l\.title % \$1/);
  assert.match(fallbackSql, /similarity\(l\.title, \$1\) > 0\.2/);
  assert.match(fallbackSql, /l\.brand % \$1/);
  assert.match(fallbackSql, /similarity\(COALESCE\(l\.brand, ''\), \$1\) > 0\.25/);
  // Substring clauses are preserved alongside the trigram ones.
  assert.match(fallbackSql, /POSITION\(lower\(\$1\) IN lower\(l\.title\)\) > 0/);
  // Same visibility/scope filters as the primary query.
  assert.match(fallbackSql, /l\.status = 'active'/);
  // Relevance sort ranks by best title/brand similarity, demoted by the
  // seller-reach multiplier for 'limited' sellers.
  assert.match(fallbackSql, /ORDER BY GREATEST\(similarity\(l\.title, \$1\), similarity\(COALESCE\(l\.brand, ''\), \$1\)\) \* CASE COALESCE\(u\.reach_state, 'normal'\)/);
});

test("2-char query stays substring-only and keeps the ilike fallback reason", async () => {
  const db = fakeDb((text) => {
    if (isFtsQuery(text)) return empty();
    if (isFallbackQuery(text)) return rows([LISTING_ROW]);
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({ method: "GET", url: "/search/listings?q=ni" });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    retrievalMeta?: { fallbackReason?: string };
  };
  assert.equal(body.retrievalMeta?.fallbackReason, "fts_no_matches_ilike_fallback");

  const fallbackSql = db.fallbackCalls()[0]?.text ?? "";
  assert.ok(fallbackSql.length > 0, "fallback query should have run");
  assert.ok(!fallbackSql.includes("similarity("), "short queries must not emit similarity()");
  assert.ok(!fallbackSql.includes("% $1"), "short queries must not emit the % operator");
  assert.ok(!fallbackSql.includes("GREATEST(similarity"), "short queries must not rank by similarity");
});

test("non-relevance sort keeps the caller's ORDER BY in the trgm fallback", async () => {
  const db = fakeDb((text) => {
    if (isFtsQuery(text)) return empty();
    if (isFallbackQuery(text)) return rows([LISTING_ROW]);
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({
    method: "GET",
    url: "/search/listings?q=nikee&sort=price_asc",
  });
  assert.equal(res.statusCode, 200);

  const fallbackSql = db.fallbackCalls()[0]?.text ?? "";
  // Trigram matching still applies to WHERE…
  assert.match(fallbackSql, /l\.title % \$1/);
  // …but ordering stays the requested price sort, not similarity.
  assert.match(fallbackSql, /ORDER BY l\.price_gbp ASC, l\.id DESC/);
  assert.ok(!fallbackSql.includes("GREATEST(similarity"));
});

test("structured filters carry into the fallback query", async () => {
  const db = fakeDb((text) => {
    if (isFtsQuery(text)) return empty();
    if (isFallbackQuery(text)) return rows([LISTING_ROW]);
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({
    method: "GET",
    url: "/search/listings?q=nikee&category=Shoes&priceMax=100",
  });
  assert.equal(res.statusCode, 200);

  const fallbackCall = db.fallbackCalls()[0];
  assert.ok(fallbackCall, "fallback query should have run");
  assert.match(fallbackCall.text, /l\.category = \$\d+/);
  assert.match(fallbackCall.text, /l\.price_gbp <= \$\d+/);
  const params = (fallbackCall.params ?? []) as unknown[];
  assert.ok(params.includes("Shoes"));
  assert.ok(params.includes(100));
});

test("fallbackReason survives the results-cache round trip", async () => {
  const db = fakeDb((text) => {
    if (isFtsQuery(text)) return empty();
    if (isFallbackQuery(text)) return rows([LISTING_ROW]);
    return undefined;
  });
  const app = await buildApp(db);

  const first = await app.inject({ method: "GET", url: "/search/listings?q=nikee" });
  assert.equal(first.statusCode, 200);
  const callsAfterMiss = db.calls.length;
  assert.ok(callsAfterMiss > 0);

  // setCachedSearchResult is fire-and-forget on a miss — flush microtasks
  // before the second request so the cache write has landed.
  await new Promise((resolve) => setImmediate(resolve));

  const second = await app.inject({ method: "GET", url: "/search/listings?q=nikee" });
  assert.equal(second.statusCode, 200);
  const body = second.json() as {
    fromCache?: boolean;
    fallback?: boolean;
    retrievalMeta?: { fallbackReason?: string };
  };
  assert.equal(body.fromCache, true);
  assert.equal(body.fallback, true);
  assert.equal(
    body.retrievalMeta?.fallbackReason,
    "fts_no_matches_trgm",
    "cached payload must still disclose the trgm fallback",
  );
  // Promoted-slot serving queries (listing_promotions etc.) legitimately run
  // per-request even on cache hits — daily-fee settlement and impression
  // eligibility are not cacheable. The assertion is about organic search
  // queries (FTS / fallback / media), which must not re-run.
  const organicCalls = (cs: typeof db.calls) =>
    cs.filter((c) => isFtsQuery(c.text) || isFallbackQuery(c.text) || isMediaQuery(c.text));
  assert.equal(
    organicCalls(db.calls).length,
    organicCalls(db.calls.slice(0, callsAfterMiss)).length,
    "cache hit must not re-run organic search queries",
  );
});

test("successful FTS results report no fallback", async () => {
  const db = fakeDb((text) => {
    if (isFtsQuery(text)) return rows([LISTING_ROW]);
    if (isMediaQuery(text)) return empty();
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({ method: "GET", url: "/search/listings?q=nike" });
  assert.equal(res.statusCode, 200);

  const body = res.json() as {
    fallback?: boolean;
    retrievalMeta?: { method: string; fallbackReason?: string };
    items: Array<{ id: string; rank: number }>;
  };
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].rank, 0.12);
  assert.equal(body.fallback, undefined);
  assert.equal(body.retrievalMeta?.fallbackReason, undefined);
  assert.equal(
    db.fallbackCalls().length,
    0,
    "fallback query must not run when FTS produced rows",
  );
});

// ── Promoted slots honour the buyer's explicit filters ──────────────────────

test("the promoted-slot fetch receives the full explicit filter set", async () => {
  const db = fakeDb((text) => {
    if (isFtsQuery(text)) return rows([LISTING_ROW]);
    if (isMediaQuery(text)) return empty();
    return undefined;
  });
  const app = await buildApp(db);

  const res = await app.inject({
    method: "GET",
    url: "/search/listings?q=nike&category=Shoes&condition=good&brands=Nike,Adidas&sizes=UK%209&priceMin=10&priceMax=100&sustainableOnly=true",
  });
  assert.equal(res.statusCode, 200);

  const promotedCall = db.calls.find((c) =>
    c.text.includes("FROM listing_promotions p"),
  );
  assert.ok(promotedCall, "the promoted serving query should run");
  // Every explicit filter is translated into a clause on the sponsored
  // candidate set — a Sponsored unit can never bypass them.
  assert.match(promotedCall.text, /l\.category = \$\d+/);
  assert.match(promotedCall.text, /l\.condition = \$\d+/);
  assert.match(promotedCall.text, /l\.brand = ANY\(\$\d+\)/);
  assert.match(promotedCall.text, /l\.size = ANY\(\$\d+\)/);
  assert.match(promotedCall.text, /l\.price_gbp >= \$\d+/);
  assert.match(promotedCall.text, /l\.price_gbp <= \$\d+/);
  assert.match(promotedCall.text, /sustainability_grade IN \('A', 'B'\)/);

  const params = (promotedCall.params ?? []) as unknown[];
  assert.ok(params.includes("Shoes"));
  assert.ok(params.includes("good"));
  assert.ok(params.includes(10));
  assert.ok(params.includes(100));
  assert.ok(
    params.some((p) => Array.isArray(p) && p.includes("Nike") && p.includes("Adidas")),
    "brands[] is bound as an array param",
  );
  assert.ok(
    params.some((p) => Array.isArray(p) && p.includes("UK 9")),
    "sizes[] is bound as an array param",
  );
});
