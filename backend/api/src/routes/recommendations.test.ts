import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify, { type FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { registerRecommendationRoutes } from './recommendations.js';


test('interaction ingestion resolves the authenticated actor before persistence', async () => {
  const app = Fastify();
  let requestedUserId: string | undefined;
  registerRecommendationRoutes({
    app,
    db: {} as Pool,
    redis: {} as Redis,
    decisionServiceUrl: 'http://decision.invalid',
    decisionServiceTimeoutMs: 100,
    decisionServiceToken: 'test-decision-token',
    resolveAuthenticatedUserId: (
      _request: FastifyRequest,
      requested?: string,
    ) => {
      requestedUserId = requested;
      const error = new Error('Forbidden user context') as Error & { statusCode: number };
      error.statusCode = 403;
      throw error;
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/interactions',
    payload: {
      userId: 'victim_user',
      listingId: 'listing_1',
      action: 'view',
      strength: 1,
      idempotencyKey: 'interaction-request-1',
    },
  });

  assert.equal(requestedUserId, 'victim_user');
  assert.equal(response.statusCode, 403);
  await app.close();
});

test('recommendation serving resolves the requested user before reading candidates', async () => {
  const app = Fastify();
  let requestedUserId: string | undefined;
  registerRecommendationRoutes({
    app,
    db: {} as Pool,
    redis: {} as Redis,
    decisionServiceUrl: 'http://decision.invalid',
    decisionServiceTimeoutMs: 100,
    decisionServiceToken: 'test-decision-token',
    resolveAuthenticatedUserId: (
      _request: FastifyRequest,
      requested?: string,
    ) => {
      requestedUserId = requested;
      const error = new Error('Unauthorized') as Error & { statusCode: number };
      error.statusCode = 401;
      throw error;
    },
  });

  const response = await app.inject({
    method: 'GET',
    url: '/recommendations/victim_user',
  });

  assert.equal(requestedUserId, 'victim_user');
  assert.equal(response.statusCode, 401);
  await app.close();
});
