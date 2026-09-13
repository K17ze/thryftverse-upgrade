import { useCallback, useEffect, useState } from 'react';
import {
  getWalletSnapshot,
  listPayoutAccounts,
  listPayoutRequests,
  type PayoutAccountPayload,
  type PayoutRequestPayload } from '../../services/walletApi';
import { getUserCountryCapabilities, type UserCountryCapabilities } from '../../services/capabilitiesApi';
import type { WithdrawalsLoadState } from '../../components/withdraw/withdrawViewModels';

export interface UseWithdrawDataOptions {
  userId: string | undefined;
}

/**
 * useWithdrawData — owns the withdraw surface's hydration: available
 * balance, country capabilities, the connected payout account and the
 * recent-withdrawals list. Every fetch is keyed on `userId` and is
 * cancellation-safe.
 */
export function useWithdrawData({ userId }: UseWithdrawDataOptions) {
  const [availableBalance, setAvailableBalance] = useState(0);
  const [isHydratingBalance, setIsHydratingBalance] = useState(true);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountPayload | null>(null);
  const [countryCapabilities, setCountryCapabilities] = useState<UserCountryCapabilities | null>(null);
  const [withdrawals, setWithdrawals] = useState<PayoutRequestPayload[]>([]);
  const [withdrawalsLoadState, setWithdrawalsLoadState] = useState<WithdrawalsLoadState>('idle');

  useEffect(() => {
    let isCancelled = false;

    const hydrateBalance = async () => {
      if (!userId) {
        setIsHydratingBalance(false);
        return;
      }
      setIsHydratingBalance(true);
      try {
        const snapshot = await getWalletSnapshot(userId);
        if (!isCancelled) {
          setAvailableBalance(snapshot.snapshot.availableGbp);
        }
      } catch {
        if (!isCancelled) {
          setAvailableBalance(0);
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
  }, [userId]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateCapabilities = async () => {
      if (!userId) {
        setCountryCapabilities(null);
        return;
      }

      try {
        const capabilities = await getUserCountryCapabilities(userId);
        if (!isCancelled) {
          setCountryCapabilities(capabilities);
        }
      } catch {
        if (!isCancelled) {
          setCountryCapabilities(null);
        }
      }
    };

    void hydrateCapabilities();

    return () => {
      isCancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let isCancelled = false;

    const hydratePayoutAccount = async () => {
      if (!userId) {
        setPayoutAccount(null);
        return;
      }

      try {
        const accounts = await listPayoutAccounts(userId);
        if (isCancelled) {
          return;
        }

        const activeAccount = accounts.find((account) => account.status === 'active') ?? accounts[0] ?? null;
        setPayoutAccount(activeAccount);
      } catch {
        if (!isCancelled) {
          setPayoutAccount(null);
        }
      }
    };

    void hydratePayoutAccount();

    return () => {
      isCancelled = true;
    };
  }, [userId]);

  const loadWithdrawals = useCallback(async (loadUserId: string) => {
    setWithdrawalsLoadState('loading');
    try {
      const items = await listPayoutRequests(loadUserId, { limit: 10 });
      // Most-recent first — backend may already order these, but enforce
      // a stable client-side order so the surface is predictable.
      const sorted = [...items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setWithdrawals(sorted);
      setWithdrawalsLoadState('loaded');
    } catch {
      setWithdrawalsLoadState('error');
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const hydrateWithdrawals = async () => {
      if (!userId) {
        setWithdrawals([]);
        setWithdrawalsLoadState('idle');
        return;
      }
      if (isCancelled) return;
      await loadWithdrawals(userId);
    };

    void hydrateWithdrawals();

    return () => {
      isCancelled = true;
    };
  }, [userId, loadWithdrawals]);

  return {
    availableBalance,
    setAvailableBalance,
    isHydratingBalance,
    countryCapabilities,
    setCountryCapabilities,
    payoutAccount,
    setPayoutAccount,
    withdrawals,
    withdrawalsLoadState,
    loadWithdrawals,
  };
}
