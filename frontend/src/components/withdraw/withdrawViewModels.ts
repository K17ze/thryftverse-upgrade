import { t } from '../../i18n';
import type { PayoutAccountPayload, PayoutRequestPayload } from '../../services/walletApi';

// Pure derivations + shared types for the withdraw surface — keeps the
// orchestrator thin. Mirrors components/checkout/checkoutViewModels.ts.

export type WithdrawStep = 'form' | 'confirm' | 'success' | 'unknown_outcome';

export interface WithdrawSuccessData {
  reference: string;
  amountGbp: number;
  payoutCurrency: string;
  createdAt: string;
}

// Honest payout status labeling. The backend distinguishes `processing`
// (Stripe Connect transfer initiated, bank payout not yet confirmed) from
// `paid` (bank terminal evidence confirmed). We must never show "Paid" until
// the bank has confirmed — see AGENTS.md §2 (fix at source of truth) and the
// honest-status upgrade spec.
export type PayoutStatus = PayoutRequestPayload['status'];

export interface PayoutStatusConfig {
  label: string;
  subtitle: string;
  colorKey: 'warning' | 'success' | 'danger' | 'textMuted';
}

export const PAYOUT_STATUS_CONFIG: Record<PayoutStatus, PayoutStatusConfig> = {
  requested: {
    label: t('withdraw.status.pending'),
    subtitle: t('withdraw.status.awaitingReview'),
    colorKey: 'textMuted' },
  processing: {
    label: t('withdraw.status.processing'),
    subtitle: t('withdraw.status.transferInitiated'),
    colorKey: 'warning' },
  paid: {
    label: t('withdraw.status.paid'),
    subtitle: t('withdraw.status.bankConfirmed'),
    colorKey: 'success' },
  failed: {
    label: t('withdraw.status.failed'),
    subtitle: t('withdraw.status.transferCouldNotComplete'),
    colorKey: 'danger' },
  cancelled: {
    label: t('withdraw.status.cancelled'),
    subtitle: '',
    colorKey: 'textMuted' } };

export function resolvePayoutStatusConfig(status: PayoutStatus): PayoutStatusConfig {
  return PAYOUT_STATUS_CONFIG[status] ?? PAYOUT_STATUS_CONFIG.requested;
}

export type WithdrawalsLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export interface WithdrawBankCopy {
  name: string;
  details: string;
}

interface WithdrawBankCopyInput {
  payoutAccount: PayoutAccountPayload | null;
  allowBankAccounts: boolean;
}

// "Transfer to" row copy — connected profile, region-blocked rail, or the
// connect-payouts CTA state.
export function getWithdrawBankCopy({
  payoutAccount,
  allowBankAccounts,
}: WithdrawBankCopyInput): WithdrawBankCopy {
  if (payoutAccount) {
    const payoutLocation = payoutAccount.countryCode ? ` · ${payoutAccount.countryCode}` : '';
    return {
      name:
        payoutAccount.status === 'active'
          ? t('withdraw.payout.connectedProfile')
          : t('withdraw.payout.verificationPending'),
      details: `${payoutAccount.gatewayId} · ${payoutAccount.currency}${payoutLocation}` };
  }

  if (!allowBankAccounts) {
    return {
      name: t('withdraw.payout.bankUnavailable'),
      details: 'Country policy will route withdrawals through supported payout rails.' };
  }

  return {
    name: t('withdraw.form.connectPayoutProfile'),
    details: 'Verify your identity and bank details to enable payouts' };
}

// Confirmation-step destination line — the connected account descriptor, or
// the bank-copy detail fallback when no account is resolved.
export function getWithdrawDestinationLabel(
  payoutAccount: PayoutAccountPayload | null,
  fallbackDetails: string
): string {
  return payoutAccount
    ? `${payoutAccount.gatewayId} · ${payoutAccount.currency}${payoutAccount.countryCode ? ` · ${payoutAccount.countryCode}` : ''}`
    : fallbackDetails;
}
