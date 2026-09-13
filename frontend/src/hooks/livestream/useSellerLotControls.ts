/**
 * useSellerLotControls — the lot management state machine for a live
 * seller broadcast.
 *
 * Owns the real lot-engine transitions only:
 * - open bidding / close lot / cancel lot / advance to next lot
 * - settle a sold lot (order creation → payment reservation)
 * - shared pending guards so only one transition runs at a time
 *
 * Lot state itself lives in useSellerBroadcast (it is also written by
 * go-live scheduling and session resume); this hook mutates it through
 * the provided setters.
 */

import { useCallback, useState } from 'react';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';
import {
  openLot,
  closeLot,
  cancelLot,
  settleLot,
  setCurrentLot,
  type LiveLotAggregate,
  type LotSettlementStatus } from '../../services/liveShoppingApi';

interface UseSellerLotControlsOptions {
  sessionId: string | null;
  lots: LiveLotAggregate[];
  currentLotIndex: number;
  setLots: React.Dispatch<React.SetStateAction<LiveLotAggregate[]>>;
  setCurrentLotIndex: React.Dispatch<React.SetStateAction<number>>;
  setSettlementStatus: React.Dispatch<React.SetStateAction<LotSettlementStatus | null>>;
  /** Record a confirmed sale (sold status + positive high bid) into the
   *  broadcast stats owned by useSellerBroadcast. */
  recordSale: (highBidMinor: number) => void;
}

export function useSellerLotControls({
  sessionId,
  lots,
  currentLotIndex,
  setLots,
  setCurrentLotIndex,
  setSettlementStatus,
  recordSale }: UseSellerLotControlsOptions) {
  const haptic = useHaptic();
  const { show } = useToast();

  const [lotActionPending, setLotActionPending] = useState(false);
  const [settlePending, setSettlePending] = useState(false);

  const currentLot = lots[currentLotIndex] ?? null;
  const nextLot = lots[currentLotIndex + 1] ?? null;
  const remainingLots = lots.filter((l) => l.status === 'scheduled').length;

  const handleOpenLot = useCallback(async () => {
    if (!sessionId || !currentLot || lotActionPending) return;
    setLotActionPending(true);
    haptic.medium();
    try {
      const updated = await openLot(sessionId, currentLot.id);
      setLots((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setSettlementStatus(null);
    } catch {
      show('Could not open bidding — try again.', 'error');
      haptic.error();
    } finally {
      setLotActionPending(false);
    }
  }, [sessionId, currentLot, lotActionPending, haptic, show, setLots, setSettlementStatus]);

  const handleCloseLot = useCallback(async () => {
    if (!sessionId || !currentLot || lotActionPending) return;
    setLotActionPending(true);
    haptic.medium();
    try {
      const result = await closeLot(sessionId, currentLot.id);
      setLots((prev) => prev.map((l) => (l.id === result.id ? { ...l, ...result } : l)));
      setSettlementStatus(result.settlementStatus ?? null);
      if (result.status === 'sold' && result.highBidMinor > 0) {
        recordSale(result.highBidMinor);
      }
      haptic.success();
    } catch {
      show('Could not close the lot — try again.', 'error');
      haptic.error();
    } finally {
      setLotActionPending(false);
    }
  }, [sessionId, currentLot, lotActionPending, haptic, show, setLots, setSettlementStatus, recordSale]);

  const handleCancelLot = useCallback(async () => {
    if (!sessionId || !currentLot || lotActionPending) return;
    setLotActionPending(true);
    haptic.light();
    try {
      const updated = await cancelLot(sessionId, currentLot.id);
      setLots((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch {
      show('Could not cancel the lot — try again.', 'error');
      haptic.error();
    } finally {
      setLotActionPending(false);
    }
  }, [sessionId, currentLot, lotActionPending, haptic, show, setLots]);

  const handleNextLot = useCallback(async () => {
    if (!sessionId || lotActionPending) return;
    const nextIndex = currentLotIndex + 1;
    const next = lots[nextIndex];
    if (!next) return;
    setLotActionPending(true);
    haptic.light();
    try {
      await setCurrentLot(sessionId, next.listingId, next.lotNumber);
      setCurrentLotIndex(nextIndex);
      setSettlementStatus(null);
    } catch {
      show('Could not move to the next lot — try again.', 'error');
      haptic.error();
    } finally {
      setLotActionPending(false);
    }
  }, [sessionId, lots, currentLotIndex, lotActionPending, haptic, show, setCurrentLotIndex, setSettlementStatus]);

  const handleSettleLot = useCallback(async () => {
    if (!sessionId || !currentLot || settlePending) return;
    setSettlePending(true);
    haptic.medium();
    try {
      const result = await settleLot(sessionId, currentLot.id);
      setSettlementStatus(result.status);
      haptic.success();
    } catch {
      show('Could not settle the lot — try again.', 'error');
      haptic.error();
    } finally {
      setSettlePending(false);
    }
  }, [sessionId, currentLot, settlePending, haptic, show, setSettlementStatus]);

  return {
    currentLot,
    nextLot,
    remainingLots,
    lotActionPending,
    settlePending,
    handleOpenLot,
    handleCloseLot,
    handleCancelLot,
    handleNextLot,
    handleSettleLot };
}
