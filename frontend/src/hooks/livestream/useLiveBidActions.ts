/**
 * useLiveBidActions — bid, buy-now, unknown-outcome re-check and winner
 * settlement for the live stream viewer.
 *
 * Owns:
 * - Bid submission flow with truthful outcomes (accepted / rejected /
 *   unknown — a timed-out bid may have committed, so it is never confirmed
 *   or dismissed without a real re-check)
 * - Buy-now during stream
 * - Idempotent bid status re-check for the unknown-outcome banner
 * - Won-lot settlement → Checkout navigation
 */

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList, NativeStackNavigationProp } from '../../navigation/types';
import { useHaptic } from '../useHaptic';
import { useSignupWall } from '../useSignupWall';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import {
  LiveLot,
  placeStreamBid,
  checkBidStatus,
  buyNowDuringStream,
  settleLot } from '../../services/liveShoppingApi';
import { track } from '../../analytics';
import type { BidOutcome } from './types';

interface UseLiveBidActionsOptions {
  sessionId: string;
  currentLot: LiveLot | null;
  setCurrentLot: Dispatch<SetStateAction<LiveLot | null>>;
  /** Called after every bid attempt settles — the bid sheet always closes. */
  closeBidSheet: () => void;
}

export function useLiveBidActions({
  sessionId,
  currentLot,
  setCurrentLot,
  closeBidSheet,
}: UseLiveBidActionsOptions) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const { t } = useAppTranslation('liveStreamViewer');

  const [bidPending, setBidPending] = useState(false);
  const [buyNowPending, setBuyNowPending] = useState(false);
  const [bidOutcome, setBidOutcome] = useState<BidOutcome>('idle');
  const [lastBidId, setLastBidId] = useState<string | null>(null);
  const [lastBidAmount, setLastBidAmount] = useState<number>(0);
  const [bidCheckPending, setBidCheckPending] = useState(false);
  const [settlePending, setSettlePending] = useState(false);

  const handleBid = useCallback(async (amount: number) => {
    if (!currentLot) return;
    if (!requireAuth('place_bid')) return;
    setBidPending(true);
    setBidOutcome('submitting');
    haptic.medium();
    try {
      const result = await placeStreamBid(sessionId, currentLot.id, amount);
      track('live_bid_placed', { stream_id: sessionId, bid_amount: amount });
      setLastBidId(result.clientBidId);
      setLastBidAmount(amount);
      if (result.success) {
        if (result.lot) {
          setCurrentLot({ ...result.lot });
        }
        setBidOutcome('accepted');
        haptic.success();
      } else {
        setBidOutcome('rejected');
        show(result.error ?? t('toast.bidFailed'), 'error');
        haptic.error();
      }
    } catch {
      setBidOutcome('unknown');
      haptic.warning();
    } finally {
      setBidPending(false);
      closeBidSheet();
    }
  }, [currentLot, haptic, sessionId, show, requireAuth, t, setCurrentLot, closeBidSheet]);

  const handleCheckBidStatus = useCallback(async () => {
    if (!currentLot || !lastBidId) return;
    setBidCheckPending(true);
    haptic.light();
    try {
      const result = await checkBidStatus(sessionId, currentLot.id, lastBidAmount, lastBidId);
      if (result.status === 'accepted') {
        if (result.lot) {
          setCurrentLot({ ...result.lot });
        }
        setBidOutcome('accepted');
        haptic.success();
      } else if (result.status === 'rejected') {
        setBidOutcome('rejected');
        show(result.error ?? t('toast.bidNotAccepted'), 'error');
        haptic.error();
      } else {
        show(t('toast.stillChecking'), 'info');
      }
    } catch {
      show(t('toast.stillChecking'), 'info');
    } finally {
      setBidCheckPending(false);
    }
  }, [currentLot, haptic, lastBidAmount, lastBidId, sessionId, show, t, setCurrentLot]);

  const handleBuyNow = useCallback(async () => {
    if (!currentLot) return;
    if (!requireAuth('purchase')) return;
    setBuyNowPending(true);
    haptic.medium();
    try {
      const result = await buyNowDuringStream(sessionId, currentLot.id);
      if (result.success) {
        show(t('toast.purchaseComplete'), 'success');
      } else {
        show(result.error ?? t('toast.couldNotPurchase'), 'error');
      }
    } catch {
      show(t('toast.couldNotPurchase'), 'error');
    } finally {
      setBuyNowPending(false);
    }
  }, [currentLot, haptic, sessionId, show, requireAuth, t]);

  const handleCompleteCheckout = useCallback(async () => {
    if (!currentLot) return;
    if (!requireAuth('purchase')) return;
    setSettlePending(true);
    haptic.medium();
    try {
      const result = await settleLot(sessionId, currentLot.id);
      if (result.orderId) {
        haptic.success();
        navigation.navigate('Checkout', { itemId: currentLot.listingId });
      }
    } catch {
      show(t('toast.checkoutError'), 'error');
      haptic.error();
    } finally {
      setSettlePending(false);
    }
  }, [currentLot, haptic, navigation, requireAuth, sessionId, show, t]);

  // Dismissing the unknown-outcome banner — clears the banner and the
  // remembered bid so a stale re-check can never fire for a later lot.
  const dismissUnknownBid = useCallback(() => {
    setBidOutcome('idle');
    setLastBidId(null);
  }, []);

  return {
    bidPending,
    buyNowPending,
    bidOutcome,
    bidCheckPending,
    settlePending,
    handleBid,
    handleCheckBidStatus,
    handleBuyNow,
    handleCompleteCheckout,
    dismissUnknownBid };
}
