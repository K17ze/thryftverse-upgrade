import { useState, useEffect } from 'react';
import { getIzePosition } from '../../services/walletApi';
import type { Listing } from '../../services/listingsApi';

export interface UseCheckoutDataOptions {
  currentUserId?: string;
  item?: Listing;
  postagePriceGbp: number;
}

export function useCheckoutData({
  currentUserId,
  item,
  postagePriceGbp,
}: UseCheckoutDataOptions) {
  const [walletBalance, setWalletBalance] = useState(0);
  const [onezeBalance, setOnezeBalance] = useState(0);
  const [useBalance, setUseBalance] = useState(false);
  const [useOnezePayment, setUseOnezePayment] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceReloadNonce, setBalanceReloadNonce] = useState(0);

  // Fetch wallet and 1ZE balance
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    setBalanceLoading(true);
    setBalanceError(null);
    getIzePosition(currentUserId, 'GBP')
      .then((position) => {
        if (!cancelled) {
          setWalletBalance(position.balances.userFiatValue);
          setOnezeBalance(position.balances.userIze);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Honest failure — a fabricated 0 would render a false "0 1ZE
          // available" and hide real spendable funds. The screen shows an
          // error + retry row instead. Mirrors useWithdrawData /
          // useConvertData.
          setBalanceError('We could not load your wallet balance.');
        }
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, balanceReloadNonce]);

  return {
    walletBalance,
    onezeBalance,
    useBalance,
    setUseBalance,
    useOnezePayment,
    setUseOnezePayment,
    balanceLoading,
    balanceError,
    reloadBalance: () => setBalanceReloadNonce((n) => n + 1),
  };
}
