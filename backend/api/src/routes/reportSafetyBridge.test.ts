/**
 * Consumer report → safety pipeline bridge.
 *
 * Registers the real route modules against a minimal Fastify app with a fake
 * `pg.Pool`, exercising the actual route logic:
 *
 *   POST /users/:userId/report                      — user_reports + safety_notices
 *   POST /listings/:listingId/report                — listing_reports + safety_notices
 *   POST /chat/conversations/:conversationId/report — conversation_reports + safety_notices
 *   GET  /users/me/reports                          — reporter-visible status surface
 *
 * recordConsumerReport persists the domain report row and its safety notice
 * in one transaction (BEGIN…COMMIT via a dedicated PoolClient) and derives
 * the notice's idempotency key from the report id (`<kind>_report:<id>`) so
 * idempotent retries never double-file a notice.
 */

import assert from "node:assert/strict";
import test, { after } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import type { Redis } from "ioredis";

import { registerUserRoutes } from "./users.js";
import { registerListingInteractionRoutes } from "./listings.js";
import { registerChatRoutes } from "./chat.js";
import { recordConsumerReport } from "../lib/safetyCaseService.js";
import { getRedisClient } from "../lib/redisClient.js";

const ME = "user-me";
const OTHER = "user-other";
const CONV = "conv-1";
const LISTING = "listing-1";

// ── Fake pool ────────────────────────────────────────────────────────────────
// `query` delegates to a caller-supplied matcher; `connect` returns a stub
// client that forwards to db.query so BEGIN…COMMIT flows exercise the same
// matcher (supportReviews.test.ts convention).

type QueryMatcher = (
  text: string,
  params: unknown[],
) => { rows: QueryResultRow[]; rowCount: number } | undefined;

function createMockDb(matcher: QueryMatcher) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const db = {
    calls,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ text, params: params ?? [] });
      const result = matcher(text, params ?? []);
      if (result === undefined) {
        return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
      }
      return result as QueryResult<T>;
    },
    async connect() {
      return {
        query: (text: string, params?: unknown[]) => db.query(text, params),
        release: () => {},
      };
    },
  };
  return db;
}

function rows(r: QueryResultRow[]) {
  return { rows: r, rowCount: r.length };
}

function empty() {
  return { rows: [], rowCount: 0 };
}

/** Echoes the INSERT params back as a safety_notices row so mapNoticeRow
 *  has every field it reads. */
function noticeRowFromParams(params: unknown[]) {
  return rows([
    {
      id: params[0],
      idempotency_key: params[1],
      reporter_id: params[2],
      subject_type: params[3],
      subject_id: params[4],
      subject_snapshot:
        typeof params[5] === "string" ? JSON.parse(params[5] as string) : params[5],
      basis: params[6],
      reason_code: params[7],
      jurisdiction: params[8],
      urgency: params[9],
      allegation: params[10],
      reporter_status: params[11],
      acknowledgement_state: "pending",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ]);
}

function noticeInserts(db: ReturnType<typeof createMockDb>) {
  return db.calls.filter((c) => /INSERT INTO safety_notices/i.test(c.text));
}

function addAuthHook(app: FastifyInstance) {
  // Mirrors the production preHandler contract: no Authorization header →
  // 401 before the route runs; `x-test-user` lets a test act as another user.
  app.addHook("preHandler", async (request, reply) => {
    if (!request.headers.authorization) {
      reply.code(401).send({ ok: false, error: "Unauthorized" });
      return reply;
    }
    const userId = (request.headers["x-test-user"] as string | undefined) ?? ME;
    request.authUser = { userId, role: "user", sessionId: "s1" } as never;
  });
}

// ── App builders ─────────────────────────────────────────────────────────────

async function buildUsersApp(db: ReturnType<typeof createMockDb>) {
  const app = Fastify();
  addAuthHook(app);
  registerUserRoutes({
    app,
    db: db as unknown as Pool,
    readDb: db as unknown as Pool,
    resolveAuthenticatedUserId: (request) => request.authUser?.userId ?? ME,
    ensureUserExists: async () => {},
    toProfilePayload: (row) => ({ id: row.id, username: row.username }),
    toPublicProfilePayload: (row) => ({ id: row.id, username: row.username }),
    queueUserNotification: async () => null,
  });
  await app.ready();
  return app;
}

async function buildListingsApp(db: ReturnType<typeof createMockDb>) {
  const app = Fastify();
  addAuthHook(app);
  registerListingInteractionRoutes({
    app,
    db: db as unknown as Pool,
    readDb: db as unknown as Pool,
    optionalAuthenticate: async () => {},
    ensureUserExists: async () => {},
  });
  await app.ready();
  return app;
}

async function buildChatApp(db: ReturnType<typeof createMockDb>) {
  const app = Fastify();
  addAuthHook(app);
  registerChatRoutes({
    app,
    db: db as unknown as Pool,
    redis: {} as unknown as Redis,
    resolveAuthenticatedUserId: (request) => {
      if (!request.authUser) {
        throw Object.assign(new Error("Unauthorized"), {
          code: "UNAUTHORIZED",
          statusCode: 401,
        });
      }
      return request.authUser.userId;
    },
    createApiError: (code: string, message: string, details?: Record<string, unknown>) =>
      Object.assign(new Error(message), {
        code,
        details,
        statusCode: code.endsWith("_NOT_FOUND") ? 404 : code === "FORBIDDEN_USER_CONTEXT" ? 403 : 409,
      }),
    ensureUserExists: async () => {},
    createRuntimeId: (prefix: string) => `${prefix}_test`,
    toJsonString: (value: unknown) => JSON.stringify(value),
    resolveHeaderString: (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] ?? null : value ?? null,
    asObject: (value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {},
    queueUserNotification: async () => null,
  });
  await app.ready();
  return app;
}

const auth = { authorization: "Bearer test" };

// The report endpoints fire publishRealtimeEvent, which lazily creates a
// shared Redis client for the topic sequence counter. `quit()` can hang on a
// never-connected client holding queued commands — `disconnect()` force-closes
// it so the test process can exit (chat.save.test.ts convention).
after(() => {
  try {
    getRedisClient().disconnect();
  } catch {
    // No client was ever created — nothing to close.
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  POST /users/:userId/report
// ════════════════════════════════════════════════════════════════════════════

test("POST /users/:userId/report persists the report and a safety notice in one transaction", async () => {
  const db = createMockDb((text, params) => {
    if (/FROM users WHERE id = \$1/i.test(text)) {
      return rows([{ username: "other", display_name: "Other" }]);
    }
    if (/INSERT INTO user_reports/i.test(text)) return empty();
    if (/INSERT INTO safety_notices/i.test(text)) return noticeRowFromParams(params);
    return empty();
  });
  const app = await buildUsersApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: `/users/${OTHER}/report`,
      headers: auth,
      payload: { reason: "scam", details: "Asked me to pay off-platform" },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json() as { ok: boolean; reportId: string; noticeId: string };
    assert.equal(body.ok, true);
    assert.ok(body.reportId.startsWith("report_"));
    assert.ok(body.noticeId.startsWith("sn_"));

    const reportInsert = db.calls.find((c) => /INSERT INTO user_reports/i.test(c.text));
    assert.ok(reportInsert);
    assert.deepEqual(reportInsert!.params.slice(0, 5), [
      body.reportId,
      ME,
      OTHER,
      "scam",
      "Asked me to pay off-platform",
    ]);

    const noticeInsert = noticeInserts(db)[0];
    assert.ok(noticeInsert);
    const p = noticeInsert.params;
    assert.equal(p[1], `user_report:${body.reportId}`); // derived idempotency key
    assert.equal(p[2], ME); // reporter_id
    assert.equal(p[3], "user"); // subject_type
    assert.equal(p[4], OTHER); // subject_id
    assert.equal(p[6], "illegal_content"); // scam → is_illegal_content seed
    assert.equal(p[7], "scam"); // reason_code
    assert.equal(p[9], "elevated"); // severity-3 urgency
    const snapshot = JSON.parse(p[5] as string);
    assert.equal(snapshot.reportId, body.reportId);
    assert.equal(snapshot.username, "other");

    // BEGIN/COMMIT wrapped both writes.
    assert.ok(db.calls.some((c) => c.text === "BEGIN"));
    assert.ok(db.calls.some((c) => c.text === "COMMIT"));
  } finally {
    await app.close();
  }
});

test("POST /users/:userId/report maps minor_safety to emergency urgency", async () => {
  const db = createMockDb((text, params) => {
    if (/FROM users WHERE id = \$1/i.test(text)) {
      return rows([{ username: "other", display_name: null }]);
    }
    if (/INSERT INTO safety_notices/i.test(text)) return noticeRowFromParams(params);
    return empty();
  });
  const app = await buildUsersApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: `/users/${OTHER}/report`,
      headers: auth,
      payload: { reason: "minor_safety" },
    });
    assert.equal(res.statusCode, 201);
    const p = noticeInserts(db)[0].params;
    assert.equal(p[7], "minor_safety");
    assert.equal(p[9], "emergency");
    assert.equal(p[6], "illegal_content");
  } finally {
    await app.close();
  }
});

test("POST /users/:userId/report rejects self-reports before any write", async () => {
  const db = createMockDb(() => empty());
  const app = await buildUsersApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: `/users/${ME}/report`,
      headers: auth,
      payload: { reason: "spam" },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(db.calls.some((c) => /INSERT INTO/i.test(c.text)), false);
  } finally {
    await app.close();
  }
});

test("POST /users/:userId/report returns 404 for a missing reported user", async () => {
  const db = createMockDb(() => empty());
  const app = await buildUsersApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: "/users/user-ghost/report",
      headers: auth,
      payload: { reason: "spam" },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(noticeInserts(db).length, 0);
  } finally {
    await app.close();
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  POST /listings/:listingId/report
// ════════════════════════════════════════════════════════════════════════════

test("POST /listings/:listingId/report persists the report and a listing-scoped safety notice", async () => {
  const db = createMockDb((text, params) => {
    if (/FROM listings WHERE id = \$1/i.test(text)) {
      return rows([{ seller_id: OTHER, title: "Vintage tee", status: "active" }]);
    }
    if (/INSERT INTO listing_reports/i.test(text)) return empty();
    if (/INSERT INTO safety_notices/i.test(text)) return noticeRowFromParams(params);
    return empty();
  });
  const app = await buildListingsApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: `/listings/${LISTING}/report`,
      headers: auth,
      payload: { reason: "counterfeit", details: "Fake designer label" },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json() as { ok: boolean; reportId: string; noticeId: string };
    assert.equal(body.ok, true);
    assert.ok(body.reportId.startsWith("listing_report_"));
    assert.ok(body.noticeId.startsWith("sn_"));

    const reportInsert = db.calls.find((c) => /INSERT INTO listing_reports/i.test(c.text));
    assert.ok(reportInsert);
    assert.deepEqual(reportInsert!.params.slice(0, 5), [
      body.reportId,
      ME,
      LISTING,
      "counterfeit",
      "Fake designer label",
    ]);

    const p = noticeInserts(db)[0].params;
    assert.equal(p[1], `listing_report:${body.reportId}`);
    assert.equal(p[2], ME);
    assert.equal(p[3], "listing"); // subject_type
    assert.equal(p[4], LISTING); // subject_id
    assert.equal(p[6], "terms"); // counterfeit is a ToS allegation
    assert.equal(p[7], "counterfeit");
    assert.equal(p[9], "normal");
    const snapshot = JSON.parse(p[5] as string);
    assert.equal(snapshot.sellerId, OTHER);
    assert.equal(snapshot.title, "Vintage tee");
  } finally {
    await app.close();
  }
});

test("POST /listings/:listingId/report rejects reporting your own listing", async () => {
  const db = createMockDb((text) => {
    if (/FROM listings WHERE id = \$1/i.test(text)) {
      return rows([{ seller_id: ME, title: "Mine", status: "active" }]);
    }
    return empty();
  });
  const app = await buildListingsApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: `/listings/${LISTING}/report`,
      headers: auth,
      payload: { reason: "spam" },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(db.calls.some((c) => /INSERT INTO/i.test(c.text)), false);
  } finally {
    await app.close();
  }
});

test("POST /listings/:listingId/report returns 404 for a missing listing", async () => {
  const db = createMockDb(() => empty());
  const app = await buildListingsApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: "/listings/listing-ghost/report",
      headers: auth,
      payload: { reason: "spam" },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(noticeInserts(db).length, 0);
  } finally {
    await app.close();
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  POST /chat/conversations/:conversationId/report
// ════════════════════════════════════════════════════════════════════════════

function chatMatcher(state: { inserted: boolean }) {
  return (text: string, params: unknown[]) => {
    if (/INNER JOIN chat_members/.test(text)) {
      const [conversationId, userId] = params as [string, string];
      const ok = conversationId === CONV && (userId === ME || userId === OTHER);
      return ok
        ? rows([{ id: CONV, type: "dm", title: null, owner_id: OTHER, item_id: null }])
        : empty();
    }
    // Evidence-ref check: only msg-1 exists, and only inside CONV.
    if (/FROM chat_messages WHERE id = \$1/i.test(text)) {
      const [messageId, conversationId] = params as [string, string];
      return messageId === "msg-1" && conversationId === CONV
        ? rows([{ id: messageId }])
        : empty();
    }
    if (/INSERT INTO conversation_reports/i.test(text)) {
      if (state.inserted) {
        // ON CONFLICT (idempotency_key) DO NOTHING → no row returned.
        return empty();
      }
      state.inserted = true;
      return rows([{ id: params[0] as string }]);
    }
    if (/FROM conversation_reports WHERE idempotency_key/i.test(text)) {
      // On retry the helper resolves the original report id from the
      // client idempotency key.
      return rows([{ id: "chatrpt_test" }]);
    }
    if (/INSERT INTO safety_notices/i.test(text)) return noticeRowFromParams(params);
    return empty();
  };
}

test("POST /chat/conversations/:id/report maps chat reason aliases and carries message evidence", async () => {
  const db = createMockDb(chatMatcher({ inserted: false }));
  const app = await buildChatApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/report`,
      headers: auth,
      payload: {
        reason: "scam_fraud",
        details: "Tried to move me to PayPal",
        messageId: "msg-1",
        idempotencyKey: "client-key-1",
      },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json() as { ok: boolean; reportId: string; noticeId: string; status: string };
    assert.equal(body.ok, true);
    assert.equal(body.reportId, "chatrpt_test");
    assert.ok(body.noticeId.startsWith("sn_"));
    assert.equal(body.status, "submitted");

    const p = noticeInserts(db)[0].params;
    assert.equal(p[1], "conversation_report:chatrpt_test");
    assert.equal(p[2], ME);
    assert.equal(p[3], "conversation"); // subject_type
    assert.equal(p[4], CONV); // subject_id
    assert.equal(p[7], "scam"); // scam_fraud → scam
    assert.equal(p[6], "illegal_content");
    assert.equal(p[9], "elevated");
    const snapshot = JSON.parse(p[5] as string);
    assert.equal(snapshot.evidenceMessageId, "msg-1");
    assert.equal(snapshot.conversationType, "dm");
  } finally {
    await app.close();
  }
});

test("POST /chat/conversations/:id/report idempotent retry keys the notice to the original report", async () => {
  const db = createMockDb(chatMatcher({ inserted: false }));
  const app = await buildChatApp(db);
  try {
    const payload = { reason: "harassment", idempotencyKey: "client-key-dup" };
    const first = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/report`,
      headers: auth,
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/report`,
      headers: auth,
      payload,
    });
    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);

    const firstBody = first.json() as { reportId: string };
    const secondBody = second.json() as { reportId: string };
    // The retry resolves the persisted report id rather than the freshly
    // generated one.
    assert.equal(secondBody.reportId, firstBody.reportId);

    const notices = noticeInserts(db);
    assert.equal(notices.length, 2);
    // Both attempts key the notice identically — Postgres dedupes on
    // (reporter_id, idempotency_key) so no second notice row is written.
    assert.equal(notices[0].params[1], notices[1].params[1]);
    assert.equal(notices[1].params[1], `conversation_report:${firstBody.reportId}`);

    // Only the first attempt wrote a report row.
    const reportInserts = db.calls.filter((c) => /INSERT INTO conversation_reports/i.test(c.text));
    assert.equal(reportInserts.length, 2); // attempted, second no-ops on conflict
  } finally {
    await app.close();
  }
});

test("POST /chat/conversations/:id/report rejects a messageId outside the conversation", async () => {
  const db = createMockDb(chatMatcher({ inserted: false }));
  const app = await buildChatApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/report`,
      headers: auth,
      payload: {
        reason: "harassment",
        messageId: "msg-elsewhere", // valid membership, foreign evidence ref
      },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(noticeInserts(db).length, 0);
    assert.equal(
      db.calls.some((c) => /INSERT INTO conversation_reports/i.test(c.text)),
      false,
    );
  } finally {
    await app.close();
  }
});

test("POST /chat/conversations/:id/report requires conversation membership", async () => {
  const db = createMockDb(chatMatcher({ inserted: false }));
  const app = await buildChatApp(db);
  try {
    const res = await app.inject({
      method: "POST",
      url: "/chat/conversations/conv-stranger/report",
      headers: auth,
      payload: { reason: "spam" },
    });
    // ensureChatConversationAccess throws CHAT_CONVERSATION_NOT_FOUND → 404.
    assert.equal(res.statusCode, 404);
    assert.equal(noticeInserts(db).length, 0);
  } finally {
    await app.close();
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  GET /users/me/reports
// ════════════════════════════════════════════════════════════════════════════

test("GET /users/me/reports returns reports joined to their notice and case state", async () => {
  const db = createMockDb((text) => {
    if (/UNION ALL/i.test(text) && /safety_notices/i.test(text)) {
      return rows([
        {
          report_id: "report_1",
          kind: "user",
          reason: "scam",
          report_status: "pending",
          subject_id: OTHER,
          created_at: "2026-01-02T00:00:00.000Z",
          notice_id: "sn_1",
          notice_acknowledgement: "sent",
          case_id: "sc_1",
          case_status: "closed",
          outcome: "restrict",
        },
        {
          report_id: "chatrpt_2",
          kind: "conversation",
          reason: "harassment",
          report_status: "submitted",
          subject_id: CONV,
          created_at: "2026-01-01T00:00:00.000Z",
          notice_id: "sn_2",
          notice_acknowledgement: "pending",
          case_id: null,
          case_status: null,
          outcome: null,
        },
      ]);
    }
    return empty();
  });
  const app = await buildUsersApp(db);
  try {
    const res = await app.inject({
      method: "GET",
      url: "/users/me/reports",
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      ok: boolean;
      reports: Array<Record<string, unknown>>;
    };
    assert.equal(body.ok, true);
    assert.equal(body.reports.length, 2);
    assert.deepEqual(body.reports[0], {
      reportId: "report_1",
      kind: "user",
      reason: "scam",
      subjectId: OTHER,
      status: "pending",
      noticeId: "sn_1",
      noticeAcknowledgement: "sent",
      caseId: "sc_1",
      caseStatus: "closed",
      outcome: "restrict",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    assert.equal(body.reports[1].reportId, "chatrpt_2");
    assert.equal(body.reports[1].caseStatus, null);
    assert.equal(body.reports[1].outcome, null);
  } finally {
    await app.close();
  }
});

test("GET /users/me/reports requires auth", async () => {
  const db = createMockDb(() => empty());
  const app = await buildUsersApp(db);
  try {
    const res = await app.inject({ method: "GET", url: "/users/me/reports" });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  recordConsumerReport — transaction integrity
// ════════════════════════════════════════════════════════════════════════════

test("recordConsumerReport rolls back when the report insert fails", async () => {
  const db = createMockDb((text) => {
    if (/INSERT INTO user_reports/i.test(text)) {
      throw new Error("chk_no_self_report violation");
    }
    return empty();
  });

  await assert.rejects(
    recordConsumerReport(db as unknown as Pool, {
      kind: "user",
      reportId: "report_x",
      reporterId: ME,
      subjectId: OTHER,
      reason: "spam",
    }),
    /chk_no_self_report/,
  );
  assert.ok(db.calls.some((c) => c.text === "ROLLBACK"));
  assert.equal(db.calls.some((c) => c.text === "COMMIT"), false);
  // No notice may outlive a rolled-back report.
  assert.equal(noticeInserts(db).length, 0);
});
