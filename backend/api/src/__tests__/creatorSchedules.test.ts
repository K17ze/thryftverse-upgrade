import assert from 'node:assert/strict';
import test from 'node:test';

// ── Scheduled publication logic tests ─────────────────────────────────
// Tests the core invariants of the scheduled publication system without
// requiring a database. The worker handler (scheduledPublicationHandler.ts)
// is integration-tested via the Fastify inject pattern; these tests verify
// the deterministic logic that makes the SKIP LOCKED queue and version
// checking correct.

// ── Schedule state machine ────────────────────────────────────────────
// pending → claimed → published | failed | cancelled
// A cancelled schedule increments version so a stale claim cannot publish.

const VALID_SCHEDULE_STATES = ['pending', 'claimed', 'published', 'failed', 'cancelled'];

function isValidScheduleState(state: string): boolean {
  return VALID_SCHEDULE_STATES.includes(state);
}

test('schedule state machine accepts all valid states', () => {
  for (const state of VALID_SCHEDULE_STATES) {
    assert.ok(isValidScheduleState(state), `${state} should be valid`);
  }
});

test('schedule state machine rejects invalid states', () => {
  assert.ok(!isValidScheduleState('draft'));
  assert.ok(!isValidScheduleState('active'));
  assert.ok(!isValidScheduleState(''));
});

// ── Version checking ──────────────────────────────────────────────────
// The worker records the version it claimed. If the row's version has
// moved on (cancel/reschedule), the worker refuses to publish.

function shouldPublishClaimedVersion(
  claimedVersion: number,
  currentVersion: number,
  currentState: string,
): { publish: boolean; reason?: string } {
  if (currentState === 'cancelled') {
    return { publish: false, reason: 'Schedule was cancelled' };
  }
  if (claimedVersion !== currentVersion) {
    return { publish: false, reason: 'Schedule version changed — refusing to publish stale version' };
  }
  return { publish: true };
}

test('worker publishes when claimed version matches current version', () => {
  const result = shouldPublishClaimedVersion(1, 1, 'claimed');
  assert.ok(result.publish);
});

test('worker refuses to publish when version has been incremented (cancel/reschedule)', () => {
  const result = shouldPublishClaimedVersion(1, 2, 'claimed');
  assert.ok(!result.publish);
  assert.ok(result.reason?.includes('version changed'));
});

test('worker refuses to publish when schedule was cancelled', () => {
  const result = shouldPublishClaimedVersion(1, 1, 'cancelled');
  assert.ok(!result.publish);
  assert.ok(result.reason?.includes('cancelled'));
});

// ── Idempotency key derivation for scheduled publications ─────────────
// The scheduled publication uses a deterministic idempotency key:
// sched_<scheduleId>_<version>. This ensures the same schedule replayed
// after a lost response produces the same publication.

function deriveScheduleIdempotencyKey(scheduleId: string, version: number): string {
  return `sched_${scheduleId}_${version}`;
}

test('schedule idempotency key is deterministic', () => {
  const k1 = deriveScheduleIdempotencyKey('sched_abc', 1);
  const k2 = deriveScheduleIdempotencyKey('sched_abc', 1);
  assert.equal(k1, k2);
  assert.equal(k1, 'sched_sched_abc_1');
});

test('schedule idempotency key differs by version', () => {
  const k1 = deriveScheduleIdempotencyKey('sched_abc', 1);
  const k2 = deriveScheduleIdempotencyKey('sched_abc', 2);
  assert.notEqual(k1, k2);
});

test('schedule idempotency key differs by schedule ID', () => {
  const k1 = deriveScheduleIdempotencyKey('sched_abc', 1);
  const k2 = deriveScheduleIdempotencyKey('sched_xyz', 1);
  assert.notEqual(k1, k2);
});

// ── Max attempts / poison job prevention ──────────────────────────────
// After max_attempts, a transient failure becomes a definite failure.

function resolveAttemptOutcome(
  attempts: number,
  maxAttempts: number,
  lastError: string | null,
): { state: 'pending' | 'failed'; reason?: string } {
  if (attempts >= maxAttempts) {
    return {
      state: 'failed',
      reason: lastError ?? 'max attempts exceeded',
    };
  }
  return { state: 'pending' };
}

test('transient failure before max attempts returns to pending', () => {
  const result = resolveAttemptOutcome(1, 3, 'network error');
  assert.equal(result.state, 'pending');
});

test('transient failure at max attempts becomes definite failure', () => {
  const result = resolveAttemptOutcome(3, 3, 'network error');
  assert.equal(result.state, 'failed');
  assert.ok(result.reason?.includes('network error'));
});

test('failure with null error uses default reason', () => {
  const result = resolveAttemptOutcome(3, 3, null);
  assert.equal(result.state, 'failed');
  assert.ok(result.reason?.includes('max attempts'));
});

// ── Due time validation ───────────────────────────────────────────────
// The schedule route rejects due times in the past.

function validateDueAt(dueAt: string, now: Date = new Date()): { valid: boolean; error?: string } {
  const due = new Date(dueAt);
  if (isNaN(due.getTime())) {
    return { valid: false, error: 'Invalid due time' };
  }
  if (due.getTime() <= now.getTime()) {
    return { valid: false, error: 'Scheduled time must be in the future' };
  }
  return { valid: true };
}

test('due time in the future is valid', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.ok(validateDueAt(future).valid);
});

test('due time in the past is rejected', () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const result = validateDueAt(past);
  assert.ok(!result.valid);
  assert.ok(result.error?.includes('future'));
});

test('due time equal to now is rejected', () => {
  const now = new Date();
  const result = validateDueAt(now.toISOString(), now);
  assert.ok(!result.valid);
});

test('invalid due time string is rejected', () => {
  const result = validateDueAt('not-a-date');
  assert.ok(!result.valid);
});

// ── Lease timeout ─────────────────────────────────────────────────────
// A claim older than the lease timeout is considered stuck and can be
// reclaimed by another worker.

const CLAIM_LEASE_MS = 5 * 60 * 1000; // 5 minutes

function isClaimStuck(claimedAt: string, now: Date = new Date()): boolean {
  const claimed = new Date(claimedAt);
  return now.getTime() - claimed.getTime() >= CLAIM_LEASE_MS;
}

test('fresh claim is not stuck', () => {
  const claimedAt = new Date(Date.now() - 10_000).toISOString(); // 10s ago
  assert.ok(!isClaimStuck(claimedAt));
});

test('claim older than lease timeout is stuck', () => {
  const claimedAt = new Date(Date.now() - CLAIM_LEASE_MS - 1000).toISOString(); // 5m+1s ago
  assert.ok(isClaimStuck(claimedAt));
});

test('claim at or beyond lease timeout is stuck', () => {
  const claimedAt = new Date(Date.now() - CLAIM_LEASE_MS - 100).toISOString();
  assert.ok(isClaimStuck(claimedAt));
});
