import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerUserRoutes } from '../routes/users.js';

/**
 * GET /users/me/privacy-preferences — PrivacySettingsScreen fetched this on
 * mount for months with no route behind it: every visit rendered the error
 * canvas while the PATCH siblings wrote real columns. These tests pin the
 * hydrated contract the client consumes.
 */

type RouteHandler = (request: any, reply: any) => Promise<any>;

function createRouteHarness() {
  const handlers = new Map<string, RouteHandler>();
  const app = {
    post(path: string, handler: RouteHandler) { handlers.set(`POST ${path}`, handler); },
    get(path: string, handler: RouteHandler) { handlers.set(`GET ${path}`, handler); },
    patch(path: string, handler: RouteHandler) { handlers.set(`PATCH ${path}`, handler); },
    put(path: string, handler: RouteHandler) { handlers.set(`PUT ${path}`, handler); },
    delete(path: string, handler: RouteHandler) { handlers.set(`DELETE ${path}`, handler); },
    log: { error() {}, warn() {} },
  } as unknown as FastifyInstance;
  return { app, handlers };
}

function createReply() {
  return {
    statusCode: 200,
    code(statusCode: number) { this.statusCode = statusCode; return this; },
    send(payload: unknown) { return payload; },
  };
}

function createFakePool(user: { activity_status_visible: boolean; search_visibility: string } | null) {
  return {
    async query(sql: string, _params?: unknown[]) {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT activity_status_visible, search_visibility FROM users')) {
        return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
}

function register(db: Pool) {
  const { app, handlers } = createRouteHarness();
  registerUserRoutes({
    app,
    db,
    readDb: db,
    resolveAuthenticatedUserId: () => 'user_1',
    ensureUserExists: async () => {},
    toProfilePayload: (row) => row as unknown as Record<string, unknown>,
    toPublicProfilePayload: (row) => row as unknown as Record<string, unknown>,
    queueUserNotification: async () => null,
  });
  return handlers;
}

const authed = () => ({ authUser: { userId: 'user_1' }, body: {}, params: {}, query: {} });
const anon = () => ({ params: {}, query: {} });

test('GET /users/me/privacy-preferences requires auth', async () => {
  const handlers = register(createFakePool({ activity_status_visible: true, search_visibility: 'visible' }));
  const handler = handlers.get('GET /users/me/privacy-preferences');
  assert.ok(handler, 'route must exist — the client has called it since the screen shipped');
  const reply = createReply();
  const result = await handler(anon(), reply);
  assert.equal(reply.statusCode, 401);
  assert.equal(result.ok, false);
});

test('GET /users/me/privacy-preferences returns stored values', async () => {
  const handlers = register(createFakePool({ activity_status_visible: false, search_visibility: 'hidden' }));
  const handler = handlers.get('GET /users/me/privacy-preferences')!;
  const result = await handler(authed(), createReply());
  assert.equal(result.ok, true);
  assert.equal(result.privacyPreferences.activityStatusVisible, false);
  assert.equal(result.privacyPreferences.searchVisibility, 'hidden');
});

test('GET /users/me/privacy-preferences defaults honestly when the row is absent', async () => {
  const handlers = register(createFakePool(null));
  const handler = handlers.get('GET /users/me/privacy-preferences')!;
  const result = await handler(authed(), createReply());
  assert.equal(result.ok, true);
  assert.equal(result.privacyPreferences.activityStatusVisible, true);
  assert.equal(result.privacyPreferences.searchVisibility, 'visible');
});
