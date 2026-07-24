import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeVersionedUrl,
  normalizedRoutePath,
} from '../lib/apiVersioning.js';

test('API versioning maps canonical /api/v1 paths to registered route paths', () => {
  assert.deepEqual(normalizeVersionedUrl('/api/v1/listings?limit=20'), {
    url: '/listings?limit=20',
    apiVersion: 'v1',
  });
  assert.deepEqual(normalizeVersionedUrl('/api/v1'), {
    url: '/',
    apiVersion: 'v1',
  });
});

test('API versioning keeps /v1 as a compatibility alias', () => {
  assert.deepEqual(normalizeVersionedUrl('/v1/health'), {
    url: '/health',
    apiVersion: 'v1',
  });
});

test('API versioning marks unversioned paths as legacy without rewriting them', () => {
  assert.deepEqual(normalizeVersionedUrl('/listings'), {
    url: '/listings',
    apiVersion: 'legacy',
  });
});

test('authorization sees the same path for versioned and legacy requests', () => {
  assert.equal(normalizedRoutePath('/api/v1/auth/login?source=mobile'), '/auth/login');
  assert.equal(normalizedRoutePath('/v1/webhooks/stripe'), '/webhooks/stripe');
  assert.equal(normalizedRoutePath('/auth/login?source=mobile'), '/auth/login');
});
