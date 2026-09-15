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
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // -- Balance hydration (available 1ZE) --
  useEffect(() => {
    let isCancelled = false;

    const hydrateBalance = async () => {
      if (!userId) {
        setIsHydratingBalance(false);
        return;
      }
      setIsHydratingBalance(true);
      setBalanceError(null);
      try {
        const position = await getIzePosition(userId, currencyCode);
        if (!isCancelled) {
          setAvailableIze(position.balances.availableIze);
        }
      } catch {
        if (!isCancelled) {
          // Honest failure — a fabricated 0 would render a false "insufficient
          // balance" and hide real spendable funds.
          setBalanceError('We could not load your 1ZE balance.');
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
  }, [userId, currencyCode, reloadNonce]);

  const reloadBalance = () => setReloadNonce((n) => n + 1);

  return {
    availableIze,
    setAvailableIze,
    isHydratingBalance,
    balanceError,
    reloadBalance,
  };
}
