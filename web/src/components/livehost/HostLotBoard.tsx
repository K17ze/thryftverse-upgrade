'use client';

/**
 * HostLotBoard — the live-mode lot surface for the web host console, the
 * same grammar as the fixture board but backed by the real lot engine
 * (routes/liveLotEngine.ts):
 *
 *  - Queue: GET /streaming/sessions/:id/lots — scheduled rows can be
 *    pinned to the table (PUT /current-lot) or opened straight into
 *    bidding (pin + POST /lots/:id/open — the bid handler joins the
 *    pinned listing against the open lot, so both writes are needed).
 *  - On the table: GET /current-lot — the pinned lot with the live high
 *    bid and bid count; open/close/cancel/settle by status.
 *  - Add: POST /lots schedules an eligible listing from the host's own
 *    inventory (active + unsold + not already queued).
 *
 * Queries are invalidated by the host hook's SSE lot events; mutations
 * invalidate directly too so the board never relies on the stream alone.
 * One pending transition at a time, mirroring the mobile seller
 * controls' guard.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseApiError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import { useMyListings } from '@/lib/hooks/queries';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { AppImage } from '@/components/ui/AppImage';
import { formatPrice } from '@/lib/utils/format';

interface HostLotBoardProps {
  sessionId: string;
  /** On air — transitions hit the live auction. Backstage renders the
   *  same board for scheduling/pinning the queue. */
  live: boolean;
}

const STATUS_LABEL: Record<liveService.LiveLotStatus, string> = {
  scheduled: 'Scheduled',
  open: 'Bidding open',
  closing: 'Closing',
  sold: 'Sold',
  passed: 'Passed',
  cancelled: 'Cancelled',
};

export function HostLotBoard({ sessionId, live }: HostLotBoardProps) {
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

  return (
    <section className="border-t border-border-subtle pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-caption font-semibold text-text-primary">
          {live ? 'Lots' : 'Lot queue'}
        </h2>
        <span className="text-meta text-text-muted">
          {(lots ?? []).length === 0
            ? 'Nothing scheduled'
            : `${(lots ?? []).length} lot${(lots ?? []).length === 1 ? '' : 's'} on this show`}
        </span>
      </div>

      {/* On the table — the pinned lot; high bid + count are live truth
          from the same polling/SSE invalidation the viewer card runs. */}
      {onTable ? (
        <div className="mt-3 border border-border-subtle">
          <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5">
            <AppImage
              src={onTable.imageUrl}
              alt={onTable.title}
              fill
              className="h-12 w-12 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="clamp-1 text-caption font-semibold text-text-primary">
                Lot {onTable.lotNumber} — {onTable.title}
              </p>
              <p className="tnum mt-0.5 text-meta text-text-muted">
                {(onTable.bidCount ?? 0) > 0
                  ? `${formatPrice(onTable.highBid)} · ${onTable.bidCount} bid${onTable.bidCount === 1 ? '' : 's'}`
                  : `Starts at ${formatPrice(onTable.startPrice)}`}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-surface-alt px-1.5 py-0.5 text-meta font-semibold uppercase tracking-wide text-text-muted">
              {STATUS_LABEL[tableStatus ?? 'scheduled']}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5">
            {tableStatus === 'scheduled' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  run(`open-${onTable.id}`, () =>
                    liveService.openStreamLot(sessionId, onTable.id, {
                      durationSeconds: liveService.DEFAULT_LOT_DURATION_SECONDS,
                    }),
                  )
                }
                disabled={tableBusy}
              >
                Open bidding
              </Button>
            ) : null}
            {tableStatus === 'open' || tableStatus === 'closing' ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => closeLot(onTable)}
                  disabled={tableBusy}
                >
                  Close lot
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => cancelLot(onTable)}
                  disabled={tableBusy}
                  className="text-danger-text"
                >
                  Cancel
                </Button>
              </>
            ) : null}
            {tableStatus === 'sold' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => settleLot(onTable)}
                disabled={tableBusy}
              >
                Settle — create the order
              </Button>
            ) : null}
            {tableStatus === 'passed' ? (
              <span className="text-meta text-text-muted">
                Passed with no winner — pick the next lot below.
              </span>
            ) : null}
            {tableStatus === 'cancelled' ? (
              <span className="text-meta text-text-muted">
                Cancelled — pick the next lot below.
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 border border-dashed border-border px-3 py-4 text-caption text-text-muted">
          Nothing on the table — {queue.length > 0
            ? 'pin a lot from the queue so viewers can bid.'
            : 'schedule a lot so viewers can bid.'}
        </p>
      )}

      {/* Queue — scheduled lots, in position order. */}
      {queue.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {queue.map((lot) => (
            <li
              key={lot.id}
              className="flex items-center gap-3 border border-border-subtle px-3 py-2.5"
            >
              <AppImage
                src={lot.imageUrl}
                alt={lot.title}
                fill
                className="h-10 w-10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="clamp-1 text-caption font-semibold text-text-primary">
                  {lot.title}
                </p>
                <p className="tnum mt-0.5 text-meta text-text-muted">
                  Lot {lot.lotNumber} · starts at {formatPrice(lot.startPrice)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void pinLot(lot)}
                  disabled={tableBusy}
                  className="pressable rounded-md border border-border px-2 py-1 text-meta font-semibold text-text-secondary transition-colors hover:bg-brand-subtle disabled:opacity-50"
                >
                  Pin
                </button>
                {live ? (
                  <button
                    type="button"
                    onClick={() => void startBidding(lot)}
                    disabled={tableBusy}
                    className="pressable rounded-md bg-brand px-2 py-1 text-meta font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:opacity-50"
                  >
                    Start bidding
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void cancelLot(lot)}
                  disabled={tableBusy}
                  aria-label={`Cancel lot ${lot.lotNumber}`}
                  className="pressable flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-alt hover:text-danger-text disabled:opacity-50"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Earlier lots — sold/passed/cancelled history for this show. */}
      {finished.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {finished.map((lot) => (
            <li
              key={lot.id}
              className="flex items-center justify-between gap-3 py-1"
            >
              <p className="clamp-1 text-meta text-text-muted">
                Lot {lot.lotNumber} — {lot.title}
              </p>
              <span className="tnum shrink-0 text-meta text-text-muted">
                {lot.status === 'sold'
                  ? `${formatPrice(lot.highBid)} sold`
                  : STATUS_LABEL[lot.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        variant="secondary"
        size="sm"
        icon="plus"
        onClick={() => setPickerOpen(true)}
        className="mt-4"
      >
        Add a lot
      </Button>

      {/* Lot picker — the host's own unsold inventory, minus what is
          already scheduled into this show. */}
      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add a lot"
      >
        {candidates.length === 0 ? (
          <p className="px-5 py-6 text-caption text-text-muted">
            No eligible listings — everything you own is either sold or
            already scheduled into this show.
          </p>
        ) : (
          <ul className="space-y-2 px-5 pb-6 pt-1">
            {candidates.map((listing) => (
              <li key={listing.id}>
                <button
                  type="button"
                  onClick={() => addLot(listing.id)}
                  disabled={tableBusy}
                  className="pressable flex w-full items-center gap-3 border border-border-subtle px-3 py-2.5 text-left transition-colors hover:bg-brand-subtle"
                >
                  <AppImage
                    src={listing.images[0] ?? null}
                    alt={listing.title}
                    fill
                    className="h-10 w-10 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-caption font-semibold text-text-primary">
                      {listing.title}
                    </p>
                    <p className="tnum mt-0.5 text-meta text-text-muted">
                      {formatPrice(listing.price)}
                    </p>
                  </div>
                  <Icon name="plus" size={14} className="shrink-0 text-text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </section>
  );
}
