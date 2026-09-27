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
import type { PayoutAccountPayload, PayoutRequestPayload } from '@/lib/api/services/payouts';
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

// ── Payout destination — the unified rail view model ──────────────────
// Fixture mode stores masked bank details (bankName/sortCode/last4); live
// mode reads payout_accounts rows, which only carry a provider reference
// (e.g. a Stripe Connect `acct_…`). Both flatten into one render shape so
// the surfaces never branch on wire types.

export type DestinationStatus = 'active' | 'pending' | 'disabled';

export interface PayoutDestination {
  /** UI key — fixture ids are `pa-*`, live ids carry the numeric row id. */
  id: string;
  /** Live payout_accounts.id — required by POST payout-requests. Null in
   *  fixture mode (local demo rows are submitted to nothing). */
  accountId: number | null;
  /** 'Barclays •••• 4521' (fixture) or 'Stripe •••• 9f3c' (live). */
  title: string;
  /** 'Alex Morgan · Sort code 20-41-50' or 'GBP · Stripe Connect'. */
  subtitle: string;
  currency: string;
  status: DestinationStatus;
  isDefault: boolean;
  createdAt: string;
}

/** A payout can only target an active account — the server 409s on
 *  pending/disabled rows, so the radio list never offers them. */
export function isSelectableDestination(d: PayoutDestination): boolean {
  return d.status === 'active';
}

/** Human label for a payout gateway id — extend as rails are added. */
export function gatewayLabel(gatewayId: string): string {
  if (gatewayId === 'stripe_americas') return 'Stripe';
  // `stripe_americas` → 'Stripe Americas', `manual_uk` → 'Manual Uk'.
  return gatewayId
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function fixtureDestination(account: PayoutAccount): PayoutDestination {
  return {
    id: account.id,
    accountId: null,
    title: `${account.bankName} •••• ${account.last4}`,
    subtitle: `${account.holderName} · Sort code ${account.sortCode}`,
    currency: account.currency,
    status: 'active',
    isDefault: account.isDefault,
    createdAt: account.createdAt,
  };
}

export function liveDestination(
  account: PayoutAccountPayload,
  isDefault: boolean,
): PayoutDestination {
  const refTail = account.providerAccountRef.slice(-4);
  const holderName =
    typeof account.metadata?.accountHolderName === 'string'
      ? account.metadata.accountHolderName
      : typeof account.metadata?.account_holder_name === 'string'
        ? account.metadata.account_holder_name
        : null;
  return {
    id: `payout-account-${account.id}`,
    accountId: account.id,
    title: `${gatewayLabel(account.gatewayId)} •••• ${refTail}`,
    subtitle: `${account.currency} · ${gatewayLabel(account.gatewayId)} Connect${holderName ? ` · ${holderName}` : ''}`,
    currency: account.currency,
    status: account.status,
    isDefault,
    createdAt: account.createdAt,
  };
}

/** Display label for a destination on receipts/history rows. */
export function destinationLabel(d: Pick<PayoutDestination, 'title'>): string {
  return d.title;
}

export const DESTINATION_STATUS_CONFIG: Record<
  DestinationStatus,
  { label: string; badge: 'neutral' | 'warning' | 'success' | 'danger' }
> = {
  active: { label: 'Active', badge: 'success' },
  pending: { label: 'Pending verification', badge: 'warning' },
  disabled: { label: 'Disabled', badge: 'neutral' },
};

/** Live payout request → the shared history-row view model. The reference
 *  is the provider payout ref when the rail has issued one, else the
 *  server id — never a fabricated `PO-…` string. */
export function requestFromApi(
  request: PayoutRequestPayload,
  account?: PayoutAccountPayload,
): PayoutRequest {
  return {
    id: request.id,
    reference: request.providerPayoutRef ?? request.id,
    accountId: String(request.payoutAccountId),
    destinationLabel: account
      ? `${gatewayLabel(account.gatewayId)} •••• ${account.providerAccountRef.slice(-4)}`
      : `Payout account #${request.payoutAccountId}`,
    // amountGbp is the server's canonical GBP valuation of the request —
    // pair it with 'GBP' so the row never labels a GBP figure with the
    // requested foreign currency.
    amountGbp: request.amountGbp,
    currency: 'GBP',
    status: request.status,
    createdAt: request.createdAt,
  };
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
