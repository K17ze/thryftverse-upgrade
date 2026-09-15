/**
 * Chat media poster contract — the 3-URL video artifact rule applied to chat.
 *
 * Registers the real `registerChatRoutes` module against a minimal Fastify
 * app with a fake `pg.Pool`, exercising the actual route logic:
 *
 *   POST /chat/conversations/:cid/messages — media send (video/voice)
 *   GET  /chat/conversations/:cid/messages — serialization poster backfill
 *   GET  /chat/conversations/:cid/media    — shared-media listing
 *
 * Contract under test:
 *  - a canonical `/media/` video URI is resolved against media_assets BEFORE
 *    the chat_messages INSERT (a failed lookup leaves no orphan row);
 *  - the resolved asset's `metadata->>'posterUrl'` is merged into message
 *    metadata as `posterUri` so image-context bubbles never receive the HLS
 *    playlist;
 *  - voice messages reject non-audio assets;
 *  - legacy video messages without `posterUri` are backfilled via
 *    chat_message_attachments → media_assets on both read paths.
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
const VIDEO_ASSET = "asset-video-1";
const VIDEO_URI = "https://cdn.test/media/asset-video-1/master.m3u8";
const POSTER_URL = "https://cdn.test/media/asset-video-1/poster.jpg";
const AUDIO_URI = "https://cdn.test/media/asset-video-1/audio.m4a";

interface FakeAsset {
  id: string;
  owner_id: string;
  canonical_url: string;
  status: string;
  media_kind: string;
  poster_url: string | null;
}

interface FakeDbOptions {
  /** Assets keyed by canonical_url — drives the pre-insert ownership check. */
  assets?: Map<string, FakeAsset>;
  /** Poster resolved via chat_message_attachments → media_assets joins. */
  attachmentPosters?: Map<string, string>;
}

function fakeDb(options: FakeDbOptions = {}) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const assets = options.assets ?? new Map<string, FakeAsset>();
  const attachmentPosters = options.attachmentPosters ?? new Map<string, string>();
  const members = new Set([ME, OTHER]);
  const messages = new Map<string, Record<string, unknown>>();

  const db = {
    calls,
    messages,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ text, params });

      const ok = <T2 extends QueryResultRow>(rows: T2[]): QueryResult<T> =>
        ({ rows: rows as unknown as T[], rowCount: rows.length }) as QueryResult<T>;

      // ── Media asset canonical-URL lookup (pre-insert validation) ──
      if (/FROM media_assets WHERE canonical_url = \$1/i.test(text)) {
        const asset = assets.get(String(params?.[0]));
        return ok(asset ? [asset] : []);
      }

      // ── Conversation access: chat_conversations ⋈ chat_members ──
      if (/INNER JOIN chat_members/.test(text)) {
        const [conversationId, userId] = params as [string, string];
        const allowed = conversationId === CONV && members.has(userId);
        return ok(
          allowed
            ? [{ id: CONV, type: "dm", title: null, owner_id: ME, item_id: null }]
            : [],
        );
      }

      // ── DM recipient lookup ──
      if (/FROM chat_members\s+WHERE conversation_id = \$1 AND user_id <> \$2/i.test(text)) {
        return ok([{ user_id: OTHER }]);
      }

      // ── Participant list (listChatParticipantIds) ──
      if (/FROM chat_members\s+WHERE conversation_id = \$1\s+ORDER BY joined_at/i.test(text)) {
        return ok([{ user_id: ME }, { user_id: OTHER }]);
      }

      // ── Message INSERT — capture the stored row ──
      if (/INSERT INTO chat_messages\b/i.test(text)) {
        const [id, conversationId, senderId, body, ciphertext, keyVersion, metadataJson, clientMessageId, replyTo] =
          params as [string, string, string, string, string | null, number | null, string, string | null, string | null];
        const row = {
          id,
          conversation_id: conversationId,
          sender_type: "user",
          sender_user_id: senderId,
          sender_bot_id: null,
          body,
          body_ciphertext: ciphertext,
          key_version: keyVersion,
          metadata: metadataJson ? JSON.parse(metadataJson) : {},
          created_at: "2026-01-05T00:00:00.000Z",
          client_message_id: clientMessageId,
          reply_to_message_id: replyTo,
          deleted_for_everyone_at: null,
          edit_version: 0,
          edited_at: null,
        };
        messages.set(id, row);
        return ok([{ id, created_at: row.created_at }]);
      }

      // ── Attachment INSERT ──
      if (/INSERT INTO chat_message_attachments/i.test(text)) {
        return ok([]);
      }

      // ── Message list (GET messages) ──
      if (/FROM chat_messages m\s+WHERE m\.conversation_id = \$1/i.test(text)) {
        return ok([...messages.values()]);
      }

      // ── Attachment → media_assets poster join (backfill) ──
      if (/FROM chat_message_attachments att\s+JOIN media_assets ma/i.test(text)) {
        const ids = (params?.[0] as string[]) ?? [];
        const rows = ids
          .filter((id) => attachmentPosters.has(id))
          .map((id) => ({ message_id: id, poster_url: attachmentPosters.get(id)! }));
        return ok(rows);
      }

      return ok([]);
    },
  };
  return db;
}

async function buildApp(dbOptions: FakeDbOptions = {}) {
  const db = fakeDb(dbOptions);
  const app = Fastify();

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

after(() => {
  try {
    getRedisClient().disconnect();
  } catch {
    // No client was ever created — nothing to close.
  }
});

// ── 1. Video send: poster merged, insert happens after validation ──

test("POST messages with a canonical video URI merges posterUri into stored metadata", async () => {
  const { app, db } = await buildApp({
    assets: new Map([
      [VIDEO_URI, {
        id: VIDEO_ASSET,
        owner_id: ME,
        canonical_url: VIDEO_URI,
        status: "published",
        media_kind: "video",
        poster_url: POSTER_URL,
      }],
    ]),
  });
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages`,
      headers: { ...auth, "content-type": "application/json" },
      payload: { type: "video", mediaUri: VIDEO_URI },
    });
    assert.notEqual(res.statusCode, 401, res.body);
    assert.notEqual(res.statusCode, 403, res.body);
    const body = res.json() as {
      ok: boolean;
      message?: { metadata?: Record<string, unknown> };
    };
    // Whether the send completes (201) or the risk engine downgrades it, the
    // INSERT's metadata param is the deterministic contract point.
    const insert = db.calls.find((c) => /INSERT INTO chat_messages\b/i.test(c.text));
    assert.ok(insert, "expected chat_messages INSERT");
    const stored = JSON.parse(String(insert.params?.[6])) as Record<string, unknown>;
    assert.equal(stored.mediaUri, VIDEO_URI);
    assert.equal(stored.mediaType, "video");
    assert.equal(stored.posterUri, POSTER_URL);
    if (body.message) {
      assert.equal(body.message.metadata?.posterUri, POSTER_URL);
    }
    // Attachment row binds the message to the video asset.
    const attach = db.calls.find((c) => /INSERT INTO chat_message_attachments/i.test(c.text));
    assert.ok(attach, "expected chat_message_attachments INSERT");
    assert.equal(attach.params?.[2], VIDEO_ASSET);
    assert.equal(attach.params?.[3], "video");
  } finally {
    await app.close();
  }
});

// ── 2. Validation before insert: unknown asset → 403, no orphan row ──

test("POST messages with an unknown canonical media URI returns 403 and inserts nothing", async () => {
  const { app, db } = await buildApp({ assets: new Map() });
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages`,
      headers: { ...auth, "content-type": "application/json" },
      payload: { type: "video", mediaUri: VIDEO_URI },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(
      db.calls.some((c) => /INSERT INTO chat_messages\b/i.test(c.text)),
      false,
      "media validation must run before chat_messages INSERT — no orphan row",
    );
  } finally {
    await app.close();
  }
});

// ── 3. Validation before insert: wrong owner → 403, no orphan row ──

test("POST messages with a media asset owned by another user returns 403 and inserts nothing", async () => {
  const { app, db } = await buildApp({
    assets: new Map([
      [VIDEO_URI, {
        id: VIDEO_ASSET,
        owner_id: OTHER,
        canonical_url: VIDEO_URI,
        status: "published",
        media_kind: "video",
        poster_url: POSTER_URL,
      }],
    ]),
  });
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages`,
      headers: { ...auth, "content-type": "application/json" },
      payload: { type: "video", mediaUri: VIDEO_URI },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(
      db.calls.some((c) => /INSERT INTO chat_messages\b/i.test(c.text)),
      false,
      "ownership check must run before chat_messages INSERT",
    );
  } finally {
    await app.close();
  }
});

// ── 4. Voice send with a non-audio asset → 422, no orphan row ──

test("POST voice message whose asset is not audio-kind returns 422 and inserts nothing", async () => {
  const { app, db } = await buildApp({
    assets: new Map([
      [AUDIO_URI, {
        id: VIDEO_ASSET,
        owner_id: ME,
        canonical_url: AUDIO_URI,
        status: "published",
        media_kind: "video", // misclassified — the kind gate must reject it
        poster_url: POSTER_URL,
      }],
    ]),
  });
  try {
    const res = await app.inject({
      method: "POST",
      url: `/chat/conversations/${CONV}/messages`,
      headers: { ...auth, "content-type": "application/json" },
      payload: {
        type: "voice",
        mediaUri: AUDIO_URI,
        metadata: { durationMs: 1200, container: "m4a", codec: "aac" },
      },
    });
    assert.equal(res.statusCode, 422);
    assert.equal(
      db.calls.some((c) => /INSERT INTO chat_messages\b/i.test(c.text)),
      false,
      "kind check must run before chat_messages INSERT",
    );
  } finally {
    await app.close();
  }
});

// ── 5. GET messages backfills posterUri for legacy video rows ──

test("GET messages backfills posterUri from chat_message_attachments → media_assets", async () => {
  const { app, db } = await buildApp({
    attachmentPosters: new Map([["msg-v1", POSTER_URL]]),
  });
  try {
    // Seed a legacy video message: metadata has no posterUri.
    db.messages.set("msg-v1", {
      id: "msg-v1",
      conversation_id: CONV,
      sender_type: "user",
      sender_user_id: OTHER,
      sender_bot_id: null,
      body: "",
      body_ciphertext: null,
      key_version: null,
      metadata: { mediaUri: VIDEO_URI, mediaType: "video" },
      created_at: "2026-01-04T00:00:00.000Z",
      client_message_id: null,
      reply_to_message_id: null,
      deleted_for_everyone_at: null,
      edit_version: 0,
      edited_at: null,
    });
    const res = await app.inject({
      method: "GET",
      url: `/chat/conversations/${CONV}/messages`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as {
      ok: boolean;
      items: Array<{ id: string; metadata?: Record<string, unknown> }>;
    };
    const item = body.items.find((i) => i.id === "msg-v1");
    assert.ok(item, "expected the seeded video message in the list");
    assert.equal(item!.metadata?.posterUri, POSTER_URL);
  } finally {
    await app.close();
  }
});

// ── 6. GET shared media emits posterUri for video items ──

test("GET .../media returns posterUri for video items via attachment backfill", async () => {
  const { app, db } = await buildApp({
    attachmentPosters: new Map([["msg-v2", POSTER_URL]]),
  });
  try {
    db.messages.set("msg-v2", {
      id: "msg-v2",
      conversation_id: CONV,
      sender_type: "user",
      sender_user_id: OTHER,
      sender_bot_id: null,
      body: "",
      body_ciphertext: null,
      key_version: null,
      metadata: { mediaUri: VIDEO_URI, mediaType: "video" },
      created_at: "2026-01-04T00:00:00.000Z",
      client_message_id: null,
      reply_to_message_id: null,
      deleted_for_everyone_at: null,
      edit_version: 0,
      edited_at: null,
    });
    const res = await app.inject({
      method: "GET",
      url: `/chat/conversations/${CONV}/media`,
      headers: auth,
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as {
      ok: boolean;
      items: Array<{ id: string; mediaType: string; posterUri?: string }>;
    };
    const item = body.items.find((i) => i.id === "msg-v2");
    assert.ok(item, "expected the video message in shared media");
    assert.equal(item!.mediaType, "video");
    assert.equal(item!.posterUri, POSTER_URL);
  } finally {
    await app.close();
  }
});
