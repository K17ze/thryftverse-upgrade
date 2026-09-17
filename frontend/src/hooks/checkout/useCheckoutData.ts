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

  // Fetch wallet and 1ZE balance
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    setBalanceLoading(true);
    getIzePosition(currentUserId, 'GBP')
      .then((position) => {
        if (!cancelled) {
          setWalletBalance(position.balances.userFiatValue);
          setOnezeBalance(position.balances.userIze);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWalletBalance(0);
          setOnezeBalance(0);
        }
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  return {
    walletBalance,
    onezeBalance,
    useBalance,
    setUseBalance,
    useOnezePayment,
    setUseOnezePayment,
    balanceLoading,
  };
}
