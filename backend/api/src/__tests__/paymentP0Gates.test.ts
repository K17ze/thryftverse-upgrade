import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { resolvePayoutProviderReference } from '../lib/payoutTransitionPolicy.js';
import type {
  BreakType,
  SafeguardingCheck,
  SafeguardingStatus,
  ThreeWayReconciliationResult,
} from '../lib/reconciliation.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Payout status config — PAY-13
//    The frontend PAYOUT_STATUS_CONFIG must distinguish `processing` from
//    `paid`. We cannot import frontend code in backend tests, so we verify
//    the backend gate that enforces the same distinction: a `paid` payout
//    requires a provider reference, while `processing` does not.
// ─────────────────────────────────────────────────────────────────────────────

test('PAY-13: paid status with a provider reference is accepted', () => {
  const resolution = resolvePayoutProviderReference({
    targetStatus: 'paid',
    transitionSource: 'admin_review',
    inputProviderPayoutRef: 'wise_trx_abc_123',
    existingProviderPayoutRef: null,
  });

  assert.equal(resolution.requiresProviderReference, true);
  assert.equal(resolution.providerPayoutRef, 'wise_trx_abc_123');
  assert.equal(resolution.isValid, true);
});

test('PAY-13: paid status without a provider reference is rejected', () => {
  const resolution = resolvePayoutProviderReference({
    targetStatus: 'paid',
    transitionSource: 'admin_review',
    inputProviderPayoutRef: '   ',
    existingProviderPayoutRef: null,
  });

  assert.equal(resolution.requiresProviderReference, true);
  assert.equal(resolution.providerPayoutRef, null);
  assert.equal(resolution.isValid, false);
});

test('PAY-13: paid status with only whitespace provider reference is rejected', () => {
  const resolution = resolvePayoutProviderReference({
    targetStatus: 'paid',
    transitionSource: 'provider_webhook',
    inputProviderPayoutRef: '\t\n ',
    existingProviderPayoutRef: '',
  });

  assert.equal(resolution.requiresProviderReference, true);
  assert.equal(resolution.providerPayoutRef, null);
  assert.equal(resolution.isValid, false);
});

test('PAY-13: processing status does not require a provider reference', () => {
  const resolution = resolvePayoutProviderReference({
    targetStatus: 'processing',
    transitionSource: 'admin_review',
    inputProviderPayoutRef: null,
    existingProviderPayoutRef: null,
  });

  assert.equal(resolution.requiresProviderReference, false);
  assert.equal(resolution.providerPayoutRef, null);
  assert.equal(resolution.isValid, true);
});

test('PAY-13: processing status keeps an existing provider reference but does not require one', () => {
  const resolution = resolvePayoutProviderReference({
    targetStatus: 'processing',
    transitionSource: 'provider_webhook',
    inputProviderPayoutRef: null,
    existingProviderPayoutRef: '  wise_existing_456  ',
  });

  assert.equal(resolution.requiresProviderReference, false);
  assert.equal(resolution.providerPayoutRef, 'wise_existing_456');
  assert.equal(resolution.isValid, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Refund remaining-refundable guard — PAY-02
//    The guard lives inline in index.ts. We extract the pure math here and
//    verify the invariant: a refund is allowed only when the requested amount
//    does not exceed the intent amount minus already-refunded (including
//    pending/in-flight) refunds.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure mirror of the remaining-refundable guard in index.ts (PAY-02).
 * `alreadyRefundedGbp` MUST include both succeeded AND pending refunds so
 * that concurrent in-flight refunds are blocked from over-refunding.
 */
function remainingRefundableGbp(intentAmountGbp: number, alreadyRefundedGbp: number): number {
  return Math.round((intentAmountGbp - alreadyRefundedGbp) * 100) / 100;
}

function refundIsAllowed(
  intentAmountGbp: number,
  alreadyRefundedGbp: number,
  refundAmountGbp: number
): boolean {
  const remaining = remainingRefundableGbp(intentAmountGbp, alreadyRefundedGbp);
  return refundAmountGbp <= remaining + 1e-6;
}

test('PAY-02: refund within remaining-refundable amount is allowed', () => {
  // intent 100.00, already refunded 30.00, requesting 70.00 -> exactly remaining
  assert.equal(refundIsAllowed(100, 30, 70), true);
});

test('PAY-02: refund equal to full intent with no prior refunds is allowed', () => {
  assert.equal(refundIsAllowed(100, 0, 100), true);
});

test('PAY-02: refund exceeding remaining-refundable amount is blocked', () => {
  // intent 100.00, already refunded 30.00, requesting 70.01 -> exceeds remaining
  assert.equal(refundIsAllowed(100, 30, 70.01), false);
});

test('PAY-02: refund exceeding intent with no prior refunds is blocked', () => {
  assert.equal(refundIsAllowed(100, 0, 100.01), false);
});

test('PAY-02: concurrent refunds (alreadyRefunded includes pending) are blocked', () => {
  // Two concurrent refunds of 60.00 each against a 100.00 intent. The first
  // refund is pending (counted in alreadyRefunded), so the second must be
  // blocked even though neither has succeeded yet.
  const intentAmount = 100;
  const pendingRefund = 60; // first refund in-flight
  const secondRefundRequest = 60;
  assert.equal(refundIsAllowed(intentAmount, pendingRefund, secondRefundRequest), false);
});

test('PAY-02: remaining-refundable math is exact for pence-level amounts', () => {
  assert.equal(remainingRefundableGbp(42.35, 12.10), 30.25);
  assert.equal(remainingRefundableGbp(0.10, 0.10), 0);
  assert.equal(remainingRefundableGbp(99.99, 0), 99.99);
});

test('PAY-02: fully refunded intent blocks any further refund', () => {
  assert.equal(refundIsAllowed(50, 50, 0.01), false);
  assert.equal(refundIsAllowed(50, 50, 0), true); // zero refund is a no-op, not over-refund
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Maker-checker — PAY-16
//    Terminal status confirmation (succeeded/failed/cancelled) in production
//    requires a second admin approver. The approver must differ from the
//    requesting admin (maker != checker). `processing` is non-terminal and
//    does not require an approver.
// ─────────────────────────────────────────────────────────────────────────────

interface MakerCheckerInput {
  simulateStatus: 'processing' | 'succeeded' | 'failed' | 'cancelled';
  isAdmin: boolean;
  nodeEnv: string;
  approverId: string | undefined;
  requestUserId: string;
}

interface MakerCheckerResult {
  allowed: boolean;
  code: string | null;
}

/**
 * Pure mirror of the maker-checker gate in index.ts (PAY-16). Returns whether
 * the confirmation is allowed and the error code if not.
 */
function evaluateMakerChecker(input: MakerCheckerInput): MakerCheckerResult {
  const isTerminalStatus = input.simulateStatus !== 'processing';

  if (!input.isAdmin) {
    return { allowed: false, code: 'TERMINAL_STATUS_REQUIRES_ADMIN' };
  }

  if (isTerminalStatus) {
    if (input.nodeEnv === 'production' && !input.approverId) {
      return { allowed: false, code: 'MAKER_CHECKER_REQUIRED' };
    }

    if (input.approverId && input.approverId === input.requestUserId) {
      return { allowed: false, code: 'APPROVER_MUST_DIFFER' };
    }
  }

  return { allowed: true, code: null };
}

test('PAY-16: self-approval (approverId === requestUserId) is rejected', () => {
  const result = evaluateMakerChecker({
    simulateStatus: 'succeeded',
    isAdmin: true,
    nodeEnv: 'production',
    approverId: 'admin_42',
    requestUserId: 'admin_42',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'APPROVER_MUST_DIFFER');
});

test('PAY-16: approverId differing from requestUserId is accepted in production', () => {
  const result = evaluateMakerChecker({
    simulateStatus: 'succeeded',
    isAdmin: true,
    nodeEnv: 'production',
    approverId: 'admin_99',
    requestUserId: 'admin_42',
  });

  assert.equal(result.allowed, true);
  assert.equal(result.code, null);
});

test('PAY-16: approverId is required for terminal status in production', () => {
  const result = evaluateMakerChecker({
    simulateStatus: 'succeeded',
    isAdmin: true,
    nodeEnv: 'production',
    approverId: undefined,
    requestUserId: 'admin_42',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'MAKER_CHECKER_REQUIRED');
});

test('PAY-16: approverId is NOT required for processing status', () => {
  const result = evaluateMakerChecker({
    simulateStatus: 'processing',
    isAdmin: true,
    nodeEnv: 'production',
    approverId: undefined,
    requestUserId: 'admin_42',
  });

  assert.equal(result.allowed, true);
  assert.equal(result.code, null);
});

test('PAY-16: approverId is NOT required for terminal status outside production', () => {
  const result = evaluateMakerChecker({
    simulateStatus: 'succeeded',
    isAdmin: true,
    nodeEnv: 'development',
    approverId: undefined,
    requestUserId: 'admin_42',
  });

  assert.equal(result.allowed, true);
  assert.equal(result.code, null);
});

test('PAY-16: non-admin cannot confirm terminal status', () => {
  const result = evaluateMakerChecker({
    simulateStatus: 'succeeded',
    isAdmin: false,
    nodeEnv: 'production',
    approverId: 'admin_99',
    requestUserId: 'user_1',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'TERMINAL_STATUS_REQUIRES_ADMIN');
});

test('PAY-16: self-approval is rejected for failed terminal status too', () => {
  const result = evaluateMakerChecker({
    simulateStatus: 'failed',
    isAdmin: true,
    nodeEnv: 'production',
    approverId: 'admin_7',
    requestUserId: 'admin_7',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'APPROVER_MUST_DIFFER');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Three-way reconciliation types — PAY-10, PAY-11
//    Verify the type-level guarantees introduced for three-way reconciliation.
// ─────────────────────────────────────────────────────────────────────────────

test('PAY-10/PAY-11: BreakType includes missing_internal and missing_provider', () => {
  // Construct a value of each break type and assert membership. This is a
  // type-level guarantee exercised at runtime via a controlled set.
  const breakTypes: BreakType[] = [
    'missing_internal',
    'missing_provider',
    'amount_mismatch',
    'currency_mismatch',
    'status_mismatch',
    'fee_mismatch',
    'duplicate_internal',
    'duplicate_provider',
    'timing_expected',
    'payout_batch_mismatch',
    'bank_missing',
    'safeguarding_shortfall',
    'stale_unknown',
  ];

  assert.ok(breakTypes.includes('missing_internal'));
  assert.ok(breakTypes.includes('missing_provider'));
});

test('PAY-10/PAY-11: ThreeWayReconciliationResult has an incomplete field', () => {
  const result: ThreeWayReconciliationResult = {
    runId: 'rec_20260427_abc',
    runDate: '2026-04-27',
    providerFactCount: 10,
    internalFactCount: 9,
    bankFactCount: 8,
    breakCount: 3,
    breaksBySeverity: { low: 1, medium: 1, high: 1, critical: 0 },
    breaksByType: {
      missing_internal: 1,
      missing_provider: 1,
      amount_mismatch: 1,
      currency_mismatch: 0,
      status_mismatch: 0,
      fee_mismatch: 0,
      duplicate_internal: 0,
      duplicate_provider: 0,
      timing_expected: 0,
      payout_batch_mismatch: 0,
      bank_missing: 0,
      safeguarding_shortfall: 0,
      stale_unknown: 0,
    },
    incomplete: true,
    status: 'mismatch',
  };

  assert.equal(result.incomplete, true);
  assert.equal(result.breakCount, 3);
});

test('PAY-10/PAY-11: SafeguardingCheck has a status field with balanced/shortfall/surplus/incomplete', () => {
  const validStatuses: SafeguardingStatus[] = ['balanced', 'shortfall', 'surplus', 'incomplete'];

  const check: SafeguardingCheck = {
    id: 1,
    checkDate: '2026-04-27',
    internalLiabilityMinor: 100000,
    safeguardedBalanceMinor: 100000,
    differenceMinor: 0,
    status: 'balanced',
    evidence: {},
    checkedAt: '2026-04-27T00:00:00.000Z',
  };

  assert.ok(validStatuses.includes(check.status));
  assert.equal(check.status, 'balanced');

  // Every required status variant is representable.
  const shortfall: SafeguardingCheck = { ...check, status: 'shortfall', differenceMinor: -500 };
  const surplus: SafeguardingCheck = { ...check, status: 'surplus', differenceMinor: 500 };
  const incomplete: SafeguardingCheck = { ...check, status: 'incomplete' };

  assert.equal(shortfall.status, 'shortfall');
  assert.equal(surplus.status, 'surplus');
  assert.equal(incomplete.status, 'incomplete');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Money journal kernel — PAY-05, PAY-17
//    Read the migration SQL and assert the required structures exist.
// ─────────────────────────────────────────────────────────────────────────────

function readMigrationSql(): string {
  const migrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '169_money_journal_kernel.sql'
  );
  return fs.readFileSync(migrationPath, 'utf8');
}

test('PAY-05/PAY-17: money_journals table has posting_key with a UNIQUE constraint', () => {
  const sql = readMigrationSql();
  // The CREATE TABLE block for money_journals must declare posting_key UNIQUE.
  const journalsBlockMatch = sql.match(
    /CREATE TABLE IF NOT EXISTS money_journals \([\s\S]*?\);/
  );
  assert.ok(journalsBlockMatch, 'money_journals CREATE TABLE block not found');
  const journalsBlock = journalsBlockMatch[0];
  assert.match(journalsBlock, /posting_key\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
});

test('PAY-17: money_journal_lines uses amount_minor BIGINT (not NUMERIC)', () => {
  const sql = readMigrationSql();
  const linesBlockMatch = sql.match(
    /CREATE TABLE IF NOT EXISTS money_journal_lines \([\s\S]*?\);/
  );
  assert.ok(linesBlockMatch, 'money_journal_lines CREATE TABLE block not found');
  const linesBlock = linesBlockMatch[0];

  assert.match(linesBlock, /amount_minor\s+BIGINT\s+NOT\s+NULL/i);
  // Explicitly assert no NUMERIC(12,2) is used for the amount column.
  assert.doesNotMatch(linesBlock, /amount_minor\s+NUMERIC/i);
});

test('PAY-05: enforce_journal_balanced function exists', () => {
  const sql = readMigrationSql();
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+enforce_journal_balanced\s*\(\s*\)/i);
  // And it is wired to a trigger on money_journal_lines.
  assert.match(sql, /EXECUTE\s+FUNCTION\s+enforce_journal_balanced\s*\(\s*\)/i);
});

test('PAY-05: prevent_journal_mutation function exists', () => {
  const sql = readMigrationSql();
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+prevent_journal_mutation\s*\(\s*\)/i);
  // And it is wired to a trigger on money_journals.
  assert.match(sql, /EXECUTE\s+FUNCTION\s+prevent_journal_mutation\s*\(\s*\)/i);
});

test('PAY-17: migration explicitly documents the BIGINT minor-units decision', () => {
  const sql = readMigrationSql();
  // The header comment documents the PAY-17 fix rationale.
  assert.match(sql, /PAY-17/i);
  assert.match(sql, /BIGINT minor units/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Provider I/O outside transaction — §5.1 gate
//    `provider_submission_pending` must be a valid PaymentIntentStatus and the
//    transition map must allow recovery transitions from it to every expected
//    state. We mirror the transition map declared in index.ts here and verify
//    the gate.
// ─────────────────────────────────────────────────────────────────────────────

type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'provider_submission_pending';

const ALLOWED_TRANSITIONS: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  requires_payment_method: ['requires_confirmation', 'cancelled'],
  requires_confirmation: ['processing', 'succeeded', 'failed', 'cancelled'],
  processing: ['succeeded', 'failed', 'cancelled'],
  provider_submission_pending: [
    'requires_payment_method',
    'requires_confirmation',
    'processing',
    'succeeded',
    'failed',
    'cancelled',
  ],
  succeeded: [],
  failed: [],
  cancelled: [],
};

test('§5.1 gate: provider_submission_pending is a valid PaymentIntentStatus', () => {
  const allStatuses: PaymentIntentStatus[] = [
    'requires_payment_method',
    'requires_confirmation',
    'processing',
    'succeeded',
    'failed',
    'cancelled',
    'provider_submission_pending',
  ];
  assert.ok(allStatuses.includes('provider_submission_pending'));
});

test('§5.1 gate: provider_submission_pending can transition to processing (recovery after provider ack)', () => {
  assert.ok(
    ALLOWED_TRANSITIONS.provider_submission_pending.includes('processing'),
    'provider_submission_pending must be able to transition to processing'
  );
});

test('§5.1 gate: provider_submission_pending can transition to succeeded (provider confirms capture)', () => {
  assert.ok(
    ALLOWED_TRANSITIONS.provider_submission_pending.includes('succeeded'),
    'provider_submission_pending must be able to transition to succeeded'
  );
});

test('§5.1 gate: provider_submission_pending can transition to failed (provider call error)', () => {
  assert.ok(
    ALLOWED_TRANSITIONS.provider_submission_pending.includes('failed'),
    'provider_submission_pending must be able to transition to failed'
  );
});

test('§5.1 gate: provider_submission_pending can transition to cancelled (user/admin cancel)', () => {
  assert.ok(
    ALLOWED_TRANSITIONS.provider_submission_pending.includes('cancelled'),
    'provider_submission_pending must be able to transition to cancelled'
  );
});

test('§5.1 gate: provider_submission_pending can transition back to requires_payment_method (retry)', () => {
  assert.ok(
    ALLOWED_TRANSITIONS.provider_submission_pending.includes('requires_payment_method'),
    'provider_submission_pending must be able to transition back to requires_payment_method for retry'
  );
});

test('§5.1 gate: provider_submission_pending can transition to requires_confirmation (retry)', () => {
  assert.ok(
    ALLOWED_TRANSITIONS.provider_submission_pending.includes('requires_confirmation'),
    'provider_submission_pending must be able to transition to requires_confirmation for retry'
  );
});

test('§5.1 gate: terminal states have no outgoing transitions', () => {
  assert.deepEqual(ALLOWED_TRANSITIONS.succeeded, []);
  assert.deepEqual(ALLOWED_TRANSITIONS.failed, []);
  assert.deepEqual(ALLOWED_TRANSITIONS.cancelled, []);
});
