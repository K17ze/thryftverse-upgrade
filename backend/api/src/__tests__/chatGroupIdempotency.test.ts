import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashGroupCreatePayload,
  resolveIdempotentResponse,
  buildIdempotencyRecord,
} from '../lib/chatGroupIdempotency.js';

// ── 1. Payload hashing ──

test('hashGroupCreatePayload produces a stable 64-char hex string', () => {
  const payload = { title: 'My Group', memberIds: ['u1', 'u2'] };
  const hash1 = hashGroupCreatePayload(payload);
  const hash2 = hashGroupCreatePayload(payload);

  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test('hashGroupCreatePayload differs when payload differs', () => {
  const payload1 = { title: 'Group A', memberIds: ['u1'] };
  const payload2 = { title: 'Group B', memberIds: ['u1'] };
  const hash1 = hashGroupCreatePayload(payload1);
  const hash2 = hashGroupCreatePayload(payload2);

  assert.notEqual(hash1, hash2);
});

test('hashGroupCreatePayload handles null/undefined payload', () => {
  const hash = hashGroupCreatePayload(null);
  assert.equal(hash.length, 64);
});

test('hashGroupCreatePayload is order-sensitive for arrays', () => {
  const hash1 = hashGroupCreatePayload({ memberIds: ['u1', 'u2'] });
  const hash2 = hashGroupCreatePayload({ memberIds: ['u2', 'u1'] });
  assert.notEqual(hash1, hash2);
});

// ── 2. Idempotency resolution: first request (miss) ──

test('resolveIdempotentResponse returns miss when no existing record', () => {
  const result = resolveIdempotentResponse(null, 'abc123');
  assert.equal(result.kind, 'miss');
});

// ── 3. Idempotency resolution: sequential retry (hit) ──

test('resolveIdempotentResponse returns hit when hash matches', () => {
  const existing = {
    requestHash: 'abc123',
    responsePayload: { ok: true, conversation: { id: 'grp_1' } },
  };
  const result = resolveIdempotentResponse(existing, 'abc123');
  assert.equal(result.kind, 'hit');
  assert.deepEqual(result.response, existing.responsePayload);
});

// ── 4. Idempotency resolution: same key, different payload (conflict) ──

test('resolveIdempotentResponse returns conflict when hash differs', () => {
  const existing = {
    requestHash: 'abc123',
    responsePayload: { ok: true, conversation: { id: 'grp_1' } },
  };
  const result = resolveIdempotentResponse(existing, 'different_hash');
  assert.equal(result.kind, 'conflict');
  assert.equal(result.error.code, 'IDEMPOTENCY_KEY_REUSED');
  assert.match(result.error.message, /different request payload/);
});

// ── 5. Concurrent retry safety: ON CONFLICT DO NOTHING pattern ──

test('concurrent identical requests: second insert is a no-op via ON CONFLICT', () => {
  const record1 = buildIdempotencyRecord('u1', 'key-abc', 'hash-123', 'grp_1', { ok: true });
  const record2 = buildIdempotencyRecord('u1', 'key-abc', 'hash-123', 'grp_1', { ok: true });

  assert.equal(record1.creatorId, record2.creatorId);
  assert.equal(record1.idempotencyKey, record2.idempotencyKey);
  assert.equal(record1.requestHash, record2.requestHash);
  assert.equal(record1.conversationId, record2.conversationId);

  const firstLookup = resolveIdempotentResponse(
    { requestHash: record1.requestHash, responsePayload: record1.responsePayload },
    record2.requestHash
  );
  assert.equal(firstLookup.kind, 'hit');
});

// ── 6. Same key used by different users (scoped to creator) ──

test('same idempotency key used by different users is independent', () => {
  const recordUserA = buildIdempotencyRecord('userA', 'shared-key', 'hash-A', 'grp_A', { ok: true });
  const recordUserB = buildIdempotencyRecord('userB', 'shared-key', 'hash-B', 'grp_B', { ok: true });

  assert.notEqual(recordUserA.creatorId, recordUserB.creatorId);
  assert.equal(recordUserA.idempotencyKey, recordUserB.idempotencyKey);
  assert.notEqual(recordUserA.conversationId, recordUserB.conversationId);

  const lookupA = resolveIdempotentResponse(
    { requestHash: recordUserA.requestHash, responsePayload: recordUserA.responsePayload },
    'hash-A'
  );
  assert.equal(lookupA.kind, 'hit');

  const lookupB = resolveIdempotentResponse(
    { requestHash: recordUserB.requestHash, responsePayload: recordUserB.responsePayload },
    'hash-B'
  );
  assert.equal(lookupB.kind, 'hit');
});

// ── 7. buildIdempotencyRecord constructs correct record ──

test('buildIdempotencyRecord creates a well-formed record', () => {
  const record = buildIdempotencyRecord('u1', 'key-xyz', 'hash-789', 'grp_99', { ok: true });
  assert.equal(record.creatorId, 'u1');
  assert.equal(record.idempotencyKey, 'key-xyz');
  assert.equal(record.requestHash, 'hash-789');
  assert.equal(record.conversationId, 'grp_99');
  assert.deepEqual(record.responsePayload, { ok: true });
});
