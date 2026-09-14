/**
 * Save-in-chat routes — Snapchat-style negotiated persistence.
 *
 * Registers the real `registerChatRoutes` module against a minimal Fastify
 * app with a fake `pg.Pool`, exercising the actual route logic:
 *
 *   POST   /chat/conversations/:cid/messages/:mid/save — share a save marker
 *   DELETE /chat/conversations/:cid/messages/:mid/save — retract the actor's save
 *
 * Saved state is shared between participants: either party may save, the
 * marker persists while any participant's save remains, and deleted
 * tombstones cannot be saved.
 */

import assert from "node:assert/strict";
import test, { after } from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import type { Redis } from "ioredis";
import { registerChatRoutes } from "./chat.js";
import { getRedisClient } from "../lib/redisClient.js";

const ME = "user-me";
const OTHER = "user-other";
const CONV = "conv-1";

interface FakeMessage {
  id: string;
  deleted_for_everyone_at: string | null;
}

/** Fake pool — chat_members access check, message lookup, and a stateful
 *  chat_message_saves set keyed on (message_id, user_id). */
function fakeDb() {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const members = new Set([ME, OTHER]);
  const messages = new Map<string, FakeMessage>([
    ["msg-1", { id: "msg-1", deleted_for_everyone_at: null }],
    ["msg-deleted", { id: "msg-deleted", deleted_for_everyone_at: "2026-01-02T00:00:00.000Z" }],
  ]);
  const saves = new Map<string, string>(); // `${messageId}:${userId}` → created_at

  const db = {
    calls,
    saves,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ text, params });

      if (/INNER JOIN chat_members/.test(text)) {
        const [conversationId, userId] = params as [string, string];
        const ok = conversationId === CONV && members.has(userId);
        return {
          rows: (ok
            ? [{ id: CONV, type: "dm", title: null, owner_id: ME, item_id: null }]
            : []) as unknown as T[],
          rowCount: ok ? 1 : 0,
        } as QueryResult<T>;
      }

      if (/FROM\s+chat_messages\s+WHERE id = \$1/i.test(text)) {
        const msg = messages.get(String(params?.[0]));
        const inConv = String(params?.[1]) === CONV;
        return {
          rows: (msg && inConv ? [msg] : []) as unknown as T[],
          rowCount: msg && inConv ? 1 : 0,
        } as QueryResult<T>;
      }

      if (/INSERT INTO chat_message_saves/i.test(text)) {
        const [messageId, , userId] = params as [string, string, string];
        const key = `${messageId}:${userId}`;
        if (!saves.has(key)) {
          saves.set(key, "2026-01-03T00:00:00.000Z");
        }
        return { rows: [] as T[], rowCount: 1 } as QueryResult<T>;
      }

      if (/DELETE FROM chat_message_saves/i.test(text)) {
        const [messageId, userId] = params as [string, string];
        const key = `${messageId}:${userId}`;
        const had = saves.delete(key);
        return { rows: [] as T[], rowCount: had ? 1 : 0 } as QueryResult<T>;
      }

      if (/FROM\s+chat_message_saves\s+WHERE message_id/i.test(text)) {
        const messageId = String(params?.[0]);
        const rows = [...saves.entries()]
          .filter(([key]) => key.startsWith(`${messageId}:`))
          .map(([key, created_at]) => ({ user_id: key.split(":")[1], created_at }));
        return { rows: rows as unknown as T[], rowCount: rows.length } as QueryResult<T>;
      }

      return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
    },
  };
  return db;
}

async function buildApp() {
  const db = fakeDb();
  const app = Fastify();

  // Minimal auth stub — mirrors the production preHandler contract: requests
  // without an Authorization header are 401 before the route runs. The
  // `x-test-user` header lets a test act as a second participant.
  app.addHook("preHandler", async (request, reply) => {
    if (!request.headers.authorization) {
      reply.code(401).send({ ok: false, error: "Unauthorized" });
      return reply;
    }
    const userId = (request.headers["x-test-user"] as string | undefined) ?? ME;
    request.authUser = { userId, role: "user", sessionId: "s1" } as never;
  });

  registerChatRoutes({
    app,
    db: db as unknown as Pool,
    redis: {} as unknown as Redis,
    resolveAuthenticatedUserId: (request) => request.authUser?.userId ?? ME,
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
  return { app, db };
}

const auth = { authorization: "Bearer test" };

// The realtime sequence helper lazily creates a shared Redis client when
// publishRealtimeEvent runs. `quit()` can hang on a never-connected client
// holding queued commands — `disconnect()` force-closes it so the test
// process can exit.
after(() => {
  try {
    getRedisClient().disconnect();
  } catch {
    // No client was ever created — nothing to close.
  }
});

test("POST .../messages/:id/save saves a message and returns the shared savedBy set", async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; saved: boolean; savedBy: string[]; savedAt: string };
    assert.equal(body.ok, true);
    assert.equal(body.saved, true);
    assert.deepEqual(body.savedBy, [ME]);
    assert.equal(typeof body.savedAt, "string");
    assert.equal(db.calls.some((c) => /INSERT INTO chat_message_saves/i.test(c.text)), true);
  } finally {
    await app.close();
  }
});

test("POST .../save keeps both savers in the shared set when the other party also saves", async () => {
  const { app } = await buildApp();
  try {
    await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: auth,
    });
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: { ...auth, "x-test-user": OTHER },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { saved: boolean; savedBy: string[] };
    assert.equal(body.saved, true);
    assert.deepEqual(new Set(body.savedBy), new Set([ME, OTHER]));
  } finally {
    await app.close();
  }
});

test("POST .../save is idempotent for the same user", async () => {
  const { app } = await buildApp();
  try {
    await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: auth,
    });
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.json() as { savedBy: string[] }).savedBy, [ME]);
  } finally {
    await app.close();
  }
});

test("POST .../save rejects a deleted-for-everyone message with 403", async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-deleted/save`,
      headers: auth,
    });
    assert.equal(res.statusCode, 403);
    assert.equal(db.calls.some((c) => /INSERT INTO chat_message_saves/i.test(c.text)), false);
  } finally {
    await app.close();
  }
});

test("POST .../save returns 404 for a missing message", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-missing/save`,
      headers: auth,
    });
    assert.equal(res.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("POST .../save requires conversation membership", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/conv-stranger/messages/msg-1/save`,
      headers: auth,
    });
    // ensureChatConversationAccess throws CHAT_CONVERSATION_NOT_FOUND → 404.
    assert.equal(res.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("DELETE .../save removes only the actor's save while others remain", async () => {
  const { app } = await buildApp();
  try {
    await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: auth,
    });
    await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: { ...auth, "x-test-user": OTHER },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { saved: boolean; savedBy: string[] };
    assert.equal(body.saved, true);
    assert.deepEqual(body.savedBy, [OTHER]);
  } finally {
    await app.close();
  }
});

test("DELETE .../save clears the marker when the last saver unsaves", async () => {
  const { app } = await buildApp();
  try {
    await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: auth,
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { saved: boolean; savedBy: string[] };
    assert.equal(body.saved, false);
    assert.deepEqual(body.savedBy, []);
  } finally {
    await app.close();
  }
});

test("DELETE .../save is allowed on a tombstone so pre-delete saves can be retracted", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "DELETE",
      url: `/chat/conversations/${CONV}/messages/msg-deleted/save`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { saved: boolean }).saved, false);
  } finally {
    await app.close();
  }
});

test("save endpoints require auth", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages/msg-1/save`,
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
  }
});
