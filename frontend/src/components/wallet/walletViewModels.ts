import type { CoOwn1ZeBalance } from '../coown';
import { izeToUsd, formatUsd } from '../../utils/currency';
import { t } from '../../i18n';

/**
 * Pure derivation/formatting view-models for the Wallet surface.
 * Extracted from WalletScreen — no behaviour change; every expression is
 * lifted verbatim so rendered copy and a11y strings are identical.
 */

/** Tabular-nums, 2dp balance formatting for 1ZE figures. */
export function formatWalletBalance(value: number): string {
  return value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** True when any non-available sub-balance is present — decides whether the
 *  flat breakdown section or the withdrawable-only row renders. */
export function hasWalletSubBalances(balance: CoOwn1ZeBalance): boolean {
  return (
    balance.reservedForOrders > 0 ||
    balance.redemptionInProgress > 0 ||
    balance.otherHolds > 0 ||
    balance.pendingDeposit > 0 ||
    balance.unsettledSaleProceeds > 0
  );
}

/** Pending-attention row shows only when real money is in flight
 *  (spec 17 viewport 1). */
export function hasPendingWalletAttention(balance: CoOwn1ZeBalance): boolean {
  return balance.pendingDeposit > 0 || balance.unsettledSaleProceeds > 0;
}

/** "X 1ZE deposit pending · Y 1ZE proceeds unsettled" summary line
 *  (spec 17 viewport 1). */
export function getPendingAttentionTitle(balance: CoOwn1ZeBalance): string {
  return [
    balance.pendingDeposit > 0
      ? t('commerce.wallet.depositPending', { amount: formatWalletBalance(balance.pendingDeposit) })
      : null,
    balance.unsettledSaleProceeds > 0
      ? t('commerce.wallet.proceedsUnsettled', { amount: formatWalletBalance(balance.unsettledSaleProceeds) })
      : null,
  ].filter(Boolean).join(' · ');
}

/** At-par USD equivalent for the spendable hero.
 *  1 1ZE = $1.00 USD — always, at par. Shown as the honest USD value. */
export function getUsdParityLabel(available: number): string | undefined {
  return available > 0 ? formatUsd(izeToUsd(available)) : undefined;
}
