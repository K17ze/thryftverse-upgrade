import { useState, useEffect, useCallback, useRef } from 'react';
import { useHaptic } from '../useHaptic';
import { useConnectivity } from '../useConnectivity';
import { useToast } from '../../context/ToastContext';
import {
  fetchEarningsSummary,
  requestPayout,
  type EarningsSummary } from '../../services/creatorAnalyticsApi';

// Manual payout action — requests a payout against the available balance,
// then reloads the earnings summary so the ledger reflects the hold.
export function useCreatorPayout(
  onEarningsUpdated: (earnings: EarningsSummary) => void,
) {
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const { show: showToast } = useToast();
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  // In-flight guard — state alone can't stop two rapid taps before the
  // first rerender lands.
  const inFlightRef = useRef(false);
  // Idempotency key persists across retries: if the response is lost the
  // backend replays by (userId, key); a fresh key per attempt would mint a
  // second payoutId and double-pay. Cleared only on a confirmed success so
  // a later, separate payout intent gets a fresh key.
  const payoutKeyRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const onPayout = useCallback(async () => {
    if (inFlightRef.current || isOffline) return;
    inFlightRef.current = true;
    haptic.light();
    setIsPayoutLoading(true);
    setPayoutError(null);
    try {
      if (!payoutKeyRef.current) {
        payoutKeyRef.current = `manual_${Date.now()}`;
      }
      await requestPayout('wallet', payoutKeyRef.current);
      payoutKeyRef.current = null;
      // Reload earnings after successful payout
      const fresh = await fetchEarningsSummary();
      if (mountedRef.current) onEarningsUpdated(fresh);
      if (mountedRef.current) showToast('Payout requested', 'success');
    } catch (err) {
      // Surface the failure — silent swallowing is a truth defect.
      // The user must know the payout did not go through so they can retry.
      const message = err instanceof Error ? err.message : 'Payout failed. Please try again.';
      if (mountedRef.current) {
        setPayoutError(message);
        showToast(message, 'error');
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setIsPayoutLoading(false);
    }
  }, [haptic, isOffline, showToast, onEarningsUpdated]);

  return { isPayoutLoading, payoutError, onPayout };
}
