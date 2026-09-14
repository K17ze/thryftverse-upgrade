import { describe, it, expect } from 'vitest';
import {
  parseRefundAmountInput,
  validateRequestedRefundAmount,
  getStepInState,
  getReturnCaseStatusLabel,
  isWithinReturnWindow,
  RETURN_WINDOW_DAYS,
} from '../utils/returnCase';
import { SELLER_RESPONSE_WINDOW_HOURS } from '../services/returnsApi';

// ─────────────────────────────────────────────────────────────────────────────
// Refund depth — client-side validation for partial refund requests and the
// platform step-in affordance state. Mirrors the server-side bounds in
// backend/api/src/routes/returns.ts.
// ─────────────────────────────────────────────────────────────────────────────

describe('parseRefundAmountInput', () => {
  it('parses plain and currency-prefixed amounts', () => {
    expect(parseRefundAmountInput('12')).toBe(12);
    expect(parseRefundAmountInput('12.5')).toBe(12.5);
    expect(parseRefundAmountInput('£12.50')).toBe(12.5);
    expect(parseRefundAmountInput(' 12.99 ')).toBe(12.99);
  });

  it('returns null for empty or unparseable input', () => {
    expect(parseRefundAmountInput('')).toBeNull();
    expect(parseRefundAmountInput('   ')).toBeNull();
    expect(parseRefundAmountInput('abc')).toBeNull();
    expect(parseRefundAmountInput('£')).toBeNull();
  });
});

describe('validateRequestedRefundAmount', () => {
  const TOTAL = 56.7;

  it('accepts an amount equal to the paid total (full refund)', () => {
    expect(validateRequestedRefundAmount('56.70', TOTAL)).toEqual({
      amountGbp: 56.7,
      error: null,
    });
  });

  it('accepts a partial amount below the paid total', () => {
    expect(validateRequestedRefundAmount('20', TOTAL)).toEqual({
      amountGbp: 20,
      error: null,
    });
  });

  it('rejects amounts above the paid total', () => {
    const result = validateRequestedRefundAmount('60', TOTAL);
    expect(result.error).toBe('exceeds_total');
    expect(result.amountGbp).toBeNull();
  });

  it('rejects zero and negative amounts', () => {
    expect(validateRequestedRefundAmount('0', TOTAL).error).toBe('invalid');
    expect(validateRequestedRefundAmount('-5', TOTAL).error).toBe('invalid');
  });

  it('rejects a blank amount', () => {
    expect(validateRequestedRefundAmount('', TOTAL).error).toBe('required');
    expect(validateRequestedRefundAmount('   ', TOTAL).error).toBe('required');
  });

  it('rejects unparseable input', () => {
    expect(validateRequestedRefundAmount('abc', TOTAL).error).toBe('invalid');
  });
});

describe('getStepInState', () => {
  const windowMs = SELLER_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000;
  const createdAt = new Date('2026-01-10T12:00:00.000Z');
  const eligibleAt = new Date(createdAt.getTime() + windowMs).toISOString();

  it('is pending while inside the seller response window', () => {
    const now = new Date(createdAt.getTime() + windowMs - 60_000);
    const result = getStepInState(
      { status: 'requested', stepInEligibleAt: eligibleAt },
      now,
    );
    expect(result.state).toBe('pending');
    expect(result.eligibleAt).toBe(eligibleAt);
  });

  it('is eligible once the window has elapsed', () => {
    const now = new Date(createdAt.getTime() + windowMs + 60_000);
    const result = getStepInState(
      { status: 'requested', stepInEligibleAt: eligibleAt },
      now,
    );
    expect(result.state).toBe('eligible');
  });

  it('is escalated when the case status is appealed', () => {
    const result = getStepInState({ status: 'appealed', stepInEligibleAt: null });
    expect(result.state).toBe('escalated');
  });

  it('is not applicable when the server provides no eligibility timestamp', () => {
    const result = getStepInState({ status: 'approved', stepInEligibleAt: null });
    expect(result.state).toBe('not_applicable');
  });
});

describe('getReturnCaseStatusLabel', () => {
  it('renders remedy_accepted with a refund remedy as processing, not confirmed', () => {
    // A refund remedy acceptance means the refund is approved — money moves
    // only when a refund execution succeeds and the case reaches
    // refund_confirmed.
    for (const proposedRemedy of ['full_refund', 'partial_refund'] as const) {
      expect(getReturnCaseStatusLabel({ status: 'remedy_accepted', proposedRemedy })).toBe(
        'Refund approved — processing',
      );
    }
  });

  it('renders remedy_accepted with a non-refund remedy as a plain acceptance', () => {
    expect(getReturnCaseStatusLabel({ status: 'remedy_accepted', proposedRemedy: 'replacement' })).toBe(
      'Remedy accepted',
    );
    expect(getReturnCaseStatusLabel({ status: 'remedy_accepted', proposedRemedy: null })).toBe(
      'Remedy accepted',
    );
  });

  it('keeps refund_confirmed as confirmed (only reachable via a succeeded refund)', () => {
    expect(getReturnCaseStatusLabel({ status: 'refund_confirmed', proposedRemedy: 'full_refund' })).toBe(
      'Refund confirmed',
    );
  });
});

describe('isWithinReturnWindow', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('is inside the window within RETURN_WINDOW_DAYS of delivery', () => {
    const deliveredAt = '2026-02-01T12:00:00.000Z';
    const now = new Date(new Date(deliveredAt).getTime() + (RETURN_WINDOW_DAYS - 1) * DAY_MS);
    expect(isWithinReturnWindow(deliveredAt, now)).toBe(true);
  });

  it('is outside the window once the deadline has passed', () => {
    const deliveredAt = '2026-02-01T12:00:00.000Z';
    const now = new Date(new Date(deliveredAt).getTime() + (RETURN_WINDOW_DAYS + 1) * DAY_MS);
    expect(isWithinReturnWindow(deliveredAt, now)).toBe(false);
  });

  it('defers to the server when deliveredAt is missing or unparseable', () => {
    expect(isWithinReturnWindow(null)).toBe(true);
    expect(isWithinReturnWindow('not-a-date')).toBe(true);
  });
});
