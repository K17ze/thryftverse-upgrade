import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
 * The wallet snapshot is owned by the account identity it was fetched for.
 * Render-time scoping (below) means a retained hook can never surface
 * account A's £-figure while account B is signed in — not even for the one
 * render between an identity change and the clearing effect (S21-05).
 */
interface WalletSnapshotState {
  userId: string;
  balance: number | null;
  failed: boolean;
}

// Matches the project's focus-refetch debounce (useRefetchOnFocus): a
// refocus inside the window doesn't re-issue the fetch — the identity
// effect already covers mount, so the focus path handles real returns.
const FOCUS_REFETCH_DEBOUNCE_MS = 5_000;

/**
 * Screen-level data for the Settings orchestrator: persist-store hydration
 * gate, wallet balance fetch, and biometric hardware availability.
 *
 * Freshness (S21-05): the balance refetches when the screen regains focus —
 * returning from a withdrawal, top-up, or earnings mutation never shows a
 * stale amount. A fetch failure or a malformed/partial snapshot leaves
 * walletBalance null and sets the failed flag — the card renders
 * "Unavailable", never a fabricated £0.
 */
export function useSettingsScreenData(): UseSettingsScreenDataResult {
  const currentUser = useStore((state) => state.currentUser);

  const [isHydrating, setIsHydrating] = React.useState(!useStore.persist.hasHydrated());
  const [snapshot, setSnapshot] = React.useState<WalletSnapshotState | null>(null);

  // Guards an older account's late response from overwriting a newer one:
  // every issued fetch bumps the epoch and only the latest may write.
  const fetchEpochRef = React.useRef(0);
  const lastFetchAtRef = React.useRef(0);

  const loadWalletBalance = React.useCallback((userId: string) => {
    const epoch = ++fetchEpochRef.current;
    lastFetchAtRef.current = Date.now();
    return getWalletSnapshot(userId)
      .then((res) => {
        if (epoch !== fetchEpochRef.current) return;
        const availableGbp = res?.snapshot?.availableGbp;
        setSnapshot({
          userId,
          // Successful response but unusable/missing balance — unavailable,
          // not zero.
          balance:
            typeof availableGbp === 'number' && Number.isFinite(availableGbp)
              ? availableGbp
              : null,
          failed:
            typeof availableGbp !== 'number' || !Number.isFinite(availableGbp),
        });
      })
      .catch(() => {
        if (epoch === fetchEpochRef.current) {
          setSnapshot({ userId, balance: null, failed: true });
        }
      });
  }, []);

  // Identity change = new snapshot owner. No manual clearing is needed:
  // the state is tagged with its userId, so a stale value is invisible at
  // render time even before this effect runs.
  React.useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    void loadWalletBalance(userId);
  }, [currentUser?.id, loadWalletBalance]);

  // Focus refetch — returning from a wallet mutation elsewhere (withdrawal,
  // top-up, order payout) refreshes the snapshot in place. Silent: the
  // existing balance stays on screen until the new value lands. Debounced
  // so the mount-time focus event doesn't double-fetch with the identity
  // effect above.
  useFocusEffect(
    React.useCallback(() => {
      const userId = useStore.getState().currentUser?.id;
      if (!userId) return;
      if (Date.now() - lastFetchAtRef.current < FOCUS_REFETCH_DEBOUNCE_MS) return;
      void loadWalletBalance(userId);
    }, [loadWalletBalance]),
  );

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

  // Render-time ownership: only a snapshot tagged with the CURRENT account
  // is allowed to surface — an A-tagged value can never read as B's balance.
  const scoped = snapshot && snapshot.userId === currentUser?.id ? snapshot : null;

  return {
    isHydrating,
    walletBalance: scoped?.balance ?? null,
    walletBalanceFailed: scoped?.failed ?? false,
    isBiometricAvailable,
  };
}
