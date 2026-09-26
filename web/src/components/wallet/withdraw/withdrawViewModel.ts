'use client';

/**
 * Withdraw view model — web port of the mobile
 * components/withdraw/withdrawViewModels.ts contract. Owns the honest
 * payout-status vocabulary (never "Paid" until the bank confirms), the UK
 * bank-account validation (6-digit sort code, 8-digit account number —
 * stored masked to last4 only) and the amount-composer derivations so the
 * surface stays thin.
 */

import type { PayoutAccount, PayoutRequest, PayoutRequestStatus } from '@/lib/data/fixtures';
import { round2 } from '../convertViewModel';

// ── Flow ──────────────────────────────────────────────────────────────

export type WithdrawStep = 'form' | 'confirm' | 'submitting' | 'success';

export interface WithdrawSuccessData {
  reference: string;
  amountGbp: number;
  destinationLabel: string;
  createdAt: string;
}

/**
 * Payout economics. The mobile model is zero-fee on withdrawals
 * (WithdrawConfirmStep renders `formatFromFiat(0, 'GBP')`) and commits to
 * no arrival promise — requests sit in `requested` until reviewed. The
 * 1–3 business-day figure is the form's "estimated arrival" disclosure
 * (WithdrawFormFooter), not a guarantee.
 */
export const WITHDRAWAL_FEE_GBP = 0;
export const WITHDRAWAL_ETA_LABEL = '1–3 business days';
export const WITHDRAWAL_REVIEW_LABEL = "Reviewed by our team before it's sent";
/** Below this a payout request isn't accepted by the rail. */
export const MIN_WITHDRAWAL_GBP = 1;

// ── Payout status — honest labelling ──────────────────────────────────

export type PayoutStatus = PayoutRequestStatus;

export interface PayoutStatusConfig {
  label: string;
  subtitle: string;
  /** Badge variant on history rows. */
  badge: 'neutral' | 'warning' | 'success' | 'danger';
  /** True while the request is in flight — drives the pending badge. */
  pending: boolean;
}

export const PAYOUT_STATUS_CONFIG: Record<PayoutStatus, PayoutStatusConfig> = {
  requested: {
    label: 'Pending review',
    subtitle: 'Awaiting review by our team',
    badge: 'warning',
    pending: true,
  },
  processing: {
    label: 'Processing',
    subtitle: 'Transfer initiated — your bank has not confirmed yet',
    badge: 'warning',
    pending: true,
  },
  paid: {
    label: 'Paid',
    subtitle: 'Confirmed by your bank',
    badge: 'success',
    pending: false,
  },
  failed: {
    label: 'Failed',
    subtitle: 'The transfer could not be completed',
    badge: 'danger',
    pending: false,
  },
  cancelled: {
    label: 'Cancelled',
    subtitle: '',
    badge: 'neutral',
    pending: false,
  },
};

export function resolvePayoutStatusConfig(status: PayoutStatus): PayoutStatusConfig {
  return PAYOUT_STATUS_CONFIG[status] ?? PAYOUT_STATUS_CONFIG.requested;
}

// ── Amount composer ───────────────────────────────────────────────────

export type WithdrawAmountError = 'below_min' | 'over_balance' | 'no_method';

export const AMOUNT_ERROR_COPY: Record<WithdrawAmountError, string> = {
  below_min: `Minimum withdrawal is £${MIN_WITHDRAWAL_GBP.toFixed(0)}.`,
  over_balance: 'Entered amount exceeds available balance.',
  no_method: 'Add a bank account to withdraw to.',
};

/** First blocking problem with the current draft, or null when reviewable. */
export function withdrawError(
  amount: number,
  available: number,
  hasPayoutMethod: boolean,
): WithdrawAmountError | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount > available) return 'over_balance';
  if (amount < MIN_WITHDRAWAL_GBP) return 'below_min';
  if (!hasPayoutMethod) return 'no_method';
  return null;
}

export function canReview(
  amount: number,
  available: number,
  hasPayoutMethod: boolean,
  busy: boolean,
): boolean {
  return (
    Number.isFinite(amount) &&
    amount >= MIN_WITHDRAWAL_GBP &&
    amount <= available &&
    hasPayoutMethod &&
    !busy
  );
}

export const QUICK_PERCENTAGES = [25, 50, 100] as const;

export function quickAmount(available: number, pct: number): number {
  return round2((available * pct) / 100);
}

// ── UK bank account validation ────────────────────────────────────────
// Mirrors the AddBankAccountScreen fields: 6-digit sort code displayed
// `XX-XX-XX`, 8-digit account number. Only the last four digits are kept.

export function sortCodeDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

export function formatSortCode(raw: string): string {
  const digits = sortCodeDigits(raw);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)]
    .filter(Boolean)
    .join('-');
}

export function isValidSortCode(raw: string): boolean {
  return sortCodeDigits(raw).length === 6;
}

export function accountNumberDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8);
}

export function isValidAccountNumber(raw: string): boolean {
  return /^\d{8}$/.test(accountNumberDigits(raw));
}

export function maskedAccountLabel(account: Pick<PayoutAccount, 'bankName' | 'last4'>): string {
  return `${account.bankName} •••• ${account.last4}`;
}

/** True when an account with this sort code + last4 is already saved. */
export function isDuplicateAccount(
  accounts: PayoutAccount[],
  sortCode: string,
  accountNumber: string,
): boolean {
  const sc = formatSortCode(sortCode);
  const last4 = accountNumberDigits(accountNumber).slice(-4);
  return accounts.some((a) => a.sortCode === sc && a.last4 === last4);
}

// ── Misc ──────────────────────────────────────────────────────────────

let refSeq = 0;

/** Display reference for a fixture-mode payout request (`PO-XXXXXXXX`). */
export function newPayoutReference(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  return `PO-${stamp}${(refSeq++).toString(36).toUpperCase()}`.slice(0, 12);
}

/** "24 Sep, 14:32" — requested-at line on the receipt. */
export function formatRequestedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRequestDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export type { PayoutAccount, PayoutRequest };
