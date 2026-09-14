import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// Refund depth — partial refund validation and platform step-in eligibility.
//
// Covers the pure helpers exported from routes/returns.ts:
//   - isRefundAmountWithinPaidTotal: bounds a requested/proposed refund
//     amount to the paid order total (partial refunds).
//   - computeStepInEligibleAt / computeStepInEligibility: when a buyer may
//     ask the platform to step in after the seller response window.
//   - validateTransition: the appealed state is reachable from the
//     seller-waiting statuses (step-in path) but not from resolved states.
//   - evaluateReturnRequestEligibility: order-status gate + return-window
//     enforcement for return-request creation.
//   - resolveRemedyAmountGbp: only partial_refund carries an explicit amount.
//   - confirmReturnCaseRefund: refund_confirmed is reachable only via a
//     succeeded refund execution on a remedy_accepted case.
// ─────────────────────────────────────────────────────────────────────────────

import {
  RETURN_WINDOW_DAYS,
  SELLER_RESPONSE_WINDOW_HOURS,
  computeStepInEligibility,
  computeStepInEligibleAt,
  confirmReturnCaseRefund,
  evaluateReturnRequestEligibility,
  isRefundAmountWithinPaidTotal,
  resolveRemedyAmountGbp,
  validateTransition,
} from '../routes/returns.js';

// ── Partial refund amount validation ──

test('partial refund: amount within paid total is accepted', () => {
  assert.equal(isRefundAmountWithinPaidTotal(25.0, 56.7), true);
  assert.equal(isRefundAmountWithinPaidTotal(0.01, 56.7), true);
});

test('partial refund: amount equal to paid total is accepted (full refund)', () => {
  assert.equal(isRefundAmountWithinPaidTotal(56.7, 56.7), true);
});

test('partial refund: amount above paid total is rejected', () => {
  assert.equal(isRefundAmountWithinPaidTotal(56.71, 56.7), false);
  assert.equal(isRefundAmountWithinPaidTotal(100, 56.7), false);
});

test('partial refund: zero and negative amounts are rejected', () => {
  assert.equal(isRefundAmountWithinPaidTotal(0, 56.7), false);
  assert.equal(isRefundAmountWithinPaidTotal(-5, 56.7), false);
});

test('partial refund: non-finite amounts are rejected', () => {
  assert.equal(isRefundAmountWithinPaidTotal(Number.NaN, 56.7), false);
  assert.equal(isRefundAmountWithinPaidTotal(Number.POSITIVE_INFINITY, 56.7), false);
});

test('partial refund: penny-rounding on the total is tolerated', () => {
  // total stored as numeric arrives with float noise — 56.7000000001-style
  // values must not push a legitimate full-amount request out of bounds.
  assert.equal(isRefundAmountWithinPaidTotal(19.99, 19.99 + 1e-10), true);
});

// ── Step-in escalation eligibility ──

const WINDOW_MS = SELLER_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000;

test('step-in: not eligible while inside the seller response window', () => {
  const createdAt = '2026-01-10T12:00:00.000Z';
  const now = new Date(new Date(createdAt).getTime() + WINDOW_MS - 60_000);
  const result = computeStepInEligibility({ status: 'requested', createdAt, now });
  assert.equal(result.eligible, false);
  assert.equal(
    result.eligibleAt,
    new Date(new Date(createdAt).getTime() + WINDOW_MS).toISOString(),
  );
});

test('step-in: eligible once the seller response window has elapsed', () => {
  const createdAt = '2026-01-10T12:00:00.000Z';
  const now = new Date(new Date(createdAt).getTime() + WINDOW_MS + 60_000);
  const result = computeStepInEligibility({ status: 'requested', createdAt, now });
  assert.equal(result.eligible, true);
});

test('step-in: evidence_review is still a seller-waiting state', () => {
  const createdAt = '2026-01-10T12:00:00.000Z';
  const now = new Date(new Date(createdAt).getTime() + WINDOW_MS + 1);
  const result = computeStepInEligibility({ status: 'evidence_review', createdAt, now });
  assert.equal(result.eligible, true);
});

test('step-in: not applicable once the seller has responded or case resolved', () => {
  const createdAt = '2026-01-10T12:00:00.000Z';
  const now = new Date(new Date(createdAt).getTime() + WINDOW_MS * 10);
  for (const status of [
    'approved',
    'rejected',
    'reverse_shipped',
    'received',
    'inspected',
    'remedy_proposed',
    'remedy_accepted',
    'refund_confirmed',
    'appealed',
    'closed',
  ] as const) {
    const result = computeStepInEligibility({ status, createdAt, now });
    assert.equal(result.eligible, false, `status ${status} should not be step-in eligible`);
    assert.equal(result.eligibleAt, null);
  }
});

test('step-in: eligibleAt is null for statuses outside the waiting set', () => {
  assert.equal(computeStepInEligibleAt('approved', '2026-01-10T12:00:00.000Z'), null);
  assert.equal(computeStepInEligibleAt('closed', '2026-01-10T12:00:00.000Z'), null);
});

// ── State machine: step-in transitions ──

test('state machine: appealed is reachable from requested and evidence_review', () => {
  assert.equal(validateTransition('requested', 'appealed'), true);
  assert.equal(validateTransition('evidence_review', 'appealed'), true);
});

test('state machine: appealed remains reachable from rejected (existing appeal path)', () => {
  assert.equal(validateTransition('rejected', 'appealed'), true);
  assert.equal(validateTransition('remedy_proposed', 'appealed'), true);
});

test('state machine: appealed is not reachable from resolved/terminal states', () => {
  assert.equal(validateTransition('closed', 'appealed'), false);
  assert.equal(validateTransition('refund_confirmed', 'appealed'), false);
  assert.equal(validateTransition('remedy_accepted', 'appealed'), false);
});

// ── Return-request eligibility (order status + return window) ──

const DAY_MS = 24 * 60 * 60 * 1000;

function deadlineFrom(deliveredAtIso: string): Date {
  return new Date(new Date(deliveredAtIso).getTime() + RETURN_WINDOW_DAYS * DAY_MS);
}

test('return eligibility: delivered and completed orders inside the window are accepted', () => {
  const now = new Date('2026-02-10T12:00:00.000Z');
  const deadline = deadlineFrom('2026-02-05T12:00:00.000Z');
  for (const orderStatus of ['delivered', 'completed']) {
    const result = evaluateReturnRequestEligibility({ orderStatus, returnWindowDeadline: deadline, now });
    assert.equal(result.ok, true, `status ${orderStatus} should be return-eligible`);
  }
});

test('return eligibility: non-delivered order statuses are rejected with RETURN_NOT_AVAILABLE', () => {
  const now = new Date('2026-02-10T12:00:00.000Z');
  const deadline = deadlineFrom('2026-02-09T12:00:00.000Z');
  for (const orderStatus of ['created', 'paid', 'shipped', 'cancelled', 'refunded', 'returned']) {
    const result = evaluateReturnRequestEligibility({ orderStatus, returnWindowDeadline: deadline, now });
    assert.equal(result.ok, false, `status ${orderStatus} should not be return-eligible`);
    if (!result.ok) assert.equal(result.code, 'RETURN_NOT_AVAILABLE');
  }
});

test('return eligibility: status check wins over the window check', () => {
  // A cancelled order long past any window reports RETURN_NOT_AVAILABLE,
  // not RETURN_WINDOW_EXPIRED — the order itself is ineligible.
  const result = evaluateReturnRequestEligibility({
    orderStatus: 'cancelled',
    returnWindowDeadline: deadlineFrom('2025-01-01T00:00:00.000Z'),
    now: new Date('2026-02-10T12:00:00.000Z'),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'RETURN_NOT_AVAILABLE');
});

test('return eligibility: requests after the window are rejected with RETURN_WINDOW_EXPIRED', () => {
  const result = evaluateReturnRequestEligibility({
    orderStatus: 'delivered',
    returnWindowDeadline: deadlineFrom('2026-01-01T00:00:00.000Z'),
    now: new Date('2026-02-10T12:00:00.000Z'),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'RETURN_WINDOW_EXPIRED');
});

test('return eligibility: a request on the deadline boundary is still inside the window', () => {
  const deadline = deadlineFrom('2026-02-01T00:00:00.000Z');
  const result = evaluateReturnRequestEligibility({
    orderStatus: 'completed',
    returnWindowDeadline: deadline,
    now: deadline,
  });
  assert.equal(result.ok, true);
});

test('return eligibility: status comparison is case/underscore tolerant', () => {
  const deadline = deadlineFrom('2026-02-09T12:00:00.000Z');
  const now = new Date('2026-02-10T12:00:00.000Z');
  assert.equal(
    evaluateReturnRequestEligibility({ orderStatus: 'Delivered', returnWindowDeadline: deadline, now }).ok,
    true,
  );
  assert.equal(
    evaluateReturnRequestEligibility({ orderStatus: 'out_for_delivery', returnWindowDeadline: deadline, now }).ok,
    false,
  );
});

// ── Remedy amount contract (P2-23) ──

test('remedy amount: partial_refund requires an explicit amount', () => {
  const result = resolveRemedyAmountGbp({ remedy: 'partial_refund', amountGbp: undefined, orderTotalGbp: 56.7 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'REMEDY_AMOUNT_REQUIRED');
});

test('remedy amount: partial_refund accepts a positive amount within the paid total', () => {
  const result = resolveRemedyAmountGbp({ remedy: 'partial_refund', amountGbp: 25, orderTotalGbp: 56.7 });
  assert.deepEqual(result, { ok: true, remedyAmountGbp: 25 });
});

test('remedy amount: partial_refund rejects amounts over the paid total and zero', () => {
  for (const amountGbp of [56.71, 100, 0]) {
    const result = resolveRemedyAmountGbp({ remedy: 'partial_refund', amountGbp, orderTotalGbp: 56.7 });
    assert.equal(result.ok, false, `amount ${amountGbp} should be rejected`);
    if (!result.ok) assert.equal(result.code, 'REMEDY_AMOUNT_EXCEEDS_TOTAL');
  }
});

test('remedy amount: full_refund stores the paid total and rejects an explicit amount', () => {
  const implicit = resolveRemedyAmountGbp({ remedy: 'full_refund', amountGbp: undefined, orderTotalGbp: 56.7 });
  assert.deepEqual(implicit, { ok: true, remedyAmountGbp: 56.7 });

  // The defect: a "full refund" remedy must never be stored at £5 on a £56.70 order.
  const explicit = resolveRemedyAmountGbp({ remedy: 'full_refund', amountGbp: 5, orderTotalGbp: 56.7 });
  assert.equal(explicit.ok, false);
  if (!explicit.ok) assert.equal(explicit.code, 'REMEDY_AMOUNT_NOT_APPLICABLE');
});

test('remedy amount: reject/replacement/repair store no amount and reject an explicit one', () => {
  for (const remedy of ['reject', 'replacement', 'repair'] as const) {
    const withoutAmount = resolveRemedyAmountGbp({ remedy, amountGbp: undefined, orderTotalGbp: 56.7 });
    assert.deepEqual(withoutAmount, { ok: true, remedyAmountGbp: null });

    const withAmount = resolveRemedyAmountGbp({ remedy, amountGbp: 10, orderTotalGbp: 56.7 });
    assert.equal(withAmount.ok, false, `${remedy} with an amount should be rejected`);
    if (!withAmount.ok) assert.equal(withAmount.code, 'REMEDY_AMOUNT_NOT_APPLICABLE');
  }
});

// ── refund_confirmed only via a real succeeded refund (P1-3) ──

interface MockQuery {
  sql: string;
  params: unknown[];
}

function mockClientWithCaseStatus(status: string | null) {
  const queries: MockQuery[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      if (sql.includes('FROM return_cases')) {
        return { rows: status === null ? [] : [{ status }], rowCount: status === null ? 0 : 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  return { client: client as unknown as PoolClient, queries };
}

test('confirmReturnCaseRefund: advances a remedy_accepted case to refund_confirmed', async () => {
  const { client, queries } = mockClientWithCaseStatus('remedy_accepted');
  const confirmed = await confirmReturnCaseRefund(client, 'rc_1', 'op_1', {
    refundExecutionId: 'rex_1',
  });
  assert.equal(confirmed, true);
  const update = queries.find((q) => q.sql.includes("SET status = 'refund_confirmed'"));
  assert.ok(update, 'expected an UPDATE setting refund_confirmed');
  const event = queries.find((q) => q.sql.includes('INSERT INTO return_case_events'));
  assert.ok(event, 'expected a transition event to be recorded');
  assert.equal(event.params[3], 'refund_confirmed');
});

test('confirmReturnCaseRefund: refuses to confirm from any other status', async () => {
  for (const status of [
    'requested',
    'remedy_proposed',
    'refund_confirmed',
    'appealed',
    'closed',
  ]) {
    const { client, queries } = mockClientWithCaseStatus(status);
    const confirmed = await confirmReturnCaseRefund(client, 'rc_1', 'op_1');
    assert.equal(confirmed, false, `status ${status} must not reach refund_confirmed`);
    assert.equal(
      queries.some((q) => q.sql.includes('UPDATE return_cases')),
      false,
      `status ${status} must not be written`,
    );
  }
});

test('confirmReturnCaseRefund: a missing case is a no-op', async () => {
  const { client, queries } = mockClientWithCaseStatus(null);
  const confirmed = await confirmReturnCaseRefund(client, 'rc_missing', 'op_1');
  assert.equal(confirmed, false);
  assert.equal(queries.some((q) => q.sql.includes('UPDATE return_cases')), false);
});

test('state machine: refund_confirmed remains reachable only from remedy_accepted', () => {
  assert.equal(validateTransition('remedy_accepted', 'refund_confirmed'), true);
  for (const status of [
    'requested',
    'evidence_review',
    'approved',
    'rejected',
    'reverse_shipped',
    'received',
    'inspected',
    'remedy_proposed',
    'appealed',
    'closed',
  ] as const) {
    assert.equal(
      validateTransition(status, 'refund_confirmed'),
      false,
      `${status} must not jump to refund_confirmed`,
    );
  }
});

// ── Refund-execution committed-balance + lifecycle card helpers ────────────
// (P0-1: the maker-checker approval re-check must count pending/unknown
// refunds conservatively; P1-4: 'refunded' only once cumulative succeeded
// refunds cover the paid total — partial refunds announce a distinct card.)

import {
  REFUND_COMMITTED_EXECUTION_STATUSES,
  REFUND_COMMITTED_PROVIDER_STATUSES,
  isOrderFullyRefunded,
  refundExceedsRemaining,
  resolveRefundCardState,
} from '../routes/refunds.js';

test('committed balance: pending/unknown executions and pending provider refunds reserve the balance', () => {
  // A 'pending' execution is a maker-check reservation or a provider call in
  // flight; 'unknown' is an unresolved provider outcome. Both may still pay
  // out — dropping either from the sum re-opens the double-refund race.
  assert.ok(REFUND_COMMITTED_EXECUTION_STATUSES.includes('pending'));
  assert.ok(REFUND_COMMITTED_EXECUTION_STATUSES.includes('succeeded'));
  assert.ok(REFUND_COMMITTED_EXECUTION_STATUSES.includes('unknown'));
  assert.ok(REFUND_COMMITTED_PROVIDER_STATUSES.includes('pending'));
  assert.ok(REFUND_COMMITTED_PROVIDER_STATUSES.includes('succeeded'));
});

test('refundExceedsRemaining: amount at or below the remaining balance is allowed', () => {
  assert.equal(refundExceedsRemaining(56.7, 56.7), false);
  assert.equal(refundExceedsRemaining(25, 56.7), false);
  // Penny-tolerant: numeric storage noise must not reject a boundary refund.
  assert.equal(refundExceedsRemaining(56.7, 56.7 - 1e-10), false);
});

test('refundExceedsRemaining: amount above the remaining balance is rejected', () => {
  assert.equal(refundExceedsRemaining(56.71, 56.7), true);
  assert.equal(refundExceedsRemaining(0.01, 0), true);
});

test('isOrderFullyRefunded: only cumulative coverage of the paid total counts', () => {
  assert.equal(isOrderFullyRefunded(56.7, 56.7), true);
  assert.equal(isOrderFullyRefunded(60, 56.7), true);
  assert.equal(isOrderFullyRefunded(56.69, 56.7), false);
  assert.equal(isOrderFullyRefunded(25, 56.7), false);
});

test('resolveRefundCardState: a partial refund announces order_partially_refunded, never order_refunded', () => {
  assert.equal(resolveRefundCardState('succeeded', 25, 56.7), 'order_partially_refunded');
  assert.equal(resolveRefundCardState('succeeded', 56.7, 56.7), 'order_refunded');
  // Two partial refunds whose cumulative sum reaches the total → full card.
  assert.equal(resolveRefundCardState('succeeded', 56.7, 56.7), 'order_refunded');
});

test('resolveRefundCardState: unresolved executions announce nothing', () => {
  for (const status of ['pending', 'failed', 'unknown'] as const) {
    assert.equal(
      resolveRefundCardState(status, 56.7, 56.7),
      null,
      `${status} must not emit a refund card`,
    );
  }
});
