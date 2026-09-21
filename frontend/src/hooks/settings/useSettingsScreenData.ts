import React from 'react';
import { useStore } from '../../store/useStore';
import { useBiometricGate } from '../useBiometricGate';
import { getWalletSnapshot } from '../../services/walletApi';

export interface UseSettingsScreenDataResult {
  /** True while the persist store is still rehydrating user/session data. */
  isHydrating: boolean;
  /** Available GBP wallet balance for the signed-in user. Null while the
   *  snapshot is loading AND when the fetch failed — an unknown balance is
   *  never presented as £0 (F07). */
  walletBalance: number | null;
  /** True when the balance fetch failed — the card shows "Unavailable",
   *  not a fabricated zero. */
  walletBalanceFailed: boolean;
  /** Whether the device has enrolled biometric hardware. */
  isBiometricAvailable: boolean;
}

/**
 * Screen-level data for the Settings orchestrator: persist-store hydration
 * gate, wallet balance fetch, and biometric hardware availability.
 */
export function useSettingsScreenData(): UseSettingsScreenDataResult {
  const currentUser = useStore((state) => state.currentUser);

  const [isHydrating, setIsHydrating] = React.useState(!useStore.persist.hasHydrated());
  const [walletBalance, setWalletBalance] = React.useState<number | null>(null);
  const [walletBalanceFailed, setWalletBalanceFailed] = React.useState(false);

  // Balance truth: the snapshot is scoped to the account identity. Any
  // identity change (sign-out, account switch) clears the previous balance
  // immediately — a retained hook must never show user A's £-figure as
  // user B's balance while the new fetch is in flight. A fetch failure or
  // a malformed/partial snapshot leaves walletBalance null and sets the
  // failed flag — the card renders "Unavailable", never a fabricated £0.
  React.useEffect(() => {
    setWalletBalance(null);
    setWalletBalanceFailed(false);
    const userId = currentUser?.id;
    if (!userId) return;
    let cancelled = false;
    getWalletSnapshot(userId)
      .then((res) => {
        if (cancelled) return;
        const availableGbp = res?.snapshot?.availableGbp;
        if (typeof availableGbp === 'number' && Number.isFinite(availableGbp)) {
          setWalletBalance(availableGbp);
        } else {
          // Successful response but unusable/missing balance — unavailable,
          // not zero.
          setWalletBalanceFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setWalletBalanceFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  // Probe biometric hardware availability so the toggle subtitle is truthful —
  // "Not available on this device" when the device has no enrolled biometric,
  // rather than showing a toggle that silently does nothing.
  const { isAvailable: isBiometricAvailable } = useBiometricGate();

  // Track persist-store hydration so the screen can show a skeleton until the
  // user/session data is available instead of flashing "Not signed in".
  React.useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setIsHydrating(false);
      return;
    }
    const unsub = useStore.persist.onFinishHydration(() => setIsHydrating(false));
    return unsub;
  }, []);

  return {
    isHydrating,
    walletBalance,
    walletBalanceFailed,
    isBiometricAvailable,
  };
}
