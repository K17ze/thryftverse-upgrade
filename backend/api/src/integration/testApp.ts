/**
 * Minimal Fastify test harness for HTTP route integration tests.
 *
 * The production `src/index.ts` is a monolithic 47k-line entrypoint that imports
 * `config.ts` (which calls `assertProductionReadiness` and requires a full set of
 * env vars) and wires up DB, Redis, Stripe, Sentry, queues, realtime, etc.
 * Importing it directly would force every integration test to provision a live
 * database, Redis, key service, S3, and payment providers — which defeats the
 * purpose of a fast, hermetic route-layer test suite.
 *
 * Instead, this harness rebuilds the *middleware layer* (helmet, cors,
 * rate-limit) and a representative subset of routes (/health, /auth/login, a
 * protected route) using the same plugin configurations and the same
 * auth/validation/error-handling patterns as production. This lets us exercise
 * the actual route layer — auth, validation, rate limiting, CORS, helmet
 * headers, error handling, 404 — via `app.inject()` with zero external
 * dependencies.
 *
 * Mirrors:
 *  - helmet config from index.ts:269-282
 *  - cors config from index.ts:286-299
 *  - rate-limit config from index.ts:301-307 (without Redis — in-memory store)
 *  - /health route from index.ts:10958-10968 (mocked — no DB)
 *  - /auth/login route from index.ts:12290-12300 (rate limit + zod validation)
 *  - preHandler auth hook from index.ts:1252-1282
 *  - setErrorHandler from index.ts:1284-1337
 */

import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";

// ── Test-only auth secrets (mirrors production dev defaults) ─────────────────
const TEST_ACCESS_TOKEN_SECRET = "test-access-secret-change-me";
const AUTH_RATE_LIMIT_MAX = 20;
const AUTH_RATE_LIMIT_WINDOW = "1 minute";
const API_RATE_LIMIT_MAX = 10_000; // high global limit so it never trips in tests

// ── Types ────────────────────────────────────────────────────────────────────
interface AuthenticatedUser {
  userId: string;
  role: "user" | "seller" | "moderator" | "admin";
  sessionId: string;
}

// Extend FastifyRequest with authUser like production
declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
  }
}

// ── Helpers (mirror production auth.ts) ─────────────────────────────────────
function getBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }
  return token.trim();
}

/**
 * Verifies an access token. In production this hits the DB to check the session
 * row; here we only verify the JWT signature/payload so tests can exercise the
 * auth middleware without a database.
 */
async function verifyAccessToken(
  accessToken: string,
): Promise<AuthenticatedUser | null> {
  let payload: unknown;
  try {
    payload = jwt.verify(accessToken, TEST_ACCESS_TOKEN_SECRET, {
      algorithms: ["HS256"],
      audience: "thryftverse-app",
      issuer: "thryftverse-api",
    });
  } catch {
    return null;
  }

  const maybe = payload as {
    sub?: unknown;
    role?: unknown;
    sid?: unknown;
    typ?: unknown;
  };

  if (
    typeof maybe.sub !== "string" ||
    typeof maybe.role !== "string" ||
    typeof maybe.sid !== "string" ||
    maybe.typ !== "access" ||
    !["user", "seller", "moderator", "admin"].includes(maybe.role)
  ) {
    return null;
  }

  return {
    userId: maybe.sub,
    role: maybe.role as AuthenticatedUser["role"],
    sessionId: maybe.sid,
  };
}

async function authenticateRequest(
  requestPath: string,
  authHeader: string | undefined,
  app: FastifyInstance,
): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(authHeader);
  if (!token) {
    return null;
  }

  const authUser = await verifyAccessToken(token);
  if (!authUser) {
    app.log.warn({ requestPath }, "Rejected request with invalid access token");
  }

  return authUser;
}

// ── Public route allowlist (mirror index.ts:881-914) ────────────────────────
const PUBLIC_ROUTES = new Set<string>([
  "GET /health",
  "POST /auth/signup",
  "POST /auth/login",
  "POST /auth/refresh",
]);

function isPublicRoute(method: string, path: string): boolean {
  if (method === "OPTIONS") {
    return true;
  }
  return PUBLIC_ROUTES.has(`${method} ${path}`);
}

function getRoutePath(url: string): string {
  return url.split("?")[0] ?? url;
}

// ── Test token issuer (for tests that need a valid token) ───────────────────
export function issueTestAccessToken(
  userId = "test-user-1",
  role: AuthenticatedUser["role"] = "user",
  sessionId = "test-session-1",
): string {
  return jwt.sign(
    { role, sid: sessionId, typ: "access" },
    TEST_ACCESS_TOKEN_SECRET,
    {
      algorithm: "HS256",
      subject: userId,
      audience: "thryftverse-app",
      issuer: "thryftverse-api",
      expiresIn: 300,
    },
  );
}

// ── Test app builder ────────────────────────────────────────────────────────
export async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  // Helmet — mirrors index.ts:269-282
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
      },
    },
    hsts: false, // never in test
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });

  // CORS — mirrors index.ts:286-299 (no origins => disabled for native API)
  await app.register(cors, {
    origin: false, // no browser origins, same as production default
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Service-Token",
      "X-Security-Admin-Token",
    ],
    credentials: false,
    maxAge: 86400,
  });

  // Rate limit — mirrors index.ts:301-307 but in-memory (no Redis)
  await app.register(rateLimit, {
    global: true,
    max: API_RATE_LIMIT_MAX,
    timeWindow: "1 minute",
  });

  // ── Routes ────────────────────────────────────────────────────────────────

  // GET /health — mirrors index.ts:10958-10968 but mocked (no DB/Redis)
  app.get("/health", async () => {
    return {
      ok: true,
      service: "thryftverse-api",
      now: new Date().toISOString(),
      redis: "PONG",
    };
  });

  // POST /auth/login — mirrors index.ts:12290-12300
  // Rate limit + zod validation. Returns 401 for invalid credentials
  // (no DB, so every login "fails" — this is enough to test rate limiting).
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: AUTH_RATE_LIMIT_MAX,
          timeWindow: AUTH_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply) => {
      const bodySchema = z.object({
        email: z.string().trim().email().max(320),
        password: z.string().min(1).max(128),
      });

      const payload = bodySchema.parse(request.body ?? {});

      // No DB — always reject with 401 to simulate invalid credentials.
      // This is the path that exercises the rate limiter.
      reply.code(401);
      return {
        ok: false,
        error: "Invalid email or password",
      };
    },
  );

  // A protected route to test auth middleware (401 / 403).
  app.get("/users/me", async (request, reply) => {
    return {
      ok: true,
      user: {
        id: request.authUser?.userId,
        role: request.authUser?.role,
      },
    };
  });

  // ── preHandler auth hook — mirrors index.ts:1252-1282 ────────────────────
  app.addHook("preHandler", async (request, reply) => {
    const requestPath = getRoutePath(request.raw.url ?? request.url);

    if (isPublicRoute(request.method, requestPath)) {
      return;
    }

    const authUser = await authenticateRequest(
      requestPath,
      request.headers.authorization,
      app,
    );
    if (!authUser) {
      reply.code(401).send({
        ok: false,
        error: "Unauthorized",
      });
      return reply;
    }

    request.authUser = authUser;
  });

  // ── Error handler — mirrors index.ts:1284-1337 ───────────────────────────
  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      {
        err: error,
        method: request.method,
        path: request.raw.url,
      },
      "Unhandled request failure",
    );

    if (reply.sent) {
      return;
    }

    if (error instanceof z.ZodError) {
      reply.code(400);
      reply.send({
        ok: false,
        error: "Invalid request payload",
        details: error.issues,
      });
      return;
    }

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    reply.code(statusCode >= 400 ? statusCode : 500);
    reply.send({
      ok: false,
      error:
        statusCode >= 500
          ? "Internal server error"
          : error instanceof Error
            ? error.message
            : "Request failed",
    });
  });

  return app;
}
