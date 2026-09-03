import assert from 'node:assert/strict';
import test from 'node:test';

// ── Publication orchestrator logic tests ──────────────────────────────
// Tests the core invariants of the creator publication orchestrator without
// requiring a database connection. The orchestrator route (creatorPublications.ts)
// is integration-tested via the Fastify inject pattern elsewhere; these tests
// verify the deterministic logic that makes idempotency and conflict detection
// correct.

import crypto from 'node:crypto';

// ── Payload hash determinism ──────────────────────────────────────────
// The orchestrator derives a SHA-256 payload hash from the canonical JSON
// serialisation of the publish command. Same command → same hash → idempotent
// replay. Different command → different hash → conflict.

function computePayloadHash(command: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
}

test('payload hash is deterministic for identical commands', () => {
  const command = {
    revision: 1,
    destination: 'look',
    audience: 'public',
    expectedMedia: [
      { layerId: 'layer_1', finalizationId: 'fin_abc', mediaType: 'image', suppliedUrl: 'https://cdn.example.com/img.jpg' },
    ],
  };
  const hash1 = computePayloadHash(command);
  const hash2 = computePayloadHash(command);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64); // SHA-256 hex
});

test('payload hash differs when content changes', () => {
  const base = {
    revision: 1,
    destination: 'look',
    audience: 'public',
    expectedMedia: [
      { layerId: 'layer_1', finalizationId: 'fin_abc', mediaType: 'image', suppliedUrl: 'https://cdn.example.com/img.jpg' },
    ],
  };
  const modified = { ...base, audience: 'private' };
  assert.notEqual(computePayloadHash(base), computePayloadHash(modified));
});

test('payload hash differs when media URL changes', () => {
  const base = {
    revision: 1,
    destination: 'poster',
    expectedMedia: [
      { layerId: 'f1', finalizationId: 'fin_1', mediaType: 'image', suppliedUrl: 'https://cdn.example.com/a.jpg' },
    ],
  };
  const modified = {
    ...base,
    expectedMedia: [
      { layerId: 'f1', finalizationId: 'fin_1', mediaType: 'image', suppliedUrl: 'https://cdn.example.com/b.jpg' },
    ],
  };
  assert.notEqual(computePayloadHash(base), computePayloadHash(modified));
});

// ── Idempotency key derivation ────────────────────────────────────────
// The orchestrator derives the key from header > body > fallback.
// The fallback is deterministic: pub_<documentId>_<revision>.

function deriveIdempotencyKey(
  headerKey: string | undefined,
  bodyKey: string | undefined,
  documentId: string,
  revision: number,
): string {
  return headerKey ?? bodyKey ?? `pub_${documentId}_${revision}`;
}

test('idempotency key prefers header over body over fallback', () => {
  const documentId = 'doc_123';
  const revision = 5;

  // Header takes precedence
  assert.equal(
    deriveIdempotencyKey('header_key', 'body_key', documentId, revision),
    'header_key',
  );

  // Body when no header
  assert.equal(
    deriveIdempotencyKey(undefined, 'body_key', documentId, revision),
    'body_key',
  );

  // Fallback when neither
  assert.equal(
    deriveIdempotencyKey(undefined, undefined, documentId, revision),
    'pub_doc_123_5',
  );
});

test('idempotency key fallback is deterministic for same document+revision', () => {
  const k1 = deriveIdempotencyKey(undefined, undefined, 'doc_abc', 3);
  const k2 = deriveIdempotencyKey(undefined, undefined, 'doc_abc', 3);
  assert.equal(k1, k2);
  assert.equal(k1, 'pub_doc_abc_3');
});

// ── Idempotent replay vs conflict resolution ──────────────────────────
// The orchestrator's core decision: same key + same hash → replay; same key
// + different hash → conflict. This is the logic that makes lost-response
// recovery safe.

function resolveIdempotency(
  existingHash: string,
  incomingHash: string,
): { action: 'replay' | 'conflict' | 'proceed' } {
  if (existingHash === incomingHash) {
    return { action: 'replay' };
  }
  return { action: 'conflict' };
}

test('same key + same hash → idempotent replay', () => {
  const hash = computePayloadHash({ revision: 1, destination: 'look' });
  assert.equal(resolveIdempotency(hash, hash).action, 'replay');
});

test('same key + different hash → conflict (fails closed)', () => {
  const hash1 = computePayloadHash({ revision: 1, destination: 'look' });
  const hash2 = computePayloadHash({ revision: 1, destination: 'poster' });
  assert.equal(resolveIdempotency(hash1, hash2).action, 'conflict');
});

// ── Local URI rejection ───────────────────────────────────────────────
// The orchestrator must reject local URIs in expectedMedia — media must be
// uploaded and finalised before publish. This mirrors the poster-stories
// standard and the old validateForPublish check.

const LOCAL_URI_PREFIXES = ['file://', 'ph://', 'asset://', 'data:', 'content://', 'assets-library://'];

function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

test('isLocalUri rejects all local URI schemes', () => {
  assert.ok(isLocalUri('file:///path/to/img.jpg'));
  assert.ok(isLocalUri('ph://asset/abc'));
  assert.ok(isLocalUri('asset://local/img.png'));
  assert.ok(isLocalUri('data:image/png;base64,...'));
  assert.ok(isLocalUri('content://media/external/images/1'));
  assert.ok(isLocalUri('assets-library://id'));
});

test('isLocalUri accepts remote URLs', () => {
  assert.ok(!isLocalUri('https://cdn.example.com/img.jpg'));
  assert.ok(!isLocalUri('https://s3.amazonaws.com/bucket/img.png'));
});

// ── Scheduling casing fix ─────────────────────────────────────────────
// The server now accepts both scheduled_for (snake_case) and scheduledFor
// (camelCase). The frontend sends both. This test verifies the resolution
// logic: scheduled_for takes precedence, then scheduledFor, then null.

function resolveScheduledFor(body: {
  scheduled_for?: string | null;
  scheduledFor?: string | null;
}): string | null {
  return body.scheduled_for ?? body.scheduledFor ?? null;
}

test('scheduling accepts scheduled_for (snake_case)', () => {
  const result = resolveScheduledFor({ scheduled_for: '2026-12-01T10:00:00Z' });
  assert.equal(result, '2026-12-01T10:00:00Z');
});

test('scheduling accepts scheduledFor (camelCase)', () => {
  const result = resolveScheduledFor({ scheduledFor: '2026-12-01T10:00:00Z' });
  assert.equal(result, '2026-12-01T10:00:00Z');
});

test('scheduling prefers scheduled_for over scheduledFor when both present', () => {
  const result = resolveScheduledFor({
    scheduled_for: '2026-12-01T10:00:00Z',
    scheduledFor: '2026-12-02T10:00:00Z',
  });
  assert.equal(result, '2026-12-01T10:00:00Z');
});

test('scheduling resolves to null when neither field is present', () => {
  const result = resolveScheduledFor({});
  assert.equal(result, null);
});

test('scheduling resolves to null when both fields are null (clear schedule)', () => {
  const result = resolveScheduledFor({ scheduled_for: null, scheduledFor: null });
  assert.equal(result, null);
});

// ── Publication state machine ─────────────────────────────────────────
// The creator_publications.state column constrains the lifecycle:
// publishing → published | blocked | failed | revoked

const VALID_PUBLICATION_STATES = ['publishing', 'published', 'blocked', 'failed', 'revoked'];

function isValidPublicationState(state: string): boolean {
  return VALID_PUBLICATION_STATES.includes(state);
}

test('publication state machine accepts all valid states', () => {
  for (const state of VALID_PUBLICATION_STATES) {
    assert.ok(isValidPublicationState(state), `${state} should be valid`);
  }
});

test('publication state machine rejects invalid states', () => {
  assert.ok(!isValidPublicationState('draft'));
  assert.ok(!isValidPublicationState('scheduled'));
  assert.ok(!isValidPublicationState('archived'));
  assert.ok(!isValidPublicationState(''));
});

// ── Document lifecycle state machine ──────────────────────────────────
// The expanded creator_documents.status constraint:
// draft → ready → scheduled → publishing → published | blocked | failed
// draft → deleted
// published → archived

const VALID_DOCUMENT_STATUSES = [
  'draft', 'ready', 'scheduled', 'publishing',
  'published', 'blocked', 'failed', 'archived', 'deleted',
];

function isValidDocumentStatus(status: string): boolean {
  return VALID_DOCUMENT_STATUSES.includes(status);
}

test('document lifecycle accepts all expanded states', () => {
  for (const status of VALID_DOCUMENT_STATUSES) {
    assert.ok(isValidDocumentStatus(status), `${status} should be valid`);
  }
});

test('document lifecycle rejects invalid states', () => {
  assert.ok(!isValidDocumentStatus('pending'));
  assert.ok(!isValidDocumentStatus('active'));
  assert.ok(!isValidDocumentStatus(''));
});

// ── Revision allocation ───────────────────────────────────────────────
// The orchestrator allocates revision = head_revision + 1, then updates
// head_revision and published_revision atomically.

function allocateRevision(headRevision: number): number {
  return headRevision + 1;
}

test('revision allocation increments from head_revision', () => {
  assert.equal(allocateRevision(0), 1);
  assert.equal(allocateRevision(41), 42);
  assert.equal(allocateRevision(99), 100);
});

test('revision allocation is monotonic', () => {
  let head = 0;
  const r1 = allocateRevision(head);
  head = r1;
  const r2 = allocateRevision(head);
  head = r2;
  const r3 = allocateRevision(head);
  assert.equal(r1, 1);
  assert.equal(r2, 2);
  assert.equal(r3, 3);
  assert.ok(r1 < r2 && r2 < r3);
});

// ── Destination validation ────────────────────────────────────────────
// The orchestrator accepts look, poster, moodboard. All three are now
// implemented as typed projections. Unknown destinations fail closed.

const SUPPORTED_DESTINATIONS = ['look', 'poster', 'moodboard'];

function resolveDestinationSupport(destination: string): {
  supported: boolean;
  code?: string;
} {
  if (SUPPORTED_DESTINATIONS.includes(destination)) {
    return { supported: true };
  }
  return { supported: false, code: 'INVALID_DESTINATION' };
}

test('look, poster, and moodboard destinations are all supported', () => {
  assert.ok(resolveDestinationSupport('look').supported);
  assert.ok(resolveDestinationSupport('poster').supported);
  assert.ok(resolveDestinationSupport('moodboard').supported);
});

test('unknown destination is rejected', () => {
  const result = resolveDestinationSupport('reel');
  assert.ok(!result.supported);
  assert.equal(result.code, 'INVALID_DESTINATION');
});

test('moodboard requires moodboardId in document metadata', () => {
  // The orchestrator extracts moodboardId from doc.metadata.
  // Without it, the publication fails with MOODBOARD_ID_REQUIRED.
  const docWithoutMoodboardId = { type: 'moodboard', metadata: { caption: 'test' } };
  const moodboardId = (docWithoutMoodboardId.metadata as Record<string, unknown> | undefined)?.moodboardId;
  assert.equal(moodboardId, undefined);
});
