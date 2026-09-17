/**
 * Username availability + PATCH collision enforcement.
 *
 * Registers the real `registerUserRoutes` module against a minimal Fastify
 * app with a fake `pg.Pool`, exercising the actual route logic:
 *
 *   GET   /users/me/username-availability — live handle check
 *   PATCH /users/me                       — 409 USERNAME_TAKEN on collision
 *
 * The users table has a LOWER(username) lookup index but no uniqueness
 * constraint, so collision enforcement lives at this API boundary.
 */

import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import { registerUserRoutes } from "./users.js";

const ME = "user-me";

const USER_ROW = {
  id: ME,
  username: "myhandle",
  email: "me@example.com",
  display_name: "Me",
  bio: null,
  pronouns: null,
  gender: null,
  is_ai_creator: false,
  location: null,
  website: null,
  phone: null,
  avatar: null,
  cover_photo: null,
  cover_video: null,
  role: "user",
  email_verified_at: null,
  two_factor_enabled: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

/** Fake pool — `taken-handle` collides with another user, everything else is free. */
function fakeDb() {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const db = {
    calls,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ text, params });
      if (/LOWER\(username\)/.test(text)) {
        const taken = params?.[0] === "taken-handle" && params?.[1] !== "user-other";
        return { rows: (taken ? [{ id: "user-other" }] : []) as unknown as T[], rowCount: taken ? 1 : 0 } as QueryResult<T>;
      }
      if (/UPDATE\s+users/i.test(text)) {
        return { rows: [] as T[], rowCount: 1 } as QueryResult<T>;
      }
      if (/FROM\s+users/i.test(text)) {
        return { rows: [{ ...USER_ROW, username: String(params?.[0] ?? USER_ROW.username) === ME ? USER_ROW.username : USER_ROW.username }] as unknown as T[], rowCount: 1 } as QueryResult<T>;
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
  // without an Authorization header are 401 before the route runs.
  app.addHook("preHandler", async (request, reply) => {
    if (!request.headers.authorization) {
      reply.code(401).send({ ok: false, error: "Unauthorized" });
      return reply;
    }
    request.authUser = { userId: ME, role: "user", sessionId: "s1" } as never;
  });

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
  return { app, db };
}

const auth = { authorization: "Bearer test" };

test("GET /users/me/username-availability returns available for a free handle", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "GET",
      url: "/users/me/username-availability?username=fresh-handle",
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; available: boolean; username: string };
    assert.equal(body.ok, true);
    assert.equal(body.available, true);
    assert.equal(body.username, "fresh-handle");
  } finally {
    await app.close();
  }
});

test("GET /users/me/username-availability returns unavailable for a taken handle", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "GET",
      url: "/users/me/username-availability?username=taken-handle",
      headers: auth,
    });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { available: boolean }).available, false);
  } finally {
    await app.close();
  }
});

test("GET /users/me/username-availability rejects a too-short handle with 400", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "GET",
      url: "/users/me/username-availability?username=ab",
      headers: auth,
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("GET /users/me/username-availability requires auth", async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: "GET",
      url: "/users/me/username-availability?username=fresh-handle",
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("PATCH /users/me returns 409 USERNAME_TAKEN when the handle collides", async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ username: "taken-handle" }),
    });
    assert.equal(res.statusCode, 409);
    const body = res.json() as { ok: boolean; code: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, "USERNAME_TAKEN");
    // The UPDATE must never run after a collision.
    assert.equal(db.calls.some((c) => /UPDATE\s+users/i.test(c.text)), false);
  } finally {
    await app.close();
  }
});

test("PATCH /users/me applies a free username and returns 200", async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ username: "fresh-handle" }),
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; user: { username: string } };
    assert.equal(body.ok, true);
    assert.equal(body.user.username, "myhandle");
    assert.equal(db.calls.some((c) => /UPDATE\s+users/i.test(c.text)), true);
  } finally {
    await app.close();
  }
});

test("PATCH /users/me skips the collision query when username is not being changed", async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ displayName: "New Name" }),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(db.calls.some((c) => /LOWER\(username\)/.test(c.text)), false);
  } finally {
    await app.close();
  }
});
