import React, { useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { parseApiError } from '../../lib/apiClient';
import {
  getIzePosition,
  getWalletSnapshot,
  getSellerWalletBalances,
  type SellerWalletBalanceItem } from '../../services/walletApi';
import type { CoOwn1ZeBalance } from '../../components/coown';
import { t } from '../../i18n';

/** Seller wallet: pending vs available balance with per-order breakdown. */
export interface SellerBalancesSummary {
  availableGbp: number;
  pendingGbp: number;
  heldInReserveGbp: number;
  pendingBreakdown: SellerWalletBalanceItem[];
}

// Canonical 1ZE sub-balances zero state.
const INITIAL_BALANCE: CoOwn1ZeBalance = {
  available: 0,
  reservedForOrders: 0,
  redemptionInProgress: 0,
  otherHolds: 0,
  pendingDeposit: 0,
  unsettledSaleProceeds: 0,
  settledCustomerClaim: 0,
  withdrawable: 0,
  safeguarded: false,
  safeguardingPartner: undefined,
  safeguardingEvidenceUrl: null,
  safeguardingTermsUrl: null,
  snapshotSequence: 0,
  serverTimestamp: '',
  reconciliationState: 'reconciled' };

/**
 * useWalletData — owns the wallet balance lifecycle: canonical 1ZE
 * sub-balances, the parallel fiat snapshot (for "Buy 1ZE with fiat
 * balance"), seller pending/available balances, plus mount hydration,
 * silent focus refetch and pull-to-refresh. Lifted verbatim from
 * WalletScreen; mirrors hooks/portfolio/usePortfolioData.
 */
export function useWalletData() {
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode } = useCurrencyContext();
  const { show } = useToast();

  // ── Balance state (canonical 1ZE sub-balances) ──
  const [balance, setBalance] = React.useState<CoOwn1ZeBalance>(INITIAL_BALANCE);
  // Fiat balance kept in parallel for the "Buy 1ZE with fiat balance" flow.
  const [availableFiatBalance, setAvailableFiatBalance] = useState(0);
  const [sellerBalances, setSellerBalances] = useState<SellerBalancesSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  // ── Balance hydration ──
  // `silent` skips the full-screen skeleton — used for focus refetches so
  // already-rendered balances never flash loading chrome.
  const loadBalance = React.useCallback((silent: boolean = false) => {
    if (!currentUser?.id) { setIsLoading(false); return; }
    let cancelled = false;
    if (!silent) setIsLoading(true);
    setIsError(false);

    Promise.all([
      getIzePosition(currentUser.id, currencyCode),
      getWalletSnapshot(currentUser.id).catch(() => null),
      getSellerWalletBalances(currentUser.id).catch(() => null),
    ])
      .then(([position, fiatWallet, sellerWallet]) => {
        if (cancelled) return;
        setBalance({
          available: position.balances.availableIze,
          reservedForOrders: position.balances.reservedForOrders,
          redemptionInProgress: position.balances.redemptionInProgress,
          otherHolds: position.balances.otherHolds,
          pendingDeposit: position.balances.pendingDeposit,
          unsettledSaleProceeds: position.balances.unsettledSaleProceeds,
          settledCustomerClaim: position.balances.settledCustomerClaim,
          withdrawable: position.balances.withdrawable,
          safeguarded: position.balances.safeguarded,
          safeguardingPartner: position.balances.safeguardingPartner ?? undefined,
          safeguardingEvidenceUrl: position.balances.safeguardingEvidenceUrl ?? null,
          safeguardingTermsUrl: position.balances.safeguardingTermsUrl ?? null,
          snapshotSequence: position.balances.snapshotSequence,
          serverTimestamp: position.balances.serverTimestamp,
          reconciliationState: position.balances.reconciliationState });
        setAvailableFiatBalance(fiatWallet?.snapshot.availableGbp ?? 0);
        if (sellerWallet) {
          setSellerBalances({
            availableGbp: sellerWallet.balances.availableGbp,
            pendingGbp: sellerWallet.balances.pendingGbp,
            heldInReserveGbp: sellerWallet.balances.heldInReserveGbp,
            pendingBreakdown: sellerWallet.pendingBreakdown });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, t('commerce.wallet.error.unableToLoad'));
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          // Finish refresh when the request settles — no fixed timer (spec 17).
          setRefreshing(false);
        }
      });

    return () => { cancelled = true; };
  }, [currentUser?.id, currencyCode, show]);

  React.useEffect(() => {
    const cleanup = loadBalance();
    return cleanup;
  }, [loadBalance]);

  // Refetch balances on screen focus — pushed screens keep Wallet mounted,
  // so a mount-only load leaves balances stale after checkout, offer
  // acceptance, conversions, or sale settlements happen elsewhere. The
  // first focus is owned by the mount effect; later focuses reload
  // silently. Returning loadBalance's cleanup discards in-flight results
  // if the screen blurs mid-fetch.
  const hasFocusedOnceRef = useRef(false);
  useFocusEffect(
    React.useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      return loadBalance(true);
    }, [loadBalance])
  );

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Silent: the RefreshControl spinner is the loading affordance here —
    // a non-silent load would flip isLoading and unmount the ScrollView
    // mid-pull, flashing the full skeleton over an already-rendered wallet.
    loadBalance(true);
  }, [loadBalance]);

  return {
    balance,
    availableFiatBalance,
    sellerBalances,
    isLoading,
    isError,
    refreshing,
    loadBalance,
    handleRefresh,
  };
}
