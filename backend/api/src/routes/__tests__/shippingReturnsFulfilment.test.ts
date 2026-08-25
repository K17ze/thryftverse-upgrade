import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { validateTransition } from '../returns.js';
import { computeSloDeadline } from '../exceptionQueue.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Returns state machine validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Returns state machine', () => {
  it('allows requested → evidence_review', () => {
    assert.equal(validateTransition('requested', 'evidence_review'), true);
  });
  it('allows requested → approved', () => {
    assert.equal(validateTransition('requested', 'approved'), true);
  });
  it('allows requested → rejected', () => {
    assert.equal(validateTransition('requested', 'rejected'), true);
  });
  it('allows approved → reverse_shipped', () => {
    assert.equal(validateTransition('approved', 'reverse_shipped'), true);
  });
  it('allows rejected → appealed', () => {
    assert.equal(validateTransition('rejected', 'appealed'), true);
  });
  it('allows reverse_shipped → received', () => {
    assert.equal(validateTransition('reverse_shipped', 'received'), true);
  });
  it('allows received → inspected', () => {
    assert.equal(validateTransition('received', 'inspected'), true);
  });
  it('allows inspected → remedy_proposed', () => {
    assert.equal(validateTransition('inspected', 'remedy_proposed'), true);
  });
  it('allows remedy_proposed → remedy_accepted', () => {
    assert.equal(validateTransition('remedy_proposed', 'remedy_accepted'), true);
  });
  it('allows remedy_proposed → appealed', () => {
    assert.equal(validateTransition('remedy_proposed', 'appealed'), true);
  });
  it('allows remedy_accepted → refund_confirmed', () => {
    assert.equal(validateTransition('remedy_accepted', 'refund_confirmed'), true);
  });
  it('allows remedy_accepted → closed', () => {
    assert.equal(validateTransition('remedy_accepted', 'closed'), true);
  });
  it('allows appealed → remedy_proposed', () => {
    assert.equal(validateTransition('appealed', 'remedy_proposed'), true);
  });
  it('allows appealed → closed', () => {
    assert.equal(validateTransition('appealed', 'closed'), true);
  });
  it('allows refund_confirmed → closed', () => {
    assert.equal(validateTransition('refund_confirmed', 'closed'), true);
  });

  // Invalid transitions
  it('rejects requested → received (skipping approval)', () => {
    assert.equal(validateTransition('requested', 'received'), false);
  });
  it('rejects requested → closed (skipping entire flow)', () => {
    assert.equal(validateTransition('requested', 'closed'), false);
  });
  it('rejects closed → requested (terminal state)', () => {
    assert.equal(validateTransition('closed', 'requested'), false);
  });
  it('rejects approved → inspected (skipping reverse shipment)', () => {
    assert.equal(validateTransition('approved', 'inspected'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Exception queue SLO computation
// ─────────────────────────────────────────────────────────────────────────────

describe('Exception queue SLO computation', () => {
  it('p0 gives ~4 hour deadline', () => {
    const deadline = computeSloDeadline('p0');
    const now = Date.now();
    const hoursUntil = (deadline.getTime() - now) / (60 * 60 * 1000);
    assert.ok(hoursUntil > 3.9, `expected >3.9h, got ${hoursUntil}h`);
    assert.ok(hoursUntil < 4.1, `expected <4.1h, got ${hoursUntil}h`);
  });
  it('p1 gives ~24 hour deadline', () => {
    const deadline = computeSloDeadline('p1');
    const now = Date.now();
    const hoursUntil = (deadline.getTime() - now) / (60 * 60 * 1000);
    assert.ok(hoursUntil > 23.9, `expected >23.9h, got ${hoursUntil}h`);
    assert.ok(hoursUntil < 24.1, `expected <24.1h, got ${hoursUntil}h`);
  });
  it('p2 gives ~72 hour deadline', () => {
    const deadline = computeSloDeadline('p2');
    const now = Date.now();
    const hoursUntil = (deadline.getTime() - now) / (60 * 60 * 1000);
    assert.ok(hoursUntil > 71.9, `expected >71.9h, got ${hoursUntil}h`);
    assert.ok(hoursUntil < 72.1, `expected <72.1h, got ${hoursUntil}h`);
  });
  it('p3 gives ~168 hour (7 day) deadline', () => {
    const deadline = computeSloDeadline('p3');
    const now = Date.now();
    const hoursUntil = (deadline.getTime() - now) / (60 * 60 * 1000);
    assert.ok(hoursUntil > 167.9, `expected >167.9h, got ${hoursUntil}h`);
    assert.ok(hoursUntil < 168.1, `expected <168.1h, got ${hoursUntil}h`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Refund idempotency hash computation
// ─────────────────────────────────────────────────────────────────────────────
//
// The refunds.ts module computes a request_hash from a canonical JSON payload
// of { orderId, amountGbp (2dp), initiatorId, reason }. We replicate that
// canonicalisation here to verify the determinism and normalisation rules.

describe('Refund idempotency hash', () => {
  function computeRefundHash(
    orderId: string,
    amountGbp: number,
    initiatorId: string,
    reason: string,
  ): string {
    const canonical = JSON.stringify({
      orderId,
      amountGbp: Number(amountGbp).toFixed(2),
      initiatorId,
      reason,
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  it('produces same hash for same inputs', () => {
    const h1 = computeRefundHash('order_123', 50.0, 'admin_1', 'damaged item');
    const h2 = computeRefundHash('order_123', 50.0, 'admin_1', 'damaged item');
    assert.equal(h1, h2);
  });
  it('produces different hash for different amount', () => {
    const h1 = computeRefundHash('order_123', 50.0, 'admin_1', 'damaged item');
    const h2 = computeRefundHash('order_123', 51.0, 'admin_1', 'damaged item');
    assert.notEqual(h1, h2);
  });
  it('produces different hash for different order', () => {
    const h1 = computeRefundHash('order_123', 50.0, 'admin_1', 'damaged item');
    const h2 = computeRefundHash('order_456', 50.0, 'admin_1', 'damaged item');
    assert.notEqual(h1, h2);
  });
  it('normalizes amount to 2 decimal places', () => {
    const h1 = computeRefundHash('order_123', 50, 'admin_1', 'damaged item');
    const h2 = computeRefundHash('order_123', 50.0, 'admin_1', 'damaged item');
    assert.equal(h1, h2);
  });
});
