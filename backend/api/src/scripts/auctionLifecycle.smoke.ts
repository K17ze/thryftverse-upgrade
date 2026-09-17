/**
 * Boot-smoke for registerAuctionLifecycleRoutes (routes/auctions.ts).
 *
 * The full registerAuctionRoutes registrar cannot be mounted — it redefines
 * routes that index.ts registers inline (GET /auctions, /home, /:id/bids,
 * buy-now, watch…). This script stubs every inline auction path first, then
 * mounts the real lifecycle registrar and injects each endpoint, proving:
 *   1. app.ready() does not throw a duplicate-route error;
 *   2. all six lifecycle endpoints reach their handlers (not route 404s).
 *
 * Run: node --import tsx src/scripts/auctionLifecycle.smoke.ts
 *
 * Imports pull in lib/queues.ts which keeps ioredis reconnecting in the
 * background — that is why this is a script (explicit process.exit) rather
 * than a node:test file.
 */

import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { registerAuctionLifecycleRoutes } from '../routes/auctions.js';

const ME = 'user-me';
const auth = { authorization: 'Bearer test' };

function fakeDb() {
  const empty = <T extends QueryResultRow>(): QueryResult<T> =>
    ({ rows: [] as T[], rowCount: 0 }) as QueryResult<T>;
  const client = {
    query: async <T extends QueryResultRow = QueryResultRow>() => empty<T>(),
    release: () => {},
  };
  return {
    query: async <T extends QueryResultRow = QueryResultRow>() => empty<T>(),
    connect: async () => client as unknown as PoolClient,
  };
}

async function main(): Promise<void> {
  const app = Fastify({ logger: false });

  // Mirrors the production preHandler contract.
  app.addHook('preHandler', async (request, reply) => {
    if (!request.headers.authorization) {
      reply.code(401).send({ ok: false, error: 'Unauthorized' });
      return reply;
    }
    request.authUser = { userId: ME, role: 'user', sessionId: 's1' } as never;
  });

  // Stubs for the auction surface index.ts registers inline. If the module
  // ever reintroduces a colliding route, app.ready() throws here.
  const inlineStub = async () => ({ ok: true });
  app.get('/auctions', inlineStub);
  app.post('/auctions', inlineStub);
  app.get('/auctions/home', inlineStub);
  app.get('/auctions/1ze-rates', inlineStub);
  app.get('/auctions/watchlist', inlineStub);
  app.get('/auctions/:auctionId', inlineStub);
  app.get('/auctions/:auctionId/bids', inlineStub);
  app.post('/auctions/:auctionId/bids', inlineStub);
  app.post('/auctions/:auctionId/buy-now', inlineStub);
  app.post('/auctions/:auctionId/watch', inlineStub);
  app.delete('/auctions/:auctionId/watch', inlineStub);
  app.get('/users/me/auction-bids', inlineStub);

  registerAuctionLifecycleRoutes({
    app,
    db: fakeDb() as unknown as Pool,
    queueUserNotification: async () => null,
  });

  await app.ready();
  console.log('PASS app.ready() — no duplicate-route crash');

  const checks: Array<{ method: 'GET' | 'POST'; url: string; body?: unknown; expect: number; assertBody?: (b: any) => void }> = [
    {
      method: 'GET',
      url: '/users/me/auction-bids/lookup-by-key/bid-key-1',
      expect: 404,
      assertBody: (b) => assert.equal(b.status, 'safe_to_retry'),
    },
    { method: 'POST', url: '/auctions/auc-1/cancel', body: { reason: 'test' }, expect: 404 },
    { method: 'POST', url: '/auctions/auc-1/payment', body: { idempotencyKey: 'idem-1234' }, expect: 404 },
    { method: 'POST', url: '/auctions/auc-1/second-chance/accept', body: { idempotencyKey: 'idem-1234' }, expect: 404 },
    { method: 'POST', url: '/auctions/auc-1/second-chance/decline', expect: 404 },
    { method: 'POST', url: '/auctions/auc-1/accept-highest-bid', expect: 404 },
  ];

  for (const c of checks) {
    const res = await app.inject({
      method: c.method,
      url: c.url,
      headers: c.body === undefined ? auth : { ...auth, 'content-type': 'application/json' },
      payload: c.body === undefined ? undefined : JSON.stringify(c.body),
    });
    assert.equal(res.statusCode, c.expect, `${c.method} ${c.url} → ${res.statusCode}`);
    const body = res.json() as { ok: boolean; error?: string };
    assert.equal(body.ok, false, `${c.method} ${c.url} missing ok:false`);
    c.assertBody?.(body);
    console.log(`PASS ${c.method} ${c.url} → ${res.statusCode} (handler reached)`);
  }

  const unauth = await app.inject({ method: 'POST', url: '/auctions/auc-1/cancel' });
  assert.equal(unauth.statusCode, 401);
  console.log('PASS POST /auctions/:id/cancel without auth → 401');

  await app.close();
  console.log('auction lifecycle smoke: all checks passed');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('auction lifecycle smoke FAILED:', error);
    process.exit(1);
  });
