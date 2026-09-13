import type { CoOwn1ZeBalance } from '../../components/coown';
import {
  getPendingAttentionTitle,
  getUsdParityLabel,
  hasPendingWalletAttention } from '../../components/wallet/walletViewModels';

/**
 * useWalletDerived — derived wallet state: the operational guard
 * (reconciled & online), the withdrawable fallback, pending-attention
 * flags/copy and the at-par USD label. Pure derivation over the canonical
 * balance — mirrors hooks/portfolio/usePortfolioDerived.
 */
export function useWalletDerived(balance: CoOwn1ZeBalance, isOffline: boolean) {
  const isWalletOperational = balance.reconciliationState === 'reconciled' && !isOffline;

  // ── Derived sub-balance values (preserving reconciliation truth) ──
  const withdrawable = balance.withdrawable ?? balance.available;
  const hasPendingAttention = hasPendingWalletAttention(balance);
  const pendingAttentionTitle = getPendingAttentionTitle(balance);
  const usdLabel = getUsdParityLabel(balance.available);

  return {
    isWalletOperational,
    withdrawable,
    hasPendingAttention,
    pendingAttentionTitle,
    usdLabel,
  };
}
