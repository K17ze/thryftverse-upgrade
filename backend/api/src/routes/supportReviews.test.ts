import assert from "node:assert/strict";
import test from "node:test";

import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";

import { registerSupportReviewRoutes } from "./supportReviews.js";

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
// Builds a minimal Pool stub whose `query` method delegates to a caller-supplied
// matcher.  Each test configures the matcher to return the rows it wants for a
// given SQL fragment, letting us exercise every branch without a real database.

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

function empty(): MockQueryResult {
  return { rows: [], rowCount: 0 };
}

// ── Test app builder ─────────────────────────────────────────────────────────
// Mirrors the production auth decorator: a preHandler hook reads a synthetic
// `x-test-user-id` / `x-test-user-role` header pair and populates
// `request.authUser`, exactly as the real JWT middleware would.

async function createTestApp(
  db: Pool,
  options: {
    queueUserNotification?: (input: unknown) => Promise<string | null>;
  } = {},
): Promise<FastifyInstance> {
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

  const createApiError = (code: string, message: string): Error => {
    const error = new Error(message) as Error & { code: string; statusCode: number };
    error.code = code;
    error.statusCode = 400;
    return error;
  };

  const queueUserNotification =
    options.queueUserNotification ??
    (async () => "notif_1");

  registerSupportReviewRoutes({
    app,
    db,
    createApiError,
    queueUserNotification,
  });

  return app;
}

// Convenience header builder for authenticated requests.
function authHeaders(
  userId: string,
  role: AuthenticatedUser["role"] = "user",
): Record<string, string> {
  return { "x-test-user-id": userId, "x-test-user-role": role };
}

// ── Helpers to build common order rows ───────────────────────────────────────

function orderRow(
  overrides: Partial<{ buyer_id: string; seller_id: string; status: string }> = {},
): { buyer_id: string; seller_id: string; status: string } {
  return {
    buyer_id: "buyer_1",
    seller_id: "seller_1",
    status: "delivered",
    ...overrides,
  };
}

function reviewRow(
  overrides: Partial<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    updated_at: string;
  }> = {},
): {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
} {
  return {
    id: "review_123",
    rating: 5,
    comment: "Great",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  CONTRACT TESTS — POST /orders/:orderId/review
// ════════════════════════════════════════════════════════════════════════════

test("POST /orders/:orderId/review accepts photoUrls and persists them in review_media", async () => {
  const insertedMedia: { review_id: string; media_url: string; position: number }[] = [];
  let reviewInserted = false;

  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow()]);
    }
    if (text.includes("SELECT id FROM order_reviews WHERE order_id")) {
      return empty();
    }
    if (text.includes("INSERT INTO order_reviews")) {
      reviewInserted = true;
      return empty();
    }
    if (text.includes("INSERT INTO review_media")) {
      // params: [mediaId, reviewId, mediaUrl, position]
      return empty();
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  // Wrap db.query to capture media inserts.
  const origQuery = db.query.bind(db) as (text: string, params?: unknown[]) => Promise<unknown>;
  (db as unknown as { query: (text: string, params?: unknown[]) => Promise<unknown> }).query = (
    text: string,
    params?: unknown[],
  ) => {
    if (text.includes("INSERT INTO review_media") && params) {
      insertedMedia.push({
        review_id: params[1] as string,
        media_url: params[2] as string,
        position: params[3] as number,
      });
    }
    return origQuery(text, params);
  };

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: {
      rating: 5,
      comment: "Amazing product",
      photoUrls: [
        "https://cdn.example.com/photo1.jpg",
        "https://cdn.example.com/photo2.jpg",
      ],
    },
  });

  assert.equal(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.ok(body.review.id);
  assert.deepEqual(body.review.photoUrls, [
    "https://cdn.example.com/photo1.jpg",
    "https://cdn.example.com/photo2.jpg",
  ]);
  assert.equal(reviewInserted, true);
  assert.equal(insertedMedia.length, 2);
  assert.equal(insertedMedia[0].media_url, "https://cdn.example.com/photo1.jpg");
  assert.equal(insertedMedia[0].position, 0);
  assert.equal(insertedMedia[1].media_url, "https://cdn.example.com/photo2.jpg");
  assert.equal(insertedMedia[1].position, 1);
  await app.close();
});

test("POST /orders/:orderId/review with Idempotency-Key returns existing review on replay (200, not 409)", async () => {
  const existing = reviewRow({ id: "review_existing" });

  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow()]);
    }
    if (text.includes("SELECT id FROM order_reviews WHERE order_id")) {
      return rows([{ id: existing.id }]);
    }
    if (text.includes("FROM order_reviews") && text.includes("WHERE order_id")) {
      return rows([existing]);
    }
    if (text.includes("SELECT media_url, position FROM review_media WHERE review_id")) {
      return rows([
        { media_url: "https://cdn.example.com/p1.jpg", position: 0 },
      ]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: { ...authHeaders("buyer_1"), "idempotency-key": "key-abc-123" },
    payload: { rating: 5, comment: "Great" },
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.review.id, "review_existing");
  assert.equal(body.review.rating, 5);
  assert.deepEqual(body.review.photoUrls, ["https://cdn.example.com/p1.jpg"]);
  await app.close();
});

test("POST /orders/:orderId/review without Idempotency-Key returns 409 on duplicate", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow()]);
    }
    if (text.includes("SELECT id FROM order_reviews WHERE order_id")) {
      return rows([{ id: "review_existing" }]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: { rating: 4 },
  });

  assert.equal(response.statusCode, 409);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "REVIEW_ALREADY_EXISTS");
  await app.close();
});

test("POST /orders/:orderId/review rejects reviews from non-buyers (403)", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow({ buyer_id: "buyer_1", seller_id: "seller_1" })]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  // Request as the seller (not the buyer).
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("seller_1"),
    payload: { rating: 5 },
  });

  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "ORDER_ACCESS_DENIED");
  await app.close();
});

test("POST /orders/:orderId/review rejects reviews on non-delivered orders (409)", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow({ status: "shipped" })]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: { rating: 5 },
  });

  assert.equal(response.statusCode, 409);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "ORDER_ACTION_NOT_ALLOWED");
  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  CONTRACT TESTS — GET /orders/:orderId/review
// ════════════════════════════════════════════════════════════════════════════

test("GET /orders/:orderId/review returns photoUrls and sellerResponse when present", async () => {
  const existing = reviewRow({ id: "review_456", comment: "Good stuff" });

  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id FROM orders WHERE id")) {
      return rows([{ buyer_id: "buyer_1", seller_id: "seller_1" }]);
    }
    if (text.includes("FROM order_reviews") && text.includes("WHERE order_id")) {
      return rows([existing]);
    }
    if (text.includes("SELECT media_url, position FROM review_media")) {
      return rows([
        { media_url: "https://cdn.example.com/m1.jpg", position: 0 },
        { media_url: "https://cdn.example.com/m2.jpg", position: 1 },
      ]);
    }
    if (text.includes("SELECT body, created_at FROM review_responses")) {
      return rows([{ body: "Thank you!", created_at: "2024-01-02T00:00:00.000Z" }]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "GET",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.review.id, "review_456");
  assert.deepEqual(body.review.photoUrls, [
    "https://cdn.example.com/m1.jpg",
    "https://cdn.example.com/m2.jpg",
  ]);
  assert.equal(body.review.sellerResponse.text, "Thank you!");
  assert.equal(body.review.sellerResponse.createdAt, "2024-01-02T00:00:00.000Z");
  await app.close();
});

test("GET /orders/:orderId/review returns review with undefined photoUrls and sellerResponse when absent", async () => {
  const existing = reviewRow({ id: "review_789", comment: null });

  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id FROM orders WHERE id")) {
      return rows([{ buyer_id: "buyer_1", seller_id: "seller_1" }]);
    }
    if (text.includes("FROM order_reviews") && text.includes("WHERE order_id")) {
      return rows([existing]);
    }
    if (text.includes("SELECT media_url, position FROM review_media")) {
      return empty();
    }
    if (text.includes("SELECT body, created_at FROM review_responses")) {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "GET",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.review.id, "review_789");
  assert.equal(body.review.photoUrls, undefined);
  assert.equal(body.review.sellerResponse, undefined);
  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  CONTRACT TESTS — POST /reviews/:reviewId/response
// ════════════════════════════════════════════════════════════════════════════

test("POST /reviews/:reviewId/response creates a response (201)", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT r.id, r.seller_id, r.order_id") && text.includes("order_reviews r")) {
      return rows([{ id: "review_123", seller_id: "seller_1", order_id: "order_123" }]);
    }
    if (text.includes("SELECT id, edit_until FROM review_responses WHERE review_id")) {
      return empty();
    }
    if (text.includes("SELECT reviewer_id FROM order_reviews WHERE id")) {
      return rows([{ reviewer_id: "buyer_1" }]);
    }
    if (text.includes("INSERT INTO review_responses")) {
      return empty();
    }
    if (text.includes("INSERT INTO review_response_revisions")) {
      return empty();
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/response",
    headers: authHeaders("seller_1"),
    payload: { text: "Thanks for the review!" },
  });

  assert.equal(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.response.reviewId, "review_123");
  assert.equal(body.response.text, "Thanks for the review!");
  await app.close();
});

test("POST /reviews/:reviewId/response rejects non-seller (403)", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT r.id, r.seller_id, r.order_id") && text.includes("order_reviews r")) {
      return rows([{ id: "review_123", seller_id: "seller_1", order_id: "order_123" }]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  // Request as a random user who is not the seller.
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/response",
    headers: authHeaders("random_user"),
    payload: { text: "I am not the seller" },
  });

  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "RESPONSE_NOT_AUTHORIZED");
  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  CONTRACT TESTS — POST /reviews/:reviewId/report
// ════════════════════════════════════════════════════════════════════════════

test("POST /reviews/:reviewId/report creates a report (201)", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT id FROM order_reviews WHERE id = $1")) {
      return rows([{ id: "review_123" }]);
    }
    if (text.includes("SELECT id FROM review_reports WHERE review_id")) {
      return empty();
    }
    if (text.includes("INSERT INTO review_reports")) {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/report",
    headers: authHeaders("user_1"),
    payload: { reason: "spam", details: "This is spam" },
  });

  assert.equal(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.ok(body.reportId);
  await app.close();
});

test("POST /reviews/:reviewId/report returns 409 on duplicate report from same user", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT id FROM order_reviews WHERE id = $1")) {
      return rows([{ id: "review_123" }]);
    }
    if (text.includes("SELECT id FROM review_reports WHERE review_id")) {
      return rows([{ id: "report_existing" }]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/report",
    headers: authHeaders("user_1"),
    payload: { reason: "spam" },
  });

  assert.equal(response.statusCode, 409);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "REPORT_ALREADY_EXISTS");
  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  CONTRACT TESTS — POST /reviews/:reviewId/moderate
// ════════════════════════════════════════════════════════════════════════════

test("POST /reviews/:reviewId/moderate removes a review (admin only, 200)", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT id, reviewer_id, seller_id, order_id FROM order_reviews WHERE id = $1")) {
      return rows([{ id: "review_123", reviewer_id: "buyer_1", seller_id: "seller_1", order_id: "order_123" }]);
    }
    if (text.includes("INSERT INTO review_moderation_actions")) {
      return empty();
    }
    if (text.includes("INSERT INTO review_publication_state")) {
      return empty();
    }
    if (text.includes("UPDATE review_reports SET status")) {
      return empty();
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/moderate",
    headers: authHeaders("admin_1", "admin"),
    payload: { action: "remove", reason: "Policy violation", policyReference: "TOS-3.2" },
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.ok(body.actionId);
  await app.close();
});

test("POST /reviews/:reviewId/moderate rejects non-admin (403)", async () => {
  const db = createMockDb(() => empty());

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/moderate",
    headers: authHeaders("user_1", "user"),
    payload: { action: "remove", reason: "I want to remove this" },
  });

  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "FORBIDDEN");
  await app.close();
});

test("POST /reviews/:reviewId/moderate allows moderator role (200)", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT id, reviewer_id, seller_id, order_id FROM order_reviews WHERE id = $1")) {
      return rows([{ id: "review_123", reviewer_id: "buyer_1", seller_id: "seller_1", order_id: "order_123" }]);
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/moderate",
    headers: authHeaders("mod_1", "moderator"),
    payload: { action: "escalate", reason: "Needs senior review" },
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  CONTRACT TESTS — POST /reviews/:reviewId/appeal
// ════════════════════════════════════════════════════════════════════════════

test("POST /reviews/:reviewId/appeal creates an appeal (201)", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT id, reviewer_id, seller_id FROM order_reviews WHERE id = $1")) {
      return rows([{ id: "review_123", reviewer_id: "buyer_1", seller_id: "seller_1" }]);
    }
    if (text.includes("SELECT id FROM review_moderation_actions WHERE id = $1 AND review_id = $2")) {
      return rows([{ id: "revmod_abc" }]);
    }
    if (text.includes("INSERT INTO review_appeals")) {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/appeal",
    headers: authHeaders("buyer_1"),
    payload: {
      appealedActionId: "revmod_abc",
      grounds: "factual_error",
      details: "The review was not fake",
    },
  });

  assert.equal(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.ok(body.appealId);
  await app.close();
});

test("POST /reviews/:reviewId/appeal rejects non-participant (403)", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT id, reviewer_id, seller_id FROM order_reviews WHERE id = $1")) {
      return rows([{ id: "review_123", reviewer_id: "buyer_1", seller_id: "seller_1" }]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/appeal",
    headers: authHeaders("random_user"),
    payload: {
      appealedActionId: "revmod_abc",
      grounds: "factual_error",
    },
  });

  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "APPEAL_NOT_AUTHORIZED");
  await app.close();
});

test("POST /reviews/:reviewId/appeal returns 404 when moderation action not found", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT id, reviewer_id, seller_id FROM order_reviews WHERE id = $1")) {
      return rows([{ id: "review_123", reviewer_id: "buyer_1", seller_id: "seller_1" }]);
    }
    if (text.includes("SELECT id FROM review_moderation_actions WHERE id = $1 AND review_id = $2")) {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_123/appeal",
    headers: authHeaders("buyer_1"),
    payload: {
      appealedActionId: "revmod_nonexistent",
      grounds: "factual_error",
    },
  });

  assert.equal(response.statusCode, 404);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "MODERATION_ACTION_NOT_FOUND");
  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  IDEMPOTENCY TESTS
// ════════════════════════════════════════════════════════════════════════════

test("Idempotency: same idempotency key + same body = same result (no duplicate insert)", async () => {
  let insertCallCount = 0;
  let existingCheckCalls = 0;
  const existingReview = reviewRow({ id: "review_first_insert" });

  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow()]);
    }
    if (text.includes("SELECT id FROM order_reviews WHERE order_id")) {
      existingCheckCalls++;
      // First call (initial request) sees no review; subsequent calls
      // (replays) find the review inserted by the first request.
      if (existingCheckCalls === 1) {
        return empty();
      }
      return rows([{ id: existingReview.id }]);
    }
    if (text.includes("FROM order_reviews") && text.includes("WHERE order_id")) {
      return rows([existingReview]);
    }
    if (text.includes("SELECT media_url, position FROM review_media WHERE review_id")) {
      return rows([{ media_url: "https://cdn.example.com/p.jpg", position: 0 }]);
    }
    if (text.includes("INSERT INTO order_reviews")) {
      insertCallCount++;
      return empty();
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);

  // First request — creates the review.
  const res1 = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: { ...authHeaders("buyer_1"), "idempotency-key": "idem-key-1" },
    payload: { rating: 5, comment: "Great" },
  });

  // Second request — same key, same body — should replay, not duplicate.
  const res2 = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: { ...authHeaders("buyer_1"), "idempotency-key": "idem-key-1" },
    payload: { rating: 5, comment: "Great" },
  });

  assert.equal(res1.statusCode, 201);
  assert.equal(res2.statusCode, 200);
  const body1 = JSON.parse(res1.body);
  const body2 = JSON.parse(res2.body);
  assert.equal(body1.ok, true);
  assert.equal(body2.ok, true);
  // The replay returns the existing review id, not a new one.
  assert.equal(body2.review.id, "review_first_insert");
  // Only one INSERT happened (from the first request).
  assert.equal(insertCallCount, 1);
  await app.close();
});

test("Idempotency: concurrent reviews for one order publish once (UNIQUE constraint)", async () => {
  // Simulate a UNIQUE constraint: the first INSERT succeeds, the second
  // throws because the review already exists.  The route's existing-review
  // check happens before INSERT, but under true concurrency both requests
  // can pass the check and race on INSERT.  We simulate the race by making
  // the existing-review check return empty for both, then making the second
  // INSERT throw.
  let insertAttempts = 0;
  let checkCalls = 0;

  const db = createMockDb((text, params) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow()]);
    }
    if (text.includes("SELECT id FROM order_reviews WHERE order_id")) {
      checkCalls++;
      // Both concurrent calls see no existing review.
      return empty();
    }
    if (text.includes("INSERT INTO order_reviews")) {
      insertAttempts++;
      if (insertAttempts === 2) {
        // Simulate UNIQUE constraint violation on the second insert.
        const err = new Error('duplicate key value violates unique constraint "order_reviews_order_id_key"') as Error & { code: string };
        err.code = "23505";
        throw err;
      }
      return empty();
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);

  // Fire two concurrent requests without idempotency keys.
  const [res1, res2] = await Promise.all([
    app.inject({
      method: "POST",
      url: "/orders/order_123/review",
      headers: authHeaders("buyer_1"),
      payload: { rating: 5 },
    }),
    app.inject({
      method: "POST",
      url: "/orders/order_123/review",
      headers: authHeaders("buyer_1"),
      payload: { rating: 5 },
    }),
  ]);

  // Exactly one INSERT succeeded; the other was rejected by the constraint.
  assert.equal(insertAttempts, 2);
  assert.equal(checkCalls, 2);

  // One request should get 201 (winner), the other should get 500 (constraint
  // error propagated — in production this would be caught and retried as a
  // safe replay).  The key invariant: only one review row exists.
  const winner = res1.statusCode === 201 ? res1 : res2;
  const loser = res1.statusCode === 201 ? res2 : res1;
  assert.equal(winner.statusCode, 201);
  assert.ok(loser.statusCode >= 400);
  await app.close();
});

test("Idempotency: concurrent reviews with idempotency key — loser replays to 200", async () => {
  // Same race as above, but both requests carry the same Idempotency-Key.
  // After the constraint violation, the losing request should be able to
  // retry and find the existing review (200).  We simulate this as a
  // two-phase test: first the race, then a safe replay.
  let insertAttempts = 0;

  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow()]);
    }
    if (text.includes("SELECT id FROM order_reviews WHERE order_id")) {
      // After the first insert, subsequent checks find the review.
      if (insertAttempts >= 1) {
        return rows([{ id: "review_winner" }]);
      }
      return empty();
    }
    if (text.includes("FROM order_reviews") && text.includes("WHERE order_id")) {
      return rows([reviewRow({ id: "review_winner" })]);
    }
    if (text.includes("SELECT media_url, position FROM review_media WHERE review_id")) {
      return empty();
    }
    if (text.includes("INSERT INTO order_reviews")) {
      insertAttempts++;
      if (insertAttempts === 2) {
        const err = new Error('duplicate key value') as Error & { code: string };
        err.code = "23505";
        throw err;
      }
      return empty();
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);

  // Phase 1: concurrent race — one wins, one loses with a constraint error.
  const [res1, res2] = await Promise.all([
    app.inject({
      method: "POST",
      url: "/orders/order_123/review",
      headers: { ...authHeaders("buyer_1"), "idempotency-key": "idem-race" },
      payload: { rating: 5 },
    }),
    app.inject({
      method: "POST",
      url: "/orders/order_123/review",
      headers: { ...authHeaders("buyer_1"), "idempotency-key": "idem-race" },
      payload: { rating: 5 },
    }),
  ]);

  const winner = res1.statusCode === 201 ? res1 : res2;
  assert.equal(winner.statusCode, 201);

  // Phase 2: the loser retries with the same idempotency key and gets 200.
  const replay = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: { ...authHeaders("buyer_1"), "idempotency-key": "idem-race" },
    payload: { rating: 5 },
  });

  assert.equal(replay.statusCode, 200);
  const replayBody = JSON.parse(replay.body);
  assert.equal(replayBody.ok, true);
  assert.equal(replayBody.review.id, "review_winner");
  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  ELIGIBILITY TESTS — order status gating
// ════════════════════════════════════════════════════════════════════════════

test("Eligibility: review on pending order = 409", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow({ status: "pending" })]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: { rating: 5 },
  });

  assert.equal(response.statusCode, 409);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "ORDER_ACTION_NOT_ALLOWED");
  await app.close();
});

test("Eligibility: review on delivered order = 201", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow({ status: "delivered" })]);
    }
    if (text.includes("SELECT id FROM order_reviews WHERE order_id")) {
      return empty();
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: { rating: 5 },
  });

  assert.equal(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  await app.close();
});

test("Eligibility: review on completed order = 201", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow({ status: "completed" })]);
    }
    if (text.includes("SELECT id FROM order_reviews WHERE order_id")) {
      return empty();
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: { rating: 4, comment: "Good" },
  });

  assert.equal(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  await app.close();
});

test("Eligibility: review on shipped order = 409", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow({ status: "shipped" })]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: { rating: 5 },
  });

  assert.equal(response.statusCode, 409);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "ORDER_ACTION_NOT_ALLOWED");
  await app.close();
});

test("Eligibility: review on cancelled order = 409", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow({ status: "cancelled" })]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: { rating: 1 },
  });

  assert.equal(response.statusCode, 409);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "ORDER_ACTION_NOT_ALLOWED");
  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  EDGE CASES — auth and not-found paths
// ════════════════════════════════════════════════════════════════════════════

test("POST /orders/:orderId/review returns 401 when unauthenticated", async () => {
  const db = createMockDb(() => empty());
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    payload: { rating: 5 },
  });

  assert.equal(response.statusCode, 401);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "UNAUTHORIZED");
  await app.close();
});

test("POST /orders/:orderId/review returns 404 when order not found", async () => {
  const db = createMockDb(() => empty());
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: { rating: 5 },
  });

  assert.equal(response.statusCode, 404);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "ORDER_NOT_FOUND");
  await app.close();
});

test("GET /orders/:orderId/review returns 404 when order not found", async () => {
  const db = createMockDb(() => empty());
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
  });

  assert.equal(response.statusCode, 404);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "ORDER_NOT_FOUND");
  await app.close();
});

test("GET /orders/:orderId/review returns 403 when user is not a party to the order", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id FROM orders WHERE id")) {
      return rows([{ buyer_id: "buyer_1", seller_id: "seller_1" }]);
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "GET",
    url: "/orders/order_123/review",
    headers: authHeaders("random_user"),
  });

  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "ORDER_ACCESS_DENIED");
  await app.close();
});

test("GET /orders/:orderId/review returns review: null when no review exists", async () => {
  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id FROM orders WHERE id")) {
      return rows([{ buyer_id: "buyer_1", seller_id: "seller_1" }]);
    }
    if (text.includes("FROM order_reviews") && text.includes("WHERE order_id")) {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db);
  const response = await app.inject({
    method: "GET",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.review, null);
  await app.close();
});

test("POST /reviews/:reviewId/response returns 404 when review not found", async () => {
  const db = createMockDb(() => empty());
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_999/response",
    headers: authHeaders("seller_1"),
    payload: { text: "Hello" },
  });

  assert.equal(response.statusCode, 404);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "REVIEW_NOT_FOUND");
  await app.close();
});

test("POST /reviews/:reviewId/report returns 404 when review not found", async () => {
  const db = createMockDb(() => empty());
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_999/report",
    headers: authHeaders("user_1"),
    payload: { reason: "spam" },
  });

  assert.equal(response.statusCode, 404);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "REVIEW_NOT_FOUND");
  await app.close();
});

test("POST /reviews/:reviewId/moderate returns 404 when review not found (admin)", async () => {
  const db = createMockDb(() => empty());
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_999/moderate",
    headers: authHeaders("admin_1", "admin"),
    payload: { action: "remove", reason: "Does not exist" },
  });

  assert.equal(response.statusCode, 404);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "REVIEW_NOT_FOUND");
  await app.close();
});

test("POST /reviews/:reviewId/appeal returns 404 when review not found", async () => {
  const db = createMockDb(() => empty());
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    url: "/reviews/review_999/appeal",
    headers: authHeaders("buyer_1"),
    payload: { appealedActionId: "revmod_abc", grounds: "factual_error" },
  });

  assert.equal(response.statusCode, 404);
  const body = JSON.parse(response.body);
  assert.equal(body.code, "REVIEW_NOT_FOUND");
  await app.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  NOTIFICATION SIDE-EFFECT TESTS
// ════════════════════════════════════════════════════════════════════════════

test("POST /orders/:orderId/review queues a notification to the seller", async () => {
  const notifications: { userId: string; eventType: string }[] = [];

  const db = createMockDb((text) => {
    if (text.includes("SELECT buyer_id, seller_id, status FROM orders")) {
      return rows([orderRow({ buyer_id: "buyer_1", seller_id: "seller_1" })]);
    }
    if (text.includes("SELECT id FROM order_reviews WHERE order_id")) {
      return empty();
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db, {
    queueUserNotification: async (input: unknown) => {
      const n = input as { userId: string; eventType?: string };
      notifications.push({ userId: n.userId, eventType: n.eventType ?? "" });
      return "notif_1";
    },
  });

  await app.inject({
    method: "POST",
    url: "/orders/order_123/review",
    headers: authHeaders("buyer_1"),
    payload: { rating: 5, comment: "Great" },
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, "seller_1");
  assert.equal(notifications[0].eventType, "review_received");
  await app.close();
});

test("POST /reviews/:reviewId/response queues a notification to the reviewer", async () => {
  const notifications: { userId: string; eventType: string }[] = [];

  const db = createMockDb((text) => {
    if (text.includes("SELECT r.id, r.seller_id, r.order_id") && text.includes("order_reviews r")) {
      return rows([{ id: "review_123", seller_id: "seller_1", order_id: "order_123" }]);
    }
    if (text.includes("SELECT id, edit_until FROM review_responses WHERE review_id")) {
      return empty();
    }
    if (text.includes("SELECT reviewer_id FROM order_reviews WHERE id")) {
      return rows([{ reviewer_id: "buyer_1" }]);
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db, {
    queueUserNotification: async (input: unknown) => {
      const n = input as { userId: string; eventType?: string };
      notifications.push({ userId: n.userId, eventType: n.eventType ?? "" });
      return "notif_1";
    },
  });

  await app.inject({
    method: "POST",
    url: "/reviews/review_123/response",
    headers: authHeaders("seller_1"),
    payload: { text: "Thanks!" },
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, "buyer_1");
  assert.equal(notifications[0].eventType, "review_response_received");
  await app.close();
});

test("POST /reviews/:reviewId/moderate notifies both reviewer and seller (except dismiss_report)", async () => {
  const notifications: { userId: string; eventType: string }[] = [];

  const db = createMockDb((text) => {
    if (text.includes("SELECT id, reviewer_id, seller_id, order_id FROM order_reviews WHERE id = $1")) {
      return rows([{ id: "review_123", reviewer_id: "buyer_1", seller_id: "seller_1", order_id: "order_123" }]);
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db, {
    queueUserNotification: async (input: unknown) => {
      const n = input as { userId: string; eventType?: string };
      notifications.push({ userId: n.userId, eventType: n.eventType ?? "" });
      return "notif_1";
    },
  });

  await app.inject({
    method: "POST",
    url: "/reviews/review_123/moderate",
    headers: authHeaders("admin_1", "admin"),
    payload: { action: "remove", reason: "Policy violation" },
  });

  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].eventType, "review_moderated");
  assert.equal(notifications[1].eventType, "review_moderated");
  const recipientIds = notifications.map((n) => n.userId).sort();
  assert.deepEqual(recipientIds, ["buyer_1", "seller_1"]);
  await app.close();
});

test("POST /reviews/:reviewId/moderate dismiss_report sends no notifications", async () => {
  const notifications: { userId: string; eventType: string }[] = [];

  const db = createMockDb((text) => {
    if (text.includes("SELECT id, reviewer_id, seller_id, order_id FROM order_reviews WHERE id = $1")) {
      return rows([{ id: "review_123", reviewer_id: "buyer_1", seller_id: "seller_1", order_id: "order_123" }]);
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return empty();
    }
    return empty();
  });

  const app = await createTestApp(db, {
    queueUserNotification: async (input: unknown) => {
      const n = input as { userId: string; eventType?: string };
      notifications.push({ userId: n.userId, eventType: n.eventType ?? "" });
      return "notif_1";
    },
  });

  await app.inject({
    method: "POST",
    url: "/reviews/review_123/moderate",
    headers: authHeaders("admin_1", "admin"),
    payload: { action: "dismiss_report", reason: "No violation" },
  });

  assert.equal(notifications.length, 0);
  await app.close();
});
