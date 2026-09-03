import { useState, useEffect, useMemo } from 'react';
import { getIzePosition } from '../../services/walletApi';
import { calculatePlatformChargeGbp } from '../../utils/currencyAuthoringFlows';
import type { Listing } from '../../services/listingsApi';

export interface UseCheckoutDataOptions {
  currentUserId?: string;
  item?: Listing;
  postagePriceGbp: number;
}

export interface CheckoutPriceBreakdown {
  itemPriceGbp: number;
  shippingGbp: number;
  protectionFeeGbp: number;
  subtotalGbp: number;
  discountGbp: number;
  totalGbp: number;
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

  const priceBreakdown = useMemo<CheckoutPriceBreakdown>(() => {
    const itemPriceGbp = item?.price ?? 0;
    const shippingGbp = postagePriceGbp;

    // Platform buyer protection calculation (returns number in GBP)
    const protectionFeeGbp = calculatePlatformChargeGbp(itemPriceGbp);

    const subtotalGbp = itemPriceGbp + shippingGbp + protectionFeeGbp;
    const discountGbp = 0;
    const totalGbp = Math.max(0, subtotalGbp - discountGbp);

    return {
      itemPriceGbp,
      shippingGbp,
      protectionFeeGbp,
      subtotalGbp,
      discountGbp,
      totalGbp,
    };
  }, [item?.price, postagePriceGbp]);

  return {
    walletBalance,
    onezeBalance,
    useBalance,
    setUseBalance,
    useOnezePayment,
    setUseOnezePayment,
    balanceLoading,
    priceBreakdown,
  };
}
