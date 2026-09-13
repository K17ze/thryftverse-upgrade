import { useEffect, useState } from 'react';

import { getIzePosition } from '../../services/walletApi';
import type { SupportedCurrencyCode } from '../../constants/currencies';

export interface UseConvertDataOptions {
  userId: string | undefined;
  currencyCode: SupportedCurrencyCode;
}

/**
 * useConvertData — owns the 1ZE balance hydration for the convert surface:
 * fetches the available 1ZE position for the active fiat currency and
 * exposes the balance plus its hydration flag. Mirrors
 * hooks/withdraw/useWithdrawData.
 */
export function useConvertData({ userId, currencyCode }: UseConvertDataOptions) {
  const [availableIze, setAvailableIze] = useState(0);
  const [isHydratingBalance, setIsHydratingBalance] = useState(true);

  // -- Balance hydration (available 1ZE) --
  useEffect(() => {
    let isCancelled = false;

    const hydrateBalance = async () => {
      if (!userId) {
        setIsHydratingBalance(false);
        return;
      }
      setIsHydratingBalance(true);
      try {
        const position = await getIzePosition(userId, currencyCode);
        if (!isCancelled) {
          setAvailableIze(position.balances.availableIze);
        }
      } catch {
        if (!isCancelled) {
          setAvailableIze(0);
        }
      } finally {
        if (!isCancelled) {
          setIsHydratingBalance(false);
        }
      }
    };

    void hydrateBalance();

    return () => {
      isCancelled = true;
    };
  }, [userId, currencyCode]);

  return {
    availableIze,
    setAvailableIze,
    isHydratingBalance,
  };
}
