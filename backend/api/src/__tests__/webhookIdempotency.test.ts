import assert from 'node:assert/strict';
import test from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// Webhook idempotency — duplicate and out-of-order replay protection
//
// The webhook handler uses a durable inbox pattern:
//   1. INSERT INTO webhook_events ... ON CONFLICT (event_id) DO NOTHING
//   2. If insert returns 0 rows, check existing status:
//      - 'succeeded' → return 200 OK { duplicate: true } (idempotent)
//      - 'received'/'failed' → reprocess (reset to 'received')
//   3. Process the event within the same transaction
//   4. Update status to 'succeeded' on commit
//
// These tests verify the dedup decision logic without a live database.
// ─────────────────────────────────────────────────────────────────────────────

type WebhookEventStatus = 'received' | 'processing' | 'succeeded' | 'failed';

interface DedupDecisionInput {
  insertReturnedRow: boolean; // true if INSERT returned a row (new event)
  existingStatus: WebhookEventStatus | null;
}

interface DedupDecision {
  action: 'process' | 'skip_duplicate' | 'reprocess';
  responseCode: number;
  responseBody: { ok: boolean; duplicate?: boolean };
}

/**
 * Models the webhook event-ID dedup logic from the webhook handler.
 */
function evaluateWebhookDedup(input: DedupDecisionInput): DedupDecision {
  if (input.insertReturnedRow) {
    // New event — proceed to processing.
    return {
      action: 'process',
      responseCode: 200,
      responseBody: { ok: true },
    };
  }

  // Insert returned 0 rows — event already exists.
  const status = input.existingStatus;
  if (status === 'succeeded') {
    return {
      action: 'skip_duplicate',
      responseCode: 200,
      responseBody: { ok: true, duplicate: true },
    };
  }

  // Status is 'received', 'failed', or 'processing' — reprocess.
  return {
    action: 'reprocess',
    responseCode: 200,
    responseBody: { ok: true },
  };
}

test('first delivery of an event is processed', () => {
  const decision = evaluateWebhookDedup({
    insertReturnedRow: true,
    existingStatus: null,
  });

  assert.equal(decision.action, 'process');
  assert.equal(decision.responseCode, 200);
  assert.equal(decision.responseBody.duplicate, undefined);
});

test('duplicate delivery of a succeeded event is skipped', () => {
  const decision = evaluateWebhookDedup({
    insertReturnedRow: false,
    existingStatus: 'succeeded',
  });

  assert.equal(decision.action, 'skip_duplicate');
  assert.equal(decision.responseCode, 200);
  assert.equal(decision.responseBody.duplicate, true);
});

test('replay of a failed event triggers reprocessing', () => {
  const decision = evaluateWebhookDedup({
    insertReturnedRow: false,
    existingStatus: 'failed',
  });

  assert.equal(decision.action, 'reprocess');
  assert.equal(decision.responseCode, 200);
  assert.equal(decision.responseBody.duplicate, undefined);
});

test('replay of a received (in-progress) event triggers reprocessing', () => {
  const decision = evaluateWebhookDedup({
    insertReturnedRow: false,
    existingStatus: 'received',
  });

  assert.equal(decision.action, 'reprocess');
  assert.equal(decision.responseCode, 200);
});

test('out-of-order delivery: second event with same ID after first succeeded is idempotent', () => {
  // First delivery
  const first = evaluateWebhookDedup({ insertReturnedRow: true, existingStatus: null });
  assert.equal(first.action, 'process');

  // Second delivery (duplicate) after first succeeded
  const second = evaluateWebhookDedup({ insertReturnedRow: false, existingStatus: 'succeeded' });
  assert.equal(second.action, 'skip_duplicate');
  assert.equal(second.responseBody.duplicate, true);
});

test('three duplicate deliveries: only first is processed', () => {
  const first = evaluateWebhookDedup({ insertReturnedRow: true, existingStatus: null });
  assert.equal(first.action, 'process');

  const second = evaluateWebhookDedup({ insertReturnedRow: false, existingStatus: 'succeeded' });
  assert.equal(second.action, 'skip_duplicate');

  const third = evaluateWebhookDedup({ insertReturnedRow: false, existingStatus: 'succeeded' });
  assert.equal(third.action, 'skip_duplicate');
});

test('event that was being processed when crash occurred is reprocessed on replay', () => {
  // The event was in 'processing' status when the server crashed.
  // On replay, it should be reprocessed.
  const decision = evaluateWebhookDedup({
    insertReturnedRow: false,
    existingStatus: 'processing',
  });

  assert.equal(decision.action, 'reprocess');
});
