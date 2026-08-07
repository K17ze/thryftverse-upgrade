/**
 * HTTP route integration tests using Fastify inject.
 *
 * These tests exercise the actual route layer — auth middleware, input
 * validation, rate limiting, CORS headers, helmet security headers, error
 * handling, and 404 — without starting a real server or provisioning a
 * database. They use the minimal test harness in `testApp.ts` which
 * rebuilds the production middleware stack (helmet, cors, rate-limit) with
 * the same configurations and route/auth patterns.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, issueTestAccessToken } from "./testApp.js";

// ── 1. Health endpoint ──────────────────────────────────────────────────────

test("GET /health returns 200 with correct shape", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({ method: "GET", url: "/health" });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      ok: unknown;
      service: unknown;
      now: unknown;
      redis: unknown;
    };
    assert.equal(body.ok, true);
    assert.equal(body.service, "thryftverse-api");
    assert.equal(typeof body.now, "string");
    assert.equal(body.redis, "PONG");
  } finally {
    await app.close();
  }
});

// ── 2. Auth rate limiting ───────────────────────────────────────────────────

test("POST /auth/login hits the rate limit after AUTH_RATE_LIMIT_MAX attempts", async () => {
  const app = await createTestApp();
  const AUTH_RATE_LIMIT_MAX = 20;
  try {
    const payload = JSON.stringify({
      email: "nobody@example.com",
      password: "wrong-password",
    });

    // The first AUTH_RATE_LIMIT_MAX requests should return 401 (invalid creds).
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload,
        headers: { "content-type": "application/json" },
      });
      assert.equal(
        response.statusCode,
        401,
        `request ${i + 1} should return 401, got ${response.statusCode}`,
      );
    }

    // The next request should be rate-limited (429).
    const blocked = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload,
      headers: { "content-type": "application/json" },
    });
    assert.equal(blocked.statusCode, 429);
    const body = blocked.json() as { ok: unknown; error: unknown };
    assert.equal(body.ok, false);
  } finally {
    await app.close();
  }
});

// ── 3. CORS headers ──────────────────────────────────────────────────────────

test("OPTIONS request returns no Access-Control-Allow-Origin when no origins configured", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "https://evil.example.com",
        "access-control-request-method": "GET",
      },
    });

    // With origin: false, CORS should not echo an allow-origin header.
    assert.equal(
      response.headers["access-control-allow-origin"],
      undefined,
      "CORS must not allow arbitrary origins when none are configured",
    );
  } finally {
    await app.close();
  }
});

test("GET request does not include Access-Control-Allow-Origin by default", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example.com" },
    });

    assert.equal(response.headers["access-control-allow-origin"], undefined);
  } finally {
    await app.close();
  }
});

// ── 4. Helmet security headers ───────────────────────────────────────────────

test("GET /health returns X-Content-Type-Options and X-Frame-Option headers", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({ method: "GET", url: "/health" });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["x-content-type-options"],
      "nosniff",
      "helmet noSniff should set X-Content-Type-Options: nosniff",
    );
    assert.equal(
      response.headers["x-frame-options"],
      "DENY",
      "helmet frameguard should set X-Frame-Options: DENY",
    );
  } finally {
    await app.close();
  }
});

test("GET response includes Content-Security-Policy default-src 'none'", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({ method: "GET", url: "/health" });

    const csp = response.headers["content-security-policy"];
    assert.ok(
      typeof csp === "string" && csp.includes("default-src 'none'"),
      "CSP should lock down to default-src 'none' for JSON API",
    );
  } finally {
    await app.close();
  }
});

test("GET response includes Referrer-Policy header", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({ method: "GET", url: "/health" });

    assert.equal(
      response.headers["referrer-policy"],
      "strict-origin-when-cross-origin",
    );
  } finally {
    await app.close();
  }
});

// ── 5. Auth middleware ───────────────────────────────────────────────────────

test("protected route returns 401 without auth token", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({
      method: "GET",
      url: "/users/me",
    });

    assert.equal(response.statusCode, 401);
    const body = response.json() as { ok: unknown; error: unknown };
    assert.equal(body.ok, false);
    assert.equal(body.error, "Unauthorized");
  } finally {
    await app.close();
  }
});

test("protected route returns 401 with invalid bearer token", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: "Bearer not-a-real-jwt" },
    });

    assert.equal(response.statusCode, 401);
    const body = response.json() as { ok: unknown; error: unknown };
    assert.equal(body.ok, false);
    assert.equal(body.error, "Unauthorized");
  } finally {
    await app.close();
  }
});

test("protected route returns 200 with a valid access token", async () => {
  const app = await createTestApp();
  try {
    const token = issueTestAccessToken();
    const response = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      ok: unknown;
      user: { id: unknown; role: unknown };
    };
    assert.equal(body.ok, true);
    assert.equal(body.user.id, "test-user-1");
    assert.equal(body.user.role, "user");
  } finally {
    await app.close();
  }
});

test("protected route returns 401 with malformed authorization header (no Bearer prefix)", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: "test-user-1" },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await app.close();
  }
});

// ── 6. Input validation ──────────────────────────────────────────────────────

test("POST /auth/login with invalid JSON body returns 400", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: "not valid json{{{",
      headers: { "content-type": "application/json" },
    });

    // Fastify's JSON parser rejects malformed JSON with a 400.
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("POST /auth/login with missing email returns 400", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: JSON.stringify({ password: "somepassword" }),
      headers: { "content-type": "application/json" },
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as { ok: unknown; error: unknown };
    assert.equal(body.ok, false);
    assert.equal(body.error, "Invalid request payload");
  } finally {
    await app.close();
  }
});

test("POST /auth/login with invalid email format returns 400", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: JSON.stringify({ email: "not-an-email", password: "x" }),
      headers: { "content-type": "application/json" },
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("POST /auth/login with empty body returns 400", async () => {
  const app = await createTestApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: "{}",
      headers: { "content-type": "application/json" },
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

// ── 7. Not found ─────────────────────────────────────────────────────────────

test("GET /nonexistent with valid auth returns 404", async () => {
  const app = await createTestApp();
  try {
    // The global preHandler auth hook runs for every request including the
    // not-found handler, so we must provide a valid token to get past auth
    // and reach the actual 404 response.
    const token = issueTestAccessToken();
    const response = await app.inject({
      method: "GET",
      url: "/nonexistent",
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("GET /nonexistent without auth returns 401 (auth runs before 404)", async () => {
  const app = await createTestApp();
  try {
    // The global preHandler hook intercepts unmatched routes before the 404
    // handler, so an unauthenticated request to an unknown path returns 401.
    // This mirrors production behaviour where the auth hook is global.
    const response = await app.inject({
      method: "GET",
      url: "/totally-unknown-path",
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await app.close();
  }
});
