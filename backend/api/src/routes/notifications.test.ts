import assert from "node:assert/strict";
import test from "node:test";

import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";

import { registerNotificationRoutes } from "./notifications.js";
import {
  NOTIFICATION_EVENT_REGISTRY,
  NOTIFICATION_FILTER_EVENT_TYPES,
  resolveNotificationEventMetadata,
  upgradeNotificationEventV2,
} from "../lib/notificationEventRegistry.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface AuthenticatedUser {
  userId: string;
  role: "user" | "seller" | "moderator" | "admin";
  sessionId: string;
}

interface MockQueryResult<T extends Record<string, unknown> = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

type QueryMatcher = (text: string, params: unknown[]) => MockQueryResult | undefined;

// ── Mock DB factory ──────────────────────────────────────────────────────────
// Same pattern as supportReviews.test.ts: a Pool stub whose `query` delegates
// to a per-test matcher keyed on SQL fragments.

function createMockDb(matcher: QueryMatcher): Pool {
  const db = {
    query: (text: string, params?: unknown[]) => {
      const result = matcher(text, params ?? []);
      if (result === undefined) {
        return { rows: [], rowCount: 0 };
      }
      return result;
    },
  } as unknown as Pool;
  return db;
}

function rows<T extends Record<string, unknown>>(r: T[]): MockQueryResult<T> {
  return { rows: r, rowCount: r.length };
}

// ── Query fingerprints ───────────────────────────────────────────────────────
// The events handler issues up to three statements; these predicates keep
// them apart in the matcher.

const isListQuery = (text: string) =>
  text.includes("FROM notification_events ne") &&
  text.includes("LEFT JOIN users u") &&
  text.includes("ORDER BY ne.created_at DESC");

const isFilteredCountQuery = (text: string) =>
  text.includes("SELECT COUNT(*)::text AS count") &&
  text.includes("FROM notification_events ne");

const isFilterCountsQuery = (text: string) =>
  text.includes("GROUP BY ne.event_type");

const isMarkReadQuery = (text: string) =>
  text.includes("UPDATE notification_events") &&
  text.includes("SET read_at = NOW()") &&
  text.includes("RETURNING id");

const isReadAllQuery = (text: string) =>
  text.includes("UPDATE notification_events") &&
  text.includes("read_at IS NULL") &&
  !text.includes("RETURNING");

// ── Test app builder ─────────────────────────────────────────────────────────

async function createTestApp(db: Pool): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.addHook("preHandler", async (request) => {
    const userId = request.headers["x-test-user-id"] as string | undefined;
    if (userId) {
      const role = (request.headers["x-test-user-role"] as string) || "user";
      (request as unknown as { authUser?: AuthenticatedUser }).authUser = {
        userId,
        role: role as AuthenticatedUser["role"],
        sessionId: "test-session",
      };
    }
  });

  registerNotificationRoutes({
    app,
    db,
    notificationPushCategories: [
      "messages",
      "offers",
      "wishlist",
      "followers",
      "orderUpdates",
      "priceDrops",
      "auctionAlerts",
      "news",
    ],
    queueUserNotification: async () => "notif_test",
    toJsonString: (value) => JSON.stringify(value),
  });

  return app;
}

function authHeaders(userId: string): Record<string, string> {
  return { "x-test-user-id": userId };
}

// ── Row fixtures ─────────────────────────────────────────────────────────────

function eventRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "notif_1",
    user_id: "user_1",
    channel: "push",
    title: "Title",
    body: "Body",
    payload: {},
    status: "sent",
    provider_message_id: null,
    provider_error: null,
    created_at: "2026-01-01T00:00:00.000Z",
    sent_at: "2026-01-01T00:00:01.000Z",
    event_type: "order_created",
    actor_user_id: null,
    read_at: null,
    image_url: null,
    route: null,
    actor_username: null,
    actor_display_name: null,
    actor_avatar: null,
    ...overrides,
  };
}

// ── GET /notifications/events — filterCounts contract ────────────────────────

test("GET /notifications/events returns per-filter counts keyed by frontend filter names", async () => {
  const db = createMockDb((text) => {
    if (isListQuery(text)) {
      return rows([eventRow()]);
    }
    if (isFilterCountsQuery(text)) {
      return rows([
        { event_type: "order_created", total: "3", unread: "2" },
        { event_type: "offer_accepted", total: "1", unread: "1" },
        { event_type: "auction_outbid", total: "2", unread: "0" },
        { event_type: "price_drop", total: "1", unread: "0" },
        { event_type: "review_received", total: "4", unread: "4" },
        { event_type: "live_started", total: "1", unread: "0" },
        // chat_message is in no filter bucket — counts toward all/unread only.
        { event_type: "chat_message", total: "5", unread: "5" },
      ]);
    }
    return undefined;
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/notifications/events",
    headers: authHeaders("user_1"),
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.items.length, 1);
  // No filter param → no filteredCount field.
  assert.equal(payload.filteredCount, undefined);

  assert.deepEqual(payload.filterCounts, {
    all: 17,
    unread: 12,
    order: 4, // 3 order_created + 1 offer_accepted
    new_item: 1, // live_started
    review: 4,
    price: 1,
    auction: 2,
  });

  await app.close();
});

test("GET /notifications/events applies eventType filter and returns filteredCount", async () => {
  const seenParams: unknown[][] = [];
  const db = createMockDb((text, params) => {
    seenParams.push(params);
    if (isListQuery(text)) {
      assert.ok(
        text.includes("ne.event_type = ANY"),
        "list query must restrict on event_type",
      );
      return rows([eventRow({ event_type: "price_drop" })]);
    }
    if (isFilteredCountQuery(text)) {
      return rows([{ count: "7" }]);
    }
    if (isFilterCountsQuery(text)) {
      return rows([{ event_type: "price_drop", total: "7", unread: "7" }]);
    }
    return undefined;
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/notifications/events?eventType=price_drop",
    headers: authHeaders("user_1"),
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.filteredCount, 7);
  assert.deepEqual(payload.filterCounts, {
    all: 7,
    unread: 7,
    order: 0,
    new_item: 0,
    review: 0,
    price: 7,
    auction: 0,
  });
  // The ANY($n::text[]) param carries the requested type list.
  assert.ok(
    seenParams.some((params) =>
      params.some((p) => Array.isArray(p) && p.includes("price_drop")),
    ),
    "expected the eventType allowlist to reach the query params",
  );

  await app.close();
});

test("GET /notifications/events?unread=true restricts to unread rows", async () => {
  let sawUnreadCondition = false;
  const db = createMockDb((text) => {
    if (isListQuery(text)) {
      sawUnreadCondition = text.includes("ne.read_at IS NULL");
      return rows([]);
    }
    if (isFilteredCountQuery(text)) {
      assert.ok(text.includes("ne.read_at IS NULL"));
      return rows([{ count: "0" }]);
    }
    if (isFilterCountsQuery(text)) {
      return rows([]);
    }
    return undefined;
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/notifications/events?unread=true",
    headers: authHeaders("user_1"),
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(sawUnreadCondition, true);
  assert.equal(payload.filteredCount, 0);
  assert.deepEqual(payload.filterCounts, {
    all: 0,
    unread: 0,
    order: 0,
    new_item: 0,
    review: 0,
    price: 0,
    auction: 0,
  });

  await app.close();
});

// ── Unknown / empty filter handling ──────────────────────────────────────────

test("unknown eventType filter returns an empty page, not an error", async () => {
  const db = createMockDb((text) => {
    if (isListQuery(text)) {
      return rows([]);
    }
    if (isFilteredCountQuery(text)) {
      return rows([{ count: "0" }]);
    }
    if (isFilterCountsQuery(text)) {
      return rows([{ event_type: "order_created", total: "2", unread: "1" }]);
    }
    return undefined;
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/notifications/events?eventType=not_a_real_type",
    headers: authHeaders("user_1"),
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.deepEqual(payload.items, []);
  assert.equal(payload.filteredCount, 0);
  // Badges still describe the full set even though the page is empty.
  assert.equal(payload.filterCounts.all, 2);
  assert.equal(payload.filterCounts.order, 2);

  await app.close();
});

test("eventType + role intersection resolving to zero types still emits filterCounts", async () => {
  const db = createMockDb((text) => {
    if (isFilterCountsQuery(text)) {
      return rows([{ event_type: "auction_won", total: "1", unread: "1" }]);
    }
    // The empty-intersection early return must not run the list query.
    assert.ok(
      !isListQuery(text),
      "list query should be skipped when the filter resolves to zero types",
    );
    return undefined;
  });
  const app = await createTestApp(db);

  // chat_message has role 'social' — intersecting it with role=auction
  // yields zero allowed types.
  const response = await app.inject({
    method: "GET",
    url: "/notifications/events?eventType=chat_message&role=auction",
    headers: authHeaders("user_1"),
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.deepEqual(payload.items, []);
  assert.equal(payload.filteredCount, 0);
  assert.equal(payload.filterCounts.auction, 1);
  assert.equal(payload.filterCounts.all, 1);

  await app.close();
});

test("malformed eventType values are rejected with INVALID_NOTIFICATION_FILTER", async () => {
  const db = createMockDb(() => undefined);
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "GET",
    url: `/notifications/events?eventType=${encodeURIComponent("bad type!")}`,
    headers: authHeaders("user_1"),
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "INVALID_NOTIFICATION_FILTER");

  await app.close();
});

test("GET /notifications/events requires authentication", async () => {
  const db = createMockDb(() => undefined);
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/notifications/events",
  });

  assert.equal(response.statusCode, 401);

  await app.close();
});

// ── Aggregated mark-read fan-out contract ────────────────────────────────────
// Aggregated cards fan out one POST /notifications/events/:eventId/read per
// member id. Members already read (or deleted between page load and tap)
// return 404 NOTIFICATION_NOT_FOUND — the client treats that as success, so
// the status/code shape is a hard contract.

test("POST /notifications/events/:eventId/read marks an unread event read", async () => {
  const db = createMockDb((text, params) => {
    if (isMarkReadQuery(text)) {
      assert.equal(params[0], "notif_1");
      assert.equal(params[1], "user_1");
      return rows([{ id: "notif_1" }]);
    }
    return undefined;
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    url: "/notifications/events/notif_1/read",
    headers: authHeaders("user_1"),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);

  await app.close();
});

test("POST /notifications/events/:eventId/read returns NOTIFICATION_NOT_FOUND for already-read members", async () => {
  const db = createMockDb((text) => {
    if (isMarkReadQuery(text)) {
      // read_at IS NULL predicate excluded the row — nothing updated.
      return { rows: [], rowCount: 0 };
    }
    return undefined;
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    url: "/notifications/events/notif_stale/read",
    headers: authHeaders("user_1"),
  });

  assert.equal(response.statusCode, 404);
  const payload = response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "NOTIFICATION_NOT_FOUND");

  await app.close();
});

test("POST /notifications/read-all marks every unread event for the auth user", async () => {
  let readAllParams: unknown[] | null = null;
  const db = createMockDb((text, params) => {
    if (isReadAllQuery(text)) {
      readAllParams = params;
      assert.ok(text.includes("user_id = $1"), "read-all must scope to the user");
      return { rows: [], rowCount: 3 };
    }
    return undefined;
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    url: "/notifications/read-all",
    headers: authHeaders("user_1"),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.deepEqual(readAllParams, ["user_1"]);

  await app.close();
});

// ── Registry mirror + unknown-event semantics ────────────────────────────────

test("NOTIFICATION_FILTER_EVENT_TYPES covers exactly the frontend buckets", () => {
  assert.deepEqual(Object.keys(NOTIFICATION_FILTER_EVENT_TYPES).sort(), [
    "auction",
    "new_item",
    "order",
    "price",
    "review",
  ]);
});

test("every filter bucket type is registered in the V2 registry", () => {
  for (const [filter, types] of Object.entries(NOTIFICATION_FILTER_EVENT_TYPES)) {
    for (const type of types) {
      assert.ok(
        NOTIFICATION_EVENT_REGISTRY[type],
        `filter '${filter}' lists unregistered event type '${type}'`,
      );
    }
  }
});

test("unknown event types resolve to generic semantics", () => {
  const metadata = resolveNotificationEventMetadata("not_a_real_type");
  assert.equal(metadata.semanticRole, "system");
  assert.equal(metadata.attention, "info");
  assert.equal(metadata.requiresAction, false);

  const upgraded = upgradeNotificationEventV2({
    id: "notif_x",
    eventType: "not_a_real_type",
    payload: { listingId: "lst_1" },
  });
  assert.equal(upgraded.semanticRole, "system");
  assert.equal(upgraded.aggregationKey, null);
  assert.equal(upgraded.objectRef, undefined);
});
