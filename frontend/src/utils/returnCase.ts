/**
 * Return-case helpers — pure functions shared by the refund request surface
 * and the return status card. Kept side-effect free so they can be unit
 * tested without rendering.
 */

import type { ReturnCase } from '../services/returnsApi';

export type RefundAmountError = 'required' | 'invalid' | 'exceeds_total';

/**
 * Parses a GBP amount typed by the user. Accepts "12", "12.5", "£12.50";
 * returns null for empty/unparseable input. Rounds to pence.
 */
export function parseRefundAmountInput(rawText: string): number | null {
  const normalised = rawText.trim().replace(/[£$\s,]/g, '');
  if (!normalised) return null;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Validates a requested refund amount against the paid order total.
 * The backend enforces the same bound (REFUND_AMOUNT_EXCEEDS_TOTAL) — this
 * is the client-side mirror so the user gets feedback before submit.
 */
export function validateRequestedRefundAmount(
  rawText: string,
  orderTotalGbp: number,
): { amountGbp: number | null; error: RefundAmountError | null } {
  if (!rawText.trim()) {
    return { amountGbp: null, error: 'required' };
  }
  const parsed = parseRefundAmountInput(rawText);
  if (parsed === null || parsed <= 0) {
    return { amountGbp: null, error: 'invalid' };
  }
  if (parsed > orderTotalGbp + 1e-9) {
    return { amountGbp: null, error: 'exceeds_total' };
  }
  return { amountGbp: parsed, error: null };
}

export type StepInState =
  /** No seller response is pending — case moved past the waiting states. */
  | 'not_applicable'
  /** Still inside the seller response window. */
  | 'pending'
  /** Window elapsed — the buyer may ask the platform to step in. */
  | 'eligible'
  /** Platform review already requested (case status is 'appealed'). */
  | 'escalated';

/**
 * Derives the step-in affordance state from the server-provided fields.
 * `stepInEligibleAt` is authoritative — never compute a window locally.
 */
export function getStepInState(
  returnCase: Pick<ReturnCase, 'status' | 'stepInEligibleAt'>,
  now: Date = new Date(),
): { state: StepInState; eligibleAt: string | null } {
  if (returnCase.status === 'appealed') {
    return { state: 'escalated', eligibleAt: null };
  }
  if (!returnCase.stepInEligibleAt) {
    return { state: 'not_applicable', eligibleAt: null };
  }
  const eligibleAtMs = new Date(returnCase.stepInEligibleAt).getTime();
  if (!Number.isFinite(eligibleAtMs)) {
    return { state: 'not_applicable', eligibleAt: null };
  }
  return now.getTime() >= eligibleAtMs
    ? { state: 'eligible', eligibleAt: returnCase.stepInEligibleAt }
    : { state: 'pending', eligibleAt: returnCase.stepInEligibleAt };
}

/** Human-readable label for a return case status. */
export const RETURN_CASE_STATUS_LABELS: Record<ReturnCase['status'], string> = {
  requested: 'Return requested — waiting for the seller',
  evidence_review: 'Return under review',
  approved: 'Return approved',
  rejected: 'Return declined',
  reverse_shipped: 'Return on its way to the seller',
  received: 'Return received by the seller',
  inspected: 'Return inspected',
  remedy_proposed: 'Remedy proposed',
  remedy_accepted: 'Remedy accepted',
  refund_confirmed: 'Refund confirmed',
  appealed: 'Thryft is reviewing this case',
  closed: 'Case closed',
};

const REFUND_REMEDIES: ReadonlySet<ReturnCase['proposedRemedy']> = new Set([
  'full_refund',
  'partial_refund',
]);

/**
 * Truthful status line for a return case.
 *
 * `remedy_accepted` only means the buyer accepted the proposal. For a refund
 * remedy the money has NOT moved at that point — it moves when a linked
 * refund execution succeeds and the case reaches `refund_confirmed` — so the
 * copy reads "approved, processing" rather than implying the refund landed.
 * `refund_confirmed` is only reachable from a succeeded refund execution, so
 * its label stays "Refund confirmed".
 */
export function getReturnCaseStatusLabel(
  returnCase: Pick<ReturnCase, 'status' | 'proposedRemedy'>,
): string {
  if (
    returnCase.status === 'remedy_accepted' &&
    returnCase.proposedRemedy !== null &&
    REFUND_REMEDIES.has(returnCase.proposedRemedy)
  ) {
    return 'Refund approved — processing';
  }
  return RETURN_CASE_STATUS_LABELS[returnCase.status] ?? returnCase.status;
}

/**
 * Mirror of the backend RETURN_WINDOW_DAYS (routes/returns.ts). Once a case
 * exists the server-stored `returnWindowDeadline` is authoritative — this
 * constant only gates whether the return topic is offered at all.
 */
export const RETURN_WINDOW_DAYS = 14;

/**
 * Whether a return can still be requested for an order delivered at
 * `deliveredAtIso`. Null/unparseable input defers to the server — hiding the
 * topic on missing data would lock out legitimate returns, and the backend
 * re-enforces the window regardless.
 */
export function isWithinReturnWindow(
  deliveredAtIso: string | null,
  now: Date = new Date(),
): boolean {
  if (!deliveredAtIso) return true;
  const delivered = new Date(deliveredAtIso).getTime();
  if (!Number.isFinite(delivered)) return true;
  const deadline = delivered + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() <= deadline;
}
