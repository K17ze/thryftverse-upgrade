import { useState, useEffect, useCallback, useRef } from 'react';
import { useHaptic } from '../useHaptic';
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
  const { show: showToast } = useToast();
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const onPayout = useCallback(async () => {
    if (isPayoutLoading) return;
    haptic.light();
    setIsPayoutLoading(true);
    setPayoutError(null);
    try {
      await requestPayout('wallet', `manual_${Date.now()}`);
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
      if (mountedRef.current) setIsPayoutLoading(false);
    }
  }, [haptic, isPayoutLoading, showToast, onEarningsUpdated]);

  return { isPayoutLoading, payoutError, onPayout };
}
