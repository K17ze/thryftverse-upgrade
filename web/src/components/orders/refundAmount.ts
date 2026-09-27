/**
 * Refund-amount helpers — 1:1 port of mobile utils/returnCase.ts
 * (parseRefundAmountInput / validateRequestedRefundAmount). The backend
 * enforces the same bound (REFUND_AMOUNT_EXCEEDS_TOTAL); this is the
 * client-side mirror so the user gets feedback before submit.
 * Pure functions — no React, no side effects.
 */

export type RefundAmountError = 'required' | 'invalid' | 'exceeds_total';

/** Parses a GBP amount typed by the user. Accepts "12", "12.5", "£12.50";
 *  returns null for empty/unparseable input. Rounds to pence. */
export function parseRefundAmountInput(rawText: string): number | null {
  const normalised = rawText.trim().replace(/[£$\s,]/g, '');
  if (!normalised) return null;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/** Validates a requested refund amount against the paid order total. */
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

/** Error → honest field message (mirrors the mobile copy). */
export function refundAmountErrorMessage(
  error: RefundAmountError,
  orderTotalGbp: number,
  formatTotal: (gbp: number) => string,
): string {
  switch (error) {
    case 'required':
      return 'Enter a refund amount.';
    case 'invalid':
      return 'Enter a valid amount.';
    case 'exceeds_total':
      return `Enter an amount up to ${formatTotal(orderTotalGbp)}.`;
  }
}
