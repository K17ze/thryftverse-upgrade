import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyHybridError } from './vectorSearch.js';

// ── embedder_unconfigured ─────────────────────────────────────────────────────

test('classifyHybridError returns embedder_unconfigured for invalid_search_embedder code', () => {
  const err = { code: 'invalid_search_embedder', message: 'bad embedder', type: 'invalid_request_error' };
  assert.equal(classifyHybridError(err), 'embedder_unconfigured');
});

test('classifyHybridError returns embedder_unconfigured for embedder_not_found code', () => {
  const err = { code: 'embedder_not_found', message: 'no such embedder', type: 'invalid_request_error' };
  assert.equal(classifyHybridError(err), 'embedder_unconfigured');
});

test('classifyHybridError returns embedder_unconfigured when message says embedder default not found', () => {
  const err = { code: 'unknown_error', message: 'embedder default not found', type: 'invalid_request_error' };
  assert.equal(classifyHybridError(err), 'embedder_unconfigured');
});

test('classifyHybridError returns embedder_unconfigured when message says embedder is not configured', () => {
  const err = new Error('The embedder is not configured for this index');
  assert.equal(classifyHybridError(err), 'embedder_unconfigured');
});

// ── hybrid_search_failed ──────────────────────────────────────────────────────

test('classifyHybridError returns hybrid_search_failed when hybrid search is not enabled', () => {
  const err = { code: 'bad_request', message: 'hybrid search is not enabled', type: 'invalid_request_error' };
  assert.equal(classifyHybridError(err), 'hybrid_search_failed');
});

test('classifyHybridError returns hybrid_search_failed for a generic network error', () => {
  const err = new Error('connect ECONNREFUSED 127.0.0.1:7700');
  assert.equal(classifyHybridError(err), 'hybrid_search_failed');
});

test('classifyHybridError returns hybrid_search_failed for a plain string error', () => {
  assert.equal(classifyHybridError('something went wrong'), 'hybrid_search_failed');
});

test('classifyHybridError returns hybrid_search_failed for null', () => {
  assert.equal(classifyHybridError(null), 'hybrid_search_failed');
});

// ── regression: "embedder" mention without a config problem ───────────────────

test('classifyHybridError does not classify an embedder timeout as unconfigured', () => {
  const err = { code: 'internal_error', message: 'embedder response timeout', type: 'server_error' };
  assert.equal(classifyHybridError(err), 'hybrid_search_failed');
});

test('classifyHybridError does not classify an embedder overload as unconfigured', () => {
  const err = new Error('embedder service overloaded, retry later');
  assert.equal(classifyHybridError(err), 'hybrid_search_failed');
});
