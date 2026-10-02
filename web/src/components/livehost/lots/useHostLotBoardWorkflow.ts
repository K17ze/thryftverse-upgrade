'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseApiError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import { useMyListings } from '@/lib/hooks/queries';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/lib/utils/format';

export const STATUS_LABEL: Record<liveService.LiveLotStatus, string> = {
  scheduled: 'Scheduled',
  open: 'Bidding open',
  closing: 'Closing',
  sold: 'Sold',
  passed: 'Passed',
  cancelled: 'Cancelled',
};

export function useHostLotBoardWorkflow(sessionId: string, live: boolean) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: myListings } = useMyListings();

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['live-lots', sessionId] });
    void qc.invalidateQueries({ queryKey: ['live-current-lot', sessionId] });
  }, [qc, sessionId]);

  const { data: lots } = useQuery({
    queryKey: ['live-lots', sessionId],
    queryFn: ({ signal }) => liveService.fetchSessionLots(sessionId, signal),
    refetchInterval: live ? 15_000 : false,
  });

  const { data: onTable } = useQuery({
    queryKey: ['live-current-lot', sessionId],
    queryFn: ({ signal }) => liveService.fetchCurrentLot(sessionId, signal),
    refetchInterval: live ? 15_000 : false,
  });

  const queue = (lots ?? []).filter(
    (lot) => lot.status === 'scheduled' && lot.id !== onTable?.id,
  );
  const finished = (lots ?? []).filter(
    (lot) => lot.status !== 'scheduled' && lot.id !== onTable?.id,
  );
  const scheduledListingIds = new Set((lots ?? []).map((l) => l.listingId));

  /** Listings the host can put on the table — their own, still for sale,
   *  not already scheduled into this show. */
  const candidates = (myListings ?? []).filter(
    (l) => !l.isSold && l.status !== 'sold' && !scheduledListingIds.has(l.id),
  );

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>) => {
      if (pending) return;
      setPending(key);
      try {
        await action();
      } catch (error) {
        show(
          parseApiError(error, 'That action failed — try again').message,
          'error',
        );
      } finally {
        setPending(null);
        refresh();
      }
    },
    [pending, show, refresh],
  );

  const pinLot = (lot: liveService.LiveLot) =>
    run(`pin-${lot.id}`, () =>
      liveService.setStreamCurrentLot(sessionId, {
        listingId: lot.listingId,
        lotNumber: lot.lotNumber,
      }),
    );

  /** Whatnot grammar: pin to the table, then open bidding. The bid
   *  handler joins pinned-listing × open-lot, so both writes are real. */
  const startBidding = (lot: liveService.LiveLot) =>
    run(`start-${lot.id}`, async () => {
      await liveService.setStreamCurrentLot(sessionId, {
        listingId: lot.listingId,
        lotNumber: lot.lotNumber,
      });
      await liveService.openStreamLot(sessionId, lot.id, {
        durationSeconds: liveService.DEFAULT_LOT_DURATION_SECONDS,
      });
    });

  const closeLot = (lot: liveService.LiveLot) =>
    run(`close-${lot.id}`, async () => {
      const result = await liveService.closeStreamLot(sessionId, lot.id);
      if (result.outcome === 'sold') {
        show(`Sold at ${formatPrice(result.lot.highBid)}`, 'success');
      } else if (result.outcome === 'passed') {
        show('Lot passed — no winning bid', 'success');
      }
    });

  const cancelLot = (lot: liveService.LiveLot) =>
    run(`cancel-${lot.id}`, () =>
      liveService.cancelStreamLot(sessionId, lot.id),
    );

  /** Settle creates the winner's order (idempotent server-side). */
  const settleLot = (lot: liveService.LiveLot) =>
    run(`settle-${lot.id}`, async () => {
      const result = await liveService.settleStreamLot(sessionId, lot.id);
      show(
        result.orderId
          ? `Order ${result.orderId} created — lot settled`
          : 'Lot settled',
        'success',
      );
    });

  const addLot = (listingId: string) => {
    const listing = (myListings ?? []).find((l) => l.id === listingId);
    if (!listing) return;
    const nextNumber =
      (lots ?? []).reduce((max, l) => Math.max(max, l.lotNumber), 0) + 1;
    setPickerOpen(false);
    void run(`add-${listingId}`, () =>
      liveService.scheduleStreamLot(sessionId, {
        listingId,
        lotNumber: nextNumber,
        position: nextNumber,
        startPriceGbp: listing.price,
      }),
    );
  };

  const tableStatus = onTable?.status ?? null;
  const tableBusy = pending != null;

  return {
    lots,
    onTable,
    queue,
    finished,
    candidates,
    pending,
    tableBusy,
    tableStatus,
    pickerOpen,
    setPickerOpen,
    run,
    pinLot,
    startBidding,
    closeLot,
    cancelLot,
    settleLot,
    addLot,
  };
}
